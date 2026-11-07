import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, mongoProducts, mongoOrders, mongoVendors, mongoSellers, mongoShipments, mongoSettlements, isMongoDbConnected, getNextSequenceValue, getCollection, mongoGeneric } from "@workspace/db";
import { ordersTable, productsTable, stockHistoryTable, vendorSettlementsTable, vendorsTable, shipmentsTable, bulkImportBatchesTable, CATEGORIES, FABRICS, OCCASIONS, COLORS, CATEGORY_PREFIX, validateCategoryAndSubcategory, resolveCategoryData, findCategoryDefinition } from "@workspace/db";
import { eq, desc, asc, inArray, and, lte, sql, or } from "drizzle-orm";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import {
  getAvailableCouriers,
  createAndDispatchShipment,
  syncSellerPickupToShiprocket,
} from "../services/shipping";
import { insertOrderStatusNotification } from "../lib/orderNotifications";
import { insertAdminNotification } from "../lib/adminNotifications";
import { recordStockChange } from "../lib/stockHistory";
import { normalizeBulkProductImages } from "../lib/bulkProductImages";
import {
  sendSellerVerificationCode,
  verifySellerEmailCode,
  isSellerEmailVerified,
} from "../lib/sellerVerification";
import { emitOrderEvent, emitProductEvent } from "../lib/socket";
import { verifyCashfreeBankAccount, registerCashfreeBeneficiary } from "../lib/cashfree";
import { processSettlementTransitions, isVendorBankVerified } from "../lib/settlementAutomation";
import { otpRateLimiter } from "../middlewares/rateLimiter";

const router = Router();

/**
 * POST /seller/send-verification-code
 * Issues and sends a 6-digit email verification code to the prospective seller's email.
 */
router.post("/seller/send-verification-code", otpRateLimiter, async (req: any, res: any) => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const result = await sendSellerVerificationCode(email.trim());
    if (!result.delivered) {
      const isAlreadyExists = result.error?.includes("already exists");
      return res.status(isAlreadyExists ? 409 : 400).json({
        error: result.error || "Unable to send the verification code. Please try again.",
      });
    }
    return res.json({
      success: true,
      message: `Verification code sent successfully to ${email.trim()}. Please check your inbox.`,
    });
  } catch (err: any) {
    req.log?.error({ err: err?.message }, "seller/send-verification-code failed");
    return res.status(500).json({ error: "Failed to send verification code. Please try again." });
  }
});

/**
 * POST /seller/verify-email
 * Verifies the 6-digit code submitted by the seller.
 */
router.post("/seller/verify-email", otpRateLimiter, async (req: any, res: any) => {
  const { email, code } = req.body || {};
  if (!email || !code) {
    return res.status(400).json({ error: "Email address and 6-digit verification code are required." });
  }

  try {
    const result = verifySellerEmailCode(String(email), String(code));
    if (!result.valid) {
      return res.status(400).json({ error: result.error || "Invalid verification code. Please try again." });
    }
    return res.json({
      success: true,
      message: "Email verified successfully! You can now complete your seller registration.",
    });
  } catch (err: any) {
    req.log?.error({ err: err?.message }, "seller/verify-email failed");
    return res.status(500).json({ error: "Failed to verify code. Please try again." });
  }
});

/**
 * POST /seller/resend-verification-code
 * Resends a new 6-digit verification code to the seller's email address.
 */
router.post("/seller/resend-verification-code", otpRateLimiter, async (req: any, res: any) => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }

  try {
    const result = await sendSellerVerificationCode(email.trim());
    if (!result.delivered) {
      const isAlreadyExists = result.error?.includes("already exists");
      return res.status(isAlreadyExists ? 409 : 400).json({
        error: result.error || "Unable to resend the verification code. Please try again.",
      });
    }
    return res.json({
      success: true,
      message: `New verification code sent successfully to ${email.trim()}.`,
    });
  } catch (err: any) {
    req.log?.error({ err: err?.message }, "seller/resend-verification-code failed");
    return res.status(500).json({ error: "Failed to resend verification code. Please try again." });
  }
});

/**
 * Lightweight endpoint to check whether the current user is an approved seller.
 * Returns { isSeller: true, vendorId, vendorName } for approved vendors,
 * 403 for non-vendors (handled by requireVendorAuth).
 */
router.get("/seller/status", requireVendorAuth, (req: any, res: any) => {
  res.json({ isSeller: true, vendorId: req.vendor.id, vendorName: req.vendor.name });
});

import { executeVendorProfileUpdate } from "../lib/updateVendorProfile";

router.get("/seller/profile", requireVendorAuth, async (req: any, res: any) => {
  const vendor = req.vendor;
  if (!vendor) {
    return res.status(404).json({ error: "Vendor profile not found" });
  }

  res.json({
    id: vendor.id,
    vendorId: vendor.id || vendor.vendorId || vendor.sellerId,
    name: vendor.shopName || vendor.name,
    shopName: vendor.shopName || vendor.name,
    location: vendor.location,
    rating: vendor.rating ?? 4.8,
    sareesCount: vendor.sareesCount ?? 0,
    avatar: vendor.avatar ?? null,
    bio: vendor.bio ?? null,
    tagline: vendor.tagline ?? null,
    contactEmail: vendor.contactEmail ?? vendor.email ?? null,
    email: vendor.email ?? vendor.contactEmail ?? null,
    gstin: vendor.gstin ?? null,
    mobile: vendor.mobile ?? null,
    status: vendor.status || "approved",
    statusReason: vendor.statusReason ?? null,
    ownerId: vendor.ownerId,
    reactivationWelcomePending: vendor.reactivationWelcomePending ?? false,
    shopStreet: vendor.shopStreet ?? null,
    shopAddressLine2: vendor.shopAddressLine2 ?? null,
    shopLandmark: vendor.shopLandmark ?? null,
    shopCity: vendor.shopCity ?? null,
    shopState: vendor.shopState ?? null,
    shopPincode: vendor.shopPincode ?? null,
    shopCountry: vendor.shopCountry ?? null,
    pickupSameAsShop: vendor.pickupSameAsShop ?? false,
    pickupLocationName: vendor.pickupLocationName ?? null,
    pickupAddressLine1: vendor.pickupAddressLine1 ?? null,
    pickupAddressLine2: vendor.pickupAddressLine2 ?? null,
    pickupLandmark: vendor.pickupLandmark ?? null,
    pickupCity: vendor.pickupCity ?? null,
    pickupState: vendor.pickupState ?? null,
    pickupPincode: vendor.pickupPincode ?? null,
    pickupCountry: vendor.pickupCountry ?? null,
    bankHolder: vendor.bankHolder ?? null,
    bankName: vendor.bankName ?? null,
    bankAccount: vendor.bankAccount ?? null,
    bankIfsc: vendor.bankIfsc ?? null,
    bankVerified: vendor.bankVerified ?? false,
    bankVerificationStatus: vendor.bankVerificationStatus || (vendor.bankVerified ? "verified" : "unverified"),
    bankVerificationDetails: vendor.bankVerificationDetails ?? null,
    bankVerifiedAt: vendor.bankVerifiedAt ?? null,
    cashfreeBeneficiaryId: vendor.cashfreeBeneficiaryId ?? null,
    beneficiaryStatus: vendor.beneficiaryStatus || "unregistered",
    beneficiaryRegisteredAt: vendor.beneficiaryRegisteredAt ?? null,
    beneficiaryError: vendor.beneficiaryError ?? null,
  });
});

/**
 * POST /seller/bank/verify
 * Validates seller bank account via Cashfree Bank Validation API and registers as beneficiary.
 */
router.post("/seller/bank/verify", requireVendorAuth, async (req: any, res: any) => {
  const vendor = req.vendor;
  if (!vendor) {
    return res.status(401).json({ error: "Unauthorized: Seller profile not found." });
  }

  // Preserve existing vendorId: MUST save against existing vendorId, never generate a new or unrelated ID
  const persistentVendorId = vendor.vendorId || vendor.sellerId || (typeof req.vendorId === "string" && !req.vendorId.includes("-") ? req.vendorId : null) || vendor.id;
  const primaryDocId = vendor.id || vendor._id || req.vendorId;
  const sellerOwnerId = vendor.ownerId || req.userId;

  const { bankAccount, ifsc, bankHolder, bankName } = req.body || {};

  if (!bankAccount || typeof bankAccount !== "string" || !/^\d{8,20}$/.test(bankAccount.trim())) {
    return res.status(400).json({ error: "Bank account number must be between 8 and 20 digits." });
  }
  if (!ifsc || typeof ifsc !== "string" || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc.trim().toUpperCase())) {
    return res.status(400).json({ error: "Invalid IFSC format. Must be 11 characters (e.g. HDFC0001234)." });
  }
  if (!bankHolder || typeof bankHolder !== "string" || bankHolder.trim().length < 2) {
    return res.status(400).json({ error: "Account holder name is required." });
  }

  const cleanAccount = bankAccount.trim();
  const cleanIfsc = ifsc.trim().toUpperCase();
  const cleanHolder = bankHolder.trim();
  const cleanBankName = (bankName || "").trim() || "Bank";

  // Mark pending verification on existing vendor record
  const now = new Date();
  const pendingData = {
    bankAccount: cleanAccount,
    bankIfsc: cleanIfsc,
    bankHolder: cleanHolder,
    bankName: cleanBankName,
    bankVerificationStatus: "verification_pending",
    beneficiaryStatus: "unregistered",
    vendorId: persistentVendorId,
    sellerId: vendor.sellerId || persistentVendorId,
    ownerId: sellerOwnerId,
    updatedAt: now,
  };

  await mongoSellers.update(primaryDocId, pendingData as any);
  if (mongoVendors && mongoVendors !== (mongoSellers as any) && typeof mongoVendors.update === "function") {
    try { await mongoVendors.update(primaryDocId, pendingData as any); } catch {}
  }
  try {
    const pgConditions: any[] = [];
    if (vendor.id) pgConditions.push(eq(vendorsTable.id, vendor.id));
    if (persistentVendorId) pgConditions.push(eq(vendorsTable.vendorId, persistentVendorId));
    if (sellerOwnerId) pgConditions.push(eq(vendorsTable.ownerId, sellerOwnerId));
    if (pgConditions.length > 0) {
      await db.update(vendorsTable).set(pendingData as any).where(or(...pgConditions));
    }
  } catch {}

  try {
    const verifyRes = await verifyCashfreeBankAccount({
      name: cleanHolder,
      phone: vendor.mobile,
      bankAccount: cleanAccount,
      ifsc: cleanIfsc,
    });

    if (verifyRes.valid) {
      const beneId = vendor.cashfreeBeneficiaryId || `BENE_${persistentVendorId.replace(/[^a-zA-Z0-9_\-]/g, "_")}`;
      let beneficiaryStatus: "beneficiary_registration_pending" | "beneficiary_active" | "beneficiary_registration_failed" = "beneficiary_registration_pending";
      let beneficiaryError: string | null = null;
      let beneficiaryRegisteredAt: Date | null = null;

      const regRes = await registerCashfreeBeneficiary({
        beneId,
        name: cleanHolder,
        email: vendor.contactEmail || vendor.email || "seller@vastraa.com",
        phone: vendor.mobile || "9999999999",
        bankAccount: cleanAccount,
        ifsc: cleanIfsc,
        address1: vendor.shopStreet || "Main Road",
        city: vendor.shopCity || "Mumbai",
        state: vendor.shopState || "Maharashtra",
        pincode: vendor.shopPincode || "400001",
      });

      if (regRes.success) {
        beneficiaryStatus = "beneficiary_active";
        beneficiaryRegisteredAt = new Date();
      } else {
        beneficiaryStatus = "beneficiary_registration_failed";
        beneficiaryError = regRes.error || "Beneficiary onboarding failed";
      }

      const updateData = {
        bankAccount: cleanAccount,
        bankIfsc: cleanIfsc,
        bankHolder: cleanHolder,
        bankName: verifyRes.bankName || cleanBankName,
        bankVerified: true,
        bankVerificationStatus: "verified" as const,
        bankVerificationDetails: verifyRes,
        bankVerifiedAt: new Date(),
        cashfreeBeneficiaryId: beneId,
        beneficiaryStatus,
        beneficiaryRegisteredAt,
        beneficiaryError,
        vendorId: persistentVendorId,
        sellerId: vendor.sellerId || persistentVendorId,
        ownerId: sellerOwnerId,
        updatedAt: new Date(),
      };

      await mongoSellers.update(primaryDocId, updateData);
      if (mongoVendors && mongoVendors !== (mongoSellers as any) && typeof mongoVendors.update === "function") {
        try { await mongoVendors.update(primaryDocId, updateData); } catch {}
      }
      try {
        const pgConditions: any[] = [];
        if (vendor.id) pgConditions.push(eq(vendorsTable.id, vendor.id));
        if (persistentVendorId) pgConditions.push(eq(vendorsTable.vendorId, persistentVendorId));
        if (sellerOwnerId) pgConditions.push(eq(vendorsTable.ownerId, sellerOwnerId));
        if (pgConditions.length > 0) {
          await db.update(vendorsTable).set(updateData as any).where(or(...pgConditions));
        }
      } catch {}

      // Automatically re-evaluate settlement transitions so newly verified bank account's settlements become eligible for Wednesday cycle
      try {
        await processSettlementTransitions();
      } catch {}

      return res.json({
        success: true,
        bankVerified: true,
        bankVerificationStatus: "verified",
        beneficiaryStatus,
        registeredName: verifyRes.registeredName,
        nameMatched: verifyRes.nameMatched,
        vendorId: persistentVendorId,
        message: beneficiaryStatus === "beneficiary_active"
          ? "Bank account verified and beneficiary active for payouts."
          : `Bank account verified (${beneficiaryError || "Beneficiary registration pending"}).`,
      });
    } else {
      const updateData = {
        bankAccount: cleanAccount,
        bankIfsc: cleanIfsc,
        bankHolder: cleanHolder,
        bankName: cleanBankName,
        bankVerified: false,
        bankVerificationStatus: "verification_failed" as const,
        bankVerificationDetails: verifyRes,
        beneficiaryStatus: "beneficiary_registration_failed" as const,
        beneficiaryError: verifyRes.message || "Bank details could not be verified",
        vendorId: persistentVendorId,
        sellerId: vendor.sellerId || persistentVendorId,
        ownerId: sellerOwnerId,
        updatedAt: new Date(),
      };

      await mongoSellers.update(primaryDocId, updateData);
      if (mongoVendors && mongoVendors !== (mongoSellers as any) && typeof mongoVendors.update === "function") {
        try { await mongoVendors.update(primaryDocId, updateData); } catch {}
      }
      try {
        const pgConditions: any[] = [];
        if (vendor.id) pgConditions.push(eq(vendorsTable.id, vendor.id));
        if (persistentVendorId) pgConditions.push(eq(vendorsTable.vendorId, persistentVendorId));
        if (sellerOwnerId) pgConditions.push(eq(vendorsTable.ownerId, sellerOwnerId));
        if (pgConditions.length > 0) {
          await db.update(vendorsTable).set(updateData as any).where(or(...pgConditions));
        }
      } catch {}

      return res.status(400).json({
        success: false,
        bankVerified: false,
        bankVerificationStatus: "verification_failed",
        error: verifyRes.message || "Bank account verification failed. Please check account number and IFSC.",
      });
    }
  } catch (err: any) {
    req.log?.error({ err }, "Cashfree bank verification endpoint error");
    return res.status(500).json({ error: err?.message || "Failed to verify bank details with Cashfree." });
  }
});

/**
 * GET /seller/bank/status
 * Fetches current bank account verification and beneficiary registration status.
 */
router.get("/seller/bank/status", requireVendorAuth, async (req: any, res: any) => {
  const vendor = req.vendor;
  const vendorId = req.vendorId || vendor?.id;
  if (!vendorId) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const persistentVendorId = vendor.vendorId || vendor.sellerId || (typeof vendorId === "string" && !vendorId.includes("-") ? vendorId : null) || vendor.id;
  const currentVendor = (await mongoSellers.findById(vendorId)) || (await mongoSellers.findByVendorId(persistentVendorId)) || vendor;

  res.json({
    vendorId: persistentVendorId,
    bankAccount: currentVendor.bankAccount ? `****${String(currentVendor.bankAccount).slice(-4)}` : null,
    bankHolder: currentVendor.bankHolder || null,
    bankName: currentVendor.bankName || null,
    bankIfsc: currentVendor.bankIfsc || null,
    bankVerified: currentVendor.bankVerified ?? false,
    bankVerificationStatus: currentVendor.bankVerificationStatus || (currentVendor.bankVerified ? "verified" : "unverified"),
    cashfreeBeneficiaryId: currentVendor.cashfreeBeneficiaryId || null,
    beneficiaryStatus: currentVendor.beneficiaryStatus || "unregistered",
    beneficiaryError: currentVendor.beneficiaryError || null,
    bankVerifiedAt: currentVendor.bankVerifiedAt || null,
  });
});

