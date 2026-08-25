/**
 * Admin 2FA setup — recovery-code handoff E2E coverage.
 *
 * The setup flow is exercised through the real Settings UI, while the
 * delivery endpoints are stubbed so the test does not depend on email/SMS
 * providers or expose one-time codes in the test environment.
 */

import { readFileSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";

const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "test-e2e-admin-key";
const RECOVERY_CODES = [
  "A1B2C3D4E5-0011223344",
  "B2C3D4E5F6-1122334455",
  "C3D4E5F6A7-2233445566",
  "D4E5F6A7B8-3344556677",
  "E5F6A7B8C9-4455667788",
  "F6A7B8C9D0-5566778899",
  "A7B8C9D0E1-6677889900",
  "B8C9D0E1F2-7788990011",
  "C9D0E1F2A3-8899001122",
  "D0E1F2A3B4-9900112233",
];

function seedAdminKey(page: Page) {
  return page.addInitScript((key: string) => {
    sessionStorage.setItem("td_admin_key", key);
  }, ADMIN_KEY);
}

async function stubAdminPage(page: Page) {
  await page.route("**/api/admin/vendors", (route) => {
    if (route.request().method() !== "GET" || /\/vendors\/[^/]+/.test(route.request().url())) {
      return route.continue();
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ vendors: [] }),
    });
  });

  await page.route("**/api/admin/notifications/unread-count", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ count: 0 }),
    }),
  );

  await page.route("**/api/admin/2fa/status", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: false, enabledAt: null }),
    }),
  );

  // Contact details are required before the Enable 2FA button is rendered.
  await page.route("**/api/admin/settings/profile", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        name: "E2E Admin",
        email: "admin@example.com",
        mobile: "+919876543210",
      }),
    }),
  );

  await page.route("**/api/admin/settings/login-activity", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );

  await page.route("**/api/admin/settings/sessions", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ sessions: [] }),
    }),
  );

  await page.route("**/api/admin/settings/notification-prefs", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ prefs: {} }),
    }),
  );

  await page.route("**/api/admin/settings/platform", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ settings: {} }),
    }),
  );

  await page.route("**/api/admin/settings/system-health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: "ok", db: true, uptime: 60, maintenanceMode: false }),
    }),
  );

  await page.route("**/api/admin/audit-logs**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ logs: [], total: 0 }),
    }),
  );
}

async function stubTwoFASetupApi(page: Page) {
  await page.route("**/api/admin/2fa/setup/start", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        qrDataUrl: "data:image/png;base64,e2e-qr",
        manualKey: "JBSWY3DPEHPK3PXP",
        otpauth: "otpauth://totp/TwirlDrape:Super%20Admin?secret=JBSWY3DPEHPK3PXP",
      }),
    }),
  );

  await page.route("**/api/admin/2fa/setup/verify", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, next: "email-otp" }),
    }),
  );

  await page.route("**/api/admin/2fa/setup/send-email-otp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.route("**/api/admin/2fa/setup/verify-email-otp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, next: "sms-otp" }),
    }),
  );

  await page.route("**/api/admin/2fa/setup/send-sms-otp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );

  await page.route("**/api/admin/2fa/setup/verify-sms-otp", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        sessionId: "e2e-session-id",
        tokenHash: "e2e-session-token",
        codes: RECOVERY_CODES,
      }),
    }),
  );
}

test.describe("Admin 2FA setup — recovery codes", () => {
  test("shows ten codes, enforces acknowledgment, and downloads the codes", async ({ page }) => {
    test.setTimeout(60_000);

    await seedAdminKey(page);
    await stubAdminPage(page);
    await stubTwoFASetupApi(page);

    await page.goto("/admin/settings");
    await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole("button", { name: "Enable 2FA", exact: true }).click();
    await page.locator('input[placeholder="Enter your admin key"]').fill(ADMIN_KEY);
    await page.getByRole("button", { name: "Confirm & Continue", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Enable Two-Factor Authentication", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "I've Scanned the Code →", exact: true }).click();

    await page.locator('input[placeholder="000000"]').fill("123456");
    await page.getByRole("button", { name: "Verify & Continue", exact: true }).click();

    await expect(page.getByRole("heading", { name: "Email Verification", exact: true })).toBeVisible();
    await page.locator('input[placeholder="000000"]').fill("234567");
    await page.getByRole("button", { name: "Verify & Continue", exact: true }).click();

    await expect(page.getByRole("heading", { name: "SMS Verification", exact: true })).toBeVisible();
    await page.locator('input[placeholder="000000"]').fill("345678");
    await page.locator("form").getByRole("button", { name: "Enable 2FA", exact: true }).click();

    await expect(
      page.locator("h4", { hasText: "Two-Factor Authentication Enabled" }),
    ).toBeVisible();

    const codeElements = page.locator("span").filter({ hasText: /^[A-F0-9]{10}-[A-F0-9]{10}$/ });
    await expect(codeElements).toHaveCount(RECOVERY_CODES.length);
    for (const code of RECOVERY_CODES) {
      await expect(page.getByText(code, { exact: true })).toBeVisible();
    }

    const continueButton = page.getByRole("button", {
      name: "Continue to Security Settings",
      exact: true,
    });
    await expect(continueButton).toBeDisabled();

    await page.getByRole("checkbox").check();
    await expect(continueButton).toBeEnabled();

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download .txt", exact: true }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toBe("twirldrape-admin-recovery-codes.txt");
    const downloadedPath = await download.path();
    expect(downloadedPath).not.toBeNull();
    const downloadedText = readFileSync(downloadedPath!, "utf8");
    expect(downloadedText).toContain("TwirlDrape Admin — Recovery Codes");
    expect(downloadedText).toContain("Each code can only be used once.");
    for (const code of RECOVERY_CODES) {
      expect(downloadedText).toContain(code);
    }
  });
});