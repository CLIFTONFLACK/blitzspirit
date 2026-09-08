# BlitzSpirit — standalone storefront

The ISSUE_001 shop, ported off Shopify. Astro static site, cart in the browser,
payment through Stripe Checkout. Visual parity with the v27 Shopify theme is the
spec — see `PORTING.md` for the conventions the port followed.

**Live at https://blitz.getbrian.xyz/new/** — the original static site still serves
the domain root, untouched.

## Where things are

| | |
|---|---|
| **Build workspace** | `C:\dev\blitzspirit-standalone` — local NTFS |
| **Committed source** | `standalone/` in `CLIFTONFLACK/blitzspirit` |
| **Published build** | `new/` in the same repo |
| **Serverless functions** | `api/checkout.js`, `api/newsletter.js`, `api/_order.js` at the repo root |
| **Checkout tests** | `tools/test-order.mjs` at the repo root |
| **Sync** | `powershell -File C:\dev\blitzspirit-standalone\sync-to-drive.ps1` |

`npm install` cannot complete on the Google Drive volume (`EBADF` mid-write) and the
volume refuses directory junctions, so `node_modules` cannot be redirected there
either. Source is authored locally and mirrored back; the Drive copy is what gets
committed. `sync-to-drive.ps1` is a `robocopy /MIR` excluding `node_modules`, `dist`,
`.astro` and `.vercel`.

## How this deploys

The `blitzspirit` Vercel project has **no build step** — it publishes the repo as-is,
with `api/*.js` as functions. That is how the original site has always shipped, and
changing it would put the live site at risk for no gain. So:

1. `npm run build` here, with `base: '/new'`, writes `dist/`
2. `dist/` is copied to `new/` in the repo and **committed**
3. pushing to `main` publishes it

Committed build output is unusual, and deliberate: it is the only way to add a built
site to a project that does not build. The trade is that a content change means a
rebuild and a commit.

Because the site lives under a sub-path, every internal link goes through
`href()` in `src/lib/url.ts`, and rich text set with `set:html` goes through
`hrefsInHtml()`. `tools/check-build.mjs` fails the build if any emitted `href` or
`src` falls outside `/new/` — that check is what stops a page reaching for the old
site's files and rendering unstyled.

## Commands

```
npm run dev        # dev server on :4321 (serves at /new/)
npm run build      # validate -> typecheck -> build -> content check
npm run validate   # catalogue invariants
npm run check      # astro check
```

From the repo root, `node tools/test-order.mjs` covers the checkout pricing,
validation and Stripe form encoding — plain node, no dependencies.

`build` will not produce output if any gate fails. Each gate has been
negative-tested: the invariant was broken on purpose and watched to fail. That is the
standard for adding a new one — a check nobody has seen go red is decoration.

## Data

Everything the storefront renders is committed JSON under `src/data/`. There is no CMS
and no API; editing the shop means editing these files, rebuilding and redeploying.

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
from a stripped index at `/new/cart-index.json`. Pressing CHECKOUT posts the variant
ids and quantities to `/api/checkout` — the root project's function, which sits
outside this site's base — and that function **re-prices the whole bag from the
catalogue** before creating a Stripe Checkout Session. A shopper who edits
localStorage changes what they are buying, never what they pay;
`tools/test-order.mjs` covers that directly.

The functions are dependency-free CommonJS matching the project's existing
`admin.js` and `feedback.js`, and Stripe is called over its REST API with `fetch`
rather than the `stripe` package — so the project still needs no `package.json` and
its build behaviour is unchanged.

- Prices are VAT-inclusive, so line items and shipping use `tax_behavior: 'inclusive'`
- UK delivery is £3.95, free at £40 and over, decided from the server-side subtotal
- `BACKBONE10` is a Stripe promotion code; `allow_promotion_codes` shows the field

**This build cannot sell without JavaScript.** The Liquid theme had a native form
posting to Shopify's cart as the no-JS path; there is no server cart to post to now.
Every page still renders and reads completely.

## Environment

Set these in the `clifton-ai-team/blitzspirit` Vercel project:

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
