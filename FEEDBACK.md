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
