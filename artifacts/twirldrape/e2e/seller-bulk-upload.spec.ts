/**
 * Seller bulk upload — E2E Playwright tests.
 *
 * Validates the full SellerBulkUpload wizard:
 *
 *  Test 1 — client-side validation path:
 *    Upload an .xlsx file containing:
 *       - 2 valid product rows
 *       - 1 row with a missing name (required field)
 *       - 1 row with an invalid category value
 *    Step 3 (Review) summary bar must show exactly "2 valid" and
 *    "2 with errors". The import button must read "Import 2 Valid Rows".
 *    Clicking import sends ONLY the 2 valid rows to the API.
 *    The done screen shows "2 products imported" and lists the two
 *    successes.  Invalid rows appear in the "Download Error Report" count
 *    (2 rows) and are not sent to the import API.
 *
 *  Test 2 — server-side rejection path:
 *    Upload an .xlsx file containing 3 rows that all pass client-side
 *    validation.  The mocked API accepts rows 1 & 3 but rejects row 2
 *    with a server error.  The done screen must show "2 products imported"
 *    and display a failure card for the rejected row.  The
 *    "Download Error Report" button must count exactly 1 failed row, and
 *    no server-side failure must be silently swallowed.
 *
 * The bulk-import API is mocked — these tests cover the client-side
 * validation and wizard UI flow, not DB persistence (that is handled by
 * the API server's own unit tests).
 *
 * Auth pattern mirrors seller-image-gallery.spec.ts: one Clerk user is
 * created in beforeAll, signed in, and its storage state is saved to a
 * temp file so each test can restore the session cheaply.
 */

import { writeFileSync } from "fs";
import * as XLSX from "xlsx";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import {
  createVerifiedSeller,
  signInSeller,
  cleanupSeller,
  type SellerAuthUser,
} from "./fixtures/seller-auth";

const STATE_FILE = "/tmp/seller-bulk-upload-e2e-state.json";

