# BlitzSpirit — Design System MASTER (Global Source of Truth)

> Derived from approved brand assets (web product cards BOUDICA + ROUNDEL, final
> t-shirt designs, red wordmark logo) — these override any generic recommendations.
> Project: BlitzSpirit.co.uk — Shopify ecommerce. "T-shirts with a backbone."

## Brand essence
- **Voice:** Defiant, ironic, clipped. Short declarative sentences. ("She stands.
  Unbowed. Unbroken. Unforgiving." / "Go on then.")
- **Story:** Blitz spirit — courage under adversity, British cultural heritage,
  wartime grit recast for today. Ironic and iconic, never costume-party.
- **Taglines:** "T-shirts with a backbone." · "Born fighting." · "No nonsense, no
  political correctness, and no surrender."

## Colour tokens
| Token | Hex | Usage |
|---|---|---|
| `--ink-black` | `#0D0C0A` | Page background (primary). Near-black, warm |
| `--panel-black` | `#161310` | Cards/panels on black |
| `--bone` | `#E8E0D0` | Primary text on dark, light panels, garment off-white |
| `--bone-dim` | `#A89F8D` | Secondary text on dark (4.5:1+ on ink-black) |
| `--blood-red` | `#C8281E` | Brand red — logo, CTAs, rules, accents |
| `--blood-red-hover` | `#A91F16` | CTA hover |
| `--khaki-gold` | `#B89B5E` | Hairline borders, eyebrow labels, frames |
| `--navy` | `#2A3349` | Roundel navy — secondary garment colour, optional accents |
| Garment swatches | `#111111` black / `#2A3349` navy / `#F4EFE4` off-white | colour pickers |

Rules: dark theme is the default and only theme. Red is rationed — CTAs, the
wordmark, and one accent per viewport. Khaki-gold for hairline frames (1px),
matching the product-card border style. No pure white (#FFF) text; use bone.

## Typography
| Role | Font | Style |
|---|---|---|
| Display / headlines | **Oswald** (Google) 500–700 | UPPERCASE, tracking 0.02–0.06em, distressed-texture optional on hero |
| Eyebrow / captions / nav | **IBM Plex Mono** 400–600 | UPPERCASE, letterspaced 0.18–0.25em — matches "DESIGN DETAIL" card captions |
| Body | **Barlow** 400/500 | Sentence case, 1.6 line-height, 16–18px |
| Logo | Image asset only (red boxed `blitzspirit` wordmark) | never re-set in type |

CSS import:
`@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=Barlow:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap');`

## Texture & effects
- Subtle film-grain/noise overlay (SVG turbulence, opacity ≤ 0.06) on dark sections.
- Distressed/stamped texture reserved for display headlines and imagery, not UI chrome.
- Hairline khaki frames with corner ticks (product-card motif): `border: 1px solid rgba(184,155,94,.35)`.
- Transitions 150–250ms, colour/opacity only. No parallax, no liquid-glass, no glow.
- Honour `prefers-reduced-motion`.

## Components
- **Buttons (primary):** blood-red fill, bone text, square corners, mono uppercase
  letterspaced label, 48px min height. Hover: darker red. Never rounded.
- **Buttons (secondary):** transparent, 1px bone/khaki border, bone text.
- **Product card:** panel-black tile, khaki hairline frame, garment photo,
  mono eyebrow (e.g. "WARRIOR. QUEEN. LEGEND."), Oswald name, price in mono,
  colour swatch dots, red "quick add". Hover: frame brightens + photo swaps to 2nd colourway.
- **Announcement bar:** bone text on blood-red, mono, letterspaced.
- **Section headers:** mono eyebrow + Oswald headline + short khaki rule.

## Anti-patterns (avoid)
- Union Jack wallpapering / souvenir-shop kitsch — the assets carry the flag; UI stays restrained.
- Glassmorphism, neon, gradients, rounded-bubble UI, emoji icons.
- More than one red CTA per viewport; red body text.
- Bright white backgrounds anywhere except product photography already shot on white.

## Accessibility
- Bone on ink-black ≈ 13:1; bone-dim on ink-black ≥ 4.6:1 — keep.
- Red used at large sizes/CTAs only (red on black ≈ 3.5:1 — never small body text).
- Focus rings: 2px khaki-gold outline, 2px offset.
- 44px min touch targets; visible labels on all inputs.
