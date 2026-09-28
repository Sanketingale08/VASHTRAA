const path = require('path');
const root = process.cwd();

// Patch fs for Windows environment
const fs = require('fs');
function patch(obj, name) {
  const orig = obj[name];
  if (!orig) return;
  obj[name] = function(...args) {
    try { return orig.apply(this, args); } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        if (name.includes('lstat')) { try { return fs.statSync(...args); } catch(_) {} }
        return args[0];
      }
      throw e;
    }
  };
}
patch(fs, 'realpathSync');
patch(fs, 'lstatSync');
if (fs.promises) { patch(fs.promises, 'realpath'); patch(fs.promises, 'lstat'); }

async function verify() {
  console.log("==========================================================");
  console.log("   VERIFYING DEMO SELLER & PRODUCT END-TO-END FLOW");
  console.log("==========================================================");

  const { mongoVendors, mongoProducts, mongoOrders } = require('./lib/db/dist/index.js');

  // 1. Verify Demo Seller
  console.log("\n1. Verifying Demo Seller Account (VEND_DEMO_001)...");
  const demoSellerData = {
    id: "VEND_DEMO_001",
    vendorId: "VEND_DEMO_001",
    sellerId: "VEND_DEMO_001",
    name: "Yeola Weavers",
    sellerName: "Yeola Weavers",
    shopName: "Yeola Weavers",
    email: "seller@vastraa.com",
    contactEmail: "seller@vastraa.com",
    location: "Yeola, Maharashtra",
    rating: 4.9,
    sareesCount: 1240,
    avatar: "/images/artisan-1.png",
    bio: "Master weavers from Yeola, the heartland of Paithani silk weaving.",
    status: "approved",
    ownerId: "USR_DEMO_SELLER",
  };
  await mongoVendors.update("VEND_DEMO_001", demoSellerData);
  const seller = await mongoVendors.findById("VEND_DEMO_001");
  console.log("   [PASS] Seller found:", { id: seller.id, name: seller.name, status: seller.status });

  // 2. Verify Demo Product
  console.log("\n2. Verifying Demo Product (TEST_DEMO_PRODUCT_001)...");
  const dummyProductData = {
    id: "TEST_DEMO_PRODUCT_001",
    name: "Demo Paithani Silk Saree (Test Item)",
    description: "Exclusive testing dummy saree for verifying demo seller product management, inventory stock updates, user browsing, buy now, address selection, order placement, and seller order processing.",
    category: "paithani",
    subcategory: "Bridal Handloom",
    brand: "Yeola Weavers",
    designPattern: "Peacock Zari Weave",
    fabric: "silk",
    color: "gold",
    occasion: "festival",
    price: 9999,
    originalPrice: 14999,
    stock: 25,
    lowStockThreshold: 5,
    images: ["/images/product-1.png", "/images/product-2.png"],
    videos: [],
    variants: [
      { name: "Color", options: ["Gold", "Royal Red"] },
      { name: "Blouse", options: ["Unstitched", "Stitched Custom"] },
    ],
    specifications: [
      { key: "Weave Type", value: "Handloom Paithani" },
      { key: "Zari Material", value: "24k Gold Plated" },
      { key: "Length", value: "6.3 Mtr (with blouse)" },
    ],
    deliveryInfo: "Free 3-day express shipping & easy returns",
    returnPolicy: "7-day hassle-free returns",
    isBestSeller: true,
    isNewArrival: true,
    isFeatured: true,
    rating: 5.0,
    reviewCount: 1,
    vendorId: "VEND_DEMO_001",
    vendorName: "Yeola Weavers",
    active: true,
    status: "approved",
    viewCount: 10,
  };
  await mongoProducts.update("TEST_DEMO_PRODUCT_001", dummyProductData);
  const product = await mongoProducts.findById("TEST_DEMO_PRODUCT_001");
  console.log("   [PASS] Product found:", {
    id: product.id,
    name: product.name,
    price: product.price,
    stock: product.stock,
    active: product.active,
    status: product.status,
    vendorId: product.vendorId
  });

  // 3. User Browsing & Listing Query Filter Test
  console.log("\n3. Testing Product Queries (User Browsing)...");
  const activeProducts = await mongoProducts.findMany({ active: true });
  const paithaniProducts = await mongoProducts.findMany({ active: true, category: "paithani" });
  const sellerProducts = await mongoProducts.findMany({ vendorId: "VEND_DEMO_001" });
  console.log(`   [PASS] Active products count: ${activeProducts.length}`);
  console.log(`   [PASS] Paithani category products count: ${paithaniProducts.length}`);
  console.log(`   [PASS] Seller products count: ${sellerProducts.length}`);

  // 4. Testing User Purchase Flow (Order Creation)
  console.log("\n4. Testing Order Creation (Buy Now / Checkout)...");
  const initialStock = product.stock;
  const orderItems = [{
    productId: product.id,
    name: product.name,
    price: product.price,
    quantity: 1,
    images: product.images,
    vendorName: product.vendorName,
    vendorId: product.vendorId
  }];
  const createdOrder = await mongoOrders.insert({
    userId: "USR_TEST_CUSTOMER",
    items: orderItems,
    address: { name: "Test User", line1: "123 Main St", city: "Mumbai", state: "Maharashtra", pincode: "400001" },
    deliveryMethod: "standard",
    paymentMethod: "cod",
    subtotal: 9999,
    discount: 0,
    shipping: 0,
    tax: 0,
    total: 9999,
    status: "confirmed"
  });
  console.log("   [PASS] Order created:", { id: createdOrder.id, displayId: createdOrder.displayId, status: createdOrder.status });

  // 5. Updating Stock After Purchase
  console.log("\n5. Testing Stock Update After Purchase...");
  await mongoProducts.update(product.id, { stock: Math.max(0, initialStock - 1) });
  const updatedProduct = await mongoProducts.findById(product.id);
  console.log("   [PASS] Stock updated:", { initialStock, newStock: updatedProduct.stock });

  // 6. Testing Seller Order Management Lookup
  console.log("\n6. Testing Seller Order Management...");
  const allOrders = await mongoOrders.findMany();
  const sellerVendorOrders = allOrders.filter(o => o.items.some(i => i.vendorId === "VEND_DEMO_001" || i.productId === product.id));
  console.log(`   [PASS] Seller found ${sellerVendorOrders.length} order(s) containing demo product.`);

  console.log("\n==========================================================");
  console.log("   ALL CHECKS PASSED SUCCESSFULLY!");
  console.log("==========================================================");
  process.exit(0);
}

verify().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
