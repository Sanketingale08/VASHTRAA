/**
 * Cancel and Return error-case E2E tests — mobile (Expo/React Native).
 *
 * Verifies that when POST /api/orders/:id/cancel or POST /api/orders/:id/return
 * returns a 4xx/5xx response the customer sees a clear inline error message and
 * the submit button is re-enabled so they can retry.
 *
 * API responses are controlled via page.route() for full determinism.
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

const ORDER_ID = "e2e-mobile-cancel-return-err-0001";

/** Order eligible for cancellation (status: confirmed). */
const confirmedOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-mobile-001",
  status: "confirmed",
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
  deliveryMethod: "standard" as const,
  paymentMethod: "upi" as const,
  couponCode: null,
  subtotal: 8500,
  discount: 0,
  shipping: 199,
  tax: 36,
  total: 8735,
  createdAt: new Date("2025-07-01T10:00:00Z").toISOString(),
  updatedAt: new Date("2025-07-01T10:00:00Z").toISOString(),
};

/** Order eligible for return (delivered within 7 days). */
const deliveredOrder = {
  ...confirmedOrder,
  status: "delivered",
  deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
};

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe("Mobile — order cancel / return error display", () => {
  let authUser: AuthUser | null = null;

  test.beforeAll(async () => {
    try {
      authUser = await createTestUser();
    } catch (err) {
      console.warn(
        "Could not create Clerk test user — cancel/return error tests will skip:",
        err
      );
    }
  });

  test.afterAll(async () => {
    if (authUser) await cleanupUser(authUser.userId);
  });

  // ── Cancel: 400 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when cancel API returns 400", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Mock order fetch — confirmed order (cancel-eligible)
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: confirmedOrder }),
      });
    });

    // Mock cancel POST → 400
    await page.route(`**/api/orders/${ORDER_ID}/cancel`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Order cannot be cancelled at this stage",
        }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    // Tap "Cancel Order" button in the CTA area
    const cancelBtn = page.getByText(/Cancel Order/i).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.tap();

    // The cancel modal should open — select a reason
    const firstReason = page.getByText(/Changed my mind/i).first();
    await expect(firstReason).toBeVisible({ timeout: 8_000 });
    await firstReason.tap();
    await page.waitForTimeout(500);

    // Tap the Pressable submit button (identified by testID)
    const submitPressable = page.getByTestId("cancel-submit-btn");
    await expect(submitPressable).toBeVisible({ timeout: 5_000 });
    await submitPressable.tap();

    // Error message must appear inside the modal
    await expect(
      page.getByText("Order cannot be cancelled at this stage")
    ).toBeVisible({ timeout: 10_000 });

    // The Pressable must be re-enabled (not stuck disabled)
    await expect(submitPressable).toBeEnabled({ timeout: 5_000 });

    // The modal must still be open — title or submit text should be visible
    await expect(
      page.getByText(/Confirm Cancellation/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Cancel: 500 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when cancel API returns 500", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: confirmedOrder }),
      });
    });

    // Mock cancel POST → 500
    await page.route(`**/api/orders/${ORDER_ID}/cancel`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    const cancelBtn = page.getByText(/Cancel Order/i).first();
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.tap();

    const firstReason = page.getByText(/Changed my mind/i).first();
    await expect(firstReason).toBeVisible({ timeout: 8_000 });
    await firstReason.tap();
    await page.waitForTimeout(500);

    const submitPressable = page.getByTestId("cancel-submit-btn");
    await expect(submitPressable).toBeVisible({ timeout: 5_000 });
    await submitPressable.tap();

    // Server error must be surfaced inside the modal
    await expect(
      page.getByText("Internal server error")
    ).toBeVisible({ timeout: 10_000 });

    // Button re-enables for retry
    await expect(submitPressable).toBeEnabled({ timeout: 5_000 });

    // Modal stays open
    await expect(
      page.getByText(/Confirm Cancellation/i).first()
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Return: 400 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when return API returns 400", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Mock order fetch — delivered order (return-eligible)
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

    // Mock return POST → 400
    await page.route(`**/api/orders/${ORDER_ID}/return`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Return window has expired for this order",
        }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    // Tap "Request Return" button in the CTA area
    const returnBtn = page.getByText(/Request Return/i).first();
    await expect(returnBtn).toBeVisible({ timeout: 10_000 });
    await returnBtn.tap();

    // The return modal should open — select a reason
    const damageReason = page
      .getByText(/Product is damaged or defective/i)
      .first();
    await expect(damageReason).toBeVisible({ timeout: 8_000 });
    await damageReason.tap();
    await page.waitForTimeout(500);

    // Tap the Pressable submit button (identified by testID)
    const submitPressable = page.getByTestId("return-submit-btn");
    await expect(submitPressable).toBeVisible({ timeout: 5_000 });
    await submitPressable.tap();

    // Error text must appear inside the modal
    await expect(
      page.getByText("Return window has expired for this order")
    ).toBeVisible({ timeout: 10_000 });

    // Submit button must be re-enabled
    await expect(submitPressable).toBeEnabled({ timeout: 5_000 });

    // Return modal stays open for retry
    await expect(
      page.getByText(/Submit Return Request/i)
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Return: 500 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when return API returns 500", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

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

    // Mock return POST → 500
    await page.route(`**/api/orders/${ORDER_ID}/return`, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Internal server error" }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    const returnBtn = page.getByText(/Request Return/i).first();
    await expect(returnBtn).toBeVisible({ timeout: 10_000 });
    await returnBtn.tap();

    // Select a return reason
    const wrongItemReason = page.getByText(/Wrong item received/i).first();
    await expect(wrongItemReason).toBeVisible({ timeout: 8_000 });
    await wrongItemReason.tap();
    await page.waitForTimeout(500);

    const submitPressable = page.getByTestId("return-submit-btn");
    await expect(submitPressable).toBeVisible({ timeout: 5_000 });
    await submitPressable.tap();

    // Server error must be surfaced inside the modal
    await expect(
      page.getByText("Internal server error")
    ).toBeVisible({ timeout: 10_000 });

    // Button re-enables for retry
    await expect(submitPressable).toBeEnabled({ timeout: 5_000 });

    // Modal stays open
    await expect(
      page.getByText(/Submit Return Request/i)
    ).toBeVisible({ timeout: 3_000 });
  });
});
