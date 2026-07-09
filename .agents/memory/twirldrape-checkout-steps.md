---
name: TwirlDrape mobile checkout step layout
description: Where coupon UI lives in the 4-step checkout flow, and how to reach the API from Playwright e2e tests
---

## Checkout step layout
`artifacts/twirldrape-mobile/app/checkout.tsx` renders steps as `step === 1` (Address), `step === 2` (Delivery), `step === 3` (Payment Method), `step === 4` (Review Order). The "Apply Coupon" input and applied-coupon banner render inside step 4 (Review), not step 3 (Payment).

**Why:** An e2e test that tries to fill the coupon input while still on the Payment Method step (step 3) will time out waiting for a locator that isn't mounted yet — the input only exists after clicking `checkout-continue-3`.

**How to apply:** In checkout e2e flows, select payment method and click `checkout-continue-3` first, wait for "Review Order" text, then interact with the coupon input (`input[placeholder="Enter coupon code"]`) and the "Apply" button.

## Reaching the API from Playwright tests
Don't guess the api-server's internal port (it can vary — e.g. it was observed listening on 8080 while a stale `.replit` workflow definition also claimed port 3001). Instead hit the shared Replit proxy at `http://localhost:80/api/...`, which reliably routes to whichever port the api-server artifact is actually bound to.

**Why:** Hardcoded port-replacement tricks (e.g. swapping `:24295` for `:3001` in the mobile app's BASE_URL) broke when the actual api-server workflow moved to a different internal port; the legacy `.replit` "API Server" workflow definition (PORT=3001) conflicted with the new artifact-based workflow and failed to start.

**How to apply:** For new Playwright specs needing direct API calls (product lookups, admin endpoints), use `API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://localhost:80"` and call `${API_BASE}/api/...`.
