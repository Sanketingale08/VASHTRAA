/**
 * Profile Details page — E2E Playwright tests.
 *
 * Covers:
 *   1. Profile card updates immediately after saving (no page refresh needed)
 *   2. Empty metadata fields display "Not added" fallback text
 *   3. Mobile Number [Edit] button opens ChangePhoneModal
 *   4. Email ID [Edit] button opens ChangeEmailModal
 *
 * The profile PATCH is intercepted via page.route() so the tests run
 * deterministically without writing to Clerk's backend. The intercepted
 * success response exercises exactly the state-machine that caused the
 * original regression: the skipNextHydrateRef guard must keep the form
 * showing the submitted values even when Clerk's session hasn't propagated
 * the new publicMetadata yet.
 */

import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

/** Sign a Clerk user in via a sign-in ticket. Mirrors the pattern used across other E2E specs. */
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
      const result = await w.Clerk.client.signIn.create({ strategy: "ticket", ticket });
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

/** Navigate to /account/profile and wait for the page heading. */
async function gotoProfile(
  page: import("@playwright/test").Page,
  baseURL: string
) {
  await page.goto(`${baseURL}/account/profile`);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("heading", { name: "Profile Details" })).toBeVisible({
    timeout: 20_000,
  });
}

test.describe("Profile Details page", () => {
  let userId: string | null = null;

  test.beforeAll(async () => {
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      const clerk = createClerkClient({ secretKey });
      const tag = Date.now();
      const user = await clerk.users.createUser({
        emailAddress: [`profile-e2e-${tag}@example.com`],
        password: `ProfileE2E${tag}!`,
        firstName: "Profile",
        lastName: "Tester",
        skipPasswordChecks: true,
      });
      userId = user.id;
    } catch (err) {
      console.warn("[profile-e2e] Could not create Clerk test user:", err);
    }
  });

  test.afterAll(async () => {
    if (!userId) return;
    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) return;
    try {
      await createClerkClient({ secretKey }).users.deleteUser(userId);
    } catch {}
  });

  test(
    "Profile card updates immediately after saving — no page refresh needed",
    async ({ page, baseURL }) => {
      test.setTimeout(120_000);
      if (!userId) test.skip();

      // Intercept the profile PATCH and return success without touching Clerk's server.
      // This is the critical scenario: the UI must show the submitted values even when
      // Clerk's session hasn't propagated the new publicMetadata yet (the bug that was
      // previously fixed via the skipNextHydrateRef guard).
      await page.route("**/api/account/profile", async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ success: true }),
          });
        } else {
          await route.continue();
        }
      });

      await signInUser(page, baseURL!, userId!);
      await gotoProfile(page, baseURL!);

      // ── Empty-field fallbacks ─────────────────────────────────────
      // A freshly created user has no publicMetadata. Phone, gender, DOB,
      // location, and alternateMobile should all display "Not added".
      await expect(page.getByText("Not added").first()).toBeVisible({ timeout: 10_000 });

      // ── Open the Edit Profile inline form ─────────────────────────
      await page.getByRole("button", { name: /Edit Profile/i }).click();

      // Wait for the form to animate in — the gender <select> is a reliable marker
      const editForm = page.locator("form");
      await expect(editForm).toBeVisible({ timeout: 5_000 });

      // ── Fill in the four editable metadata fields ─────────────────
      await editForm.getByRole("combobox").selectOption("Female");
      await editForm.locator('input[type="date"]').fill("1995-08-15");
      await editForm.getByPlaceholder("Mumbai, Maharashtra").fill("Pune, Maharashtra");
      await editForm.getByPlaceholder("9876543210").fill("9123456789");

      // ── Submit ────────────────────────────────────────────────────
      await editForm.getByRole("button", { name: /Save Changes/i }).click();

      // ── Critical assertions: card must reflect saved values without refresh ──

      // Edit form closes; EDIT PROFILE button reappears in view mode
      await expect(
        page.getByRole("button", { name: /Edit Profile/i })
      ).toBeVisible({ timeout: 20_000 });

      // Saved gender, location, and alternate mobile are visible in the card
      await expect(page.getByText("Female")).toBeVisible();
      await expect(page.getByText("Pune, Maharashtra")).toBeVisible();
      await expect(page.getByText("+91 9123456789")).toBeVisible();

      // Date of Birth rendered in en-IN long format (15 August 1995)
      await expect(page.getByText(/15 August 1995/)).toBeVisible();

      // "Saved" success badge proves the save path completed successfully
      await expect(page.getByText("Saved")).toBeVisible();
    }
  );

  test(
    "Mobile Number row — Edit button opens the phone change modal",
    async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      if (!userId) test.skip();

      await signInUser(page, baseURL!, userId!);
      await gotoProfile(page, baseURL!);

      // Wait for the view card to be fully rendered
      await expect(page.getByText("Not added").first()).toBeVisible({ timeout: 10_000 });

      // Two inline "Edit" buttons exist in the view card: Mobile Number (first)
      // and Email ID (second), in that fixed document order.
      await page.getByRole("button", { name: "Edit", exact: true }).nth(0).click();

      // ChangePhoneModal should open with its heading and step subtitle
      await expect(page.getByText("Change Mobile Number")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Enter your new mobile number")).toBeVisible();
    }
  );

  test(
    "Email ID row — Edit button opens the email change modal",
    async ({ page, baseURL }) => {
      test.setTimeout(90_000);
      if (!userId) test.skip();

      await signInUser(page, baseURL!, userId!);
      await gotoProfile(page, baseURL!);

      await expect(page.getByText("Not added").first()).toBeVisible({ timeout: 10_000 });

      // Email ID is the second inline "Edit" button in the view card.
      await page.getByRole("button", { name: "Edit", exact: true }).nth(1).click();

      // ChangeEmailModal should open with its heading and step subtitle
      await expect(page.getByText("Change Email Address")).toBeVisible({ timeout: 5_000 });
      await expect(page.getByText("Enter your new email address")).toBeVisible();
    }
  );
});
