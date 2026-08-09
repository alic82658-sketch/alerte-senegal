import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { AlertCategory } from "@/lib/types";
import { dateComplete } from "@/lib/temps";

// Écran de vérification. Porte d'entrée du produit : « ce numéro, cette plaque,
// cet objet est-il signalé ? ». Formulaire GET vers ?q=, rendu côté serveur et
// indexable, fonctionne sans JavaScript.
//
// La détection de format et la normalisation sont faites EN BASE par la fonction
// verifier_identifiant (security definer, appelable par anon) : l'écran transmet
// la valeur brute. La fonction ne renvoie jamais l'identifiant recherché — le
// registre n'est pas énumérable — et n'expose aucune donnée du déclarant.
//
// Contrat (déployée et testée, ne pas modifier) :
//   verifier_identifiant(p_valeur text) → TABLE(
//     type_detecte text,        -- imei | telephone | plaque | autre
//     nb_signalements bigint,   -- total correspondant
//     nb_verifies bigint,       -- dont vérifiés par Alerte Sénégal
//     nb_plaintes bigint,       -- dont plainte vérifiée
//     dernier_le timestamptz,   -- signalement le plus récent
//     zones text[], categories text[],
//     slug_recent text)         -- lien vers /alerte/[slug]
//   exception valeur_trop_courte si moins de 6 caractères.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Vérifier un numéro, une plaque, un IMEI — Alerte Sénégal",
  description:
    "Vérifiez en quinze secondes si un numéro Wave ou Orange Money, une plaque ou un objet a déjà été signalé sur Alerte Sénégal.",
};

type Resultat = {
  type_detecte: string;
  nb_signalements: number;
  nb_verifies: number;
  nb_plaintes: number;
  dernier_le: string | null;
  zones: string[] | null;
  categories: string[] | null;
  slug_recent: string | null;
};

// Libellés lisibles des catégories renvoyées par la fonction.
const LIBELLE_CATEGORIE: Record<AlertCategory, string> = {
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

function libelleCategorie(c: string): string {
  return LIBELLE_CATEGORIE[c as AlertCategory] ?? c;
}

// Ce que la fonction a reconnu dans la saisie : affiché pour confirmer à
// l'utilisateur que l'identifiant a bien été interprété.
const LIBELLE_TYPE: Record<string, string> = {
  telephone: "Numéro de téléphone",
  imei: "IMEI",
  plaque: "Plaque d'immatriculation",
  autre: "Recherche",
};

function libelleType(t: string): string {
  return LIBELLE_TYPE[t] ?? "Recherche";
}

// Loupe : même tracé que la barre basse, trait 1,5px, coins nets.
function Loupe() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M15 15 L20 20" />
    </svg>
  );
}

type PageProps = { searchParams: Promise<{ q?: string }> };

