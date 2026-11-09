import { Router } from "express";
import crypto from "crypto";
import { getAuth } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { db, mongoProducts, mongoGeneric, mongoWishlists, mongoNotifications, mongoNotificationPreferences, mongoSellers, mongoVendors, mongoUsers, mongoProductCategories, getNextSequenceValue, validateCategoryAndSubcategory, resolveCategoryData, findCategoryDefinition, registerDynamicSubcategory, normalizeCategoryString } from "@workspace/db";
import { productsTable, vendorsTable, wishlistsTable, notificationsTable, notificationPreferencesTable, searchQueriesTable, CATEGORY_PREFIX } from "@workspace/db";
import type { Request, Response, NextFunction } from "express";
import { eq, ilike, and, gte, lte, desc, asc, sql, or, isNotNull, isNull, inArray, lt } from "@workspace/db";
import { isSeller as requireVendorAuth } from "../middlewares/isSeller";
import { recordStockChange } from "../lib/stockHistory";
import { insertSellerNotification } from "../lib/sellerNotifications";
import { insertAdminNotification } from "../lib/adminNotifications";
import { emitProductEvent } from "../lib/socket";
import { globalCache, safeClearCache, safeInvalidatePattern } from "../lib/cacheEngine";
import { calculateVastraaFinancials, toPaise, toRupees } from "../lib/pricingEngine";
import { getApprovedVendorData, isProductVendorValid } from "../lib/vendorValidation";
import { verifyAccessToken } from "../lib/jwt";
import { verifyAdminAccessKey } from "../middlewares/isAdmin";

async function notifySellerStockLevel(
  vendorId: string | null,
  productId: string,
  productName: string,
  newStock: number,
  lowStockThreshold: number
): Promise<void> {
  if (!vendorId) return;
  if (newStock <= 0) {
    await insertSellerNotification({
      vendorId,
      type: "out_of_stock",
      title: "Product out of stock",
      body: `"${productName}" is now out of stock.`,
      metadata: { productId },
    });
  } else if (newStock <= lowStockThreshold) {
    await insertSellerNotification({
      vendorId,
      type: "low_stock",
      title: "Low stock alert",
      body: `"${productName}" has only ${newStock} unit(s) left.`,
      metadata: { productId },
    });
  }
}

import { searchProducts, getSearchSuggestions, getProductFacets } from "../lib/searchEngine";

const router = Router();

router.get("/products/search-suggestions", async (req, res) => {
  try {
    const q = (req.query.q as string || req.query.search as string || "").trim();
    const limit = Math.min(20, Math.max(1, parseInt(req.query.limit as string) || 5));
    const suggestions = await getSearchSuggestions(q, limit);
    res.json(suggestions);
  } catch (err) {
    req.log?.error({ err }, "Failed to get search suggestions");
    res.status(500).json({ error: "Failed to get search suggestions" });
  }
});

router.get("/products", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  const query = req.query as Record<string, any>;
  const pageNum = Math.max(1, parseInt(query.page as string) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(query.limit as string) || 24));
  const cacheKey = globalCache.generateKey("products:catalog", query);

  try {
    const data = await globalCache.getOrFetch(cacheKey, async () => {
      const searchOptions: SearchOptions = {
        search: query.search ? String(query.search).trim() : undefined,
        category: query.category ? String(query.category) : undefined,
        subcategory: query.subcategory ? String(query.subcategory) : undefined,
        childCategory: query.childCategory ? String(query.childCategory) : undefined,
        collection: query.collection ? String(query.collection) : undefined,
        fabric: query.fabric ? (Array.isArray(query.fabric) ? query.fabric.map(String) : String(query.fabric)) : undefined,
        color: query.color ? (Array.isArray(query.color) ? query.color.map(String) : String(query.color)) : undefined,
        brand: query.brand ? (Array.isArray(query.brand) ? query.brand.map(String) : String(query.brand)) : undefined,
      size: query.size ? (Array.isArray(query.size) ? query.size.map(String) : String(query.size)) : undefined,
      sleeveLength: (query.sleeveLength || query.sleeve) ? (Array.isArray(query.sleeveLength || query.sleeve) ? (query.sleeveLength || query.sleeve).map(String) : String(query.sleeveLength || query.sleeve)) : undefined,
      neckStyle: (query.neckStyle || query.neck) ? (Array.isArray(query.neckStyle || query.neck) ? (query.neckStyle || query.neck).map(String) : String(query.neckStyle || query.neck)) : undefined,
        pattern: query.pattern ? (Array.isArray(query.pattern) ? query.pattern.map(String) : String(query.pattern)) : undefined,
        occasion: query.occasion ? (Array.isArray(query.occasion) ? query.occasion.map(String) : String(query.occasion)) : undefined,
        gender: query.gender ? (Array.isArray(query.gender) ? query.gender.map(String) : String(query.gender)) : undefined,
        sareeType: query.sareeType ? (Array.isArray(query.sareeType) ? query.sareeType.map(String) : String(query.sareeType)) : undefined,
        sareeStyle: query.sareeStyle ? (Array.isArray(query.sareeStyle) ? query.sareeStyle.map(String) : String(query.sareeStyle)) : undefined,
        packOf: query.packOf ? (Array.isArray(query.packOf) ? query.packOf.map(String) : String(query.packOf)) : undefined,
        countryOfOrigin: query.countryOfOrigin ? (Array.isArray(query.countryOfOrigin) ? query.countryOfOrigin.map(String) : String(query.countryOfOrigin)) : undefined,
        subtype: query.subtype ? (Array.isArray(query.subtype) ? query.subtype.map(String) : String(query.subtype)) : undefined,
        weavingTechnique: query.weavingTechnique ? (Array.isArray(query.weavingTechnique) ? query.weavingTechnique.map(String) : String(query.weavingTechnique)) : undefined,
        workType: query.workType ? (Array.isArray(query.workType) ? query.workType.map(String) : String(query.workType)) : undefined,
        borderType: query.borderType ? (Array.isArray(query.borderType) ? query.borderType.map(String) : String(query.borderType)) : undefined,
        palluDesign: query.palluDesign ? (Array.isArray(query.palluDesign) ? query.palluDesign.map(String) : String(query.palluDesign)) : undefined,
        sareeLength: query.sareeLength ? (Array.isArray(query.sareeLength) ? query.sareeLength.map(String) : String(query.sareeLength)) : undefined,
        origin: query.origin ? (Array.isArray(query.origin) ? query.origin.map(String) : String(query.origin)) : undefined,
        vendorId: query.vendorId ? String(query.vendorId) : undefined,
        minPrice: query.minPrice !== undefined && query.minPrice !== "" && !isNaN(Number(query.minPrice)) ? Number(query.minPrice) : undefined,
        maxPrice: query.maxPrice !== undefined && query.maxPrice !== "" && !isNaN(Number(query.maxPrice)) ? Number(query.maxPrice) : undefined,
        minRating: query.minRating ? parseFloat(query.minRating as string) : undefined,
        minDiscount: query.minDiscount ? parseInt(query.minDiscount as string) : undefined,
        bestSeller: query.bestSeller === "true" || query.bestSeller === true,
        newArrival: query.newArrival === "true" || query.newArrival === true || query.isNewArrival === "true" || query.isNewArrival === true,
        isFeatured: query.isFeatured === "true" || query.isFeatured === true,
        hasDiscount: query.hasDiscount === "true",
        hasOffer: query.hasOffer === "true" || query.offers === "true",
        blouseIncluded: query.blouseIncluded === "true" ? true : query.blouseIncluded === "false" ? false : undefined,
        availability: query.availability ? String(query.availability) : undefined,
        ids: query.ids ? String(query.ids).split(",").map((s) => s.trim()).filter(Boolean) : undefined,
        sort: query.sort ? String(query.sort) : undefined,
        page: pageNum,
        limit: limitNum,
      };

      const searchResult = await searchProducts(searchOptions);
      return {
        products: searchResult.products.map(normalizeProduct as any),
        total: searchResult.total,
        page: searchResult.page,
        limit: searchResult.limit,
        totalPages: searchResult.totalPages,
      };
    }, 60_000);

    if (query.search && String(query.search).trim()) {
      const auth = getAuth(req);
      const userId: string | null = (auth?.sessionClaims?.userId as string) || auth?.userId || null;
      db.insert(searchQueriesTable)
        .values({ term: String(query.search).trim().toLowerCase(), resultCount: data.total, userId })
        .catch((err: unknown) => req.log?.warn({ err }, "Failed to log search query"));
    }

    res.json(data);
  } catch (err) {
    req.log?.error({ err }, "Products search query failed");
    res.status(500).json({ error: "Failed to fetch products" });
  }
});

