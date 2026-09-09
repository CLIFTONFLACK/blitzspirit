# How this deploys

Vercel publishes this repo **as-is**: no build step, no output directory. That is
not an oversight - it is the only arrangement that has worked here. Several rounds
of `buildCommand` / `outputDirectory` configuration failed for reasons the build
logs were not reachable to explain, while the identical commands passed in CI.

So:

| Path | What it is |
|---|---|
| repo root | the shop's built HTML, including `/edit/` and `/social` - **generated**, committed, listed in `.published` |
| `old/` | the original static site, moved verbatim; every path in it was relative |
| `standalone/` | the shop's Astro source - the thing you actually edit |
| `api/` | serverless functions, picked up by Vercel from here regardless |

`tools/publish.mjs` copies the built shop into the repo root and records what it
wrote in `.published`, so it can only ever remove its own output. It refuses to run
if the build is empty, if the build output collides with a source path, or if the
manifest names a source directory.

`.github/workflows/build-shop.yml` rebuilds and commits that output whenever
`standalone/` changes. It matters most for the copy editor: `/edit/` commits JSON to
`standalone/src/data/`, and only a rebuild turns JSON into HTML.

## The skinned editions

`/neomorphism`, `/skeuomorphism` and `/pub` are not duplicated page sets. Each one
is the same `standalone/` source built again under its own `base`
(`astro.neo.config.mjs`, `astro.skeuo.config.mjs`, `astro.pub.config.mjs`) and folded
into the main build by the matching `tools/*-merge.mjs`. `npm run build` runs all
four builds and `postbuild` runs the content checks over each, so CI and
`publish.mjs` need no special handling: the editions are just more directories in
`dist/`.

The arrangement works because the shop was served from `/new/` for months, so every
internal link already goes through `lib/url.ts` and reads `import.meta.env.BASE_URL`.
Changing `base` re-points a whole edition - links, assets, cart index and copy
editor - with no component taking a variant prop.

Three things follow from that, and they are the reason this is worth knowing:

- **The skin is chosen by the base.** `Base.astro` holds an `EDITIONS` table keyed on
  `BASE_URL`; a row supplies the `data-skin` attribute, the stylesheet in `public/`,
  the theme colour and the label. There is no build flag or environment variable to
  keep in step. Adding an edition is a row, a config, a merge script and a stylesheet.
- **Each edition gets its own copy editor for free**, at `/neomorphism/edit` and
  `/skeuomorphism/edit`. Every editor saves through the same `/api/edit` into the
  same JSON, so a copy fix lands on all three sites. There is one copy of the copy.
- **The editions are noindex.** They are the same words at a second address, and the
  edition configs ship no sitemap. Leaving them indexable would have them compete
  with the shop for its own terms.

### An edition can derive from another one's skin

`/pub` (THE SNUG) is the skeuomorphic skin in a different room. Its `EDITIONS` row
carries `skin: 'skeuo'` **and** `room: 'pub'`, so the page gets both attributes and
loads `skeuo.css` then `pub.css`. The first supplies the materials - oak, brass,
ceramic, hide, slate, and the one warm bulb every shadow in both files is built
from; the second supplies the room: a panelled wall, and the hardware that hangs the
shop's own sections on it as framed pictures, brass plates, a chalkboard and enamel
signs.

Nothing is duplicated between them. `pub.css` is a delta of about 900 lines against
`skeuo.css`'s 1,300, and a fix to the materials lands on both editions at once - as
one did while `/pub` was being built: the enamel index chip had red ink on a red
face in `skeuo.css`, and fixing it there fixed both.

The override works on cascade ORDER, not specificity: `html[data-room='pub'] .x`
scores the same as `html[data-skin='skeuo'] .x`, and `pub.css` is second in the
`<head>`, so it takes every tie. There is no specificity arms race in it.

### Watch the base-prefix guard in lib/url.ts

`href()` used to skip prefixing any path that merely *began with* the base string,
which meant `/pub.css` came out unprefixed under `base: '/pub'` - a stylesheet
404 and a page rendering as unstyled Times New Roman. It now only skips paths
genuinely inside the base (`=== base` or `base + '/'`). `tools/check-build.mjs`
caught it, which is exactly the failure that check was written for.

## vercel.json holds redirects and nothing else

It is strict JSON against a fixed schema, and **unknown top-level keys are
rejected** - a `"comment"` array in it fails the deployment with a configuration
error rather than anything that names the offending key. Notes about the setup go
here instead.

The redirects keep every URL that was ever live working: the shop's brief stay under
`/new/`, and the original site's own pages. The `/new/*` rule also fixes the
committed `/social` page, which still asks for `/new/assets/...` because it was
generated while the shop lived there.
