import { getCollection, getNextSequenceValue, isMongoDbConnected, setMongoConnected } from "./mongo.ts";
import type { Filter, Sort } from "mongodb";

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
} from "./schema";

// ─── SELLERS / VENDORS ────────────────────────────────────────────────────────
const inMemorySellersMap = new Map<string, Seller & Vendor>();

export const mongoSellers = {
  async findById(id: string): Promise<(Seller & Vendor) | null> {
    if (!id) return null;
    if (isMongoDbConnected()) {
      try {
        const filter = { $or: [{ id }, { sellerId: id }, { vendorId: id }, { _id: id as any }] } as Filter<Seller & Vendor>;
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
        (s) => s.id === id || s.sellerId === id || s.vendorId === id || (s as any)._id === id
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
            { email: { $regex: new RegExp(`^${escaped}$`, "i") } },
            { contactEmail: { $regex: new RegExp(`^${escaped}$`, "i") } },
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
        (s) => (s.email || s.contactEmail || "").toLowerCase() === cleanEmail
      ) || null
    );
  },

  async findByOwnerId(ownerId: string): Promise<(Seller & Vendor) | null> {
    if (!ownerId) return null;
    if (isMongoDbConnected()) {
      try {
        const colSellers = getCollection<Seller & Vendor>("sellers");
        const foundSeller = await colSellers.findOne({ ownerId } as Filter<Seller & Vendor>);
        if (foundSeller) return foundSeller;

        const colVendors = getCollection<Seller & Vendor>("vendors");
        const foundVendor = await colVendors.findOne({ ownerId } as Filter<Seller & Vendor>);
        if (foundVendor) return foundVendor;
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemorySellersMap.values()).find((s) => s.ownerId === ownerId) || null;
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
    if (isMongoDbConnected()) {
      try {
        const colSellers = getCollection<Seller & Vendor>("sellers");
        let cursor = colSellers.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const sellers = await cursor.toArray();
        if (sellers.length > 0) return sellers;

        const colVendors = getCollection<Seller & Vendor>("vendors");
        let vCursor = colVendors.find(filter);
        if (options.sort) vCursor = vCursor.sort(options.sort);
        if (options.skip) vCursor = vCursor.skip(options.skip);
        if (options.limit) vCursor = vCursor.limit(options.limit);
        return vCursor.toArray();
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemorySellersMap.values());
  },

  async count(filter: Filter<Seller & Vendor> = {}): Promise<number> {
    if (isMongoDbConnected()) {
      try {
        const colSellers = getCollection<Seller & Vendor>("sellers");
        const cnt = await colSellers.countDocuments(filter);
        if (cnt > 0) return cnt;
        return getCollection<Seller & Vendor>("vendors").countDocuments(filter);
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemorySellersMap.size;
  },

  async insert(data: Partial<Seller & Vendor>): Promise<Seller & Vendor> {
    const id = data.id || crypto.randomUUID();
    const status = data.status || "pending";
    let vendorId = data.vendorId || data.sellerId || null;

    if (!vendorId && status === "approved") {
      const seq = await getNextSequenceValue("vendor_id");
      vendorId = formatVendorId(seq);
    }

    const sellerId = vendorId || data.sellerId || id;
    const cleanEmail = (data.email || data.contactEmail || "").trim().toLowerCase();
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
          { $or: [{ id }, { sellerId }, { email: cleanEmail }] } as Filter<Seller & Vendor>,
          { $set: doc },
          { upsert: true }
        );
        const colVendors = getCollection<Seller & Vendor>("vendors");
        await colVendors.updateOne(
          { $or: [{ id }, { sellerId }, { email: cleanEmail }] } as Filter<Seller & Vendor>,
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
      (await this.findById(id)) || (cleanEmail ? await this.findByEmail(cleanEmail) : null);

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

      // 3. Seller Reactivation: set reactivationWelcomePending = true if reactivating from suspended
      if (existing.status === "suspended" && updateData.status === "approved") {
        if (updateData.reactivationWelcomePending === undefined) {
          setObj.reactivationWelcomePending = true;
        }
      }

      const updated = { ...existing, ...setObj };
      inMemorySellersMap.set(targetId, updated);
      if (updated.sellerId) inMemorySellersMap.set(updated.sellerId, updated);
      if (updated.vendorId) inMemorySellersMap.set(updated.vendorId, updated);
      if (updated.email) inMemorySellersMap.set(updated.email, updated);

      if (isMongoDbConnected()) {
        try {
          const filter = {
            $or: [{ id: targetId }, { _id: targetId as any }, { sellerId: targetId }, { vendorId: targetId }, { email: updated.email }],
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
    if (filter.active !== undefined && p.active !== filter.active) return false;
    if (filter.category !== undefined && p.category !== filter.category) return false;
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
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] } as Filter<Product>);
        if (found) {
          inMemoryProductsMap.set(found.id || id, found);
          return found;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryProductsMap.get(id) || Array.from(inMemoryProductsMap.values()).find(p => p.id === id || (p as any)._id === id) || null;
  },

  async findMany(filter: Filter<Product> = {}, options: { sort?: Sort; limit?: number; skip?: number } = {}): Promise<Product[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        if (list.length > 0) {
          list.forEach(p => inMemoryProductsMap.set(p.id || (p as any)._id, p));
          return list;
        }
      } catch {
        setMongoConnected(false);
      }
    }
    const all = Array.from(inMemoryProductsMap.values());
    let filtered = filterInMemoryProducts(all, filter as any);
    if (options.skip) filtered = filtered.slice(options.skip);
    if (options.limit) filtered = filtered.slice(0, options.limit);
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
      _id: id,
    } as unknown as Product;

    inMemoryProductsMap.set(id, doc);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        await col.updateOne(
          { $or: [{ id }, { _id: id as any }] } as Filter<Product>,
          { $set: doc },
          { upsert: true }
        );
      } catch {
        setMongoConnected(false);
      }
    }
    return doc;
  },

  async update(id: string, updateData: Partial<Product>): Promise<Product | null> {
    const existing = await this.findById(id);
    const updated = { ...(existing || {}), ...updateData, id, _id: id } as Product;
    inMemoryProductsMap.set(id, updated);

    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Product>("products");
        await col.updateOne({ $or: [{ id }, { _id: id as any }] } as Filter<Product>, { $set: updateData });
      } catch {
        setMongoConnected(false);
      }
    }
    return updated;
  },

  async delete(id: string): Promise<boolean> {
    inMemoryProductsMap.delete(id);
    if (isMongoDbConnected()) {
      try {
        const res = await getCollection<Product>("products").deleteOne({ $or: [{ id }, { _id: id as any }] } as Filter<Product>);
        return res.deletedCount > 0;
      } catch {
        setMongoConnected(false);
      }
    }
    return true;
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

  async findMany(filter: Filter<Order> = {}, options: { sort?: Sort; limit?: number; skip?: number } = {}): Promise<Order[]> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<Order>("orders");
        let cursor = col.find(filter);
        if (options.sort) cursor = cursor.sort(options.sort);
        if (options.skip) cursor = cursor.skip(options.skip);
        if (options.limit) cursor = cursor.limit(options.limit);
        const list = await cursor.toArray();
        if (list.length > 0) {
          list.forEach(o => inMemoryOrdersMap.set(o.id || (o as any)._id, o));
          return list;
        }
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
    const displayId = data.displayId || `TD${seq}`;
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
    const col = getCollection<{ _id: string; key: string; value: string; updatedAt: Date }>("site_settings");
    const doc = await col.findOne({ _id: key });
    return doc ? doc.value : null;
  },
  async set(key: string, value: string): Promise<void> {
    const col = getCollection<{ _id: string; key: string; value: string; updatedAt: Date }>("site_settings");
    await col.updateOne(
      { _id: key },
      { $set: { key, value, updatedAt: new Date() } },
      { upsert: true }
    );
  }
};

