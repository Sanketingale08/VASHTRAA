# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin-double-click-guard.spec.ts >> AdminVendors — doAction double-click guard >> rapid double-click on Approve vendor fires exactly one POST
- Location: e2e/admin-double-click-guard.spec.ts:262:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button').filter({ hasText: /^Suspend$/i }).first()
Expected: visible
Timeout: 15000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for locator('button').filter({ hasText: /^Suspend$/i }).first()

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
  - heading "Vendor Management" [level=1]
  - paragraph: 1 vendors on the platform
  - button "all (1)"
  - button "pending (1)"
  - button "approved"
  - button "suspended"
  - textbox "Search name, email, GSTIN…"
  - table:
    - rowgroup:
      - row "# Shop Vendor ID Status Location GSTIN Products Orders Revenue Rating Actions":
        - columnheader "#"
        - columnheader "Shop"
        - columnheader "Vendor ID"
        - columnheader "Status"
        - columnheader "Location"
        - columnheader "GSTIN"
        - columnheader "Products"
        - columnheader "Orders"
        - columnheader "Revenue"
        - columnheader "Rating"
        - columnheader "Actions"
    - rowgroup:
      - row "1 Silk House Weaves silk@example.com — pending Varanasi, UP — 12 — — 4.2 Approve Reject ⭐ Feature View":
        - cell "1"
        - cell "Silk House Weaves silk@example.com":
          - button "Silk House Weaves"
          - text: silk@example.com
        - cell "—"
        - cell "pending"
        - cell "Varanasi, UP"
        - cell "—"
        - cell "12"
        - cell "—"
        - cell "—"
        - cell "4.2"
        - cell "Approve Reject ⭐ Feature View":
          - button "Approve"
          - button "Reject"
          - button "⭐ Feature"
          - button "View"
- region "Notifications (F8)":
  - list
