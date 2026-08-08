import { getAuth } from "@clerk/express";
import { db, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function requireVendorAuth(req: any, res: any, next: any) {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;

  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, userId as string))
      .limit(1);

    if (rows.length === 0) {
      return res.status(403).json({ error: "No vendor account found for this user" });
    }

    const vendor = rows[0];

    if (vendor.status === "pending") {
      return res.status(403).json({ error: "Vendor account is pending approval", code: "VENDOR_PENDING" });
    }

    if (vendor.status === "suspended") {
      return res.status(403).json({ error: "Vendor account has been suspended", code: "VENDOR_SUSPENDED" });
    }

    req.vendor = vendor;
    req.vendorId = vendor.id;
    next();
  } catch (err: any) {
    req.log?.error({ err }, "requireVendorAuth failed");
    return res.status(500).json({ error: "Internal server error" });
  }
}
