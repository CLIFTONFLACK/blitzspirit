// /cart-index.json — everything the drawer needs to render a line, and nothing else.
//
// The Liquid drawer was re-rendered server-side by Shopify's Section Rendering API
// after every cart mutation, so the browser never needed product data. There is no
// server here, so cart.js builds the rows itself — and rather than bundling the whole
// catalogue (all the dossier and editorial copy) into client JS, it fetches this
// stripped index once and caches it.
//
// Prices still come from here, never from the shopper: the checkout endpoint re-reads
// them from the catalogue on the server before charging anything.

import type { APIRoute } from 'astro';
import { getImage } from 'astro:assets';
import { products } from '~/lib/catalogue';
import { asset } from '~/lib/images';
import { href } from '~/lib/url';
import { mediaForColour } from '~/lib/catalogue';

export const prerender = true;

export const GET: APIRoute = async () => {
  const variants: Record<string, unknown> = {};

  for (const product of products) {
    for (const variant of product.variants) {
      const media = mediaForColour(product, variant.options.Colour);
      let thumb: string | null = null;
      if (media) {
        // 128px wide, the 2x size of the 64px plate the drawer draws.
        const generated = await getImage({ src: asset(media.src), width: 128 });
        thumb = generated.src;
      }

      variants[variant.id] = {
        title: product.title,
        url: href(`/products/${product.handle}`),
        price: variant.price,
        available: variant.available,
        // "COLOUR: BLACK / SIZE: M" — the drawer's .ci-meta line. Bundles have no
        // options, so this is empty for them, matching Liquid's
        // has_only_default_variant guard.
        options: Object.entries(variant.options).map(([name, value]) => ({ name, value })),
        thumb,
        thumbAlt: media?.alt ?? product.title,
      };
    }
  }

  return new Response(JSON.stringify({ variants }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
