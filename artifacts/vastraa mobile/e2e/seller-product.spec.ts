/**
 * Seller product upload and reorder flows — E2E Playwright tests (mobile/Expo web).
 *
 * Covers:
 *   1. New product form — validation errors
 *   2. New product form — successful creation (mocked POST)
 *   3. Image upload — mock picker injects a data URI, progress indicator appears,
 *      gallery hint shows "1 of 1 uploaded" when upload resolves
 *   4. Image reorder — two images uploaded via mock picker; tile-move-up-1 swaps
 *      order; exact [img-b, img-a] array asserted in captured POST payload
 *   5. Edit flow — single method-dispatching route handler; form pre-fills from
 *      GET mock; name change captured in PUT mock; images array preserved
 *   6. Edit flow error state — 404 GET shows the "Couldn't load product" screen
 *
 * How image picking is mocked:
 *   `ImageGalleryPicker` checks `window.__mockImagePickerResult__` before calling
 *   the native expo-image-picker (see component source). Tests set this value via
 *   `page.evaluate()` before each click so the component uses the injected result
 *   instead of opening the browser/native file picker. The injected asset uses a
 *   base64 data URI so `uploadWithProgress()` can fetch it as a Blob and send it
 *   to the mocked upload endpoint.
 */

import * as fs from "fs";
import * as path from "path";
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

/** Fake product ID used across edit-flow tests. */
const EDIT_PRODUCT_ID = "e2e-seller-prod-0001";

/** Stub product returned by GET /api/products/:id in edit-flow tests. */
const stubProduct = {
  id: EDIT_PRODUCT_ID,
  name: "Kanjivaram Silk Saree — Test Edition",
  description: "A beautiful test saree",
  category: "paithani",
  fabric: "silk",
  color: "red",
  occasion: "festival",
  price: 12000,
  originalPrice: 15000,
  stock: 5,
  isBestSeller: false,
  isNewArrival: true,
  images: [
    "https://example.com/img1.jpg",
    "https://example.com/img2.jpg",
  ],
  variants: [],
};

/**
 * Base64 data URI of the tiny test fixture image.
 * Constructed once at module load — runs in Node.js test context, not the browser.
 */
const TEST_IMAGE_DATA_URI = (() => {
  const imgPath = path.resolve(__dirname, "fixtures/test-image.jpg");
  const b64 = fs.readFileSync(imgPath).toString("base64");
  return `data:image/jpeg;base64,${b64}`;
})();

/**
 * Inject a mock image-picker result into the browser so that
 * ImageGalleryPicker uses it instead of opening the native picker.
 * Must be called *before* clicking the upload zone or "Add more" button.
 */
async function injectMockImage(
  page: import("@playwright/test").Page,
  dataUri: string
): Promise<void> {
  await page.evaluate((uri: string) => {
    (window as any).__mockImagePickerResult__ = {
      canceled: false,
      assets: [{ uri, mimeType: "image/jpeg", fileSize: 284 }],
    };
  }, dataUri);
}

// ---------------------------------------------------------------------------
// Shared auth state
// ---------------------------------------------------------------------------

