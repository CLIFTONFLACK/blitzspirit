// @ts-check
import { defineConfig } from 'astro/config';

/**
 * The NEOMORPHISM edition.
 *
 * It is not a duplicated page set. It is THIS source, built a second time under a
 * different base, and merged into the main build at dist/neomorphism/ (see
 * tools/neo-merge.mjs). The site already knows how to live under a sub-path - it
 * was served from /new/ for months, which is why every internal link goes through
 * lib/url.ts and reads import.meta.env.BASE_URL - so changing `base` re-points the
 * whole site, links, assets, cart index and copy editor included, with no component
 * taking a variant prop and no route file duplicated.
 *
 * Two consequences worth knowing:
 *
 *  - /neomorphism/edit exists for free. edit.astro builds its page list and its
 *    preview frame from BASE_URL, so the neo editor drives the neo pages. It saves
 *    through the same /api/edit, into the same JSON, so a copy fix lands on BOTH
 *    editions. There is one copy of the copy.
 *
 *  - the skin is selected by the base as well (Base.astro: `base === '/neomorphism'`),
 *    so there is no build flag or environment variable to keep in step with this file.
 *
 * The sitemap integration is deliberately absent: the edition is the same words at a
 * second address and Base.astro marks it noindex, so submitting it would be asking
 * for a duplicate-content problem. The main build still ships the only sitemap.
 */
export default defineConfig({
  site: 'https://blitz.getbrian.xyz',
  base: '/neomorphism',
  trailingSlash: 'ignore',
  output: 'static',
  outDir: './dist-neo',
  build: {
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
});
