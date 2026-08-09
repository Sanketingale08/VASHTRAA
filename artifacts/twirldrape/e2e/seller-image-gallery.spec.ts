/**
 * Seller image gallery — E2E Playwright tests.
 *
 * Covers the ImageUploadGallery component that replaced URL-based inputs in
 * the seller product form after the gallery overhaul. Three complementary
 * tests exercise different surface areas:
 *
 *  1. Real upload endpoint — vendor is mocked so the SellerGuard passes, but
 *     POST /api/seller/upload/product-image is NOT mocked. The Clerk session
 *     cookie is real, so the request reaches the live API and storage layer.
 *
 *  2. Reorder (hard assertion) + remove + form-state verification — upload is
 *     mocked with deterministic URLs so the drag source / target images are
 *     predictable. After drag, the test hard-fails if card[0] did not switch
 *     from image-001 to image-002. The form is submitted and the intercepted
 *     POST body is asserted to list images in reordered order.
 *
 *  3. Edit flow — GET /api/products/:id is mocked to return a product with two
 *     image URLs, confirming existing images are loaded into the gallery on
 *     mount with the Main badge and without upload spinners.
 *
 * Performance note: a single Clerk user is created in beforeAll and each test
 * injects its cookies, avoiding 2 extra ~15 s auth round-trips.
 */

import { writeFileSync, readFileSync } from "fs";
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import {
  createVerifiedSeller,
  signInSeller,
  cleanupSeller,
  type SellerAuthUser,
} from "./fixtures/seller-auth";

const FAKE_IMAGE_URL_1 = "/api/storage/public-objects/product-images/e2e-image-001.jpg";
const FAKE_IMAGE_URL_2 = "/api/storage/public-objects/product-images/e2e-image-002.jpg";
const FAKE_PRODUCT_ID = "e2e-product-gallery-0001";
const STATE_FILE = "/tmp/seller-gallery-e2e-state.json";

const APPROVED_VENDOR = {
  id: "e2e-vendor-gallery-0001",
  name: "Gallery Test Store",
  location: "Mumbai",
  rating: 4.5,
  sareesCount: 12,
  avatar: "/images/artisan-1.png",
  bio: null,
  tagline: null,
  contactEmail: null,
  gstin: null,
  status: "approved",
  ownerId: "clerk_e2e_user",
};

/** A valid minimal 1×1 white JPEG (~400 bytes). */
function minimalJpeg(): Buffer {
  return Buffer.from(
    "ffd8ffe000104a46494600010100000100010000" +
      "ffdb00430001010101010101010101010101010101010101010101010101010101010101" +
      "010101010101010101010101010101010101010101010101010101010101010101ffc000" +
      "110800010001030122000211010311010affc4001f0000010501010101010100000000000" +
      "000000102030405060708090a0bffc4001f010003010101010101010100000000000000010" +
      "2030405060708090a0bffda000c03010002110311003f00fa9ffd9",
    "hex",
  );
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
 * Fire HTML5 drag-and-drop events with delays so React can flush state updates
 * (dragSrcId, dragOverId) between events. Returns card[0]'s img src after drag.
 */
async function dragCard2OntoCard1(page: Page): Promise<string | null> {
  return page.evaluate(async (): Promise<string | null> => {
    const cards = [...document.querySelectorAll("div[draggable='true']")];
    if (cards.length < 2) return null;

    const dt = new DataTransfer();
    (dt as any).effectAllowed = "move";

    cards[1].dispatchEvent(
      new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt }),
    );
    await new Promise((r) => setTimeout(r, 150));

    (dt as any).dropEffect = "move";
    cards[0].dispatchEvent(
      new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt }),
    );
    await new Promise((r) => setTimeout(r, 150));

    cards[0].dispatchEvent(
      new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }),
    );
    cards[1].dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 300));

    const updated = [...document.querySelectorAll("div[draggable='true']")];
    return updated[0]?.querySelector("img")?.getAttribute("src") ?? null;
  });
}

