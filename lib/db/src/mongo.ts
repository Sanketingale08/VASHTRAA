import { MongoClient, Db, Collection } from "mongodb";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// Load MONGODB_URI from .env if not set in environment
if (!process.env.MONGODB_URI) {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const possiblePaths = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "../../.env"),
    path.resolve(currentDir, "../../../.env"),
    path.resolve(currentDir, "../../.env"),
  ];
  for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const match = line.trim().match(/^MONGODB_URI=(.+)$/);
        if (match) {
          process.env.MONGODB_URI = match[1].trim();
          break;
        }
      }
      if (process.env.MONGODB_URI) break;
    }
  }
}

const DIRECT_MONGODB_URI = "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017,cluster0-shard-00-01.5dccwdu.mongodb.net:27017,cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?replicaSet=atlas-13v68x-shard-0&ssl=true&authSource=admin&retryWrites=true&w=majority";
const MONGODB_URI = process.env.MONGODB_URI || DIRECT_MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

let mongoClientInstance: MongoClient | null = null;
let dbInstance: Db | null = null;
let isMongoConnected = false;

export function isMongoDbConnected(): boolean {
  return isMongoConnected;
}

export function setMongoConnected(connected: boolean): void {
  isMongoConnected = connected;
}

export async function connectToMongoDB(): Promise<{ client: MongoClient; db: Db }> {
  if (dbInstance && mongoClientInstance && isMongoConnected) {
    return { client: mongoClientInstance, db: dbInstance };
  }

  const maxPoolSize = parseInt(process.env.MONGODB_MAX_POOL_SIZE || "50", 10);
  const minPoolSize = parseInt(process.env.MONGODB_MIN_POOL_SIZE || "5", 10);

  const clientOptions: import("mongodb").MongoClientOptions = {
    maxPoolSize: isNaN(maxPoolSize) ? 50 : maxPoolSize,
    minPoolSize: isNaN(minPoolSize) ? 5 : minPoolSize,
    maxIdleTimeMS: 60000,
    waitQueueTimeoutMS: 10000,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  };

  try {
    mongoClientInstance = new MongoClient(MONGODB_URI, clientOptions);
    await mongoClientInstance.connect();
    dbInstance = mongoClientInstance.db(DB_NAME);
    isMongoConnected = true;
    console.log(`[MongoDB] Connected successfully to MongoDB Atlas database "${DB_NAME}"`);
    ensureMongoIndexes(dbInstance).catch(() => {});
    return { client: mongoClientInstance, db: dbInstance };
  } catch (err: any) {
    if (err?.code === 'ETIMEOUT' || err?.message?.includes('querySrv') || err?.message?.includes('ETIMEOUT')) {
      try {
        console.warn(`[MongoDB] SRV DNS query timed out. Connecting via direct cluster seedlist...`);
        mongoClientInstance = new MongoClient(DIRECT_MONGODB_URI, clientOptions);
        await mongoClientInstance.connect();
        dbInstance = mongoClientInstance.db(DB_NAME);
        isMongoConnected = true;
        console.log(`[MongoDB] Connected successfully via direct MongoDB Atlas seedlist to "${DB_NAME}"`);
        ensureMongoIndexes(dbInstance).catch(() => {});
        return { client: mongoClientInstance, db: dbInstance };
      } catch {
        // Fallback
      }
    }
    isMongoConnected = false;
    console.warn(`[MongoDB Notice] MongoDB connection returned: ${err?.message || err}. Falling back to resilient mode.`);
    mongoClientInstance = new MongoClient(MONGODB_URI, clientOptions);
    dbInstance = mongoClientInstance.db(DB_NAME);
    return { client: mongoClientInstance, db: dbInstance };
  }
}

