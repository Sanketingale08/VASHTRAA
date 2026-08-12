/**
 * Cancel and Return error-case E2E tests — web (OrderConfirmation page).
 *
 * Verifies that when POST /api/orders/:id/cancel or POST /api/orders/:id/return
 * returns a 4xx/5xx response the customer sees a clear inline error message and
 * the submit button is re-enabled so they can retry.  Success paths are not
 * covered here — those live in order-history.spec.ts and other suites.
 *
 * API responses are controlled via page.route() for full determinism.
 * A real Clerk test user is created to satisfy the auth guard on /orders/:id.
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const ORDER_ID = "e2e-cancel-return-err-0001";

/** Order eligible for cancellation (status: confirmed). */
const confirmedOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-001",
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
  updatedAt: new Date("2025-07-01T10:00:00Z").toISOString(),
};

/** Order eligible for return (status: delivered within 7 days). */
const deliveredOrder = {
  ...confirmedOrder,
  status: "delivered",
  // deliveredAt within 7 days from "now" — tests run against mocked routes
  // so any recent timestamp works; we use a relative offset.
  deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  statusHistory: [
    ...confirmedOrder.statusHistory,
    {
      status: "delivered",
      timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      note: "Delivered",
    },
  ],
};

/** Sign a Clerk user in via a sign-in ticket (matches the pattern used across web e2e specs). */
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

// ── Test suite ───────────────────────────────────────────────────────────────

test.describe("Order cancel / return — error display (web)", () => {
  let userId: string | null = null;

  test.beforeAll(async () => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      const tag = Date.now();
      const user = await clerk.users.createUser({
        emailAddress: [`cancel-return-err-e2e-${tag}@example.com`],
        password: `CancelReturn${tag}!`,
        firstName: "Cancel",
        lastName: "Tester",
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

  // ── Cancel: 400 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when cancel API returns 400", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

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
        body: JSON.stringify({ error: "Order cannot be cancelled at this stage" }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    // Open the cancel form
    const cancelBtn = page
      .locator("button", { hasText: /Cancel Order/i })
      .first();
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.click();

    // Select the first cancel reason ("Changed my mind")
    const firstReason = page
      .locator("label", { hasText: /Changed my mind/i })
      .first();
    await expect(firstReason).toBeVisible({ timeout: 5_000 });
    await firstReason.click();

    // Submit the cancellation — should fail
    const submitBtn = page
      .locator("button", { hasText: /Confirm Cancellation/i })
      .first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Error text must appear
    await expect(
      page.locator("text=Order cannot be cancelled at this stage")
    ).toBeVisible({ timeout: 10_000 });

    // Submit button must be re-enabled (not stuck in loading)
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // The cancel form must still be open (no success transition)
    await expect(
      page.locator("text=Why do you want to cancel?")
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Cancel: 500 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when cancel API returns 500", async ({
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

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    // Open the cancel form
    const cancelBtn = page
      .locator("button", { hasText: /Cancel Order/i })
      .first();
    await expect(cancelBtn).toBeVisible({ timeout: 10_000 });
    await cancelBtn.click();

    // Select a reason
    const firstReason = page
      .locator("label", { hasText: /Changed my mind/i })
      .first();
    await expect(firstReason).toBeVisible({ timeout: 5_000 });
    await firstReason.click();

    const submitBtn = page
      .locator("button", { hasText: /Confirm Cancellation/i })
      .first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Server error must be surfaced to the customer
    await expect(
      page.locator("text=Internal server error")
    ).toBeVisible({ timeout: 10_000 });

    // Button re-enables for retry
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Form stays open
    await expect(
      page.locator("text=Why do you want to cancel?")
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Return: 400 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when return API returns 400", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);

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
        body: JSON.stringify({ error: "Return window has expired for this order" }),
      });
    });

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    // Open the return form
    const returnBtn = page
      .locator("button", { hasText: /Request Return/i })
      .first();
    await expect(returnBtn).toBeVisible({ timeout: 10_000 });
    await returnBtn.click();

    // Select a return reason
    const damageReason = page
      .locator("label", { hasText: /Product is damaged or defective/i })
      .first();
    await expect(damageReason).toBeVisible({ timeout: 5_000 });
    await damageReason.click();

    // Submit — should fail with 400
    const submitBtn = page
      .locator("button", { hasText: /Submit Return Request/i })
      .first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Error text must appear
    await expect(
      page.locator("text=Return window has expired for this order")
    ).toBeVisible({ timeout: 10_000 });

    // Submit button must be re-enabled
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Return form stays open for retry
    await expect(
      page.locator("text=Why do you want to return?")
    ).toBeVisible({ timeout: 3_000 });
  });

  // ── Return: 500 ────────────────────────────────────────────────────────────

  test("Shows error message and re-enables submit when return API returns 500", async ({
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

    await page.goto(`/orders/${ORDER_ID}`);
    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({
      timeout: 20_000,
    });

    // Open the return form
    const returnBtn = page
      .locator("button", { hasText: /Request Return/i })
      .first();
    await expect(returnBtn).toBeVisible({ timeout: 10_000 });
    await returnBtn.click();

    // Select a return reason
    const wrongItemReason = page
      .locator("label", { hasText: /Wrong item received/i })
      .first();
    await expect(wrongItemReason).toBeVisible({ timeout: 5_000 });
    await wrongItemReason.click();

    const submitBtn = page
      .locator("button", { hasText: /Submit Return Request/i })
      .first();
    await expect(submitBtn).toBeVisible({ timeout: 5_000 });
    await submitBtn.click();

    // Server error must be surfaced
    await expect(
      page.locator("text=Internal server error")
    ).toBeVisible({ timeout: 10_000 });

    // Button re-enables for retry
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });

    // Form stays open
    await expect(
      page.locator("text=Why do you want to return?")
    ).toBeVisible({ timeout: 3_000 });
  });
});
