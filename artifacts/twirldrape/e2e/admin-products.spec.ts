/**
 * Admin Products module — E2E Playwright tests.
 *
 * Covers the critical admin flows for managing marketplace products:
 *   1. KPI stats load and render on the page
 *   2. Product list table renders products from the API
 *   3. Approve flow — opening a product modal and clicking Approve Product
 *   4. Reject flow  — opening a product modal and clicking Reject Product
 *   5. Category CRUD — create a new category, then delete it
 *   6. Brand CRUD    — create a new brand, then delete it
 *
 * All API calls are intercepted with page.route() so the tests run
 * deterministically without a live database.  The admin key is seeded into
 * sessionStorage via page.addInitScript() to satisfy the x-admin-key guard.
 */

import { test, expect } from "@playwright/test";

// ── Fixtures ────────────────────────────────────────────────────────────────

const PRODUCT_ID  = "e2e-admin-prod-001";
const PRODUCT_ID2 = "e2e-admin-prod-002";

const baseProduct = {
  id: PRODUCT_ID,
  name: "Kanjivaram Silk Saree",
  price: 12500,
  originalPrice: 15000,
  category: "Silk Sarees",
  subcategory: null,
  brand: "Silk Palace",
  fabric: "Pure Silk",
  color: "Red",
  occasion: "Wedding",
  vendorId: "vendor-001",
  vendorName: "Silk House",
  images: [],
  videos: [],
  active: true,
  isFeatured: false,
  isBestSeller: false,
  isNewArrival: false,
  stock: 10,
  rating: 4.5,
  reviewCount: 20,
  status: "pending" as const,
  rejectionReason: null,
  approvalRemark: null,
  featuredOrder: null,
  featuredUntil: null,
  description: "A beautiful handwoven Kanjivaram silk saree.",
};

const baseProduct2 = {
  ...baseProduct,
  id: PRODUCT_ID2,
  name: "Banarasi Silk Saree",
  vendorId: "vendor-002",
  vendorName: "Banaras Weaves",
};

const approvedProduct = { ...baseProduct, status: "approved" as const, active: true };
const rejectedProduct = {
  ...baseProduct,
  status: "rejected" as const,
  active: false,
  rejectionReason: "Low quality images",
};

const mockStats = {
  total: 42,
  pending: 7,
  approved: 30,
  rejected: 5,
  featured: 4,
  activeCategories: 12,
  activeBrands: 8,
};

const mockCategory = {
  id: "cat-001",
  name: "Silk Sarees",
  slug: "silk-sarees",
  parentId: null,
  active: true,
  createdAt: new Date().toISOString(),
};

const newCategory = {
  ...mockCategory,
  id: "cat-new-001",
  name: "E2E Test Category",
  slug: "e2e-test-category",
};

const mockBrand = {
  id: "brand-001",
  name: "Silk Palace",
  slug: "silk-palace",
  categoryIds: [],
  active: true,
  createdAt: new Date().toISOString(),
};

const newBrand = {
  ...mockBrand,
  id: "brand-new-001",
  name: "E2E Test Brand",
  slug: "e2e-test-brand",
};

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Seeds the admin key into sessionStorage before the page loads. */
function seedAdminKey(page: import("@playwright/test").Page) {
  const key = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
  return page.addInitScript((k: string) => {
    sessionStorage.setItem("td_admin_key", k);
  }, key);
}

/** Stubs the stats, product-list, categories, and brands endpoints. */
async function stubBaseRoutes(
  page: import("@playwright/test").Page,
  opts: {
    products?: typeof baseProduct[];
    categories?: typeof mockCategory[];
    brands?: typeof mockBrand[];
  } = {}
) {
  const products = opts.products ?? [baseProduct];
  const categories = opts.categories ?? [mockCategory];
  const brands = opts.brands ?? [mockBrand];

  await page.route("**/api/admin/products/stats", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockStats),
    })
  );

  await page.route("**/api/admin/products?**", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products,
        total: products.length,
        page: 1,
        limit: 20,
        totalPages: 1,
      }),
    });
  });

  await page.route("**/api/admin/categories", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ categories }),
    });
  });

  await page.route("**/api/admin/brands", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ brands }),
    });
  });
}