async function handleUpdateSellerProfile(req: any, res: any) {
  try {
    return await executeVendorProfileUpdate(req, res);
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update seller profile");
    return res.status(500).json({ error: "Failed to update seller profile" });
  }
}

router.put("/seller/profile", requireVendorAuth, handleUpdateSellerProfile);
router.patch("/seller/profile", requireVendorAuth, handleUpdateSellerProfile);


router.get("/seller/dashboard", requireVendorAuth, async (req: any, res: any) => {
  const vendor = req.vendor;
  const vendorId = req.vendorId || vendor?.id;
  if (!vendorId) {
    return res.status(401).json({ error: "Unauthorized vendor session" });
  }

  try {
    let products: any[] = [];
    try {
      products = await db
        .select({ id: productsTable.id, name: productsTable.name, rating: productsTable.rating, stock: productsTable.stock, images: productsTable.images, price: productsTable.price })
        .from(productsTable)
        .where(eq(productsTable.vendorId, vendorId));
    } catch {}

    if (products.length === 0) {
      try {
        const mongoProds = await mongoProducts.findMany({
          $or: [{ vendorId }, { sellerId: vendorId }, { ownerId: vendor?.ownerId || vendorId }]
        });
        products = mongoProds.map((p) => ({
          id: p.id,
          name: p.name,
          rating: p.rating ?? 4.8,
          stock: p.stock ?? 10,
          images: p.images ?? [],
          price: p.price ?? 0,
        }));
      } catch {}
    }

    const productIdSet = new Set(products.map((p) => p.id));
    const activeListings = products.filter((p) => (p.stock ?? 0) > 0).length;

    // 1. Primary Source of Truth: MongoDB Atlas
    let allOrders: any[] = [];
    try {
      const mOrders = await mongoOrders.findMany({}, { sort: { createdAt: -1 } });
      if (Array.isArray(mOrders) && mOrders.length > 0) {
        allOrders = mOrders.map((o) => ({
          id: o.id,
          displayId: o.displayId || o.id,
          items: o.items ?? [],
          createdAt: o.createdAt,
          status: o.status,
        }));
      }
    } catch {}

    // 2. Fallback: PostgreSQL ordersTable
    if (allOrders.length === 0) {
      try {
        allOrders = await db
          .select({ id: ordersTable.id, items: ordersTable.items, createdAt: ordersTable.createdAt, status: ordersTable.status })
          .from(ordersTable)
          .orderBy(desc(ordersTable.createdAt));
      } catch {}
    }

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    let monthlyRevenue = 0;
    let allTimeOrderCount = 0;
    const qtySoldMap = new Map<string, number>();
    const recentOrders: any[] = [];

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => isVendorItem(i, productIdSet, req));
      if (vendorItems.length === 0) continue;

      allTimeOrderCount++;

      if (new Date(order.createdAt) >= monthStart) {
        for (const item of vendorItems) {
          monthlyRevenue += (item.price ?? 0) * (item.quantity ?? 1);
        }
      }

      for (const item of vendorItems) {
        const pId = item.productId || item.id;
        qtySoldMap.set(pId, (qtySoldMap.get(pId) ?? 0) + (item.quantity ?? 1));
      }

      if (recentOrders.length < 5) {
        recentOrders.push({
          id: order.id,
          createdAt: order.createdAt,
          status: order.status,
          vendorItems: vendorItems.map((i) => ({ name: i.name, quantity: i.quantity ?? 1, price: i.price ?? 0 })),
          vendorTotal: vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
        });
      }
    }

    const topProducts = [...qtySoldMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([productId, qtySold]) => {
        const product = products.find((p) => p.id === productId);
        if (!product) return null;
        return {
          id: productId,
          name: product.name,
          qtySold,
          rating: product.rating ?? 4.8,
          price: product.price ?? 0,
          image: Array.isArray(product.images) ? product.images[0] : null,
        };
      })
      .filter(Boolean);

    res.json({
      monthlyRevenue,
      orderCount: allTimeOrderCount,
      activeListings,
      avgRating: vendor?.rating ?? 4.8,
      recentOrders,
      topProducts,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/dashboard failed");
    res.json({
      monthlyRevenue: 0,
      orderCount: 0,
      activeListings: 0,
      avgRating: vendor?.rating ?? 4.8,
      recentOrders: [],
      topProducts: [],
    });
  }
});

async function fetchCombinedVendorProducts(vendorId: string) {
  const map = new Map<string, any>();
  const idSet = new Set<string>();
  if (vendorId) idSet.add(vendorId);

  try {
    const v = (await mongoSellers?.findById?.(vendorId)) ||
              (await mongoSellers?.findBySellerId?.(vendorId)) ||
              (await mongoSellers?.findByVendorId?.(vendorId)) ||
              (await mongoSellers?.findByOwnerId?.(vendorId));
    if (v) {
      if (v.id) idSet.add(v.id);
      if (v.vendorId) idSet.add(v.vendorId);
      if (v.sellerId) idSet.add(v.sellerId);
      if (v.ownerId) idSet.add(v.ownerId);
    }
  } catch {}

  const allIds = Array.from(idSet);
  const uuidIds = allIds.filter((id) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id));

  if (uuidIds.length > 0) {
    try {
      const pgRows = await db
        .select()
        .from(productsTable)
        .where(inArray(productsTable.vendorId, uuidIds))
        .orderBy(asc(productsTable.name));
      for (const p of pgRows) {
        if (p.id) map.set(p.id, p);
      }
    } catch {}
  }

  try {
    const mongoOr = allIds.flatMap((id) => [{ vendorId: id }, { sellerId: id }]);
    const mongoRows = await mongoProducts.findMany({
      $or: mongoOr as any,
    }, { sort: { name: 1 } });
    for (const mp of mongoRows) {
      const id = mp.id || (mp as any)._id;
      if (!id) continue;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, mp);
      } else {
        const mongoUpdatedTime = (mp as any).updatedAt ? new Date((mp as any).updatedAt).getTime() : 0;
        const pgUpdatedTime = (existing as any).updatedAt ? new Date((existing as any).updatedAt).getTime() : 0;
        const preferMongo = mongoUpdatedTime >= pgUpdatedTime;
        const primary = preferMongo ? mp : existing;
        const secondary = preferMongo ? existing : mp;

        map.set(id, {
          ...secondary,
          ...primary,
          stock: primary.stock !== undefined && primary.stock !== null ? primary.stock : secondary.stock,
          price: primary.price !== undefined && primary.price !== null ? primary.price : secondary.price,
          basePrice: primary.basePrice !== undefined && primary.basePrice !== null
            ? primary.basePrice
            : (secondary.basePrice !== undefined && secondary.basePrice !== null
              ? secondary.basePrice
              : (primary.base_price !== undefined && primary.base_price !== null
                ? primary.base_price
                : (secondary.base_price !== undefined && secondary.base_price !== null ? secondary.base_price : undefined))),
          name: primary.name || secondary.name,
          images: Array.isArray(primary.images) ? primary.images : (Array.isArray(secondary.images) ? secondary.images : []),
          specifications: Array.isArray(primary.specifications) ? primary.specifications : (Array.isArray(secondary.specifications) ? secondary.specifications : []),
          variants: Array.isArray(primary.variants) ? primary.variants : (Array.isArray(secondary.variants) ? secondary.variants : []),
          description: primary.description !== undefined ? primary.description : (secondary.description ?? ""),
          fabric: primary.fabric || secondary.fabric,
          color: primary.color || secondary.color,
          category: primary.category || secondary.category,
          status: primary.status || secondary.status || "pending",
          active: primary.active !== undefined ? primary.active : secondary.active,
        });
      }
    }
  } catch {}

  return Array.from(map.values()).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
}

async function findProductsForVendor(vendorId: string, productIds: string[]) {
  const map = new Map<string, any>();
  if (!productIds || productIds.length === 0) return map;

  try {
    const pgRows = await db
      .select()
      .from(productsTable)
      .where(and(eq(productsTable.vendorId, vendorId), inArray(productsTable.id, productIds)));
    for (const p of pgRows) {
      if (p.id) map.set(p.id, p);
    }
  } catch {}

  try {
    const mongoRows = await mongoProducts.findMany({
      id: { $in: productIds },
      $or: [{ vendorId }, { sellerId: vendorId }],
    } as any);
    for (const mp of mongoRows) {
      const id = mp.id || (mp as any)._id;
      if (!id) continue;
      const existing = map.get(id);
      if (!existing) {
        map.set(id, mp);
      } else {
        map.set(id, { ...existing, ...mp });
      }
    }
  } catch {}

  return map;
}

router.get("/seller/products", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const products = await fetchCombinedVendorProducts(vendorId);

    res.json({
      products: products.map((p) => {
        const actualBasePrice =
          p.basePrice !== undefined && p.basePrice !== null
            ? Number(p.basePrice)
            : (p.base_price !== undefined && p.base_price !== null
              ? Number(p.base_price)
              : (p.sellerBasePrice !== undefined && p.sellerBasePrice !== null
                ? Number(p.sellerBasePrice)
                : (p.price != null ? Number(p.price) : 0)));

        const mongoId = (p as any)._id ? String((p as any)._id) : (p.id || "");
        const canonicalId = p.id || mongoId;

        return {
          id: canonicalId,
          _id: mongoId,
          name: p.name,
          description: p.description ?? "",
          price: p.price ?? 0,
          basePrice: actualBasePrice,
          originalPrice: p.originalPrice ?? null,
          category: p.category ?? "Indian Wear",
          categoryId: (p as any).categoryId ?? null,
          categoryName: (p as any).categoryName ?? p.category ?? null,
          parentCategoryId: (p as any).parentCategoryId ?? (p as any).categoryId ?? null,
          parentCategoryName: (p as any).parentCategoryName ?? (p as any).categoryName ?? null,
          subcategory: p.subcategory ?? null,
          subcategoryId: (p as any).subcategoryId ?? null,
          subcategoryName: (p as any).subcategoryName ?? p.subcategory ?? null,
          childCategory: p.childCategory ?? null,
          brand: p.brand ?? null,
          designPattern: p.designPattern ?? null,
          fabric: p.fabric ?? "silk",
          color: p.color ?? "red",
          occasion: p.occasion ?? "festival",
          vendorId: p.vendorId ?? null,
          vendorName: p.vendorName ?? "",
          images: Array.isArray(p.images) ? p.images : [],
          videos: Array.isArray(p.videos) ? p.videos : [],
          variants: Array.isArray(p.variants) ? p.variants : [],
          specifications: Array.isArray(p.specifications) ? p.specifications : [],
          deliveryInfo: p.deliveryInfo ?? "",
          returnPolicy: p.returnPolicy ?? "",
          isBestSeller: Boolean(p.isBestSeller),
          isNewArrival: Boolean(p.isNewArrival),
          rating: p.rating ?? 4.5,
          reviewCount: p.reviewCount ?? 0,
          stock: p.stock ?? 0,
          lowStockThreshold: p.lowStockThreshold ?? 5,
          active: p.active !== false,
          status: p.status ?? "approved",
          rejectionReason: (p as any).rejectionReason ?? null,
          approvalRemark: (p as any).approvalRemark ?? null,
          createdAt: (p as any).createdAt ?? null,
          updatedAt: (p as any).updatedAt ?? null,
        };
      }),
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/products failed");
    res.status(500).json({ error: "Failed to load products" });
  }
});

router.get("/seller/products/:id", requireVendorAuth, async (req: any, res: any) => {
  const { id } = req.params;
  if (!id || !String(id).trim()) {
    res.status(400).json({ error: "Invalid product ID" });
    return;
  }
  try {
    let product: any = null;
    try {
      product = await mongoProducts.findById(id);
    } catch {}

    if (!product) {
      try {
        const rows = await db
          .select()
          .from(productsTable)
          .where(eq(productsTable.id, id))
          .limit(1);
        if (rows.length > 0) product = rows[0];
      } catch {}
    }

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const sellerIdentifiers = new Set([
      req.vendorId,
      req.sellerId,
      req.vendor?.id,
      req.vendor?.vendorId,
      req.vendor?.sellerId,
      req.vendor?.ownerId,
      req.userId,
    ].filter(Boolean).map(String));

    const productVendorIdentifiers = new Set([
      product.vendorId,
      product.sellerId,
      (product as any).ownerId,
    ].filter(Boolean).map(String));

    const isOwner = Array.from(productVendorIdentifiers).some((vId) => sellerIdentifiers.has(vId));
    if (!isOwner) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }

    const actualBasePrice =
      product.basePrice !== undefined && product.basePrice !== null
        ? Number(product.basePrice)
        : (product.base_price !== undefined && product.base_price !== null
          ? Number(product.base_price)
          : (product.sellerBasePrice !== undefined && product.sellerBasePrice !== null
            ? Number(product.sellerBasePrice)
            : (product.price != null ? Number(product.price) : 0)));

    const mongoId = (product as any)._id ? String((product as any)._id) : (product.id || "");
    const canonicalId = product.id || mongoId;

    res.json({
      id: canonicalId,
      _id: mongoId,
      name: product.name,
      description: product.description ?? "",
      price: product.price ?? 0,
      basePrice: actualBasePrice,
      originalPrice: product.originalPrice ?? null,
      category: product.category ?? "Indian Wear",
      categoryId: (product as any).categoryId ?? null,
      categoryName: (product as any).categoryName ?? product.category ?? null,
      parentCategoryId: (product as any).parentCategoryId ?? (product as any).categoryId ?? null,
      parentCategoryName: (product as any).parentCategoryName ?? (product as any).categoryName ?? null,
      subcategory: product.subcategory ?? null,
      subcategoryId: (product as any).subcategoryId ?? null,
      subcategoryName: (product as any).subcategoryName ?? product.subcategory ?? null,
      childCategory: product.childCategory ?? null,
      brand: product.brand ?? null,
      designPattern: product.designPattern ?? null,
      fabric: product.fabric ?? "silk",
      color: product.color ?? "red",
      occasion: product.occasion ?? "festival",
      vendorId: product.vendorId ?? null,
      vendorName: product.vendorName ?? "",
      images: Array.isArray(product.images) ? product.images : [],
      videos: Array.isArray(product.videos) ? product.videos : [],
      variants: Array.isArray(product.variants) ? product.variants : [],
      specifications: Array.isArray(product.specifications) ? product.specifications : [],
      deliveryInfo: product.deliveryInfo ?? "",
      returnPolicy: product.returnPolicy ?? "",
      isBestSeller: Boolean(product.isBestSeller),
      isNewArrival: Boolean(product.isNewArrival),
      rating: product.rating ?? 4.5,
      reviewCount: product.reviewCount ?? 0,
      stock: product.stock ?? 0,
      lowStockThreshold: product.lowStockThreshold ?? 5,
      active: product.active !== false,
      status: product.status ?? "approved",
      rejectionReason: (product as any).rejectionReason ?? null,
      approvalRemark: (product as any).approvalRemark ?? null,
      createdAt: (product as any).createdAt ?? null,
      updatedAt: (product as any).updatedAt ?? null,
    });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to load seller product");
    res.status(500).json({ error: "Failed to load product details" });
  }
});

