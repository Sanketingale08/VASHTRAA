import { test, expect } from "@playwright/test";
import {
  createVerifiedSeller,
  signInSeller,
  cleanupSeller,
  mockPhoneVerification,
  type SellerAuthUser,
} from "./fixtures/seller-auth";

const MOCK_UPLOAD_HOST = "https://mock-object-storage.test";

test.describe("Seller registration wizard — happy path", () => {
  let seller: SellerAuthUser;

  test.afterEach(async () => {
    if (seller) await cleanupSeller(seller.userId);
  });

  test("a new seller can complete all 7 steps and reach the success screen", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(90_000);

    // Step 1 (account creation + email OTP) is created & verified
    // programmatically against the real Clerk backend — see fixtures/seller-auth.ts
    // for why this stands in for interacting with the real sign-up UI/inbox.
    seller = await createVerifiedSeller();
    await signInSeller(page, baseURL!, seller.userId);

    // Mock the KYC file-upload round trip (presigned URL + PUT) so the test
    // doesn't depend on real object storage infrastructure.
    await page.route("**/api/seller/upload/kyc-url", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          uploadURL: `${MOCK_UPLOAD_HOST}/upload/kyc-mock`,
          publicUrl: "/api/storage/private/private/sellers/seller/kyc/mock-kyc.jpg",
          objectPath: "/api/storage/private/private/sellers/seller/kyc/mock-kyc.jpg",
        }),
      });
    });
    await page.route("**/api/seller/upload/confirm-kyc", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true }) });
    });
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
    await page.route(`${MOCK_UPLOAD_HOST}/**`, async (route) => {
      await route.fulfill({ status: 200, body: "" });
    });

    await page.goto("/seller/register");

    // Being signed in already, the wizard's effect skips straight to
    // step 2 (mobile OTP) — see SellerRegister.tsx's `isSignedIn` effect.
    await expect(
      page.getByRole("heading", { name: /Verify Mobile Number/i }),
    ).toBeVisible({ timeout: 20_000 });

    // Replit-managed Clerk doesn't support SMS, so the phone verification
    // methods on the live Clerk user are mocked before triggering them.
    await mockPhoneVerification(page);

    await page.locator('input[type="tel"]').fill("9876543210");
    await page.getByRole("button", { name: /Send OTP/i }).click();

    const otpBox = page.locator('input[inputmode="numeric"]');
    await expect(otpBox).toBeVisible({ timeout: 10_000 });
    await otpBox.fill("123456");
    await page.getByRole("button", { name: /Verify & Continue/i }).click();

    // Step 3: Business profile
    await expect(
      page.getByRole("heading", { name: /Business Profile/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder("e.g. Silk Heritage Emporium").fill("Heritage Weaves Co.");
    await page.getByPlaceholder("e.g. Varanasi, Uttar Pradesh").fill("Varanasi, Uttar Pradesh");
    await page
      .getByPlaceholder("e.g. Authentic handwoven silks since 1982")
      .fill("Handwoven silk sarees, straight from the loom.");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 4: KYC documents
    await expect(page.getByRole("heading", { name: /KYC Documents/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder("ABCDE1234F").fill("ABCDE1234F");
    const panFileInput = page.locator('input[type="file"]').first();
    await panFileInput.setInputFiles({
      name: "pan-card.jpg",
      mimeType: "image/jpeg",
      buffer: Buffer.from("fake-pan-card-image-bytes"),
    });
    await expect(page.getByText(/pan-card\.jpg/i)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 5: Bank details
    await expect(
      page.getByRole("heading", { name: /Bank Account Details/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByPlaceholder("As per bank records").fill("Test Seller");
    await page.getByPlaceholder("e.g. State Bank of India").fill("State Bank of India");
    await page.getByPlaceholder("Enter account number").fill("123456789012");
    await page.getByPlaceholder("SBIN0001234").fill("SBIN0001234");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 6: Shop address
    await expect(page.getByRole("heading", { name: /Shop Address/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.getByPlaceholder("Building, street, locality").fill("12 Loom Street");
    await page.getByPlaceholder("e.g. Surat").fill("Varanasi");
    await page.getByPlaceholder("e.g. Gujarat").fill("Uttar Pradesh");
    await page.getByPlaceholder("6-digit pincode").fill("221001");
    await page.getByRole("button", { name: /Continue/i }).click();

    // Step 7: Review & submit
    await expect(page.getByRole("heading", { name: /Review & Submit/i })).toBeVisible({
      timeout: 10_000,
    });
    await page.locator('input[type="checkbox"]').check();

    const registerResponse = page.waitForResponse(
      (res) => res.url().includes("/api/seller/register") && res.request().method() === "POST",
    );
    await page.getByRole("button", { name: /Submit Application/i }).click();
    const res = await registerResponse;
    expect(res.status()).toBe(201);

    await expect(
      page.getByRole("heading", { name: /Application Submitted!/i }),
    ).toBeVisible({ timeout: 15_000 });
  });
});
