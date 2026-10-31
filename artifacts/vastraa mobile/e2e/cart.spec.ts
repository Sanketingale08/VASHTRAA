import { test, expect } from "@playwright/test";

const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ??
  (process.env.REPLIT_EXPO_DEV_DOMAIN
    ? `https://${process.env.REPLIT_EXPO_DEV_DOMAIN}`
    : "http://localhost:24295");

async function clearCartViaStorage(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes("cart")) localStorage.removeItem(key);
      }
      localStorage.removeItem("@twirldrape_cart");
    } catch {}
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1_500);
}

async function getBadgeCount(page: import("@playwright/test").Page): Promise<number> {
  const el = page.getByTestId("cart-badge-count");
  await el.waitFor({ state: "attached", timeout: 5_000 });
  const text = await el.textContent();
  return Number(text?.trim() ?? "0");
}

test.describe("Cart — add, badge count, and unauthenticated checkout gate", () => {
  test("Cart badge increments from 0 to 1 when a product is added", async ({ page }) => {
    await page.goto(`${BASE_URL}/explore`);
    await page.waitForLoadState("networkidle");
    await clearCartViaStorage(page);

    const countBefore = await getBadgeCount(page);
    expect(countBefore).toBe(0);

    const productCard = page.locator(`text=/₹[\\d,]+/`).first();
    await productCard.waitFor({ state: "visible", timeout: 20_000 });
    await productCard.click();
    await page.waitForURL(/\/product\//, { timeout: 10_000 });

    const addToCartBtn = page.getByTestId("add-cart-btn");
    await addToCartBtn.waitFor({ state: "visible", timeout: 10_000 });
    await expect(addToCartBtn).toHaveText(/Add to Cart/i, { timeout: 5_000 });

    await addToCartBtn.click();
    await page.waitForTimeout(1_500);

    await expect(addToCartBtn).toHaveText(/Added to Cart|Go to Checkout/i, { timeout: 5_000 });

    const countAfter = await getBadgeCount(page);
    expect(countAfter).toBe(countBefore + 1);
  });

  test("Cart badge decrements from 1 to 0 when the item is removed", async ({ page }) => {
    await page.goto(`${BASE_URL}/explore`);
    await page.waitForLoadState("networkidle");
    await clearCartViaStorage(page);

    const productCard = page.locator(`text=/₹[\\d,]+/`).first();
    await productCard.waitFor({ state: "visible", timeout: 20_000 });
    await productCard.click();
    await page.waitForURL(/\/product\//, { timeout: 10_000 });

    const addToCartBtn = page.getByTestId("add-cart-btn");
    await addToCartBtn.waitFor({ state: "visible", timeout: 10_000 });
    await addToCartBtn.click();
    await page.waitForTimeout(1_500);

    const countAfterAdd = await getBadgeCount(page);
    expect(countAfterAdd).toBe(1);

    await page.goto(`${BASE_URL}/cart`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    const removeBtn = page.locator("[data-testid^='cart-remove-btn-']").first();
    await removeBtn.waitFor({ state: "visible", timeout: 10_000 });
    await removeBtn.click();
    await page.waitForTimeout(1_500);

    const countAfterRemove = await getBadgeCount(page);
    expect(countAfterRemove).toBe(0);

    await expect(page.getByText(/Your Cart is Empty/i)).toBeVisible({ timeout: 5_000 });
  });

  test("Cart screen shows items and price after adding a product", async ({ page }) => {
    await page.goto(`${BASE_URL}/explore`);
    await page.waitForLoadState("networkidle");
    await clearCartViaStorage(page);

    const productCard = page.locator(`text=/₹[\\d,]+/`).first();
    await productCard.waitFor({ state: "visible", timeout: 20_000 });
    await productCard.click();
    await page.waitForURL(/\/product\//, { timeout: 10_000 });

    const addToCartBtn = page.getByTestId("add-cart-btn");
    await addToCartBtn.waitFor({ state: "visible", timeout: 10_000 });
    await expect(addToCartBtn).toHaveText(/Add to Cart/i, { timeout: 5_000 });
    await addToCartBtn.click();
    await page.waitForTimeout(1_500);
    await expect(addToCartBtn).toHaveText(/Added to Cart|Go to Checkout/i, { timeout: 5_000 });

    await page.goto(`${BASE_URL}/cart`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1_000);

    await expect(page.getByTestId("checkout-btn")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/₹[\d,]+/).first()).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText(/Subtotal \(\d+ items?\)/i)).toBeVisible({ timeout: 5_000 });
  });

  test("Unauthenticated user reaching checkout sees sign-in gate", async ({ page }) => {
    await page.goto(`${BASE_URL}/explore`);
    await page.waitForLoadState("networkidle");
    await clearCartViaStorage(page);

    const productCard = page.locator(`text=/₹[\\d,]+/`).first();
    await productCard.waitFor({ state: "visible", timeout: 20_000 });
    await productCard.click();
    await page.waitForURL(/\/product\//, { timeout: 10_000 });

    const addToCartBtn = page.getByTestId("add-cart-btn");
    await addToCartBtn.waitFor({ state: "visible", timeout: 10_000 });
    await addToCartBtn.click();
    await page.waitForTimeout(1_500);

    await page.goto(`${BASE_URL}/checkout`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2_000);

    await expect(page.getByText(/Sign in to Checkout/i)).toBeVisible({ timeout: 8_000 });
  });
});
