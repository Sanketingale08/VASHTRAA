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
          try { return fs.statSync(...args); } catch (_) {}
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

async function main() {
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  const db = client.db("VASTRAA");

  const products = await db.collection("products").find({}).toArray();
  console.log(`\n=== ALL PRODUCTS IN DB (${products.length}) ===\n`);

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    console.log(`[${i + 1}] ID: ${p.id || p._id}`);
    console.log(`    Name: "${p.name}"`);
    console.log(`    Vendor: "${p.vendorName}" (${p.vendorId})`);
    console.log(`    Category: "${p.category}", Price: ₹${p.price}`);
    console.log(`    Active: ${p.active}, Status: ${p.status}`);
    console.log(`    Created: ${p.createdAt}`);
    console.log(`    SKU: ${p.sku}`);
    console.log('----------------------------------------------------');
  }

  // Check related references
  const orders = await db.collection("orders").find({}).toArray();
  console.log(`\n=== ORDERS COUNT: ${orders.length} ===`);

  const cart = await db.collection("cart").find({}).toArray();
  console.log(`=== CART ITEMS COUNT: ${cart.length} ===`);

  const reviews = await db.collection("reviews").find({}).toArray();
  console.log(`=== REVIEWS COUNT: ${reviews.length} ===\n`);

  await client.close();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