export default async function Verifier({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const valeur = (q ?? "").trim();

  let resultat: Resultat | null = null;
  let tropCourt = false;
  let erreur = false;

  if (valeur) {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("verifier_identifiant", {
      p_valeur: valeur,
    });
    if (error) {
      if ((error.message ?? "").includes("valeur_trop_courte")) tropCourt = true;
      else erreur = true;
    } else {
      const row = Array.isArray(data) ? data[0] : data;
      resultat = (row as Resultat) ?? null;
    }
  }

  const nb = resultat ? Number(resultat.nb_signalements) : 0;
  const nbVerifies = resultat ? Number(resultat.nb_verifies) : 0;
  const nbPlaintes = resultat ? Number(resultat.nb_plaintes) : 0;
  const zones = (resultat?.zones ?? []).filter(Boolean);
  const categories = (resultat?.categories ?? []).filter(Boolean);

  return (
    <div className="flex flex-col">
      {/* En-tête d'écran */}
      <div className="flex items-baseline justify-between px-pad pt-pad pb-gap">
        <h1 className="font-titre font-black text-l uppercase tracking-tight">
          Vérifier
        </h1>
      </div>
      <p className="px-pad pb-gap font-texte text-s text-gris leading-relaxed">
        Un numéro Wave ou Orange Money, une plaque, un IMEI. Voyez en quinze
        secondes s&apos;il a déjà été signalé.
      </p>

      {/* Champ unique. Formulaire GET : indexable, fonctionne sans JavaScript. */}
      <form method="get" action="/verifier" className="px-pad pb-pad">
        <div className="as-champ">
          <input
            type="text"
            name="q"
            defaultValue={valeur}
            placeholder="Numéro, plaque ou IMEI"
            aria-label="Numéro, plaque ou IMEI à vérifier"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
          />
          <button
            type="submit"
            aria-label="Vérifier"
            className="flex items-center justify-center bg-encre px-4 text-fond"
          >
            <Loupe />
          </button>
        </div>

        {/* valeur_trop_courte : message de saisie sous le champ, pas une erreur générique. */}
        {tropCourt && (
          <p className="pt-gap font-texte text-xs text-signal">
            Entrez au moins 6 caractères pour lancer une recherche.
          </p>
        )}
        {erreur && (
          <p className="pt-gap font-texte text-xs text-signal">
            La recherche a échoué. Réessayez dans un instant.
          </p>
        )}
      </form>

      {/* ── Résultat : trois états ── */}

      {/* État 2 — N signalements */}
      {resultat && nb > 0 && (
        <section className="border-t border-gris-2">
          <div className="flex flex-col gap-pad border-l-2 border-l-signal px-pad py-pad">
            <div>
              <p className="font-texte text-xs uppercase tracking-wide text-gris">
                {libelleType(resultat.type_detecte)} · résultat
              </p>
              <div className="mt-gap flex items-end gap-pad">
                <span className="font-titre font-black text-2xl leading-none text-signal">
                  {nb}
                </span>
                <span className="font-texte text-s leading-snug text-gris">
                  signalement{nb > 1 ? "s" : ""}
                  <br />
                  correspondant{nb > 1 ? "s" : ""}
                </span>
              </div>
            </div>

            {/* Le nombre vérifié est toujours distingué du total. */}
            <dl className="flex flex-col border-y border-gris-2">
              <div className="flex items-baseline justify-between border-b border-gris-2 py-gap">
                <dt className="font-texte text-s uppercase tracking-wide text-gris">
                  Vérifiés par Alerte Sénégal
                </dt>
                <dd className="font-texte text-m text-encre">
                  {nbVerifies} sur {nb}
                </dd>
              </div>
              <div className="flex items-baseline justify-between py-gap">
                <dt className="font-texte text-s uppercase tracking-wide text-gris">
                  Avec plainte vérifiée
                </dt>
                <dd className="font-texte text-m text-encre">
                  {nbPlaintes} sur {nb}
                </dd>
              </div>
            </dl>

            {resultat.dernier_le && (
              <p className="font-texte text-s leading-relaxed text-encre">
                Signalement le plus récent&nbsp;:{" "}
                <span className="text-gris">{dateComplete(resultat.dernier_le)}</span>
              </p>
            )}

            {zones.length > 0 && (
              <p className="font-texte text-s leading-relaxed text-encre">
                Zone{zones.length > 1 ? "s" : ""}&nbsp;:{" "}
                <span className="text-gris">{zones.join(", ")}</span>
              </p>
            )}

            {categories.length > 0 && (
              <p className="font-texte text-s leading-relaxed text-encre">
                Catégorie{categories.length > 1 ? "s" : ""}&nbsp;:{" "}
                <span className="text-gris">
                  {categories.map(libelleCategorie).join(", ")}
                </span>
              </p>
            )}

            {resultat.slug_recent && (
              <div className="border-t border-gris-2 pt-pad">
                <Link
                  href={`/alerte/${resultat.slug_recent}`}
                  className="as-action inline-block"
                >
                  Voir la fiche la plus récente
                </Link>
              </div>
            )}
          </div>
        </section>
      )}

      {/* État 1 — Aucun signalement connu. L'absence ne garantit rien. */}
      {resultat && nb === 0 && (
        <section className="flex flex-col gap-pad border-t border-gris-2 px-pad py-pad">
          <div>
            <p className="font-texte text-xs uppercase tracking-wide text-gris">
              {libelleType(resultat.type_detecte)} · résultat
            </p>
            <h2 className="mt-gap font-titre font-black text-xl uppercase leading-tight">
              Aucun signalement connu
            </h2>
          </div>

          <p className="font-texte text-m leading-relaxed text-encre">
            Cet identifiant n&apos;apparaît dans aucun signalement pour l&apos;instant.
            Cela ne veut pas dire qu&apos;il est sûr&nbsp;: beaucoup d&apos;arnaques
            ne sont jamais signalées, et un numéro peut changer de mains.
          </p>
          <p className="font-texte text-s leading-relaxed text-gris">
            L&apos;absence de signalement ne garantit rien.
          </p>

          {/* Rebond : demander à la communauté. La publication communautaire
              n'existe pas encore — bouton inactif, sans terracotta. */}
          <div className="border-t border-gris-2 pt-pad">
            <p className="mb-gap font-texte text-s leading-relaxed text-gris">
              Personne ne l&apos;a encore signalé. Vous pourrez bientôt demander si
              quelqu&apos;un dans la communauté le connaît.
            </p>
            <button
              type="button"
              disabled
              aria-disabled="true"
              className="w-full cursor-not-allowed border border-gris-2 px-4 py-3 text-center font-titre font-black text-l uppercase text-gris"
            >
              Demander à la communauté
            </button>
            <p className="mt-gap font-texte text-xs uppercase tracking-wide text-gris">
              Bientôt disponible
            </p>
          </div>
        </section>
      )}

      {/* État initial — aucune recherche lancée */}
      {!valeur && (
        <section className="border-t border-gris-2 px-pad py-pad">
          <p className="font-texte text-s leading-relaxed text-gris">
            Le registre distingue toujours ce qui est{" "}
            <span className="text-encre">déclaré</span> par un membre de ce qui est{" "}
            <span className="text-encre">vérifié</span> par Alerte Sénégal. Aucune
            donnée personnelle du déclarant n&apos;est exposée.
          </p>
        </section>
      )}
    </div>
  );
}
