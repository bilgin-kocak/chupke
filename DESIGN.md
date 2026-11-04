---
version: 1
name: Chupke
description: >-
  The design language of Chupke (चुपके, "quietly"), a private checkout for gift cards paid in shielded ZEC.
  A calm night-green brand: one deep emerald for action, one warm gold for the shielded-coin accent,
  generous white space, tight bold headlines, and product mockups that show the real thing (a payment QR
  and an encrypted memo) instead of stock imagery. Nothing loads from a third party: no web fonts, no CDNs,
  no trackers. Implemented in src/web/theme.ts; pages in src/web/views.ts.

colors:
  ink: "#0b1512"          # body text, headings
  ink-2: "#26352f"        # secondary text on light surfaces
  mute: "#5c6b65"         # supporting copy, labels
  faint: "#8a9792"        # inactive steps, captions
  hairline: "#e3e9e6"     # borders and dividers
  hairline-2: "#d3ddd8"   # input and card borders
  canvas: "#ffffff"       # page and card surface
  soft: "#f5f8f6"         # alternate section band, table headers
  mint: "#e7f3ee"         # icon tiles, soft pills
  brand: "#0e5c4a"        # THE action color: primary buttons, done steps, focus ring tint
  brand-press: "#0a4538"  # hover / pressed
  brand-text: "#0b4a3c"   # links and eyebrows on light surfaces
  gold: "#e5ad3c"         # the shielded-coin accent: logo dot, focus ring, card-art dot
  gold-soft: "#fbf2dc"
  night: "#06110d"        # hero, CTA band, console bar, dark nodes
  ok: "#0f7a56"           # delivered / accepted
  warn: "#9a4d06"         # refunds, expiry (money going back is amber, not red)
  bad: "#b42318"          # held for review, failures
  info: "#1f53b8"         # in flight

typography:
  family-sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Inter, Roboto, 'Helvetica Neue', Arial, 'Noto Sans', 'Noto Sans Devanagari', sans-serif"
  family-mono: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace"
  display:   { size: "clamp(2.6rem, 6.2vw, 4.6rem)", weight: 780, lineHeight: 1.01, letterSpacing: "-0.04em" }
  h2:        { size: "clamp(1.9rem, 3.6vw, 2.8rem)", weight: 740, lineHeight: 1.07, letterSpacing: "-0.03em" }
  h3:        { size: "1.1rem", weight: 690, lineHeight: 1.3, letterSpacing: "-0.012em" }
  lead:      { size: "clamp(1.05rem, 1.7vw, 1.24rem)", weight: 400, lineHeight: 1.6, color: mute }
  body:      { size: "16px", weight: 400, lineHeight: 1.6 }
  eyebrow:   { size: "0.76rem", weight: 700, letterSpacing: "0.14em", transform: uppercase, color: brand-text }
  mono-data: { size: "12.5–13.5px", family: family-mono, use: "addresses, memos, txids, order ids" }
  numbers:   { feature: "font-variant-numeric: tabular-nums", use: "every price, count and time" }

rounded:
  sm: 8px
  md: 12px
  lg: 18px      # cards, steps, product rows
  xl: 26px      # feature grid, form card, CTA band
  pill: 999px   # buttons, badges, the nav CTA

spacing:
  gutter: 24px (16px under 640px)
  container: 1160px
  section: 104px vertical (68px under 640px)
  card-padding: 24px (30px for the payment card)
  grid-gap: 12–28px

components:
  button-primary: { bg: brand, text: white, radius: pill, padding: "13px 20px", shadow: "0 10px 22px -10px rgba(14,92,74,.75)" }
  button-light:   { bg: white, text: night, radius: pill, use: "primary CTA on night surfaces" }
  button-glass:   { bg: "rgba(255,255,255,.06)", border: "rgba(255,255,255,.2)", text: white, use: "secondary CTA on night" }
  button-ghost:   { bg: canvas, border: hairline-2, text: ink }
  badge:          { radius: pill, padding: "3px 9px", size: "0.74rem", weight: 680, tones: [ok, warn, bad, info, mute, gold] }
  card:           { bg: canvas, border: hairline, radius: lg, shadow: sh1 }
  tile:           { size: 44px, radius: 13px, bg: mint, icon: brand-text }
  nav-marketing:  { bg: "rgba(6,17,13,.72) + blur(14px)", text: white, sticky: true }
  nav-app:        { bg: "canvas 84% + blur(14px)", border-bottom: hairline, sticky: true }
  nav-console:    { bg: night, solid: true }
---

# Chupke design system

