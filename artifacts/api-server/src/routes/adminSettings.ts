import { Router } from "express";
import { db, siteSettingsTable, adminLoginSessionsTable, adminAuditLogsTable, mongoSiteSettings, mongoGeneric, mongoAuditLogs, isMongoDbConnected } from "@workspace/db";
import { eq, ne, and, isNull, desc, gte, lte, sql } from "drizzle-orm";
import { requireAdminKey, clearAdminKeyCache, sha256hex } from "../middlewares/isAdmin";
import bcrypt from "bcryptjs";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { clearAdminNotifPrefCache } from "../lib/adminNotifications";
import { clearMaintenanceModeCache } from "../middlewares/maintenanceMode";
import { getCashfreeConfig, testCashfreeConnection } from "../lib/cashfree";
import crypto from "crypto";

const router = Router();

function maskSecret(str?: string | null): string {
  if (!str) return "";
  if (str.length <= 8) return "••••••••";
  return str.slice(0, 4) + "••••••••" + str.slice(-4);
}

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
  try {
    if (mongoSiteSettings && typeof mongoSiteSettings.get === "function") {
      const val = await mongoSiteSettings.get(key);
      if (val !== null) return val;
    }
  } catch {}
  try {
    const [row] = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

async function upsertSetting(key: string, value: string) {
  try {
    if (mongoSiteSettings && typeof mongoSiteSettings.set === "function") {
      await mongoSiteSettings.set(key, value);
    }
  } catch {}
  try {
    await db
      .insert(siteSettingsTable)
      .values({ key, value })
      .onConflictDoUpdate({
        target: siteSettingsTable.key,
        set: { value, updatedAt: new Date() },
      });
  } catch {}
}

async function deleteSetting(key: string) {
  try {
    if (mongoSiteSettings && typeof mongoSiteSettings.delete === "function") {
      await mongoSiteSettings.delete(key);
    }
  } catch {}
  try {
    if (typeof db?.delete === "function") {
      await db.delete(siteSettingsTable).where(eq(siteSettingsTable.key, key));
    }
  } catch {}
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
      email: emailVal ?? "admin@vastraa.com",
      mobile: mobileVal ?? "+91 98765 43210",
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

const handleChangeAccessKey = async (req: any, res: any) => {
  try {
    const { currentKey, newKey, confirmKey } = req.body ?? {};
    if (!currentKey || !newKey || !confirmKey) {
      return res.status(400).json({ success: false, error: "All fields are required" });
    }
    if (newKey !== confirmKey) {
      return res.status(400).json({ success: false, error: "New key and confirmation do not match" });
    }
    if (newKey.length < 8) {
      return res.status(400).json({ success: false, error: "New key must be at least 8 characters" });
    }
    if (newKey === currentKey) {
      return res.status(400).json({ success: false, error: "New key must differ from the current key" });
    }

    // Verify current key against stored hash or fallback
    let currentValid = false;
    try {
      const adminMod = await import("../middlewares/isAdmin");
      if (typeof adminMod.verifyAdminAccessKey === "function") {
        currentValid = await adminMod.verifyAdminAccessKey(currentKey);
      }
    } catch {}

    if (!currentValid) {
      const storedHash = await getSetting("admin_key_hash");
      if (storedHash) {
        currentValid = sha256hex(currentKey) === storedHash || storedHash === currentKey || storedHash === `hash:${currentKey}`;
      } else {
        currentValid = currentKey === process.env.ADMIN_API_KEY;
      }
    }

    if (!currentValid) {
      return res.status(400).json({ success: false, error: "Current access key is incorrect" });
    }

    // Hash the new access key using bcrypt (never store plain text)
    const newHash = await bcrypt.hash(newKey.trim(), 10);
    await upsertSetting("admin_key_hash", newHash);

    // Clean up any historical plain-text settings from the database
    await deleteSetting("admin_access_key");
    await deleteSetting("admin_key");

    // Invalidate the in-memory cache so the new key takes effect immediately
    clearAdminKeyCache();

    writeAuditLog({ action: "access_key_changed", module: "Settings", ipAddress: getIp(req) }).catch(() => {});
    return res.json({ ok: true, success: true, message: "Access Key updated successfully." });
  } catch (err) {
    return res.status(500).json({ success: false, error: "Failed to change access key" });
  }
};

router.post("/admin/settings/change-access-key", requireAdminKey, handleChangeAccessKey);
router.put("/admin/settings/access-key", requireAdminKey, handleChangeAccessKey);

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
    const id = crypto.randomUUID();
    const now = new Date();

    const sessionDoc = {
      _id: id,
      id,
      sessionTokenHash: tokenHash,
      ipAddress: ip,
      userAgent: ua,
      device,
      os,
      browser,
      location: "India",
      createdAt: now,
      lastActive: now,
      revokedAt: null,
      twoFactorVerified: true,
    };

    try {
      const col = mongoGeneric.getCollection("admin_sessions");
      await col.insertOne(sessionDoc);
    } catch {}

    let sessionId = id;
    try {
      const [session] = await db
        .insert(adminLoginSessionsTable)
        .values({ id, sessionTokenHash: tokenHash, ipAddress: ip, userAgent: ua, device, os, browser, location: "India", twoFactorVerified: true })
        .returning({ id: adminLoginSessionsTable.id });
      if (session?.id) sessionId = session.id;
    } catch {}

    writeAuditLog({ action: "admin_login", module: "Security", details: { device, os, browser }, ipAddress: ip }).catch(() => {});
    res.json({ sessionId, tokenHash });
  } catch (err) {
    res.status(500).json({ error: "Failed to record session" });
  }
});

