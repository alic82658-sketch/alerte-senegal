import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { AlertCategory, Zone } from "@/lib/types";

// Parcours de signalement. Rendu serveur, navigation par étapes en URL,
// server actions : fonctionne sans JavaScript. L'insertion passe par la
// fonction RPC creer_signalement (security definer, appelable par anon ;
// alerte en 'en_attente'/'temoignage', auteur = profil « Signalement anonyme »).
//
// Contrat de la fonction (déployée en base) :
//   creer_signalement(
//     p_title text, p_description text, p_category alert_category,
//     p_zone_slug text, p_happened_at timestamptz = null,
//     p_imei text = null, p_plate text = null,
//     p_phone_number text = null, p_account_number text = null,
//     p_complaint_declared boolean = false, p_source source_channel = 'site')
//   → ligne { nouvelle_slug text, zone_membres bigint }
//   exceptions : titre_trop_court (<5), description_trop_courte (<20), zone_inconnue
export const dynamic = "force-dynamic";

const BROUILLON = "as_signalement";

type Brouillon = {
  categorie?: AlertCategory;
  titre?: string;
  description?: string;
  zone_slug?: string;
};

const CATEGORIES: { slug: AlertCategory; label: string }[] = [
  { slug: "vol", label: "Vol" },
  { slug: "vehicule_recherche", label: "Véhicule recherché" },
  { slug: "personne_disparue", label: "Personne disparue" },
  { slug: "arnaque", label: "Arnaque" },
  { slug: "accident", label: "Accident" },
  { slug: "circulation", label: "Circulation" },
  { slug: "inondation", label: "Inondation" },
  { slug: "coupure_eau", label: "Coupure d'eau" },
  { slug: "coupure_electricite", label: "Coupure d'électricité" },
  { slug: "incident_local", label: "Incident local" },
  { slug: "objet_perdu", label: "Objet perdu" },
  { slug: "objet_retrouve", label: "Objet retrouvé" },
  { slug: "appel_temoin", label: "Appel à témoins" },
  { slug: "solidarite", label: "Solidarité" },
  { slug: "urgence_communautaire", label: "Urgence communautaire" },
  { slug: "autre", label: "Autre" },
];

// Champ conditionnel d'identifiant selon la catégorie (étape 3).
// `rpc` = nom du paramètre structuré de la fonction.
type ParamIdentifiant = "p_imei" | "p_plate" | "p_phone_number";
const IDENTIFIANT: Partial<
  Record<AlertCategory, { name: string; rpc: ParamIdentifiant; label: string; placeholder: string }>
> = {
  vol: {
    name: "imei",
    rpc: "p_imei",
    label: "IMEI (si c'est un téléphone)",
    placeholder: "15 chiffres — tapez *#06#",
  },
  vehicule_recherche: {
    name: "plate",
    rpc: "p_plate",
    label: "Plaque d'immatriculation",
    placeholder: "DK 1234 A",
  },
  arnaque: {
    name: "phone",
    rpc: "p_phone_number",
    label: "Numéro de téléphone ou de compte",
    placeholder: "Wave, Orange Money, téléphone…",
  },
};

const ERREURS: Record<string, string> = {
  titre: "Le titre doit faire au moins 5 caractères.",
  desc: "La description doit faire au moins 20 caractères.",
  zone: "Choisissez un quartier valide.",
  generique: "Renseignez le titre, la description et le quartier.",
};

async function lireBrouillon(): Promise<Brouillon> {
  const raw = (await cookies()).get(BROUILLON)?.value;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Brouillon;
  } catch {
    return {};
  }
}

async function ecrireBrouillon(b: Brouillon) {
  (await cookies()).set(BROUILLON, JSON.stringify(b), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 3600,
  });
}

// ---- Server actions ----

async function choisirCategorie(formData: FormData) {
  "use server";
  const categorie = String(formData.get("categorie") ?? "") as AlertCategory;
  if (!CATEGORIES.some((c) => c.slug === categorie)) redirect("/signaler");
  await ecrireBrouillon({ categorie });
  redirect("/signaler?etape=2");
}

