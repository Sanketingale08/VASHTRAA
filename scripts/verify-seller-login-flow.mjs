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

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017,cluster0-shard-00-01.5dccwdu.mongodb.net:27017,cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?replicaSet=atlas-13v68x-shard-0&ssl=true&authSource=admin&retryWrites=true&w=majority";
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("pbkdf2:")) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
}

async function verifySellerLogin() {
  console.log("-------------------------------------------------------");
  console.log("🔍 Verifying Seller Login & Database Setup...");
  console.log("-------------------------------------------------------");

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

  // 1. Check user record in users collection
  const user = await db.collection("users").findOne({ email: email });
  if (!user) {
    throw new Error(`User account for ${email} not found in users collection!`);
  }
  console.log("✔ User record found:", { id: user.id, email: user.email, role: user.role });

  // 2. Check seller record in sellers collection
  const seller = await db.collection("sellers").findOne({ email: email });
  if (!seller) {
    throw new Error(`Seller record for ${email} not found in sellers collection!`);
  }
  console.log("✔ Seller record found:", {
    id: seller.id,
    sellerId: seller.sellerId || seller.vendorId,
    shopName: seller.shopName || seller.name,
    status: seller.status,
  });

  // 3. Verify password hash matches "Sanket@123"
  const isUserPasswordValid = verifyPassword(rawPassword, user.passwordHash);
  const isSellerPasswordValid = verifyPassword(rawPassword, seller.passwordHash);

  if (!isUserPasswordValid || !isSellerPasswordValid) {
    throw new Error("Password verification failed for 'Sanket@123'!");
  }
  console.log("✔ Password hash successfully validated for 'Sanket@123'!");

  // 4. Verify seller status is approved
  if (seller.status !== "approved") {
    throw new Error(`Seller status is '${seller.status}', expected 'approved'!`);
  }
  console.log("✔ Seller account status is 'approved' (unrestricted access granted)!");

  console.log("-------------------------------------------------------");
  console.log("🎉 Complete Seller Login & Dashboard Access Verification PASSED!");
  console.log("-------------------------------------------------------");

  await client.close();
  process.exit(0);
}

verifySellerLogin().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
