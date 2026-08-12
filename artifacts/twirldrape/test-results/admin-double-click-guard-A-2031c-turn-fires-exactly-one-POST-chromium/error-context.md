# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-double-click-guard.spec.ts >> AdminReturns — reviewReturn double-click guard >> rapid double-click on Approve return fires exactly one POST
- Location: e2e/admin-double-click-guard.spec.ts:121:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('span').filter({ hasText: /return approved/i }).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('span').filter({ hasText: /return approved/i }).first()

```

```yaml
- complementary:
  - text: Super Admin TwirlDrape Portal
  - navigation:
    - button "Dashboard"
    - button "Vendors"
    - button "Vendor Analytics"
    - button "Business Intelligence"
    - button "Financial Management"
    - button "Orders"
    - button "Returns & Refunds"
    - button "Seller Disputes"
    - button "Coupons"
    - button "Support"
    - button "Notifications"
    - button "About Page"
    - button "Hero Banners"
    - button "Products"
    - button "Reports"
    - button "Settings"
  - button "Sign out"
- banner:
  - button "Notifications"
  - text: A Super Admin
- main:
  - heading "Returns & Refunds" [level=1]
  - paragraph: Review and act on customer return and refund requests
  - button "Oldest first"
  - button "Export PDF"
  - button "Export CSV"
  - textbox "Search by order ID, customer name, or item…"
  - button "all (1)"
  - button "returns (1)"
  - button "refunds (0)"
  - text: "#DLK-001 Priya Sharma return requested Kanjivaram Silk Saree Total ₹12,000 · Requested 10/8/2026, 3:54:17 pm (2 days ago) · Updated 10/8/2026, 3:54:17 pm Return reason: Wrong item received"
  - textbox "Optional note…"
  - button "Approve return"
  - button "Reject return"
- region "Notifications (F8)":
  - list
