# BlitzSpirit Store — Seed Status (2026-07-02)

Store: **blitzspirit-2.myshopify.com** (permanent domain `ncrmim-xu.myshopify.com`),
Basic plan, GBP, UK, owner cloofhouse@gmail.com. Currently **password-protected
("opening soon")** — nothing is public yet.

> ⚠️ This is the correct BlitzSpirit store. The Shopify connector in some sessions
> defaults to the SLA Pharma store (`vheagr-8n`) — always verify with get-shop-info
> before writing. CLI is authed to the permanent domain via `shopify store auth`.

## ✅ Done automatically this session

| Item | Detail |
|---|---|
| Theme **LIVE** | "BlitzSpirit ISSUE_001" (#160035635454) published as the live theme (2026-07-02). Editor: /admin/themes/160035635454/editor |
| Metafield definitions | `custom.strapline`, `custom.dossier` (rich text), `custom.issue`, `custom.index_ref`, `custom.limited` — all storefront-visible |
| 6 products **ACTIVE** | The Boudica (£28), The Establishment (£28, limited), The Roll Call (£26), The Frequency (£28), The Clerk (£28), The Cap (£22) — all Active and published to the Online Store |
| Variants + SKUs | Colour×Size per catalogue (Boudica S–XXL, other tees S–XL, Cap colour-only). SKUs `BS-<CODE>-<COLOUR>-<SIZE>`. Inventory **tracked, policy CONTINUE** (buyable at 0 stock) |
| Variant images | Each colourway photo pulled from vercel.app → Shopify CDN and set as the variant image (colour-swap works). Media READY on all 6 |
| Product metafields | strapline, issue, index_ref, limited, and dossier rich-text (bold = `.hit`) set on every product |
| Collections | `t-shirts` (smart, TYPE=T-Shirt, 5 products) · `caps` (smart, TYPE=Headwear, 1) — published to Online Store; handles match the theme's collection tabs |
| Pages | about, story, help, icons, link-in-bio — each with matching template suffix so the theme's `page.*` templates render (copy lives in section defaults) |
| Menus | `main-menu` = HOME / ABOUT / THE COLLECTIONS · `footer` = ABOUT / SIZE GUIDE / RETURNS / CONTACT (→ help anchors) |
| Discount | **BACKBONE10** — 10% off, all products, all customers, no expiry, active |

## ⛔ Remaining — owner must do in Admin (going-live / billable / policy)

1. ~~Activate products~~ — **DONE** (all 6 Active + on Online Store).
2. ~~Publish the theme~~ — **DONE** (ISSUE_001 is live).
3. **Taxes**: Settings → Taxes → **"All prices include tax"** ON (theme shows "// INC. VAT" only when this is set; prices were entered VAT-inclusive).
4. **Shipping**: Settings → Shipping → UK zone: **£3.95 tracked, free over £40** (matches the theme's free-shipping bar).
5. **Policies**: Settings → Policies — returns (30-day), privacy, terms, shipping. Required for UK distance selling *and* TikTok Shop verification.
6. **Inventory**: variants are set to keep selling at 0 (CONTINUE). Enter real stock counts, or switch a product to "stop selling when out of stock" per preference.
7. **Payments**: activate Shopify Payments + PayPal (GBP, Apple/Google/Shop Pay).
8. **Go live**: Online Store → Preferences → remove the password when ready.
9. **Channel apps + marketing**: follow `docs/MARKETING-STACK.md` (Meta + TikTok channels day 1, Judge.me, Shopify Email automations, then Postiz + n8n + Claude pipeline).

## Optional polish (theme renders fine without these — uses built-in fallbacks)

- **Metaobjects** `spec_row` + `editorial_block` and the `custom.field_manual` / `custom.editorial`
  list metafields (full spec in `METAFIELDS.md`). Without them the PDP auto-builds the field-manual
  table and uses the section's editorial blocks — already looks complete.
- **Product video** (`custom.video`): leave empty; the PDP shows a styled placeholder frame.
- Replace the `[PLACEHOLDER — REPLACE WITH FINAL COPY]` editorial copy in METAFIELDS.md when final.

## Verify after publishing

- PDP variant swap changes the plate image; add-to-bag opens the drawer; free-shipping bar states.
- The Establishment shows `[ ★ ISSUE_000 // LIMITED EDITION ]` + LIMITED badge, no colour picker (single colour auto-hides).
- The Cap shows colour pills only (no size row).
- BACKBONE10 applies 10% at checkout.
