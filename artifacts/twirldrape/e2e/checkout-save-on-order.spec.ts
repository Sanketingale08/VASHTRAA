/**
 * E2E tests: "Save for future purchases" → method visible in Saved Methods
 * on the next checkout visit.
 *
 * Covers the end-to-end flow described in Task #592:
 *
 *   1. Shopper enters a new UPI ID, checks "Save for future purchases",
 *      places an order, then returns to checkout and confirms the UPI
 *      appears in the Saved Methods panel at Step 3.
 *
 *   2. Same flow for a new credit/debit card: enter card details, check the
 *      save box, place an order, return to checkout, confirm the card appears.
 *
 * All API responses are controlled via page.route() so tests are
 * deterministic and run without a live backend.
 * Clerk auth uses sign-in tokens (same pattern as other checkout e2e tests).
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const BUY_NOW_PRODUCT = {
  id: "cart-item-save-e2e-001",
  productId: "prod-e2e-save-kanjivaram-001",
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
  id: "addr-save-e2e-001",
  name: "Priya Sharma",
  phone: "9876543210",
  line1: "12 MG Road",
  line2: "",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
  isDefault: true,
};

const SAVED_UPI = {
  id: "pm-upi-save-e2e-001",
  type: "upi" as const,
  cardBrand: null,
  last4: null,
  cardholderName: null,
  expiryMonth: null,
  expiryYear: null,
  upiId: "priya@okicici",
  isDefault: true,
};

const SAVED_CARD = {
  id: "pm-card-save-e2e-001",
  type: "card" as const,
  cardBrand: "Visa",
  last4: "1111",
  cardholderName: "Priya Sharma",
  expiryMonth: 12,
  expiryYear: 2027,
  upiId: null,
  isDefault: true,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
 * Injects a buy-now item via sessionStorage so checkout has something to
 * render and does not redirect away from the empty-cart view.
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

  const continueToDelivery = page.locator("button", {
    hasText: /Continue to Delivery/i,
  });
  await continueToDelivery.waitFor({ state: "visible", timeout: 20_000 });
  await expect(continueToDelivery).toBeEnabled({ timeout: 5_000 });
  await continueToDelivery.click();

  const continueToPayment = page.locator("button", {
    hasText: /Continue to Payment/i,
  });
  await continueToPayment.waitFor({ state: "visible", timeout: 10_000 });
  await continueToPayment.click();

  await expect(
    page.locator("h2", { hasText: /Payment Method/i })
  ).toBeVisible({ timeout: 10_000 });
}

/**
 * Registers the standard route stubs (address, shipping, stock revalidation).
 * The GET /api/payment-methods response starts empty; when the mocked POST
 * fires the route handler appends the returned fixture to the in-memory list
 * so the next GET automatically reflects the save — mirroring real persistence.
 * Returns a promise that resolves with the body sent to POST /api/payment-methods
 * once the save actually fires.
 */
