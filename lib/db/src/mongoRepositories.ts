import crypto from "crypto";
import { getCollection, getNextSequenceValue, isMongoDbConnected, setMongoConnected, formatVendorId } from "./mongo";
import { ObjectId, type Filter, type Sort } from "mongodb";

// Type definitions matching existing Drizzle schema models
import type {
  Vendor,
  Seller,
  Product,
  Order,
  CartItem,
  Wishlist,
  SavedAddress,
  User,
  UserSession,
  SavedPaymentMethod,
  Shipment,
  MongoShipmentDoc,
} from "./schema";
import { CATALOG_CATEGORIES, PRESERVED_SAREE_CATEGORIES, registerDynamicSubcategory, findCategoryDefinition } from "./categories";

// ─── SELLERS / VENDORS ────────────────────────────────────────────────────────
const inMemorySellersMap = new Map<string, Seller & Vendor>();

function deduplicateSellers(sellers: (Seller & Vendor)[]): (Seller & Vendor)[] {
  const map = new Map<string, Seller & Vendor>();
  for (const s of sellers) {
    const cleanEmail = (s.email || s.contactEmail || (s as any).ownerEmail || "").trim().toLowerCase();
    const key = cleanEmail ? `email:${cleanEmail}` : s.ownerId ? `owner:${s.ownerId}` : `id:${s.id || s.vendorId || s.sellerId}`;
    if (!key) continue;
    if (!map.has(key)) {
      map.set(key, { ...s });
    } else {
      const existing = map.get(key)!;
      map.set(key, {
        ...existing,
        ...s,
        id: existing.id || s.id,
        vendorId: existing.vendorId || s.vendorId,
        sellerId: existing.sellerId || s.sellerId,
        ownerId: existing.ownerId || s.ownerId,
        email: existing.email || s.email,
        contactEmail: existing.contactEmail || s.contactEmail,
        status: (existing.status === "approved" || s.status === "approved") ? "approved" : (s.status || existing.status),
      });
    }
  }
  return Array.from(map.values());
}

export const mongoSellers = {
  async findById(id: string): Promise<(Seller & Vendor) | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const orList: any[] = [{ id }, { sellerId: id }, { vendorId: id }, { ownerId: id }, { userId: id }, { _id: id as any }];
        if (typeof id === "string" && ObjectId.isValid(id)) {
          orList.push({ _id: new ObjectId(id) as any });
        }
        const filter = { $or: orList } as Filter<Seller & Vendor>;
        const colSellers = getCollection<Seller & Vendor>("sellers");
        const foundSeller = await colSellers.findOne(filter);
        if (foundSeller) return foundSeller;

        const colVendors = getCollection<Seller & Vendor>("vendors");
        const foundVendor = await colVendors.findOne(filter);
        if (foundVendor) return foundVendor;
      } catch {
        setMongoConnected(false);
      }
    }
    return (
      inMemorySellersMap.get(id) ||
      Array.from(inMemorySellersMap.values()).find(
        (s) => s.id === id || s.sellerId === id || s.vendorId === id || s.ownerId === id || (s as any).userId === id || (s as any)._id === id
      ) ||
      null
    );
  },

  async findByEmail(email: string): Promise<(Seller & Vendor) | null> {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) return null;
    if (isMongoDbConnected()) {
      try {
        const escaped = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const emailFilter = {
          $or: [
            { email: cleanEmail },
            { contactEmail: cleanEmail },
            { ownerEmail: cleanEmail },
            { email: { $regex: new RegExp(`^${escaped}$`, "i") } },
            { contactEmail: { $regex: new RegExp(`^${escaped}$`, "i") } },
            { ownerEmail: { $regex: new RegExp(`^${escaped}$`, "i") } },
          ],
        } as Filter<Seller & Vendor>;

        const colSellers = getCollection<Seller & Vendor>("sellers");
        const foundSeller = await colSellers.findOne(emailFilter);
        if (foundSeller) return foundSeller;

        const colVendors = getCollection<Seller & Vendor>("vendors");
        const foundVendor = await colVendors.findOne(emailFilter);
        if (foundVendor) return foundVendor;
      } catch {
        setMongoConnected(false);
      }
    }
    return (
      Array.from(inMemorySellersMap.values()).find(
        (s) =>
          (s.email || "").toLowerCase() === cleanEmail ||
          (s.contactEmail || "").toLowerCase() === cleanEmail ||
          ((s as any).ownerEmail || "").toLowerCase() === cleanEmail
      ) || null
    );
  },

  async findByOwnerId(ownerId: string): Promise<(Seller & Vendor) | null> {
    if (!ownerId) return null;
    if (isMongoDbConnected()) {
      try {
        const orList: any[] = [{ ownerId }, { userId: ownerId }, { id: ownerId }, { sellerId: ownerId }, { vendorId: ownerId }];
        const colSellers = getCollection<Seller & Vendor>("sellers");
        const foundSeller = await colSellers.findOne({ $or: orList } as Filter<Seller & Vendor>);
        if (foundSeller) return foundSeller;

        const colVendors = getCollection<Seller & Vendor>("vendors");
        const foundVendor = await colVendors.findOne({ $or: orList } as Filter<Seller & Vendor>);
        if (foundVendor) return foundVendor;
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemorySellersMap.values()).find((s) => s.ownerId === ownerId || (s as any).userId === ownerId || s.id === ownerId || s.sellerId === ownerId || s.vendorId === ownerId) || null;
  },

  async findBySellerId(sellerId: string): Promise<(Seller & Vendor) | null> {
    return this.findById(sellerId);
  },

  async findByVendorId(vendorId: string): Promise<(Seller & Vendor) | null> {
    return this.findById(vendorId);
  },

  async findMany(
    filter: Filter<Seller & Vendor> = {},
    options: { sort?: Sort; limit?: number; skip?: number } = {}
  ): Promise<(Seller & Vendor)[]> {
    const results: (Seller & Vendor)[] = [];
    if (isMongoDbConnected()) {
      try {
        try {
          const colSellers = getCollection<Seller & Vendor>("sellers");
          let cursor = colSellers.find(filter);
          if (options.sort) cursor = cursor.sort(options.sort);
          if (options.skip) cursor = cursor.skip(options.skip);
          if (options.limit) cursor = cursor.limit(options.limit);
          const sellers = await cursor.toArray();
          results.push(...sellers);
        } catch {}

        try {
          const colVendors = getCollection<Seller & Vendor>("vendors");
          let vCursor = colVendors.find(filter);
          if (options.sort) vCursor = vCursor.sort(options.sort);
          if (options.skip) vCursor = vCursor.skip(options.skip);
          if (options.limit) vCursor = vCursor.limit(options.limit);
          const vendors = await vCursor.toArray();
          results.push(...vendors);
        } catch {}
      } catch {
        setMongoConnected(false);
      }
    }
    results.push(...Array.from(inMemorySellersMap.values()));
    return deduplicateSellers(results);
  },

  async count(filter: Filter<Seller & Vendor> = {}): Promise<number> {
    const list = await this.findMany(filter);
    return list.length;
  },

  async insert(data: Partial<Seller & Vendor>): Promise<Seller & Vendor> {
    const cleanEmail = (data.email || data.contactEmail || "").trim().toLowerCase();
    const targetOwnerId = data.ownerId;
    const targetId = data.id;

    // Check if seller already exists by email, ownerId, or ID to prevent duplicates
    let existing: (Seller & Vendor) | null = null;
    if (cleanEmail) {
      existing = await this.findByEmail(cleanEmail);
    }
    if (!existing && targetOwnerId) {
      existing = await this.findByOwnerId(targetOwnerId);
    }
    if (!existing && targetId) {
      existing = await this.findById(targetId);
    }

    if (existing) {
      const updated = await this.update(existing.id, data);
      return updated || existing;
    }

    const id = data.id || crypto.randomUUID();
    const status = data.status || "pending";
    let vendorId = data.vendorId || data.sellerId || null;

    if (!vendorId) {
      const seq = await getNextSequenceValue("vendor_id");
      vendorId = formatVendorId(seq);
    }

    const sellerId = vendorId || data.sellerId || id;
    const now = new Date();

    const doc = {
      name: data.name || data.shopName || "Seller Store",
      sellerName: data.sellerName || data.name || data.shopName || "Seller Store",
      shopName: data.shopName || data.name || "Seller Store",
      email: cleanEmail,
      contactEmail: cleanEmail,
      mobile: data.mobile || "",
      passwordHash: data.passwordHash || "",
      location: data.location || "India",
      rating: data.rating ?? 4.5,
      sareesCount: data.sareesCount ?? 0,
      productsCount: data.productsCount ?? data.sareesCount ?? 0,
      avatar: data.avatar || "/images/artisan-1.png",
      status,
      ownerId: data.ownerId || id,
      gstin: data.gstin ?? null,
      panNumber: data.panNumber ?? null,
      panCardUrl: data.panCardUrl ?? null,
      gstCertUrl: data.gstCertUrl ?? null,
      bankHolder: data.bankHolder ?? null,
      bankName: data.bankName ?? null,
      bankAccount: data.bankAccount ?? null,
      bankIfsc: data.bankIfsc ?? null,
      shopStreet: data.shopStreet ?? null,
      shopCity: data.shopCity ?? null,
      shopState: data.shopState ?? null,
      shopPincode: data.shopPincode ?? null,
      shopCountry: data.shopCountry ?? "India",
      pickupLocationName: data.pickupLocationName ?? null,
      pickupAddressLine1: data.pickupAddressLine1 ?? null,
      pickupAddressLine2: data.pickupAddressLine2 ?? null,
      pickupLandmark: data.pickupLandmark ?? null,
      pickupCity: data.pickupCity ?? null,
      pickupState: data.pickupState ?? null,
      pickupPincode: data.pickupPincode ?? null,
      pickupCountry: data.pickupCountry ?? "India",
      pickupSameAsShop: data.pickupSameAsShop ?? true,
      reactivationWelcomePending: data.reactivationWelcomePending ?? false,
      ...data,
      id,
      sellerId,
      vendorId: vendorId ?? undefined,
      _id: id,
      createdAt: data.createdAt || now,
      updatedAt: data.updatedAt || now,
    } as unknown as Seller & Vendor;

    inMemorySellersMap.set(id, doc);
    if (sellerId) inMemorySellersMap.set(sellerId, doc);
    if (vendorId) inMemorySellersMap.set(vendorId, doc);
    if (cleanEmail) inMemorySellersMap.set(cleanEmail, doc);

    if (isMongoDbConnected()) {
      try {
        const colSellers = getCollection<Seller & Vendor>("sellers");
        await colSellers.updateOne(
          { $or: [{ id }, { sellerId }, ...(cleanEmail ? [{ email: cleanEmail }, { contactEmail: cleanEmail }] : [])] } as Filter<Seller & Vendor>,
          { $set: doc },
          { upsert: true }
        );
        const colVendors = getCollection<Seller & Vendor>("vendors");
        await colVendors.updateOne(
          { $or: [{ id }, { sellerId }, ...(cleanEmail ? [{ email: cleanEmail }, { contactEmail: cleanEmail }] : [])] } as Filter<Seller & Vendor>,
          { $set: doc },
          { upsert: true }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: Partial<Seller & Vendor>): Promise<(Seller & Vendor) | null> {
    const cleanEmail = updateData.email || updateData.contactEmail
      ? (updateData.email || updateData.contactEmail!).trim().toLowerCase()
      : undefined;
    const now = new Date();
    const setObj: Record<string, any> = { ...updateData, updatedAt: now };
    if (cleanEmail) {
      setObj.email = cleanEmail;
      setObj.contactEmail = cleanEmail;
    }

    const existing =
      (await this.findById(id)) ||
      (await this.findByOwnerId(id)) ||
      (await this.findBySellerId(id)) ||
      (await this.findByVendorId(id)) ||
      (cleanEmail ? await this.findByEmail(cleanEmail) : null);

    if (existing) {
      const targetId = existing.id || id;

      // 1. Vendor ID Immutability: existing vendorId must NEVER be overwritten or changed
      if (existing.vendorId) {
        setObj.vendorId = existing.vendorId;
      } else if (updateData.status === "approved") {
        // 2. Generate Vendor ID only upon approval if missing
        const seq = await getNextSequenceValue("vendor_id");
        const newVendorId = formatVendorId(seq);
        setObj.vendorId = newVendorId;
        setObj.sellerId = newVendorId;
      }

      // 3. Seller Reactivation: set reactivationWelcomePending = true if reactivating from suspended or deactivated
      if (((existing.status as any) === "suspended" || (existing.status as any) === "deactivated") && updateData.status === "approved") {
        if (updateData.reactivationWelcomePending === undefined) {
          setObj.reactivationWelcomePending = true;
        }
      }

      const updated = { ...existing, ...setObj };
      inMemorySellersMap.set(targetId, updated);
      if (existing.id) inMemorySellersMap.set(existing.id, updated);
      if (id) inMemorySellersMap.set(id, updated);
      if (updated.sellerId) inMemorySellersMap.set(updated.sellerId, updated);
      if (updated.vendorId) inMemorySellersMap.set(updated.vendorId, updated);
      if (updated.ownerId) inMemorySellersMap.set(updated.ownerId, updated);
      if (updated.email) inMemorySellersMap.set(updated.email, updated);

      if (isMongoDbConnected()) {
        try {
          const filter = {
            $or: [
              { id: targetId },
              { _id: targetId as any },
              { sellerId: targetId },
              { vendorId: targetId },
              { ownerId: existing.ownerId || targetId },
              { email: updated.email },
            ],
          } as Filter<Seller & Vendor>;

          const colSellers = getCollection<Seller & Vendor>("sellers");
          await colSellers.updateOne(filter, { $set: setObj });

          const colVendors = getCollection<Seller & Vendor>("vendors");
          await colVendors.updateOne(filter, { $set: setObj });
        } catch {
          setMongoConnected(false);
        }
      }
      return updated;
    }
    return this.insert({ id, ...updateData });
  },

  async delete(id: string): Promise<boolean> {
    inMemorySellersMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const colSellers = getCollection<Seller & Vendor>("sellers");
        await colSellers.deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<Seller & Vendor>);
        const colVendors = getCollection<Seller & Vendor>("vendors");
        await colVendors.deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<Seller & Vendor>);
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  },
};

export const mongoVendors = mongoSellers;

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
const inMemoryProductsMap = new Map<string, Product>();

function filterInMemoryProducts(products: Product[], filter: Record<string, any>): Product[] {
  return products.filter(p => {
    if (filter.id !== undefined) {
      if (typeof filter.id === "object" && filter.id !== null) {
        if (filter.id.$in && Array.isArray(filter.id.$in)) {
          if (!filter.id.$in.includes(p.id) && !filter.id.$in.includes((p as any)._id)) return false;
        }
      } else if (p.id !== filter.id && (p as any)._id !== filter.id) {
        return false;
      }
    }
    if (filter._id !== undefined) {
      if (typeof filter._id === "object" && filter._id !== null) {
        if (filter._id.$in && Array.isArray(filter._id.$in)) {
          if (!filter._id.$in.includes(p.id) && !filter._id.$in.includes((p as any)._id)) return false;
        }
      } else if (p.id !== filter._id && (p as any)._id !== filter._id) {
        return false;
      }
    }
    if (filter.active !== undefined && p.active !== filter.active) return false;
    if (filter.category !== undefined) {
      const filterCat = String(filter.category).toLowerCase().trim();
      const filterSlug = filterCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const prodCat = String(p.category || "").toLowerCase().trim();
      const prodSlug = prodCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      if (filterCat !== prodCat && filterSlug !== prodSlug) return false;
    }
    if (filter.fabric !== undefined && p.fabric !== filter.fabric) return false;
    if (filter.color !== undefined && p.color !== filter.color) return false;
    if (filter.occasion !== undefined && p.occasion !== filter.occasion) return false;
    if (filter.vendorId !== undefined && p.vendorId !== filter.vendorId) return false;
    if (filter.status !== undefined && p.status !== filter.status) return false;
    if (filter.isBestSeller !== undefined && p.isBestSeller !== filter.isBestSeller) return false;
    if (filter.isNewArrival !== undefined && p.isNewArrival !== filter.isNewArrival) return false;
    if (filter.isFeatured !== undefined && p.isFeatured !== filter.isFeatured) return false;
    if (filter.minPrice !== undefined && p.price < filter.minPrice) return false;
    if (filter.maxPrice !== undefined && p.price > filter.maxPrice) return false;
    if (filter.minRating !== undefined && p.rating < filter.minRating) return false;
    if (filter.$or && Array.isArray(filter.$or)) {
      const matchesOr = filter.$or.some((cond: any) => {
        if (cond.id) return p.id === cond.id || (p as any)._id === cond.id;
        if (cond.sellerId) return p.vendorId === cond.sellerId;
        if (cond.vendorId) return p.vendorId === cond.vendorId;
        if (cond.name && cond.name.$regex) {
          const re = new RegExp(cond.name.$regex, cond.name.$options || "i");
          return re.test(p.name || "") || re.test(p.description || "") || re.test(p.vendorName || "");
        }
        return true;
      });
      if (!matchesOr) return false;
    }
    return true;
  });
}

export const mongoProducts = {
  async findById(id: string): Promise<Product | null> {
    if (!id) return null;
    const strId = String(id).trim();
    if (!strId) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const orClause: any[] = [{ id: strId }, { productId: strId }, { _id: strId as any }];
        if (ObjectId.isValid(strId)) {
          try {
            orClause.push({ _id: new ObjectId(strId) as any });
          } catch {}
        }
        const found = await col.findOne({ $or: orClause } as Filter<Product>);
        if (found) {
          const canonicalKey = found.id || strId;
          inMemoryProductsMap.set(canonicalKey, found);
          if ((found as any)._id) {
            inMemoryProductsMap.set(String((found as any)._id), found);
          }
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const memMatch = inMemoryProductsMap.get(strId) ||
      Array.from(inMemoryProductsMap.values()).find(p =>
        p.id === strId ||
        (p as any).productId === strId ||
        (p as any)._id === strId ||
        String((p as any)._id) === strId
      ) || null;
    return memMatch;
  },

  async findMany(filter: Filter<Product> = {}, options: { sort?: Sort; limit?: number; skip?: number; offset?: number; projection?: any } = {}): Promise<Product[]> {
    const skip = options.skip ?? options.offset ?? 0;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        let cursor = col.find(filter);
        if (options.projection) cursor = cursor.project(options.projection);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (skip) cursor = cursor.skip(skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        if (list.length > 0) {
          list.forEach(p => {
            if (p.id) inMemoryProductsMap.set(p.id, p);
            if ((p as any)._id) inMemoryProductsMap.set(String((p as any)._id), p);
          });
        }
        return list;
      } catch {
        setMongoConnected(false);
      }
    }
    const results: Product[] = [];
    const memList = filterInMemoryProducts(Array.from(inMemoryProductsMap.values()), filter as any);
    for (const p of memList) {
      if (!results.some(r => r.id === p.id || (r as any)._id === p.id)) {
        results.push(p);
      }
    }
    let filtered = results;
    if (skip && options.limit) filtered = filtered.slice(skip, skip + options.limit);
    else if (skip) filtered = filtered.slice(skip);
    else if (options.limit) filtered = filtered.slice(0, options.limit);
    return filtered;
  },

  async count(filter: Filter<Product> = {}): Promise<number> {
    if (isMongoDbConnected()) {
      try {
        return await getCollection<Product>("products").countDocuments(filter);
      } catch {
        setMongoConnected(false);
      }
    }
    return filterInMemoryProducts(Array.from(inMemoryProductsMap.values()), filter as any).length;
  },

  async insert(data: Partial<Product>): Promise<Product> {
    const id = data.id || `PRD${await getNextSequenceValue("product_id")}`;
    const doc = {
      description: "",
      fabric: "silk",
      color: "gold",
      occasion: "festival",
      vendorName: "",
      images: [],
      imageUpdatedAt: (data as any).imageUpdatedAt || new Date(),
      imageVersion: (data as any).imageVersion || Date.now(),
      videos: [],
      variants: [],
      specifications: [],
      deliveryInfo: "",
      returnPolicy: "",
      isBestSeller: false,
      isNewArrival: false,
      isFeatured: false,
      rating: 5.0,
      reviewCount: 0,
      stock: 10,
      lowStockThreshold: 5,
      active: true,
      viewCount: 0,
      status: "approved",
      ...data,
      id,
      _id: (data as any)._id || id,
    } as unknown as Product;

    inMemoryProductsMap.set(id, doc);
    if ((doc as any)._id) {
      inMemoryProductsMap.set(String((doc as any)._id), doc);
    }

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const { _id: docMongoId, ...setDoc } = doc as any;
        const orClause: any[] = [{ id }, { productId: id }, { _id: id as any }];
        if (docMongoId && docMongoId !== id) {
          orClause.push({ _id: docMongoId as any });
        }
        if (typeof id === "string" && ObjectId.isValid(id)) {
          try {
            orClause.push({ _id: new ObjectId(id) as any });
          } catch {}
        }
        if (typeof docMongoId === "string" && ObjectId.isValid(docMongoId)) {
          try {
            orClause.push({ _id: new ObjectId(docMongoId) as any });
          } catch {}
        }
        await col.updateOne(
          { $or: orClause } as Filter<Product>,
          { $set: { ...setDoc, id, productId: id } },
          { upsert: true }
        );
      } catch (err: any) {
        console.error(`[MongoDB products.insert] Error inserting ${id}:`, err?.message || err);
        throw new Error(`Database write failed: ${err?.message || "could not save to MongoDB"}`);
      }
    }
    return doc;
  },

  async update(id: string, updateData: Partial<Product>): Promise<Product | null> {
    const strId = String(id).trim();
    const existing = await this.findById(strId);
    const now = new Date();
    const canonicalId = existing?.id || strId;
    const mongoId = (existing as any)?._id || (updateData as any)?._id || strId;

    const updateWithTimestamp: any = { ...updateData, updatedAt: now };
    if (updateData.images !== undefined || (updateData as any).image !== undefined || (updateData as any).imageUpdatedAt !== undefined) {
      updateWithTimestamp.imageUpdatedAt = (updateData as any).imageUpdatedAt ? new Date((updateData as any).imageUpdatedAt) : now;
      updateWithTimestamp.imageVersion = (updateData as any).imageVersion ? Number((updateData as any).imageVersion) : now.getTime();
    }
    const updated = { ...(existing || {}), ...updateWithTimestamp, id: canonicalId, _id: mongoId } as Product;

    inMemoryProductsMap.set(canonicalId, updated);
    inMemoryProductsMap.set(strId, updated);
    if ((existing as any)?._id) {
      inMemoryProductsMap.set(String((existing as any)._id), updated);
    }
    if ((existing as any)?.productId) {
      inMemoryProductsMap.set((existing as any).productId, updated);
    }

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const orClause: any[] = [
          { id: strId },
          { id: canonicalId },
          { productId: strId },
          { productId: canonicalId },
          { _id: strId as any },
        ];
        if (existing && (existing as any)._id) {
          orClause.push({ _id: (existing as any)._id as any });
        }
        if (ObjectId.isValid(strId)) {
          try {
            orClause.push({ _id: new ObjectId(strId) as any });
          } catch {}
        }
        if (existing && (existing as any)._id && ObjectId.isValid(String((existing as any)._id))) {
          try {
            orClause.push({ _id: new ObjectId(String((existing as any)._id)) as any });
          } catch {}
        }
        const { _id, id: _safeId, ...safeSet } = updateWithTimestamp as any;
        const res = await col.updateMany(
          { $or: orClause } as Filter<Product>,
          { $set: { ...safeSet, id: canonicalId, productId: canonicalId } }
        );
        if (res.matchedCount === 0 && (updateData as any).status && existing?.name) {
          // Fallback: match by product name if id was not matched
          await col.updateMany(
            { name: existing.name } as Filter<Product>,
            { $set: { ...safeSet, id: canonicalId, productId: canonicalId } }
          );
        }
      } catch (err: any) {
        console.error(`[mongoProducts.update] MongoDB update error for ${id}:`, err?.message || err);
        throw err;
      }
    }
    return updated;
  },

  async decrementStock(id: string, qty: number): Promise<{ success: boolean; stock: number }> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const res = await col.findOneAndUpdate(
          { $or: [{ id }, { _id: id as any }], stock: { $gte: qty } } as Filter<Product>,
          { $inc: { stock: -qty } },
          { returnDocument: "after" }
        );
        const updatedDoc = (res as any)?.value ?? res;
        if (updatedDoc && typeof updatedDoc.stock === "number") {
          inMemoryProductsMap.set(id, updatedDoc as Product);
          return { success: true, stock: updatedDoc.stock };
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const existing = await this.findById(id);
    if (!existing || existing.stock < qty) {
      return { success: false, stock: existing?.stock ?? 0 };
    }
    const newStock = existing.stock - qty;
    const updated = { ...existing, stock: newStock };
    inMemoryProductsMap.set(id, updated);
    return { success: true, stock: newStock };
  },

  async incrementStock(id: string, qty: number): Promise<{ success: boolean; stock: number }> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const orClause: any[] = [{ id }, { productId: id }, { _id: id as any }];
        if (typeof id === "string" && ObjectId.isValid(id)) {
          orClause.push({ _id: new ObjectId(id) as any });
        }
        const res = await col.findOneAndUpdate(
          { $or: orClause } as Filter<Product>,
          { $inc: { stock: qty } },
          { returnDocument: "after" }
        );
        const updatedDoc = (res as any)?.value ?? res;
        if (updatedDoc && typeof updatedDoc.stock === "number") {
          inMemoryProductsMap.set(id, updatedDoc as Product);
          if (updatedDoc.id) inMemoryProductsMap.set(updatedDoc.id, updatedDoc as Product);
          return { success: true, stock: updatedDoc.stock };
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const existing = await this.findById(id);
    const newStock = (existing?.stock ?? 0) + qty;
    const updated = { ...(existing || {}), stock: newStock } as Product;
    inMemoryProductsMap.set(id, updated);
    return { success: true, stock: newStock };
  },

  async delete(id: string): Promise<boolean> {
    const strId = String(id).trim();
    // 1. Try to find existing doc first to gather all identifiers
    const existing = await this.findById(strId).catch(() => null);
    const canonicalId = existing?.id || strId;
    const mongoIdStr = (existing as any)?._id ? String((existing as any)._id) : "";

    // 2. Remove all references from inMemoryProductsMap
    inMemoryProductsMap.delete(strId);
    inMemoryProductsMap.delete(canonicalId);
    if (mongoIdStr) inMemoryProductsMap.delete(mongoIdStr);
    if ((existing as any)?.productId) inMemoryProductsMap.delete((existing as any).productId);
    for (const [k, p] of inMemoryProductsMap.entries()) {
      if (
        p.id === strId ||
        p.id === canonicalId ||
        (p as any).productId === strId ||
        (p as any).productId === canonicalId ||
        (p as any)._id === strId ||
        String((p as any)._id) === strId ||
        (mongoIdStr && String((p as any)._id) === mongoIdStr)
      ) {
        inMemoryProductsMap.delete(k);
      }
    }

    // 3. Delete from MongoDB collection
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const orClause: any[] = [
          { id: strId },
          { id: canonicalId },
          { productId: strId },
          { productId: canonicalId },
          { _id: strId as any },
        ];
        if (ObjectId.isValid(strId)) {
          try {
            orClause.push({ _id: new ObjectId(strId) as any });
          } catch {}
        }
        if (existing) {
          if (existing.id && existing.id !== strId) orClause.push({ id: existing.id });
          if ((existing as any).productId && (existing as any).productId !== strId) orClause.push({ productId: (existing as any).productId });
          if ((existing as any)._id) {
            orClause.push({ _id: (existing as any)._id as any });
            const s = String((existing as any)._id);
            if (ObjectId.isValid(s)) {
              try {
                orClause.push({ _id: new ObjectId(s) as any });
              } catch {}
            }
          }
        }
        const res = await col.deleteMany({ $or: orClause } as Filter<Product>);
        return (res.deletedCount ?? 0) > 0;
      } catch (err: any) {
        console.warn(`[mongoProducts.delete] Warning deleting product ${id}:`, err?.message || err);
      }
    }
    return true;
  },

  async getAdminStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    featured: number;
    activeCategories: number;
    activeBrands: number;
  }> {
    const allProducts = await this.findMany({}, { limit: 100000 });
    const total = allProducts.length;
    const pending = allProducts.filter((p) => p.status === "pending").length;
    const approved = allProducts.filter((p) => p.status === "approved" || (!p.status && p.active)).length;
    const rejected = allProducts.filter((p) => p.status === "rejected").length;
    const featured = allProducts.filter((p) => p.isFeatured && p.active && p.status !== "rejected").length;

    let activeCategories = 0;
    try {
      const allCategories = await mongoProductCategories.listAll();
      activeCategories = allCategories.filter((c) => c.active && (c.status === "approved" || !c.status)).length;
    } catch {
      activeCategories = 0;
    }

    let activeBrands = 0;
    try {
      if (isMongoDbConnected()) {
        activeBrands = await getCollection("product_brands").countDocuments({ active: true });
      }
    } catch {
      activeBrands = 0;
    }

    return {
      total,
      pending,
      approved,
      rejected,
      featured,
      activeCategories,
      activeBrands,
    };
  }
};