async function soumettreDetails(formData: FormData) {
  "use server";
  const b = await lireBrouillon();
  if (!b.categorie) redirect("/signaler");
  const titre = String(formData.get("titre") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const zone_slug = String(formData.get("zone_slug") ?? "").trim();
  if (titre.length < 5) redirect("/signaler?etape=2&err=titre");
  if (description.length < 20) redirect("/signaler?etape=2&err=desc");
  if (!zone_slug) redirect("/signaler?etape=2&err=zone");
  await ecrireBrouillon({ ...b, titre, description, zone_slug });
  redirect("/signaler?etape=3");
}

async function envoyer(formData: FormData) {
  "use server";
  const b = await lireBrouillon();
  if (!b.categorie || !b.titre || !b.description || !b.zone_slug) {
    redirect("/signaler");
  }

  const args: Record<string, unknown> = {
    p_title: b.titre,
    p_description: b.description,
    p_category: b.categorie,
    p_zone_slug: b.zone_slug,
    p_happened_at: String(formData.get("happened_at") ?? "").trim() || null,
    p_complaint_declared: formData.get("plainte") === "1",
  };

  // Identifiant conditionnel → paramètre structuré de la fonction.
  const idf = IDENTIFIANT[b.categorie!];
  if (idf) {
    const val = String(formData.get(idf.name) ?? "").trim();
    if (val) args[idf.rpc] = val;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("creer_signalement", args);

  if (error) {
    const m = error.message ?? "";
    if (m.includes("titre_trop_court")) redirect("/signaler?etape=2&err=titre");
    if (m.includes("description_trop_courte")) redirect("/signaler?etape=2&err=desc");
    if (m.includes("zone_inconnue")) redirect("/signaler?etape=2&err=zone");
    redirect("/signaler?etape=3&err=1");
  }

  const row = Array.isArray(data) ? data[0] : data;
  const membres = Number((row as { zone_membres?: number })?.zone_membres ?? 0);
  (await cookies()).delete(BROUILLON);
  redirect(`/signaler?ok=1&membres=${membres}&cat=${b.categorie}`);
}

// ---- Rendu ----

type PageProps = {
  searchParams: Promise<{
    etape?: string;
    err?: string;
    ok?: string;
    membres?: string;
    cat?: string;
  }>;
};

function Entete({ n }: { n: number }) {
  return (
    <div className="flex items-baseline justify-between px-pad pt-pad pb-gap">
      <h2 className="font-titre font-black text-l uppercase tracking-tight">
        Signaler
      </h2>
      <span className="font-texte text-xs uppercase tracking-wide text-gris">
        Étape {n} sur 3
      </span>
    </div>
  );
}

export default async function Signaler({ searchParams }: PageProps) {
  const sp = await searchParams;

  // Écran de confirmation
  if (sp.ok === "1") {
    const membres = Number(sp.membres ?? 0);
    const cat = sp.cat as AlertCategory | undefined;
    return (
      <div className="flex flex-col gap-pad p-pad">
        <h2 className="font-titre font-black text-xl uppercase leading-tight">
          Signalement envoyé
        </h2>

        <p className="font-texte text-m text-encre leading-relaxed border-t border-gris-2 pt-pad">
          {membres > 0
            ? `${membres} membre${membres > 1 ? "s" : ""} de ce quartier seront prévenus une fois l'alerte publiée.`
            : "Les membres de ce quartier seront prévenus dès qu'ils rejoignent la communauté."}
        </p>

        <p className="font-texte text-s text-gris leading-relaxed">
          Votre signalement est en attente de vérification par un modérateur.
          Il n&apos;apparaît publiquement qu&apos;une fois publié.
        </p>

        {cat === "vol" && (
          <div className="border-t border-gris-2 pt-pad">
            <h3 className="font-titre font-extrabold text-l uppercase">
              Vol de téléphone : les démarches
            </h3>
            <ul className="mt-gap flex flex-col gap-gap font-texte text-s text-encre leading-relaxed">
              <li>— Retrouvez l&apos;IMEI : tapez *#06# ou regardez la boîte.</li>
              <li>— Faites-le bloquer chez votre opérateur.</li>
              <li>— Déposez plainte, puis ajoutez le récépissé à l&apos;alerte.</li>
            </ul>
          </div>
        )}

        <div className="pt-pad">
          <Link href="/accueil" className="as-action inline-block">
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    );
  }

  const etape = sp.etape === "2" ? 2 : sp.etape === "3" ? 3 : 1;
  const b = await lireBrouillon();
  const messageErreur = sp.err
    ? (ERREURS[sp.err] ?? ERREURS.generique)
    : null;

  // ---- Étape 1 : catégorie ----
  if (etape === 1) {
    return (
      <div className="flex flex-col">
        <Entete n={1} />
        <p className="px-pad pb-gap font-texte text-s text-gris">
          De quoi s&apos;agit-il ?
        </p>
        <form action={choisirCategorie}>
          <div className="grid grid-cols-2 gap-gap px-pad pb-pad">
            {CATEGORIES.map((c) => (
              <button
                key={c.slug}
                type="submit"
                name="categorie"
                value={c.slug}
                className="border border-gris-2 bg-fond-2 p-pad text-left font-titre font-black text-l uppercase leading-tight text-encre"
              >
                {c.label}
              </button>
            ))}
          </div>
        </form>
      </div>
    );
  }

  // ---- Étape 2 : titre, description, quartier ----
  if (etape === 2) {
    if (!b.categorie) redirect("/signaler");
    const supabase = await createClient();
    const { data } = await supabase
      .from("zones")
      .select("id, name, slug")
      .order("name");
    const zones = (data as Pick<Zone, "id" | "name" | "slug">[]) ?? [];

    return (
      <div className="flex flex-col">
        <Entete n={2} />
        <form action={soumettreDetails} className="flex flex-col gap-pad p-pad">
          {messageErreur && (
            <p className="font-texte text-xs text-signal">{messageErreur}</p>
          )}

          <label className="flex flex-col gap-gap">
            <span className="font-texte text-xs uppercase tracking-wide text-gris">
              Titre court
            </span>
            <input
              type="text"
              name="titre"
              required
              minLength={5}
              maxLength={120}
              defaultValue={b.titre ?? ""}
              className="border-2 border-encre bg-fond px-3 py-3 font-texte text-m text-encre outline-none"
            />
          </label>

          <label className="flex flex-col gap-gap">
            <span className="font-texte text-xs uppercase tracking-wide text-gris">
              Description
            </span>
            <textarea
              name="description"
              required
              minLength={20}
              rows={4}
              defaultValue={b.description ?? ""}
              className="border-2 border-encre bg-fond px-3 py-3 font-texte text-m text-encre outline-none"
            />
          </label>

          <label className="flex flex-col gap-gap">
            <span className="font-texte text-xs uppercase tracking-wide text-gris">
              Quartier
            </span>
            <select
              name="zone_slug"
              required
              defaultValue={b.zone_slug ?? ""}
              className="border-2 border-encre bg-fond px-3 py-3 font-texte text-m text-encre outline-none"
            >
              <option value="" disabled>
                Choisir un quartier
              </option>
              {zones.map((z) => (
                <option key={z.id} value={z.slug ?? ""}>
                  {z.name}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between pt-gap">
            <Link
              href="/signaler"
              className="font-texte text-xs uppercase tracking-wide text-gris underline"
            >
              Retour
            </Link>
            <button type="submit" className="as-action">
              Continuer
            </button>
          </div>
        </form>
      </div>
    );
  }

  // ---- Étape 3 : date/heure, identifiant conditionnel, plainte ----
  if (!b.titre || !b.zone_slug || !b.categorie) redirect("/signaler?etape=2");
  const idf = IDENTIFIANT[b.categorie];

  return (
    <div className="flex flex-col">
      <Entete n={3} />
      <form action={envoyer} className="flex flex-col gap-pad p-pad">
        {sp.err && (
          <p className="font-texte text-xs text-signal">
            L&apos;envoi a échoué. Vérifiez les champs et réessayez.
          </p>
        )}

        <label className="flex flex-col gap-gap">
          <span className="font-texte text-xs uppercase tracking-wide text-gris">
            Date et heure de l&apos;incident
          </span>
          <input
            type="datetime-local"
            name="happened_at"
            className="border-2 border-encre bg-fond px-3 py-3 font-texte text-m text-encre outline-none"
          />
        </label>

        {idf && (
          <label className="flex flex-col gap-gap">
            <span className="font-texte text-xs uppercase tracking-wide text-gris">
              {idf.label}
            </span>
            <input
              type="text"
              name={idf.name}
              placeholder={idf.placeholder}
              className="border-2 border-encre bg-fond px-3 py-3 font-texte text-m text-encre outline-none placeholder:text-gris"
            />
          </label>
        )}

        <label className="flex items-start gap-gap">
          <input
            type="checkbox"
            name="plainte"
            value="1"
            className="mt-1 h-4 w-4 border-2 border-encre"
          />
          <span className="font-texte text-s text-encre leading-relaxed">
            J&apos;ai déposé plainte
          </span>
        </label>

        <div className="flex items-center justify-between pt-gap">
          <Link
            href="/signaler?etape=2"
            className="font-texte text-xs uppercase tracking-wide text-gris underline"
          >
            Retour
          </Link>
          <button type="submit" className="as-action">
            Envoyer
          </button>
        </div>
      </form>
    </div>
  );
}
