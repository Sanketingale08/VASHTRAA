/**
 * Saved payment methods — checkout Step 3 E2E tests.
 *
 * Covers the flow introduced in Task #536 where signed-in shoppers can use
 * previously-saved card / UPI IDs during checkout:
 *
 *   1. Saved card appears in the "Saved Methods" section; selecting it
 *      highlights the row and hides the manual card-entry fields; "Next"
 *      becomes enabled without any card input.
 *   2. Saved UPI ID is pre-selected (and upiId pre-populated) when it is
 *      the user's default payment method, so the order can proceed.
 *   3. Clicking a standard PAYMENT_OPTIONS button (e.g. COD) clears the
 *      saved-method selection and shows the appropriate detail panel.
 *   4. A user with no saved methods sees only the standard payment options
 *      — the "Saved Methods" section is absent entirely.
 *
 * API responses are controlled via page.route() so tests are deterministic.
 * Clerk auth is provided via sign-in tokens (same pattern as refund-request.spec.ts).
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BUY_NOW_PRODUCT = {
  id: "cart-item-e2e-001",
  productId: "prod-e2e-kanjivaram-001",
  name: "Kanjivaram Silk Saree",
  price: 8500,
  originalPrice: 9500,
  images: [],
  vendorName: "Silk Palace",
  stock: 10,
  quantity: 1,
  category: "Silk Sarees",
};

const SAVED_ADDRESS = {
  id: "addr-e2e-001",
  name: "Priya Sharma",
  phone: "9876543210",
  line1: "12 MG Road",
  line2: "",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
  isDefault: true,
};

const SAVED_CARD: SavedPaymentMethod = {
  id: "pm-card-e2e-001",
  type: "card",
  cardBrand: "Visa",
  last4: "4242",
  cardholderName: "Priya Sharma",
  expiryMonth: 12,
  expiryYear: 2027,
  upiId: null,
  isDefault: false,
};

const SAVED_UPI_DEFAULT: SavedPaymentMethod = {
  id: "pm-upi-e2e-001",
  type: "upi",
  cardBrand: null,
  last4: null,
  cardholderName: null,
  expiryMonth: null,
  expiryYear: null,
  upiId: "priya@okaxis",
  isDefault: true,
};

type SavedPaymentMethod = {
  id: string;
  type: "card" | "upi";
  cardBrand: string | null;
  last4: string | null;
  cardholderName: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
  upiId: string | null;
  isDefault: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function signInUser(
  page: import("@playwright/test").Page,
  baseURL: string,
  userId: string
) {
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY! });
  const { token } = await clerk.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: 300,
  });

  await setupClerkTestingToken({ page });
  await page.goto(baseURL);
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
      const si = w.Clerk.client.signIn;
      const result = await si.create({ strategy: "ticket", ticket });
      if (result.status === "complete") {
        await w.Clerk.setActive({ session: result.createdSessionId });
      } else {
        throw new Error(`Sign-in incomplete: ${result.status}`);
      }
    },
    { ticket: token }
  );

  await page.waitForTimeout(1_500);
}

/**
 * Sets up common route mocks shared by all tests:
 *   - /api/addresses  → single saved address (so Step 1 auto-selects it)
 *   - /api/shipping/check → delivery available
 *   - /api/products (revalidateStock for buy-now) → stock intact
 */
async function setupCommonRoutes(
  page: import("@playwright/test").Page,
  paymentMethods: SavedPaymentMethod[]
) {
  await page.route("**/api/addresses**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ addresses: [SAVED_ADDRESS] }),
    });
  });

  await page.route("**/api/shipping/check**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ available: true, message: "Delivery available to 560001" }),
    });
  });

  await page.route("**/api/products**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [
          {
            id: BUY_NOW_PRODUCT.productId,
            stock: BUY_NOW_PRODUCT.stock,
          },
        ],
      }),
    });
  });

  await page.route("**/api/payment-methods**", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ paymentMethods: paymentMethods }),
    });
  });
}

/**
 * Injects a buy-now item via sessionStorage so the checkout page has
 * something in the order and does not redirect to the empty-cart view.
 */
async function injectBuyNowItem(page: import("@playwright/test").Page) {
  await page.evaluate((product) => {
    sessionStorage.setItem(
      "twirl_buy_now",
      JSON.stringify({ product, quantity: 1 })
    );
  }, BUY_NOW_PRODUCT);
}

/**
 * Navigates to /checkout and advances through Step 1 (Address) and
 * Step 2 (Delivery) so the test lands on Step 3 (Payment).
 */