async function setupRoutes(
  page: import("@playwright/test").Page,
  opts: { initialMethods?: object[] } = {}
) {
  const { initialMethods = [] } = opts;

  // Shared in-memory list: POST handler appends to it; GET handler reads from it.
  const currentMethods: object[] = [...initialMethods];

  // Promise that resolves once POST /api/payment-methods fires
  let resolvePost!: (body: unknown) => void;
  const postFired = new Promise<unknown>((res) => { resolvePost = res; });

  await page.route("**/api/addresses**", async (route) => {
    if (route.request().method() !== "GET") { await route.continue(); return; }
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
    if (route.request().method() !== "GET") { await route.continue(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        products: [{ id: BUY_NOW_PRODUCT.productId, stock: BUY_NOW_PRODUCT.stock }],
      }),
    });
  });

  await page.route("**/api/payment-methods**", async (route) => {
    const method = route.request().method();

    if (method === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        // Snapshot the list at request time
        body: JSON.stringify({ paymentMethods: [...currentMethods] }),
      });
      return;
    }

    if (method === "POST") {
      const body = route.request().postDataJSON();
      // Pick the matching fixture and append it so the next GET returns it
      const fixture = body?.type === "upi" ? SAVED_UPI : SAVED_CARD;
      currentMethods.push(fixture);
      resolvePost(body);
      await route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ paymentMethod: fixture }),
      });
      return;
    }

    await route.continue();
  });

  await page.route("**/api/orders**", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ orderId: "order-save-test-001" }),
    });
  });

  return { postFired };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Checkout — save payment method on order, visible on next visit", () => {
  let userId: string | null = null;

  test.beforeAll(async () => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      const tag = Date.now();
      const user = await clerk.users.createUser({
        emailAddress: [`checkout-save-pm-e2e-${tag}@example.com`],
        password: `SavePM${tag}!`,
        firstName: "Test",
        lastName: "Saver",
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

  // ── UPI save-and-retrieve flow ────────────────────────────────────────────

  test("shopper enters a new UPI ID, checks Save, places order, returns to checkout — UPI appears in Saved Methods", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    const { postFired } = await setupRoutes(page);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // ── Step 3: Payment — enter new UPI ──────────────────────────────────

    // UPI option should be selected by default; find the UPI input
    const upiInput = page.locator("input[placeholder='name@okaxis']");
    await upiInput.waitFor({ state: "visible", timeout: 10_000 });
    await upiInput.fill("priya@okicici");

    // Check the "Save for future purchases" checkbox for UPI
    const saveCheckbox = page
      .locator("label")
      .filter({ hasText: /Save.*future/i })
      .first();
    await expect(saveCheckbox).toBeVisible({ timeout: 5_000 });
    await saveCheckbox.click();

    // Advance to Step 4 (Review)
    const reviewBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(reviewBtn).toBeEnabled({ timeout: 5_000 });
    await reviewBtn.click();

    // ── Step 4: Review — place the order ─────────────────────────────────

    await expect(
      page.locator("h2", { hasText: /Review Your Order/i })
    ).toBeVisible({ timeout: 10_000 });

    const placeOrderBtn = page.locator("button", { hasText: /Place Order/i });
    await expect(placeOrderBtn).toBeVisible({ timeout: 5_000 });
    await placeOrderBtn.click();

    // Wait for the fire-and-forget POST to /api/payment-methods to fire
    // (it runs after order success, before navigation completes)
    const capturedPostBody = await postFired;

    // Navigates to the order confirmation page
    await page.waitForURL(/\/orders\//, { timeout: 20_000 });

    // ── Second visit: return to checkout and inject a new item ────────────

    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // ── Assert: the saved UPI now appears in the Saved Methods panel ──────
    // (the POST mock appended SAVED_UPI to the in-memory list, so GET now
    // returns it — same persistence semantics as a real server)

    await expect(
      page.locator("p", { hasText: /Saved Methods/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    const upiRow = page
      .locator("button")
      .filter({ hasText: /priya@okicici/ })
      .first();
    await expect(upiRow).toBeVisible({ timeout: 5_000 });

    // The "Default" badge is present (first method is always default)
    await expect(upiRow.locator("text=Default")).toBeVisible({ timeout: 3_000 });

    // Verify the POST to /api/payment-methods carried the right UPI ID
    expect(capturedPostBody).toMatchObject({ type: "upi", upiId: "priya@okicici" });
  });

  // ── Card save-and-retrieve flow ───────────────────────────────────────────

  test("shopper enters a new card, checks Save, places order, returns to checkout — card appears in Saved Methods", async ({
    page,
    baseURL,
  }) => {
    test.setTimeout(120_000);

    if (!userId) {
      test.skip(true, "CLERK_SECRET_KEY not set — skipping");
      return;
    }

    await signInUser(page, baseURL!, userId);
    const { postFired } = await setupRoutes(page);
    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // ── Step 3: Payment — select Credit Card and fill in details ─────────

    const creditCardBtn = page
      .locator("button")
      .filter({ hasText: /Credit Card/i })
      .first();
    await creditCardBtn.waitFor({ state: "visible", timeout: 10_000 });
    await creditCardBtn.click();

    // Fill in card number (placeholder: "1234 5678 9012 3456")
    const cardNumberInput = page.locator("input[placeholder='1234 5678 9012 3456']");
    await cardNumberInput.waitFor({ state: "visible", timeout: 5_000 });
    await cardNumberInput.fill("4111 1111 1111 1111");

    // Fill in expiry (placeholder: "12/27")
    const expiryInput = page.locator("input[placeholder='12/27']");
    await expiryInput.waitFor({ state: "visible", timeout: 5_000 });
    await expiryInput.fill("12/27");

    // Fill in CVV — Checkout renders this as a password field, placeholder "•••"
    const cvvInput = page.locator("input[placeholder='•••']");
    await cvvInput.waitFor({ state: "visible", timeout: 5_000 });
    await cvvInput.fill("123");

    // Fill in cardholder name — at Step 3 the address fields are unmounted
    // by AnimatePresence, so this is the only "Priya Sharma" input in the DOM
    const nameInput = page.locator("input[placeholder='Priya Sharma']").first();
    await nameInput.waitFor({ state: "visible", timeout: 5_000 });
    await nameInput.fill("Priya Sharma");

    // Check the "Save for future purchases" checkbox for card
    const saveCheckbox = page
      .locator("label")
      .filter({ hasText: /Save.*future/i })
      .first();
    await expect(saveCheckbox).toBeVisible({ timeout: 5_000 });
    await saveCheckbox.click();

    // Advance to Step 4 (Review)
    const reviewBtn = page.locator("button", { hasText: /Review Order/i });
    await expect(reviewBtn).toBeEnabled({ timeout: 5_000 });
    await reviewBtn.click();

    // ── Step 4: Review — place the order ─────────────────────────────────

    await expect(
      page.locator("h2", { hasText: /Review Your Order/i })
    ).toBeVisible({ timeout: 10_000 });

    const placeOrderBtn = page.locator("button", { hasText: /Place Order/i });
    await expect(placeOrderBtn).toBeVisible({ timeout: 5_000 });
    await placeOrderBtn.click();

    // Wait for the fire-and-forget POST to /api/payment-methods to fire
    const capturedPostBody = await postFired;

    // Navigates to the order confirmation page
    await page.waitForURL(/\/orders\//, { timeout: 20_000 });

    // ── Second visit: return to checkout and inject a new item ────────────

    await injectBuyNowItem(page);
    await goToPaymentStep(page);

    // ── Assert: the saved card now appears in the Saved Methods panel ─────
    // (POST mock appended SAVED_CARD to the in-memory list, so GET now
    // returns it — same persistence semantics as a real server)

    await expect(
      page.locator("p", { hasText: /Saved Methods/i }).first()
    ).toBeVisible({ timeout: 10_000 });

    // Card row shows last-4 digits
    const cardRow = page
      .locator("button")
      .filter({ hasText: /1111/ })
      .first();
    await expect(cardRow).toBeVisible({ timeout: 5_000 });

    // Card brand is shown on the row
    await expect(
      cardRow.locator("text=Visa")
    ).toBeVisible({ timeout: 3_000 });

    // Verify the POST carried the right card details
    expect(capturedPostBody).toMatchObject({
      type: "card",
      cardholderName: "Priya Sharma",
    });
  });
});
