/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      // Codespaces sert l'application derrière un proxy : le navigateur annonce
      // une origine (*.app.github.dev) que le serveur ne reconnaît pas, et Next
      // rejette alors les Server Actions. On déclare cette origine, uniquement
      // quand les variables de Codespaces sont présentes. Aucun effet en local
      // ni en production.
      allowedOrigins:
        process.env.CODESPACE_NAME &&
        process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
          ? [
              `${process.env.CODESPACE_NAME}-3000.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`,
            ]
          : [],
    },
  },
};

export default nextConfig;

// Rend les bindings et variables Cloudflare disponibles via getCloudflareContext()
// pendant `next dev`. Sans effet sur le build de production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
