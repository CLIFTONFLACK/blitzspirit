# BlitzSpirit.co.uk — Shopify Build Specification

Companion to the high-fidelity mockups in this folder (`index.html`, `collection.html`,
`product.html`) and the design tokens in `design-system/blitzspirit/MASTER.md`.
Open `index.html` in a browser to see the design.

---

## 1. Positioning recap

- **Brand promise:** "Urban fashion with a backbone." British heritage, Blitz-era grit,
  ironic-and-iconic. Customers wear the brand to say what kind of Britain they want back.
- **Tone:** Defiant, clipped, dry humour. ("Politely menacing since the Blitz." /
  "30-day no-quibble returns — that would be nonsense.")
- **Aesthetic:** Near-black warm dark theme, bone/parchment, rationed blood-red,
  khaki-gold hairlines with corner ticks — directly derived from the two approved
  product cards (BOUDICA, ROUNDEL).

## 2. Theme strategy

**Recommendation: start with Dawn (free, OS 2.0) + custom CSS/sections.**
The design intentionally uses standard ecommerce layout patterns (sticky header,
4-col product grid, 2-col PDP, accordions) so it maps 1:1 onto Dawn's sections,
restyled with the token sheet. Avoids £200–£350 paid-theme cost and keeps
performance excellent (no heavy effects — grain overlay is a 1KB inline SVG).

Alternative if budget allows: **"Ride" or "Spotlight"** themes already lean dark/bold
and need less overriding. A fully custom theme is not justified at launch volume.

### Settings → Theme mapping
| Token | Dawn setting |
|---|---|
| Background `#0D0C0A` | Colors → Background 1 |
| Panels `#161310` | Colors → Background 2 |
| Text `#E8E0D0` | Colors → Text |
| CTA `#C8281E` | Colors → Solid button background |
| Accent `#B89B5E` | Colors → Lines/borders (custom CSS) |
| Headings: Oswald | Typography → Headings (Shopify font library has Oswald) |
| Body: Barlow | Typography → Body |
| Mono accents: IBM Plex Mono | custom CSS (`base.css` override) |
| Buttons | corner radius 0, uppercase, letterspaced (custom CSS) |

## 3. Site architecture

```
Home
├── Shop All            (/collections/all)
├── T-Shirts            (/collections/t-shirts)
├── Headwear            (/collections/headwear)
├── Accessories         (/collections/accessories — placeholder "Incoming")
├── The Story           (/pages/our-story)
├── Journal             (/blogs/dispatches — optional, post-launch)
└── Help: Delivery & Returns, Size Guide, Contact, FAQ (pages)
```

**Footer legal (UK):** Privacy, Terms, Refund policy, Shipping policy — generate via
Shopify policy templates; required for UK distance selling.

## 4. Catalogue structure

| Product | Handle | Variants | Price |
|---|---|---|---|
| Boudica | `boudica-tee` | Colour: Black, Off White × Size S–3XL | £28 |
| The Roundel | `roundel-tee` | Colour: Black, Navy, Off White × S–3XL | £28 |
| Skull & Brollies — Colour | `skull-brollies-colour` | Black × S–3XL | £28 |
| Skull & Brollies — Mono | `skull-brollies-mono` | Black, Off White × S–3XL | £28 |
| Tommy, Katie, Winston & Boudica | `tommy-katie-winston-boudica` | Black, White × S–3XL | £26 |
| The Cap | `blitzspirit-cap` | Black/Grey, Navy/Red, Cream/Navy | £22 |

**Product metafields** (so each PDP carries product-card storytelling without
hand-editing templates):
- `custom.strapline` (single line) — e.g. "WARRIOR. QUEEN. LEGEND."
- `custom.attitude` (rich text) — "The Attitude" panel copy from approved cards
- `custom.era` (single line) — "EST. AD 60 — STILL STANDING"

## 5. Page blueprints (match mockups)

