// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// This is now the main site, served from the domain root; the original static site
// moved to /old/. The `blitzspirit` Vercel project has no build step - it publishes
// the repo as-is - so this builds to static files that get committed into the repo
// root. No adapter: nothing here runs on a server. The serverless functions live in
// the repo's api/ directory, alongside the ones the old site already used.
//
// `base` is '/' again, so href() and hrefsInHtml() in src/lib/url.ts are pass-throughs.
// They stay in place: they cost nothing and they are what makes a future move to
// another sub-path a config change rather than a sweep of every link.
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
      // they have nothing to index. /social is an internal working page - it is
      // noindex in its own head, and listing it here would contradict that.
      filter: (page) => !page.includes('/checkout/') && !page.includes('/social'),
    }),
  ],
  devToolbar: { enabled: false },
});
