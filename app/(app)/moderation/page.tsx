import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AlertCategory, AlertStatus } from "@/lib/types";
import { libelleStatut, classeStatut } from "@/lib/statuts";
import { tempsEcoule, dateComplete } from "@/lib/temps";

// Écran de modération. Rendu serveur, actions via server actions : fonctionne
// sans JavaScript. Aucun coin arrondi, aucune ombre.
//
// Accès pré-auth (l'authentification n'existe pas encore) : la RLS réserve ces
// écritures à is_staff(), donc tout passe par des fonctions `security definer`
// verrouillées par une passphrase modérateur, comparée EN BASE (bcrypt, table
// privée moderation_secrets). Voir db/002_moderation.sql.
//
// Deux couches :
//   1. Route  — un cookie httpOnly de session prouve qu'un humain a saisi la
//      passphrase. Sa valeur est un jeton HMAC dérivé de MODERATION_SECRET :
//      la passphrase elle-même ne transite jamais par le navigateur.
//   2. Base   — chaque RPC reçoit le secret (depuis l'env, côté serveur) et le
//      revalide. Un POST forgé sans cookie valide est rejeté avant tout appel.
//
// Contrat des fonctions (déployées via db/002_moderation.sql) :
//   moderation_valider(p_secret) -> boolean
//   moderation_file(p_secret) -> lignes en attente, la plus ancienne d'abord
//   moderation_publier(p_secret, p_alert_id)
//   moderation_rejeter(p_secret, p_alert_id, p_motif)     [motif obligatoire]
//   moderation_demander_verification(p_secret, p_alert_id)
//   moderation_verifier_plainte(p_secret, p_alert_id)
//   exceptions : acces_refuse, alerte_introuvable, motif_obligatoire,
//                plainte_non_declaree
export const dynamic = "force-dynamic";

const COOKIE = "as_mod";
const DUREE = 60 * 60 * 8; // 8 h

type ComplaintStatus =
  | "non_declaree"
  | "declaree"
  | "en_verification"
  | "verifiee"
  | "rejetee";

type LigneFile = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: AlertCategory;
  status: AlertStatus;
  complaint: ComplaintStatus;
  zone_name: string | null;
  author_name: string | null;
  imei: string | null;
  plate: string | null;
  phone_number: string | null;
  account_number: string | null;
  happened_at: string | null;
  created_at: string;
};

const CATEGORIES: Record<AlertCategory, string> = {
  vol: "Vol",
  vehicule_recherche: "Véhicule recherché",
  personne_disparue: "Personne disparue",
  arnaque: "Arnaque",
  accident: "Accident",
  circulation: "Circulation",
  inondation: "Inondation",
  coupure_eau: "Coupure d'eau",
  coupure_electricite: "Coupure d'électricité",
  incident_local: "Incident local",
  objet_perdu: "Objet perdu",
  objet_retrouve: "Objet retrouvé",
  appel_temoin: "Appel à témoins",
  solidarite: "Solidarité",
  urgence_communautaire: "Urgence communautaire",
  autre: "Autre",
};

const IDENTIFIANTS: { cle: keyof LigneFile; label: string }[] = [
  { cle: "imei", label: "IMEI" },
  { cle: "plate", label: "Plaque" },
  { cle: "phone_number", label: "Numéro" },
  { cle: "account_number", label: "Compte" },
];

const ERREURS: Record<string, string> = {
  passe: "Passphrase incorrecte.",
  session: "Session expirée. Reconnectez-vous.",
  motif: "Le motif de rejet est obligatoire.",
  introuvable: "Alerte introuvable ou déjà traitée.",
  plainte: "Aucune plainte déclarée sur cette alerte.",
  generique: "L'action a échoué. Réessayez.",
};

const SUCCES: Record<string, string> = {
  publie: "Alerte publiée.",
  rejete: "Alerte rejetée.",
  verif: "Vérification demandée.",
  plainte: "Plainte marquée comme vérifiée.",
};

// ---- Jeton de session (HMAC de la passphrase, jamais la passphrase brute) ----

async function jetonAttendu(): Promise<string> {
  const secret = process.env.MODERATION_SECRET ?? "";
  const cle = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cle,
    new TextEncoder().encode("as_mod_v1"),
  );
  return [...new Uint8Array(sig)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function egaliteConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function estConnecte(): Promise<boolean> {
  const jeton = (await cookies()).get(COOKIE)?.value;
  if (!jeton) return false;
  return egaliteConstante(jeton, await jetonAttendu());
}

// Renvoie le secret (depuis l'env) uniquement si la session est valide.
// Sinon renvoie null : l'appelant redirige vers la connexion.
async function secretSiConnecte(): Promise<string | null> {
  if (!(await estConnecte())) return null;
  return process.env.MODERATION_SECRET ?? "";
}

// ---- Server actions ----

async function connexion(formData: FormData) {
  "use server";
  const saisie = String(formData.get("passphrase") ?? "");
  const supabase = await createClient();
  // Comparaison EN BASE (bcrypt). L'application ne compare jamais le secret.
  const { data, error } = await supabase.rpc("moderation_valider", {
    p_secret: saisie,
  });
  if (error || data !== true) {
    redirect("/moderation?err=passe");
  }
  (await cookies()).set(COOKIE, await jetonAttendu(), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DUREE,
  });
  redirect("/moderation");
}

