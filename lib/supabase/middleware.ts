import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Rafraîchissement de session + protection des routes (B1).
 *
 * Matrice appliquée :
 *   - non authentifié            → routes membre/attente/onboarding renvoient à /entrer
 *   - authentifié SANS membership → /attente (pas encore admis dans une vague ;
 *                                    l'admission automatique sera branchée en B3)
 *   - authentifié + membership, onboarding non terminé → /onboarding (route B2)
 *   - authentifié + membership + onboarding terminé     → accès /accueil, /signaler
 *
 * IMPORTANT : « authentifié » ne vaut jamais « membre admis ». Sans ligne dans
 * memberships, l'utilisateur ne franchit pas /attente.
 *
 * Les chemins publics et indexables (/, /verifier, /alerte, /moderation, assets)
 * ne déclenchent AUCUN appel d'authentification : on préserve la performance et
 * le rendu serveur (Lighthouse, fiches SSR).
 */
export async function updateSession(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const isEntry = path === "/entrer" || path.startsWith("/entrer/");
  const isMembre = path === "/accueil" || path === "/signaler";
  const isAttente = path === "/attente";
  const isOnboarding = path === "/onboarding" || path.startsWith("/onboarding/");

  if (!(isEntry || isMembre || isAttente || isOnboarding)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirection en conservant les cookies éventuellement rafraîchis.
  const vers = (destination: string) => {
    const url = request.nextUrl.clone();
    url.pathname = destination;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c.name, c.value, c));
    return res;
  };

  if (!user) {
    return isEntry ? response : vers("/entrer");
  }

  // L'accès réel dépend de l'admission (membership) puis de l'onboarding.
  // Les deux lectures se font sous la RLS de l'utilisateur (ses propres lignes).
  const [{ data: membership }, { data: profil }] = await Promise.all([
    supabase
      .from("memberships")
      .select("profile_id")
      .eq("profile_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("onboarding_done")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  if (!membership) {
    return isAttente ? response : vers("/attente");
  }

  if (!profil?.onboarding_done) {
    return isOnboarding ? response : vers("/onboarding");
  }

  return isMembre ? response : vers("/accueil");
}
