---
name: E2E stock-aware product selection
description: Why checkout E2E tests must pick an in-stock product via API rather than clicking the first explore-page card
---

## Rule
All E2E tests that need to add a product to cart must call `GET /api/products`, find the first item with `stock > 0`, and navigate directly to `/product/:id`. Never click `page.locator("text=/₹[\\d,]+/").first()` — that card position is not guaranteed to be in stock.

**Why:** The API (orders.ts) reduces product stock on each successful order. During repeated test runs the first-listed product on the explore page can reach `stock = 0`, causing POST /api/orders → 400 "out of stock" with no UI error surfaced to the test. Auth works fine (200 from /api/addresses) so the 400 looks mysterious until you check the DB.

**How to apply:** In `addFirstProductToCart`, Buy Now path, and any `fillAndPlaceOrder` helper — use `page.request.get("http://localhost:3001/api/products")`, parse the flat array response, find `p.stock > 0`, then `page.goto(BASE_URL + "/product/" + inStock.id)`.
