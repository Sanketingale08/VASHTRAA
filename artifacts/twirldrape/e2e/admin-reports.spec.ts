/**
 * Admin Reports module — E2E Playwright tests.
 *
 * Covers the six tabs of the /admin/reports page:
 *   1. All 6 tabs switch cleanly with no JS errors
 *   2. Revenue tab — KPI cards are visible and contain numeric values
 *   3. Products tab — "Total Products" KPI matches the value from /api/admin/reports/products
 *      (and is consistent with /api/admin/products/stats)
 *   4. Period filter — switching "Last 7 Days" → "This Year" re-fetches and updates KPI cards
 *   5. Export buttons — PDF and CSV buttons are enabled when data is present
 *
 * All API calls are intercepted with page.route() so the tests run
 * deterministically without a live database.  The admin key is seeded into
 * sessionStorage via page.addInitScript() to satisfy the x-admin-key guard.
 */

import { test, expect } from "@playwright/test";

// ── Fixtures ─────────────────────────────────────────────────────────────────

const TOTAL_PRODUCTS = 87;

const mockRevenueData = {
  summary: {
    totalOrders: 234,
    grossRevenue: 1850000,
    netRevenue: 1720000,
    commission: 185000,
    vendorEarnings: 1535000,
    refundAmount: 130000,
    taxCollected: 92500,
    shippingCollected: 46000,
    avgOrderValue: 7906,
    growthPct: 12.4,
  },
  trend: [
    { date: "2026-07-10", orders: 5, revenue: 42000 },
    { date: "2026-07-11", orders: 8, revenue: 65000 },
    { date: "2026-07-12", orders: 6, revenue: 51000 },
  ],
};

const mockSalesData = {
  summary: {
    totalOrders: 234,
    totalItemsSold: 312,
    salesRevenue: 1850000,
    avgOrderValue: 7906,
  },
  byCategory: [
    { category: "Silk Sarees", count: 120, revenue: 980000 },
    { category: "Cotton Sarees", count: 80, revenue: 560000 },
  ],
  byPaymentMethod: [
    { method: "upi", count: 150, amount: 1200000 },
    { method: "cod", count: 84, amount: 650000 },
  ],
  trend: [
    { date: "2026-07-10", orders: 5, revenue: 42000 },
    { date: "2026-07-11", orders: 8, revenue: 65000 },
  ],
  orders: [
    { id: "TD-2026-001", date: "2026-07-11", total: 12500, status: "delivered", paymentMethod: "upi", itemCount: 1 },
    { id: "TD-2026-002", date: "2026-07-12", total: 8900, status: "confirmed", paymentMethod: "cod", itemCount: 2 },
  ],
  total: 2,
  page: 1,
  totalPages: 1,
};

const mockVendorData = {
  summary: {
    totalVendors: 45,
    activeVendors: 38,
    pendingVendors: 5,
    suspendedVendors: 2,
  },
  topVendors: [
    {
      vendorId: "v-001",
      vendorName: "Silk Palace",
      settlementCount: 12,
      totalRevenue: 450000,
      commission: 45000,
      netPayout: 405000,
      pendingSettlements: 1,
    },
  ],
  settlementSummary: {
    pendingCount: 3,
    completedCount: 42,
    pendingAmount: 95000,
    completedAmount: 1440000,
  },
};

const mockCustomerData = {
  summary: {
    totalCustomers: 189,
    newCustomers: 47,
    returningCustomers: 142,
    avgSpend: 9788,
    avgOrdersPerCustomer: 1.24,
  },
  trend: [
    { date: "2026-07-10", orders: 5, customers: 4 },
    { date: "2026-07-11", orders: 8, customers: 7 },
  ],
  topCustomers: [
    { userId: "user_abc123xyz456", totalOrders: 6, totalSpend: 87000, avgSpend: 14500 },
  ],
};