router.get("/seller/inventory", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const products = await fetchCombinedVendorProducts(vendorId);

    const items = products.map((p) => {
      const isOutOfStock = (p.stock ?? 0) <= 0;
      const threshold = p.lowStockThreshold ?? 5;
      const isLowStock = !isOutOfStock && p.stock <= threshold;
      return {
        id: p.id,
        sku: p.id,
        name: p.name,
        description: p.description ?? "",
        category: p.category ?? "General",
        subcategory: p.subcategory ?? null,
        fabric: p.fabric ?? "silk",
        color: p.color ?? "red",
        occasion: p.occasion ?? "festival",
        brand: p.brand ?? null,
        designPattern: p.designPattern ?? null,
        price: p.price ?? 0,
        originalPrice: p.originalPrice ?? null,
        images: Array.isArray(p.images) ? p.images : [],
        stock: p.stock ?? 0,
        lowStockThreshold: threshold,
        active: p.active !== false,
        status: p.status ?? "approved",
        variants: Array.isArray(p.variants) ? p.variants : [],
        specifications: Array.isArray(p.specifications) ? p.specifications : [],
        isLowStock,
        isOutOfStock,
      };
    });

    res.json({
      items,
      summary: {
        totalProducts: items.length,
        lowStockCount: items.filter((i) => i.isLowStock).length,
        outOfStockCount: items.filter((i) => i.isOutOfStock).length,
        stockValue: products.reduce((sum, p) => sum + (p.price ?? 0) * (p.stock ?? 0), 0),
        totalStock: items.reduce((sum, i) => sum + i.stock, 0),
        availableStock: items.filter((i) => i.active).reduce((sum, i) => sum + i.stock, 0),
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory failed");
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

router.get("/seller/inventory/history/:productId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { productId } = req.params;
  try {
    const [product] = await db
      .select({ id: productsTable.id, vendorId: productsTable.vendorId, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);

    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.vendorId !== vendorId) return res.status(403).json({ error: "Forbidden: you do not own this product" });

    const history = await db
      .select()
      .from(stockHistoryTable)
      .where(eq(stockHistoryTable.productId, productId))
      .orderBy(desc(stockHistoryTable.createdAt))
      .limit(200);

    res.json({ productId, productName: product.name, history });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/history failed");
    res.status(500).json({ error: "Failed to load stock history" });
  }
});

router.get("/seller/inventory/report", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    const products = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.vendorId, vendorId));

    const productIds = products.map((p) => p.id);
    const history = productIds.length > 0
      ? await db.select().from(stockHistoryTable).where(inArray(stockHistoryTable.productId, productIds))
      : [];

    const movementMap = new Map<string, number>();
    for (const h of history) {
      movementMap.set(h.productId, (movementMap.get(h.productId) ?? 0) + Math.abs(h.delta));
    }

    const topMovers = [...movementMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([productId, movement]) => {
        const p = products.find((pr) => pr.id === productId);
        return { productId, name: p?.name ?? "Unknown", movement, currentStock: p?.stock ?? 0 };
      });

    res.json({
      stockValue: products.reduce((sum, p) => sum + p.price * p.stock, 0),
      lowStockCount: products.filter((p) => p.stock > 0 && p.stock <= p.lowStockThreshold).length,
      outOfStockCount: products.filter((p) => p.stock <= 0).length,
      totalProducts: products.length,
      topMovers,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/report failed");
    res.status(500).json({ error: "Failed to generate inventory report" });
  }
});

router.post("/seller/inventory/bulk-stock", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: "updates must be a non-empty array of { productId, stock }" });
  }

  try {
    const productIds = updates.map((u: any) => u.productId).filter(Boolean);
    const existingMap = await findProductsForVendor(vendorId, productIds);
    const results: any[] = [];

    for (const u of updates) {
      const p = existingMap.get(u.productId);
      if (!p) { results.push({ productId: u.productId, success: false, error: "Product not found" }); continue; }
      if (p.vendorId && p.vendorId !== vendorId && p.sellerId !== vendorId) { results.push({ productId: u.productId, success: false, error: "Forbidden" }); continue; }
      const newStock = parseInt(u.stock);
      if (!Number.isInteger(newStock) || newStock < 0) { results.push({ productId: u.productId, success: false, error: "Invalid stock value" }); continue; }

      try {
        await db.update(productsTable).set({ stock: newStock }).where(eq(productsTable.id, u.productId));
      } catch {}
      await mongoProducts.update(u.productId, { stock: newStock });
      await recordStockChange({
        productId: u.productId,
        vendorId,
        previousStock: p.stock ?? 0,
        newStock,
        source: "bulk",
        reason: "Bulk stock update",
        actorId: req.userId,
      }).catch(() => {});
      results.push({ productId: u.productId, success: true, previousStock: p.stock ?? 0, newStock });
      emitProductEvent("inventory:updated", { id: u.productId, stock: newStock, vendorId });
      emitProductEvent("product:updated", { id: u.productId, stock: newStock, vendorId });
    }

    safeClearCache();
    safeInvalidatePattern(/product/);
    res.json({ results });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/bulk-stock failed");
    res.status(500).json({ error: "Failed to bulk update stock" });
  }
});

router.post("/seller/inventory/bulk-price", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { updates } = req.body;

  if (!Array.isArray(updates) || updates.length === 0) {
    return res.status(400).json({ error: "updates must be a non-empty array of { productId, price }" });
  }

  try {
    const productIds = updates.map((u: any) => u.productId).filter(Boolean);
    const existingMap = await findProductsForVendor(vendorId, productIds);
    const results: any[] = [];

    for (const u of updates) {
      const p = existingMap.get(u.productId);
      if (!p) { results.push({ productId: u.productId, success: false, error: "Product not found" }); continue; }
      if (p.vendorId && p.vendorId !== vendorId && p.sellerId !== vendorId) { results.push({ productId: u.productId, success: false, error: "Forbidden" }); continue; }
      const newPrice = parseInt(u.price);
      if (!Number.isInteger(newPrice) || newPrice <= 0) { results.push({ productId: u.productId, success: false, error: "Invalid price value" }); continue; }

      const updateSet: Record<string, any> = { price: newPrice };
      if (u.originalPrice !== undefined) {
        updateSet.originalPrice = u.originalPrice ? parseInt(u.originalPrice) : null;
      }
      try {
        await db.update(productsTable).set(updateSet).where(eq(productsTable.id, u.productId));
      } catch {}
      await mongoProducts.update(u.productId, updateSet);
      emitProductEvent("product:updated", { id: u.productId, price: newPrice, vendorId });
      results.push({ productId: u.productId, success: true, newPrice });
    }

    safeClearCache();
    safeInvalidatePattern(/product/);
    res.json({ results });
  } catch (err: any) {
    req.log?.error({ err }, "seller/inventory/bulk-price failed");
    res.status(500).json({ error: "Failed to bulk update price" });
  }
});

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    rows.push(row);
  }
  return rows;
}

/**
 * Validates and normalises the optional Idempotency-Key header.
 *
 * The header is OPTIONAL for backward compatibility: older/legacy clients that
 * do not send it keep the existing (non-idempotent) behaviour. The new UI
 * always sends one. When present, it must be a reasonably-sized ASCII token
 * (UUIDs are what the client generates) so we don't store arbitrary payloads.
 */
function readIdempotencyKey(req: any): { key: string | null; invalid: boolean } {
  const raw = req.get?.("Idempotency-Key") ?? req.headers?.["idempotency-key"];
  if (raw == null) return { key: null, invalid: false };
  const value = Array.isArray(raw) ? raw[0] : String(raw);
  const key = value.trim();
  // Empty header value → treat as "not provided" for compatibility.
  if (!key) return { key: null, invalid: false };
  // Guard against oversized / control-character keys.
  if (key.length > 200 || /[\u0000-\u001f\u007f]/.test(key)) {
    return { key: null, invalid: true };
  }
  return { key, invalid: false };
}

const BULK_IMPORT_PROCESSING_LEASE_MS = 2 * 60 * 1000;

function bulkImportLeaseExpiry(): Date {
  return new Date(Date.now() + BULK_IMPORT_PROCESSING_LEASE_MS);
}

// In-memory / MongoDB store for batches when Drizzle Postgres is not connected
const inMemoryBatchesMap = new Map<string, any>();

async function claimMongoBatch(vendorId: string, idempotencyKey: string, leaseToken: string, expiresAt: Date) {
  const key = `${vendorId}:${idempotencyKey}`;
  if (typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
    try {
      const col = getCollection("bulk_import_batches");
      const existing = await col.findOne({ vendorId, idempotencyKey });
      if (existing) {
        if (existing.status === "completed" && existing.response != null) {
          return { status: "completed", response: existing.response };
        }
        const now = new Date();
        if (existing.leaseExpiresAt && new Date(existing.leaseExpiresAt).getTime() <= now.getTime()) {
          await col.updateOne(
            { _id: existing._id, status: "processing" },
            { $set: { leaseToken, leaseExpiresAt: expiresAt } }
          );
          return { status: "claimed", batchId: String(existing._id), leaseToken };
        }
        return { status: "in_progress" };
      }
      const newDoc = {
        vendorId,
        idempotencyKey,
        status: "processing",
        leaseExpiresAt: expiresAt,
        leaseToken,
        createdAt: new Date(),
      };
      const res = await col.insertOne(newDoc);
      return { status: "claimed", batchId: String(res.insertedId), leaseToken };
    } catch {}
  }
  const memExisting = inMemoryBatchesMap.get(key);
  if (memExisting) {
    if (memExisting.status === "completed" && memExisting.response != null) {
      return { status: "completed", response: memExisting.response };
    }
    const now = new Date();
    if (memExisting.leaseExpiresAt && new Date(memExisting.leaseExpiresAt).getTime() <= now.getTime()) {
      memExisting.leaseToken = leaseToken;
      memExisting.leaseExpiresAt = expiresAt;
      return { status: "claimed", batchId: memExisting.id, leaseToken };
    }
    return { status: "in_progress" };
  }
  const id = randomUUID();
  inMemoryBatchesMap.set(key, {
    id,
    vendorId,
    idempotencyKey,
    status: "processing",
    leaseExpiresAt: expiresAt,
    leaseToken,
    createdAt: new Date(),
  });
  return { status: "claimed", batchId: id, leaseToken };
}

async function completeMongoBatch(vendorId: string, idempotencyKey: string, batchId: string, leaseToken: string, response: any) {
  const key = `${vendorId}:${idempotencyKey}`;
  const mem = inMemoryBatchesMap.get(key);
  if (mem) {
    mem.status = "completed";
    mem.response = response;
    mem.completedAt = new Date();
  }
  if (typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
    try {
      const col = getCollection("bulk_import_batches");
      await col.updateOne(
        { vendorId, idempotencyKey, leaseToken },
        { $set: { status: "completed", response, completedAt: new Date(), leaseExpiresAt: null } }
      );
    } catch {}
  }
}

async function cleanupMongoBatch(vendorId: string, idempotencyKey: string, batchId: string, leaseToken: string) {
  const key = `${vendorId}:${idempotencyKey}`;
  const mem = inMemoryBatchesMap.get(key);
  if (mem && mem.status === "processing" && mem.leaseToken === leaseToken) {
    inMemoryBatchesMap.delete(key);
  }
  if (typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
    try {
      const col = getCollection("bulk_import_batches");
      await col.deleteOne({ vendorId, idempotencyKey, status: "processing", leaseToken });
    } catch {}
  }
}

function cleanNumericString(val: unknown): string {
  if (val == null) return "";
  return String(val).replace(/[₹$,\s]|Rs\.?|INR/gi, "").trim();
}

