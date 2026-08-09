import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// Écran d'entrée (B1). Authentification par OTP e-mail : on envoie un code à six
// chiffres, saisi ensuite sur /entrer/code. Server action + POST natif :
// fonctionne sans JavaScript. Hors coquille (app) : pas de barre de navigation
// pendant le parcours d'authentification.
//
// Prérequis Supabase (côté config, hors code) : provider Email activé et gabarit
// d'e-mail contenant {{ .Token }} pour envoyer un CODE (par défaut Supabase
// envoie un lien magique). Expéditeur : Alerte Sénégal <bonjour@alertesenegal.com>.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Entrer — Alerte Sénégal",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ statut?: string }> };

async function envoyerCode(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email || !email.includes("@")) redirect("/entrer?statut=email");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) redirect("/entrer?statut=erreur");

  redirect(`/entrer/code?email=${encodeURIComponent(email)}`);
}

export default async function Entrer({ searchParams }: Props) {
  const { statut } = await searchParams;

  return (
    <div className="as-appli fixed inset-0 overflow-hidden bg-fond flex flex-col">
      <header className="flex items-center border-b-filet-fort border-encre px-pad py-gap">
        <span className="font-titre font-black text-l uppercase tracking-tight">
          Alerte Sénégal
        </span>
      </header>

      <main className="flex-1 flex flex-col justify-center px-pad">
        <h1 className="font-titre font-black text-2xl uppercase leading-none">
          Entrer
        </h1>
        <p className="mt-gap mb-pad max-w-[36ch] font-texte text-m leading-relaxed text-gris">
          On vous envoie un code à six chiffres par e-mail. Pas de mot de passe.
        </p>

        <form action={envoyerCode} aria-label="Recevoir un code par e-mail">
          <div className="as-champ">
            <input
              type="email"
              name="email"
              required
              placeholder="votre e-mail"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              spellCheck={false}
              aria-label="Votre e-mail"
            />
            <button type="submit" className="as-action">
              Envoyer
            </button>
          </div>

          {statut === "email" && (
            <p className="pt-gap font-texte text-xs text-signal">
              Adresse e-mail invalide.
            </p>
          )}
          {statut === "erreur" && (
            <p className="pt-gap font-texte text-xs text-signal">
              L&apos;envoi a échoué. Réessayez dans un instant.
            </p>
          )}
        </form>

        <p className="mt-pad font-texte text-xs leading-relaxed text-gris">
          Le code est valable quelques minutes et à usage unique.
        </p>
      </main>
    </div>
  );
}