// ─── ORDERS ──────────────────────────────────────────────────────────────────
const inMemoryOrdersMap = new Map<string, Order>();

export const mongoOrders = {
  async findById(id: string): Promise<Order | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Order>("orders");
        const found = await col.findOne({ $or: [{ id }, { displayId: id }, { _id: id as any }] } as Filter<Order>);
        if (found) {
          inMemoryOrdersMap.set(found.id || id, found);
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryOrdersMap.get(id) || Array.from(inMemoryOrdersMap.values()).find(o => o.id === id || o.displayId === id || (o as any)._id === id) || null;
  },

  async findMany(filter: Filter<Order> = {}, options: { sort?: Sort; limit?: number; skip?: number; projection?: any } = {}): Promise<Order[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Order>("orders");
        let cursor = col.find(filter);
        if (options.projection) cursor = cursor.project(options.projection);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        if (list.length > 0) {
          list.forEach(o => inMemoryOrdersMap.set(o.id || (o as any)._id, o));
        }
        return list;
      } catch {
        setMongoConnected(false);
      }
    }
    let list = Array.from(inMemoryOrdersMap.values());
    if (filter.userId) list = list.filter(o => o.userId === filter.userId);
    if (filter.status) list = list.filter(o => o.status === filter.status);
    if (options.skip) list = list.slice(options.skip);
    if (options.limit) list = list.slice(0, options.limit);
    return list;
  },

  async count(filter: Filter<Order> = {}): Promise<number> {
    if (isMongoDbConnected()) {
      try {
        return await getCollection<Order>("orders").countDocuments(filter);
      } catch {
        setMongoConnected(false);
      }
    }
    return (await this.findMany(filter)).length;
  },

  async insert(data: Partial<Order>): Promise<Order> {
    const seq = await getNextSequenceValue("order_id");
    const displayId = data.displayId || `V${seq}`;
    const id = data.id || displayId;
    const now = new Date();
    const doc = {
      status: "confirmed",
      statusHistory: [{ status: "confirmed", timestamp: now.toISOString(), note: "Order placed successfully" }],
      discount: 0,
      vendorAcceptances: {},
      createdAt: now,
      updatedAt: now,
      ...data,
      id,
      displayId,
      _id: id,
    } as unknown as Order;

    inMemoryOrdersMap.set(id, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Order>("orders");
        await col.insertOne(doc as any);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: Partial<Order>): Promise<Order | null> {
    const existing = await this.findById(id);
    const updated = { ...(existing || {}), ...updateData, updatedAt: new Date() } as Order;
    inMemoryOrdersMap.set(id, updated);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Order>("orders");
        await col.updateOne({ $or: [{ id }, { displayId: id }, { _id: id as any }] } as Filter<Order>, {
          $set: { ...updateData, updatedAt: new Date() }
        });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    inMemoryOrdersMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const res = await getCollection<Order>("orders").deleteOne({ $or: [{ id }, { displayId: id }, { _id: id as any }] } as Filter<Order>);
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  }
};

// ─── CART ITEMS ──────────────────────────────────────────────────────────────
const inMemoryCartMap = new Map<string, CartItem>();

export const mongoCart = {
  async findByUserId(userId: string): Promise<CartItem[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<CartItem>("cart_items");
        return await col.find({ userId }).toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryCartMap.values()).filter(c => c.userId === userId);
  },
  async upsert(userId: string, productId: string, quantity: number): Promise<CartItem> {
    const id = `${userId}_${productId}`;
    const now = new Date();
    const doc = { id, _id: id, userId, productId, quantity, createdAt: now, updatedAt: now } as unknown as CartItem;
    inMemoryCartMap.set(id, doc);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<CartItem>("cart_items");
        await col.updateOne(
          { userId, productId },
          { $set: { quantity, updatedAt: now }, $setOnInsert: { createdAt: now } },
          { upsert: true }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },
  async removeItem(userId: string, productId: string): Promise<boolean> {
    const id = `${userId}_${productId}`;
    inMemoryCartMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<CartItem>("cart_items");
        const res = await col.deleteOne({ userId, productId });
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  },
  async clearCart(userId: string): Promise<number> {
    let count = 0;
    for (const [k, v] of inMemoryCartMap.entries()) {
      if (v.userId === userId) {
        inMemoryCartMap.delete(k);
        count++;
      }
    }
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<CartItem>("cart_items");
        const res = await col.deleteMany({ userId });
        return res.deletedCount;
      } catch {
        setMongoConnected(false);
      }
    }
    return count;
  }
};

// ─── WISHLISTS ───────────────────────────────────────────────────────────────
const inMemoryWishlistsMap = new Map<string, Wishlist>();

export const mongoWishlists = {
  async findByUserId(userId: string): Promise<Wishlist[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Wishlist>("wishlists");
        return await col.find({ userId }).toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryWishlistsMap.values()).filter(w => w.userId === userId);
  },
  async add(userId: string, productId: string): Promise<Wishlist> {
    const id = `${userId}_${productId}`;
    const doc = { id, _id: id, userId, productId, createdAt: new Date() } as unknown as Wishlist;
    inMemoryWishlistsMap.set(id, doc);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Wishlist>("wishlists");
        await col.updateOne(
          { userId, productId },
          { $setOnInsert: { createdAt: new Date() } },
          { upsert: true }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },
  async remove(userId: string, productId: string): Promise<boolean> {
    const id = `${userId}_${productId}`;
    inMemoryWishlistsMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Wishlist>("wishlists");
        const res = await col.deleteOne({ userId, productId });
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  }
};

// ─── SAVED ADDRESSES ─────────────────────────────────────────────────────────
const inMemoryAddressesMap = new Map<string, SavedAddress>();

export const mongoAddresses = {
  async findByUserId(userId: string): Promise<SavedAddress[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedAddress>("saved_addresses");
        return await col.find({ userId }).sort({ createdAt: -1 }).toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryAddressesMap.values()).filter(a => a.userId === userId);
  },
  async findById(id: string): Promise<SavedAddress | null> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedAddress>("saved_addresses");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] } as Filter<SavedAddress>);
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryAddressesMap.get(id) || Array.from(inMemoryAddressesMap.values()).find(a => a.id === id) || null;
  },
  async insert(data: Partial<SavedAddress>): Promise<SavedAddress> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const doc = {
      landmark: null,
      country: "India",
      addressType: "home",
      ...data,
      id,
      _id: id,
      createdAt: now,
      updatedAt: now,
    } as unknown as SavedAddress;
    inMemoryAddressesMap.set(id, doc);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedAddress>("saved_addresses");
        await col.insertOne(doc as any);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },
  async update(id: string, updateData: Partial<SavedAddress>): Promise<SavedAddress | null> {
    const existing = await this.findById(id);
    const updated = { ...(existing || {}), ...updateData, updatedAt: new Date() } as SavedAddress;
    inMemoryAddressesMap.set(id, updated);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedAddress>("saved_addresses");
        await col.updateOne({ $or: [{ id }, { _id: id as any }] } as Filter<SavedAddress>, {
          $set: { ...updateData, updatedAt: new Date() }
        });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },
  async delete(id: string): Promise<boolean> {
    inMemoryAddressesMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const res = await getCollection<SavedAddress>("saved_addresses").deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<SavedAddress>);
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  }
};

