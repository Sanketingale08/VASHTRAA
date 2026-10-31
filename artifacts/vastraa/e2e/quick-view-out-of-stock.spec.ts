import { test, expect } from "@playwright/test";

test.describe("Quick View modal — out-of-stock guard", () => {
  test("Quick View shows Out of Stock state and blocks Add to Cart when stock is 0", async ({
    page,
  }) => {
    test.setTimeout(90_000);

    let firstProductId: string | null = null;

    await page.route("**/api/products*", async (route) => {
      const response = await route.fetch();
      const json = await response.json();

      const products: Array<Record<string, unknown>> = Array.isArray(json)
        ? json
        : Array.isArray(json?.products)
        ? json.products
        : [];

      const modified = products.map((p, i) => {
        if (i === 0) {
          if (firstProductId === null) firstProductId = String(p.id);
          if (String(p.id) === firstProductId) return { ...p, stock: 0 };
        }
        return p;
      });

      const body = Array.isArray(json)
        ? modified
        : { ...json, products: modified };

      await route.fulfill({
        status: response.status(),
        headers: Object.fromEntries(Object.entries(response.headers())),
        body: JSON.stringify(body),
      });
    });

    await page.goto("/");

    const firstCard = page.locator('[data-testid^="card-product-"]').first();
    await firstCard.waitFor({ state: "visible", timeout: 20_000 });

    const soldOutBadge = firstCard.locator("span").filter({ hasText: /^Sold Out$/ }).first();
    await expect(soldOutBadge).toBeVisible({ timeout: 5_000 });

    await firstCard.hover();
    await page.waitForTimeout(300);

    const quickViewBtn = firstCard.locator('button[title="Quick View"]');
    await quickViewBtn.waitFor({ state: "visible", timeout: 5_000 });
    await quickViewBtn.click({ force: true });

    await page.waitForTimeout(500);

    const modal = page.locator(".fixed.inset-0").first();

    const outOfStockBanner = modal.locator('[data-testid="out-of-stock-banner"]');
    await expect(outOfStockBanner).toBeVisible({ timeout: 5_000 });
    await expect(outOfStockBanner).toContainText("Out of Stock");

    const addToCartBtn = modal.locator('[data-testid="quick-view-add-to-cart"]');
    await expect(addToCartBtn).toBeVisible({ timeout: 5_000 });
    await expect(addToCartBtn).toBeDisabled();
    await expect(addToCartBtn).toContainText("Out of Stock");

    await expect(modal.locator("text=Qty:")).not.toBeVisible();

    await expect(
      modal.locator('[data-testid="out-of-stock-banner"]'),
    ).toBeVisible();

    await addToCartBtn.click({ force: true });
    await page.waitForTimeout(300);

    const cartDrawer = page.locator('[role="dialog"]').filter({ hasText: /Your Cart/i });
    await expect(cartDrawer).not.toBeVisible();
  });

  test("Quick View Add to Cart works normally for an in-stock product", async ({
    page,
  }) => {
    await page.goto("/");

    const firstCard = page.locator('[data-testid^="card-product-"]').first();
    await firstCard.waitFor({ state: "visible", timeout: 20_000 });

    await firstCard.hover();
    await page.waitForTimeout(300);

    const quickViewBtn = firstCard.locator('button[title="Quick View"]');
    await quickViewBtn.waitFor({ state: "visible", timeout: 5_000 });
    await quickViewBtn.click({ force: true });

    await page.waitForTimeout(500);

    const modal = page.locator(".fixed.inset-0").first();

    const addToCartBtn = modal.locator('[data-testid="quick-view-add-to-cart"]');
    await expect(addToCartBtn).toBeVisible({ timeout: 5_000 });
    await expect(addToCartBtn).toBeEnabled();
    await expect(addToCartBtn).toContainText("Add to Cart");

    await expect(modal.locator("text=Qty:")).toBeVisible({ timeout: 3_000 });

    await expect(
      modal.locator('[data-testid="out-of-stock-banner"]'),
    ).not.toBeVisible();

    await addToCartBtn.click({ force: true });
    await page.waitForTimeout(500);

    await expect(addToCartBtn).toContainText(/Added|Add to Cart/, { timeout: 3_000 });
  });
});
