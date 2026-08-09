/**
 * Refund request flow — customer-facing E2E Playwright tests (web).
 *
 * Covers the flow a customer experiences after their order is cancelled:
 *   1. Customer visits the order detail page for a cancelled order
 *   2. "Request Refund" button is visible
 *   3. Customer clicks it — the inline RefundForm expands
 *   4. Customer selects a refund method and submits
 *   5. The "Refund Requested" banner appears (pending state)
 *   6. The "Request Refund" button disappears (no double-submit)
 *
 * API responses are controlled via page.route() to keep tests deterministic.
 * A real Clerk test user is created to satisfy the auth guard on /orders/:id.
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const ORDER_ID = "e2e-refund-req-0001";

const cancelledOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-001",
  status: "cancelled",
  refundStatus: null,
  refundMethod: null,
  refundProcessedAt: null,
  refundReference: null,
  cancelReason: "Changed my mind",
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
    { status: "confirmed", timestamp: new Date("2025-07-01T10:00:00Z").toISOString(), note: "Order placed" },
    { status: "cancelled", timestamp: new Date("2025-07-01T11:00:00Z").toISOString(), note: "Changed my mind" },
  ],
  createdAt: new Date("2025-07-01T10:00:00Z").toISOString(),
  updatedAt: new Date("2025-07-01T11:00:00Z").toISOString(),
};

const pendingRefundOrder = {
  ...cancelledOrder,
  refundStatus: "pending",
  refundMethod: "store_credit",
};

/** Sign a Clerk user in via a sign-in ticket (same pattern as refund-payout.spec.ts) */
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
    await page.waitForFunction(() => !!(window as any).Clerk?.loaded, { timeout: 15_000 });
  } catch {
    await page.waitForTimeout(3_000);
  }

  await page.evaluate(async ({ ticket }: { ticket: string }) => {
    const w = window as any;
    if (!w.Clerk?.client) throw new Error("Clerk client not available");
    const si = w.Clerk.client.signIn;
    const result = await si.create({ strategy: "ticket", ticket });
    if (result.status === "complete") {
      await w.Clerk.setActive({ session: result.createdSessionId });
    } else {
      throw new Error(`Sign-in incomplete: ${result.status}`);
    }
  }, { ticket: token });

  await page.waitForTimeout(1_500);
}

test.describe("Customer refund request — web order detail page", () => {
  let userId: string | null = null;

  test.beforeAll(async () => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      const tag = Date.now();
      const user = await clerk.users.createUser({
        emailAddress: [`refund-req-e2e-${tag}@example.com`],
        password: `RefundReq${tag}!`,
        firstName: "Refund",
        lastName: "Customer",
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

  test("Request Refund button appears for a cancelled order and submits correctly", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    // Mock order fetch — return a cancelled order with no refundStatus
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: cancelledOrder }),
      });
    });

    // Mock refund POST — return success with pending status
    let refundCallCount = 0;
    await page.route(`**/api/orders/${ORDER_ID}/refund`, async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      refundCallCount++;
      const body = route.request().postDataJSON() ?? {};
      expect(body.method).toBe("store_credit");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: pendingRefundOrder }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);

    // The order detail should load and show the cancelled order
    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    // "Request Refund" button should be visible
    const refundBtn = page.locator("button", { hasText: /Request Refund/i }).first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });

    // Click it to expand the inline RefundForm
    await refundBtn.click();

    // The form should appear with the two refund method options
    await expect(page.locator("text=Request a Refund")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Original Payment Method")).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Store Credit")).toBeVisible({ timeout: 5_000 });

    // Select "Store Credit"
    const storeCreditOption = page.locator("label", { hasText: /Store Credit/i }).first();
    await storeCreditOption.click();

    // Submit the refund request
    const submitBtn = page.locator("button", { hasText: /Submit Refund Request/i }).first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // The pending refund banner should appear
    await expect(
      page.locator("text=/Refund Requested|Refund requested/i").first()
    ).toBeVisible({ timeout: 15_000 });

    // Only one API call should have been made
    expect(refundCallCount).toBe(1);

    // The "Request Refund" button should no longer be visible
    await expect(page.locator("button", { hasText: /Request Refund/i })).not.toBeVisible({
      timeout: 3_000,
    });
  });

  test("Request Refund button appears for a return_requested order", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    const returnOrder = {
      ...cancelledOrder,
      status: "return_requested",
      cancelReason: null,
      returnReason: JSON.stringify({ reason: "Product is damaged or defective" }),
      statusHistory: [
        ...cancelledOrder.statusHistory,
        { status: "return_requested", timestamp: new Date().toISOString(), note: "Return requested" },
      ],
    };

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: returnOrder }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);

    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    const refundBtn = page.locator("button", { hasText: /Request Refund/i }).first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });
  });

  test("Request Refund button is absent when refund is already pending", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: pendingRefundOrder }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);

    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    // The refund status banner should be present
    await expect(
      page.locator("text=/Refund Requested|Refund requested|processing in 5/i").first()
    ).toBeVisible({ timeout: 10_000 });

    // But the "Request Refund" action button should NOT appear
    await expect(page.locator("button", { hasText: /Request Refund/i })).not.toBeVisible({
      timeout: 3_000,
    });
  });
});
