# BlitzSpirit — Session Handover

> For a fresh Claude session (or human) picking this project up cold.
> Last updated: 2026-06-12. Everything described here is committed and live.

## 1. What this project is

**BlitzSpirit** (target domain blitzspirit.co.uk) is a British heritage apparel brand —
"**Urban Fashion With a Backbone**". T-shirts and caps evoking Blitz-era grit: ironic
and iconic, defiant but never costume-party. End goal is a **Shopify store**; the
current deliverable is a high-fidelity static website (design-complete, interactive)
deployed on Vercel.

- **Live site:** https://blitzspirit.vercel.app/  ← every push to `main` deploys here
- **GitHub (storage + deploy bridge):** https://github.com/CLIFTONFLACK/blitzspirit
- **Vercel project:** cliftonflacks-projects/blitzspirit (auto-deploys from the repo)

## 2. Folder map (local machine)

```
C:\Users\clift\Ai-Projects\SLC-BlitzSpirit\          ← session working dir (NOT a git repo)
├── blitzspirit\               ← GIT CLONE = SOURCE OF TRUTH. Edit here, push here.
│   ├── index.html             homepage
│   ├── collection.html        shop grid
│   ├── product.html           PDP (Boudica)
│   ├── story.html             brand manifesto
│   ├── icons.html             story behind each design ("files")
│   ├── help.html              delivery/returns/size guide/FAQ/contact
│   ├── 404.html               "Bombed out." (Vercel serves it automatically)
│   ├── styles.css             all tokens + components (single stylesheet)
│   ├── main.js                all interactivity (single file, no dependencies)
│   ├── assets\                product imagery, heritage photos, brutalist-wall.png
│   └── docs\                  DESIGN_SYSTEM.md, SHOPIFY_BUILD_SPEC.md,
│                              LEAD_GENERATION.md, HANDOVER.md (this file)
├── website_design\            ← SUPERSEDED phase-1 mockups. Do not edit. Kept for history.
├── design-system\blitzspirit\MASTER.md   ← design tokens (kept in sync with docs/DESIGN_SYSTEM.md)
├── tasks\todo.md              running task log + lessons
├── BlitzSpirit_2026\          ← source brand material (read-only inputs)
│   ├── BlitzSpirit_background docs\   brand brief txt + 2 PDFs (NOT yet text-mined)
│   ├── BlitzSpirit_final designs\     approved tee/cap photos + 2 product-card concepts
│   └── BlitzSpirit_imagery\           logos, lion, heritage photos, archive designs
└── .claude\launch.json        preview server config (see §5)
```

## 3. Accounts & credentials (IMPORTANT gotchas)

- The machine's default GitHub credential and the session's Vercel MCP connector are
  the **SLA Pharma account (`slapharma`)** — both get **403** on this project.
- The repo clone has `credential.username=CLIFTONFLACK` configured locally, so plain
  `git push origin main` works. Git identity is set repo-local
  (CLIFTONFLACK / CLIFTONFLACK@users.noreply.github.com).
- **Do not** try to manage the Vercel project via the Vercel MCP — verify deploys by
  fetching https://blitzspirit.vercel.app/ over HTTP (deploys land ~20–60s after push;
  poll the changed file until 200/new content).
- No `gh` CLI on this machine. Python 3.12 is at
  `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` (installed for tooling).
- PowerShell is 5.1: no `&&`, and **never put double-quotes inside here-string args
  to native exes** (it splits the argument — broke a git commit once).

## 4. Change workflow

1. Edit files in `blitzspirit\` (the clone).
2. Preview locally: the `.claude/launch.json` config `blitzspirit-design-preview`
   serves the clone at port 8765 (`python -m http.server 8765 --directory blitzspirit`).
   Browser caches styles.css/main.js aggressively — cache-bust when verifying.
3. Commit (no double quotes in message) and `git push origin main`.
4. Verify live by fetching the changed path on blitzspirit.vercel.app.

## 5. Design system (condensed — full version in docs/DESIGN_SYSTEM.md)

- **Colours:** ink-black `#0D0C0A` (bg) · panel `#161310` · bone `#E8E0D0` (text) ·
  bone-dim `#A89F8D` · blood-red `#C8281E` (CTAs/accents, rationed) · khaki-gold
  `#B89B5E` (hairlines/eyebrows) · navy `#2A3349`.
- **Type:** Oswald (display, caps) · IBM Plex Mono (eyebrows/nav/prices, letterspaced
  caps) · Barlow (body) · **Bevan** (logo only) · **Stardos Stencil** (painted hero
  headline only).
- **Logo:** `.logo-mark` component — lowercase `blitzspirit` in Bevan, blood-red,
  2px rounded-rect box (matches cap embroidery). It is TEXT, not an image. The old
  `assets/logo-box.png` is unused.