// ─── SAVED PAYMENT METHODS ───────────────────────────────────────────────────
const inMemoryPaymentMethodsMap = new Map<string, SavedPaymentMethod>();

export const mongoPaymentMethods = {
  async findByUserId(userId: string): Promise<SavedPaymentMethod[]> {
    let results: SavedPaymentMethod[] = [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedPaymentMethod>("saved_payment_methods");
        results = await col.find({ userId }).sort({ isDefault: -1, createdAt: 1 }).toArray();
        if (results && results.length > 0) return results;
      } catch {
        setMongoConnected(false);
      }
    }
    results = Array.from(inMemoryPaymentMethodsMap.values()).filter(m => m.userId === userId);
    return results.sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });
  },

  async findById(id: string): Promise<SavedPaymentMethod | null> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedPaymentMethod>("saved_payment_methods");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] } as Filter<SavedPaymentMethod>);
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryPaymentMethodsMap.get(id) || Array.from(inMemoryPaymentMethodsMap.values()).find(m => m.id === id || (m as any)._id === id) || null;
  },

  async insert(data: Partial<SavedPaymentMethod>): Promise<SavedPaymentMethod> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    
    const userMethods = await this.findByUserId(data.userId!);
    const makeDefault = !!data.isDefault || userMethods.length === 0;

    if (makeDefault) {
      for (const m of userMethods) {
        if (m.isDefault) {
          m.isDefault = false;
          m.updatedAt = now;
          inMemoryPaymentMethodsMap.set(m.id, m);
          if (isMongoDbConnected()) {
            try {
              const col = getCollection<SavedPaymentMethod>("saved_payment_methods");
              await col.updateOne({ $or: [{ id: m.id }, { _id: m.id as any }] } as Filter<SavedPaymentMethod>, { $set: { isDefault: false, updatedAt: now } });
            } catch {}
          }
        }
      }
    }

    const doc = {
      cardBrand: null,
      last4: null,
      cardholderName: null,
      expiryMonth: null,
      expiryYear: null,
      upiId: null,
      upiHandle: null,
      ...data,
      id,
      _id: id,
      isDefault: makeDefault,
      createdAt: now,
      updatedAt: now,
    } as unknown as SavedPaymentMethod;

    inMemoryPaymentMethodsMap.set(id, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedPaymentMethod>("saved_payment_methods");
        await col.insertOne(doc as any);
      } catch (err) {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: Partial<SavedPaymentMethod>): Promise<SavedPaymentMethod | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const now = new Date();
    const updated = { ...existing, ...updateData, updatedAt: now };
    inMemoryPaymentMethodsMap.set(id, updated);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedPaymentMethod>("saved_payment_methods");
        await col.updateOne({ $or: [{ id }, { _id: id as any }] } as Filter<SavedPaymentMethod>, {
          $set: { ...updateData, updatedAt: now }
        });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    const existing = await this.findById(id);
    if (!existing) return false;

    const userId = existing.userId;
    const wasDefault = existing.isDefault;

    inMemoryPaymentMethodsMap.delete(id);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<SavedPaymentMethod>("saved_payment_methods");
        await col.deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<SavedPaymentMethod>);
      } catch {
        setMongoConnected(false);
      }
    }

    if (wasDefault) {
      const remaining = await this.findByUserId(userId);
      if (remaining.length > 0) {
        const oldest = [...remaining].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0];
        await this.update(oldest.id, { isDefault: true });
      }
    }

    return true;
  },

  async setDefault(userId: string, targetId: string): Promise<SavedPaymentMethod | null> {
    const userMethods = await this.findByUserId(userId);
    const target = userMethods.find(m => m.id === targetId);
    if (!target) return null;

    for (const m of userMethods) {
      const newDefault = m.id === targetId;
      if (m.isDefault !== newDefault) {
        await this.update(m.id, { isDefault: newDefault });
      }
    }

    return (await this.findById(targetId)) || target;
  }
};

// ─── SITE SETTINGS ───────────────────────────────────────────────────────────
export const mongoSiteSettings = {
  async get(key: string): Promise<string | null> {
    if (!isMongoDbConnected()) return null;
    try {
      const col = getCollection<{ _id: string; key: string; value: string; updatedAt: Date }>("site_settings");
      const doc = await col.findOne({ $or: [{ _id: key }, { key }] });
      return doc ? doc.value : null;
    } catch {
      return null;
    }
  },
  async set(key: string, value: string): Promise<void> {
    if (!isMongoDbConnected()) return;
    try {
      const col = getCollection<{ _id: string; key: string; value: string; updatedAt: Date }>("site_settings");
      await col.updateOne(
        { $or: [{ _id: key }, { key }] },
        { $set: { key, value, updatedAt: new Date() } },
        { upsert: true }
      );
    } catch {}
  },
  async delete(key: string): Promise<void> {
    if (!isMongoDbConnected()) return;
    try {
      const col = getCollection<{ _id: string; key: string; value: string; updatedAt: Date }>("site_settings");
      await col.deleteOne({ $or: [{ _id: key }, { key }] });
    } catch {}
  }
};

// ─── USERS ───────────────────────────────────────────────────────────────────
const inMemoryUsersMap = new Map<string, User>();

export const mongoUsers = {
  async findById(id: string): Promise<User | null> {
    if (!id || typeof id !== "string") return null;
    const cleanId = id.trim();
    if (!cleanId) return null;

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        // Strict match on id first
        let found = await col.findOne({ id: cleanId });
        if (found) return found;

        // If not found by id, try _id if valid ObjectId
        if (ObjectId.isValid(cleanId)) {
          found = await col.findOne({ _id: new ObjectId(cleanId) as any });
          if (found) return found;
        }

        // Only match string _id if the document's id matches or is unset
        const byUnderId = await col.findOne({ _id: cleanId as any });
        if (byUnderId && (!byUnderId.id || byUnderId.id === cleanId)) {
          return byUnderId;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryUsersMap.get(cleanId) || Array.from(inMemoryUsersMap.values()).find(u => u.id === cleanId || (!u.id && (u as any)._id === cleanId)) || null;
  },
  async findByEmail(email: string, role?: string): Promise<User | null> {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        const escaped = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const filter: Filter<User> = {
          $or: [
            { email: cleanEmail },
            { email: { $regex: new RegExp(`^${escaped}$`, "i") } },
          ],
        };
        if (role) {
          filter.role = role as any;
        }
        const found = await col.findOne(filter);
        if (found) {
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }

    return Array.from(inMemoryUsersMap.values()).find(u => {
      const uEmail = (u.email || "").toLowerCase();
      const matchesEmail = uEmail === cleanEmail;
      const matchesRole = !role || u.role === role;
      return matchesEmail && matchesRole;
    }) || null;
  },
  async findByGoogleId(googleId: string): Promise<User | null> {
    if (!googleId) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        const found = await col.findOne({ googleId });
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryUsersMap.values()).find(u => u.googleId === googleId) || null;
  },
  async findMany(filter: any = {}): Promise<User[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        return await col.find(filter).toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryUsersMap.values());
  },
  async insert(data: Partial<User>): Promise<User> {
    const uniqueSuffix = crypto.randomBytes(8).toString("hex");
    const id = data.id || `usr_${Date.now()}_${uniqueSuffix}`;
    const now = new Date();
    const rawEmail = data.email || (data.id && data.id.includes("@") ? data.id : "");
    const cleanEmail = (rawEmail || "").trim().toLowerCase();
    const doc = {
      name: "",
      passwordHash: "",
      role: "customer",
      createdAt: now,
      updatedAt: now,
      ...data,
      email: cleanEmail,
      id,
      _id: id,
    } as unknown as User;

    inMemoryUsersMap.set(id, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        await col.insertOne(doc as any);
      } catch (err: any) {
        if (
          err?.code === 11000 ||
          err?.message?.includes("E11000") ||
          err?.message?.includes("duplicate key")
        ) {
          throw err;
        }
        setMongoConnected(false);
        console.warn("[MongoDB Notice] User saved to active session store:", err?.message || err);
      }
    }
    return doc;
  },
  async update(id: string, updateData: Partial<User>, unsetFields?: string[]): Promise<User | null> {
    const setObj: Record<string, any> = { ...updateData, updatedAt: new Date() };
    if (setObj.email) {
      setObj.email = setObj.email.trim().toLowerCase();
    } else if (!setObj.email && id && id.includes("@")) {
      setObj.email = id.trim().toLowerCase();
    }
    
    let existing = await this.findById(id);
    if (!existing && setObj.email) {
      existing = await this.findByEmail(setObj.email);
    }

    if (existing) {
      const targetId = existing.id || id;
      if (!setObj.email && (!existing.email || existing.email === "") && (targetId.includes("@") || id.includes("@"))) {
        setObj.email = (targetId.includes("@") ? targetId : id).trim().toLowerCase();
      }
      const updated = { ...existing, ...setObj };
      if (unsetFields && unsetFields.length > 0) {
        for (const field of unsetFields) {
          delete (updated as any)[field];
        }
      }
      inMemoryUsersMap.set(targetId, updated);
      inMemoryUsersMap.set(id, updated);

      if (isMongoDbConnected()) {
        try {
          const col = getCollection<User>("users");
          const updateDoc: Record<string, any> = { $set: setObj };
          if (unsetFields && unsetFields.length > 0) {
            const unsetObj: Record<string, string> = {};
            for (const f of unsetFields) {
              unsetObj[f] = "";
            }
            updateDoc.$unset = unsetObj;
          }
          await col.updateOne({ $or: [{ id: targetId }, { _id: targetId as any }, { id }, { _id: id as any }] } as Filter<User>, updateDoc);
        } catch {
          setMongoConnected(false);
        }
      }
      return (await this.findById(targetId)) || updated;
    } else {
      // Create user record if not existing yet (e.g., Clerk user first profile edit)
      const doc = await this.insert({
        id,
        name: setObj.name || "",
        email: setObj.email || (id && id.includes("@") ? id : ""),
        passwordHash: "",
        role: "customer",
        ...setObj,
      });
      return doc;
    }
  },
  async findByVerificationTokenHash(tokenHash: string): Promise<User | null> {
    if (!tokenHash || typeof tokenHash !== "string") return null;
    const cleanHash = tokenHash.trim();
    if (!cleanHash) return null;

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        const found = await col.findOne({ emailVerificationTokenHash: cleanHash });
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }

    return Array.from(inMemoryUsersMap.values()).find(
      (u) => (u as any).emailVerificationTokenHash === cleanHash
    ) || null;
  },
  async verifyUserEmail(userId: string): Promise<User | null> {
    return this.update(
      userId,
      {
        isEmailVerified: true,
        emailVerified: true,
      },
      ["emailVerificationTokenHash", "emailVerificationExpires"]
    );
  },
  async delete(id: string): Promise<boolean> {
    inMemoryUsersMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const res = await getCollection<User>("users").deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<User>);
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
        return true;
      }
    }
    return true;
  }
};

// ─── USER SESSIONS ───────────────────────────────────────────────────────────
const inMemorySessionsMap = new Map<string, UserSession>();

export const mongoSessions = {
  async createSession(userId: string): Promise<UserSession> {
    const token = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
    const doc: UserSession = {
      _id: token,
      token,
      userId,
      expiresAt,
      createdAt: now,
    };

    inMemorySessionsMap.set(token, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<UserSession>("user_sessions");
        await col.insertOne(doc as any);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },
  async findByToken(token: string): Promise<{ session: UserSession; user: User } | null> {
    if (!token) return null;
    let session: UserSession | null = null;
    if (isMongoDbConnected()) {
      try {
        const colSessions = getCollection<UserSession>("user_sessions");
        session = await colSessions.findOne({ $or: [{ token }, { _id: token }] });
      } catch {
        setMongoConnected(false);
      }
    }
    if (!session) {
      session = inMemorySessionsMap.get(token) || null;
    }
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      inMemorySessionsMap.delete(token);
      if (isMongoDbConnected()) {
        try {
          const colSessions = getCollection<UserSession>("user_sessions");
          await colSessions.deleteOne({ _id: session._id });
        } catch { /* Ignore */ }
      }
      return null;
    }
    const user = await mongoUsers.findById(session.userId);
    if (!user) return null;
    return { session, user };
  },
  async deleteSession(token: string): Promise<boolean> {
    if (!token) return false;
    inMemorySessionsMap.delete(token);
    if (isMongoDbConnected()) {
      try {
        const colSessions = getCollection<UserSession>("user_sessions");
        const res = await colSessions.deleteOne({ $or: [{ token }, { _id: token }] });
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
        return true;
      }
    }
    return true;
  }
};

// ─── COUPONS ───────────────────────────────────────────────────────────
const inMemoryCouponsMap = new Map<string, any>();

function formatCouponDoc(c: any) {
  if (!c) return null;
  const rawCats = c.eligibleCategories;
  let eligibleCategories: string[] | null = null;
  if (Array.isArray(rawCats)) {
    eligibleCategories = rawCats.map((s: any) => String(s).trim()).filter(Boolean);
    if (eligibleCategories.length === 0) eligibleCategories = null;
  } else if (typeof rawCats === "string" && rawCats.trim()) {
    eligibleCategories = rawCats.split(",").map((s: string) => s.trim()).filter(Boolean);
    if (eligibleCategories.length === 0) eligibleCategories = null;
  }

  return {
    ...c,
    id: c.id || c._id,
    minimumOrderValue: typeof c.minimumOrderValue === "number" ? c.minimumOrderValue : Number(c.minimumOrderValue || 0),
    maxDiscountAmount: c.maxDiscountAmount != null ? Number(c.maxDiscountAmount) : null,
    eligibleCategories,
    firstOrderOnly: Boolean(c.firstOrderOnly),
    perCustomerLimit: c.perCustomerLimit != null ? Number(c.perCustomerLimit) : null,
    startDate: c.startDate ? new Date(c.startDate) : null,
    offerDisplayText: c.offerDisplayText ?? null,
  };
}

