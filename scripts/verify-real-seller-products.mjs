import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI is not defined");
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI);

async function runVerification() {
  console.log("=== VASTRAA Verification: Real Seller Products & Dummy Data Removal ===\n");
  await client.connect();
  const db = client.db("VASTRAA");

  const sellersCol = db.collection("sellers");
  const vendorsCol = db.collection("vendors");
  const productsCol = db.collection("products");
  const usersCol = db.collection("users");
  const ordersCol = db.collection("orders");

  // Step 0: Verify initial DB State
  console.log("--- Step 0: Checking Clean Database State ---");
  const sellers = await sellersCol.find({}).toArray();
  const vendors = await vendorsCol.find({}).toArray();
  const products = await productsCol.find({}).toArray();
  const orders = await ordersCol.find({}).toArray();

  console.log(`Active Sellers in DB: ${sellers.length}`);
  sellers.forEach(s => console.log(`  - Seller ID: ${s.sellerId || s.id}, Name: ${s.name || s.shopName}, Status: ${s.status}`));

  console.log(`Active Vendors in DB: ${vendors.length}`);
  vendors.forEach(v => console.log(`  - Vendor ID: ${v.vendorId || v.id}, Name: ${v.name}, Status: ${v.status}`));

  console.log(`Active Products in DB: ${products.length}`);
  console.log(`Genuine Customer Orders in DB: ${orders.length}`);

  if (sellers.length !== 1 || (sellers[0].sellerId !== "seller_sanket_ingale_001" && sellers[0].id !== "seller_sanket_ingale_001")) {
    console.error("FAILED: Expected exactly 1 genuine seller ('seller_sanket_ingale_001')");
    process.exit(1);
  }
  console.log("PASS: Only genuine seller exists in database.\n");

  // Dynamic import of backend vendor validation
  const { isProductVendorValid, getApprovedVendorData } = await import("../artifacts/api-server/src/lib/vendorValidation.ts");
  const { searchProducts } = await import("../artifacts/api-server/src/lib/searchEngine.ts");
  const { bootstrapDatabase } = await import("../artifacts/api-server/src/lib/bootstrapDatabase.ts");

  // SCENARIO 1: No real products in the database -> customer search returns empty array
  console.log("--- SCENARIO 1: No real products in the database ---");
  const emptySearch = await searchProducts({});
  console.log(`Customer API search result count: ${emptySearch.products.length}, total: ${emptySearch.total}`);
  if (emptySearch.products.length !== 0 || emptySearch.total !== 0) {
    console.error("FAILED: Scenario 1 - Search did not return 0 products!");
    process.exit(1);
  }
  console.log("PASS: Customer search returns clean empty results.\n");

  // SCENARIO 2: Seller adds a product -> it remains hidden until admin approval
  console.log("--- SCENARIO 2: Seller adds product (status: pending, active: false) ---");
  const testProductId = "PS_VERIFY_TEMP_001";
  const sellerProductDoc = {
    id: testProductId,
    name: "Kange Collection Verified Pure Silk Paithani",
    description: "Authentic handloom Paithani handcrafted by registered artisan.",
    category: "paithani",
    fabric: "silk",
    color: "gold",
    occasion: "festival",
    price: 18500,
    basePrice: 16000,
    shippingFee: 100,
    vendorId: "seller_sanket_ingale_001",
    sellerId: "seller_sanket_ingale_001",
    vendorName: "Kange Collection",
    images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c"],
    status: "pending",
    active: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await productsCol.insertOne(sellerProductDoc);
  console.log(`Inserted pending product ${testProductId} by seller_sanket_ingale_001`);

  const approvedData = await getApprovedVendorData(true);
  const isValidWhilePending = isProductVendorValid(sellerProductDoc, approvedData);
  console.log(`isProductVendorValid while pending: ${isValidWhilePending}`);

  const searchWhilePending = await searchProducts({});
  console.log(`Customer search count while product is pending: ${searchWhilePending.products.length}`);

  if (isValidWhilePending !== false || searchWhilePending.products.length !== 0) {
    console.error("FAILED: Scenario 2 - Pending product must not be eligible or visible to customers!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log("PASS: Pending seller product remains hidden from customer-facing searches.\n");

  // SCENARIO 3: Admin approves the product -> it appears on customer-facing pages
  console.log("--- SCENARIO 3: Admin approves the product ---");
  await productsCol.updateOne(
    { id: testProductId },
    { $set: { status: "approved", active: true, approvalRemark: "Verified genuine artisan handloom" } }
  );

  const approvedProductDoc = await productsCol.findOne({ id: testProductId });
  const isValidAfterApproval = isProductVendorValid(approvedProductDoc, approvedData);
  console.log(`isProductVendorValid after approval: ${isValidAfterApproval}`);

  const searchAfterApproval = await searchProducts({});
  console.log(`Customer search count after admin approval: ${searchAfterApproval.products.length}`);
  const foundInSearch = searchAfterApproval.products.find(p => p.id === testProductId);

  if (!isValidAfterApproval || !foundInSearch) {
    console.error("FAILED: Scenario 3 - Approved product did not appear in customer results!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log(`PASS: Approved product '${foundInSearch.name}' appears on customer-facing search.\n`);

  // SCENARIO 4: Test product with demo/test flags never appears in production
  console.log("--- SCENARIO 4: Test/demo product flags rejection ---");
  const dummyProductSample = {
    id: "test-dummy-123",
    name: "Sample Test Paithani Saree",
    category: "paithani",
    vendorId: "seller_sanket_ingale_001",
    status: "approved",
    active: true,
    isDemo: true,
  };
  const isDummyValid = isProductVendorValid(dummyProductSample, approvedData);
  console.log(`isProductVendorValid for dummy product (isDemo: true): ${isDummyValid}`);
  if (isDummyValid !== false) {
    console.error("FAILED: Scenario 4 - Test product was not rejected!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log("PASS: Dummy and test products are strictly rejected.\n");

  // SCENARIO 5: Test seller or test account products never appear in production
  console.log("--- SCENARIO 5: Test seller product rejection ---");
  const testSellerProduct = {
    id: "PS_FROM_TEST_SELLER",
    name: "Paithani From Test Vendor",
    category: "paithani",
    vendorId: "test-vendor-fake-999",
    status: "approved",
    active: true,
  };
  const isTestSellerValid = isProductVendorValid(testSellerProduct, approvedData);
  console.log(`isProductVendorValid for product with test vendor ID: ${isTestSellerValid}`);
  if (isTestSellerValid !== false) {
    console.error("FAILED: Scenario 5 - Product with test vendor was not rejected!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log("PASS: Products from test or unapproved sellers are strictly rejected.\n");

  // SCENARIO 6: Genuine seller's product appears under correct seller & category, NOT under another seller
  console.log("--- SCENARIO 6: Product ownership & shop isolation ---");
  const searchForSanketShop = await searchProducts({ vendorId: "seller_sanket_ingale_001" });
  console.log(`Products in Sanket's shop: ${searchForSanketShop.products.length}`);

  const searchForOtherShop = await searchProducts({ vendorId: "non_existent_or_other_vendor" });
  console.log(`Products in non-existent/other seller's shop: ${searchForOtherShop.products.length}`);

  if (searchForSanketShop.products.length !== 1 || searchForOtherShop.products.length !== 0) {
    console.error("FAILED: Scenario 6 - Seller shop isolation failed!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log("PASS: Products from one seller never appear under another seller's shop.\n");

  // SCENARIO 7: Server restart or redeployment -> no dummy products or auto-approvals
  console.log("--- SCENARIO 7: Server bootstrap/restart safety ---");
  await bootstrapDatabase();
  const productsAfterRestart = await productsCol.find({}).toArray();
  const dummyProductsInDb = productsAfterRestart.filter(p => p.id !== testProductId);
  console.log(`Products count after bootstrap: ${productsAfterRestart.length}`);
  if (dummyProductsInDb.length > 0) {
    console.error("FAILED: Scenario 7 - Bootstrap seeded dummy products into database!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log("PASS: Server bootstrap inserted 0 dummy products and preserved database integrity.\n");

  // SCENARIO 8: Missing seller information -> rejected
  console.log("--- SCENARIO 8: Missing seller rejection ---");
  const missingSellerProduct = {
    id: "PS_MISSING_VENDOR",
    name: "Orphan Saree",
    category: "paithani",
    status: "approved",
    active: true,
  };
  const isMissingVendorValid = isProductVendorValid(missingSellerProduct, approvedData);
  console.log(`isProductVendorValid for missing vendor product: ${isMissingVendorValid}`);
  if (isMissingVendorValid !== false) {
    console.error("FAILED: Scenario 8 - Missing seller was permitted!");
    await productsCol.deleteOne({ id: testProductId });
    process.exit(1);
  }
  console.log("PASS: Missing seller info is strictly rejected.\n");

  // CLEANUP: Remove verification product
  console.log("--- CLEANUP: Removing temporary verification product ---");
  await productsCol.deleteOne({ id: testProductId });
  const finalProductCount = await productsCol.countDocuments({});
  console.log(`Final product count in MongoDB Atlas: ${finalProductCount}`);

  console.log("\nALL 8 SCENARIOS VERIFIED SUCCESSFULLY!");
  await client.close();
}

runVerification().catch(err => {
  console.error("Verification failed with error:", err);
  process.exit(1);
});
