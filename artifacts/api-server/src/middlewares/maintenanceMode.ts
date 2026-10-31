/**
 * Maintenance Mode Middleware
 *
 * When `site_settings.maintenance_mode` is "true", all non-admin routes
 * respond with 503 + { maintenance: true }. Admin routes (/api/admin/*) and
 * the health endpoint bypass this check so the admin panel stays accessible.
 *
 * The setting value is cached for 30 seconds to avoid a DB query on every
 * request during normal operation.
 */
import { db, siteSettingsTable, mongoSiteSettings } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";

let _cache: { enabled: boolean; expiresAt: number } | null = null;

/** Call this after toggling maintenance mode so the next request re-reads from DB. */
export function clearMaintenanceModeCache(): void {
  _cache = null;
}

async function isMaintenanceEnabled(): Promise<boolean> {
  if (_cache && Date.now() < _cache.expiresAt) return _cache.enabled;
  try {
    if (mongoSiteSettings && typeof mongoSiteSettings.get === "function") {
      const mongoVal = await mongoSiteSettings.get("maintenance_mode");
      if (mongoVal !== null) {
        const enabled = mongoVal === "true";
        _cache = { enabled, expiresAt: Date.now() + 30_000 };
        return enabled;
      }
    }
  } catch {}
  try {
    const [row] = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "maintenance_mode"));
    const enabled = row?.value === "true";
    _cache = { enabled, expiresAt: Date.now() + 30_000 };
    return enabled;
  } catch {
    // On DB error, default to not blocking traffic
    return false;
  }
}

export function maintenanceMode(req: Request, res: Response, next: NextFunction): void {
  // Admin routes, health checks, and the public maintenance-status probe always bypass
  if (
    req.path.startsWith("/api/admin") ||
    req.path.startsWith("/api/seller") ||
    req.path.startsWith("/api/health") ||
    req.path === "/api/settings/maintenance-status"
  ) {
    return next();
  }
  isMaintenanceEnabled()
    .then((enabled) => {
      if (enabled) {
        res.status(503).json({
          maintenance: true,
          message: "VASTRAA is temporarily down for scheduled maintenance. We'll be back shortly!",
        });
      } else {
        next();
      }
    })
    .catch(() => next()); // never block on error
}
