# BlitzSpirit — standalone storefront

The ISSUE_001 shop, ported off Shopify. Astro static site, cart in the browser,
payment through Stripe Checkout. Visual parity with the v27 Shopify theme is the
spec — see `PORTING.md` for the conventions the port followed.

## Where things are

| | |
|---|---|
| **Build workspace** | `C:\dev\blitzspirit-standalone` — local NTFS |
| **Committed copy** | `blitzspirit/standalone/` in the Drive repo |
| **Sync** | `powershell -File C:\dev\blitzspirit-standalone\sync-to-drive.ps1` |

`npm install` cannot complete on the Google Drive volume (`EBADF` mid-write) and the
volume refuses directory junctions, so `node_modules` cannot be redirected there
either. Source is authored locally and mirrored back; the Drive copy is what gets
committed. `sync-to-drive.ps1` is a `robocopy /MIR` excluding `node_modules`, `dist`,
`.astro` and `.vercel`.

## Commands

```
npm run dev        # dev server on :4321
npm run build      # validate -> test -> typecheck -> build -> content check
npm run validate   # catalogue invariants
npm run test       # checkout pricing and validation
npm run check      # astro check
```

`build` will not produce output if any gate fails. Each gate has been negative-tested:
the invariant was broken on purpose and watched to fail. That is the standard for
adding a new one — a check nobody has seen go red is decoration.

## Data

Everything the storefront renders is committed JSON under `src/data/`. There is no CMS
and no API; editing the shop means editing these files and redeploying.

| File | What it holds |
|---|---|
| `catalogue.json` | 6 products + 3 bundles, 56 variants. Prices in **integer pence**. Copy, field-manual rows and editorial blocks, transcribed from the theme's `docs/METAFIELDS.md` |
| `collections.json` | `all`, `t-shirts`, `caps`, `deals` — the smart-collection rules resolved to explicit handle lists |
| `menus.json` | Main and footer navigation |
| `settings.json` | Shop identity, shipping rates, free-delivery threshold, discount code, modal timings |
| `strings.json` | UI copy, from the theme's `locales/en.default.json` |
| `pages/*.json` | Each Shopify template flattened from its id-keyed + order-array shape into plain ordered arrays |

Product photography lives in `src/assets/` so Astro's pipeline emits responsive
widths and WebP, the way Shopify's `image_url` filter used to. `src/lib/images.ts`
maps the `/assets/...` paths in the data onto those files, and throws rather than
rendering a broken `<img>`. `public/` holds only the font and the stamp, which needs a
stable URL as the favicon and OG image.

## Commerce

The cart is an array in `localStorage` (`bs_cart`), rendered by `src/scripts/cart.js`
from a stripped index at `/cart-index.json`. Pressing CHECKOUT posts the variant ids
and quantities to `/api/checkout`, a Vercel Function that **re-prices the whole bag
from the catalogue** before creating a Stripe Checkout Session. A shopper who edits
localStorage changes what they are buying, never what they pay — `tools/test-order.mjs`
covers that directly.

- Prices are VAT-inclusive, so line items and shipping use `tax_behavior: 'inclusive'`
- UK delivery is £3.95, free at £40 and over, decided from the server-side subtotal
- `BACKBONE10` is a Stripe promotion code; `allow_promotion_codes` shows the field

**This build cannot sell without JavaScript.** The Liquid theme had a native form
posting to Shopify's cart as the no-JS path; there is no server cart to post to now.
Every page still renders and reads completely.

## Environment

Set in the Vercel project (see `.env.example`):

| Variable | Needed for |
|---|---|
| `STRIPE_SECRET_KEY` | Checkout. Without it `/api/checkout` returns 500 and the drawer shows its error |
| `PUBLIC_SITE_URL` | Optional; defaults to the request origin, which is right on preview and production |
| `RESEND_API_KEY`, `RESEND_AUDIENCE_ID` | The newsletter. Without both, `/api/newsletter` returns 501 and the form shows its error rather than pretending to have stored the address |

## What the Shopify theme had that this does not

- Customer accounts, order history, gift cards, the password gate
- Blog and article templates — no blog content ever existed
- Server-side search; the search page was dropped rather than faked
- Inventory tracking. The store sold with "continue selling at zero" anyway, and the
  range is print-on-demand
- Order fulfilment workflow. Stripe gives payment and receipts; routing to the printer
  is still a manual step
