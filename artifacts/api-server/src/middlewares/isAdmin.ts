/**
 * Requires a valid admin API key in the x-admin-key header.
 * Returns 403 if the key is missing or incorrect.
 *
 * Key verification order:
 *  1. If site_settings contains admin_key_hash, compare SHA-256(provided) against it.
 *  2. Otherwise fall back to plain-text comparison against ADMIN_API_KEY env var.
 *
 * Session check (if x-admin-session-token header is present):
 *  - The token hash is looked up in admin_login_sessions.
 *  - If the session has been revoked (revokedAt is not null), the request is rejected
 *    with 403 and code SESSION_REVOKED so the frontend can clear local auth and redirect.
 *
 * The key hash result is cached for 30 s to avoid a DB round-trip on every admin request.
 *
 * Also exported as `requireAdminKey` for backwards-compatible use.
 */
import crypto from "crypto";
import { db } from "@workspace/db";
import { siteSettingsTable, adminLoginSessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export function sha256hex(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex");
}

// ── Key hash cache ────────────────────────────────────────────────────────────
// undefined  = not yet loaded
// null       = loaded, no custom hash stored → use env var
// string     = loaded, this is the stored hash
let _cachedHash: string | null | undefined = undefined;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 30_000;

async function getStoredHash(): Promise<string | null> {
  const now = Date.now();
  if (_cachedHash !== undefined && now < _cacheExpiry) {
    return _cachedHash;
  }
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "admin_key_hash"));
  _cachedHash = row?.value ?? null;
  _cacheExpiry = now + CACHE_TTL_MS;
  return _cachedHash;
}

/** Call this after changing the stored hash so the next request re-reads it. */
export function clearAdminKeyCache(): void {
  _cachedHash = undefined;
  _cacheExpiry = 0;
}

// ── Middleware ────────────────────────────────────────────────────────────────
export async function isAdmin(req: any, res: any, next: any) {
  const provided = req.headers["x-admin-key"] as string | undefined;
  if (!provided) {
    return res.status(403).json({ error: "Forbidden" });
  }
  try {
    // ── 1. Verify the admin key ──────────────────────────────────────────────
    const storedHash = await getStoredHash();
    let keyValid: boolean;
    if (storedHash) {
      keyValid = sha256hex(provided) === storedHash;
    } else {
      const adminKey = process.env.ADMIN_API_KEY;
      keyValid = !!(adminKey && provided === adminKey);
    }
    if (!keyValid) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // ── 2. If a session token is supplied, verify it is not revoked ──────────
    const sessionToken = req.headers["x-admin-session-token"] as string | undefined;
    if (sessionToken) {
      const [session] = await db
        .select({ revokedAt: adminLoginSessionsTable.revokedAt })
        .from(adminLoginSessionsTable)
        .where(eq(adminLoginSessionsTable.sessionTokenHash, sessionToken));

      if (session?.revokedAt) {
        // Session was explicitly revoked — tell the client to clear its auth
        return res.status(403).json({ error: "Session revoked", code: "SESSION_REVOKED" });
      }
    }

    next();
  } catch {
    // DB unavailable — fall back to env-var key check only; skip session check
    const adminKey = process.env.ADMIN_API_KEY;
    if (adminKey && provided === adminKey) return next();
    return res.status(403).json({ error: "Forbidden" });
  }
}

/** Alias kept for backwards compatibility inside route files. */
export const requireAdminKey = isAdmin;
