import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";

// État d'attente (B1). L'utilisateur est authentifié mais pas encore admis dans
// une vague (aucune ligne memberships). Écran neutre, honnête : il confirme que
// la session fonctionne SANS rien fabriquer (ni onboarding, ni membership).
//
// L'admission automatique selon les vagues, et le compteur de places, seront
// branchés en B3 (rejoindre_cohorte / cohorte_etat). Le middleware garantit
// qu'on n'arrive ici qu'avec une session valide et sans membership.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "En attente d'accès — Alerte Sénégal",
  robots: { index: false, follow: false },
};

async function seDeconnecter() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/entrer");
}

export default async function Attente() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="as-appli fixed inset-0 overflow-hidden bg-fond flex flex-col">
      <header className="flex items-center border-b-filet-fort border-encre px-pad py-gap">
        <span className="font-titre font-black text-l uppercase tracking-tight">
          Alerte Sénégal
        </span>
      </header>

      <main className="flex-1 flex flex-col justify-center px-pad">
        <h1 className="font-titre font-black text-2xl uppercase leading-none">
          Votre compte
          <br />
          est créé
        </h1>
        <p className="mt-pad max-w-[38ch] font-texte text-m leading-relaxed text-encre">
          L&apos;accès s&apos;ouvre par vagues. Vous serez prévenu dès
          qu&apos;une place se libère pour vous.
        </p>
        <p className="mt-gap max-w-[38ch] font-texte text-s leading-relaxed text-gris">
          Les cent premiers membres reçoivent le statut Pionnier · 2026.
        </p>

        {user?.email && (
          <p className="mt-pad font-texte text-xs uppercase tracking-wide text-gris">
            Connecté : {user.email}
          </p>
        )}

        <form action={seDeconnecter} className="mt-pad">
          <button
            type="submit"
            className="w-full border border-gris-2 px-4 py-3 text-center font-titre font-black text-l uppercase text-encre"
          >
            Se déconnecter
          </button>
        </form>
      </main>
    </div>
  );
}