// ── Login activity (all sessions, newest first) ───────────────────────────────

router.get("/admin/settings/login-activity", requireAdminKey, async (req: any, res: any) => {
  try {
    let sessions: any[] = [];
    try {
      const col = mongoGeneric.getCollection("admin_sessions");
      const list = await col.find({}).sort({ createdAt: -1 }).limit(50).toArray();
      sessions = list.map(s => ({ ...s, id: s.id || s._id }));
    } catch {}

    if (sessions.length === 0) {
      try {
        sessions = await db
          .select()
          .from(adminLoginSessionsTable)
          .orderBy(desc(adminLoginSessionsTable.createdAt))
          .limit(50);
      } catch {}
    }
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch login activity" });
  }
});

// ── Active sessions (not revoked) ─────────────────────────────────────────────

router.get("/admin/settings/sessions", requireAdminKey, async (req: any, res: any) => {
  try {
    let sessions: any[] = [];
    try {
      const col = mongoGeneric.getCollection("admin_sessions");
      const list = await col.find({
        $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }]
      }).sort({ lastActive: -1 }).toArray();
      sessions = list.map(s => ({ ...s, id: s.id || s._id }));
    } catch {}

    if (sessions.length === 0) {
      try {
        sessions = await db
          .select()
          .from(adminLoginSessionsTable)
          .where(isNull(adminLoginSessionsTable.revokedAt))
          .orderBy(desc(adminLoginSessionsTable.lastActive));
      } catch {}
    }
    res.json({ sessions });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// ── Revoke-others must come before /:id/revoke so the path is matched first ───

router.post("/admin/settings/sessions/revoke-others", requireAdminKey, async (req: any, res: any) => {
  try {
    const currentToken = (req.headers["x-admin-session-token"] as string) ?? "";
    const now = new Date();
    try {
      const col = mongoGeneric.getCollection("admin_sessions");
      const filter: any = { $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }] };
      if (currentToken) filter.sessionTokenHash = { $ne: currentToken };
      await col.updateMany(filter, { $set: { revokedAt: now } });
    } catch {}

    try {
      if (currentToken) {
        await db
          .update(adminLoginSessionsTable)
          .set({ revokedAt: now })
          .where(
            and(
              ne(adminLoginSessionsTable.sessionTokenHash, currentToken),
              isNull(adminLoginSessionsTable.revokedAt)
            )
          );
      } else {
        await db
          .update(adminLoginSessionsTable)
          .set({ revokedAt: now })
          .where(isNull(adminLoginSessionsTable.revokedAt));
      }
    } catch {}

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
    const now = new Date();

    let sessionTokenHash = "";
    try {
      const col = mongoGeneric.getCollection("admin_sessions");
      const doc = await col.findOne({ $or: [{ id }, { _id: id }] });
      if (doc) sessionTokenHash = doc.sessionTokenHash;
    } catch {}

    if (!sessionTokenHash) {
      try {
        const [pgSession] = await db
          .select()
          .from(adminLoginSessionsTable)
          .where(eq(adminLoginSessionsTable.id, id));
        if (pgSession) sessionTokenHash = pgSession.sessionTokenHash;
      } catch {}
    }

    if (currentToken && sessionTokenHash && sessionTokenHash === currentToken) {
      return res.status(400).json({ error: "Cannot revoke your current session" });
    }

    try {
      const col = mongoGeneric.getCollection("admin_sessions");
      await col.updateOne({ $or: [{ id }, { _id: id }] }, { $set: { revokedAt: now } });
    } catch {}

    try {
      await db
        .update(adminLoginSessionsTable)
        .set({ revokedAt: now })
        .where(eq(adminLoginSessionsTable.id, id));
    } catch {}

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

    if (from && isNaN(new Date(from as string).getTime())) {
      return res.status(400).json({ error: "Invalid 'from' date format" });
    }
    if (to && isNaN(new Date(to as string).getTime())) {
      return res.status(400).json({ error: "Invalid 'to' date format" });
    }

    let logs: any[] = [];
    let total = 0;

    try {
      const filter: any = {};
      if (module && module !== "all") filter.module = module;
      if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from as string);
        if (to) {
          const d = new Date(to as string);
          d.setHours(23, 59, 59, 999);
          filter.createdAt.$lte = d;
        }
      }
      logs = await mongoAuditLogs.findMany(filter, { limit: limitNum, offset: offsetNum, sort: { createdAt: -1 } });
      total = await mongoAuditLogs.count(filter);
    } catch {}

    if (logs.length === 0 && total === 0) {
      try {
        const conditions: any[] = [];
        if (module && module !== "all") {
          conditions.push(eq(adminAuditLogsTable.module, module as string));
        }
        if (from) {
          const d = new Date(from as string);
          if (!Number.isNaN(d.getTime())) conditions.push(gte(adminAuditLogsTable.createdAt, d));
        }
        if (to) {
          const d = new Date(to as string);
          if (!Number.isNaN(d.getTime())) {
            d.setHours(23, 59, 59, 999);
            conditions.push(lte(adminAuditLogsTable.createdAt, d));
          }
        }

        const where = conditions.length ? and(...conditions) : undefined;

        const [logRows, countRes] = await Promise.all([
          db.select().from(adminAuditLogsTable)
            .where(where)
            .orderBy(desc(adminAuditLogsTable.createdAt))
            .limit(limitNum)
            .offset(offsetNum)
            .catch(() => []),
          db.select({ total: sql<number>`count(*)::int` })
            .from(adminAuditLogsTable)
            .where(where)
            .catch(() => [{ total: 0 }]),
        ]);
        logs = logRows;
        total = countRes[0]?.total ?? 0;
      } catch {}
    }

    res.json({ logs, total, limit: limitNum, offset: offsetNum });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ── Public: maintenance status probe (no auth — used by the storefront SPA) ──