async function deconnexion() {
  "use server";
  (await cookies()).delete(COOKIE);
  redirect("/moderation");
}

async function publier(formData: FormData) {
  "use server";
  const secret = await secretSiConnecte();
  if (secret === null) redirect("/moderation?err=session");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderation_publier", {
    p_secret: secret,
    p_alert_id: id,
  });
  redirect(error ? erreurVersUrl(error.message) : "/moderation?ok=publie");
}

async function rejeter(formData: FormData) {
  "use server";
  const secret = await secretSiConnecte();
  if (secret === null) redirect("/moderation?err=session");
  const id = String(formData.get("id") ?? "");
  const motif = String(formData.get("motif") ?? "").trim();
  if (!motif) redirect("/moderation?err=motif");
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderation_rejeter", {
    p_secret: secret,
    p_alert_id: id,
    p_motif: motif,
  });
  redirect(error ? erreurVersUrl(error.message) : "/moderation?ok=rejete");
}

async function demanderVerification(formData: FormData) {
  "use server";
  const secret = await secretSiConnecte();
  if (secret === null) redirect("/moderation?err=session");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderation_demander_verification", {
    p_secret: secret,
    p_alert_id: id,
  });
  redirect(error ? erreurVersUrl(error.message) : "/moderation?ok=verif");
}

