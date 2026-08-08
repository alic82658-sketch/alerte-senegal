/**
 * Types TypeScript dérivés de db/001_schema.sql.
 * Portée volontairement limitée à la vue `alerts_public` et à la table `zones`.
 * Toute modification doit suivre le schéma SQL, qui reste la source d'autorité.
 */

// ---- Enums (miroir des types PostgreSQL) ----

export type ZoneType = "region" | "ville" | "quartier";

export type AlertCategory =
  | "vol"
  | "vehicule_recherche"
  | "personne_disparue"
  | "arnaque"
  | "accident"
  | "circulation"
  | "inondation"
  | "coupure_eau"
  | "coupure_electricite"
  | "incident_local"
  | "objet_perdu"
  | "objet_retrouve"
  | "appel_temoin"
  | "solidarite"
  | "urgence_communautaire"
  | "autre";

export type AlertStatus =
  | "temoignage"
  | "en_verification"
  | "verifie"
  | "en_cours"
  | "resolu"
  | "faux"
  | "hors_de_cause"
  | "classe_sans_suite";

// ---- Table `zones` ----

export interface Zone {
  id: string;
  name: string;
  slug: string;
  type: ZoneType;
  parent_id: string | null;
  created_at: string;
}

// ---- Vue `alerts_public` ----
// Position déjà arrondie (latitude_public / longitude_public exposées ici
// sous les noms latitude / longitude). Aucun champ sensible.

export interface AlertPublic {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: AlertCategory;
  status: AlertStatus;
  zone_id: string | null;
  latitude: number | null;
  longitude: number | null;
  happened_at: string | null;
  youtube_video_id: string | null;
  cover_image_url: string | null;
  complaint_verified: boolean;
  complaint_verified_at: string | null;
  created_by: string | null;
  verified_at: string | null;
  resolved_at: string | null;
  decisive_tip_id: string | null;
  follows_count: number;
  tips_count: number;
  published_at: string | null;
  created_at: string;
}
