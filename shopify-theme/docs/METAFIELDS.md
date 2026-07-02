# BlitzSpirit ISSUE_001 — Metafield & Metaobject Spec

Everything the theme's product system reads from custom data. Create these in
**Admin → Settings → Custom data** *before* seeding products (STORE-SETUP.md,
Phase 3). Every definition must have **Storefront access ON** ("Storefronts"
access / "Read" for the Storefront API) or the theme renders its fallbacks.

All reads in the theme are blank-guarded — a bare product (no metafields at
all) still renders a complete PDP: title/price/stock from Shopify data,
auto-generated field-manual rows, description as the dossier, editorial from
section blocks, video placeholder frame.

> Copy note: all values below were pulled from the static site
> (`product*.html`) and re-typed to fix its mojibake (`â€"` → `—`, `Â£` → `£`,
> `Â°` → `°`, `â˜…` → `★`). Never copy-paste from the HTML files directly.

---

## 1. Metaobject definitions (create these FIRST)

### 1.1 `spec_row` — Field manual row

| Property | Value |
|---|---|
| Name | Spec row |
| Type handle | `spec_row` |
| Access | Storefronts: **enabled** |

Fields:

| Field name | Key | Type | Required |
|---|---|---|---|
| Label | `label` | Single line text | yes |
| Value | `value` | Single line text | yes |

Rendered by `snippets/field-manual.liquid` as `LABEL → VALUE` rows, in list
order. Labels are upcased by the theme.

### 1.2 `editorial_block` — PDP editorial block

| Property | Value |
|---|---|
| Name | Editorial block |
| Type handle | `editorial_block` |
| Access | Storefronts: **enabled** |

Fields:

| Field name | Key | Type | Required |
|---|---|---|---|
| Heading | `heading` | Single line text | yes |
| Body | `body` | Multi-line text | yes |

Rendered by `sections/product-editorial.liquid` in a 2-col grid; index tags
(`[ TEXT_01 ]`, `[ TEXT_02 ]` …) are auto-numbered from list order.

---

## 2. Product metafield definitions (namespace `custom`)

| Name | Namespace & key | Type | Used for | Notes |
|---|---|---|---|---|
| Strapline | `custom.strapline` | Single line text | Dossier lead line: `// TITLE — strapline` | |
| Dossier | `custom.dossier` | Rich text | Dossier body paragraphs | **Bold** text takes the signal `.hit` treatment. Falls back to product description |
| Issue | `custom.issue` | Single line text | `[ ★ ISSUE_001 // … ]` ledger tag, product-card corner, auto field-manual ISSUE row | Theme default when blank: `ISSUE_001` |
| Index ref | `custom.index_ref` | Single line text | Ledger tag suffix, gallery ref tag, plate corner ref, auto ENTRY row | e.g. `#01`, `EQUIPMENT`, `LIMITED EDITION` |
| Limited | `custom.limited` | True/False | LIMITED EDITION badge on product cards | |
| Field manual | `custom.field_manual` | List of metaobject references → `spec_row` | The full TECHNICAL_SPEC table | When blank the theme auto-builds ENTRY / ISSUE / COLOURWAYS / CARE / DELIVERY |
| Editorial | `custom.editorial` | List of metaobject references → `editorial_block` | PDP editorial grid | When blank the section's own blocks render |
| Video | `custom.video` | File reference | `[ ASSET // VIDEO ]` band | Upload a **video** file; anything else is ignored (placeholder frame shows). Leave empty until footage exists |

Recommended pin order in admin: issue, index_ref, strapline, dossier,
field_manual, editorial, limited, video.

---

## 3. Catalogue seed data (6 products)

Variant conventions (per the live site + build plan):

- Options are merchant/feed-friendly: **Colour** (`Black`, `Off-White`,
  `Navy`, `Stone`) × **Size**. The brutalist display names live in the theme's
  swatch map: Black→OXY_BLACK, Off-White→CHALK_WHITE, Navy→SYSTEM_NAVY,
  Stone→CHALK_STONE.
