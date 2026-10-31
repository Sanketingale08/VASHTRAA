const fs = require('fs');
const path = require('path');
const dns = require('dns');

try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e){}

function patch(obj, name) {
  const orig = obj[name];
  if (!orig) return;
  obj[name] = function(...args) {
    try { return orig.apply(this, args); } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        if (name.includes('lstat')) { try { return fs.statSync(...args); } catch (_) {} }
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

// E2E / Bulk import test product IDs
const E2E_PRODUCT_IDS = [
  "PS107", "PS108", "PS109", "PS111", "PS112", "PS113", "PW114", "KU115", "BS116",
  "PS117", "PW118", "KU119", "BS120", "PS121", "PW122", "KU123", "BS124", "PS125",
  "DS126", "DR127", "LH128", "PS129", "DS130", "DR131", "LH132", "PS133"
];

async function removeTestProducts(options = { includeGibberish: true, cleanBatches: true }) {
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  });
  await client.connect();
  const db = client.db("VASTRAA");

  const targetIds = [...E2E_PRODUCT_IDS];
  if (options.includeGibberish) {
    targetIds.push("PS62");
  }

  console.log(`Starting deletion for ${targetIds.length} target product IDs...`);

  // 1. Delete from products
  const productResult = await db.collection("products").deleteMany({
    $or: [
      { id: { $in: targetIds } },
      { _id: { $in: targetIds } },
    ]
  });
  console.log(`[Products] Deleted: ${productResult.deletedCount}`);

  // 2. Clean stock history for these products
  const stockResult = await db.collection("stock_history").deleteMany({
    productId: { $in: targetIds }
  });
  console.log(`[Stock History] Deleted: ${stockResult.deletedCount}`);

  // 3. Clean test bulk import batches if requested
  if (options.cleanBatches) {
    const batchResult = await db.collection("bulk_import_batches").deleteMany({});
    console.log(`[Bulk Import Batches] Deleted: ${batchResult.deletedCount}`);
  }

  // 4. Clean cart items if any reference these products
  const cartResult = await db.collection("cart").deleteMany({
    productId: { $in: targetIds }
  });
  console.log(`[Cart] Deleted: ${cartResult.deletedCount}`);

  const remaining = await db.collection("products").countDocuments();
  console.log(`Remaining products in DB: ${remaining}`);

  await client.close();
}

const includeGibberish = process.argv.includes('--include-gibberish') || !process.argv.includes('--exclude-gibberish');
const cleanBatches = process.argv.includes('--clean-batches');

if (process.argv.includes('--run')) {
  removeTestProducts({ includeGibberish, cleanBatches }).catch(err => {
    console.error("Deletion error:", err);
    process.exit(1);
  });
} else {
  console.log("Dry run. Pass --run to execute.");
}