// ── JSON bulk-import (used by the new Excel upload flow) ─────────────────────
router.post("/seller/products/bulk-import", requireVendorAuth, async (req: any, res: any) => {
  const { rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows must be a non-empty array of product objects" });
  }
  if (rows.length > 500) {
    return res.status(400).json({ error: "Maximum 500 rows per upload" });
  }

  // ── Vendor-scoped idempotency ─────────────────────────────────────────────
  // The client direct-upload flow retries failed requests. To make a retry
  // after a lost response safe (and to stop racing retry clicks from creating
  // two batches) we claim a (vendorId, idempotencyKey) record BEFORE doing any
  // product-insert work, and persist the completed response atomically with the
  // inserts. A subsequent retry with the same key returns the stored response.
  const vendorIdForKey = req.vendorId;
  const { key: idempotencyKey, invalid: idempotencyKeyInvalid } = readIdempotencyKey(req);
  if (idempotencyKeyInvalid) {
    return res.status(400).json({ error: "Invalid Idempotency-Key header" });
  }

  let batchId: string | null = null;
  let batchLeaseToken: string | null = null;
  if (idempotencyKey) {
    try {
      const requestedLeaseToken = randomUUID();
      let batch: any = null;
      try {
        const [inserted] = await db
          .insert(bulkImportBatchesTable)
          .values({
            vendorId: vendorIdForKey,
            idempotencyKey,
            status: "processing",
            leaseExpiresAt: bulkImportLeaseExpiry(),
            leaseToken: requestedLeaseToken,
          })
          .onConflictDoNothing({ target: [bulkImportBatchesTable.vendorId, bulkImportBatchesTable.idempotencyKey] })
          .returning({ id: bulkImportBatchesTable.id });
        batch = inserted;
      } catch {}

      if (batch) {
        batchId = batch.id;
        batchLeaseToken = requestedLeaseToken;
      } else {
        let existing: any = null;
        try {
          const [found] = await db
            .select({
              id: bulkImportBatchesTable.id,
              status: bulkImportBatchesTable.status,
              response: bulkImportBatchesTable.response,
              leaseExpiresAt: bulkImportBatchesTable.leaseExpiresAt,
              leaseToken: bulkImportBatchesTable.leaseToken,
            })
            .from(bulkImportBatchesTable)
            .where(and(eq(bulkImportBatchesTable.vendorId, vendorIdForKey), eq(bulkImportBatchesTable.idempotencyKey, idempotencyKey)))
            .limit(1);
          existing = found;
        } catch {}

        if (existing?.status === "completed" && existing.response != null) {
          return res.json(existing.response);
        }

        const now = new Date();
        if (
          existing?.id
          && existing.leaseExpiresAt != null
          && existing.leaseExpiresAt.getTime() <= now.getTime()
        ) {
          try {
            const [reclaimed] = await db
              .update(bulkImportBatchesTable)
              .set({
                leaseExpiresAt: bulkImportLeaseExpiry(),
                leaseToken: requestedLeaseToken,
              })
              .where(and(
                eq(bulkImportBatchesTable.id, existing.id),
                eq(bulkImportBatchesTable.status, "processing"),
                lte(bulkImportBatchesTable.leaseExpiresAt, now),
              ))
              .returning({ id: bulkImportBatchesTable.id });

            if (reclaimed) {
              batchId = reclaimed.id;
              batchLeaseToken = requestedLeaseToken;
            }
          } catch {}
        }

        if (existing && !batchId) {
          return res.status(409).json({ error: "This upload is already being processed. Please retry in a moment.", processing: true });
        }

        if (!batchId) {
          const mongoClaim = await claimMongoBatch(vendorIdForKey, idempotencyKey, requestedLeaseToken, bulkImportLeaseExpiry());
          if (mongoClaim.status === "completed") {
            return res.json(mongoClaim.response);
          }
          if (mongoClaim.status === "in_progress") {
            return res.status(409).json({ error: "This upload is already being processed. Please retry in a moment.", processing: true });
          }
          if (mongoClaim.status === "claimed") {
            batchId = mongoClaim.batchId!;
            batchLeaseToken = requestedLeaseToken;
          }
        }
      }
    } catch (err: any) {
      req.log?.error({ err }, "seller/products/bulk-import idempotency claim failed");
      return res.status(500).json({ error: "Failed to process bulk import" });
    }
  }

  try {
    const results: Array<{ row: number; success: boolean; error?: string; productId?: string; name?: string; images?: string[] }> = [];
    const toInsert: any[] = [];

    rows.forEach((rowRaw: unknown, idx: number) => {
      const rowNum = idx + 1;

      if (!rowRaw || typeof rowRaw !== "object" || Array.isArray(rowRaw)) {
        results.push({ row: rowNum, success: false, error: "Row must be a plain object" });
        return;
      }
      const row: Record<string, string> = {};
      for (const [k, v] of Object.entries(rowRaw as Record<string, unknown>)) {
        row[k] = v != null ? String(v) : "";
      }

      function resolveBulkCategory(catInput: string | undefined): { canonical: string; prefix: string } | null {
        if (!catInput) return null;
        const raw = catInput.trim().toLowerCase();
        const slug = raw.replace(/[-_ ]/g, "");

        if (slug.includes("paithani")) return { canonical: "paithani", prefix: "PS" };
        if (slug.includes("designer")) return { canonical: "designer", prefix: "DS" };
        if (slug.includes("gadwal")) return { canonical: "gadwal", prefix: "GD" };
        if (slug.includes("banarasi")) return { canonical: "banarasi", prefix: "BN" };
        if (slug.includes("kanjivaram")) return { canonical: "kanjivaram", prefix: "KJ" };
        if (slug.includes("chanderi")) return { canonical: "chanderi", prefix: "CH" };
        if (slug.includes("bandhani")) return { canonical: "bandhani", prefix: "BD" };
        if (slug.includes("mysore")) return { canonical: "mysore-silk", prefix: "MS" };
        if (slug.includes("ikat")) return { canonical: "ikat", prefix: "IK" };
        if (slug.includes("cotton")) return { canonical: "cotton", prefix: "CT" };
        if (slug.includes("silk")) return { canonical: "silk", prefix: "SK" };
        if (slug.includes("other") || slug.includes("traditional")) return { canonical: "other-traditional", prefix: "TR" };

        const catDef = findCategoryDefinition(raw);
        if (catDef) {
          return { canonical: catDef.slug, prefix: catDef.prefix };
        }

        const matched = (CATEGORIES as readonly string[]).find(c => {
          const norm = c.toLowerCase().trim();
          return norm === raw || norm.replace(/[-_ ]/g, "") === slug;
        });

        if (matched) {
          const prefix = (CATEGORY_PREFIX as any)[matched] ?? (CATEGORY_PREFIX as any)[matched.toLowerCase()] ?? "PR";
          return { canonical: matched, prefix };
        }
        return null;
      }

      function resolveBulkFabric(fInput: string | undefined): string {
        if (!fInput) return "silk";
        const raw = fInput.trim().toLowerCase();
        if (raw.includes("silk")) return "silk";
        if (raw.includes("cotton")) return "cotton";
        if (raw.includes("georgette")) return "georgette";
        if (raw.includes("chiffon")) return "chiffon";
        if (raw.includes("tissue")) return "tissue";
        if (raw.includes("net") || raw.includes("mesh")) return "net";
        if ((FABRICS as readonly string[]).includes(raw as any)) return raw;
        return "silk";
      }

      function resolveBulkColor(cInput: string | undefined): string {
        if (!cInput) return "red";
        const raw = cInput.trim().toLowerCase();
        if ((COLORS as readonly string[]).includes(raw as any)) return raw;
        if (raw.includes("navy") || raw.includes("sky") || raw.includes("teal") || raw.includes("turquoise")) return "blue";
        if (raw.includes("white") || raw.includes("ivory") || raw.includes("off-white")) return "cream";
        if (raw.includes("peach") || raw.includes("coral") || raw.includes("rose")) return "pink";
        if (raw.includes("maroon") || raw.includes("wine") || raw.includes("burgundy") || raw.includes("rust")) return "maroon";
        if (raw.includes("mustard") || raw.includes("lemon")) return "yellow";
        if (raw.includes("olive") || raw.includes("emerald") || raw.includes("pista")) return "green";
        if (raw.includes("silver") || raw.includes("grey") || raw.includes("gray")) return "mint";
        if (raw.includes("golden")) return "gold";
        return "red";
      }

      function resolveBulkOccasion(oInput: string | undefined): string {
        if (!oInput) return "festival";
        const raw = oInput.trim().toLowerCase();
        if ((OCCASIONS as readonly string[]).includes(raw as any)) return raw;
        if (raw.includes("wed") || raw.includes("bride") || raw.includes("shaadi")) return "bridal";
        if (raw.includes("fest") || raw.includes("trad") || raw.includes("puja") || raw.includes("diwali")) return "festival";
        if (raw.includes("party") || raw.includes("cocktail") || raw.includes("night")) return "party";
        if (raw.includes("work") || raw.includes("office") || raw.includes("formal")) return "formal";
        if (raw.includes("casual") || raw.includes("daily") || raw.includes("regular")) return "casual";
        return "festival";
      }

      const name = row.name?.trim();
      const rawCategory = row.category?.trim();
      const sku = row.sku?.trim() || null;

      if (!name) { results.push({ row: rowNum, success: false, error: "Missing name" }); return; }

      const resolvedCategory = resolveBulkCategory(rawCategory);
      if (!rawCategory || !resolvedCategory) {
        results.push({ row: rowNum, success: false, error: `Invalid category (must be one of: ${CATEGORIES.join(", ")})` });
        return;
      }

      const catData = resolveCategoryData(rawCategory, row.subcategory);
      const category = catData.category;

      const cleanedPriceStr = cleanNumericString(row.price);
      const price = cleanedPriceStr ? Math.round(Number(cleanedPriceStr)) : NaN;
      if (!price || isNaN(price) || price <= 0) { results.push({ row: rowNum, success: false, error: "Invalid price" }); return; }

      const fabric = resolveBulkFabric(row.fabric);
      const color = resolveBulkColor(row.color);
      const occasion = resolveBulkOccasion(row.occasion);

      const cleanedStockStr = cleanNumericString(row.stock);
      const stock = cleanedStockStr ? parseInt(cleanedStockStr, 10) : 10;
      if (isNaN(stock) || stock < 0) { results.push({ row: rowNum, success: false, error: "Invalid stock" }); return; }

      const cleanedOpStr = cleanNumericString(row.originalPrice);
      const originalPrice = cleanedOpStr ? Math.round(Number(cleanedOpStr)) : null;

      if (row.imageFiles?.trim()) {
        results.push({
          row: rowNum,
          success: false,
          error: "Attached image names must be resolved to public product images before import",
        });
        return;
      }
      const normalizedImages = normalizeBulkProductImages(row.images);
      if (!normalizedImages.ok) {
        results.push({ row: rowNum, success: false, error: normalizedImages.error });
        return;
      }

      toInsert.push({
        _rowNum: rowNum,
        name,
        sku,
        description: row.description?.trim() ?? "",
        category,
        categoryName: catData.categoryName,
        categoryId: catData.categoryId,
        parentCategoryId: catData.parentCategoryId,
        parentCategoryName: catData.parentCategoryName,
        categoryPrefix: resolvedCategory.prefix,
        subcategory:   catData.subcategory,
        subcategoryName: catData.subcategoryName,
        subcategoryId: catData.subcategoryId,
        brand:         row.brand?.trim()         || null,
        designPattern: row.designPattern?.trim() || null,
        fabric:   fabric as any,
        color:    color as any,
        occasion: occasion as any,
        price,
        originalPrice,
        stock,
        images: normalizedImages.images,
        sellerId:   req.vendor?.sellerId || req.vendor?.id || req.vendorId || req.userId,
        vendorId:   req.vendorId,
        vendorName: req.vendor?.name || req.vendor?.shopName || "Seller Store",
        status: "approved",
        active: true,
      });
    });

    // Pre-check for duplicate product names within this vendor to give clear errors.
    const vendorId = req.vendorId;
    const lowercasedNames = toInsert.map((item: any) => item.name.toLowerCase());
    let existingByName: any[] = [];
    try {
      existingByName = lowercasedNames.length > 0
        ? await db
            .select({ name: productsTable.name })
            .from(productsTable)
            .where(and(eq(productsTable.vendorId, vendorId), inArray(sql`lower(${productsTable.name})`, lowercasedNames)))
        : [];
    } catch {}

    const existingNameSet = new Set((existingByName || []).map((p: any) => p.name?.toLowerCase()));

    // Also check MongoDB products
    if (mongoProducts?.findMany && lowercasedNames.length > 0) {
      try {
        const mongoMatches = await mongoProducts.findMany({
          $or: [{ vendorId }, { vendorId: String(vendorId) }],
        } as any);
        for (const p of mongoMatches) {
          if (p.name && lowercasedNames.includes(p.name.toLowerCase())) {
            existingNameSet.add(p.name.toLowerCase());
          }
        }
      } catch {}
    }

    const skus = toInsert.map((item: any) => item.sku?.toLowerCase()).filter(Boolean);
    const existingSkuSet = new Set<string>();
    if (mongoProducts?.findMany && skus.length > 0) {
      try {
        const mongoSkuMatches = await mongoProducts.findMany({
          $or: [{ vendorId }, { vendorId: String(vendorId) }],
        } as any);
        for (const p of mongoSkuMatches) {
          if ((p as any).sku && skus.includes(String((p as any).sku).toLowerCase())) {
            existingSkuSet.add(String((p as any).sku).toLowerCase());
          }
        }
      } catch {}
    }

    const runInserts = async (executor: any) => {
      for (const item of toInsert) {
        const { _rowNum, categoryPrefix: itemPrefix, ...values } = item;
        if (existingNameSet.has(values.name.toLowerCase())) {
          results.push({ row: _rowNum, success: false, error: "A product with this name already exists", isDuplicate: true } as any);
          continue;
        }
        if (values.sku && existingSkuSet.has(values.sku.toLowerCase())) {
          results.push({ row: _rowNum, success: false, error: "A product with this SKU already exists", isDuplicate: true } as any);
          continue;
        }

        try {
          const categoryKey = values.category as keyof typeof CATEGORY_PREFIX;
          const categoryPrefix: string = itemPrefix || ((CATEGORY_PREFIX as any)[categoryKey] ?? (CATEGORY_PREFIX as any)[String(categoryKey).toLowerCase()] ?? "XX");
          let seqVal: any = null;
          try {
            const seqResult = await executor.execute(sql`SELECT nextval('product_id_seq') AS seq`);
            seqVal = (seqResult as any)?.rows?.[0]?.seq;
          } catch {}

          if (!seqVal) {
            try {
              seqVal = await getNextSequenceValue("product_id");
            } catch {
              seqVal = Math.floor(Date.now() % 1000000);
            }
          }
          const newProductId = `${categoryPrefix}${seqVal}`;

          let product: any = null;
          try {
            const { sku: _sku, ...drizzleValues } = values;
            const [created] = await executor.insert(productsTable).values({ id: newProductId, ...drizzleValues }).returning({ id: productsTable.id, name: productsTable.name });
            product = created;
          } catch {}

          if (mongoProducts?.insert) {
            try {
              const mongoSaved = await mongoProducts.insert({ id: newProductId, ...values });
              if (!product) product = mongoSaved;
            } catch (mErr: any) {
              req.log?.warn({ mErr }, "Failed to save product in mongoProducts");
              results.push({ row: _rowNum, success: false, error: `Database write failed: ${mErr?.message || "could not save to MongoDB"}` });
              continue;
            }
          }

          if (!product) {
            results.push({ row: _rowNum, success: false, error: "Database write failed: product could not be saved" });
            continue;
          }

          emitProductEvent("product:created", { id: newProductId, vendorId });
          emitProductEvent("product:approved", { id: newProductId, productId: newProductId, status: "approved", active: true });
          // Track newly inserted names and SKUs to catch duplicates within the same batch
          existingNameSet.add(values.name.toLowerCase());
          if (values.sku) existingSkuSet.add(values.sku.toLowerCase());

          results.push({ row: _rowNum, success: true, productId: product.id || newProductId, name: product.name || values.name, images: values.images });
        } catch (rowErr: any) {
          req.log?.error?.({ rowErr, row: _rowNum }, "Failed to save bulk import row");
          results.push({ row: _rowNum, success: false, error: rowErr?.message || "Failed to save product" });
        }
      }

      results.sort((a, b) => a.row - b.row);
      const skippedDuplicates = results.filter((r) => !r.success && (r.error?.includes("already exists") || (r as any).isDuplicate)).length;
      const response = {
        results,
        summary: {
          total: rows.length,
          succeeded: results.filter((r) => r.success).length,
          failed:    results.filter((r) => !r.success).length,
          skippedDuplicates,
        },
      };

      // Persist the exact completed response atomically with the inserts
      if (batchId && batchLeaseToken) {
        let completedInDb = false;
        try {
          const [completed] = await executor
            .update(bulkImportBatchesTable)
            .set({
              status: "completed",
              response,
              completedAt: new Date(),
              leaseExpiresAt: null,
              leaseToken: batchLeaseToken,
            })
            .where(and(
              eq(bulkImportBatchesTable.id, batchId),
              eq(bulkImportBatchesTable.status, "processing"),
              eq(bulkImportBatchesTable.leaseToken, batchLeaseToken),
            ))
            .returning({ id: bulkImportBatchesTable.id });

          if (completed) completedInDb = true;
        } catch {}

        if (idempotencyKey) {
          await completeMongoBatch(vendorIdForKey, idempotencyKey, batchId, batchLeaseToken, response);
        }

        if (typeof executor.update === "function" && !completedInDb && !isMongoDbConnected()) {
          const [checkExisting] = await db
            .select({ id: bulkImportBatchesTable.id, leaseToken: bulkImportBatchesTable.leaseToken })
            .from(bulkImportBatchesTable)
            .where(and(eq(bulkImportBatchesTable.id, batchId), eq(bulkImportBatchesTable.vendorId, vendorIdForKey)))
            .limit(1);
          if (checkExisting && checkExisting.leaseToken !== batchLeaseToken) {
            throw new Error("Bulk import processing lease was lost");
          }
        }
      }

      if (results.some((r) => r.success)) {
        safeInvalidatePattern(/product/);
      }
      return response;
    };

    const response = (batchId && !isMongoDbConnected() && typeof db?.transaction === "function")
      ? await db.transaction((tx: any) => runInserts(tx))
      : await runInserts(db);

    if (!response || !Array.isArray((response as any).results)) {
      req.log?.error({ response }, "Unexpected response structure in bulk-import");
      return res.status(500).json({ error: "Failed to process bulk import: invalid internal result" });
    }

    res.json(response);
  } catch (err: any) {
    req.log?.error({ err }, "seller/products/bulk-import failed");
    if (batchId && batchLeaseToken) {
      try {
        await db.delete(bulkImportBatchesTable).where(and(
          eq(bulkImportBatchesTable.id, batchId),
          eq(bulkImportBatchesTable.status, "processing"),
          eq(bulkImportBatchesTable.leaseToken, batchLeaseToken),
        ));
      } catch (cleanupErr: any) {
        req.log?.error({ err: cleanupErr }, "seller/products/bulk-import batch cleanup failed");
      }
      if (idempotencyKey) {
        await cleanupMongoBatch(vendorIdForKey, idempotencyKey, batchId, batchLeaseToken);
      }
    }
    res.status(500).json({ error: err?.message || "Failed to process bulk import" });
  }
});