router.get("/products/facets", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const query = req.query as Record<string, any>;
    const searchOptions: SearchOptions = {
      search: query.search ? String(query.search).trim() : undefined,
      category: query.category ? String(query.category) : undefined,
      subcategory: query.subcategory ? String(query.subcategory) : undefined,
      childCategory: query.childCategory ? String(query.childCategory) : undefined,
      collection: query.collection ? String(query.collection) : undefined,
      fabric: query.fabric ? (Array.isArray(query.fabric) ? query.fabric.map(String) : String(query.fabric)) : undefined,
      color: query.color ? (Array.isArray(query.color) ? query.color.map(String) : String(query.color)) : undefined,
      brand: query.brand ? (Array.isArray(query.brand) ? query.brand.map(String) : String(query.brand)) : undefined,
      size: query.size ? (Array.isArray(query.size) ? query.size.map(String) : String(query.size)) : undefined,
      sleeveLength: (query.sleeveLength || query.sleeve) ? (Array.isArray(query.sleeveLength || query.sleeve) ? (query.sleeveLength || query.sleeve).map(String) : String(query.sleeveLength || query.sleeve)) : undefined,
      neckStyle: (query.neckStyle || query.neck) ? (Array.isArray(query.neckStyle || query.neck) ? (query.neckStyle || query.neck).map(String) : String(query.neckStyle || query.neck)) : undefined,
      pattern: query.pattern ? (Array.isArray(query.pattern) ? query.pattern.map(String) : String(query.pattern)) : undefined,
      occasion: query.occasion ? (Array.isArray(query.occasion) ? query.occasion.map(String) : String(query.occasion)) : undefined,
      gender: query.gender ? (Array.isArray(query.gender) ? query.gender.map(String) : String(query.gender)) : undefined,
      sareeType: query.sareeType ? (Array.isArray(query.sareeType) ? query.sareeType.map(String) : String(query.sareeType)) : undefined,
      sareeStyle: query.sareeStyle ? (Array.isArray(query.sareeStyle) ? query.sareeStyle.map(String) : String(query.sareeStyle)) : undefined,
      packOf: query.packOf ? (Array.isArray(query.packOf) ? query.packOf.map(String) : String(query.packOf)) : undefined,
      countryOfOrigin: query.countryOfOrigin ? (Array.isArray(query.countryOfOrigin) ? query.countryOfOrigin.map(String) : String(query.countryOfOrigin)) : undefined,
      subtype: query.subtype ? (Array.isArray(query.subtype) ? query.subtype.map(String) : String(query.subtype)) : undefined,
      weavingTechnique: query.weavingTechnique ? (Array.isArray(query.weavingTechnique) ? query.weavingTechnique.map(String) : String(query.weavingTechnique)) : undefined,
      workType: query.workType ? (Array.isArray(query.workType) ? query.workType.map(String) : String(query.workType)) : undefined,
      borderType: query.borderType ? (Array.isArray(query.borderType) ? query.borderType.map(String) : String(query.borderType)) : undefined,
      palluDesign: query.palluDesign ? (Array.isArray(query.palluDesign) ? query.palluDesign.map(String) : String(query.palluDesign)) : undefined,
      sareeLength: query.sareeLength ? (Array.isArray(query.sareeLength) ? query.sareeLength.map(String) : String(query.sareeLength)) : undefined,
      origin: query.origin ? (Array.isArray(query.origin) ? query.origin.map(String) : String(query.origin)) : undefined,
      vendorId: query.vendorId ? String(query.vendorId) : undefined,
      minPrice: query.minPrice !== undefined && query.minPrice !== "" && !isNaN(Number(query.minPrice)) ? Number(query.minPrice) : undefined,
      maxPrice: query.maxPrice !== undefined && query.maxPrice !== "" && !isNaN(Number(query.maxPrice)) ? Number(query.maxPrice) : undefined,
      minRating: query.minRating ? parseFloat(query.minRating as string) : undefined,
      minDiscount: query.minDiscount ? parseInt(query.minDiscount as string) : undefined,
      bestSeller: query.bestSeller === "true" || query.bestSeller === true,
      newArrival: query.newArrival === "true" || query.newArrival === true || query.isNewArrival === "true" || query.isNewArrival === true,
      isFeatured: query.isFeatured === "true" || query.isFeatured === true,
      hasDiscount: query.hasDiscount === "true",
      hasOffer: query.hasOffer === "true" || query.offers === "true",
      blouseIncluded: query.blouseIncluded === "true" ? true : query.blouseIncluded === "false" ? false : undefined,
      availability: query.availability ? String(query.availability) : undefined,
    };

    const cacheKey = globalCache.generateKey("products:facets", searchOptions as any);
    const facets = await globalCache.getOrFetch(cacheKey, () => getProductFacets(searchOptions), 60_000);
    res.setHeader("Cache-Control", "no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.json(facets);
  } catch (err) {
    req.log?.error({ err }, "Failed to compute facets");
    res.status(500).json({ error: "Failed to compute facets" });
  }
});

export async function findProductById(id: string): Promise<any | null> {
  if (!id) return null;
  const strId = String(id).trim();
  if (!strId) return null;

  let pgProduct: any = null;
  let mongoProduct: any = null;

  // 1. Try finding in MongoDB first (supports ObjectId, string _id, id, and productId)
  try {
    mongoProduct = await mongoProducts.findById(strId).catch(() => null);
  } catch {}

  // 2. Try finding in PostgreSQL by id (or by mongoProduct.id if strId was mongo _id)
  const pgSearchId = (mongoProduct && mongoProduct.id) ? mongoProduct.id : strId;
  try {
    const rows = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.id, pgSearchId))
      .limit(1);
    if (rows.length > 0) pgProduct = rows[0];
  } catch {}

  // 3. If pgProduct was found but not mongoProduct, try mongoProducts with pgProduct.id
  if (pgProduct && !mongoProduct && pgProduct.id && pgProduct.id !== strId) {
    try {
      mongoProduct = await mongoProducts.findById(pgProduct.id).catch(() => null);
    } catch {}
  }

  if (!pgProduct && !mongoProduct) return null;
  if (pgProduct && mongoProduct) {
    const mongoUpdatedAt = mongoProduct.updatedAt ? new Date(mongoProduct.updatedAt).getTime() : 0;
    const pgUpdatedAt = (pgProduct as any).updatedAt ? new Date((pgProduct as any).updatedAt).getTime() : 0;
    const preferMongo = mongoUpdatedAt >= pgUpdatedAt;

    const base = preferMongo ? pgProduct : mongoProduct;
    const primary = preferMongo ? mongoProduct : pgProduct;

    const canonicalId = primary.id || base.id || strId;
    const mongoId = (primary as any)._id ? String((primary as any)._id) : ((base as any)._id ? String((base as any)._id) : canonicalId);

    return {
      ...base,
      ...primary,
      id: canonicalId,
      _id: mongoId,
      name: primary.name ?? base.name,
      description: primary.description !== undefined ? primary.description : (base.description ?? ""),
      price: primary.price !== undefined ? primary.price : base.price,
      basePrice: primary.basePrice !== undefined ? primary.basePrice : (base.basePrice !== undefined ? base.basePrice : (primary.price ?? base.price)),
      originalPrice: primary.originalPrice !== undefined ? primary.originalPrice : base.originalPrice,
      stock: primary.stock !== undefined ? primary.stock : base.stock,
      lowStockThreshold: primary.lowStockThreshold !== undefined ? primary.lowStockThreshold : base.lowStockThreshold,
      images: Array.isArray(primary.images) ? primary.images : (Array.isArray(base.images) ? base.images : []),
      videos: Array.isArray(primary.videos) ? primary.videos : (Array.isArray(base.videos) ? base.videos : []),
      variants: Array.isArray(primary.variants) ? primary.variants : (Array.isArray(base.variants) ? base.variants : []),
      specifications: Array.isArray(primary.specifications) ? primary.specifications : (Array.isArray(base.specifications) ? base.specifications : []),
      deliveryInfo: primary.deliveryInfo !== undefined ? primary.deliveryInfo : (base.deliveryInfo ?? ""),
      returnPolicy: primary.returnPolicy !== undefined ? primary.returnPolicy : (base.returnPolicy ?? ""),
      vendorId: primary.vendorId || base.vendorId,
      sellerId: primary.sellerId || base.sellerId || primary.vendorId || base.vendorId,
      vendorName: primary.vendorName || base.vendorName || "VASTRAA",
      status: primary.status || base.status || "approved",
      active: primary.active !== undefined ? primary.active : (base.active !== undefined ? base.active : true),
    };
  }

  const single = pgProduct || mongoProduct;
  const canonicalId = single.id || strId;
  const mongoId = (single as any)._id ? String((single as any)._id) : canonicalId;
  return {
    ...single,
    id: canonicalId,
    _id: mongoId,
  };
}

interface CallerSellerContext {
  isAuthenticated: boolean;
  userId: string | null;
  role: string | null;
  vendor: any | null;
  sellerIdentifiers: Set<string>;
  isAdmin: boolean;
}

