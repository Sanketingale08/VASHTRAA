import { Router } from "express";
import { db } from "@workspace/db";
import { vendorsTable, productsTable, ordersTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { requireAuth } from "../middlewares/isAuthenticated";
import { requireAdminKey } from "../middlewares/isAdmin";
import { ObjectStorageService } from "../lib/objectStorage";
import { insertAdminNotification } from "../lib/adminNotifications";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { insertSellerNotification } from "../lib/sellerNotifications";
import {
  sendVendorApprovalEmailForVendor,
  sendVendorSuspensionEmailForVendor,
  sendVendorRejectionEmailForVendor,
} from "../lib/transactionalEmail";

const router = Router();

router.get("/vendors", async (req, res) => {
  try {
    // Return only approved vendors, featured ones first, then sorted by rating desc.
    // If no featured vendors exist, all approved vendors are returned (sorted by rating).
    const vendors = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.status, "approved"))
      .orderBy(desc(vendorsTable.featured), desc(vendorsTable.rating), desc(vendorsTable.sareesCount));

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

const objectStorage = new ObjectStorageService();

async function handleSellerRegistration(req: any, res: any) {
  const {
    name, location, bio, gstin, contactEmail, tagline,
    mobile, panNumber, panCardUrl, gstCertUrl,
    bankHolder, bankName, bankAccount, bankIfsc,
    shopStreet, shopCity, shopState, shopPincode,
    termsAccepted,
  } = req.body;

  const missingFields: string[] = [];
  if (!name || !String(name).trim()) missingFields.push("Shop name");
  if (!location || !String(location).trim()) missingFields.push("Location");
  if (!mobile || !String(mobile).trim()) missingFields.push("Mobile number");
  if (!panNumber || !String(panNumber).trim()) missingFields.push("PAN number");
  if (!panCardUrl || !String(panCardUrl).trim()) missingFields.push("PAN card document");
  if (!bankHolder || !String(bankHolder).trim()) missingFields.push("Bank account holder name");
  if (!bankName || !String(bankName).trim()) missingFields.push("Bank name");
  if (!bankAccount || !String(bankAccount).trim()) missingFields.push("Bank account number");
  if (!bankIfsc || !String(bankIfsc).trim()) missingFields.push("IFSC code");
  if (!shopCity || !String(shopCity).trim()) missingFields.push("Shop city");
  if (!shopState || !String(shopState).trim()) missingFields.push("Shop state");
  if (!shopPincode || !String(shopPincode).trim()) missingFields.push("Shop pincode");
  if (!termsAccepted) missingFields.push("Terms acceptance");

  if (missingFields.length > 0) {
    return res.status(400).json({
      error: `Missing required fields: ${missingFields.join(", ")}`,
    });
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
        mobile: String(mobile).trim(),
        panNumber: String(panNumber).trim().toUpperCase(),
        panCardUrl: String(panCardUrl).trim(),
        gstCertUrl: gstCertUrl ? String(gstCertUrl).trim() : null,
        bankHolder: String(bankHolder).trim(),
        bankName: String(bankName).trim(),
        bankAccount: String(bankAccount).trim(),
        bankIfsc: String(bankIfsc).trim().toUpperCase(),
        shopStreet: shopStreet ? String(shopStreet).trim() : null,
        shopCity: String(shopCity).trim(),
        shopState: String(shopState).trim(),
        shopPincode: String(shopPincode).trim(),
        termsAcceptedAt: new Date(),
      })
      .returning();

    const ownerAcl = { owner: req.userId, visibility: "private" as const };
    const aclPromises: Promise<any>[] = [
      objectStorage.trySetObjectEntityAclPolicy(vendor.panCardUrl!, ownerAcl).catch(() => {}),
    ];
    if (vendor.gstCertUrl) {
      aclPromises.push(
        objectStorage.trySetObjectEntityAclPolicy(vendor.gstCertUrl, ownerAcl).catch(() => {})
      );
    }
    await Promise.all(aclPromises);

    await insertAdminNotification({
      type: "new_seller_registration",
      title: "New seller registration",
      body: `"${vendor.name}" has registered as a new seller and is pending review.`,
      metadata: { vendorId: vendor.id },
    });
    await insertAdminNotification({
      type: "kyc_submitted",
      title: "KYC documents submitted",
      body: `"${vendor.name}" has submitted KYC documents for verification.`,
      metadata: { vendorId: vendor.id },
    });

    res.status(201).json({
      id: vendor.id,
      name: vendor.name,
      status: vendor.status,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to create vendor");
    res.status(500).json({ error: "Failed to create vendor account" });
  }
}

router.post("/vendors", requireAuth, handleSellerRegistration);
router.post("/seller/register", requireAuth, handleSellerRegistration);

router.get("/seller/claimable-stores", requireAuth, async (req: any, res: any) => {
  try {
    const existing = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: "You already have a vendor account" });
    }

    const stores = await db
      .select({
        id: vendorsTable.id,
        name: vendorsTable.name,
        location: vendorsTable.location,
        rating: vendorsTable.rating,
        sareesCount: vendorsTable.sareesCount,
        avatar: vendorsTable.avatar,
        bio: vendorsTable.bio,
        tagline: vendorsTable.tagline,
      })
      .from(vendorsTable)
      .where(sql`${vendorsTable.ownerId} IS NULL`)
      .orderBy(vendorsTable.name);

    res.json({ stores });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch claimable stores");
    res.status(500).json({ error: "Failed to fetch claimable stores" });
  }
});