- Size runs: **The Boudica S–XXL; all other tees S–XL; The Cap is one-size**
  (single option: Colour).
- Assign each colourway's flat-lay photo as the **variant image** for every
  size of that colour — the PDP image swap and colour pills key off it.
  Product photos are product media, never theme assets.
- Prices below include VAT (store is tax-inclusive per STORE-SETUP).

| # | Product | Price | Colours (option values) | Sizes | Static-site photos (upload as product media) |
|---|---|---|---|---|---|
| 1 | The Boudica | £28.00 | Off-White, Black | S, M, L, XL, XXL | `tee-boudica-offwhite.jpg`, `tee-boudica-black.jpg` |
| 2 | The Establishment | £28.00 | Black | S, M, L, XL | `tee-skull-black-colour.jpg` |
| 3 | The Roll Call | £26.00 | Off-White, Black | S, M, L, XL | `tee-tommy-white.jpg`, `tee-tommy-black.jpg` |
| 4 | The Frequency | £28.00 | Black, Off-White, Navy | S, M, L, XL | `tee-roundel-black.jpg`, `tee-roundel-offwhite.jpg`, `tee-roundel-navy.jpg` |
| 5 | The Clerk | £28.00 | Black, Off-White | S, M, L, XL | `tee-clerk-black.jpg`, `tee-clerk-white.jpg` |
| 6 | The Cap | £22.00 | Black, Navy, Stone | — (one size) | `cap-black.jpg`, `cap-navy.jpg`, `cap-cream.jpg` |

> The Clerk's white tee photographs as CHALK_WHITE; use option value
> `Off-White` (not `White`) so its swatch dot matches the other tees.

In the dossier values below, **bold** = mark as bold in the rich-text editor
(the theme renders `.dossier strong` with the `.hit` signal treatment).

---

### 3.1 The Boudica — `#01`

| Metafield | Value |
|---|---|
| `custom.strapline` | `mono print. She doesn't ask. She doesn't explain.` |
| `custom.issue` | `ISSUE_001` |
| `custom.index_ref` | `#01` |
| `custom.limited` | `false` |

`custom.dossier` (rich text, 3 paragraphs):

1. Britannia reimagined: trident in hand, Union Jack shield raised, looking at
   no one in particular because she doesn't need to. She's already won and
   hasn't decided to let you know yet.
2. Not a warrior queen for ceremony. Not a mascot. Not a tribute act.
   **The original. The standard. The one they built the statue to and still
   got wrong**.
3. **220gsm heavyweight cotton. Screen printed in Britain. Wash inside out at
   30°C. No tumble dry.**

`custom.field_manual` (spec_row list):

| label | value |
|---|---|
| ENTRY | #01 // THE BOUDICA |
| ISSUE | ISSUE_001 |
| PRINT | MONO // WATER-BASED SCREEN PRINT // UK |
| FABRIC | 100% RING-SPUN COTTON // 220GSM |
| FIT | UNISEX // REGULAR // CREW NECK |
| COLOURWAYS | OXY_BLACK / CHALK_WHITE |
| CARE | 30°C // INSIDE OUT // NO TUMBLE |
| DELIVERY | FREE UK OVER £40 // 2–5 WORKING DAYS |

`custom.editorial` (editorial_block list):

1. **The Queen.** — Boudica of the Iceni — who burned Roman London to the
   ground and made them rebuild it somewhere else. Not a myth. Not a metaphor.
   A real woman who looked at the largest empire on earth, decided it was
   insufficiently polite about land rights, and went to war. We put her on a
   tee because the statue on the Thames Embankment still has the wrong wheels
   on the chariot. Someone should correct the record. [PLACEHOLDER — REPLACE
   WITH FINAL COPY]
2. **The Craft.** — 220gsm ring-spun cotton. Water-based screen print, applied
   in Britain. Soft hand-feel that improves with washing. No cracking, no
   fading, no apologies. Wash inside out at 30°C — tumble dryers are for
   quitters. [PLACEHOLDER — REPLACE WITH FINAL COPY]

---

### 3.2 The Establishment — `ISSUE_000 // LIMITED EDITION`