router.get("/settings/maintenance-status", async (_req: any, res: any) => {
  try {
    const val = await getSetting("maintenance_mode");
    res.json({ maintenance: val === "true" });
  } catch {
    res.json({ maintenance: false }); // never block traffic on error
  }
});

// ── Platform Settings ─────────────────────────────────────────────────────────

const PLATFORM_DEFAULTS: Record<string, string> = {
  platform_name:    "VASTRAA",
  platform_logo_url:"/logo.svg",
  country:          "India",
  currency:         "INR",
  timezone:         "Asia/Kolkata",
  date_format:      "DD/MM/YYYY",
  support_email:    "support@vastraa.com",
  support_mobile:   "+91 98765 43210",
  business_info:    "VASTRAA Marketplace Pvt Ltd",
  invoice_default_template: "vastraa-v2",
};

router.get("/admin/settings/platform", requireAdminKey, async (_req: any, res: any) => {
  try {
    const keys = Object.keys(PLATFORM_DEFAULTS);
    const values = await Promise.all(keys.map((k) => getSetting(k)));
    const settings: Record<string, string> = {};
    keys.forEach((k, i) => { settings[k] = values[i] ?? PLATFORM_DEFAULTS[k]; });
    res.json({ settings });
  } catch {
    res.status(500).json({ error: "Failed to fetch platform settings" });
  }
});

