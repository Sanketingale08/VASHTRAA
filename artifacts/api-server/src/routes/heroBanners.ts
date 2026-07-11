import { Router } from "express";
import express from "express";
import { db } from "@workspace/db";
import { heroBannersTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";

const router: Router = Router();
const objectStorageService = new ObjectStorageService();

function requireAdminKey(req: any, res: any, next: any) {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

router.get("/hero-banners", async (_req, res) => {
  try {
    const banners = await db
      .select()
      .from(heroBannersTable)
      .where(eq(heroBannersTable.isActive, true))
      .orderBy(asc(heroBannersTable.displayOrder));
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

router.get("/admin/hero-banners", requireAdminKey, async (_req, res) => {
  try {
    const banners = await db
      .select()
      .from(heroBannersTable)
      .orderBy(asc(heroBannersTable.displayOrder));
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

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

router.post("/admin/hero-banners", requireAdminKey, express.json(), async (req: any, res: any) => {
  try {
    const { imageUrl, title, slideIntervalMs } = req.body;
    if (!imageUrl) return res.status(400).json({ error: "imageUrl is required" });

    const all = await db
      .select({ displayOrder: heroBannersTable.displayOrder })
      .from(heroBannersTable)
      .orderBy(asc(heroBannersTable.displayOrder));
    const maxOrder = all.length > 0 ? Math.max(...all.map((b) => b.displayOrder)) : -1;

    const [banner] = await db
      .insert(heroBannersTable)
      .values({
        imageUrl,
        title: title || null,
        displayOrder: maxOrder + 1,
        slideIntervalMs: slideIntervalMs || 6000,
      })
      .returning();
    res.json(banner);
  } catch (err) {
    res.status(500).json({ error: "Failed to create banner" });
  }
});

router.patch(
  "/admin/hero-banners/:id",
  requireAdminKey,
  express.json(),
  async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { title, isActive, displayOrder, slideIntervalMs } = req.body;
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (title !== undefined) updates.title = title;
      if (isActive !== undefined) updates.isActive = isActive;
      if (displayOrder !== undefined) updates.displayOrder = displayOrder;
      if (slideIntervalMs !== undefined) updates.slideIntervalMs = slideIntervalMs;

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

router.delete("/admin/hero-banners/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    await db.delete(heroBannersTable).where(eq(heroBannersTable.id, req.params.id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete banner" });
  }
});

export default router;
