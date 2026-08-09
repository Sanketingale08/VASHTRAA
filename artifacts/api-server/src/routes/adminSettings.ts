import { Router } from "express";
import { db, siteSettingsTable, adminLoginSessionsTable, adminAuditLogsTable } from "@workspace/db";
import { eq, ne, and, isNull, desc, gte, lte, sql } from "drizzle-orm";
import { requireAdminKey, clearAdminKeyCache, sha256hex } from "../middlewares/isAdmin";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { clearAdminNotifPrefCache } from "../lib/adminNotifications";
import crypto from "crypto";

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseUA(ua: string = ""): { device: string; os: string; browser: string } {
  let device = "Desktop";
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/windows nt/i.test(ua)) os = "Windows";
  else if (/macintosh|mac os x/i.test(ua)) os = "macOS";
  else if (/linux/i.test(ua)) os = "Linux";

  if (/mobile|android|iphone|ipod/i.test(ua)) device = "Mobile Phone";
  else if (/tablet|ipad/i.test(ua)) device = "Tablet";

  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/opr\//i.test(ua)) browser = "Opera";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/chrome\//i.test(ua)) browser = "Chrome";
  else if (/safari\//i.test(ua)) browser = "Safari";

  return { device, os, browser };
}

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, key));
  return row?.value ?? null;
}