## 1. Visual theme and atmosphere

Chupke is a privacy product, so the brand is **quiet confidence**: a night sky that's mostly dark, lit by a soft emerald
glow and one warm gold point, like a shielded coin. The hero is a deep `night` band with layered radial glows (emerald
upper right, gold upper left, emerald from below) and a faint 46 px grid masked to fade out. Everything below the hero
is calm, light and generous with space.

The page argues with the product, not with illustrations. The hero shows a phone with a real order screen (a payment
QR, the price, the "address used for this order only" line, the live steps) and a wallet message bubble with the
delivered code, masked. Buyers recognize exactly what they'll get.

**Key characteristics**
- One action color. `brand` emerald is the only filled button on light surfaces; on night surfaces the primary CTA is
  white (`button-light`), with `button-glass` beside it.
- Gold is an accent, never a button: the logo's dot, the focus ring, the dot on gift-card art, the end of the headline
  gradient.
- Tight, heavy headlines (weight 740–780, negative tracking) over light, airy body copy.
- Monospace for anything a wallet would show: addresses, memos, txids and order ids.
- Tabular figures on every amount, count and time.
- No third-party requests of any kind, which is itself part of the privacy story. System fonts only; icons are inline SVG.

## 2. Color palette and roles

| Token | Hex | Role |
| --- | --- | --- |
| `night` | `#06110d` | Hero, CTA band, console bar, the private "worker" node |
| `brand` | `#0e5c4a` | Primary buttons, completed steps, selected product ring |
| `brand-text` | `#0b4a3c` | Links, eyebrows, icon strokes on mint |
| `gold` | `#e5ad3c` | Accent dot, focus ring, gradient end. Never a fill for buttons |
| `ink` / `ink-2` | `#0b1512` / `#26352f` | Text |
| `mute` / `faint` | `#5c6b65` / `#8a9792` | Supporting text, inactive steps |
| `canvas` / `soft` / `mint` | `#ffffff` / `#f5f8f6` / `#e7f3ee` | Surfaces; `soft` alternates section bands |
| `hairline` / `hairline-2` | `#e3e9e6` / `#d3ddd8` | Borders |

**Status semantics** (badges and the order outcome box). Delivered and accepted are `ok` green. **Refunds and expiry
are `warn` amber, not red**: money going back to the buyer is a safe outcome, not an error. `bad` red is reserved for
"held for review" and failures that need a human. In-flight states are `info` blue.

**Dark mode** swaps surfaces to `#0b1411` / `#08100d`, lifts `brand` to `#2fa37f` with dark text on it, and keeps the
hero identical. It follows `prefers-color-scheme`.

## 3. Typography rules

- **Family:** the system UI stack, with Devanagari coverage for the name (चुपके). No web fonts are downloaded.
- **Display** (hero H1): `clamp(2.6rem, 6.2vw, 4.6rem)`, weight 780, line-height 1.01, tracking −0.04em. The last
  word may carry the emerald-to-gold gradient (`.accent`). Once per page.
- **H2** (section titles): `clamp(1.9rem, 3.6vw, 2.8rem)`, weight 740, tracking −0.03em. Write them as plain claims
  ("Two processes, and only one of them holds keys."), not slogans.
- **Eyebrow** above every H2: 0.76rem, uppercase, 0.14em tracking, `brand-text`.
- **Lead:** 1.05–1.24rem, `mute`, maximum ~36rem wide.
- **Data:** monospace at 12.5–13.5px for addresses, memos and ids; `tabular-nums` for money and counts.

## 4. Component stylings

- **Buttons:** pill shaped, 13px 20px, weight 650, lift 1px on hover. Primary = `brand`. On night: `button-light` +
  `button-glass`. Small (`btn-sm`) in the nav, large (`btn-lg`) in the hero and CTA band.
- **Badges:** pill, 0.74rem, weight 680, tinted background with the strong text color of its tone. Status values are
  shown with underscores replaced by spaces ("awaiting payment").
- **Cards:** `canvas`, 1px `hairline`, radius 18px, shadow `sh1`. Card titles are 1rem/720 with an optional badge at
  the right.
- **Icon tiles:** 44px rounded squares in `mint` holding a 22px stroke icon (1.8px stroke, round caps).
- **Steps** ("How it works"): four cards with a tile, a mono step number (01–04), an H3 and two lines of copy.
- **Feature grid:** six cells separated by 1px hairlines inside one rounded container (radius 26px), not six floating cards.
- **Privacy matrix:** a three-column table (Who / Sees / Never sees). "Sees" items get an amber closed-eye icon and
  "Never sees" items a green check. Below 760px it collapses to stacked rows.