export const mongoCoupons = {
  async findMany(filter: any = {}, options: { sort?: Sort; limit?: number; skip?: number } = {}): Promise<any[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("coupons");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        if (list.length > 0) {
          list.forEach(c => inMemoryCouponsMap.set(c.id || c._id, c));
          return list.map(formatCouponDoc);
        }
      } catch {
        setMongoConnected(false);
      }
    }
    let all = Array.from(inMemoryCouponsMap.values());
    if (filter) {
      if (filter.active !== undefined) {
        all = all.filter(c => c.active === filter.active);
      }
      if (filter.code) {
        all = all.filter(c => (c.code || "").toUpperCase() === String(filter.code).toUpperCase());
      }
      if (filter.type) {
        all = all.filter(c => c.type === filter.type);
      }
    }
    all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (options.skip) all = all.slice(options.skip);
    if (options.limit) all = all.slice(0, options.limit);
    return all.map(formatCouponDoc);
  },

  async findById(id: string): Promise<any | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("coupons");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] });
        if (found) {
          const doc = formatCouponDoc(found);
          inMemoryCouponsMap.set(id, doc);
          return doc;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const mem = inMemoryCouponsMap.get(id) || Array.from(inMemoryCouponsMap.values()).find(c => c.id === id || c._id === id) || null;
    return mem ? formatCouponDoc(mem) : null;
  },

  async findByCode(code: string): Promise<any | null> {
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("coupons");
        const found = await col.findOne({ code: cleanCode });
        if (found) {
          const doc = formatCouponDoc(found);
          inMemoryCouponsMap.set(doc.id, doc);
          return doc;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const mem = Array.from(inMemoryCouponsMap.values()).find(c => (c.code || "").toUpperCase() === cleanCode) || null;
    return mem ? formatCouponDoc(mem) : null;
  },

  async insert(data: any): Promise<any> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const cleanOfferText =
      data.offerDisplayText !== undefined && data.offerDisplayText !== null
        ? String(data.offerDisplayText).trim()
        : null;

    let eligibleCategories: string[] | null = null;
    if (Array.isArray(data.eligibleCategories)) {
      const arr = data.eligibleCategories.map((s: any) => String(s).trim()).filter(Boolean);
      eligibleCategories = arr.length > 0 ? arr : null;
    } else if (typeof data.eligibleCategories === "string" && data.eligibleCategories.trim()) {
      const arr = data.eligibleCategories.split(",").map((s: string) => s.trim()).filter(Boolean);
      eligibleCategories = arr.length > 0 ? arr : null;
    }

    const doc = {
      description: "",
      offerDisplayText: cleanOfferText || null,
      active: true,
      usedCount: 0,
      maxUses: null,
      expiresAt: null,
      minimumOrderValue: data.minimumOrderValue ? Math.max(0, Number(data.minimumOrderValue)) : 0,
      maxDiscountAmount: data.maxDiscountAmount ? Math.max(0, Number(data.maxDiscountAmount)) : null,
      eligibleCategories,
      firstOrderOnly: Boolean(data.firstOrderOnly),
      perCustomerLimit: data.perCustomerLimit ? Math.max(1, parseInt(data.perCustomerLimit, 10)) : null,
      startDate: data.startDate ? new Date(data.startDate) : null,
      createdAt: now,
      updatedAt: now,
      ...data,
      id,
      _id: id,
    };
    if (cleanOfferText !== undefined) {
      doc.offerDisplayText = cleanOfferText || null;
    }
    const formatted = formatCouponDoc(doc);
    inMemoryCouponsMap.set(id, formatted);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("coupons");
        await col.insertOne(formatted);
      } catch {
        setMongoConnected(false);
      }
    }
    return formatted;
  },

  async update(id: string, updateData: any): Promise<any | null> {
    const existing = await this.findById(id);
    const sanitizedUpdate = { ...updateData };
    if (sanitizedUpdate.offerDisplayText !== undefined) {
      sanitizedUpdate.offerDisplayText =
        sanitizedUpdate.offerDisplayText !== null
          ? String(sanitizedUpdate.offerDisplayText).trim() || null
          : null;
    }
    if (sanitizedUpdate.minimumOrderValue !== undefined) {
      sanitizedUpdate.minimumOrderValue = Math.max(0, Number(sanitizedUpdate.minimumOrderValue || 0));
    }
    if (sanitizedUpdate.maxDiscountAmount !== undefined) {
      sanitizedUpdate.maxDiscountAmount = sanitizedUpdate.maxDiscountAmount != null ? Math.max(0, Number(sanitizedUpdate.maxDiscountAmount)) : null;
    }
    if (sanitizedUpdate.eligibleCategories !== undefined) {
      if (Array.isArray(sanitizedUpdate.eligibleCategories)) {
        const arr = sanitizedUpdate.eligibleCategories.map((s: any) => String(s).trim()).filter(Boolean);
        sanitizedUpdate.eligibleCategories = arr.length > 0 ? arr : null;
      } else if (typeof sanitizedUpdate.eligibleCategories === "string" && sanitizedUpdate.eligibleCategories.trim()) {
        const arr = sanitizedUpdate.eligibleCategories.split(",").map((s: string) => s.trim()).filter(Boolean);
        sanitizedUpdate.eligibleCategories = arr.length > 0 ? arr : null;
      } else {
        sanitizedUpdate.eligibleCategories = null;
      }
    }
    if (sanitizedUpdate.firstOrderOnly !== undefined) {
      sanitizedUpdate.firstOrderOnly = Boolean(sanitizedUpdate.firstOrderOnly);
    }
    if (sanitizedUpdate.perCustomerLimit !== undefined) {
      sanitizedUpdate.perCustomerLimit = sanitizedUpdate.perCustomerLimit != null ? Math.max(1, parseInt(sanitizedUpdate.perCustomerLimit, 10)) : null;
    }
    if (sanitizedUpdate.startDate !== undefined) {
      sanitizedUpdate.startDate = sanitizedUpdate.startDate ? new Date(sanitizedUpdate.startDate) : null;
    }

    const updated = formatCouponDoc({ ...(existing || {}), ...sanitizedUpdate, updatedAt: new Date(), id, _id: id });
    inMemoryCouponsMap.set(id, updated);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("coupons");
        await col.updateOne({ $or: [{ id }, { _id: id as any }] }, { $set: { ...sanitizedUpdate, updatedAt: new Date() } });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },

  async atomicIncrementUsage(id: string, maxUses: number | null): Promise<boolean> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("coupons");
        const query: any = { $or: [{ id }, { _id: id as any }] };
        if (maxUses !== null && maxUses !== undefined) {
          query.$or = [
            { id, usedCount: { $lt: maxUses } },
            { _id: id as any, usedCount: { $lt: maxUses } },
          ];
        }
        const res = await col.findOneAndUpdate(
          query,
          { $inc: { usedCount: 1 }, $set: { updatedAt: new Date() } },
          { returnDocument: "after" }
        );
        const doc = (res as any)?.value ?? res;
        if (doc) {
          const formatted = formatCouponDoc(doc);
          inMemoryCouponsMap.set(id, formatted);
          return true;
        }
        return false;
      } catch {
        setMongoConnected(false);
      }
    }

    const existing = await this.findById(id);
    if (!existing) return false;
    if (maxUses !== null && existing.usedCount >= maxUses) return false;
    const newUsedCount = (existing.usedCount || 0) + 1;
    const updated = { ...existing, usedCount: newUsedCount, updatedAt: new Date() };
    inMemoryCouponsMap.set(id, updated);
    return true;
  },

  async delete(id: string): Promise<boolean> {
    inMemoryCouponsMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const res = await getCollection("coupons").deleteOne({ $or: [{ id }, { _id: id as any }] });
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  }
};


// ─── SUPPORT TICKETS ───────────────────────────────────────────────────────────
const inMemoryTicketsMap = new Map<string, any>();
const inMemoryMessagesMap = new Map<string, any>();

export const mongoSupport = {
  async findTickets(filter: any = {}, options: { sort?: Sort; limit?: number; skip?: number } = {}): Promise<any[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("support_tickets");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        return list.map(t => ({ ...t, id: t.id || String(t._id) }));
      } catch {
        setMongoConnected(false);
      }
    }
    let all = Array.from(inMemoryTicketsMap.values());
    if (filter) {
      if (filter.userId) {
        if (typeof filter.userId === "string") all = all.filter(t => t.userId === filter.userId);
        else if (filter.userId.$in && Array.isArray(filter.userId.$in)) all = all.filter(t => filter.userId.$in.includes(t.userId));
      }
      if (filter.vendorId) {
        if (filter.vendorId.$ne !== undefined) all = all.filter(t => t.vendorId != null);
        else if (filter.vendorId.$in && Array.isArray(filter.vendorId.$in)) all = all.filter(t => filter.vendorId.$in.includes(t.vendorId));
        else all = all.filter(t => t.vendorId === filter.vendorId);
      }
      if (filter.userType) {
        if (typeof filter.userType === "string") all = all.filter(t => t.userType === filter.userType);
        else if (filter.userType.$ne !== undefined) all = all.filter(t => t.userType !== filter.userType.$ne);
        else if (filter.userType.$in && Array.isArray(filter.userType.$in)) all = all.filter(t => filter.userType.$in.includes(t.userType));
      }
      if (filter.status) {
        if (typeof filter.status === "string") all = all.filter(t => t.status === filter.status);
        else if (filter.status.$in) all = all.filter(t => filter.status.$in.includes(t.status));
      }
      if (filter.priority) all = all.filter(t => t.priority === filter.priority);
      if (filter.escalated !== undefined) all = all.filter(t => t.escalated === filter.escalated);
      if (filter.assignedTo) all = all.filter(t => t.assignedTo === filter.assignedTo);
      if (filter.subject && filter.subject.$regex) {
        const re = new RegExp(filter.subject.$regex, filter.subject.$options || "i");
        all = all.filter(t => re.test(t.subject || ""));
      }
      if (filter.$or && Array.isArray(filter.$or)) {
        all = all.filter(t => {
          return filter.$or.some((sub: any) => {
            for (const [k, v] of Object.entries(sub)) {
              if (k === "userType") {
                if (typeof v === "string" && t.userType !== v) return false;
                if (v && typeof v === "object" && (v as any).$ne && t.userType === (v as any).$ne) return false;
              }
              if (k === "escalated" && t.escalated !== v) return false;
              if (k === "assignedTo" && t.assignedTo !== v) return false;
              if (k === "vendorId") {
                if (v && typeof v === "object" && (v as any).$in) {
                  if (!(v as any).$in.includes(t.vendorId)) return false;
                } else if (t.vendorId !== v) return false;
              }
            }
            return true;
          });
        });
      }
    }
    all.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime());
    if (options.skip) all = all.slice(options.skip);
    if (options.limit) all = all.slice(0, options.limit);
    return all;
  },

  async findTicketById(id: string): Promise<any | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("support_tickets");
        const orList: any[] = [{ id }, { _id: id as any }];
        if (typeof id === "string" && ObjectId.isValid(id)) {
          orList.push({ _id: new ObjectId(id) as any });
        }
        const found = await col.findOne({ $or: orList });
        if (found) return { ...found, id: found.id || String(found._id) };
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryTicketsMap.get(id) || null;
  },

  async countTickets(filter: any = {}): Promise<number> {
    if (isMongoDbConnected()) {
      try {
        return await getCollection("support_tickets").countDocuments(filter);
      } catch {
        setMongoConnected(false);
      }
    }
    const all = await this.findTickets(filter);
    return all.length;
  },

  async insertTicket(data: any): Promise<any> {
    const id = data.id || `TCK_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();
    const doc = {
      category: "General",
      status: "Open",
      priority: "Normal",
      assignedTo: "admin",
      escalated: false,
      isDispute: false,
      disputeStatus: "none",
      createdAt: now,
      updatedAt: now,
      ...data,
      id,
      _id: id,
    };
    inMemoryTicketsMap.set(id, doc);
    if (isMongoDbConnected()) {
      try {
        await getCollection("support_tickets").insertOne(doc);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async updateTicket(id: string, updateData: any): Promise<any | null> {
    if (!id) return null;
    const existing = await this.findTicketById(id);
    const updated = { ...(existing || {}), ...updateData, updatedAt: new Date(), id: existing?.id || id, _id: existing?._id || id };
    inMemoryTicketsMap.set(id, updated);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("support_tickets");
        const orList: any[] = [{ id }, { _id: id as any }];
        if (typeof id === "string" && ObjectId.isValid(id)) {
          orList.push({ _id: new ObjectId(id) as any });
        }
        await col.updateOne({ $or: orList }, { $set: { ...updateData, updatedAt: new Date() } });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },

  async findMessages(ticketId: string): Promise<any[]> {
    if (!ticketId) return [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("ticket_messages");
        const orList: any[] = [{ ticketId }];
        if (typeof ticketId === "string" && ObjectId.isValid(ticketId)) {
          orList.push({ ticketId: new ObjectId(ticketId) as any });
        }
        const list = await col.find({ $or: orList }).sort({ createdAt: 1 }).toArray();
        if (list.length > 0) {
          return list.map(m => ({ ...m, id: m.id || String(m._id) }));
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const memList = Array.from(inMemoryMessagesMap.values()).filter(m => m.ticketId === ticketId);
    return memList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  },

  async insertMessage(data: any): Promise<any> {
    const id = data.id || `MSG_${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const now = new Date();
    const doc = {
      isStaff: false,
      internal: false,
      attachments: [],
      createdAt: now,
      ...data,
      id,
      _id: id,
    };
    inMemoryMessagesMap.set(id, doc);
    if (isMongoDbConnected()) {
      try {
        await getCollection("ticket_messages").insertOne(doc);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async markMessagesRead(ticketId: string, msgIds?: string[]): Promise<void> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("ticket_messages");
        const filter: any = { ticketId };
        if (msgIds && msgIds.length > 0) {
          filter.$or = [{ id: { $in: msgIds } }, { _id: { $in: msgIds as any } }];
        }
        await col.updateMany(filter, { $set: { readAt: new Date() } });
      } catch {
        setMongoConnected(false);
      }
    }
    for (const msg of inMemoryMessagesMap.values()) {
      if (msg.ticketId === ticketId && (!msgIds || msgIds.includes(msg.id))) {
        msg.readAt = new Date();
      }
    }
  },

  async findTicketMessages(ticketId: string): Promise<any[]> {
    return this.findMessages(ticketId);
  },

  async insertTicketMessage(data: any): Promise<any> {
    return this.insertMessage(data);
  },

  async getStats(): Promise<any | null> {
    if (isMongoDbConnected()) {
      try {
        const total = await this.countTickets({});
        const open = await this.countTickets({ status: "Open" });
        const inProgress = await this.countTickets({ status: "In Progress" });
        const resolved = await this.countTickets({ status: "Resolved" });
        const closed = await this.countTickets({ status: "Closed" });
        const escalated = await this.countTickets({ escalated: true });
        const customerRouted = await this.countTickets({ userType: "customer", escalated: false });
        const sellerRouted = await this.countTickets({ vendorId: { $ne: null } });
        return { total, open, inProgress, resolved, closed, escalated, customerRouted, sellerRouted };
      } catch {
        setMongoConnected(false);
      }
    }
    const all = Array.from(inMemoryTicketsMap.values());
    const total = all.length;
    const open = all.filter(t => t.status === "Open").length;
    const inProgress = all.filter(t => t.status === "In Progress").length;
    const resolved = all.filter(t => t.status === "Resolved").length;
    const closed = all.filter(t => t.status === "Closed").length;
    const escalated = all.filter(t => t.escalated).length;
    const customerRouted = all.filter(t => t.userType === "customer" && !t.escalated).length;
    const sellerRouted = all.filter(t => t.vendorId != null).length;
    return { total, open, inProgress, resolved, closed, escalated, customerRouted, sellerRouted };
  }
};

// ─── NOTIFICATIONS ───────────────────────────────────────────────────────────
export const inMemoryNotificationsMap = new Map<string, any>();

function buildNotificationIdQuery(id: string) {
  const orConditions: any[] = [{ id }, { _id: id as any }];
  if (typeof id === "string" && ObjectId.isValid(id) && id.length === 24) {
    try {
      orConditions.push({ _id: new ObjectId(id) });
    } catch {}
  }
  return { $or: orConditions };
}

