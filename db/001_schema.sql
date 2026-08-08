-- =========================================================
-- Alerte Senegal - Migration initiale
-- Supabase / PostgreSQL
-- =========================================================

create extension if not exists "pgcrypto";

-- =========================================================
-- 1. ENUMS
-- =========================================================

create type user_role as enum ('member', 'moderator', 'admin');

create type zone_type as enum ('region', 'ville', 'quartier');

create type alert_category as enum (
  'vol', 'vehicule_recherche', 'personne_disparue', 'arnaque',
  'accident', 'circulation', 'inondation', 'coupure_eau',
  'coupure_electricite', 'incident_local', 'objet_perdu',
  'objet_retrouve', 'appel_temoin', 'solidarite',
  'urgence_communautaire', 'autre'
);

-- Etat de l'affaire
create type alert_status as enum (
  'temoignage', 'en_verification', 'verifie',
  'en_cours', 'resolu', 'faux', 'hors_de_cause', 'classe_sans_suite'
);

-- Etat de publication (distinct de l'etat de l'affaire)
create type moderation_status as enum (
  'en_attente', 'publie', 'rejete', 'retire'
);

-- Verification du depot de plainte
create type complaint_status as enum (
  'non_declaree', 'declaree', 'en_verification', 'verifiee', 'rejetee'
);

create type tip_status as enum (
  'nouveau', 'lu', 'utile', 'decisif', 'rejete'
);

create type report_reason as enum (
  'diffamation', 'fausse_information', 'donnees_personnelles',
  'contenu_illegal', 'doublon', 'autre'
);

create type source_channel as enum ('site', 'facebook', 'whatsapp', 'import');

-- =========================================================
-- 2. ZONES
-- =========================================================

create table zones (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  type        zone_type not null,
  parent_id   uuid references zones(id) on delete restrict,
  created_at  timestamptz not null default now()
);

create index zones_parent_idx on zones(parent_id);
create index zones_type_idx on zones(type);

-- =========================================================
-- 3. PROFILES
-- =========================================================

create table profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  display_name      text not null,
  avatar_url        text,
  avatar_public     boolean not null default false,  -- consentement explicite
  zone_id           uuid references zones(id) on delete set null,
  role              user_role not null default 'member',
  phone             text,          -- jamais public
  is_banned         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index profiles_zone_idx on profiles(zone_id);

-- =========================================================
-- 4. ALERTS
-- =========================================================

