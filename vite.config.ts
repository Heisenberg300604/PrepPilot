import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

/** Pages search engines may index. Everything else is private (and served with X-Robots-Tag: noindex, see vercel.json). */
const PUBLIC_PATHS = ['/'];

/**
 * Build-time SEO: absolute-URL tags (canonical, og:url, og:image), JSON-LD, robots.txt and sitemap.xml.
 * They need the public origin, so they come from VITE_SITE_URL (or Vercel's production domain). Without one, the
 * absolute tags and the sitemap are left out rather than guessed.
 */
function seo(siteUrl: string | undefined): Plugin {
  const site = siteUrl?.trim().replace(/\/+$/, '') || undefined;
  return {
    name: 'preppilot-seo',
    transformIndexHtml(html) {
      const jsonLd = {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'PrepPilot',
        description: 'A study workspace for exam aspirants and self-learners: organise your syllabus, YouTube lectures, notes and daily plan, and track progress.',
        applicationCategory: 'EducationalApplication',
        operatingSystem: 'Any (web browser)',
        ...(site && { url: `${site}/`, image: `${site}/og-image.png` }),
      };
      const tags = [
        ...(site
          ? [
              `<link rel="canonical" href="${site}/" />`,
              `<meta property="og:url" content="${site}/" />`,
              `<meta property="og:image" content="${site}/og-image.png" />`,
              `<meta name="twitter:image" content="${site}/og-image.png" />`,
            ]
          : []),
        `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
      ];
      return html.replace(/<!-- seo:site .*?-->/, tags.join('\n    '));
    },
    generateBundle() {
      const robots = ['User-agent: *', 'Allow: /', ...(site ? ['', `Sitemap: ${site}/sitemap.xml`] : []), ''].join('\n');
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      if (site) {
        const urls = PUBLIC_PATHS.map((p) => `  <url><loc>${site}${p}</loc><changefreq>monthly</changefreq></url>`).join('\n');
        this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n` });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = env.VITE_SITE_URL || (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : undefined);
  return {
    plugins: [react(), seo(siteUrl)],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: {
      port: 5173,
      // In development the API runs on API_PORT; same-origin proxying avoids CORS entirely.
      proxy: { '/api': { target: `http://localhost:${env.API_PORT || 4000}`, changeOrigin: true } },
    },
    build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  };
});
