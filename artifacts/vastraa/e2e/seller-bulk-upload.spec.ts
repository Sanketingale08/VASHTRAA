/**
 * Seller bulk upload — E2E Playwright tests.
 *
 * Validates the SellerBulkUpload wizard (Upload → Processing → Results):
 *
 *  Test 1 — client-side validation path:
 *    Upload an .xlsx file containing:
 *       - 2 valid product rows
 *       - 1 row with a missing name (required field)
 *       - 1 row with an invalid category value
 *    The wizard auto-processes the file.  The results screen shows
 *    "2 products imported" and the "Download Error Report (2 rows)" button.
 *    Only the 2 valid rows are sent to the import API.
 *
 *  Test 2 — server-side rejection path:
 *    Upload an .xlsx file containing 3 rows that all pass client-side
 *    validation.  The mocked API accepts rows 1 & 3 but rejects row 2
 *    with a server error.  The results screen must show "2 products imported"
 *    and a failure card for the rejected row.  The "Download Error Report"
 *    button must count exactly 1 failed row.
 *
 *  Test 3 — HTTP 500 crash / retry:
 *    First import attempt returns HTTP 500.  The wizard stays on the
 *    Processing step, shows an error banner, and exposes a "Retry Import"
 *    button.  Clicking retry (which returns 200) advances to Results.
 *
 *  Test 5 — network disconnect / retry:
 *    First import attempt is aborted before a response arrives.  The wizard
 *    stays on Processing, shows an error banner, and keeps "Retry Import"
 *    enabled.  Clicking retry (which returns 200) advances to Results.
 *
 * The bulk-import API is mocked — these tests cover client-side
 * validation and wizard UI flow, not DB persistence.
 *
 * Auth pattern mirrors seller-image-gallery.spec.ts.
 */

import { readFileSync, writeFileSync } from "fs";
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
 * This mirrors the supplied workbook: decorative rows precede friendly headers
 * on row 7, including the intentionally unsupported "Varients" column.
 */
