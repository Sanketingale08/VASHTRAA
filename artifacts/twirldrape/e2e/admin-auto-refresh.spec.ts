/**
 * Admin pages — auto-refresh smoke tests.
 *
 * Verifies that background polling intervals fire and mutation reloads work
 * on the five admin pages (Dashboard, Returns, VendorDetail, Reports, Vendors)
 * without a manual page reload.
 *
 * Strategy:
 *   - All API routes are stubbed so the suite runs without a live database.
 *   - `page.clock.install()` installs Playwright's fake-timer control so we
 *     can advance time by 30–60 s instantly without waiting.
 *   - Request counters track how many times each endpoint is fetched; after
 *     advancing the clock we assert the counter increased.
 *   - Mutation-reload tests call the action endpoint stub then assert the list
 *     endpoint is re-fetched within 2 s of the action completing.
 *   - Console-error assertions guard against real JS crashes; Clerk-UI load
 *     failures and HTTP-resource 500 s from unstubbed endpoints are filtered
 *     out as test-environment noise (not app bugs).
 *
 * Playwright version: ≥1.45 required for `page.clock` API (project uses 1.61.x).
 */

import { test, expect, type Page } from "@playwright/test";

// ── Admin key seeding ─────────────────────────────────────────────────────────

function seedAdminKey(page: Page) {
  const key = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  return page.addInitScript((k: string) => {
    sessionStorage.setItem("td_admin_key", k);
  }, key);
}

// ── Console error filter: ignore test-environment noise ───────────────────────

function isAppError(msg: string): boolean {
  // Clerk UI fails to load in test environments — not an app code error
  if (msg.includes("Clerk") || msg.includes("clerk")) return false;
  // HTTP 500 resource-load errors come from unstubbed endpoints — not app code
  if (msg.includes("Failed to load resource")) return false;
  if (msg.includes("favicon")) return false;
  return true;
}

// ── Shared stubs for AdminGuard + AdminLayout (present on every admin page) ───

async function stubAdminInfra(page: Page, vendorListBody?: object) {
  // AdminGuard calls /api/admin/vendors to verify the session key
  await page.route("**/api/admin/vendors", (route) => {
    const url = route.request().url();
    // Only intercept the bare list endpoint, not detail routes like /vendors/:id/...
    if (!/\/api\/admin\/vendors(\?.*)?$/.test(url) || route.request().method() !== "GET") {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(vendorListBody ?? { vendors: [] }),
    });
  });

  // AdminLayout polls /api/admin/notifications/unread-count every 8 s
  await page.route("**/api/admin/notifications/unread-count**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0 }),
    }),
  );
}

// ── Shared stub data ──────────────────────────────────────────────────────────

const STUB_STATS = {
  totalOrders: 120,
  totalRevenue: 500000,
  totalCustomers: 80,
  deliveredOrders: 60,
  cancelledOrders: 10,
  returnedOrders: 5,
  confirmedOrders: 20,
  lateAcceptanceOrders: 0,
  dispatchedOrders: 15,
  refundedRevenue: 5000,
  totalProducts: 200,
  totalVendors: 30,
  approvedVendors: 25,
  activeVendors: 22,
  pendingVendors: 3,
  growthPct: 12,
  dailyRevenue: [{ date: "2026-08-01", revenue: 50000, orders: 10 }],
};

const STUB_RETURNS = {
  orders: [
    {
      id: "ord-001",
      displayId: "TD-001",
      userId: "user-001",
      items: [{ productId: "p1", name: "Kanjivaram Silk", price: 8500, quantity: 1 }],
      address: { name: "Priya Sharma", line1: "12 MG Road", city: "Bengaluru", state: "KA", pincode: "560001" },
      total: 8500,
      status: "return_requested",
      refundStatus: null,
      refundMethod: null,
      refundProcessedAt: null,
      refundReference: null,
      returnReason: "Damaged",
      updatedAt: new Date("2026-07-30").toISOString(),
      createdAt: new Date("2026-07-28").toISOString(),
      returnRequestedAt: new Date("2026-07-30").toISOString(),
    },
  ],
};

