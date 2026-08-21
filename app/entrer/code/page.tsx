import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// Saisie du code OTP reçu par e-mail (B1). verifyOtp pose la session, puis on
// laisse le middleware router selon l'état (en B1 : aucun membership → /attente).
// Server action + POST natif : fonctionne sans JavaScript.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Votre code — Alerte Sénégal",
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ email?: string; statut?: string }> };

async function verifierCode(formData: FormData) {
  "use server";
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const token = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!email) redirect("/entrer");
  if (!token)
    redirect(`/entrer/code?email=${encodeURIComponent(email)}&statut=vide`);

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
  if (error)
    redirect(`/entrer/code?email=${encodeURIComponent(email)}&statut=code`);

  // Session posée. Le middleware redirige ensuite selon l'admission/onboarding.
  redirect("/accueil");
}

export default async function Code({ searchParams }: Props) {
  const { email, statut } = await searchParams;
  if (!email) redirect("/entrer");

  return (
    <div className="as-appli fixed inset-0 overflow-hidden bg-fond flex flex-col">
      <header className="flex items-center border-b-filet-fort border-encre px-pad py-gap">
        <span className="font-titre font-black text-l uppercase tracking-tight">
          Alerte Sénégal
        </span>
      </header>

      <main className="flex-1 flex flex-col justify-center px-pad">
        <h1 className="font-titre font-black text-2xl uppercase leading-none">
          Votre code
        </h1>
        <p className="mt-gap mb-pad max-w-[36ch] font-texte text-m leading-relaxed text-gris">
          Entrez le code à six chiffres envoyé à{" "}
          <span className="text-encre">{email}</span>.
        </p>

        <form action={verifierCode} aria-label="Saisir le code reçu">
          <input type="hidden" name="email" value={email} />
          <div className="as-champ">
            <input
              type="text"
              name="code"
              required
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              autoComplete="one-time-code"
              placeholder="000000"
              aria-label="Code à six chiffres"
            />
            <button type="submit" className="as-action">
              Vérifier
            </button>
          </div>

          {statut === "vide" && (
            <p className="pt-gap font-texte text-xs text-signal">
              Entrez le code reçu par e-mail.
            </p>
          )}
          {statut === "code" && (
            <p className="pt-gap font-texte text-xs text-signal">
              Code incorrect ou expiré. Réessayez ou demandez-en un nouveau.
            </p>
          )}
        </form>

        <p className="mt-pad font-texte text-xs leading-relaxed text-gris">
          Pas reçu ?{" "}
          <Link href="/entrer" className="text-encre underline">
            Modifier l&apos;e-mail ou renvoyer un code
          </Link>
          .
        </p>
      </main>
    </div>
  );
}
