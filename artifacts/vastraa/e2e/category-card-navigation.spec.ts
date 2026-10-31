import { test, expect, Page } from "@playwright/test";

/**
 * Assert that no full-width hero banner occupies the top of the page.
 * A hero banner is typically a single section/div with a large background
 * image spanning ≥ 95 % of the viewport width and ≥ 450 px tall, positioned
 * at the very top (y ≤ 80 px). Category-card grids are contained in a CSS
 * grid and therefore never match this profile.
 */
async function assertNoHeroBanner(page: Page) {
  const viewportSize = page.viewportSize();
  const viewportWidth = viewportSize?.width ?? 1280;
  // Collect <section> and large <div> elements visible near the top of the page
  const candidates = page.locator("section, [class*='hero']");
  const count = await candidates.count();
  for (let i = 0; i < Math.min(count, 5); i++) {
    const el = candidates.nth(i);
    const box = await el.boundingBox();
    if (!box) continue;
    // Ignore elements not near the top of the document
    if (box.y > 150) continue;
    // A classic hero banner occupies close to full viewport width AND is very tall
    const isFullWidth = box.width >= viewportWidth * 0.9;
    const isTall = box.height >= 450;
    if (isFullWidth && isTall) {
      // Make sure this isn't just the page wrapper (has many children = layout container)
      const childCount = await el.locator("> *").count();
      // Layout wrappers typically have several children; a hero banner is more
      // monolithic (1–3 direct children: bg img + overlay + text)
      if (childCount <= 4) {
        throw new Error(
          `Unexpected hero banner found: ${JSON.stringify(box)}, children: ${childCount}`,
        );
      }
    }
  }
}

/**
 * Wait for at least one product card to be visible on the current page.
 */
async function assertProductGridLoaded(page: Page) {
  const firstCard = page.locator('[data-testid^="card-product-"]').first();
  await firstCard.waitFor({ state: "visible", timeout: 25_000 });
}

