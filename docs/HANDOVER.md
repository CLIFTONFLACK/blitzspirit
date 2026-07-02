# BlitzSpirit — Session Handover

> For a fresh Claude session (or human) picking this project up cold.
> Last updated: **2026-07-02**. Everything described here is committed and pushed.
> Supersedes the 2026-06-12 handover (that described the pre-redesign static site only).

## 1. What this project is

**BlitzSpirit** (target domain blitzspirit.co.uk) is a British heritage apparel brand —
t-shirts and caps, Blitz-era grit, ironic and iconic. Voice: dry, defiant, grinning
("NOT HERE TO BE LIKED" / "Bombed out." / "Tumble dryers are for quitters").

Two deliverables exist today:

1. **Static site (live):** https://blitzspirit.vercel.app/ — the brutalist
   "ISSUE_001 / newui" design (ChunkFive + system mono, near-black, concrete textures,
   `[ TAG ]` UI, rationed signal red). Every push to `main` deploys it.
2. **Shopify theme (built, not yet deployed):** `shopify-theme/` — a bespoke,
   store-ready Online Store 2.0 theme, a faithful conversion of the live design.
   34 sections, 17 templates, 15 snippets, 4 vanilla JS modules, settings-driven
   tokens. `shopify theme check`: 71 files, **0 offenses**. Waiting on a NEW
   BlitzSpirit Shopify account (see §3 gotchas).

## 2. Folder map (local machine)

```
C:\Users\clift\Ai-Projects\SLC-BlitzSpirit\          ← session working dir (NOT a git repo)
├── blitzspirit\               ← GIT CLONE = SOURCE OF TRUTH. Edit here, push here.
│   ├── *.html                 static site (index/collection/product-*/about = brutalist;
│   │                          story/icons/help/404/heritage = old heritage design, copy canonical)
│   ├── newui.css + inline <style> blocks   brutalist CSS (theme.css consolidates these)
│   ├── styles.css, main.js    old heritage design system + interactivity (mock cart etc.)
│   ├── admin.html, api\       feedback/admin tooling (Supabase) — NOT part of the theme
│   ├── light\                 frozen pre-redesign variant (archive, not deployed)
│   ├── assets\                product photos (→ future Shopify product media) + newui\ textures/fonts
│   ├── .vercelignore          keeps shopify-theme\ off the static deploy
│   ├── shopify-theme\         ★ THE THEME (see §6) + docs\ (CONTRACTS, METAFIELDS,
│   │                          STORE-SETUP, MARKETING-STACK)
│   └── docs\                  DESIGN_SYSTEM.md, SHOPIFY_BUILD_SPEC.md (SUPERSEDED, Dawn-era),
│                              LEAD_GENERATION.md, HANDOVER.md (this file)
├── tasks\todo.md              running task log + lessons (append per session)
├── BlitzSpirit_2026\          source brand material (read-only; PDFs still unmined)
├── New UI\                    design exploration archive (not deployed)
└── website_design\            frozen phase-1 archive. Do not edit.
```

## 3. Accounts & credentials (IMPORTANT gotchas)

- **⚠️ Shopify:** the session's Shopify MCP connector points at the **SLA Pharma store**
  (`vheagr-8n.myshopify.com`, "My Store", team@slapharma.com). **Deploy NOTHING there.**
  A NEW BlitzSpirit Shopify account must be created (BlitzSpirit email, not slapharma).
  After it exists: connector `switch-shop`, and always verify with get-shop-info before
  any write. Theme QA: `shopify theme dev --store <new-store>.myshopify.com`.
- The machine's default GitHub credential and the Vercel MCP are also the **slapharma**
  account — both 403 on this project. The repo clone has `credential.username=CLIFTONFLACK`
  locally, so plain `git push origin main` works. Verify deploys over HTTP, not Vercel MCP.
- **Admin password default is `2026`** (api/admin.js fallback) — weak and documented in a
  public repo. Set `ADMIN_PASSWORD` in Vercel (see backlog SEC-1).
- No `gh` CLI. Python 3.12 at `%LOCALAPPDATA%\Programs\Python\Python312\python.exe`.
  Shopify CLI 4.x installed globally via npm (`shopify`, or `shopify.cmd` in PowerShell).
- PowerShell is 5.1: no `&&`; never put double-quotes inside here-string args to native
  exes; PowerShell redirects write UTF-16 — **write theme files with the Write tool only**.

## 4. Change workflow