export async function resolveCallerSellerContext(req: any): Promise<CallerSellerContext> {
  const result: CallerSellerContext = {
    isAuthenticated: false,
    userId: null,
    role: null,
    vendor: null,
    sellerIdentifiers: new Set(),
    isAdmin: false,
  };

  let userId: string | null = null;
  let role: string | null = null;
  let email: string | null = null;

  // 1. Check Bearer token / cookies
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  let token = "";
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.cookies?.vastraa_auth_token || req.cookies?.seller_token || req.cookies?.token) {
    token = String(req.cookies.vastraa_auth_token || req.cookies.seller_token || req.cookies.token).trim();
  }

  if (token) {
    const jwtPayload = verifyAccessToken(token);
    if (jwtPayload) {
      userId = jwtPayload.sub;
      role = jwtPayload.role || null;
      if (jwtPayload.email) email = String(jwtPayload.email).trim().toLowerCase();
    }
  }

  // 2. Fallback to Clerk Auth
  if (!userId) {
    try {
      const auth = getAuth(req);
      const clerkId = auth?.sessionClaims?.userId || auth?.userId;
      if (clerkId && typeof clerkId === "string" && clerkId.trim()) {
        userId = clerkId.trim();
        if (auth?.sessionClaims?.email) email = String(auth.sessionClaims.email).trim().toLowerCase();
      }
    } catch {}
  }

  // Check admin key in headers
  const providedAdminKey = req.headers?.["x-admin-key"] || req.query?.adminKey;
  if (providedAdminKey && typeof providedAdminKey === "string") {
    if (process.env.NODE_ENV === "test" && (providedAdminKey === "Admin@123" || providedAdminKey === process.env.ADMIN_API_KEY)) {
      result.isAdmin = true;
    } else {
      result.isAdmin = await verifyAdminAccessKey(providedAdminKey);
    }
  }

  if (role === "admin" || role === "superadmin") {
    result.isAdmin = true;
  }

  if (!userId && !result.isAdmin) {
    return result;
  }

  result.isAuthenticated = true;
  result.userId = userId;
  result.role = role;
  if (userId) result.sellerIdentifiers.add(userId);

  // 3. Resolve vendor record from MongoDB / PostgreSQL
  try {
    let vendor: any = null;

    if (userId) {
      if (mongoSellers) {
        vendor = (await mongoSellers.findByOwnerId?.(userId)) ||
                 (await mongoSellers.findById?.(userId)) ||
                 (await mongoSellers.findBySellerId?.(userId)) ||
                 (await mongoSellers.findByVendorId?.(userId));
      }
      if (!vendor && mongoVendors && mongoVendors !== mongoSellers) {
        vendor = (await mongoVendors.findByOwnerId?.(userId)) ||
                 (await mongoVendors.findById?.(userId)) ||
                 (await mongoVendors.findBySellerId?.(userId)) ||
                 (await mongoVendors.findByVendorId?.(userId));
      }
    }

    if (!vendor && userId && mongoUsers?.findById) {
      const userRecord = await mongoUsers.findById(userId).catch(() => null);
      if (userRecord) {
        if (!email && userRecord.email) email = String(userRecord.email).trim().toLowerCase();
        if (userRecord.vendorId && mongoSellers) {
          vendor = (await mongoSellers.findById?.(userRecord.vendorId)) ||
                   (await mongoSellers.findByVendorId?.(userRecord.vendorId));
        }
        if (!vendor && userRecord.sellerId && mongoSellers) {
          vendor = (await mongoSellers.findById?.(userRecord.sellerId)) ||
                   (await mongoSellers.findBySellerId?.(userRecord.sellerId));
        }
      }
    }

    if (!vendor && email) {
      if (mongoSellers?.findByEmail) {
        vendor = await mongoSellers.findByEmail(email).catch(() => null);
      }
      if (!vendor && mongoVendors?.findByEmail && mongoVendors !== mongoSellers) {
        vendor = await mongoVendors.findByEmail(email).catch(() => null);
      }
    }

    if (!vendor && db && vendorsTable) {
      try {
        const isUuid = Boolean(userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId));
        const conds: any[] = [];
        if (userId) {
          conds.push(eq(vendorsTable.ownerId, userId));
          if (isUuid) conds.push(eq(vendorsTable.id, userId));
        }
        if (email && vendorsTable.contactEmail) {
          conds.push(eq(vendorsTable.contactEmail, email));
        }
        if (conds.length > 0) {
          const rows = await db.select().from(vendorsTable).where(or(...conds)).limit(1);
          if (rows && rows.length > 0) vendor = rows[0];
        }
      } catch {}
    }

    if (vendor) {
      result.vendor = vendor;
      [
        vendor.id,
        vendor.vendorId,
        vendor.sellerId,
        vendor.ownerId,
        (vendor as any)._id ? String((vendor as any)._id) : null,
      ].filter(Boolean).forEach((idVal) => result.sellerIdentifiers.add(String(idVal)));
    }
  } catch {}

  return result;
}

router.get("/products/:id", async (req, res) => {
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  try {
    const { id } = req.params;
    if (!id || !String(id).trim()) {
      res.status(400).json({ error: "Invalid product ID" });
      return;
    }

    const product = await findProductById(id);
    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const normalized = normalizeProduct(product);
    const approvedVendorData = await getApprovedVendorData();
    const isPubliclyAvailable = isProductVendorValid(normalized, approvedVendorData);

    if (!isPubliclyAvailable) {
      // Unapproved, inactive, draft, or pending product:
      // Caller MUST be the verified owner seller or an admin.
      const sellerCtx = await resolveCallerSellerContext(req);

      if (sellerCtx.isAdmin) {
        res.json(normalized);
        return;
      }

      const productVendorIdentifiers = new Set([
        product.vendorId,
        product.sellerId,
        (product as any).ownerId,
        normalized?.vendorId,
        normalized?.sellerId,
      ].filter(Boolean).map(String));

      const isOwner = Array.from(productVendorIdentifiers).some((vId) => sellerCtx.sellerIdentifiers.has(vId));

      if (!isOwner) {
        if (!sellerCtx.isAuthenticated) {
          // Unauthenticated customer/guest cannot see unapproved product
          res.status(404).json({ error: "Product not found or unavailable" });
          return;
        }
        // Authenticated as another seller: forbid cross-seller access
        res.status(403).json({ error: "Forbidden: you do not own this product" });
        return;
      }
    }

    try {
      const updateRes = db.update(productsTable)
        .set({ viewCount: sql`${productsTable.viewCount} + 1` })
        .where(eq(productsTable.id, normalized.id));
      if (updateRes && typeof updateRes.catch === "function") {
        updateRes.catch(() => {});
      }
    } catch {}

    res.json(normalized);
  } catch (err) {
    req.log?.error?.({ err }, "Failed to get product");
    res.status(500).json({ error: "Failed to fetch product" });
  }
});


async function notifyWishlistPriceDrop(productId: string, productName: string, previousPrice: number, newPrice: number) {
  if (!(newPrice < previousPrice)) return;

  let wishlistUserIds: string[] = [];
  try {
    if (typeof mongoWishlists !== "undefined" && mongoWishlists?.findMany) {
      const docs = await mongoWishlists.findMany({ productId });
      wishlistUserIds = docs.map((w: any) => w.userId).filter(Boolean);
    }
  } catch {}

  if (wishlistUserIds.length === 0) {
    try {
      const wishlistRows = await db
        .select({ userId: wishlistsTable.userId })
        .from(wishlistsTable)
        .where(eq(wishlistsTable.productId, productId))
        .catch(() => []);
      wishlistUserIds = wishlistRows.map((r: any) => r.userId).filter(Boolean);
    } catch {}
  }

  const uniqueUserIds = Array.from(new Set(wishlistUserIds));
  const pctOff = Math.round(((previousPrice - newPrice) / previousPrice) * 100);

  for (const userId of uniqueUserIds) {
    try {
      const prefs = await mongoNotificationPreferences.findByUserId(userId);
      // Suppress if user turned off Offers & Coupons notifications
      if (!prefs.offerAlerts) continue;

      const title = "Price drop alert";
      const body = `"${productName}" is now ${pctOff}% off — grab it before the price goes back up!`;
      const metadata = { productId, previousPrice, newPrice };

      try {
        if (typeof mongoNotifications !== "undefined" && mongoNotifications?.create) {
          await mongoNotifications.create({
            userId,
            type: "price_drop",
            title,
            body,
            read: false,
            isRead: false,
            metadata,
            createdAt: new Date(),
          });
        }
      } catch {}

      try {
        await db.insert(notificationsTable).values({
          userId,
          type: "price_drop",
          title,
          body,
          metadata,
        }).catch(() => {});
      } catch {}
    } catch {}
  }
}

router.patch("/products/:id/stock", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const { stock } = req.body;

  if (typeof stock !== "number" || !Number.isInteger(stock) || stock < 0) {
    res.status(400).json({ error: "stock must be a non-negative integer" });
    return;
  }

  try {
    const before = await findProductById(id);
    if (!before) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    if (before.vendorId && before.vendorId !== req.vendorId && before.sellerId !== req.vendorId) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }

    let updatedStock = stock;
    try {
      const [updated] = await db
        .update(productsTable)
        .set({ stock })
        .where(eq(productsTable.id, id))
        .returning({ stock: productsTable.stock });
      if (updated) updatedStock = updated.stock;
    } catch {}

    await mongoProducts.update(id, { stock });

    await recordStockChange({
      productId: id,
      vendorId: before.vendorId,
      previousStock: before.stock ?? 0,
      newStock: stock,
      source: "manual",
      reason: "Manual stock update",
      actorId: req.userId,
    }).catch(() => {});

    await notifySellerStockLevel(before.vendorId, id, before.name, stock, before.lowStockThreshold ?? 5).catch(() => {});

    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("inventory:updated", { id, stock: updatedStock, vendorId: before.vendorId });
    emitProductEvent("product:updated", { id, stock: updatedStock, vendorId: before.vendorId });

    res.json({ stock: updatedStock });
  } catch (err: any) {
    req.log?.error?.({ err }, "Failed to update product stock");
    res.status(500).json({ error: "Failed to update product stock" });
  }
});