- **Tagline:** "Urban Fashion With a Backbone" (changed from "T-shirts with a
  backbone" on 2026-06-12 by user instruction).
- **Signature component:** product card — panel-black, khaki hairline + corner ticks,
  bone image well (`mix-blend-mode: multiply` to sink white-bg photos), mono strap,
  Oswald name, swatch dots, hover colourway-swap + red QUICK ADD bar.
- **Homepage hero:** real board-formed concrete wall photo (`assets/brutalist-wall.png`)
  with the tagline as stencil-spray text (`h1.painted`, rotated −2°). The photo is light —
  the dark theme darkens it via `filter: brightness(0.34)` on `.hero-bg.wall`; the light
  theme uses it as-is (also behind product card wells, newsletter band and signup modal).
- **Voice rules (2026-06-12):** no manifesto/political/lecture/philosophy/self-help copy,
  no persuading the visitor. Attitude with a grin: NOT HERE TO BE LIKED / COME ON THEN /
  WAKEY WAKEY register. The brand presents itself; the customer decides.
  The previous Blitz-London photo hero is still used on story/404 pages as backdrop.
- **Anti-patterns:** no Union-Jack wallpaper, no glassmorphism/neon/rounded-bubble UI,
  max one red CTA per viewport, no pure white text.
- **Voice:** clipped, defiant, dry. "30-day no-quibble returns — that would be
  nonsense." / "Tumble dryers are for quitters." / Empty-state: "Bombed out."

## 6. Interactivity (main.js — single IIFE, plain JS)

- Scroll reveals: `.reveal` / `.reveal-stagger` + IntersectionObserver (gated on
  `html.js`; honours reduced-motion; content visible without JS).
- Mobile drawer (≤920px) built dynamically from `.main-nav`.
- Quick-add / `[data-add-to-cart]` → toast + cart-count bump (front-end mock).
- PDP: thumbs swap gallery, colour swatches swap image (`colourMap`), size pills,
  qty stepper.
- **Lead-gen modal** "Join the Home Guard / 10% off — code BACKBONE10": opens after
  16s or exit-intent; any `[data-open-signup]` element opens it on demand.
  localStorage keys: `bs_modal_seen` (7-day suppress), `bs_signed_up` (permanent
  suppress). All `form[data-newsletter]` show an inline success + the code.
- Forms are mocks — no ESP wired yet (top open item).

## 7. State of play (git history highlights)

| Commit | What |
|---|---|
| f7640ef | Phase 1: 3-page design + assets + docs |
| cb99115 | Phase 2: story/icons/help/404, main.js, lead-gen modal, playbook |
| c289637 | Rebrand: Bevan boxed lowercase logo + "Urban Fashion With a Backbone" |
| 050a1a3 | Hero image visibility pass |
| 7b7c0a3 | Hero → brutalist wall with painted tagline (hero-wall.svg) |

## 8. Open items (priority order)

1. **Per-product PDPs** — Roundel, Skull & Brollies (×2), Roll Call, Caps all link to
   the Boudica PDP today. Clone product.html per product; colourMap + copy per design
   (straplines/stories already exist on collection + icons pages).
2. **Shopify build** — docs/SHOPIFY_BUILD_SPEC.md is the blueprint (Dawn + tokens,
   catalogue/variants/metafields, apps). A Shopify MCP connector is available in
   session; store not yet created.
3. **Wire lead-gen forms to an ESP** (Shopify Email/Klaviyo) keeping BACKBONE10 flow;
   then the rest of docs/LEAD_GENERATION.md (welcome flow, waitlists, ballot, referral).
4. **Mine the background PDFs** for About/story copy (27MB BlitzSpirit_docs.pdf +
   "Uncovering the True Blitz Spirit" essay) — needs a PDF text extractor
   (Python now available: `pip install pypdf`).
5. **Photography v2** — re-shoot/re-render garments on dark backgrounds to match the
   approved product cards; then image wells can go dark.
6. **Exact brand font** — Bevan/Stardos are close matches; if the user supplies the
   original font files, swap via @font-face in `.logo-mark` / `h1.painted`.
7. Domain: point blitzspirit.co.uk at the Vercel project when ready.

## 9. House rules observed so far

- User wants: plan first for non-trivial work, subagents to keep context clean,
  verification before "done", lessons captured in tasks/todo.md, simplicity first.
- For ANY UI/UX work: run the `ui-ux-pro-max` skill first (its generic output was
  overridden by the asset-derived system — keep doing that; the brand is locked).
- Always deploy live to blitzspirit.vercel.app after changes (user instruction).
- Don't edit `website_design\` — it's the frozen phase-1 archive.
