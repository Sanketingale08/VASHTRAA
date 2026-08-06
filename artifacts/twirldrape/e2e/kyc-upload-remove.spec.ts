/**
 * KYC upload and remove-confirmation flow
 *
 * Covers the FileUpload component inside the seller-registration wizard's
 * step 4 (KYC Documents):
 *   - Uploading a file to the PAN field shows the filename and X button.
 *   - Clicking X opens the confirmation popover; the file is NOT removed yet.
 *   - "Cancel" in the popover dismisses it and leaves the file in place.
 *   - Pressing Escape dismisses the popover and leaves the file in place.
 *   - "Remove" in the popover clears the file and hides the popover.
 *   - Uploading a file to the GST field works independently.
 */

import { test, expect, type Page } from "@playwright/test";
import {
  createVerifiedSeller,
  signInSeller,
  cleanupSeller,
  type SellerAuthUser,
} from "./fixtures/seller-auth";

const MOCK_UPLOAD_HOST = "https://mock-object-storage.test";

const DRAFT_KEY = "twirldrape_seller_registration_draft_v1";

/** Minimal draft that puts the wizard straight on step 4 (KYC). */
function kycDraftPayload() {
  return JSON.stringify({
    step: 4,
    savedAt: Date.now(),
    data: {
      mobile: "9876543210",
      name: "Heritage Weaves Co.",
      location: "Varanasi, Uttar Pradesh",
      tagline: "Handwoven silk sarees, straight from the loom.",
      bio: "",
      contactEmail: "",
      gstin: "",
      panNumber: "",
      panCardUrl: "",
      gstCertUrl: "",
      bankHolder: "",
      bankName: "",
      bankAccount: "",
      bankIfsc: "",
      shopStreet: "",
      shopCity: "",
      shopState: "",
      shopPincode: "",
      termsAccepted: false,
    },
  });
}

async function setupKycPage(page: Page, baseURL: string, userId: string) {
  // Sign in the test seller so the wizard enters its "already signed-in" path.
  await signInSeller(page, baseURL, userId);

  // Inject a localStorage draft pointing at step 4 so the wizard skips
  // straight to KYC without having to interact with steps 1-3.
  await page.evaluate(
    ({ key, value }: { key: string; value: string }) => {
      localStorage.setItem(key, value);
    },
    { key: DRAFT_KEY, value: kycDraftPayload() },
  );

  // Intercept the server-draft endpoint so it returns nothing — the wizard
  // will fall back to the localStorage draft we just set.
  await page.route("**/api/seller/registration-draft", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 404, body: "" });
    } else {
      await route.fulfill({ status: 200, body: "{}" });
    }
  });

  // Mock the KYC presigned-URL endpoints so no real object storage is hit.
  await page.route("**/api/seller/upload/pan", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: `${MOCK_UPLOAD_HOST}/upload/pan-mock`,
        objectPath: "/objects/uploads/mock-pan-card.jpg",
      }),
    });
  });
  await page.route("**/api/seller/upload/gst", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        uploadURL: `${MOCK_UPLOAD_HOST}/upload/gst-mock`,
        objectPath: "/objects/uploads/mock-gst-cert.jpg",
      }),
    });
  });
  // Accept the PUT to the mock storage host.
  await page.route(`${MOCK_UPLOAD_HOST}/**`, async (route) => {
    await route.fulfill({ status: 200, body: "" });
  });

  await page.goto("/seller/register");

  // Wait for the wizard to land on the KYC step.
  await expect(
    page.getByRole("heading", { name: /KYC Documents/i }),
  ).toBeVisible({ timeout: 20_000 });
}