export const mongoNotifications = {
  inMemoryNotificationsMap,
  clearInMemory() {
    inMemoryNotificationsMap.clear();
  },
  async findMany(filter: any = {}, options: { sort?: Sort; limit?: number; skip?: number; offset?: number } = {}): Promise<any[]> {
    const skip = options.skip ?? options.offset ?? 0;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("notifications");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (skip > 0) cursor = cursor.skip(skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        return list.map(n => ({ ...n, id: n.id || String(n._id) }));
      } catch {
        setMongoConnected(false);
      }
    }
    let all = Array.from(inMemoryNotificationsMap.values());
    if (filter) {
      if (filter.vendorId !== undefined) {
        if (filter.vendorId === null) {
          all = all.filter(n => n.vendorId == null);
        } else {
          all = all.filter(n => n.vendorId === filter.vendorId);
        }
      }
      if (filter.userId) {
        all = all.filter(n => n.userId === filter.userId);
      }
      if (filter.read !== undefined) {
        all = all.filter(n => (n.read ?? n.isRead) === filter.read);
      }
      if (filter.isRead !== undefined) {
        all = all.filter(n => (n.isRead ?? n.read) === filter.isRead);
      }
      if (filter.$or && Array.isArray(filter.$or)) {
        all = all.filter(n => {
          return filter.$or.some((sub: any) => {
            if (sub.isRead !== undefined && (n.isRead ?? n.read) === sub.isRead) return true;
            if (sub.read !== undefined && (n.read ?? n.isRead) === sub.read) return true;
            if (sub.vendorId === null && n.vendorId == null) return true;
            if (sub.title && sub.title.$regex && new RegExp(sub.title.$regex, sub.title.$options || "i").test(n.title || "")) return true;
            if (sub.body && sub.body.$regex && new RegExp(sub.body.$regex, sub.body.$options || "i").test(n.body || "")) return true;
            return false;
          });
        });
      }
      if (filter.type) {
        if (typeof filter.type === "string") {
          all = all.filter(n => n.type === filter.type);
        } else if (filter.type.$in) {
          all = all.filter(n => filter.type.$in.includes(n.type));
        }
      }
      if (filter.createdAt) {
        if (filter.createdAt.$gte) {
          const gteTime = new Date(filter.createdAt.$gte).getTime();
          all = all.filter(n => new Date(n.createdAt || 0).getTime() >= gteTime);
        }
        if (filter.createdAt.$lte) {
          const lteTime = new Date(filter.createdAt.$lte).getTime();
          all = all.filter(n => new Date(n.createdAt || 0).getTime() <= lteTime);
        }
      }
    }
    all.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    if (skip > 0) all = all.slice(skip);
    if (options.limit) all = all.slice(0, options.limit);
    return all;
  },

  async findById(id: string): Promise<any | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("notifications");
        const found = await col.findOne(buildNotificationIdQuery(id));
        if (found) return { ...found, id: found.id || String(found._id) };
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryNotificationsMap.get(id) || Array.from(inMemoryNotificationsMap.values()).find(n => n.id === id || String(n._id) === id) || null;
  },

  async count(filter: any = {}): Promise<number> {
    if (isMongoDbConnected()) {
      try {
        return await getCollection("notifications").countDocuments(filter);
      } catch {
        setMongoConnected(false);
      }
    }
    const all = await this.findMany(filter);
    return all.length;
  },

  async create(data: any): Promise<any> {
    return this.insert(data);
  },

  async insert(data: any): Promise<any> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const doc = {
      read: false,
      isRead: false,
      createdAt: now,
      ...data,
      id,
      _id: id,
    };
    inMemoryNotificationsMap.set(id, doc);
    if (isMongoDbConnected()) {
      try {
        await getCollection("notifications").insertOne(doc);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: any): Promise<any | null> {
    const existing = inMemoryNotificationsMap.get(id) || Array.from(inMemoryNotificationsMap.values()).find(n => n.id === id || String(n._id) === id);
    if (existing) {
      Object.assign(existing, updateData);
    }
    if (isMongoDbConnected()) {
      try {
        await getCollection("notifications").updateOne(buildNotificationIdQuery(id), { $set: updateData });
      } catch {
        setMongoConnected(false);
      }
    }
    return existing ? { ...existing, ...updateData } : { id, ...updateData };
  },

  async markAllRead(userId: string, filterOptions?: { vendorId?: string | null }): Promise<boolean> {
    for (const n of inMemoryNotificationsMap.values()) {
      const matchUser = n.userId === userId || n.vendorId === userId;
      let matchVendor = true;
      if (filterOptions?.vendorId === null) {
        matchVendor = n.vendorId == null;
      } else if (filterOptions?.vendorId) {
        matchVendor = n.vendorId === filterOptions.vendorId;
      }
      if (matchUser && matchVendor) {
        n.read = true;
        n.isRead = true;
      }
    }
    if (isMongoDbConnected()) {
      try {
        const mongoFilter: any = {
          $or: [{ userId }, { vendorId: userId }],
        };
        if (filterOptions?.vendorId === null) {
          mongoFilter.vendorId = null;
        } else if (filterOptions?.vendorId) {
          mongoFilter.vendorId = filterOptions.vendorId;
        }
        await getCollection("notifications").updateMany(
          mongoFilter,
          { $set: { read: true, isRead: true } }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  },

  async delete(id: string): Promise<boolean> {
    inMemoryNotificationsMap.delete(id);
    for (const [key, n] of Array.from(inMemoryNotificationsMap.entries())) {
      if (n.id === id || String(n._id) === id) {
        inMemoryNotificationsMap.delete(key);
      }
    }
    if (isMongoDbConnected()) {
      try {
        await getCollection("notifications").deleteOne(buildNotificationIdQuery(id));
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  },

  async deleteMany(filter: any = {}): Promise<number> {
    let deletedCount = 0;
    for (const [key, n] of Array.from(inMemoryNotificationsMap.entries())) {
      let matches = true;
      if (filter.userId && n.userId !== filter.userId) matches = false;
      if (filter.vendorId !== undefined) {
        if (filter.vendorId === null && n.vendorId != null) matches = false;
        else if (filter.vendorId !== null && n.vendorId !== filter.vendorId) matches = false;
      }
      if (matches) {
        inMemoryNotificationsMap.delete(key);
        deletedCount++;
      }
    }
    if (isMongoDbConnected()) {
      try {
        const res = await getCollection("notifications").deleteMany(filter);
        return res.deletedCount ?? deletedCount;
      } catch {
        setMongoConnected(false);
      }
    }
    return deletedCount;
  },

  // Compatibility aliases
  async findNotifications(filter: any = {}, options: any = {}): Promise<any[]> {
    return this.findMany(filter, options);
  },
  async countNotifications(filter: any = {}): Promise<number> {
    return this.count(filter);
  },
  async updateNotification(id: string, updateData: any): Promise<any | null> {
    return this.update(id, updateData);
  },
  async deleteNotification(id: string): Promise<boolean> {
    return this.delete(id);
  },
  async clearAll(filter: any = {}): Promise<number> {
    return this.deleteMany(filter);
  },
};

// ─── NOTIFICATION PREFERENCES ────────────────────────────────────────────────
export interface MongoNotificationPreferencesDoc {
  userId: string;
  orderUpdates: boolean;
  offerAlerts: boolean;
  emailOrderUpdates: boolean;
  emailMarketingUpdates: boolean;
  emailOfferUpdates: boolean;
  updatedAt?: Date;
  createdAt?: Date;
}

export const inMemoryNotificationPreferencesMap = new Map<string, MongoNotificationPreferencesDoc>();

export const DEFAULT_MONGO_NOTIFICATION_PREFERENCES = {
  orderUpdates: true,
  offerAlerts: true,
  emailOrderUpdates: true,
  emailMarketingUpdates: true,
  emailOfferUpdates: true,
};

export const mongoNotificationPreferences = {
  inMemoryNotificationPreferencesMap,
  clearInMemory() {
    inMemoryNotificationPreferencesMap.clear();
  },
  async findByUserId(userId: string): Promise<MongoNotificationPreferencesDoc> {
    if (!userId) {
      return { userId: "", ...DEFAULT_MONGO_NOTIFICATION_PREFERENCES };
    }
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<any>("notification_preferences");
        const doc = await col.findOne({ userId });
        if (doc) {
          return {
            userId,
            orderUpdates: typeof doc.orderUpdates === "boolean" ? doc.orderUpdates : true,
            offerAlerts: typeof doc.offerAlerts === "boolean" ? doc.offerAlerts : true,
            emailOrderUpdates: typeof doc.emailOrderUpdates === "boolean" ? doc.emailOrderUpdates : true,
            emailMarketingUpdates: typeof doc.emailMarketingUpdates === "boolean" ? doc.emailMarketingUpdates : true,
            emailOfferUpdates: typeof doc.emailOfferUpdates === "boolean" ? doc.emailOfferUpdates : true,
            updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : undefined,
            createdAt: doc.createdAt ? new Date(doc.createdAt) : undefined,
          };
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const mem = inMemoryNotificationPreferencesMap.get(userId);
    if (mem) {
      return {
        userId,
        orderUpdates: typeof mem.orderUpdates === "boolean" ? mem.orderUpdates : true,
        offerAlerts: typeof mem.offerAlerts === "boolean" ? mem.offerAlerts : true,
        emailOrderUpdates: typeof mem.emailOrderUpdates === "boolean" ? mem.emailOrderUpdates : true,
        emailMarketingUpdates: typeof mem.emailMarketingUpdates === "boolean" ? mem.emailMarketingUpdates : true,
        emailOfferUpdates: typeof mem.emailOfferUpdates === "boolean" ? mem.emailOfferUpdates : true,
        updatedAt: mem.updatedAt,
        createdAt: mem.createdAt,
      };
    }
    return {
      userId,
      ...DEFAULT_MONGO_NOTIFICATION_PREFERENCES,
    };
  },

  async upsert(userId: string, updates: Partial<Omit<MongoNotificationPreferencesDoc, "userId">>): Promise<MongoNotificationPreferencesDoc> {
    const existing = await this.findByUserId(userId);
    const validUpdates: Partial<MongoNotificationPreferencesDoc> = {};

    if (typeof updates.orderUpdates === "boolean") validUpdates.orderUpdates = updates.orderUpdates;
    if (typeof updates.offerAlerts === "boolean") validUpdates.offerAlerts = updates.offerAlerts;
    if (typeof updates.emailOrderUpdates === "boolean") validUpdates.emailOrderUpdates = updates.emailOrderUpdates;
    if (typeof updates.emailMarketingUpdates === "boolean") validUpdates.emailMarketingUpdates = updates.emailMarketingUpdates;
    if (typeof updates.emailOfferUpdates === "boolean") validUpdates.emailOfferUpdates = updates.emailOfferUpdates;

    const merged: MongoNotificationPreferencesDoc = {
      ...existing,
      ...validUpdates,
      userId,
      updatedAt: new Date(),
      createdAt: existing.createdAt || new Date(),
    };

    inMemoryNotificationPreferencesMap.set(userId, merged);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<any>("notification_preferences");
        await col.updateOne(
          { userId },
          {
            $set: {
              ...validUpdates,
              updatedAt: merged.updatedAt,
            },
            $setOnInsert: {
              userId,
              orderUpdates: merged.orderUpdates,
              offerAlerts: merged.offerAlerts,
              emailOrderUpdates: merged.emailOrderUpdates,
              emailMarketingUpdates: merged.emailMarketingUpdates,
              emailOfferUpdates: merged.emailOfferUpdates,
              createdAt: merged.createdAt,
            },
            $unset: {
              stockAlerts: "",
              emailStockAlerts: "",
            },
          },
          { upsert: true }
        );
      } catch {
        setMongoConnected(false);
      }
    }

    return merged;
  },
};

// ─── AUDIT LOGS ──────────────────────────────────────────────────────────────
export const mongoAuditLogs = {
  async findMany(filter: any = {}, options: { sort?: Sort; limit?: number; skip?: number; offset?: number } = {}): Promise<any[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("admin_audit_logs");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        const skip = options.skip ?? options.offset ?? 0;
        if (skip) cursor = cursor.skip(skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        return list.map(l => ({ ...l, id: l.id || l._id }));
      } catch {
        setMongoConnected(false);
      }
    }
    return [];
  },

  async count(filter: any = {}): Promise<number> {
    if (isMongoDbConnected()) {
      try {
        return await getCollection("admin_audit_logs").countDocuments(filter);
      } catch {
        setMongoConnected(false);
      }
    }
    return 0;
  },

  async insert(data: any): Promise<any> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const doc = {
      createdAt: now,
      ...data,
      id,
      _id: id,
    };
    if (isMongoDbConnected()) {
      try {
        await getCollection("admin_audit_logs").insertOne(doc);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  }
};

// ─── COMMISSION RULES & SETTLEMENTS ──────────────────────────────────────────
export const mongoCommission = {
  async findRules(): Promise<any[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("commission_rules");
        const list = await col.find({}).sort({ createdAt: -1 }).toArray();
        return list.map(r => ({ ...r, id: r.id || r._id }));
      } catch {
        setMongoConnected(false);
      }
    }
    return [];
  },

  async insertRule(data: any): Promise<any> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const doc = {
      active: true,
      createdAt: now,
      updatedAt: now,
      ...data,
      id,
      _id: id,
    };
    if (isMongoDbConnected()) {
      try {
        await getCollection("commission_rules").insertOne(doc);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async updateRule(id: string, updateData: any): Promise<any> {
    if (isMongoDbConnected()) {
      try {
        await getCollection("commission_rules").updateOne({ $or: [{ id }, { _id: id as any }] }, { $set: { ...updateData, updatedAt: new Date() } });
      } catch {
        setMongoConnected(false);
      }
    }
    return { id, ...updateData };
  }
};

export const mongoSettlements = {
  async findMany(filter: any = {}, options: { sort?: Sort } = {}): Promise<any[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("vendor_settlements");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        const list = await cursor.toArray();
        return list.map(s => ({ ...s, id: s.id || s._id }));
      } catch {
        setMongoConnected(false);
      }
    }
    return [];
  },

  async findById(id: string): Promise<any | null> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection("vendor_settlements");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] });
        return found ? { ...found, id: found.id || found._id } : null;
      } catch {
        setMongoConnected(false);
      }
    }
    return null;
  },

  async insert(data: any): Promise<any> {
    const id = data.id || crypto.randomUUID();
    const now = new Date();
    const doc = {
      status: "pending",
      createdAt: now,
      ...data,
      id,
      _id: id,
    };
    if (isMongoDbConnected()) {
      try {
        await getCollection("vendor_settlements").insertOne(doc);
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: any): Promise<any | null> {
    const existing = await this.findById(id);
    const updated = { ...(existing || {}), ...updateData, id, _id: id };
    if (isMongoDbConnected()) {
      try {
        await getCollection("vendor_settlements").updateOne({ $or: [{ id }, { _id: id as any }] }, { $set: updateData });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  }
};

// ─── CLOUDFLARE R2 ASSETS METADATA ──────────────────────────────────────────
export interface R2AssetRecord {
  id: string;
  _id?: string;
  objectKey: string;
  bucket: string;
  publicUrl: string;
  sellerId: string;
  productId?: string;
  assetType: "product_image" | "kyc_pan" | "kyc_gst" | "kyc_bank" | "store_avatar" | "store_banner" | "store_logo" | string;
  fileName: string;
  contentType: string;
  size: number;
  status: "presigned_generated" | "uploaded" | "verified" | "deleted";
  contentHash?: string;
  bufferBase64?: string;
  uploadedAt: Date | string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

const inMemoryR2AssetsMap = new Map<string, R2AssetRecord>();

export const mongoR2Assets = {
  async saveAsset(data: Partial<R2AssetRecord> & { objectKey: string; sellerId: string }): Promise<R2AssetRecord> {
    const id = data.id || (data as any)._id || crypto.randomUUID();
    const now = new Date();
    const doc: R2AssetRecord = {
      id,
      _id: id,
      objectKey: data.objectKey,
      bucket: data.bucket || "vashtraa-public",
      publicUrl: data.publicUrl || "",
      sellerId: data.sellerId,
      productId: data.productId || undefined,
      assetType: data.assetType || "product_image",
      fileName: data.fileName || "",
      contentType: data.contentType || "image/webp",
      size: data.size || 0,
      status: data.status || "presigned_generated",
      contentHash: data.contentHash || undefined,
      bufferBase64: data.bufferBase64 || (data as any).bufferBase64 || undefined,
      uploadedAt: data.uploadedAt || now,
      createdAt: data.createdAt || now,
      updatedAt: now,
    };

    inMemoryR2AssetsMap.set(doc.objectKey, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<R2AssetRecord>("r2_assets");
        await col.updateOne(
          { objectKey: doc.objectKey },
          { $set: doc },
          { upsert: true }
        );
      } catch (err) {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async findByContentHash(contentHash: string, sellerId: string): Promise<R2AssetRecord | null> {
    if (!contentHash || !sellerId) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<R2AssetRecord>("r2_assets");
        const found = await col.findOne({ contentHash, sellerId });
        if (found) return found;
      } catch {}
    }
    for (const asset of inMemoryR2AssetsMap.values()) {
      if ((asset as any).contentHash === contentHash && asset.sellerId === sellerId) {
        return asset;
      }
    }
    return null;
  },

  async findByObjectKey(objectKey: string): Promise<R2AssetRecord | null> {
    if (!objectKey) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<R2AssetRecord>("r2_assets");
        const found = await col.findOne({ objectKey });
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryR2AssetsMap.get(objectKey) || null;
  },

  async findByKey(objectKey: string): Promise<R2AssetRecord | null> {
    return this.findByObjectKey(objectKey);
  },

  async findBySellerId(sellerId: string, assetType?: string): Promise<R2AssetRecord[]> {
    if (!sellerId) return [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<R2AssetRecord>("r2_assets");
        const filter: any = { sellerId };
        if (assetType) filter.assetType = assetType;
        return await col.find(filter).toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryR2AssetsMap.values()).filter(
      (a) => a.sellerId === sellerId && (!assetType || a.assetType === assetType)
    );
  },

  async findByProductId(productId: string): Promise<R2AssetRecord[]> {
    if (!productId) return [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<R2AssetRecord>("r2_assets");
        return await col.find({ productId }).toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryR2AssetsMap.values()).filter((a) => a.productId === productId);
  },

  async markDeleted(objectKey: string): Promise<boolean> {
    if (!objectKey) return false;
    const existing = await this.findByObjectKey(objectKey);
    if (existing) {
      existing.status = "deleted";
      existing.updatedAt = new Date();
      inMemoryR2AssetsMap.set(objectKey, existing);
    }
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<R2AssetRecord>("r2_assets");
        await col.updateOne({ objectKey }, { $set: { status: "deleted", updatedAt: new Date() } });
        return true;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  }
};

// ─── PRODUCT CATEGORIES ───────────────────────────────────────────────────────
// ─── PRODUCT CATEGORIES ───────────────────────────────────────────────────────
export interface ProductCategoryDoc {
  id: string;
  name: string;
  slug: string;
  route?: string | null;
  parentId?: string | null;
  parentCategory?: string | null;
  type?: string;
  createdBy?: string;
  sellerId?: string | null;
  sellerName?: string | null;
  coverImage?: string | null;
  bannerImage?: string | null;
  imageUpdatedAt?: Date | string | null;
  imageVersion?: number | string | null;
  description?: string | null;
  displayOrder?: number;
  subcategoriesCount?: number;
  subtypesCount?: number;
  status?: "pending" | "approved" | "rejected" | string;
  active: boolean;
  productCount?: number;
  subcategories?: any[];
  createdAt: Date;
  updatedAt?: Date;
}

export const CATALOG_DEFAULT_CATEGORIES: ProductCategoryDoc[] = CATALOG_CATEGORIES.flatMap((cat) => {
  const mainDoc: ProductCategoryDoc = {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    type: "main",
    createdBy: "system",
    status: "approved",
    parentId: null,
    active: true,
    displayOrder: cat.displayOrder,
    description: cat.description,
    coverImage: cat.coverImage || null,
    bannerImage: cat.bannerImage || null,
    subcategoriesCount: cat.subcategories.length,
    subtypesCount: cat.subcategories.reduce((acc, s) => acc + s.subtypes.length, 0),
    subcategories: cat.subcategories,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const specialSubcatIds = new Set([
    "cat-bridal-default", "bridal",
    "cat-wedding-paithani-main", "wedding-paithani-main",
    "cat-western-paithani-main", "western-paithani-main",
    "cat-bollywood-default", "bollywood",
    "cat-contemporary-silk-main", "contemporary-silk-main",
    "cat-party-default", "party"
  ]);

  const subDocs: ProductCategoryDoc[] = cat.subcategories.map((sub, idx) => {
    const slug = sub.slug;
    return {
      id: sub.id,
      name: sub.name,
      slug,
      route: (sub as any).route || null,
      type: "subcategory",
      createdBy: "system",
      status: "approved",
      parentId: cat.id,
      parentCategory: cat.slug,
      group: (sub as any).group || null,
      active: true,
      displayOrder: idx + 1,
      description: `${sub.name} under ${cat.name}`,
      subtypesCount: sub.subtypes.length,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    };
  });

  return [mainDoc, ...subDocs];
});

export const PRESERVED_DEFAULT_SAREE_CATEGORIES: ProductCategoryDoc[] = PRESERVED_SAREE_CATEGORIES.flatMap((cat) => {
  const mainDoc: ProductCategoryDoc = {
    id: cat.id,
    name: cat.name,
    slug: cat.slug,
    type: "main",
    createdBy: "system",
    status: "approved",
    parentId: null,
    active: true,
    displayOrder: cat.displayOrder,
    description: cat.description,
    coverImage: cat.coverImage || null,
    bannerImage: cat.bannerImage || null,
    subcategoriesCount: cat.subcategories.length,
    subtypesCount: cat.subcategories.reduce((acc, s) => acc + s.subtypes.length, 0),
    subcategories: cat.subcategories,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  };

  const subDocs: ProductCategoryDoc[] = cat.subcategories.map((sub, idx) => ({
    id: sub.id,
    name: sub.name,
    slug: sub.slug,
    route: (sub as any).route || null,
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: cat.id,
    active: true,
    displayOrder: idx + 1,
    description: `${sub.name} under ${cat.name}`,
    subtypesCount: sub.subtypes.length,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }));

  return [mainDoc, ...subDocs];
});

const DEFAULT_CATEGORIES: ProductCategoryDoc[] = [
  // 6 Authoritative Catalog Categories and Subcategories
  ...CATALOG_DEFAULT_CATEGORIES,
  // Preserved Saree Categories for legacy integrity
  ...PRESERVED_DEFAULT_SAREE_CATEGORIES,
  {
    id: "cat-festival-paithani",
    name: "Festival Paithani",
    slug: "festival-paithani",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-wedding-paithani",
    name: "Wedding Paithani",
    slug: "wedding-paithani",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-contemporary-silk-paithani",
    name: "Contemporary Silk",
    slug: "contemporary-silk-paithani",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-bollywood-sarees",
    name: "Bollywood Sarees",
    slug: "bollywood-sarees",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-wedding-designer-sarees",
    name: "Wedding Designer Sarees",
    slug: "wedding-designer-sarees",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-designer-bridal",
    name: "Bridal",
    slug: "designer-bridal",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const _UNUSED_LEGACY_CATEGORIES: ProductCategoryDoc[] = [
  {
    id: "cat-indian-wear",
    name: "Indian Wear",
    slug: "indian-wear",
    type: "main",
    createdBy: "system",
    status: "approved",
    parentId: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-paithani-sarees",
    name: "Paithani Sarees",
    slug: "paithani-sarees",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-indian-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-festival-paithani",
    name: "Festival Paithani",
    slug: "festival-paithani",
    type: "childCategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-sarees",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-wedding-paithani",
    name: "Wedding Paithani",
    slug: "wedding-paithani",
    type: "childCategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-sarees",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-designer-sarees",
    name: "Designer Sarees",
    slug: "designer-sarees",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-indian-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-bollywood-sarees",
    name: "Bollywood Sarees",
    slug: "bollywood-sarees",
    type: "childCategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-sarees",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-contemporary-silk",
    name: "Contemporary Silk",
    slug: "contemporary-silk",
    type: "childCategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-sarees",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-fashion-wear",
    name: "Fashion Wear",
    slug: "fashion-wear",
    type: "main",
    createdBy: "system",
    status: "approved",
    parentId: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#kurtas-suits]",
    name: "Kurtas & Suits",
    slug: "kurtas-suits",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#kurtis-tunics-tops]",
    name: "Kurtis, Tunics & Tops",
    slug: "kurtis-tunics-tops",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#ethnic-wear]",
    name: "Ethnic Wear",
    slug: "ethnic-wear",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#leggings-salwars-churidars]",
    name: "Leggings, Salwars & Churidars",
    slug: "leggings-salwars-churidars",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#skirts-palazzos]",
    name: "Skirts & Palazzos",
    slug: "skirts-palazzos",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#dress-materials]",
    name: "Dress Materials",
    slug: "dress-materials",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#lehenga-cholis]",
    name: "Lehenga Cholis",
    slug: "lehenga-cholis",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#dupattas-shawls]",
    name: "Dupattas & Shawls",
    slug: "dupattas-shawls",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#jackets]",
    name: "Jackets",
    slug: "jackets",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-fashion-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-western-wear",
    name: "Western Wear",
    slug: "western-wear",
    type: "main",
    createdBy: "system",
    status: "approved",
    parentId: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#dresses]",
    name: "Dresses",
    slug: "dresses",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#tops]",
    name: "Tops",
    slug: "tops",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#t-shirts]",
    name: "T-Shirts",
    slug: "t-shirts",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#jeans]",
    name: "Jeans",
    slug: "jeans",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#trousers-capris]",
    name: "Trousers & Capris",
    slug: "trousers-capris",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#shorts-skirts]",
    name: "Shorts & Skirts",
    slug: "shorts-skirts",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#co-ords]",
    name: "Co-ords",
    slug: "co-ords",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#playsuits]",
    name: "Playsuits",
    slug: "playsuits",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#jumpsuits]",
    name: "Jumpsuits",
    slug: "jumpsuits",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#shrugs]",
    name: "Shrugs",
    slug: "shrugs",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#sweaters-sweatshirts]",
    name: "Sweaters & Sweatshirts",
    slug: "sweaters-sweatshirts",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#jackets-coats]",
    name: "Jackets & Coats",
    slug: "jackets-coats",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-[#blazers-waistcoats]",
    name: "Blazers & Waistcoats",
    slug: "blazers-waistcoats",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-western-wear",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  // 12 Authoritative Catalog Categories and Subcategories
  ...CATALOG_DEFAULT_CATEGORIES,

  // Legacy subcategory aliases for backwards compatibility
  {
    id: "cat-festival-paithani",
    name: "Festival Paithani",
    slug: "festival-paithani",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-wedding-paithani",
    name: "Wedding Paithani",
    slug: "wedding-paithani",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-contemporary-silk-paithani",
    name: "Contemporary Silk",
    slug: "contemporary-silk-paithani",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-paithani-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-bollywood-sarees",
    name: "Bollywood Sarees",
    slug: "bollywood-sarees",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-wedding-designer-sarees",
    name: "Wedding Designer Sarees",
    slug: "wedding-designer-sarees",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
  {
    id: "cat-designer-bridal",
    name: "Bridal",
    slug: "designer-bridal",
    type: "subcategory",
    createdBy: "system",
    status: "approved",
    parentId: "cat-designer-default",
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  },
];

const inMemoryCategoriesMap = new Map<string, ProductCategoryDoc>(
  DEFAULT_CATEGORIES.map((c) => [c.slug, c])
);

export function slugifyCategoryName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

const subcategorySlugsToParent: Record<string, string> = {
  "bollywood": "cat-designer-default",
  "contemporary-silk-main": "cat-designer-default",
  "party": "cat-designer-default",
  "bridal": "cat-paithani-default",
  "wedding-paithani-main": "cat-paithani-default",
  "western-paithani-main": "cat-paithani-default",
};

for (const cat of CATALOG_CATEGORIES) {
  for (const sub of cat.subcategories) {
    if (!subcategorySlugsToParent[sub.slug]) {
      subcategorySlugsToParent[sub.slug] = cat.id;
    }
  }
}

export const mongoProductCategories = {
  async seedDefaults(): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      if (!inMemoryCategoriesMap.has(cat.slug)) {
        inMemoryCategoriesMap.set(cat.slug, cat);
      }
      if (isMongoDbConnected()) {
        try {
          const col = getCollection<ProductCategoryDoc>("product_categories");
          const existing = await col.findOne({ $or: [{ id: cat.id }, { slug: cat.slug }] });
          if (!existing) {
            await col.insertOne(cat);
          } else if (cat.type === "main") {
            const updates: Partial<ProductCategoryDoc> = {
              name: cat.name,
              displayOrder: cat.displayOrder ?? existing.displayOrder,
              description: cat.description || existing.description,
              coverImage: existing.coverImage || cat.coverImage,
              bannerImage: existing.bannerImage || cat.bannerImage,
              subcategoriesCount: cat.subcategoriesCount,
              subtypesCount: cat.subtypesCount,
              type: "main",
              active: existing.active !== undefined ? existing.active : true,
              updatedAt: new Date(),
            };
            if (cat.slug === "tops") {
              updates.name = "Tops";
              if (Array.isArray(cat.subcategories)) {
                const currentSubs: any[] = Array.isArray(existing.subcategories) ? [...existing.subcategories] : [];
                for (const s of cat.subcategories) {
                  const subIndex = currentSubs.findIndex((x) => x.id === s.id || x.slug === s.slug);
                  if (subIndex === -1) {
                    currentSubs.push(s);
                  } else {
                    currentSubs[subIndex] = {
                      ...s,
                      coverImage: currentSubs[subIndex].coverImage || s.coverImage,
                      imageUpdatedAt: currentSubs[subIndex].imageUpdatedAt || s.imageUpdatedAt,
                      imageVersion: currentSubs[subIndex].imageVersion || s.imageVersion,
                    };
                  }
                }
                updates.subcategories = currentSubs;
              }
            }
            await col.updateOne(
              { _id: (existing as any)._id },
              { $set: updates }
            );
          } else if (cat.type === "subcategory" && (cat as any).group) {
            if (!(existing as any).group || (existing as any).group !== (cat as any).group) {
              await col.updateOne(
                { _id: (existing as any)._id },
                { $set: { group: (cat as any).group, parentId: cat.parentId, parentCategory: (cat as any).parentCategory, updatedAt: new Date() } }
              );
            }
          }
        } catch {
          setMongoConnected(false);
        }
      }
    }
  },

  async listActive(sellerId?: string): Promise<ProductCategoryDoc[]> {
    let categories: ProductCategoryDoc[] = [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        categories = await col.find({ active: true }).sort({ displayOrder: 1, name: 1 }).toArray();
      } catch {
        setMongoConnected(false);
      }
    }

    if (categories.length === 0) {
      categories = Array.from(inMemoryCategoriesMap.values()).filter((c) => c.active);
    } else {
      categories.forEach((c) => {
        inMemoryCategoriesMap.set(c.slug, c);
      });
    }

    // Ensure default 12 catalog categories are present
    for (const def of CATALOG_DEFAULT_CATEGORIES) {
      if (!categories.some((c) => c.slug === def.slug || c.id === def.id)) {
        categories.push(def);
      }
    }

    categories = categories.map((c) => {
      if (c.slug === "tops" || c.id === "cat-tops-default") {
        c.name = "Tops";
      }
      if (subcategorySlugsToParent[c.slug]) {
        return {
          ...c,
          parentId: subcategorySlugsToParent[c.slug],
          type: "subcategory",
        };
      }
      return c;
    });

    // Merge dynamic child subcategories into parent categories' subcategories array
    const childSubcategories = categories.filter((c) => Boolean(c.parentId) || c.type === "subcategory");
    for (const mainCat of categories) {
      if (!mainCat.parentId && mainCat.type !== "subcategory") {
        const existingSubs = Array.isArray(mainCat.subcategories) ? [...mainCat.subcategories] : [];
        const matchingChildren = childSubcategories.filter(
          (sub) => sub.parentId === mainCat.id || sub.parentId === mainCat.slug
        );
        for (const child of matchingChildren) {
          const existingIdx = existingSubs.findIndex(
            (s: any) => s.id === child.id || s.slug === child.slug || s.name?.toLowerCase() === child.name?.toLowerCase()
          );
          if (existingIdx === -1) {
            existingSubs.push({
              id: child.id,
              name: child.name,
              slug: child.slug,
              coverImage: child.coverImage || null,
              imageUpdatedAt: child.imageUpdatedAt || (child as any).updatedAt || null,
              imageVersion: child.imageVersion || null,
              route: child.route || `/${mainCat.slug}?subcategory=${child.slug}`,
              subtypes: (child as any).subtypes || [],
            });
            registerDynamicSubcategory(mainCat.slug, {
              id: child.id,
              name: child.name,
              slug: child.slug,
              coverImage: child.coverImage || null,
              route: child.route || `/${mainCat.slug}?subcategory=${child.slug}`,
              subtypes: (child as any).subtypes || [],
            });
          } else {
            if (child.coverImage !== undefined) {
              existingSubs[existingIdx].coverImage = child.coverImage;
            }
            if (child.imageUpdatedAt) {
              existingSubs[existingIdx].imageUpdatedAt = child.imageUpdatedAt;
            }
            if (child.imageVersion) {
              existingSubs[existingIdx].imageVersion = child.imageVersion;
            }
          }
        }
        mainCat.subcategories = existingSubs;
        mainCat.subcategoriesCount = existingSubs.length;
      }
    }

    const officialMainSlugs = new Set([
      "sarees", "kurtis", "kurta-sets", "ethnic-dresses", "western-dresses", "winter-wear", "tops", "womens-tops",
      "cat-sarees-default", "cat-kurtis-default", "cat-kurta-sets-default", "cat-ethnic-dresses-default", "cat-western-dresses-default", "cat-winter-wear-default", "cat-tops-default", "cat-womens-tops-default"
    ]);

    const legacyNonSareeSlugs = new Set([
      "indian-wear", "fashion-wear", "lehenga", "salwar",
      "co-ords", "playsuits", "jumpsuits", "shrugs", "sweaters-sweatshirts", "jackets-coats", "blazers-waistcoats",
      "cat-indian-wear", "cat-western-wear", "cat-fashion-wear"
    ]);

    return categories
      .filter((c) => {
        const isOfficial = officialMainSlugs.has(c.slug) || officialMainSlugs.has(c.id) || officialMainSlugs.has(String(c.parentId || ""));
        if (!isOfficial && (legacyNonSareeSlugs.has(c.slug) || legacyNonSareeSlugs.has(c.id) || legacyNonSareeSlugs.has(String(c.parentId || "")))) {
          return false;
        }
        const status = c.status || "approved";
        if (status === "approved") return true;
        if (sellerId && c.sellerId === sellerId) return true;
        return false;
      })
      .sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99) || a.name.localeCompare(b.name));
  },

  async listAll(filters?: {
    status?: string;
    sellerId?: string;
    type?: string;
    search?: string;
    sort?: string;
  }): Promise<ProductCategoryDoc[]> {
    let categories: ProductCategoryDoc[] = [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        categories = await col.find({}).sort({ displayOrder: 1, name: 1 }).toArray();
      } catch {
        setMongoConnected(false);
      }
    }

    if (categories.length === 0) {
      categories = Array.from(inMemoryCategoriesMap.values());
    } else {
      categories.forEach((c) => {
        inMemoryCategoriesMap.set(c.slug, c);
      });
    }

    for (const def of CATALOG_DEFAULT_CATEGORIES) {
      if (!categories.some((c) => c.slug === def.slug || c.id === def.id)) {
        categories.push(def);
      }
    }

    categories = categories.map((c) => {
      if (c.slug === "tops" || c.id === "cat-tops-default") {
        c.name = "Tops";
      }
      if (subcategorySlugsToParent[c.slug]) {
        return {
          ...c,
          parentId: subcategorySlugsToParent[c.slug],
          type: "subcategory",
        };
      }
      return c;
    });

    const legacyNonSareeSlugs = new Set([
      "indian-wear", "western-wear", "fashion-wear", "dresses", "kurti", "lehenga", "salwar",
      "co-ords", "playsuits", "jumpsuits", "shrugs", "sweaters-sweatshirts", "jackets-coats", "blazers-waistcoats",
      "cat-indian-wear", "cat-western-wear", "cat-fashion-wear"
    ]);
    categories = categories.filter((c) => {
      if (c.slug === "tops" || c.slug === "womens-tops" || c.id === "cat-tops-default" || c.parentId === "cat-tops-default" || (c as any).parentCategory === "tops") {
        return true;
      }
      return !legacyNonSareeSlugs.has(c.slug) && !legacyNonSareeSlugs.has(c.id) && !legacyNonSareeSlugs.has(String(c.parentId || ""));
    });

    const allProducts = await mongoProducts.findMany({ isDeleted: { $ne: true } }, { limit: 10000 });
    const categoriesWithCount = categories.map((c) => {
      const slug = c.slug.toLowerCase().trim();
      const name = c.name.toLowerCase().trim();
      const count = allProducts.filter((p) => {
        const pCat = String(p.category || "").toLowerCase().trim();
        const pSlug = pCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pCatId = String((p as any).categoryId || "").trim();
        const pSub = String((p as any).subCategory || p.subcategory || "").toLowerCase().trim();
        const pSubSlug = pSub.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pSubId = String((p as any).subcategoryId || "").trim();

        if (c.type === "main" || !c.parentId) {
          if (pCatId && (pCatId === c.id || pCatId === c.slug)) return true;
          if (pCat === name || pSlug === slug || pCat === slug) return true;
          if (slug === "paithani" && (pCat.includes("paithani") || pCat === "paithani sarees")) return true;
          if (slug === "designer" && (pCat.includes("designer") || pCat === "designer sarees")) return true;
          if (slug === "chanderi" && (pCat.includes("chanderi") || pCat === "chanderi sarees")) return true;
          if (slug === "banarasi" && (pCat.includes("banarasi") || pCat === "banarasi sarees")) return true;
          if (slug === "kanjivaram" && (pCat.includes("kanjivaram") || pCat === "kanjivaram sarees")) return true;
          if (slug === "gadwal" && (pCat.includes("gadwal") || pCat === "gadwal sarees")) return true;
          if (slug === "bandhani" && (pCat.includes("bandhani") || pCat === "bandhani sarees")) return true;
          if (slug === "mysore-silk" && (pCat.includes("mysore") || pCat === "mysore silk sarees")) return true;
          if (slug === "ikat" && (pCat.includes("ikat") || pCat === "ikat sarees")) return true;
          if (slug === "cotton" && (pCat.includes("cotton") || pCat === "cotton sarees")) return true;
          if (slug === "silk" && (pCat.includes("silk") || pCat === "silk sarees")) return true;
          if (slug === "other-traditional" && (pCat.includes("traditional") || pCat === "other traditional sarees")) return true;
          if (slug === "sarees" && (pCat.includes("saree") || ["paithani", "designer", "banarasi", "kanjivaram", "gadwal", "chanderi", "bandhani", "mysore-silk", "ikat", "cotton", "silk", "other-traditional"].includes(pSlug))) return true;
          if (slug === "kurtis" && (pCat.includes("kurti") || pCat.includes("tunic"))) return true;
          if (slug === "kurta-sets" && (pCat.includes("kurta set") || pCat.includes("suit"))) return true;
          if (slug === "ethnic-dresses" && (pCat.includes("ethnic dress") || pCat.includes("anarkali"))) return true;
          if (slug === "western-dresses" && (pCat.includes("western dress") || pCat.includes("maxi") || pCat.includes("midi") || pCat.includes("mini") || pCat.includes("bodycon"))) return true;
          if (slug === "winter-wear" && (pCat.includes("winter") || pCat.includes("sweater") || pCat.includes("jacket") || pCat.includes("coat"))) return true;
          if ((slug === "tops" || slug === "womens-tops") && (pCat.includes("top") || pCat.includes("blouse") || pCat.includes("tunic") || pCatId === "cat-tops-default" || pCatId === "tops" || pCatId === "womens-tops" || pCat.includes("women's tops"))) return true;
          return false;
        } else {
          if (pSubId && (pSubId === c.id || pSubId === c.slug)) return true;
          if (pSub === name || pSubSlug === slug || pSub === slug) return true;
          if (slug === "bridal" && (pSub.includes("bridal") || pSubSlug.includes("bridal"))) return true;
          if (slug === "bollywood" && (pSub.includes("bollywood") || pSubSlug.includes("bollywood"))) return true;
          if (slug === "party" && (pSub.includes("party") || pSubSlug.includes("party"))) return true;
          if ((slug === "wedding-paithani-main" || slug === "wedding-paithani") && (pSub.includes("wedding") || pSubSlug.includes("wedding"))) return true;
          if ((slug === "western-paithani-main" || slug === "western-paithani") && (pSub.includes("western") || pSubSlug.includes("western"))) return true;
          if ((slug === "contemporary-silk-main" || slug === "contemporary-silk") && (pSub.includes("contemporary") || pSubSlug.includes("contemporary"))) return true;
          return false;
        }
      }).length;

      let subcategoriesWithCounts: any[] | undefined = undefined;
      let subcategoriesCount = c.subcategoriesCount;

      if (c.type === "main" || !c.parentId) {
        const rawSubs = categories.filter((sub) => sub.parentId === c.id || sub.parentId === c.slug || (sub as any).parentCategory === c.slug);
        const catalogDef = findCategoryDefinition(c.slug) || findCategoryDefinition(c.id);
        const mergedSubsMap = new Map<string, any>();
        rawSubs.forEach((sub) => mergedSubsMap.set(sub.slug.toLowerCase(), { ...sub }));
        if (Array.isArray(c.subcategories)) {
          c.subcategories.forEach((sub: any) => {
            const key = (sub.slug || sub.id || "").toLowerCase();
            if (key && !mergedSubsMap.has(key)) {
              mergedSubsMap.set(key, { ...sub, parentId: c.id, parentCategory: c.slug, type: "subcategory" });
            }
          });
        }
        if (catalogDef?.subcategories) {
          for (const staticSub of catalogDef.subcategories) {
            const key = staticSub.slug.toLowerCase();
            if (!mergedSubsMap.has(key)) {
              mergedSubsMap.set(key, {
                id: staticSub.id,
                name: staticSub.name,
                slug: staticSub.slug,
                type: "subcategory",
                parentId: c.id,
                parentCategory: c.slug,
                group: (staticSub as any).group || null,
                active: true,
                status: "approved",
                subtypes: staticSub.subtypes || [],
                createdBy: "system",
              });
            } else {
              const existing = mergedSubsMap.get(key);
              if (!existing.subtypes || existing.subtypes.length === 0) {
                existing.subtypes = staticSub.subtypes || [];
              }
              if (!existing.group && (staticSub as any).group) {
                existing.group = (staticSub as any).group;
              }
            }
          }
        }
        const subcategoriesList = Array.from(mergedSubsMap.values());
        subcategoriesWithCounts = subcategoriesList.map((sub) => {
          const sSlug = sub.slug.toLowerCase().trim();
          const sName = sub.name.toLowerCase().trim();
          const sId = sub.id;

          const subCount = allProducts.filter((p) => {
            const pCat = String(p.category || "").toLowerCase().trim();
            const pCatSlug = pCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const pCatId = String((p as any).categoryId || "").trim();

            const matchesParent = (
              pCatId === c.id || pCatId === c.slug || pCat === name || pCatSlug === slug || pCat === slug ||
              (slug === "paithani" && (pCat.includes("paithani") || pCat === "paithani sarees")) ||
              (slug === "designer" && (pCat.includes("designer") || pCat === "designer sarees")) ||
              (slug === "chanderi" && (pCat.includes("chanderi") || pCat === "chanderi sarees")) ||
              (slug === "banarasi" && (pCat.includes("banarasi") || pCat === "banarasi sarees")) ||
              (slug === "kanjivaram" && (pCat.includes("kanjivaram") || pCat === "kanjivaram sarees")) ||
              (slug === "gadwal" && (pCat.includes("gadwal") || pCat === "gadwal sarees")) ||
              (slug === "bandhani" && (pCat.includes("bandhani") || pCat === "bandhani sarees")) ||
              (slug === "mysore-silk" && (pCat.includes("mysore") || pCat === "mysore silk sarees")) ||
              (slug === "ikat" && (pCat.includes("ikat") || pCat === "ikat sarees")) ||
              (slug === "cotton" && (pCat.includes("cotton") || pCat === "cotton sarees")) ||
              (slug === "silk" && (pCat.includes("silk") || pCat === "silk sarees")) ||
              (slug === "other-traditional" && (pCat.includes("traditional") || pCat === "other traditional sarees")) ||
              (slug === "sarees") ||
              (slug === "tops" && (pCat.includes("top") || pCat.includes("blouse") || pCat.includes("tunic") || pCatId === "cat-tops-default" || pCatId === "tops"))
            );
            if (!matchesParent) return false;

            const pSub = String((p as any).subCategory || p.subcategory || "").toLowerCase().trim();
            const pSubSlug = pSub.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const pSubId = String((p as any).subcategoryId || "").trim();

            return (pSubId && (pSubId === sId || pSubId === sSlug)) ||
              pSub === sName || pSubSlug === sSlug || pSub === sSlug ||
              (sSlug.includes("bridal") && pSub.includes("bridal")) ||
              (sSlug.includes("party") && pSub.includes("party")) ||
              (sSlug.includes("anarkali") && pSub.includes("anarkali"));
          }).length;

          return {
            ...sub,
            productCount: subCount,
            active: sub.active !== undefined ? sub.active : true,
            status: sub.status || "approved",
          };
        });
        subcategoriesCount = subcategoriesWithCounts.length;
      }

      return {
        ...c,
        status: c.status || "approved",
        type: c.type || "custom",
        createdBy: c.createdBy || (c.sellerId ? "seller" : "system"),
        productCount: count,
        subcategories: subcategoriesWithCounts,
        subcategoriesCount: subcategoriesCount !== undefined ? subcategoriesCount : c.subcategoriesCount,
      };
    });

    let result = categoriesWithCount;

    if (filters?.status && filters.status !== "all") {
      if (filters.status === "active") {
        result = result.filter((c) => c.active && (c.status === "approved" || !c.status));
      } else if (filters.status === "inactive") {
        result = result.filter((c) => !c.active);
      } else {
        result = result.filter((c) => (c.status || "approved") === filters.status);
      }
    }

    if (filters?.sellerId) {
      result = result.filter((c) => c.sellerId === filters.sellerId);
    }

    if (filters?.type && filters.type !== "all") {
      result = result.filter((c) => (c.type || "custom").toLowerCase() === filters.type!.toLowerCase());
    }

    if (filters?.search) {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q) ||
          (c.sellerName && c.sellerName.toLowerCase().includes(q)) ||
          (c.subcategories && Array.isArray(c.subcategories) && c.subcategories.some(
            (sub: any) => sub.name.toLowerCase().includes(q) || sub.slug.toLowerCase().includes(q)
          ))
      );
    }

    if (filters?.sort) {
      if (filters.sort === "newest") {
        result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      } else if (filters.sort === "oldest") {
        result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      } else if (filters.sort === "productCount") {
        result.sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0));
      } else if (filters.sort === "displayOrder") {
        result.sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99));
      }
    } else {
      result.sort((a, b) => (a.displayOrder ?? 99) - (b.displayOrder ?? 99) || a.name.localeCompare(b.name));
    }

    return result;
  },

  async getCategoryStats(): Promise<{
    total: number;
    pending: number;
    approved: number;
    rejected: number;
    active: number;
    noCoverImage: number;
  }> {
    const all = await this.listAll();
    return {
      total: all.length,
      pending: all.filter((c) => c.status === "pending").length,
      approved: all.filter((c) => c.status === "approved" || !c.status).length,
      rejected: all.filter((c) => c.status === "rejected").length,
      active: all.filter((c) => c.active && (c.status === "approved" || !c.status)).length,
      noCoverImage: all.filter((c) => !c.coverImage).length,
    };
  },

  async findById(id: string): Promise<ProductCategoryDoc | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        const found = await col.findOne({ $or: [{ id }, { slug: id }, { _id: id as any }] });
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return (
      Array.from(inMemoryCategoriesMap.values()).find(
        (c) => c.id === id || c.slug === id || (c as any)._id === id
      ) || null
    );
  },

  async findBySlug(slug: string): Promise<ProductCategoryDoc | null> {
    const cleanSlug = slugifyCategoryName(slug);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        const found = await col.findOne({ slug: cleanSlug });
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryCategoriesMap.get(cleanSlug) || null;
  },

  async create(data: {
    name: string;
    type?: string;
    parentId?: string | null;
    createdBy?: string;
    sellerId?: string | null;
    sellerName?: string | null;
    status?: string;
    coverImage?: string | null;
    bannerImage?: string | null;
    description?: string | null;
    displayOrder?: number;
  }): Promise<ProductCategoryDoc> {
    const trimmed = String(data.name).trim();
    const cleanParentId = data.parentId && String(data.parentId).trim() ? String(data.parentId).trim() : null;
    const isSubcategory = Boolean(cleanParentId) || data.type === "subcategory";
    const slugBase = slugifyCategoryName(trimmed);
    const slug = cleanParentId ? `${slugifyCategoryName(cleanParentId)}-${slugBase}` : slugBase;

    // Check duplicate under this parent
    const parentCategorySlug = (data as any).parentCategory || (cleanParentId ? slugifyCategoryName(cleanParentId) : null);
    let existing: ProductCategoryDoc | null = null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        if (cleanParentId) {
          existing = await col.findOne({
            $and: [
              { $or: [{ parentId: cleanParentId }, { parentId: parentCategorySlug }, { parentCategory: parentCategorySlug }] },
              { $or: [{ name: { $regex: new RegExp(`^${trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`, "i") } }, { slug }, { slug: slugBase }] },
            ],
          });
        } else {
          existing = await col.findOne({
            $or: [
              { slug },
              { id: slug },
              { name: { $regex: new RegExp(`^${trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")}$`, "i") } },
            ],
          });
        }
      } catch {
        setMongoConnected(false);
      }
    }
    if (!existing) {
      existing = Array.from(inMemoryCategoriesMap.values()).find((c) => {
        if (cleanParentId) {
          return (
            (c.parentId === cleanParentId || c.parentId === parentCategorySlug || c.parentCategory === parentCategorySlug) &&
            (c.name.toLowerCase() === trimmed.toLowerCase() || c.slug === slug || c.slug === slugBase)
          );
        }
        return c.slug === slug || c.id === slug || c.name.toLowerCase() === trimmed.toLowerCase();
      }) || null;
    }

    if (existing) {
      const fieldUpdates: any = {};
      if (!existing.active) {
        existing.active = true;
        fieldUpdates.active = true;
      }
      if (data.coverImage && data.coverImage !== existing.coverImage) {
        existing.coverImage = data.coverImage;
        fieldUpdates.coverImage = data.coverImage;
      }
      if (data.description && data.description !== existing.description) {
        existing.description = data.description;
        fieldUpdates.description = data.description;
      }
      if (Object.keys(fieldUpdates).length > 0) {
        fieldUpdates.updatedAt = new Date();
        inMemoryCategoriesMap.set(existing.slug, existing);
        if (isMongoDbConnected()) {
          try {
            const col = getCollection<ProductCategoryDoc>("product_categories");
            await col.updateOne({ $or: [{ id: existing.id }, { slug: existing.slug }] }, { $set: fieldUpdates });
          } catch {}
        }
      }
      if (cleanParentId) {
        registerDynamicSubcategory(cleanParentId, {
          id: existing.id,
          name: existing.name,
          slug: existing.slug,
          route: existing.route || `/${parentCategorySlug || cleanParentId}?subcategory=${existing.slug}`,
          subtypes: [],
        });
        if (parentCategorySlug && parentCategorySlug !== cleanParentId) {
          registerDynamicSubcategory(parentCategorySlug, {
            id: existing.id,
            name: existing.name,
            slug: existing.slug,
            route: existing.route || `/${parentCategorySlug}?subcategory=${existing.slug}`,
            subtypes: [],
          });
        }
      }
      return existing;
    }

    const createdBy = data.createdBy || (data.sellerId ? "seller" : "system");
    const status = data.status || "approved";
    const now = new Date();

    const newDoc: ProductCategoryDoc = {
      id: (data as any).id || crypto.randomUUID(),
      name: trimmed,
      slug: slugBase,
      parentId: cleanParentId,
      parentCategory: parentCategorySlug,
      type: cleanParentId ? "subcategory" : (data.type || "custom"),
      subcategories: Array.isArray((data as any).subcategories) ? (data as any).subcategories : [],
      createdBy,
      sellerId: data.sellerId || null,
      sellerName: data.sellerName || null,
      coverImage: data.coverImage || null,
      bannerImage: data.bannerImage || null,
      description: data.description || null,
      displayOrder: data.displayOrder ?? 99,
      status,
      active: true,
      route: cleanParentId ? `/${parentCategorySlug || cleanParentId}?subcategory=${slugBase}` : undefined,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryCategoriesMap.set(slugBase, newDoc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        await col.insertOne(newDoc);
        if (cleanParentId) {
          await col.updateOne(
            { $or: [{ id: cleanParentId }, { slug: cleanParentId }] },
            {
              $addToSet: {
                subcategories: {
                  id: newDoc.id,
                  name: newDoc.name,
                  slug: newDoc.slug,
                  route: newDoc.route,
                  subtypes: [],
                },
              },
              $inc: { subcategoriesCount: 1 },
            }
          );
        }
      } catch {
        setMongoConnected(false);
      }
    }

    if (cleanParentId) {
      registerDynamicSubcategory(cleanParentId, {
        id: newDoc.id,
        name: newDoc.name,
        slug: newDoc.slug,
        route: newDoc.route || undefined,
        subtypes: [],
      });
    }

    return newDoc;
  },

  async update(id: string, updates: Partial<ProductCategoryDoc>): Promise<ProductCategoryDoc | null> {
    const existing = (await this.findById(id)) || (await this.findBySlug(id));
    if (!existing) return null;

    const now = new Date();
    const setObj: Partial<ProductCategoryDoc> = { updatedAt: now };
    if (updates.name !== undefined) {
      setObj.name = String(updates.name).trim();
      setObj.slug = slugifyCategoryName(setObj.name);
    }
    if (updates.type !== undefined) {
      setObj.type = String(updates.type).trim();
    }
    if (updates.status !== undefined) {
      setObj.status = String(updates.status).trim();
    }
    if (updates.active !== undefined) {
      setObj.active = Boolean(updates.active);
    }
    if (updates.coverImage !== undefined) {
      setObj.coverImage = updates.coverImage ? String(updates.coverImage).trim() : null;
      setObj.imageUpdatedAt = updates.imageUpdatedAt ? new Date(updates.imageUpdatedAt) : now;
      setObj.imageVersion = updates.imageVersion ? Number(updates.imageVersion) : now.getTime();
    }
    if (updates.bannerImage !== undefined) {
      setObj.bannerImage = updates.bannerImage ? String(updates.bannerImage).trim() : null;
      setObj.imageUpdatedAt = updates.imageUpdatedAt ? new Date(updates.imageUpdatedAt) : now;
      setObj.imageVersion = updates.imageVersion ? Number(updates.imageVersion) : now.getTime();
    }
    if (updates.imageUpdatedAt !== undefined) {
      setObj.imageUpdatedAt = updates.imageUpdatedAt ? new Date(updates.imageUpdatedAt) : now;
    }
    if (updates.imageVersion !== undefined) {
      setObj.imageVersion = updates.imageVersion ? Number(updates.imageVersion) : now.getTime();
    }
    if (updates.description !== undefined) {
      setObj.description = updates.description ? String(updates.description).trim() : null;
    }
    if (updates.displayOrder !== undefined) {
      setObj.displayOrder = typeof updates.displayOrder === "number" ? updates.displayOrder : parseInt(String(updates.displayOrder), 10) || 0;
    }
    if (updates.parentId !== undefined) {
      setObj.parentId = updates.parentId && String(updates.parentId).trim() ? String(updates.parentId).trim() : null;
    }
    if (updates.subcategoriesCount !== undefined) {
      setObj.subcategoriesCount = updates.subcategoriesCount;
    }
    if (updates.subtypesCount !== undefined) {
      setObj.subtypesCount = updates.subtypesCount;
    }
    if ((updates as any).subtypes !== undefined) {
      (setObj as any).subtypes = Array.isArray((updates as any).subtypes)
        ? (updates as any).subtypes
        : String((updates as any).subtypes).split(",").map((s: string) => s.trim()).filter(Boolean);
    }

    const updatedDoc: ProductCategoryDoc = { ...existing, ...setObj };

    inMemoryCategoriesMap.set(updatedDoc.slug, updatedDoc);
    if (existing.slug !== updatedDoc.slug) {
      inMemoryCategoriesMap.delete(existing.slug);
    }

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        await col.updateOne(
          { $or: [{ id: existing.id }, { slug: existing.slug }, { _id: existing.id as any }] },
          { $set: setObj }
        );
        // If this is a subcategory, also update any parent category's embedded subcategory array
        if (existing.parentId || existing.type === "subcategory" || updates.coverImage !== undefined) {
          const effectiveCover = setObj.coverImage !== undefined ? setObj.coverImage : existing.coverImage;
          const subSetPayload: Record<string, any> = {
            "subcategories.$[elem].coverImage": effectiveCover,
          };
          if (setObj.imageUpdatedAt) {
            subSetPayload["subcategories.$[elem].imageUpdatedAt"] = setObj.imageUpdatedAt;
          }
          if (setObj.imageVersion) {
            subSetPayload["subcategories.$[elem].imageVersion"] = setObj.imageVersion;
          }
          await col.updateMany(
            { "subcategories.id": existing.id },
            { $set: subSetPayload },
            { arrayFilters: [{ "elem.id": existing.id }] }
          );
          await col.updateMany(
            { "subcategories.slug": existing.slug },
            { $set: subSetPayload },
            { arrayFilters: [{ "elem.slug": existing.slug }] }
          );
        }
      } catch (dbErr: any) {
        console.error("[mongoProductCategories.update] Database update failed:", dbErr);
        throw dbErr;
      }
    }

    // Also update in-memory parent categories' embedded subcategory list
    for (const parent of inMemoryCategoriesMap.values()) {
      if (Array.isArray(parent.subcategories)) {
        for (const sub of parent.subcategories) {
          if (sub.id === existing.id || sub.slug === existing.slug) {
            if (setObj.coverImage !== undefined) sub.coverImage = setObj.coverImage;
            if (setObj.name !== undefined) sub.name = setObj.name;
            if (setObj.imageUpdatedAt) sub.imageUpdatedAt = setObj.imageUpdatedAt;
            if (setObj.imageVersion) sub.imageVersion = setObj.imageVersion;
          }
        }
      }
    }

    return updatedDoc;
  },

  async delete(id: string): Promise<boolean> {
    const existing = (await this.findById(id)) || (await this.findBySlug(id));
    if (existing) {
      inMemoryCategoriesMap.delete(existing.slug);
    }
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ProductCategoryDoc>("product_categories");
        await col.deleteOne({
          $or: [{ id }, { slug: id }, { _id: id as any }]
        });
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  },
};


