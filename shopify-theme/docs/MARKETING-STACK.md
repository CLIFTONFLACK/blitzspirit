# BlitzSpirit — Social + AI Marketing Stack (researched & verified July 2026)

Primary traffic channels: **Instagram and TikTok**. Principle: free/native first, open-source
self-hosted second, paid apps only where building is a false economy. Total running cost:
**~£4–8/month** on top of the Shopify plan (one small VPS + pennies of Claude API).
Apps avoided ≈ $90–150/month.

## 1. Launch stack

| Need | Pick | Cost/mo |
|---|---|---|
| Sell/tag on Instagram + Facebook | **Facebook & Instagram by Meta** (official channel app) | £0 |
| Sell on TikTok + pixel | **TikTok** (official channel app) → TikTok Shop UK | £0 (9% commission per TikTok Shop sale only) |
| Post scheduling (IG + TikTok) | Meta Business Suite + TikTok native now → **self-hosted Postiz** once Meta/TikTok dev apps approved | £0 → ~£3.30 (VPS) |
| Automation glue | **n8n self-hosted** (same VPS) | £0 marginal |
| AI copy: product pages, emails | **Shopify Magic + Sidekick** (built-in, free) | £0 |
| AI copy: captions, hooks, Reel/TikTok scripts | **Claude API (Haiku 4.5) pipeline via n8n** | ~£1–4 |
| Product image cleanup / social creative | **Shopify Magic image editing** (free); Photoroom Pro month-by-month only if needed | £0 (–$7.99 optional) |
| Email + abandoned cart | **Shopify Email** (10k free sends/mo; abandoned-checkout automations free & unmetered) | £0 |
| Reviews | **Judge.me free plan** (unlimited text reviews, rich snippets) | £0 |
| Analytics | **Shopify native + GA4 + Meta/TikTok pixels** (installed by the two channel apps) | £0 |
| Link-in-bio | **`/pages/link-in-bio` in the theme** (template ships with this theme; Linkpop is dead, Linktree takes 12% on free tier) | £0 |
| Announcement bar, popup, free-shipping bar | **Built into this theme** (sections + cart.js) | £0 |
| Instagram feed on storefront | **Instafeed / Mintt free plan** (Basic Display API is dead; Graph API build = token babysitting) | £0 |
| Back-in-stock notify | **Stoq or Alert Me! free tier** at launch; build Supabase+n8n version if limits bite | £0 |

## 2. The two channel apps (foundation — both free)

**Facebook & Instagram by Meta** (apps.shopify.com/facebook): auto-syncs the catalogue to a
Meta Catalog, enables Instagram Shopping tags on posts/Reels/Stories, installs Meta Pixel +
Conversions API server-side. Setup: Meta Business Manager, a Facebook Page, IG converted to
Business account, then **submit for Instagram Shopping review** (24h–1 week; not automatic).
Do this day 1 — product tags on Reels are the primary organic→purchase path.

**TikTok** (apps.shopify.com/tiktok): installs TikTok Pixel with advanced matching, connects
TikTok Shop. UK notes: TikTok Shop is live in the UK; store needs a verifiable UK address
(region-locked UK↔UK), business verification in TikTok Seller Center, published returns
policy, warehouse address/phone. Product titles ≤34 chars, no URLs in descriptions.
**Fees: flat 9% commission on net GMV per TikTok Shop sale** (2026 rate). Leave "Smart
Promotions" OFF (silently takes up to ~4.5% of GMV). Sales on your own storefront from
TikTok traffic pay no commission — use TikTok Shop for impulse/native checkout, push
profile/bio traffic to blitzspirit.co.uk.

## 3. Open-source tooling (star counts verified 1–2 July 2026)

| Repo | Stars | Licence | Role |
|---|---|---|---|
| n8n (github.com/n8n-io/n8n) | 194.8k | Sustainable Use (fair-code; internal business use explicitly fine) | Automation: Shopify node, AI nodes, webhooks |
| Postiz (github.com/gitroomhq/postiz-app) | 32.5k | AGPL-3.0 | Scheduling: TikTok + IG Reels/Stories via official APIs, REST API, **MCP server** (Claude Code can drive it) |
| Umami (github.com/umami-software/umami) | 37.4k | MIT | Optional privacy analytics later (can ride existing Supabase Postgres) |
| Activepieces | 23.1k | community/enterprise split | n8n alternative (not chosen) |
| Mixpost | 3.4k | MIT (Lite) | Postiz alternative (not chosen — 10× fewer stars, Pro is $299) |

