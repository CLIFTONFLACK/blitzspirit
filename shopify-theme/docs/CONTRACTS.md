# BlitzSpirit ISSUE_001 — Phase 0 → Phase 1 CONTRACTS

This is the single source of truth for the five parallel Phase-1 workstreams.
Everything here is **already implemented and frozen** (tokens, snippets, layout
hooks, JS data contracts). Build against it; do not fork it. If a contract is
genuinely wrong, fix it in ONE place and flag it in your report.

---

## 1. Design tokens (emitted by `snippets/css-variables.liquid`)

Settings-driven (`config/settings_schema.json` → Brand colours). Defaults are
the locked values from the static site's `newui.css`:

| Var | Default | Meaning |
|---|---|---|
| `--ink` | `#0A0A0A` | page background |
| `--panel` | `#111111` | raised panel |
| `--panel-2` | `#181818` | raised panel 2 |
| `--line` | `#2a2a2a` | 1px borders |
| `--line-bri` | `#3a3a3a` | brighter borders |
| `--bone` | `#ECECEC` | body text |
| `--bone-dim` | `#8A8A8A` | dim text / borders |
| `--bone-mute` | `#5A5A5A` | muted text |
| `--plate` | `#EAE8E2` | product plate well |
| `--signal` | `#FF0000` | THE accent — rationed |
| `--brand-red` | `#8B2020` | "THE" in product names |

> Note: index.html used `#C23030` for `--brand-red`; newui.css (`#8B2020`) is
> canonical per plan. Phase 2 reconciles if design disagrees.

Textures (image_picker settings with asset fallbacks — vars contain the full
`url(...)`): `--tex-hero`, `--tex-hero-bg`, `--tex-char`, `--tex-crack`.

Type + spacing: `--mono` (system monospace stack), `--display-font`
(ChunkFive stack, or the merchant's font_picker choice when
`settings.use_custom_font`), `--s1:8px --s2:16px --s3:24px --s4:32px
--s5:48px --s6:64px --s7:96px`.

Fixed design constants defined at the top of `assets/theme.css` (NOT
settings): `--cream:#E6DECB`, `--cream-soft:#D8CFB9`,
`--dossier-ink:#2a2722`, `--plate-ref:#9a958c`.

**Never hardcode a colour that exists as a token. Never hardcode `£` — money
filters only; currency-bearing user copy lives in `locales/en.default.json`.**

## 2. CSS architecture

1. `snippets/css-variables.liquid` — the ONLY inline CSS (`:root` +
   @font-face).
2. `assets/theme.css` — global design system (reset, .chunk/.tag/.rule,
   masthead, cart drawer, .directive, .cw/.dot, .sizes/.size-pill, .plate,
   .dossier, .field-manual, .coll-*, outro, hero/featured/promo/archive/
   equipment frameworks, breakpoints 1100/860/640/540/480, reduced-motion).
3. Per-section `{% stylesheet %}` — section-specific rules ONLY. **No Liquid
   inside `{% stylesheet %}`** — dynamic values go through custom properties
   set on wrappers (e.g. `style="--dot: #0a0a0a"`,
   `style="--promo-image: url('…')"`). See the ownership map comment at the
   bottom of theme.css for which class families your workstream owns.

## 3. Snippet interfaces (exact params — render exactly like this)

### price
```liquid
{% render 'price', product: product %}
{% render 'price', price: variant.price %}
```
Params: `product` (product object) OR `price` (raw cents). Emits
`.price > .price__current[data-price]`, compare-at strike + signal current
when on sale, and `// INC. VAT` (locale `products.inc_vat`) only when
`cart.taxes_included`.

### plate
```liquid
{% render 'plate', image: product.featured_image, ref_text: 'BS_001 // PDP', alt: product.title, priority: true %}
{% render 'plate', image: item.image, sizes: '(min-width: 860px) 50vw, 100vw' %}
```
Params: `image` (image object), `ref_text` (string, optional), `alt`
(string, optional — falls back to image.alt), `sizes` (string, optional),
`priority` (bool — true = eager + fetchpriority high, else lazy). Renders the
`.plate` well with srcset (400/600/800/1200), width/height attrs, the
`.plate-cnr` ref tag, and `data-plate` on the `<img>` (product-form.js swap
target). Blank image → placeholder_svg.

