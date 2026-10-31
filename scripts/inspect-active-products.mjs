import { MongoClient } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

async function inspectActiveProducts() {
  console.log("-------------------------------------------------------");
  console.log("🔍 Inspecting Active Products in MongoDB...");
  console.log("-------------------------------------------------------");

  const client = new MongoClient(MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  await client.connect();
  const db = client.db(DB_NAME);

  const allProducts = await db.collection("products").find({}).toArray();
  console.log(`Total Products in Mongo: ${allProducts.length}`);

  const activeProducts = allProducts.filter(p => p.active === true);
  console.log(`Active Products in Mongo (active === true): ${activeProducts.length}`);

  activeProducts.forEach((p, idx) => {
    console.log(`\nProduct #${idx + 1}:`, {
      id: p.id,
      name: p.name,
      active: p.active,
      status: p.status,
      category: p.category,
      vendorId: p.vendorId,
      vendorName: p.vendorName,
      price: p.price,
    });
  });

  const allSellers = await db.collection("sellers").find({}).toArray();
  console.log(`\nTotal Sellers in Mongo: ${allSellers.length}`);
  allSellers.forEach((s, idx) => {
    console.log(`Seller #${idx + 1}:`, {
      id: s.id,
      vendorId: s.vendorId,
      sellerId: s.sellerId,
      ownerId: s.ownerId,
      status: s.status,
      shopName: s.shopName || s.name,
      email: s.email,
    });
  });

  await client.close();
}

inspectActiveProducts().catch(err => {
  console.error("Inspection error:", err);
  process.exit(1);
});
