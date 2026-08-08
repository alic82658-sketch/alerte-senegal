/** @type {import('next').NextConfig} */
const nextConfig = {};

export default nextConfig;

// Rend les bindings et variables Cloudflare disponibles via getCloudflareContext()
// pendant `next dev`. Sans effet sur le build de production.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