router.patch("/admin/settings/platform", requireAdminKey, async (req: any, res: any) => {
  try {
    const body: Record<string, unknown> = req.body ?? {};
    const allowed = new Set(Object.keys(PLATFORM_DEFAULTS));
    const updates: Promise<void>[] = [];
    const changedKeys: string[] = [];

    for (const [key, val] of Object.entries(body)) {
      if (!allowed.has(key) || typeof val !== "string") continue;
      updates.push(upsertSetting(key, val.trim()));
      changedKeys.push(key);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid fields provided" });
    }

    await Promise.all(updates);
    writeAuditLog({
      action: "platform_settings_updated",
      module: "Platform Settings",
      details: { fields: changedKeys },
      ipAddress: getIp(req),
    }).catch(() => {});

    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to update platform settings" });
  }
});

// ── System Health ─────────────────────────────────────────────────────────────

router.get("/admin/settings/system-health", requireAdminKey, async (_req: any, res: any) => {
  try {
    let dbOk = false;
    try {
      if (typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
        dbOk = true;
      }
    } catch {}

    if (!dbOk) {
      try {
        await db.select({ one: sql<number>`1` }).from(siteSettingsTable).limit(1);
        dbOk = true;
      } catch {}
    }

    const maintenanceModeVal = await getSetting("maintenance_mode").catch(() => null);
    const uptime = Math.floor(process.uptime());

    res.json({
      status: dbOk ? "ok" : "degraded",
      db: dbOk,
      uptime,
      maintenanceMode: maintenanceModeVal === "true",
    });
  } catch (err) {
    console.error("System health error:", err);
    res.status(500).json({ error: "Failed to fetch system health" });
  }
});

// ── Maintenance Mode ──────────────────────────────────────────────────────────

router.patch("/admin/settings/maintenance-mode", requireAdminKey, async (req: any, res: any) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled (boolean) is required" });
    }
    await upsertSetting("maintenance_mode", String(enabled));
    clearMaintenanceModeCache();
    writeAuditLog({
      action: enabled ? "maintenance_mode_enabled" : "maintenance_mode_disabled",
      module: "System",
      ipAddress: getIp(req),
    }).catch(() => {});
    res.json({ ok: true, maintenanceMode: enabled });
  } catch {
    res.status(500).json({ error: "Failed to update maintenance mode" });
  }
});

// ── Payment Settings ─────────────────────────────────────────────────────────