router.post("/seller/claim/:vendorId", requireAuth, async (req: any, res: any) => {
  const { vendorId } = req.params;
  try {
    const existing = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (existing.length > 0) {
      return res.status(409).json({ error: "You already have a vendor account" });
    }

    const vendorExists = await db
      .select({ id: vendorsTable.id })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId))
      .limit(1);

    if (vendorExists.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }

    const updated = await db
      .update(vendorsTable)
      .set({ ownerId: req.userId, status: "pending" })
      .where(sql`${vendorsTable.id} = ${vendorId} AND ${vendorsTable.ownerId} IS NULL`)
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });

    if (updated.length === 0) {
      return res.status(409).json({ error: "This store has already been claimed by another seller" });
    }

    await insertAdminNotification({
      type: "new_seller_registration",
      title: "Store claim submitted",
      body: `A seller has claimed the store "${updated[0].name}" and is pending review.`,
      metadata: { vendorId: updated[0].id },
    });

    res.json({ vendor: updated[0] });
  } catch (err) {
    req.log.error({ err }, "Failed to claim store");
    res.status(500).json({ error: "Failed to claim store" });
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

    const allProducts = await db.select({ id: productsTable.id, vendorId: productsTable.vendorId }).from(productsTable);
    const productToVendor = new Map(allProducts.filter(p => p.vendorId).map(p => [p.id, p.vendorId as string]));
    const allOrders = await db.select({ items: ordersTable.items, status: ordersTable.status }).from(ordersTable);

    const vendorRevenue: Record<string, number> = {};
    const vendorOrders: Record<string, number> = {};
    for (const order of allOrders) {
      const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
      if (!Array.isArray(items)) continue;
      const touched = new Set<string>();
      for (const item of items) {
        const vendorId = productToVendor.get(item.productId);
        if (!vendorId) continue;
        touched.add(vendorId);
        if (!["cancelled", "returned"].includes(order.status)) {
          vendorRevenue[vendorId] = (vendorRevenue[vendorId] ?? 0) + item.price * (item.quantity ?? 1);
        }
      }
      for (const vendorId of touched) {
        vendorOrders[vendorId] = (vendorOrders[vendorId] ?? 0) + 1;
      }
    }

    res.json({
      vendors: vendors.map((v) => ({
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
        kycVerified: v.kycVerified,
        kycResubmissionRequested: v.kycResubmissionRequested,
        featured: v.featured,
        revenue: vendorRevenue[v.id] ?? 0,
        totalOrders: vendorOrders[v.id] ?? 0,
      })),
    });
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
      .returning({
        id: vendorsTable.id,
        name: vendorsTable.name,
        status: vendorsTable.status,
        ownerId: vendorsTable.ownerId,
        contactEmail: vendorsTable.contactEmail,
      });

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    await insertSellerNotification({
      vendorId: updated.id,
      type: "store_approved",
      title: "Your store has been approved",
      body: `Congratulations! Your store "${updated.name}" has been approved. You can now start listing your products.`,
      metadata: { vendorId: updated.id },
    });

    sendVendorApprovalEmailForVendor({
      vendorId: updated.id,
      vendorName: updated.name,
      contactEmail: updated.contactEmail,
      ownerId: updated.ownerId,
    }).catch((err) => req.log.warn({ err, vendorId: updated.id }, "Failed to send vendor approval email"));

    writeAuditLog({ action: "vendor_approved", module: "Vendors", details: { vendorId: updated.id, vendorName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ vendor: { id: updated.id, name: updated.name, status: updated.status } });
  } catch (err) {
    req.log.error({ err }, "Failed to approve vendor");
    res.status(500).json({ error: "Failed to approve vendor" });
  }
});