test.describe("Seller image gallery", () => {
  let seller: SellerAuthUser;
  /** Real approved vendor created in beforeAll for the persistence test. */
  let e2eVendorId: string | null = null;
  /** Product created by the persistence test; deleted in afterAll. */
  let e2eProductId: string | null = null;

  // -------------------------------------------------------------------------
  // Create ONE Clerk user for the whole suite, sign in, and save the storage
  // state so individual tests can restore the session cheaply.
  //
  // Also provision a real approved vendor for Test 4 (drag-reorder persistence)
  // so the POST /api/products call goes all the way to the DB.
  // -------------------------------------------------------------------------
  test.beforeAll(async ({ browser, baseURL }) => {
    seller = await createVerifiedSeller();

    // Playwright applies test.use({ storageState }) to every browser.newContext()
    // call, even inside beforeAll. Writing an empty-but-valid state file first
    // prevents the ENOENT it would throw before our sign-in has run.
    writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }), "utf8");

    const ctx: BrowserContext = await browser.newContext();
    const page = await ctx.newPage();
    await signInSeller(page, baseURL!, seller.userId);
    // Overwrite the placeholder with the real Clerk session cookies.
    await ctx.storageState({ path: STATE_FILE });

    // Create a real vendor for this Clerk user so the persistence test can
    // submit products to the live API without mocking requireVendorAuth.
    const vendorResult = await page.evaluate(async (vendorData: Record<string, unknown>) => {
      const res = await fetch("/api/vendors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(vendorData),
      });
      const json = await res.json().catch(() => ({ error: `status ${res.status}` }));
      return { ok: res.ok, ...json };
    }, {
      name: "E2E Persist Test Store",
      location: "Mumbai",
      mobile: "9876543210",
      panNumber: "ABCDE1234F",
      panCardUrl: "https://example.com/e2e-pan.jpg",
      bankHolder: "E2E Test Seller",
      bankName: "Test Bank",
      bankAccount: "1234567890",
      bankIfsc: "TEST0001234",
      shopCity: "Mumbai",
      shopState: "Maharashtra",
      shopPincode: "400001",
      termsAccepted: true,
    });

    if (vendorResult.ok && vendorResult.id) {
      e2eVendorId = vendorResult.id as string;

      // Approve the vendor via the admin API (use the suite's configured baseURL
      // so the call routes through the same proxy/host used by the tests — never
      // hardcode a local port that breaks when PLAYWRIGHT_BASE_URL targets a
      // non-local environment).
      const adminKey = process.env.ADMIN_API_KEY ?? "";
      const approveRes = await fetch(
        `${baseURL}/api/admin/vendors/${e2eVendorId}/approve`,
        { method: "POST", headers: { "x-admin-key": adminKey } },
      );
      if (!approveRes.ok) {
        // Record the failure but do not set e2eVendorId to null — Test 4 will
        // see a non-null vendorId but fail on its own POST, making the failure
        // explicit rather than silently skipping the coverage.
        console.warn(`[beforeAll] Failed to approve vendor ${e2eVendorId}: ${approveRes.status}`);
      }
    } else {
      console.warn("[beforeAll] Vendor creation failed:", vendorResult);
    }

    await ctx.close();
  });

  test.afterAll(async ({ baseURL }) => {
    const adminKey = process.env.ADMIN_API_KEY ?? "";

    // Soft-deactivate the test product (DELETE /api/products/:id sets active=false,
    // removing it from public listings). Uses the seller's saved Clerk session
    // cookies extracted from the state file so no browser context is needed.
    if (e2eProductId) {
      try {
        const sessionState = JSON.parse(readFileSync(STATE_FILE, "utf8"));
        const cookieHeader = (sessionState.cookies as Array<{ name: string; value: string }>)
          .map((c) => `${c.name}=${c.value}`)
          .join("; ");
        await fetch(`${baseURL}/api/products/${e2eProductId}`, {
          method: "DELETE",
          headers: { Cookie: cookieHeader },
        });
      } catch (err) {
        console.warn("[afterAll] Failed to deactivate e2e product:", err);
      }
    }

    // Suspend the vendor so it is no longer publicly approved and does not
    // accumulate across repeated test runs.
    if (e2eVendorId) {
      try {
        await fetch(`${baseURL}/api/admin/vendors/${e2eVendorId}/suspend`, {
          method: "POST",
          headers: { "x-admin-key": adminKey },
        });
      } catch (err) {
        console.warn("[afterAll] Failed to suspend e2e vendor:", err);
      }
    }

    if (seller) await cleanupSeller(seller.userId);
  });

  test.use({ storageState: STATE_FILE });

  // -------------------------------------------------------------------------
  // Test 1 — Real upload endpoint (vendor mocked, upload NOT mocked).
  // -------------------------------------------------------------------------
  test("uploads an image via the real API endpoint and shows the Main badge", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    await mockApprovedVendor(page);
    await page.goto("/seller/products/new");
    await expect(page.getByRole("heading", { name: /Add New Product/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/Drag & Drop Images Here/i)).toBeVisible({ timeout: 10_000 });

    const fileInput = page
      .locator('div[role="button"]:has-text("Drag")')
      .locator('input[type="file"]');

    await fileInput.setInputFiles({
      name: "real-upload-test.jpg",
      mimeType: "image/jpeg",
      buffer: minimalJpeg(),
    });

    // Wait for real API to respond; thumbnail replaces the progress spinner.
    // Use a scoped locator (inside the draggable card) to avoid matching the
    // vendor avatar image which also has alt="" in the SellerLayout sidebar.
    const thumbnail = page.locator("div[draggable='true'] img[alt='']").first();
    await expect(thumbnail).toBeVisible({ timeout: 30_000 });
    // "Main" badge lives inside the first draggable card.
    const mainBadge = page.locator("div[draggable='true']").first().getByText("Main");
    await expect(mainBadge).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(/upload failed/i)).toHaveCount(0);
  });

  // -------------------------------------------------------------------------
  // Test 2 — Reorder (hard assertion) + remove + form-state verification.
  // -------------------------------------------------------------------------
  test("reorders images (hard assert), removes one, and verifies form-state on submit", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    await mockApprovedVendor(page);

    let uploadCount = 0;
    await page.route("**/api/seller/upload/product-image", (route) => {
      uploadCount++;
      const url = uploadCount === 1 ? FAKE_IMAGE_URL_1 : FAKE_IMAGE_URL_2;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ publicRelPath: url }),
      });
    });

    await page.goto("/seller/products/new");
    await expect(page.getByRole("heading", { name: /Add New Product/i })).toBeVisible({
      timeout: 15_000,
    });

    const fileInput = page
      .locator('div[role="button"]:has-text("Drag")')
      .locator('input[type="file"]');

    await fileInput.setInputFiles({ name: "img1.jpg", mimeType: "image/jpeg", buffer: minimalJpeg() });
    await expect(page.locator('img[src*="e2e-image-001"]')).toBeVisible({ timeout: 15_000 });

    await fileInput.setInputFiles({ name: "img2.jpg", mimeType: "image/jpeg", buffer: minimalJpeg() });
    await expect(page.locator('img[src*="e2e-image-002"]')).toBeVisible({ timeout: 15_000 });

    await expect(page.getByText("Main")).toHaveCount(1);

    // Drag card[1] (image-002) onto card[0] (image-001).
    const card1SrcAfterDrag = await dragCard2OntoCard1(page);

    // Hard assertion: the drag must have updated the card order.
    expect(card1SrcAfterDrag, "Drag reorder did not update card[0] — reorder is broken").toContain(
      "e2e-image-002",
    );
    await expect(page.getByText("Main")).toHaveCount(1);

    // Remove the second card (now image-001, which moved to slot 1).
    const cards = page.locator("div[draggable='true']");
    await expect(cards).toHaveCount(2);
    const secondCard = cards.nth(1);
    await secondCard.hover();
    await page.waitForTimeout(400);
    await expect(secondCard.locator('button[title="Remove image"]')).toBeVisible({
      timeout: 3_000,
    });
    await secondCard.locator('button[title="Remove image"]').click();
    await expect(cards).toHaveCount(1, { timeout: 5_000 });
    await expect(page.getByText("Main")).toHaveCount(1);

    // Fill required fields and submit — verify the images array in the payload.
    await page
      .getByPlaceholder("e.g. Peacock Paithani Silk Saree")
      .fill("E2E Gallery Test Saree");
    await page.getByPlaceholder("15000").fill("5000");

    await page.route("**/api/products", (route) => {
      if (route.request().method() === "POST") {
        route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ id: "new-product-id", name: "E2E Gallery Test Saree" }),
        });
      } else {
        route.continue();
      }
    });

    const submitRequest = page.waitForRequest(
      (req) => req.url().includes("/api/products") && req.method() === "POST",
      { timeout: 15_000 },
    );

    await page.getByRole("button", { name: /Create Product/i }).click();

    const req = await submitRequest;
    const body = req.postDataJSON();

    // After reorder then remove: only image-002 should remain, as first entry.
    expect(body.images, "images array missing from POST body").toBeDefined();
    expect(body.images[0], "First image should be the reordered image-002").toContain(
      "e2e-image-002",
    );
    expect(body.images, "Only one image should remain after remove").toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Test 4 — Drag-reorder persists: after form submit the fetched product
  // has the dragged image first (real DB persistence, no mocks on POST/GET).
  //
  // A real approved vendor is created in beforeAll for this Clerk user so
  // requireVendorAuth passes and the product is actually written to the DB.
  // The upload endpoint is still mocked for deterministic image URLs.
  // After submission the test captures the product ID from the POST response
  // and fetches the product from the real API to assert images[0].
  // -------------------------------------------------------------------------
  test("drag-reorder is persisted: fetched product has the dragged image first", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    // If vendor provisioning failed in beforeAll, fail immediately so CI is
    // never silently green while the persistence coverage is absent.
    expect(e2eVendorId, "Real vendor was not provisioned in beforeAll — check ADMIN_API_KEY and API server availability").not.toBeNull();

    // Mock upload for deterministic image URLs (no file-storage dependency).
    let uploadCount = 0;
    await page.route("**/api/seller/upload/product-image", (route) => {
      uploadCount++;
      const url = uploadCount === 1 ? FAKE_IMAGE_URL_1 : FAKE_IMAGE_URL_2;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ publicRelPath: url }),
      });
    });

    await page.goto("/seller/products/new");
    await expect(page.getByRole("heading", { name: /Add New Product/i })).toBeVisible({
      timeout: 15_000,
    });

    const fileInput = page
      .locator('div[role="button"]:has-text("Drag")')
      .locator('input[type="file"]');

    // Upload image 1 (→ FAKE_IMAGE_URL_1 / e2e-image-001).
    await fileInput.setInputFiles({ name: "img1.jpg", mimeType: "image/jpeg", buffer: minimalJpeg() });
    await expect(page.locator('img[src*="e2e-image-001"]')).toBeVisible({ timeout: 15_000 });

    // Upload image 2 (→ FAKE_IMAGE_URL_2 / e2e-image-002).
    await fileInput.setInputFiles({ name: "img2.jpg", mimeType: "image/jpeg", buffer: minimalJpeg() });
    await expect(page.locator('img[src*="e2e-image-002"]')).toBeVisible({ timeout: 15_000 });

    // Drag card[1] (e2e-image-002) onto card[0] (e2e-image-001).
    // After drag, slot 0 must display e2e-image-002.
    const card1SrcAfterDrag = await dragCard2OntoCard1(page);
    expect(
      card1SrcAfterDrag,
      "Drag reorder did not update card[0] — reorder is broken",
    ).toContain("e2e-image-002");

    // Fill required fields.
    await page
      .getByPlaceholder("e.g. Peacock Paithani Silk Saree")
      .fill("E2E Drag Persist Saree");
    await page.getByPlaceholder("15000").fill("6000");

    // Arm a listener to capture the real POST response (no interception —
    // the request goes all the way to the server and DB).
    const postResponsePromise = page.waitForResponse(
      (resp) => resp.url().includes("/api/products") && resp.request().method() === "POST",
      { timeout: 20_000 },
    );

    await page.getByRole("button", { name: /Create Product/i }).click();

    const postResponse = await postResponsePromise;
    expect(postResponse.status(), "POST /api/products should return 201").toBe(201);

    const created = await postResponse.json();

    // Track the ID so afterAll can delete it.
    e2eProductId = created.id ?? null;

    // ── Assertion 1: server returned the images in the dragged order ──────
    expect(created.images, "POST response should include images").toBeDefined();
    expect(
      created.images[0],
      "Server-returned images[0] should be the dragged-to-first image (e2e-image-002)",
    ).toContain("e2e-image-002");
    expect(
      created.images[1],
      "Server-returned images[1] should be the original first image (e2e-image-001)",
    ).toContain("e2e-image-001");

    // ── Assertion 2: fetch from the real DB via GET /api/products/:id ─────
    // Runs inside the browser so page.route() request routing works, and the
    // actual API response comes from the DB — no mock involved.
    const fetched = await page.evaluate(async (id: string) => {
      const res = await fetch(`/api/products/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error(`GET /api/products/${id} returned ${res.status}`);
      return res.json();
    }, created.id);

    expect(fetched.images, "Fetched product should have images").toBeDefined();
    expect(
      fetched.images[0],
      "DB-persisted images[0] should be the dragged-to-first image (e2e-image-002)",
    ).toContain("e2e-image-002");
    expect(
      fetched.images[1],
      "DB-persisted images[1] should be the original first image (e2e-image-001)",
    ).toContain("e2e-image-001");
  });

  // -------------------------------------------------------------------------
  // Test 3 — Edit Product: existing images pre-populate the gallery.
  // -------------------------------------------------------------------------
  test("Edit Product: existing images load into gallery with Main badge and no spinner", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(60_000);

    await mockApprovedVendor(page);

    await page.route(`**/api/products/${FAKE_PRODUCT_ID}`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: FAKE_PRODUCT_ID,
          name: "E2E Gallery Edit Saree",
          description: "Testing edit gallery load",
          category: "paithani",
          subcategory: null,
          brand: null,
          designPattern: null,
          fabric: "silk",
          color: "red",
          occasion: "festival",
          price: 5000,
          originalPrice: null,
          stock: 10,
          lowStockThreshold: 5,
          images: [FAKE_IMAGE_URL_1, FAKE_IMAGE_URL_2],
          videos: [],
          variants: [],
          specifications: [],
          deliveryInfo: "",
          returnPolicy: "",
          isBestSeller: false,
          isNewArrival: false,
        }),
      }),
    );

    await page.goto(`/seller/products/${FAKE_PRODUCT_ID}/edit`);
    // Use getByRole("main") to avoid strict-mode collision with the SellerLayout
    // header's own "Edit Product" h1 — the page renders two matching headings.
    await expect(page.getByRole("main").getByRole("heading", { name: /Edit Product/i })).toBeVisible({
      timeout: 15_000,
    });

    // Both existing image thumbnails must render in the gallery.
    await expect(page.locator('img[src*="e2e-image"]')).toHaveCount(2, { timeout: 10_000 });
    // First card carries the "Main" badge.
    await expect(page.getByText("Main")).toBeVisible({ timeout: 5_000 });
    // No upload-progress spinner visible.
    await expect(page.locator("svg circle[stroke='#1E6B5A']")).toHaveCount(0);
  });
});