- **Hosting:** one Hetzner CX22 (2 vCPU/4GB, €3.79/mo ≈ £3.30) runs n8n + Postiz in Docker.
  Vercel/Supabase can't host these (long-running processes), but Supabase can be their Postgres.
- **Postiz catch:** self-hosting requires registering your own Meta + TikTok developer apps and
  passing their reviews (`instagram_content_publish`; TikTok `video.publish` audit) — a tedious
  week of form-filling. So: schedule natively in Meta Business Suite/TikTok for launch weeks,
  run the app reviews in parallel, switch to Postiz when approved.

## 4. AI-with-Shopify plan

**Free layer:** Shopify Magic (product descriptions, email subject/body, background removal +
AI image editing) and Sidekick (analytics queries, creates products/discounts/campaigns, builds
Flow automations from natural language). Caveat: Magic's default copy is generic — use it for
structure, then pass through the brand-voice layer. (Sidekick custom-app generation needs
Grow+ plan; everything else works on Basic.)

**Claude layer (the differentiator, ~£1–4/mo):** Haiku 4.5 is $1/M input, $5/M output — at
~60 captions + 20 scripts/month this is pennies. One n8n pipeline:
1. Trigger: new/updated Shopify product, or weekly cron.
2. Claude node with a locked brand-voice system prompt (grin register — "NOT HERE TO BE
   LIKED"; **no manifesto/political/militant copy**; prompt versioned in this repo) generates:
   product copy variant, 3 IG captions + hashtag sets, 2 TikTok/Reel scripts (hook/body/CTA).
3. Output to Postiz **drafts** via its REST API — a human approves; never auto-post.
4. Postiz's MCP server also allows driving scheduling conversationally from Claude Code.

**AI product photography:** skip apparel-AI subscriptions for 6 SKUs. Magic background removal
+ real photography beats AI on-model shots for a heritage/authenticity brand (AI-model apparel
imagery reads as drop-ship slop to exactly this audience). Photoroom Pro $7.99 month-by-month
for a shoot sprint if needed, then cancel.

## 5. Email: Shopify Email, not Klaviyo (at launch)

Shopify Email: 10,000 free sends/month, then $1/1,000; abandoned-checkout automations are
always free and unmetered (Marketing → Automations). Klaviyo free tier caps at 250 profiles —
outgrown immediately, then $20+/mo scaling with list size. Revisit Klaviyo only when the list
is several thousand and behavioural segmentation would pay for itself. Skip SMS at launch.

## 6. Analytics

Shopify native + GA4 + the two pixels = sufficient at launch. No paid attribution tools until
there's multi-channel ad spend. Umami on Supabase later if privacy-first storefront analytics
appeal.

## 7. Build vs buy

| Feature | Typical paid app | This project | Verdict |
|---|---|---|---|
| Announcement/promo bar | Privy $24/mo | theme section | **Built** |
| Popup w/ discount code | OptiMonk $29+/mo | signup-modal section + native discount | **Built** |
| Free-shipping progress bar | $5–10/mo apps | cart-drawer + threshold setting | **Built** |
| Link-in-bio | Linktree (12% fee free tier) | page.link-in-bio template | **Built** |
| Social scheduling | Buffer/Later $15–99/mo | self-hosted Postiz | **Self-host** |
| Email flows | Klaviyo $20+/mo | Shopify Email + Automations | **Native** |
| Reviews | Loox $12.99+/mo | Judge.me free | **Free app** (building = real work: moderation, rich snippets, request emails) |
| Back-in-stock | Notify Me! $19.90/mo | Stoq/Alert Me! free tier; Supabase+n8n build later (note: Shopify Flow alone can't email arbitrary lists) | **Free app now** |
| IG feed embed | $6–20/mo tiers | Instafeed/Mintt free tier | **Free app now** |

## 8. Order of operations (once the new BlitzSpirit store exists)

1. Day 1: install both channel apps; submit Instagram Shopping review.
2. Day 1–3: TikTok Seller Center UK business verification (the slowest step).
3. Theme marketing features are already live (bars, popup, link-in-bio).
4. Install Judge.me + Instafeed free tiers.
5. Turn on Shopify Email automations (welcome + abandoned checkout, brand voice).
6. Spin up Hetzner VPS with n8n; start Meta/TikTok developer-app reviews for Postiz.
7. Week 3–4: Postiz live + Claude caption/script pipeline feeding Postiz drafts.