// ─── SHIPMENTS (Multi-Seller Shiprocket Integration) ──────────────────────────
const inMemoryShipmentsMap = new Map<string, MongoShipmentDoc>();

export const mongoShipments = {
  async findById(id: string): Promise<MongoShipmentDoc | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] } as Filter<MongoShipmentDoc>);
        if (found) {
          inMemoryShipmentsMap.set(found.id || id, found);
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryShipmentsMap.get(id) || Array.from(inMemoryShipmentsMap.values()).find((s) => s.id === id || (s as any)._id === id) || null;
  },

  async findByOrderId(orderId: string): Promise<MongoShipmentDoc[]> {
    if (!orderId) return [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        const list = await col.find({ orderId } as Filter<MongoShipmentDoc>).toArray();
        if (list.length > 0) {
          list.forEach((s) => inMemoryShipmentsMap.set(s.id, s));
          return list;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryShipmentsMap.values()).filter((s) => s.orderId === orderId);
  },

  async findByVendorId(vendorId: string): Promise<MongoShipmentDoc[]> {
    if (!vendorId) return [];
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        const list = await col.find({ vendorId } as Filter<MongoShipmentDoc>).toArray();
        if (list.length > 0) {
          list.forEach((s) => inMemoryShipmentsMap.set(s.id, s));
          return list;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryShipmentsMap.values()).filter((s) => s.vendorId === vendorId);
  },

  async findByAwb(awbNumber: string): Promise<MongoShipmentDoc | null> {
    if (!awbNumber) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        const found = await col.findOne({ awbNumber } as Filter<MongoShipmentDoc>);
        if (found) {
          inMemoryShipmentsMap.set(found.id, found);
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryShipmentsMap.values()).find((s) => s.awbNumber === awbNumber) || null;
  },

  async findMany(
    filter: Filter<MongoShipmentDoc> = {},
    options: { sort?: Sort; limit?: number; skip?: number } = {}
  ): Promise<MongoShipmentDoc[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        if (list.length > 0) {
          list.forEach((s) => inMemoryShipmentsMap.set(s.id, s));
          return list;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    let list = Array.from(inMemoryShipmentsMap.values());
    if (filter.vendorId) list = list.filter((s) => s.vendorId === filter.vendorId);
    if (filter.orderId) list = list.filter((s) => s.orderId === filter.orderId);
    if (filter.status) list = list.filter((s) => s.status === filter.status);
    if (options.skip) list = list.slice(options.skip);
    if (options.limit) list = list.slice(0, options.limit);
    return list;
  },

  async insert(data: Partial<MongoShipmentDoc>): Promise<MongoShipmentDoc> {
    const id = data.id || `SHP-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const doc: MongoShipmentDoc = {
      status: "created",
      items: [],
      deliveryAddress: {},
      parcelWeightKg: "0.5",
      parcelDimensions: { length: 25, breadth: 20, height: 5 },
      pickupLocationName: "",
      pickupPincode: "",
      trackingHistory: [],
      createdAt: now,
      updatedAt: now,
      ...data,
      id,
      _id: id,
    } as MongoShipmentDoc;

    inMemoryShipmentsMap.set(id, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        await col.updateOne(
          { $or: [{ id }, { _id: id as any }] } as Filter<MongoShipmentDoc>,
          { $set: doc },
          { upsert: true }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: Partial<MongoShipmentDoc>): Promise<MongoShipmentDoc | null> {
    const existing = await this.findById(id);
    const now = new Date();
    const updated: MongoShipmentDoc = {
      ...(existing || {}),
      ...updateData,
      updatedAt: now,
      id,
    } as MongoShipmentDoc;

    inMemoryShipmentsMap.set(id, updated);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        await col.updateOne(
          { $or: [{ id }, { _id: id as any }] } as Filter<MongoShipmentDoc>,
          { $set: { ...updateData, updatedAt: now } }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    inMemoryShipmentsMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<MongoShipmentDoc>("shipments");
        const res = await col.deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<MongoShipmentDoc>);
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
  },
};

// ─── GENERAL GENERIC COLLECTION ACCESSOR ─────────────────────────────────────
export const mongoGeneric = {
  getCollection
};

// ─── REWARDS & LOYALTY PROGRAM ───────────────────────────────────────────────
export type RewardProfileDoc = {
  id: string;
  _id?: string;
  userId: string;
  totalPoints: number;
  lifetimePoints: number;
  loyaltyTier: "silver" | "gold" | "platinum";
  referralCode: string;
  createdAt: Date;
  updatedAt: Date;
};

export type RewardLogDoc = {
  id: string;
  _id?: string;
  userId: string;
  points: number;
  type: "earned" | "bonus" | "redeemed";
  description: string;
  orderId?: string | null;
  createdAt: Date;
};

export type ReferralDoc = {
  id: string;
  _id?: string;
  referrerUserId: string;
  referredUserId: string;
  firstOrderId?: string | null;
  createdAt: Date;
};

const inMemoryRewardProfilesMap = new Map<string, RewardProfileDoc>();
const inMemoryRewardLogsMap = new Map<string, RewardLogDoc>();
const inMemoryReferralsMap = new Map<string, ReferralDoc>();

function computeLoyaltyTier(points: number): "silver" | "gold" | "platinum" {
  if (points >= 5000) return "platinum";
  if (points >= 1000) return "gold";
  return "silver";
}

function makeReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "VAST";
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export const mongoRewards = {
  computeTier: computeLoyaltyTier,

  async getOrCreateProfile(userId: string): Promise<RewardProfileDoc> {
    if (!userId) throw new Error("userId required");
    const cleanId = String(userId).trim();

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<RewardProfileDoc>("user_profiles");
        let found = await col.findOne({ userId: cleanId });
        if (found) {
          inMemoryRewardProfilesMap.set(cleanId, found);
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }

    const inMem = inMemoryRewardProfilesMap.get(cleanId);
    if (inMem) return inMem;

    // Create a new rewards profile with 100 welcome bonus points
    const now = new Date();
    const id = crypto.randomUUID();
    const referralCode = makeReferralCode();
    const doc: RewardProfileDoc = {
      id,
      _id: id,
      userId: cleanId,
      totalPoints: 100,
      lifetimePoints: 100,
      loyaltyTier: "silver",
      referralCode,
      createdAt: now,
      updatedAt: now,
    };

    inMemoryRewardProfilesMap.set(cleanId, doc);

    // Add initial log entry for welcome points
    const welcomeLogId = crypto.randomUUID();
    const welcomeLog: RewardLogDoc = {
      id: welcomeLogId,
      _id: welcomeLogId,
      userId: cleanId,
      points: 100,
      type: "bonus",
      description: "Welcome bonus points",
      orderId: null,
      createdAt: now,
    };
    inMemoryRewardLogsMap.set(welcomeLogId, welcomeLog);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<RewardProfileDoc>("user_profiles");
        await col.insertOne(doc as any);
        const logCol = getCollection<RewardLogDoc>("reward_points_log");
        await logCol.insertOne(welcomeLog as any);
      } catch {
        setMongoConnected(false);
      }
    }

    return doc;
  },

  async getSummary(userId: string) {
    const profile = await this.getOrCreateProfile(userId);

    let referralCount = 0;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ReferralDoc>("referrals");
        referralCount = await col.countDocuments({ referrerUserId: profile.userId });
      } catch {
        setMongoConnected(false);
      }
    }
    if (!referralCount) {
      referralCount = Array.from(inMemoryReferralsMap.values()).filter(
        (r) => r.referrerUserId === profile.userId
      ).length;
    }

    return {
      balance: profile.totalPoints,
      tier: profile.loyaltyTier,
      lifetimeEarned: profile.lifetimePoints,
      referralCode: profile.referralCode,
      referralCount,
    };
  },

  async getHistory(userId: string, page = 1, limit = 20) {
    const cleanId = String(userId).trim();
    const offset = Math.max(0, (page - 1) * limit);

    let rows: RewardLogDoc[] = [];
    let total = 0;

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<RewardLogDoc>("reward_points_log");
        total = await col.countDocuments({ userId: cleanId });
        rows = await col.find({ userId: cleanId }).sort({ createdAt: -1 }).skip(offset).limit(limit).toArray();
      } catch {
        setMongoConnected(false);
      }
    }

    if (rows.length === 0 && total === 0) {
      const all = Array.from(inMemoryRewardLogsMap.values())
        .filter((l) => l.userId === cleanId)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      total = all.length;
      rows = all.slice(offset, offset + limit);
    }

    return {
      history: rows,
      page,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    };
  },

  async addPoints(
    userId: string,
    points: number,
    type: "earned" | "bonus" | "redeemed",
    description: string,
    orderId?: string | null
  ): Promise<RewardProfileDoc> {
    const profile = await this.getOrCreateProfile(userId);
    const now = new Date();
    const newTotal = Math.max(0, profile.totalPoints + points);
    const newLifetime = points > 0 ? profile.lifetimePoints + points : profile.lifetimePoints;
    const newTier = computeLoyaltyTier(newTotal);

    profile.totalPoints = newTotal;
    profile.lifetimePoints = newLifetime;
    profile.loyaltyTier = newTier;
    profile.updatedAt = now;
    inMemoryRewardProfilesMap.set(profile.userId, profile);

    const logId = crypto.randomUUID();
    const logDoc: RewardLogDoc = {
      id: logId,
      _id: logId,
      userId: profile.userId,
      points,
      type,
      description,
      orderId: orderId || null,
      createdAt: now,
    };
    inMemoryRewardLogsMap.set(logId, logDoc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<RewardProfileDoc>("user_profiles");
        await col.updateOne(
          { userId: profile.userId },
          { $set: { totalPoints: newTotal, lifetimePoints: newLifetime, loyaltyTier: newTier, updatedAt: now } }
        );
        const logCol = getCollection<RewardLogDoc>("reward_points_log");
        await logCol.insertOne(logDoc as any);
      } catch {
        setMongoConnected(false);
      }
    }

    return profile;
  },

  async applyReferral(referredUserId: string, referralCode: string): Promise<boolean> {
    const code = referralCode.trim().toUpperCase();

    // Check if referee already used a code
    let alreadyReferred = false;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ReferralDoc>("referrals");
        const found = await col.findOne({ referredUserId });
        if (found) alreadyReferred = true;
      } catch {}
    }
    if (!alreadyReferred) {
      alreadyReferred = Array.from(inMemoryReferralsMap.values()).some((r) => r.referredUserId === referredUserId);
    }
    if (alreadyReferred) {
      throw Object.assign(new Error("You have already used a referral code"), { code: "ALREADY_USED" });
    }

    // Find referrer by code
    let referrer: RewardProfileDoc | null = null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<RewardProfileDoc>("user_profiles");
        referrer = await col.findOne({ referralCode: code });
      } catch {}
    }
    if (!referrer) {
      referrer = Array.from(inMemoryRewardProfilesMap.values()).find((p) => p.referralCode === code) || null;
    }

    if (!referrer) {
      throw Object.assign(new Error("Invalid referral code"), { code: "INVALID_CODE" });
    }

    if (referrer.userId === referredUserId) {
      throw Object.assign(new Error("You cannot use your own referral code"), { code: "SELF_REFERRAL" });
    }

    const refId = crypto.randomUUID();
    const refDoc: ReferralDoc = {
      id: refId,
      _id: refId,
      referrerUserId: referrer.userId,
      referredUserId,
      createdAt: new Date(),
    };
    inMemoryReferralsMap.set(refId, refDoc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<ReferralDoc>("referrals");
        await col.insertOne(refDoc as any);
      } catch {}
    }

    // Award 200 points to referrer
    await this.addPoints(referrer.userId, 200, "bonus", "Referral bonus: friend joined");
    // Award 100 points to referee
    await this.addPoints(referredUserId, 100, "bonus", "Referral welcome bonus");

    return true;
  },
};

// ─── ADVERTISEMENTS (SCROLLING WINDOW) ───────────────────────────────────────
export type AdvertisementDoc = {
  id: string;
  _id?: string;
  title?: string | null;
  description?: string | null;
  imageUrl: string;
  imageSource?: "upload" | "url";
  objectKey?: string | null;
  linkUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  startDate?: string | Date | null;
  endDate?: string | Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export const mongoAdvertisements = {
  getCollection: () => getCollection<AdvertisementDoc>("advertisements"),
};

// ─── AUDIT & APPLICATION LOGS ───────────────────────────────────────────────
export interface AuditLogDocument {
  _id?: any;
  timestamp: string;          // ISO 8601 UTC
  service: string;            // "vastraa-backend"
  environment: string;        // "production" | "development"
  actor: {
    id: string;               // User ID or "system"
    role: "admin" | "seller" | "customer" | "system";
    email?: string;
    ip?: string;
    userAgent?: string;
  };
  action: string;             // e.g. "SELLER_PRODUCT_SUBMITTED", "ADMIN_KYC_APPROVED"
  resource: {
    type: "product" | "seller" | "order" | "category" | "coupon" | "settlement" | "auth" | "system";
    id: string;
    name?: string;
  };
  request?: {
    method: string;
    route: string;
  };
  result: "success" | "failure";
  failureReason?: string;
  requestId: string;
  message: string;
  metadata?: Record<string, any>;
  changes?: {
    before?: Record<string, any>;
    after?: Record<string, any>;
  };
}

export interface ApplicationLogDocument {
  _id?: any;
  timestamp: string;
  createdAt: Date;
  level: "debug" | "info" | "warn" | "error" | "fatal";
  service: string;
  environment: string;
  message: string;
  requestId?: string;
  actor?: {
    id?: string;
    role?: string;
  };
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string | number;
  };
  thirdParty?: {
    provider: "cashfree" | "shiprocket" | "cloudflare_r2" | "zoho_smtp";
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    success: boolean;
    retryCount?: number;
  };
  metadata?: Record<string, any>;
}

export const mongoLogs = {
  getAuditCollection: () => getCollection<AuditLogDocument>("audit_logs"),
  getAppCollection: () => getCollection<ApplicationLogDocument>("application_logs"),

  async insertAuditLog(log: AuditLogDocument): Promise<void> {
    if (!isMongoDbConnected()) return;
    try {
      const col = getCollection<AuditLogDocument>("audit_logs");
      await col.insertOne({
        ...log,
        timestamp: log.timestamp || new Date().toISOString(),
        service: log.service || "vastraa-backend",
        environment: log.environment || process.env.NODE_ENV || "development",
      } as any);
    } catch (err: any) {
      console.error("[AuditLog] Failed to persist audit log to MongoDB:", err?.message || err);
    }
  },

  async queryAuditLogs(filter: {
    role?: string;
    actorId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    result?: string;
    requestId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    if (!isMongoDbConnected()) {
      return { logs: [], totalCount: 0, totalPages: 0, page, limit };
    }

    try {
      const col = getCollection<AuditLogDocument>("audit_logs");
      const query: any = {};
      if (filter.role && filter.role !== "all") query["actor.role"] = filter.role;
      if (filter.actorId) query["actor.id"] = filter.actorId;
      if (filter.action && filter.action !== "all") query.action = filter.action;
      if (filter.resourceType && filter.resourceType !== "all") query["resource.type"] = filter.resourceType;
      if (filter.resourceId) query["resource.id"] = filter.resourceId;
      if (filter.result && filter.result !== "all") query.result = filter.result;
      if (filter.requestId) query.requestId = filter.requestId;

      if (filter.startDate || filter.endDate) {
        query.timestamp = {};
        if (filter.startDate) query.timestamp.$gte = filter.startDate;
        if (filter.endDate) query.timestamp.$lte = filter.endDate;
      }

      if (filter.search) {
        const regex = new RegExp(filter.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        query.$or = [
          { message: regex },
          { "resource.id": regex },
          { "actor.email": regex },
          { requestId: regex },
          { action: regex },
        ];
      }

      const [logs, totalCount] = await Promise.all([
        col.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
        col.countDocuments(query),
      ]);

      return {
        logs,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        page,
        limit,
      };
    } catch (err: any) {
      console.error("[AuditLog] Query error:", err?.message || err);
      return { logs: [], totalCount: 0, totalPages: 0, page, limit };
    }
  },

  async insertAppLog(log: Omit<ApplicationLogDocument, "createdAt">): Promise<void> {
    if (!isMongoDbConnected()) return;
    try {
      const col = getCollection<ApplicationLogDocument>("application_logs");
      await col.insertOne({
        ...log,
        createdAt: new Date(),
        timestamp: log.timestamp || new Date().toISOString(),
        service: log.service || "vastraa-backend",
        environment: log.environment || process.env.NODE_ENV || "development",
      } as any);
    } catch (err: any) {
      console.error("[AppLog] Failed to persist app log to MongoDB:", err?.message || err);
    }
  },

  async queryAppLogs(filter: {
    level?: string;
    service?: string;
    requestId?: string;
    provider?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(filter.limit) || 20));
    const skip = (page - 1) * limit;

    if (!isMongoDbConnected()) {
      return { logs: [], totalCount: 0, totalPages: 0, page, limit };
    }

    try {
      const col = getCollection<ApplicationLogDocument>("application_logs");
      const query: any = {};
      if (filter.level && filter.level !== "all") query.level = filter.level;
      if (filter.service) query.service = filter.service;
      if (filter.requestId) query.requestId = filter.requestId;
      if (filter.provider && filter.provider !== "all") query["thirdParty.provider"] = filter.provider;

      if (filter.startDate || filter.endDate) {
        query.timestamp = {};
        if (filter.startDate) query.timestamp.$gte = filter.startDate;
        if (filter.endDate) query.timestamp.$lte = filter.endDate;
      }

      const [logs, totalCount] = await Promise.all([
        col.find(query).sort({ timestamp: -1 }).skip(skip).limit(limit).toArray(),
        col.countDocuments(query),
      ]);

      return {
        logs,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        page,
        limit,
      };
    } catch (err: any) {
      console.error("[AppLog] Query error:", err?.message || err);
      return { logs: [], totalCount: 0, totalPages: 0, page, limit };
    }
  },
};

