import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AlertPublic, AlertCategory } from "@/lib/types";
import { libelleStatut, classeStatut } from "@/lib/statuts";
import { tempsEcoule, libelleJour, cleJour, moinsDe } from "@/lib/temps";

// Écran d'accueil. Rendu serveur, filtres par paramètres d'URL (sans JavaScript).
export const dynamic = "force-dynamic";

// Zone courante : Ngor par défaut, non interactif pour l'instant.
const ZONE_COURANTE = { slug: "ngor", nom: "Ngor" };

type Filtre = {
  slug: string;
  label: string;
  portee?: "zone" | "tout";
  categories?: AlertCategory[];
};

const FILTRES: Filtre[] = [
  { slug: "autour", label: "Autour de moi", portee: "zone" },
  { slug: "tout", label: "Tout le Sénégal", portee: "tout" },
  { slug: "disparitions", label: "Disparitions", categories: ["personne_disparue"] },
  { slug: "vols", label: "Vols", categories: ["vol"] },
  { slug: "arnaques", label: "Arnaques", categories: ["arnaque"] },
  {
    slug: "eau-electricite",
    label: "Eau et électricité",
    categories: ["coupure_eau", "coupure_electricite"],
  },
  { slug: "solidarite", label: "Solidarité", categories: ["solidarite"] },
];

type AccueilProps = { searchParams: Promise<{ filtre?: string }> };

function libelleSuivis(n: number): string {
  return n <= 1 ? `${n} personne suit` : `${n} personnes suivent`;
}

function libelleResolue(n: number): string {
  return `Résolue grâce à ${n} information${n > 1 ? "s" : ""}`;
}

export default async function Accueil({ searchParams }: AccueilProps) {
  const { filtre: filtreParam } = await searchParams;
  const filtreActif = FILTRES.find((f) => f.slug === filtreParam) ?? FILTRES[0];

  const supabase = await createClient();
  const maintenant = new Date();

  // Synthèse : alertes actives (ni résolues ni fausses) dans la zone courante.
  const { count } = await supabase
    .from("alerts_public")
    .select("*", { count: "exact", head: true })
    .eq("zone_slug", ZONE_COURANTE.slug)
    .not("status", "in", "(resolu,faux)");
  const nbActives = count ?? 0;

  // Flux selon le filtre (filtres avant tri, pour le typage supabase-js).
  let requete = supabase.from("alerts_public").select("*");
  if (filtreActif.portee === "zone") {
    requete = requete.eq("zone_slug", ZONE_COURANTE.slug);
  }
  if (filtreActif.categories) {
    requete = requete.in("category", filtreActif.categories);
  }
  const { data } = await requete.order("published_at", {
    ascending: false,
    nullsFirst: false,
  });
  const flux = (data as AlertPublic[]) ?? [];

  // Regroupement par jour (le flux est déjà trié du plus récent au plus ancien).
  const groupes: { cle: string; jour: string; alertes: AlertPublic[] }[] = [];
  for (const a of flux) {
    const iso = a.published_at ?? a.created_at;
    const cle = cleJour(iso);
    const dernier = groupes[groupes.length - 1];
    if (dernier && dernier.cle === cle) dernier.alertes.push(a);
    else groupes.push({ cle, jour: libelleJour(iso, maintenant), alertes: [a] });
  }

  return (
    <div className="flex flex-col">
      {/* Titre de section + sélecteur de zone (non interactif) */}
      <div className="flex items-center justify-between gap-gap px-pad pt-pad pb-gap">
        <h2 className="font-titre font-black text-l uppercase tracking-tight">
          Autour de vous
        </h2>
        <span className="font-texte text-xs uppercase tracking-wide text-signal">
          {ZONE_COURANTE.nom} ▾
        </span>
      </div>

      {/* Filtres horizontaux défilants : de vrais liens, fonctionnent sans JS */}
      <nav
        className="flex gap-gap overflow-x-auto px-pad pb-gap"
        aria-label="Filtres"
      >
        {FILTRES.map((f) => {
          const actif = f.slug === filtreActif.slug;
          return (
            <Link
              key={f.slug}
              href={f.slug === "autour" ? "/accueil" : `/accueil?filtre=${f.slug}`}
              aria-current={actif ? "page" : undefined}
              className={`whitespace-nowrap border px-3 py-2 font-texte text-xs uppercase tracking-wide ${
                actif
                  ? "border-encre bg-encre text-fond"
                  : "border-gris-2 text-gris"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </nav>

      {/* Synthèse : nombre d'alertes actives dans la zone */}
      <section className="flex items-end gap-pad border-y border-gris-2 bg-fond-2 px-pad py-pad">
        <span className="font-titre font-black text-2xl leading-none text-signal">
          {nbActives}
        </span>
        <span className="font-texte text-s leading-snug text-gris">
          alerte{nbActives > 1 ? "s" : ""} active{nbActives > 1 ? "s" : ""}
          <br />
          dans votre quartier
        </span>
      </section>

      {/* Flux groupé par jour */}
      <section>
        {groupes.length === 0 && (
          <p className="px-pad py-pad font-texte text-s text-gris">
            Aucune alerte pour ce filtre.
          </p>
        )}

        {groupes.map((g) => (
          <div key={g.cle}>
            {/* Séparateur de jour */}
            <div className="flex items-center gap-gap px-pad pb-gap pt-pad font-texte text-xs uppercase tracking-wide text-gris">
              {g.jour}
              <span className="flex-1 border-t border-gris-2" />
            </div>

            {g.alertes.map((a) => {
              const iso = a.published_at ?? a.created_at;
              const urgent = moinsDe(iso, 45, maintenant);
              const resolueAvecTips = a.status === "resolu" && a.tips_count > 0;
              return (
                <Link
                  key={a.id}
                  href={`/alerte/${a.slug}`}
                  className={`block border-b border-l-2 border-gris-2 px-pad py-pad ${
                    urgent ? "border-l-signal" : "border-l-transparent"
                  }`}
                >
                  <p className="mb-gap flex flex-wrap items-center gap-gap font-texte text-xs uppercase tracking-wide text-gris">
                    {a.author_name && (
                      <span className="font-medium text-encre">
                        {a.author_name}
                      </span>
                    )}
                    {a.zone_name && <span>{a.zone_name}</span>}
                    <span>{tempsEcoule(iso, maintenant)}</span>
                  </p>

                  <h3 className="mb-gap font-titre text-xl font-extrabold uppercase leading-tight">
                    {a.title}
                  </h3>

                  <div className="flex flex-wrap items-center justify-between gap-gap">
                    <span className={`as-etat ${classeStatut(a.status)}`}>
                      {libelleStatut(a.status)}
                    </span>
                    <span className="font-texte text-xs text-gris">
                      {resolueAvecTips
                        ? libelleResolue(a.tips_count)
                        : libelleSuivis(a.follows_count)}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </section>
    </div>
  );
}