async function goToPaymentStep(page: import("@playwright/test").Page) {
  await page.goto("/checkout");

  // Step 1 — saved address is auto-selected; just proceed
  const continueToDelivery = page.locator("button", {
    hasText: /Continue to Delivery/i,
  });
  await continueToDelivery.waitFor({ state: "visible", timeout: 20_000 });
  await expect(continueToDelivery).toBeEnabled({ timeout: 5_000 });
  await continueToDelivery.click();

  // Step 2 — standard delivery is selected by default; proceed
  const continueToPayment = page.locator("button", {
    hasText: /Continue to Payment/i,
  });
  await continueToPayment.waitFor({ state: "visible", timeout: 10_000 });
  await continueToPayment.click();

  // Confirm we are on the Payment step
  await expect(
    page.locator("h2", { hasText: /Payment Method/i })
  ).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe("Checkout Step 3 — Saved Payment Methods", () => {
  let userId: string | null = null;

  test.beforeAll(async () => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      const tag = Date.now();
      const user = await clerk.users.createUser({
        emailAddress: [`checkout-pm-e2e-${tag}@example.com`],
        password: `CheckoutPM${tag}!`,
        firstName: "Test",
        lastName: "Buyer",
        skipPasswordChecks: true,
        skipPasswordRequirement: false,
      });
      userId = user.id;
    } catch {
      // CLERK_SECRET_KEY missing or invalid — tests will skip
    }
  });

  test.afterAll(async () => {
    if (!userId) return;
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      await clerk.users.deleteUser(userId);
    } catch {}
  });

  // ── Test 1: Saved card listed; selecting it hides manual fields ──────────

  test("saved card appears in Saved Methods, selecting it hides manual card fields and enables Next", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    await setupCommonRoutes(page, [SAVED_CARD]);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // The "Saved Methods" heading should be present
    await expect(
      page.locator("p", { hasText: /Saved Methods/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // The saved card row should appear with the last-4 digits
    const cardRow = page
      .locator("button")
      .filter({ hasText: /4242/ })
      .first();
    await expect(cardRow).toBeVisible({ timeout: 5_000 });

    // Before selecting the card, the manual card fields section ("or add a
    // new method" separator) should be present
    await expect(
      page.locator("text=/or add a new method/i").first()
    ).toBeVisible({ timeout: 5_000 });

    // Click the saved card row
    await cardRow.click();

    // The row should now be highlighted (has the selected border class)
    await expect(cardRow).toHaveClass(/border-\[#1E6B5A\]/, { timeout: 5_000 });

    // Manual card number / expiry / CVV inputs must NOT be visible while a
    // saved method is selected
    await expect(
      page.locator("input[placeholder='1234 5678 9012 3456']")
    ).not.toBeVisible({ timeout: 3_000 });
    await expect(
      page.locator("input[placeholder='12/27']")
    ).not.toBeVisible({ timeout: 3_000 });

    // The "Review Order" button should be enabled without any manual card entry
    const nextBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(nextBtn).toBeVisible({ timeout: 5_000 });
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
  });

  // ── Test 2: Default UPI pre-selected and upiId pre-populated ────────────

  test("default saved UPI ID is pre-selected and its upiId is pre-populated so order can proceed", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    await setupCommonRoutes(page, [SAVED_UPI_DEFAULT]);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // The "Saved Methods" heading is present
    await expect(
      page.locator("p", { hasText: /Saved Methods/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // The UPI row shows the saved UPI ID text
    const upiRow = page
      .locator("button")
      .filter({ hasText: /priya@okaxis/ })
      .first();
    await expect(upiRow).toBeVisible({ timeout: 5_000 });

    // It should already be highlighted (default auto-selected by the effect)
    await expect(upiRow).toHaveClass(/border-\[#1E6B5A\]/, { timeout: 8_000 });

    // The "Default" badge should be visible on the row
    await expect(
      upiRow.locator("text=Default")
    ).toBeVisible({ timeout: 3_000 });

    // Manual UPI input field must NOT be visible (saved method is active,
    // selectedSavedMethodId !== null hides the manual UPI input)
    await expect(
      page.locator("input[placeholder='name@okaxis']")
    ).not.toBeVisible({ timeout: 3_000 });

    // "Review Order" button should be enabled without manual UPI entry
    const nextBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
  });

  // ── Test 3: Selecting a standard option clears saved selection ───────────

  test("selecting COD clears the saved-method highlight and shows the COD detail panel", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    // Start with a saved card (will be pre-selected via default logic if
    // isDefault is true; here it is not the default so manual options are
    // active initially — that's fine, test only cares about the transition)
    await setupCommonRoutes(page, [SAVED_CARD]);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // First select the saved card so it becomes active
    const cardRow = page
      .locator("button")
      .filter({ hasText: /4242/ })
      .first();
    await cardRow.waitFor({ state: "visible", timeout: 10_000 });
    await cardRow.click();
    await expect(cardRow).toHaveClass(/border-\[#1E6B5A\]/, { timeout: 5_000 });

    // Now click the "Cash on Delivery" standard option
    const codButton = page.locator("button").filter({ hasText: /Cash on Delivery/i }).first();
    await expect(codButton).toBeVisible({ timeout: 5_000 });
    await codButton.click();

    // COD button should now be highlighted (paymentMethod === "cod" and no saved method)
    await expect(codButton).toHaveClass(/border-\[#1E6B5A\]/, { timeout: 5_000 });

    // The saved card row must no longer be highlighted
    await expect(cardRow).not.toHaveClass(/border-\[#1E6B5A\]/, { timeout: 3_000 });

    // The COD detail panel (₹50 handling fee notice) must appear
    await expect(
      page.locator("text=/₹50 handling fee/i").first()
    ).toBeVisible({ timeout: 5_000 });

    // "Review Order" should still be enabled — COD requires no extra input
    const nextBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(nextBtn).toBeEnabled({ timeout: 5_000 });
  });

  // ── Test 5: Declined saved method → back to Step 3, method deselected ───

  test("when a saved payment method is declined the checkout returns to Step 3 with the method deselected and an error message", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    await setupCommonRoutes(page, [SAVED_CARD]);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // Select the saved card
    const cardRow = page.locator("button").filter({ hasText: /4242/ }).first();
    await cardRow.waitFor({ state: "visible", timeout: 10_000 });
    await cardRow.click();
    await expect(cardRow).toHaveClass(/border-\[#1E6B5A\]/, { timeout: 5_000 });

    // Advance to Step 4 (Review)
    const reviewBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(reviewBtn).toBeEnabled({ timeout: 5_000 });
    await reviewBtn.click();

    // Mock /api/orders to return a payment-method-related error
    await page.route("**/api/orders**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Card declined. Please choose a different payment method.",
          paymentMethodInvalid: true,
        }),
      });
    });

    // Click "Place Order" on the Review step
    const placeOrderBtn = page.locator("button", { hasText: /Place Order/i });
    await expect(placeOrderBtn).toBeVisible({ timeout: 10_000 });
    await placeOrderBtn.click();

    // Should be back on the Payment step (Step 3)
    await expect(
      page.locator("h2", { hasText: /Payment Method/i })
    ).toBeVisible({ timeout: 10_000 });

    // The saved card must no longer be selected (no border-[#1E6B5A] highlight)
    await expect(cardRow).not.toHaveClass(/border-\[#1E6B5A\]/, { timeout: 5_000 });

    // An inline error message must appear
    await expect(
      page.locator("text=/card declined.*choose a different payment method/i").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 6: Declined new card → back to Step 3 with card error ───────────

  test("when a newly entered card is declined the checkout returns to Step 3 with an inline card error", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    await setupCommonRoutes(page, []);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // Select the card option and enter a client-valid card. The server will
    // reject it to exercise recovery from a backend payment failure.
    const cardOption = page.locator("button").filter({ hasText: /Credit Card/i }).first();
    await cardOption.click();
    await page.locator("input[placeholder='1234 5678 9012 3456']").fill("4111 1111 1111 1111");
    await page.locator("input[placeholder='Priya Sharma']").fill("Priya Sharma");
    await page.locator("input[placeholder='12/27']").fill("12/27");
    await page.locator("input[placeholder='•••']").fill("123");

    const reviewBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(reviewBtn).toBeEnabled({ timeout: 5_000 });
    await reviewBtn.click();

    await page.route("**/api/orders**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "Card declined by the bank. Please try another card.",
          paymentMethodInvalid: true,
        }),
      });
    });

    await page.locator("button", { hasText: /Place Order/i }).click();

    await expect(page.locator("h2", { hasText: /Payment Method/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("input[placeholder='1234 5678 9012 3456']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator("text=/card declined by the bank.*try another card/i").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 7: Declined new UPI → back to Step 3 with UPI error ─────────────

  test("when a newly entered UPI ID is rejected the checkout returns to Step 3 with an inline UPI error", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    await setupCommonRoutes(page, []);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    const upiInput = page.locator("input[placeholder='name@okaxis']");
    await upiInput.fill("priya@okaxis");

    const reviewBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(reviewBtn).toBeEnabled({ timeout: 5_000 });
    await reviewBtn.click();

    await page.route("**/api/orders**", async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({
          error: "UPI ID not found. Please check your UPI ID and try again.",
          paymentMethodInvalid: true,
        }),
      });
    });

    await page.locator("button", { hasText: /Place Order/i }).click();

    await expect(page.locator("h2", { hasText: /Payment Method/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator("input[placeholder='name@okaxis']")).toBeVisible({
      timeout: 5_000,
    });
    await expect(
      page.locator("text=/upi id not found.*check your upi id/i").first()
    ).toBeVisible({ timeout: 5_000 });
  });

  // ── Test 4: No saved methods → "Saved Methods" section absent ───────────

  test("user with no saved methods sees only standard payment options without a Saved Methods section", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    // Return empty saved methods list
    await setupCommonRoutes(page, []);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // The "Saved Methods" heading must not appear
    await expect(
      page.locator("p", { hasText: /Saved Methods/i })
    ).not.toBeVisible({ timeout: 5_000 });

    // The "or add a new method" divider must also be absent
    await expect(
      page.locator("text=/or add a new method/i")
    ).not.toBeVisible({ timeout: 3_000 });

    // Standard payment options are present (UPI, Credit Card, COD, etc.)
    await expect(
      page.locator("button").filter({ hasText: /Cash on Delivery/i }).first()
    ).toBeVisible({ timeout: 5_000 });

    await expect(
      page.locator("button").filter({ hasText: /Google Pay, PhonePe, Paytm/ }).first()
    ).toBeVisible({ timeout: 5_000 });
  });
});
