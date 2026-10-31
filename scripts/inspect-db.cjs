const fs = require('fs');
const path = require('path');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

function patch(obj, name) {
  const orig = obj[name];
  if (!orig) return;
  obj[name] = function(...args) {
    try {
      return orig.apply(this, args);
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        if (name.includes('lstat')) {
          try { return fs.statSync(...args); } catch(_) {}
        }
        return args[0];
      }
      throw e;
    }
  };
}

patch(fs, 'realpathSync');
patch(fs, 'lstatSync');
if (fs.promises) {
  patch(fs.promises, 'realpath');
  patch(fs.promises, 'lstat');
}

const root = path.resolve(__dirname, '..');
const mongoPath = path.join(root, 'node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');
const { MongoClient } = require(mongoPath);

const MONGODB_URI = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "VASTRAA";

async function main() {
  console.log("=== INSPECTING MONGODB ATLAS DATABASE ===");
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();
  console.log("Collections in DB:", collections.map(c => c.name));

  const sellers = await db.collection("sellers").find({}).toArray();
  const vendors = await db.collection("vendors").find({}).toArray();
  console.log(`\n--- SELLERS (${sellers.length}) ---`);
  sellers.forEach(s => {
    console.log(JSON.stringify(s, null, 2));
  });

  console.log(`\n--- VENDORS (${vendors.length}) ---`);
  vendors.forEach(v => {
    console.log(JSON.stringify(v, null, 2));
  });

  const users = await db.collection("users").find({}).toArray();
  console.log(`\n--- USERS (${users.length}) ---`);
  users.forEach(u => {
    console.log(JSON.stringify(u, null, 2));
  });

  const products = await db.collection("products").find({}).toArray();
  console.log(`\n--- PRODUCTS (${products.length}) ---`);
  products.forEach(p => {
    console.log(JSON.stringify(p, null, 2));
  });

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
