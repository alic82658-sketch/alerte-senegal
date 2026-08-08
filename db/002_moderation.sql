-- =========================================================
-- Alerte Senegal - Modération pré-auth
-- Migration 002
-- =========================================================
--
-- Contexte : l'écran /moderation doit lire la file d'attente
-- (moderation = 'en_attente', invisible dans alerts_public) et écrire des
-- décisions (publier, rejeter, demander vérification, vérifier la plainte).
-- La RLS réserve ces écritures à is_staff() (moderator/admin), mais l'auth
-- n'existe pas encore. Aucune clé service-role dans le projet (décision actée).
--
-- Solution, dans la lignée de creer_signalement : des fonctions
-- `security definer` appelables par anon, MAIS verrouillées par un secret
-- partagé (la passphrase modérateur). Le secret n'est JAMAIS comparé côté
-- application : il est stocké haché dans une table privée et comparé ici, en
-- base, via pgcrypto (crypt/bcrypt).
--
-- Temporaire : à l'étape 5 (auth réelle), remplacer moderation_exiger_secret
-- par un contrôle is_staff() et laisser tomber le secret partagé.
--
-- ATTENTION AVANT D'APPLIQUER :
--   1. Remplacer __REMPLACER_PAR_LA_PASSPHRASE__ ci-dessous par la passphrase
--      réelle (la même que la variable Cloudflare MODERATION_SECRET).
--   2. Ne pas committer la passphrase en clair : le placeholder reste dans le
--      dépôt, seule la base contient le hash.
--   3. Cette migration suppose que la table `alerts` possède déjà les colonnes
--      d'identifiants durs `imei`, `plate`, `phone_number`, `account_number`
--      (ajoutées en base avec creer_signalement, hors 001_schema.sql).
-- =========================================================

-- pgcrypto fournit crypt() et gen_salt() ; déjà activé en 001, rappel idempotent.
create extension if not exists "pgcrypto";

-- =========================================================
-- 1. TABLE PRIVÉE DU SECRET (hash bcrypt, jamais en clair)
-- =========================================================

create table if not exists moderation_secrets (
  id          smallint primary key default 1,
  secret_hash text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Ligne unique : un seul secret actif.
  constraint moderation_secrets_singleton check (id = 1)
);

-- RLS active, AUCUNE policy : anon et authenticated n'y accèdent jamais.
-- Seules les fonctions security definer (exécutées avec les droits du
-- propriétaire) lisent cette table.
alter table moderation_secrets enable row level security;

-- Ceinture et bretelles : on retire tout droit direct aux rôles clients.
revoke all on table moderation_secrets from anon, authenticated;

-- Enregistrement du secret. REMPLACER la passphrase avant d'appliquer.
insert into moderation_secrets (id, secret_hash)
values (1, crypt('__REMPLACER_PAR_LA_PASSPHRASE__', gen_salt('bf', 10)))
on conflict (id) do update
  set secret_hash = excluded.secret_hash,
      updated_at  = now();

-- =========================================================
-- 2. VALIDATION DU SECRET (comparaison en base)
-- =========================================================

