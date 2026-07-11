/**
 * Refund payout flow — E2E Playwright tests.
 *
 * Covers the full lifecycle as experienced by an admin and then a customer:
 *   1. Admin visits Returns & Refunds panel → sees a pending refund
 *   2. Admin approves the refund via the UI button
 *   3. Admin marks the payout done (with a reference number) via the UI button
 *   4. Panel displays "Paid out" with the timestamp and reference
 *   5. Customer order history shows the "Refund paid out" badge
 *
 * API responses are controlled via page.route() to keep tests deterministic.
 * The admin key is seeded into sessionStorage before page load so the admin
 * guard and API fetch both fire with the correct header.
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const ORDER_ID = "e2e-refund-order-0001";

const pendingOrder = {
  id: ORDER_ID,
  userId: "e2e-buyer-001",
  status: "cancelled",
  refundStatus: "pending",
  refundMethod: "original_payment",
  refundProcessedAt: null,
  refundReference: null,
  returnReason: null,
  items: [
    {
      productId: "prod-silk-001",
      name: "Kanjivaram Silk Saree",
      price: 1500000,
      quantity: 1,
      images: [],
      vendorName: "Silk Palace",
    },
  ],
  address: {
    name: "Priya Sharma",
    line1: "12 MG Road",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560001",
  },
  total: 1500000,
  updatedAt: new Date("2025-07-01T08:00:00Z").toISOString(),
  createdAt: new Date("2025-06-28T10:00:00Z").toISOString(),
};

const approvedOrder = {
  ...pendingOrder,
  refundStatus: "approved",
  updatedAt: new Date("2025-07-10T09:00:00Z").toISOString(),
};

const processedOrder = {
  ...pendingOrder,
  refundStatus: "processed",
  refundProcessedAt: new Date("2025-07-10T09:30:00Z").toISOString(),
  refundReference: "NEFT-2025-TXN-001",
  updatedAt: new Date("2025-07-10T09:30:00Z").toISOString(),
};

test.describe("Admin Returns & Refunds panel — approve → process payout", () => {
  test("admin can approve a pending refund and then mark it as paid out", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    const ADMIN_KEY = process.env.ADMIN_API_KEY || "test-e2e-admin-key";

    await page.addInitScript((key) => {
      sessionStorage.setItem("td_admin_key", key);
    }, ADMIN_KEY);

    let returnsCallCount = 0;

    await page.route("**/api/admin/returns", async (route) => {
      returnsCallCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [pendingOrder] }),
      });
    });

    await page.goto("/admin/returns");

    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    const refundPendingPill = page.locator("span", { hasText: /refund pending/i }).first();
    await expect(refundPendingPill).toBeVisible({ timeout: 5_000 });

    const approveBtn = page.locator("button", { hasText: /Approve refund/i }).first();
    await expect(approveBtn).toBeVisible({ timeout: 5_000 });

    await page.unroute("**/api/admin/returns");
    await page.route("**/api/admin/returns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [approvedOrder] }),
      });
    });

    await page.route(`**/api/admin/orders/${ORDER_ID}/refund`, async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const body = route.request().postDataJSON() ?? {};
      expect(body.decision).toBe("approved");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: approvedOrder }),
      });
    });

    await approveBtn.click();

    const markPayoutBtn = page.locator("button", { hasText: /Mark payout done/i }).first();
    await expect(markPayoutBtn).toBeVisible({ timeout: 10_000 });

    const refundApprovedPill = page.locator("span", { hasText: /refund approved/i }).first();
    await expect(refundApprovedPill).toBeVisible({ timeout: 5_000 });

    const refInput = page.locator('input[placeholder*="Payout reference"]').first();
    await expect(refInput).toBeVisible({ timeout: 5_000 });
    await refInput.fill("NEFT-2025-TXN-001");

    await page.route(`**/api/admin/orders/${ORDER_ID}/refund/process`, async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      const body = route.request().postDataJSON() ?? {};
      expect(body.reference).toBe("NEFT-2025-TXN-001");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: processedOrder }),
      });
    });

    await markPayoutBtn.click();

    const paidOutBlock = page.locator("div", { hasText: /Paid out/i }).first();
    await expect(paidOutBlock).toBeVisible({ timeout: 10_000 });

    const refBlock = page.locator("div", { hasText: /NEFT-2025-TXN-001/ }).first();
    await expect(refBlock).toBeVisible({ timeout: 5_000 });

    await expect(page.locator("button", { hasText: /Mark payout done/i })).not.toBeVisible({ timeout: 3_000 });
  });

  test("admin panel shows 'No action needed' for an already-processed refund", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    const ADMIN_KEY = process.env.ADMIN_API_KEY || "test-e2e-admin-key";

    await page.addInitScript((key) => {
      sessionStorage.setItem("td_admin_key", key);
    }, ADMIN_KEY);

    await page.route("**/api/admin/returns", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [processedOrder] }),
      });
    });

    await page.goto("/admin/returns");

    await expect(page.locator("text=Kanjivaram Silk Saree")).toBeVisible({ timeout: 20_000 });

    const paidOutBlock = page.locator("div", { hasText: /Paid out/i }).first();
    await expect(paidOutBlock).toBeVisible({ timeout: 5_000 });

    const refBlock = page.locator("div", { hasText: /NEFT-2025-TXN-001/ }).first();
    await expect(refBlock).toBeVisible({ timeout: 5_000 });

    const processedPill = page.locator("span", { hasText: /refund processed/i }).first();
    await expect(processedPill).toBeVisible({ timeout: 3_000 });

    await expect(page.locator("button", { hasText: /Mark payout done/i })).not.toBeVisible({ timeout: 3_000 });
    await expect(page.locator("button", { hasText: /Approve refund/i })).not.toBeVisible({ timeout: 3_000 });

    await expect(page.locator("span", { hasText: /No action needed/i }).first()).toBeVisible({ timeout: 3_000 });
  });
});

test.describe("Customer order history — Refund paid out badge", () => {
  test("order history shows Refund paid out badge for a processed refund", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping customer auth test");
      return;
    }

    const clerk = createClerkClient({ secretKey });
    const tag = Date.now();
    const email = `refund-e2e-${tag}@example.com`;

    let userId: string | null = null;
    try {
      const user = await clerk.users.createUser({
        emailAddress: [email],
        password: `RefundTest${tag}!`,
        firstName: "Refund",
        lastName: "Tester",
        skipPasswordChecks: true,
        skipPasswordRequirement: false,
      });
      userId = user.id;

      const { token } = await clerk.signInTokens.createSignInToken({
        userId,
        expiresInSeconds: 300,
      });

      await setupClerkTestingToken({ page });

      await page.goto(baseURL!);
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

      await page.route("**/api/orders", async (route) => {
        if (route.request().method() !== "GET") { await route.continue(); return; }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            orders: [
              {
                ...processedOrder,
                userId,
              },
            ],
          }),
        });
      });

      await page.goto("/orders");

      const badge = page.locator("span", { hasText: /Refund paid out/i }).first();
      await expect(badge).toBeVisible({ timeout: 20_000 });

      const dateText = new Date(processedOrder.refundProcessedAt!).toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
      });
      await expect(page.locator("span", { hasText: new RegExp(dateText, "i") }).first()).toBeVisible({ timeout: 5_000 });
    } finally {
      if (userId) {
        try { await clerk.users.deleteUser(userId); } catch {}
      }
    }
  });
});