create table alerts (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  title             text not null,
  description       text not null,
  category          alert_category not null,

  status            alert_status not null default 'temoignage',
  moderation        moderation_status not null default 'en_attente',

  zone_id           uuid references zones(id) on delete set null,

  -- Position exacte reservee aux moderateurs, position publique arrondie
  latitude          double precision,
  longitude         double precision,
  latitude_public   double precision,
  longitude_public  double precision,

  happened_at       timestamptz,
  youtube_video_id  text,
  cover_image_url   text,

  -- Bloc plainte
  complaint             complaint_status not null default 'non_declaree',
  complaint_declared_at timestamptz,
  complaint_verified_at timestamptz,
  complaint_verified_by uuid references profiles(id) on delete set null,
  complaint_reference   text,   -- interne
  complaint_location    text,   -- interne
  complaint_document_url text,  -- bucket prive, jamais servi au public

  -- Traitement
  created_by        uuid references profiles(id) on delete set null,
  verified_by       uuid references profiles(id) on delete set null,
  verified_at       timestamptz,
  moderated_by      uuid references profiles(id) on delete set null,
  moderated_at      timestamptz,
  rejection_reason  text,
  published_at      timestamptz,
  resolved_at       timestamptz,
  decisive_tip_id   uuid,       -- FK ajoutee apres creation de tips

  source            source_channel not null default 'site',

  follows_count     integer not null default 0,
  tips_count        integer not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index alerts_zone_idx      on alerts(zone_id);
create index alerts_category_idx  on alerts(category);
create index alerts_status_idx    on alerts(status);
create index alerts_pub_idx       on alerts(moderation, published_at desc);

-- Arrondi automatique de la position publique (~110 m)
create or replace function round_public_position()
returns trigger language plpgsql as $$
begin
  new.latitude_public  := round(new.latitude::numeric, 3);
  new.longitude_public := round(new.longitude::numeric, 3);
  return new;
end $$;

create trigger alerts_round_position
before insert or update of latitude, longitude on alerts
for each row execute function round_public_position();

-- =========================================================
-- 5. ALERT UPDATES (chronologie)
-- =========================================================

create table alert_updates (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  message     text not null,
  old_status  alert_status,
  new_status  alert_status,
  is_public   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index alert_updates_alert_idx on alert_updates(alert_id, created_at desc);

-- =========================================================
-- 6. FOLLOWS
-- =========================================================

create table alert_follows (
  user_id     uuid not null references profiles(id) on delete cascade,
  alert_id    uuid not null references alerts(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, alert_id)
);

create index alert_follows_alert_idx on alert_follows(alert_id);

-- =========================================================
-- 7. TIPS (informations envoyees)
-- =========================================================

create table tips (
  id                 uuid primary key default gen_random_uuid(),
  alert_id           uuid not null references alerts(id) on delete cascade,
  user_id            uuid references profiles(id) on delete set null,
  message            text not null,
  attachment_url     text,
  contact_permission boolean not null default false,
  status             tip_status not null default 'nouveau',
  reviewed_by        uuid references profiles(id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now()
);

create index tips_alert_idx on tips(alert_id, created_at desc);

alter table alerts
  add constraint alerts_decisive_tip_fk
  foreign key (decisive_tip_id) references tips(id) on delete set null;

-- =========================================================
-- 8. DROIT DE REPONSE
-- =========================================================

create table alert_replies (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  author_name text not null,
  message     text not null,
  contact     text,                       -- interne
  moderation  moderation_status not null default 'en_attente',
  moderated_by uuid references profiles(id) on delete set null,
  moderated_at timestamptz,
  created_at  timestamptz not null default now()
);

create index alert_replies_alert_idx on alert_replies(alert_id);

-- =========================================================
-- 9. SIGNALEMENTS DE CONTENU
-- =========================================================

create table content_reports (
  id          uuid primary key default gen_random_uuid(),
  alert_id    uuid not null references alerts(id) on delete cascade,
  reporter_id uuid references profiles(id) on delete set null,
  reason      report_reason not null,
  message     text,
  handled_by  uuid references profiles(id) on delete set null,
  handled_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index content_reports_alert_idx on content_reports(alert_id);

-- =========================================================
-- 10. PREFERENCES
-- =========================================================

create table user_alert_preferences (
  user_id       uuid primary key references profiles(id) on delete cascade,
  zone_id       uuid references zones(id) on delete set null,
  categories    alert_category[] not null default '{}',
  push_enabled  boolean not null default false,
  email_enabled boolean not null default true,
  updated_at    timestamptz not null default now()
);

-- =========================================================
-- 11. LISTE D'ATTENTE (ecran de seuil)
-- =========================================================

create table waitlist (
  id           uuid primary key default gen_random_uuid(),
  email        text not null unique,
  source       source_channel not null default 'site',
  invited_at   timestamptz,
  converted_at timestamptz,
  created_at   timestamptz not null default now()
);

-- =========================================================
-- 12. COMPTEURS
-- =========================================================

create or replace function bump_counts()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'alert_follows' then
    update alerts set follows_count = follows_count + (case when tg_op='INSERT' then 1 else -1 end)
    where id = coalesce(new.alert_id, old.alert_id);
  elsif tg_table_name = 'tips' then
    update alerts set tips_count = tips_count + (case when tg_op='INSERT' then 1 else -1 end)
    where id = coalesce(new.alert_id, old.alert_id);
  end if;
  return null;
end $$;

create trigger follows_count_trg
after insert or delete on alert_follows
for each row execute function bump_counts();

create trigger tips_count_trg
after insert or delete on tips
for each row execute function bump_counts();

-- =========================================================
-- 13. HELPERS DE ROLE
-- =========================================================

create or replace function is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and role in ('moderator','admin')
  );
$$;

create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles where id = auth.uid() and role = 'admin'
  );
$$;

-- =========================================================
-- 14. RLS
-- =========================================================

alter table zones                   enable row level security;
alter table profiles                enable row level security;
alter table alerts                  enable row level security;
alter table alert_updates           enable row level security;
alter table alert_follows           enable row level security;
alter table tips                    enable row level security;
alter table alert_replies           enable row level security;
alter table content_reports         enable row level security;
alter table user_alert_preferences  enable row level security;
alter table waitlist                enable row level security;

-- ZONES : lecture publique, ecriture staff
create policy zones_read on zones for select using (true);
create policy zones_write on zones for all using (is_staff()) with check (is_staff());

-- PROFILES
create policy profiles_read_self on profiles
  for select using (auth.uid() = id or is_staff());
create policy profiles_update_self on profiles
  for update using (auth.uid() = id) with check (auth.uid() = id and role = (select role from profiles where id = auth.uid()));
create policy profiles_insert_self on profiles
  for insert with check (auth.uid() = id);
create policy profiles_staff_all on profiles
  for all using (is_staff()) with check (is_staff());

-- ALERTS : le public ne voit que ce qui est publie
create policy alerts_read_public on alerts
  for select using (moderation = 'publie' or created_by = auth.uid() or is_staff());
create policy alerts_insert_auth on alerts
  for insert with check (auth.uid() = created_by);
create policy alerts_update_owner on alerts
  for update using (created_by = auth.uid() and moderation = 'en_attente')
  with check (created_by = auth.uid());
create policy alerts_staff_all on alerts
  for all using (is_staff()) with check (is_staff());

-- ALERT UPDATES
create policy alert_updates_read on alert_updates
  for select using (
    is_public and exists (select 1 from alerts a where a.id = alert_id and a.moderation = 'publie')
    or is_staff()
  );
create policy alert_updates_write on alert_updates
  for all using (is_staff()) with check (is_staff());

-- FOLLOWS
create policy follows_own on alert_follows
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy follows_staff_read on alert_follows
  for select using (is_staff());

-- TIPS : jamais public
create policy tips_read_own on tips
  for select using (user_id = auth.uid() or is_staff());
create policy tips_insert_auth on tips
  for insert with check (auth.uid() = user_id);
create policy tips_staff_all on tips
  for all using (is_staff()) with check (is_staff());

-- REPLIES
create policy replies_read on alert_replies
  for select using (moderation = 'publie' or is_staff());
create policy replies_insert on alert_replies
  for insert with check (true);
create policy replies_staff on alert_replies
  for all using (is_staff()) with check (is_staff());

-- CONTENT REPORTS
create policy reports_insert on content_reports
  for insert with check (true);
create policy reports_staff on content_reports
  for all using (is_staff()) with check (is_staff());

-- PREFERENCES
create policy prefs_own on user_alert_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- WAITLIST : insertion ouverte, lecture staff uniquement
create policy waitlist_insert on waitlist for insert with check (true);
create policy waitlist_staff on waitlist for select using (is_staff());

-- =========================================================
-- 15. VUE PUBLIQUE (masque les champs sensibles)
-- =========================================================

create or replace view alerts_public
with (security_invoker = true) as
select
  a.id, a.slug, a.title, a.description, a.category, a.status,
  a.zone_id, a.latitude_public as latitude, a.longitude_public as longitude,
  a.happened_at, a.youtube_video_id, a.cover_image_url,
  case when a.complaint = 'verifiee' then true else false end as complaint_verified,
  a.complaint_verified_at,
  a.created_by, a.verified_at, a.resolved_at, a.decisive_tip_id,
  a.follows_count, a.tips_count, a.published_at, a.created_at
from alerts a
where a.moderation = 'publie';

-- =========================================================
-- 16. SEED ZONES (base minimale, a completer)
-- =========================================================

insert into zones (name, slug, type) values
  ('Dakar', 'dakar', 'region'),
  ('Thies', 'thies', 'region'),
  ('Saint-Louis', 'saint-louis', 'region'),
  ('Ziguinchor', 'ziguinchor', 'region'),
  ('Kaolack', 'kaolack', 'region'),
  ('Diourbel', 'diourbel', 'region');

insert into zones (name, slug, type, parent_id)
select v.name, v.slug, 'ville', (select id from zones where slug = 'dakar')
from (values
  ('Dakar-Ville','dakar-ville'), ('Pikine','pikine'),
  ('Guediawaye','guediawaye'), ('Rufisque','rufisque'),
  ('Keur Massar','keur-massar')
) as v(name, slug);

insert into zones (name, slug, type, parent_id)
select q.name, q.slug, 'quartier', (select id from zones where slug = 'dakar-ville')
from (values
  ('Plateau','plateau'), ('Medina','medina'), ('Fann','fann'),
  ('Point E','point-e'), ('Mermoz','mermoz'), ('Sacre-Coeur','sacre-coeur'),
  ('Ouakam','ouakam'), ('Ngor','ngor'), ('Almadies','almadies'),
  ('Yoff','yoff'), ('Grand Yoff','grand-yoff'), ('Parcelles Assainies','parcelles-assainies'),
  ('Grand Dakar','grand-dakar'), ('HLM','hlm'), ('Liberte','liberte'),
  ('Colobane','colobane'), ('Gueule Tapee','gueule-tapee')
) as q(name, slug);