test.describe("Seller product upload and reorder flows", () => {
  let authUser: AuthUser | null = null;

  test.beforeAll(async () => {
    try {
      authUser = await createTestUser();
    } catch (err) {
      console.warn(
        "Could not create Clerk test user — seller E2E tests will skip:",
        err
      );
    }
  });

  test.afterAll(async () => {
    if (authUser) await cleanupUser(authUser.userId);
  });

  // -------------------------------------------------------------------------
  // 1. New product — form validation
  // -------------------------------------------------------------------------
  test("Submitting an empty form shows validation errors", async ({ page }) => {
    test.setTimeout(120_000);
    if (!authUser) { test.skip(true, "Clerk test user creation failed"); return; }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await page.goto(`${BASE_URL}/seller/product-new`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // "Add Product" heading should be visible
    await expect(page.getByText("Add Product")).toBeVisible({ timeout: 15_000 });

    // Submit without filling any fields
    const submitBtn = page.getByTestId("product-submit-btn");
    await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
    await submitBtn.click();
    await page.waitForTimeout(500);

    // Validation errors for name and price must appear
    await expect(page.getByText(/Product name is required/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Enter a valid price/i)).toBeVisible({ timeout: 5_000 });

    // Success banner must NOT be visible
    await expect(page.getByTestId("product-success-banner")).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // 2. New product — successful creation (no images)
  // -------------------------------------------------------------------------
  test("Filling name and price then submitting creates the product", async ({ page }) => {
    test.setTimeout(120_000);
    if (!authUser) { test.skip(true, "Clerk test user creation failed"); return; }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await page.route("**/api/products", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ product: { id: "new-prod-001", name: "Test Saree" } }),
      });
    });

    await page.goto(`${BASE_URL}/seller/product-new`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    const nameInput = page.getByTestId("product-name-input");
    await nameInput.waitFor({ state: "visible", timeout: 15_000 });
    await nameInput.fill("Test Saree E2E");

    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(300);
    const priceInput = page.getByTestId("product-price-input");
    await priceInput.waitFor({ state: "visible", timeout: 10_000 });
    await priceInput.fill("5000");

    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(300);
    const submitBtn = page.getByTestId("product-submit-btn");
    await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
    await submitBtn.click();

    await expect(page.getByTestId("product-success-banner")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Product created/i)).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 3. Image upload — progress indicator appears then clears
  // -------------------------------------------------------------------------
  test("Picking an image shows the upload progress indicator", async ({ page }) => {
    test.setTimeout(120_000);
    if (!authUser) { test.skip(true, "Clerk test user creation failed"); return; }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Mock the image upload endpoint with a short delay so the progress
    // overlay has time to render before the response arrives.
    await page.route("**/api/seller/upload/product-image", async (route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ publicRelPath: "/uploads/products/test-e2e-img.jpg" }),
      });
    });

    await page.goto(`${BASE_URL}/seller/product-new`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    const uploadZone = page.getByTestId("gallery-upload-zone");
    await uploadZone.waitFor({ state: "visible", timeout: 15_000 });

    // Inject the mock picker result, then click the upload zone.
    // ImageGalleryPicker reads window.__mockImagePickerResult__ instead of
    // opening the native picker, then calls uploadWithProgress() with the
    // data URI — which the route mock above intercepts.
    await injectMockImage(page, TEST_IMAGE_DATA_URI);
    await uploadZone.click();

    // Progress overlay must appear while the upload is in-flight
    await expect(page.getByTestId("upload-progress-indicator")).toBeVisible({ timeout: 8_000 });

    // After the upload resolves the overlay disappears and the hint updates
    await expect(page.getByTestId("upload-progress-indicator")).not.toBeVisible({ timeout: 8_000 });
    await expect(page.getByText(/1 of 1 uploaded/i)).toBeVisible({ timeout: 5_000 });
  });

  // -------------------------------------------------------------------------
  // 4. Image reorder — up/down chevrons swap tile order; exact order in payload
  // -------------------------------------------------------------------------
  test("Reorder chevrons move image tiles and the new order is sent on submit", async ({ page }) => {
    test.setTimeout(120_000);
    if (!authUser) { test.skip(true, "Clerk test user creation failed"); return; }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Give each upload a distinct relative path so we can tell them apart.
    let uploadCount = 0;
    const relPaths = ["/uploads/products/img-a.jpg", "/uploads/products/img-b.jpg"];
    await page.route("**/api/seller/upload/product-image", async (route) => {
      const relPath = relPaths[Math.min(uploadCount, relPaths.length - 1)];
      uploadCount++;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ publicRelPath: relPath }),
      });
    });

    // Capture the exact images array from the create request
    let capturedImages: string[] = [];
    await page.route("**/api/products", async (route) => {
      if (route.request().method() !== "POST") { await route.continue(); return; }
      capturedImages = route.request().postDataJSON()?.images ?? [];
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ product: { id: "reorder-prod-001" } }),
      });
    });

    await page.goto(`${BASE_URL}/seller/product-new`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    // ── Upload first image (img-a) ──
    const uploadZone = page.getByTestId("gallery-upload-zone");
    await uploadZone.waitFor({ state: "visible", timeout: 15_000 });
    await injectMockImage(page, TEST_IMAGE_DATA_URI);
    await uploadZone.click();
    await expect(page.getByTestId("upload-progress-indicator")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("upload-progress-indicator")).not.toBeVisible({ timeout: 8_000 });

    // ── Upload second image (img-b) via "Add more" ──
    const addMoreBtn = page.getByText(/Add more/i).first();
    await addMoreBtn.waitFor({ state: "visible", timeout: 8_000 });
    await injectMockImage(page, TEST_IMAGE_DATA_URI);
    await addMoreBtn.click();
    await expect(page.getByTestId("upload-progress-indicator")).toBeVisible({ timeout: 8_000 });
    await expect(page.getByTestId("upload-progress-indicator")).not.toBeVisible({ timeout: 8_000 });

    // Gallery hint confirms both uploads completed
    await expect(page.getByText(/2 of 2 uploaded/i)).toBeVisible({ timeout: 5_000 });

    // tile-0 = img-a (has "Main" badge); tile-1 = img-b
    // tile-move-up-0 is disabled; tile-move-up-1 is the enabled control
    const moveUpTile1 = page.getByTestId("tile-move-up-1");
    await moveUpTile1.waitFor({ state: "visible", timeout: 8_000 });
    await moveUpTile1.click();
    await page.waitForTimeout(500);

    // After reorder: img-b is now tile-0 (main); img-a is tile-1.
    // The "Main" badge must still be present (now on img-b's tile).
    await expect(page.getByText("Main")).toBeVisible({ timeout: 3_000 });

    // Fill required fields and submit
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.fill("Reorder Test Saree");
    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(300);
    await page.getByTestId("product-price-input").fill("8000");
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(300);
    await page.getByTestId("product-submit-btn").click();

    await expect(page.getByTestId("product-success-banner")).toBeVisible({ timeout: 10_000 });

    // After clicking tile-move-up-1, img-b should be first (index 0) and img-a second.
    // The upload endpoint returns absolute URLs of the form ${API_BASE}${relPath}.
    // We assert order by the path suffix so the test is domain-agnostic.
    expect(capturedImages).toHaveLength(2);
    expect(capturedImages[0]).toMatch(/img-b\.jpg$/);
    expect(capturedImages[1]).toMatch(/img-a\.jpg$/);
  });

  // -------------------------------------------------------------------------
  // 5. Edit flow — form pre-fills from API, name change saves correctly
  // -------------------------------------------------------------------------
  test("Edit form pre-fills product data and saves changes", async ({ page }) => {
    test.setTimeout(120_000);
    if (!authUser) { test.skip(true, "Clerk test user creation failed"); return; }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    // Single route handler dispatches by method to avoid Playwright route-priority
    // issues. Registering two handlers for the same pattern causes the later one
    // to fire first; if it calls route.continue() for non-matching methods, the
    // request goes to the real network instead of the earlier handler.
    let savedBody: any = null;
    await page.route(`**/api/products/${EDIT_PRODUCT_ID}`, async (route) => {
      const method = route.request().method();
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ product: stubProduct }),
        });
      } else if (method === "PUT") {
        savedBody = route.request().postDataJSON();
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ product: { ...stubProduct, ...savedBody } }),
        });
      } else {
        await route.continue();
      }
    });

    await page.goto(`${BASE_URL}/seller/product-edit?id=${EDIT_PRODUCT_ID}`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    // Form should pre-fill with stub product values
    const nameInput = page.getByTestId("product-name-input");
    await nameInput.waitFor({ state: "visible", timeout: 20_000 });
    await expect(nameInput).toHaveValue(stubProduct.name, { timeout: 10_000 });

    await page.evaluate(() => window.scrollBy(0, 600));
    await page.waitForTimeout(300);
    const priceInput = page.getByTestId("product-price-input");
    await expect(priceInput).toHaveValue(String(stubProduct.price), { timeout: 5_000 });

    // Change the name
    await nameInput.fill("Updated Saree Name — E2E");

    // Submit
    await page.evaluate(() => window.scrollBy(0, 2000));
    await page.waitForTimeout(300);
    const submitBtn = page.getByTestId("product-submit-btn");
    await submitBtn.waitFor({ state: "visible", timeout: 10_000 });
    await submitBtn.click();

    await expect(page.getByTestId("product-success-banner")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Changes saved/i)).toBeVisible({ timeout: 5_000 });

    // Verify the correct name was sent to the API
    expect(savedBody).not.toBeNull();
    expect(savedBody.name).toBe("Updated Saree Name — E2E");

    // Existing images must be preserved in the PUT payload
    expect(Array.isArray(savedBody.images)).toBe(true);
    expect(savedBody.images).toHaveLength(stubProduct.images.length);
  });

  // -------------------------------------------------------------------------
  // 6. Edit flow — 404 response shows the error state
  // -------------------------------------------------------------------------
  test("Edit form shows error state when product fails to load", async ({ page }) => {
    test.setTimeout(120_000);
    if (!authUser) { test.skip(true, "Clerk test user creation failed"); return; }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await page.route(`**/api/products/nonexistent-prod`, async (route) => {
      if (route.request().method() !== "GET") { await route.continue(); return; }
      await route.fulfill({
        status: 404,
        contentType: "application/json",
        body: JSON.stringify({ error: "Not found" }),
      });
    });

    await page.goto(`${BASE_URL}/seller/product-edit?id=nonexistent-prod`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText(/Couldn't load product/i)).toBeVisible({ timeout: 15_000 });
  });
});
