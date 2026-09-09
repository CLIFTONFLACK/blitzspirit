// @ts-check
import { defineConfig } from 'astro/config';

/**
 * The SKEUOMORPHISM edition — "the Arms".
 *
 * Same arrangement as astro.neo.config.mjs: not a duplicated page set, but THIS
 * source built a second time under a different base, then merged into the main
 * build at dist/skeuomorphism/ (tools/skeuo-merge.mjs). The site was served from
 * /new/ for months, so every internal link already goes through lib/url.ts and
 * reads import.meta.env.BASE_URL - changing `base` re-points the whole edition,
 * links, assets, cart index and copy editor included, with no component taking a
 * variant prop and no route file duplicated.
 *
 * Consequences, same as the neo edition:
 *
 *  - /skeuomorphism/edit exists for free. edit.astro builds its page list and its
 *    preview frame from BASE_URL, so this editor drives the skeuomorphic pages. It
 *    saves through the same /api/edit into the same JSON, so a copy fix lands on
 *    EVERY edition. There is one copy of the copy.
 *
 *  - the skin is selected by the base (Base.astro: `base === '/skeuomorphism'`),
 *    so there is no build flag or environment variable to keep in step with this
 *    file.
 *
 * No sitemap integration, deliberately: the edition is the same words at a second
 * address and Base.astro marks it noindex. The main build ships the only sitemap.
 */
export default defineConfig({
  site: 'https://blitz.getbrian.xyz',
  base: '/skeuomorphism',
  trailingSlash: 'ignore',
  output: 'static',
  outDir: './dist-skeuo',
  build: {
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
});
