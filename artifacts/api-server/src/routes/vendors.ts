import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable } from "@workspace/db/schema";

const router = Router();

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
    })));
  } catch (err) {
    req.log.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

export default router;