// ─── USERS ───────────────────────────────────────────────────────────────────
const inMemoryUsersMap = new Map<string, User>();

export const mongoUsers = {
  async findById(id: string): Promise<User | null> {
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        const found = await col.findOne({ $or: [{ id }, { _id: id as any }] } as Filter<User>);
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return inMemoryUsersMap.get(id) || Array.from(inMemoryUsersMap.values()).find(u => u.id === id || (u as any)._id === id) || null;
  },
  async findByEmail(email: string): Promise<User | null> {
    const cleanEmail = (email || "").trim().toLowerCase();
    if (!cleanEmail) return null;
    if (isMongoDbConnected()) {
      try {
        const col = getCollection<User>("users");
        const escaped = cleanEmail.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const found = await col.findOne({
          $or: [
            { email: cleanEmail },
            { email: { $regex: new RegExp(`^${escaped}$`, "i") } },
          ],
        });
        if (found) return found;
      } catch {
        setMongoConnected(false);
      }
    }
    return Array.from(inMemoryUsersMap.values()).find(u => (u.email || "").toLowerCase() === cleanEmail) || null;
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
  async insert(data: Partial<User>): Promise<User> {
    const id = data.id || `USR${await getNextSequenceValue("user_id")}`;
    const now = new Date();
    const doc = {
      name: "",
      passwordHash: "",
      role: "customer",
      createdAt: now,
      updatedAt: now,
      ...data,
      email: (data.email || "").trim().toLowerCase(),
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
  async update(id: string, updateData: Partial<User>): Promise<User | null> {
    const setObj: Record<string, any> = { ...updateData, updatedAt: new Date() };
    if (setObj.email) setObj.email = setObj.email.trim().toLowerCase();
    
    let existing = await this.findById(id);
    if (!existing && setObj.email) {
      existing = await this.findByEmail(setObj.email);
    }

    if (existing) {
      const targetId = existing.id || id;
      const updated = { ...existing, ...setObj };
      inMemoryUsersMap.set(targetId, updated);
      inMemoryUsersMap.set(id, updated);

      if (isMongoDbConnected()) {
        try {
          const col = getCollection<User>("users");
          await col.updateOne({ $or: [{ id: targetId }, { _id: targetId as any }, { id }, { _id: id as any }] } as Filter<User>, { $set: setObj });
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
        email: setObj.email || "",
        passwordHash: "",
        role: "customer",
        ...setObj,
      });
      return doc;
    }
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

// ─── GENERAL GENERIC COLLECTION ACCESSSOR ─────────────────────────────────────
export const mongoGeneric = {
  getCollection
};