| Metafield | Value |
|---|---|
| `custom.strapline` | `colour print. The old guard in full regalia.` |
| `custom.issue` | `ISSUE_000` |
| `custom.index_ref` | `LIMITED EDITION` |
| `custom.limited` | `true` |

`custom.dossier`:

1. The bowler hat draped in Union Jack. The umbrella crossed like a weapon.
   The skull wearing it all with a grin that says: **I was here before you and
   I'll be here after**.
2. Colour print on OXY_BLACK. This is Issue 000 — before the archive started,
   when it was just one image and a name that hadn't been earned yet.
3. **220gsm heavyweight cotton. Colour screen printed in Britain. Wash inside
   out at 30°C. No tumble dry.**

`custom.field_manual`:

| label | value |
|---|---|
| ENTRY | ISSUE_000 // THE ESTABLISHMENT |
| EDITION | LIMITED // PRE-ARCHIVE // NOT REPEATED |
| PRINT | COLOUR // WATER-BASED SCREEN PRINT // UK |
| FABRIC | 100% RING-SPUN COTTON // 220GSM |
| FIT | UNISEX // REGULAR // CREW NECK |
| COLOURWAYS | OXY_BLACK ONLY |
| CARE | 30°C // INSIDE OUT // NO TUMBLE |
| DELIVERY | FREE UK OVER £40 // 2–5 WORKING DAYS |

`custom.editorial`:

1. **Issue Zero.** — Before the archive. Before the numbering. When it was one
   print, one question, and a name that hadn't been earned yet. The
   Establishment was the first image — the skull in the Union Jack bowler, the
   crossed umbrellas below it. The whole brand is an argument with this image.
   This is where the argument started. [PLACEHOLDER — REPLACE WITH FINAL COPY]
2. **The Craft.** — 220gsm ring-spun cotton. Colour water-based screen print,
   applied in Britain. The extra complexity of a colour print is deliberate —
   Issue 000 earns its edition status in every layer. Soft hand-feel that
   improves with washing. No cracking, no fading, no apologies. Wash inside
   out at 30°C — tumble dryers are for quitters. [PLACEHOLDER — REPLACE WITH
   FINAL COPY]

---

### 3.3 The Roll Call — `#03`

| Metafield | Value |
|---|---|
| `custom.strapline` | `answer your name.` |
| `custom.issue` | `ISSUE_001` |
| `custom.index_ref` | `#03` |
| `custom.limited` | `false` |

`custom.dossier`:

1. **TOMMY** — every lad who shouldered a pack and went. **KATIE** — every
   woman who ran the switchboards, drove the ambulances and built the bombers.
   **WINSTON** — the growl on the wireless when it mattered most. **BOUDICA**
   — the one who started it all.
2. Set like a band line-up, because that's what they are: the greatest line-up
   these islands ever fielded. Soft-hand typographic print. If you know, you
   know — and if someone asks, you get to tell the whole story.
3. **220gsm heavyweight cotton. Printed in Britain. Wash inside out at 30°C.
   No tumble dry.**

`custom.field_manual`:

| label | value |
|---|---|
| ENTRY | #03 // THE ROLL CALL |
| ISSUE | ISSUE_001 |
| PRINT | SOFT-HAND TYPOGRAPHIC // UK |
| FABRIC | 100% RING-SPUN COTTON // 220GSM |
| FIT | UNISEX // REGULAR // CREW NECK |
| COLOURWAYS | CHALK_WHITE / OXY_BLACK |
| CARE | 30°C // INSIDE OUT // NO TUMBLE |
| DELIVERY | FREE UK OVER £40 // 2–5 WORKING DAYS |

`custom.editorial`:

1. **The Names.** — Tommy, Katie, Winston, Boudica. Set like a band line-up
   because that's what they are — the greatest line-up these islands ever
   fielded. Typographic print, no symbols required. The names say everything.
   If you know, you know. And if someone asks, you get to tell the whole
   story. [PLACEHOLDER — REPLACE WITH FINAL COPY]