// ---------------------------------------------------------------------------
// /paithani
// ---------------------------------------------------------------------------
test.describe("/paithani — category cards", () => {
  test("renders category cards (no hero banner) and navigates to bridal shop", async ({
    page,
  }) => {
    await page.goto("/paithani");

    // Wait for category cards to appear
    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    await assertNoHeroBanner(page);

    // Click the first "Shop Now" button (Wedding Paithani → /paithani/shop?occasion=bridal)
    await shopNowBtns.first().click();

    await page.waitForURL(/\/paithani\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/paithani/shop");
    expect(page.url()).toContain("occasion=bridal");

    await assertProductGridLoaded(page);
  });

  test("second category card navigates to festival shop", async ({ page }) => {
    await page.goto("/paithani");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.nth(1).waitFor({ state: "visible", timeout: 20_000 });

    // Click the second card (Festival Paithani → /paithani/shop?occasion=festival)
    await shopNowBtns.nth(1).click();

    await page.waitForURL(/\/paithani\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/paithani/shop");
    expect(page.url()).toContain("occasion=festival");

    await assertProductGridLoaded(page);
  });
});

// ---------------------------------------------------------------------------
// /designer
// ---------------------------------------------------------------------------
test.describe("/designer — category cards", () => {
  test("renders category cards (no hero banner) and navigates to designer shop", async ({
    page,
  }) => {
    await page.goto("/designer");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    await assertNoHeroBanner(page);

    // Both Designer cards link to /designer/shop
    await shopNowBtns.first().click();

    await page.waitForURL(/\/designer\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/designer/shop");

    await assertProductGridLoaded(page);
  });

  test("second category card also navigates to designer shop", async ({
    page,
  }) => {
    await page.goto("/designer");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.nth(1).waitFor({ state: "visible", timeout: 20_000 });

    await shopNowBtns.nth(1).click();

    await page.waitForURL(/\/designer\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/designer/shop");

    await assertProductGridLoaded(page);
  });
});

// ---------------------------------------------------------------------------
// /bridal
// ---------------------------------------------------------------------------
test.describe("/bridal — category cards", () => {
  test("renders category cards (no hero banner) and navigates to paithani bridal shop", async ({
    page,
  }) => {
    await page.goto("/bridal");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    await assertNoHeroBanner(page);

    // First card: Paithani Bridal → /paithani/shop?occasion=bridal
    await shopNowBtns.first().click();

    await page.waitForURL(/\/paithani\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/paithani/shop");
    expect(page.url()).toContain("occasion=bridal");

    await assertProductGridLoaded(page);
  });

  test("second category card navigates to designer bridal shop", async ({
    page,
  }) => {
    await page.goto("/bridal");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.nth(1).waitFor({ state: "visible", timeout: 20_000 });

    // Second card: Designer Bridal → /designer/shop?occasion=bridal
    await shopNowBtns.nth(1).click();

    await page.waitForURL(/\/designer\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/designer/shop");
    expect(page.url()).toContain("occasion=bridal");

    await assertProductGridLoaded(page);
  });
});

// ---------------------------------------------------------------------------
// /party-wear
// ---------------------------------------------------------------------------
test.describe("/party-wear — category cards", () => {
  test("renders category cards (no hero banner) and navigates to cocktail destination", async ({
    page,
  }) => {
    await page.goto("/party-wear");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    await assertNoHeroBanner(page);

    // First card: Cocktail Sarees → /designer/shop
    await shopNowBtns.first().click();

    await page.waitForURL(/\/designer\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/designer/shop");

    await assertProductGridLoaded(page);
  });

  test("second category card navigates to /festival", async ({ page }) => {
    await page.goto("/party-wear");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.nth(1).waitFor({ state: "visible", timeout: 20_000 });

    // Second card: Festive Party Wear → /festival
    await shopNowBtns.nth(1).click();

    await page.waitForURL(/\/festival/, { timeout: 10_000 });
    expect(page.url()).toContain("/festival");

    // Festival page has category cards and a product grid; wait for cards
    const festivalShopNow = page.locator("button").filter({ hasText: /Shop Now/i });
    await festivalShopNow.first().waitFor({ state: "visible", timeout: 15_000 });
  });
});

// ---------------------------------------------------------------------------
// /festival
// ---------------------------------------------------------------------------
test.describe("/festival — category cards", () => {
  test("renders category cards (no hero banner) and navigates to festival paithani shop", async ({
    page,
  }) => {
    await page.goto("/festival");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    await assertNoHeroBanner(page);

    // Both Festival cards → /paithani/shop?occasion=festival
    await shopNowBtns.first().click();

    await page.waitForURL(/\/paithani\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/paithani/shop");
    expect(page.url()).toContain("occasion=festival");

    await assertProductGridLoaded(page);
  });

  test("second category card also navigates to paithani festival shop", async ({
    page,
  }) => {
    await page.goto("/festival");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.nth(1).waitFor({ state: "visible", timeout: 20_000 });

    await shopNowBtns.nth(1).click();

    await page.waitForURL(/\/paithani\/shop/, { timeout: 10_000 });
    expect(page.url()).toContain("/paithani/shop");
    expect(page.url()).toContain("occasion=festival");

    await assertProductGridLoaded(page);
  });
});


// ---------------------------------------------------------------------------
// /new-arrivals
// ---------------------------------------------------------------------------
test.describe("/new-arrivals — in-page filter cards", () => {
  test("renders category cards (no hero banner) and product grid loads", async ({
    page,
  }) => {
    await page.goto("/new-arrivals");

    // New Arrivals uses onSelect cards (no navigation); verify cards are visible
    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    await assertNoHeroBanner(page);

    // Verify two filter cards are present
    await expect(shopNowBtns).toHaveCount(2, { timeout: 5_000 });

    // Product grid should already be loaded (all new arrivals)
    await assertProductGridLoaded(page);
  });

  test("clicking a category card filters the product grid in-page", async ({
    page,
  }) => {
    await page.goto("/new-arrivals");

    const shopNowBtns = page.locator("button").filter({ hasText: /Shop Now/i });
    await shopNowBtns.first().waitFor({ state: "visible", timeout: 20_000 });

    // Click the first card (Paithani Sarees filter)
    await shopNowBtns.first().click();

    // Card state switches to "Showing Below" and URL stays on /new-arrivals
    const showingBelow = page
      .locator("button")
      .filter({ hasText: /Showing Below/i })
      .first();
    await showingBelow.waitFor({ state: "visible", timeout: 5_000 });

    expect(page.url()).toContain("/new-arrivals");

    // Product grid should still show results
    await assertProductGridLoaded(page);
  });
});
