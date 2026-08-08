import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AlertPublic, Zone } from "@/lib/types";

// Page temporaire de navigation. Lit la vue alerts_public, jamais la table.
// La coque et le <main> sont fournis par le layout (app).
export const dynamic = "force-dynamic";

export default async function DevIndex() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("alerts_public")
    .select("*")
    .order("published_at", { ascending: false, nullsFirst: false });
  const alertes = (data as AlertPublic[]) ?? [];

  // Noms de zones en une seule requête.
  const zoneIds = [
    ...new Set(alertes.map((a) => a.zone_id).filter(Boolean)),
  ] as string[];
  const { data: zonesData } = zoneIds.length
    ? await supabase.from("zones").select("id, name").in("id", zoneIds)
    : { data: [] };
  const zones = (zonesData as Pick<Zone, "id" | "name">[]) ?? [];
  const zoneName = new Map(zones.map((z) => [z.id, z.name]));

  return (
    <div className="flex flex-col gap-gap p-pad">
      <h1 className="font-titre font-black text-xl uppercase">Alertes (dev)</h1>
      <p className="font-texte text-s text-gris">
        {alertes.length} alertes publiées
      </p>

      <ul className="flex flex-col border-t border-gris-2">
        {alertes.map((a) => (
          <li key={a.id} className="border-b border-gris-2 py-gap">
            <Link
              href={`/alerte/${a.slug}`}
              className="font-texte text-m text-encre underline"
            >
              {a.title}
            </Link>
            <p className="font-texte text-xs text-gris uppercase tracking-wide">
              {a.status}
              {a.zone_id ? ` · ${zoneName.get(a.zone_id) ?? ""}` : ""}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
