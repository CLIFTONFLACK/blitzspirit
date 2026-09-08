// url — build internal links that respect the deployment base path.
//
// The site is served from a sub-path (`/new/`) inside the existing blitzspirit
// Vercel project, which still serves the old static site at the root. Astro rewrites
// asset URLs for `base` automatically but leaves hand-written hrefs alone, so every
// internal link goes through here.
//
// Serverless functions are the exception: they live at the ROOT project's /api/,
// outside this site's base, so those paths are deliberately not prefixed.

const BASE = import.meta.env.BASE_URL; // "/new/" in production, "/" in dev

/** Prefix an internal absolute path with the base. External URLs, anchors,
 *  mailto/tel links and already-prefixed paths pass through untouched. */
export function href(path: string): string {
  if (!path) return path;
  if (/^([a-z]+:)?\/\//i.test(path)) return path; // http(s):// or protocol-relative
  if (/^(mailto:|tel:|#)/i.test(path)) return path;
  if (!path.startsWith('/')) return path; // already relative
  if (BASE !== '/' && path.startsWith(BASE)) return path; // don't double-prefix

  return BASE.replace(/\/$/, '') + path;
}

/** The site root, for "back to base" style links. */
export const home = BASE;

/** Rewrite internal links inside a trusted HTML fragment so they carry the base.
 *
 *  Rich text set with `set:html` never passes through href(), so an <a href="/help">
 *  written in the page data would resolve against the domain root — which is the OLD
 *  site — and 404. tools/check-build.mjs enforces that this is applied everywhere. */
export function hrefsInHtml(html: string): string {
  if (!html || BASE === '/') return html;
  return html.replace(
    /(<a[^>]*\shref=")(\/[^"]*)(")/gi,
    (_match, before, path, after) => before + href(path) + after
  );
}
