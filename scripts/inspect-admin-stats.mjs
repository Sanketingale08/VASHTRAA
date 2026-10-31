import { MongoClient } from "mongodb";

const DIRECT_MONGODB_URI = "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017,cluster0-shard-00-01.5dccwdu.mongodb.net:27017,cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?replicaSet=atlas-13v68x-shard-0&ssl=true&authSource=admin&retryWrites=true&w=majority";
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

async function inspectStats() {
  const client = new MongoClient(DIRECT_MONGODB_URI, {
    maxPoolSize: 25,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  await client.connect();
  const db = client.db(DB_NAME);

  console.log("--- Inspecting MongoDB Collections for Admin Stats ---");

  const usersCount = await db.collection("users").countDocuments();
  const sellersCount = await db.collection("sellers").countDocuments();
  const vendorsCount = await db.collection("vendors").countDocuments();
  const productsCount = await db.collection("products").countDocuments();
  const ordersCount = await db.collection("orders").countDocuments();

  console.log(`users count: ${usersCount}`);
  console.log(`sellers count: ${sellersCount}`);
  console.log(`vendors count: ${vendorsCount}`);
  console.log(`products count: ${productsCount}`);
  console.log(`orders count: ${ordersCount}`);

  const sellersSample = await db.collection("sellers").find({}).limit(5).toArray();
  console.log("sellers status sample:", sellersSample.map(s => ({ id: s.id, name: s.name, status: s.status })));

  const ordersSample = await db.collection("orders").find({}).limit(5).toArray();
  console.log("orders sample:", ordersSample.map(o => ({ id: o.id, total: o.total, status: o.status, createdAt: o.createdAt })));

  await client.close();
}

inspectStats().catch(console.error);
