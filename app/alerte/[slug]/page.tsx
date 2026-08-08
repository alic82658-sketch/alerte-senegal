import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AlertPublic, AlertStatus } from "@/lib/types";

// Lecture de données live (vue alerts_public) : rendu serveur à la demande.
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

// Libellé typographique du statut. La couleur ne fait que renforcer :
// le libellé porte l'information, lisible sans distinction de couleur.
const STATUTS: Record<AlertStatus, { label: string; classe: string }> = {
  temoignage: { label: "Témoignage", classe: "as-etat--temoignage" },
  en_verification: { label: "En vérification", classe: "as-etat--verification" },
  verifie: { label: "Vérifié", classe: "as-etat--verifie" },
  en_cours: { label: "En cours", classe: "" },
  resolu: { label: "Résolu", classe: "as-etat--resolu" },
  faux: { label: "Faux", classe: "as-etat--faux" },
  hors_de_cause: { label: "Hors de cause", classe: "" },
  classe_sans_suite: { label: "Classé sans suite", classe: "" },
};

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

function libelleSuivis(n: number): string {
  return n <= 1 ? `${n} personne suit` : `${n} personnes suivent`;
}

async function getAlerte(slug: string): Promise<AlertPublic | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("alerts_public")
    .select("*")
    .eq("slug", slug)
    .maybeSingle();
  return (data as AlertPublic) ?? null;
}

async function getZoneName(zoneId: string | null): Promise<string | null> {
  if (!zoneId) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("zones")
    .select("name")
    .eq("id", zoneId)
    .maybeSingle();
  return (data?.name as string) ?? null;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const alerte = await getAlerte(slug);
  if (!alerte) return { title: "Alerte introuvable — Alerte Sénégal" };
  return {
    title: `${alerte.title} — Alerte Sénégal`,
    description: alerte.description,
  };
}

export default async function FicheAlerte({ params }: PageProps) {
  const { slug } = await params;
  const alerte = await getAlerte(slug);
  if (!alerte) notFound();

  const zoneName = await getZoneName(alerte.zone_id);
  const statut = STATUTS[alerte.status];
  const dateAffichee = alerte.happened_at ?? alerte.published_at ?? alerte.created_at;

  return (
    <main className="as-appli">
      <article className="flex flex-col gap-pad p-pad">
        {/* Statuts typographiques */}
        <div className="flex flex-wrap gap-gap">
          <span className={`as-etat ${statut.classe}`}>{statut.label}</span>
          {alerte.complaint_verified && (
            <span className="as-etat as-etat--plainte">Plainte vérifiée</span>
          )}
        </div>

        <h1 className="font-titre font-black text-xl uppercase leading-tight">
          {alerte.title}
        </h1>

        {/* Méta : quartier · date */}
        <p className="font-texte text-s text-gris uppercase tracking-wide">
          {zoneName ? `${zoneName} · ` : ""}
          {formatDate(dateAffichee)}
        </p>

        <p className="font-texte text-m text-encre leading-relaxed whitespace-pre-line border-t border-gris-2 pt-pad">
          {alerte.description}
        </p>

        <p className="font-texte text-s text-gris">
          {libelleSuivis(alerte.follows_count)}
        </p>

        {/* Actions — un seul élément terracotta plein (Suivre) */}
        <div className="flex flex-col gap-gap pt-pad">
          <button type="button" className="as-action as-action--signal w-full">
            Suivre
          </button>
          <button type="button" className="as-action w-full">
            J&apos;ai une information
          </button>
        </div>
      </article>
    </main>
  );
}
