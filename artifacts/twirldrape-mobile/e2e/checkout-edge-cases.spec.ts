import { test, expect } from "@playwright/test";
import { Client } from "pg";
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

const API_BASE = process.env.PLAYWRIGHT_API_BASE ?? "http://localhost:80";

const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";

async function getInStockProducts(page: import("@playwright/test").Page, count: number) {
  const res = await page.request.get(`${API_BASE}/api/products`);
  const products: any[] = await res
    .json()
    .then((d) => (Array.isArray(d) ? d : d.products ?? []));
  const inStock = products.filter((p) => (p.stock ?? 1) > 0);
  if (inStock.length < count) {
    throw new Error(
      `Expected at least ${count} in-stock products, found ${inStock.length}`
    );
  }
  return inStock.slice(0, count);
}

async function addProductToCart(
  page: import("@playwright/test").Page,
  productId: string
) {
  await page.goto(`${BASE_URL}/product/${productId}`);
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

async function createCoupon(
  code: string
): Promise<{ id: string; code: string; type: string; value: number } | null> {
  if (!ADMIN_API_KEY) return null;
  const res = await fetch(`${API_BASE}/api/admin/coupons`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-admin-key": ADMIN_API_KEY,
    },
    body: JSON.stringify({
      code,
      type: "flat",
      value: 200,
      description: "E2E test coupon",
      active: true,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return {
    id: data.coupon.id,
    code: data.coupon.code,
    type: data.coupon.type,
    value: data.coupon.value,
  };
}

async function deactivateCoupon(id: string) {
  if (!ADMIN_API_KEY) return;
  try {
    await fetch(`${API_BASE}/api/admin/coupons/${id}`, {
      method: "DELETE",
      headers: { "x-admin-key": ADMIN_API_KEY },
    });
  } catch {}
}

async function withDbClient<T>(fn: (client: Client) => Promise<T>): Promise<T | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  const client = new Client({ connectionString });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}

test.describe("Checkout edge cases", () => {
  let authUser: AuthUser | null = null;
  let couponCode: string | null = null;
  let couponId: string | null = null;

  test.beforeAll(async () => {
    try {
      authUser = await createTestUser();
    } catch (err) {
      console.warn(
        "Could not create Clerk test user — authenticated tests will skip:",
        err
      );
    }
    const codeToCreate = `E2E${Date.now()}`;
    const created = await createCoupon(codeToCreate);
    if (created) {
      couponCode = created.code;
      couponId = created.id;
    }
  });

  test.afterAll(async () => {
    if (authUser) await cleanupUser(authUser.userId);
    if (couponId) await deactivateCoupon(couponId);
  });

  test("Multiple items + coupon + express delivery: discount and shipping shown correctly on order", async ({
    page,
  }) => {
    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }
    if (!couponCode) {
      test.skip(true, "Could not create a test coupon (ADMIN_API_KEY missing or endpoint unavailable)");
      return;
    }

    await signInWithTicket(page, BASE_URL, authUser.userId);

    const [productA, productB] = await getInStockProducts(page, 2);

    await addProductToCart(page, productA.id);
    await addProductToCart(page, productB.id);

    await page.goto(`${BASE_URL}/checkout`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3_000);

    await expect(page.getByText("Checkout")).toBeVisible({ timeout: 5_000 });

    await fillAddressFormIfNeeded(page);

    const continueBtn1 = page.getByTestId("checkout-continue-1");
    await continueBtn1.waitFor({ state: "visible", timeout: 8_000 });
    await continueBtn1.click();
    await page.waitForTimeout(1_500);

    await expect(page.getByText("Delivery Method")).toBeVisible({ timeout: 8_000 });
    await page.getByText("Express Delivery").click();
    await page.waitForTimeout(500);

    await page.getByTestId("checkout-continue-2").click();
    await page.waitForTimeout(1_500);

    await expect(page.getByText("Payment Method")).toBeVisible({ timeout: 8_000 });
    await page.getByText("Cash on Delivery").click();
    await page.waitForTimeout(500);

    await page.getByTestId("checkout-continue-3").click();
    await page.waitForTimeout(1_500);

    await expect(page.getByText("Review Order")).toBeVisible({ timeout: 8_000 });

    const couponInput = page.locator('input[placeholder="Enter coupon code"]');
    await couponInput.fill(couponCode);
    await page.getByText("Apply", { exact: true }).click();
    await page.waitForTimeout(1_500);

    await expect(page.getByText(`"${couponCode}" applied`)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Discount/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("₹499")).toBeVisible({ timeout: 5_000 });

    await page.getByTestId("checkout-place-order").click();
    await page.waitForURL(/\/orders\//, { timeout: 25_000 });

    await expect(page.getByTestId("order-confirmed-title")).toBeVisible({ timeout: 10_000 });

    await expect(page.getByText(new RegExp(`Discount \\(${couponCode}\\)`, "i"))).toBeVisible({
      timeout: 8_000,
    });
    await expect(page.getByText("− ₹200")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("₹499")).toBeVisible({ timeout: 5_000 });
  });

  test("Product goes out of stock between add-to-cart and place-order: clear error, no silent failure", async ({
    page,
  }) => {
    if (!authUser) {
      test.skip(true, "Clerk test user creation failed");
      return;
    }

    const [product] = await getInStockProducts(page, 1);

    await signInWithTicket(page, BASE_URL, authUser.userId);

    await addProductToCart(page, product.id);

    const dbResult = await withDbClient(async (client) => {
      const before = await client.query(
        "SELECT stock FROM products WHERE id = $1",
        [product.id]
      );
      await client.query("UPDATE products SET stock = 0 WHERE id = $1", [product.id]);
      return before.rows[0]?.stock ?? null;
    });

    if (dbResult === null) {
      test.skip(true, "DATABASE_URL not available to simulate out-of-stock race condition");
      return;
    }

    try {
      await page.goto(`${BASE_URL}/checkout`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(3_000);

      await expect(page.getByText("Checkout")).toBeVisible({ timeout: 5_000 });

      await fillAddressFormIfNeeded(page);

      const continueBtn1 = page.getByTestId("checkout-continue-1");
      await continueBtn1.waitFor({ state: "visible", timeout: 8_000 });
      await continueBtn1.click();
      await page.waitForTimeout(1_500);

      await expect(page.getByText("Delivery Method")).toBeVisible({ timeout: 8_000 });
      await page.getByTestId("checkout-continue-2").click();
      await page.waitForTimeout(1_500);

      await expect(page.getByText("Payment Method")).toBeVisible({ timeout: 8_000 });
      await page.getByText("Cash on Delivery").click();
      await page.waitForTimeout(500);

      await page.getByTestId("checkout-continue-3").click();
      await page.waitForTimeout(1_500);

      await expect(page.getByText("Review Order")).toBeVisible({ timeout: 8_000 });

      await page.getByTestId("checkout-place-order").click();

      const errorLocator = page.getByText(/out of stock/i);
      await expect(errorLocator.first()).toBeVisible({ timeout: 15_000 });

      const stillOnCheckout = page.url().includes("/checkout");
      expect(stillOnCheckout).toBe(true);
    } finally {
      await withDbClient(async (client) => {
        await client.query("UPDATE products SET stock = 10 WHERE id = $1", [product.id]);
      });
    }
  });
});