async function upsertSetting(key: string, value: string) {
  await db
    .insert(siteSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({
      target: siteSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
}

// ── Admin Profile ─────────────────────────────────────────────────────────────

router.get("/admin/settings/profile", requireAdminKey, async (req: any, res: any) => {
  try {
    const [nameVal, emailVal, mobileVal] = await Promise.all([
      getSetting("admin_name"),
      getSetting("admin_email"),
      getSetting("admin_mobile"),
    ]);
    res.json({
      name: nameVal ?? "Super Admin",
      email: emailVal ?? "",
      mobile: mobileVal ?? "",
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

router.patch("/admin/settings/profile", requireAdminKey, async (req: any, res: any) => {
  try {
    const { name, email, mobile } = req.body ?? {};
    const updates: Promise<void>[] = [];
    if (name !== undefined) updates.push(upsertSetting("admin_name", String(name).trim()));
    if (email !== undefined) updates.push(upsertSetting("admin_email", String(email).trim()));
    if (mobile !== undefined) updates.push(upsertSetting("admin_mobile", String(mobile).trim()));
    await Promise.all(updates);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to update profile" });
  }
});

// ── Change Access Key ─────────────────────────────────────────────────────────

router.post("/admin/settings/change-access-key", requireAdminKey, async (req: any, res: any) => {
  try {
    const { currentKey, newKey, confirmKey } = req.body ?? {};
    if (!currentKey || !newKey || !confirmKey) {
      return res.status(400).json({ error: "All fields are required" });
    }
    if (newKey !== confirmKey) {
      return res.status(400).json({ error: "New key and confirmation do not match" });
    }
    if (newKey.length < 16) {
      return res.status(400).json({ error: "New key must be at least 16 characters" });
    }
    if (newKey === currentKey) {
      return res.status(400).json({ error: "New key must differ from the current key" });
    }

    // Verify current key
    const storedHash = await getSetting("admin_key_hash");
    let currentValid: boolean;
    if (storedHash) {
      currentValid = sha256hex(currentKey) === storedHash;
    } else {
      currentValid = currentKey === process.env.ADMIN_API_KEY;
    }
    if (!currentValid) {
      return res.status(400).json({ error: "Current access key is incorrect" });
    }

    await upsertSetting("admin_key_hash", sha256hex(newKey));
    clearAdminKeyCache();

    writeAuditLog({ action: "access_key_changed", module: "Settings", ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to change access key" });
  }
});

// ── Record login session ──────────────────────────────────────────────────────

router.post("/admin/settings/sessions", requireAdminKey, async (req: any, res: any) => {
  try {
    const key = (req.headers["x-admin-key"] as string) ?? "";
    const ua = (req.headers["user-agent"] as string) ?? "";
    const ip =
      ((req.headers["x-forwarded-for"] as string) ?? "").split(",")[0]?.trim() ||
      req.socket?.remoteAddress ||
      "unknown";
    const { device, os, browser } = parseUA(ua);
    const tokenHash = sha256hex(key + ip + ua + crypto.randomBytes(8).toString("hex"));

    const [session] = await db
      .insert(adminLoginSessionsTable)
      .values({ sessionTokenHash: tokenHash, ipAddress: ip, userAgent: ua, device, os, browser, location: "India" })
      .returning({ id: adminLoginSessionsTable.id });

    writeAuditLog({ action: "admin_login", module: "Security", details: { device, os, browser }, ipAddress: ip }).catch(() => {});
    res.json({ sessionId: session.id, tokenHash });
  } catch (err) {
    res.status(500).json({ error: "Failed to record session" });
  }
});

// ── Login activity (all sessions, newest first) ───────────────────────────────

router.get("/admin/settings/login-activity", requireAdminKey, async (req: any, res: any) => {
  try {
    const sessions = await db
      .select()
      .from(adminLoginSessionsTable)
      .orderBy(desc(adminLoginSessionsTable.createdAt))
      .limit(50);
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch login activity" });
  }
});

// ── Active sessions (not revoked) ─────────────────────────────────────────────

router.get("/admin/settings/sessions", requireAdminKey, async (req: any, res: any) => {
  try {
    const sessions = await db
      .select()
      .from(adminLoginSessionsTable)
      .where(isNull(adminLoginSessionsTable.revokedAt))
      .orderBy(desc(adminLoginSessionsTable.lastActive));
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// ── Revoke-others must come before /:id/revoke so the path is matched first ───

router.post("/admin/settings/sessions/revoke-others", requireAdminKey, async (req: any, res: any) => {
  try {
    const currentToken = (req.headers["x-admin-session-token"] as string) ?? "";
    if (currentToken) {
      await db
        .update(adminLoginSessionsTable)
        .set({ revokedAt: new Date() })
        .where(
          and(
            ne(adminLoginSessionsTable.sessionTokenHash, currentToken),
            isNull(adminLoginSessionsTable.revokedAt)
          )
        );
    } else {
      await db
        .update(adminLoginSessionsTable)
        .set({ revokedAt: new Date() })
        .where(isNull(adminLoginSessionsTable.revokedAt));
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke sessions" });
  }
});

// ── Revoke single session ─────────────────────────────────────────────────────

router.post("/admin/settings/sessions/:id/revoke", requireAdminKey, async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const currentToken = (req.headers["x-admin-session-token"] as string) ?? "";

    const [session] = await db
      .select()
      .from(adminLoginSessionsTable)
      .where(eq(adminLoginSessionsTable.id, id));

    if (!session) return res.status(404).json({ error: "Session not found" });
    if (currentToken && session.sessionTokenHash === currentToken) {
      return res.status(400).json({ error: "Cannot revoke your current session" });
    }

    await db
      .update(adminLoginSessionsTable)
      .set({ revokedAt: new Date() })
      .where(eq(adminLoginSessionsTable.id, id));

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to revoke session" });
  }
});

// ── Notification Preferences ──────────────────────────────────────────────────

const NOTIF_DEFAULTS: Record<string, { email: boolean; inApp: boolean; sms: boolean }> = {
  new_order:                { email: true,  inApp: true,  sms: false },
  new_vendor_registration:  { email: true,  inApp: true,  sms: false },
  vendor_approval_required: { email: true,  inApp: true,  sms: false },
  vendor_dispute:           { email: true,  inApp: true,  sms: false },
  refund_request:           { email: true,  inApp: true,  sms: false },
  support_ticket:           { email: true,  inApp: true,  sms: false },
  payment_failure:          { email: true,  inApp: true,  sms: false },
  shipping_issue:           { email: true,  inApp: true,  sms: false },
  system_error:             { email: true,  inApp: true,  sms: false },
  security_login_alert:     { email: true,  inApp: true,  sms: true  },
};

router.get("/admin/settings/notification-prefs", requireAdminKey, async (req: any, res: any) => {
  try {
    const raw = await getSetting("admin_notification_prefs");
    const stored = raw ? JSON.parse(raw) : {};
    const prefs = Object.fromEntries(
      Object.entries(NOTIF_DEFAULTS).map(([k, defaults]) => [k, { ...defaults, ...(stored[k] ?? {}) }])
    );
    res.json({ prefs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch notification preferences" });
  }
});

router.patch("/admin/settings/notification-prefs", requireAdminKey, async (req: any, res: any) => {
  try {
    const { prefs } = req.body ?? {};
    if (!prefs || typeof prefs !== "object") {
      return res.status(400).json({ error: "prefs object required" });
    }
    const merged: Record<string, any> = {};
    for (const [key, defaults] of Object.entries(NOTIF_DEFAULTS)) {
      const inc = (prefs as any)[key] ?? {};
      merged[key] = {
        email: typeof inc.email === "boolean" ? inc.email : defaults.email,
        inApp: typeof inc.inApp === "boolean" ? inc.inApp : defaults.inApp,
        sms:   typeof inc.sms   === "boolean" ? inc.sms   : defaults.sms,
      };
    }
    await upsertSetting("admin_notification_prefs", JSON.stringify(merged));
    clearAdminNotifPrefCache();
    writeAuditLog({ action: "notification_prefs_updated", module: "Settings", ipAddress: getIp(req) }).catch(() => {});
    res.json({ ok: true, prefs: merged });
  } catch (err) {
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

// ── Audit Logs ────────────────────────────────────────────────────────────────

router.get("/admin/audit-logs", requireAdminKey, async (req: any, res: any) => {
  try {
    const { module, from, to, limit = "20", offset = "0" } = req.query;
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string) || 20));
    const offsetNum = Math.max(0, parseInt(offset as string) || 0);

    const conditions: any[] = [];
    if (module && module !== "all") {
      conditions.push(eq(adminAuditLogsTable.module, module as string));
    }
    if (from) {
      const d = new Date(from as string);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "Invalid 'from' date — use ISO 8601 format (e.g. 2026-01-01)" });
      }
      conditions.push(gte(adminAuditLogsTable.createdAt, d));
    }
    if (to) {
      const d = new Date(to as string);
      if (Number.isNaN(d.getTime())) {
        return res.status(400).json({ error: "Invalid 'to' date — use ISO 8601 format (e.g. 2026-12-31)" });
      }
      d.setHours(23, 59, 59, 999);
      conditions.push(lte(adminAuditLogsTable.createdAt, d));
    }

    const where = conditions.length ? and(...conditions) : undefined;

    const [logs, [{ total }]] = await Promise.all([
      db.select().from(adminAuditLogsTable)
        .where(where)
        .orderBy(desc(adminAuditLogsTable.createdAt))
        .limit(limitNum)
        .offset(offsetNum),
      db.select({ total: sql<number>`count(*)::int` })
        .from(adminAuditLogsTable)
        .where(where),
    ]);

    res.json({ logs, total, limit: limitNum, offset: offsetNum });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
