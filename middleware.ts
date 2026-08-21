import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Protection des routes membres + rafraîchissement de session Supabase.
// La logique (et la liste des chemins gardés) vit dans updateSession.
export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // On exclut les assets statiques : le middleware ne tourne que sur des pages.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml)$).*)",
  ],
};
