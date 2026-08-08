import { getAuth } from "@clerk/express";
import { db, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Requires the caller to be an authenticated customer (Clerk session present,
 * not a known vendor, and not presenting an admin key).
 * Sets req.userId on success.
 */
export async function isCustomer(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;

  // Reject admin keys on customer-only endpoints
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (adminKey && provided && provided === adminKey) {
    return res
      .status(403)
      .json({ error: "Forbidden: admin accounts cannot access customer endpoints" });
  }

  // Reject verified vendor accounts
  try {
    const rows = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, userId as string))
      .limit(1);

    if (rows.length > 0) {
      return res
        .status(403)
        .json({ error: "Forbidden: seller accounts cannot access customer-only endpoints" });
    }
  } catch (err: any) {
    req.log?.error({ err }, "isCustomer vendor check failed");
    return res.status(500).json({ error: "Internal server error" });
  }

  next();
}
