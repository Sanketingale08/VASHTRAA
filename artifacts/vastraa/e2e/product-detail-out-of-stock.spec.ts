import { test, expect } from "@playwright/test";

test.describe("Product detail page — out-of-stock guard", () => {
  test("shows Out of Stock state and disables Add to Cart when stock is 0", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const listResponse = await page.request.get("/api/products");
    const listJson = await listResponse.json();
    const products: Array<Record<string, unknown>> = Array.isArray(listJson)
      ? listJson
      : Array.isArray(listJson?.products)
      ? listJson.products
      : [];
    expect(products.length).toBeGreaterThan(0);
    const targetId = String(products[0].id);

    for (const stockValue of [0, -1]) {
      await page.unroute(`**/api/products/${targetId}`);
      await page.route(`**/api/products/${targetId}`, async (route) => {
        const response = await route.fetch();
        const json = await response.json();
        const body = { ...json, stock: stockValue };
        await route.fulfill({
          status: response.status(),
          headers: Object.fromEntries(Object.entries(response.headers())),
          body: JSON.stringify(body),
        });
      });

      await page.goto(`/products/${targetId}`);

      const outOfStockMessage = page.locator("text=Currently out of stock");
      await expect(outOfStockMessage).toBeVisible({ timeout: 20_000 });

      const addToCartBtn = page.locator("button", { hasText: /Out of Stock|Add to Cart/ }).first();
      await expect(addToCartBtn).toBeVisible({ timeout: 5_000 });
      await expect(addToCartBtn).toBeDisabled();
      await expect(addToCartBtn).toContainText("Out of Stock");

      await addToCartBtn.click({ force: true });
      await page.waitForTimeout(300);

      const cartDrawer = page.locator('[role="dialog"]').filter({ hasText: /Your Cart/i });
      await expect(cartDrawer).not.toBeVisible();
    }
  });

  test("Add to Cart works normally for an in-stock product", async ({ page }) => {
    const listResponse = await page.request.get("/api/products");
    const listJson = await listResponse.json();
    const products: Array<Record<string, unknown>> = Array.isArray(listJson)
      ? listJson
      : Array.isArray(listJson?.products)
      ? listJson.products
      : [];
    const inStock = products.find((p) => Number(p.stock) > 0);
    expect(inStock).toBeTruthy();
    const targetId = String(inStock!.id);

    await page.goto(`/products/${targetId}`);

    const addToCartBtn = page.locator("button", { hasText: /Add to Cart|Added to Cart/ }).first();
    await expect(addToCartBtn).toBeVisible({ timeout: 20_000 });
    await expect(addToCartBtn).toBeEnabled();
    await expect(addToCartBtn).toContainText("Add to Cart");

    await addToCartBtn.click({ force: true });
    await page.waitForTimeout(500);

    await expect(addToCartBtn).toContainText(/Added|Add to Cart/, { timeout: 3_000 });
  });
});
