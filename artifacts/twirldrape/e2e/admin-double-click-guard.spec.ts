/**
 * Admin action-button double-click guard — E2E Playwright tests.
 *
 * Each admin page (AdminReturns, AdminVendors) holds an in-flight Set keyed by
 * orderId+action.  Calling the same action while it is still in-flight is a
 * no-op, so a rapid double-click must result in exactly ONE network request.
 *
 * Strategy
 * ─────────
 * 1. Seed `td_admin_key` into sessionStorage via addInitScript.
 * 2. Stub the list endpoint so the page renders immediately.
 * 3. Stub the action endpoint with a deliberate delay (≥300 ms) so the second
 *    synthetic click fires before the first request resolves.
 * 4. Double-click the button with page.dblclick().
 * 5. Assert the call counter is exactly 1.
 *
 * Covered:
 *   - AdminReturns → reviewReturn (Approve return)
 *   - AdminReturns → reviewReturn (Reject return)
 *   - AdminReturns → reviewRefund (Approve refund)
 *   - AdminVendors → doAction (Approve vendor)
 */

import { test, expect } from "@playwright/test";

// ── shared test fixtures ────────────────────────────────────────────────────

const ORDER_ID = "e2e-dblclick-order-001";
const VENDOR_ID = "e2e-dblclick-vendor-001";

const returnRequestedOrder = {
  id: ORDER_ID,
  displayId: "DLK-001",
  userId: "e2e-buyer-001",
  status: "return_requested",
  refundStatus: null,
  refundMethod: null,
  refundProcessedAt: null,
  refundReference: null,
  returnReason: JSON.stringify({ reason: "Wrong item received" }),
  items: [
    {
      productId: "prod-001",
      name: "Kanjivaram Silk Saree",
      price: 1200000,
      quantity: 1,
      images: [],
      vendorName: "Silk House",
    },
  ],
  address: {
    name: "Priya Sharma",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  total: 1200000,
  returnRequestedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

/** Order sitting at refund pending (admin has already approved the return) */
const refundPendingOrder = {
  ...returnRequestedOrder,
  status: "return_approved",
  refundStatus: "pending",
  refundMethod: "original_payment",
};

const approvedReturnOrder = {
  ...returnRequestedOrder,
  status: "return_approved",
  updatedAt: new Date().toISOString(),
};

const rejectedReturnOrder = {
  ...returnRequestedOrder,
  status: "return_rejected",
  updatedAt: new Date().toISOString(),
};

const approvedRefundOrder = {
  ...refundPendingOrder,
  refundStatus: "approved",
  updatedAt: new Date().toISOString(),
};

const pendingVendor = {
  id: VENDOR_ID,
  name: "Silk House Weaves",
  location: "Varanasi, UP",
  status: "pending",
  gstin: null,
  contactEmail: "silk@example.com",
  rating: 4.2,
  sareesCount: 12,
  revenue: 0,
  totalOrders: 0,
  kycVerified: false,
  featured: false,
};

const approvedVendor = { ...pendingVendor, status: "approved" };

/** Seeds the admin key before page load. */
function seedAdminKey(page: import("@playwright/test").Page) {
  const key = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  return page.addInitScript((k: string) => {
    sessionStorage.setItem("td_admin_key", k);
  }, key);
}

// ── AdminReturns — reviewReturn ─────────────────────────────────────────────

test.describe("AdminReturns — reviewReturn double-click guard", () => {
  test("rapid double-click on Approve return fires exactly one POST", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    await page.route("**/api/admin/returns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [returnRequestedOrder] }),
      }),
    );

    let callCount = 0;

    await page.route(`**/api/admin/orders/${ORDER_ID}/return`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      callCount++;
      // Hold the response so the second click arrives while the first is in-flight.
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: approvedReturnOrder }),
      });
    });

    await page.goto("/admin/returns");

    const approveBtn = page.locator("button", { hasText: /Approve return/i }).first();
    await expect(approveBtn).toBeVisible({ timeout: 20_000 });

    await approveBtn.dblclick();

    // Wait for the UI to reflect the update (status pill changes)
    await expect(
      page.locator("span", { hasText: /return approved/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    expect(callCount).toBe(1);
  });

  test("rapid double-click on Reject return fires exactly one POST", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    await page.route("**/api/admin/returns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [returnRequestedOrder] }),
      }),
    );

    let callCount = 0;

    await page.route(`**/api/admin/orders/${ORDER_ID}/return`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      callCount++;
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: rejectedReturnOrder }),
      });
    });

    await page.goto("/admin/returns");

    const rejectBtn = page.locator("button", { hasText: /Reject return/i }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 20_000 });

    await rejectBtn.dblclick();

    // Wait for the UI to reflect the rejected status
    await expect(
      page.locator("span", { hasText: /return rejected/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    expect(callCount).toBe(1);
  });
});

// ── AdminReturns — reviewRefund ─────────────────────────────────────────────

test.describe("AdminReturns — reviewRefund double-click guard", () => {
  test("rapid double-click on Approve refund fires exactly one POST", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    await page.route("**/api/admin/returns", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [refundPendingOrder] }),
      }),
    );

    let callCount = 0;

    await page.route(`**/api/admin/orders/${ORDER_ID}/refund`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      callCount++;
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: approvedRefundOrder }),
      });
    });

    await page.goto("/admin/returns");

    const approveRefundBtn = page.locator("button", { hasText: /Approve refund/i }).first();
    await expect(approveRefundBtn).toBeVisible({ timeout: 20_000 });

    await approveRefundBtn.dblclick();

    // After approval the "Mark payout done" button should appear
    await expect(
      page.locator("button", { hasText: /Mark payout done/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    expect(callCount).toBe(1);
  });
});

// ── AdminVendors — doAction ─────────────────────────────────────────────────

test.describe("AdminVendors — doAction double-click guard", () => {
  test("rapid double-click on Approve vendor fires exactly one POST", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    await page.route("**/api/admin/vendors", (route) => {
      // Only intercept the list endpoint (GET), not vendor-specific sub-routes
      if (route.request().method() === "GET" && !route.request().url().match(/\/vendors\/[^/]+\//)) {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ vendors: [pendingVendor] }),
        });
      }
      return route.continue();
    });

    let callCount = 0;

    await page.route(`**/api/admin/vendors/${VENDOR_ID}/approve`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      callCount++;
      // Delay so the second click arrives while the first is in-flight
      await new Promise((r) => setTimeout(r, 350));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ vendor: approvedVendor }),
      });
    });

    await page.goto("/admin/vendors");

    const approveBtn = page.locator("button", { hasText: /^Approve$/i }).first();
    await expect(approveBtn).toBeVisible({ timeout: 20_000 });

    await approveBtn.dblclick();

    // After approval the Suspend button replaces Approve
    await expect(
      page.locator("button", { hasText: /^Suspend$/i }).first(),
    ).toBeVisible({ timeout: 15_000 });

    expect(callCount).toBe(1);
  });
});
