import { createClient } from "@/lib/supabase/server";
import type { AlertPublic, AlertStatus, Zone } from "@/lib/types";

// Libellés courts de statut, affichés en terracotta dans le bandeau.
const STATUT_LABEL: Record<AlertStatus, string> = {
  temoignage: "Témoignage",
  en_verification: "En vérification",
  verifie: "Vérifié",
  en_cours: "En cours",
  resolu: "Résolu",
  faux: "Faux",
  hors_de_cause: "Hors de cause",
  classe_sans_suite: "Classé sans suite",
};

function tempsEcoule(iso: string): string {
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return `il y a ${Math.floor(h / 24)} j`;
}

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

  const zoneIds = [
    ...new Set(alertes.map((a) => a.zone_id).filter(Boolean)),
  ] as string[];
  const { data: zonesData } = zoneIds.length
    ? await supabase.from("zones").select("id, name").in("id", zoneIds)
    : { data: [] };
  const zoneName = new Map(
    ((zonesData as Pick<Zone, "id" | "name">[]) ?? []).map((z) => [z.id, z.name]),
  );

  const items = alertes.map((a) => ({
    id: a.id,
    titre: a.title,
    zone: a.zone_id ? (zoneName.get(a.zone_id) ?? "") : "",
    temps: tempsEcoule(a.published_at ?? a.created_at),
    statut: STATUT_LABEL[a.status],
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
