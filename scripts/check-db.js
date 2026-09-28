const fs = require('fs');
const path = require('path');
const dns = require('dns');
try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e){}

const mongoPath = path.join(process.cwd(), 'node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');
const { MongoClient } = require(mongoPath);

const MONGODB_URI = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "VASTRAA";

async function run() {
  console.log("Connecting to MongoDB Atlas...");
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();
  console.log("Collections in DB:", collections.map(c => c.name));

  for (const colName of ["sellers", "vendors", "products", "users", "orders"]) {
    const docs = await db.collection(colName).find({}).toArray();
    console.log(`\n=================== ${colName.toUpperCase()} (${docs.length}) ===================`);
    docs.forEach(d => console.log(JSON.stringify(d, null, 2)));
  }

  await client.close();
  process.exit(0);
}

run().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
