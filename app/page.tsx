import { redirect } from "next/navigation";
import { TickerAlertes } from "@/app/components/ticker-alertes";
import { createClient } from "@/lib/supabase/server";

// Écran de seuil. Rendu serveur, lisible sans JavaScript.
export const dynamic = "force-dynamic";

type SeuilProps = { searchParams: Promise<{ statut?: string }> };

// Caviarde la fin d'un titre : on garde le début, on masque le reste.
// Déterministe (aucun aléatoire) pour un rendu serveur stable.
function caviarder(titre: string): { visible: string; masque: number } {
  const mots = titre.split(" ");
  const garde = Math.max(1, Math.ceil(mots.length / 3));
  const visible = mots.slice(0, garde).join(" ");
  const masque = Math.min(10, Math.max(3, titre.length - visible.length));
  return { visible, masque };
}

// Enregistre l'e-mail dans la liste d'attente. Server action : le formulaire
// fonctionne sans JavaScript (POST natif). RLS : insertion ouverte sur waitlist.
async function rejoindre(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) redirect("/?statut=email");

  const supabase = await createClient();
  const { error } = await supabase
    .from("waitlist")
    .insert({ email, source: "site" });

  // 23505 = e-mail déjà présent : traité comme déjà inscrit, pas une erreur.
  if (error && error.code !== "23505") redirect("/?statut=erreur");
  redirect("/?statut=ok");
}

// Chiffres du pied : fonction publique stats_communaute(), exécutable par anon,
// qui n'expose aucune donnée individuelle. Aucune clé service-role dans ce projet.
async function statsCommunaute(): Promise<{ membres: number; resolues: number }> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("stats_communaute");
  const row = Array.isArray(data) ? data[0] : data;
  return {
    membres: Number(row?.membres ?? 0),
    resolues: Number(row?.affaires_resolues ?? 0),
  };
}

export default async function Seuil({ searchParams }: SeuilProps) {
  const { statut } = await searchParams;

  const supabase = await createClient();
  const { data } = await supabase
    .from("alerts_public")
    .select("title")
    .order("published_at", { ascending: false, nullsFirst: false });
  const base = ((data as { title: string }[]) ?? []).map((a) => a.title);
  const mur = base.length
    ? Array.from({ length: 40 }, (_, i) => base[i % base.length])
    : [];

  // Un chiffre à zéro n'est pas affiché (voir le rendu du pied).
  const { membres: nbMembres, resolues: nbResolues } = await statsCommunaute();

  return (
    <div className="as-appli">
      <TickerAlertes />

      <main className="relative flex-1 flex flex-col justify-end overflow-hidden bg-fond-2">
        {/* Mur d'alertes caviardé, en fond : il y a quelque chose derrière. */}
        <div className="as-mur" aria-hidden="true">
          {mur.map((titre, i) => {
            const { visible, masque } = caviarder(titre);
            return (
              <p key={i} className="as-mur-f">
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
            Rejoignez la
            <br />
            <span className="text-signal">communauté</span>
          </h1>

          <p className="font-texte text-m text-gris leading-relaxed max-w-[36ch] mt-gap mb-pad">
            Les signalements de votre quartier, les affaires en cours, celles
            qui ont abouti. Réservé aux membres.
          </p>

          {statut === "ok" ? (
            <p className="font-texte text-m text-encre border-t border-gris-2 pt-pad">
              Votre demande est enregistrée.
            </p>
          ) : (
            <form action={rejoindre} aria-label="Demander l'accès">
              <div className="as-champ">
                <input
                  type="email"
                  name="email"
                  required
                  placeholder="votre e-mail"
                  autoComplete="email"
                  aria-label="Votre e-mail"
                />
                <button type="submit" className="as-action">
                  Entrer
                </button>
              </div>
              {statut === "email" && (
                <p className="font-texte text-xs text-signal mt-gap">
                  Adresse e-mail invalide.
                </p>
              )}
              {statut === "erreur" && (
                <p className="font-texte text-xs text-signal mt-gap">
                  Une erreur est survenue. Réessayez.
                </p>
              )}
            </form>
          )}
        </div>
      </main>

      {(nbMembres > 0 || nbResolues > 0) && (
        <footer className="flex items-center justify-between gap-gap border-t-filet-fort border-encre bg-fond px-pad py-gap">
          {nbMembres > 0 && (
            <span className="font-texte text-xs uppercase tracking-wide text-gris">
              {nbMembres} membre{nbMembres > 1 ? "s" : ""}
            </span>
          )}
          {nbResolues > 0 && (
            <span className="font-texte text-xs uppercase tracking-wide text-bon">
              {nbResolues} affaire{nbResolues > 1 ? "s" : ""} résolue
              {nbResolues > 1 ? "s" : ""}
            </span>
          )}
        </footer>
      )}
    </div>
  );
}
