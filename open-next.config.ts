import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Configuration OpenNext pour Cloudflare Workers.
// Vide = valeurs par défaut. Le cache incrémental (R2/KV) pourra être
// ajouté ici plus tard si nécessaire, avec justification dans docs/decisions.md.
export default defineCloudflareConfig();