// ── 1. KPI stats load ────────────────────────────────────────────────────────

test.describe("Admin Products — KPI stats", () => {
  test("stats load and all KPI cards render the correct values", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page);

    await page.goto("/admin/products");

    // Wait for the heading
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // All seven KPI values must appear in the cards
    await expect(page.locator("text=42").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("text=7").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=30").first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator("text=5").first()).toBeVisible({ timeout: 5_000 });

    // KPI labels are present (use .first() — some labels also appear in the tab bar)
    await expect(page.locator("text=Total Products").first()).toBeVisible();
    await expect(page.locator("text=Pending Approvals").first()).toBeVisible();
    await expect(page.locator("text=Approved").first()).toBeVisible();
    await expect(page.locator("text=Rejected").first()).toBeVisible();
    await expect(page.locator("text=Active Categories").first()).toBeVisible();
    await expect(page.locator("text=Active Brands").first()).toBeVisible();
    await expect(page.locator("text=Featured Products").first()).toBeVisible();
  });
});

// ── 2. Product list renders ──────────────────────────────────────────────────

test.describe("Admin Products — product list", () => {
  test("product list table renders rows from the API", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page);

    await page.goto("/admin/products");

    // The product name must appear in the table
    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 20_000 });

    // The vendor name column
    await expect(page.locator("text=Silk House").first()).toBeVisible({ timeout: 5_000 });

    // The price cell
    await expect(page.locator("text=₹12,500").first()).toBeVisible({ timeout: 5_000 });

    // Status badge
    await expect(page.locator("text=Pending").first()).toBeVisible({ timeout: 5_000 });
  });

  test("searching for a product name filters the API call", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    // Capture the search query sent to the API
    let capturedSearch = "";
    await page.route("**/api/admin/products/stats", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(mockStats),
      })
    );
    await page.route("**/api/admin/products?**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const url = new URL(route.request().url());
      capturedSearch = url.searchParams.get("search") ?? "";
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          products: capturedSearch ? [baseProduct] : [baseProduct],
          total: 1,
          page: 1,
          limit: 20,
          totalPages: 1,
        }),
      });
    });
    await page.route("**/api/admin/categories", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [] }) })
    );
    await page.route("**/api/admin/brands", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ brands: [] }) })
    );

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    const searchInput = page.locator("input[placeholder*='Search']").first();
    await expect(searchInput).toBeVisible({ timeout: 10_000 });
    await searchInput.fill("Kanjivaram");

    // Give the debounce / refetch a moment
    await page.waitForTimeout(1_000);

    // The search term must have reached the API
    expect(capturedSearch).toBe("Kanjivaram");
  });
});

// ── 3. Approve flow ──────────────────────────────────────────────────────────

