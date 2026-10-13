import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import {defineConfig, type Plugin} from 'vite';
import {PUBLIC_ROUTES} from './src/data/siteRoutes';

// Genera robots.txt y sitemap.xml en dist/. El dominio sale de SITE_URL o PUBLIC_APP_URL,
// o del dominio de producción que Vercel expone durante el build.
function seoFiles(): Plugin {
  return {
    name: 'spotly-seo-files',
    apply: 'build',
    closeBundle() {
      const raw =
        process.env.SITE_URL ||
        process.env.PUBLIC_APP_URL ||
        (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
      const site = raw.replace(/\/+$/, '');
      const out = path.resolve(__dirname, 'dist');
      const robots = ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /owner', 'Disallow: /profile', 'Disallow: /my-bookings', 'Disallow: /onboarding'];
      if (site) {
        const urls = PUBLIC_ROUTES.map((r) => `  <url><loc>${site}${r.path}</loc></url>`).join('\n');
        fs.writeFileSync(
          path.join(out, 'sitemap.xml'),
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
        );
        robots.push('', `Sitemap: ${site}/sitemap.xml`);
      } else {
        console.warn('[seo] Define SITE_URL para generar sitemap.xml con el dominio público.');
      }
      fs.writeFileSync(path.join(out, 'robots.txt'), robots.join('\n') + '\n');
    },
  };
}

export default defineConfig(() => {
  const isGithubPages = process.env.GITHUB_PAGES === 'true';

  return {
    base: isGithubPages ? '/spotly/' : '/',
    envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
    plugins: [react(), tailwindcss(), seoFiles()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: true as const,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify — file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
