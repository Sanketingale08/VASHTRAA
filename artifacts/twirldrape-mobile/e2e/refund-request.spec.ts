/**
 * Refund request flow — customer-facing E2E Playwright tests (mobile/Expo).
 *
 * Covers the flow a customer experiences after their order is cancelled:
 *   1. Customer visits the order detail page for a cancelled order
 *   2. "Request Refund" button is visible in the bottom CTA area
 *   3. Customer taps it — the refund bottom-sheet modal opens
 *   4. Customer selects a refund method and taps submit
 *   5. The "Refund Requested" banner appears (pending state)
 *   6. The "Request Refund" button disappears (no double-submit)
 *
 * API responses are controlled via page.route() for determinism.
 * A real Clerk test user is created to satisfy auth guards.
 */

import { test, expect } from "@playwright/test";
import {
  createTestUser,
  signInWithTicket,
  cleanupUser,
  type AuthUser,
} from "./fixtures/auth";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:24295");

const ORDER_ID = "e2e-mobile-refund-0001";

const cancelledOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-mobile-001",
  status: "cancelled",
  refundStatus: null,
  refundMethod: null,
  refundProcessedAt: null,
  refundReference: null,
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
  deliveryMethod: "standard" as const,
  paymentMethod: "upi" as const,
  couponCode: null,
  subtotal: 8500,
  discount: 0,
  shipping: 199,
  tax: 36,
  total: 8735,
  createdAt: new Date("2025-07-01T10:00:00Z").toISOString(),
  updatedAt: new Date("2025-07-01T11:00:00Z").toISOString(),
};

const pendingRefundOrder = {
  ...cancelledOrder,
  refundStatus: "pending",
  refundMethod: "original_payment",
};

test.describe("Mobile — customer refund request flow", () => {
  let authUser: AuthUser | null = null;

  test.beforeAll(async () => {
    try {
      authUser = await createTestUser();
    } catch (err) {
      console.warn("Could not create Clerk test user — refund tests will skip:", err);
    }
  });

  test.afterAll(async () => {
    if (authUser) await cleanupUser(authUser.userId);
  });

  test("Request Refund button appears for cancelled order and modal opens", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Mock the order detail fetch
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: cancelledOrder }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // Order details card should be visible
    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    // The "Request Refund" button should be visible in the CTA area
    const refundBtn = page.getByText(/Request Refund/i).first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });

    // Tap it — the modal should open
    await refundBtn.tap();

    // The bottom-sheet modal should appear with the two options
    await expect(page.getByText("Original Payment Method")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByText("Store Credit")).toBeVisible({ timeout: 5_000 });
  });

  test("Selecting a refund method and submitting shows pending banner", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Mock order detail
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: cancelledOrder }),
      });
    });

    // Mock refund POST
    let refundCallCount = 0;
    await page.route(`**/api/orders/${ORDER_ID}/refund`, async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      refundCallCount++;
      const body = route.request().postDataJSON() ?? {};
      expect(["original_payment", "store_credit"]).toContain(body.method);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: pendingRefundOrder }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    // Open the refund modal
    const refundBtn = page.getByText(/Request Refund/i).first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });
    await refundBtn.tap();

    // Wait for modal to open
    await expect(page.getByText("Original Payment Method")).toBeVisible({ timeout: 8_000 });

    // Select "Original Payment Method"
    const originalPaymentOption = page.getByText("Original Payment Method").first();
    await originalPaymentOption.tap();
    await page.waitForTimeout(500);

    // Submit
    const submitBtn = page.getByText(/Submit Refund Request/i).first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.tap();

    // Modal should close and success message should appear
    await page.waitForTimeout(2_000);

    // The refund pending banner should be visible now
    const pendingBanner = page.locator("text=/Refund requested|Refund Pending|processing in 5/i").first();
    await expect(pendingBanner).toBeVisible({ timeout: 15_000 });

    // Only one API call should have been made
    expect(refundCallCount).toBe(1);

    // The modal should be closed (no longer showing Submit button)
    await expect(page.getByText(/Submit Refund Request/i)).not.toBeVisible({ timeout: 3_000 });

    // The "Request Refund" CTA button itself should no longer appear — refundStatus is now set
    await expect(page.getByText(/Request Refund/i)).not.toBeVisible({ timeout: 3_000 });
  });

  test("Request Refund button is absent when refund is already pending", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Mock with an order that already has a pending refund
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: pendingRefundOrder }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    // The pending refund banner should be shown
    const pendingBanner = page.locator("text=/Refund Pending|Refund requested|processing in 5/i").first();
    await expect(pendingBanner).toBeVisible({ timeout: 10_000 });

    // The "Request Refund" button should NOT appear since refundStatus is already set
    await expect(page.getByText(/Request Refund/i)).not.toBeVisible({ timeout: 3_000 });
  });

  test("Order detail page for return_requested status shows Request Refund button", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    const returnOrder = {
      ...cancelledOrder,
      status: "return_requested",
    };

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: returnOrder }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    // Return-requested orders are also eligible for refunds
    const refundBtn = page.getByText(/Request Refund/i).first();
    await expect(refundBtn).toBeVisible({ timeout: 10_000 });
  });
});