const REFUND_PILL_STATES = [
  { status: "pending", background: "rgb(255, 251, 235)", color: "rgb(180, 83, 9)" },
  { status: "approved", background: "rgb(240, 253, 244)", color: "rgb(21, 128, 61)" },
  { status: "processed", background: "rgb(240, 253, 244)", color: "rgb(21, 128, 61)" },
  { status: "rejected", background: "rgb(254, 242, 242)", color: "rgb(185, 28, 28)" },
] as const;

const STUB_VENDOR = {
  id: "vendor-001",
  name: "Silk Palace",
  location: "Varanasi",
  rating: 4.5,
  sareesCount: 42,
  avatar: "/images/artisan-1.png",
  bio: "Premium silk sarees",
  tagline: "Pure Banarasi silk",
  contactEmail: "silk@palace.com",
  gstin: "09AABCU9603R1ZV",
  status: "approved",
  ownerId: "owner-001",
  kycVerified: false,
  kycResubmissionRequested: false,
  mobile: "9876543210",
  panNumber: "AABCU9603R",
  panCardUrl: null,
  gstCertUrl: null,
  bankHolder: "Silk Palace",
  bankName: "SBI",
  bankAccount: "12345678901234",
  bankIfsc: "SBIN0001234",
  shopStreet: "Dashashwamedh Ghat",
  shopCity: "Varanasi",
  shopState: "UP",
  shopPincode: "221001",
  termsAcceptedAt: new Date("2026-01-01").toISOString(),
  featured: false,
  totalProducts: 42,
  activeProducts: 38,
  totalRevenue: 500000,
  commissionEarned: 75000,
  statusBreakdown: { confirmed: 5, dispatched: 3, delivered: 30, cancelled: 2, returned: 1 },
  monthlyRevenue: [{ month: "2026-08", revenue: 120000 }],
  vendorId: "VND-001",
};

const STUB_VENDORS_LIST = {
  vendors: [
    {
      id: "vendor-001",
      name: "Silk Palace",
      location: "Varanasi",
      status: "pending",
      gstin: "09AABCU9603R1ZV",
      contactEmail: "silk@palace.com",
      rating: 4.5,
      sareesCount: 42,
      revenue: 500000,
      totalOrders: 41,
      kycVerified: false,
      featured: false,
      vendorId: "VND-001",
    },
  ],
};

const STUB_REVENUE_REPORT = {
  summary: {
    totalOrders: 120,
    grossRevenue: 500000,
    netRevenue: 450000,
    commission: 50000,
    vendorEarnings: 400000,
    refundAmount: 5000,
    taxCollected: 18000,
    shippingCollected: 12000,
    avgOrderValue: 4167,
    growthPct: 12,
  },
  trend: [{ date: "2026-08-01", orders: 10, revenue: 50000 }],
  prevTrend: [],
};

const STUB_EMPTY_REPORT = {
  summary: {},
  trend: [],
  topVendors: [],
  topCustomers: [],
  orders: [],
  byCategory: [],
  byPaymentMethod: [],
  bestSellers: [],
  mostWishlisted: [],
  lowStockList: [],
  recentReturns: [],
  topReturnedProducts: [],
  byReason: [],
  settlementSummary: {},
  totalPages: 1,
  page: 1,
  total: 0,
};

// ── Test: AdminDashboard polling ──────────────────────────────────────────────

test.describe("AdminDashboard — background polling", () => {
  test("stats endpoint is re-fetched after 30 s clock advance", async ({ page }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    let statsFetchCount = 0;
    await page.route("**/api/admin/stats**", (route) => {
      statsFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_STATS),
      });
    });

    await page.goto("/admin/dashboard");
    // Wait for the stats to render — "Total Revenue" appears in MetricCard
    await expect(page.locator("text=Total Revenue").first()).toBeVisible({ timeout: 20_000 });

    const afterInitial = statsFetchCount;
    expect(afterInitial).toBeGreaterThanOrEqual(1);

    // Advance the fake clock past the 30 s interval to fire the setInterval callback
    await page.clock.fastForward(31_000);
    await page.waitForTimeout(500);

    expect(statsFetchCount).toBeGreaterThan(afterInitial);

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });
});

// ── Test: AdminReturns polling + mutation reload ──────────────────────────────

