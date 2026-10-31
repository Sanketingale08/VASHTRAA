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

export async function ensureMongoIndexes(db: Db): Promise<void> {
  try {
    await db.collection("users").createIndexes([
      { key: { email: 1 }, background: true },
      { key: { id: 1 }, background: true },
    ]);

    await db.collection("sellers").createIndexes([
      { key: { id: 1 }, background: true },
      { key: { vendorId: 1 }, background: true },
      { key: { ownerId: 1 }, background: true },
      { key: { email: 1 }, background: true },
      { key: { status: 1 }, background: true },
      { key: { vendorId: 1, ownerId: 1 }, background: true },
      { key: { status: 1, createdAt: -1 }, background: true },
    ]);

    await db.collection("products").createIndexes([
      { key: { id: 1 }, background: true },
      { key: { productId: 1 }, background: true },
      { key: { vendorId: 1 }, background: true },
      { key: { sellerId: 1 }, background: true },
      { key: { status: 1 }, background: true },
      { key: { active: 1, status: 1 }, background: true },
      { key: { status: 1, active: 1, category: 1, createdAt: -1 }, background: true },
      { key: { status: 1, active: 1, subcategory: 1, createdAt: -1 }, background: true },
      { key: { status: 1, active: 1, price: 1 }, background: true },
      { key: { status: 1, active: 1, isBestSeller: 1 }, background: true },
      { key: { status: 1, active: 1, isNewArrival: 1 }, background: true },
      { key: { status: 1, active: 1, isFeatured: 1 }, background: true },
      { key: { vendorId: 1, createdAt: -1 }, background: true },
      { key: { sellerId: 1, createdAt: -1 }, background: true },
      { key: { slug: 1 }, background: true },
      { key: { category: 1 }, background: true },
      { key: { createdAt: -1 }, background: true },
    ]);

    await db.collection("orders").createIndexes([
      { key: { id: 1 }, background: true },
      { key: { orderId: 1 }, background: true },
      { key: { displayId: 1 }, background: true },
      { key: { userId: 1 }, background: true },
      { key: { vendorId: 1 }, background: true },
      { key: { userId: 1, vendorId: 1 }, background: true },
      { key: { userId: 1, createdAt: -1 }, background: true },
      { key: { vendorId: 1, createdAt: -1 }, background: true },
      { key: { status: 1 }, background: true },
      { key: { status: 1, createdAt: -1 }, background: true },
      { key: { cashfreeOrderId: 1 }, background: true },
      { key: { cashfreePaymentSessionId: 1 }, background: true },
      { key: { createdAt: -1 }, background: true },
    ]);

    await db.collection("product_categories").createIndexes([
      { key: { id: 1 }, background: true },
      { key: { slug: 1 }, background: true },
      { key: { active: 1, sortOrder: 1 }, background: true },
      { key: { parentId: 1, active: 1, sortOrder: 1 }, background: true },
      { key: { sellerId: 1, status: 1 }, background: true },
    ]);

    await db.collection("vendor_settlements").createIndexes([
      { key: { id: 1 }, background: true },
      { key: { vendorId: 1 }, background: true },
      { key: { vendorId: 1, createdAt: -1 }, background: true },
      { key: { orderId: 1 }, background: true },
      { key: { status: 1 }, background: true },
      { key: { type: 1 }, background: true },
      { key: { cashfreeTransferId: 1 }, background: true },
      { key: { createdAt: -1 }, background: true },
    ]);

    await db.collection("support_tickets").createIndexes([
      { key: { id: 1 }, background: true },
      { key: { userId: 1 }, background: true },
      { key: { vendorId: 1 }, background: true },
      { key: { status: 1 }, background: true },
      { key: { assignedTo: 1 }, background: true },
      { key: { createdAt: -1 }, background: true },
    ]);

    await db.collection("reviews").createIndexes([
      { key: { productId: 1 }, background: true },
      { key: { userId: 1 }, background: true },
      { key: { productId: 1, rating: -1 }, background: true },
    ]);

    await db.collection("notifications").createIndexes([
      { key: { userId: 1 }, background: true },
      { key: { vendorId: 1 }, background: true },
      { key: { userId: 1, read: 1, createdAt: -1 }, background: true },
      { key: { vendorId: 1, read: 1, createdAt: -1 }, background: true },
      { key: { read: 1 }, background: true },
    ]);

    await db.collection("r2_assets").createIndexes([
      { key: { objectKey: 1 }, background: true },
      { key: { sellerId: 1, assetType: 1, createdAt: -1 }, background: true },
    ]);

    await db.collection("stock_history").createIndexes([
      { key: { productId: 1, createdAt: -1 }, background: true },
      { key: { vendorId: 1, createdAt: -1 }, background: true },
    ]);
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