function makeTestXlsx(): Buffer {
  const headers = [
    "Product Name *", "Price (₹) *", "Category *", "Description",
    "Fabric", "Color", "Occasion", "Stock", "Original Price (₹)",
    "Varients", "Subcategory", "Brand", "Design Pattern", "Images (URL)",
  ];
  const dataRows = [
    // Valid row 1
    ["Silk Paithani Saree", 12000, "paithani", "Handwoven pure silk", "silk", "red", "festival", 5, 15000, "6 Var", "", "", "", ""],
    // Valid row 2
    ["Designer Banarasi Saree", 8500, "designer", "Elegant Banarasi", "silk", "blue", "formal", 3, "", "4 Var", "", "", "", ""],
    // Invalid: missing name
    ["", 5000, "paithani", "No name provided", "", "", "", "", "", "", "", "", "", ""],
    // Invalid: category not in allowed list
    ["Cotton Summer Saree", 3000, "INVALIDCAT", "Casual wear", "cotton", "green", "casual", 10, "", "", "", "", "", ""],
  ];

  const decorativeRows = [
    ["", "", "", "", "PRODUCT CATALOG TEMPLATE"],
    [],
    [],
    ["", "", "", "", "Paithani & Designer Saree | Product Master Sheet"],
    [],
    ["Add one product per row below."],
  ];
  const ws = XLSX.utils.aoa_to_sheet([...decorativeRows, headers, ...dataRows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Build an xlsx Buffer containing 3 rows that all pass client-side
 * validation — used by the server-rejection and retry tests.
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

async function mockApprovedVendor(page: Page) {
  await page.route("**/api/vendors/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(APPROVED_VENDOR),
    }),
  );
}

// ── Suite ─────────────────────────────────────────────────────────────────────

test.describe("Seller bulk upload", () => {
  let seller: SellerAuthUser;

  test.beforeAll(async ({ browser, baseURL }) => {
    seller = await createVerifiedSeller();

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
    "auto-processes file: sends only 2 valid rows, results show 2 imported and error report with 2 rows",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

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

      // Capture the import request body; return success for every row sent.
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

      // The download button must serve the supplied workbook byte-for-byte.
      const downloadPromise = page.waitForEvent("download");
      await page.getByRole("button", { name: /template/i }).click();
      const templateDownload = await downloadPromise;
      expect(templateDownload.suggestedFilename()).toBe("twirldrape_product_template.xlsx");
      const downloadedPath = await templateDownload.path();
      expect(downloadedPath).not.toBeNull();
      const expectedTemplate = readFileSync(
        new URL(
          "../../../attached_assets/twirldrape_product_template1_(1)_1787117520135.xlsx",
          import.meta.url,
        ),
      );
      expect(readFileSync(downloadedPath!)).toEqual(expectedTemplate);

      // ── Upload the xlsx file — wizard auto-processes ──────────────────────
      const xlsxBuffer = makeTestXlsx();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsxBuffer,
      });

      // Preview screen: confirm import of valid products
      const confirmButton = page.getByRole("button", { name: /confirm & import/i });
      await expect(confirmButton).toBeVisible({ timeout: 10_000 });
      await confirmButton.click();

      // ── Results screen ────────────────────────────────────────────────────
      // Wait for processing to complete and results to appear
      await expect(page.getByText(/2 products? imported/i)).toBeVisible({
        timeout: 20_000,
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

      // Results screen shows success cards for the 2 imported products.
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
    "server-side rejection: results show 2 imported and 1 server failure; error report counts 1 row",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

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

      // ── Upload all-valid xlsx file ────────────────────────────────────────
      const xlsxBuffer = makeAllValidXlsx();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products-valid.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsxBuffer,
      });

      // Preview screen: confirm import
      const confirmButton = page.getByRole("button", { name: /confirm & import/i });
      await expect(confirmButton).toBeVisible({ timeout: 10_000 });
      await confirmButton.click();

      // ── Results screen ────────────────────────────────────────────────────
      await expect(page.getByText(/2 products? imported/i)).toBeVisible({
        timeout: 20_000,
      });

      // All 3 valid rows were sent to the API.
      expect(capturedImportBody, "Import request body should have been captured").not.toBeNull();
      const sentRows = capturedImportBody!.rows;
      expect(sentRows, "API should receive all 3 valid rows").toHaveLength(3);
      expect(sentRows[0].name).toBe("Silk Paithani Saree");
      expect(sentRows[1].name).toBe("Designer Banarasi Saree");
      expect(sentRows[2].name).toBe("Bridal Kanjivaram Saree");

      // A result card for the server-rejected row must be visible.
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

      // The "Download Error Report" button must reflect exactly 1 failed row.
      await expect(
        page.getByRole("button", { name: /download error report.*1 rows/i }),
      ).toBeVisible({ timeout: 5_000 });
    },
  );

  // ── Test 3 ─────────────────────────────────────────────────────────────────

  test(
    "HTTP 500 crash: processing step shows error banner with Retry Import; retry succeeds and advances to results",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

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

      // First call returns HTTP 500. Second call (retry) succeeds.
      let callCount = 0;
      await page.route("**/api/seller/products/bulk-import", (route) => {
        callCount += 1;
        if (callCount === 1) {
          route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Internal server error" }),
          });
          return;
        }
        // Retry succeeds for all rows.
        const body = route.request().postDataJSON() as { rows: Array<Record<string, string>> };
        const rows = body.rows ?? [];
        const results = rows.map((row, i) => ({
          row: i + 1,
          success: true,
          productId: `RETRY00${i + 1}`,
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

      // ── Upload all-valid xlsx file (triggers auto-import → first attempt → 500) ──
      const xlsxBuffer = makeAllValidXlsx();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products-valid.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsxBuffer,
      });

      // Preview screen: confirm import (triggers first attempt → 500)
      const confirmButton = page.getByRole("button", { name: /confirm & import/i });
      await expect(confirmButton).toBeVisible({ timeout: 10_000 });
      await confirmButton.click();

      // ── Processing step: error banner appears after 500 response ──────────
      // The wizard must NOT advance to the results step.
      await expect(page.getByText("Import failed")).toBeVisible({ timeout: 15_000 });

      // The server's error message must appear.
      await expect(
        page.locator("text=Internal server error"),
      ).toBeVisible({ timeout: 10_000 });

      // The "Retry Import" button must be visible and enabled.
      const retryButton = page.getByRole("button", { name: /retry import/i });
      await expect(retryButton).toBeVisible({ timeout: 5_000 });
      await expect(retryButton).toBeEnabled();

      // ── Retry — server now succeeds ────────────────────────────────────────
      await retryButton.click();

      // After the successful retry the wizard advances to the results screen.
      await expect(page.getByText(/3 products? imported/i)).toBeVisible({
        timeout: 15_000,
      });

      // Both the first (failed) and second (successful) calls were made.
      expect(callCount).toBe(2);
    },
  );

  // ── Test 4 ─────────────────────────────────────────────────────────────────

  test(
    "retry reuses the same Idempotency-Key so a lost response replays the original batch",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

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

      // Simulate a lost response: the FIRST attempt "succeeds" on the server
      // (it stored the batch) but the response never reaches the client — we
      // model that as a network abort. The retry (same key) receives the stored
      // completed response. We assert both requests carry the SAME key.
      const seenKeys: string[] = [];
      let callCount = 0;
      await page.route("**/api/seller/products/bulk-import", (route) => {
        callCount += 1;
        seenKeys.push(route.request().headers()["idempotency-key"] ?? "");
        if (callCount === 1) {
          // Response lost in transit — client will surface an error and offer retry.
          route.abort("failed");
          return;
        }
        // Retry with the same key: server replays the original completed batch.
        const body = route.request().postDataJSON() as { rows: Array<Record<string, string>> };
        const rows = body.rows ?? [];
        const results = rows.map((row, i) => ({
          row: i + 1,
          success: true,
          productId: `IDEMP00${i + 1}`,
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

      await page.goto("/seller/products");
      await expect(page.getByRole("heading", { name: /products/i })).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /bulk upload/i }).click();
      await expect(page.getByText("Bulk Upload Products")).toBeVisible({ timeout: 5_000 });

      const xlsxBuffer = makeAllValidXlsx();
      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products-valid.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: xlsxBuffer,
      });

      // Preview screen: confirm import (triggers network abort)
      const confirmButton = page.getByRole("button", { name: /confirm & import/i });
      await expect(confirmButton).toBeVisible({ timeout: 10_000 });
      await confirmButton.click();

      // First attempt failed (aborted) → error banner + Retry button.
      await expect(page.getByText("Import failed")).toBeVisible({ timeout: 15_000 });
      const retryButton = page.getByRole("button", { name: /retry import/i });
      await expect(retryButton).toBeVisible({ timeout: 5_000 });

      // Retry — succeeds and advances to results.
      await retryButton.click();
      await expect(page.getByText(/3 products? imported/i)).toBeVisible({
        timeout: 15_000,
      });

      // Exactly two requests were made and BOTH used the identical key.
      expect(callCount).toBe(2);
      expect(seenKeys[0]).toBeTruthy();
      expect(seenKeys[0]).toBe(seenKeys[1]);
    },
  );

  // ── Test 5 ─────────────────────────────────────────────────────────────────

  test(
    "network disconnect: stays on Processing with an enabled retry; restored request succeeds",
    async ({ page }) => {
      test.setTimeout(120_000);

      await mockApprovedVendor(page);

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

      let callCount = 0;
      await page.route("**/api/seller/products/bulk-import", (route) => {
        callCount += 1;

        if (callCount === 1) {
          // Simulate the connection dropping before fetch receives a response.
          route.abort("failed");
          return;
        }

        const body = route.request().postDataJSON() as {
          rows: Array<Record<string, string>>;
        };
        const rows = body.rows ?? [];
        const results = rows.map((row, i) => ({
          row: i + 1,
          success: true,
          productId: `NETWORK00${i + 1}`,
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

      await page.goto("/seller/products");
      await expect(page.getByRole("heading", { name: /products/i })).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole("button", { name: /bulk upload/i }).click();
      await expect(page.getByText("Bulk Upload Products")).toBeVisible({ timeout: 5_000 });

      const fileInput = page.locator('input[type="file"]').first();
      await fileInput.setInputFiles({
        name: "test-products-network.xlsx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        buffer: makeAllValidXlsx(),
      });

      // Preview screen: confirm import (triggers network abort)
      const confirmButton = page.getByRole("button", { name: /confirm & import/i });
      await expect(confirmButton).toBeVisible({ timeout: 10_000 });
      await confirmButton.click();

      // A network abort must leave the wizard on Processing instead of losing
      // the parsed rows or returning to the upload screen.
      await expect(page.getByText("3. Import")).toBeVisible({ timeout: 15_000 });
      await expect(page.getByText("Import failed")).toBeVisible({ timeout: 5_000 });

      const retryButton = page.getByRole("button", { name: /retry import/i });
      await expect(retryButton).toBeVisible({ timeout: 5_000 });
      await expect(retryButton).toBeEnabled();

      // The route now fulfills the request, so the retry can complete the batch.
      await retryButton.click();
      await expect(page.getByText(/3 products? imported/i)).toBeVisible({
        timeout: 15_000,
      });
      expect(callCount).toBe(2);
    },
  );
});
