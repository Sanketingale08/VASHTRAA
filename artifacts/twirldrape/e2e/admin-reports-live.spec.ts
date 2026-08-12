/**
 * Admin Reports — live integration tests for Vendor and Customer tabs.
 *
 * Unlike `admin-reports.spec.ts` (which stubs all API routes), these tests
 * place a **real order** against the live database and then assert that the
 * Vendor and Customer report endpoints return accurate data reflecting that
 * order.
 *
 * Strategy per describe block:
 *   1. Create a temporary Clerk test user (customer, not vendor)
 *   2. Sign the user in via a sign-in ticket so the Clerk session cookie is
 *      present in the browser context
 *   3. Fetch an in-stock product from /api/products to obtain a real productId
 *      (and implicitly a vendorId that the vendor report references)
 *   4. POST /api/orders through the browser (page.evaluate) so the Clerk
 *      session cookie passes the isCustomer guard
 *
 * Vendor tab only:
 *   5. Advance the order to `delivered` via POST /api/orders/:id/status (admin key)
 *      — vendor_settlements rows of type "order_settlement" are created only at
 *      this point, not at order creation
 *
 * Both tabs:
 *   6. Assert on the JSON response from /api/admin/reports/vendors|customers
 *      with period=today (minimises ranking competition to today's data only,
 *      ensuring our test user appears within the top-15/top-20 limit)
 *   7. Navigate to /admin/reports, stub the other five endpoints, let the
 *      target endpoint hit the real API with the default period, and assert
 *      the tab content renders correctly
 *
 * Cleanup (best-effort, in afterAll):
 *   - The test order is cancelled via the admin status endpoint so it is
 *     clearly marked as synthetic data. Stock decrements and settled rows
 *     are not reversed — this suite targets a dedicated test/development
 *     database.
 *   - The temporary Clerk user is deleted.
 *
 * Both tests use the Playwright shared Clerk session pattern already
 * established across this project's e2e suite.
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

// ── Safety guard ──────────────────────────────────────────────────────────────
//
// This suite places real orders, creates vendor_settlement rows, and fires
// order-status emails. It MUST NOT run against a production/shared deployment.
// Set E2E_LIVE_DB=1 in the environment only when pointing Playwright at a
// dedicated disposable test database.  If the flag is absent the suite is
// skipped entirely so it cannot be triggered accidentally by CI or by changing
// PLAYWRIGHT_BASE_URL to a production URL.
//
const LIVE_DB_ENABLED = process.env.E2E_LIVE_DB === "1";

// ── Base URL resolution: respects PLAYWRIGHT_BASE_URL, same as playwright.config.ts ──

function resolveBaseURL(): string {
  return (
    process.env.PLAYWRIGHT_BASE_URL ??
    `http://localhost:${process.env.PORT ?? "23779"}`
  );
}

// ── Helper: sign a Clerk user into the browser via a one-time ticket ──────────

async function signInUser(
  page: import("@playwright/test").Page,
  userId: string,
): Promise<void> {
  const clerk = createClerkClient({
    secretKey: process.env.CLERK_SECRET_KEY!,
  });
  const { token } = await clerk.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 300,
  });

  await setupClerkTestingToken({ page });
  await page.goto(resolveBaseURL());
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
      const result = await w.Clerk.client.signIn.create({
        strategy: "ticket",
        ticket,
      });
      if (result.status === "complete") {
        await w.Clerk.setActive({ session: result.createdSessionId });
      } else {
        throw new Error(`Sign-in incomplete: ${result.status}`);
      }
    },
    { ticket: token },
  );

  await page.waitForTimeout(1_500);
}

// ── Helper: advance an order to a given status via the admin endpoint ─────────

async function setOrderStatus(
  request: import("@playwright/test").APIRequestContext,
  orderId: string,
  status: string,
): Promise<boolean> {
  const adminKey = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  // The Vite dev proxy maps /api/* → api-server, so the correct path is
  // /api/orders/:id/status (not /orders/:id/status)
  const resp = await request.post(`/api/orders/${orderId}/status`, {
    headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
    data: { status, note: `e2e test fixture: advancing to ${status}` },
  });
  if (!resp.ok()) {
    const body = await resp.text();
    console.warn(`setOrderStatus(${status}) → ${resp.status()}: ${body}`);
    return false;
  }
  return true;
}

// ── Helper: seed admin key into sessionStorage before each page load ──────────

function seedAdminKey(page: import("@playwright/test").Page) {
  const key = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  return page.addInitScript((k: string) => {
    sessionStorage.setItem("td_admin_key", k);
  }, key);
}

// ── Mock data for the endpoints that are NOT under test in each describe block ─

const mockRevenueData = {
  summary: {
    totalOrders: 1, grossRevenue: 10000, netRevenue: 10000, commission: 0,
    vendorEarnings: 10000, refundAmount: 0, taxCollected: 0,
    shippingCollected: 0, avgOrderValue: 10000, growthPct: 0,
  },
  trend: [{ date: "2026-08-01", orders: 1, revenue: 10000 }],
};
const mockSalesData = {
  summary: { totalOrders: 1, totalItemsSold: 1, salesRevenue: 10000, avgOrderValue: 10000 },
  byCategory: [], byPaymentMethod: [], trend: [], orders: [],
  total: 1, page: 1, totalPages: 1,
};
const mockProductData = {
  summary: { total: 10, active: 8, pending: 1, rejected: 0, featured: 2, lowStock: 1, outOfStock: 0 },
  bestSellers: [], mostWishlisted: [], byCategory: [], lowStockList: [],
};
const mockReturnData = {
  summary: { totalReturnRequests: 0, approvedReturns: 0, rejectedReturns: 0, refundAmount: 0, returnRate: 0, avgResolutionHours: 0 },
  trend: [], byReason: [], recentReturns: [], topReturnedProducts: [],
};
const mockVendorData = {
  summary: { totalVendors: 1, activeVendors: 1, pendingVendors: 0, suspendedVendors: 0 },
  topVendors: [],
  settlementSummary: { pendingCount: 0, completedCount: 0, pendingAmount: 0, completedAmount: 0 },
};

// ── Vendor tab live integration ───────────────────────────────────────────────

test.describe("Admin Reports — Vendor tab (live data)", () => {
  let vendorUserId = "";
  let vendorOrderId: string | null = null;
  let vendorName: string | null = null;
  let vendorId: string | null = null;
  let setupError: string | null = null;
  // Narrow timestamp window: from the moment beforeAll starts to when the test
  // runs. Using period=custom with these bounds includes ONLY this run's data —
  // prior runs' records (which have older timestamps) are excluded, making the
  // top-15/20 limit irrelevant regardless of how many times the suite has run.
  let windowFrom = "";

  test.beforeAll(async ({ browser, request }) => {
    if (!LIVE_DB_ENABLED) return; // guard: tests will skip themselves

    // Record the window start before any DB writes so our order is always inside
    windowFrom = new Date(Date.now() - 5_000).toISOString(); // 5 s buffer for clock skew

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      setupError = "CLERK_SECRET_KEY is not set";
      return;
    }

    // 1. Create a temporary customer account
    const clerk = createClerkClient({ secretKey });
    const tag = Date.now();
    const user = await clerk.users.createUser({
      emailAddress: [`e2e-vendor-rpt-${tag}@twirldrape-test.com`],
      password: `VndRpt${tag}!@Z`,
      firstName: "VndRpt",
      lastName: "Tester",
      skipPasswordChecks: true,
    });
    vendorUserId = user.id;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      // 2. Sign in so the Clerk session cookie is available in this context
      await signInUser(page, vendorUserId);

      // 3. Pick an in-stock, approved product that has a vendorId AND a positive
      //    price — settlement creation explicitly skips items with productAmount === 0,
      //    so a zero-priced product would never produce a vendor_settlement row.
      const productsResp = await page.evaluate(async () => {
        const r = await fetch("/api/products?limit=50", { credentials: "include" });
        return r.ok ? r.json() : null;
      });

      const products: any[] = Array.isArray(productsResp?.products)
        ? productsResp.products
        : Array.isArray(productsResp) ? productsResp : [];

      const eligible = products.find(
        (p: any) =>
          p.stock > 0 &&
          p.price > 0 &&
          p.vendorId &&
          p.active !== false &&
          p.status === "approved",
      );

      if (!eligible) {
        setupError = "No in-stock approved product with vendorId found in the database";
        return;
      }

      vendorName = eligible.vendorName ?? null;
      vendorId = eligible.vendorId ?? null;

      // 4. Place a real order through the browser (Clerk session cookie is live)
      const orderResp = await page.evaluate(
        async (productId: string) => {
          const r = await fetch("/api/orders", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{ productId, quantity: 1 }],
              address: {
                name: "E2E Vendor Reporter",
                phone: "9000000001",
                line1: "1 Test Lane",
                city: "Mumbai",
                state: "Maharashtra",
                pincode: "400001",
              },
              deliveryMethod: "standard",
              paymentMethod: "cod",
            }),
          });
          if (!r.ok) return { error: await r.text(), status: r.status };
          return r.json();
        },
        eligible.id,
      );

      if (orderResp?.error) {
        setupError = `Order placement failed (${orderResp.status}): ${orderResp.error}`;
        return;
      }

      vendorOrderId = orderResp?.orderId ?? orderResp?.id ?? null;

      if (!vendorOrderId) {
        setupError = `No orderId in response: ${JSON.stringify(orderResp)}`;
        return;
      }

      // 5. Advance the order to `delivered` — this is when handleUpdateOrderStatus
      //    creates the vendor_settlement row of type "order_settlement".
      //    The vendor report only reads from vendor_settlements, so we must
      //    reach delivered before asserting on the vendor tab.
      const statuses = ["processing", "dispatched", "out_for_delivery", "delivered"];
      for (const status of statuses) {
        const ok = await setOrderStatus(request, vendorOrderId, status);
        if (!ok) {
          setupError = `Failed to advance order ${vendorOrderId} to status "${status}"`;
          return;
        }
        await page.waitForTimeout(200);
      }

      // Allow the DB transaction to fully commit
      await page.waitForTimeout(1_000);
    } finally {
      await page.close();
      await context.close();
    }
  });

  test.afterAll(async ({ request }) => {
    if (!LIVE_DB_ENABLED) return;
    // Cancel the order so it is clearly flagged as synthetic test data.
    // Note: the vendor_settlement row and stock decrement are not reversible
    // via the current API — this suite targets a dedicated test database only.
    if (vendorOrderId) {
      const cancelled = await setOrderStatus(request, vendorOrderId, "cancelled");
      console.info(
        `[vendor-report e2e] cleanup: cancel ${vendorOrderId} → ${cancelled ? "OK" : "FAILED"}`,
      );
    }
    if (vendorUserId) {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        try {
          const clerk = createClerkClient({ secretKey });
          await clerk.users.deleteUser(vendorUserId);
          console.info(`[vendor-report e2e] cleanup: deleted Clerk user ${vendorUserId}`);
        } catch (err) {
          console.warn(`[vendor-report e2e] cleanup: failed to delete Clerk user ${vendorUserId}:`, err);
        }
      }
    }
  });

  test("Vendor report returns the delivered order's vendor in topVendors", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    test.skip(!LIVE_DB_ENABLED, "Set E2E_LIVE_DB=1 to run live database integration tests");

    // Fail explicitly — silent skips hide setup regressions
    expect(setupError, `Vendor report setup failed: ${setupError}`).toBeNull();
    expect(vendorOrderId, "Order was not placed in beforeAll").toBeTruthy();
    expect(vendorId, "vendorId must be set when setup succeeds").toBeTruthy();

    const adminKey = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";

    // Use period=custom with a narrow window bracketed by the beforeAll start
    // time so that only THIS run's settlement records are included.  Prior runs
    // (even from today) have older timestamps and fall outside the window, making
    // the top-15 LIMIT irrelevant regardless of how many times the suite has run.
    const from = encodeURIComponent(windowFrom);
    const to = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    const resp = await request.get(
      `/api/admin/reports/vendors?period=custom&from=${from}&to=${to}`,
      { headers: { "x-admin-key": adminKey } },
    );

    expect(resp.ok(), `Vendor report API failed: ${resp.status()}`).toBe(true);
    const data = await resp.json();

    // The response shape must be correct
    expect(Array.isArray(data.topVendors)).toBe(true);

    // The specific vendor whose product we ordered must appear with positive revenue
    const match = data.topVendors.find((v: any) => v.vendorId === vendorId);
    expect(match, `Vendor ${vendorId} (${vendorName}) not found in topVendors`).toBeDefined();
    expect(Number(match!.totalRevenue)).toBeGreaterThan(0);
    expect(Number(match!.settlementCount)).toBeGreaterThanOrEqual(1);
  });

  test("Vendor tab renders the Top Vendors table after a real delivered order", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!LIVE_DB_ENABLED, "Set E2E_LIVE_DB=1 to run live database integration tests");

    expect(setupError, `Vendor report setup failed: ${setupError}`).toBeNull();
    expect(vendorOrderId, "Order was not placed in beforeAll").toBeTruthy();
    expect(vendorName, "vendorName must be set when setup succeeds").toBeTruthy();

    await seedAdminKey(page);

    // Capture the custom-period URL params so the route handler can inject them
    const from = windowFrom;
    const to = new Date(Date.now() + 60_000).toISOString();

    // Stub all endpoints EXCEPT /api/admin/reports/vendors.
    // For the vendor endpoint, intercept the request, rewrite it to use
    // period=custom with the narrow window, fetch the REAL API response, and
    // fulfill — this exercises the real SQL while keeping the time window tight.
    await page.route("**/api/admin/reports/revenue**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRevenueData) }),
    );
    await page.route("**/api/admin/reports/sales**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSalesData) }),
    );
    await page.route("**/api/admin/reports/products**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductData) }),
    );
    await page.route("**/api/admin/reports/returns**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReturnData) }),
    );
    await page.route("**/api/admin/products/stats**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 10, pending: 1, approved: 8, rejected: 0, featured: 2 }) }),
    );
    // Rewrite period to custom window so only this run's data appears in the table
    await page.route("**/api/admin/reports/vendors**", async (route) => {
      const u = new URL(route.request().url());
      u.searchParams.set("period", "custom");
      u.searchParams.set("from", from);
      u.searchParams.set("to", to);
      const real = await route.fetch({ url: u.toString() });
      await route.fulfill({ response: real });
    });

    await page.goto("/admin/reports");

    // The page renders <h1>Reports</h1> — scope to h1 to avoid sidebar nav matches
    await expect(page.locator("h1").filter({ hasText: "Reports" }).first()).toBeVisible({ timeout: 20_000 });

    // Switch to the Vendor tab — the route handler above will intercept the
    // vendor API call and rewrite it to use the narrow custom window
    const vendorTab = page
      .locator("main")
      .locator("button")
      .filter({ hasText: /Vendor/ })
      .first();
    await expect(vendorTab).toBeVisible({ timeout: 10_000 });
    await vendorTab.click();

    // "Top Vendors by Revenue" section heading must appear (VendorTab renders it)
    await expect(page.locator("text=Top Vendors").first()).toBeVisible({ timeout: 20_000 });

    // The seeded vendor name must appear as a table cell — the narrow window
    // guarantees only this run's settlement is in the data
    await expect(
      page.locator(`text=${vendorName}`).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});

