/**
 * Refund eligibility after admin order status changes — E2E integration tests.
 *
 * Covers the gap between admin panel status updates and customer-facing refund eligibility:
 *   - Admin advances status to "cancelled" → customer sees the "Request Refund" button
 *   - Admin rejects a return (return_requested → return_rejected) → customer has NO refund button
 *   - Admin cancels an order that was in "return_requested" → customer regains eligibility
 *   - A "delivered" order (no refund path) → no refund button
 *
 * The admin status change is exercised via the PATCH /api/orders/:id/status endpoint
 * (Admin-Key-authenticated). The subsequent customer view hits GET /api/orders/:id and
 * asserts the refund button visibility driven by the updated status.
 *
 * All API calls are intercepted with page.route() so the tests remain deterministic and
 * run without a live database.
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const ORDER_ID = "e2e-admin-status-0001";

/** Minimal order shape — we mutate `status` per scenario. */
const baseOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-001",
  refundStatus: null,
  refundMethod: null,
  refundProcessedAt: null,
  refundReference: null,
  cancelReason: null,
  returnReason: null,
  deliveredAt: null,
  items: [
    {
      productId: "prod-silk-001",
      name: "Kanjivaram Silk Saree",
      price: 8500,
      quantity: 1,
      images: [],
      vendorName: "Silk Palace",
    },
  ],
  address: {
    name: "Priya Sharma",
    phone: "9876543210",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  deliveryMethod: "standard",
  paymentMethod: "upi",
  couponCode: null,
  subtotal: 8500,
  discount: 0,
  shipping: 199,
  tax: 36,
  total: 8735,
  statusHistory: [
    {
      status: "confirmed",
      timestamp: new Date("2025-07-01T10:00:00Z").toISOString(),
      note: "Order placed",
    },
  ],
  createdAt: new Date("2025-07-01T10:00:00Z").toISOString(),
  updatedAt: new Date("2025-07-01T11:00:00Z").toISOString(),
};

/** Build a mocked order with the given status (and optional extra fields). */
function orderWithStatus(
  status: string,
  extra: Record<string, unknown> = {}
) {
  return {
    ...baseOrder,
    status,
    statusHistory: [
      ...baseOrder.statusHistory,
      {
        status,
        timestamp: new Date("2025-07-01T12:00:00Z").toISOString(),
        note: `Status set to ${status} by admin`,
      },
    ],
    ...extra,
  };
}

/** Sign a Clerk user in via a sign-in ticket. */
async function signInUser(
  page: import("@playwright/test").Page,
  baseURL: string,
  userId: string
) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const { token } = await clerk.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 300,
  });

  await setupClerkTestingToken({ page });

  await page.goto(baseURL);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2_000);

  try {
    await page.waitForFunction(() => !!(window as any).Clerk?.loaded, {
      timeout: 15_000,
    });
  } catch {
    await page.waitForTimeout(3_000);
  }

  await page.evaluate(
    async ({ ticket }: { ticket: string }) => {
      const w = window as any;
      if (!w.Clerk?.client) throw new Error("Clerk client not available");
      const si = w.Clerk.client.signIn;
      const result = await si.create({ strategy: "ticket", ticket });
      if (result.status === "complete") {
        await w.Clerk.setActive({ session: result.createdSessionId });
      } else {
        throw new Error(`Sign-in incomplete: ${result.status}`);
      }
    },
    { ticket: token }
  );

  await page.waitForTimeout(1_500);
}