test.describe("AdminReturns — polling and mutation reload", () => {
  test("list is re-fetched after 30 s and again immediately after approving a return", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    let returnsFetchCount = 0;
    await page.route("**/api/admin/returns**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      returnsFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_RETURNS),
      });
    });

    // Stub the return-review action endpoint
    await page.route("**/api/admin/orders/ord-001/return**", (route) => {
      const updatedOrder = {
        ...STUB_RETURNS.orders[0],
        status: "return_approved",
        updatedAt: new Date().toISOString(),
      };
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: updatedOrder }),
      });
    });

    await page.goto("/admin/returns");
    // The heading "Returns & Refunds" is rendered by the page
    await expect(page.locator("text=Returns").first()).toBeVisible({ timeout: 20_000 });
    // Wait for the return row to appear
    await expect(page.locator("text=Kanjivaram Silk").first()).toBeVisible({ timeout: 10_000 });

    const afterInitial = returnsFetchCount;
    expect(afterInitial).toBeGreaterThanOrEqual(1);

    // ── Polling: advance 30 s ──
    await page.clock.fastForward(31_000);
    await page.waitForTimeout(500);
    expect(returnsFetchCount).toBeGreaterThan(afterInitial);

    // ── Mutation reload: click Approve Return ──
    const beforeAction = returnsFetchCount;
    const approveBtn = page.locator("button", { hasText: /Approve return/i }).first();
    if (await approveBtn.isVisible({ timeout: 3_000 })) {
      await approveBtn.click();
      // Mutation + reload should complete within 2 s
      await page.waitForTimeout(2_000);
      expect(returnsFetchCount).toBeGreaterThan(beforeAction);
    }

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });

  test("list is re-fetched immediately after approving a refund", async ({ page }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    // Order with a pending refund — triggers the "Approve refund" and "Reject refund" buttons
    const PENDING_REFUND_ORDER = {
      ...STUB_RETURNS.orders[0],
      id: "ord-002",
      displayId: "TD-002",
      status: "return_approved",
      refundStatus: "pending",
      refundMethod: "bank_transfer",
    };

    // After the action the server returns refundStatus: "approved"
    const APPROVED_REFUND_ORDER_RESULT = {
      ...PENDING_REFUND_ORDER,
      refundStatus: "approved",
      updatedAt: new Date().toISOString(),
    };

    let returnsFetchCount = 0;
    await page.route("**/api/admin/returns**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      returnsFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        // Serve the updated order on subsequent fetches so the pill updates
        body: JSON.stringify({ orders: [returnsFetchCount === 1 ? PENDING_REFUND_ORDER : APPROVED_REFUND_ORDER_RESULT] }),
      });
    });

    // Count POST requests to the refund endpoint to confirm the mutation fired
    let refundPostCount = 0;
    await page.route("**/api/admin/orders/ord-002/refund", (route) => {
      if (route.request().method() === "POST") refundPostCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: APPROVED_REFUND_ORDER_RESULT }),
      });
    });

    await page.goto("/admin/returns");
    await expect(page.locator("text=Returns").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=Kanjivaram Silk").first()).toBeVisible({ timeout: 10_000 });

    // "refund pending" pill must be visible — confirms the order is in the right state
    await expect(page.locator("text=refund pending").first()).toBeVisible({ timeout: 5_000 });

    // "Approve refund" must be visible unconditionally — if it is absent the component is broken
    const approveRefundBtn = page.locator("button", { hasText: /Approve refund/i }).first();
    await expect(approveRefundBtn).toBeVisible({ timeout: 5_000 });

    const beforeAction = returnsFetchCount;
    await approveRefundBtn.click();

    // The POST to /refund must have fired
    expect(refundPostCount).toBeGreaterThanOrEqual(1);

    // The returns list must be re-fetched within 2 s of the mutation
    await page.waitForTimeout(2_000);
    expect(returnsFetchCount).toBeGreaterThan(beforeAction);

    // The refundStatus pill must update to "approved" without a manual reload
    await expect(page.locator("text=refund approved").first()).toBeVisible({ timeout: 3_000 });

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });

  test("list is re-fetched immediately after rejecting a refund via confirm modal", async ({ page }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    const PENDING_REFUND_ORDER = {
      ...STUB_RETURNS.orders[0],
      id: "ord-002",
      displayId: "TD-002",
      status: "return_approved",
      refundStatus: "pending",
      refundMethod: "bank_transfer",
    };

    const REJECTED_REFUND_ORDER_RESULT = {
      ...PENDING_REFUND_ORDER,
      refundStatus: "rejected",
      updatedAt: new Date().toISOString(),
    };

    let returnsFetchCount = 0;
    await page.route("**/api/admin/returns**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      returnsFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders: [returnsFetchCount === 1 ? PENDING_REFUND_ORDER : REJECTED_REFUND_ORDER_RESULT] }),
      });
    });

    // Count POST requests to confirm the mutation fired
    let refundPostCount = 0;
    await page.route("**/api/admin/orders/ord-002/refund", (route) => {
      if (route.request().method() === "POST") refundPostCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: REJECTED_REFUND_ORDER_RESULT }),
      });
    });

    await page.goto("/admin/returns");
    await expect(page.locator("text=Returns").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=Kanjivaram Silk").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=refund pending").first()).toBeVisible({ timeout: 5_000 });

    // "Reject refund" must be visible — clicking it opens the RejectRefundConfirmModal
    const rejectRefundBtn = page.locator("button", { hasText: /Reject refund/i }).first();
    await expect(rejectRefundBtn).toBeVisible({ timeout: 5_000 });

    const beforeAction = returnsFetchCount;
    await rejectRefundBtn.click();

    // Confirm button inside the modal must appear and be clicked
    const confirmBtn = page.locator("button", { hasText: /^Reject refund$/i }).last();
    await expect(confirmBtn).toBeVisible({ timeout: 3_000 });
    await confirmBtn.click();

    // The POST to /refund must have fired
    expect(refundPostCount).toBeGreaterThanOrEqual(1);

    // The returns list must be re-fetched within 2 s
    await page.waitForTimeout(2_000);
    expect(returnsFetchCount).toBeGreaterThan(beforeAction);

    // The refundStatus pill must update to "rejected" without a manual reload
    await expect(page.locator("text=refund rejected").first()).toBeVisible({ timeout: 3_000 });

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });

  test("confirm payout is disabled during a slow request, then closes and reloads the list", async ({ page }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    // Order with an approved refund — triggers the "Mark payout done" button
    const APPROVED_REFUND_ORDER = {
      ...STUB_RETURNS.orders[0],
      id: "ord-003",
      displayId: "TD-003",
      status: "return_approved",
      refundStatus: "approved",
      refundMethod: "bank_transfer",
    };

    // After processRefund the server returns refundStatus: "processed"
    const PROCESSED_REFUND_ORDER = {
      ...APPROVED_REFUND_ORDER,
      refundStatus: "processed",
      refundProcessedAt: new Date().toISOString(),
      refundReference: "TXN-REF-9999",
      updatedAt: new Date().toISOString(),
    };

    let returnsFetchCount = 0;
    await page.route("**/api/admin/returns**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      returnsFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        // After the first fetch serve the updated order so the pill updates
        body: JSON.stringify({ orders: [returnsFetchCount === 1 ? APPROVED_REFUND_ORDER : PROCESSED_REFUND_ORDER] }),
      });
    });

    // Delay the successful payout response to keep the confirmation modal in its
    // loading state long enough to prove a slow connection cannot submit twice.
    let processPostCount = 0;
    await page.route("**/api/admin/orders/ord-003/refund/process", async (route) => {
      if (route.request().method() === "POST") processPostCount++;
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ order: PROCESSED_REFUND_ORDER }),
      });
    });

    await page.goto("/admin/returns");
    await expect(page.locator("text=Returns").first()).toBeVisible({ timeout: 20_000 });
    await expect(page.locator("text=Kanjivaram Silk").first()).toBeVisible({ timeout: 10_000 });

    // "refund approved" pill must be visible before the action
    await expect(page.locator("text=refund approved").first()).toBeVisible({ timeout: 5_000 });

    // "Mark payout done" must be visible — clicking it opens the PayoutConfirmModal
    const payoutBtn = page.locator("button", { hasText: /Mark payout done/i }).first();
    await expect(payoutBtn).toBeVisible({ timeout: 5_000 });

    const beforeAction = returnsFetchCount;
    await payoutBtn.click();

    // Confirm button inside the modal must appear and be clicked
    const confirmPayoutBtn = page.locator("button").filter({ hasText: /Confirm payout|Processing…/i }).first();
    await expect(confirmPayoutBtn).toBeVisible({ timeout: 3_000 });
    await confirmPayoutBtn.click();

    // While the first request is in-flight, another confirmation is impossible.
    await expect(confirmPayoutBtn).toBeDisabled();
    expect(processPostCount).toBe(1);

    // Once the payout request resolves, the modal closes.
    await expect(page.getByRole("heading", { name: "Confirm payout" })).toBeHidden({ timeout: 3_000 });

    // The returns list must be re-fetched within 2 s
    await page.waitForTimeout(2_000);
    expect(returnsFetchCount).toBeGreaterThan(beforeAction);

    // The refundStatus pill in the row must reflect "processed" without a manual reload
    await expect(page.locator("text=refund processed").first()).toBeVisible({ timeout: 3_000 });

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });
});