// ── Customer tab live integration ─────────────────────────────────────────────

test.describe("Admin Reports — Customer tab (live data)", () => {
  let customerUserId = "";
  let customerOrderId: string | null = null;
  let setupError: string | null = null;
  // Narrow timestamp window — same isolation strategy as the vendor block
  let windowFrom = "";

  test.beforeAll(async ({ browser }) => {
    if (!LIVE_DB_ENABLED) return; // guard: tests will skip themselves

    windowFrom = new Date(Date.now() - 5_000).toISOString();

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      setupError = "CLERK_SECRET_KEY is not set";
      return;
    }

    const clerk = createClerkClient({ secretKey });
    // Small tag offset so emails don't collide if both beforeAlls run in the same ms
    const tag = Date.now() + 7;
    const user = await clerk.users.createUser({
      emailAddress: [`e2e-cust-rpt-${tag}@twirldrape-test.com`],
      password: `CustRpt${tag}!@Z`,
      firstName: "CustRpt",
      lastName: "Tester",
      skipPasswordChecks: true,
    });
    customerUserId = user.id;

    const context = await browser.newContext();
    const page = await context.newPage();

    try {
      await signInUser(page, customerUserId);

      // Pick any in-stock, approved, positive-priced product
      const productsResp = await page.evaluate(async () => {
        const r = await fetch("/api/products?limit=50", { credentials: "include" });
        return r.ok ? r.json() : null;
      });

      const products: any[] = Array.isArray(productsResp?.products)
        ? productsResp.products
        : Array.isArray(productsResp) ? productsResp : [];

      const eligible = products.find(
        (p: any) => p.stock > 0 && p.price > 0 && p.active !== false && p.status === "approved",
      );

      if (!eligible) {
        setupError = "No in-stock approved product found in the database";
        return;
      }

      // 4. Place a real order — the customer report reads directly from the
      //    orders table so we do NOT need to advance to delivered
      const orderResp = await page.evaluate(
        async (productId: string) => {
          const r = await fetch("/api/orders", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              items: [{ productId, quantity: 1 }],
              address: {
                name: "E2E Customer Reporter",
                phone: "9000000002",
                line1: "2 Report Street",
                city: "Delhi",
                state: "Delhi",
                pincode: "110001",
              },
              deliveryMethod: "standard",
              paymentMethod: "cod",
            }),
          });
          if (!r.ok) return { error: await r.text(), status: r.status };
          return r.json();
        },
        eligible.id,
      );

      if (orderResp?.error) {
        setupError = `Order placement failed (${orderResp.status}): ${orderResp.error}`;
        return;
      }

      customerOrderId = orderResp?.orderId ?? orderResp?.id ?? null;

      if (!customerOrderId) {
        setupError = `No orderId in response: ${JSON.stringify(orderResp)}`;
        return;
      }

      await page.waitForTimeout(800);
    } finally {
      await page.close();
      await context.close();
    }
  });

  test.afterAll(async ({ request }) => {
    if (!LIVE_DB_ENABLED) return;
    if (customerOrderId) {
      const cancelled = await setOrderStatus(request, customerOrderId, "cancelled");
      console.info(
        `[customer-report e2e] cleanup: cancel ${customerOrderId} → ${cancelled ? "OK" : "FAILED"}`,
      );
    }
    if (customerUserId) {
      const secretKey = process.env.CLERK_SECRET_KEY;
      if (secretKey) {
        try {
          const clerk = createClerkClient({ secretKey });
          await clerk.users.deleteUser(customerUserId);
          console.info(`[customer-report e2e] cleanup: deleted Clerk user ${customerUserId}`);
        } catch (err) {
          console.warn(`[customer-report e2e] cleanup: failed to delete Clerk user ${customerUserId}:`, err);
        }
      }
    }
  });

  test("Customer report returns the order's customer in topCustomers", async ({
    request,
  }) => {
    test.setTimeout(60_000);
    test.skip(!LIVE_DB_ENABLED, "Set E2E_LIVE_DB=1 to run live database integration tests");

    expect(setupError, `Customer report setup failed: ${setupError}`).toBeNull();
    expect(customerOrderId, "Order was not placed in beforeAll").toBeTruthy();

    const adminKey = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";

    // Use period=custom with a narrow window bracketed by the beforeAll start time
    // so that only THIS run's order records are included — prior runs' orders have
    // older timestamps and fall outside the window, making the top-20 LIMIT irrelevant.
    const from = encodeURIComponent(windowFrom);
    const to = encodeURIComponent(new Date(Date.now() + 60_000).toISOString());
    const resp = await request.get(
      `/api/admin/reports/customers?period=custom&from=${from}&to=${to}`,
      { headers: { "x-admin-key": adminKey } },
    );

    expect(resp.ok(), `Customer report API failed: ${resp.status()}`).toBe(true);
    const data = await resp.json();

    // The response shape must be correct
    expect(Array.isArray(data.topCustomers)).toBe(true);
    expect(typeof data.summary.totalCustomers).toBe("number");

    // The Clerk userId we created must appear in topCustomers
    const match = data.topCustomers.find((c: any) => c.userId === customerUserId);
    expect(match, `Customer ${customerUserId} not found in topCustomers`).toBeDefined();

    // The customer must have at least one order and positive spend
    expect(Number(match!.totalOrders)).toBeGreaterThanOrEqual(1);
    expect(Number(match!.totalSpend)).toBeGreaterThan(0);
  });

  test("Customer tab renders Top Customers table after a real order", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    test.skip(!LIVE_DB_ENABLED, "Set E2E_LIVE_DB=1 to run live database integration tests");

    expect(setupError, `Customer report setup failed: ${setupError}`).toBeNull();
    expect(customerOrderId, "Order was not placed in beforeAll").toBeTruthy();

    await seedAdminKey(page);

    // Capture the custom-period URL params for route rewriting
    const from = windowFrom;
    const to = new Date(Date.now() + 60_000).toISOString();

    // Stub all endpoints EXCEPT /api/admin/reports/customers.
    // The customer endpoint is intercepted, its URL is rewritten to use the
    // narrow custom window, and the REAL API response is forwarded to the page.
    await page.route("**/api/admin/reports/revenue**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRevenueData) }),
    );
    await page.route("**/api/admin/reports/sales**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSalesData) }),
    );
    await page.route("**/api/admin/reports/vendors**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockVendorData) }),
    );
    await page.route("**/api/admin/reports/products**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductData) }),
    );
    await page.route("**/api/admin/reports/returns**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReturnData) }),
    );
    await page.route("**/api/admin/products/stats**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ total: 10, pending: 1, approved: 8, rejected: 0, featured: 2 }) }),
    );
    // Rewrite the customer endpoint's period to the narrow custom window
    await page.route("**/api/admin/reports/customers**", async (route) => {
      const u = new URL(route.request().url());
      u.searchParams.set("period", "custom");
      u.searchParams.set("from", from);
      u.searchParams.set("to", to);
      const real = await route.fetch({ url: u.toString() });
      await route.fulfill({ response: real });
    });

    await page.goto("/admin/reports");

    // The page renders <h1>Reports</h1> — scope to h1 to avoid sidebar nav matches
    await expect(page.locator("h1").filter({ hasText: "Reports" }).first()).toBeVisible({ timeout: 20_000 });

    // Switch to the Customer tab — the route handler above intercepts the API call
    // and rewrites it to use the narrow custom window
    const customerTab = page
      .locator("main")
      .locator("button")
      .filter({ hasText: /Customer/ })
      .first();
    await expect(customerTab).toBeVisible({ timeout: 10_000 });
    await customerTab.click();

    // "Top Customers by Spend" section heading must appear (CustomerTab renders it)
    await expect(page.locator("text=Top Customers").first()).toBeVisible({ timeout: 20_000 });

    // The customer ID column renders c.userId.slice(0, 20) + "…" (AdminReports.tsx ~line 814)
    // The narrow window guarantees only this run's customer is in the data
    const userIdPrefix = customerUserId.slice(0, 20);
    await expect(
      page.locator(`text=${userIdPrefix}`).first(),
    ).toBeVisible({ timeout: 15_000 });
  });
});