-- Renvoie true si le secret fourni correspond au hash stocké.
-- Utilisée au moment de la connexion (secret saisi par l'humain).
create or replace function moderation_valider(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from moderation_secrets
    where id = 1
      and secret_hash = crypt(coalesce(p_secret, ''), secret_hash)
  );
$$;

-- Garde interne : lève acces_refuse si le secret est faux. Toute action de
-- modération commence par un appel à cette fonction.
create or replace function moderation_exiger_secret(p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not moderation_valider(p_secret) then
    raise exception 'acces_refuse';
  end if;
end;
$$;

-- =========================================================
-- 3. LECTURE DE LA FILE D'ATTENTE
-- =========================================================
-- La plus ancienne d'abord. Expose la description complète, l'auteur, la zone
-- et les identifiants durs — informations réservées au modérateur, absentes de
-- alerts_public.
create or replace function moderation_file(p_secret text)
returns table (
  id            uuid,
  slug          text,
  title         text,
  description   text,
  category      alert_category,
  status        alert_status,
  complaint     complaint_status,
  zone_name     text,
  author_name   text,
  imei          text,
  plate         text,
  phone_number  text,
  account_number text,
  happened_at   timestamptz,
  created_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  perform moderation_exiger_secret(p_secret);

  return query
    select
      a.id, a.slug, a.title, a.description,
      a.category, a.status, a.complaint,
      z.name  as zone_name,
      p.display_name as author_name,
      a.imei, a.plate, a.phone_number, a.account_number,
      a.happened_at, a.created_at
    from alerts a
    left join zones    z on z.id = a.zone_id
    left join profiles p on p.id = a.created_by
    where a.moderation = 'en_attente'
    order by a.created_at asc;
end;
$$;

-- =========================================================
-- 4. ACTIONS DE MODÉRATION
-- =========================================================

-- Publier : moderation -> 'publie', published_at = now().
create or replace function moderation_publier(p_secret text, p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform moderation_exiger_secret(p_secret);

  update alerts
    set moderation   = 'publie',
        published_at = now(),
        moderated_at = now(),
        updated_at   = now()
    where id = p_alert_id
      and moderation = 'en_attente';

  if not found then
    raise exception 'alerte_introuvable';
  end if;
end;
$$;

-- Rejeter : moderation -> 'rejete', motif obligatoire.
create or replace function moderation_rejeter(p_secret text, p_alert_id uuid, p_motif text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform moderation_exiger_secret(p_secret);

  if coalesce(btrim(p_motif), '') = '' then
    raise exception 'motif_obligatoire';
  end if;

  update alerts
    set moderation       = 'rejete',
        rejection_reason = btrim(p_motif),
        moderated_at     = now(),
        updated_at       = now()
    where id = p_alert_id
      and moderation = 'en_attente';

  if not found then
    raise exception 'alerte_introuvable';
  end if;
end;
$$;

-- Demander vérification : status (état de l'affaire) -> 'en_verification'.
-- L'alerte reste en attente de publication.
create or replace function moderation_demander_verification(p_secret text, p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform moderation_exiger_secret(p_secret);

  update alerts
    set status     = 'en_verification',
        updated_at = now()
    where id = p_alert_id
      and moderation = 'en_attente';

  if not found then
    raise exception 'alerte_introuvable';
  end if;
end;
$$;

-- Vérifier la plainte : complaint -> 'verifiee'. Uniquement si l'auteur l'a
-- déclarée (complaint = 'declaree').
create or replace function moderation_verifier_plainte(p_secret text, p_alert_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform moderation_exiger_secret(p_secret);

  update alerts
    set complaint             = 'verifiee',
        complaint_verified_at = now(),
        updated_at            = now()
    where id = p_alert_id
      and complaint = 'declaree';

  if not found then
    raise exception 'plainte_non_declaree';
  end if;
end;
$$;

-- =========================================================
-- 5. DROITS D'EXÉCUTION
-- =========================================================
-- Appelables par anon (l'auth n'existe pas encore). La sécurité repose
-- entièrement sur le secret vérifié en base à l'entrée de chaque fonction.
grant execute on function moderation_valider(text)                       to anon, authenticated;
grant execute on function moderation_file(text)                          to anon, authenticated;
grant execute on function moderation_publier(text, uuid)                 to anon, authenticated;
grant execute on function moderation_rejeter(text, uuid, text)           to anon, authenticated;
grant execute on function moderation_demander_verification(text, uuid)   to anon, authenticated;
grant execute on function moderation_verifier_plainte(text, uuid)        to anon, authenticated;

-- moderation_exiger_secret reste interne : pas de grant explicite.
revoke all on function moderation_exiger_secret(text) from public, anon, authenticated;