test.describe("Admin Products — approve flow", () => {
  test("clicking Approve Product in the modal calls the approve API", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page, { products: [baseProduct] });

    let approveCallCount = 0;
    await page.route(`**/api/admin/products/${PRODUCT_ID}/approve`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      approveCallCount++;
      // Return the product in approved state
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ product: approvedProduct }),
      });
    });

    await page.goto("/admin/products");

    // Wait for the product row to appear
    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 20_000 });

    // Click the eye/view icon to open the product modal
    const viewBtn = page.locator("button[title='View']").first();
    await expect(viewBtn).toBeVisible({ timeout: 10_000 });
    await viewBtn.click();

    // Modal should open — check product name in the header
    await expect(
      page.locator("h2", { hasText: "Kanjivaram Silk Saree" })
    ).toBeVisible({ timeout: 10_000 });

    // Switch to the Approve sub-tab
    const approveTab = page.locator("button", { hasText: /✓ Approve/i }).first();
    await expect(approveTab).toBeVisible({ timeout: 5_000 });
    await approveTab.click();

    // Approval remark textarea should appear
    await expect(
      page.locator("textarea[placeholder*='Approved for listing']")
    ).toBeVisible({ timeout: 5_000 });

    // Click "Approve Product"
    const approveProductBtn = page.locator("button", { hasText: /Approve Product/i }).first();
    await expect(approveProductBtn).toBeVisible({ timeout: 5_000 });
    await approveProductBtn.click();

    // Wait for the modal to close (success)
    await expect(
      page.locator("h2", { hasText: "Kanjivaram Silk Saree" })
    ).not.toBeVisible({ timeout: 10_000 });

    // Exactly one approve request must have been made
    expect(approveCallCount).toBe(1);

    // Toast notification should appear
    await expect(
      page.locator("text=approved").first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── 4. Reject flow ───────────────────────────────────────────────────────────

test.describe("Admin Products — reject flow", () => {
  test("clicking Reject Product in the modal calls the reject API", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page, { products: [baseProduct] });

    let rejectCallCount = 0;
    let sentReason = "";
    await page.route(`**/api/admin/products/${PRODUCT_ID}/reject`, async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      rejectCallCount++;
      const body = route.request().postDataJSON() ?? {};
      sentReason = body.reason ?? "";
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ product: rejectedProduct }),
      });
    });

    await page.goto("/admin/products");

    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 20_000 });

    // Open the product modal
    const viewBtn = page.locator("button[title='View']").first();
    await expect(viewBtn).toBeVisible({ timeout: 10_000 });
    await viewBtn.click();

    await expect(
      page.locator("h2", { hasText: "Kanjivaram Silk Saree" })
    ).toBeVisible({ timeout: 10_000 });

    // Switch to the Reject sub-tab
    const rejectTab = page.locator("button", { hasText: /✕ Reject/i }).first();
    await expect(rejectTab).toBeVisible({ timeout: 5_000 });
    await rejectTab.click();

    // Fill in a rejection reason
    const reasonTextarea = page.locator("textarea[placeholder*='low quality']").first();
    await expect(reasonTextarea).toBeVisible({ timeout: 5_000 });
    await reasonTextarea.fill("Low quality images");

    // Click "Reject Product"
    const rejectProductBtn = page.locator("button", { hasText: /Reject Product/i }).first();
    await expect(rejectProductBtn).toBeVisible({ timeout: 5_000 });
    await rejectProductBtn.click();

    // Modal closes after success
    await expect(
      page.locator("h2", { hasText: "Kanjivaram Silk Saree" })
    ).not.toBeVisible({ timeout: 10_000 });

    expect(rejectCallCount).toBe(1);
    expect(sentReason).toBe("Low quality images");

    // Toast notification
    await expect(
      page.locator("text=rejected").first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── 5. Category CRUD ─────────────────────────────────────────────────────────

test.describe("Admin Products — category CRUD", () => {
  test("admin can create a new category", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page, { categories: [mockCategory] });

    let createCallCount = 0;
    let sentCategoryName = "";

    await page.route("**/api/admin/categories", async (route) => {
      if (route.request().method() === "GET") {
        // After creation, return the new category too
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ categories: [mockCategory, newCategory] }),
        });
      }
      if (route.request().method() === "POST") {
        createCallCount++;
        const body = route.request().postDataJSON() ?? {};
        sentCategoryName = body.name ?? "";
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ category: newCategory }),
        });
      }
      return route.continue();
    });

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // Switch to the Categories tab
    const categoriesTab = page.locator("button", { hasText: "Categories" }).first();
    await expect(categoriesTab).toBeVisible({ timeout: 10_000 });
    await categoriesTab.click();

    // Click "Add Category"
    const addBtn = page.locator("button", { hasText: /Add Category/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // Modal appears with "New Category" heading
    await expect(page.locator("h3", { hasText: "New Category" })).toBeVisible({ timeout: 5_000 });

    // Fill in the name
    const nameInput = page.locator("input").filter({ hasText: "" }).first();
    await nameInput.fill("E2E Test Category");

    // Click Create
    const createBtn = page.locator("button", { hasText: /^Create$/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
    await createBtn.click();

    // Modal closes
    await expect(page.locator("h3", { hasText: "New Category" })).not.toBeVisible({ timeout: 10_000 });

    // Exactly one POST was sent with the correct name
    expect(createCallCount).toBe(1);
    expect(sentCategoryName).toBe("E2E Test Category");

    // Toast
    await expect(page.locator("text=Category created").first()).toBeVisible({ timeout: 5_000 });
  });

  test("admin can delete a category via the confirm dialog", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    // Use a stateful handler: return the category until it is deleted, then return empty.
    let categoryDeleted = false;
    let deleteCallCount = 0;

    await page.route("**/api/admin/products/stats", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockStats) })
    );
    await page.route("**/api/admin/products?**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ products: [baseProduct], total: 1, page: 1, limit: 20, totalPages: 1 }),
      });
    });
    await page.route("**/api/admin/brands", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ brands: [mockBrand] }) });
    });

    // Stateful categories GET + DELETE handler
    await page.route("**/api/admin/categories**", async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === "DELETE" && url.includes(mockCategory.id)) {
        deleteCallCount++;
        categoryDeleted = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      if (method === "GET") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ categories: categoryDeleted ? [] : [mockCategory] }),
        });
      }
      return route.continue();
    });

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // Switch to Categories tab
    const categoriesTab = page.locator("button", { hasText: "Categories" }).first();
    await categoriesTab.click();

    // The category name must appear
    await expect(page.locator("td", { hasText: "Silk Sarees" }).first()).toBeVisible({ timeout: 10_000 });

    // Click the delete (trash) icon for this category
    const trashBtn = page.locator("button[title]").filter({ has: page.locator("svg") }).nth(2);
    // Use a more reliable locator: the delete button in the actions column
    const deleteBtn = page.locator("tr", { hasText: "Silk Sarees" }).locator("button").last();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm dialog appears
    await expect(page.locator("text=Delete")).toBeVisible({ timeout: 5_000 });
    const confirmBtn = page.locator("button", { hasText: /^Confirm$/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // One DELETE request must have been fired
    expect(deleteCallCount).toBe(1);

    // Toast
    await expect(page.locator("text=Category deleted").first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── 7. Bulk approve ──────────────────────────────────────────────────────────

test.describe("Admin Products — bulk approve", () => {
  test("selecting 2 products and clicking Approve sends one bulk POST with correct ids", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page, { products: [baseProduct, baseProduct2] });

    let bulkCallCount = 0;
    let sentBulkBody: { ids?: string[]; action?: string } = {};

    await page.route("**/api/admin/products/bulk", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      bulkCallCount++;
      sentBulkBody = route.request().postDataJSON() ?? {};
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, count: 2 }),
      });
    });

    await page.goto("/admin/products");

    // Wait for both product rows to render
    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator("p", { hasText: "Banarasi Silk Saree" }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Select both rows via the select-all checkbox in the header
    const selectAllCheckbox = page.locator("thead input[type='checkbox']").first();
    await expect(selectAllCheckbox).toBeVisible({ timeout: 10_000 });
    await selectAllCheckbox.check();

    // Bulk action bar should now show "2 selected"
    await expect(page.locator("text=2 selected").first()).toBeVisible({ timeout: 5_000 });

    // No bulk request has been sent yet
    expect(bulkCallCount).toBe(0);

    // Click the bulk "✓ Approve" button
    const bulkApproveBtn = page.locator("button", { hasText: /✓ Approve/i }).first();
    await expect(bulkApproveBtn).toBeVisible({ timeout: 5_000 });
    await bulkApproveBtn.click();

    // Confirmation dialog must appear before the request is made
    await expect(
      page.locator("h3", { hasText: /Approve 2 products/i })
    ).toBeVisible({ timeout: 5_000 });

    // Still no request yet
    expect(bulkCallCount).toBe(0);

    // Confirm the action
    const confirmBtn = page.locator("button", { hasText: /^Confirm$/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    // Exactly one POST must have been sent
    await page.waitForTimeout(500);
    expect(bulkCallCount).toBe(1);

    // The request body must contain both product ids and the "approve" action
    expect(sentBulkBody.action).toBe("approve");
    expect(new Set(sentBulkBody.ids)).toEqual(new Set([PRODUCT_ID, PRODUCT_ID2]));

    // Toast notification
    await expect(
      page.locator("text=Bulk approve applied").first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── 8. Bulk reject ───────────────────────────────────────────────────────────

test.describe("Admin Products — bulk reject", () => {
  test("selecting products and clicking Reject shows the confirmation dialog before sending the request", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page, { products: [baseProduct, baseProduct2] });

    let bulkCallCount = 0;
    let sentBulkBody: { ids?: string[]; action?: string } = {};

    await page.route("**/api/admin/products/bulk", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      bulkCallCount++;
      sentBulkBody = route.request().postDataJSON() ?? {};
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, count: 2 }),
      });
    });

    await page.goto("/admin/products");

    // Wait for product rows
    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator("p", { hasText: "Banarasi Silk Saree" }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Select both products individually via row checkboxes
    const rowCheckboxes = page.locator("tbody input[type='checkbox']");
    await rowCheckboxes.nth(0).check();
    await rowCheckboxes.nth(1).check();

    // Bulk action bar should now show "2 selected"
    await expect(page.locator("text=2 selected").first()).toBeVisible({ timeout: 5_000 });

    // No request yet
    expect(bulkCallCount).toBe(0);

    // Click the bulk "✕ Reject" button
    const bulkRejectBtn = page.locator("button", { hasText: /✕ Reject/i }).first();
    await expect(bulkRejectBtn).toBeVisible({ timeout: 5_000 });
    await bulkRejectBtn.click();

    // The confirmation dialog must appear — request must NOT be sent yet
    await expect(
      page.locator("h3", { hasText: /Reject 2 products/i })
    ).toBeVisible({ timeout: 5_000 });
    expect(bulkCallCount).toBe(0);

    // Dismiss with Cancel — verify no request is made
    const cancelBtn = page.locator("button", { hasText: /^Cancel$/i }).first();
    await expect(cancelBtn).toBeVisible({ timeout: 5_000 });
    await cancelBtn.click();

    // Dialog closes without a network call
    await expect(
      page.locator("h3", { hasText: /Reject 2 products/i })
    ).not.toBeVisible({ timeout: 5_000 });
    expect(bulkCallCount).toBe(0);

    // Now actually confirm the reject
    await bulkRejectBtn.click();
    await expect(
      page.locator("h3", { hasText: /Reject 2 products/i })
    ).toBeVisible({ timeout: 5_000 });

    const confirmBtn = page.locator("button", { hasText: /^Confirm$/i }).first();
    await confirmBtn.click();

    // Exactly one POST must have been sent
    await page.waitForTimeout(500);
    expect(bulkCallCount).toBe(1);
    expect(sentBulkBody.action).toBe("reject");
    expect(new Set(sentBulkBody.ids)).toEqual(new Set([PRODUCT_ID, PRODUCT_ID2]));

    // Toast notification
    await expect(
      page.locator("text=Bulk reject applied").first()
    ).toBeVisible({ timeout: 5_000 });
  });
});