- **Product rows:** radio cards. Custom radio, gift-card art (58×40 gradient chip with a gold dot), title + tone badge,
  a one-line note from the allowlist, and a right-aligned price in TAZ with the face value below. The selected row
  gets a `brand` border and a 3px tinted ring (`:has(input:checked)`).
- **Form card:** radius 26px, shadow `sh2`, sticky beside the products on desktop. Contains the reply-address
  textarea (monospace, `soft` fill, `brand` focus ring), the primary submit, a live shop-status line and three
  reassurance checks.
- **Timeline:** 20px circles joined by a 2px line. Done = `brand` fill with a white check; current = `brand` ring with
  a soft halo; upcoming = `hairline-2` ring and `faint` text.
- **Outcome box:** rounded, `ok` or `warn` tinted, hidden while empty.
- **Console:** solid `night` bar with an "operator" tag, six KPI cards in one row, then panels with uppercase table
  headers and status badges.

## 5. Layout principles

- Container 1160px, gutters 24px (16px on phones). Sections are 104px tall-padded and alternate `canvas` / `soft`.
- Landing order: hero, live stats strip, how it works, why (features), who sees what, shop, under the hood, FAQ,
  closing CTA band, footer. This mirrors the standard startup page (claim, proof, how, why, objections, ask), with
  privacy given its own section because it is the product.
- The stats strip shows **real** aggregates from the database (cards delivered, refunds sent, median payment-to-code
  time). On a fresh install with no deliveries, it falls back to fixed facts ($10 cap, 1 h purge, 0 codes stored).
  Never invent numbers.
- App pages (order) use a two-column grid: payment on the left, status, summary and privacy on the right. On phones
  the payment card comes first.

## 6. Depth and elevation

- `sh1` `0 1px 2px rgba(11,21,18,.06), 0 1px 1px rgba(11,21,18,.04)`: resting cards.
- `sh2` `0 14px 34px -16px rgba(11,21,18,.24)`: the form card and floating UI.
- `sh3` `0 40px 90px -30px rgba(0,0,0,.65)`: hero mockups only (the phone and the memo bubble).
- Night surfaces get depth from radial glows, not shadows. Glass (`backdrop-filter: blur`) is used only for the nav
  and the memo bubble.

## 7. Do's and don'ts

**Do**
- Keep one filled `brand` button per view on light surfaces.
- Show the product: QR, memo, timeline. Mask codes (`46••-••••-••57`) and blur real QR codes or memos in screenshots,
  because they contain wallet addresses.
- Write copy that names the guarantee plainly ("Never charged twice", "Refunds without asking") and the gaps honestly
  (who sees what).
- Use amber for refunds and expiry, and red only when a human must act.
- Keep every page self-contained: inline CSS, inline SVG, `data:` URIs only.

**Don't**
- Don't load web fonts, icon fonts, analytics, CDNs or remote images. The CSP (`default-src 'none'`) will block them anyway.
- Don't use gold as a button fill or a text color on white (contrast).
- Don't put a real, payable QR in marketing. The hero QR encodes a sentence, not a payment request.
- Don't show addresses unmasked anywhere except the buyer's own order page (the dashboard masks to 8 characters).
- Don't invent social proof (logos, testimonials, user counts). The strip shows live testnet numbers or plain facts.

## 8. Responsive behavior

- **Breakpoints:** 980px (hero, shop and architecture stack), 900px (nav links hide, feature grid 2-up), 760px (stats
  2×2, privacy matrix stacks), 640px (smaller section padding), 520px (mockup stacks: phone, then the bubble
  overlapping its bottom), 480px (the hero pill drops its second clause).
- Touch targets are at least 44px tall. Product rows are whole-row tap targets.
- KPIs: 6 across from 1180px, 3 across to 620px, then 2.

## 9. Agent prompt guide

When adding UI to Chupke:
1. Use the tokens and classes in `src/web/theme.ts` (`.btn-primary`, `.card`, `.badge b-ok`, `.tile`, `.eyebrow`,
   `.h2`, `.lead`). Don't add new colors; pick a status tone.
2. Sections are `<section class="section">` (or `section soft`), with a `.head` of eyebrow, H2 and lead, then content.
3. Every money value gets `.num` (tabular figures). Every address, memo or id gets `.mono`.
4. New copy: short sentences, concrete numbers, no hype words, and say what isn't private when it matters.
5. Check every page at 390px and 1440px, in light and dark, before shipping. Look for overlaps in the hero mockup.
