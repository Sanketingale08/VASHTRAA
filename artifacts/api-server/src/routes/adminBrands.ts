import { Router } from "express";
import { db } from "@workspace/db";
import { productBrandsTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdminKey } from "../middlewares/isAdmin";

const router = Router();

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Public: list active brands (used by seller form & customer portal) ────────
router.get("/brands", async (_req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(productBrandsTable)
      .where(eq(productBrandsTable.active, true))
      .orderBy(asc(productBrandsTable.name));
    res.json({ brands: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch brands" });
  }
});

// ── Admin: list all brands ────────────────────────────────────────────────────
router.get("/admin/brands", requireAdminKey, async (req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(productBrandsTable)
      .orderBy(asc(productBrandsTable.name));
    res.json({ brands: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list brands");
    res.status(500).json({ error: "Failed to fetch brands" });
  }
});

// ── Admin: create brand ───────────────────────────────────────────────────────
router.post("/admin/brands", requireAdminKey, async (req: any, res: any) => {
  const { name, categoryIds } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const trimmed = String(name).trim();
  const slug = slugify(trimmed);
  const catIds = Array.isArray(categoryIds) ? categoryIds : [];
  try {
    const [row] = await db
      .insert(productBrandsTable)
      .values({ name: trimmed, slug, categoryIds: catIds })
      .returning();
    res.status(201).json({ brand: row });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A brand with that name already exists" });
    }
    req.log.error({ err }, "Failed to create brand");
    res.status(500).json({ error: "Failed to create brand" });
  }
});

// ── Admin: update brand ───────────────────────────────────────────────────────
router.patch("/admin/brands/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { name, active, categoryIds } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) {
    updates.name = String(name).trim();
    updates.slug = slugify(updates.name);
  }
  if (active !== undefined) updates.active = Boolean(active);
  if (categoryIds !== undefined) updates.categoryIds = Array.isArray(categoryIds) ? categoryIds : [];
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });
  try {
    const [row] = await db
      .update(productBrandsTable)
      .set(updates)
      .where(eq(productBrandsTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Brand not found" });
    res.json({ brand: row });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A brand with that name already exists" });
    }
    req.log.error({ err }, "Failed to update brand");
    res.status(500).json({ error: "Failed to update brand" });
  }
});

// ── Admin: delete brand ───────────────────────────────────────────────────────
router.delete("/admin/brands/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    await db.delete(productBrandsTable).where(eq(productBrandsTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete brand");
    res.status(500).json({ error: "Failed to delete brand" });
  }
});

export default router;