test.describe("KYC upload and remove-confirmation flow", () => {
  let seller: SellerAuthUser;

  test.beforeEach(async ({ page, baseURL }) => {
    seller = await createVerifiedSeller();
    await setupKycPage(page, baseURL!, seller.userId);
  });

  test.afterEach(async () => {
    if (seller) await cleanupSeller(seller.userId);
  });

  // ── helpers ────────────────────────────────────────────────────────────

  /** Returns the first (PAN) or second (GST) file input on the KYC step. */
  function fileInput(page: Page, which: "pan" | "gst") {
    return page.locator('input[type="file"]').nth(which === "pan" ? 0 : 1);
  }

  async function uploadFile(
    page: Page,
    which: "pan" | "gst",
    filename: string,
  ) {
    await fileInput(page, which).setInputFiles({
      name: filename,
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-image-bytes"),
    });
  }

  // ── tests ──────────────────────────────────────────────────────────────

  test("uploading a PAN file shows the filename and X button", async ({
    page,
  }) => {
    await uploadFile(page, "pan", "pan-card.jpg");

    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(
      page.getByRole("button", { name: /Remove file/i }).first(),
    ).toBeVisible();
  });

  test("clicking X opens the confirmation popover without removing the file", async ({
    page,
  }) => {
    await uploadFile(page, "pan", "pan-card.jpg");
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });

    // Click the X (Remove file) button.
    await page.getByRole("button", { name: /Remove file/i }).first().click();

    // Popover should appear.
    const popover = page.getByRole("dialog", {
      name: /Confirm file removal/i,
    });
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // File name is still visible — the file has NOT been removed yet.
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible();
  });

  test("Cancel in the popover dismisses it and keeps the file", async ({
    page,
  }) => {
    await uploadFile(page, "pan", "pan-card.jpg");
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Remove file/i }).first().click();
    const popover = page.getByRole("dialog", { name: /Confirm file removal/i });
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // Click Cancel.
    await popover.getByRole("button", { name: /Cancel/i }).click();

    // Popover should be gone.
    await expect(popover).not.toBeVisible();

    // File is still present.
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible();
    // The X button is still visible (confirming the upload state persists).
    await expect(
      page.getByRole("button", { name: /Remove file/i }).first(),
    ).toBeVisible();
  });

  test("Escape key closes the popover without removing the file", async ({
    page,
  }) => {
    await uploadFile(page, "pan", "pan-card.jpg");
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Remove file/i }).first().click();
    const popover = page.getByRole("dialog", { name: /Confirm file removal/i });
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // Press Escape.
    await page.keyboard.press("Escape");

    // Popover should be gone.
    await expect(popover).not.toBeVisible();

    // File is still present.
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible();
  });

  test("Remove in the popover clears the file", async ({ page }) => {
    await uploadFile(page, "pan", "pan-card.jpg");
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: /Remove file/i }).first().click();
    const popover = page.getByRole("dialog", { name: /Confirm file removal/i });
    await expect(popover).toBeVisible({ timeout: 5_000 });

    // Click the red Remove button inside the popover.
    await popover.getByRole("button", { name: /^Remove$/i }).click();

    // Popover should be gone.
    await expect(popover).not.toBeVisible();

    // File name is no longer shown; the upload prompt is back.
    await expect(page.getByText(/pan-card\.jpg/i)).not.toBeVisible();
    await expect(
      page.getByText(/Click to upload/i).first(),
    ).toBeVisible();
  });

  test("GST file upload works independently of PAN", async ({ page }) => {
    await uploadFile(page, "gst", "gst-certificate.pdf");

    await expect(page.getByText(/gst-certificate\.pdf/i)).toBeVisible({
      timeout: 10_000,
    });
    // The GST field's X button should be present.
    const xButtons = page.getByRole("button", { name: /Remove file/i });
    await expect(xButtons).toHaveCount(1);
  });

  test("removing PAN file leaves GST file untouched", async ({ page }) => {
    // Upload both files.
    await uploadFile(page, "pan", "pan-card.jpg");
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({
      timeout: 10_000,
    });

    await uploadFile(page, "gst", "gst-cert.pdf");
    await expect(page.getByText(/gst-cert\.pdf/i)).toBeVisible({
      timeout: 10_000,
    });

    // Remove only the PAN file.
    await page.getByRole("button", { name: /Remove file/i }).first().click();
    const popover = page.getByRole("dialog", { name: /Confirm file removal/i });
    await expect(popover).toBeVisible({ timeout: 5_000 });
    await popover.getByRole("button", { name: /^Remove$/i }).click();
    await expect(popover).not.toBeVisible();

    // PAN is gone, GST remains.
    await expect(page.getByText(/pan-card\.jpg/i)).not.toBeVisible();
    await expect(page.getByText(/gst-cert\.pdf/i)).toBeVisible();
  });
});
