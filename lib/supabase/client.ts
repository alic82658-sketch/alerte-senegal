import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase côté navigateur (Client Components).
 * Les clés viennent uniquement des variables d'environnement publiques.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