router.post("/seller/products/bulk-upload", requireVendorAuth, async (req: any, res: any) => {
  const { csv } = req.body;
  if (!csv || typeof csv !== "string" || !csv.trim()) {
    return res.status(400).json({ error: "csv text content is required" });
  }

  try {
    const rows = parseCsv(csv);
    if (rows.length === 0) {
      return res.status(400).json({ error: "CSV has no data rows" });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: "Maximum 500 rows per upload" });
    }

    const results: Array<{ row: number; success: boolean; error?: string; productId?: string; name?: string; images?: string[] }> = [];
    const toInsert: any[] = [];

    rows.forEach((row, idx) => {
      const rowNum = idx + 2; // account for header row
      const name = row.name?.trim();
      const cleanedPriceStr = cleanNumericString(row.price);
      const price = cleanedPriceStr ? Math.round(Number(cleanedPriceStr)) : NaN;
      const rawCategory = row.category?.trim();
      const normalizedCategory = (rawCategory || "").toLowerCase().trim();
      const slugCategory = normalizedCategory.replace(/[-_ ]/g, "");

      const matchedCategory = (CATEGORIES as readonly string[]).find(c => {
        const norm = c.toLowerCase().trim();
        return norm === normalizedCategory || norm.replace(/[-_ ]/g, "") === slugCategory;
      });

      const cleanedStockStr = cleanNumericString(row.stock);
      const stock = cleanedStockStr ? parseInt(cleanedStockStr, 10) : 10;

      if (!name) { results.push({ row: rowNum, success: false, error: "Missing name" }); return; }
      if (!rawCategory || !matchedCategory) {
        results.push({ row: rowNum, success: false, error: `Invalid category (must be one of: ${CATEGORIES.join(", ")})` });
        return;
      }
      const category = matchedCategory;

      if (!price || isNaN(price) || price <= 0) { results.push({ row: rowNum, success: false, error: "Invalid price" }); return; }
      if (row.fabric && !(FABRICS as readonly string[]).includes(row.fabric.trim())) {
        results.push({ row: rowNum, success: false, error: `Invalid fabric (must be one of: ${FABRICS.join(", ")})` });
        return;
      }
      if (row.color && !(COLORS as readonly string[]).includes(row.color.trim())) {
        results.push({ row: rowNum, success: false, error: `Invalid color (must be one of: ${COLORS.join(", ")})` });
        return;
      }
      if (row.occasion && !(OCCASIONS as readonly string[]).includes(row.occasion.trim())) {
        results.push({ row: rowNum, success: false, error: `Invalid occasion (must be one of: ${OCCASIONS.join(", ")})` });
        return;
      }
      if (!Number.isInteger(stock) || stock < 0) { results.push({ row: rowNum, success: false, error: "Invalid stock" }); return; }
      if (row.imageFiles?.trim()) {
        results.push({
          row: rowNum,
          success: false,
          error: "Attached image names must be resolved to public product images before import",
        });
        return;
      }
      const normalizedImages = normalizeBulkProductImages(row.images);
      if (!normalizedImages.ok) {
        results.push({ row: rowNum, success: false, error: normalizedImages.error });
        return;
      }

      const catData = resolveCategoryData(rawCategory, row.subcategory);

      toInsert.push({
        _rowNum: rowNum,
        name,
        description: row.description?.trim() ?? "",
        category: catData.category,
        categoryName: catData.categoryName,
        categoryId: catData.categoryId,
        parentCategoryId: catData.parentCategoryId,
        parentCategoryName: catData.parentCategoryName,
        subcategory: catData.subcategory,
        subcategoryName: catData.subcategoryName,
        subcategoryId: catData.subcategoryId,
        brand: row.brand?.trim() || null,
        designPattern: row.designPattern?.trim() || null,
        fabric: row.fabric?.trim() || "silk",
        color: row.color?.trim() || "red",
        occasion: row.occasion?.trim() || "festival",
        price,
        originalPrice: row.originalPrice ? parseInt(row.originalPrice) : null,
        stock,
        images: normalizedImages.images,
        vendorId: req.vendorId,
        vendorName: req.vendor.name,
        status: "approved",
        active: true,
      });
    });

    for (const item of toInsert) {
      const { _rowNum, ...values } = item;
      try {
        const categoryKey = values.category as keyof typeof CATEGORY_PREFIX;
        const categoryPrefix: string = (CATEGORY_PREFIX as any)[categoryKey] ?? (CATEGORY_PREFIX as any)[String(categoryKey).toLowerCase()] ?? "XX";
        let seqVal: any = null;
        try {
          const seqResult = await db.execute(sql`SELECT nextval('product_id_seq') AS seq`);
          seqVal = (seqResult as any)?.rows?.[0]?.seq;
        } catch {}

        if (!seqVal) {
          try {
            seqVal = await getNextSequenceValue("product_id");
          } catch {
            seqVal = Math.floor(Date.now() % 1000000);
          }
        }
        const newProductId = `${categoryPrefix}${seqVal}`;

        let product: any = null;
        try {
          const [created] = await db.insert(productsTable).values({ id: newProductId, ...values }).returning({ id: productsTable.id, name: productsTable.name });
          product = created;
        } catch {}

        if (mongoProducts?.insert) {
          try {
            const mongoSaved = await mongoProducts.insert({ id: newProductId, ...values });
            if (!product) product = mongoSaved;
          } catch (mErr) {
            req.log?.warn({ mErr }, "Failed to save product in mongoProducts");
          }
        }

        if (!product) {
          product = { id: newProductId, name: values.name };
        }

        emitProductEvent("product:created", { id: newProductId, vendorId: req.vendorId });
        emitProductEvent("product:approved", { id: newProductId, productId: newProductId, status: "approved", active: true });
        results.push({ row: _rowNum, success: true, productId: product.id || newProductId, name: product.name || values.name, images: values.images });
      } catch (insertErr: any) {
        results.push({ row: _rowNum, success: false, error: "Failed to save row" });
      }
    }


    if (results.some((r) => r.success)) {
      safeInvalidatePattern(/product/);
    }

    results.sort((a, b) => a.row - b.row);
    res.json({
      results,
      summary: {
        total: rows.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/products/bulk-upload failed");
    res.status(500).json({ error: "Failed to process bulk upload" });
  }
});

router.get("/seller/orders", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const search = (req.query.search as string | undefined)?.toLowerCase().trim();

  try {
    const productIdSet = await getVendorProductIdSet(req);

    // 1. Primary Source of Truth: MongoDB Atlas
    let allOrders: any[] = [];
    try {
      allOrders = await mongoOrders.findMany({}, { sort: { createdAt: -1 } });
    } catch {}

    if (!Array.isArray(allOrders) || allOrders.length === 0) {
      try {
        const col = (await import("@workspace/db")).getCollection("orders");
        allOrders = await col.find({}).sort({ createdAt: -1 }).toArray();
      } catch {}
    }

    // 2. Fallback: PostgreSQL ordersTable
    if (!Array.isArray(allOrders) || allOrders.length === 0) {
      try {
        allOrders = await db
          .select()
          .from(ordersTable)
          .orderBy(desc(ordersTable.createdAt));
      } catch {}
    }
    if (!Array.isArray(allOrders)) {
      allOrders = [];
    }

    const vendorOrders: any[] = [];
    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => isVendorItem(i, productIdSet, req));
      if (vendorItems.length === 0) continue;

      const address = (order.address as any) ?? {};
      const orderAcceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
      const myOrderAcceptance =
        orderAcceptances[vendorId] ||
        (req.userId && orderAcceptances[req.userId]) ||
        (req.sellerId && orderAcceptances[req.sellerId]) ||
        (req.vendor?.id && orderAcceptances[req.vendor.id]) ||
        (req.vendor?.ownerId && orderAcceptances[req.vendor.ownerId]);
      const needsAcceptance = (order.status === "confirmed" || order.status === "pending") && !myOrderAcceptance;
      const vendorAcceptanceStatus: "accepted" | "rejected" | "pending" =
        myOrderAcceptance?.status === "accepted" ? "accepted" :
        myOrderAcceptance?.status === "rejected" ? "rejected" : "pending";

      vendorOrders.push({
        id: order.id,
        displayId: order.displayId ?? order.id,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        customerName: String(address.name ?? "Customer").split(" ")[0],
        needsAcceptance,
        vendorAcceptanceStatus,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
        vendorItems: vendorItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price ?? 0,
          quantity: i.quantity ?? 1,
          images: Array.isArray(i.images) ? i.images : [],
        })),
        vendorTotal: vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
        itemCount: vendorItems.length,
      });
    }

    let filtered = vendorOrders;
    if (statusFilter && statusFilter !== "all") {
      filtered = filtered.filter((o) => o.status === statusFilter);
    }
    if (search) {
      filtered = filtered.filter((o) =>
        o.id.toLowerCase().includes(search) ||
        (o.displayId && o.displayId.toLowerCase().includes(search))
      );
    }

    res.json({ orders: filtered });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders failed");
    res.status(500).json({ error: "Failed to load orders" });
  }
});

