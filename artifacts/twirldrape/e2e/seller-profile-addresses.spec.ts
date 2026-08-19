import { writeFileSync } from "fs";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import {
  cleanupSeller,
  createVerifiedSeller,
  signInSeller,
  type SellerAuthUser,
} from "./fixtures/seller-auth";

const STATE_FILE = "/tmp/seller-profile-addresses-e2e-state.json";

const APPROVED_VENDOR = {
  id: "e2e-vendor-address-0001",
  name: "Address Test Store",
  location: "Pune, Maharashtra",
  rating: 4.5,
  sareesCount: 3,
  avatar: "/images/artisan-1.png",
  bio: null,
  tagline: null,
  contactEmail: null,
  gstin: null,
  mobile: null,
  status: "approved",
  statusReason: null,
  ownerId: "clerk_e2e_user",
  vendorId: "TDV000001",
  reactivationWelcomePending: false,
  shopStreet: null,
  shopAddressLine2: null,
  shopLandmark: null,
  shopCity: null,
  shopState: null,
  shopPincode: null,
  shopCountry: null,
  pickupSameAsShop: false,
  pickupLocationName: null,
  pickupAddressLine1: null,
  pickupAddressLine2: null,
  pickupLandmark: null,
  pickupCity: null,
  pickupState: null,
  pickupPincode: null,
  pickupCountry: null,
};

async function mockVendorProfile(page: Page) {
  await page.route("**/api/vendors/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(APPROVED_VENDOR),
    }),
  );
}

test.describe("Seller Profile addresses", () => {
  let seller: SellerAuthUser;

  test.beforeAll(async ({ browser, baseURL }) => {
    seller = await createVerifiedSeller();
    writeFileSync(STATE_FILE, JSON.stringify({ cookies: [], origins: [] }), "utf8");
    const context: BrowserContext = await browser.newContext();
    const page = await context.newPage();
    await signInSeller(page, baseURL!, seller.userId);
    await context.storageState({ path: STATE_FILE });
    await context.close();
  });

  test.afterAll(async () => {
    if (seller) await cleanupSeller(seller.userId);
  });

  test.use({ storageState: STATE_FILE });

  test("saves a complete shop address and derives pickup fields when same-as-shop is enabled", async ({ page }) => {
    test.setTimeout(120_000);
    await mockVendorProfile(page);

    let patchBody: Record<string, unknown> | null = null;
    await page.route("**/api/vendors/e2e-vendor-address-0001", async (route) => {
      if (route.request().method() !== "PATCH") {
        await route.continue();
        return;
      }
      patchBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ...APPROVED_VENDOR, ...patchBody }),
      });
    });

    await page.goto("/seller/profile");
    await expect(page.getByRole("heading", { name: "Seller Profile" })).toBeVisible({
      timeout: 15_000,
    });
    await page.getByRole("button", { name: /edit profile/i }).click();

    const shop = page.getByTestId("shop-address-section");
    await shop.getByLabel(/Address Line 1/).fill("12 Market Road");
    await shop.getByLabel("Address Line 2").fill("First Floor");
    await shop.getByLabel("Landmark").fill("Near Clock Tower");
    await shop.getByLabel("City").fill("Pune");
    await shop.getByLabel("State").fill("Maharashtra");
    await shop.getByLabel("PIN Code").fill("411001");
    await shop.getByLabel("Country").fill("India");

    const pickup = page.getByTestId("pickup-address-section");
    await pickup.getByText("Pickup address is same as shop address").click();
    await pickup.getByLabel("Pickup location name").fill("Main Shop");

    await page.getByRole("button", { name: /save changes/i }).click();
    await expect(page.getByText(/seller profile updated successfully/i)).toBeVisible({
      timeout: 10_000,
    });

    expect(patchBody).not.toBeNull();
    expect(patchBody).toMatchObject({
      shopStreet: "12 Market Road",
      shopAddressLine2: "First Floor",
      shopLandmark: "Near Clock Tower",
      shopCity: "Pune",
      shopState: "Maharashtra",
      shopPincode: "411001",
      shopCountry: "India",
      pickupSameAsShop: true,
      pickupLocationName: "Main Shop",
      pickupAddressLine1: "12 Market Road",
      pickupAddressLine2: "First Floor",
      pickupLandmark: "Near Clock Tower",
      pickupCity: "Pune",
      pickupState: "Maharashtra",
      pickupPincode: "411001",
      pickupCountry: "India",
    });
  });
});