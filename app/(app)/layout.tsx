import { TickerAlertes } from "@/app/components/ticker-alertes";
import { EnTete } from "@/app/components/en-tete";
import { NavBasse } from "@/app/components/nav-basse";

/**
 * Coquille de l'application (bandeau défilant, en-tête collant, barre basse).
 * Placée dans le groupe de routes (app) — et non dans le layout racine —
 * afin de NE PAS s'appliquer à la route racine `/`, qui reste l'écran de seuil.
 * La coque 420px et le container-type viennent de .as-appli (design/tokens.css).
 */
export default function CoquilleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="as-appli">
      <TickerAlertes />
      <EnTete />
      <main className="flex-1">{children}</main>
      <NavBasse />
    </div>
  );
}
