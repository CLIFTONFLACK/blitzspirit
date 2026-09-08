// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// The shop is the site at the domain root; the original static site moved to /old/. That project has no build
// step - it publishes the repo as-is - so this builds to static files that get
// committed into the repo's `new/` directory. No adapter: nothing here runs on a
// server. The two serverless functions live in the repo root's api/ directory,
// alongside the ones the old site already uses.
export default defineConfig({
  site: 'https://blitz.getbrian.xyz',
  trailingSlash: 'ignore',
  output: 'static',
  build: {
    // theme.css and the per-section CSS are ported as-is; keep one predictable
    // stylesheet rather than Astro's default per-page splitting.
    inlineStylesheets: 'never',
  },
  integrations: [
    sitemap({
      // The checkout outcome pages are dead ends a shopper reaches from Stripe;
      // they have nothing to index.
      filter: (page) => !page.includes('/checkout/') && !page.includes('/edit'),
    }),
  ],
  devToolbar: { enabled: false },
});