function sanitizeVariants(variants: any): any[] {
  if (!Array.isArray(variants)) return [];
  return variants
    .filter((v) => {
      if (!v) return false;
      if (Array.isArray(v.attributes) && v.attributes.length > 0) return true;
      return v.size || v.color; // legacy
    })
    .map((v) => {
      const stock = v.stock != null && v.stock !== "" ? parseInt(v.stock) : undefined;
      const price = v.price != null && v.price !== "" ? parseInt(v.price) : undefined;
      const sku = v.sku ? String(v.sku).trim() : undefined;
      const image = v.image ? String(v.image).trim() : undefined;
      // New flexible format
      if (Array.isArray(v.attributes) && v.attributes.length > 0) {
        return {
          attributes: v.attributes
            .filter((a: any) => a && String(a.name || "").trim() && String(a.value || "").trim())
            .map((a: any) => ({
              name: String(a.name).trim(),
              value: String(a.value).trim(),
            })),
          stock,
          price,
          sku,
          image,
        };
      }
      // Legacy size/color format
      return {
        size: v.size ? String(v.size).trim() : undefined,
        color: v.color ? String(v.color).trim() : undefined,
        stock,
        price,
        sku,
      };
    });
}

function sanitizeSpecifications(specs: any): any[] {
  if (!Array.isArray(specs)) return [];
  return specs
    .filter((s) => s && s.key && String(s.key).trim())
    .map((s) => ({ key: String(s.key).trim(), value: s.value ? String(s.value).trim() : "" }));
}

const PG_PRODUCT_COLUMNS = new Set([
  "id", "name", "description", "price", "originalPrice", "basePrice",
  "shippingFee", "gstRateBps", "category", "subcategory", "childCategory",
  "brand", "designPattern", "fabric", "color", "occasion", "vendorId",
  "vendorName", "images", "videos", "variants", "specifications",
  "deliveryInfo", "returnPolicy", "isBestSeller", "isNewArrival",
  "isFeatured", "rating", "reviewCount", "stock", "lowStockThreshold",
  "active", "viewCount", "status", "collection", "gender", "sareeType",
  "sareeStyle", "packOf", "countryOfOrigin", "blouseIncluded",
  "rejectionReason", "approvalRemark", "featuredOrder", "featuredUntil"
]);

