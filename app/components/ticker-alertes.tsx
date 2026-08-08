import { createClient } from "@/lib/supabase/server";
import type { AlertPublic } from "@/lib/types";
import { libelleStatut } from "@/lib/statuts";
import { tempsEcoule } from "@/lib/temps";

// Bandeau supérieur défilant : les 5 alertes les plus récentes.
export async function TickerAlertes() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("alerts_public")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(5);
  const alertes = (data as AlertPublic[]) ?? [];
  if (alertes.length === 0) return null;

  const maintenant = new Date();
  const items = alertes.map((a) => ({
    id: a.id,
    titre: a.title,
    zone: a.zone_name ?? "",
    temps: tempsEcoule(a.published_at ?? a.created_at, maintenant),
    statut: libelleStatut(a.status),
  }));

  // Piste dupliquée pour un défilement continu et sans couture.
  const piste = [...items, ...items];

  return (
    <div
      className="bg-encre text-fond overflow-hidden whitespace-nowrap"
      aria-label="Dernières alertes"
    >
      <div className="as-defile inline-block py-1">
        {piste.map((it, i) => (
          <span
            key={`${it.id}-${i}`}
            className="font-texte text-xs uppercase tracking-wide px-5"
          >
            {it.titre} · {it.zone} · {it.temps} ·{" "}
            <span className="text-signal">{it.statut}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