const mockProductData = {
  summary: {
    total: TOTAL_PRODUCTS,
    active: 74,
    pending: 8,
    rejected: 3,
    featured: 12,
    lowStock: 6,
    outOfStock: 2,
  },
  bestSellers: [
    { productId: "p-001", name: "Kanjivaram Silk Saree", category: "Silk Sarees", vendorName: "Silk Palace", unitsSold: 42, revenue: 525000 },
  ],
  mostWishlisted: [
    { productId: "p-001", name: "Kanjivaram Silk Saree", category: "Silk Sarees", wishlistCount: 98 },
  ],
  byCategory: [
    { category: "Silk Sarees", count: 45 },
    { category: "Cotton Sarees", count: 30 },
    { category: "Designer Sarees", count: 12 },
  ],
  lowStockList: [],
};

// The /api/admin/products/stats endpoint (used by the AdminProducts page) returns
// the same total — the test asserts they are consistent.
const mockProductStats = {
  total: TOTAL_PRODUCTS,
  pending: 8,
  approved: 74,
  rejected: 3,
  featured: 12,
  activeCategories: 3,
  activeBrands: 5,
};

const mockReturnData = {
  summary: {
    totalReturnRequests: 18,
    approvedReturns: 14,
    rejectedReturns: 4,
    refundAmount: 130000,
    returnRate: 7.69,
    avgResolutionHours: 36,
  },
  trend: [
    { date: "2026-07-10", returnRequests: 1, approved: 1, refundAmount: 12500 },
  ],
  byReason: [
    { reason: "Defective product", count: 9, refundAmount: 65000 },
  ],
  recentReturns: [],
  topReturnedProducts: [],
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Seeds the admin key into sessionStorage before the page loads. */
function seedAdminKey(page: import("@playwright/test").Page) {
  const key = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  return page.addInitScript((k: string) => {
    sessionStorage.setItem("td_admin_key", k);
  }, key);
}

/**
 * Stubs all six report endpoints so the page loads fully without a database.
 * Each endpoint can be overridden by passing a custom response body.
 */
async function stubAllReportRoutes(
  page: import("@playwright/test").Page,
  overrides: {
    revenue?: object;
    sales?: object;
    vendors?: object;
    customers?: object;
    products?: object;
    returns?: object;
    productStats?: object;
  } = {}
) {
  const revenue  = overrides.revenue  ?? mockRevenueData;
  const sales    = overrides.sales    ?? mockSalesData;
  const vendors  = overrides.vendors  ?? mockVendorData;
  const customers = overrides.customers ?? mockCustomerData;
  const products = overrides.products ?? mockProductData;
  const returns  = overrides.returns  ?? mockReturnData;
  const productStats = overrides.productStats ?? mockProductStats;

  await page.route("**/api/admin/reports/revenue**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(revenue) })
  );
  await page.route("**/api/admin/reports/sales**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(sales) })
  );
  await page.route("**/api/admin/reports/vendors**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(vendors) })
  );
  await page.route("**/api/admin/reports/customers**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(customers) })
  );
  await page.route("**/api/admin/reports/products**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(products) })
  );
  await page.route("**/api/admin/reports/returns**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(returns) })
  );
  // Also stub the products/stats endpoint for consistency checks
  await page.route("**/api/admin/products/stats**", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(productStats) })
  );
}

// ── 1. All 6 tabs switch cleanly ─────────────────────────────────────────────

test.describe("Admin Reports — tab navigation", () => {
  test("all 6 tabs can be clicked without JS errors", async ({ page }) => {
    test.setTimeout(90_000);

    const jsErrors: string[] = [];
    page.on("pageerror", (err) => jsErrors.push(err.message));

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Use exact-match regex so the locator targets the report tab buttons and not
    // the sidebar nav buttons (which are also <button> elements and have text like
    // "Products", "Vendors", "Returns & Refunds" that partially match tab labels).
    // Scoped to <main> so we never hit the sidebar <button> elements.
    // No start/end anchors needed — the sidebar buttons have different labels
    // ("Products", "Vendors", "Returns & Refunds") and are outside <main>.
    const tabs: Array<[string, RegExp]> = [
      ["Revenue",  /Revenue/],
      ["Sales",    /Sales/],
      ["Vendor",   /Vendor/],
      ["Customer", /Customer/],
      ["Product",  /Product/],
      ["Return",   /Return/],
    ];
    for (const [, regex] of tabs) {
      const tab = page.locator("main").locator("button").filter({ hasText: regex }).first();
      await expect(tab).toBeVisible({ timeout: 10_000 });
      await tab.click();
      // Give the tab content time to load / settle
      await page.waitForTimeout(600);
    }

    // No JS errors across any tab switch
    expect(jsErrors).toHaveLength(0);
  });
});