**Static site:** edit in `blitzspirit\` → preview (`blitzspirit-design-preview` launch
config, port 8765; cache-bust) → commit (no double quotes) → `git push origin main` →
verify by fetching blitzspirit.vercel.app.

**Theme:** edit in `blitzspirit\shopify-theme\` → `shopify theme check` (target 0
offenses) → JSON-parse sweep → commit/push (Vercel ignores the folder). Once a store
exists: `shopify theme dev` for live preview, `shopify theme push --unpublished`.

## 5. Design system (brutalist ISSUE_001 — canonical)

- **Tokens** (all theme settings; defaults from newui.css): `--ink #0A0A0A`, `--panel #111`,
  `--panel-2 #181818`, `--line #2a2a2a`, `--line-bri #3a3a3a`, `--bone #ECECEC`,
  `--bone-dim #8A8A8A`, `--bone-mute #5A5A5A`, `--plate #EAE8E2`, `--signal #FF0000`,
  `--brand-red #8B2020` (⚠ live homepage used #C23030 — undecided, see DES-2),
  spacing `--s1 8px … --s7 96px`, four concrete-texture images.
- **Type:** ChunkFive (self-hosted woff2, display) + system monospace stack. The old
  Oswald/Barlow/Bevan stack is legacy (heritage pages only).
- **UI idiom:** `[ TAG ]` mono labels, `.chunk` display headlines, khaki nowhere —
  hairlines are neutral greys, red is rationed, plates are light wells for product photos.
- **Voice rules (locked):** no manifesto/political/lecture copy; no militant register
  (no soldier/war/weapon wording); grin register (NOT HERE TO BE LIKED / COME ON THEN /
  WAKEY WAKEY); cosy period texture OK (Home Guard, Field Manual, "Bombed out.").
- **Anti-patterns:** no Union-Jack wallpaper, no glassmorphism/neon/rounded bubbles,
  max one red CTA per viewport, no pure white text.

## 6. The Shopify theme (`shopify-theme\`)

- **Architecture:** bespoke OS 2.0 (not a Dawn fork). Settings-driven `:root` tokens
  (`snippets/css-variables.liquid`) → global `assets/theme.css` → per-section
  `{% stylesheet %}`. JSON templates compose everything in the editor; all live-site
  copy ships as schema defaults.
- **Commerce:** real Cart AJAX + Section Rendering (SYSTEM_LEDGER drawer, no-JS `/cart`
  fallback), `<product-form>` custom element (variant→image/price toggling is all
  server-rendered spans; zero money formatting in JS), colour/size aria-pressed pills,
  metafield-driven dossier/field-manual (blank-guarded), recommendations-API cross-sell.
- **Marketing built in:** announcement bar, Home Guard modal (BACKBONE10, 16s/exit-intent,
  7-day suppress), free-shipping progress bar (£40 setting), link-in-bio page template,
  newsletter via `{% form 'customer' %}` with tags, JSON-LD + OG meta.
- **Docs:** `docs/CONTRACTS.md` (tokens, snippet interfaces, product-form contract),
  `docs/METAFIELDS.md` (definitions + all 6 products' values, transcribed & de-mojibaked),
  `docs/STORE-SETUP.md` (store runbook), `docs/MARKETING-STACK.md` (IG/TikTok/AI stack,
  ~£4–8/mo, verified July 2026).
- **Verification status:** theme check 0 offenses · 21 JSON files parse · `theme package`
  builds · no product-photo refs in theme (they become product media) · currency only in
  merchant-editable copy defaults.

## 7. Store launch runbook (pointers)

1. Create the new Shopify account → work through `shopify-theme/docs/STORE-SETUP.md`
   top to bottom (settings, theme push, metafields, catalogue, menus, BACKBONE10,
   shipping £3.95/free-over-£40, tax-inclusive pricing, policies).
2. Then `shopify-theme/docs/MARKETING-STACK.md` §8 (channel apps day 1, TikTok Seller
   Center verification, Shopify Email automations, n8n/Postiz/Claude pipeline weeks 2–4).

## 8. FULL TO-DO — improvement backlog

Priorities: **P0** = blocks launch · **P1** = do before/at launch · **P2** = first month
post-launch · **P3** = later. IDs are stable — reference them in commits/sessions.

### Launch blockers (P0)
- [ ] **LNCH-1** Create new BlitzSpirit Shopify account; reconnect connector (`switch-shop`) + Shopify CLI.
- [ ] **LNCH-2** Execute STORE-SETUP.md end-to-end (theme push, metafields, 6 products + variant images, collections, menus, BACKBONE10, shipping/tax, policies).
- [ ] **LNCH-3** Store QA pass: editor add/reorder every section; functional pass (variant swap, add-to-bag drawer re-render, threshold bar states, modal suppress, newsletter duplicate email, tabs, 404, gift card); Lighthouse ≥ 90 on home + PDP; test order via Bogus gateway incl. discount.
- [ ] **LNCH-4** Point blitzspirit.co.uk at Shopify when ready; plan static-site retirement/redirects (301 old paths → store URLs).

### Design (DES)
- [ ] **DES-1 (P1)** Photography v2 — reshoot/re-render garments on dark backgrounds to match approved product cards; then plate wells can go dark (theme setting swap).
- [ ] **DES-2 (P1)** Decide `--brand-red`: #8B2020 (newui.css/theme default) vs #C23030 (live homepage inline). One-line settings change once decided.
- [ ] **DES-3 (P1)** Distinguish White vs Off-White display names (both currently CHALK_WHITE in the swatch map) before seeding variants — e.g. keep CHALK_WHITE for Off-White, add SIGNAL_WHITE for White.
- [ ] **DES-4 (P1)** Verify ChunkFive font file provenance/licence (OFL expected); add a LICENSE note beside the woff2.
- [ ] **DES-5 (P2)** Shoot "behind the print" PDP videos — the product-video section shows `[ VIDEO ASSET PENDING ]` until a file is set.
- [ ] **DES-6 (P2)** Proper favicon set + 1200×630 OG share image from the stamp/roundel mark; set in theme settings.
- [ ] **DES-7 (P2)** Redraw the wordmark as clean SVG (current logo assets are raster).
- [ ] **DES-8 (P3)** Optional: alternate archive-row image side (currently image-left every row, faithful to source; one CSS rule if design prefers alternation).
- [ ] **DES-9 (P3)** "CHALK" light-scheme preset in settings_data presets (tokens already settings-driven; light/ folder is the reference).

### UI / UX (UI)
- [ ] **UI-1 (P1)** Accessibility audit: axe pass, drawer/dialog focus-trap edges, contrast of bone-dim over textures, keyboard-only walkthrough. Fix findings.
- [ ] **UI-2 (P1)** Add-to-bag busy state ("ALLOCATING…" on the directive while the fetch is in flight) + aria-live announcement on success.
- [ ] **UI-3 (P2)** Search entry point in the masthead (setting-toggled icon) + Shopify predictive search API on the search page (brutalist dropdown).
- [ ] **UI-4 (P2)** Sticky mobile add-to-cart bar on PDP (price + ALLOCATE) — proven mobile conversion win, fits the tag idiom.
- [ ] **UI-5 (P2)** Size guide as an on-page modal/drawer from the PDP link instead of a jump to /pages/help#size-guide.
- [ ] **UI-6 (P2)** Mobile nav review at 360px once ACCOUNT/search links are enabled — the newui masthead has no hamburger by design; add a compact drawer only if the menu outgrows one row.
- [ ] **UI-7 (P3)** Recently-viewed products row (localStorage + product handles, no app).
- [ ] **UI-8 (P3)** 404 page: add a search field under the directives.

### Stability (STAB)
- [ ] **STAB-1 (P1)** GitHub Action CI: run `shopify theme check` + JSON-parse sweep on every push touching shopify-theme/ (free; catches regressions the moment they land).
- [ ] **STAB-2 (P1)** Browser matrix check: `<dialog>` (Safari ≥15.4 OK), `:has()` fallback in announcement-bar offset (degrades, verify visually), CSS columns in the about band, `inert` support.
- [ ] **STAB-3 (P2)** Image weight pass: convert the big JPEG textures (hero-wall-v3 especially) to WebP/AVIF with JPEG fallback; subset ChunkFive if the woff2 is large.
- [ ] **STAB-4 (P2)** Lighthouse CI (or scheduled manual) against the dev-store preview; budget: ≥90 perf, ≥95 a11y.
- [ ] **STAB-5 (P2)** Pin tooling: a small package.json in shopify-theme/ with @shopify/cli as devDependency so CLI versions are reproducible.
- [ ] **STAB-6 (P3)** Playwright smoke suite against `shopify theme dev` (add-to-cart, variant swap, modal, newsletter) once the store exists.

### Security (SEC)
- [ ] **SEC-1 (P0 for the static site, do today)** Set `ADMIN_PASSWORD` env var in Vercel — the fallback `2026` is public in the repo. Rotate the Supabase service key at the same time.
- [ ] **SEC-2 (P1)** Rate-limit / honeypot `POST /api/feedback` (open endpoint, abuse vector); confirm RLS on the Supabase `feedback` table only permits inserts via anon key.
- [ ] **SEC-3 (P1)** Enable 2FA on the new Shopify account from day one; use staff accounts with minimal permissions rather than sharing the owner login; keep app installs to the vetted list in MARKETING-STACK.md.
- [ ] **SEC-4 (P1)** UK GDPR/PECR consent: enable Shopify's cookie banner (Customer Privacy settings) and wire Meta/TikTok pixels through it (both channel apps respect Customer Privacy API); document in STORE-SETUP.
- [ ] **SEC-5 (P2)** Turn on Shopify's built-in hCaptcha for storefront forms (newsletter/contact spam).
- [ ] **SEC-6 (P2)** When the store goes live, retire or noindex admin.html + /api on the static site (or take the static site down entirely after redirects).
- [ ] **SEC-7 (P3)** Keep the zero-third-party-JS policy in the theme (document in CONTRACTS.md); any future script goes through review.

### Ecommerce optimisation (ECOM)
- [ ] **ECOM-1 (P1)** Wire analytics events: Shopify's GA4 integration + verify add_to_cart / begin_checkout firing through Meta CAPI + TikTok pixel after channel-app install.
- [ ] **ECOM-2 (P1)** Choose cart cross-sell products (cart template has the section, manual picks; classic move: The Cap under a tee-heavy bag).
- [ ] **ECOM-3 (P1)** Shopify Email flows in brand voice: welcome (re-deliver BACKBONE10), abandoned checkout ("You left the kettle on."), post-purchase review request feeding Judge.me.
- [ ] **ECOM-4 (P2)** Inventory urgency: optional "LOW STOCK // N LEFT" tag on PDP driven by variant inventory below a settings threshold (real data only, no fake scarcity — off-brand).
- [ ] **ECOM-5 (P2)** Back-in-stock notify (Stoq/Alert Me! free tier) — highest-intent capture; revisit self-built Supabase+n8n version if free limits bite.
- [ ] **ECOM-6 (P2)** SEO content pass: meta descriptions per product/collection (metafields), alt-text on all product media, submit sitemap in Search Console; start the DISPATCHES blog (icon backstories are ready-made articles).
- [ ] **ECOM-7 (P2)** "THE KIT" bundle (tee + cap) via Shopify's free native bundles app; feature with the equipment-feature section.
- [ ] **ECOM-8 (P2)** Judge.me app blocks placed on PDP (theme supports @app blocks in main-product) + review stars into product-card once reviews exist.
- [ ] **ECOM-9 (P3)** Waitlist/"Incoming" treatment for unreleased designs (old Accessories-tile idea): product-card badge + notify form variant.
- [ ] **ECOM-10 (P3)** Markets/international: theme is currency-safe (money filters everywhere); enable Shopify Markets for EU once UK is proven; translations via the locales structure.
- [ ] **ECOM-11 (P3)** Referral "Bring a recruit" (£5/£5) and the rest of docs/LEAD_GENERATION.md (ballot, quiz, UGC #GoOnThen) — post-launch, list-size dependent.

### Content (CONT)
- [ ] **CONT-1 (P2)** Mine the background PDFs (27MB BlitzSpirit_docs.pdf + Blitz Spirit essay) for About/story depth — `pip install pypdf`; more FILE_00x material.
- [ ] **CONT-2 (P2)** Brand-voice system prompt for the Claude caption pipeline, versioned in the repo (feeds the n8n → Postiz flow).

## 9. State of play (git highlights)

| Commit | What |
|---|---|
| cb99115 → 5b90200 | Phase 1–2 static site, rebrand, admin auth (see 2026-06-12 handover in git history) |
| a1fd008 | Brutalist ISSUE_001 redesign live (2026-06-19 HEAD before theme) |
| 47b1812 | **Shopify theme**: bespoke OS 2.0 theme at shopify-theme/ + docs + .vercelignore |

## 10. House rules observed

- Plan first for non-trivial work; subagents to keep context clean; verify before "done";
  lessons → tasks/todo.md; simplicity first.
- ui-ux-pro-max skill for UI work — its generic output is always overridden by the locked
  brand system; the brand wins.
- Always push + verify blitzspirit.vercel.app after static-site changes.
- Never touch website_design\ or light\ (frozen archives).
- Voice rules (§5) apply to ALL copy — storefront, emails, social, error messages.