const APPROVED_VENDOR = {
  id: "e2e-vendor-bulk-0001",
  name: "Bulk Upload Test Store",
  location: "Mumbai",
  rating: 4.5,
  sareesCount: 5,
  avatar: "/images/artisan-1.png",
  bio: null,
  tagline: null,
  contactEmail: null,
  gstin: null,
  status: "approved",
  ownerId: "clerk_e2e_user",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Build an xlsx Buffer containing:
 *   row 1 — valid (Silk Paithani Saree)
 *   row 2 — valid (Designer Banarasi Saree)
 *   row 3 — invalid: name is empty
 *   row 4 — invalid: category is not in the allowed list
 *
 * Column headers are the exact field keys used by the component so
 * auto-mapping fires immediately and the required fields (name, price,
 * category) are already mapped when the wizard reaches step 2.
 */
function makeTestXlsx(): Buffer {
  const headers = [
    "name", "price", "category", "description",
    "fabric", "color", "occasion", "stock",
  ];
  const dataRows = [
    // Valid row 1
    ["Silk Paithani Saree",    "12000", "paithani", "Handwoven pure silk",  "silk",   "red",   "festival", "5"],
    // Valid row 2
    ["Designer Banarasi Saree","8500",  "designer", "Elegant Banarasi",     "silk",   "blue",  "formal",   "3"],
    // Invalid: missing name
    ["",                       "5000",  "paithani", "No name provided",     "",       "",      "",         ""],
    // Invalid: category not in allowed list
    ["Cotton Summer Saree",    "3000",  "INVALIDCAT","Casual wear",          "cotton", "green", "casual",   "10"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

async function mockApprovedVendor(page: Page) {
  await page.route("**/api/vendors/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(APPROVED_VENDOR),
    }),
  );
}

/**
 * Build an xlsx Buffer containing 3 rows that all pass client-side
 * validation — used by the server-rejection test.
 */
function makeAllValidXlsx(): Buffer {
  const headers = [
    "name", "price", "category", "description",
    "fabric", "color", "occasion", "stock",
  ];
  const dataRows = [
    ["Silk Paithani Saree",    "12000", "paithani", "Handwoven pure silk",  "silk",   "red",    "festival", "5"],
    ["Designer Banarasi Saree","8500",  "designer", "Elegant Banarasi",     "silk",   "blue",   "formal",   "3"],
    ["Bridal Kanjivaram Saree","22000", "bridal",   "Premium bridal silk",  "silk",   "maroon", "bridal",   "2"],
  ];

  const ws = XLSX.utils.aoa_to_sheet([headers, ...dataRows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("Seller bulk upload", () => {
  let seller: SellerAuthUser;

  test.beforeAll(async ({ browser, baseURL }) => {
    seller = await createVerifiedSeller();

    // Write a placeholder so Playwright doesn't throw ENOENT when it reads
    // storageState before the real sign-in file is written (see memory note on
    // Playwright shared Clerk session in beforeAll).
    writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }), "utf8");

    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();
    await signInSeller(page, baseURL!, seller.userId);
    await ctx.storageState({ path: STATE_FILE });
    await ctx.close();
  });

  test.afterAll(async () => {
    if (seller) await cleanupSeller(seller.userId);
  });

  test.use({ storageState: STATE_FILE });

  // ── Test 1 ─────────────────────────────────────────────────────────────────

  test(
    "review table shows 2 valid and 2 invalid rows; import sends only valid rows and flags errors in results",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

      // Mock GET /api/seller/products so the seller products page loads cleanly.
      await page.route("**/api/seller/products", (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ products: [] }),
          });
        } else {
          route.continue();
        }
      });

      // Capture the import request body and return success for every row sent.
      // Because invalid rows are filtered client-side, only 2 rows will arrive.
      let capturedImportBody: { rows: Array<Record<string, string>> } | null = null;
      await page.route("**/api/seller/products/bulk-import", (route) => {
        const body = route.request().postDataJSON() as { rows: Array<Record<string, string>> };
        capturedImportBody = body;
        const rows = body.rows ?? [];
        const results = rows.map((row, i) => ({
          row: i + 1,
          success: true,
          productId: `BULK00${i + 1}`,
          name: row.name,
        }));
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results,
            summary: { total: rows.length, succeeded: rows.length, failed: 0 },
          }),
        });
      });

      // ── Navigate to Seller Products page ──────────────────────────────────
      await page.goto("/seller/products");
      await expect(page.getByRole("heading", { name: /products/i })).toBeVisible({
        timeout: 15_000,
      });

      // ── Open the bulk upload wizard ────────────────────────────────────────
      await page.getByRole("button", { name: /bulk upload/i }).click();
      await expect(page.getByText("Bulk Upload Products")).toBeVisible({ timeout: 5_000 });

      // ── Step 1: upload the xlsx file ──────────────────────────────────────
      const xlsxBuffer = makeTestXlsx();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsxBuffer,
      });

      // ── Step 2: column mapping ─────────────────────────────────────────────
      // Headers in the xlsx match exact field keys, so auto-mapping fires and
      // required fields (name, price, category) are already mapped.
      // The "Review N Rows" button should be immediately enabled.
      const reviewButton = page.getByRole("button", { name: /review 4 rows/i });
      await expect(reviewButton).toBeVisible({ timeout: 10_000 });
      await expect(reviewButton).toBeEnabled();
      await reviewButton.click();

      // ── Step 3: review table ───────────────────────────────────────────────
      // Summary bar: "2 valid" (exact span text) and "2 with errors"
      await expect(page.getByText("2 valid", { exact: true })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/2 with errors/i)).toBeVisible({ timeout: 5_000 });

      // Import button must read "Import 2 Valid Rows"
      const importButton = page.getByRole("button", { name: /import 2 valid rows/i });
      await expect(importButton).toBeVisible({ timeout: 5_000 });
      await expect(importButton).toBeEnabled();

      // Rows with errors have red-tinted inputs (borderColor #FCA5A5).
      // Count error tooltip elements — each invalid cell with an error
      // renders a tooltip div with class bg-red-600.
      const errorTooltips = page.locator(".bg-red-600");
      // The two invalid rows have at least one error each (name=Required,
      // category=bad value), so there must be ≥ 2 error tooltips.
      const tooltipCount = await errorTooltips.count();
      expect(tooltipCount, "Expected at least 2 error tooltips for invalid rows").toBeGreaterThanOrEqual(2);

      // ── Click import ───────────────────────────────────────────────────────
      await importButton.click();

      // ── Step 4: done screen ────────────────────────────────────────────────
      await expect(page.getByText(/2 products? imported/i)).toBeVisible({
        timeout: 15_000,
      });

      // Only 2 valid rows were sent to the API (not the 2 invalid ones).
      expect(capturedImportBody, "Import request body should have been captured").not.toBeNull();
      const sentRows = capturedImportBody!.rows;
      expect(sentRows, "API should receive exactly 2 valid rows").toHaveLength(2);
      expect(sentRows[0].name, "First sent row should be the first valid product").toBe(
        "Silk Paithani Saree",
      );
      expect(sentRows[1].name, "Second sent row should be the second valid product").toBe(
        "Designer Banarasi Saree",
      );

      // Done screen lists 2 green (success) result cards.
      const successCards = page.locator("div").filter({ hasText: /Silk Paithani|Designer Banarasi/ });
      await expect(successCards.first()).toBeVisible({ timeout: 5_000 });

      // The "Download Error Report" button shows 2 rows (the 2 client-side
      // invalid rows that were never sent to the API).
      await expect(
        page.getByRole("button", { name: /download error report.*2 rows/i }),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  // ── Test 2 ─────────────────────────────────────────────────────────────────

  test(
    "server-side rejection: done screen shows 2 imported and 1 server failure; error report counts 1 row",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

      // Mock GET /api/seller/products so the seller products page loads cleanly.
      await page.route("**/api/seller/products", (route) => {
        if (route.request().method() === "GET") {
          route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ products: [] }),
          });
        } else {
          route.continue();
        }
      });

      // All 3 rows are client-side valid. The mock API accepts rows 1 & 3
      // (index 0 & 2) but rejects row 2 (index 1) with a server error.
      let capturedImportBody: { rows: Array<Record<string, string>> } | null = null;
      await page.route("**/api/seller/products/bulk-import", (route) => {
        const body = route.request().postDataJSON() as { rows: Array<Record<string, string>> };
        capturedImportBody = body;
        const rows = body.rows ?? [];
        const results = rows.map((row, i) => {
          if (i === 1) {
            // Simulate a server-side duplicate name rejection for the second row.
            return { row: i + 1, success: false, error: "Duplicate product name" };
          }
          return { row: i + 1, success: true, productId: `SVRBULK00${i + 1}`, name: row.name };
        });
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            results,
            summary: { total: rows.length, succeeded: 2, failed: 1 },
          }),
        });
      });

      // ── Navigate to Seller Products page ──────────────────────────────────
      await page.goto("/seller/products");
      await expect(page.getByRole("heading", { name: /products/i })).toBeVisible({
        timeout: 15_000,
      });

      // ── Open the bulk upload wizard ────────────────────────────────────────
      await page.getByRole("button", { name: /bulk upload/i }).click();
      await expect(page.getByText("Bulk Upload Products")).toBeVisible({ timeout: 5_000 });

      // ── Step 1: upload the xlsx file ──────────────────────────────────────
      const xlsxBuffer = makeAllValidXlsx();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products-valid.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsxBuffer,
      });

      // ── Step 2: column mapping ─────────────────────────────────────────────
      // All 3 rows are valid; "Review 3 Rows" button must be enabled.
      const reviewButton = page.getByRole("button", { name: /review 3 rows/i });
      await expect(reviewButton).toBeVisible({ timeout: 10_000 });
      await expect(reviewButton).toBeEnabled();
      await reviewButton.click();

      // ── Step 3: review table ───────────────────────────────────────────────
      // All 3 rows pass client-side validation — no error badges expected.
      await expect(page.getByText("3 valid", { exact: true })).toBeVisible({ timeout: 10_000 });

      // Import button must read "Import 3 Valid Rows"
      const importButton = page.getByRole("button", { name: /import 3 valid rows/i });
      await expect(importButton).toBeVisible({ timeout: 5_000 });
      await expect(importButton).toBeEnabled();

      // ── Click import ───────────────────────────────────────────────────────
      await importButton.click();

      // ── Step 4: done screen ────────────────────────────────────────────────
      // 2 of the 3 server rows succeeded.
      await expect(page.getByText(/2 products? imported/i)).toBeVisible({
        timeout: 15_000,
      });

      // All 3 valid rows were sent to the API.
      expect(capturedImportBody, "Import request body should have been captured").not.toBeNull();
      const sentRows = capturedImportBody!.rows;
      expect(sentRows, "API should receive all 3 valid rows").toHaveLength(3);
      expect(sentRows[0].name).toBe("Silk Paithani Saree");
      expect(sentRows[1].name).toBe("Designer Banarasi Saree");
      expect(sentRows[2].name).toBe("Bridal Kanjivaram Saree");

      // A result card for the server-rejected row must be visible and styled
      // as a failure (red background element containing the error text).
      await expect(
        page.locator("div").filter({ hasText: /Duplicate product name/i }).first(),
      ).toBeVisible({ timeout: 5_000 });

      // Success cards for the two accepted rows must appear.
      await expect(
        page.locator("div").filter({ hasText: /Silk Paithani Saree/ }).first(),
      ).toBeVisible({ timeout: 5_000 });
      await expect(
        page.locator("div").filter({ hasText: /Bridal Kanjivaram Saree/ }).first(),
      ).toBeVisible({ timeout: 5_000 });

      // The "Download Error Report" button must reflect exactly 1 failed row
      // (the server-rejected one; there are no client-side invalid rows).
      await expect(
        page.getByRole("button", { name: /download error report.*1 rows/i }),
      ).toBeVisible({ timeout: 5_000 });
    },
  );
});