router.post("/admin/vendors/:id/suspend", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" })
      .where(eq(vendorsTable.id, id))
      .returning({
        id: vendorsTable.id,
        name: vendorsTable.name,
        status: vendorsTable.status,
        ownerId: vendorsTable.ownerId,
        contactEmail: vendorsTable.contactEmail,
      });

    if (!updated) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    sendVendorSuspensionEmailForVendor({
      vendorId: updated.id,
      vendorName: updated.name,
      contactEmail: updated.contactEmail,
      ownerId: updated.ownerId,
      reason: reason ? String(reason).trim() : undefined,
    }).catch((err) => req.log.warn({ err, vendorId: updated.id }, "Failed to send vendor suspension email"));

    writeAuditLog({ action: "vendor_suspended", module: "Vendors", details: { vendorId: updated.id, vendorName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    res.json({ vendor: { id: updated.id, name: updated.name, status: updated.status } });
  } catch (err) {
    req.log.error({ err }, "Failed to suspend vendor");
    res.status(500).json({ error: "Failed to suspend vendor" });
  }
});

router.post("/admin/vendors/:id/reject", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" as any })
      .where(eq(vendorsTable.id, id))
      .returning({
        id: vendorsTable.id,
        name: vendorsTable.name,
        status: vendorsTable.status,
        ownerId: vendorsTable.ownerId,
        contactEmail: vendorsTable.contactEmail,
      });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });

    writeAuditLog({ action: "vendor_rejected", module: "Vendors", details: { vendorId: updated.id, vendorName: updated.name }, ipAddress: getIp(req) }).catch(() => {});

    sendVendorRejectionEmailForVendor({
      vendorId: updated.id,
      vendorName: updated.name,
      contactEmail: updated.contactEmail,
      ownerId: updated.ownerId,
      reason: reason ? String(reason).trim() : undefined,
    }).catch((err) => req.log.warn({ err, vendorId: updated.id }, "Failed to send vendor rejection email"));

    res.json({ vendor: { id: updated.id, name: updated.name, status: updated.status } });
  } catch (err) {
    req.log.error({ err }, "Failed to reject vendor");
    res.status(500).json({ error: "Failed to reject vendor" });
  }
});

router.post("/admin/vendors/:id/activate", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "approved" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to activate vendor");
    res.status(500).json({ error: "Failed to activate vendor" });
  }
});

router.post("/admin/vendors/:id/deactivate", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ status: "suspended" })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to deactivate vendor");
    res.status(500).json({ error: "Failed to deactivate vendor" });
  }
});

router.post("/admin/vendors/:id/feature", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ featured: true })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, featured: vendorsTable.featured });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to feature vendor");
    res.status(500).json({ error: "Failed to feature vendor" });
  }
});

router.post("/admin/vendors/:id/unfeature", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ featured: false })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, featured: vendorsTable.featured });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to unfeature vendor");
    res.status(500).json({ error: "Failed to unfeature vendor" });
  }
});