router.get("/admin/settings/payment", requireAdminKey, async (_req: any, res: any) => {
  try {
    const config = await getCashfreeConfig();
    const [
      dbAppId,
      dbSecretKey,
      dbEnv,
      dbApiVersion,
      dbWebhookSecret,
      dbPayoutClientId,
      dbPayoutClientSecret,
      dbPayoutEnv,
      dbPayoutWebhookSecret,
      dbHoldDays,
      dbMinThreshold,
      dbPayoutMode,
      dbPaymentsEnabled,
      dbPayoutEnabled,
    ] = await Promise.all([
      getSetting("cashfree_app_id"),
      getSetting("cashfree_secret_key"),
      getSetting("cashfree_env"),
      getSetting("cashfree_api_version"),
      getSetting("cashfree_pg_webhook_secret"),
      getSetting("cashfree_payout_client_id"),
      getSetting("cashfree_payout_client_secret"),
      getSetting("cashfree_payout_env"),
      getSetting("cashfree_payout_webhook_secret"),
      getSetting("settlement_hold_days"),
      getSetting("minimum_payout_threshold"),
      getSetting("payout_mode"),
      getSetting("payments_enabled"),
      getSetting("payout_enabled"),
    ]);

    res.json({
      appId: dbAppId || config.appId,
      hasSecretKey: Boolean(dbSecretKey || config.secretKey),
      maskedSecretKey: maskSecret(dbSecretKey || config.secretKey),
      env: dbEnv || config.env,
      apiVersion: dbApiVersion || config.apiVersion,
      hasWebhookSecret: Boolean(dbWebhookSecret || config.webhookSecret),
      maskedWebhookSecret: maskSecret(dbWebhookSecret || config.webhookSecret),
      payoutClientId: dbPayoutClientId || config.payoutClientId,
      hasPayoutClientSecret: Boolean(dbPayoutClientSecret || config.payoutClientSecret),
      maskedPayoutClientSecret: maskSecret(dbPayoutClientSecret || config.payoutClientSecret),
      payoutEnv: dbPayoutEnv || config.payoutEnv,
      hasPayoutWebhookSecret: Boolean(dbPayoutWebhookSecret || config.payoutWebhookSecret),
      maskedPayoutWebhookSecret: maskSecret(dbPayoutWebhookSecret || config.payoutWebhookSecret),
      settlementHoldDays: dbHoldDays ? parseInt(dbHoldDays, 10) : config.settlementHoldDays,
      minimumPayoutThreshold: Math.round((dbMinThreshold ? parseInt(dbMinThreshold, 10) : config.minimumPayoutThresholdPaise) / 100),
      payoutMode: dbPayoutMode || config.payoutMode,
      paymentsEnabled: dbPaymentsEnabled !== "false",
      payoutsEnabled: dbPayoutEnabled === "true" || config.payoutEnabled,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch payment settings" });
  }
});

router.patch("/admin/settings/payment", requireAdminKey, async (req: any, res: any) => {
  try {
    const body = req.body ?? {};
    const updates: Promise<void>[] = [];
    const changedFields: string[] = [];

    if (typeof body.appId === "string") {
      updates.push(upsertSetting("cashfree_app_id", body.appId.trim()));
      changedFields.push("appId");
    }
    if (typeof body.secretKey === "string" && body.secretKey.trim() && !body.secretKey.includes("••••")) {
      updates.push(upsertSetting("cashfree_secret_key", body.secretKey.trim()));
      changedFields.push("secretKey");
    }
    if (body.env === "sandbox" || body.env === "production") {
      updates.push(upsertSetting("cashfree_env", body.env));
      changedFields.push("env");
    }
    if (typeof body.apiVersion === "string") {
      updates.push(upsertSetting("cashfree_api_version", body.apiVersion.trim()));
      changedFields.push("apiVersion");
    }
    if (typeof body.webhookSecret === "string" && body.webhookSecret.trim() && !body.webhookSecret.includes("••••")) {
      updates.push(upsertSetting("cashfree_pg_webhook_secret", body.webhookSecret.trim()));
      changedFields.push("webhookSecret");
    }
    if (typeof body.payoutClientId === "string") {
      updates.push(upsertSetting("cashfree_payout_client_id", body.payoutClientId.trim()));
      changedFields.push("payoutClientId");
    }
    if (typeof body.payoutClientSecret === "string" && body.payoutClientSecret.trim() && !body.payoutClientSecret.includes("••••")) {
      updates.push(upsertSetting("cashfree_payout_client_secret", body.payoutClientSecret.trim()));
      changedFields.push("payoutClientSecret");
    }
    if (body.payoutEnv === "sandbox" || body.payoutEnv === "production") {
      updates.push(upsertSetting("cashfree_payout_env", body.payoutEnv));
      changedFields.push("payoutEnv");
    }
    if (typeof body.payoutWebhookSecret === "string" && body.payoutWebhookSecret.trim() && !body.payoutWebhookSecret.includes("••••")) {
      updates.push(upsertSetting("cashfree_payout_webhook_secret", body.payoutWebhookSecret.trim()));
      changedFields.push("payoutWebhookSecret");
    }
    if (typeof body.settlementHoldDays === "number" && body.settlementHoldDays >= 0) {
      updates.push(upsertSetting("settlement_hold_days", String(Math.floor(body.settlementHoldDays))));
      changedFields.push("settlementHoldDays");
    }
    if (typeof body.minimumPayoutThreshold === "number" && body.minimumPayoutThreshold >= 1) {
      updates.push(upsertSetting("minimum_payout_threshold", String(Math.floor(body.minimumPayoutThreshold * 100))));
      changedFields.push("minimumPayoutThreshold");
    }
    if (body.payoutMode === "manual" || body.payoutMode === "scheduled") {
      updates.push(upsertSetting("payout_mode", body.payoutMode));
      changedFields.push("payoutMode");
    }
    if (typeof body.paymentsEnabled === "boolean") {
      updates.push(upsertSetting("payments_enabled", String(body.paymentsEnabled)));
      changedFields.push("paymentsEnabled");
    }
    if (typeof body.payoutsEnabled === "boolean") {
      updates.push(upsertSetting("payout_enabled", String(body.payoutsEnabled)));
      changedFields.push("payoutsEnabled");
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid settings provided to update" });
    }

    await Promise.all(updates);

    writeAuditLog({
      action: "payment_settings_updated",
      module: "Payment Settings",
      details: { fields: changedFields },
      ipAddress: getIp(req),
    }).catch(() => {});

    res.json({ ok: true, updated: changedFields });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update payment settings" });
  }
});

router.post("/admin/settings/payment/test-connection", requireAdminKey, async (_req: any, res: any) => {
  try {
    const result = await testCashfreeConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to test connection" });
  }
});

router.get("/admin/settings/email", requireAdminKey, async (_req: any, res: any) => {
  try {
    const { refreshEmailSettingsCache, getCachedEmailConfig } = await import("../lib/transactionalEmail");
    const cfg = (await refreshEmailSettingsCache().catch(() => null)) || getCachedEmailConfig();

    const [dbHost, dbPort, dbSecure, dbUser, dbPass, dbFrom, dbResend] = await Promise.all([
      getSetting("smtp_host"),
      getSetting("smtp_port"),
      getSetting("smtp_secure"),
      getSetting("smtp_user"),
      getSetting("smtp_pass"),
      getSetting("smtp_from"),
      getSetting("resend_api_key"),
    ]);

    const host = dbHost ?? cfg?.smtpHost ?? process.env.SMTP_HOST ?? "";
    const port = dbPort ? parseInt(dbPort, 10) : (cfg?.smtpPort ?? (parseInt(process.env.SMTP_PORT || "", 10) || 587));
    const secure = dbSecure !== null && dbSecure !== undefined
      ? dbSecure === "true"
      : (cfg?.smtpSecure ?? (process.env.SMTP_SECURE === "true" || port === 465));
    const user = dbUser ?? cfg?.smtpUser ?? process.env.SMTP_USER ?? process.env.SMTP_USERNAME ?? "";
    const pass = dbPass ?? cfg?.smtpPass ?? process.env.SMTP_PASS ?? process.env.SMTP_PASSWORD ?? "";
    const from = dbFrom ?? cfg?.smtpFrom ?? process.env.SMTP_FROM ?? process.env.RESEND_FROM_EMAIL ?? process.env.FROM_EMAIL ?? "";
    const resendApiKey = dbResend ?? cfg?.resendApiKey ?? process.env.RESEND_API_KEY ?? "";

    res.json({
      smtpHost: host,
      smtpPort: port,
      smtpSecure: secure,
      smtpUser: user,
      hasSmtpPass: Boolean(pass && pass.trim() !== "" && !pass.includes("placeholder")),
      maskedSmtpPass: maskSecret(pass),
      smtpFrom: from,
      resendApiKey: resendApiKey ? (resendApiKey.length > 8 ? resendApiKey.slice(0, 4) + "••••••••" + resendApiKey.slice(-4) : "••••••••") : "",
      hasResendApiKey: Boolean(resendApiKey && resendApiKey.trim() !== "" && !resendApiKey.includes("placeholder")),
      isConfigured: Boolean(host && user && pass),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to fetch email settings" });
  }
});

router.patch("/admin/settings/email", requireAdminKey, async (req: any, res: any) => {
  try {
    const body = req.body ?? {};
    const updates: Promise<void>[] = [];
    const changedFields: string[] = [];

    if (typeof body.smtpHost === "string") {
      updates.push(upsertSetting("smtp_host", body.smtpHost.trim()));
      changedFields.push("smtpHost");
    }
    if (typeof body.smtpPort === "number" || typeof body.smtpPort === "string") {
      const p = parseInt(String(body.smtpPort), 10);
      if (p > 0 && p < 65536) {
        updates.push(upsertSetting("smtp_port", String(p)));
        changedFields.push("smtpPort");
      }
    }
    if (typeof body.smtpSecure === "boolean") {
      updates.push(upsertSetting("smtp_secure", String(body.smtpSecure)));
      changedFields.push("smtpSecure");
    }
    if (typeof body.smtpUser === "string") {
      updates.push(upsertSetting("smtp_user", body.smtpUser.trim()));
      changedFields.push("smtpUser");
    }
    if (typeof body.smtpPass === "string" && body.smtpPass.trim() && !body.smtpPass.includes("••••")) {
      updates.push(upsertSetting("smtp_pass", body.smtpPass.trim()));
      changedFields.push("smtpPass");
    }
    if (typeof body.smtpFrom === "string") {
      updates.push(upsertSetting("smtp_from", body.smtpFrom.trim()));
      changedFields.push("smtpFrom");
    }
    if (typeof body.resendApiKey === "string" && !body.resendApiKey.includes("••••")) {
      updates.push(upsertSetting("resend_api_key", body.resendApiKey.trim()));
      changedFields.push("resendApiKey");
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: "No valid email settings provided to update" });
    }

    await Promise.all(updates);

    const { refreshEmailSettingsCache } = await import("../lib/transactionalEmail");
    await refreshEmailSettingsCache().catch(() => {});

    writeAuditLog({
      action: "email_settings_updated",
      module: "Email Settings",
      details: { fields: changedFields },
      ipAddress: getIp(req),
    }).catch(() => {});

    res.json({ ok: true, updated: changedFields });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to update email settings" });
  }
});

router.post("/admin/settings/email/test-smtp", requireAdminKey, async (req: any, res: any) => {
  try {
    const { verifySmtpConnection } = await import("../lib/transactionalEmail");
    const body = req.body || {};
    const overrides = body.host || body.user
      ? {
          host: body.host,
          port: body.port ? parseInt(String(body.port), 10) : undefined,
          secure: typeof body.secure === "boolean" ? body.secure : undefined,
          user: body.user,
          pass: body.pass && !body.pass.includes("••••") ? body.pass : undefined,
          from: body.from,
        }
      : undefined;

    const result = await verifySmtpConnection(overrides);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to verify SMTP connection" });
  }
});

router.post("/admin/settings/email/send-test", requireAdminKey, async (req: any, res: any) => {
  try {
    const { toEmail } = req.body || {};
    if (!toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(toEmail).trim())) {
      return res.status(400).json({ error: "Please enter a valid recipient email address for testing." });
    }

    const { sendTestEmail } = await import("../lib/transactionalEmail");
    const result = await sendTestEmail(String(toEmail).trim());
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err?.message || "Failed to send test email" });
  }
});

export default router;