2. **The Craft.** — 220gsm ring-spun cotton. Water-based screen print, applied
   in Britain. Soft hand-feel that improves with washing. No cracking, no
   fading, no apologies. Wash inside out at 30°C — tumble dryers are for
   quitters. [PLACEHOLDER — REPLACE WITH FINAL COPY]

---

### 3.4 The Frequency — `#04`

| Metafield | Value |
|---|---|
| `custom.strapline` | `a mod target with a second signal.` |
| `custom.issue` | `ISSUE_001` |
| `custom.index_ref` | `#04` |
| `custom.limited` | `false` |

`custom.dossier`:

1. From a distance: classic RAF roundel. Up close: every concentric ring is
   built entirely from the word **BLITZSPIRIT**, repeated as a drumbeat. No
   extra logo. No signature. Just the brand, in the brand.
2. Roundel started on the wings of Spitfires over Kent in 1940. A generation
   later the mods lifted it onto parkas and scooters. Same circle, same
   defiance — better tailoring.
3. **220gsm heavyweight cotton. Screen printed in Britain. Wash inside out at
   30°C. No tumble dry.**

`custom.field_manual` (live page orders FABRIC before PRINT — kept):

| label | value |
|---|---|
| ENTRY | #04 // THE FREQUENCY |
| ISSUE | ISSUE_001 |
| FABRIC | 100% RING-SPUN COTTON // 220GSM |
| PRINT | WATER-BASED SCREEN PRINT // UK |
| FIT | UNISEX // REGULAR // CREW NECK |
| COLOURWAYS | OXY_BLACK / CHALK_WHITE / SYSTEM_NAVY |
| CARE | 30°C // INSIDE OUT // NO TUMBLE |
| DELIVERY | FREE UK OVER £40 // 2–5 WORKING DAYS |

`custom.editorial`:

1. **The Signal.** — Started on Spitfire wings over Kent in 1940, lifted onto
   parkas and scooters a generation later. The mod roundel is the sharpest
   mark in British street culture — same circle, same defiance. Our version
   hides the whole story inside: every ring is built from the word
   BLITZSPIRIT, repeated like a drumbeat. [PLACEHOLDER — REPLACE WITH FINAL
   COPY]
2. **The Craft.** — 220gsm ring-spun cotton. Water-based screen print, applied
   in Britain. Soft hand-feel that improves with washing. No cracking, no
   fading, no apologies. Wash inside out at 30°C — tumble dryers are for
   quitters. [PLACEHOLDER — REPLACE WITH FINAL COPY]

---

### 3.5 The Clerk — `#05`

| Metafield | Value |
|---|---|
| `custom.strapline` | `mono print. Courtesy is not weakness.` |
| `custom.issue` | `ISSUE_001` |
| `custom.index_ref` | `#05` |
| `custom.limited` | `false` |

`custom.dossier`:

1. The bowler hat and the umbrella: the most polite uniform ever invented. The
   man who wore it queued properly, apologised when you stepped on **his**
   foot — and walked to work through rubble with the morning paper under his
   arm, daring the Luftwaffe to make him late.
2. Cross the brollies like cutlasses, put the skull under the brim, and you
   get the truth of him. The Jolly Roger of good manners — **politely menacing
   since the Blitz**.
3. **220gsm heavyweight cotton. Screen printed in Britain. Wash inside out at
   30°C. No tumble dry.**

`custom.field_manual`:

| label | value |
|---|---|
| ENTRY | #05 // THE CLERK |
| ISSUE | ISSUE_001 |
| PRINT | MONO // WATER-BASED SCREEN PRINT // UK |
| FABRIC | 100% RING-SPUN COTTON // 220GSM |
| FIT | UNISEX // REGULAR // CREW NECK |
| COLOURWAYS | OXY_BLACK / CHALK_WHITE |
| CARE | 30°C // INSIDE OUT // NO TUMBLE |
| DELIVERY | FREE UK OVER £40 // 2–5 WORKING DAYS |

`custom.editorial`:

1. **The City Gent.** — The bowler hat and the umbrella: the most polite
   uniform ever invented. He queued properly, apologised when you stepped on
   his foot — and walked to work through rubble with the morning paper under
   his arm, daring the Luftwaffe to make him late. Cross the brollies like
   cutlasses, put the skull under the brim. Politely menacing since the Blitz.
   [PLACEHOLDER — REPLACE WITH FINAL COPY]
2. **The Craft.** — 220gsm ring-spun cotton. Water-based screen print, applied
   in Britain. Soft hand-feel that improves with washing. No cracking, no
   fading, no apologies. Wash inside out at 30°C — tumble dryers are for
   quitters. [PLACEHOLDER — REPLACE WITH FINAL COPY]

---

### 3.6 The Cap — `EQUIPMENT`

Single option (Colour), one size. No Size option at all — the theme's variant
picker renders the colour pills only.

| Metafield | Value |
|---|---|
| `custom.strapline` | `stiff upper brim.` |
| `custom.issue` | `ISSUE_001` |
| `custom.index_ref` | `EQUIPMENT` |
| `custom.limited` | `false` |

`custom.dossier`:

1. Six-panel structured cap. BlitzSpirit embroidered on the front — **no
   typographic cowardice**. Adjustable strap at the rear. Built for all
   weather, all latitudes, all situations where you'd rather say nothing and
   let the cap do the talking.
2. Equipment division. Same principles as the tees — utility over decoration,
   quality over novelty.
3. **100% cotton twill. Embroidered logo. Adjustable strap. Spot clean.**

`custom.field_manual` (FIT row adapted to the one-size decision; the live page
still showed the retired S/M–L/XL split):

| label | value |
|---|---|
| CLASSIFICATION | EQUIPMENT // HEADWEAR |
| ISSUE | ISSUE_001 |
| CONSTRUCTION | 6-PANEL // STRUCTURED // STIFF BRIM |
| FABRIC | 100% COTTON TWILL |
| LOGO | EMBROIDERED // FRONT PANEL |
| FIT | ONE-SIZE-FITS-MOST // ADJUSTABLE STRAP |
| COLOURWAYS | OXY_BLACK / SYSTEM_NAVY / CHALK_STONE |
| CARE | SPOT CLEAN ONLY // DO NOT MACHINE WASH |
| DELIVERY | FREE UK OVER £40 // 2–5 WORKING DAYS |

`custom.editorial`:

1. **The Brim.** — Six-panel structured cap. Embroidered BlitzSpirit on the
   front — no typographic cowardice. Adjustable strap at the rear. Built for
   all weather, all latitudes, all situations where you'd rather say nothing
   and let the cap do the talking. Equipment division. Same principles as the
   tees — utility over decoration, quality over novelty. [PLACEHOLDER —
   REPLACE WITH FINAL COPY]
2. **The Craft.** — 100% cotton twill, cut in six panels and built to keep its
   shape. Embroidered — not printed — because the logo should outlast the
   weather. Spot clean only; a cap that goes in the washing machine comes out
   apologising. [PLACEHOLDER — REPLACE WITH FINAL COPY]

> Known copy bug on the live site: product-cap.html's "The Craft." block
> reuses the tee fabric copy (220gsm cotton) on a cap page. The value above
> replaces it with cap-appropriate copy in the same voice; swap it back if the
> brand owner disagrees.

---

## 4. QA checklist after seeding

- [ ] All 8 product definitions exist under namespace `custom`, storefront access ON.
- [ ] Both metaobject definitions published with Storefronts access.
- [ ] Every colourway has its photo set as the variant image (all sizes of the colour).
- [ ] PDP for a product with NO metafields still renders (auto field manual, description dossier, editorial fallback blocks, video placeholder).
- [ ] The Establishment shows `[ ★ ISSUE_000 // LIMITED EDITION ]` and the LIMITED badge on cards; its single colourway renders no colour picker (single-value options auto-hide).
- [ ] The Cap renders colour pills only (no size group), one-size variant per colour.
- [ ] Bold phrases in dossier rich text render in the dark `.hit` ink on the light dossier plate.