router.post("/admin/vendors/:id/assign-owner", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { ownerId } = req.body ?? {};

  if (!ownerId || typeof ownerId !== "string" || !ownerId.trim()) {
    return res.status(400).json({ error: "ownerId is required" });
  }

  try {
    const rows = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);

    if (rows.length === 0) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const [updated] = await db
      .update(vendorsTable)
      .set({ ownerId: ownerId.trim() })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status, ownerId: vendorsTable.ownerId });

    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to assign owner to vendor");
    res.status(500).json({ error: "Failed to assign owner" });
  }
});

router.post("/admin/vendors/:id/verify-kyc", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const [updated] = await db
      .update(vendorsTable)
      .set({ kycVerified: true, kycResubmissionRequested: false })
      .where(eq(vendorsTable.id, id))
      .returning({ id: vendorsTable.id, name: vendorsTable.name, status: vendorsTable.status, kycVerified: vendorsTable.kycVerified });
    if (!updated) return res.status(404).json({ error: "Vendor not found" });
    res.json({ vendor: updated, kycVerified: true });
  } catch (err) {
    req.log.error({ err }, "Failed to verify KYC");
    res.status(500).json({ error: "Failed to verify KYC" });
  }
});

router.patch("/admin/vendors/:id/kyc", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { action, reason } = req.body ?? {};

  if (!["verify", "request_resubmission"].includes(action)) {
    return res.status(400).json({ error: "Invalid action. Must be 'verify' or 'request_resubmission'." });
  }

  try {
    const [vendor] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id))
      .limit(1);
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const isVerify = action === "verify";
    const [updated] = await db
      .update(vendorsTable)
      .set({
        kycVerified: isVerify,
        kycResubmissionRequested: !isVerify,
      })
      .where(eq(vendorsTable.id, id))
      .returning({
        id: vendorsTable.id,
        name: vendorsTable.name,
        status: vendorsTable.status,
        kycVerified: vendorsTable.kycVerified,
        kycResubmissionRequested: vendorsTable.kycResubmissionRequested,
      });

    if (isVerify) {
      await insertSellerNotification({
        vendorId: id,
        type: "kyc_verified",
        title: "KYC verified",
        body: "Your KYC documents have been verified by our admin team.",
        metadata: { vendorId: id },
      });
    } else {
      await insertSellerNotification({
        vendorId: id,
        type: "kyc_resubmission_requested",
        title: "KYC re-submission requested",
        body: reason
          ? `Please re-submit your KYC documents. Reason: ${reason}`
          : "Please re-submit your KYC documents for verification.",
        metadata: { vendorId: id, reason: reason ?? null },
      });
    }

    res.json({ vendor: updated });
  } catch (err) {
    req.log.error({ err }, "Failed to update KYC status");
    res.status(500).json({ error: "Failed to update KYC status" });
  }
});

router.post("/admin/vendors/:id/payouts/release", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { amount } = req.body ?? {};
  try {
    const [vendor] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    await insertSellerNotification({
      vendorId: id,
      type: "settlement_released",
      title: "Settlement released",
      body: amount
        ? `A settlement of ₹${amount} has been released to your account.`
        : "Your pending settlement has been released.",
      metadata: { vendorId: id, amount: amount ?? null },
    });

    res.json({ vendor, released: true });
  } catch (err) {
    req.log.error({ err }, "Failed to release settlement");
    res.status(500).json({ error: "Failed to release settlement" });
  }
});

router.post("/admin/vendors/:id/payouts/payout", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { amount, success } = req.body ?? {};
  try {
    const [vendor] = await db
      .select({ id: vendorsTable.id, name: vendorsTable.name })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, id));
    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    if (success === false) {
      await insertAdminNotification({
        type: "payout_failed",
        title: "Payout failed",
        body: `Payout to ${vendor.name} failed${amount ? ` (₹${amount})` : ""}.`,
        metadata: { vendorId: id, amount: amount ?? null },
      });
    } else {
      await insertSellerNotification({
        vendorId: id,
        type: "payout_successful",
        title: "Payout successful",
        body: amount
          ? `₹${amount} has been paid out to your linked bank account.`
          : "Your payout has been processed successfully.",
        metadata: { vendorId: id, amount: amount ?? null },
      });
    }

    res.json({ vendor, success: success !== false });
  } catch (err) {
    req.log.error({ err }, "Failed to process payout");
    res.status(500).json({ error: "Failed to process payout" });
  }
});