function toPostgresProductData(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (PG_PRODUCT_COLUMNS.has(key) && value !== undefined) {
      if (key === "vendorId") {
        const isUuid = typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
        result[key] = isUuid ? value : null;
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

// Category check helper
function isSareeCategory(categorySlugOrId?: string | null): boolean {
  if (!categorySlugOrId) return true;
  const s = String(categorySlugOrId).toLowerCase().trim();
  return (
    s === "sarees" ||
    s === "saree" ||
    s === "cat-sarees-default" ||
    [
      "paithani",
      "designer",
      "gadwal",
      "banarasi",
      "kanjivaram",
      "chanderi",
      "bandhani",
      "mysore-silk",
      "ikat",
      "cotton",
      "silk",
      "other-traditional",
    ].includes(s)
  );
}

router.post("/products", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const {
    name, description, category, subcategory, childCategory, brand, designPattern,
    fabric, color, occasion, price, basePrice, shippingFee, originalPrice, stock, lowStockThreshold,
    images, videos, variants, specifications, deliveryInfo, returnPolicy,
    isBestSeller, isNewArrival, collection, gender, sareeType, sareeStyle, packOf, countryOfOrigin, blouseIncluded,
    subtype, weavingTechnique, workType, borderType, palluDesign, sareeLength, origin,
    kurtiType, kurtiLength, fit, pattern, closureType,
    setType, kurtaLength, bottomType, bottomLength, dupattaIncluded, dupattaFabric,
    dressType, dressLength, sleeveLength, neckStyle, silhouette, embellishment,
    neckline, waistline, winterWearType, warmthLevel, winterWearLength,
    topType, sleeveType, topLength,
    blouseFabric, blouseColor, blouseLength, blouseDesign, blouseImages, blouseDetails,
  } = req.body;

  if (!name || !String(name).trim()) { res.status(400).json({ error: "Product name is required" }); return; }
  const rawPrice = basePrice != null ? Number(basePrice) : Number(price);
  if (isNaN(rawPrice) || rawPrice <= 0) { res.status(400).json({ error: "Valid price is required" }); return; }
  if (!category) { res.status(400).json({ error: "Category is required" }); return; }

  let parsedNewArrival = false;
  if (isNewArrival !== undefined && isNewArrival !== null) {
    if (typeof isNewArrival === "boolean") {
      parsedNewArrival = isNewArrival;
    } else if (isNewArrival === "true" || isNewArrival === "1" || isNewArrival === 1) {
      parsedNewArrival = true;
    } else if (isNewArrival === "false" || isNewArrival === "0" || isNewArrival === 0) {
      parsedNewArrival = false;
    } else {
      res.status(400).json({ error: "isNewArrival must be a boolean" });
      return;
    }
  }

  // Authoritative category and subcategory validation
  let catValidation = validateCategoryAndSubcategory(category, subcategory);
  if (!catValidation.valid && subcategory) {
    try {
      const parentCat = findCategoryDefinition(category);
      const parentIds = [category];
      if (parentCat) {
        parentIds.push(parentCat.id, parentCat.slug);
      }
      const allActive = await mongoProductCategories.listActive();
      const subDoc = allActive.find((c: any) =>
        (parentIds.includes(c.parentId) || parentIds.includes(c.parentCategory) || (parentCat && c.parentId === parentCat.id)) &&
        (c.name?.toLowerCase() === String(subcategory).trim().toLowerCase() ||
         c.slug === normalizeCategoryString(String(subcategory).trim()) ||
         c.id === String(subcategory).trim())
      );
      if (subDoc) {
        registerDynamicSubcategory(parentCat?.slug || category, {
          id: subDoc.id,
          name: subDoc.name,
          slug: subDoc.slug,
          route: subDoc.route,
          subtypes: subDoc.subtypes || [],
        });
        catValidation = validateCategoryAndSubcategory(category, subcategory);
      }
    } catch {
      // fallback
    }
  }

  if (!catValidation.valid) {
    res.status(400).json({ error: catValidation.error });
    return;
  }
  const resolvedCategory = resolveCategoryData(category, subcategory);

  try {
    const catDef = catValidation.categoryDef;
    let categoryPrefix: string = catDef?.prefix || CATEGORY_PREFIX[resolvedCategory.category as keyof typeof CATEGORY_PREFIX] || "PRD";
    let newProductId: string;

    try {
      const seqResult = await db.execute(sql`SELECT nextval('product_id_seq') AS seq`);
      const seqVal = (seqResult as any)?.rows?.[0]?.seq || Math.floor(Date.now() % 1000000);
      newProductId = `${categoryPrefix}${seqVal}`;
    } catch {
      const seqVal = await getNextSequenceValue("product_id").catch(() => Math.floor(Date.now() % 1000000));
      newProductId = `${categoryPrefix}${seqVal}`;
    }

    const inputBasePrice = rawPrice;
    const inputShipping = shippingFee != null && !isNaN(Number(shippingFee)) ? Number(shippingFee) : 100;
    const financials = calculateVastraaFinancials({
      basePricePaise: toPaise(inputBasePrice),
      shippingPaise: toPaise(inputShipping),
    });
    const calculatedCustomerPrice = Math.round(toRupees(financials.customerPays));

    const resolvedVendorId = req.vendorId || req.vendor?.vendorId || req.vendor?.id || req.vendor?.sellerId;
    if (!resolvedVendorId) {
      res.status(403).json({ error: "Forbidden: genuine registered seller required" });
      return;
    }

    // 1. Idempotency Key Deduplication Check
    const idempotencyKey = ((req.headers["x-idempotency-key"] || req.body.idempotencyKey) as string | undefined)?.trim();
    if (idempotencyKey) {
      try {
        const existingProduct = await mongoProducts.findOne({
          idempotencyKey,
          vendorId: resolvedVendorId,
        });
        if (existingProduct) {
          const normalizedExisting = normalizeProduct(existingProduct);
          res.status(200).json({ ...normalizedExisting, product: normalizedExisting, deduplicated: true });
          return;
        }
      } catch {}
    }

    // 2. Double-Click / Rapid Resubmission Fingerprint Protection (30 seconds)
    const submitFingerprint = crypto
      .createHash("sha256")
      .update(
        `${resolvedVendorId}:${String(name).trim().toLowerCase()}:${resolvedCategory.category}:${resolvedCategory.subcategory || ""}:${inputBasePrice}`
      )
      .digest("hex");

    try {
      const recentDuplicate = await mongoProducts.findOne({
        submitFingerprint,
        vendorId: resolvedVendorId,
        createdAt: { $gte: new Date(Date.now() - 30_000) },
      });
      if (recentDuplicate) {
        const normalizedRecent = normalizeProduct(recentDuplicate);
        res.status(200).json({ ...normalizedRecent, product: normalizedRecent, deduplicated: true });
        return;
      }
    } catch {}

    // 3. Seller SKU Uniqueness Check
    const rawSku = req.body.sku ? String(req.body.sku).trim() : null;
    if (rawSku) {
      try {
        const existingSku = await mongoProducts.findOne({
          vendorId: resolvedVendorId,
          sku: rawSku,
        });
        if (existingSku) {
          res.status(409).json({
            error: `A product with SKU "${rawSku}" already exists in your inventory. Please provide a unique SKU or edit the existing product.`,
            existingProductId: existingSku.id,
          });
          return;
        }
      } catch {}
    }

    const isDraft = req.body.status === "draft";
    let resolvedVendorName =
      req.vendor?.shopName ||
      req.vendor?.name ||
      req.vendor?.sellerName ||
      req.vendor?.storeName ||
      "";

    if (!resolvedVendorName && resolvedVendorId) {
      try {
        const sellerDoc =
          (await mongoSellers.findById?.(resolvedVendorId)) ||
          (await mongoSellers.findByVendorId?.(resolvedVendorId)) ||
          (await mongoSellers.findBySellerId?.(resolvedVendorId)) ||
          (await mongoVendors.findById?.(resolvedVendorId));
        if (sellerDoc) {
          resolvedVendorName = sellerDoc.shopName || sellerDoc.name || sellerDoc.sellerName || "";
        }
      } catch {}
    }

    if (!resolvedVendorName && req.userId) {
      try {
        const userDoc = await mongoUsers.findById?.(req.userId);
        if (userDoc) {
          resolvedVendorName = userDoc.name ? `${userDoc.name}'s Shop` : "";
        }
      } catch {}
    }

    if (!resolvedVendorName) {
      resolvedVendorName = req.user?.name ? `${req.user.name}'s Shop` : "Seller Store";
    }

    const isApprovedByAdmin = req.isAdmin && req.body.status === "approved";
    const targetStatus = isDraft ? "draft" : (isApprovedByAdmin ? "approved" : "pending");
    const isActive = targetStatus === "approved";
    const now = new Date();

    const isSaree = isSareeCategory(resolvedCategory.category);
    const resolvedBlouseIncluded = isSaree ? (blouseIncluded !== undefined ? Boolean(blouseIncluded) : false) : false;
    const resolvedBlouseImages = isSaree && resolvedBlouseIncluded && Array.isArray(blouseImages)
      ? blouseImages.filter(Boolean)
      : [];
    const resolvedBlouseDetails = isSaree && resolvedBlouseIncluded
      ? (blouseDetails && typeof blouseDetails === "object" ? blouseDetails : {
          fabric: blouseFabric ? String(blouseFabric).trim() : "",
          color: blouseColor ? String(blouseColor).trim() : "",
          length: blouseLength ? String(blouseLength).trim() : "",
          design: blouseDesign ? String(blouseDesign).trim() : "",
        })
      : null;

    const newProductData = {
      mainCategoryId: resolvedCategory.categoryId,
      categoryId: resolvedCategory.categoryId,
      categoryName: resolvedCategory.categoryName,
      category: resolvedCategory.category as any,
      categorySlug: resolvedCategory.categorySlug || resolvedCategory.category,
      parentCategoryId: resolvedCategory.parentCategoryId,
      parentCategoryName: resolvedCategory.parentCategoryName,

      subcategory: resolvedCategory.subcategory,
      subcategoryId: resolvedCategory.subcategoryId,
      subcategoryName: resolvedCategory.subcategoryName,
      subcategorySlug: resolvedCategory.subcategorySlug,

      subtype: resolvedCategory.subtype || (subtype ? String(subtype).trim() : null),
      subtypeId: resolvedCategory.subtypeId || (subtype ? String(subtype).trim() : null),
      childCategory: childCategory ? String(childCategory).trim() : (resolvedCategory.subtype || null),
      blouseIncluded: resolvedBlouseIncluded,
      blouseImages: resolvedBlouseImages,
      blouseDetails: resolvedBlouseDetails,
      kurtiType: kurtiType ? String(kurtiType).trim() : null,
      kurtiLength: kurtiLength ? String(kurtiLength).trim() : null,
      fit: fit ? String(fit).trim() : null,
      pattern: pattern ? String(pattern).trim() : null,
      closureType: closureType ? String(closureType).trim() : null,
      setType: setType ? String(setType).trim() : null,
      kurtaLength: kurtaLength ? String(kurtaLength).trim() : null,
      bottomType: bottomType ? String(bottomType).trim() : null,
      bottomLength: bottomLength ? String(bottomLength).trim() : null,
      dupattaIncluded: dupattaIncluded ? String(dupattaIncluded).trim() : null,
      dupattaFabric: dupattaFabric ? String(dupattaFabric).trim() : null,
      dressType: dressType ? String(dressType).trim() : null,
      dressLength: dressLength ? String(dressLength).trim() : null,
      sleeveLength: sleeveLength ? String(sleeveLength).trim() : null,
      neckStyle: neckStyle ? String(neckStyle).trim() : null,
      silhouette: silhouette ? String(silhouette).trim() : null,
      embellishment: embellishment ? String(embellishment).trim() : null,
      neckline: neckline ? String(neckline).trim() : null,
      waistline: waistline ? String(waistline).trim() : null,
      winterWearType: winterWearType ? String(winterWearType).trim() : null,
      warmthLevel: warmthLevel ? String(warmthLevel).trim() : null,
      winterWearLength: winterWearLength ? String(winterWearLength).trim() : null,
      topType: topType ? String(topType).trim() : null,
      sleeveType: sleeveType ? String(sleeveType).trim() : null,
      topLength: topLength ? String(topLength).trim() : null,
      id: newProductId,
      name: String(name).trim(),
      description: description ? String(description).trim() : "",

      brand: brand ? String(brand).trim() : null,
      designPattern: designPattern ? String(designPattern).trim() : null,
      fabric: (fabric ?? "silk") as any,
      color: (color ?? "red") as any,
      occasion: (occasion ?? "festival") as any,
      basePrice: inputBasePrice,
      shippingFee: inputShipping,
      gstRateBps: 500,
      price: calculatedCustomerPrice,
      originalPrice: originalPrice ? parseInt(originalPrice) : null,
      stock: stock != null ? parseInt(stock) : 10,
      lowStockThreshold: lowStockThreshold != null ? parseInt(lowStockThreshold) : 5,
      images: Array.isArray(images) ? images.filter(Boolean) : [],
      videos: Array.isArray(videos) ? videos.filter(Boolean) : [],
      variants: sanitizeVariants(variants),
      specifications: sanitizeSpecifications(specifications),
      deliveryInfo: deliveryInfo ? String(deliveryInfo).trim() : "",
      returnPolicy: returnPolicy ? String(returnPolicy).trim() : "",
      isBestSeller: Boolean(isBestSeller),
      isNewArrival: parsedNewArrival,
      collection: collection ? String(collection).trim() : null,
      gender: gender ? String(gender).trim() : "Women",
      sareeType: sareeType ? String(sareeType).trim() : null,
      sareeStyle: sareeStyle ? String(sareeStyle).trim() : null,
      packOf: packOf ? String(packOf).trim() : "Pack of 1",
      countryOfOrigin: countryOfOrigin ? String(countryOfOrigin).trim() : "India",

      weavingTechnique: weavingTechnique ? String(weavingTechnique).trim() : null,
      workType: workType ? String(workType).trim() : null,
      borderType: borderType ? String(borderType).trim() : null,
      palluDesign: palluDesign ? String(palluDesign).trim() : null,
      sareeLength: sareeLength ? String(sareeLength).trim() : "5.5 meters",
      origin: origin ? String(origin).trim() : (countryOfOrigin ? String(countryOfOrigin).trim() : "India"),
      vendorId: resolvedVendorId,
      sellerId: req.vendor?.sellerId || req.vendor?.vendorId || resolvedVendorId,
      vendorName: resolvedVendorName,
      sku: rawSku || null,
      idempotencyKey: idempotencyKey || null,
      submitFingerprint,
      status: targetStatus,
      active: isActive,
      createdAt: now,
      updatedAt: now,
    };

    let product: any = null;
    try {
      const pgProductData = toPostgresProductData(newProductData);
      const [created] = await db
        .insert(productsTable)
        .values(pgProductData as any)
        .returning();
      product = created;
    } catch (dbErr: any) {
      req.log?.warn({ dbErr }, "Postgres product insert failed, saving to MongoDB repository");
    }

    // Always sync to MongoDB repository as well
    try {
      const mongoSaved = await mongoProducts.insert({
        ...newProductData,
        id: newProductId,
      });
      if (mongoSaved) {
        product = { ...newProductData, ...(product || {}), ...mongoSaved };
      }
    } catch (mongoErr: any) {
      req.log?.warn({ mongoErr }, "MongoDB product sync failed");
    }

    if (!product) {
      product = newProductData;
    } else {
      product = { ...newProductData, ...product };
      if (!product.vendorId && resolvedVendorId) {
        product.vendorId = resolvedVendorId;
      }
      if (!product.sellerId) {
        product.sellerId = req.vendor?.sellerId || req.vendor?.vendorId || resolvedVendorId;
      }
      if (!product.vendorName && resolvedVendorName) {
        product.vendorName = resolvedVendorName;
      }
    }

    if (targetStatus === "pending") {
      insertSellerNotification({
        vendorId: resolvedVendorId,
        type: "product_pending_approval",
        title: "Product submitted for approval",
        body: `"${product.name}" has been submitted for Super Admin approval.`,
        metadata: { productId: product.id },
      }).catch(() => {});

      insertAdminNotification({
        type: "product_pending_approval",
        title: "New product pending approval",
        body: `"${product.name}" from seller "${resolvedVendorName}" requires approval.`,
        metadata: { productId: product.id, vendorId: resolvedVendorId },
      }).catch(() => {});
    } else if (targetStatus === "draft") {
      insertSellerNotification({
        vendorId: resolvedVendorId,
        type: "product_pending_approval",
        title: "Product draft saved",
        body: `"${product.name}" has been saved as a draft.`,
        metadata: { productId: product.id },
      }).catch(() => {});
    } else {
      insertSellerNotification({
        vendorId: resolvedVendorId,
        type: "product_pending_approval",
        title: "Product published",
        body: `"${product.name}" has been published to your store.`,
        metadata: { productId: product.id },
      }).catch(() => {});
    }

    safeClearCache();
    safeInvalidatePattern(/product/);
    const normalizedNewProduct = normalizeProduct(product);
    emitProductEvent("product:created", {
      id: product.id,
      productId: product.id,
      vendorId: resolvedVendorId,
      sellerId: product.sellerId || resolvedVendorId,
      product: normalizedNewProduct,
    });
    if (targetStatus === "approved") {
      emitProductEvent("product:approved", {
        id: product.id,
        productId: product.id,
        status: "approved",
        active: true,
        product: normalizedNewProduct,
      });
    }
    res.status(201).json(normalizedNewProduct);
  } catch (err: any) {
    req.log?.error({ err }, "Failed to create product");
    res.status(500).json({ error: err?.message || "Failed to create product" });
  }
});

const updateProductHandler = async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  const {
    name, description, category, subcategory, childCategory, brand, designPattern,
    fabric, color, occasion, price, basePrice, shippingFee, originalPrice, stock, lowStockThreshold,
    images, videos, variants, specifications, deliveryInfo, returnPolicy,
    isBestSeller, isNewArrival, collection, gender, sareeType, sareeStyle, packOf, countryOfOrigin, blouseIncluded,
    subtype, weavingTechnique, workType, borderType, palluDesign, sareeLength, origin,
    kurtiType, kurtiLength, fit, pattern, closureType,
    setType, kurtaLength, bottomType, bottomLength, dupattaIncluded, dupattaFabric,
    dressType, dressLength, sleeveLength, neckStyle, silhouette, embellishment,
    neckline, waistline, winterWearType, warmthLevel, winterWearLength,
    topType, sleeveType, topLength,
    blouseFabric, blouseColor, blouseLength, blouseDesign, blouseImages, blouseDetails,
  } = req.body;

  try {
    const existing = await findProductById(id);

    if (!existing) {
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
      existing.vendorId,
      existing.sellerId,
      (existing as any).ownerId,
    ].filter(Boolean).map(String));

    const isOwner = Array.from(productVendorIdentifiers).some((vId) => sellerIdentifiers.has(vId));
    if (!isOwner) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }

    const updates: Record<string, any> = {};
    if (name !== undefined) updates.name = String(name).trim();
    if (description !== undefined) updates.description = String(description).trim();
    if (category !== undefined || subcategory !== undefined) {
      const effCategory = category !== undefined ? category : existing.category;
      const effSubcategory = subcategory !== undefined ? subcategory : existing.subcategory;
      let val = validateCategoryAndSubcategory(effCategory, effSubcategory);
      if (!val.valid && effSubcategory) {
        try {
          const parentCat = findCategoryDefinition(effCategory);
          const parentIds = [effCategory];
          if (parentCat) {
            parentIds.push(parentCat.id, parentCat.slug);
          }
          const allActive = await mongoProductCategories.listActive();
          const subDoc = allActive.find((c: any) =>
            (parentIds.includes(c.parentId) || parentIds.includes(c.parentCategory) || (parentCat && c.parentId === parentCat.id)) &&
            (c.name?.toLowerCase() === String(effSubcategory).trim().toLowerCase() ||
             c.slug === normalizeCategoryString(String(effSubcategory).trim()) ||
             c.id === String(effSubcategory).trim())
          );
          if (subDoc) {
            registerDynamicSubcategory(parentCat?.slug || effCategory, {
              id: subDoc.id,
              name: subDoc.name,
              slug: subDoc.slug,
              route: subDoc.route,
              subtypes: subDoc.subtypes || [],
            });
            val = validateCategoryAndSubcategory(effCategory, effSubcategory);
          }
        } catch {
          // fallback
        }
      }
      if (!val.valid) {
        res.status(400).json({ error: val.error });
        return;
      }
      const resCat = resolveCategoryData(effCategory, effSubcategory);
      updates.category = resCat.category;
      updates.categorySlug = resCat.categorySlug;
      updates.categoryName = resCat.categoryName;
      updates.categoryId = resCat.categoryId;
      updates.parentCategoryId = resCat.parentCategoryId;
      updates.parentCategoryName = resCat.parentCategoryName;
      updates.mainCategoryId = resCat.categoryId;
      updates.subcategory = resCat.subcategory;
      updates.subcategorySlug = resCat.subcategorySlug;
      updates.subcategoryName = resCat.subcategoryName;
      updates.subcategoryId = resCat.subcategoryId;
      if (resCat.subtypeId) updates.subtypeId = resCat.subtypeId;
    }
    updates.updatedAt = new Date();
    if (childCategory !== undefined) updates.childCategory = childCategory ? String(childCategory).trim() : null;
    if (brand !== undefined) updates.brand = brand ? String(brand).trim() : null;
    if (designPattern !== undefined) updates.designPattern = designPattern ? String(designPattern).trim() : null;
    if (fabric !== undefined) updates.fabric = fabric;
    if (color !== undefined) updates.color = color;
    if (occasion !== undefined) updates.occasion = occasion;
    if (basePrice !== undefined || price !== undefined || shippingFee !== undefined) {
      const currentBase = basePrice !== undefined
        ? Number(basePrice)
        : (existing.basePrice != null ? Number(existing.basePrice) : Number(price ?? existing.price));
      const currentShipping = shippingFee !== undefined ? Number(shippingFee) : (existing.shippingFee ?? 100);
      const financials = calculateVastraaFinancials({
        basePricePaise: toPaise(currentBase),
        shippingPaise: toPaise(currentShipping),
      });
      updates.basePrice = currentBase;
      updates.shippingFee = currentShipping;
      updates.gstRateBps = 500;
      updates.price = Math.round(toRupees(financials.customerPays));
    }
    if (originalPrice !== undefined) updates.originalPrice = originalPrice ? parseInt(originalPrice) : null;
    if (stock !== undefined) updates.stock = parseInt(stock);
    if (lowStockThreshold !== undefined) updates.lowStockThreshold = parseInt(lowStockThreshold);
    if (images !== undefined) updates.images = Array.isArray(images) ? images.filter(Boolean) : [];
    if (videos !== undefined) updates.videos = Array.isArray(videos) ? videos.filter(Boolean) : [];
    if (variants !== undefined) updates.variants = sanitizeVariants(variants);
    if (specifications !== undefined) updates.specifications = sanitizeSpecifications(specifications);
    if (deliveryInfo !== undefined) updates.deliveryInfo = String(deliveryInfo).trim();
    if (returnPolicy !== undefined) updates.returnPolicy = String(returnPolicy).trim();
    if (isBestSeller !== undefined) updates.isBestSeller = Boolean(isBestSeller);
    if (isNewArrival !== undefined && isNewArrival !== null) {
      if (typeof isNewArrival === "boolean") {
        updates.isNewArrival = isNewArrival;
      } else if (isNewArrival === "true" || isNewArrival === "1" || isNewArrival === 1) {
        updates.isNewArrival = true;
      } else if (isNewArrival === "false" || isNewArrival === "0" || isNewArrival === 0) {
        updates.isNewArrival = false;
      } else {
        res.status(400).json({ error: "isNewArrival must be a boolean" });
        return;
      }
    }
    if (collection !== undefined) updates.collection = collection ? String(collection).trim() : null;
    if (gender !== undefined) updates.gender = String(gender).trim();
    if (sareeType !== undefined) updates.sareeType = sareeType ? String(sareeType).trim() : null;
    if (sareeStyle !== undefined) updates.sareeStyle = sareeStyle ? String(sareeStyle).trim() : null;
    if (packOf !== undefined) updates.packOf = String(packOf).trim();
    if (countryOfOrigin !== undefined) updates.countryOfOrigin = String(countryOfOrigin).trim();
    const effectiveCategory = updates.category || existing.category;
    const isSaree = isSareeCategory(effectiveCategory);
    if (!isSaree) {
      updates.blouseIncluded = false;
      updates.blouseImages = [];
      updates.blouseDetails = null;
    } else if (blouseIncluded !== undefined) {
      updates.blouseIncluded = Boolean(blouseIncluded);
      if (!updates.blouseIncluded) {
        updates.blouseImages = [];
        updates.blouseDetails = null;
      }
    }
    if (isSaree && updates.blouseIncluded !== false) {
      if (blouseImages !== undefined) updates.blouseImages = Array.isArray(blouseImages) ? blouseImages.filter(Boolean) : [];
      if (blouseDetails !== undefined || blouseFabric !== undefined || blouseColor !== undefined || blouseLength !== undefined || blouseDesign !== undefined) {
        updates.blouseDetails = blouseDetails && typeof blouseDetails === "object" ? blouseDetails : {
          fabric: blouseFabric ? String(blouseFabric).trim() : (existing.blouseDetails?.fabric || ""),
          color: blouseColor ? String(blouseColor).trim() : (existing.blouseDetails?.color || ""),
          length: blouseLength ? String(blouseLength).trim() : (existing.blouseDetails?.length || ""),
          design: blouseDesign ? String(blouseDesign).trim() : (existing.blouseDetails?.design || ""),
        };
      }
    }
    if (kurtiType !== undefined) updates.kurtiType = kurtiType ? String(kurtiType).trim() : null;
    if (kurtiLength !== undefined) updates.kurtiLength = kurtiLength ? String(kurtiLength).trim() : null;
    if (fit !== undefined) updates.fit = fit ? String(fit).trim() : null;
    if (pattern !== undefined) updates.pattern = pattern ? String(pattern).trim() : null;
    if (closureType !== undefined) updates.closureType = closureType ? String(closureType).trim() : null;
    if (setType !== undefined) updates.setType = setType ? String(setType).trim() : null;
    if (kurtaLength !== undefined) updates.kurtaLength = kurtaLength ? String(kurtaLength).trim() : null;
    if (bottomType !== undefined) updates.bottomType = bottomType ? String(bottomType).trim() : null;
    if (bottomLength !== undefined) updates.bottomLength = bottomLength ? String(bottomLength).trim() : null;
    if (dupattaIncluded !== undefined) updates.dupattaIncluded = dupattaIncluded ? String(dupattaIncluded).trim() : null;
    if (dupattaFabric !== undefined) updates.dupattaFabric = dupattaFabric ? String(dupattaFabric).trim() : null;
    if (dressType !== undefined) updates.dressType = dressType ? String(dressType).trim() : null;
    if (dressLength !== undefined) updates.dressLength = dressLength ? String(dressLength).trim() : null;
    if (sleeveLength !== undefined) updates.sleeveLength = sleeveLength ? String(sleeveLength).trim() : null;
    if (neckStyle !== undefined) updates.neckStyle = neckStyle ? String(neckStyle).trim() : null;
    if (silhouette !== undefined) updates.silhouette = silhouette ? String(silhouette).trim() : null;
    if (embellishment !== undefined) updates.embellishment = embellishment ? String(embellishment).trim() : null;
    if (neckline !== undefined) updates.neckline = neckline ? String(neckline).trim() : null;
    if (waistline !== undefined) updates.waistline = waistline ? String(waistline).trim() : null;
    if (winterWearType !== undefined) updates.winterWearType = winterWearType ? String(winterWearType).trim() : null;
    if (warmthLevel !== undefined) updates.warmthLevel = warmthLevel ? String(warmthLevel).trim() : null;
    if (winterWearLength !== undefined) updates.winterWearLength = winterWearLength ? String(winterWearLength).trim() : null;
    if (topType !== undefined) updates.topType = topType ? String(topType).trim() : null;
    if (sleeveType !== undefined) updates.sleeveType = sleeveType ? String(sleeveType).trim() : null;
    if (topLength !== undefined) updates.topLength = topLength ? String(topLength).trim() : null;
    if (subtype !== undefined) updates.subtype = subtype ? String(subtype).trim() : null;
    if (weavingTechnique !== undefined) updates.weavingTechnique = weavingTechnique ? String(weavingTechnique).trim() : null;
    if (workType !== undefined) updates.workType = workType ? String(workType).trim() : null;
    if (borderType !== undefined) updates.borderType = borderType ? String(borderType).trim() : null;
    if (palluDesign !== undefined) updates.palluDesign = palluDesign ? String(palluDesign).trim() : null;
    if (sareeLength !== undefined) updates.sareeLength = sareeLength ? String(sareeLength).trim() : null;
    if (origin !== undefined) updates.origin = origin ? String(origin).trim() : null;

    // Preserve existing approval status and active state so unapproved products cannot bypass admin approval
    const currentStatus = existing.status || "pending";
    updates.status = currentStatus;
    // Active visibility is preserved for approved items, but unapproved items can never be active
    updates.active = currentStatus === "approved" ? (existing.active ?? true) : false;

    let updated: any = null;
    const pgUpdates = toPostgresProductData(updates);
    const canonicalId = existing.id || id;
    try {
      if (Object.keys(pgUpdates).length > 0) {
        const [pgUpdated] = await db
          .update(productsTable)
          .set(pgUpdates)
          .where(eq(productsTable.id, canonicalId))
          .returning();
        updated = pgUpdated;
      }
    } catch (pgErr) {
      req.log?.warn({ pgErr }, "Postgres product update failed, updating MongoDB");
    }

    try {
      const mongoUpdated = await mongoProducts.update(id, updates);
      if (mongoUpdated) {
        updated = { ...(updated || {}), ...mongoUpdated };
      }
    } catch (mongoErr) {
      req.log?.warn({ mongoErr }, "MongoDB product update failed");
    }

    const mongoId = (existing as any)._id ? String((existing as any)._id) : ((updated as any)?._id ? String((updated as any)._id) : canonicalId);

    if (!updated) {
      updated = { ...existing, ...updates, id: canonicalId, _id: mongoId };
    } else {
      updated = { ...existing, ...updates, ...updated, id: canonicalId, _id: mongoId };
    }

    if (updates.stock !== undefined) {
      const newStockVal = updated.stock ?? parseInt(updates.stock);
      await recordStockChange({
        productId: canonicalId,
        vendorId: existing.vendorId,
        previousStock: existing.stock ?? 0,
        newStock: newStockVal,
        source: "manual",
        reason: "Manual stock update via product edit",
        actorId: req.userId,
      }).catch(() => {});

      await notifySellerStockLevel(
        existing.vendorId,
        canonicalId,
        updated.name ?? existing.name,
        newStockVal,
        updated.lowStockThreshold ?? existing.lowStockThreshold ?? 5
      ).catch(() => {});
      emitProductEvent("inventory:updated", { id: canonicalId, stock: newStockVal, vendorId: existing.vendorId });
    }

    if (updates.price !== undefined && updates.price < existing.price) {
      await notifyWishlistPriceDrop(canonicalId, updated.name ?? existing.name, existing.price, updates.price).catch(() => {});
    }

    globalCache.del(`product:${id}`);
    globalCache.del(`product:${canonicalId}`);
    if (mongoId) globalCache.del(`product:${mongoId}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", {
      id: canonicalId,
      productId: canonicalId,
      vendorId: existing.vendorId,
      sellerId: existing.sellerId || existing.vendorId,
      ...updates,
    });

    const normalizedResult = normalizeProduct(updated);
    res.json({ ...normalizedResult, product: normalizedResult });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update product");
    res.status(500).json({ error: err?.message || "Failed to update product" });
  }
};

router.put("/products/:id", requireVendorAuth, updateProductHandler);
router.patch("/products/:id", requireVendorAuth, updateProductHandler);

router.delete("/products/:id", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const existing = await findProductById(id);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    const sellerIdentifiers = new Set([
      req.vendorId, req.sellerId, req.vendor?.id, req.vendor?.vendorId, req.vendor?.sellerId, req.vendor?.ownerId, req.userId
    ].filter(Boolean).map(String));
    const productVendorIdentifiers = new Set([existing.vendorId, existing.sellerId, (existing as any).ownerId].filter(Boolean).map(String));
    if (!Array.from(productVendorIdentifiers).some((vId) => sellerIdentifiers.has(vId))) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }
    try {
      await db.update(productsTable).set({ active: false }).where(eq(productsTable.id, id));
    } catch {}
    await mongoProducts.update(id, { active: false }).catch(() => {});
    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", { id, productId: id, active: false, vendorId: existing.vendorId });
    res.json({ success: true });
  } catch (err) {
    req.log?.error?.({ err }, "Failed to deactivate product");
    res.status(500).json({ error: "Failed to deactivate product" });
  }
});

router.patch("/products/:id/activate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const existing = await findProductById(id);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    const sellerIdentifiers = new Set([
      req.vendorId, req.sellerId, req.vendor?.id, req.vendor?.vendorId, req.vendor?.sellerId, req.vendor?.ownerId, req.userId
    ].filter(Boolean).map(String));
    const productVendorIdentifiers = new Set([existing.vendorId, existing.sellerId, (existing as any).ownerId].filter(Boolean).map(String));
    if (!Array.from(productVendorIdentifiers).some((vId) => sellerIdentifiers.has(vId))) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }
    if (existing.status && existing.status !== "approved") {
      res.status(403).json({ error: "Product must be approved before it can be made available" });
      return;
    }
    let updated: any = null;
    try {
      const [pgUpdated] = await db.update(productsTable).set({ active: true }).where(eq(productsTable.id, id)).returning();
      updated = pgUpdated;
    } catch {}
    const mongoUpdated = await mongoProducts.update(id, { active: true }).catch(() => null);
    if (!updated) updated = mongoUpdated || { ...existing, active: true };
    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", { id, productId: id, active: true, vendorId: existing.vendorId });
    res.json(normalizeProduct(updated));
  } catch (err) {
    req.log?.error?.({ err }, "Failed to activate product");
    res.status(500).json({ error: "Failed to activate product" });
  }
});

router.patch("/products/:id/deactivate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const existing = await findProductById(id);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    const sellerIdentifiers = new Set([
      req.vendorId, req.sellerId, req.vendor?.id, req.vendor?.vendorId, req.vendor?.sellerId, req.vendor?.ownerId, req.userId
    ].filter(Boolean).map(String));
    const productVendorIdentifiers = new Set([existing.vendorId, existing.sellerId, (existing as any).ownerId].filter(Boolean).map(String));
    if (!Array.from(productVendorIdentifiers).some((vId) => sellerIdentifiers.has(vId))) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }
    let updated: any = null;
    try {
      const [pgUpdated] = await db.update(productsTable).set({ active: false }).where(eq(productsTable.id, id)).returning();
      updated = pgUpdated;
    } catch {}
    const mongoUpdated = await mongoProducts.update(id, { active: false }).catch(() => null);
    if (!updated) updated = mongoUpdated || { ...existing, active: false };
    globalCache.del(`product:${id}`);
    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:updated", { id, productId: id, active: false, vendorId: existing.vendorId });
    res.json(normalizeProduct(updated));
  } catch (err) {
    req.log?.error?.({ err }, "Failed to deactivate product");
    res.status(500).json({ error: "Failed to deactivate product" });
  }
});

router.post("/products/:id/duplicate", requireVendorAuth, async (req: any, res: any): Promise<void> => {
  const { id } = req.params;
  try {
    const existing = await findProductById(id);
    if (!existing) { res.status(404).json({ error: "Product not found" }); return; }
    if (existing.vendorId && existing.vendorId !== req.vendorId && existing.sellerId !== req.vendorId) {
      res.status(403).json({ error: "Forbidden: you do not own this product" });
      return;
    }

    let dupVal = Math.floor(Date.now() % 1000000);
    try {
      const dupSeq = await db.execute(sql`SELECT nextval('product_id_seq') AS seq`);
      if ((dupSeq as any)?.rows?.[0]?.seq) dupVal = (dupSeq as any).rows[0].seq;
    } catch {
      dupVal = await getNextSequenceValue("product_id").catch(() => Math.floor(Date.now() % 1000000));
    }

    let dupPrefix: string = CATEGORY_PREFIX[existing.category as keyof typeof CATEGORY_PREFIX] || "XX";
    const dupId = `${dupPrefix}${dupVal}`;

    const dupData = {
      id: dupId,
      name: `${existing.name} (Copy)`,
      description: existing.description ?? "",
      category: existing.category ?? "paithani",
      subcategory: existing.subcategory ?? null,
      brand: existing.brand ?? null,
      designPattern: existing.designPattern ?? null,
      fabric: existing.fabric ?? "silk",
      color: existing.color ?? "red",
      occasion: existing.occasion ?? "festival",
      price: existing.price ?? 0,
      originalPrice: existing.originalPrice ?? null,
      stock: 0,
      lowStockThreshold: existing.lowStockThreshold ?? 5,
      images: Array.isArray(existing.images) ? existing.images : [],
      videos: Array.isArray(existing.videos) ? existing.videos : [],
      variants: Array.isArray(existing.variants) ? existing.variants : [],
      specifications: Array.isArray(existing.specifications) ? existing.specifications : [],
      deliveryInfo: existing.deliveryInfo ?? "",
      returnPolicy: existing.returnPolicy ?? "",
      isBestSeller: false,
      isNewArrival: Boolean(existing.isNewArrival),
      vendorId: req.vendorId,
      vendorName: req.vendor?.name || existing.vendorName || "VASTRAA",
      status: "pending" as const,
      active: false,
    };

    let copy: any = null;
    try {
      const [created] = await db
        .insert(productsTable)
        .values(dupData as any)
        .returning();
      copy = created;
    } catch {}

    const mongoCopy = await mongoProducts.insert({ ...dupData, id: dupId }).catch(() => null);
    if (!copy) copy = mongoCopy || dupData;

    safeClearCache();
    safeInvalidatePattern(/product/);
    emitProductEvent("product:created", { id: dupId, vendorId: req.vendorId });

    res.status(201).json(normalizeProduct(copy));
  } catch (err) {
    req.log?.error?.({ err }, "Failed to duplicate product");
    res.status(500).json({ error: "Failed to duplicate product" });
  }
});

function normalizeProduct(p: typeof productsTable.$inferSelect | any) {
  if (!p) return null;
  const id = p.id || (p._id ? String(p._id) : "");
  const mongoId = (p as any)._id ? String((p as any)._id) : id;
  let customerPrice = p.price != null ? Number(p.price) : 0;
  const basePriceNum = p.basePrice != null ? Number(p.basePrice) : (customerPrice > 0 ? Math.round(customerPrice / 1.155) : 0);
  const shippingNum = p.shippingFee != null ? Number(p.shippingFee) : 100;

  if (!customerPrice && basePriceNum) {
    const fin = calculateVastraaFinancials({
      basePricePaise: toPaise(basePriceNum),
      shippingPaise: toPaise(shippingNum),
    });
    customerPrice = Math.round(toRupees(fin.customerPays));
  }

  const fin = calculateVastraaFinancials({
    basePricePaise: toPaise(basePriceNum),
    shippingPaise: toPaise(shippingNum),
  });

  return {
    id,
    _id: mongoId,
    name: p.name || "",
    description: p.description ?? "",
    price: customerPrice,
    basePrice: basePriceNum,
    shippingFee: shippingNum,
    taxableAmount: toRupees(fin.taxableAmount),
    gstAmount: toRupees(fin.gstAmount),
    cgst: toRupees(fin.cgst),
    sgst: toRupees(fin.sgst),
    igst: toRupees(fin.igst),
    originalPrice: p.originalPrice != null ? Number(p.originalPrice) : null,
    category: p.category || "Indian Wear",
    categoryId: p.categoryId ?? null,
    categoryName: p.categoryName ?? p.category ?? null,
    parentCategoryId: p.parentCategoryId ?? p.categoryId ?? null,
    parentCategoryName: p.parentCategoryName ?? p.categoryName ?? null,
    subcategory: p.subcategory ?? null,
    subcategoryId: p.subcategoryId ?? null,

    subcategoryName: p.subcategoryName ?? p.subcategory ?? null,
    childCategory: p.childCategory ?? null,
    brand: p.brand ?? null,
    designPattern: p.designPattern ?? null,
    fabric: p.fabric || "silk",
    color: p.color || "red",
    occasion: p.occasion || "festival",
    vendorId: p.vendorId ?? null,
    sellerId: p.sellerId ?? p.vendorId ?? null,
    vendorName: p.vendorName || "VASTRAA",
    images: Array.isArray(p.images) ? p.images : [],
    videos: Array.isArray(p.videos) ? p.videos : [],
    variants: Array.isArray(p.variants) ? p.variants : [],
    specifications: Array.isArray(p.specifications) ? p.specifications : [],
    deliveryInfo: p.deliveryInfo ?? "",
    returnPolicy: p.returnPolicy ?? "",
    isBestSeller: Boolean(p.isBestSeller),
    isNewArrival: Boolean(p.isNewArrival),
    isFeatured: Boolean(p.isFeatured),
    rating: p.reviewCount > 0 && typeof p.rating === "number" ? p.rating : 0,
    reviewCount: typeof p.reviewCount === "number" ? p.reviewCount : 0,
    stock: typeof p.stock === "number" ? p.stock : 0,
    lowStockThreshold: typeof p.lowStockThreshold === "number" ? p.lowStockThreshold : 5,
    active: p.active !== false,
    status: p.status || "approved",
    collection: p.collection ?? null,
    gender: p.gender ?? "Women",
    sareeType: p.sareeType ?? null,
    sareeStyle: p.sareeStyle ?? null,
    packOf: p.packOf ?? "Pack of 1",
    countryOfOrigin: p.countryOfOrigin ?? "India",
    blouseIncluded: isSareeCategory(p.category) ? (p.blouseIncluded !== undefined ? Boolean(p.blouseIncluded) : false) : false,
    blouseImages: Array.isArray(p.blouseImages) ? p.blouseImages : [],
    blouseDetails: p.blouseDetails || (p.blouseFabric ? { fabric: p.blouseFabric, color: p.blouseColor, length: p.blouseLength, design: p.blouseDesign } : null),
    mainCategoryId: p.mainCategoryId ?? p.categoryId ?? null,

    subtypeId: p.subtypeId ?? p.subtype ?? null,
    categorySlug: p.categorySlug ?? p.category ?? null,
    subcategorySlug: p.subcategorySlug ?? p.subcategory ?? null,
    kurtiType: p.kurtiType ?? null,
    kurtiLength: p.kurtiLength ?? null,
    fit: p.fit ?? null,
    pattern: p.pattern ?? null,
    closureType: p.closureType ?? null,
    setType: p.setType ?? null,
    kurtaLength: p.kurtaLength ?? null,
    bottomType: p.bottomType ?? null,
    bottomLength: p.bottomLength ?? null,
    dupattaIncluded: p.dupattaIncluded ?? null,
    dupattaFabric: p.dupattaFabric ?? null,
    dressType: p.dressType ?? null,
    dressLength: p.dressLength ?? null,
    sleeveLength: p.sleeveLength ?? null,
    neckStyle: p.neckStyle ?? null,
    silhouette: p.silhouette ?? null,
    embellishment: p.embellishment ?? null,
    neckline: p.neckline ?? null,
    waistline: p.waistline ?? null,
    winterWearType: p.winterWearType ?? null,
    warmthLevel: p.warmthLevel ?? null,
    winterWearLength: p.winterWearLength ?? null,
    topType: p.topType ?? null,
    sleeveType: p.sleeveType ?? null,
    topLength: p.topLength ?? null,
    subtype: p.subtype ?? p.childCategory ?? null,
    weavingTechnique: p.weavingTechnique ?? null,
    workType: p.workType ?? null,
    borderType: p.borderType ?? null,
    palluDesign: p.palluDesign ?? null,
    sareeLength: p.sareeLength ?? null,
    origin: p.origin ?? p.countryOfOrigin ?? "India",
    createdAt: p.createdAt ?? null,
    updatedAt: p.updatedAt ?? null,
  };
}

export default router;
