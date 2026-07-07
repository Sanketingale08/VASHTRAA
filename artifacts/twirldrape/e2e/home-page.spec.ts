import { test, expect } from "@playwright/test";

test.describe("Home page — Quick View, Add to Cart, Recently Viewed, Flash Sales", () => {
  test("Quick View modal opens and shows correct product details", async ({
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

    await expect(
      modal.locator("button").filter({ hasText: /^Add to Cart$/ }).first(),
    ).toBeVisible({ timeout: 5_000 });

    await expect(modal.getByText(/₹[\d,]+/).first()).toBeVisible({
      timeout: 3_000,
    });

    await expect(
      modal.locator("a").filter({ hasText: /View Full Details/i }),
    ).toBeVisible({ timeout: 3_000 });
  });

  test("Adding to cart from Quick View updates the cart count badge", async ({
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
    const addToCartBtn = modal
      .locator("button")
      .filter({ hasText: /^Add to Cart$/ })
      .first();
    await addToCartBtn.waitFor({ state: "visible", timeout: 5_000 });
    await addToCartBtn.click({ force: true });

    await page.waitForTimeout(500);

    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);

    const cartBadge = page.locator('button[aria-label="Cart"] span').first();
    await expect(cartBadge).toBeVisible({ timeout: 5_000 });
    const badgeText = (await cartBadge.textContent()) ?? "";
    expect(parseInt(badgeText, 10)).toBeGreaterThan(0);
  });

  test("Navigating to a product detail and back shows it in Recently Viewed", async ({
    page,
  }) => {
    test.setTimeout(70_000);
    await page.goto("/");

    const firstCard = page.locator('[data-testid^="card-product-"]').first();
    await firstCard.waitFor({ state: "visible", timeout: 20_000 });

    const testId = await firstCard.getAttribute("data-testid");
    const productId = testId?.replace("card-product-", "") ?? "";
    expect(productId).toBeTruthy();

    await page.goto(`/products/${productId}`);
    await page.waitForURL(/\/products\//, { timeout: 10_000 });

    await page.waitForFunction(
      () => {
        const ids: string[] = JSON.parse(
          localStorage.getItem("twirl_recently_viewed") ?? "[]",
        );
        return ids.length > 0;
      },
      { timeout: 15_000 },
    );

    await page.goto("/");
    await page.waitForTimeout(3_000);

    const recentlyViewedHeading = page
      .getByRole("heading")
      .filter({ hasText: /Recently Viewed/i });
    await recentlyViewedHeading.scrollIntoViewIfNeeded();
    await expect(recentlyViewedHeading).toBeVisible({ timeout: 10_000 });

    const rvSection = page
      .locator("section")
      .filter({ hasText: /Recently Viewed/i });
    const rvCards = rvSection.locator('[data-testid^="card-product-"]');
    await expect(rvCards.first()).toBeVisible({ timeout: 5_000 });

    await expect(
      page.locator(`[data-testid="card-product-${productId}"]`).last(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("Flash Sales section countdown timer shows a valid non-zero time", async ({
    page,
  }) => {
    await page.goto("/");

    const flashSalesHeading = page
      .getByRole("heading")
      .filter({ hasText: /Flash Sales/i });
    await flashSalesHeading.scrollIntoViewIfNeeded();
    await expect(flashSalesHeading).toBeVisible({ timeout: 15_000 });

    const endsInLabel = page.getByText(/Ends in:/i);
    await expect(endsInLabel).toBeVisible({ timeout: 5_000 });

    const flashSection = page
      .locator("section")
      .filter({ hasText: /Flash Sales/i });
    const countdownBoxes = flashSection.locator("span.font-mono");

    await expect(countdownBoxes).toHaveCount(3, { timeout: 5_000 });

    const values = await countdownBoxes.allTextContents();
    expect(values).toHaveLength(3);

    const [hours, minutes, seconds] = values.map(Number);
    expect(hours).toBeGreaterThanOrEqual(0);
    expect(hours).toBeLessThanOrEqual(23);
    expect(minutes).toBeGreaterThanOrEqual(0);
    expect(minutes).toBeLessThanOrEqual(59);
    expect(seconds).toBeGreaterThanOrEqual(0);
    expect(seconds).toBeLessThanOrEqual(59);

    expect(hours + minutes + seconds).toBeGreaterThan(0);
  });
});