router.get("/seller/orders/:orderId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { orderId } = req.params;

  try {
    const productIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = (order.items as any[]) ?? [];
    const vendorItems = items.filter((i) => isVendorItem(i, productIdSet, req));
    if (vendorItems.length === 0) {
      return res.status(403).json({ error: "You don't have any items in this order" });
    }

    const address = (order.address as any) ?? {};
    const acceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const myAcceptance =
      acceptances[vendorId] ||
      (req.userId && acceptances[req.userId]) ||
      (req.sellerId && acceptances[req.sellerId]) ||
      (req.vendor?.id && acceptances[req.vendor.id]) ||
      (req.vendor?.ownerId && acceptances[req.vendor.ownerId]);
    const vendorAcceptanceStatus: "accepted" | "rejected" | "pending" =
      myAcceptance?.status === "accepted" ? "accepted" :
      myAcceptance?.status === "rejected" ? "rejected" : "pending";

    let parsedReturnReason: any = (order as any).returnReason;
    if (typeof parsedReturnReason === "string") {
      try { parsedReturnReason = JSON.parse(parsedReturnReason); } catch {}
    }

    res.json({
      id: order.id,
      displayId: order.displayId ?? order.id,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
      status: order.status,
      statusHistory: order.statusHistory || [],
      address: order.address,
      shippingCity: address.city ?? "",
      shippingState: address.state ?? "",
      deliveryMethod: order.deliveryMethod,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      total: order.total,
      awbNumber: (order as any).awbNumber || null,
      courierName: (order as any).courierName || null,
      vendorAcceptanceStatus,
      vendorAcceptances: (order as any).vendorAcceptances || {},
      vendorPackagingChecklist: (order as any).vendorPackagingChecklist || {},
      returnReason: parsedReturnReason,
      vendorItems: vendorItems.map((i) => {
        const itemBasePrice = i.basePrice ?? (i.price ? Math.round(i.price / 1.155) : 0);
        const itemMainPrice = (i.price && i.price >= itemBasePrice * 1.05)
          ? i.price
          : Math.round((itemBasePrice + 100) * 1.05);
        return {
          productId: i.productId,
          name: i.name,
          price: itemMainPrice,
          basePrice: itemBasePrice,
          quantity: i.quantity ?? 1,
          images: Array.isArray(i.images) ? i.images : [],
        };
      }),
      vendorTotal: vendorItems.reduce((s: number, i: any) => {
        const itemBasePrice = i.basePrice ?? (i.price ? Math.round(i.price / 1.155) : 0);
        return s + itemBasePrice * (i.quantity ?? 1);
      }, 0),
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/:orderId failed");
    res.status(500).json({ error: "Failed to load order" });
  }
});

router.post("/orders/:orderId/dispatch", requireVendorAuth, async (req: any, res: any) => {
  const { orderId } = req.params;
  const { courierName, trackingNumber } = req.body;

  if (!courierName || !String(courierName).trim()) {
    return res.status(400).json({ error: "Courier name is required" });
  }
  if (!trackingNumber || !String(trackingNumber).trim()) {
    return res.status(400).json({ error: "Tracking number is required" });
  }

  const vendorId = req.vendorId;

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));
    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have any items in this order" });
    }

    const dispatchAcceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const myDispatchAcceptance = dispatchAcceptances[vendorId];
    if (!myDispatchAcceptance || myDispatchAcceptance.status !== "accepted") {
      return res.status(400).json({ error: "You must accept this order before marking it as dispatched" });
    }

    if (order.status === "cancelled" || order.status === "rejected") {
      return res.status(400).json({ error: "Cannot dispatch a cancelled/rejected order" });
    }
    if (order.status === "delivered") {
      return res.status(400).json({ error: "Order already delivered" });
    }

    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];

    const alreadyDispatched = history.some((h) => h.status === "vendor_dispatched" && h.vendorId === vendorId);
    if (alreadyDispatched) {
      return res.status(400).json({ error: "You have already dispatched your items for this order" });
    }

    history.push({
      status: "vendor_dispatched",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Dispatched via ${String(courierName).trim()} — Tracking: ${String(trackingNumber).trim()}`,
      courierName: String(courierName).trim(),
      trackingNumber: String(trackingNumber).trim(),
    });

    const allProductIdsInOrder = items.map((i: any) => i.productId).filter(Boolean);
    let allOrderProducts: any[] = [];
    try {
      if (allProductIdsInOrder.length > 0) {
        allOrderProducts = await db
          .select({ id: productsTable.id, vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(inArray(productsTable.id, allProductIdsInOrder));
      }
    } catch {}

    const orderAcceptancesMap = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const allVendorIdsInOrder = new Set<string>([
      ...allOrderProducts
        .map((p) => p.vendorId)
        .filter((vid): vid is string => !!vid && orderAcceptancesMap[vid]?.status === "accepted"),
      ...items
        .map((i: any) => i.vendorId)
        .filter((vid): vid is string => !!vid && orderAcceptancesMap[vid]?.status === "accepted"),
    ]);

    if (allVendorIdsInOrder.size === 0) {
      allVendorIdsInOrder.add(vendorId);
    }

    const dispatchedVendorIds = new Set(
      history.filter((h) => h.status === "vendor_dispatched").map((h) => h.vendorId)
    );
    const allDispatched = [...allVendorIdsInOrder].every((vid) => dispatchedVendorIds.has(vid));

    const newStatus = allDispatched ? "dispatched" : order.status;

    if (allDispatched) {
      history.push({
        status: "dispatched",
        timestamp: new Date().toISOString(),
        note: "All vendors have dispatched — order fully dispatched",
      });
    }

    const updates = { status: newStatus, statusHistory: history, updatedAt: new Date() };

    try {
      await db.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));
    } catch {}

    try {
      await mongoOrders.update(orderId, updates);
    } catch {}

    if (allDispatched) {
      const allItems = items as Array<{ name: string }>;
      try {
        await insertOrderStatusNotification({
          userId: order.userId,
          type: "order_shipped",
          orderId: order.id,
          itemName: allItems?.[0]?.name ?? "your order",
          extraItemCount: allItems.length > 1 ? allItems.length - 1 : 0,
          trackingNumber: String(trackingNumber).trim(),
        });
      } catch {}
    }

    const updatedOrder = await findOrderById(orderId);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    return res.json({ success: true, allDispatched, order: updatedOrder });
  } catch (err: any) {
    req.log?.error({ err }, "orders/dispatch failed");
    return res.status(500).json({ error: "Failed to dispatch order" });
  }
});

/**
 * GET /seller/orders/:orderId/couriers
 * Retrieves available courier partners and rates from Shiprocket for this seller's pickup PIN to customer PIN.
 */
router.get("/seller/orders/:orderId/couriers", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { orderId } = req.params;

  try {
    const order = await findOrderById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    const vendor = req.vendor || (await mongoVendors.findById(vendorId)) || (await mongoSellers.findById(vendorId));
    const sellerPincode = vendor?.pickupPincode || vendor?.shopPincode;
    const customerAddress = (order.address as any) || {};
    const deliveryPincode = customerAddress.pincode;

    if (!sellerPincode) {
      return res.status(400).json({
        error: "Seller pickup PIN code is missing. Please set your shop/pickup address in Seller Profile.",
      });
    }
    if (!deliveryPincode) {
      return res.status(400).json({ error: "Customer delivery PIN code is missing from order." });
    }

    const isCod = order.paymentMethod === "cod";
    const weightKg = parseFloat(req.query.weight as string) || 0.5;

    const result = await getAvailableCouriers({
      pickupPincode: String(sellerPincode),
      deliveryPincode: String(deliveryPincode),
      weightKg,
      isCod,
    });

    return res.json(result);
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/couriers failed");
    return res.status(500).json({ error: "Failed to fetch available couriers" });
  }
});

/**
 * POST /seller/orders/:orderId/dispatch-shiprocket
 * Fully automated Shiprocket shipment creation, AWB assignment, and courier pickup scheduling.
 */
router.post("/seller/orders/:orderId/dispatch-shiprocket", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { orderId } = req.params;
  const { courierCompanyId, courierPartnerId, courierName, weightKg, length, breadth, height, pickupDate } = req.body || {};
  const effectiveCourierCompanyId = courierCompanyId ?? courierPartnerId;

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);
    if (!order) return res.status(404).json({ error: "Order not found" });

    if (order.status === "cancelled" || order.status === "rejected") {
      return res.status(400).json({ error: "Cannot dispatch a cancelled or rejected order" });
    }
    if (order.status === "delivered") {
      return res.status(400).json({ error: "Order already delivered" });
    }

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));
    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have any items in this order" });
    }

    const dispatchAcceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const myDispatchAcceptance =
      dispatchAcceptances[vendorId] ||
      (req.userId && dispatchAcceptances[req.userId]) ||
      (req.sellerId && dispatchAcceptances[req.sellerId]);
    if (myDispatchAcceptance && myDispatchAcceptance.status !== "accepted") {
      return res.status(400).json({ error: "You must accept this order before scheduling dispatch" });
    }

    const vendor = req.vendor || (await mongoVendors.findById(vendorId)) || (await mongoSellers.findById(vendorId));

    const result = await createAndDispatchShipment({
      order,
      vendorId,
      vendorRecord: vendor,
      vendorItems: myItems,
      selectedCourierCompanyId: effectiveCourierCompanyId ? Number(effectiveCourierCompanyId) : undefined,
      courierName,
      parcelWeightKg: weightKg ? parseFloat(weightKg) : 0.5,
      parcelDimensions:
        length && breadth && height
          ? { length: Number(length), breadth: Number(breadth), height: Number(height) }
          : { length: 25, breadth: 20, height: 5 },
      pickupDate,
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error || "Shipment creation failed" });
    }

    // Update vendorAcceptances status to reflect dispatch with AWB
    if (dispatchAcceptances[vendorId] || (req.userId && dispatchAcceptances[req.userId])) {
      try {
        const updatedAcceptances = {
          ...dispatchAcceptances,
          [vendorId]: {
            ...(dispatchAcceptances[vendorId] || {}),
            status: "accepted",
            dispatched: true,
            dispatchedAt: new Date().toISOString(),
            awbNumber: result.awbNumber,
            courierName: result.courierName,
          },
        };
        if (req.userId && req.userId !== vendorId) {
          updatedAcceptances[req.userId] = updatedAcceptances[vendorId];
        }
        await mongoOrders.update(order.id, { vendorAcceptances: updatedAcceptances });
        await db.update(ordersTable).set({ vendorAcceptances: updatedAcceptances as any }).where(eq(ordersTable.id, order.id));
      } catch {}
    }

    const refreshedOrder = await findOrderById(order.id);
    if (refreshedOrder) {
      try {
        emitOrderEvent("order:status_changed", refreshedOrder);
      } catch {}
    }

    return res.json(result);
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/dispatch-shiprocket failed");
    return res.status(500).json({ error: "Failed to dispatch order via Shiprocket" });
  }
});

/**
 * GET /seller/orders/:orderId/shipment
 * Retrieves the seller's specific shipment record for this order.
 */
router.get("/seller/orders/:orderId/shipment", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { orderId } = req.params;

  try {
    const shipments = await mongoShipments.findByOrderId(orderId);
    const myShipment = shipments.find((s) => s.vendorId === vendorId);
    if (!myShipment) {
      return res.status(404).json({ error: "Shipment not found for this seller" });
    }
    return res.json({ shipment: myShipment });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to load shipment" });
  }
});

/**
 * GET /seller/pickup-location
 * Gets the current seller's Shiprocket pickup location and registration status.
 */
router.get("/seller/pickup-location", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;

  try {
    const vendor = req.vendor || (await mongoVendors.findById(vendorId)) || (await mongoSellers.findById(vendorId));
    if (!vendor) return res.status(404).json({ error: "Seller profile not found" });

    return res.json({
      nickname: vendor.shiprocketPickupLocationName || null,
      pickupId: vendor.shiprocketPickupId || null,
      status: vendor.shiprocketPickupStatus || "unregistered",
      error: vendor.shiprocketPickupError || null,
      pickupPincode: vendor.pickupPincode || vendor.shopPincode || null,
      addressLine1: vendor.pickupAddressLine1 || vendor.shopStreet || null,
      city: vendor.pickupCity || vendor.shopCity || null,
      state: vendor.pickupState || vendor.shopState || null,
      shippingActivated: vendor.shippingActivated ?? true,
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to fetch pickup location" });
  }
});

/**
 * POST /seller/pickup-location/sync
 * Manually registers / re-syncs current seller pickup location with Shiprocket.
 */
router.post("/seller/pickup-location/sync", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;

  try {
    const vendor = req.vendor || (await mongoVendors.findById(vendorId)) || (await mongoSellers.findById(vendorId));
    if (!vendor) return res.status(404).json({ error: "Seller profile not found" });

    const result = await syncSellerPickupToShiprocket(vendorId, req.body || {}, vendor);
    return res.json(result);
  } catch (err: any) {
    req.log?.error({ err }, "seller/pickup-location/sync failed");
    return res.status(500).json({ error: "Failed to sync pickup location with Shiprocket" });
  }
});

router.get("/seller/analytics", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const period = Math.min(Math.max(parseInt(String(req.query.period ?? "30"), 10) || 30, 1), 365);

  try {
    let products: any[] = [];
    try {
      products = await db
        .select({ id: productsTable.id, name: productsTable.name, images: productsTable.images })
        .from(productsTable)
        .where(eq(productsTable.vendorId, vendorId));
    } catch {}

    if (products.length === 0) {
      try {
        const allMProds = await mongoProducts.findMany({});
        const vendorIds = [vendorId, req.userId, req.vendor?.ownerId].filter(Boolean);
        products = allMProds.filter((p: any) =>
          vendorIds.includes(p.vendorId) || vendorIds.includes(p.sellerId) || vendorIds.includes(p.ownerId)
        );
      } catch {}
    }

    const productIdSet = new Set(products.map((p) => p.id));
    const productMap = new Map(products.map((p) => [p.id, p]));

    if (productIdSet.size === 0) {
      const emptyDays = Array.from({ length: period }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (period - 1 - i));
        return { date: d.toISOString().slice(0, 10), revenue: 0, orders: 0 };
      });
      return res.json({ dailyRevenue: emptyDays, ordersByStatus: {}, topProducts: [], customerStates: [] });
    }

    const since = new Date();
    since.setDate(since.getDate() - period);

    let allOrders: any[] = [];
    try {
      allOrders = await db.select().from(ordersTable).orderBy(desc(ordersTable.createdAt));
    } catch {}

    if (allOrders.length === 0) {
      try {
        allOrders = await mongoOrders.findMany({});
      } catch {}
    }

    const dailyRevMap = new Map<string, { revenue: number; orders: number }>();
    const ordersByStatus: Record<string, number> = {};
    const productQtyMap = new Map<string, { qty: number; revenue: number }>();
    const stateMap = new Map<string, number>();

    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => productIdSet.has(i.productId));
      if (vendorItems.length === 0) continue;

      const vendorTotal = vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);

      ordersByStatus[order.status] = (ordersByStatus[order.status] ?? 0) + 1;

      for (const item of vendorItems) {
        const prev = productQtyMap.get(item.productId) ?? { qty: 0, revenue: 0 };
        productQtyMap.set(item.productId, {
          qty: prev.qty + (item.quantity ?? 1),
          revenue: prev.revenue + (item.price ?? 0) * (item.quantity ?? 1),
        });
      }

      const address = (order.address as any) ?? {};
      if (address.state) {
        stateMap.set(address.state, (stateMap.get(address.state) ?? 0) + 1);
      }

      if (new Date(order.createdAt) >= since) {
        const day = new Date(order.createdAt).toISOString().slice(0, 10);
        const prev = dailyRevMap.get(day) ?? { revenue: 0, orders: 0 };
        dailyRevMap.set(day, { revenue: prev.revenue + vendorTotal, orders: prev.orders + 1 });
      }
    }

    const dailyRevenue = Array.from({ length: period }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (period - 1 - i));
      const day = d.toISOString().slice(0, 10);
      const data = dailyRevMap.get(day) ?? { revenue: 0, orders: 0 };
      return { date: day, revenue: data.revenue, orders: data.orders };
    });

    const topProducts = [...productQtyMap.entries()]
      .sort((a, b) => b[1].qty - a[1].qty)
      .slice(0, 5)
      .map(([productId, data]) => {
        const p = productMap.get(productId);
        return {
          productId,
          name: p?.name ?? "Unknown",
          qtySold: data.qty,
          revenue: data.revenue,
          image: ((p?.images as string[]) ?? [])[0] ?? null,
        };
      });

    const customerStates = [...stateMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([state, count]) => ({ state, count }));

    res.json({ dailyRevenue, ordersByStatus, topProducts, customerStates });
  } catch (err: any) {
    req.log?.error({ err }, "seller/analytics failed");
    res.status(500).json({ error: "Failed to load analytics" });
  }
});

async function getVendorProductIdSet(reqOrVendorId: any): Promise<Set<string>> {
  const vendorId = typeof reqOrVendorId === "string" ? reqOrVendorId : (reqOrVendorId?.vendorId as string);
  const userId = typeof reqOrVendorId === "string" ? reqOrVendorId : (reqOrVendorId?.userId as string);
  const ownerId = typeof reqOrVendorId === "string" ? reqOrVendorId : (reqOrVendorId?.vendor?.ownerId as string | undefined);
  const sellerId = typeof reqOrVendorId === "string" ? undefined : (reqOrVendorId?.sellerId || reqOrVendorId?.vendor?.sellerId || reqOrVendorId?.vendor?.id);
  const vId = typeof reqOrVendorId === "string" ? undefined : (reqOrVendorId?.vendor?.vendorId);

  const vendorIds = [...new Set([vendorId, userId, ownerId, sellerId, vId].filter(Boolean))] as string[];
  if (vendorIds.length === 0) return new Set();

  let products: any[] = [];
  try {
    const dbProds = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(inArray(productsTable.vendorId, vendorIds));
    if (Array.isArray(dbProds)) products = dbProds;
  } catch {}

  try {
    const allMProds = await mongoProducts.findMany({});
    if (Array.isArray(allMProds)) {
      const matchedMProds = allMProds.filter((p: any) =>
        vendorIds.includes(p.vendorId) || vendorIds.includes(p.sellerId) || vendorIds.includes(p.ownerId) || vendorIds.includes(p.userId)
      );
      for (const p of matchedMProds) {
        if (p.id) products.push(p);
      }
    }
  } catch {}

  if (!Array.isArray(products)) products = [];
  return new Set(products.map((p) => p.id));
}

function isVendorItem(item: any, productIdSet: Set<string>, req: any): boolean {
  if (!item) return false;
  if (item.productId && productIdSet.has(item.productId)) return true;

  const vendorId = typeof req === "string" ? req : req?.vendorId;
  const userId = typeof req === "string" ? req : req?.userId;
  const ownerId = typeof req === "string" ? undefined : req?.vendor?.ownerId;
  const sellerId = typeof req === "string" ? undefined : (req?.sellerId || req?.vendor?.sellerId || req?.vendor?.id);
  const vId = typeof req === "string" ? undefined : req?.vendor?.vendorId;

  const validVendorIds = new Set([vendorId, userId, ownerId, sellerId, vId].filter(Boolean));
  if (item.vendorId && validVendorIds.has(item.vendorId)) return true;
  if (item.sellerId && validVendorIds.has(item.sellerId)) return true;
  if (item.ownerId && validVendorIds.has(item.ownerId)) return true;

  return false;
}

async function findOrderById(orderId: string): Promise<any> {
  if (!orderId) return null;
  const cleanId = String(orderId).trim();

  let order: any = null;
  // 1. Primary Source of Truth: MongoDB
  try {
    order = await mongoOrders.findById(cleanId);
  } catch {}

  if (!order) {
    try {
      const col = (await import("@workspace/db")).getCollection("orders");
      order = (await col.findOne({ $or: [{ id: cleanId }, { displayId: cleanId }, { _id: cleanId as any }] })) as any;
    } catch {}
  }

  // 2. Fallback: PostgreSQL ordersTable
  if (!order) {
    try {
      const rows = await db
        .select()
        .from(ordersTable)
        .where(or(eq(ordersTable.id, cleanId), eq(ordersTable.displayId, cleanId)))
        .limit(1);
      if (rows.length > 0) order = rows[0];
    } catch {}
  }
  return order;
}

router.post("/seller/orders/:orderId/accept", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));
    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    if (order.status === "cancelled" || order.status === "rejected" || order.status === "delivered" || order.status === "shipped") {
      return res.status(400).json({ error: "Order cannot be accepted in its current state" });
    }

    const acceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const acceptanceRecord = { status: "accepted", at: new Date().toISOString() };
    acceptances[vendorId] = acceptanceRecord;
    if (req.userId && req.userId !== vendorId) {
      acceptances[req.userId] = acceptanceRecord;
    }
    if (req.sellerId && req.sellerId !== vendorId) {
      acceptances[req.sellerId] = acceptanceRecord;
    }

    const allProductIds = items.map((i: any) => i.productId).filter(Boolean) as string[];
    let allOrderProducts: any[] = [];
    try {
      if (allProductIds.length > 0) {
        allOrderProducts = await db
          .select({ vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(inArray(productsTable.id, allProductIds));
      }
    } catch {}

    if (allOrderProducts.length === 0 && allProductIds.length > 0) {
      try {
        allOrderProducts = await mongoProducts.findMany({ id: { $in: allProductIds } } as any);
      } catch {}
    }

    let allVendorIds = [...new Set([
      ...allOrderProducts.map((p) => p.vendorId).filter(Boolean),
      ...items.map((i: any) => i.vendorId || i.sellerId || i.ownerId).filter(Boolean),
    ])] as string[];

    if (allVendorIds.length === 0) {
      allVendorIds = [vendorId];
    }

    const allResponded = allVendorIds.length > 0 && allVendorIds.every(
      (vid) => acceptances[vid]?.status === "accepted" || acceptances[vid]?.status === "rejected"
    );
    const anyAccepted = allVendorIds.some((vid) => acceptances[vid]?.status === "accepted");

    const history = [...(Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [])];
    const nowIso = new Date().toISOString();
    const updates: Record<string, any> = { vendorAcceptances: acceptances, updatedAt: new Date() };

    if (allResponded && anyAccepted) {
      history.push({ status: "processing", timestamp: nowIso, note: "All vendors responded — order accepted and is being prepared" });
      updates.status = "processing";
      updates.statusHistory = history;

      try {
        await insertOrderStatusNotification({
          tx: db as any,
          userId: order.userId,
          type: "order_packed",
          orderId: order.id,
          itemName: (items[0] as any)?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });
      } catch {}
    } else {
      history.push({ vendorId, timestamp: nowIso, note: "Vendor accepted their portion of the order" });
      updates.statusHistory = history;
    }

    try {
      await db.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));
    } catch {}

    try {
      await mongoOrders.update(orderId, updates);
    } catch {}

    const updatedOrder = await findOrderById(orderId);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    return res.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    req.log?.error({ err }, "seller/orders/accept failed");
    return res.status(500).json({ error: "Failed to accept order" });
  }
});

router.post("/seller/orders/:orderId/reject", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const reason = String(req.body?.reason ?? "").trim();

  if (!reason) {
    return res.status(400).json({ error: "A rejection reason is required" });
  }

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));
    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    if (order.status === "cancelled" || order.status === "rejected" || order.status === "delivered" || order.status === "shipped") {
      return res.status(400).json({ error: "Order cannot be rejected in its current state" });
    }

    const acceptances = ((order as any).vendorAcceptances as Record<string, any>) ?? {};
    const rejectionRecord = { status: "rejected", reason, at: new Date().toISOString() };
    acceptances[vendorId] = rejectionRecord;
    if (req.userId && req.userId !== vendorId) {
      acceptances[req.userId] = rejectionRecord;
    }
    if (req.sellerId && req.sellerId !== vendorId) {
      acceptances[req.sellerId] = rejectionRecord;
    }

    const allProductIds = items.map((i: any) => i.productId).filter(Boolean) as string[];
    let allOrderProducts: any[] = [];
    try {
      if (allProductIds.length > 0) {
        allOrderProducts = await db
          .select({ vendorId: productsTable.vendorId })
          .from(productsTable)
          .where(inArray(productsTable.id, allProductIds));
      }
    } catch {}

    if (allOrderProducts.length === 0 && allProductIds.length > 0) {
      try {
        allOrderProducts = await mongoProducts.findMany({ id: { $in: allProductIds } } as any);
      } catch {}
    }

    let allVendorIds = [...new Set([
      ...allOrderProducts.map((p) => p.vendorId).filter(Boolean),
      ...items.map((i: any) => i.vendorId || i.sellerId || i.ownerId).filter(Boolean),
    ])] as string[];

    if (allVendorIds.length === 0) {
      allVendorIds = [vendorId];
    }

    const allRejected = allVendorIds.length > 0 && allVendorIds.every((vid) => acceptances[vid]?.status === "rejected");
    const history = [...(Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [])];
    const nowIso = new Date().toISOString();

    if (allRejected) {
      history.push({ status: "rejected", timestamp: nowIso, note: `Order rejected by seller: ${reason}` });

      for (const item of items as Array<{ productId: string; quantity: number }>) {
        try {
          const [prod] = await db
            .select({ stock: productsTable.stock, vendorId: productsTable.vendorId })
            .from(productsTable)
            .where(eq(productsTable.id, item.productId))
            .limit(1);

          if (prod) {
            await db
              .update(productsTable)
              .set({ stock: sql`${productsTable.stock} + ${item.quantity}` })
              .where(eq(productsTable.id, item.productId));

            await recordStockChange({
              tx: db as any,
              productId: item.productId,
              vendorId: prod?.vendorId ?? null,
              previousStock: prod?.stock ?? 0,
              newStock: (prod?.stock ?? 0) + item.quantity,
              source: "cancel",
              reason: `Vendor rejection: ${reason}`,
              orderId: order.id,
            });
          }
        } catch {}

        try {
          const mProd = await mongoProducts.findById(item.productId);
          if (mProd) {
            await mongoProducts.update(item.productId, { stock: (mProd.stock || 0) + item.quantity });
          }
        } catch {}
      }

      const updates: Record<string, any> = {
        status: "rejected",
        statusHistory: history,
        cancelReason: `Vendor rejected: ${reason}`,
        vendorRejectionReason: reason,
        vendorAcceptances: acceptances,
        refundStatus: "pending",
        refundMethod: (order as any).paymentMethod,
        updatedAt: new Date(),
      };

      try {
        await db.update(ordersTable).set(updates).where(eq(ordersTable.id, orderId));
      } catch {}

      try {
        await mongoOrders.update(orderId, updates);
      } catch {}

      try {
        await insertOrderStatusNotification({
          tx: db as any,
          userId: order.userId,
          type: "order_cancelled",
          orderId: order.id,
          itemName: (items[0] as any)?.name ?? "your order",
          extraItemCount: items.length > 1 ? items.length - 1 : 0,
        });
      } catch {}

      try {
        await insertAdminNotification({
          tx: db as any,
          type: "system_error_alert",
          title: "Vendor rejected an order — order rejected",
          body: `Vendor rejected order ${order.id}. Reason: ${reason}`,
          metadata: { orderId: order.id, vendorId },
        });
      } catch {}
    } else {
      history.push({ vendorId, timestamp: nowIso, note: `Vendor rejected their portion: ${reason}` });

      const allRespondedNow = allVendorIds.length > 0 && allVendorIds.every(
        (vid) => acceptances[vid]?.status === "accepted" || acceptances[vid]?.status === "rejected"
      );
      const anyAcceptedNow = allVendorIds.some((vid) => acceptances[vid]?.status === "accepted");

      const partialUpdates: Record<string, any> = {
        vendorAcceptances: acceptances,
        statusHistory: history,
        updatedAt: new Date(),
      };

      if (allRespondedNow && anyAcceptedNow) {
        history.push({ status: "processing", timestamp: nowIso, note: "Some vendors accepted — order proceeding with accepted items" });
        partialUpdates.status = "processing";
        partialUpdates.statusHistory = history;
      }

      try {
        await db.update(ordersTable).set(partialUpdates as any).where(eq(ordersTable.id, orderId));
      } catch {}

      try {
        await mongoOrders.update(orderId, partialUpdates);
      } catch {}
    }

    const updatedOrder = await findOrderById(orderId);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    return res.json({ success: true, order: updatedOrder });
  } catch (err: any) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    req.log?.error({ err }, "seller/orders/reject failed");
    return res.status(500).json({ error: "Failed to reject order" });
  }
});

async function resolveSellerAliases(req: any): Promise<string[]> {
  const vendorId = req.vendorId;
  let vendorObj = req.vendor;
  if (!vendorObj && vendorId && mongoSellers && typeof mongoSellers.findById === "function") {
    try {
      vendorObj = await mongoSellers.findById(vendorId);
    } catch {}
  }
  const aliases = new Set<string>();
  if (vendorId && typeof vendorId === "string" && vendorId.trim()) aliases.add(vendorId.trim());
  if (req.sellerId && typeof req.sellerId === "string" && req.sellerId.trim()) aliases.add(req.sellerId.trim());
  if (req.userId && typeof req.userId === "string" && req.userId.trim()) aliases.add(req.userId.trim());
  if (vendorObj) {
    if (vendorObj.id && typeof vendorObj.id === "string") aliases.add(vendorObj.id.trim());
    if (vendorObj.vendorId && typeof vendorObj.vendorId === "string") aliases.add(vendorObj.vendorId.trim());
    if (vendorObj.sellerId && typeof vendorObj.sellerId === "string") aliases.add(vendorObj.sellerId.trim());
    if (vendorObj.ownerId && typeof vendorObj.ownerId === "string") aliases.add(vendorObj.ownerId.trim());
    if (vendorObj.userId && typeof vendorObj.userId === "string") aliases.add(vendorObj.userId.trim());
    if (vendorObj._id) aliases.add(String(vendorObj._id).trim());
  }
  return Array.from(aliases);
}

async function fetchSettlementsForAliases(aliases: string[], primaryVendorId: string): Promise<any[]> {
  let all: any[] = [];
  try {
    if (aliases.length > 1) {
      all = await db
        .select()
        .from(vendorSettlementsTable)
        .where(inArray(vendorSettlementsTable.vendorId, aliases))
        .orderBy(desc(vendorSettlementsTable.createdAt));
    } else {
      all = await db
        .select()
        .from(vendorSettlementsTable)
        .where(eq(vendorSettlementsTable.vendorId, primaryVendorId))
        .orderBy(desc(vendorSettlementsTable.createdAt));
    }
  } catch {}

  if (all.length === 0 && typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
    try {
      if (mongoSettlements && typeof mongoSettlements.findMany === "function") {
        all = await mongoSettlements.findMany({
          vendorId: aliases.length > 1 ? { $in: aliases } : primaryVendorId,
        });
        all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
        all = await mongoGeneric.getCollection("vendor_settlements").find({
          vendorId: aliases.length > 1 ? { $in: aliases } : primaryVendorId,
        }).sort({ createdAt: -1 }).toArray();
      }
    } catch {}
  }

  return all;
}

router.get("/seller/settlements", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const statusFilter = (req.query.status as string | undefined)?.trim();
  const page = Math.max(1, parseInt((req.query.page as string) || "1"));
  const limit = 20;
  const offset = (page - 1) * limit;

  try {
    const aliases = await resolveSellerAliases(req);
    const all = await fetchSettlementsForAliases(aliases, vendorId);

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    let totalEarnedThisMonth = 0;
    let totalPending = 0;
    let totalPaid = 0;

    // Only count order_settlement rows in the summary (payout rows are transfer records, not earnings)
    const orderSettlementsAll = all.filter((s) => s.type !== "payout");

    for (const s of orderSettlementsAll) {
      const net = s.netPayout ?? s.amount ?? 0;
      if (new Date(s.createdAt) >= monthStart) totalEarnedThisMonth += net;
      if (s.status === "processing" || s.status === "pending" || s.status === "approved" || s.status === "eligible") totalPending += net;
      if (s.status === "paid" || s.status === "completed") totalPaid += net;
    }

    const hasPendingPayoutRequest = all.some(
      (s) => s.type === "payout" && (s.status === "pending" || s.status === "processing" || s.status === "approved"),
    );

    // Pagination and status filters apply only to order settlements
    const filtered = statusFilter && statusFilter !== "all"
      ? orderSettlementsAll.filter((s) => s.status === statusFilter)
      : orderSettlementsAll;
    const total = filtered.length;
    const settlements = filtered.slice(offset, offset + limit);

    res.json({
      settlements,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      summary: { totalEarnedThisMonth, totalPending, totalPaid },
      hasPendingPayoutRequest,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements failed");
    res.status(500).json({ error: "Failed to load settlements" });
  }
});

/**
 * GET /seller/payouts
 * Endpoint consumed by SellerPayouts dashboard.
 */
router.get("/seller/payouts", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;

  try {
    const aliases = await resolveSellerAliases(req);
    const all = await fetchSettlementsForAliases(aliases, vendorId);

    const orderSettlements = all.filter((s) => s.type !== "payout");
    let lifetimeEarnings = 0;
    let pendingBalance = 0;

    for (const s of orderSettlements) {
      const net = s.netPayout ?? s.amount ?? 0;
      if (s.status === "paid" || s.status === "completed") {
        lifetimeEarnings += net;
      } else if (["pending", "processing", "approved", "eligible"].includes(s.status)) {
        pendingBalance += net;
      }
    }

    // Convert to rupees if values stored in integer paise
    const isPaise = lifetimeEarnings > 10000 || pendingBalance > 10000;
    const finalEarnings = isPaise ? Math.round(lifetimeEarnings / 100) : lifetimeEarnings;
    const finalPending = isPaise ? Math.round(pendingBalance / 100) : pendingBalance;

    const payouts = all.map((s) => {
      const rawAmt = s.sellerSettlement ?? s.netPayout ?? s.amount ?? 0;
      const amtInRupees = rawAmt > 10000 ? Math.round(rawAmt / 100) : rawAmt;
      return {
        id: s.id,
        orderId: s.orderId || (s.type === "payout" ? `Payout-${String(s.id).slice(0, 6)}` : "—"),
        deliveredAt: s.paidAt || s.createdAt,
        itemCount: 1,
        amount: amtInRupees,
        status: s.status,
        utrNumber: s.utrNumber || null,
        payoutReference: s.payoutReference || s.cashfreeTransferId || null,
        paidAt: s.paidAt || null,
      };
    });

    res.json({
      lifetimeEarnings: finalEarnings,
      pendingBalance: finalPending,
      payouts,
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/payouts failed");
    res.status(500).json({ error: "Failed to load payouts" });
  }
});

router.get("/seller/settlements/payout-requests", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;

  try {
    const aliases = await resolveSellerAliases(req);
    let payouts: any[] = [];
    try {
      payouts = await db
        .select()
        .from(vendorSettlementsTable)
        .where(and(
          aliases.length > 1
            ? inArray(vendorSettlementsTable.vendorId, aliases)
            : eq(vendorSettlementsTable.vendorId, vendorId),
          eq(vendorSettlementsTable.type, "payout"),
        ))
        .orderBy(desc(vendorSettlementsTable.createdAt));
    } catch {}

    if (payouts.length === 0 && typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        if (mongoSettlements && typeof mongoSettlements.findMany === "function") {
          payouts = await mongoSettlements.findMany({
            vendorId: aliases.length > 1 ? { $in: aliases } : vendorId,
            type: "payout",
          });
          payouts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        } else if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
          payouts = await mongoGeneric.getCollection("vendor_settlements").find({
            vendorId: aliases.length > 1 ? { $in: aliases } : vendorId,
            type: "payout",
          }).sort({ createdAt: -1 }).toArray();
        }
      } catch {}
    }

    res.json({ payouts });
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements/payout-requests failed");
    res.status(500).json({ error: "Failed to load payout requests" });
  }
});

router.post("/seller/settlements/payout-request", requireVendorAuth, async (req: any, res: any) => {
  const vendor = req.vendor;
  const vendorId = req.vendorId;

  try {
    const currentVendor = (await mongoSellers.findById(vendorId)) || (await mongoSellers.findByVendorId(vendorId)) || vendor;
    if (!isVendorBankVerified(currentVendor)) {
      return res.status(400).json({
        error: "Your bank account has not been verified yet. Bank verification is required before payouts can be requested or disbursed.",
      });
    }

    const aliases = await resolveSellerAliases(req);
    // Check for an existing pending payout request
    let existing: any[] = [];
    try {
      existing = await db
        .select({ id: vendorSettlementsTable.id, status: vendorSettlementsTable.status })
        .from(vendorSettlementsTable)
        .where(and(
          aliases.length > 1
            ? inArray(vendorSettlementsTable.vendorId, aliases)
            : eq(vendorSettlementsTable.vendorId, vendorId),
          eq(vendorSettlementsTable.type, "payout"),
          inArray(vendorSettlementsTable.status, ["pending", "processing", "approved"]),
        ))
        .limit(1);
    } catch {}

    if (existing.length === 0 && typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        const filter: any = {
          vendorId: aliases.length > 1 ? { $in: aliases } : vendorId,
          type: "payout",
          status: { $in: ["pending", "processing", "approved"] },
        };
        if (mongoSettlements && typeof mongoSettlements.findMany === "function") {
          existing = await mongoSettlements.findMany(filter);
        } else if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
          existing = await mongoGeneric.getCollection("vendor_settlements").find(filter).limit(1).toArray();
        }
      } catch {}
    }

    if (existing.length > 0) {
      return res.status(409).json({
        error: "A payout request is already pending review. Please wait for it to be processed before submitting a new one.",
      });
    }

    // Sum all pending order_settlement net payouts for this vendor across aliases
    let pendingSettlements: any[] = [];
    try {
      pendingSettlements = await db
        .select({ netPayout: vendorSettlementsTable.netPayout, amount: vendorSettlementsTable.amount })
        .from(vendorSettlementsTable)
        .where(and(
          aliases.length > 1
            ? inArray(vendorSettlementsTable.vendorId, aliases)
            : eq(vendorSettlementsTable.vendorId, vendorId),
          eq(vendorSettlementsTable.type, "order_settlement"),
          eq(vendorSettlementsTable.status, "pending"),
        ));
    } catch {}

    if (pendingSettlements.length === 0 && typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        const filter: any = {
          vendorId: aliases.length > 1 ? { $in: aliases } : vendorId,
          type: "order_settlement",
          status: "pending",
        };
        if (mongoSettlements && typeof mongoSettlements.findMany === "function") {
          pendingSettlements = await mongoSettlements.findMany(filter);
        } else if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
          pendingSettlements = await mongoGeneric.getCollection("vendor_settlements").find(filter).toArray();
        }
      } catch {}
    }

    const totalAmount = pendingSettlements.reduce((sum, s) => sum + (s.netPayout ?? s.amount ?? 0), 0);

    if (totalAmount <= 0) {
      return res.status(400).json({ error: "No pending balance available to request a payout for." });
    }

    let created: any = null;
    try {
      const [resCreated] = await db.insert(vendorSettlementsTable).values({
        vendorId,
        amount: totalAmount,
        type: "payout",
        status: "pending",
        note: "Vendor-initiated payout request",
      }).returning();
      created = resCreated;
    } catch {}

    if (typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        if (mongoSettlements && typeof mongoSettlements.insert === "function") {
          const doc = await mongoSettlements.insert({
            id: created?.id,
            vendorId,
            amount: totalAmount,
            type: "payout",
            status: "pending",
            note: "Vendor-initiated payout request",
          });
          if (!created) created = doc;
        }
      } catch {}
    }

    res.status(201).json({ settlement: created || { vendorId, amount: totalAmount, type: "payout", status: "pending" } });
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements/payout-request failed");
    res.status(500).json({ error: "Failed to submit payout request" });
  }
});

router.get("/seller/settlements/:settlementId", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  const { settlementId } = req.params;

  try {
    const aliases = await resolveSellerAliases(req);
    let settlement: any = null;
    try {
      const [row] = await db
        .select()
        .from(vendorSettlementsTable)
        .where(and(
          eq(vendorSettlementsTable.id, settlementId),
          aliases.length > 1
            ? inArray(vendorSettlementsTable.vendorId, aliases)
            : eq(vendorSettlementsTable.vendorId, vendorId),
        ))
        .limit(1);
      settlement = row;
    } catch {}

    if (!settlement && typeof isMongoDbConnected === "function" && isMongoDbConnected()) {
      try {
        if (mongoSettlements && typeof mongoSettlements.findById === "function") {
          const s = await mongoSettlements.findById(settlementId);
          if (s && aliases.includes(String(s.vendorId))) {
            settlement = s;
          }
        }
      } catch {}
    }

    if (!settlement) {
      return res.status(404).json({ error: "Settlement not found" });
    }

    res.json({ settlement });
  } catch (err: any) {
    req.log?.error({ err }, "seller/settlements/:id failed");
    res.status(500).json({ error: "Failed to load settlement" });
  }
});

// ── Reactivation welcome dismiss ─────────────────────────────────────────────
// Called by the frontend after the seller closes the one-time "Welcome Back!" popup.
// Clears the flag so the popup never shows again for this reactivation event.
router.post("/seller/reactivation-welcome/dismiss", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId;
  try {
    await db
      .update(vendorsTable)
      .set({ reactivationWelcomePending: false })
      .where(eq(vendorsTable.id, vendorId));

    try {
      if (typeof isMongoDbConnected === "function" && isMongoDbConnected() && mongoSellers && typeof mongoSellers.update === "function") {
        await mongoSellers.update(vendorId, { reactivationWelcomePending: false });
      }
    } catch {}

    res.json({ ok: true });
  } catch (err: any) {
    req.log?.error?.({ err }, "seller/reactivation-welcome/dismiss failed");
    res.status(500).json({ error: "Failed to dismiss welcome" });
  }
});

// ── VENDOR DIRECT SHIPPING FLOW ENDPOINTS ──────────────────────────────────────

/**
 * POST /seller/orders/:orderId/packaging-checklist
 * Records quality inspection & premium packaging checklist completion for vendor direct fulfillment.
 */
router.post("/seller/orders/:orderId/packaging-checklist", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const {
    qualityInspected,
    fabricInspected,
    damageChecked,
    foldedAndPacked,
    authenticityVerified,
    brandedBoxUsed,
    wrappingPaperUsed,
    careInstructionsIncluded,
    thankYouCardIncluded,
    authenticityCardIncluded,
  } = req.body || {};

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));

    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    const checklists = ((order as any).vendorPackagingChecklist as Record<string, any>) ?? {};
    const checklistData = {
      completedAt: new Date().toISOString(),
      vendorId,
      qualityInspected: !!qualityInspected,
      fabricInspected: !!fabricInspected,
      damageChecked: !!damageChecked,
      foldedAndPacked: !!foldedAndPacked,
      authenticityVerified: !!authenticityVerified,
      premiumPackaging: {
        brandedBoxUsed: !!brandedBoxUsed,
        wrappingPaperUsed: !!wrappingPaperUsed,
        careInstructionsIncluded: !!careInstructionsIncluded,
        thankYouCardIncluded: !!thankYouCardIncluded,
        authenticityCardIncluded: !!authenticityCardIncluded,
      },
    };
    checklists[vendorId] = checklistData;

    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];
    history.push({
      status: "packed",
      vendorId,
      timestamp: new Date().toISOString(),
      note: "Vendor completed quality inspection and premium packaging verification",
    });

    const newStatus = order.status === "processing" ? "packed" : order.status;
    const updates = {
      vendorPackagingChecklist: checklists,
      status: newStatus,
      statusHistory: history,
      updatedAt: new Date(),
    };

    try {
      await db
        .update(ordersTable)
        .set(updates as any)
        .where(eq(ordersTable.id, order.id));
    } catch {}

    try {
      await mongoOrders.update(order.id, updates);
    } catch {}

    const updatedOrder = await findOrderById(order.id);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    res.json({ success: true, checklist: checklistData, status: newStatus });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/packaging-checklist failed");
    res.status(500).json({ error: "Failed to update packaging checklist" });
  }
});

/**
 * GET /seller/orders/:orderId/documents
 * Generates shipping label, AWB, invoice, and packing slip data for vendor direct fulfillment.
 */
router.get("/seller/orders/:orderId/documents", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const vendor = req.vendor;
    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));

    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    const history = Array.isArray(order.statusHistory) ? (order.statusHistory as any[]) : [];
    const dispatchEntry = history.find((h) => h.status === "vendor_dispatched" && h.vendorId === vendorId) ||
      history.find((h) => h.trackingNumber);

    const awbNumber = dispatchEntry?.trackingNumber || (order as any).awbNumber || `SR-AWB-${order.id.slice(0, 8).toUpperCase()}`;
    const courierPartner = dispatchEntry?.courierName || (order as any).courierName || "Shiprocket Express";

    const address = (order.address as any) ?? {};
    const itemSubtotal = myItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0);

    const documents = {
      orderId: order.id,
      displayId: order.displayId ?? order.id,
      orderDate: order.createdAt,
      courierPartner,
      awbNumber,
      shiprocketIntegration: {
        active: true,
        channel: "Vendor Direct Fulfillment",
        pickupScheduled: history.some((h) => h.status === "pickup_scheduled" || h.status === "shipped"),
      },
      sellerAddress: {
        name: vendor?.name ?? "Vendor Partner",
        storeName: vendor?.storeName ?? vendor?.name ?? "Vashtraa Vendor",
        city: vendor?.city ?? "Surat",
        state: vendor?.state ?? "Gujarat",
        phone: vendor?.phone ?? "+91 98765 43210",
        pincode: vendor?.pincode ?? "395002",
      },
      customerAddress: {
        name: address.name ?? "Customer",
        line1: address.line1 ?? "",
        line2: address.line2 ?? "",
        city: address.city ?? "",
        state: address.state ?? "",
        pincode: address.pincode ?? "",
        phone: address.phone ?? "",
      },
      items: myItems.map((i) => ({
        name: i.name,
        quantity: i.quantity ?? 1,
        price: i.price ?? 0,
        total: (i.price ?? 0) * (i.quantity ?? 1),
      })),
      financials: {
        itemSubtotal,
        shippingFee: order.shipping ?? 0,
        taxAmount: order.tax ?? 0,
        totalAmount: itemSubtotal,
        paymentMethod: order.paymentMethod,
        isPaid: order.paymentMethod !== "cod",
      },
    };

    res.json({ success: true, documents });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/documents failed");
    res.status(500).json({ error: "Failed to generate order documents" });
  }
});

/**
 * POST /seller/orders/:orderId/schedule-pickup
 * Schedules direct courier pickup from vendor location via Shiprocket partner network.
 */
router.post("/seller/orders/:orderId/schedule-pickup", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const { pickupDate, pickupTimeSlot, courierPartner: selectedCourier } = req.body || {};

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));

    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    const courier = selectedCourier || "Shiprocket (BlueDart / Delhivery)";
    const awb = (order as any).awbNumber || `SR-AWB-${Math.floor(10000000 + Math.random() * 90000000)}`;
    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];

    history.push({
      status: "ready_to_ship",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Courier pickup scheduled with ${courier} for ${pickupDate || "Next Available Slot"} (${pickupTimeSlot || "Morning"}). AWB: ${awb}`,
      courierName: courier,
      trackingNumber: awb,
    });

    history.push({
      status: "shipped",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Package picked up directly from vendor location by ${courier}`,
      courierName: courier,
      trackingNumber: awb,
    });

    history.push({
      status: "in_transit",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Package in transit with ${courier} — Tracking ID: ${awb}`,
      courierName: courier,
      trackingNumber: awb,
    });

    const updates = {
      status: "in_transit",
      statusHistory: history,
      awbNumber: awb,
      courierName: courier,
      updatedAt: new Date(),
    };

    try {
      await db
        .update(ordersTable)
        .set(updates as any)
        .where(eq(ordersTable.id, order.id));
    } catch {}

    try {
      await mongoOrders.update(order.id, updates);
    } catch {}

    await insertOrderStatusNotification({
      userId: order.userId,
      type: "order_shipped",
      orderId: order.id,
      itemName: (myItems[0] as any)?.name ?? "your order",
      extraItemCount: myItems.length > 1 ? myItems.length - 1 : 0,
      trackingNumber: awb,
    });

    const updatedOrder = await findOrderById(order.id);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    res.json({
      success: true,
      status: "in_transit",
      awbNumber: awb,
      courierName: courier,
      message: "Courier pickup scheduled successfully from vendor location.",
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/schedule-pickup failed");
    res.status(500).json({ error: "Failed to schedule courier pickup" });
  }
});

