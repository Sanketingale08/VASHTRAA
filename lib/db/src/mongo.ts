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

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
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

  const clientOptions: import("mongodb").MongoClientOptions = {
    maxPoolSize: 25,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 2000,
    connectTimeoutMS: 2000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  };

  try {
    mongoClientInstance = new MongoClient(MONGODB_URI, clientOptions);
    await mongoClientInstance.connect();
    dbInstance = mongoClientInstance.db(DB_NAME);
    isMongoConnected = true;
    console.log(`[MongoDB] Connected successfully to MongoDB Atlas database "${DB_NAME}"`);
    return { client: mongoClientInstance, db: dbInstance };
  } catch (err: any) {
    isMongoConnected = false;
    console.warn(`[MongoDB Notice] Direct MongoDB Atlas connection returned: ${err?.message || err}. Falling back to resilient mode.`);
    mongoClientInstance = new MongoClient(MONGODB_URI, clientOptions);
    dbInstance = mongoClientInstance.db(DB_NAME);
    return { client: mongoClientInstance, db: dbInstance };
  }
}

export function getMongoDb(): Db {
  if (!dbInstance) {
    mongoClientInstance = new MongoClient(MONGODB_URI, {
      maxPoolSize: 25,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 2000,
      connectTimeoutMS: 2000,
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

