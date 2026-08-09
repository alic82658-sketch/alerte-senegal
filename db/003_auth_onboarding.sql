-- =========================================================
-- Alerte Senegal - Auth, onboarding et cohortes
-- Migration 003
-- =========================================================
--
-- Contexte : première brique d'authentification réelle (OTP téléphone). Elle
-- pose les cohortes/vagues, le badge PIONNIER, les champs d'onboarding, et
-- surtout VERROUILLE profiles contre la falsification de champs sensibles
-- (phone, role, is_banned) une fois qu'il existe de vrais comptes authentifiés.
--
-- Ne touche PAS au registre : aucune modification de `alerts`
-- (imei, plate, phone_number, account_number), du bloc plainte, de
-- `alert_replies`, ni des fonctions de db/002. Le profil système
-- « Signalement anonyme » reste en place ; les anciennes alertes ne sont pas
-- rétro-migrées (le vrai created_by arrive en 004).
--
-- ATTENTION AVANT D'APPLIQUER :
--   1. Les triggers sur `auth.users` exigent un rôle propriétaire : appliquer
--      via le connecteur Supabase (postgres/supabase_admin), pas via anon.
--   2. Après application, deux gestes manuels côté admin (par toi) :
--        a. Promouvoir ton compte opérateur :
--             update public.profiles set role = 'admin' where id = '<ton_uid>';
--           (prérequis de la migration 005 qui remplace le verrou passphrase
--            de la modération par is_staff().)
--        b. Ouvrir la première vague quand tu veux lancer les inscriptions :
--             update public.waves set is_open = true, opened_at = now()
--             where is_current;
--   3. La taxonomie `help_domains` seedée ci-dessous est un point de départ à
--      curer : ajoute/retire des lignes sans jamais toucher au type (table de
--      référence, pas enum — la taxonomie peut évoluer par simple insert).
--   4. Câblage applicatif (migrations B1/B2, hors SQL) :
--        - après une vérification OTP réussie : appeler public.rejoindre_cohorte()
--        - à la fin (ou au saut) de l'onboarding : appeler public.terminer_onboarding()
--        - le prénom/pseudo est obligatoire AVANT toute publication : ce verrou
--          est posé en 004 (flux Publier), en comparant display_name au
--          placeholder ci-dessous. Ne jamais publier sous « Nouveau membre ».
-- =========================================================

-- =========================================================
-- 1. ENUM — motif d'inscription (liste stable et courte : enum acceptable)
-- =========================================================
-- Libellés portés côté application (comme lib/statuts.ts), jamais en base :
--   entraide          -> « M'entraider avec la communauté »
--   alertes           -> « Partager ou recevoir des alertes »
--   opportunites      -> « Trouver ou proposer des opportunités »
--   personnes_fiables -> « Recommander et trouver des personnes fiables »
create type public.join_reason as enum (
  'entraide', 'alertes', 'opportunites', 'personnes_fiables'
);

