import { isAuthenticated } from "./isAuthenticated";

/**
 * Requires the caller to be an authenticated shopper (Customer role).
 * Rejects seller/vendor tokens or admin key access on customer-only endpoints.
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

    // Role guard: reject vendor/seller tokens attempting customer access
    if (req.userRole && req.userRole === "seller") {
      return res
        .status(403)
        .json({ error: "Forbidden: seller tokens cannot access customer endpoints", code: "ROLE_MISMATCH" });
    }

    next();
  });
}
