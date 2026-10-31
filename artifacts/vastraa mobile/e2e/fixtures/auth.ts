import { createClerkClient } from "@clerk/backend";
import { setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Page } from "@playwright/test";

export type AuthUser = { userId: string; email: string };

export async function createTestUser(): Promise<AuthUser> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY not set");

  const clerk = createClerkClient({ secretKey });
  const tag = Date.now();
  const email = `testuser-${tag}@example.com`;

  const user = await clerk.users.createUser({
    emailAddress: [email],
    password: `TestPwd${tag}!`,
    firstName: "Test",
    lastName: "Shopper",
    skipPasswordChecks: true,
  });

  return { userId: user.id, email };
}

export async function signInWithTicket(
  page: Page,
  baseURL: string,
  userId: string
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
  await page.waitForTimeout(3_000);

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
    { ticket: token }
  );

  await page.waitForTimeout(2_000);
}

export async function cleanupUser(userId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;
  try {
    const clerk = createClerkClient({ secretKey });
    await clerk.users.deleteUser(userId);
  } catch {}
}
