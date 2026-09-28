import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db, mongoAddresses, savedAddressesTable } from "@workspace/db";
import { eq, desc, and } from "@workspace/db";

const router = Router();

function validateAddressPayload(body: any): string | null {
  const { name, phone, line1, city, state, pincode, addressType } = body;
  if (!name || typeof name !== "string" || !name.trim()) {
    return "Full name is required";
  }
  if (!phone || typeof phone !== "string" || !phone.trim()) {
    return "Phone number is required";
  }
  const digits = String(phone).replace(/\D/g, "");
  if (digits.length < 10) {
    return "Invalid phone number (must contain at least 10 digits)";
  }
  if (!line1 || typeof line1 !== "string" || !line1.trim()) {
    return "Address line 1 is required";
  }
  if (!city || typeof city !== "string" || !city.trim()) {
    return "City is required";
  }
  if (!state || typeof state !== "string" || !state.trim()) {
    return "State is required";
  }
  if (!pincode || typeof pincode !== "string" || !/^\d{6}$/.test(pincode.trim())) {
    return "PIN code must be exactly 6 digits";
  }
  if (addressType && !["home", "work", "other"].includes(addressType)) {
    return "addressType must be 'home', 'work', or 'other'";
  }
  return null;
}

router.get("/addresses", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    try {
      const addresses = await mongoAddresses.findByUserId(req.userId);
      res.json({ addresses });
      return;
    } catch {
      const rows = await db
        .select()
        .from(savedAddressesTable)
        .where(eq(savedAddressesTable.userId, req.userId))
        .orderBy(desc(savedAddressesTable.isDefault), desc(savedAddressesTable.createdAt));
      res.json({ addresses: rows });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to fetch addresses");
    res.status(500).json({ error: "Failed to fetch addresses" });
  }
});

router.post("/addresses", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const valError = validateAddressPayload(req.body);
    if (valError) {
      res.status(400).json({ error: valError });
      return;
    }

    const { name, phone, line1, line2, landmark, city, state, pincode, country, addressType, isDefault } = req.body;

    const payload = {
      userId: req.userId,
      name: String(name).trim(),
      phone: String(phone).trim(),
      line1: String(line1).trim(),
      line2: line2 ? String(line2).trim() : null,
      landmark: landmark ? String(landmark).trim() : null,
      city: String(city).trim(),
      state: String(state).trim(),
      pincode: String(pincode).trim(),
      country: country ? String(country).trim() : "India",
      addressType: (addressType as "home" | "work" | "other") || "home",
      isDefault: !!isDefault,
    };

    try {
      if (payload.isDefault) {
        const userAddresses = await mongoAddresses.findByUserId(req.userId);
        for (const addr of userAddresses) {
          if (addr.isDefault) {
            await mongoAddresses.update(addr.id, { isDefault: false });
          }
        }
      }

      const created = await mongoAddresses.insert(payload);
      res.status(201).json({ address: created });
      return;
    } catch {
      if (payload.isDefault) {
        await db
          .update(savedAddressesTable)
          .set({ isDefault: false })
          .where(eq(savedAddressesTable.userId, req.userId));
      }

      const [created] = await db
        .insert(savedAddressesTable)
        .values(payload)
        .returning();

      res.status(201).json({ address: created });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to save address");
    res.status(500).json({ error: "Failed to save address" });
  }
});

router.put("/addresses/:id", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;
    const valError = validateAddressPayload(req.body);
    if (valError) {
      res.status(400).json({ error: valError });
      return;
    }

    const { name, phone, line1, line2, landmark, city, state, pincode, country, addressType, isDefault } = req.body;

    const updatePayload = {
      name: String(name).trim(),
      phone: String(phone).trim(),
      line1: String(line1).trim(),
      line2: line2 ? String(line2).trim() : null,
      landmark: landmark ? String(landmark).trim() : null,
      city: String(city).trim(),
      state: String(state).trim(),
      pincode: String(pincode).trim(),
      country: country ? String(country).trim() : "India",
      addressType: (addressType as "home" | "work" | "other") || "home",
      isDefault: !!isDefault,
    };

    try {
      const existing = await mongoAddresses.findById(id);
      if (!existing || existing.userId !== req.userId) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      if (updatePayload.isDefault) {
        const userAddresses = await mongoAddresses.findByUserId(req.userId);
        for (const addr of userAddresses) {
          if (addr.isDefault && addr.id !== id) {
            await mongoAddresses.update(addr.id, { isDefault: false });
          }
        }
      }

      const updated = await mongoAddresses.update(id, updatePayload);
      res.json({ address: updated });
      return;
    } catch {
      const existing = await db
        .select()
        .from(savedAddressesTable)
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, req.userId)))
        .limit(1);

      if (!existing.length) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      if (updatePayload.isDefault) {
        await db
          .update(savedAddressesTable)
          .set({ isDefault: false })
          .where(eq(savedAddressesTable.userId, req.userId));
      }

      const [updated] = await db
        .update(savedAddressesTable)
        .set(updatePayload)
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, req.userId)))
        .returning();

      res.json({ address: updated });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to update address");
    res.status(500).json({ error: "Failed to update address" });
  }
});

router.delete("/addresses/:id", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;

    try {
      const existing = await mongoAddresses.findById(id);
      if (!existing || existing.userId !== req.userId) {
        res.status(404).json({ error: "Address not found" });
        return;
      }
      await mongoAddresses.delete(id);
      res.json({ success: true });
      return;
    } catch {
      const existing = await db
        .select()
        .from(savedAddressesTable)
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, req.userId)))
        .limit(1);

      if (!existing.length) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      await db
        .delete(savedAddressesTable)
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, req.userId)));

      res.json({ success: true });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to delete address");
    res.status(500).json({ error: "Failed to delete address" });
  }
});

router.patch("/addresses/:id/default", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { id } = req.params;

    try {
      const existing = await mongoAddresses.findById(id);
      if (!existing || existing.userId !== req.userId) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      const userAddresses = await mongoAddresses.findByUserId(req.userId);
      for (const addr of userAddresses) {
        if (addr.isDefault) {
          await mongoAddresses.update(addr.id, { isDefault: false });
        }
      }

      const updated = await mongoAddresses.update(id, { isDefault: true });
      res.json({ address: updated });
      return;
    } catch {
      const existing = await db
        .select()
        .from(savedAddressesTable)
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, req.userId)))
        .limit(1);

      if (!existing.length) {
        res.status(404).json({ error: "Address not found" });
        return;
      }

      await db
        .update(savedAddressesTable)
        .set({ isDefault: false })
        .where(eq(savedAddressesTable.userId, req.userId));

      const [updated] = await db
        .update(savedAddressesTable)
        .set({ isDefault: true })
        .where(and(eq(savedAddressesTable.id, id), eq(savedAddressesTable.userId, req.userId)))
        .returning();

      res.json({ address: updated });
    }
  } catch (err) {
    req.log.error({ err }, "Failed to set default address");
    res.status(500).json({ error: "Failed to set default address" });
  }
});

export default router;
