import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { AlertPublic } from "@/lib/types";
import { libelleStatut, classeStatut } from "@/lib/statuts";

// Lecture de données live (vue alerts_public) : rendu serveur à la demande.
// La coque et le <main> sont fournis par le layout (app).
export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ slug: string }> };

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

  const dateAffichee =
    alerte.happened_at ?? alerte.published_at ?? alerte.created_at;

  return (
    <article className="flex flex-col gap-pad p-pad">
      {/* Statuts typographiques */}
      <div className="flex flex-wrap gap-gap">
        <span className={`as-etat ${classeStatut(alerte.status)}`}>
          {libelleStatut(alerte.status)}
        </span>
        {alerte.complaint_verified && (
          <span className="as-etat as-etat--plainte">Plainte vérifiée</span>
        )}
      </div>

      <h1 className="font-titre font-black text-xl uppercase leading-tight">
        {alerte.title}
      </h1>

      {/* Méta : quartier · date (zone_name vient de la vue, plus de jointure) */}
      <p className="font-texte text-s text-gris uppercase tracking-wide">
        {alerte.zone_name ? `${alerte.zone_name} · ` : ""}
        {formatDate(dateAffichee)}
      </p>

      <p className="font-texte text-m text-encre leading-relaxed whitespace-pre-line border-t border-gris-2 pt-pad">
        {alerte.description}
      </p>

      <p className="font-texte text-s text-gris">
        {libelleSuivis(alerte.follows_count)}
      </p>

      {/* Actions. Le seul terracotta plein de l'écran est « Signaler » dans la
          barre basse : ici les deux boutons restent en encre. */}
      <div className="flex flex-col gap-gap pt-pad">
        <button type="button" className="as-action w-full">
          Suivre
        </button>
        <button type="button" className="as-action w-full">
          J&apos;ai une information
        </button>
      </div>
    </article>
  );
}
