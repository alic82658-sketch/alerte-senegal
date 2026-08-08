-- =========================================================
-- creer_signalement()
-- À exécuter en base (comme stats_communaute). Ne modifie pas 001_schema.sql.
--
-- Permet à un visiteur NON authentifié de créer un signalement, en attendant
-- que l'authentification existe. `security definer` : contourne la RLS de façon
-- contrôlée. `created_by` reste NULL (la colonne est nullable) — à rebrancher
-- sur l'auteur réel quand l'auth sera en place. L'alerte est créée en
-- 'en_attente' / 'temoignage' : invisible tant qu'un modérateur ne l'a pas
-- publiée. Renvoie le nombre de membres de la zone (écran de confirmation).
-- =========================================================

create or replace function public.creer_signalement(
  p_categorie   alert_category,
  p_titre       text,
  p_description text,
  p_zone_id     uuid,
  p_happened_at timestamptz,
  p_plainte     boolean
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug    text;
  v_membres integer;
begin
  if coalesce(btrim(p_titre), '') = '' or coalesce(btrim(p_description), '') = '' then
    raise exception 'titre et description obligatoires';
  end if;
  if not exists (select 1 from zones where id = p_zone_id) then
    raise exception 'zone inconnue';
  end if;

  -- slug lisible + suffixe unique
  v_slug := btrim(
    regexp_replace(lower(left(p_titre, 60)), '[^a-z0-9]+', '-', 'g'), '-'
  ) || '-' || substr(gen_random_uuid()::text, 1, 8);

  insert into alerts (
    slug, title, description, category, status, moderation,
    zone_id, happened_at, source, complaint, complaint_declared_at
  ) values (
    v_slug, btrim(p_titre), btrim(p_description), p_categorie,
    'temoignage', 'en_attente',
    p_zone_id, p_happened_at, 'site',
    case when p_plainte then 'declaree'::complaint_status
         else 'non_declaree'::complaint_status end,
    case when p_plainte then now() else null end
  );

  select count(*) into v_membres from profiles where zone_id = p_zone_id;
  return v_membres;
end $$;

revoke all on function public.creer_signalement(
  alert_category, text, text, uuid, timestamptz, boolean
) from public;

grant execute on function public.creer_signalement(
  alert_category, text, text, uuid, timestamptz, boolean
) to anon, authenticated;
