import { Router } from "express";
import { getAuth } from "@clerk/express";
import { db } from "@workspace/db";
import { savedAddressesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router = Router();

const requireAuth = (req: any, res: any, next: any) => {
  const auth = getAuth(req);
  const userId = auth?.sessionClaims?.userId || auth?.userId;
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  req.userId = userId;
  next();
};

router.get("/addresses", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const rows = await db
      .select()
      .from(savedAddressesTable)
      .where(eq(savedAddressesTable.userId, req.userId))
      .orderBy(desc(savedAddressesTable.isDefault), desc(savedAddressesTable.createdAt));
    res.json({ addresses: rows });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch addresses");
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

router.post("/addresses", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const { name, phone, line1, line2, city, state, pincode, isDefault } = req.body;
    if (!name || !phone || !line1 || !city || !state || !pincode) {
      res.status(400).json({ error: "Missing required address fields" });
      return;
    }
    if (!/^\d{6}$/.test(pincode)) {
      res.status(400).json({ error: "Invalid pincode" });
      return;
    }

    if (isDefault) {
      await db
        .update(savedAddressesTable)
        .set({ isDefault: false })
        .where(eq(savedAddressesTable.userId, req.userId));
    }

    const [created] = await db
      .insert(savedAddressesTable)
      .values({
        userId: req.userId,
        name: String(name).trim(),
        phone: String(phone).trim(),
        line1: String(line1).trim(),
        line2: line2 ? String(line2).trim() : null,
        city: String(city).trim(),
        state: String(state).trim(),
        pincode: String(pincode).trim(),
        isDefault: !!isDefault,
      })
      .returning();

    res.status(201).json({ address: created });
  } catch (err) {
    req.log.error({ err }, "Failed to save address");
    res.status(500).json({ error: "Failed to save address" });
  }
});

export default router;