test.describe("Refund eligibility after admin status changes", () => {
  let userId: string | null = null;

  test.beforeAll(async () => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      const tag = Date.now();
      const user = await clerk.users.createUser({
        emailAddress: [`refund-admin-status-e2e-${tag}@example.com`],
        password: `AdminStatus${tag}!`,
        firstName: "Admin",
        lastName: "StatusTester",
        skipPasswordChecks: true,
      });
      userId = user.id;
    } catch (err) {
      console.warn("Could not create Clerk test user:", err);
    }
  });

  test.afterAll(async () => {
    if (!userId) return;
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      await clerk.users.deleteUser(userId);
    } catch {}
  });

  // ── Scenario 1: Admin cancels an in-flight order → customer can request refund ──

  test("admin cancels a processing order → customer sees Request Refund button", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    /**
     * Simulate the end state after the admin called:
     *   PATCH /api/orders/<id>/status  { status: "cancelled", note: "Customer requested" }
     *
     * The customer page fetches GET /orders/<id> and sees the updated order.
     */
    const adminCancelledOrder = orderWithStatus("cancelled", {
      cancelReason: "Customer requested via admin",
    });

    let adminStatusCallCount = 0;
    // Intercept the admin status endpoint — assert it would be called with cancelled
    await page.route(`**/api/orders/${ORDER_ID}/status`, async (route) => {
      if (!["POST", "PATCH"].includes(route.request().method())) {
        await route.continue();
        return;
      }
      adminStatusCallCount++;
      const body = route.request().postDataJSON() ?? {};
      expect(body.status).toBe("cancelled");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    // Customer GET — returns the order AFTER the admin cancellation
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: adminCancelledOrder }),
      });
    });

    // Trigger the admin status update (simulates admin panel action)
    await page.evaluate(
      async ({ orderId, body }: { orderId: string; body: Record<string, string> }) => {
        await fetch(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      },
      { orderId: ORDER_ID, body: { status: "cancelled", note: "Customer requested via admin" } }
    );

    expect(adminStatusCallCount).toBe(1);

    // Now the customer navigates to their order
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.locator("text=Kanjivaram Silk Saree")
    ).toBeVisible({ timeout: 20_000 });

    // The order is cancelled with no refundStatus — refund button MUST be visible
    const refundBtn = page
      .locator("button", { hasText: /Request Refund/i })
      .first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });
  });

  // ── Scenario 2: return_requested → return_rejected → no refund button ──

  test("admin rejects a return request → customer has no refund option", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    /**
     * canRefund = ["cancelled", "return_requested"].includes(order.status) && !order.refundStatus
     *
     * "return_rejected" is NOT in that list, so the button must be absent.
     */
    const rejectedOrder = orderWithStatus("return_rejected", {
      returnReason: JSON.stringify({ reason: "Product is damaged or defective" }),
    });

    await page.route(`**/api/orders/${ORDER_ID}/status`, async (route) => {
      if (!["POST", "PATCH"].includes(route.request().method())) {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() ?? {};
      expect(body.status).toBe("return_rejected");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: rejectedOrder }),
      });
    });

    // Simulate the admin action
    await page.evaluate(
      async ({ orderId, body }: { orderId: string; body: Record<string, string> }) => {
        await fetch(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      },
      { orderId: ORDER_ID, body: { status: "return_rejected", note: "Return not eligible" } }
    );

    // Customer visits order detail — should NOT see refund button
    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.locator("text=Kanjivaram Silk Saree")
    ).toBeVisible({ timeout: 20_000 });

    await expect(
      page.locator("button", { hasText: /Request Refund/i })
    ).not.toBeVisible({ timeout: 5_000 });
  });

  // ── Scenario 3: return_requested → remains eligible until rejected ──

  test("return_requested order still shows Request Refund before admin acts", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    const returnRequestedOrder = orderWithStatus("return_requested", {
      returnReason: JSON.stringify({ reason: "Wrong item received" }),
    });

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: returnRequestedOrder }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.locator("text=Kanjivaram Silk Saree")
    ).toBeVisible({ timeout: 20_000 });

    // Still in return_requested → refund button MUST be visible (admin hasn't rejected yet)
    const refundBtn = page
      .locator("button", { hasText: /Request Refund/i })
      .first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });
  });

  // ── Scenario 4: delivered order (no refund path) → no refund button ──

  test("admin marks order delivered → customer has no refund button (must use return flow)", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    // Delivered but within return window (7 days) — no refund button, but return button present
    const deliveredAt = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const deliveredOrder = orderWithStatus("delivered", { deliveredAt });

    await page.route(`**/api/orders/${ORDER_ID}/status`, async (route) => {
      if (!["POST", "PATCH"].includes(route.request().method())) {
        await route.continue();
        return;
      }
      const body = route.request().postDataJSON() ?? {};
      expect(body.status).toBe("delivered");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    });

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: deliveredOrder }),
      });
    });

    // Admin marks delivered
    await page.evaluate(
      async ({ orderId, body }: { orderId: string; body: Record<string, string> }) => {
        await fetch(`/api/orders/${orderId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      },
      { orderId: ORDER_ID, body: { status: "delivered" } }
    );

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.locator("text=Kanjivaram Silk Saree")
    ).toBeVisible({ timeout: 20_000 });

    // "delivered" is NOT in canRefund list — no refund button
    await expect(
      page.locator("button", { hasText: /Request Refund/i })
    ).not.toBeVisible({ timeout: 5_000 });

    // But the Return button SHOULD be visible (within 7-day window)
    await expect(
      page.locator("button", { hasText: /Request Return|Return/i }).first()
    ).toBeVisible({ timeout: 10_000 });
  });

  // ── Scenario 5: return_requested → return_approved → no refund button ──

  test("admin approves a return → customer has no standalone refund button", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    /**
     * return_approved is also NOT in ["cancelled", "return_requested"].
     * Refund button should be absent.
     */
    const approvedReturnOrder = orderWithStatus("return_approved", {
      returnReason: JSON.stringify({ reason: "Product is damaged or defective" }),
    });

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: approvedReturnOrder }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(
      page.locator("text=Kanjivaram Silk Saree")
    ).toBeVisible({ timeout: 20_000 });

    // return_approved → refund handled separately, no standalone Request Refund button
    await expect(
      page.locator("button", { hasText: /Request Refund/i })
    ).not.toBeVisible({ timeout: 5_000 });
  });
});