async function verifierPlainte(formData: FormData) {
  "use server";
  const secret = await secretSiConnecte();
  if (secret === null) redirect("/moderation?err=session");
  const id = String(formData.get("id") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.rpc("moderation_verifier_plainte", {
    p_secret: secret,
    p_alert_id: id,
  });
  redirect(error ? erreurVersUrl(error.message) : "/moderation?ok=plainte");
}

function erreurVersUrl(message: string): string {
  const m = message ?? "";
  if (m.includes("acces_refuse")) return "/moderation?err=session";
  if (m.includes("motif_obligatoire")) return "/moderation?err=motif";
  if (m.includes("alerte_introuvable")) return "/moderation?err=introuvable";
  if (m.includes("plainte_non_declaree")) return "/moderation?err=plainte";
  return "/moderation?err=generique";
}

// ---- Rendu ----

type PageProps = {
  searchParams: Promise<{ err?: string; ok?: string }>;
};

// Boutons sobres, typographiques. Aucun aplat terracotta (réservé au signal),
// aucun coin arrondi, aucune ombre.
const BTN =
  "border border-encre bg-fond px-3 py-2 font-titre font-black text-s uppercase tracking-tight text-encre hover:bg-encre hover:text-fond";
const BTN_REJET =
  "border border-signal bg-fond px-3 py-2 font-titre font-black text-s uppercase tracking-tight text-signal hover:bg-signal hover:text-fond";

function Bandeau({ err, ok }: { err?: string; ok?: string }) {
  const msg = err
    ? (ERREURS[err] ?? ERREURS.generique)
    : ok
      ? (SUCCES[ok] ?? null)
      : null;
  if (!msg) return null;
  return (
    <p
      className={`border-l-2 px-pad py-gap font-texte text-s ${
        err ? "border-signal text-signal" : "border-encre text-encre"
      }`}
    >
      {msg}
    </p>
  );
}

export default async function Moderation({ searchParams }: PageProps) {
  const sp = await searchParams;

  // ---- Écran de connexion ----
  if (!(await estConnecte())) {
    return (
      <div className="flex flex-col gap-pad p-pad">
        <h1 className="font-titre font-black text-xl uppercase leading-tight">
          Modération
        </h1>
        <p className="font-texte text-s text-gris leading-relaxed border-t border-gris-2 pt-pad">
          Espace réservé. Saisissez la passphrase modérateur.
        </p>
        <Bandeau err={sp.err} />
        <form action={connexion} className="flex flex-col gap-pad">
          <label className="flex flex-col gap-gap">
            <span className="font-texte text-xs uppercase tracking-wide text-gris">
              Passphrase
            </span>
            <input
              type="password"
              name="passphrase"
              required
              autoComplete="off"
              className="border-2 border-encre bg-fond px-3 py-3 font-texte text-m text-encre outline-none"
            />
          </label>
          <div>
            <button type="submit" className="as-action">
              Entrer
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---- File d'attente ----
  const secret = process.env.MODERATION_SECRET ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("moderation_file", {
    p_secret: secret,
  });
  const file = (data as LigneFile[] | null) ?? [];

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between px-pad pt-pad pb-gap">
        <h1 className="font-titre font-black text-xl uppercase leading-tight">
          Modération
        </h1>
        <form action={deconnexion}>
          <button
            type="submit"
            className="font-texte text-xs uppercase tracking-wide text-gris underline"
          >
            Fermer
          </button>
        </form>
      </div>

      <p className="px-pad pb-gap font-texte text-s text-gris">
        {file.length === 0
          ? "Aucune alerte en attente."
          : `${file.length} alerte${file.length > 1 ? "s" : ""} en attente`}
      </p>

      <div className="px-pad">
        <Bandeau err={sp.err} ok={sp.ok} />
      </div>

      {error && (
        <p className="px-pad pb-pad font-texte text-s text-signal">
          Lecture de la file impossible. Vérifiez la configuration.
        </p>
      )}

      <ul className="flex flex-col">
        {file.map((a) => {
          const identifiants = IDENTIFIANTS.filter((i) => a[i.cle]);
          return (
            <li
              key={a.id}
              className="border-t border-gris-2 px-pad py-pad first:border-t-0"
            >
              {/* Méta : catégorie · statut · reçue */}
              <div className="flex flex-wrap items-center gap-gap">
                <span className="font-titre font-black text-s uppercase tracking-tight text-encre">
                  {CATEGORIES[a.category] ?? a.category}
                </span>
                <span className={`as-etat ${classeStatut(a.status)}`}>
                  {libelleStatut(a.status)}
                </span>
                <span className="font-texte text-xs text-gris">
                  reçue {tempsEcoule(a.created_at)}
                </span>
              </div>

              {/* Titre */}
              <h2 className="mt-gap font-titre font-black text-l uppercase leading-tight text-encre">
                {a.title}
              </h2>

              {/* Quartier · auteur · incident */}
              <p className="mt-gap font-texte text-xs uppercase tracking-wide text-gris">
                {a.zone_name ?? "Quartier inconnu"}
                {" · "}
                {a.author_name ?? "Auteur inconnu"}
                {a.happened_at ? ` · incident ${dateComplete(a.happened_at)}` : ""}
              </p>

              {/* Description complète */}
              <p className="mt-gap whitespace-pre-line font-texte text-s leading-relaxed text-encre">
                {a.description}
              </p>

              {/* Identifiants renseignés */}
              {identifiants.length > 0 && (
                <dl className="mt-gap flex flex-col gap-gap border-t border-gris-2 pt-gap">
                  {identifiants.map((i) => (
                    <div key={i.cle} className="flex gap-gap">
                      <dt className="font-texte text-xs uppercase tracking-wide text-gris">
                        {i.label}
                      </dt>
                      <dd className="font-texte text-s text-encre">
                        {String(a[i.cle])}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {/* Bloc plainte déclarée */}
              {a.complaint === "declaree" && (
                <div className="mt-pad border-2 border-encre p-gap">
                  <p className="font-texte text-s text-encre leading-relaxed">
                    L&apos;auteur déclare avoir déposé plainte. Non vérifié par
                    Alerte Sénégal.
                  </p>
                  <form action={verifierPlainte} className="mt-gap">
                    <input type="hidden" name="id" value={a.id} />
                    <button type="submit" className={BTN}>
                      Marquer la plainte vérifiée
                    </button>
                  </form>
                </div>
              )}
              {a.complaint === "verifiee" && (
                <p className="mt-pad border-2 border-encre p-gap font-texte text-s text-encre">
                  Plainte vérifiée par Alerte Sénégal.
                </p>
              )}

              {/* Actions */}
              <div className="mt-pad flex flex-wrap gap-gap">
                <form action={publier}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className={BTN}>
                    Publier
                  </button>
                </form>
                <form action={demanderVerification}>
                  <input type="hidden" name="id" value={a.id} />
                  <button type="submit" className={BTN}>
                    Demander vérification
                  </button>
                </form>
              </div>

              {/* Rejet : motif obligatoire, saisi en clair (sans JavaScript) */}
              <form action={rejeter} className="mt-gap flex flex-col gap-gap">
                <input type="hidden" name="id" value={a.id} />
                <label className="flex flex-col gap-gap">
                  <span className="font-texte text-xs uppercase tracking-wide text-gris">
                    Motif de rejet
                  </span>
                  <input
                    type="text"
                    name="motif"
                    required
                    maxLength={280}
                    placeholder="Obligatoire pour rejeter"
                    className="border border-gris-2 bg-fond px-3 py-2 font-texte text-s text-encre outline-none placeholder:text-gris"
                  />
                </label>
                <div>
                  <button type="submit" className={BTN_REJET}>
                    Rejeter
                  </button>
                </div>
              </form>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