async function computeVendorRevenue(): Promise<Record<string, number>> {
  const allProducts = await db
    .select({ id: productsTable.id, vendorId: productsTable.vendorId })
    .from(productsTable);
  const productToVendor = new Map(
    allProducts.filter(p => p.vendorId).map(p => [p.id, p.vendorId as string])
  );
  const allOrders = await db
    .select({ items: ordersTable.items, status: ordersTable.status })
    .from(ordersTable);

  const vendorRevenue: Record<string, number> = {};
  for (const order of allOrders) {
    if (["cancelled", "returned"].includes(order.status)) continue;
    const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const vendorId = productToVendor.get(item.productId);
      if (vendorId) {
        vendorRevenue[vendorId] = (vendorRevenue[vendorId] ?? 0) + item.price * (item.quantity ?? 1);
      }
    }
  }
  return vendorRevenue;
}

router.get("/admin/vendors/:id", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const rows = await db.select().from(vendorsTable).where(eq(vendorsTable.id, id)).limit(1);
    if (rows.length === 0) return res.status(404).json({ error: "Vendor not found" });
    const vendor = rows[0];

    const vendorProducts = await db
      .select({ id: productsTable.id, active: productsTable.active })
      .from(productsTable)
      .where(eq(productsTable.vendorId as any, id));

    const productIds = new Set(vendorProducts.map(p => p.id));
    const allOrders = await db.select().from(ordersTable);

    const statusBreakdown: Record<string, number> = {};
    let totalRevenue = 0;
    const monthlyRevenue: Record<string, number> = {};

    for (const order of allOrders) {
      const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
      if (!Array.isArray(items)) continue;
      const vendorItems = items.filter(i => productIds.has(i.productId));
      if (vendorItems.length === 0) continue;

      statusBreakdown[order.status] = (statusBreakdown[order.status] ?? 0) + 1;
      if (!["cancelled", "returned"].includes(order.status)) {
        const itemRevenue = vendorItems.reduce((sum, i) => sum + i.price * (i.quantity ?? 1), 0);
        totalRevenue += itemRevenue;
        const monthKey = new Date(order.createdAt).toISOString().slice(0, 7);
        monthlyRevenue[monthKey] = (monthlyRevenue[monthKey] ?? 0) + itemRevenue;
      }
    }

    const COMMISSION_RATE = 0.10;
    const sortedMonths = Object.keys(monthlyRevenue).sort().slice(-6);

    res.json({
      id: vendor.id,
      name: vendor.name,
      location: vendor.location,
      rating: vendor.rating,
      sareesCount: vendor.sareesCount,
      avatar: vendor.avatar,
      bio: vendor.bio ?? null,
      tagline: vendor.tagline ?? null,
      contactEmail: vendor.contactEmail ?? null,
      gstin: vendor.gstin ?? null,
      status: vendor.status,
      ownerId: vendor.ownerId ?? null,
      kycVerified: vendor.kycVerified,
      kycResubmissionRequested: vendor.kycResubmissionRequested,
      mobile: vendor.mobile ?? null,
      panNumber: vendor.panNumber ?? null,
      panCardUrl: vendor.panCardUrl ?? null,
      gstCertUrl: vendor.gstCertUrl ?? null,
      bankHolder: vendor.bankHolder ?? null,
      bankName: vendor.bankName ?? null,
      bankAccount: vendor.bankAccount ?? null,
      bankIfsc: vendor.bankIfsc ?? null,
      shopStreet: vendor.shopStreet ?? null,
      shopCity: vendor.shopCity ?? null,
      shopState: vendor.shopState ?? null,
      shopPincode: vendor.shopPincode ?? null,
      termsAcceptedAt: vendor.termsAcceptedAt ?? null,
      totalProducts: vendorProducts.length,
      activeProducts: vendorProducts.filter(p => p.active).length,
      totalRevenue,
      commissionEarned: Math.round(totalRevenue * COMMISSION_RATE),
      statusBreakdown,
      monthlyRevenue: sortedMonths.map(m => ({ month: m, revenue: monthlyRevenue[m] })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin vendor detail");
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

router.get("/admin/stats", requireAdminKey, async (req: any, res: any) => {
  try {
    const [orderStats] = await db.select({
      totalOrders: sql<number>`count(*)::int`,
      totalRevenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::bigint`,
      totalCustomers: sql<number>`count(distinct ${ordersTable.userId})::int`,
      deliveredOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'delivered')::int`,
      cancelledOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'cancelled')::int`,
      returnedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'returned')::int`,
      confirmedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'confirmed')::int`,
      lateAcceptanceOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'confirmed' and ${ordersTable.createdAt} < now() - interval '24 hours')::int`,
      dispatchedOrders: sql<number>`count(*) filter (where ${ordersTable.status} = 'dispatched')::int`,
      refundedRevenue: sql<number>`coalesce(sum(${ordersTable.total}) filter (where ${ordersTable.refundStatus} = 'processed'), 0)::bigint`,
    }).from(ordersTable);

    const [productStats] = await db.select({
      totalProducts: sql<number>`count(*)::int`,
    }).from(productsTable);

    const [vendorStats] = await db.select({
      totalVendors: sql<number>`count(*)::int`,
      approvedVendors: sql<number>`count(*) filter (where ${vendorsTable.status} = 'approved')::int`,
      pendingVendors: sql<number>`count(*) filter (where ${vendorsTable.status} = 'pending')::int`,
    }).from(vendorsTable);

    const dailyRevenue = await db.select({
      date: sql<string>`date(${ordersTable.createdAt})::text`,
      revenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::bigint`,
      orderCount: sql<number>`count(*)::int`,
    }).from(ordersTable)
      .where(sql`${ordersTable.createdAt} >= now() - interval '30 days'`)
      .groupBy(sql`date(${ordersTable.createdAt})`)
      .orderBy(sql`date(${ordersTable.createdAt})`);

    const totalRevNum = Number(orderStats.totalRevenue);
    const approvedVendors = Number(vendorStats.approvedVendors);

    const [prevPeriodStats] = await db.select({
      prevRevenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::bigint`,
    }).from(ordersTable)
      .where(sql`${ordersTable.createdAt} >= now() - interval '60 days' AND ${ordersTable.createdAt} < now() - interval '30 days'`);

    const prevRevNum = Number(prevPeriodStats.prevRevenue);
    const growthPct = prevRevNum > 0
      ? Math.round(((totalRevNum - prevRevNum) / prevRevNum) * 100)
      : totalRevNum > 0 ? 100 : 0;

    res.json({
      totalOrders: Number(orderStats.totalOrders),
      totalRevenue: totalRevNum,
      totalCustomers: Number(orderStats.totalCustomers),
      deliveredOrders: Number(orderStats.deliveredOrders),
      cancelledOrders: Number(orderStats.cancelledOrders),
      returnedOrders: Number(orderStats.returnedOrders),
      confirmedOrders: Number(orderStats.confirmedOrders),
      lateAcceptanceOrders: Number(orderStats.lateAcceptanceOrders),
      dispatchedOrders: Number(orderStats.dispatchedOrders),
      refundedRevenue: Number(orderStats.refundedRevenue),
      totalProducts: Number(productStats.totalProducts),
      totalVendors: Number(vendorStats.totalVendors),
      approvedVendors,
      activeVendors: approvedVendors,
      pendingVendors: Number(vendorStats.pendingVendors),
      growthPct,
      dailyRevenue: dailyRevenue.map(r => ({
        date: r.date,
        revenue: Number(r.revenue),
        orders: Number(r.orderCount),
      })),
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch admin stats");
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

export default router;
