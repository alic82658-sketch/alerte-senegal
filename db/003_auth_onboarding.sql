-- =========================================================
-- Alerte Senegal - Auth, onboarding et cohortes
-- Migration 003
-- =========================================================
--
-- Contexte : première brique d'authentification réelle. En V1, l'auth est par
-- E-MAIL (OTP par code), PAS par SMS — projet autofinancé, exploité par une
-- personne, priorité V1 : valider usage/rétention/entraide sur les 100 premiers
-- membres avant tout coût SMS.
--
-- Le numéro de téléphone est COLLECTÉ EN OPTION mais NON VÉRIFIÉ en V1 : c'est
-- un champ déclaré, éditable par le membre, présenté partout comme « non
-- vérifié ». Aucune fonctionnalité ne le traite comme une preuve d'identité.
-- Crochet de compatibilité pour plus tard : la colonne système
-- profiles.phone_verified_at (null en V1) permettra, quand une vérification OTP
-- téléphone sera ajoutée, de réserver les actions à confiance élevée à un numéro
-- vérifié — sans refonte.
--
-- Ne touche PAS au registre : aucune modification de `alerts`
-- (imei, plate, phone_number, account_number), du bloc plainte, de
-- `alert_replies`, ni des fonctions de db/002. Le profil système
-- « Signalement anonyme » reste en place ; les anciennes alertes ne sont pas
-- rétro-migrées (le vrai created_by arrive en 004).
--
-- ATTENTION AVANT D'APPLIQUER :
--   1. Le trigger sur `auth.users` exige un rôle propriétaire : appliquer via le
--      connecteur Supabase (postgres/supabase_admin), pas via anon.
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
--        - après une vérification OTP e-mail réussie : appeler public.rejoindre_cohorte()
--        - à la fin (ou au saut) de l'onboarding : appeler public.terminer_onboarding()
--        - le téléphone n'est PAS central dans l'onboarding tant qu'il n'est pas
--          vérifié : champ facultatif, libellé « non vérifié », jamais un écran
--          dédié proéminent.
--        - le prénom/pseudo est obligatoire AVANT toute publication : ce verrou
--          est posé en 004 (flux Publier), en comparant display_name au
--          placeholder ci-dessous. Ne jamais publier sous « Nouveau membre ».
--   5. Compat future : quand l'OTP téléphone sera ajouté, la fonction de
--      vérification (definer) posera phone_verified_at, et devra invalider
--      (remettre à null) phone_verified_at si le membre change ensuite son
--      numéro. Inutile en V1 (phone_verified_at reste null, aucun chemin ne le
--      pose).
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
-- Éditables par le membre (onboarding/profil) : join_reason, help_domain.
--   (phone est aussi éditable — déclaré/non vérifié — voir section 8.)
-- Système (jamais écrites par le client) :
--   onboarding_done / onboarded_at -> posées par terminer_onboarding() (definer)
--   phone_verified_at              -> null en V1 ; future fonction de vérif OTP
--                                     téléphone uniquement. Sépare le numéro
--                                     déclaré (phone) de son éventuelle preuve.
-- display_name / zone_id / phone existent déjà (db/001) et restent éditables.
alter table public.profiles
  add column join_reason       public.join_reason,
  add column help_domain       text references public.help_domains(slug),
  add column onboarding_done   boolean not null default false,
  add column onboarded_at      timestamptz,
  add column phone_verified_at timestamptz;   -- null en V1 (téléphone non vérifié)

