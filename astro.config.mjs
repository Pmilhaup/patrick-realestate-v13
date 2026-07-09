import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  site: 'https://patrick.realestate',
  output: 'static',
  trailingSlash: 'never',
  build: { format: 'file' },   // /about.html output — Cloudflare serves extensionless
  integrations: [sitemap()],
  vite: { plugins: [tailwindcss()] },
});
