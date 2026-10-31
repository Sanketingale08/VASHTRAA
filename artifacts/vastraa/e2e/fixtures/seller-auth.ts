import { createClerkClient } from "@clerk/backend";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

export type SellerAuthUser = { userId: string; email: string };

/**
 * Creates a fully verified Clerk test user via the backend API.
 *
 * The seller wizard's step 1 (account creation) and its email OTP
 * verification cannot be exercised with a real inbox in CI, so per the
 * clerk-auth-testing convention we create + verify the account
 * programmatically and then sign in with a one-time ticket. This is
 * equivalent to "mocking" the email OTP step: the wizard's own
 * already-signed-in effect (see SellerRegister.tsx) skips straight past
 * step 1 to step 2 (mobile OTP) once a session exists, which is exactly
 * the behavior a real user would see after finishing email verification.
 */
export async function createVerifiedSeller(): Promise<SellerAuthUser> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY not set");

  const clerk = createClerkClient({ secretKey });
  const tag = Date.now();
  const email = `seller-e2e-${tag}@example.com`;

  const user = await clerk.users.createUser({
    emailAddress: [email],
    password: `TestPwd${tag}!`,
    firstName: "Test",
    lastName: "Seller",
    skipPasswordChecks: true,
    skipPasswordRequirement: false,
  });

  return { userId: user.id, email };
}

export async function signInSeller(
  page: Page,
  baseURL: string,
  userId: string,
): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY not set");

  const clerk = createClerkClient({ secretKey });
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
      const si = w.Clerk.client.signIn;
      const result = await si.create({ strategy: "ticket", ticket });
      if (result.status === "complete") {
        await w.Clerk.setActive({ session: result.createdSessionId });
      } else {
        throw new Error(`Sign-in incomplete: ${result.status}`);
      }
    },
    { ticket: token },
  );

  await page.waitForTimeout(2_000);
}

export async function cleanupSeller(userId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;
  try {
    const clerk = createClerkClient({ secretKey });
    await clerk.users.deleteUser(userId);
  } catch {}
}

/**
 * Replit-managed Clerk does not support SMS/phone verification, so the
 * wizard's mobile-OTP step (`user.createPhoneNumber(...)` /
 * `phoneObj.prepareVerification/attemptVerification(...)`) is mocked
 * directly on the live `window.Clerk.user` instance. This is the same
 * object reference `useUser()` reads from, so the wizard's real UI code
 * runs unmodified against a fake phone resource instead of hitting a
 * real (unsupported) SMS provider.
 */
export async function mockPhoneVerification(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as any;
    if (!w.Clerk?.user) throw new Error("Clerk user not available to mock");
    w.Clerk.user.createPhoneNumber = async ({
      phoneNumber,
    }: {
      phoneNumber: string;
    }) => ({
      id: "mock_phone_id",
      phoneNumber,
      prepareVerification: async () => ({ status: "unverified" }),
      attemptVerification: async ({ code }: { code: string }) => {
        if (!code || code.length < 6) {
          throw { errors: [{ longMessage: "Invalid OTP. Please try again." }] };
        }
        return { verification: { status: "verified" } };
      },
    });
  });
}
