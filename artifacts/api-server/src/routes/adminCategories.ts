import { Router } from "express";
import { db } from "@workspace/db";
import { productCategoriesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";
import { requireAdminKey } from "../middlewares/isAdmin";

const router = Router();

function slugify(name: string) {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Public: list active categories (used by seller form & customer portal) ────
router.get("/categories", async (_req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(productCategoriesTable)
      .where(eq(productCategoriesTable.active, true))
      .orderBy(asc(productCategoriesTable.name));
    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ── Admin: list all categories ────────────────────────────────────────────────
router.get("/admin/categories", requireAdminKey, async (req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(productCategoriesTable)
      .orderBy(asc(productCategoriesTable.name));
    res.json({ categories: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to list categories");
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ── Admin: create category ────────────────────────────────────────────────────
router.post("/admin/categories", requireAdminKey, async (req: any, res: any) => {
  const { name, parentId } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "name is required" });
  }
  const trimmed = String(name).trim();
  const slug = slugify(trimmed);
  try {
    const [row] = await db
      .insert(productCategoriesTable)
      .values({ name: trimmed, slug, parentId: parentId ?? null })
      .returning();
    res.status(201).json({ category: row });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A category with that name already exists" });
    }
    req.log.error({ err }, "Failed to create category");
    res.status(500).json({ error: "Failed to create category" });
  }
});

// ── Admin: update category ────────────────────────────────────────────────────
router.patch("/admin/categories/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { name, active, parentId } = req.body;
  const updates: Record<string, any> = {};
  if (name !== undefined) {
    updates.name = String(name).trim();
    updates.slug = slugify(updates.name);
  }
  if (active !== undefined) updates.active = Boolean(active);
  if (parentId !== undefined) updates.parentId = parentId ?? null;
  if (!Object.keys(updates).length) return res.status(400).json({ error: "No fields to update" });
  try {
    const [row] = await db
      .update(productCategoriesTable)
      .set(updates)
      .where(eq(productCategoriesTable.id, id))
      .returning();
    if (!row) return res.status(404).json({ error: "Category not found" });
    res.json({ category: row });
  } catch (err: any) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "A category with that name already exists" });
    }
    req.log.error({ err }, "Failed to update category");
    res.status(500).json({ error: "Failed to update category" });
  }
});

// ── Admin: delete category ────────────────────────────────────────────────────
router.delete("/admin/categories/:id", requireAdminKey, async (req: any, res: any) => {
  try {
    await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, req.params.id));
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Failed to delete category");
    res.status(500).json({ error: "Failed to delete category" });
  }
});

export default router;
