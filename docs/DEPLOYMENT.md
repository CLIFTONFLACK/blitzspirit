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

## vercel.json holds redirects and nothing else

It is strict JSON against a fixed schema, and **unknown top-level keys are
rejected** - a `"comment"` array in it fails the deployment with a configuration
error rather than anything that names the offending key. Notes about the setup go
here instead.

The redirects keep every URL that was ever live working: the shop's brief stay under
`/new/`, and the original site's own pages. The `/new/*` rule also fixes the
committed `/social` page, which still asks for `/new/assets/...` because it was
generated while the shop lived there.
