# Bitrefill integration feedback

Written while building Chupke (an autonomous purchasing worker on REST v2, plus an MCP catalog script) on
Wed 4 Nov 2026. The summary comes first; the dated log, with what we tried, what happened and what we expected,
is below.

## What worked

- **The core purchase flow works first time**:
  - `POST /invoices` with `payment_method: "balance"` and `auto_pay: false`, then `POST /invoices/{id}/pay`,
    then `GET /invoices/{id}`, then `GET /orders/{id}`.
  - A test card went from create to delivered in about 1.2 s.
  - Separating "create" (moves no money) from "pay" (moves money) is exactly what an exactly-once agent needs:
    we save the invoice id, commit "paying", then pay, and on resume we look before paying again.
- **Free test products** (`test-gift-card-code`, `-fail`) that are visible with `include_test_products=true`, with
  nothing to enable on the key. They let us run the whole success and failure matrix on real APIs without spending.
- **Clear auth errors** (`401 {"message":"Authorization token not found","status":"no_token"}`) and a short,
  accurate Test products page.
- **The hosted MCP server accepts the same API key.** `get-product-details` with `currency: "USD"` returns real USD
  prices, which made MCP a good discovery and pricing layer in front of REST purchasing.
- **The docs' `llms.txt` index** was easy for a coding agent to navigate (append `.md` to any page).
- **Rate limits are enforced with a real `Retry-After`.** Going over the `/ping` limit gave `429` with
  `Retry-After: 2`–`3` and `ratelimit-remaining`, so a client can wait exactly as long as it needs to.

## What didn't

1. **Terminal states aren't fully documented.** A failing order ends at invoice `all_error` and order
   `permanent_failure`. Neither is in the documented lists, so our worker polled a dead order until we noticed.
   A complete table of invoice `status`, invoice `payment.status` and order `status` values, marked terminal or
   not, would prevent silent hangs.
2. **The two status fields are easy to confuse.** The documented invoice statuses (unpaid…complete) live on
   `payment.status`, while the top-level `status` holds delivery states (`not_delivered`, `all_delivered`,
   `all_error`). The `POST /pay` 200 response still showed `payment.status: "unpaid"`.
3. **Redemption secrets ride along in status polls.** `GET /invoices/{id}` embeds every order's `redemption_info`,
   and the OpenAPI calls `redemption_info` a string while it is really an object. We'd like an option to exclude
   secrets from status polling, and a schema that matches.
4. **Price units are unlabeled.** The account balance is in BTC, and prices are integers (13456 for $10), apparently
   satoshis. A `price_unit` or USD amount in REST product details would help; MCP already provides it.
5. **Test products are $10 minimum.** That uses up a $30/day guardrail in three test runs. A $1 test denomination
   would help agent developers.
6. **Small doc gaps:**
   - Two live API hosts (`api.bitrefill.com` and `api-bitrefill.com`).
   - Bearer versus Basic auth depends on the key type, which isn't obvious from the key.
   - The MCP examples omit the required `intent` argument of `search-products`.

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

### 2026-11-04 14:00: hosted MCP server for catalog discovery
- **Tried:** `tools/list`, then `search-products` and `get-product-details` on `https://api.bitrefill.com/mcp`
  (stateless JSON-RPC over HTTP), authenticated with the same personal API key as REST.
- **Happened:**
  - `tools/list` returned 12 tools, so the key was accepted (guests see 7).
  - The first `search-products` call failed: `Invalid input: expected string, received undefined at intent`. The
    examples on the eCommerce MCP page show `search-products(query="Amazon", country="US")` without an `intent`,
    but the schema marks it required.
  - Read tools answer in TOON. `get-product-details` with `currency: "USD"` gave each denomination's real USD
    price (₹100 Google Play India = $1.14), which REST v2 doesn't give directly (it gives BTC sats).
- **Expected:** examples that include the required `intent`. Otherwise this is a great fit: MCP for discovery and
  USD pricing, and REST v2 for the exact `package_id` the worker buys with. Our `scripts/mcp-catalog.ts`
  combines the two and proposes allowlist entries for a human to approve.

### 2026-11-04 16:00: rate limits, live
- **Tried:** four raw `GET /ping` back to back, then three concurrent pings through our client with its own spacing
  switched off.
- **Happened:** `200`, then `429` three times with `Retry-After` 3, 2 and 3 s (`ratelimit-remaining: 0` throughout).
  Our client waited each `Retry-After`, retried, and gave up cleanly after 3 retries on the call that kept losing.
- **Expected:** this is what we hoped for. A `ratelimit-reset` header or a documented header list would let a
  client plan ahead instead of reacting, and a note on whether the 60-per-10-minutes limit is per key or per IP.

### 2026-11-04 12:56: redemption data inside invoices
- **Tried:** polling `GET /invoices/{id}` for delivery status.
- **Happened:** each order in the invoice response carries `redemption_info`, so the gift card secret travels
  in every status poll. `GET /orders/{id}` returns `redemption_info` as an **object** (code plus instructions),
  which matches the agent skill. The OpenAPI document calls it a string.
- **Expected:** a way to poll status without the secrets (for example `?include_redemption=false`), and an
  OpenAPI schema that matches the object. We strip the field at parse time so codes never sit on invoice objects.
