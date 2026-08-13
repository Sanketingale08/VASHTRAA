import { getAuth } from "@clerk/express";

/**
 * Requires the caller to be an authenticated shopper (Clerk session present,
 * not presenting an admin key). Vendor accounts may also place orders —
 * role separation at this layer is wrong for a multi-vendor marketplace where
 * sellers are also buyers.
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

  next();
}
