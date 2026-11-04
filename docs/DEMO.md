# Demo video script (2–3 minutes)

> The published video is at https://youtu.be/UON-xeeoFoY (1:31). It follows a tighter cut of this script and is built from [video/](../video/README.md).

Judges score "Works" against the pitch, so every clause gets something visible on screen:

| Pitch clause | Shown by |
| --- | --- |
| "Pay shielded ZEC from your Zcash wallet" | Zingo PC scans the ZIP 321 QR and sends a shielded payment |
| "get a gift card code delivered to your encrypted memo inbox" | Zingo PC → Messages: `Chupke #… delivered` / `Code: …` |
| "no account, no email" | The order form asks only for a reply address |
| "automatic refund if anything fails" | The $20 card (over the cap) or the failing test card is refunded, with the reason in the memo |
| "never charged twice" | A second payment for the same order is refunded ("This order was already paid"), and the dashboard shows `duplicate_skipped` |

## Before recording

1. The public URL is up: `/healthz` shows a fresh `lastTickAt` (see [DEPLOY.md](DEPLOY.md)).
2. Zingo PC is on **Testnet**, with a fresh wallet holding at least 0.1 TAZ.
3. The shop float is at least 0.2 TAZ; check it on the dashboard.
4. Three windows are open: the shop page, the dashboard (logged in), and Zingo PC on **Messages**.
5. Blocks take about 25–75 s. Record continuously and speed up the waits in editing (say so on screen).

## Script

1. **Hook (10 s).** Open the landing page on the hero (the phone with the QR and the memo bubble). "Chupke means
   'quietly'. You pay shielded ZEC and your gift card code arrives as an encrypted memo in your own wallet. No account,
   no email, refunds are automatic and you're never charged twice." Scroll past the live stats strip: these are real
   testnet numbers from the database.
2. **Shop (15 s).** Click **Buy a test card**. Show the four cards (each one demonstrates a path), the reply-address
   box and the "Shop online" line. "The only thing I give the shop is a fresh shielded address for my answer."
3. **Pay (30 s).** In Zingo PC, copy a new receive address and paste it. Click **Get payment QR**, then scan or click
   **Open in wallet**. Show the amount and the pre-filled memo (or paste the memo with **Copy memo**), and send.
4. **Watch (30 s).** The timeline moves from *Payment seen* (mempool) to *confirmed*, *Buying your gift card*,
   *Gift card bought* and *Code sent to your wallet*. "The agent checked the caps and the allowlist, bought the card
   on Bitrefill from the shop's own balance, and only then sent the code. This page never shows the code."
5. **Inbox (20 s).** In Zingo PC → Messages: `Chupke #<id> delivered / Test gift card / Code: …`.
   "Only my wallet can read this."
6. **Refund (25 s).** Order the **$20** test card. It's refused, because the cap is $10 per order with nobody to
   approve exceptions. The timeline shows *Refunded: Over the per-order limit*, and Zingo PC receives
   "…refund: Over the per-order limit / 0.02 TAZ returned. No purchase was made."
7. **Never twice (20 s).** On the dashboard, show the duplicate payment row with the `duplicate_skipped` event and its
   refund, and the `restart_ingest` event: "a full rescan re-saw every payment and bought nothing new."
8. **Privacy (10 s).** Point at "This payment address is used for this order only" under the QR, then show the
   *Who can see what* box. "Every order gets its own shop address. Reply addresses are deleted an hour after the order
   ends, and codes are never stored."
9. **Close (10 s).** "The buyer's ZEC pays Chupke; Chupke pays Bitrefill from its own balance: event credits today,
   batched ZEC to USDC in production. Built on Zcash testnet and Bitrefill REST v2 plus MCP."

## Don'ts

- Don't say Bitrefill accepted ZEC. It didn't; Chupke is the merchant of record.
- Don't show the real gift card code on screen. Blur it in Zingo PC if you record a real product.
- Don't show `RECOVERY.txt`, `.env` or the dashboard password.
