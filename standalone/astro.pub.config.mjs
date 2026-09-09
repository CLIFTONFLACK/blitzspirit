// @ts-check
import { defineConfig } from 'astro/config';

/**
 * THE SNUG — the pub edition, at /pub.
 *
 * Same arrangement as the other two editions (astro.neo.config.mjs,
 * astro.skeuo.config.mjs): this source built again under its own base and merged
 * into the main build by tools/pub-merge.mjs. See docs/DEPLOYMENT.md.
 *
 * What is different about this one: it does not replace a skin, it DERIVES from
 * one. Base.astro's EDITIONS row gives /pub `skin: 'skeuo'` plus `room: 'pub'`, so
 * the page carries both attributes and loads skeuo.css and then pub.css. The first
 * supplies the materials - oak, brass, ceramic, hide, slate; the second hangs the
 * whole shop on a wall. Nothing is duplicated between them, and a fix to the
 * materials lands on both editions at once.
 *
 * /pub/edit exists for free, like the others, and saves through the same /api/edit
 * into the same JSON.
 */
export default defineConfig({
  site: 'https://blitz.getbrian.xyz',
  base: '/pub',
  trailingSlash: 'ignore',
  output: 'static',
  outDir: './dist-pub',
  build: {
    inlineStylesheets: 'never',
  },
  devToolbar: { enabled: false },
});