// ── 6. Brand CRUD ────────────────────────────────────────────────────────────

test.describe("Admin Products — brand CRUD", () => {
  test("admin can create a new brand", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubBaseRoutes(page, { brands: [mockBrand] });

    let createCallCount = 0;
    let sentBrandName = "";

    await page.route("**/api/admin/brands", async (route) => {
      if (route.request().method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ brands: [mockBrand, newBrand] }),
        });
      }
      if (route.request().method() === "POST") {
        createCallCount++;
        const body = route.request().postDataJSON() ?? {};
        sentBrandName = body.name ?? "";
        return route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ brand: newBrand }),
        });
      }
      return route.continue();
    });

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // Switch to Brands tab
    const brandsTab = page.locator("button", { hasText: "Brands" }).first();
    await expect(brandsTab).toBeVisible({ timeout: 10_000 });
    await brandsTab.click();

    // Click "Add Brand"
    const addBtn = page.locator("button", { hasText: /Add Brand/i }).first();
    await expect(addBtn).toBeVisible({ timeout: 10_000 });
    await addBtn.click();

    // Modal appears with "New Brand" heading
    await expect(page.locator("h3", { hasText: "New Brand" })).toBeVisible({ timeout: 5_000 });

    // Fill in the name
    const nameInput = page.locator("input").filter({ hasText: "" }).first();
    await nameInput.fill("E2E Test Brand");

    // Click Create
    const createBtn = page.locator("button", { hasText: /^Create$/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 5_000 });
    await createBtn.click();

    // Modal closes
    await expect(page.locator("h3", { hasText: "New Brand" })).not.toBeVisible({ timeout: 10_000 });

    expect(createCallCount).toBe(1);
    expect(sentBrandName).toBe("E2E Test Brand");

    // Toast
    await expect(page.locator("text=Brand created").first()).toBeVisible({ timeout: 5_000 });
  });

  test("admin can delete a brand via the confirm dialog", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    // Stateful: return the brand until deleted, then return empty.
    let brandDeleted = false;
    let deleteCallCount = 0;

    await page.route("**/api/admin/products/stats", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockStats) })
    );
    await page.route("**/api/admin/products?**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ products: [baseProduct], total: 1, page: 1, limit: 20, totalPages: 1 }),
      });
    });
    await page.route("**/api/admin/categories", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [mockCategory] }) });
    });

    // Stateful brands GET + DELETE handler
    await page.route("**/api/admin/brands**", async (route) => {
      const method = route.request().method();
      const url = route.request().url();
      if (method === "DELETE" && url.includes(mockBrand.id)) {
        deleteCallCount++;
        brandDeleted = true;
        return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
      }
      if (method === "GET") {
        return route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ brands: brandDeleted ? [] : [mockBrand] }),
        });
      }
      return route.continue();
    });

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // Switch to Brands tab
    const brandsTab = page.locator("button", { hasText: "Brands" }).first();
    await brandsTab.click();

    // The brand name must appear
    await expect(page.locator("td", { hasText: "Silk Palace" }).first()).toBeVisible({ timeout: 10_000 });

    // Click the delete button for this brand
    const deleteBtn = page.locator("tr", { hasText: "Silk Palace" }).locator("button").last();
    await expect(deleteBtn).toBeVisible({ timeout: 5_000 });
    await deleteBtn.click();

    // Confirm dialog
    await expect(page.locator("text=Delete")).toBeVisible({ timeout: 5_000 });
    const confirmBtn = page.locator("button", { hasText: /^Confirm$/i }).first();
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 });
    await confirmBtn.click();

    expect(deleteCallCount).toBe(1);

    // Toast
    await expect(page.locator("text=Brand deleted").first()).toBeVisible({ timeout: 5_000 });
  });
});

