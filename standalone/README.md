# BlitzSpirit shop: source

The Astro source for the BlitzSpirit shop at https://blitz.getbrian.xyz. It builds to static files. Payment goes through Stripe Checkout and orders are sent to Printful by serverless functions in `../api/`.

The built output is not served from here. CI builds this directory and commits the result to the repo root. See the [root README](../README.md) for how a change goes live.

## Prerequisites

- Node 22. This is the version CI uses (`.github/workflows/build-shop.yml`). `package.json` does not declare an `engines` field.
- npm, which comes with Node.

`npm` cannot complete an install on a Google Drive volume (the install fails partway through a write, and junctions are refused, so `node_modules` cannot be moved elsewhere). Work from a clone on a local disk, for example `C:\dev\blitzspirit`.

## Setup

```
cd standalone
npm ci
```

CI runs `npm ci --include=dev`. `@astrojs/check` and `typescript` are dev dependencies and the build needs them, so use the same flag if your environment omits dev dependencies.

To run the price sync or the dev server against real services, copy `.env.example` to `.env` and fill in the values you need. See [Environment variables](#environment-variables). `standalone/.env` is read by `npm run printful:sync` directly (only the `PRINTFUL_API_TOKEN=` line). The serverless functions read their variables from the process environment, so on Vercel they come from the project settings.

## npm scripts

Run these from `standalone/`.

| Script | What it runs |
|---|---|
| `npm run dev` | `astro dev`. Starts the dev server, on Astro's default port (4321). |
| `npm run validate` | `node tools/validate-catalogue.mjs`. Checks the invariants the catalogue data must hold: every collection member is a real product, every product is in a collection, every referenced image exists on disk, and more (variant ids, SKUs and Printful ids are checked for duplicates). |
| `npm run check` | `astro check --minimumSeverity error`. Type-checks the Astro and TypeScript source. |
| `npm run build` | `astro build`, wrapped by the two hooks below. Writes `dist/`. |
| `npm run preview` | `astro preview`. Serves `dist/` locally. |
| `npm run printful:sync` | `node tools/printful-sync.mjs`. Copies price, availability and the Printful variant id onto every catalogue variant. Needs `PRINTFUL_API_TOKEN`. |
| `npm run astro` | The Astro CLI. |

`npm run build` runs three steps in order, and stops at the first that fails:

1. `prebuild`: `npm run validate`, then `npm run check`.
2. `astro build`: writes `dist/`.
3. `postbuild`: `node tools/check-build.mjs`, which reads `dist/` and fails if the built pages break any of its rules (see [The build check](#the-build-check)).

If any step fails the command exits non-zero. A `dist/` left over from a failed run has not passed the check, so do not publish it.

## Running the checks locally

CI runs these steps in this order. Run them from a clone on a local disk.

```
cd standalone
npm ci --include=dev
npm run build
```

Then, from the repo root:

```
node tools/check-edit-ids.mjs standalone/dist
node tools/test-order.mjs
node tools/test-content.mjs
node tools/test-printful.mjs
```

| Command | What it covers |
|---|---|
| `node tools/check-edit-ids.mjs standalone/dist` | Every `data-line-id` annotation in the built HTML resolves to a field the copy editor can save. A mistyped address would otherwise only fail when someone edited that line and the save returned 400. Pages under `/social/` are skipped; they use their own id scheme. |
| `node tools/test-order.mjs` | Checkout pricing in `api/_order.js` and `api/checkout.js`: re-pricing from the catalogue, rejecting malformed input, the shipping rate either side of the free-delivery threshold, and Stripe form encoding. Runs without Stripe or a network. |
| `node tools/test-content.mjs` | The editor's field addressing in `api/_content.js` against the real data files: resolves real addresses, refuses to invent a field, refuses paths outside the data directory, refuses prototype pollution. |
| `node tools/test-printful.mjs` | Turning a paid Stripe Checkout into a Printful order: webhook signature verification, order body, idempotency key, error classification, and the webhook handler end to end with stubbed network calls. Also covers how synced Printful data is applied to the catalogue. |

CI then runs `node tools/publish.mjs`, which copies `standalone/dist` into the repo root. Do not run it locally unless you mean to: it rewrites the generated files at the root of your working tree. CI does that step in a throwaway checkout, and on pull requests it does not commit the result.

## Environment variables

Names and purposes only. Never commit values. `.env.example` in this directory lists the shop and Printful variables with placeholders. Production values are set in the Vercel project. The functions in `../api/` read them from `process.env`.

Not every variable is in `.env.example`; the tables below are built from `.env.example` and from the `process.env` reads in `../api/` and `tools/`.

### Checkout and fulfilment

| Variable | Used by | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | `api/checkout.js`, `api/stripe-webhook.js` | Stripe API key. Required for checkout. `.env.example` notes to use a test key until the shop is verified end to end. |
| `PUBLIC_SITE_URL` | `api/checkout.js` | Where Stripe returns the shopper after checkout. Optional. Defaults to the request origin. |
| `STRIPE_WEBHOOK_SECRET` | `api/stripe-webhook.js` | Signing secret of the Stripe webhook endpoint that points at `/api/stripe-webhook`. Deliveries without a valid signature get 400. The endpoint must send `checkout.session.completed` and `checkout.session.async_payment_succeeded`. |
| `PRINTFUL_API_TOKEN` | `api/stripe-webhook.js`, `npm run printful:sync` | Printful private token. Creates orders and syncs catalogue data. The sync also reads it from `standalone/.env`. |
| `PRINTFUL_CONFIRM_ORDERS` | `api/stripe-webhook.js` | When exactly `true`, paid orders go straight into Printful production and bill the Printful account. Anything else leaves them as drafts to confirm by hand. |
| `ALLOW_TEST_ORDERS` | `api/stripe-webhook.js` | Stripe test-mode payments are ignored unless this is `true`, and even then they only become Printful drafts. |
| `ORDER_ALERT_EMAIL` | `api/stripe-webhook.js` | Address to email when a paid order cannot reach Printful and retrying will not help. Sent through Resend. Without it the failure is only logged. |
| `ORDER_ALERT_FROM` | `api/stripe-webhook.js` | Sender for those alerts. Optional. Defaults to Resend's onboarding sender, which only delivers to the Resend account owner's address. |
| `RESEND_API_KEY` | `api/newsletter.js`, `api/stripe-webhook.js` | Resend API key, for the newsletter form and the order alert email. |
| `RESEND_AUDIENCE_ID` | `api/newsletter.js` | Resend audience that newsletter signups are added to. Without both this and `RESEND_API_KEY`, `/api/newsletter` returns 501. |

### Copy editor (`/edit`)

| Variable | Used by | Purpose |
|---|---|---|
| `GITHUB_TOKEN` | `api/_github.js` | Fine-grained token with Contents read and write on this repo. The editor uses it to commit edits. If it is unset, the editor endpoint's status response reports `configured: false`. |
| `GITHUB_REPO` | `api/_github.js` | `owner/name` to commit to. Optional. Defaults to `CLIFTONFLACK/blitzspirit`. |
| `GITHUB_BRANCH` | `api/_github.js` | Branch to commit to. Optional. Defaults to `main`. |
| `EDIT_PASSWORD` | `api/edit.js` | If set, the editor requires this password. If unset, the editor is open to anyone, and only the endpoint's field validation limits what can be changed. |

### Social dossier and feedback

| Variable | Used by | Purpose |
|---|---|---|
| `SOCIAL_SUPABASE_URL` | `api/social.js` | URL of the Supabase project that stores `/social` copy overrides. `/api/social` returns 500 without it. |
| `SOCIAL_SUPABASE_KEY` | `api/social.js` | Key for that project. `/api/social` returns 500 without it. |
| `SUPABASE_ANON_KEY` | `api/feedback.js` | Key used to store feedback comments. `/api/feedback` returns 500 without it. |
| `SUPABASE_SERVICE_KEY` | `api/admin.js` | Service key for the feedback admin proxy. Returns 500 without it. |
| `ADMIN_PASSWORD` | `api/admin.js` | Password for the feedback admin proxy. Must be set in production. |

## Where content lives

All copy and data is committed JSON under `src/data/`. There is no CMS. A content change is a commit to these files, followed by the rebuild described in the root README.

| File | What it holds |
|---|---|
| `catalogue.json` | Products and their variants: titles, copy, media, prices, availability, Printful variant ids. |
| `collections.json` | Collections, as lists of product handles. |
| `menus.json` | Main and footer navigation. |
| `settings.json` | Shop settings, including the shipping and fulfilment values that `api/_order.js` and the check script read. |
| `strings.json` | UI strings, including the cart terms and the review sample tag and note. |
| `reviews.json` | Product reviews. Each entry has `product` (a catalogue handle), `name`, `text`, and optionally `sample: true`. |
| `pages/*.json` | One file per page: `404`, `about`, `collection`, `contact`, `help`, `icons`, `index`, `link-in-bio`, `product`, `social`, `story`. Each holds an ordered list of sections with settings and blocks. |

Product photos live in `src/assets/` so Astro can emit responsive sizes and WebP. The data refers to them as `/assets/...`, and `src/lib/images.ts` maps those paths onto `src/assets/`. `public/` holds files that need a stable URL: fonts, the stamp image and the hero backgrounds.

### What the inline editor can change

The editor at `/edit` (backed by `api/edit.js`) can rewrite existing text fields in these files only:

- `catalogue.json`
- `settings.json`
- `pages/index.json`, `pages/about.json`, `pages/story.json`, `pages/help.json`, `pages/contact.json`, `pages/icons.json`, `pages/link-in-bio.json`

It cannot change `collections.json`, `menus.json`, `strings.json`, `reviews.json`, or the pages `404`, `collection`, `product` and `social`. It can only edit a string that already exists, so it cannot add a field. It refuses structural fields (the source lists handle, sku, url and price among them), text over 4000 characters, and any text containing markup. It commits the change to the configured branch, and the Action then rebuilds the site.

`/social` has its own editor, backed by `api/social.js` and Supabase, not by commits.

### Prices, variant ids and availability

In `catalogue.json`, price, availability and the Printful variant id on each variant come from Printful. Do not edit them by hand. Run:

```
cd standalone
npm run printful:sync
```

This needs `PRINTFUL_API_TOKEN` in the environment or in `standalone/.env`. Each product names its Printful sync product in `printfulProductId`. Variants are matched on colour and size, and Printful's `Natural` colour maps to `Off-White` and `2XL` to `XXL`. If any variant on either side has no partner, the sync stops and writes nothing. Titles, copy and photography stay in `catalogue.json` and are yours to edit. Running the sync when nothing changed in Printful leaves the file byte-identical.

## Source layout

| Path | Contents |
|---|---|
| `src/layouts/Base.astro` | The page shell every page uses. |
| `src/components/` | Astro components: sections such as `Hero`, `CollectionGrid`, `FeaturedProduct`, `Faq`, `NewsletterForm`, plus small pieces such as `Icon`, `Price`, `Swatch`. |
| `src/pages/` | One file per route: `index`, `story`, `help`, `contact`, `icons`, `link-in-bio`, `social`, `terms`, `privacy`, `cart`, `edit`, `404`, `checkout/success`, `checkout/cancelled`, `collections/[handle]`, `products/[handle]`, and `cart-index.json.ts`. |
| `src/data/` | The JSON described above. |
| `src/lib/` | `catalogue.ts`, `images.ts`, `money.ts`, `pages.ts`, `url.ts`. |
| `src/scripts/` | Browser scripts: `cart.js`, `card-pick.js`, `carousel.js`, `product-form.js`, `modal.js`, `nav.js`, `newsletter.js`, `reveal.js`, `social.js`, `edit-ui.js`. |
| `src/styles/` | `tokens.css`, `theme.css`. |
| `tools/` | `validate-catalogue.mjs`, `printful-sync.mjs`, `check-build.mjs`. |

`astro.config.mjs` sets `site: 'https://blitz.getbrian.xyz'`, `output: 'static'` and no adapter. Stylesheets are never inlined (`inlineStylesheets: 'never'`). The sitemap leaves out `/checkout/` and `/edit` pages.

## The build check

`tools/check-build.mjs` runs after every build. A 200 status proves nothing on a static host, so it reads the built HTML and asserts on content that only a correctly rendered page has. A rule that is not checked here will eventually be broken by a template change, so add a check when you add a rule. The instruction in the script's header is that each assertion should be negative-tested: break the thing on purpose and watch the check fail.

Examples of what it holds the built site to:

- Every page has the masthead, cart drawer, footer, stylesheet, canonical link and font preload, and real text in `<main>`.
- No banned copy reaches customers (placeholder strings, unfinished or false claims, the old `BUY NOW` label), and no Liquid or Shopify residue.
- Every page has an `og:image` that exists in the build, and `cart-index.json` covers every variant at the catalogue price.
- The bag's delivery values match what `api/_order.js` charges by.

### Product cards never add to the bag directly

A product card shows no size, so a one-tap add could only add size S without being asked. The rule is that a card's `[ ADD TO CART ]` button opens a size-picker dialog inside the card, and the tap on a size in that dialog is the add. The check enforces this on the homepage and every collection page. Per card it requires:

- exactly one `data-card-pick` button, which carries neither `data-add-to-cart` nor `data-variant-id`, has `aria-haspopup="dialog"`, and has a `data-fallback-href` to the product page;
- a closed `<dialog>` inside the card, referenced by the button's `aria-controls`, with a label and a labelled close button;
- exactly one `data-add-to-cart` element in the card, hidden, without a fixed `data-variant-id`, and inside the dialog;
- no size pill preselected, and a `VIEW` link to the product.

If you change the card markup and this check fails, the check is telling you the card can now add a size the shopper did not choose.

### Sample reviews

Entries in `src/data/reviews.json` with `sample: true` are placeholder copy written by us, not customer reviews. They always render with a visible SAMPLE label (the tag text comes from `strings.json`, `reviews.sample_tag`) and with a note that the reviews were not written by customers (`reviews.sample_note`). The build check enforces this on the data and on every built product page:

- `sample`, when present, must be boolean `true`. Any other value, an unknown key such as a misspelt `sample`, or a name containing "sample" without the flag fails the build.
- A sample review must render with `data-sample`, the tag, and the note, and must not be hidden.
- A review without `sample: true` must not be labelled as a sample.
- A product with no reviews renders no reviews section.
- No star glyphs in the reviews section, and no review or rating data in the page's JSON-LD.

## Legacy helper

`sync-to-drive.ps1` mirrors `C:\dev\blitzspirit-standalone` onto a hard-coded Google Drive path with `robocopy /MIR`, skipping `node_modules`, `dist`, `.astro` and `.vercel`. It is from an earlier workflow where the build lived on local disk and was copied back to Drive. It is not part of how changes go live now, and `/MIR` deletes files in the destination that are not in the source.
