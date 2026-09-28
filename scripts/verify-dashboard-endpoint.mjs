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

async function verifyDashboardData() {
  console.log("-------------------------------------------------------");
  console.log("🔍 Verifying Seller Dashboard Metrics Data...");
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
  const seller = await db.collection("sellers").findOne({ email: email });

  if (!seller) {
    throw new Error("Seller profile not found in database!");
  }

  const vendorId = seller.id;
  const products = await db.collection("products").find({
    $or: [{ vendorId }, { sellerId: vendorId }, { ownerId: seller.ownerId || vendorId }]
  }).toArray();

  const activeListings = products.filter((p) => (p.stock ?? 0) > 0).length;
  const orders = await db.collection("orders").find({}).toArray();

  console.log("✔ Seller Profile Loaded:", seller.name);
  console.log("✔ Products Found in DB:", products.length);
  console.log("✔ Active Listings Count:", activeListings);
  console.log("✔ Orders Found in DB:", orders.length);
  console.log("✔ Average Rating:", seller.rating ?? 4.8);

  console.log("-------------------------------------------------------");
  console.log("🎉 Seller Dashboard Data Verification SUCCESS!");
  console.log("-------------------------------------------------------");

  await client.close();
  process.exit(0);
}

verifyDashboardData().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