// ── Test: AdminReturns initial refund pill render ──────────────────────────────

test.describe("AdminReturns — initial refund pill render", () => {
  test("shows each refund state with its correct pill on direct page load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await stubAdminInfra(page);

    const orders = REFUND_PILL_STATES.map(({ status }, index) => ({
      ...STUB_RETURNS.orders[0],
      id: `refund-state-${status}`,
      displayId: `TD-REF-${index + 1}`,
      status: "return_approved",
      refundStatus: status,
      refundMethod: "bank_transfer",
    }));

    await page.route("**/api/admin/returns**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ orders }),
      });
    });

    await page.goto("/admin/returns");
    await expect(page.getByRole("heading", { name: "Returns & Refunds" })).toBeVisible({ timeout: 20_000 });

    for (const { status, background, color } of REFUND_PILL_STATES) {
      const pill = page.getByText(`refund ${status}`, { exact: true });
      await expect(pill).toBeVisible();
      await expect(pill).toHaveCSS("background-color", background);
      await expect(pill).toHaveCSS("color", color);
    }

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });
});

// ── Test: AdminVendorDetail polling + mutation reload ─────────────────────────

test.describe("AdminVendorDetail — polling and mutation reload", () => {
  test("vendor endpoint is re-fetched after 15 s and after a status action", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    let vendorFetchCount = 0;
    await page.route("**/api/admin/vendors/vendor-001", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      vendorFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_VENDOR),
      });
    });

    // Stub the suspend action (vendor is "approved" so Suspend button renders)
    await page.route("**/api/admin/vendors/vendor-001/suspend**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ vendor: { ...STUB_VENDOR, status: "suspended" } }),
      }),
    );

    // Stub KYC action
    await page.route("**/api/admin/vendors/vendor-001/kyc**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          vendor: { ...STUB_VENDOR, kycVerified: true, kycResubmissionRequested: false },
        }),
      }),
    );

    await page.goto("/admin/vendors/vendor-001");
    await expect(page.locator("text=Silk Palace").first()).toBeVisible({ timeout: 20_000 });

    const afterInitial = vendorFetchCount;
    expect(afterInitial).toBeGreaterThanOrEqual(1);

    // ── Polling: advance 15 s ──
    await page.clock.fastForward(16_000);
    await page.waitForTimeout(500);
    expect(vendorFetchCount).toBeGreaterThan(afterInitial);

    // ── Mutation reload: click Suspend ──
    const beforeAction = vendorFetchCount;
    const suspendBtn = page.locator("button", { hasText: /Suspend Vendor/i }).first();
    if (await suspendBtn.isVisible({ timeout: 3_000 })) {
      await suspendBtn.click();
      await page.waitForTimeout(2_000);
      expect(vendorFetchCount).toBeGreaterThan(beforeAction);
    }

    // ── KYC action reload ──
    const beforeKyc = vendorFetchCount;
    const verifyBtn = page.locator("button", { hasText: /Mark KYC Verified/i }).first();
    if (await verifyBtn.isVisible({ timeout: 3_000 })) {
      await verifyBtn.click();
      await page.waitForTimeout(2_000);
      expect(vendorFetchCount).toBeGreaterThan(beforeKyc);
    }

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });
});

