import { TickerAlertes } from "@/app/components/ticker-alertes";
import { createClient } from "@/lib/supabase/server";

// Écran de seuil. Rendu serveur, lisible sans JavaScript.
export const dynamic = "force-dynamic";

// Caviarde la fin d'un titre : on garde le début, on masque le reste.
// Déterministe (aucun aléatoire) pour un rendu serveur stable.
function caviarder(titre: string): { visible: string; masque: number } {
  const mots = titre.split(" ");
  const garde = Math.max(1, Math.ceil(mots.length / 3));
  const visible = mots.slice(0, garde).join(" ");
  const masque = Math.min(10, Math.max(3, titre.length - visible.length));
  return { visible, masque };
}

export default async function Seuil() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("alerts_public")
    .select("title")
    .order("published_at", { ascending: false, nullsFirst: false });
  const base = ((data as { title: string }[]) ?? []).map((a) => a.title);

  // Densité du mur : on répète la base si peu d'alertes publiées.
  const mur = base.length
    ? Array.from({ length: 40 }, (_, i) => base[i % base.length])
    : [];

  return (
    <div className="as-appli">
      <TickerAlertes />

      <main className="relative flex-1 flex flex-col justify-end overflow-hidden bg-fond-2">
        {/* Mur d'alertes caviardé, en fond : il y a quelque chose derrière. */}
        <div className="as-mur" aria-hidden="true">
          {mur.map((titre, i) => {
            const { visible, masque } = caviarder(titre);
            return (
              <p key={i} className="as-mur-f font-titre">
                {visible}{" "}
                <span className="as-cache">{"█".repeat(masque)}</span>
              </p>
            );
          })}
        </div>
        <div className="as-voile" aria-hidden="true" />

        {/* Accroche */}
        <div className="relative z-[2] bg-fond px-pad pb-pad">
          <h1 className="font-titre font-black text-2xl uppercase leading-none pt-pad">
            Alerte Sénégal
          </h1>

          <p className="font-texte text-m text-gris leading-relaxed max-w-[34ch] mt-gap mb-pad">
            Derrière cet écran, les signalements des quartiers.
            <br />
            L&apos;accès est réservé aux membres.
          </p>

          <form className="as-champ" aria-label="Demander l'accès">
            <input
              type="email"
              name="email"
              placeholder="votre e-mail"
              autoComplete="email"
              aria-label="Votre e-mail"
            />
            <button type="button" className="as-action">
              Entrer
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