### swatch
```liquid
{% render 'swatch', value: value %}
```
Param: `value` (colour option value string). Map: Black→OXY_BLACK `#0a0a0a`,
Off-White→CHALK_WHITE `#e7e7e2`, White→CHALK_WHITE `#f5f5f2`,
Navy→SYSTEM_NAVY `#1f2a3d`, Stone→CHALK_STONE `#e8dfc0`; unknown → upcased
value / `#777`. Output: `<span class="dot" style="--dot:#…"></span><span
class="cw-name">LABEL</span>`. Inside `.coll-dots` the label is hidden by
theme.css (dot-only rendering for cards).

### option-pills
```liquid
{% for option in product.options_with_values %}
  {% render 'option-pills', option: option, option_index: option.position %}
{% endfor %}
```
Params: `option` (product option object), `option_index` (1-based position).
Colour/Color options render `.cw > .cw-opts > button.cw-opt` (with swatch);
everything else renders `.sizes > button.size-pill`. Every button is
`type="button"`, carries `aria-pressed`, `data-option-index`, `data-value`;
the value matching `option.selected_value` (first available variant) is
pressed by default. Wrapper carries `data-option-group data-option-index`.

### product-card
```liquid
{% render 'product-card', product: product, show_badge: true %}
```
Params: `product`, `show_badge` (bool). Brutalist `.coll-card`: plate image
(hover = second media image if present), `[ ISSUE ]` corner from
`product.metafields.custom.issue` (blank-guarded, default `ISSUE_001`),
LIMITED badge when `custom.limited` and show_badge, `.chunk` name (leading
"THE" gets `.the`), colour dots via swatch from
`product.options_by_name['Colour']` (falls back to `'Color'`), price snippet,
`[ VIEW PRODUCT ]` (locale `products.view`).

### icon
```liquid
{% render 'icon', name: 'instagram' %}
```
Param: `name` — `instagram | x | tiktok | facebook | bag | close | play |
arrow`. 16px inline stroke SVGs, `aria-hidden="true"`.

### pagination
```liquid
{% paginate collection.products by 12 %}
  …
  {% render 'pagination', paginate: paginate %}
{% endpaginate %}
```
Param: `paginate`. Mono style `[ PREV ] 01 // 02 [ NEXT ]`; zero-padded
numbers, disabled ends, aria labels from `general.pagination.*`.

### meta-tags / structured-data / css-variables
Rendered ONLY from layouts. Do not render from sections.

## 4. `<product-form>` markup contract (product-form.js)

Reference implementation: `sections/main-product.liquid`. Every add-to-bag
surface (main-product, featured-product, apparel-archive rows,
equipment-feature) MUST follow it:

```liquid
<product-form data-section-id="{{ section.id }}">
  {% form 'product', product %}
    <input type="hidden" name="id" value="{{ product.selected_or_first_available_variant.id }}">

    {% unless product.has_only_default_variant %}
      {% for option in product.options_with_values %}
        {% render 'option-pills', option: option, option_index: option.position %}
      {% endfor %}
    {% endunless %}

    <script type="application/json" data-variant-json>
      {{ product.variants | json }}
    </script>

    <button type="submit" name="add" class="directive snap">
      [ {{ 'products.add_to_cart' | t }} ]
    </button>
  {% endform %}
</product-form>
```

Hooks product-form.js relies on:
- `input[name="id"]` — updated to the resolved variant id.
- Option buttons: `[data-option-index][data-value][aria-pressed]`.
- `script[data-variant-json]` — `product.variants | json`.
- Add button: `.directive[name="add"]` (disabled + `products.sold_out`
  label when unavailable).
- Price element: `[data-price]` (from the price snippet).
- Plate image: `[data-plate]` (from the plate snippet) — swapped to the
  variant's featured image.
- On the PDP only: `?variant=` history.replaceState.
- No-JS: the form posts natively to `/cart/add` — never break that.

## 5. cart.js contract

- Listens for submits of any `form[action*="/cart/add"]` (i.e. every
  `{% form 'product' %}`), posts to `/cart/add.js` with
  `sections: 'cart-drawer,masthead'` (Section Rendering API; **the drawer's
  section id is the file name `cart-drawer`**), swaps returned HTML into
  `#CartDrawer` and the masthead, opens the drawer. Money strings stay
  server-formatted — never format money in JS.
