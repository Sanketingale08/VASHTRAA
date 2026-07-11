import { Router } from "express";
import express from "express";
import { db } from "@workspace/db";
import { heroBannersTable, siteSettingsTable } from "@workspace/db";
import { eq, asc, desc, ne } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router: Router = Router();
const objectStorageService = new ObjectStorageService();

const GLOBAL_INTERVAL_KEY = "hero_global_interval_ms";

function requireAdminKey(req: any, res: any, next: any) {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

/**
 * GET /api/hero-banners — public
 * Returns active banners: default banner first, then by displayOrder.
 */
router.get("/hero-banners", async (_req, res) => {
  try {
    const banners = await db
      .select()
      .from(heroBannersTable)
      .where(eq(heroBannersTable.isActive, true))
      .orderBy(desc(heroBannersTable.isDefault), asc(heroBannersTable.displayOrder));
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

/**
 * GET /api/admin/hero-banners — admin: all banners (incl. inactive)
 */
router.get("/admin/hero-banners", requireAdminKey, async (_req, res) => {
  try {
    const banners = await db
      .select()
      .from(heroBannersTable)
      .orderBy(desc(heroBannersTable.isDefault), asc(heroBannersTable.displayOrder));
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

/**
 * GET /api/admin/hero-settings — global settings (default interval, etc.)
 */
router.get("/admin/hero-settings", requireAdminKey, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, GLOBAL_INTERVAL_KEY));
    const globalIntervalMs = rows[0] ? Number(rows[0].value) : 6000;
    res.json({ globalIntervalMs });
  } catch {
    res.json({ globalIntervalMs: 6000 });
  }
});

/**
 * PUT /api/admin/hero-settings — update global default interval
 */
router.put(
  "/admin/hero-settings",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const { globalIntervalMs } = req.body;
      const ms = Math.max(2000, Math.min(30000, Number(globalIntervalMs) || 6000));
      await db
        .insert(siteSettingsTable)
        .values({ key: GLOBAL_INTERVAL_KEY, value: String(ms) })
        .onConflictDoUpdate({ target: siteSettingsTable.key, set: { value: String(ms) } });
      res.json({ globalIntervalMs: ms });
    } catch {
      res.status(500).json({ error: "Failed to save settings" });
    }
  },
);

/**
 * POST /api/admin/upload/hero-image — upload a hero banner image
 */
router.post(
  "/admin/upload/hero-image",
  requireAdminKey,
  express.raw({ type: "image/*", limit: "10mb" }),
  async (req: any, res: any) => {
    try {
      const rawContentType = (req.headers["content-type"] || "image/jpeg")
        .split(";")[0]
        .trim();
      if (!rawContentType.startsWith("image/")) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: "No image data received" });
      }
      const rawExt = rawContentType.split("/")[1] || "jpg";
      const ext =
        rawExt === "jpeg"
          ? "jpg"
          : ["jpg", "png", "webp", "gif"].includes(rawExt)
          ? rawExt
          : "jpg";
      const { publicRelPath } = await objectStorageService.uploadPublicHeroImage(
        req.body,
        ext,
        rawContentType,
      );
      res.json({ publicUrl: publicRelPath });
    } catch (err) {
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

/**
 * POST /api/admin/hero-banners — create a new banner
 */
router.post("/admin/hero-banners", requireAdminKey, express.json(), async (req: any, res: any) => {
  try {
    const { imageUrl, title, slideIntervalMs, isDefault } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });

    const all = await db
      .select({ displayOrder: heroBannersTable.displayOrder })
      .from(heroBannersTable)
      .orderBy(asc(heroBannersTable.displayOrder));
    const maxOrder = all.length > 0 ? Math.max(...all.map((b) => b.displayOrder)) : -1;

    if (isDefault) {
      await db.update(heroBannersTable).set({ isDefault: false });
    }

    const [banner] = await db
      .insert(heroBannersTable)
      .values({
        imageUrl,
        title: title || null,
        displayOrder: maxOrder + 1,
        slideIntervalMs: slideIntervalMs || 6000,
        isDefault: isDefault === true,
      })
      .returning();
    res.json(banner);
  } catch (err) {
    res.status(500).json({ error: "Failed to create banner" });
  }
});

/**
 * PUT /api/admin/hero-banners/reorder — reorder banners by id array
 * (Must be before /:id to avoid "reorder" being interpreted as an id)
 */
router.put(
  "/admin/hero-banners/reorder",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const { ids } = req.body;
      if (!Array.isArray(ids)) return res.status(400).json({ error: "ids must be an array" });
      await Promise.all(
        ids.map((id: string, index: number) =>
          db
            .update(heroBannersTable)
            .set({ displayOrder: index, updatedAt: new Date() })
            .where(eq(heroBannersTable.id, id)),
        ),
      );
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: "Failed to reorder banners" });
    }
  },
);

/**
 * PATCH /api/admin/hero-banners/:id — update banner fields
 */
router.patch(
  "/admin/hero-banners/:id",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { title, isActive, isDefault, displayOrder, slideIntervalMs } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (isActive !== undefined) updates.isActive = isActive;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (slideIntervalMs !== undefined) updates.slideIntervalMs = slideIntervalMs;

      if (isDefault === true) {
        await db
          .update(heroBannersTable)
          .set({ isDefault: false, updatedAt: new Date() })
          .where(ne(heroBannersTable.id, id));
        updates.isDefault = true;
      } else if (isDefault === false) {
        updates.isDefault = false;
      }

      const [banner] = await db
        .update(heroBannersTable)
        .set(updates)
        .where(eq(heroBannersTable.id, id))
        .returning();
      if (!banner) return res.status(404).json({ error: "Banner not found" });
      res.json(banner);
    } catch (err) {
      res.status(500).json({ error: "Failed to update banner" });
    }
  },
);

/**
 * DELETE /api/admin/hero-banners/:id
 */
router.delete("/admin/hero-banners/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    await db.delete(heroBannersTable).where(eq(heroBannersTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete banner" });
  }
});

export default router;