```

# Test source

```ts
  61  |   total: 1200000,
  62  |   returnRequestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  63  |   createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  64  |   updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  65  | };
  66  | 
  67  | /** Order sitting at refund pending (admin has already approved the return) */
  68  | const refundPendingOrder = {
  69  |   ...returnRequestedOrder,
  70  |   status: "return_approved",
  71  |   refundStatus: "pending",
  72  |   refundMethod: "original_payment",
  73  | };
  74  | 
  75  | const approvedReturnOrder = {
  76  |   ...returnRequestedOrder,
  77  |   status: "return_approved",
  78  |   updatedAt: new Date().toISOString(),
  79  | };
  80  | 
  81  | const rejectedReturnOrder = {
  82  |   ...returnRequestedOrder,
  83  |   status: "return_rejected",
  84  |   updatedAt: new Date().toISOString(),
  85  | };
  86  | 
  87  | const approvedRefundOrder = {
  88  |   ...refundPendingOrder,
  89  |   refundStatus: "approved",
  90  |   updatedAt: new Date().toISOString(),
  91  | };
  92  | 
  93  | const pendingVendor = {
  94  |   id: VENDOR_ID,
  95  |   name: "Silk House Weaves",
  96  |   location: "Varanasi, UP",
  97  |   status: "pending",
  98  |   gstin: null,
  99  |   contactEmail: "silk@example.com",
  100 |   rating: 4.2,
  101 |   sareesCount: 12,
  102 |   revenue: 0,
  103 |   totalOrders: 0,
  104 |   kycVerified: false,
  105 |   featured: false,
  106 | };
  107 | 
  108 | const approvedVendor = { ...pendingVendor, status: "approved" };
  109 | 
  110 | /** Seeds the admin key before page load. */
  111 | function seedAdminKey(page: import("@playwright/test").Page) {
  112 |   const key = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  113 |   return page.addInitScript((k: string) => {
  114 |     sessionStorage.setItem("td_admin_key", k);
  115 |   }, key);
  116 | }
  117 | 
  118 | // ── AdminReturns — reviewReturn ─────────────────────────────────────────────
  119 | 
  120 | test.describe("AdminReturns — reviewReturn double-click guard", () => {
  121 |   test("rapid double-click on Approve return fires exactly one POST", async ({ page }) => {
  122 |     test.setTimeout(60_000);
  123 | 
  124 |     await seedAdminKey(page);
  125 | 
  126 |     await page.route("**/api/admin/returns", (route) =>
  127 |       route.fulfill({
  128 |         status: 200,
  129 |         contentType: "application/json",
  130 |         body: JSON.stringify({ orders: [returnRequestedOrder] }),
  131 |       }),
  132 |     );
  133 | 
  134 |     let callCount = 0;
  135 | 
  136 |     await page.route(`**/api/admin/orders/${ORDER_ID}/return`, async (route) => {
  137 |       if (route.request().method() !== "POST") {
  138 |         await route.continue();
  139 |         return;
  140 |       }
  141 |       callCount++;
  142 |       // Hold the response so the second click arrives while the first is in-flight.
  143 |       await new Promise((r) => setTimeout(r, 350));
  144 |       await route.fulfill({
  145 |         status: 200,
  146 |         contentType: "application/json",
  147 |         body: JSON.stringify({ order: approvedReturnOrder }),
  148 |       });
  149 |     });
  150 | 
  151 |     await page.goto("/admin/returns");
  152 | 
  153 |     const approveBtn = page.locator("button", { hasText: /Approve return/i }).first();
  154 |     await expect(approveBtn).toBeVisible({ timeout: 20_000 });
  155 | 
  156 |     await approveBtn.dblclick();
  157 | 
  158 |     // Wait for the UI to reflect the update (status pill changes)
  159 |     await expect(
  160 |       page.locator("span", { hasText: /return approved/i }).first(),
> 161 |     ).toBeVisible({ timeout: 15_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  162 | 
  163 |     expect(callCount).toBe(1);
  164 |   });
  165 | 
  166 |   test("rapid double-click on Reject return fires exactly one POST", async ({ page }) => {
  167 |     test.setTimeout(60_000);
  168 | 
  169 |     await seedAdminKey(page);
  170 | 
  171 |     await page.route("**/api/admin/returns", (route) =>
  172 |       route.fulfill({
  173 |         status: 200,
  174 |         contentType: "application/json",
  175 |         body: JSON.stringify({ orders: [returnRequestedOrder] }),
  176 |       }),
  177 |     );
  178 | 
  179 |     let callCount = 0;
  180 | 
  181 |     await page.route(`**/api/admin/orders/${ORDER_ID}/return`, async (route) => {
  182 |       if (route.request().method() !== "POST") {
  183 |         await route.continue();
  184 |         return;
  185 |       }
  186 |       callCount++;
  187 |       await new Promise((r) => setTimeout(r, 350));
  188 |       await route.fulfill({
  189 |         status: 200,
  190 |         contentType: "application/json",
  191 |         body: JSON.stringify({ order: rejectedReturnOrder }),
  192 |       });
  193 |     });
  194 | 
  195 |     await page.goto("/admin/returns");
  196 | 
  197 |     const rejectBtn = page.locator("button", { hasText: /Reject return/i }).first();
  198 |     await expect(rejectBtn).toBeVisible({ timeout: 20_000 });
  199 | 
  200 |     await rejectBtn.dblclick();
  201 | 
  202 |     // Wait for the UI to reflect the rejected status
  203 |     await expect(
  204 |       page.locator("span", { hasText: /return rejected/i }).first(),
  205 |     ).toBeVisible({ timeout: 15_000 });
  206 | 
  207 |     expect(callCount).toBe(1);
  208 |   });
  209 | });
  210 | 
  211 | // ── AdminReturns — reviewRefund ─────────────────────────────────────────────
  212 | 
  213 | test.describe("AdminReturns — reviewRefund double-click guard", () => {
  214 |   test("rapid double-click on Approve refund fires exactly one POST", async ({ page }) => {
  215 |     test.setTimeout(60_000);
  216 | 
  217 |     await seedAdminKey(page);
  218 | 
  219 |     await page.route("**/api/admin/returns", (route) =>
  220 |       route.fulfill({
  221 |         status: 200,
  222 |         contentType: "application/json",
  223 |         body: JSON.stringify({ orders: [refundPendingOrder] }),
  224 |       }),
  225 |     );
  226 | 
  227 |     let callCount = 0;
  228 | 
  229 |     await page.route(`**/api/admin/orders/${ORDER_ID}/refund`, async (route) => {
  230 |       if (route.request().method() !== "POST") {
  231 |         await route.continue();
  232 |         return;
  233 |       }
  234 |       callCount++;
  235 |       await new Promise((r) => setTimeout(r, 350));
  236 |       await route.fulfill({
  237 |         status: 200,
  238 |         contentType: "application/json",
  239 |         body: JSON.stringify({ order: approvedRefundOrder }),
  240 |       });
  241 |     });
  242 | 
  243 |     await page.goto("/admin/returns");
  244 | 
  245 |     const approveRefundBtn = page.locator("button", { hasText: /Approve refund/i }).first();
  246 |     await expect(approveRefundBtn).toBeVisible({ timeout: 20_000 });
  247 | 
  248 |     await approveRefundBtn.dblclick();
  249 | 
  250 |     // After approval the "Mark payout done" button should appear
  251 |     await expect(
  252 |       page.locator("button", { hasText: /Mark payout done/i }).first(),
  253 |     ).toBeVisible({ timeout: 15_000 });
  254 | 
  255 |     expect(callCount).toBe(1);
  256 |   });
  257 | });
  258 | 
  259 | // ── AdminVendors — doAction ─────────────────────────────────────────────────
  260 | 
  261 | test.describe("AdminVendors — doAction double-click guard", () => {
```