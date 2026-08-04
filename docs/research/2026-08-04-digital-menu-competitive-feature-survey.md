# Competitive feature survey: QR table-ordering / digital menu products

**Date:** 2026-08-04
**Purpose:** Ground our feature priorities in what comparable products actually ship. Eight vendors surveyed against their own feature pages, help centers, and docs (no listicles, no review aggregators). Lightspeed Restaurant is included as a ninth, narrow reference for one pattern (staff alert sounds) only.

**Verification levels used throughout:**

- **[fetched]** — page retrieved and read directly.
- **[snippet]** — vendor's own page confirmed via search-result excerpt of that page; direct fetch was blocked (HTTP 403). Still the vendor's words, but quoted second-hand.
- **[unverified]** — could not be traced to any vendor-owned page; treat as rumor.

Vendor identity notes (per 2026 state): **me&u** is the merged me&u + Mr Yum entity (all-stock merger completed September 2023; the Mr Yum brand was retired) — [me&u: "Better together"](https://www.meandu.com/blog/better-together) [snippet]. **GloriaFood** has been Oracle-owned since June 2021 — [Oracle acquisition page](https://www.oracle.com/corporate/acquisitions/gloriafood/) [snippet]; see §5 for an important unverified caveat about its future.

---

## 1. TL;DR

1. **Modifiers are the most standardized feature in this market.** Five of eight vendors document the *same* data model — option groups with required/optional, min/max selections, and per-option price deltas (including negative). Our lack of modifiers is the largest gap between us and everything surveyed, and the market has effectively written the spec for us (§4.1).
2. **A staff-side new-order alert is table stakes, not a nicety.** Every vendor whose order-receipt flow is documented has an active alert: an app sound (GloriaFood), opt-in browser audio (me&u), SMS (Square), "instant order alerts" (qlub), or hardware auto-fire to printer/KDS (Toast). A silently-polling dashboard is below the market baseline. Two vendors implement *repeat-until-acknowledged* alarms (§4.3).
3. **Every surveyed product processes payment in-flow** — it is the business model, not a feature. But cash / pay-later ordering coexists with it at the small-venue end (GloriaFood, MENU TIGER, Flipdish), so QR ordering *without* forced online payment is a defensible design. Our specific honor-system "typed payment reference, no verification" has no equivalent in anything surveyed.
4. **Item photos + descriptions are universally supported** (all 6 vendors where menu content is documented), and me&u/MENU TIGER explicitly market photos as revenue levers. sunday is the one vendor that positions text-only menus as a *deliberate choice* it also supports — so "photos optional per item" is the right model, but the capability itself is baseline.
5. **Free-text order notes are common but not universal** — Square supports notes at checkout and 150-char free-text modifiers; me&u documents guest order notes; Toast Mobile Order & Pay conspicuously does not even let guests edit an order after submitting. A simple per-order note field puts us at par with the mid-market.
6. **Re-ordering into an open session ("another round", tabs, group ordering) is the leaders' dine-in differentiator** — Toast tabs/group ordering, me&u group tabs + "Another Round", Flipdish "additional orders throughout the meal". This is market evidence that our backlogged *resume-order-by-re-scan* item is a real dine-in need, not a nice-to-have.
7. **Thermal printing is the norm even at the free/cheap end** — GloriaFood's free app prints to thermal printers from a phone; MENU TIGER sells printer integration at $20/month. Our browser-print receipt is a stopgap; the ESC/POS backlog item is validated.
8. **The free benchmark is exiting the market:** multiple third parties report Oracle is retiring GloriaFood (EOL April 2027) — **[unverified]**, no primary Oracle page found. If true, the strongest "why pay for this?" competitor for tiny venues disappears, which is strategically relevant for a single-venue product like ours.

---

## 2. Feature matrix

Legend: **✓** = documented/supported · **~** = partial or indirect (see note) · **✗** = documented as absent · **?** = not verified in surveyed sources (absence of evidence, not evidence of absence).

| Feature | Toast¹ | Square² | me&u³ | sunday⁴ | MENU TIGER⁵ | GloriaFood⁶ | Flipdish⁷ | qlub⁸ |
|---|---|---|---|---|---|---|---|---|
| Per-table QR → correct table routing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Browser-based, no app download | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Item photos | ✓ | ✓ | ✓ | ~ opt. | ✓ | ✓ | ? | ? |
| Item descriptions | ✓ | ? | ✓ | ✓ | ✓ | ✓ | ? | ? |
| Dietary / allergen info on menu | ? | ? | ✓ | ? | ? | ? | ? | ~ |
| Modifier groups (required/optional, min/max, priced options) | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ? | ~ |
| Free-text order/item notes | ✗ post-submit edits | ✓ | ✓ | ? | ? | ? | ? | ? |
| Integrated online payment processing | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Cash / pay-later option in QR flow | ~ tabs | ✗ | ? | ~ pay-after | ✓ | ✓ | ✓ | ? |
| Tipping prompts | ✓ | ? | ✓ | ✓ | ✓ | ? | ✓ | ✓ |
| Tabs / group ordering / split bill | ✓ | ✗ | ✓ | ✓ split | ✗? | ? | ~ reorder | ✓ split |
| Sold-out / 86 toggle | ? | ? | ~ via POS sync | ? | ✓ | ✓ | ✓ | ✓ |
| New-order alert to staff (sound/app/SMS) | ~ auto-fire | ✓ SMS | ✓ audio | ? | ~ bell | ✓ audio | ? | ✓ |
| Kitchen printing / KDS routing | ✓ | ✓ | ✓ | ~ via POS | ✓ $20/mo | ✓ | ~ via POS | ~ via POS |
| POS integration | native | native | ✓ 70+ | ✓ | ~ Loyverse only | ~ standalone | ✓ | ✓ or standalone |
| Analytics / sales insights | ✓ | ✓ | ✓ | ✓ | ✓ | ? | ? | ✓ |
| Multi-language menu | ? | ? | ✓ | ✓ auto | ✓ 19 langs | ? | ? | ? |
| Guest feedback / review prompts | ? | ? | ✓ | ✓ | ✓ | ? | ? | ✓ |
| Order-ahead / pickup / delivery channel | ✓ | ✓ | ✓ | ? | ✓ | ✓ | ✓ | ~ counter |
| Multi-location support | ✓ | ✓ | ✓ | ✓ | ✓ tiered | ✓ | ✓ | ✓ |

**Column sources** (all accessed 2026-08-04):
¹ Toast: [Mobile Order & Pay Overview](https://support.toasttab.com/en/article/Mobile-Order-and-Pay-Overview) [fetched], [MO&P FAQ](https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs) [fetched], [modifier groups platform doc](https://doc.toasttab.com/doc/platformguide/adminAddingModifierGroupsAndModifiers.html) [fetched], [menu item images](https://support.toasttab.com/en/article/Adding-Images-to-Menu-Items-in-the-Menu) [fetched].
² Square: [Set up self-serve ordering & QR codes](https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online) [fetched], [QR code ordering page](https://squareup.com/us/en/online-ordering/qr-code-ordering) [fetched], [item modifiers](https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers) [fetched], [item images](https://squareup.com/help/us/en/article/8267-upload-images-to-your-item-library) [snippet].
³ me&u: [Order & Pay product page](https://www.meandu.com/us/serve/order-pay) [fetched], [Live Orders feature](https://meandu.helpjuice.com/en_US/153326-managing-venue-manager/901151-live-orders-feature) [fetched], help-center modifier articles [snippet] (help.meandu.com blocks direct fetch).
⁴ sunday: **all sundayapp.com pages blocked direct fetch (403)** — [homepage](https://sundayapp.com/), [Order & Pay](https://sundayapp.com/order-and-pay/), [Digital menu](https://sundayapp.com/digital-menu/) all [snippet].
⁵ MENU TIGER: [tableside ordering feature page](https://www.menutiger.com/features/table-side-in-restaurant-ordering) [fetched], [FAQ](https://www.menutiger.com/faq) [fetched], [choices & add-ons guide](https://www.menutiger.com/blog/choices-and-add-ons-to-your-online-menu) [fetched], [customer ordering flow (help center)](https://menutiger.helpscoutdocs.com/article/156-how-do-my-customers-place-an-order) [fetched].
⁶ GloriaFood: [QR code ordering system](https://www.gloriafood.com/qr-code-ordering-system-restaurant-menu) [fetched], [order-taking app](https://www.gloriafood.com/restaurant-order-taking-app) [fetched], [choices & add-ons](https://www.gloriafood.com/how-to-improve-restaurant-menu-addons) [fetched].
⁷ Flipdish: [Order & Pay at table](https://www.flipdish.com/us/resources/blog/order-and-pay-at-table) [fetched], [table-specific QR codes help article](https://help.flipdish.com/en/articles/9585244-table-specific-qr-codes) [snippet] (help.flipdish.com blocks direct fetch).
⁸ qlub: [Order-and-Pay page](https://qlub.io/ae/en/order-and-pay) [fetched], [Pay-at-Table page](https://qlub.io/ae/en/pay-at-table) [snippet].

---

## 3. Table stakes vs. differentiators

### Table stakes (in essentially every surveyed product)

- **Per-table QR with automatic table identification.** Toast: "Each table has a unique code, ensuring orders are correctly routed to the kitchen" ([MO&P Overview](https://support.toasttab.com/en/article/Mobile-Order-and-Pay-Overview)). Square: "automatically tie each QR code to a specific ordering station" ([help 7142](https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online)). MENU TIGER: "each table can have its own unique QR code … for easy ordering and tracking" ([tableside page](https://www.menutiger.com/features/table-side-in-restaurant-ordering)). GloriaFood offers per-table or shared codes ([QR ordering page](https://www.gloriafood.com/qr-code-ordering-system-restaurant-menu)). Flipdish pre-fills the table number from the scanned code ([help article](https://help.flipdish.com/en/articles/9585244-table-specific-qr-codes) [snippet]). qlub: "Set up QR codes at your tables — your diners can simply scan" ([Order-and-Pay](https://qlub.io/ae/en/order-and-pay)). **We have this.**
- **Modifier/option groups on items** — all five vendors that document menu management in public detail (Toast, Square, me&u, MENU TIGER, GloriaFood) have the full option-group model; qlub confirms "custom modifiers" exist ([Order-and-Pay](https://qlub.io/ae/en/order-and-pay)). Details in §4.1. **We lack this entirely.**
- **Item photos & descriptions** — see §4.2. **We lack this.**
- **An active new-order alert on the staff side** — see §4.3. **We lack this** (polling updates the screen but nothing demands attention).
- **Direct-to-kitchen routing (printer or KDS)** — Square: orders "feed directly to your kitchen ticket printer or kitchen display system (KDS)" ([help 7142](https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online)); Toast routes per-item print routing with an "auto-firing device" ([MO&P FAQ](https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs)); me&u ships a "Printer Gateway — backup printing so you never miss an order" and order batching ([Order & Pay page](https://www.meandu.com/us/serve/order-pay)); GloriaFood prints "accepted orders directly from the mobile order taking app" to a thermal printer ([order-taking app](https://www.gloriafood.com/restaurant-order-taking-app)); MENU TIGER sells printer integration at $20/month ([FAQ](https://www.menutiger.com/faq)). **We have browser print only.**
- **Integrated payment processing** — universal (see matrix row; every one of the 8 monetizes or at least supports card payment in the QR flow). **Deliberate non-goal for us** — but note §5.
- **Sold-out/86 control** — GloriaFood: "Mark menu items and add-ons as out-of-stock" ([order-taking app](https://www.gloriafood.com/restaurant-order-taking-app)); Flipdish "bulk hide/show" ([Order & Pay blog](https://www.flipdish.com/us/resources/blog/order-and-pay-at-table)); qlub: "diners always see the latest prices, specials, and stock availability" ([Order-and-Pay](https://qlub.io/ae/en/order-and-pay)); MENU TIGER: "update your menu instantly" ([tableside page](https://www.menutiger.com/features/table-side-in-restaurant-ordering)). **We have this** (per-branch sold-out toggles).
- **Tipping prompts** — me&u ("Smart prompts increase gratuities by up to 10%"), MENU TIGER (fixed 5–20% presets), Flipdish ("facilitates staff tipping"), qlub, sunday, Toast all document tipping. Only meaningful where payment is processed — **correctly out of scope for us today**.

### Differentiators (only some vendors)

- **Tabs / group ordering / round re-ordering** — Toast: guests "start a tab with their name and order continually", optional pre-authorized tabs, group ordering onto one check ([MO&P FAQ](https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs), [Overview](https://support.toasttab.com/en/article/Mobile-Order-and-Pay-Overview)); me&u: "Advanced group tabs" and "Another Round — prompt guests to reorder the same round of drinks fast" ([Order & Pay page](https://www.meandu.com/us/serve/order-pay)); Flipdish: "Additional orders can be added throughout the meal" ([blog](https://www.flipdish.com/us/resources/blog/order-and-pay-at-table)). Square's QR flow, by contrast, is strictly pay-per-order with no open checks ([help 7142](https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online)).
- **AI recommendations / personalization** — me&u "For You" AI recommendations built on "25 million consumer profiles" ([Order & Pay page](https://www.meandu.com/us/serve/order-pay)); sunday markets an "AI Menu" ([smart-menu page](https://sundayapp.com/smart-menu/) [snippet]). Enterprise-scale data plays; irrelevant to a single venue.
- **Automatic menu translation** — sunday: "automatically translate the menu … in all languages with no effort" ([digital-menu pages](https://sundayapp.com/digital-menu/) [snippet]); MENU TIGER supports 19 languages ([FAQ](https://www.menutiger.com/faq)); me&u lists "Language translations" ([Order & Pay page](https://www.meandu.com/us/serve/order-pay)).
- **Review/feedback funnels** — me&u ("capture instant feedback while guests are in-venue", review prompts), sunday ("5x more Google reviews" [snippet]), qlub ("instant tipping and reviews" [snippet]). Explicit non-goal for us.
- **Split-the-bill** — sunday, qlub, Toast (POS-side split with per-check QR). Only meaningful with payment processing.
- **Pre-authorized cards / group event tabs** — Toast (US only) and me&u. Enterprise-leaning.

---

## 4. Implementation patterns for our three known gaps

### 4.1 Modifiers / options and order notes

The converged model across five vendors is: **a reusable "modifier group" entity attached to items, with required/optional behavior, single/multi select, min/max counts, optional duplicate selection, and a price delta (possibly negative) per option.**

| Vendor | Group semantics (their exact terms) | Source |
|---|---|---|
| **Toast** | Required group: guest "must make a selection before they can proceed"; Optional group can be skipped. If multi-select allowed: max selections (default "No maximum"), min selections (required groups only, default 1). "Can a single modifier be selected more than once" enables e.g. "double pepperoni". Pricing: no charge / individual per-option / shared group price; negative prices allowed. | [Platform guide: adding modifier groups](https://doc.toasttab.com/doc/platformguide/adminAddingModifierGroupsAndModifiers.html) [fetched] |
| **Square** | "Modifier sets" per item; required flag with settable minimum (can be >1); "Allow more than one modifier" unlocks maximum; "Allow multiple quantities of a single modifier"; negative prices ("−$1.00 … when a component is removed"); **free-text modifier up to 150 characters** (Square Websites/Kiosk); nested sets (beta, 3 levels); option to hide modifiers on customer receipts. | [Create and edit modifiers](https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers) [fetched] |
| **me&u** | "Modifiers must be collected together in a modifier group, which controls the ordering rules." Settings: "Is selection required?"; select type single/multi; min/max quantity (multi only); display mode Collapsed / Expanded ("recommended if the selection is required") / **Hidden** (invisible to guest, prints on kitchen receipt — used for set menus); per-ordering-type filtering (dine-in vs pickup); conditional (chained) modifiers. | [Modifier Groups in more detail](https://help.meandu.com/hc/en-us/articles/10242735770895-Modifier-Groups-in-more-detail), [Getting started with modifiers](https://help.meandu.com/hc/en-us/articles/6539899621391-Getting-started-with-modifiers), [Conditional modifiers](https://help.meandu.com/hc/en-us/articles/6539923820175-Setting-up-conditional-modifiers) — all [snippet] (Zendesk blocks fetch) |
| **MENU TIGER** | "Modifier Groups" with Required (set min and max choices, e.g. "1–2 sauces") vs Optional; "allow or restrict selecting the same option multiple times"; each option = name + price + unit; group attached to menu items. | [Choices & add-ons guide](https://www.menutiger.com/blog/choices-and-add-ons-to-your-online-menu) [fetched] |
| **GloriaFood** | "Choices & Addons" groups; Optional vs Mandatory; mandatory uses min/max (min=max=1 forces exactly one, e.g. crust type); per-choice name + price; drag-and-drop attachment to a category, item, **or item size**; size-specific pricing done by duplicating the group. | [Choices & add-ons article](https://www.gloriafood.com/how-to-improve-restaurant-menu-addons) [fetched] |
| **qlub** | "Custom modifiers — add sauces, adjust portions, or flag allergens" (no public min/max detail). | [Order-and-Pay](https://qlub.io/ae/en/order-and-pay) [fetched] |

**Notes / free-text patterns:** Square lets guests "add special requests" / "add notes" in the QR checkout ([help 7142](https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online), [QR ordering page](https://squareup.com/us/en/online-ordering/qr-code-ordering)) and separately supports a 150-char free-text modifier type. me&u's help center has a dedicated "How to let guests leave notes on their orders" topic ([help-center search result](https://help.meandu.com/hc/en-us/sections/6539839030799-Ordering-basics) [snippet]). Counter-example: Toast MO&P — "guests cannot edit a Toast Mobile Order & Pay order after they submit it" ([FAQ](https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs)); our staff-side order *edit* capability is actually ahead of Toast's guest flow here.

**Design takeaway for us:** `ModifierGroup { name, required, minSelect, maxSelect, allowDuplicates } → ModifierOption { name, priceDelta }`, attached many-to-many to items, plus one plain-text note field per order (or per line item). Character-capped free text (Square uses 150) avoids abuse. me&u's collapsed/expanded display flag and MENU TIGER's "1–2 sauces" phrasing are good UX cribs.

### 4.2 Item photos, descriptions, dietary tags

- **Toast:** images per menu item, ".jpg or .png … no larger than 5 MB", recommended 750×450 px, shown on the online-ordering site; description entered alongside image in item properties ([Adding images to menu items](https://support.toasttab.com/en/article/Adding-Images-to-Menu-Items-in-the-Menu) [fetched]).
- **Square:** item images in the Item Library, "JPG, JPEG, PNG, and GIF … up to 15MB", recommended ≥2000×2000 at 1:1; multiple images per item (menu template shows one) ([Upload and manage item images](https://squareup.com/help/us/en/article/8267-upload-images-to-your-item-library) [snippet]).
- **GloriaFood:** images at three levels — theme (venue), category, item — with stock-photo library or own upload ([pictures release note](https://www.gloriafood.com/pictures-in-menu-release-date) [snippet]).
- **me&u:** sells photos as revenue — "Entice higher spend with photos" — plus "Dietary & allergens: make guest preferences easy" as a first-class menu feature ([Order & Pay page](https://www.meandu.com/us/serve/order-pay) [fetched]).
- **sunday:** supports photo menus *or* deliberately clean text-only menus ("restaurants have the flexibility to create a clean, text-based menu with no imagery") ([digital-menu pages](https://sundayapp.com/digital-menu/) [snippet]).
- **qlub:** allergen flagging appears in the *diner's* order flow ("flag allergens" via modifiers) rather than as menu metadata ([Order-and-Pay](https://qlub.io/ae/en/order-and-pay) [fetched]).

**Design takeaway:** photo (optional per item) + short description is the universal baseline; dietary/allergen tags are a second-tier feature only me&u markets prominently. Size-cap and aspect-ratio guidance (Toast's 750×450 / 5MB is the modest end) matters for a Vercel/Postgres stack — store images in Blob, not the DB.

### 4.3 Staff alerting for new orders

Four distinct mechanisms appear, often combined:

1. **Dedicated device app with audio alert + accept/reject.** GloriaFood's free order-taking app (iOS/Android, phone or tablet): "a uniquely positive and pleasant sound alert to notify you of incoming orders"; staff tap the pending order, see details, set an ETA, accept — and "your customers will know exactly when you've accepted it" ([order-taking app page](https://www.gloriafood.com/restaurant-order-taking-app) [fetched] + [app description](https://www.gloriafood.com/restaurant-ideas/taking-orders-with-mobile-ordering-app) [snippet]).
2. **Browser dashboard audio, opt-in, with persistent alarm for problem orders.** me&u's Live Orders screen prompts staff to enable audio notification (a purple opt-in box — browsers require a user gesture before playing sound; me&u designed around that). New orders "appear as cards with the appropriate sound and colour"; failed orders trigger "a 'ding' noise [that] will continue to ring until you have resolved the order" and turn red ([Live Orders feature](https://meandu.helpjuice.com/en_US/153326-managing-venue-manager/901151-live-orders-feature) [fetched]; opt-in detail from [me&u help/academy Live Orders articles](https://help.meandu.com/hc/en-us/articles/6539893658127-How-to-manage-your-orders-in-the-Live-Orders-page) [snippet]).
3. **Out-of-band alert (SMS) + hardware as the real notifier.** Square: "the order will appear on your point of sale, and feed directly to your kitchen ticket printer or kitchen display system (KDS)"; staff can additionally receive text-message alerts, configurable at setup ([help 7142](https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online) [fetched]). Toast relies on an "auto-firing device" pushing straight to printers/KDS ([MO&P FAQ](https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs) [fetched]) — the ticket printing *is* the alert.
4. **Configurable repeat-until-acknowledged sound.** Lightspeed Restaurant (L-Series, iPad app) exposes three modes: "No alert sound" / "Play an alert sound every time a new order is created" / "Repeat alert sound until all new orders have been accepted" ([Lightspeed help](https://resto-support.lightspeedhq.com/hc/en-us/articles/360019630933-Alert-sounds-for-takeout-and-delivery-orders) [fetched]).

qlub confirms the baseline expectation in one line: "Stay updated in real-time with instant order alerts, so your team can act fast" ([Order-and-Pay](https://qlub.io/ae/en/order-and-pay) [fetched]). MENU TIGER's dashboard has a notification bell, but no sound behavior is documented ([Sept product-updates post](https://www.menutiger.com/blog/september-product-updates) [snippet]) — the only surveyed vendor where audible alerting is unconfirmed.

**Design takeaway:** for our 3–4s-polling dashboard, the me&u/Lightspeed pattern is the direct fit and cheap to build: an explicit "enable sound" toggle (satisfies browser autoplay policy), a chime on any poll that returns a new order, and optionally a repeating chime while any order sits unconfirmed. GloriaFood's detail that *customers see acceptance* is worth noting — our confirm step already exists; surfacing it to the customer page closes the same loop.

---

## 5. Mapping to this product

| Feature (market status) | Our status | Re-prioritize? |
|---|---|---|
| Per-table QR routing (table stakes) | **Built** | — |
| Sold-out toggles per branch (table stakes) | **Built** | — |
| Staff order management w/ edit + audit journal | **Built** — and ahead of Toast's guest flow, which forbids post-submit edits ([Toast FAQ](https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs)) | — |
| Staff-assisted counter orders (parallels GloriaFood/MENU TIGER manual dashboard ordering) | **Built** | — |
| Business-hours toggle (cf. GloriaFood "pause services with customizable timeframes") | **Built** | — |
| Multi-branch (most vendors tier/charge for this, e.g. MENU TIGER $17→$119/mo by store count, [FAQ](https://www.menutiger.com/faq)) | **Built** | — |
| **Modifier groups + order notes** (table stakes; 5 vendors share one data model, §4.1) | **Absent** | **Yes — top gap.** Every surveyed competitor has it; MENU TIGER pitches modifiers as +15–30% revenue per order (their claim, [add-ons guide](https://www.menutiger.com/blog/choices-and-add-ons-to-your-online-menu)); Toast markets "modifiers which can increase sales" ([MO&P Overview](https://support.toasttab.com/en/article/Mobile-Order-and-Pay-Overview)). The market spec in §4.1 is ready to copy. |
| **Item photos & descriptions** (table stakes, §4.2) | **Absent** | **Yes — second gap.** Universal capability; keep photos optional per item (sunday's text-only stance shows a photo-less menu is acceptable, but the *capability* is baseline). |
| **New-order sound/alert** (table stakes, §4.3) | **Absent** | **Yes — cheapest of the three to close.** Every documented competitor actively alerts; a silent polling dashboard risks missed orders during service, the exact failure me&u built persistent alarms for. |
| Kitchen prep/served tracking (KDS) | Backlogged | Market confirms: KDS/printer routing is the standard fulfillment channel (Square, Toast, me&u). Keep on backlog; printing may matter more first. |
| Thermal/ESC-POS printing | Backlogged | **Evidence raises priority relative to KDS:** even free-tier GloriaFood prints thermal from a phone app; MENU TIGER monetizes it at $20/mo; me&u ships a Printer Gateway as reliability backstop. Browser print is below the small-venue norm. |
| Resume order by re-scan / cart persistence | Backlogged | Market frames this as *round ordering/tabs* — a leader differentiator (Toast tabs, me&u "Another Round", Flipdish mid-meal reorders). Evidence supports keeping it high on the backlog for dine-in AOV. |
| Verified payment gateway | Backlogged (processing itself is a non-goal) | All 8 vendors process payments — it's their revenue model, and it's what makes tipping/split-bill/refund features possible. But GloriaFood, MENU TIGER, and Flipdish all support cash/pay-later QR ordering, so an order-first, settle-offline café flow is market-legitimate. What has **no market equivalent** is our unverified typed-reference online payment; MENU TIGER's cash pattern ("Not Paid" until staff manually mark paid, [ordering-flow doc](https://menutiger.helpscoutdocs.com/article/156-how-do-my-customers-place-an-order)) is the honest version of what we do — treating unverified online transfers *as cash* rather than as "paid" may be the cheap interim fix. |
| Order history / top-seller analytics | Backlogged | Analytics appear in 6 of 8 vendors (me&u "actionable sales and guest insights"; MENU TIGER dashboard metrics; qlub "built-in analytics"). Standard, not urgent — confirm backlog position. |
| Discounts / promotions | Backlogged | Marketed mainly as upsell/AI features by enterprise vendors (me&u, sunday); no evidence this is table stakes for a single café. Fine to defer. |
| Takeaway / order-ahead channel | Backlogged | Widely offered (GloriaFood, MENU TIGER, me&u order-ahead windows, Flipdish pre-ordering, Square, Toast). Common but a distinct channel; backlog position looks right. |
| Loyalty / reservations / reviews (non-goals) | Out of scope | Reviews/feedback funnels are common differentiators (me&u, sunday, qlub) but tied to their payments/marketing platforms; nothing here forces a rethink. |
| Multi-language menu | Not tracked | Three vendors ship it (MENU TIGER 19 languages, sunday auto-translate, me&u). Worth *adding to the backlog* if the pilot venue serves tourists; otherwise ignorable. |
| Dietary/allergen tags | Not tracked | Only me&u markets it prominently; qlub handles it via diner-side modifier. Second-tier; consider folding into the modifiers/photos work as an optional item tag later. |

**Strategic note (unverified):** multiple third-party migration guides report Oracle has issued an end-of-life notice for GloriaFood (retirement April 30, 2027, new signups closed) — e.g. [OlaClick](https://olaclick.com/en/news/gloriafood-shutting-down-what-restaurant-owners-need-to-do/), [Menuro](https://menuro.io/blog/gloriafood-shutting-down-2027/). **No primary Oracle/GloriaFood page confirming this was found; treat as unconfirmed.** If true: (a) don't model our roadmap on GloriaFood's free-tier economics — Oracle couldn't make them work either; (b) a large cohort of tiny venues using free QR ordering will need a new home in 2027.

---

## 6. Sources

All accessed **2026-08-04**. Fetch status: [fetched] = read directly; [snippet] = vendor page quoted via search excerpt (direct fetch returned HTTP 403); [unverified] = third-party only.

**Toast**
- https://support.toasttab.com/en/article/Mobile-Order-and-Pay-Overview [fetched]
- https://support.toasttab.com/en/article/Toast-Mobile-Order-and-Pay-FAQs [fetched]
- https://doc.toasttab.com/doc/platformguide/adminAddingModifierGroupsAndModifiers.html [fetched]
- https://support.toasttab.com/en/article/Adding-Images-to-Menu-Items-in-the-Menu [fetched]

**Square**
- https://squareup.com/help/us/en/article/7142-set-up-self-serve-ordering-and-qr-codes-with-square-online [fetched]
- https://squareup.com/us/en/online-ordering/qr-code-ordering [fetched]
- https://squareup.com/help/us/en/article/5119-create-and-manage-item-modifiers [fetched]
- https://squareup.com/help/us/en/article/8267-upload-images-to-your-item-library [snippet]

**me&u** (merged with Mr Yum, Sept 2023)
- https://www.meandu.com/us/serve/order-pay [fetched]
- https://meandu.helpjuice.com/en_US/153326-managing-venue-manager/901151-live-orders-feature [fetched]
- https://help.meandu.com/hc/en-us/articles/10242735770895-Modifier-Groups-in-more-detail [snippet]
- https://help.meandu.com/hc/en-us/articles/6539899621391-Getting-started-with-modifiers [snippet]
- https://help.meandu.com/hc/en-us/articles/6539923820175-Setting-up-conditional-modifiers [snippet]
- https://help.meandu.com/hc/en-us/articles/6539893658127-How-to-manage-your-orders-in-the-Live-Orders-page [snippet]
- https://help.meandu.com/hc/en-us/articles/6539900313615-Order-ahead-Windows-for-pick-up-and-delivery [snippet, title-level]
- https://www.meandu.com/blog/better-together [snippet]

**sunday** — all direct fetches blocked (403); claims are from search excerpts of these vendor pages
- https://sundayapp.com/ [snippet]
- https://sundayapp.com/order-and-pay/ [snippet]
- https://sundayapp.com/digital-menu/ [snippet]
- https://sundayapp.com/smart-menu/ [snippet, title-level]

**MENU TIGER**
- https://www.menutiger.com/features/table-side-in-restaurant-ordering [fetched]
- https://www.menutiger.com/faq [fetched]
- https://www.menutiger.com/blog/choices-and-add-ons-to-your-online-menu [fetched]
- https://menutiger.helpscoutdocs.com/article/156-how-do-my-customers-place-an-order [fetched]
- https://www.menutiger.com/blog/september-product-updates [snippet]

**GloriaFood** (Oracle-owned since 2021)
- https://www.gloriafood.com/qr-code-ordering-system-restaurant-menu [fetched]
- https://www.gloriafood.com/restaurant-order-taking-app [fetched]
- https://www.gloriafood.com/how-to-improve-restaurant-menu-addons [fetched]
- https://www.gloriafood.com/restaurant-ideas/taking-orders-with-mobile-ordering-app [snippet]
- https://www.gloriafood.com/pictures-in-menu-release-date [snippet]
- https://www.oracle.com/corporate/acquisitions/gloriafood/ [snippet]
- EOL reports (third-party, **unverified**): https://olaclick.com/en/news/gloriafood-shutting-down-what-restaurant-owners-need-to-do/ · https://menuro.io/blog/gloriafood-shutting-down-2027/

**Flipdish**
- https://www.flipdish.com/us/resources/blog/order-and-pay-at-table [fetched]
- https://help.flipdish.com/en/articles/9585244-table-specific-qr-codes [snippet]
- https://help.flipdish.com/en/articles/9585439-table-ordering-and-qr-code-faq [snippet, title-level]

**qlub**
- https://qlub.io/ae/en/order-and-pay [fetched]
- https://qlub.io/ae/en/pay-at-table [snippet]

**Lightspeed Restaurant** (alert-pattern reference only)
- https://resto-support.lightspeedhq.com/hc/en-us/articles/360019630933-Alert-sounds-for-takeout-and-delivery-orders [fetched]
