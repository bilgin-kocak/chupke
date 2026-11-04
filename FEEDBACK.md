# Bitrefill integration feedback

Dated friction log (IST), kept while building Chupke on Bitrefill REST v2. Each entry has three parts:
what we tried, what happened, and what we expected. At M4 it gets cleaned up into "what worked" and
"what didn't".

## Log

### 2026-11-04 12:05: base URL
- **Tried:** `GET https://api.bitrefill.com/v2/ping` and `GET https://api-bitrefill.com/v2/ping` without a key,
  because the brief says the OpenAPI document shows `api-bitrefill.com`.
- **Happened:** both hosts answer `401 {"message":"Authorization token not found","status":"no_token"}`.
  The Quickstart uses `https://api.bitrefill.com/v2`.
- **Expected:** a single documented host. Having two live hosts plus an OpenAPI `servers` entry that
  differs from the guides leaves an integrator unsure which one is canonical. We use `api.bitrefill.com`, as the guides do.

### 2026-11-04 12:20: auth scheme
- **Tried:** reading the Quickstart to wire auth.
- **Happened:** it shows `Authorization: Bearer <key>`, with a comment "or use Basic auth for Business API".
- **Expected:** a one-line statement of which key type uses which scheme, and how to tell them apart from the
  key's format. A hackathon participant can't easily tell which kind of key they were given.

### 2026-11-04 12:20: test products
- **Tried:** the "Test products" docs page.
- **Happened:** it is clear and short: six product ids (`test-gift-card-code`, `-link`, `-phone-refill`
  and their `-fail` twins), free with `payment_method=balance`, hidden unless `include_test_products=true`.
- **Expected:** this is good as written. Live verification is pending the API key.

### 2026-11-04 12:55: first authenticated calls
- **Tried:** `GET /ping` and `GET /accounts/balance` with a personal API key as a Bearer token.
- **Happened:** `{"meta":{"_endpoint":"/ping"},"message":"pong"}`, then the balance came back as `{"balance":0,"currency":"BTC"}`.
- **Expected:** this worked first time. The friction is that the account is denominated in BTC while every
  product is priced in fiat, and the unit of `price` isn't labeled: it's an integer (13456 for a $10 card), so
  apparently satoshis next to `"currency":"BTC"`. An explicit `price_unit` or `price_sats` would remove the guesswork.

### 2026-11-04 12:55: test products and package ids
- **Tried:** `GET /products/search?q=test&include_test_products=true` and `GET /products/test-gift-card-code?include_test_products=true`.
- **Happened:** the test products were visible straight away; nothing had to be enabled on the key.
  `test-gift-card-code` is ranged ($10–100 in steps of 10, `price_rate` ≈ 1345 sats/USD) and also lists
  packages whose ids look like `test-gift-card-code<&>10`.
- **Expected:** a cheaper minimum for test products, because $10 per test order eats a $30/day guardrail
  in 3 tests. The `<&>` separator inside ids is unusual. It's fine in JSON, but worth documenting as an opaque
  string so integrators don't try to build ids themselves.

### 2026-11-04 12:56: invoice lifecycle and statuses
- **Tried:** create (`payment_method:"balance"`, `auto_pay:false`), then pay, then poll, for `test-gift-card-code<&>10`.
- **Happened:**
  - Create returned `status:"not_delivered"`, `payment.status:"unpaid"`, with one order `created`.
  - `POST /pay` returned 200, but its body still said `payment.status:"unpaid"`.
  - The next `GET` showed `payment_confirmed` and the order `delivered`.
  - A few seconds later the invoice read `status:"all_delivered"` and `payment.status:"complete"`.
  - The whole flow took about 1.2 s and the balance stayed 0, since test products are free.
- **Expected:**
  - The documented invoice statuses (unpaid, payment_detected, …) actually live on `payment.status`.
    The top-level `status` holds delivery states (`not_delivered`, `all_delivered`), which aren't in the
    docs we read. A table of both fields would help.
  - The 200 from `/pay` with a stale `unpaid` body is surprising. We treat the 200 as paid and confirm
    with `GET`.

### 2026-11-04 13:43: failure statuses not in the docs (found by the live refund suite)
- **Tried:** buying `test-gift-card-code-fail<&>10` (create, pay, poll) and waiting for a documented failure state.
- **Happened:** the invoice settled at `status:"all_error"` with `payment.status:"complete"`, and its order at
  `status:"permanent_failure"`. Neither value is in the documented lists: invoice blocked/denied/payment_error,
  order failed/refunded. Our worker kept polling a dead order, and the buyer's refund didn't start.
- **Expected:** a complete, documented list of terminal order and invoice states, so failure handling can't
  silently miss one. We now treat `all_error` and `permanent_failure` (plus error/cancelled) as failures,
  and we raise a "stuck" event for any paid order that stays unresolved for 15 minutes.

### 2026-11-04 12:56: redemption data inside invoices
- **Tried:** polling `GET /invoices/{id}` for delivery status.
- **Happened:** each order in the invoice response carries `redemption_info`, so the gift card secret travels
  in every status poll. `GET /orders/{id}` returns `redemption_info` as an **object** (code plus instructions),
  which matches the agent skill. The OpenAPI document calls it a string.
- **Expected:** a way to poll status without the secrets (for example `?include_redemption=false`), and an
  OpenAPI schema that matches the object. We strip the field at parse time so codes never sit on invoice objects.