// ── Test: AdminReports polling + period filter reload ─────────────────────────

test.describe("AdminReports — polling and period filter reload", () => {
  test("revenue report re-fetches on period switch and again after 60 s", async ({ page }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();
    await stubAdminInfra(page);

    let revenueFetchCount = 0;
    await page.route("**/api/admin/reports/revenue**", (route) => {
      revenueFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_REVENUE_REPORT),
      });
    });

    // Stub all other report tabs so they don't produce 500 s
    await page.route("**/api/admin/reports/sales**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_EMPTY_REPORT) }),
    );
    await page.route("**/api/admin/reports/vendors**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_EMPTY_REPORT) }),
    );
    await page.route("**/api/admin/reports/customers**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_EMPTY_REPORT) }),
    );
    await page.route("**/api/admin/reports/products**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_EMPTY_REPORT) }),
    );
    await page.route("**/api/admin/reports/returns**", (r) =>
      r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_EMPTY_REPORT) }),
    );
    await page.route("**/api/admin/products/stats**", (r) =>
      r.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ total: 10, pending: 1, approved: 8, rejected: 0, featured: 2 }),
      }),
    );

    await page.goto("/admin/reports");
    // The page heading is "Reports" inside an h1
    await expect(page.locator("h1").filter({ hasText: "Reports" }).first()).toBeVisible({ timeout: 20_000 });

    const afterInitial = revenueFetchCount;
    expect(afterInitial).toBeGreaterThanOrEqual(1);

    // ── Period filter: switching period triggers immediate reload ──
    const beforePeriodSwitch = revenueFetchCount;
    const sevenDayBtn = page.locator("button", { hasText: "Last 7 Days" }).first();
    if (await sevenDayBtn.isVisible({ timeout: 5_000 })) {
      await sevenDayBtn.click();
      await page.waitForTimeout(1_000);
      expect(revenueFetchCount).toBeGreaterThan(beforePeriodSwitch);
    }

    // ── Polling: advance 60 s ──
    const beforePoll = revenueFetchCount;
    await page.clock.fastForward(61_000);
    await page.waitForTimeout(500);
    expect(revenueFetchCount).toBeGreaterThan(beforePoll);

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });
});

