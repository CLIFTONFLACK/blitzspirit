// images — resolve a catalogue image path to an Astro asset.
//
// The catalogue and page data store paths as "/assets/products/tee-clerk-black.jpg",
// which is what the Liquid theme's asset_url produced and what reads sensibly in the
// JSON. The files themselves live in src/assets so Astro's image pipeline can emit
// the responsive widths and modern formats that Shopify's image_url used to generate
// on the fly. This maps one to the other, and fails loudly rather than rendering a
// broken <img>.

import type { ImageMetadata } from 'astro';

const assets = import.meta.glob<{ default: ImageMetadata }>(
  '/src/assets/**/*.{jpg,jpeg,png,webp,avif}',
  { eager: true }
);

/** "/assets/products/x.jpg" -> the imported ImageMetadata for src/assets/products/x.jpg */
export function asset(path: string): ImageMetadata {
  const key = path.replace(/^\/assets\//, '/src/assets/');
  const found = assets[key];
  if (!found) {
    throw new Error(
      `image not found: ${path} (looked for ${key}). ` +
        `Available: ${Object.keys(assets).join(', ')}`
    );
  }
  return found.default;
}

/** Non-throwing variant for optional images. */
export function assetOrNull(path: string | undefined | null): ImageMetadata | null {
  if (!path) return null;
  const key = path.replace(/^\/assets\//, '/src/assets/');
  return assets[key]?.default ?? null;
}
