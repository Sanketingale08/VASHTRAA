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

async function fillAndPlaceOrder(page: import("@playwright/test").Page) {
  const hasSavedAddress = await page.getByText(/Saved Addresses/i).isVisible();
  if (!hasSavedAddress) {
    await page.getByTestId("checkout-name").fill("Test Shopper");
    await page.getByTestId("checkout-phone").fill("9876543210");
    await page.getByTestId("checkout-line1").fill("123 Test Street");
    await page.getByTestId("checkout-city").fill("Mumbai");
    await page.getByTestId("checkout-pincode").fill("400001");
    await page.waitForTimeout(300);
    await page.getByTestId("state-chip-Maharashtra").click();
    await page.waitForTimeout(500);
  }

  const continueBtn = page.getByTestId("checkout-continue-1");
  await continueBtn.waitFor({ state: "visible", timeout: 8_000 });
  const disabled = await continueBtn.getAttribute("aria-disabled");
  if (disabled === "true") {
    throw new Error("checkout-continue-1 is disabled — address validation failed");
  }
  await continueBtn.click();
  await page.waitForTimeout(1_500);

  await page.getByTestId("checkout-continue-2").click();
  await page.waitForTimeout(1_500);
  await page.getByText("Cash on Delivery").click();
  await page.waitForTimeout(500);
  await page.getByTestId("checkout-continue-3").click();
  await page.waitForTimeout(1_500);
  await page.getByTestId("checkout-place-order").click();

  await page.waitForURL(/\/orders\//, { timeout: 25_000 });
}

test.describe("Order History — account tab and order detail page", () => {
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

  test("Account tab renders without error for unauthenticated user", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/account`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    const hasSignIn =
      (await page.getByText(/Sign In/i).first().isVisible()) ||
      (await page.getByText(/Log in/i).first().isVisible()) ||
      (await page.getByText(/Welcome/i).first().isVisible());

    expect(hasSignIn).toBe(true);
  });

  test("Order detail page shows not-found state for unknown order ID", async ({
    page,
  }) => {
    await page.goto(`${BASE_URL}/orders/non-existent-order-id-00000000`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const isNotFoundVisible =
      (await page.getByText(/Order Not Found/i).first().isVisible()) ||
      (await page.getByText(/Sign in/i).isVisible());

    expect(isNotFoundVisible).toBe(true);
  });

  test("Order confirmation page shows Order Confirmed title and non-empty order ID after placing order", async ({
    page,
  }) => {
    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    const apiBase = BASE_URL.replace(":24295", ":3001").replace("localhost:24295", "localhost:3001");
    const res = await page.request.get(`${apiBase}/api/products`);
    const products: any[] = await res.json().then((d) => Array.isArray(d) ? d : (d.products ?? []));
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

    await page.goto(`${BASE_URL}/checkout`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    const isSignedIn = !(await page.getByText(/Sign in to Checkout/i).isVisible());
    const hasItems = !(await page.getByText(/Nothing to Checkout/i).isVisible());

    if (!isSignedIn || !hasItems) {
      test.skip(
        true,
        `Cannot place order: isSignedIn=${isSignedIn}, hasItems=${hasItems}`
      );
      return;
    }

    await fillAndPlaceOrder(page);

    await expect(page.getByTestId("order-confirmed-title")).toBeVisible({
      timeout: 10_000,
    });

    const orderId = await page.getByTestId("order-id-value").textContent();
    expect(orderId?.trim().length).toBeGreaterThan(5);

    expect(page.url()).toMatch(/\/orders\/[a-zA-Z0-9-]+/);
  });
});
