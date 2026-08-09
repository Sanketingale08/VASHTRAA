import { Router } from "express";
import { db, siteSettingsTable, adminLoginSessionsTable } from "@workspace/db";
import { eq, ne, and, isNull, desc } from "drizzle-orm";
import { requireAdminKey, clearAdminKeyCache, sha256hex } from "../middlewares/isAdmin";
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

export default router;
