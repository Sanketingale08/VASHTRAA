import fs from 'fs';

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

import { MongoClient } from 'mongodb';

const MONGODB_URI = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "VASTRAA";

async function main() {
  console.log("=== INSPECTING MONGODB ATLAS ===");
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const db = client.db(DB_NAME);

  const collections = await db.listCollections().toArray();
  console.log("Collections:", collections.map(c => c.name));

  const sellers = await db.collection("sellers").find({}).toArray();
  const vendors = await db.collection("vendors").find({}).toArray();
  console.log(`\nSellers collection count: ${sellers.length}`);
  console.log(`Vendors collection count: ${vendors.length}`);

  const allSellers = sellers.length > 0 ? sellers : vendors;
  console.log("Sellers/Vendors in DB:");
  allSellers.forEach(s => {
    console.log({
      _id: s._id,
      id: s.id,
      sellerId: s.sellerId,
      vendorId: s.vendorId,
      name: s.name || s.sellerName || s.shopName,
      email: s.email || s.contactEmail,
      status: s.status,
      ownerId: s.ownerId
    });
  });

  const products = await db.collection("products").find({}).toArray();
  console.log(`\nProducts collection count: ${products.length}`);
  products.forEach(p => {
    console.log("Product:", {
      _id: p._id,
      id: p.id,
      name: p.name,
      vendorId: p.vendorId,
      sellerId: p.sellerId,
      vendorName: p.vendorName,
      active: p.active,
      status: p.status,
      approvalStatus: p.approvalStatus,
      stock: p.stock,
      price: p.price,
      category: p.category,
      images: p.images,
    });
  });

  await client.close();
  process.exit(0);
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
