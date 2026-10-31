import { MongoClient } from "mongodb";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "VASTRAA";

async function run() {
  console.log("==================================================");
  console.log("📦 VASTRAA DATABASE BACKUP & TARGETED CLEANUP");
  console.log("==================================================");

  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
  });

  await client.connect();
  const db = client.db(DB_NAME);
  console.log("Connected to MongoDB Atlas database:", DB_NAME);

  // ── 1. IDENTIFY TARGET TEST RECORDS ──────────────────────────────
  const testVendorIds = [
    "vendor-seller-p4",
    "VEND_PROFILE_TEST_A",
    "VEND_PROFILE_TEST_B",
    "VEND_DEMO_001",
    "VEND_TEST_A",
    "VEND_TEST_B"
  ];

  const testUserIds = [
    "USR2", // Google User (user.google@example.com)
    "USR3", // Checkout Tester
    "USR4", // Checkout Tester
    "USR5", // Checkout Tester
    "USR6", // Checkout Tester
    "USR_PROFILE_TEST_A",
    "USR_PROFILE_TEST_B",
    "USR_DEMO_SELLER",
    "USR_TEST_A",
    "USR_TEST_B",
    "test-customer-phase4"
  ];

  const testProductIds = [
    "PS143", // Yeola Pure Silk Paithani 1792058304107
    "DS144", // Zari Embellished Designer Saree 1792058304107
    "DR145", // Anarkali Floor Length Dress 1792058304107
    "LH146", // Bridal Velvet Lehenga Choli 1792058304107
    "PS147", // Test Saree Live 1792058320140
    "TEST_DEMO_PRODUCT_001",
    "650000000000000000000001",
    "650000000000000000000002"
  ];

  // Fetch records to backup
  const targetSellers = await db.collection("sellers").find({
    $or: [
      { id: { $in: testVendorIds } },
      { vendorId: { $in: testVendorIds } },
      { email: { $in: ["p4@example.com", "seller_profile_a@vastraa.com", "seller_profile_b@vastraa.com", "seller@vastraa.com"] } }
    ]
  }).toArray();

  const targetVendors = await db.collection("vendors").find({
    $or: [
      { id: { $in: testVendorIds } },
      { vendorId: { $in: testVendorIds } },
      { email: { $in: ["p4@example.com", "seller_profile_a@vastraa.com", "seller_profile_b@vastraa.com", "seller@vastraa.com"] } },
      { contactEmail: { $in: ["p4@example.com", "seller_profile_a@vastraa.com", "seller_profile_b@vastraa.com", "seller@vastraa.com"] } }
    ]
  }).toArray();

  const targetUsers = await db.collection("users").find({
    $or: [
      { id: { $in: testUserIds } },
      { _id: { $in: testUserIds } },
      { email: { $regex: /example\.com$|checkout_test_.*@vastraa\.com$|^checkout_test_user@vastraa\.com$/i } },
      { name: { $regex: /checkout tester/i } }
    ]
  }).toArray();

  const targetProducts = await db.collection("products").find({
    $or: [
      { id: { $in: testProductIds } },
      { _id: { $in: testProductIds } },
      { sku: { $regex: /E2E-LIVE|TEST-SKU/i } },
      { name: { $regex: /1792058304107|1792058320140|Test Saree/i } }
    ]
  }).toArray();

  const allOrders = await db.collection("orders").find({}).toArray();
  const targetOrders = allOrders.filter(o => {
    if (o.isDemo === true || o.isTest === true || o.demo === true || o.test === true) return true;
    const isP4 = (o.items || []).some(i => i.vendorId === "vendor-seller-p4" || i.productId === "650000000000000000000001" || i.productId === "650000000000000000000002");
    const isTester = String(o.customerName || "").toLowerCase().includes("tester") || String(o.address?.name || "").toLowerCase().includes("tester");
    const isP4User = String(o.userId || "").includes("p4") || String(o.userId || "").includes("test-customer");
    const hasTestEmail = String(o.customerEmail || o.address?.email || "").includes("example.com");
    return isP4 || isTester || isP4User || hasTestEmail;
  });

  const targetBatches = await db.collection("bulk_import_batches").find({}).toArray();

  const targetStockHistory = await db.collection("stock_history").find({
    productId: { $in: testProductIds }
  }).toArray();

  const targetNotifications = await db.collection("notifications").find({
    vendorId: { $in: testVendorIds }
  }).toArray();

  const backupData = {
    timestamp: new Date().toISOString(),
    counts: {
      sellers: targetSellers.length,
      vendors: targetVendors.length,
      users: targetUsers.length,
      products: targetProducts.length,
      orders: targetOrders.length,
      bulk_import_batches: targetBatches.length,
      stock_history: targetStockHistory.length,
      notifications: targetNotifications.length
    },
    targetSellers,
    targetVendors,
    targetUsers,
    targetProducts,
    targetOrders,
    targetBatches,
    targetStockHistory,
    targetNotifications
  };

  const backupPath = path.resolve(__dirname, "backup-test-data.json");
  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), "utf-8");
  console.log(`\n💾 Full backup successfully written to: ${backupPath}`);
  console.log("Records identified for cleanup:", backupData.counts);

  // ── 2. EXECUTE TARGETED DELETION ─────────────────────────────────
  console.log("\n🚀 Executing safe, targeted cleanup...");

  // Sellers
  const delSellers = await db.collection("sellers").deleteMany({
    _id: { $in: targetSellers.map(s => s._id) }
  });
  console.log(`- Cleaned sellers: ${delSellers.deletedCount}`);

  // Vendors
  const delVendors = await db.collection("vendors").deleteMany({
    _id: { $in: targetVendors.map(v => v._id) }
  });
  console.log(`- Cleaned vendors: ${delVendors.deletedCount}`);

  // Users
  const delUsers = await db.collection("users").deleteMany({
    _id: { $in: targetUsers.map(u => u._id) }
  });
  console.log(`- Cleaned users: ${delUsers.deletedCount}`);

  // Products
  const delProducts = await db.collection("products").deleteMany({
    _id: { $in: targetProducts.map(p => p._id) }
  });
  console.log(`- Cleaned products: ${delProducts.deletedCount}`);

  // Orders
  const delOrders = await db.collection("orders").deleteMany({
    _id: { $in: targetOrders.map(o => o._id) }
  });
  console.log(`- Cleaned orders: ${delOrders.deletedCount}`);

  // Bulk Import Batches
  const delBatches = await db.collection("bulk_import_batches").deleteMany({
    _id: { $in: targetBatches.map(b => b._id) }
  });
  console.log(`- Cleaned bulk import batches: ${delBatches.deletedCount}`);

  // Stock History
  const delStock = await db.collection("stock_history").deleteMany({
    productId: { $in: testProductIds }
  });
  console.log(`- Cleaned stock history entries: ${delStock.deletedCount}`);

  // Notifications
  const delNotifs = await db.collection("notifications").deleteMany({
    vendorId: { $in: testVendorIds }
  });
  console.log(`- Cleaned test notifications: ${delNotifs.deletedCount}`);

  // ── 3. VERIFY DATABASE HEALTH & REMAINING RECORDS ─────────────────
  console.log("\n📊 Verification of Remaining Records in DB:");
  const remainingSellers = await db.collection("sellers").find().toArray();
  console.log(`Sellers (${remainingSellers.length}):`, remainingSellers.map(s => ({ id: s.id || s._id, storeName: s.storeName, email: s.email, status: s.status })));

  const remainingVendors = await db.collection("vendors").find().toArray();
  console.log(`Vendors (${remainingVendors.length}):`, remainingVendors.map(v => ({ id: v.id || v._id, shopName: v.shopName || v.name, email: v.email, status: v.status })));

  const remainingUsers = await db.collection("users").find().toArray();
  console.log(`Users (${remainingUsers.length}):`, remainingUsers.map(u => ({ id: u.id || u._id, name: u.name, email: u.email, role: u.role })));

  const remainingProducts = await db.collection("products").countDocuments();
  console.log(`Products: ${remainingProducts}`);

  const remainingOrders = await db.collection("orders").find().toArray();
  console.log(`Orders (${remainingOrders.length}):`, remainingOrders.map(o => ({ id: o.id || o._id, displayId: o.displayId, name: o.customerName || o.address?.name, total: o.total })));

  await client.close();
  console.log("\n✨ Database cleanup and verification completed successfully!");
}

run().catch((err) => {
  console.error("Cleanup error:", err);
  process.exit(1);
});
