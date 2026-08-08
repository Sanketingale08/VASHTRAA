import { getAuth } from "@clerk/express";

/**
 * Requires a valid Clerk session. Sets req.userId on success.
 * Returns 401 if no authenticated session is present.
 */
export function isAuthenticated(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
}

/** Alias kept for backwards compatibility inside route files. */
export const requireAuth = isAuthenticated;