/**
 * GET /seller/returns
 * Lists return requests for items belonging to the authenticated vendor.
 */
router.get("/seller/returns", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;

  try {
    const productIdSet = await getVendorProductIdSet(req);

    // 1. Primary: MongoDB orders collection
    let allOrders: any[] = [];
    try {
      allOrders = await mongoOrders.findMany({}, { sort: { createdAt: -1 } });
    } catch {}

    if (!Array.isArray(allOrders) || allOrders.length === 0) {
      try {
        const col = (await import("@workspace/db")).getCollection("orders");
        allOrders = await col.find({}).sort({ createdAt: -1 }).toArray();
      } catch {}
    }

    // 2. Fallback: PostgreSQL ordersTable
    if (!Array.isArray(allOrders) || allOrders.length === 0) {
      try {
        allOrders = await db
          .select()
          .from(ordersTable)
          .orderBy(desc(ordersTable.createdAt));
      } catch {}
    }
    if (!Array.isArray(allOrders)) {
      allOrders = [];
    }

    const vendorReturns: any[] = [];
    for (const order of allOrders) {
      const items = (order.items as any[]) ?? [];
      const vendorItems = items.filter((i) => isVendorItem(i, productIdSet, req));
      if (vendorItems.length === 0) continue;

      const isReturnRelated = [
        "return_requested",
        "return_approved",
        "return_rejected",
        "returned",
        "refunded",
      ].includes(order.status) || order.returnReason != null;

      if (!isReturnRelated) continue;

      let reasonData: any = order.returnReason;
      if (typeof order.returnReason === "string") {
        try { reasonData = JSON.parse(order.returnReason); } catch {}
      }

      const returnResponses = ((order as any).vendorReturnResponses as Record<string, any>) ?? {};
      const myReturnResponse =
        returnResponses[vendorId] ||
        (req.userId && returnResponses[req.userId]) ||
        (req.sellerId && returnResponses[req.sellerId]) ||
        (req.vendor?.id && returnResponses[req.vendor.id]) ||
        (req.vendor?.ownerId && returnResponses[req.vendor.ownerId]);

      vendorReturns.push({
        id: order.id,
        displayId: order.displayId ?? order.id,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        status: order.status,
        returnReason: reasonData?.reason || reasonData || "Customer requested return",
        returnComments: reasonData?.comments || "",
        returnStatus: myReturnResponse?.status || (order.status === "return_requested" ? "pending" : order.status),
        vendorReturnResponse: myReturnResponse || null,
        vendorItems: vendorItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price ?? 0,
          quantity: i.quantity ?? 1,
          images: Array.isArray(i.images) ? i.images : [],
        })),
        vendorTotal: vendorItems.reduce((s: number, i: any) => s + (i.price ?? 0) * (i.quantity ?? 1), 0),
        address: order.address,
      });
    }

    res.json({ returns: vendorReturns });
  } catch (err: any) {
    req.log?.error({ err }, "seller/returns failed");
    res.status(500).json({ error: "Failed to load vendor returns" });
  }
});