```

# Test source

```ts
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
  262 |   test("rapid double-click on Approve vendor fires exactly one POST", async ({ page }) => {
  263 |     test.setTimeout(60_000);
  264 | 
  265 |     await seedAdminKey(page);
  266 | 
  267 |     await page.route("**/api/admin/vendors", (route) => {
  268 |       // Only intercept the list endpoint (GET), not vendor-specific sub-routes
  269 |       if (route.request().method() === "GET" && !route.request().url().match(/\/vendors\/[^/]+\//)) {
  270 |         return route.fulfill({
  271 |           status: 200,
  272 |           contentType: "application/json",
  273 |           body: JSON.stringify({ vendors: [pendingVendor] }),
  274 |         });
  275 |       }
  276 |       return route.continue();
  277 |     });
  278 | 
  279 |     let callCount = 0;
  280 | 
  281 |     await page.route(`**/api/admin/vendors/${VENDOR_ID}/approve`, async (route) => {
  282 |       if (route.request().method() !== "POST") {
  283 |         await route.continue();
  284 |         return;
  285 |       }
  286 |       callCount++;
  287 |       // Delay so the second click arrives while the first is in-flight
  288 |       await new Promise((r) => setTimeout(r, 350));
  289 |       await route.fulfill({
  290 |         status: 200,
  291 |         contentType: "application/json",
  292 |         body: JSON.stringify({ vendor: approvedVendor }),
  293 |       });
  294 |     });
  295 | 
  296 |     await page.goto("/admin/vendors");
  297 | 
  298 |     const approveBtn = page.locator("button", { hasText: /^Approve$/i }).first();
  299 |     await expect(approveBtn).toBeVisible({ timeout: 20_000 });
  300 | 
  301 |     await approveBtn.dblclick();
  302 | 
  303 |     // After approval the Suspend button replaces Approve
  304 |     await expect(
  305 |       page.locator("button", { hasText: /^Suspend$/i }).first(),
> 306 |     ).toBeVisible({ timeout: 15_000 });
      |       ^ Error: expect(locator).toBeVisible() failed
  307 | 
  308 |     expect(callCount).toBe(1);
  309 |   });
  310 | });
  311 | 
  312 | // ── AdminVendorDetail fixtures ──────────────────────────────────────────────
  313 | 
  314 | const pendingVendorDetail = {
  315 |   id: VENDOR_ID,
  316 |   name: "Silk House Weaves",
  317 |   location: "Varanasi, UP",
  318 |   rating: 4.2,
  319 |   sareesCount: 12,
  320 |   avatar: "/images/artisan-1.png",
  321 |   bio: null,
  322 |   tagline: null,
  323 |   contactEmail: "silk@example.com",
  324 |   gstin: null,
  325 |   status: "pending",
  326 |   ownerId: "owner-001",
  327 |   kycVerified: false,
  328 |   kycResubmissionRequested: false,
  329 |   mobile: null,
  330 |   panNumber: null,
  331 |   panCardUrl: null,
  332 |   gstCertUrl: null,
  333 |   bankHolder: null,
  334 |   bankName: null,
  335 |   bankAccount: null,
  336 |   bankIfsc: null,
  337 |   shopStreet: null,
  338 |   shopCity: null,
  339 |   shopState: null,
  340 |   shopPincode: null,
  341 |   termsAcceptedAt: null,
  342 |   featured: false,
  343 |   totalProducts: 12,
  344 |   activeProducts: 10,
  345 |   totalRevenue: 0,
  346 |   commissionEarned: 0,
  347 |   statusBreakdown: {},
  348 |   monthlyRevenue: [],
  349 |   vendorId: "VND-001",
  350 | };
  351 | 
  352 | const approvedVendorDetail = { ...pendingVendorDetail, status: "approved" };
  353 | const kycVerifiedVendorDetail = { ...pendingVendorDetail, kycVerified: true, kycResubmissionRequested: false };
  354 | 
  355 | // ── AdminVendorDetail — doAction ────────────────────────────────────────────
  356 | 
  357 | test.describe("AdminVendorDetail — doAction double-click guard", () => {
  358 |   test("rapid double-click on Approve Vendor fires exactly one POST", async ({ page }) => {
  359 |     test.setTimeout(60_000);
  360 | 
  361 |     await seedAdminKey(page);
  362 | 
  363 |     // Track current vendor state so the re-fetch after doAction sees updated data
  364 |     let currentVendorDetail = { ...pendingVendorDetail };
  365 | 
  366 |     // Stub the vendor detail endpoint (also handles polling re-fetches)
  367 |     await page.route(`**/api/admin/vendors/${VENDOR_ID}`, async (route) => {
  368 |       if (route.request().method() !== "GET") {
  369 |         await route.continue();
  370 |         return;
  371 |       }
  372 |       await route.fulfill({
  373 |         status: 200,
  374 |         contentType: "application/json",
  375 |         body: JSON.stringify(currentVendorDetail),
  376 |       });
  377 |     });
  378 | 
  379 |     let callCount = 0;
  380 | 
  381 |     await page.route(`**/api/admin/vendors/${VENDOR_ID}/approve`, async (route) => {
  382 |       if (route.request().method() !== "POST") {
  383 |         await route.continue();
  384 |         return;
  385 |       }
  386 |       callCount++;
  387 |       // Hold the response so the second click fires while the first is in-flight
  388 |       await new Promise((r) => setTimeout(r, 350));
  389 |       // Advance shared state so the subsequent loadVendor() GET returns approved data
  390 |       currentVendorDetail = { ...approvedVendorDetail };
  391 |       await route.fulfill({
  392 |         status: 200,
  393 |         contentType: "application/json",
  394 |         body: JSON.stringify({ vendor: approvedVendorDetail }),
  395 |       });
  396 |     });
  397 | 
  398 |     await page.goto(`/admin/vendors/${VENDOR_ID}`);
  399 | 
  400 |     const approveBtn = page.locator("button", { hasText: /Approve Vendor/i }).first();
  401 |     await expect(approveBtn).toBeVisible({ timeout: 20_000 });
  402 | 
  403 |     await approveBtn.dblclick();
  404 | 
  405 |     // After approval, Suspend Vendor button replaces the Approve Vendor button
  406 |     await expect(
```