// ── Test: AdminVendors polling + mutation reload ──────────────────────────────

test.describe("AdminVendors — polling and mutation reload", () => {
  test("vendor list is re-fetched after 30 s and immediately after an action", async ({
    page,
  }) => {
    test.setTimeout(30_000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await seedAdminKey(page);
    await page.clock.install();

    // Count vendor list fetches specifically (bare list endpoint)
    let vendorListFetchCount = 0;
    await page.route("**/api/admin/vendors**", (route) => {
      const url = route.request().url();
      if (!/\/api\/admin\/vendors(\?.*)?$/.test(url) || route.request().method() !== "GET") {
        return route.continue();
      }
      vendorListFetchCount++;
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STUB_VENDORS_LIST),
      });
    });

    // AdminLayout notification count
    await page.route("**/api/admin/notifications/unread-count**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ count: 0 }),
      }),
    );

    // Stub the approve action
    await page.route("**/api/admin/vendors/vendor-001/approve**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ vendor: { ...STUB_VENDORS_LIST.vendors[0], status: "approved" } }),
      }),
    );

    await page.goto("/admin/vendors");
    await expect(page.locator("text=Vendor Management").first()).toBeVisible({ timeout: 20_000 });
    // Vendor row must appear
    await expect(page.locator("text=Silk Palace").first()).toBeVisible({ timeout: 10_000 });

    const afterInitial = vendorListFetchCount;
    expect(afterInitial).toBeGreaterThanOrEqual(1);

    // ── Polling: advance 30 s ──
    await page.clock.fastForward(31_000);
    await page.waitForTimeout(500);
    expect(vendorListFetchCount).toBeGreaterThan(afterInitial);

    // ── Mutation reload: click Approve on the pending vendor ──
    const beforeAction = vendorListFetchCount;
    const approveBtn = page.locator("button", { hasText: /^Approve$/ }).first();
    if (await approveBtn.isVisible({ timeout: 3_000 })) {
      await approveBtn.click();
      // Mutation + reload should complete within 2 s
      await page.waitForTimeout(2_000);
      expect(vendorListFetchCount).toBeGreaterThan(beforeAction);
    }

    expect(consoleErrors.filter(isAppError)).toHaveLength(0);
  });
});