-- =========================================================
-- 2. TABLE DE RÉFÉRENCE — domaines d'aide (taxonomie évolutive, pas enum)
-- =========================================================
-- Réponse à la question facultative « Dans quel domaine pourriez-vous aider
-- les autres ? ». Liste contrôlée (FK depuis profiles.help_domain), curable
-- sans ALTER TYPE.
create table public.help_domains (
  slug       text primary key,
  label      text not null,
  position   int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed de départ — À CURER (voir en-tête, point 3).
insert into public.help_domains (slug, label, position) values
  ('sante',       'Santé',                        10),
  ('demarches',   'Démarches administratives',    20),
  ('reparation',  'Réparation et bricolage',      30),
  ('transport',   'Transport',                    40),
  ('education',   'Cours et soutien scolaire',    50),
  ('numerique',   'Informatique et téléphonie',   60),
  ('emploi',      'Emploi et orientation',        70),
  ('artisanat',   'Artisanat et métiers',         80);

-- =========================================================
-- 3. PROFILES — nouvelles colonnes
-- =========================================================
-- Éditables par le membre (onboarding) : join_reason, help_domain.
-- Système (écrites par terminer_onboarding, definer) : onboarding_done,
-- onboarded_at. display_name / zone_id existent déjà et restent éditables.
alter table public.profiles
  add column join_reason      public.join_reason,
  add column help_domain      text references public.help_domains(slug),
  add column onboarding_done  boolean not null default false,
  add column onboarded_at     timestamptz;

-- =========================================================
-- 4. WAVES — configuration des vagues (éditable par l'admin)
-- =========================================================
-- capacity = places DE CETTE vague (par vague, pas cumulatif) :
--   vague 1 = 100 places, vague 2 = 500 nouvelles places, etc.
-- pionnier_cap = nombre de badges PIONNIER attribuables sur la vague.
create table public.waves (
  id            uuid primary key default gen_random_uuid(),
  label         text not null unique,                 -- suffixe du badge : « 2026 »
  rank          int  not null unique,                 -- ordre des vagues (1, 2, 3…)
  capacity      int  not null check (capacity >= 0),
  pionnier_cap  int  not null default 0 check (pionnier_cap >= 0),
  is_open       boolean not null default false,       -- inscriptions ouvertes/fermées
  is_current    boolean not null default false,       -- vague active (au plus une)
  opened_at     timestamptz,
  closed_at     timestamptz,
  created_at    timestamptz not null default now()
);

-- Au plus une vague courante à la fois.
create unique index waves_one_current on public.waves (is_current) where is_current;

-- Première vague : 100 places, 100 badges PIONNIER · 2026, courante mais fermée
-- (c'est l'admin qui ouvre — voir en-tête, point 2b).
insert into public.waves (label, rank, capacity, pionnier_cap, is_current, is_open)
values ('2026', 1, 100, 100, true, false);

-- =========================================================
-- 5. MEMBERSHIPS — admission & badge (attribué, jamais éditable par le membre)
-- =========================================================
create table public.memberships (
  profile_id    uuid primary key references public.profiles(id) on delete cascade,
  wave_id       uuid not null references public.waves(id),
  is_pionnier   boolean not null default false,
  pionnier_rank int,
  admitted_at   timestamptz not null default now()
);

create index memberships_wave_idx on public.memberships(wave_id);

-- Intégrité : pas deux fois le même rang PIONNIER dans une vague.
create unique index memberships_pionnier_rank
  on public.memberships (wave_id, pionnier_rank) where is_pionnier;

-- =========================================================
-- 6. FONCTIONS
-- =========================================================
-- Toutes en security definer avec search_path = '' et noms qualifiés.
-- pg_catalog reste implicitement résolu (now(), count(), coalesce(), greatest…).

-- 6.1 Création du profil à l'inscription auth. Le miroir profiles.phone est
--     seedé ici depuis la source de vérité auth.users.phone. N'admet PAS dans
--     une vague (l'admission passe par rejoindre_cohorte, appelée par l'app).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, phone)
  values (new.id, 'Nouveau membre', new.phone)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 6.2 Synchronisation du miroir profiles.phone quand le numéro change côté
--     auth (flux OTP de changement de téléphone). auth.users.phone reste la
--     seule autorité ; profiles.phone ne fait que suivre.
create or replace function public.sync_profile_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set phone = new.phone where id = new.id;
  return new;
end;
$$;

-- 6.3 Bump automatique de updated_at (posé par le trigger, pas par le membre —
--     updated_at n'est pas dans les colonnes re-grantées).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- 6.4 Fin d'onboarding : champs système onboarding_done / onboarded_at.
--     Appelée par l'app à la fin (ou au saut jusqu'au bout) de l'onboarding.
create or replace function public.terminer_onboarding()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'non_authentifie';
  end if;

  update public.profiles
     set onboarding_done = true,
         onboarded_at    = coalesce(onboarded_at, now())
   where id = v_uid;
end;
$$;

-- 6.5 Admission atomique dans la vague courante + attribution PIONNIER.
--     Idempotente. Le SELECT ... FOR UPDATE sur la vague sérialise les
--     admissions concurrentes : le comptage est exact, jamais de 101e badge.
--     Exceptions renvoyées à l'app :
--       non_authentifie       -> appel sans session
--       aucune_vague_courante -> config incohérente (aucune vague is_current)
--       inscriptions_fermees  -> vague courante is_open = false
--       vague_complete        -> capacité atteinte (l'app bascule en waitlist,
--                                le compte reste valide — aucune erreur visible)
create or replace function public.rejoindre_cohorte()
returns table (out_wave_label text, out_is_pionnier boolean, out_pionnier_rank int)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_wave     public.waves%rowtype;
  v_existing public.memberships%rowtype;
  v_count    int;
  v_rank     int;
  v_pio      boolean := false;
begin
  if v_uid is null then
    raise exception 'non_authentifie';
  end if;

  -- Idempotence : déjà admis -> renvoyer l'état courant, ne rien réattribuer.
  select * into v_existing from public.memberships where profile_id = v_uid;
  if found then
    select w.label into out_wave_label from public.waves w where w.id = v_existing.wave_id;
    out_is_pionnier   := v_existing.is_pionnier;
    out_pionnier_rank := v_existing.pionnier_rank;
    return next;
    return;
  end if;

  -- Verrou de la vague courante : sérialise les admissions concurrentes.
  select * into v_wave from public.waves where is_current for update;
  if not found then
    raise exception 'aucune_vague_courante';
  end if;
  if not v_wave.is_open then
    raise exception 'inscriptions_fermees';
  end if;

  select count(*) into v_count from public.memberships where wave_id = v_wave.id;
  if v_count >= v_wave.capacity then
    raise exception 'vague_complete';
  end if;

  v_rank := v_count + 1;
  if v_wave.pionnier_cap > 0 and v_rank <= v_wave.pionnier_cap then
    v_pio := true;
  end if;

  insert into public.memberships (profile_id, wave_id, is_pionnier, pionnier_rank)
  values (v_uid, v_wave.id, v_pio, case when v_pio then v_rank else null end);

  out_wave_label    := v_wave.label;
  out_is_pionnier   := v_pio;
  out_pionnier_rank := case when v_pio then v_rank else null end;
  return next;
end;
$$;

-- 6.6 État public de la vague courante (agrégats seulement, aucune donnée
--     individuelle — même esprit que stats_communaute()). Alimente le compteur
--     de places restantes de l'écran de seuil.
create or replace function public.cohorte_etat()
returns table (
  ouvert             boolean,
  limite             int,
  valides            int,
  restantes          int,
  label              text,
  pionnier_restantes int
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_wave      public.waves%rowtype;
  v_count     int;
  v_pio_count int;
begin
  select * into v_wave from public.waves where is_current;
  if not found then
    ouvert := false; limite := 0; valides := 0; restantes := 0;
    label := null; pionnier_restantes := 0;
    return next;
    return;
  end if;

  select count(*) into v_count
    from public.memberships where wave_id = v_wave.id;
  select count(*) into v_pio_count
    from public.memberships where wave_id = v_wave.id and is_pionnier;

  ouvert             := v_wave.is_open;
  limite             := v_wave.capacity;
  valides            := v_count;
  restantes          := greatest(v_wave.capacity - v_count, 0);
  label              := v_wave.label;
  pionnier_restantes := greatest(v_wave.pionnier_cap - v_pio_count, 0);
  return next;
end;
$$;

-- =========================================================
-- 7. TRIGGERS
-- =========================================================
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

drop trigger if exists on_auth_user_phone_changed on auth.users;
create trigger on_auth_user_phone_changed
  after update of phone on auth.users
  for each row
  when (new.phone is distinct from old.phone)
  execute function public.sync_profile_phone();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =========================================================
-- 8. PRIVILÈGES — verrouillage de profiles au niveau colonne
-- =========================================================
-- Supabase accorde par défaut ALL (dont INSERT/UPDATE table-level) à
-- anon/authenticated sur les tables de public. Un REVOKE de colonne seul serait
-- inopérant tant que le privilège table subsiste. On révoque donc au niveau
-- TABLE, puis on re-grante UPDATE colonne par colonne, uniquement pour les
-- champs que le membre édite lui-même.
--
-- Jamais re-grantées (donc immuables côté client) : phone, role, is_banned, id,
-- created_at, updated_at, onboarding_done, onboarded_at. Ces deux dernières
-- sont posées par terminer_onboarding() (definer, exécutée en propriétaire,
-- non soumise aux privilèges de colonne).
revoke insert, update on public.profiles from anon, authenticated;

grant update (
  display_name,
  avatar_url,
  avatar_public,
  zone_id,
  join_reason,
  help_domain
) on public.profiles to authenticated;

-- La création de profil passe EXCLUSIVEMENT par handle_new_user (definer) :
-- aucun INSERT client. On retire donc la policy d'auto-insertion.
drop policy if exists profiles_insert_self on public.profiles;

-- profiles_update_self : simplifiée à une pure vérification d'appartenance,
-- sans sous-requête sur profiles (le motif corrélé précédent était un risque de
-- récursion RLS, jamais exercé faute d'auth). L'immuabilité des colonnes
-- sensibles est désormais assurée en amont par les privilèges de colonne.
drop policy if exists profiles_update_self on public.profiles;
create policy profiles_update_self on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- =========================================================
-- 9. RLS DES NOUVELLES TABLES
-- =========================================================

-- WAVES : lecture publique (label / ouvert / places, rien de sensible),
-- écriture réservée à l'admin. Modèle identique à zones.
alter table public.waves enable row level security;
create policy waves_read  on public.waves for select using (true);
create policy waves_admin on public.waves for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.waves to anon, authenticated;
-- Privilège d'écriture large, réellement borné par la policy is_admin().
grant insert, update, delete on public.waves to authenticated;

-- HELP_DOMAINS : lecture publique, écriture admin.
alter table public.help_domains enable row level security;
create policy help_domains_read  on public.help_domains for select using (true);
create policy help_domains_admin on public.help_domains for all
  using (public.is_admin()) with check (public.is_admin());

grant select on public.help_domains to anon, authenticated;
grant insert, update, delete on public.help_domains to authenticated;

-- MEMBERSHIPS : le membre voit sa propre admission, le staff voit tout.
-- Aucune policy d'écriture client : la table n'est écrite que par
-- rejoindre_cohorte() (definer). Ceinture et bretelles : on révoque tout accès
-- direct en écriture, on ne laisse que SELECT (borné par la policy).
alter table public.memberships enable row level security;
create policy memberships_read_self on public.memberships for select
  using (profile_id = auth.uid() or public.is_staff());

revoke all on public.memberships from anon, authenticated;
grant select on public.memberships to authenticated;

-- =========================================================
-- 10. DROITS D'EXÉCUTION DES FONCTIONS
-- =========================================================
-- Fonctions de trigger : jamais appelées directement.
revoke all on function public.handle_new_user()    from public, anon, authenticated;
revoke all on function public.sync_profile_phone() from public, anon, authenticated;
revoke all on function public.set_updated_at()      from public, anon, authenticated;

-- Fonctions appelables : on retire le grant PUBLIC implicite, puis on cible.
revoke all on function public.terminer_onboarding() from public;
grant execute on function public.terminer_onboarding() to authenticated;

revoke all on function public.rejoindre_cohorte() from public;
grant execute on function public.rejoindre_cohorte() to authenticated;

revoke all on function public.cohorte_etat() from public;
grant execute on function public.cohorte_etat() to anon, authenticated;
