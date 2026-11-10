import { Router } from "express";
import { db, mongoSellers, mongoVendors, mongoProducts, mongoOrders, mongoR2Assets, mongoUsers, getNextSequenceValue, formatVendorId, getCanonicalSellerId, isInternalRawId } from "@workspace/db";
import { vendorsTable, productsTable, ordersTable } from "@workspace/db";
import { eq, sql, desc, and, or } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { requireAuth } from "../middlewares/isAuthenticated";
import { requireAdminKey } from "../middlewares/isAdmin";
import { ObjectStorageService } from "../lib/objectStorage";
import { insertAdminNotification } from "../lib/adminNotifications";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { insertSellerNotification } from "../lib/sellerNotifications";
import {
  buildVendorAddressUpdates,
  toNullableText,
} from "../lib/vendorAddress";
import {
  sendVendorApprovalEmailForVendor,
  sendVendorSuspensionEmailForVendor,
  sendVendorRejectionEmailForVendor,
  sendVendorReactivationEmailForVendor,
} from "../lib/transactionalEmail";
import { consumeSellerEmailVerification } from "../lib/sellerVerification";
import { hashPassword } from "../lib/passwords";
import { verifyAccessToken } from "../lib/jwt";
import { syncSellerPickupToShiprocket } from "../services/shipping/shiprocketPickupService";
import { filterRealtimeOrders } from "../lib/orderFilter";
import { getItemBasePrice, roundCurrency } from "../lib/vendorAnalytics";
import { emitVendorEvent, emitAnalyticsEvent } from "../lib/socket";
import { authRateLimiter } from "../middlewares/rateLimiter";
import { invalidateApprovedVendorDataCache } from "../lib/vendorValidation";
import { revokeAllUserSessions } from "../lib/sessions";

const router = Router();

async function findVendorAcrossDatabases(id: string): Promise<{ mSeller: any; pgRow: any }> {
  const cleanId = String(id || "").trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleanId);
  const isEmail = cleanId.includes("@");

  let mSeller: any = null;
  try {
    if (mongoSellers) {
      if (isEmail) {
        mSeller = await mongoSellers.findByEmail(cleanId);
      }
      if (!mSeller) {
        mSeller = (await mongoSellers.findById?.(cleanId)) ||
                  (await mongoSellers.findBySellerId?.(cleanId)) ||
                  (await mongoSellers.findByVendorId?.(cleanId)) ||
                  (await mongoSellers.findByOwnerId?.(cleanId));
      }
    }
  } catch {}

  let pgRow: any = null;
  try {
    const conditions: any[] = [];
    if (isUuid) {
      conditions.push(eq(vendorsTable.id, cleanId));
    }
    conditions.push(eq(vendorsTable.ownerId, cleanId));
    if ((vendorsTable as any).vendorId) {
      conditions.push(eq((vendorsTable as any).vendorId, cleanId));
    }
    if (isEmail && vendorsTable.contactEmail) {
      conditions.push(eq(vendorsTable.contactEmail, cleanId));
    }
    if (mSeller?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mSeller.id)) {
      conditions.push(eq(vendorsTable.id, mSeller.id));
    }
    if (mSeller?.ownerId) {
      conditions.push(eq(vendorsTable.ownerId, mSeller.ownerId));
    }
    if (mSeller?.email && vendorsTable.contactEmail) {
      conditions.push(eq(vendorsTable.contactEmail, mSeller.email));
    }
    if (mSeller?.contactEmail && vendorsTable.contactEmail) {
      conditions.push(eq(vendorsTable.contactEmail, mSeller.contactEmail));
    }

    if (conditions.length > 0) {
      const rows = await db
        .select()
        .from(vendorsTable)
        .where(or(...conditions))
        .limit(1);
      if (rows && rows.length > 0) {
        pgRow = rows[0];
      }
    }
  } catch {}

  if (!mSeller && pgRow && mongoSellers) {
    try {
      mSeller = (await mongoSellers.findById?.(pgRow.id)) ||
                (pgRow.ownerId ? await mongoSellers.findByOwnerId?.(pgRow.ownerId) : null) ||
                (pgRow.contactEmail ? await mongoSellers.findByEmail?.(pgRow.contactEmail) : null);
    } catch {}
  }

  return { mSeller, pgRow };
}


function optionalAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization || req.headers.Authorization;
  const tokenHeader = (req.headers["x-auth-token"] || req.headers["x-seller-token"]) as string;
  let token = "";

  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (tokenHeader) {
    token = String(tokenHeader).trim();
  }

  if (token) {
    try {
      const jwtPayload = verifyAccessToken(token);
      if (jwtPayload) {
        req.userId = jwtPayload.sub;
        req.userRole = jwtPayload.role;
      }
    } catch {}
  }
  next();
}

