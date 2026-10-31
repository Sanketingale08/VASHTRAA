/**
 * Refund payout flow — mobile order detail screen E2E Playwright tests.
 *
 * Covers the experience a customer sees on the mobile order detail screen
 * after an admin marks their refund as processed:
 *   1. Order detail screen with refundStatus "processed" shows the green
 *      "Refund Payout" banner with "Refund paid out" text
 *   2. The processed date appears in the banner
 *   3. The payout reference number appears in the banner
 *   4. The banner is absent when refundStatus is "pending"
 *   5. Page-reload after admin processes the refund updates the UI
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

const ORDER_ID = "e2e-mobile-refund-payout-0001";

const PROCESSED_AT = new Date("2025-07-10T09:30:00Z").toISOString();
const REFERENCE = "NEFT-MOBILE-TXN-002";

const baseOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-mobile-002",
  status: "cancelled",
  refundStatus: "processed",
  refundMethod: "original_payment",
  refundProcessedAt: PROCESSED_AT,
  refundReference: REFERENCE,
  items: [
    {
      productId: "prod-silk-002",
      name: "Banarasi Silk Saree",
      price: 12000,
      quantity: 1,
      images: [],
      vendorName: "Weavers Studio",
    },
  ],
  address: {
    name: "Ananya Krishnan",
    phone: "9123456789",
    line1: "5 Anna Salai",
    city: "Chennai",
    state: "Tamil Nadu",
    pincode: "600002",
  },
  deliveryMethod: "standard" as const,
  paymentMethod: "upi" as const,
  couponCode: null,
  subtotal: 12000,
  discount: 0,
  shipping: 199,
  tax: 36,
  total: 12235,
  createdAt: new Date("2025-07-01T10:00:00Z").toISOString(),
  updatedAt: PROCESSED_AT,
};

test.describe("Mobile — customer order detail screen — Refund payout banner", () => {
  let authUser: AuthUser | null = null;

  test.beforeAll(async () => {
    try {
      authUser = await createTestUser();
    } catch (err) {
      console.warn("Could not create Clerk test user — refund payout tests will skip:", err);
    }
  });

  test.afterAll(async () => {
    if (authUser) await cleanupUser(authUser.userId);
  });

  test("order detail screen shows Refund Payout banner with processed date and reference", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: { ...baseOrder, userId: authUser!.userId } }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // Order item should be visible
    await expect(page.getByText("Banarasi Silk Saree")).toBeVisible({ timeout: 20_000 });

    // "Refund Payout" section header must be visible
    await expect(page.getByText(/Refund Payout/i).first()).toBeVisible({ timeout: 10_000 });

    // "Refund paid out" main text must be visible
    await expect(page.getByText(/Refund paid out/i).first()).toBeVisible({ timeout: 5_000 });

    // Processed date — 10 July 2025
    const processedDateText = new Date(PROCESSED_AT).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    await expect(
      page.locator(`text=/${processedDateText}/i`).first()
    ).toBeVisible({ timeout: 5_000 });

    // Payout reference
    await expect(page.getByText(REFERENCE).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Refund Payout banner is absent when refundStatus is pending", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    const pendingOrder = {
      ...baseOrder,
      userId: authUser.userId,
      refundStatus: "pending",
      refundProcessedAt: null,
      refundReference: null,
    };

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: pendingOrder }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Banarasi Silk Saree")).toBeVisible({ timeout: 20_000 });

    // Green "Refund Payout" processed banner must NOT appear
    await expect(page.getByText(/Refund paid out/i)).not.toBeVisible({ timeout: 5_000 });
    await expect(page.locator(`text=${REFERENCE}`)).not.toBeVisible({ timeout: 3_000 });
  });

  test("order detail screen updates to show payout banner after admin processes refund (reload flow)", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    let serveProcessed = false;

    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      const order = serveProcessed
        ? { ...baseOrder, userId: authUser!.userId }
        : {
            ...baseOrder,
            userId: authUser!.userId,
            refundStatus: "approved",
            refundProcessedAt: null,
            refundReference: null,
          };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order }),
      });
    });

    // Initial load — refund approved but not yet processed
    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Banarasi Silk Saree")).toBeVisible({ timeout: 20_000 });

    // Payout block must NOT appear yet (refundStatus = approved)
    await expect(page.getByText(/Refund paid out/i)).not.toBeVisible({ timeout: 5_000 });

    // Admin processes refund — next fetch returns processed data
    serveProcessed = true;

    // Shopper reloads the page
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Banarasi Silk Saree")).toBeVisible({ timeout: 20_000 });

    // Now the payout banner must be visible
    await expect(page.getByText(/Refund paid out/i).first()).toBeVisible({ timeout: 10_000 });

    const processedDateText = new Date(PROCESSED_AT).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    await expect(
      page.locator(`text=/${processedDateText}/i`).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(page.getByText(REFERENCE).first()).toBeVisible({ timeout: 5_000 });
  });

  test("Via method label shown correctly for original_payment and store_credit", async ({
    page,
  }) => {
    test.setTimeout(120_000);

    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Test original_payment label first
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          order: { ...baseOrder, userId: authUser!.userId, refundMethod: "original_payment" },
        }),
      });
    });

    await page.goto(`${BASE_URL}/orders/${ORDER_ID}?from=history`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Banarasi Silk Saree")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Refund paid out/i).first()).toBeVisible({ timeout: 10_000 });

    // "Via: Original Payment Method" should appear
    await expect(page.getByText(/Original Payment Method/i).first()).toBeVisible({ timeout: 5_000 });

    // Now test store_credit label
    await page.unroute(`**/api/orders/${ORDER_ID}`);
    await page.route(`**/api/orders/${ORDER_ID}`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          order: { ...baseOrder, userId: authUser!.userId, refundMethod: "store_credit" },
        }),
      });
    });

    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Banarasi Silk Saree")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Refund paid out/i).first()).toBeVisible({ timeout: 10_000 });

    // "Via: Store Credit" should appear
    await expect(page.getByText(/Store Credit/i).first()).toBeVisible({ timeout: 5_000 });
  });
});