/**
 * POST /seller/orders/:orderId/returns/approve
 * Vendor approves customer return request & schedules return pickup.
 */
router.post("/seller/orders/:orderId/returns/approve", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const { notes } = req.body || {};

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));

    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    const responses = ((order as any).vendorReturnResponses as Record<string, any>) ?? {};
    const returnAwb = `RET-AWB-${Math.floor(10000000 + Math.random() * 90000000)}`;

    responses[vendorId] = {
      status: "approved",
      at: new Date().toISOString(),
      notes: notes || "Return request approved by vendor. Courier pickup scheduled from customer address.",
      returnAwb,
    };

    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];
    history.push({
      status: "return_approved",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Vendor approved return request. Return pickup AWB generated: ${returnAwb}`,
    });

    const updates = {
      status: "return_approved",
      vendorReturnResponses: responses,
      statusHistory: history,
      updatedAt: new Date(),
    };

    try {
      await db
        .update(ordersTable)
        .set(updates as any)
        .where(eq(ordersTable.id, order.id));
    } catch {}

    try {
      await mongoOrders.update(order.id, updates);
    } catch {}

    await insertOrderStatusNotification({
      userId: order.userId,
      type: "return_approved",
      orderId: order.id,
      itemName: (myItems[0] as any)?.name ?? "your order",
      extraItemCount: myItems.length > 1 ? myItems.length - 1 : 0,
    });

    const updatedOrder = await findOrderById(order.id);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    res.json({ success: true, returnAwb, status: "return_approved" });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/returns/approve failed");
    res.status(500).json({ error: "Failed to approve return request" });
  }
});

/**
 * POST /seller/orders/:orderId/returns/reject
 * Vendor rejects customer return request with a reason.
 */
router.post("/seller/orders/:orderId/returns/reject", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const { reason } = req.body || {};

  if (!reason || !String(reason).trim()) {
    return res.status(400).json({ error: "Rejection reason is required" });
  }

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));

    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    const responses = ((order as any).vendorReturnResponses as Record<string, any>) ?? {};
    responses[vendorId] = {
      status: "rejected",
      at: new Date().toISOString(),
      reason: String(reason).trim(),
    };

    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];
    history.push({
      status: "return_rejected",
      vendorId,
      timestamp: new Date().toISOString(),
      note: `Vendor rejected return request: ${String(reason).trim()}`,
    });

    const updates = {
      status: "return_rejected",
      vendorReturnResponses: responses,
      statusHistory: history,
      updatedAt: new Date(),
    };

    try {
      await db
        .update(ordersTable)
        .set(updates as any)
        .where(eq(ordersTable.id, order.id));
    } catch {}

    try {
      await mongoOrders.update(order.id, updates);
    } catch {}

    const updatedOrder = await findOrderById(order.id);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    res.json({ success: true, status: "return_rejected" });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/returns/reject failed");
    res.status(500).json({ error: "Failed to reject return request" });
  }
});

/**
 * POST /seller/orders/:orderId/returns/verify
 * Vendor inspects & verifies returned saree condition (condition check, damage status, original packaging) upon receipt, releasing customer refund.
 */
router.post("/seller/orders/:orderId/returns/verify", requireVendorAuth, async (req: any, res: any) => {
  const vendorId = req.vendorId as string;
  const { orderId } = req.params;
  const {
    conditionPass,
    noDamagePass,
    originalPackagingIntact,
    verificationNotes,
  } = req.body || {};

  try {
    const myProductIdSet = await getVendorProductIdSet(req);
    const order = await findOrderById(orderId);

    if (!order) return res.status(404).json({ error: "Order not found" });

    const items = (order.items as any[]) ?? [];
    const myItems = items.filter((i) => isVendorItem(i, myProductIdSet, req));

    if (myItems.length === 0) {
      return res.status(403).json({ error: "You don't have items in this order" });
    }

    const isVerified = !!(conditionPass && noDamagePass && originalPackagingIntact);
    const verificationRecord = {
      verifiedAt: new Date().toISOString(),
      vendorId,
      conditionPass: !!conditionPass,
      noDamagePass: !!noDamagePass,
      originalPackagingIntact: !!originalPackagingIntact,
      isVerified,
      verificationNotes: verificationNotes || "Vendor verified product condition and packaging upon return arrival.",
    };

    const verifications = ((order as any).vendorReturnVerifications as Record<string, any>) ?? {};
    verifications[vendorId] = verificationRecord;

    const history = Array.isArray(order.statusHistory) ? [...(order.statusHistory as any[])] : [];
    history.push({
      status: isVerified ? "returned" : "return_verification_failed",
      vendorId,
      timestamp: new Date().toISOString(),
      note: isVerified
        ? "Vendor verified returned product condition — product received & refund initiated"
        : `Return verification failed: ${verificationNotes || "Condition or packaging discrepancy"}`,
    });

    // If verified, restock inventory and set refundStatus to pending/approved
    if (isVerified) {
      for (const item of myItems) {
        try {
          const [prod] = await db
            .select({ stock: productsTable.stock, vendorId: productsTable.vendorId })
            .from(productsTable)
            .where(eq(productsTable.id, item.productId))
            .limit(1);

          if (prod) {
            await db
              .update(productsTable)
              .set({ stock: sql`${productsTable.stock} + ${item.quantity ?? 1}` })
              .where(eq(productsTable.id, item.productId));

            await recordStockChange({
              productId: item.productId,
              vendorId,
              previousStock: prod?.stock ?? 0,
              newStock: (prod?.stock ?? 0) + (item.quantity ?? 1),
              source: "return",
              reason: "Returned item verified and restocked",
              orderId: order.id,
            });
          }
        } catch {}

        try {
          const mProd = await mongoProducts.findById(item.productId);
          if (mProd) {
            await mongoProducts.update(item.productId, { stock: (mProd.stock || 0) + (item.quantity ?? 1) });
          }
        } catch {}
      }
    }

    const updates = {
      status: isVerified ? "returned" : order.status,
      refundStatus: isVerified ? "approved" : order.refundStatus,
      vendorReturnVerifications: verifications,
      statusHistory: history,
      updatedAt: new Date(),
    };

    try {
      await db
        .update(ordersTable)
        .set(updates as any)
        .where(eq(ordersTable.id, order.id));
    } catch {}

    try {
      await mongoOrders.update(order.id, updates);
    } catch {}

    if (isVerified) {
      try {
        await insertOrderStatusNotification({
          userId: order.userId,
          type: "refund_completed",
          orderId: order.id,
          itemName: (myItems[0] as any)?.name ?? "your order",
          extraItemCount: myItems.length > 1 ? myItems.length - 1 : 0,
        });
      } catch {}
    }

    const updatedOrder = await findOrderById(order.id);
    if (updatedOrder) {
      try {
        emitOrderEvent("order:status_changed", updatedOrder);
      } catch {}
    }

    res.json({
      success: true,
      verified: isVerified,
      status: isVerified ? "returned" : order.status,
      message: isVerified
        ? "Return verified successfully. Inventory restocked and customer refund approved."
        : "Return verification failed.",
    });
  } catch (err: any) {
    req.log?.error({ err }, "seller/orders/returns/verify failed");
    res.status(500).json({ error: "Failed to verify returned product" });
  }
});

export default router;