router.get("/vendors", async (req, res) => {
  try {
    let vendors: any[] = [];
    try {
      vendors = await db
        .select()
        .from(vendorsTable)
        .where(eq(vendorsTable.status, "approved"))
        .orderBy(desc(vendorsTable.featured), desc(vendorsTable.rating), desc(vendorsTable.sareesCount));
    } catch {}

    if (!vendors || vendors.length === 0) {
      const sellers = await mongoSellers.findMany({ status: { $in: ["approved", "active"] } }).catch(() => []);
      vendors = sellers.map((s) => ({
        id: s.vendorId || s.id || s.sellerId,
        name: s.shopName || s.name || s.sellerName || "VASTRAA Artisan",
        location: s.shopCity ? `${s.shopCity}, ${s.shopState || "India"}` : (s.location || "India"),
        rating: s.rating ?? 4.8,
        sareesCount: s.productsCount ?? s.sareesCount ?? 0,
        avatar: s.avatar || "/images/artisan-1.png",
        bio: s.bio ?? null,
        tagline: s.tagline ?? null,
      }));
    }

    const countMap = new Map<string, number>();
    try {
      const activeCounts = await db
        .select({
          vendorId: productsTable.vendorId,
          count: sql<number>`count(*)`.mapWith(Number),
        })
        .from(productsTable)
        .where(and(eq(productsTable.active, true), eq(productsTable.status, "approved")))
        .groupBy(productsTable.vendorId);

      for (const c of activeCounts) {
        if (c.vendorId) countMap.set(c.vendorId, c.count);
      }
    } catch {}

    if (countMap.size === 0) {
      try {
        const mProducts = await mongoProducts.findMany(
          { active: { $ne: false }, status: "approved" },
          { projection: { vendorId: 1, sellerId: 1 } }
        ).catch(() => []);
        for (const p of mProducts) {
          const vId = p.vendorId || p.sellerId;
          if (vId) countMap.set(vId, (countMap.get(vId) || 0) + 1);
        }
      } catch {}
    }

    res.json(vendors.map((v) => ({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: countMap.get(v.id) ?? v.sareesCount ?? 0,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
    })));
  } catch (err) {
    req.log?.error({ err }, "Failed to list vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.get("/vendors/me", requireAuth, async (req: any, res: any) => {
  try {
    let v: any = null;
    const rows = await db
      .select()
      .from(vendorsTable)
      .where(eq(vendorsTable.ownerId, req.userId))
      .limit(1);

    if (rows.length > 0) {
      v = rows[0];
    } else {
      v = (await mongoSellers.findByOwnerId(req.userId)) ||
          (await mongoSellers.findById(req.userId)) ||
          (await mongoSellers.findBySellerId(req.userId)) ||
          (await mongoSellers.findByVendorId(req.userId)) ||
          (req.userEmail ? await mongoSellers.findByEmail(req.userEmail) : null);
    }

    if (!v) {
      return res.status(404).json({ error: "No vendor account found" });
    }

    if (v.status === "pending") {
      return res.status(403).json({ error: "Your shop registration is pending Super Admin approval.", code: "VENDOR_PENDING", status: v.status, statusReason: v.statusReason ?? null });
    }

    if (v.status === "rejected" || v.status === "declined" || v.approvalStatus === "rejected" || v.approvalStatus === "declined") {
      return res.status(403).json({ error: v.statusReason ? `Your shop registration was rejected: ${v.statusReason}` : "Your shop registration has been rejected by Super Admin.", code: "VENDOR_REJECTED", status: v.status, statusReason: v.statusReason ?? null });
    }

    if (v.status === "suspended") {
      return res.status(403).json({
        error: "Your account has been suspended.",
        code: "VENDOR_SUSPENDED",
        status: v.status,
        statusReason: v.statusReason ?? null,
      });
    }

    res.json({
      id: v.id,
      name: v.name,
      location: v.location,
      rating: v.rating,
      sareesCount: v.sareesCount,
      avatar: v.avatar,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
      contactEmail: v.contactEmail ?? v.email ?? null,
      gstin: v.gstin ?? null,
      mobile: v.mobile ?? null,
      status: v.status,
      statusReason: v.statusReason ?? null,
      ownerId: v.ownerId,
      vendorId: v.vendorId ?? null,
      reactivationWelcomePending: v.reactivationWelcomePending ?? false,
      shopStreet: v.shopStreet ?? null,
      shopAddressLine2: v.shopAddressLine2 ?? null,
      shopLandmark: v.shopLandmark ?? null,
      shopCity: v.shopCity ?? null,
      shopState: v.shopState ?? null,
      shopPincode: v.shopPincode ?? null,
      shopCountry: v.shopCountry ?? null,
      pickupSameAsShop: v.pickupSameAsShop ?? true,
      pickupLocationName: v.pickupLocationName ?? null,
      pickupAddressLine1: v.pickupAddressLine1 ?? null,
      pickupAddressLine2: v.pickupAddressLine2 ?? null,
      pickupLandmark: v.pickupLandmark ?? null,
      pickupCity: v.pickupCity ?? null,
      pickupState: v.pickupState ?? null,
      pickupPincode: v.pickupPincode ?? null,
      pickupCountry: v.pickupCountry ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor profile");
    res.status(500).json({ error: "Failed to fetch vendor profile" });
  }
});

router.get("/vendors/:id", async (req: any, res: any) => {
  const { id } = req.params;
  try {
    let v: any = null;
    try {
      const rows = await db
        .select()
        .from(vendorsTable)
        .where(or(eq(vendorsTable.id, id), eq(vendorsTable.vendorId, id), eq(vendorsTable.ownerId, id)))
        .limit(1);
      if (rows.length > 0) v = rows[0];
    } catch {}

    if (!v) {
      try {
        v = (await mongoVendors.findById(id)) ||
            (await mongoVendors.findByVendorId(id)) ||
            (await mongoSellers.findBySellerId(id)) ||
            (await mongoVendors.findByOwnerId(id));
      } catch {}
    }

    if (!v) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    let activeCount = v.sareesCount ?? 0;
    try {
      const prodCountRes = await db
        .select({ count: sql<number>`count(*)`.mapWith(Number) })
        .from(productsTable)
        .where(
          and(
            eq(productsTable.vendorId, v.id || v.vendorId || id),
            eq(productsTable.active, true),
            eq(productsTable.status, "approved")
          )
        );
      if (prodCountRes[0]?.count !== undefined) activeCount = prodCountRes[0].count;
    } catch {}

    const canonicalSellerId = getCanonicalSellerId(v);

    res.json({
      id: v.id || v.vendorId || id,
      vendorId: canonicalSellerId || v.vendorId || v.id || id,
      sellerId: canonicalSellerId || v.sellerId || v.vendorId || v.id || id,
      name: v.shopName || v.name,
      shopName: v.shopName || v.name,
      location: v.location,
      rating: v.rating ?? 4.8,
      sareesCount: activeCount,
      avatar: v.avatar ?? null,
      bio: v.bio ?? null,
      tagline: v.tagline ?? null,
      contactEmail: v.contactEmail ?? v.email ?? null,
      email: v.email ?? v.contactEmail ?? null,
      gstin: v.gstin ?? null,
      mobile: v.mobile ?? null,
      status: v.status || "approved",
      shopStreet: v.shopStreet ?? null,
      shopAddressLine2: v.shopAddressLine2 ?? null,
      shopLandmark: v.shopLandmark ?? null,
      shopCity: v.shopCity ?? null,
      shopState: v.shopState ?? null,
      shopPincode: v.shopPincode ?? null,
      shopCountry: v.shopCountry ?? null,
      pickupSameAsShop: v.pickupSameAsShop ?? false,
      pickupLocationName: v.pickupLocationName ?? null,
      pickupAddressLine1: v.pickupAddressLine1 ?? null,
      pickupAddressLine2: v.pickupAddressLine2 ?? null,
      pickupLandmark: v.pickupLandmark ?? null,
      pickupCity: v.pickupCity ?? null,
      pickupState: v.pickupState ?? null,
      pickupPincode: v.pickupPincode ?? null,
      pickupCountry: v.pickupCountry ?? null,
    });
  } catch (err) {
    req.log.error({ err }, "Failed to fetch vendor");
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

const objectStorage = new ObjectStorageService();

async function handleSellerRegistration(req: any, res: any) {
  const {
    name, shopName, location, bio, gstin, contactEmail, tagline,
    mobile, panNumber, panCardUrl, gstCertUrl,
    bankHolder, bankName, bankAccount, bankIfsc,
    shopStreet, shopCity, shopState, shopPincode,
    termsAccepted, email, password,
  } = req.body;

  const officialShopName = String(shopName || name || "").trim();

  const missingFields: string[] = [];
  if (!officialShopName) missingFields.push("Shop name");
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
    const regEmail = (email || "").trim().toLowerCase();
    const shopContactEmail = (contactEmail || "").trim().toLowerCase();
    const effectiveEmail = regEmail || shopContactEmail;
    if (!effectiveEmail || !/\S+@\S+\.\S+/.test(effectiveEmail)) {
      return res.status(400).json({ error: "A valid email address is required for seller registration." });
    }

    // Hash password securely if provided during registration
    const passwordHash = password && typeof password === "string" && password.trim()
      ? hashPassword(password.trim())
      : undefined;

    let existingUser: any = null;
    try {
      existingUser = (await mongoUsers.findByEmail(effectiveEmail)) || (regEmail ? await mongoUsers.findByEmail(regEmail) : null);
    } catch {}

    // 1. Check existing vendor account strictly by target registration email and matched seller owner ID
    let existing: any[] = [];
    try {
      const conditions: any[] = [];
      if (effectiveEmail) {
        conditions.push(eq(vendorsTable.contactEmail, effectiveEmail));
        conditions.push(sql`lower(${vendorsTable.contactEmail}) = ${effectiveEmail.toLowerCase()}`);
      }
      if (regEmail && regEmail !== effectiveEmail) {
        conditions.push(eq(vendorsTable.contactEmail, regEmail));
        conditions.push(sql`lower(${vendorsTable.contactEmail}) = ${regEmail.toLowerCase()}`);
      }
      if (existingUser?.id) {
        conditions.push(eq(vendorsTable.ownerId, existingUser.id));
      }
      if (conditions.length > 0) {
        existing = await db
          .select({ id: vendorsTable.id })
          .from(vendorsTable)
          .where(or(...conditions))
          .limit(1);
      }
    } catch (e) {
      req.log?.warn({ err: e }, "Failed to query vendorsTable from Postgres");
    }

    if (existing.length > 0) {
      return res.status(409).json({ error: "A vendor account with this email address already exists" });
    }

    let mExisting: any = null;
    try {
      mExisting = (effectiveEmail ? await mongoSellers.findByEmail(effectiveEmail) : null) ||
        (regEmail ? await mongoSellers.findByEmail(regEmail) : null) ||
        (existingUser?.id ? await mongoSellers.findByOwnerId(existingUser.id) : null);
    } catch {}

    if (mExisting) {
      return res.status(409).json({ error: "A vendor account with this email address already exists" });
    }

  // 2. Resolve userId: use existingUser.id if email matches existing user, or generate brand new seller userId
  let userId: string;
  if (existingUser) {
    userId = existingUser.id;
    const userUpdates: Record<string, any> = { role: "seller", updatedAt: new Date() };
    if (passwordHash) {
      userUpdates.passwordHash = passwordHash;
    }
    if (mobile && !existingUser.phone) {
      userUpdates.phone = String(mobile).trim();
    }
    try {
      await mongoUsers.update(existingUser.id, userUpdates);
    } catch (uErr) {
      req.log?.warn({ err: uErr }, "Failed to update mongoUsers during seller registration");
    }
  } else {
    // Create seller user record in mongoUsers with brand new unique user ID
    userId = `usr_seller_${crypto.randomUUID().substring(0, 8)}`;
    try {
      await mongoUsers.insert({
        id: userId,
        name: String(name).trim(),
        email: regEmail || effectiveEmail,
        passwordHash: passwordHash || "",
        role: "seller",
        phone: String(mobile || "").trim(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (uErr) {
      req.log?.warn({ err: uErr }, "Failed to insert mongoUsers during seller registration");
    }
  }

    // 2. Generate formatted vendorId upon registration
    let generatedVendorId: string | undefined = undefined;
    try {
      const seq = await getNextSequenceValue("vendor_id");
      generatedVendorId = formatVendorId(seq);
    } catch {
      generatedVendorId = `TDV${Math.floor(100000 + Math.random() * 900000)}`;
    }

    const vendorValues = {
      name: officialShopName,
      location: String(location).trim(),
      bio: bio ? String(bio).trim() : null,
      gstin: gstin ? String(gstin).trim().toUpperCase() : null,
      contactEmail: shopContactEmail || effectiveEmail || null,
      tagline: tagline ? String(tagline).trim() : null,
      ownerId: userId,
      status: "pending" as any,
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
      pickupSameAsShop: req.body.pickupSameAsShop !== undefined ? Boolean(req.body.pickupSameAsShop) : true,
      pickupAddressLine1: (req.body.pickupSameAsShop !== false)
        ? (shopStreet ? String(shopStreet).trim() : null)
        : (req.body.pickupAddressLine1 ? String(req.body.pickupAddressLine1).trim() : (shopStreet ? String(shopStreet).trim() : null)),
      pickupAddressLine2: (req.body.pickupSameAsShop !== false)
        ? (req.body.shopAddressLine2 ? String(req.body.shopAddressLine2).trim() : null)
        : (req.body.pickupAddressLine2 ? String(req.body.pickupAddressLine2).trim() : null),
      pickupCity: (req.body.pickupSameAsShop !== false)
        ? String(shopCity).trim()
        : (req.body.pickupCity ? String(req.body.pickupCity).trim() : String(shopCity).trim()),
      pickupState: (req.body.pickupSameAsShop !== false)
        ? String(shopState).trim()
        : (req.body.pickupState ? String(req.body.pickupState).trim() : String(shopState).trim()),
      pickupPincode: (req.body.pickupSameAsShop !== false)
        ? String(shopPincode).trim()
        : (req.body.pickupPincode ? String(req.body.pickupPincode).trim() : String(shopPincode).trim()),
      pickupCountry: "India",
      vendorId: generatedVendorId,
      termsAcceptedAt: new Date(),
      createdAt: new Date(),
    };

    let vendor: any = null;
    try {
      const inserted = await db
        .insert(vendorsTable)
        .values(vendorValues)
        .returning();
      if (inserted && inserted.length > 0) {
        vendor = inserted[0];
      }
    } catch (dbErr) {
      req.log?.warn({ err: dbErr }, "Postgres vendor insert failed, falling back to Mongo/in-memory");
    }

    // Fallback if Postgres return was empty or failed
    if (!vendor || !vendor.id) {
      const fallbackId = crypto.randomUUID();
      vendor = {
        id: fallbackId,
        ...vendorValues,
      };
    }

    const assignedVendorId = vendor.vendorId || generatedVendorId || vendor.id;

    // 3. Sync to MongoDB sellers collection (safely isolated)
    const storedPasswordHash = passwordHash || existingUser?.passwordHash || "";
    try {
      await mongoSellers.insert({
        id: vendor.id,
        name: vendor.name || vendorValues.name,
        sellerName: vendor.name || vendorValues.name,
        shopName: vendor.name || vendorValues.name,
        email: regEmail || effectiveEmail,
        contactEmail: shopContactEmail || regEmail || effectiveEmail,
        mobile: vendor.mobile || "",
        location: vendor.location,
        passwordHash: storedPasswordHash,
        status: "pending",
        approvalStatus: "pending",
        ownerId: userId,
        sellerId: assignedVendorId,
        vendorId: assignedVendorId,
        gstin: vendor.gstin,
        panNumber: vendor.panNumber,
        panCardUrl: vendor.panCardUrl,
        gstCertUrl: vendor.gstCertUrl,
        bankHolder: vendor.bankHolder,
        bankName: vendor.bankName,
        bankAccount: vendor.bankAccount,
        bankIfsc: vendor.bankIfsc,
        shopStreet: vendor.shopStreet,
        shopCity: vendor.shopCity,
        shopState: vendor.shopState,
        shopPincode: vendor.shopPincode,
        pickupSameAsShop: vendorValues.pickupSameAsShop,
        pickupAddressLine1: vendorValues.pickupAddressLine1,
        pickupAddressLine2: vendorValues.pickupAddressLine2,
        pickupCity: vendorValues.pickupCity,
        pickupState: vendorValues.pickupState,
        pickupPincode: vendorValues.pickupPincode,
        pickupCountry: vendorValues.pickupCountry,
        termsAcceptedAt: vendor.termsAcceptedAt,
        createdAt: vendor.createdAt || new Date(),
        updatedAt: new Date(),
      });
    } catch (mErr) {
      req.log?.warn({ err: mErr }, "Failed to sync seller to Mongo");
    }

    // 4. Associate R2 KYC document records in MongoDB Atlas (safely isolated)
    const kycUrls = [
      { url: vendor.panCardUrl, type: "kyc_pan" },
      { url: vendor.gstCertUrl, type: "kyc_gst" },
    ].filter((item) => Boolean(item.url));

    for (const item of kycUrls) {
      let key = item.url!;
      if (key.includes("/api/storage/private/")) {
        key = key.split("/api/storage/private/")[1];
      } else if (key.includes("/storage/private/")) {
        key = key.split("/storage/private/")[1];
      }
      try {
        const existingAsset = await mongoR2Assets.findByObjectKey(key);
        if (existingAsset) {
          await mongoR2Assets.saveAsset({
            ...existingAsset,
            sellerId: vendor.id,
            assetType: item.type as any,
            status: "uploaded",
          });
        } else {
          await mongoR2Assets.saveAsset({
            objectKey: key,
            bucket: process.env.R2_BUCKET_PRIVATE || "vashtraa-private",
            publicUrl: item.url!,
            sellerId: vendor.id,
            assetType: item.type as any,
            status: "uploaded",
          });
        }
      } catch {
        // Continue silently if metadata sync is ignored
      }
    }

    // 5. ACL Policy update (safely isolated)
    try {
      const ownerAcl = { owner: userId, visibility: "private" as const };
      const aclPromises: Promise<any>[] = [
        objectStorage.trySetObjectEntityAclPolicy(vendor.panCardUrl!, ownerAcl).catch(() => {}),
      ];
      if (vendor.gstCertUrl) {
        aclPromises.push(
          objectStorage.trySetObjectEntityAclPolicy(vendor.gstCertUrl, ownerAcl).catch(() => {})
        );
      }
      await Promise.all(aclPromises);
    } catch {}

    // 6. Admin notifications (safely isolated)
    try {
      await insertAdminNotification({
        type: "new_seller_registration",
        title: "New seller registration",
        body: `"${vendor.name || vendorValues.name}" has registered as a new seller.`,
        metadata: { vendorId: vendor.id },
      });
    } catch (nErr) {
      req.log?.warn({ err: nErr }, "Failed to insert new seller admin notification");
    }

    try {
      await insertAdminNotification({
        type: "kyc_submitted",
        title: "KYC documents submitted",
        body: `"${vendor.name || vendorValues.name}" has submitted KYC documents for verification.`,
        metadata: { vendorId: vendor.id },
      });
    } catch (nErr) {
      req.log?.warn({ err: nErr }, "Failed to insert KYC submitted admin notification");
    }

    // 7. Consume seller email verification
    if (vendor.contactEmail) {
      try {
        consumeSellerEmailVerification(vendor.contactEmail);
      } catch {}
    }

    // 8. Automated Shiprocket Pickup Registration
    const hasRegPickup = Boolean(
      vendorValues.pickupPincode ||
      vendorValues.shopPincode ||
      vendorValues.pickupAddressLine1 ||
      vendorValues.shopStreet
    );
    if (hasRegPickup) {
      try {
        const syncRes = await syncSellerPickupToShiprocket(
          assignedVendorId,
          {
            ...req.body,
            pickupSameAsShop: vendorValues.pickupSameAsShop,
            pickupAddressLine1: vendorValues.pickupAddressLine1,
            pickupAddressLine2: vendorValues.pickupAddressLine2,
            pickupCity: vendorValues.pickupCity,
            pickupState: vendorValues.pickupState,
            pickupPincode: vendorValues.pickupPincode,
            shopStreet: vendorValues.shopStreet,
            shopCity: vendorValues.shopCity,
            shopState: vendorValues.shopState,
            shopPincode: vendorValues.shopPincode,
            mobile: vendor.mobile,
            contactEmail: vendor.contactEmail,
            name: vendor.name,
          },
          vendor
        );
        if (syncRes.success) {
          vendor.shiprocketPickupLocationName = syncRes.nickname;
          vendor.shiprocketPickupId = syncRes.pickupId;
          vendor.shiprocketPickupStatus = "registered";
        } else {
          vendor.shiprocketPickupStatus = "failed";
          vendor.shiprocketPickupError = syncRes.error;
        }
      } catch (sErr: any) {
        req.log?.warn({ err: sErr }, "Initial Shiprocket pickup registration failed during seller registration");
      }
    }

    const canonicalSellerId = getCanonicalSellerId(vendor) || assignedVendorId;

    return res.status(201).json({
      id: vendor.id,
      name: vendor.name || vendorValues.name,
      status: vendor.status || vendorValues.status,
      vendorId: canonicalSellerId || vendor.vendorId || assignedVendorId || vendor.id,
      sellerId: canonicalSellerId || vendor.sellerId || assignedVendorId || vendor.id,
      shiprocketPickupStatus: vendor.shiprocketPickupStatus || "unregistered",
      shiprocketPickupLocationName: vendor.shiprocketPickupLocationName || null,
    });
  } catch (err) {
    req.log?.error({ err }, "Failed to create vendor");
    return res.status(500).json({ error: "Failed to create vendor account" });
  }
}


router.post("/vendors", authRateLimiter, optionalAuth, handleSellerRegistration);
router.post("/seller/register", authRateLimiter, optionalAuth, handleSellerRegistration);

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

import { executeVendorProfileUpdate } from "../lib/updateVendorProfile";

async function handlePatchOrPutVendor(req: any, res: any) {
  try {
    return await executeVendorProfileUpdate(req, res, req.params.id);
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to update vendor");
    return res.status(500).json({ error: "Failed to update vendor" });
  }
}

router.patch("/vendors/:id", requireVendorAuth, handlePatchOrPutVendor);
router.put("/vendors/:id", requireVendorAuth, handlePatchOrPutVendor);

router.get("/admin/vendors", requireAdminKey, async (req: any, res: any) => {
  try {
    let mongoSellersList: any[] = [];
    let postgresVendorsList: any[] = [];
    let sellerUsersList: any[] = [];
    let allProducts: any[] = [];
    let allOrders: any[] = [];

    // 1. Fetch from MongoDB sellers (covers sellers & vendors collections due to mongoSellers.findMany fix)
    try {
      mongoSellersList = await mongoSellers.findMany({});
    } catch (e) {
      req.log?.warn?.({ err: e }, "Failed to fetch mongoSellers");
    }

    // 2. Fetch from PostgreSQL vendorsTable
    try {
      postgresVendorsList = await db.select().from(vendorsTable).orderBy(vendorsTable.name);
    } catch (e) {
      req.log?.warn?.({ err: e }, "Failed to fetch postgresVendors");
    }

    // 3. Fetch seller user accounts from mongoUsers (role = "seller" or "vendor")
    try {
      const allUsers = await mongoUsers.findMany({});
      sellerUsersList = allUsers
        .filter((u: any) => u.role === "seller" || u.role === "vendor")
        .map((u: any) => ({
          id: u.id,
          ownerId: u.id,
          name: u.name || u.shopName || "Seller Store",
          shopName: u.shopName || u.name || "Seller Store",
          email: u.email,
          contactEmail: u.email,
          mobile: u.phone || u.mobile || null,
          location: u.location || "India",
          status: "approved",
          rating: 4.5,
          createdAt: u.createdAt,
        }));
    } catch (e) {
      req.log?.warn?.({ err: e }, "Failed to fetch seller users from mongoUsers");
    }

    // 4. Fetch all products from mongoProducts and productsTable
    try {
      const mProducts = await mongoProducts.findMany({});
      let pProducts: any[] = [];
      try {
        pProducts = await db.select().from(productsTable);
      } catch {}

      const productMap = new Map<string, any>();
      for (const p of [...mProducts, ...pProducts]) {
        if (p && p.id && !productMap.has(p.id)) {
          productMap.set(p.id, p);
        }
      }
      allProducts = Array.from(productMap.values());
    } catch (e) {
      req.log?.warn?.({ err: e }, "Failed to fetch products");
    }

    // Extract product vendor entries for catalog items
    const productVendorsList: any[] = [];
    for (const p of allProducts) {
      const vName = p.vendorName || p.sellerName || p.shopName;
      const vId = p.vendorId || p.sellerId;
      if (vName || vId) {
        productVendorsList.push({
          id: vId || `v_${String(vName).toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          vendorId: vId || `v_${String(vName).toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
          name: vName || "Artisan Weaver",
          shopName: vName || "Artisan Weaver",
          location: p.location || "India",
          rating: p.rating ?? 4.8,
          status: "approved",
        });
      }
    }

    // Fetch all orders for revenue & order metrics
    try {
      const mOrders = await mongoOrders.findMany({});
      let pOrders: any[] = [];
      try {
        pOrders = await db.select({ items: ordersTable.items, status: ordersTable.status }).from(ordersTable);
      } catch {}
      allOrders = [...mOrders, ...pOrders];
    } catch (e) {
      req.log?.warn?.({ err: e }, "Failed to fetch orders");
    }

    // Multi-source consolidation across all 4 sources
    const rawVendors = [
      ...postgresVendorsList,
      ...mongoSellersList,
      ...sellerUsersList,
      ...productVendorsList,
    ];

    const consolidatedVendors: any[] = [];
    const emailToIdx = new Map<string, number>();
    const ownerIdToIdx = new Map<string, number>();
    const idToIdx = new Map<string, number>();
    const nameToIdx = new Map<string, number>();

    for (const v of rawVendors) {
      if (!v) continue;
      const email = (v.contactEmail || v.email || v.ownerEmail || "").trim().toLowerCase();
      const ownerId = v.ownerId ? String(v.ownerId) : "";
      const name = (v.shopName || v.name || "").trim().toLowerCase();
      const vIds = [v.id, v.vendorId, v.sellerId].filter(Boolean).map(String);

      let targetIdx: number | undefined = undefined;

      if (email && emailToIdx.has(email)) {
        targetIdx = emailToIdx.get(email);
      } else if (ownerId && ownerIdToIdx.has(ownerId)) {
        targetIdx = ownerIdToIdx.get(ownerId);
      } else {
        for (const idVal of vIds) {
          if (idToIdx.has(idVal)) {
            targetIdx = idToIdx.get(idVal);
            break;
          }
        }
      }

      if (targetIdx === undefined && name && name.length >= 3 && nameToIdx.has(name)) {
        targetIdx = nameToIdx.get(name);
      }

      if (targetIdx === undefined) {
        const newIdx = consolidatedVendors.length;
        const idsSet = new Set<string>(vIds);
        if (ownerId) idsSet.add(ownerId);

        const namesSet = new Set<string>();
        if (v.name) namesSet.add(String(v.name).trim());
        if (v.shopName) namesSet.add(String(v.shopName).trim());

        const canonicalSellerId = getCanonicalSellerId(v);
        const merged = {
          ...v,
          id: v.id || v.vendorId || v.sellerId || (ownerId ? `v_${ownerId}` : `v_${newIdx}`),
          vendorId: canonicalSellerId || v.vendorId || v.sellerId || v.id || null,
          sellerId: canonicalSellerId || v.sellerId || v.vendorId || v.id || null,
          name: v.name || v.shopName || "Seller Store",
          shopName: v.shopName || v.name || "Seller Store",
          email: email || null,
          contactEmail: v.contactEmail || email || null,
          mobile: v.mobile || v.phone || null,
          location: v.location || "India",
          rating: v.rating ?? 4.5,
          status: v.status || "approved",
          _idsSet: idsSet,
          _namesSet: namesSet,
        };

        consolidatedVendors.push(merged);

        if (email) emailToIdx.set(email, newIdx);
        if (ownerId) ownerIdToIdx.set(ownerId, newIdx);
        for (const idVal of vIds) idToIdx.set(idVal, newIdx);
        if (name && name.length >= 3) nameToIdx.set(name, newIdx);
      } else {
        const existing = consolidatedVendors[targetIdx];

        existing.id = existing.id || v.id;
        const vCanonical = getCanonicalSellerId(v);
        const existingCanonical = getCanonicalSellerId(existing);
        const bestCanonical = (vCanonical && !isInternalRawId(vCanonical))
          ? vCanonical
          : (existingCanonical && !isInternalRawId(existingCanonical))
            ? existingCanonical
            : (vCanonical || existingCanonical);
        if (bestCanonical) {
          existing.vendorId = bestCanonical;
          existing.sellerId = bestCanonical;
        } else {
          existing.vendorId = existing.vendorId || v.vendorId || v.sellerId || v.id;
          existing.sellerId = existing.sellerId || v.sellerId || v.vendorId || v.id;
        }
        existing.name = existing.name || v.name || v.shopName;
        existing.shopName = existing.shopName || v.shopName || v.name;
        existing.email = existing.email || email;
        existing.contactEmail = existing.contactEmail || v.contactEmail || email;
        existing.mobile = existing.mobile || v.mobile || v.phone;
        existing.location = existing.location || v.location;
        existing.gstin = existing.gstin || v.gstin;
        existing.panNumber = existing.panNumber || v.panNumber;
        existing.panCardUrl = existing.panCardUrl || v.panCardUrl;
        existing.gstCertUrl = existing.gstCertUrl || v.gstCertUrl;
        existing.bankHolder = existing.bankHolder || v.bankHolder;
        existing.bankName = existing.bankName || v.bankName;
        existing.bankAccount = existing.bankAccount || v.bankAccount;
        existing.bankIfsc = existing.bankIfsc || v.bankIfsc;
        existing.bankVerified = existing.bankVerified ?? v.bankVerified;
        existing.bankVerificationStatus = existing.bankVerificationStatus || v.bankVerificationStatus;
        existing.shopStreet = existing.shopStreet || v.shopStreet;
        existing.shopCity = existing.shopCity || v.shopCity;
        existing.shopState = existing.shopState || v.shopState;
        existing.shopPincode = existing.shopPincode || v.shopPincode;
        existing.ownerId = existing.ownerId || v.ownerId;
        existing.kycVerified = existing.kycVerified || v.kycVerified;
        existing.termsAcceptedAt = existing.termsAcceptedAt || v.termsAcceptedAt;
        existing.createdAt = existing.createdAt || v.createdAt;
        existing.updatedAt = existing.updatedAt || v.updatedAt;
        existing.statusReason = existing.statusReason || v.statusReason;
        existing.featured = existing.featured || v.featured;

        const statusPriority: Record<string, number> = {
          approved: 5,
          active: 5,
          suspended: 4,
          deactivated: 3,
          rejected: 2,
          declined: 2,
          pending: 1,
        };
        const existingPriority = statusPriority[String(existing.status).toLowerCase()] ?? 0;
        const newPriority = statusPriority[String(v.status).toLowerCase()] ?? 0;
        const isNewer = Boolean(
          v.updatedAt &&
          existing.updatedAt &&
          new Date(v.updatedAt).getTime() > new Date(existing.updatedAt).getTime()
        );
        if (isNewer || (newPriority > existingPriority && !existing.updatedAt)) {
          existing.status = v.status;
          if (v.statusReason !== undefined) existing.statusReason = v.statusReason;
        } else if (newPriority > existingPriority) {
          existing.status = v.status;
          if (v.statusReason !== undefined) existing.statusReason = v.statusReason;
        }

        for (const idVal of vIds) {
          existing._idsSet.add(idVal);
          idToIdx.set(idVal, targetIdx);
        }
        if (v.ownerId) {
          existing._idsSet.add(String(v.ownerId));
          ownerIdToIdx.set(String(v.ownerId), targetIdx);
        }
        if (email && !emailToIdx.has(email)) {
          emailToIdx.set(email, targetIdx);
        }
        if (v.name) existing._namesSet.add(String(v.name).trim());
        if (v.shopName) existing._namesSet.add(String(v.shopName).trim());
        if (name && name.length >= 3 && !nameToIdx.has(name)) {
          nameToIdx.set(name, targetIdx);
        }
      }
    }

    // Dynamic product count and revenue/order metrics per vendor
    const vendorProductCounts = new Map<number, number>();
    const productIdToVendorIdx = new Map<string, number>();

    for (const p of allProducts) {
      if (!p) continue;
      const pVendorId = p.vendorId || p.sellerId ? String(p.vendorId || p.sellerId) : null;
      const pVendorName = (p.vendorName || p.sellerName || p.shopName || "").trim().toLowerCase();

      for (let i = 0; i < consolidatedVendors.length; i++) {
        const v = consolidatedVendors[i];
        const idsSet = v._idsSet as Set<string>;
        const namesLowerSet = new Set(Array.from(v._namesSet as Set<string>).map((s: string) => s.toLowerCase()));

        const matchesId = pVendorId ? idsSet.has(pVendorId) : false;
        const matchesName = pVendorName ? namesLowerSet.has(pVendorName) : false;

        if (matchesId || matchesName) {
          vendorProductCounts.set(i, (vendorProductCounts.get(i) || 0) + 1);
          if (p.id && !productIdToVendorIdx.has(p.id)) {
            productIdToVendorIdx.set(p.id, i);
          }
        }
      }
    }

    const vendorRevenue = new Map<number, number>();
    const vendorOrders = new Map<number, number>();

    for (const order of allOrders) {
      if (!order) continue;
      const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
      if (!Array.isArray(items)) continue;
      const touchedVendorIndices = new Set<number>();
      for (const item of items) {
        if (!item || !item.productId) continue;
        const vIdx = productIdToVendorIdx.get(item.productId);
        if (vIdx === undefined) continue;
        touchedVendorIndices.add(vIdx);
        if (!["cancelled", "returned"].includes(String(order.status).toLowerCase())) {
          const lineTotal = (Number(item.price) || 0) * (Number(item.quantity) || 1);
          vendorRevenue.set(vIdx, (vendorRevenue.get(vIdx) || 0) + lineTotal);
        }
      }
      for (const vIdx of touchedVendorIndices) {
        vendorOrders.set(vIdx, (vendorOrders.get(vIdx) || 0) + 1);
      }
    }

    res.json({
      vendors: consolidatedVendors.map((v, i) => ({
        id: v.id,
        name: v.name || v.shopName || "Seller Store",
        shopName: v.shopName || v.name || "Seller Store",
        location: v.location || "India",
        rating: v.rating ?? 4.5,
        sareesCount: vendorProductCounts.get(i) ?? 0,
        avatar: v.avatar || "/images/artisan-1.png",
        bio: v.bio ?? null,
        ownerId: v.ownerId ?? null,
        status: v.status || "approved",
        statusReason: v.statusReason ?? null,
        gstin: v.gstin ?? null,
        mobile: v.mobile || v.phone || null,
        contactEmail: v.contactEmail || v.email || null,
        email: v.email || v.contactEmail || null,
        kycVerified: !!v.kycVerified,
        kycResubmissionRequested: !!v.kycResubmissionRequested,
        featured: !!v.featured,
        revenue: vendorRevenue.get(i) || 0,
        totalOrders: vendorOrders.get(i) || 0,
        vendorId: getCanonicalSellerId(v) || v.vendorId || v.sellerId || v.id || null,
        sellerId: getCanonicalSellerId(v) || v.sellerId || v.vendorId || v.id || null,
        createdAt: v.createdAt || v.termsAcceptedAt || null,
        termsAcceptedAt: v.termsAcceptedAt || null,
        shopStreet: v.shopStreet ?? null,
        shopCity: v.shopCity ?? null,
        shopState: v.shopState ?? null,
        shopPincode: v.shopPincode ?? null,
        bankVerified: v.bankVerified === true || v.bankVerificationStatus === "verified",
        bankVerificationStatus: v.bankVerificationStatus ?? (v.bankVerified ? "verified" : (v.bankAccount ? "pending" : "unverified")),
      })),
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to list admin vendors");
    res.status(500).json({ error: "Failed to fetch vendors" });
  }
});

router.post("/admin/vendors/:id/approve", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    let updatedVendor: any = null;
    let postgresError: any = null;
    try {
      const updateResult = await db.execute(sql`
        WITH vendor_id_lock AS (
          SELECT pg_advisory_xact_lock(764204853)
        )
        UPDATE vendors
           SET status = 'approved',
               vendor_id = COALESCE(
                 vendor_id,
                 'TDV' || (
                   SELECT CASE
                     WHEN char_length(next_vendor_id.value) < 6
                       THEN lpad(next_vendor_id.value, 6, '0')
                     ELSE next_vendor_id.value
                   END
                   FROM (
                     SELECT nextval('vendor_id_seq')::text AS value
                       FROM vendor_id_lock
                   ) AS next_vendor_id
                 )
               )
          FROM vendor_id_lock
         WHERE id = ${id}
           AND (status <> 'approved' OR vendor_id IS NOT NULL)
        RETURNING id, name, status, owner_id, contact_email, vendor_id
      `);

      const updated = (updateResult.rows[0] as any) ?? null;
      if (updated) {
        updatedVendor = {
          id: updated.id,
          name: updated.name,
          status: updated.status,
          ownerId: updated.owner_id,
          contactEmail: updated.contact_email,
          vendorId: updated.vendor_id,
        };
      } else {
        const existingCheck = await db.execute(sql`
          SELECT status, vendor_id FROM vendors WHERE id = ${id}
        `);
        const existingRow = (existingCheck.rows[0] as any) ?? null;
        if (existingRow && existingRow.status === "approved" && !existingRow.vendor_id) {
          return res.status(409).json({ error: "Vendor is already approved without a generated Vendor ID" });
        }
      }
    } catch (dbErr) {
      postgresError = dbErr;
      req.log?.warn?.({ err: dbErr }, "Postgres execution failed during vendor approval, falling back to Mongo/in-memory");
    }

    if (!updatedVendor) {
      try {
        if (mongoSellers) {
          const mSeller = (await mongoSellers.findById?.(id)) ||
            (await mongoSellers.findBySellerId?.(id)) ||
            (await mongoSellers.findByVendorId?.(id)) ||
            (await mongoSellers.findByOwnerId?.(id));

          if (mSeller) {
            const mApproved = await mongoSellers.update?.(mSeller.id, {
              status: "approved",
              approvalStatus: "approved",
              statusReason: null,
            });
            updatedVendor = {
              id: mSeller.id,
              name: mSeller.name || mSeller.shopName || "Seller Store",
              status: "approved",
              ownerId: mSeller.ownerId,
              contactEmail: mSeller.contactEmail || mSeller.email,
              vendorId: mApproved?.vendorId || mSeller.vendorId || mSeller.sellerId || mSeller.id,
            };
            try {
              await db
                .update(vendorsTable)
                .set({ status: "approved" as any, vendorId: updatedVendor.vendorId, statusReason: null })
                .where(eq(vendorsTable.id, mSeller.id));
            } catch {}
          }
        }
      } catch {}
    }

    if (!updatedVendor) {
      if (postgresError) {
        return res.status(500).json({ error: "Vendor approval could not be completed. Please retry." });
      }
      return res.status(404).json({ error: "Vendor not found" });
    }

    try {
      await db
        .update(vendorsTable)
        .set({ statusReason: null })
        .where(or(eq(vendorsTable.id, updatedVendor.id), eq(vendorsTable.ownerId, updatedVendor.ownerId || updatedVendor.id)));
    } catch {}

    try {
      if (mongoSellers && typeof mongoSellers.update === "function") {
        mongoSellers.update(updatedVendor.id, {
          status: "approved",
          approvalStatus: "approved",
          vendorId: updatedVendor.vendorId,
          statusReason: null,
        }).catch(() => {});
      }
    } catch {}

    await insertSellerNotification({
      vendorId: updatedVendor.id,
      type: "store_approved",
      title: "Your store has been approved",
      body: `Congratulations! Your store "${updatedVendor.name}" has been approved. You can now start listing your products.`,
      metadata: { vendorId: updatedVendor.id },
    }).catch(() => {});

    invalidateApprovedVendorDataCache();

    if (typeof sendVendorApprovalEmailForVendor === "function") {
      try {
        sendVendorApprovalEmailForVendor({
          vendorId: updatedVendor.id,
          vendorName: updatedVendor.name,
          contactEmail: updatedVendor.contactEmail,
          ownerId: updatedVendor.ownerId,
        }).catch((err) => req.log?.warn?.({ err, vendorId: updatedVendor.id }, "Failed to send vendor approval email"));
      } catch {}
    }

    writeAuditLog({ action: "vendor_approved", module: "Vendors", details: { vendorId: updatedVendor.id, vendorName: updatedVendor.name }, ipAddress: getIp(req) }).catch(() => {});

    try {
      emitVendorEvent("vendor:approved", updatedVendor);
      emitAnalyticsEvent({ vendorId: updatedVendor.id, reason: "vendor_approved" });
    } catch {}

    return res.json({
      vendor: {
        id: updatedVendor.id,
        name: updatedVendor.name,
        status: updatedVendor.status,
        vendorId: updatedVendor.vendorId,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to approve vendor");
    res.status(500).json({ error: "Vendor approval could not be completed. Please retry." });
  }
});

router.post("/admin/vendors/:id/suspend", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  const statusReason = reason ? String(reason).trim() : "Seller account suspended by admin.";
  try {
    const { mSeller, pgRow } = await findVendorAcrossDatabases(id);
    if (!mSeller && !pgRow) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const primaryId = pgRow?.id || mSeller?.id || id;
    const vendorName = mSeller?.shopName || mSeller?.name || pgRow?.name || "Seller Store";
    const contactEmail = mSeller?.email || mSeller?.contactEmail || pgRow?.contactEmail || null;
    const ownerId = mSeller?.ownerId || pgRow?.ownerId || null;

    let updated: any = null;

    // 1. Update PostgreSQL vendorsTable
    try {
      const pgConditions: any[] = [];
      if (pgRow?.id) pgConditions.push(eq(vendorsTable.id, pgRow.id));
      if (mSeller?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mSeller.id)) {
        pgConditions.push(eq(vendorsTable.id, mSeller.id));
      }
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        pgConditions.push(eq(vendorsTable.id, id));
      }
      if (ownerId) pgConditions.push(eq(vendorsTable.ownerId, ownerId));
      if (contactEmail && vendorsTable.contactEmail) {
        pgConditions.push(eq(vendorsTable.contactEmail, contactEmail));
      }
      if (pgConditions.length > 0) {
        const rows = await db
          .update(vendorsTable)
          .set({ status: "suspended", statusReason })
          .where(or(...pgConditions))
          .returning({
            id: vendorsTable.id,
            name: vendorsTable.name,
            status: vendorsTable.status,
            ownerId: vendorsTable.ownerId,
            contactEmail: vendorsTable.contactEmail,
          });
        if (Array.isArray(rows) && rows.length > 0) updated = rows[0];
      }
    } catch {}

    // 2. Update MongoDB mongoSellers
    try {
      if (mongoSellers && typeof mongoSellers.update === "function") {
        const idsToUpdate = Array.from(new Set([mSeller?.id, pgRow?.id, id].filter(Boolean))) as string[];
        for (const targetId of idsToUpdate) {
          const mRes = await mongoSellers.update(targetId, {
            status: "suspended",
            statusReason,
            email: contactEmail || undefined,
            contactEmail: contactEmail || undefined,
            reactivationWelcomePending: false,
            reactivationPending: false,
          }).catch(() => null);
          if (!updated && mRes) {
            updated = {
              id: mRes.id,
              name: mRes.name || mRes.shopName || vendorName,
              status: "suspended",
              ownerId: mRes.ownerId || ownerId,
              contactEmail: mRes.contactEmail || mRes.email || contactEmail,
            };
          }
        }
      }
    } catch {}

    if (!updated) {
      updated = {
        id: primaryId,
        name: vendorName,
        status: "suspended",
        ownerId,
        contactEmail,
      };
    }

    // 3. Immediately invalidate existing seller authentication sessions/tokens
    const userIdsToRevoke = Array.from(new Set([ownerId, primaryId, pgRow?.id, mSeller?.id].filter(Boolean))) as string[];
    for (const uId of userIdsToRevoke) {
      try {
        await revokeAllUserSessions(uId, "seller", "seller_suspended");
      } catch {}
    }

    // 4. Invalidate vendor cache
    invalidateApprovedVendorDataCache();

    // 5. Send notification email safely
    if (typeof sendVendorSuspensionEmailForVendor === "function") {
      try {
        sendVendorSuspensionEmailForVendor({
          vendorId: updated.id,
          vendorName: updated.name,
          contactEmail: updated.contactEmail,
          ownerId: updated.ownerId,
          reason: reason ? String(reason).trim() : undefined,
        }).catch((err) => req.log?.warn?.({ err, vendorId: updated.id }, "Failed to send vendor suspension email"));
      } catch {}
    }

    writeAuditLog({ action: "vendor_suspended", module: "Vendors", details: { vendorId: updated.id, vendorName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    try {
      emitVendorEvent("vendor:updated", updated);
      emitAnalyticsEvent({ vendorId: updated.id, reason: "vendor_suspended" });
    } catch {}
    res.json({ vendor: { id: updated.id, name: updated.name, status: updated.status, statusReason } });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to suspend vendor");
    res.status(500).json({ error: "Failed to suspend vendor" });
  }
});

router.post("/admin/vendors/:id/deactivate", requireAdminKey, async (req: any, res: any) => {
  const { id } = req.params;
  const { reason } = req.body ?? {};
  const deactivationReason = reason ? String(reason).trim() : "Vendor account deactivated by Super Admin.";
  try {
    const { mSeller, pgRow } = await findVendorAcrossDatabases(id);
    if (!mSeller && !pgRow) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const primaryId = pgRow?.id || mSeller?.id || id;
    const vendorName = mSeller?.shopName || mSeller?.name || pgRow?.name || "Seller Store";
    const contactEmail = mSeller?.email || mSeller?.contactEmail || pgRow?.contactEmail || null;
    const ownerId = mSeller?.ownerId || pgRow?.ownerId || null;

    let updated: any = null;

    // 1. Update PostgreSQL
    try {
      const pgConditions: any[] = [];
      if (pgRow?.id) pgConditions.push(eq(vendorsTable.id, pgRow.id));
      if (mSeller?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mSeller.id)) {
        pgConditions.push(eq(vendorsTable.id, mSeller.id));
      }
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        pgConditions.push(eq(vendorsTable.id, id));
      }
      if (ownerId) pgConditions.push(eq(vendorsTable.ownerId, ownerId));
      if (contactEmail && vendorsTable.contactEmail) {
        pgConditions.push(eq(vendorsTable.contactEmail, contactEmail));
      }
      if (pgConditions.length > 0) {
        const rows = await db
          .update(vendorsTable)
          .set({ status: "deactivated" as any, statusReason: deactivationReason })
          .where(or(...pgConditions))
          .returning({
            id: vendorsTable.id,
            name: vendorsTable.name,
            status: vendorsTable.status,
            ownerId: vendorsTable.ownerId,
            contactEmail: vendorsTable.contactEmail,
          });
        if (Array.isArray(rows) && rows.length > 0) updated = rows[0];
      }
    } catch {}

    // 2. Update MongoDB
    try {
      if (mongoSellers && typeof mongoSellers.update === "function") {
        const idsToUpdate = Array.from(new Set([mSeller?.id, pgRow?.id, id].filter(Boolean))) as string[];
        for (const targetId of idsToUpdate) {
          const mRes = await mongoSellers.update(targetId, {
            status: "deactivated" as any,
            statusReason: deactivationReason,
            email: contactEmail || undefined,
            contactEmail: contactEmail || undefined,
            reactivationWelcomePending: false,
            reactivationPending: false,
          }).catch(() => null);
          if (!updated && mRes) {
            updated = {
              id: mRes.id,
              name: mRes.name || mRes.shopName || vendorName,
              status: "deactivated",
              ownerId: mRes.ownerId || ownerId,
              contactEmail: mRes.contactEmail || mRes.email || contactEmail,
            };
          }
        }
      }
    } catch {}

    if (!updated) {
      updated = { id: primaryId, name: vendorName, status: "deactivated", ownerId, contactEmail };
    }

    // 3. Invalidate seller auth sessions immediately
    const userIdsToRevoke = Array.from(new Set([ownerId, primaryId, pgRow?.id, mSeller?.id].filter(Boolean))) as string[];
    for (const uId of userIdsToRevoke) {
      try {
        await revokeAllUserSessions(uId, "seller", "seller_deactivated");
      } catch {}
    }

    // 4. Invalidate vendor cache
    invalidateApprovedVendorDataCache();

    writeAuditLog({ action: "vendor_deactivated", module: "Vendors", details: { vendorId: updated.id, vendorName: updated.name }, ipAddress: getIp(req) }).catch(() => {});
    try {
      emitVendorEvent("vendor:updated", updated);
      emitAnalyticsEvent({ vendorId: updated.id, reason: "vendor_deactivated" });
    } catch {}
    res.json({ vendor: { id: updated.id, name: updated.name, status: "deactivated", statusReason: deactivationReason } });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to deactivate vendor");
    res.status(500).json({ error: "Failed to deactivate vendor" });
  }
});

const handleVendorDeclineOrReject = async (req: any, res: any) => {
  const { id } = req.params;
  const { reason, statusReason } = req.body ?? {};
  const rawReason = reason || statusReason ? String(reason || statusReason).trim() : undefined;
  const declineReason = rawReason || "Vendor application rejected by Super Admin.";
  try {
    let updatedVendor: any = null;

    try {
      const whereConditions: any[] = [eq(vendorsTable.id, id)];
      if (vendorsTable.ownerId) whereConditions.push(eq(vendorsTable.ownerId, id));
      if ((vendorsTable as any).vendorId) whereConditions.push(eq((vendorsTable as any).vendorId, id));

      const rows = await db
        .update(vendorsTable)
        .set({ status: "rejected" as any, statusReason: declineReason })
        .where(or(...whereConditions))
        .returning({
          id: vendorsTable.id,
          name: vendorsTable.name,
          status: vendorsTable.status,
          ownerId: vendorsTable.ownerId,
          contactEmail: vendorsTable.contactEmail,
        });

      if (Array.isArray(rows) && rows.length > 0) {
        updatedVendor = rows[0];
      }
    } catch (dbErr) {
      req.log?.warn?.({ err: dbErr }, "Postgres execution failed during vendor decline/rejection");
    }

    let mSeller: any = null;
    try {
      if (mongoSellers) {
        mSeller = (await mongoSellers.findById?.(id)) ||
          (await mongoSellers.findBySellerId?.(id)) ||
          (await mongoSellers.findByVendorId?.(id)) ||
          (await mongoSellers.findByOwnerId?.(id));
      }
    } catch {}

    if (mSeller) {
      try {
        if (mongoSellers && typeof mongoSellers.update === "function") {
          await mongoSellers.update(mSeller.id, {
            status: "declined",
            approvalStatus: "declined",
            statusReason: declineReason,
          });
        }
      } catch {}

      if (!updatedVendor) {
        updatedVendor = {
          id: mSeller.id,
          name: mSeller.name || mSeller.shopName || "Seller Store",
          status: "declined",
          approvalStatus: "declined",
          ownerId: mSeller.ownerId,
          contactEmail: mSeller.contactEmail || mSeller.email,
        };
      }

      try {
        await db
          .update(vendorsTable)
          .set({ status: "rejected" as any, statusReason: declineReason })
          .where(or(...whereConditions));
      } catch {}
    }

    if (!updatedVendor) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    try {
      if (mongoSellers && typeof mongoSellers.update === "function") {
        await mongoSellers.update(updatedVendor.id, {
          status: "declined",
          approvalStatus: "declined",
          statusReason: declineReason,
        });
      }
    } catch {}

    writeAuditLog({ action: "vendor_rejected", module: "Vendors", details: { vendorId: updatedVendor.id, vendorName: updatedVendor.name, reason: declineReason }, ipAddress: getIp(req) }).catch(() => {});

    sendVendorRejectionEmailForVendor({
      vendorId: updatedVendor.id,
      vendorName: updatedVendor.name,
      contactEmail: updatedVendor.contactEmail,
      ownerId: updatedVendor.ownerId,
      reason: rawReason,
    }).catch((err) => req.log?.warn?.({ err, vendorId: updatedVendor.id }, "Failed to send vendor rejection email"));

    res.json({
      vendor: {
        id: updatedVendor.id,
        name: updatedVendor.name,
        status: "declined",
        approvalStatus: "declined",
        statusReason: declineReason,
      },
    });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to decline/reject vendor");
    res.status(500).json({ error: "Failed to reject vendor" });
  }
};

router.post("/admin/vendors/:id/reject", requireAdminKey, handleVendorDeclineOrReject);
router.post("/admin/vendors/:id/decline", requireAdminKey, handleVendorDeclineOrReject);

const handleVendorActivation = async (req: any, res: any) => {
  const { id } = req.params;
  try {
    const { mSeller, pgRow } = await findVendorAcrossDatabases(id);
    if (!mSeller && !pgRow) {
      return res.status(404).json({ error: "Vendor not found" });
    }

    const currentStatus = pgRow?.status || mSeller?.status || "suspended";
    const primaryId = pgRow?.id || mSeller?.id || id;
    const vendorName = pgRow?.name || mSeller?.name || mSeller?.shopName || "Vendor";
    let contactEmail = pgRow?.contactEmail || mSeller?.contactEmail || mSeller?.email || null;
    let ownerId = pgRow?.ownerId || mSeller?.ownerId || null;

    const isReactivation =
      currentStatus === "suspended" ||
      currentStatus === "deactivated" ||
      currentStatus === "rejected" ||
      currentStatus === "declined";

    const setValues: Record<string, any> = { status: "approved", statusReason: null };
    if (isReactivation) {
      setValues.reactivationWelcomePending = true;
    }

    let updated: any = null;

    // 1. Update PostgreSQL vendorsTable
    try {
      const pgConditions: any[] = [];
      if (pgRow?.id) pgConditions.push(eq(vendorsTable.id, pgRow.id));
      if (mSeller?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mSeller.id)) {
        pgConditions.push(eq(vendorsTable.id, mSeller.id));
      }
      if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        pgConditions.push(eq(vendorsTable.id, id));
      }
      if (ownerId) pgConditions.push(eq(vendorsTable.ownerId, ownerId));
      if (contactEmail && vendorsTable.contactEmail) {
        pgConditions.push(eq(vendorsTable.contactEmail, contactEmail));
      }

      if (pgConditions.length > 0) {
        const rows = await db
          .update(vendorsTable)
          .set(setValues)
          .where(or(...pgConditions))
          .returning({
            id: vendorsTable.id,
            name: vendorsTable.name,
            status: vendorsTable.status,
            contactEmail: vendorsTable.contactEmail,
            ownerId: vendorsTable.ownerId,
            reactivationWelcomePending: (vendorsTable as any).reactivationWelcomePending,
          });
        if (Array.isArray(rows) && rows.length > 0) {
          updated = rows[0];
          contactEmail = rows[0].contactEmail || contactEmail;
          ownerId = rows[0].ownerId || ownerId;
        }
      }
    } catch {}

    if (!updated) {
      updated = {
        id: primaryId,
        name: vendorName,
        status: "approved",
        contactEmail,
        ownerId,
        reactivationWelcomePending: isReactivation,
      };
    }

    // 2. Update MongoDB mongoSellers
    try {
      if (mongoSellers && typeof mongoSellers.update === "function") {
        const idsToUpdate = Array.from(new Set([mSeller?.id, pgRow?.id, id].filter(Boolean))) as string[];
        for (const targetId of idsToUpdate) {
          await mongoSellers.update(targetId, {
            status: "active" as any,
            approvalStatus: "approved" as any,
            statusReason: null,
            email: contactEmail || undefined,
            contactEmail: contactEmail || undefined,
            ...(isReactivation ? { reactivationWelcomePending: true, reactivationPending: true } : {}),
          });
        }
      }
    } catch {}

    // 3. Invalidate vendor cache
    invalidateApprovedVendorDataCache();

    writeAuditLog({
      action: isReactivation ? "vendor_reactivated" : "vendor_activated",
      module: "Vendors",
      details: { vendorId: updated.id, vendorName: updated.name },
      ipAddress: getIp(req),
    }).catch(() => {});

    if (isReactivation && typeof sendVendorReactivationEmailForVendor === "function") {
      try {
        sendVendorReactivationEmailForVendor({
          vendorId: updated.id,
          vendorName: updated.name,
          contactEmail,
          ownerId,
        }).catch((err) => req.log?.warn?.({ err, vendorId: updated.id }, "Failed to send vendor reactivation email"));
      } catch {}
    }

    try {
      emitVendorEvent("vendor:updated", updated);
      emitAnalyticsEvent({ vendorId: updated.id, reason: isReactivation ? "vendor_reactivated" : "vendor_activated" });
    } catch {}

    res.json({ vendor: updated });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to activate vendor");
    res.status(500).json({ error: "Failed to activate vendor" });
  }
};

router.post("/admin/vendors/:id/activate", requireAdminKey, handleVendorActivation);
router.post("/admin/vendors/:id/reactivate", requireAdminKey, handleVendorActivation);

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
    let vendor: any = null;
    let vendorProducts: any[] = [];
    let allOrders: any[] = [];

    try {
      vendor = (await mongoSellers.findById(id)) ||
               (await mongoSellers.findByVendorId(id)) ||
               (await mongoSellers.findBySellerId(id)) ||
               (await mongoSellers.findByOwnerId(id));
      const prods = await mongoProducts.findMany({});
      const vVendorId = vendor?.vendorId;
      const vSellerId = vendor?.sellerId;
      vendorProducts = prods.filter((p: any) => p.vendorId === id || p.vendorId === vVendorId || p.vendorId === vSellerId || p.sellerId === id || p.sellerId === vSellerId);
      allOrders = await mongoOrders.findMany({});
    } catch {}

    if (!vendor) {
      try {
        const rows = await db.select().from(vendorsTable).where(or(eq(vendorsTable.id, id), eq(vendorsTable.vendorId, id), eq(vendorsTable.ownerId, id))).limit(1);
        if (rows.length > 0) vendor = rows[0];
        vendorProducts = await db
          .select({ id: productsTable.id, active: productsTable.active })
          .from(productsTable)
          .where(eq(productsTable.vendorId as any, id));
        allOrders = await db.select().from(ordersTable);
      } catch {}
    }

    if (!vendor) return res.status(404).json({ error: "Vendor not found" });

    const productIds = new Set(vendorProducts.map(p => p.id));
    const statusBreakdown: Record<string, number> = {};
    let totalRevenue = 0;
    const monthlyRevenue: Record<string, number> = {};

    for (const order of allOrders) {
      const items = order.items as Array<{ productId: string; price: number; quantity: number }>;
      if (!Array.isArray(items)) continue;
      const vendorItems = items.filter(i => productIds.has(i.productId));
      if (vendorItems.length === 0) continue;

      statusBreakdown[order.status] = (statusBreakdown[order.status] ?? 0) + 1;
      const orderStatus = String(order.status || "").toLowerCase();
      const paymentStatus = String(order.paymentStatus || order.payment?.status || "").toLowerCase();
      const isRefunded = order.refundStatus === "processed" || order.refundStatus === "approved";
      if (!["cancelled", "returned", "failed"].includes(orderStatus) && paymentStatus !== "failed" && !isRefunded) {
        const itemRevenue = vendorItems.reduce((sum, i) => sum + getItemBasePrice(i) * Math.max(1, Number(i.quantity) || 1), 0);
        totalRevenue = roundCurrency(totalRevenue + itemRevenue);
        const monthKey = new Date(order.createdAt).toISOString().slice(0, 7);
        monthlyRevenue[monthKey] = roundCurrency((monthlyRevenue[monthKey] ?? 0) + itemRevenue);
      }
    }

    const COMMISSION_RATE = 0.18;
    const sortedMonths = Object.keys(monthlyRevenue).sort().slice(-6);

    res.json({
      id: vendor.id,
      name: vendor.name || vendor.shopName || "Seller Store",
      location: vendor.location || "India",
      rating: vendor.rating ?? 4.5,
      sareesCount: vendor.sareesCount ?? 0,
      avatar: vendor.avatar || "/images/artisan-1.png",
      bio: vendor.bio ?? null,
      tagline: vendor.tagline ?? null,
      contactEmail: vendor.contactEmail || vendor.email || null,
      gstin: vendor.gstin ?? null,
      status: vendor.status || "approved",
      ownerId: vendor.ownerId ?? null,
      kycVerified: !!vendor.kycVerified,
      kycResubmissionRequested: !!vendor.kycResubmissionRequested,
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
      vendorId: getCanonicalSellerId(vendor) || vendor.vendorId || vendor.sellerId || vendor.id || null,
      sellerId: getCanonicalSellerId(vendor) || vendor.sellerId || vendor.vendorId || vendor.id || null,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to fetch admin vendor detail");
    res.status(500).json({ error: "Failed to fetch vendor" });
  }
});

router.get("/admin/stats", requireAdminKey, async (req: any, res: any) => {
  try {
    let orders: any[] = [];
    let products: any[] = [];
    let vendors: any[] = [];
    let users: any[] = [];

    try {
      orders = await mongoOrders.findMany({ isDemo: { $ne: true }, isTest: { $ne: true } });
    } catch (err) {
      req.log?.warn?.({ err }, "Failed to fetch mongoOrders for stats");
    }
    try { products = await mongoProducts.findMany({}); } catch (err) { req.log?.warn?.({ err }, "Failed to fetch mongoProducts for stats"); }
    try { vendors = await mongoSellers.findMany({}); } catch (err) { req.log?.warn?.({ err }, "Failed to fetch mongoSellers for stats"); }
    try { users = await mongoUsers.findMany({}); } catch (err) { req.log?.warn?.({ err }, "Failed to fetch mongoUsers for stats"); }

    if (orders.length === 0 && products.length === 0 && vendors.length === 0) {
      try {
        orders = await db.select().from(ordersTable);
        products = await db.select().from(productsTable);
        vendors = await db.select().from(vendorsTable);
      } catch (err) {
        req.log?.warn?.({ err }, "Fallback SQL query for stats failed");
      }
    }

    // Only compute metrics for genuine realtime customer orders
    orders = filterRealtimeOrders(orders);

    const now = new Date();
    const cutoff24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cutoff60d = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    const customerIds = new Set<string>();
    let totalRevenue = 0;
    let deliveredOrders = 0;
    let cancelledOrders = 0;
    let returnedOrders = 0;
    let confirmedOrders = 0;
    let lateAcceptanceOrders = 0;
    let dispatchedOrders = 0;
    let refundedRevenue = 0;
    let current30dRevenue = 0;
    let prev30dRevenue = 0;

    const dailyRevenueMap = new Map<string, { revenue: number; orders: number }>();

    for (const o of orders) {
      if (o.userId) customerIds.add(o.userId);
      const status = o.status;
      const total = typeof o.total === "number" ? o.total : parseFloat(o.total as any) || 0;
      const createdAt = new Date(o.createdAt);

      if (status === "delivered") deliveredOrders++;
      else if (status === "cancelled") cancelledOrders++;
      else if (status === "returned") returnedOrders++;
      else if (status === "confirmed") {
        confirmedOrders++;
        if (createdAt < cutoff24h) lateAcceptanceOrders++;
      } else if (status === "dispatched") dispatchedOrders++;

      if (!["cancelled", "returned"].includes(status)) {
        totalRevenue += total;
        if (createdAt >= cutoff30d) {
          current30dRevenue += total;
          const dateStr = !isNaN(createdAt.getTime()) ? createdAt.toISOString().slice(0, 10) : "Today";
          const cur = dailyRevenueMap.get(dateStr) ?? { revenue: 0, orders: 0 };
          cur.revenue += total;
          cur.orders += 1;
          dailyRevenueMap.set(dateStr, cur);
        } else if (createdAt >= cutoff60d && createdAt < cutoff30d) {
          prev30dRevenue += total;
        }
      }

      if (o.refundStatus === "processed" || o.refundStatus === "approved") {
        refundedRevenue += total;
      }
    }

    const totalVendors = vendors.length;
    const approvedVendors = vendors.filter((v: any) => v.status === "approved" || v.status === "active").length;
    const pendingVendors = vendors.filter((v: any) => v.status === "pending" || v.status === "under_review").length;

    const activeProducts = products.filter((p: any) => p.active !== false && p.status !== "inactive").length;

    const growthPct = prev30dRevenue > 0
      ? Math.round(((current30dRevenue - prev30dRevenue) / prev30dRevenue) * 100)
      : current30dRevenue > 0 ? 100 : 0;

    const dailyRevenue = [...dailyRevenueMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({ date, revenue: d.revenue, orders: d.orders }));

    res.json({
      totalOrders: orders.length,
      totalRevenue,
      totalCustomers: customerIds.size || users.length,
      totalUsers: users.length || customerIds.size,
      deliveredOrders,
      completedOrders: deliveredOrders,
      pendingOrders: confirmedOrders,
      cancelledOrders,
      returnedOrders,
      confirmedOrders,
      lateAcceptanceOrders,
      dispatchedOrders,
      refundedRevenue,
      totalProducts: products.length,
      activeProducts,
      totalVendors,
      approvedVendors,
      activeVendors: approvedVendors,
      pendingVendors,
      growthPct,
      dailyRevenue,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to fetch admin stats");
    res.json({
      totalOrders: 0,
      totalRevenue: 0,
      totalCustomers: 0,
      totalUsers: 0,
      deliveredOrders: 0,
      completedOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      returnedOrders: 0,
      confirmedOrders: 0,
      lateAcceptanceOrders: 0,
      dispatchedOrders: 0,
      refundedRevenue: 0,
      totalProducts: 0,
      activeProducts: 0,
      totalVendors: 0,
      approvedVendors: 0,
      activeVendors: 0,
      pendingVendors: 0,
      growthPct: 0,
      dailyRevenue: [],
    });
  }
});

export default router;