// ── 9. Featured reorder ───────────────────────────────────────────────────────

const FEAT_ID_1 = "feat-prod-001";
const FEAT_ID_2 = "feat-prod-002";

const featuredProduct1 = {
  ...baseProduct,
  id: FEAT_ID_1,
  name: "Kanjivaram Silk Saree",
  status: "approved" as const,
  active: true,
  isFeatured: true,
  featuredOrder: 1,
};

const featuredProduct2 = {
  ...baseProduct,
  id: FEAT_ID_2,
  name: "Banarasi Silk Saree",
  vendorId: "vendor-002",
  vendorName: "Banaras Weaves",
  status: "approved" as const,
  active: true,
  isFeatured: true,
  featuredOrder: 2,
};

test.describe("Admin Products — featured reorder", () => {
  test("clicking the down arrow on the first featured product PATCHes featured-order with the correct body", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    await page.route("**/api/admin/products/stats", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockStats) })
    );

    // The FeaturedTab queries: /api/admin/products?status=approved&limit=100&sort=newest
    // The All Products tab queries without status=approved.
    // Return featured products for every GET on the products list endpoint.
    await page.route("**/api/admin/products?**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          products: [featuredProduct1, featuredProduct2],
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1,
        }),
      });
    });

    await page.route("**/api/admin/categories", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [] }) });
    });
    await page.route("**/api/admin/brands", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ brands: [] }) });
    });

    let patchCallCount = 0;
    let sentOrderBody: { order?: Record<string, number> } = {};

    await page.route("**/api/admin/products/featured-order", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      patchCallCount++;
      sentOrderBody = route.request().postDataJSON() ?? {};
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // Switch to the Featured tab
    const featuredTab = page.locator("button", { hasText: "Featured" }).first();
    await expect(featuredTab).toBeVisible({ timeout: 10_000 });
    await featuredTab.click();

    // Both featured products must appear in the list
    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("p", { hasText: "Banarasi Silk Saree" }).first()
    ).toBeVisible({ timeout: 5_000 });

    // No PATCH has been sent yet
    expect(patchCallCount).toBe(0);

    // Find the first draggable row (Kanjivaram — position 1) and click its down-arrow.
    // Each row renders three action buttons: [ChevronUp (disabled at idx=0), ChevronDown, X].
    const firstRow = page.locator('[draggable="true"]', { hasText: "Kanjivaram Silk Saree" }).first();
    await expect(firstRow).toBeVisible({ timeout: 5_000 });

    // button index 0 = up (disabled), 1 = down, 2 = remove
    const downBtn = firstRow.locator("button").nth(1);
    await expect(downBtn).toBeVisible({ timeout: 5_000 });
    await downBtn.click();

    // Wait for the async PATCH request to complete
    await page.waitForTimeout(500);

    // Exactly one PATCH must have been made
    expect(patchCallCount).toBe(1);

    // After swapping, the new order is: [feat-prod-002 at 1, feat-prod-001 at 2]
    expect(sentOrderBody.order).toEqual({
      [FEAT_ID_1]: 2,
      [FEAT_ID_2]: 1,
    });

    // A success toast must appear
    await expect(page.locator("text=Order saved").first()).toBeVisible({ timeout: 5_000 });
  });

  test("clicking the up arrow on the second featured product PATCHes featured-order with the correct body", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);

    await page.route("**/api/admin/products/stats", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(mockStats) })
    );
    await page.route("**/api/admin/products?**", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          products: [featuredProduct1, featuredProduct2],
          total: 2,
          page: 1,
          limit: 100,
          totalPages: 1,
        }),
      });
    });
    await page.route("**/api/admin/categories", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ categories: [] }) });
    });
    await page.route("**/api/admin/brands", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ brands: [] }) });
    });

    let patchCallCount = 0;
    let sentOrderBody: { order?: Record<string, number> } = {};

    await page.route("**/api/admin/products/featured-order", async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      patchCallCount++;
      sentOrderBody = route.request().postDataJSON() ?? {};
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    });

    await page.goto("/admin/products");
    await expect(page.locator("h1", { hasText: /Products/i })).toBeVisible({ timeout: 20_000 });

    // Switch to the Featured tab
    const featuredTab = page.locator("button", { hasText: "Featured" }).first();
    await expect(featuredTab).toBeVisible({ timeout: 10_000 });
    await featuredTab.click();

    // Both featured products must appear
    await expect(
      page.locator("p", { hasText: "Kanjivaram Silk Saree" }).first()
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.locator("p", { hasText: "Banarasi Silk Saree" }).first()
    ).toBeVisible({ timeout: 5_000 });

    // Find the second row (Banarasi — position 2) and click its up-arrow.
    // button index 0 = up (enabled for idx > 0), 1 = down (disabled at last), 2 = remove
    const secondRow = page.locator('[draggable="true"]', { hasText: "Banarasi Silk Saree" }).first();
    await expect(secondRow).toBeVisible({ timeout: 5_000 });

    const upBtn = secondRow.locator("button").nth(0);
    await expect(upBtn).toBeVisible({ timeout: 5_000 });
    await upBtn.click();

    await page.waitForTimeout(500);

    // Exactly one PATCH
    expect(patchCallCount).toBe(1);

    // Moving second product up produces the same swap: [feat-prod-002 at 1, feat-prod-001 at 2]
    expect(sentOrderBody.order).toEqual({
      [FEAT_ID_1]: 2,
      [FEAT_ID_2]: 1,
    });

    // Success toast
    await expect(page.locator("text=Order saved").first()).toBeVisible({ timeout: 5_000 });
  });
});