### Homepage (`index.html`)
1. **Announcement bar** — red, mono: "FREE UK DELIVERY OVER £40 — NO NONSENSE. NO FUSS."
2. **Hero** — darkened Blitz-London image, eyebrow, "URBAN FASHION WITH A BACKBONE." (red on "BACKBONE"), 2 CTAs
3. **Marquee strip** — UNBOWED ■ UNBROKEN ■ UNFORGIVING ■ … (CSS-only, reduced-motion safe)
4. **Featured collection** — 4 product cards (see §6)
5. **Boudica editorial split** — image + "The Attitude" copy + "GO ON THEN." + CTA
6. **Heritage band (bone)** — lion stencil, dictionary-style definition, Churchill quote
7. **Collection tiles** — T-Shirts / Headwear / Accessories ("Incoming")
8. **Newsletter** — "WAKEY WAKEY." (Join the Home Guard, code BACKBONE10)
9. **Footer** — brand blurb, Shop/Help/Brand columns, payments line

### Collection (`collection.html`)
Collection hero (eyebrow + huge title + dry subline) → filter/sort toolbar (Shopify
faceted filters: Product type, Colour, Size) → 4-col card grid (2-col tablet, 1-col mobile).

### Product (`product.html`)
Breadcrumb → gallery (main + 5 thumbs incl. design-detail crop) → eyebrow / H1 / red
strapline / price / stock line → colour swatches → size pills (+ size guide link) →
qty + ADD TO BASKET (red) + Buy-it-now (ghost) → trust row → **The Attitude panel**
(khaki frame, mono, from metafield) → accordions (Fabric & fit / The print /
Delivery & returns) → "GOOD COMPANY — PAIR IT WITH" cross-sell row.

## 6. Product card spec (the signature component)

Derived from approved BOUDICA/ROUNDEL cards:
- Panel `#161310`, 1px khaki hairline `rgba(184,155,94,.35)`, 9px khaki **corner ticks** (top-left + bottom-right)
- Image well in bone `#F4EFE4`; current white-background photos blended with `mix-blend-mode: multiply`
- Mono strapline (10.5px, 0.2em tracking) → Oswald product name (22px caps) → mono price + colour swatch dots
- Hover: frame brightens, photo swaps to second colourway, red **QUICK ADD +** bar slides up from bottom
- "NEW" badge: red block, mono caps, top-left

## 7. Photography & asset notes

- Approved product cards shoot garments on **dark studio backgrounds** — re-shoot or
  re-render catalogue images that way for v2 so image wells can go dark like the cards.
  Until then the bone image-well treatment keeps white-background shots on-brand.
- Logo: use the red wordmark (`blitz logo.jpg` source) exported as transparent SVG/PNG;
  mockups tint `logo_2-removebg-preview.png` red via CSS as a stand-in.
- Favicons/social: roundel graphic is the natural avatar mark.
- The two PDFs in `BlitzSpirit_background docs` should be mined for About-page copy
  (needs a PDF text extractor — not yet installed on this machine).

## 8. Apps & operations (launch set, keep lean)

| Need | Pick |
|---|---|
| Print-on-demand fulfilment | Printful/Printify (images appear to be Printful-style mockups) |
| Email capture + flows | Shopify Email (free) → Klaviyo when list grows |
| Reviews | Judge.me free tier |
| UK VAT, GBP, Apple/Google/Shop Pay | Shopify Payments + PayPal |
| Analytics | Shopify analytics + GA4 |

## 9. Voice & microcopy bank (use everywhere)

- Buttons: SHOP THE COLLECTION · QUICK ADD + · ADD TO BASKET · GO ON THEN.
- Badges/sections: THE KIT · DISPATCHES · GOOD COMPANY · TAKE YOUR PICK
- Trust: "30-day no-quibble returns — that would be nonsense."
- Empty cart: "Nothing in here. That's not very Blitz of you."
- 404: "Bombed out. The page is gone — the spirit isn't."

## 10. Accessibility & performance commitments

- Bone-on-black 13:1; secondary text ≥ 4.6:1; red never used for small text
- 44px+ touch targets, visible khaki focus rings, labels on all inputs
- Marquee + transitions disabled under `prefers-reduced-motion`
- WebP product images with `srcset`, lazy-load below the fold; no JS frameworks needed

## 11. Next steps

1. Sign off this design direction (open `index.html` in a browser)
2. Create the Shopify store (Basic plan), connect `blitzspirit.co.uk`
3. Apply tokens to Dawn + build the 3 templates per this spec
4. Load the 6 products with metafields and approved imagery
5. Write About page from the background PDFs; set UK policies
6. Soft launch with the announcement bar driving the £40 free-delivery threshold
