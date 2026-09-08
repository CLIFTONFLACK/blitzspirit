# Porting the Shopify theme to Astro — conventions

Source theme: `G:\My Drive\CLAUDE\Ai-projects-BRIAN\BlitzSpirit\blitzspirit\shopify-theme\`
Target workspace: `C:\dev\blitzspirit-standalone\` (local NTFS — npm cannot run on the
Drive volume; `sync-to-drive.ps1` mirrors source back to the Drive repo).

The goal is **visual and structural parity with the v27 theme**, not a redesign. Class
names, element order and CSS are load-bearing: JS and the shared stylesheet both key off
them. When in doubt, keep the Liquid markup and change only what Shopify made necessary.

## One section, one component

`sections/foo-bar.liquid` becomes `src/components/FooBar.astro`.

- The Liquid `{% stylesheet %}` block becomes the component's `<style>` block, verbatim.
  Use plain `<style>` (scoped) unless the CSS targets elements rendered by a *different*
  component or injected at runtime by a script — then use `<style is:global>` and say why
  in a comment.
- `{% schema %}` disappears. Its `default:` values are the fallbacks the page data relies
  on: any setting that is `""` in `src/data/pages/*.json` means "use the schema default",
  so carry those defaults into the component's `Astro.props` destructuring.
- Section `blocks` become an array prop.

## Where data comes from

| Liquid | Astro |
|---|---|
| `section.settings.x` | a prop, defaulted to the `{% schema %}` default |
| `section.blocks` | a `blocks` prop (already flattened in `src/data/pages/*.json`) |
| `settings.x` (theme settings) | `src/data/settings.json` |
| `'key' \| t` | `src/data/strings.json` |
| `product`, `collection` | `src/lib/catalogue.ts` (`getProduct`, `collectionProducts`, …) |
| `product.metafields.custom.*` | fields on the product: `issue`, `indexRef`, `limited`, `strapline`, `dossier`, `fieldManual`, `editorial` |
| `linklists` | `src/data/menus.json` |
| `x \| money` | `formatMoney(pence)` from `src/lib/money.ts` |
| `routes.cart_url` etc. | plain paths: `/cart`, `/collections/all`, `/products/<handle>` |

Prices are **integer pence** everywhere. Never format money in a template by hand.

## Images

Data stores `/assets/…` paths; the files live in `src/assets/` so Astro's pipeline can
emit responsive widths. Never hand-write an `<img>` for a catalogue image:

```astro
import Plate from '~/components/Plate.astro';
<Plate src={product.media[0].src} alt={product.media[0].alt} refText="BS_001 // PDP" priority />
```

For non-plate images use `astro:assets`' `<Image>` with `asset()` from `~/lib/images`.
`public/` holds only the font and the stamp (the favicon and OG image, which need a
stable URL).

## Components that already exist — use them, do not re-implement

`Plate`, `ProductCard`, `Price`, `Swatch`, `Dossier`, `FieldManual`, `OptionPills`,
`Icon`, `NewsletterForm`, `AnnouncementBar`, `Masthead`, `Outro`, `CartDrawer`,
`SignupModal`, `MetaTags`.

`NewsletterForm` takes `id`, `buttonLabel`, `successText`, `placeholder`, `tags`,
`classPrefix` (`"nws"` or `"promo"`) — the same interface the Liquid snippet had.

## What has no equivalent and must be dropped

Say so in a comment when you drop something.

- `{% form %}` of any kind. Product add-to-cart becomes a JS submit against local cart
  state (Phase 4); the customer form is already replaced by `NewsletterForm`.
- `{% paginate %}` — six products, one page.
- `shopify_attributes`, section rendering ids, `shop.*`, `customer`, `cart` at render
  time, `placeholder_svg_tag` (use `.plate__placeholder`), `payment_type_svg_tag`.
- Search results, blog/article, password page, gift cards.

## Accessibility and motion

Keep every `aria-*`, `role`, `tabindex`, `inert`, `hidden` and `.visually-hidden` exactly
as the Liquid had it. Keep every `@media (prefers-reduced-motion: reduce)` block.
`.reveal` / `.reveal-stagger` / `.dossier strong` are picked up by `reveal.js` — do not
rename them.

## Definition of done for a section

- `npm run build` passes.
- No `TODO`, no placeholder copy, no invented content — if the theme had copy, it is
  carried across; if a value was a schema default, that default is in the component.
- Class names match the Liquid output; a diff of rendered markup should differ only where
  Shopify-specific attributes have been removed.