async function safeCreateIndex(
  col: Collection,
  keys: any,
  options: import("mongodb").CreateIndexesOptions = {}
): Promise<void> {
  try {
    await col.createIndex(keys, { background: true, ...options });
  } catch (err: any) {
    if (err?.code === 11000 || err?.codeName === "DuplicateKey") {
      console.warn(
        `[MongoDB Index Deferred] Unique index on ${col.collectionName} (${JSON.stringify(keys)}) deferred due to existing duplicate records in legacy data.`
      );
    } else {
      console.warn(`[MongoDB Index Warning] ${col.collectionName}:`, err?.message || err);
    }
  }
}

export async function ensureMongoIndexes(db: Db): Promise<void> {
  try {
    // 1. Users
    const usersCol = db.collection("users");
    await safeCreateIndex(usersCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(usersCol, { email: 1 }, { sparse: true });
    await safeCreateIndex(usersCol, { clerkId: 1 }, { sparse: true });

    // 2. Sellers / Vendors
    const sellersCol = db.collection("sellers");
    await safeCreateIndex(sellersCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(sellersCol, { vendorId: 1 }, { sparse: true });
    await safeCreateIndex(sellersCol, { email: 1 }, { sparse: true });
    await safeCreateIndex(sellersCol, { ownerId: 1 }, { sparse: true });
    await safeCreateIndex(sellersCol, { status: 1 });
    await safeCreateIndex(sellersCol, { vendorId: 1, ownerId: 1 });
    await safeCreateIndex(sellersCol, { status: 1, createdAt: -1 });

    // 3. Products
    const productsCol = db.collection("products");
    await safeCreateIndex(productsCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(productsCol, { productId: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(
      productsCol,
      { vendorId: 1, sku: 1 },
      { unique: true, sparse: true, partialFilterExpression: { sku: { $exists: true, $type: "string", $ne: "" } } }
    );
    await safeCreateIndex(productsCol, { idempotencyKey: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(productsCol, { submitFingerprint: 1, vendorId: 1 }, { sparse: true });
    await safeCreateIndex(productsCol, { vendorId: 1, createdAt: -1 });
    await safeCreateIndex(productsCol, { sellerId: 1, createdAt: -1 });
    await safeCreateIndex(productsCol, { status: 1, active: 1, category: 1, createdAt: -1 });
    await safeCreateIndex(productsCol, { status: 1, active: 1, subcategory: 1, createdAt: -1 });
    await safeCreateIndex(productsCol, { status: 1, active: 1, price: 1 });
    await safeCreateIndex(productsCol, { slug: 1 });
    await safeCreateIndex(productsCol, { category: 1 });
    await safeCreateIndex(productsCol, { createdAt: -1 });

    // 4. Orders
    const ordersCol = db.collection("orders");
    await safeCreateIndex(ordersCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(ordersCol, { orderId: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(ordersCol, { displayId: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(ordersCol, { checkoutIdempotencyKey: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(ordersCol, { cashfreeOrderId: 1 }, { sparse: true });
    await safeCreateIndex(ordersCol, { userId: 1, createdAt: -1 });
    await safeCreateIndex(ordersCol, { vendorId: 1, createdAt: -1 });
    await safeCreateIndex(ordersCol, { status: 1, createdAt: -1 });
    await safeCreateIndex(ordersCol, { createdAt: -1 });

    // 5. Product Categories
    const categoriesCol = db.collection("product_categories");
    await safeCreateIndex(categoriesCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(categoriesCol, { slug: 1 }, { sparse: true });
    await safeCreateIndex(
      categoriesCol,
      { parentId: 1, slug: 1 },
      { unique: true, sparse: true, partialFilterExpression: { parentId: { $exists: true, $ne: null } } }
    );
    await safeCreateIndex(categoriesCol, { active: 1, sortOrder: 1 });
    await safeCreateIndex(categoriesCol, { parentId: 1, active: 1, sortOrder: 1 });

    // 6. Vendor Settlements
    const settlementsCol = db.collection("vendor_settlements");
    await safeCreateIndex(settlementsCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(
      settlementsCol,
      { orderId: 1, vendorId: 1, type: 1 },
      { unique: true, sparse: true, partialFilterExpression: { orderId: { $exists: true, $ne: null }, vendorId: { $exists: true, $ne: null } } }
    );
    await safeCreateIndex(settlementsCol, { vendorId: 1, createdAt: -1 });
    await safeCreateIndex(settlementsCol, { orderId: 1 });
    await safeCreateIndex(settlementsCol, { status: 1 });

    // 7. Shipments
    const shipmentsCol = db.collection("shipments");
    await safeCreateIndex(shipmentsCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(
      shipmentsCol,
      { orderId: 1, vendorId: 1 },
      { unique: true, sparse: true, partialFilterExpression: { orderId: { $exists: true, $ne: null }, vendorId: { $exists: true, $ne: null } } }
    );
    await safeCreateIndex(shipmentsCol, { shiprocketShipmentId: 1 }, { sparse: true });
    await safeCreateIndex(shipmentsCol, { awbNumber: 1 }, { sparse: true });

    // 8. R2 Assets (Images & Documents)
    const r2Col = db.collection("r2_assets");
    await safeCreateIndex(r2Col, { objectKey: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(r2Col, { contentHash: 1, sellerId: 1 }, { sparse: true });
    await safeCreateIndex(r2Col, { sellerId: 1, assetType: 1, createdAt: -1 });

    // 9. Email Outbox (Transactional Notifications)
    const emailCol = db.collection("email_outbox");
    await safeCreateIndex(emailCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(emailCol, { idempotencyKey: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(emailCol, { status: 1, createdAt: -1 });

    // 10. Coupons
    const couponsCol = db.collection("coupons");
    await safeCreateIndex(couponsCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(couponsCol, { code: 1 }, { unique: true, sparse: true });

    // 11. Customer Reviews
    const reviewsCol = db.collection("reviews");
    await safeCreateIndex(reviewsCol, { productId: 1, userId: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(reviewsCol, { productId: 1, rating: -1 });

    // 12. Processed Webhooks (Cashfree & Payouts Idempotency)
    const webhooksCol = db.collection("processed_webhooks");
    await safeCreateIndex(webhooksCol, { eventId: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(webhooksCol, { createdAt: 1 }, { expireAfterSeconds: 86400 * 30 }); // 30-day TTL

    // 13. Notifications & Support Tickets
    const notifCol = db.collection("notifications");
    await safeCreateIndex(notifCol, { userId: 1, read: 1, createdAt: -1 });
    await safeCreateIndex(notifCol, { vendorId: 1, read: 1, createdAt: -1 });

    const supportCol = db.collection("support_tickets");
    await safeCreateIndex(supportCol, { id: 1 }, { unique: true, sparse: true });
    await safeCreateIndex(supportCol, { userId: 1, status: 1 });

    // 14. Audit Logs (Permanent Business Action Trail for Admin & Seller)
    const auditLogsCol = db.collection("audit_logs");
    await safeCreateIndex(auditLogsCol, { timestamp: -1 });
    await safeCreateIndex(auditLogsCol, { "actor.role": 1, timestamp: -1 });
    await safeCreateIndex(auditLogsCol, { "actor.id": 1, timestamp: -1 });
    await safeCreateIndex(auditLogsCol, { action: 1, timestamp: -1 });
    await safeCreateIndex(auditLogsCol, { "resource.type": 1, "resource.id": 1 });
    await safeCreateIndex(auditLogsCol, { requestId: 1 });
    await safeCreateIndex(auditLogsCol, { result: 1 });

    // 15. Application & Operational Logs (Errors, Exceptions, Third-Party API Traces)
    const appLogsCol = db.collection("application_logs");
    await safeCreateIndex(appLogsCol, { timestamp: -1 });
    await safeCreateIndex(appLogsCol, { level: 1, timestamp: -1 });
    await safeCreateIndex(appLogsCol, { service: 1, timestamp: -1 });
    await safeCreateIndex(appLogsCol, { requestId: 1 });
    await safeCreateIndex(appLogsCol, { "thirdParty.provider": 1, timestamp: -1 });
    // 60-day auto-retention policy
    await safeCreateIndex(appLogsCol, { createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 60 * 60 });
  } catch (err: any) {
    console.warn("[MongoDB] Index setup warning:", err?.message || err);
  }
}

export function getMongoDb(): Db {
  if (!dbInstance) {
    mongoClientInstance = new MongoClient(MONGODB_URI, {
      maxPoolSize: 25,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      tls: true,
      tlsAllowInvalidCertificates: true,
    });
    dbInstance = mongoClientInstance.db(DB_NAME);
  }
  return dbInstance;
}

export function getCollection<T extends import("mongodb").Document = import("mongodb").Document>(collectionName: string): Collection<T> {
  return getMongoDb().collection<T>(collectionName);
}

// In-memory atomic sequence counter fallback
const inMemoryCounters = new Map<string, number>();

export function setInMemoryCounterStart(sequenceName: string, minSeq: number): void {
  const current = inMemoryCounters.get(sequenceName) || 0;
  if (minSeq > current) {
    inMemoryCounters.set(sequenceName, minSeq);
  }
}

export function formatVendorId(seq: number): string {
  const numStr = String(seq);
  return `TDV${numStr.padStart(6, "0")}`;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OBJECT_ID_REGEX = /^[0-9a-f]{24}$/i;

export function isInternalRawId(id: any): boolean {
  if (!id || typeof id !== "string") return false;
  return UUID_REGEX.test(id) || OBJECT_ID_REGEX.test(id);
}

export function getCanonicalSellerId(v: any): string {
  if (!v) return "";
  if (typeof v === "string") {
    return v;
  }
  // 1. Check sellerId if not internal raw id
  if (v.sellerId && typeof v.sellerId === "string" && !isInternalRawId(v.sellerId)) {
    return v.sellerId;
  }
  // 2. Check vendorId if not internal raw id
  if (v.vendorId && typeof v.vendorId === "string" && !isInternalRawId(v.vendorId)) {
    return v.vendorId;
  }
  // 3. Check custom display id or seller_id (from sql joins / raw queries)
  if (v.seller_id && typeof v.seller_id === "string" && !isInternalRawId(v.seller_id)) {
    return v.seller_id;
  }
  if (v.vendor_id && typeof v.vendor_id === "string" && !isInternalRawId(v.vendor_id)) {
    return v.vendor_id;
  }
  // 4. Fallback to sellerId / vendorId / id even if raw id
  return v.sellerId || v.vendorId || v.seller_id || v.vendor_id || v.id || v._id || "";
}

// Atomic Sequence Counter Generator
export async function getNextSequenceValue(sequenceName: string): Promise<number> {
  if (!isMongoConnected) {
    const current = inMemoryCounters.get(sequenceName) || 0;
    const next = current + 1;
    inMemoryCounters.set(sequenceName, next);
    return next;
  }
  try {
    const db = getMongoDb();
    const res = await db.collection("counters").findOneAndUpdate(
      { _id: sequenceName as any },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" }
    );
    const seq = res?.seq ?? (res as any)?.value?.seq;
    if (typeof seq === "number") {
      setInMemoryCounterStart(sequenceName, seq);
      return seq;
    }
    const current = inMemoryCounters.get(sequenceName) || 0;
    const next = current + 1;
    inMemoryCounters.set(sequenceName, next);
    return next;
  } catch (err) {
    isMongoConnected = false;
    console.error(`[MongoDB] getNextSequenceValue error for ${sequenceName}:`, err);
    const current = inMemoryCounters.get(sequenceName) || 0;
    const next = current + 1;
    inMemoryCounters.set(sequenceName, next);
    return next;
  }
}

