# BlitzSpirit — Store Setup Checklist (run once the NEW BlitzSpirit Shopify account exists)

> ⚠️ **Account gotcha:** the Shopify connector in Claude sessions currently points at the
> SLA Pharma store (`vheagr-8n.myshopify.com`, team@slapharma.com). **Deploy nothing there.**
> Sign up for a fresh Shopify account with a BlitzSpirit email, then reconnect
> (connector `switch-shop`, or `shopify theme dev --store <new-store>.myshopify.com`).
> Verify with get-shop-info before ANY write.

## 1. Store basics
- [ ] Shopify signup (Basic plan), UK country, GBP currency.
- [ ] Settings → Taxes: **enable "include tax in prices"** (theme shows "// INC. VAT" only when this is on).
- [ ] Settings → Shipping: UK zone — £3.95 tracked flat rate + **free over £40** (matches the theme's free-shipping bar default; if you change the threshold, change theme setting too).
- [ ] Policies (Settings → Policies): returns (30-day no-quibble), privacy, terms, shipping — required for UK distance selling AND TikTok Shop verification.
- [ ] Customer accounts: choose **new (hosted) customer accounts** (theme has no legacy account templates by design).
- [ ] Domain: point blitzspirit.co.uk when ready.

## 2. Theme
- [ ] From `blitzspirit\shopify-theme\`: `shopify theme push --unpublished` (then preview → publish).
- [ ] Theme editor: upload textures/sticker if overriding defaults; set social URLs (Instagram/TikTok/X); confirm colours; set favicon (blitzspirit-stamp).
- [ ] Editor QA + functional pass: variant swap changes plate image; add-to-bag opens re-rendered drawer; free-shipping bar states (below/above £40); newsletter duplicate email shows error; modal opens at 16s, suppressed 7 days after dismiss; collection tabs; 404 page; gift card preview. Lighthouse target ≥90.

## 3. Metafields & metaobjects
Create definitions per `docs/METAFIELDS.md` (namespace `custom`, storefront access ON),
including metaobjects `spec_row` and `editorial_block`, then enter the per-product values
listed there (dossier copy, field-manual rows, issue tags, straplines).

## 4. Catalogue (canonical — matches the live static site, NOT the old S–3XL spec)
| Product | Handle | Price | Options |
|---|---|---|---|
| THE BOUDICA | the-boudica | £28 | Colour (Black, Off-White) × Size (S,M,L,XL,XXL) |
| THE ROLL CALL | the-roll-call | £26 | Colour (Black, White) × Size (S,M,L,XL) |
| THE FREQUENCY | the-frequency | £28 | Colour (Black, Navy, Off-White) × Size (S,M,L,XL) |
| THE CLERK | the-clerk | £28 | Colour (Black, White) × Size (S,M,L,XL) |
| THE ESTABLISHMENT | the-establishment | £28 | Colour (Black) × Size (S,M,L,XL) — mark limited (custom.limited) |
| THE CAP | the-cap | £22 | Colour (Black, Navy, Stone) — one size |

- [ ] Upload product photos from `blitzspirit\assets\` (tee-*.jpg, cap-*.jpg) as **product media**;
      assign each colourway image as the **variant image** for every variant of that colour
      (this is what drives the swatch→image swap in the theme).
- [ ] Colour option values exactly as above (feed-friendly); the theme maps display names
      (Black→OXY_BLACK, Off-White/White→CHALK_WHITE, Navy→SYSTEM_NAVY, Stone→CHALK_STONE).
- [ ] Collections: `t-shirts` (5 tees), `caps` (The Cap); both used by the collection tabs.
- [ ] Navigation menus: main menu (HOME / ABOUT / THE COLLECTIONS) + footer menu
      (ABOUT / SIZE GUIDE / RETURNS / CONTACT → help page anchors).
- [ ] Pages: about, story, help, icons, link-in-bio — assign templates page.about / page.story /
      page.help / page.icons / page.link-in-bio (section defaults already carry the copy).

## 5. Marketing wiring
- [ ] **Create discount code `BACKBONE10`** — 10%, applies to sale items ("We're defiant, not
      difficult."), no expiry — the newsletter/modal promise it; a missing code is a dud promise.
- [ ] Shopify Email: welcome automation (send the code again) + abandoned-checkout automation
      ("You left your post" register — but keep voice rules: grin, not militant).
- [ ] Install channel apps + the rest: see `docs/MARKETING-STACK.md` §8 order of operations.
- [ ] Judge.me free (product template supports app blocks) + Instafeed free.

## 6. Verify
- [ ] Test order end-to-end (Shopify test mode / Bogus gateway) incl. discount code.
- [ ] Meta Pixel + TikTok Pixel firing (via channel apps) on product view/add-to-cart/checkout.
- [ ] GA4 connected.
- [ ] blitzspirit.vercel.app static site can then be retired or repointed once the domain moves.
