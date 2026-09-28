import crypto from "crypto";

if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto || crypto;
}
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = function (buffer) {
    return crypto.randomFillSync(buffer);
  };
}

import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

async function seedSeller() {
  console.log(`[MongoDB] Connecting to database "${DB_NAME}" at cluster...`);
  
  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 25,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  await client.connect();
  const db = client.db(DB_NAME);

  const email = "ingalesanket2003@gmail.com";
  const rawPassword = "Sanket@123";
  const passwordHash = hashPassword(rawPassword);

  const userId = "seller_sanket_ingale_001";
  const vendorId = "TDV_SANKET001";

  const userDoc = {
    id: userId,
    name: "Sanket Ingale",
    email: email,
    passwordHash: passwordHash,
    role: "seller",
    phone: "9876543210",
    location: "Yeola, Maharashtra",
    language: "English",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sellerDoc = {
    id: userId,
    sellerId: vendorId,
    vendorId: vendorId,
    name: "Sanket Ingale Creations",
    sellerName: "Sanket Ingale",
    shopName: "Sanket Ingale Creations",
    email: email,
    contactEmail: email,
    mobile: "9876543210",
    passwordHash: passwordHash,
    location: "Yeola, Maharashtra",
    rating: 4.9,
    sareesCount: 15,
    productsCount: 15,
    status: "approved",
    ownerId: userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  // 1. Upsert into users collection
  await db.collection("users").updateOne(
    { email: email },
    { $set: userDoc },
    { upsert: true }
  );

  // 2. Upsert into sellers collection
  await db.collection("sellers").updateOne(
    { email: email },
    { $set: sellerDoc },
    { upsert: true }
  );

  // 3. Upsert into vendors collection
  await db.collection("vendors").updateOne(
    { email: email },
    { $set: sellerDoc },
    { upsert: true }
  );

  console.log("\n✅ SUCCESS! Seller login credentials inserted into MongoDB Atlas database:");
  console.log("-------------------------------------------------------");
  console.log("Login ID (Email):", email);
  console.log("Password:        ", rawPassword);
  console.log("Password Hash:   ", passwordHash.substring(0, 30) + "...");
  console.log("Role:            ", "seller");
  console.log("Seller Status:   ", "approved");
  console.log("Seller ID:       ", vendorId);
  console.log("Collections:     ", "users, sellers, vendors updated");
  console.log("-------------------------------------------------------\n");

  await client.close();
  process.exit(0);
}

seedSeller().catch((err) => {
  console.error("❌ Error seeding seller into MongoDB:", err);
  process.exit(1);
});
