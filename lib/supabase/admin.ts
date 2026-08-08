import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client service-role, STRICTEMENT côté serveur. Contourne la RLS.
 * Réservé aux agrégats publics que l'anon ne peut pas lire (ex. nombre de
 * membres, `profiles` étant protégé par RLS). Ne jamais l'importer dans un
 * composant client ni exposer la clé. Renvoie null si la clé n'est pas
 * configurée, pour dégrader proprement.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
