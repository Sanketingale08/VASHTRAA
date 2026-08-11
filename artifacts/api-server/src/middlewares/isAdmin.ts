/**
 * Requires a valid admin API key in the x-admin-key header.
 * Returns 403 if the key is missing or incorrect.
 *
 * Key verification order:
 *  1. If site_settings contains admin_key_hash, compare SHA-256(provided) against it.
 *  2. Otherwise fall back to plain-text comparison against ADMIN_API_KEY env var.
 *
 * 2FA gate (when admin_2fa_enabled = "true" in site_settings):
 *  - All admin routes EXCEPT /api/admin/2fa/login/* and /api/admin/2fa/status
 *    require x-admin-session-token pointing to a session with two_factor_verified = true.
 *  - Missing or unverified session → 403 { error: "Forbidden", code: "2FA_REQUIRED" }.
 *
 * Session revocation check (when 2FA is disabled):
 *  - If x-admin-session-token is supplied, verify it is not revoked.
 *
 * Both caches use a 30 s TTL to avoid DB round-trips on every admin request.
 * Call clearAdminKeyCache() / clearAdmin2faCache() after the relevant setting changes.
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
let _cachedHash: string | null | undefined = undefined;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 30_000;

async function getStoredHash(): Promise<string | null> {
  const now = Date.now();
  if (_cachedHash !== undefined && now < _cacheExpiry) return _cachedHash;
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "admin_key_hash"));
  _cachedHash = row?.value ?? null;
  _cacheExpiry = now + CACHE_TTL_MS;
  return _cachedHash;
}

export function clearAdminKeyCache(): void {
  _cachedHash = undefined;
  _cacheExpiry = 0;
}

// ── 2FA enabled cache ─────────────────────────────────────────────────────────
let _cached2fa: boolean | undefined = undefined;
let _cache2faExpiry = 0;

async function get2faEnabled(): Promise<boolean> {
  const now = Date.now();
  if (_cached2fa !== undefined && now < _cache2faExpiry) return _cached2fa;
  // Do NOT catch here — let DB errors propagate so callers can fail closed.
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, "admin_2fa_enabled"));
  _cached2fa = row?.value === "true";
  _cache2faExpiry = now + CACHE_TTL_MS;
  return _cached2fa;
}

export function clearAdmin2faCache(): void {
  _cached2fa = undefined;
  _cache2faExpiry = 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if the request path is exempt from the 2FA session requirement. */
function is2faExemptPath(req: any): boolean {
  const url: string = req.originalUrl ?? req.url ?? "";
  // The login endpoints create the verified session — they only need the key.
  // The status endpoint is called during the login flow before any session exists.
  return url.includes("/api/admin/2fa/login/") || url.includes("/api/admin/2fa/status");
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

    // ── 2. 2FA gate ───────────────────────────────────────────────────────────
    const twoFaEnabled = await get2faEnabled();
    if (twoFaEnabled && !is2faExemptPath(req)) {
      const sessionToken = req.headers["x-admin-session-token"] as string | undefined;
      if (!sessionToken) {
        return res.status(403).json({ error: "Forbidden", code: "2FA_REQUIRED" });
      }
      const [session] = await db
        .select({
          revokedAt: adminLoginSessionsTable.revokedAt,
          twoFactorVerified: adminLoginSessionsTable.twoFactorVerified,
        })
        .from(adminLoginSessionsTable)
        .where(eq(adminLoginSessionsTable.sessionTokenHash, sessionToken));

      if (!session || session.revokedAt || !session.twoFactorVerified) {
        return res.status(403).json({ error: "Forbidden", code: "2FA_REQUIRED" });
      }
      return next();
    }

    // ── 3. When 2FA is off, still check for revoked sessions ─────────────────
    const sessionToken = req.headers["x-admin-session-token"] as string | undefined;
    if (sessionToken) {
      const [session] = await db
        .select({ revokedAt: adminLoginSessionsTable.revokedAt })
        .from(adminLoginSessionsTable)
        .where(eq(adminLoginSessionsTable.sessionTokenHash, sessionToken));

      if (session?.revokedAt) {
        return res.status(403).json({ error: "Session revoked", code: "SESSION_REVOKED" });
      }
    }

    next();
  } catch {
    // DB unavailable — fail closed. We cannot verify 2FA status or session
    // validity, so we must not grant access regardless of the access key.
    return res.status(503).json({ error: "Service unavailable" });
  }
}

export const requireAdminKey = isAdmin;
