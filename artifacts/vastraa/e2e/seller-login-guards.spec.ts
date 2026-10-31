/**
 * Seller Login page — E2E tests
 *
 * Covers:
 *   1. Social / OAuth provider buttons are hidden for anonymous visitors
 *   2. A seller who is already signed in is redirected to /seller/dashboard
 *      instead of seeing Clerk's "Already signed in" card
 */

import { test, expect } from "@playwright/test";
import {
  createVerifiedSeller,
  signInSeller,
  cleanupSeller,
  type SellerAuthUser,
} from "./fixtures/seller-auth";

// ---------------------------------------------------------------------------
// Test 1 — anonymous visitor sees no OAuth / social buttons
// ---------------------------------------------------------------------------
test(
  "seller login page hides all social/OAuth provider buttons",
  async ({ page }) => {
    test.setTimeout(60_000);

    await page.goto("/seller/login");
    await page.waitForLoadState("networkidle");

    // Give Clerk's embedded SignIn component time to fully mount and apply
    // the appearance overrides that set socialButtonsBlock to display:none.
    await page.waitForTimeout(4_000);

    // Clerk renders OAuth buttons with a data-provider attribute.
    // All such elements must be absent or hidden.
    const providerButtons = page.locator("[data-provider]");
    const count = await providerButtons.count();
    for (let i = 0; i < count; i++) {
      await expect(providerButtons.nth(i)).not.toBeVisible();
    }

    // Explicit Google button check — text-based, covers any Clerk version.
    const googleButton = page
      .getByRole("button", { name: /google/i })
      .or(page.locator("button").filter({ hasText: /continue with google/i }));
    const googleCount = await googleButton.count();
    for (let i = 0; i < googleCount; i++) {
      await expect(googleButton.nth(i)).not.toBeVisible();
    }

    // Clerk's socialButtonsBlock wrapper (class-based selector).
    const socialBlock = page.locator(".cl-socialButtonsBlock");
    const blockCount = await socialBlock.count();
    for (let i = 0; i < blockCount; i++) {
      await expect(socialBlock.nth(i)).not.toBeVisible();
    }

    // The sign-in form itself must still be on screen so the page is usable.
    await expect(
      page.locator("input[type='email'], input[name='identifier'], input[id*='email']").first()
    ).toBeVisible({ timeout: 10_000 });
  }
);

// ---------------------------------------------------------------------------
// Test 2 — already-signed-in seller is forwarded to the dashboard
// ---------------------------------------------------------------------------
test(
  "already signed-in seller visiting /seller/login is redirected to /seller/dashboard",
  async ({ page, baseURL }) => {
    test.setTimeout(120_000);

    let seller: SellerAuthUser | null = null;

    try {
      seller = await createVerifiedSeller();

      // Programmatically sign in via a one-time Clerk ticket (same pattern
      // used across all other seller E2E specs).
      await signInSeller(page, baseURL!, seller.userId);

      // Confirm the session is active by waiting for Clerk to be loaded.
      await page.waitForFunction(
        () => !!(window as any).Clerk?.session,
        { timeout: 15_000 }
      );

      // Navigate to the seller login page while already authenticated.
      await page.goto("/seller/login");

      // Clerk's <SignIn forceRedirectUrl="/seller/dashboard"> auto-redirects
      // when an active session is detected; assert we end up on the dashboard.
      await expect(page).toHaveURL(/\/seller\/dashboard/, { timeout: 20_000 });

      // Belt-and-suspenders: also confirm no "Already signed in" Clerk card
      // is visible (it would indicate the redirect did not fire).
      const alreadySignedInCard = page.getByText(/already signed in/i);
      await expect(alreadySignedInCard).not.toBeVisible();
    } finally {
      if (seller) await cleanupSeller(seller.userId);
    }
  }
);
