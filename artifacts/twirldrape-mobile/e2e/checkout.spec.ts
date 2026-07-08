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
    : "http://localhost:8081");

async function addFirstProductToCart(page: import("@playwright/test").Page) {
  const apiBase = BASE_URL.replace(":24295", ":3001").replace("localhost:24295", "localhost:3001");
  const res = await page.request.get(`${apiBase}/api/products`);
  const products: any[] = await res.json().then((d) =>
    Array.isArray(d) ? d : (d.products ?? [])
  );
  const inStock = products.find((p) => (p.stock ?? 1) > 0);

  if (inStock) {
    await page.goto(`${BASE_URL}/product/${inStock.id}`);
  } else {
    await page.goto(`${BASE_URL}/explore`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);
    const productCard = page.locator("text=/₹[\\d,]+/").first();
    await productCard.waitFor({ state: "visible", timeout: 20_000 });
    await productCard.click();
    await page.waitForURL(/\/product\//, { timeout: 10_000 });
  }

  const addToCartBtn = page.getByTestId("add-cart-btn");
  await addToCartBtn.waitFor({ state: "visible", timeout: 10_000 });
  if ((await addToCartBtn.textContent())?.includes("Add to Cart")) {
    await addToCartBtn.click();
    await page.waitForTimeout(1_500);
  }
}

async function fillAddressFormIfNeeded(page: import("@playwright/test").Page) {
  const hasSavedAddress = await page.getByText(/Saved Addresses/i).isVisible();
  if (!hasSavedAddress) {
    await page.getByTestId("checkout-name").fill("Test Shopper");
    await page.getByTestId("checkout-phone").fill("9876543210");
    await page.getByTestId("checkout-line1").fill("123 Test Street, Bandra");
    await page.getByTestId("checkout-city").fill("Mumbai");
    await page.getByTestId("checkout-pincode").fill("400001");
    await page.waitForTimeout(300);
    await page.getByTestId("state-chip-Maharashtra").click();
    await page.waitForTimeout(500);
  }
}

async function clickContinue1(page: import("@playwright/test").Page) {
  const btn = page.getByTestId("checkout-continue-1");
  await btn.waitFor({ state: "visible", timeout: 8_000 });
  const disabled = await btn.getAttribute("aria-disabled");
  if (disabled === "true") {
    throw new Error("checkout-continue-1 is disabled — address validation failed");
  }
  await btn.click();
}

test.describe("Checkout — full 4-step E2E flow (authenticated)", () => {
  let authUser: AuthUser | null = null;

  test.beforeAll(async () => {
    try {
      authUser = await createTestUser();
    } catch (err) {
      console.warn(
        "Could not create Clerk test user — authenticated tests will skip:",
        err
      );
    }
  });

  test.afterAll(async () => {
    if (authUser) await cleanupUser(authUser.userId);
  });

  test("Full checkout flow: add to cart → 4 steps → order confirmation", async ({
    page,
  }) => {
    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await addFirstProductToCart(page);

    await page.goto(`${BASE_URL}/checkout`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const isSignedIn = !(await page
      .getByText(/Sign in to Checkout/i)
      .isVisible());
    expect(isSignedIn).toBe(true);

    const hasItems = !(await page
      .getByText(/Nothing to Checkout/i)
      .isVisible());
    expect(hasItems).toBe(true);

    await expect(page.getByText("Checkout")).toBeVisible({ timeout: 5_000 });
    for (const step of ["Address", "Delivery", "Payment", "Review"]) {
      await expect(page.getByText(step).first()).toBeVisible({
        timeout: 5_000,
      });
    }

    await fillAddressFormIfNeeded(page);

    await clickContinue1(page);
    await page.waitForTimeout(1_500);

    await expect(page.getByText("Delivery Method")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("Standard Delivery")).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId("checkout-continue-2").click();
    await page.waitForTimeout(1_500);

    await expect(page.getByText("Payment Method")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByText("Cash on Delivery").click();
    await page.waitForTimeout(500);

    await page.getByTestId("checkout-continue-3").click();
    await page.waitForTimeout(1_500);

    await expect(page.getByText("Review Order")).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText(/Total Payable/i)).toBeVisible({
      timeout: 5_000,
    });

    await page.getByTestId("checkout-place-order").click();

    await page.waitForURL(/\/orders\//, { timeout: 25_000 });

    await expect(page.getByTestId("order-confirmed-title")).toBeVisible({
      timeout: 10_000,
    });

    const orderId = await page.getByTestId("order-id-value").textContent();
    expect(orderId?.trim().length).toBeGreaterThan(5);
  });

  test("Buy Now path: product detail → checkout → order confirmation", async ({
    page,
  }) => {
    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    const apiBase2 = BASE_URL.replace(":24295", ":3001").replace("localhost:24295", "localhost:3001");
    const res2 = await page.request.get(`${apiBase2}/api/products`);
    const products2: any[] = await res2.json().then((d: any) => Array.isArray(d) ? d : (d.products ?? []));
    const inStock2 = products2.find((p) => (p.stock ?? 1) > 0);

    if (inStock2) {
      await page.goto(`${BASE_URL}/product/${inStock2.id}`);
    } else {
      await page.goto(`${BASE_URL}/explore`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2_000);
      const productCard = page.locator("text=/₹[\\d,]+/").first();
      await productCard.waitFor({ state: "visible", timeout: 20_000 });
      await productCard.click();
      await page.waitForURL(/\/product\//, { timeout: 10_000 });
    }

    const buyNowBtn = page.getByTestId("buy-now-btn");
    await buyNowBtn.waitFor({ state: "visible", timeout: 10_000 });
    await buyNowBtn.click();

    await page.waitForURL(/\/checkout/, { timeout: 10_000 });
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Checkout")).toBeVisible({ timeout: 5_000 });

    const hasBuyNowBadge = (await page.getByText(/buy now/i).count()) > 0;
    expect(hasBuyNowBadge).toBe(true);

    await fillAddressFormIfNeeded(page);

    await clickContinue1(page);
    await page.waitForTimeout(1_500);
    await expect(page.getByText("Delivery Method")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByTestId("checkout-continue-2").click();
    await page.waitForTimeout(1_500);
    await expect(page.getByText("Payment Method")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByText("Cash on Delivery").click();
    await page.waitForTimeout(500);

    await page.getByTestId("checkout-continue-3").click();
    await page.waitForTimeout(1_500);
    await expect(page.getByText("Review Order")).toBeVisible({
      timeout: 8_000,
    });

    await page.getByTestId("checkout-place-order").click();

    await page.waitForURL(/\/orders\//, { timeout: 25_000 });
    await expect(page.getByTestId("order-confirmed-title")).toBeVisible({
      timeout: 10_000,
    });
  });

  test("Checkout step bar shows Address / Delivery / Payment / Review steps", async ({
    page,
  }) => {
    await addFirstProductToCart(page);

    await page.goto(`${BASE_URL}/checkout`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_500);

    const isSignedIn = !(await page
      .getByText(/Sign in to Checkout/i)
      .isVisible());
    if (!isSignedIn) {
      test.skip(true, "Step bar test requires a signed-in user");
      return;
    }

    await expect(page.getByText("Checkout")).toBeVisible({ timeout: 5_000 });
    for (const step of ["Address", "Delivery", "Payment", "Review"]) {
      await expect(page.getByText(step).first()).toBeVisible({
        timeout: 5_000,
      });
    }
  });

  test("Product detail page shows visible Buy Now and Add to Cart buttons", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/explore`);
    await page.waitForLoadState("networkidle");

    const productCard = page.locator("text=/₹[\\d,]+/").first();
    await productCard.waitFor({ state: "visible", timeout: 20_000 });
    await productCard.click();
    await page.waitForURL(/\/product\//, { timeout: 10_000 });

    await expect(page.getByTestId("buy-now-btn")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("add-cart-btn")).toBeVisible({
      timeout: 5_000,
    });
  });
});