- Drawer hooks: `#CartDrawer` (`.cart-drawer`), `[data-cart-overlay]`,
  `[data-cart-close]`, `[data-cart-toggle]`, `[data-cart-count]`,
  `[data-cart-items]`, `[data-cart-subtotal]`. Open state = `.open` on
  drawer + overlay, `aria-hidden` flipped.
- Free-shipping bar: rendered in Liquid inside cart-drawer from
  `settings.show_free_shipping_bar` / `settings.free_shipping_threshold`
  (GBP units — multiply by 100 for cents) with locales
  `cart.free_shipping_away` / `cart.free_shipping_ok`.

## 6. modal.js contract (signup modal)

- Section `signup-modal` is statically rendered from theme.liquid; wrapper
  `#SignupModal` carries `data-delay` (s), `data-suppress-days`,
  `data-exit-intent`, `data-discount-code`.
- localStorage keys (VERBATIM, shared with the old static site):
  `bs_signed_up` (='1' once subscribed → never show again) and
  `bs_modal_seen` (=Date.now() when dismissed → suppress for
  `data-suppress-days`).
- Defaults: 16s delay, exit-intent on, 7-day suppress, code `BACKBONE10`
  (`settings.discount_code`).

## 7. Settings ids (config/settings_schema.json)

Colours `color_ink|panel|panel_2|line|line_bri|bone|bone_dim|bone_mute|plate|signal|brand_red`;
textures `texture_hero|hero_bg|char|crack`; type `use_custom_font`,
`custom_display_font`; cart `show_free_shipping_bar`,
`free_shipping_threshold`, `cart_note`; marketing `discount_code`,
`enable_signup_modal`, `modal_delay`, `modal_suppress_days`,
`modal_exit_intent`; social `social_instagram|tiktok|x|facebook`; `favicon`.

## 8. Locales

All user-facing strings via `| t` from `locales/en.default.json` (keys:
`general.*`, `cart.*`, `products.*`, `newsletter.*`, `search.*`,
`gift_cards.*`, `accessibility.*`). Use proper UTF-8 em-dashes — the static
HTML's em-dashes are mojibake (an "a-circumflex + euro-sign" byte garble);
NEVER copy strings from it verbatim — re-type them. Add keys as needed;
never inline English in Liquid when a locale key is sensible.

## 9. Workstream ownership (sections + CSS families)

| Workstream | Sections (stubs to replace) | Owns CSS families |
|---|---|---|
| A commerce chrome | masthead, announcement-bar, outro, cart-drawer, main-cart + cart.js | `.announcement-*`, `.fsb-*` (free-shipping bar), `.main-cart-*` |
| B product system | main-product, product-video, product-editorial, cross-sell + product-form.js, dossier/field-manual/cart-drawer-line snippets, METAFIELDS.md | qty input, PDP extras beyond theme.css §7 |
| C homepage | hero, featured-product, promo-band, apparel-archive, equipment-feature, index.json content | homepage extras beyond theme.css §12 (incl. `--promo-image`) |
| D collection & discovery | collection-hero, collection-tabs, main-collection-grid, main-search, main-404, main-list-collections | `.main-search-*`, `.main-404-*`, list-collections grid |
| E content & marketing | page-hero, main-page, about-split, values-grid, icon-roster, faq, newsletter, signup-modal + modal.js, reveal.js, link-in-bio, main-blog, main-article, main-password, newsletter-form snippet | `.faq-*`, `.lib-*`, modal internals beyond `.cap-modal` shell |

Shared/frozen (edit only with a flagged reason): layouts, css-variables,
theme.css, price/plate/swatch/option-pills/product-card/icon/pagination/
meta-tags/structured-data snippets, settings schema/data, locales structure.

## 10. Ground rules recap

- Product photos are Shopify **product media**, never theme assets
  (theme-owned imagery only: textures, sticker, stamp, milkman).
- All metafield reads blank-guarded (`custom.strapline`, `custom.dossier`,
  `custom.issue`, `custom.index_ref`, `custom.limited`,
  `custom.field_manual`, `custom.editorial`, `custom.video`).
- Images: width/height/alt always; lazy unless above the fold.
- Buttons that toggle state use `aria-pressed`; overlays use `aria-hidden`.
- `border-radius:0` everywhere (reset enforces it); transitions instant or
  near-instant; respect `prefers-reduced-motion`.
- Run `shopify theme check` before handing back — zero errors.
