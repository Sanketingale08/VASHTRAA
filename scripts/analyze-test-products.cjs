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

async function main() {
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  });
  await client.connect();
  const db = client.db("VASTRAA");

  const allProducts = await db.collection("products").find({}).toArray();

  // Categorize products
  const liveE2eAndBulkTestProducts = allProducts.filter(p => {
    const name = p.name || '';
    const sku = p.sku || '';
    return name.startsWith("Test Saree") ||
           name.includes("17918") ||
           sku.startsWith("TEST-") ||
           sku.startsWith("E2E-LIVE-");
  });

  const gibberishProducts = allProducts.filter(p => {
    return p.id === "PS62" || p.name === "lkjgdf";
  });

  const remainingProducts = allProducts.filter(p => {
    const isTest = liveE2eAndBulkTestProducts.some(t => t.id === p.id);
    const isGibberish = gibberishProducts.some(g => g.id === p.id);
    return !isTest && !isGibberish;
  });

  console.log("=== CATEGORIZATION SUMMARY ===");
  console.log(`Total Products in DB: ${allProducts.length}`);
  console.log(`\n[Group A] E2E / Bulk-Import Test Products (${liveE2eAndBulkTestProducts.length} items):`);
  liveE2eAndBulkTestProducts.forEach(p => console.log(`  - [${p.id}] "${p.name}" (SKU: ${p.sku})`));

  console.log(`\n[Group B] Gibberish Test Product (${gibberishProducts.length} items):`);
  gibberishProducts.forEach(p => console.log(`  - [${p.id}] "${p.name}" (Description: ${p.description})`));

  console.log(`\n[Group C] Legitimate / Retained Products (${remainingProducts.length} items):`);
  remainingProducts.forEach(p => console.log(`  - [${p.id}] "${p.name}" (Vendor: ${p.vendorName}, Category: ${p.category})`));

  const testIds = [...liveE2eAndBulkTestProducts, ...gibberishProducts].map(p => p.id);
  const stockHistoryCount = await db.collection("stock_history").countDocuments({ productId: { $in: testIds } });
  const bulkBatchesCount = await db.collection("bulk_import_batches").countDocuments();

  console.log(`\nRelated Data:`);
  console.log(`- stock_history entries for test products: ${stockHistoryCount}`);
  console.log(`- bulk_import_batches total: ${bulkBatchesCount}`);

  await client.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