-- NB dépendance : les helpers de rôle sont maintenus EN BASE dans le schéma
-- `private` (private.is_staff() / private.is_admin()), pas `public` — durcissement
-- appliqué en base (les fonctions security definer sont sorties du schéma exposé
-- par l'API). Le dépôt db/001_schema.sql les déclare encore en `public` : divergence
-- connue, la base fait autorité. Les policies ci-dessous les référencent donc en
-- `private.` pour rester cohérentes avec le reste de la base (zones, alerts, profiles).

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
-- « Admis » = compte E-MAIL vérifié rejoignant la vague ouverte (V1). Les 100
-- premiers admis de la vague 2026 reçoivent PIONNIER · 2026.
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

-- 6.1 Création du profil à l'inscription auth. En V1 (auth e-mail), aucun numéro
--     n'est renseigné ici : le téléphone reste null jusqu'à déclaration
--     facultative par le membre.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, 'Nouveau membre')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 6.2 Bump automatique de updated_at (posé par le trigger, pas par le membre —
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

-- 6.3 Fin d'onboarding : champs système onboarding_done / onboarded_at.
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

-- 6.4 Admission atomique dans la vague courante + attribution PIONNIER.
--     Idempotente. Le SELECT ... FOR UPDATE sur la vague sérialise les
--     admissions concurrentes : le comptage est exact, jamais de 101e badge.
--     Marque aussi waitlist.converted_at en rapprochant l'e-mail du compte
--     (auth.users.email) de la liste d'attente : l'auth e-mail partage la clé
--     de waitlist, la conversion est donc traçable.
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

  -- Conversion de la liste d'attente : rapprochement par e-mail du compte.
  update public.waitlist w
     set converted_at = now()
   where w.converted_at is null
     and w.email = (select u.email from auth.users u where u.id = v_uid);

  out_wave_label    := v_wave.label;
  out_is_pionnier   := v_pio;
  out_pionnier_rank := case when v_pio then v_rank else null end;
  return next;
end;
$$;

-- 6.5 État public de la vague courante (agrégats seulement, aucune donnée
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
-- phone EST éditable (numéro déclaré, non vérifié en V1) : il figure dans la
-- liste. Ce qui reste immuable côté client (jamais re-granté) : phone_verified_at
-- (preuve, posée par definer seulement), role, is_banned, id, created_at,
-- updated_at, onboarding_done, onboarded_at. Ces deux dernières sont posées par
-- terminer_onboarding() (definer, exécutée en propriétaire, non soumise aux
-- privilèges de colonne).
revoke insert, update on public.profiles from anon, authenticated;

grant update (
  display_name,
  avatar_url,
  avatar_public,
  zone_id,
  phone,
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
  using (private.is_admin()) with check (private.is_admin());

grant select on public.waves to anon, authenticated;
-- Privilège d'écriture large, réellement borné par la policy is_admin().
grant insert, update, delete on public.waves to authenticated;
-- Supabase accorde ALL par défaut à anon à la création : on lui retire l'écriture
-- (il ne garde que SELECT). RLS is_admin() bloquait déjà, ceci ferme au niveau privilège.
revoke insert, update, delete on public.waves from anon;

-- HELP_DOMAINS : lecture publique, écriture admin.
alter table public.help_domains enable row level security;
create policy help_domains_read  on public.help_domains for select using (true);
create policy help_domains_admin on public.help_domains for all
  using (private.is_admin()) with check (private.is_admin());

grant select on public.help_domains to anon, authenticated;
grant insert, update, delete on public.help_domains to authenticated;
revoke insert, update, delete on public.help_domains from anon;

-- MEMBERSHIPS : le membre voit sa propre admission, le staff voit tout.
-- Aucune policy d'écriture client : la table n'est écrite que par
-- rejoindre_cohorte() (definer). Ceinture et bretelles : on révoque tout accès
-- direct en écriture, on ne laisse que SELECT (borné par la policy).
alter table public.memberships enable row level security;
create policy memberships_read_self on public.memberships for select
  using (profile_id = auth.uid() or private.is_staff());

revoke all on public.memberships from anon, authenticated;
grant select on public.memberships to authenticated;

-- =========================================================
-- 10. DROITS D'EXÉCUTION DES FONCTIONS
-- =========================================================
-- Fonctions de trigger : jamais appelées directement.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.set_updated_at()  from public, anon, authenticated;

-- Fonctions appelables : on retire le grant PUBLIC implicite ET le grant anon
-- ajouté par les privilèges par défaut de Supabase (sinon anon peut appeler la
-- RPC — sans effet utile car auth.uid() est null, mais à fermer proprement),
-- puis on cible authenticated. Seule cohorte_etat reste ouverte à anon (écran de
-- seuil pré-auth, n'expose que des agrégats — même modèle que stats_communaute).
revoke all on function public.terminer_onboarding() from public, anon;
grant execute on function public.terminer_onboarding() to authenticated;

revoke all on function public.rejoindre_cohorte() from public, anon;
grant execute on function public.rejoindre_cohorte() to authenticated;

revoke all on function public.cohorte_etat() from public;
grant execute on function public.cohorte_etat() to anon, authenticated;
