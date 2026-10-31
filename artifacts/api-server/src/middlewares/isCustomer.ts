import { isAuthenticated } from "./isAuthenticated";

/**
 * Requires the caller to be an authenticated shopper.
 * Rejects admin key access on customer-only endpoints.
 * Sellers/vendors are also shoppers on the multi-vendor marketplace.
 */
export async function isCustomer(req: any, res: any, next: any) {
  return isAuthenticated(req, res, () => {
    // Reject admin keys on customer-only endpoints
    const adminKey = process.env.ADMIN_API_KEY;
    const provided = req.headers["x-admin-key"];
    if (adminKey && provided && provided === adminKey) {
      return res
        .status(403)
        .json({ error: "Forbidden: admin accounts cannot access customer endpoints", code: "ROLE_MISMATCH" });
    }

    next();
  });
}
