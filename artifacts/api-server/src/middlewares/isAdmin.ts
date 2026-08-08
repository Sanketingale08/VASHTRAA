/**
 * Requires a valid admin API key in the x-admin-key header.
 * Returns 403 if the key is missing or incorrect.
 *
 * Also exported as `requireAdminKey` for backwards-compatible use
 * inside route files that still reference that name.
 */
export function isAdmin(req: any, res: any, next: any) {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/** Alias kept for backwards compatibility inside route files. */
export const requireAdminKey = isAdmin;
