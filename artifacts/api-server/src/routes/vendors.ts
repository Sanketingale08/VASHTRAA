import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";

const router = Router();

const requireAdminKey = (req: any, res: any, next: any) => {
  const adminKey = process.env.ADMIN_API_KEY;
  const provided = req.headers["x-admin-key"];
  if (!adminKey || !provided || provided !== adminKey) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
};

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

router.get("/vendors", async (req, res) => {
  try {
    const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
    res.json(vendors.map((v) => ({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.get("/vendors/me", requireAuth, async (req: any, res: any) => {
  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "No vendor account found" });
    }

    const v = rows[0];
    res.json({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
      contactEmail: v.contactEmail ?? null,
      gstin: v.gstin ?? null,
      status: v.status,
      ownerId: v.ownerId,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor profile");
    res.status(500).json({ error: "Failed to fetch vendor profile" });
  }
});

router.get("/vendors/:id", async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const v = rows[0];
    res.json({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
      contactEmail: v.contactEmail ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor");
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

router.post("/vendors", requireAuth, async (req: any, res: any) => {
  const { name, location, bio, gstin, contactEmail, tagline } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Shop name is required" });
  }
  if (!location || !String(location).trim()) {
    return res.status(400).json({ error: "Location is required" });
  }

  try {
    const existing = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: "You already have a vendor account" });
    }

    const [vendor] = await db
      .insert(vendorsTable)
      .values({
        name: String(name).trim(),
        location: String(location).trim(),
        bio: bio ? String(bio).trim() : null,
        gstin: gstin ? String(gstin).trim().toUpperCase() : null,
        contactEmail: contactEmail ? String(contactEmail).trim() : null,
        tagline: tagline ? String(tagline).trim() : null,
        ownerId: req.userId,
        status: "pending",
      })
      .returning();

    res.status(201).json({
      id: vendor.id,
      name: vendor.name,
      status: vendor.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create vendor");
    res.status(500).json({ error: "Failed to create vendor account" });
  }
});

router.patch("/vendors/:id", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  const { name, location, bio, gstin, contactEmail, tagline, avatar } = req.body;

  try {
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }
    if (rows[0].ownerId !== req.userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (location !== undefined) updates.location = String(location).trim();
    if (bio !== undefined) updates.bio = String(bio).trim() || null;
    if (gstin !== undefined) updates.gstin = String(gstin).trim().toUpperCase() || null;
    if (contactEmail !== undefined) updates.contactEmail = String(contactEmail).trim() || null;
    if (tagline !== undefined) updates.tagline = String(tagline).trim() || null;
    if (avatar !== undefined) updates.avatar = String(avatar).trim() || null;

    const [updated] = await db
      .update(vendorsTable)
      .set(updates)
      .where(eq(vendorsTable.id, id))
      .returning();

    res.json({
      id: updated.id,
      name: updated.name,
      location: updated.location,
      bio: updated.bio,
      tagline: updated.tagline,
      contactEmail: updated.contactEmail,
      gstin: updated.gstin,
      avatar: updated.avatar,
      status: updated.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to update vendor");
    res.status(500).json({ error: "Failed to update vendor" });
  }
});

router.get("/admin/vendors", requireAdminKey, async (req: any, res: any) => {
  try {
    const vendors = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
    res.json({ vendors: vendors.map((v) => ({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      ownerId: v.ownerId ?? null,
      status: v.status,
      gstin: v.gstin ?? null,
      contactEmail: v.contactEmail ?? null,
    })) });
  } catch (err) {
    req.log.error({ err }, "Failed to list admin vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/admin/vendors/:id/approve", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "approved" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to approve vendor");
    res.status(500).json({ error: "Failed to approve vendor" });
  }
});

router.post("/admin/vendors/:id/suspend", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to suspend vendor");
    res.status(500).json({ error: "Failed to suspend vendor" });
  }
});

export default router;
