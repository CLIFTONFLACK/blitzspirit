// catalogue — typed access to src/data/catalogue.json and collections.json.
//
// These replace the Liquid globals the theme used to get for free: `product`,
// `collection`, `collection.products`, `product.options_with_values`,
// `product.selected_or_first_available_variant`.

import catalogueData from '~/data/catalogue.json';
import collectionsData from '~/data/collections.json';

export interface OptionValue {
  value: string;
  display?: string;
  hex?: string;
}

export interface ProductOption {
  name: string;
  values: OptionValue[];
}

export interface Variant {
  id: string;
  sku: string;
  options: Record<string, string>;
  price: number;
  available: boolean;
}

export interface Media {
  colour: string;
  src: string;
  width: number;
  height: number;
  alt: string;
}

export interface BundleComponent {
  handle: string;
  label: string;
  colour: string;
  size: string | null;
}

export interface Product {
  handle: string;
  title: string;
  kind: 'product' | 'bundle';
  code: string;
  type: string;
  tags: string[];
  price: number;
  compareAtPrice: number | null;
  issue: string;
  indexRef: string;
  limited: boolean;
  strapline: string;
  dossier: string[];
  /** Materials and care, e.g. "220gsm heavyweight cotton. Screen printed in
   *  Britain." Kept OUT of `dossier` so the home page's cards and featured block
   *  carry the story and the product page carries the spec — the cards were
   *  repeating four lines of wash instructions above the buy button. */
  spec?: string;
  fieldManual: { label: string; value: string }[];
  editorial: { heading: string; body: string }[];
  options: ProductOption[];
  variants: Variant[];
  media: Media[];
  components?: BundleComponent[];
}

export interface Collection {
  handle: string;
  title: string;
  description: string;
  rule: string;
  products: string[];
}

export const products = catalogueData.products as Product[];
export const colours = catalogueData.colours as Record<
  string,
  { display: string; hex: string; code: string }
>;
export const collections = collectionsData as Record<string, Collection>;

export function getProduct(handle: string): Product {
  const product = products.find((p) => p.handle === handle);
  if (!product) throw new Error(`unknown product handle: ${handle}`);
  return product;
}

export function getCollection(handle: string): Collection {
  const collection = collections[handle];
  if (!collection) throw new Error(`unknown collection handle: ${handle}`);
  return collection;
}

export function collectionProducts(handle: string): Product[] {
  return getCollection(handle).products.map(getProduct);
}

/** Liquid's product.selected_or_first_available_variant. */
export function firstAvailableVariant(product: Product): Variant {
  return product.variants.find((v) => v.available) ?? product.variants[0];
}

/** The photo for a colourway, falling back to the first image. */
export function mediaForColour(product: Product, colour: string | undefined): Media | undefined {
  if (!colour) return product.media[0];
  return product.media.find((m) => m.colour === colour) ?? product.media[0];
}

/** The variant matching a full set of option values, if one exists. */
export function findVariant(
  product: Product,
  selection: Record<string, string>
): Variant | undefined {
  return product.variants.find((v) =>
    Object.entries(selection).every(([name, value]) => v.options[name] === value)
  );
}

/** Options a product actually renders a picker for - single-value options auto-hide,
 *  matching the Liquid theme's behaviour on The Establishment (one colourway). */
export function pickerOptions(product: Product): { option: ProductOption; index: number }[] {
  return product.options
    .map((option, i) => ({ option, index: i + 1 }))
    .filter(({ option }) => option.values.length > 1);
}