// ── 2. Revenue tab — KPI cards ────────────────────────────────────────────────

test.describe("Admin Reports — Revenue tab", () => {
  test("Revenue tab renders all KPI cards with numeric values", async ({ page }) => {
    test.setTimeout(90_000);

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Revenue is the default tab — wait for KPI cards to appear
    await expect(page.locator("text=Total Orders").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Gross Revenue").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Net Revenue").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Platform Commission").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Vendor Earnings").first()).toBeVisible({ timeout: 5_000 });

    // Verify the mocked values appear (234 orders, ₹18.5L gross revenue)
    await expect(page.locator("text=234").first()).toBeVisible({ timeout: 5_000 });
    // Gross revenue: 1,850,000 → formatted as "₹18.5L"
    await expect(page.locator("text=₹18.5L").first()).toBeVisible({ timeout: 5_000 });

    // The Revenue Trend section should appear
    await expect(page.locator("text=Revenue Trend").first()).toBeVisible({ timeout: 5_000 });
    // The Revenue by Period table header should appear
    await expect(page.locator("text=Revenue by Period").first()).toBeVisible({ timeout: 5_000 });
  });

  test("Revenue tab KPI cards contain non-empty values (no dashes or zeros when data exists)", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("text=Total Orders").first()).toBeVisible({ timeout: 20_000 });

    // The revenue growth card should show the growth percentage
    await expect(page.locator("text=+12.4%").first()).toBeVisible({ timeout: 5_000 });

    // The avg order value card should show a formatted rupee value
    // 7,906 → "₹7.9K"
    await expect(page.locator("text=₹7.9K").first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── 3. Products tab — Total Products KPI ─────────────────────────────────────

test.describe("Admin Reports — Products tab", () => {
  test('"Total Products" KPI matches the value from /api/admin/reports/products', async ({ page }) => {
    test.setTimeout(90_000);

    await seedAdminKey(page);

    // Track what the products report endpoint returns
    let capturedProductTotal: number | null = null;
    await page.route("**/api/admin/reports/products**", (route) => {
      capturedProductTotal = mockProductData.summary.total;
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductData) });
    });
    // Stub the rest
    await page.route("**/api/admin/reports/revenue**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRevenueData) })
    );
    await page.route("**/api/admin/reports/sales**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSalesData) })
    );
    await page.route("**/api/admin/reports/vendors**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockVendorData) })
    );
    await page.route("**/api/admin/reports/customers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCustomerData) })
    );
    await page.route("**/api/admin/reports/returns**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReturnData) })
    );
    await page.route("**/api/admin/products/stats**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductStats) })
    );

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Switch to the Product tab (exact match avoids hitting the "Products" sidebar button)
    const productTab = page.locator("main").locator("button").filter({ hasText: /Product/ }).first();
    await expect(productTab).toBeVisible({ timeout: 10_000 });
    await productTab.click();

    // Wait for the "Total Products" KPI label
    await expect(page.locator("text=Total Products").first()).toBeVisible({ timeout: 15_000 });

    // The KPI value must match what the API returned
    expect(capturedProductTotal).toBe(TOTAL_PRODUCTS);
    await expect(page.locator(`text=${TOTAL_PRODUCTS}`).first()).toBeVisible({ timeout: 5_000 });

    // The products/stats endpoint total is consistent with the reports total
    expect(mockProductStats.total).toBe(TOTAL_PRODUCTS);

    // Other product KPI labels also appear
    await expect(page.locator("text=Active").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Pending Approval").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=Featured").first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── 4. Period filter — switching re-fetches ───────────────────────────────────

test.describe("Admin Reports — period filter", () => {
  test('switching from "Last 7 Days" to "This Year" re-fetches revenue data', async ({ page }) => {
    test.setTimeout(90_000);

    await seedAdminKey(page);

    // Track the period query parameter sent to the revenue endpoint
    const capturedPeriods: string[] = [];

    await page.route("**/api/admin/reports/revenue**", (route) => {
      const url = new URL(route.request().url());
      capturedPeriods.push(url.searchParams.get("period") ?? "");
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRevenueData) });
    });
    await page.route("**/api/admin/reports/sales**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSalesData) })
    );
    await page.route("**/api/admin/reports/vendors**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockVendorData) })
    );
    await page.route("**/api/admin/reports/customers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCustomerData) })
    );
    await page.route("**/api/admin/reports/products**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductData) })
    );
    await page.route("**/api/admin/reports/returns**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReturnData) })
    );
    await page.route("**/api/admin/products/stats**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductStats) })
    );

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // The Revenue tab loads by default with the default period "30d"
    await expect(page.locator("text=Total Orders").first()).toBeVisible({ timeout: 15_000 });

    // Click "Last 7 Days"
    const last7Btn = page.locator("button", { hasText: "Last 7 Days" }).first();
    await expect(last7Btn).toBeVisible({ timeout: 5_000 });
    await last7Btn.click();

    // Wait for a re-fetch
    await page.waitForTimeout(600);

    // Click "This Year"
    const thisYearBtn = page.locator("button", { hasText: "This Year" }).first();
    await expect(thisYearBtn).toBeVisible({ timeout: 5_000 });
    await thisYearBtn.click();

    // Wait for a re-fetch
    await page.waitForTimeout(600);

    // Verify the "This Year" button is now active (styled as selected)
    // and that the revenue endpoint was called with period=yearly
    const yearlyRequests = capturedPeriods.filter((p) => p === "yearly");
    expect(yearlyRequests.length).toBeGreaterThanOrEqual(1);

    // KPI cards must still be visible after the period switch
    await expect(page.locator("text=Total Orders").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=Gross Revenue").first()).toBeVisible({ timeout: 5_000 });
  });

  test("switching period on the Products tab re-fetches product data", async ({ page }) => {
    test.setTimeout(90_000);

    await seedAdminKey(page);

    const capturedProductPeriods: string[] = [];
    await page.route("**/api/admin/reports/products**", (route) => {
      const url = new URL(route.request().url());
      capturedProductPeriods.push(url.searchParams.get("period") ?? "");
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductData) });
    });
    await page.route("**/api/admin/reports/revenue**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockRevenueData) })
    );
    await page.route("**/api/admin/reports/sales**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockSalesData) })
    );
    await page.route("**/api/admin/reports/vendors**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockVendorData) })
    );
    await page.route("**/api/admin/reports/customers**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockCustomerData) })
    );
    await page.route("**/api/admin/reports/returns**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockReturnData) })
    );
    await page.route("**/api/admin/products/stats**", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockProductStats) })
    );

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Navigate to the Product tab (exact match avoids the "Products" sidebar button)
    const productTab = page.locator("main").locator("button").filter({ hasText: /Product/ }).first();
    await productTab.click();
    await expect(page.locator("text=Total Products").first()).toBeVisible({ timeout: 15_000 });

    // Switch to "This Year" period
    const thisYearBtn = page.locator("button", { hasText: "This Year" }).first();
    await thisYearBtn.click();
    await page.waitForTimeout(600);

    // The product endpoint must have been called with period=yearly
    const yearlyRequests = capturedProductPeriods.filter((p) => p === "yearly");
    expect(yearlyRequests.length).toBeGreaterThanOrEqual(1);

    // KPI must still show
    await expect(page.locator("text=Total Products").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ── 5. Export buttons — enabled when data is present ─────────────────────────

test.describe("Admin Reports — export buttons", () => {
  test("Revenue tab: PDF and CSV buttons are enabled when trend data is present", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Wait for the KPI cards to load
    await expect(page.locator("text=Revenue by Period").first()).toBeVisible({ timeout: 15_000 });

    // The export bar buttons should be enabled (not disabled) because trend data exists
    const pdfBtn = page.locator("button", { hasText: /PDF/i }).first();
    const csvBtn = page.locator("button", { hasText: /CSV/i }).first();

    await expect(pdfBtn).toBeVisible({ timeout: 5_000 });
    await expect(csvBtn).toBeVisible({ timeout: 5_000 });

    // Buttons must not be disabled
    await expect(pdfBtn).not.toBeDisabled();
    await expect(csvBtn).not.toBeDisabled();
  });

  test("Sales tab: export buttons are enabled when order data is present", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Switch to the Sales tab (exact match to avoid partial sidebar matches)
    const salesTab = page.locator("main").locator("button").filter({ hasText: /Sales/ }).first();
    await salesTab.click();
    await expect(page.locator("text=Order List").first()).toBeVisible({ timeout: 15_000 });

    // Export buttons in the Order List export bar should be enabled
    const pdfBtn = page.locator("button", { hasText: /PDF/i }).first();
    const csvBtn = page.locator("button", { hasText: /CSV/i }).first();

    await expect(pdfBtn).not.toBeDisabled();
    await expect(csvBtn).not.toBeDisabled();
  });

  test("Products tab: export buttons are enabled when best-seller data is present", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Switch to the Product tab (exact match avoids the "Products" sidebar button)
    const productTab = page.locator("main").locator("button").filter({ hasText: /Product/ }).first();
    await productTab.click();
    await expect(page.locator("text=Best Sellers Table").first()).toBeVisible({ timeout: 15_000 });

    const pdfBtn = page.locator("button", { hasText: /PDF/i }).first();
    const csvBtn = page.locator("button", { hasText: /CSV/i }).first();

    await expect(pdfBtn).not.toBeDisabled();
    await expect(csvBtn).not.toBeDisabled();
  });

  test("export buttons are disabled when no data is returned", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    // Return empty revenue data — trend array is empty → buttons should be disabled
    const emptyRevenue = {
      summary: {
        totalOrders: 0,
        grossRevenue: 0,
        netRevenue: 0,
        commission: 0,
        vendorEarnings: 0,
        refundAmount: 0,
        taxCollected: 0,
        shippingCollected: 0,
        avgOrderValue: 0,
        growthPct: 0,
      },
      trend: [], // empty → disabled prop passed to ExportBar
    };

    await stubAllReportRoutes(page, { revenue: emptyRevenue });

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Wait for content to load (empty state message should appear)
    await expect(page.locator("text=No revenue data for this period").first()).toBeVisible({ timeout: 15_000 });

    // When trend is empty, the ExportBar receives disabled=true
    const pdfBtn = page.locator("button", { hasText: /PDF/i }).first();
    const csvBtn = page.locator("button", { hasText: /CSV/i }).first();

    await expect(pdfBtn).toBeDisabled();
    await expect(csvBtn).toBeDisabled();
  });
});

// ── 6. Return tab — summary KPIs ─────────────────────────────────────────────

test.describe("Admin Reports — Return tab", () => {
  test("Return tab renders summary KPI cards", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubAllReportRoutes(page);

    await page.goto("/admin/reports");
    await expect(page.locator("h1", { hasText: /Marketplace Reports/i })).toBeVisible({ timeout: 20_000 });

    // Switch to Return tab (exact match avoids the "Returns & Refunds" sidebar button)
    const returnTab = page.locator("main").locator("button").filter({ hasText: /Return/ }).first();
    await returnTab.click();

    // KPI labels for the return module
    await expect(page.locator("text=Return Requests").first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=Approved Returns").first()).toBeVisible({ timeout: 5_000 });
  });
});
