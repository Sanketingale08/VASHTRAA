/**
 * Integration Test for Strict Product-Vendor Relationship & Enforcement
 */

import assert from "assert";
import {
  db,
  mongoSellers,
  mongoProducts,
  mongoUsers,
  vendorsTable,
  productsTable,
} from "@workspace/db";
import { searchProducts } from "../artifacts/api-server/src/lib/searchEngine";
import { getApprovedVendorData, isProductVendorValid } from "../artifacts/api-server/src/lib/vendorValidation";

async function runProductVendorRelationshipTests() {
  console.log("=================================================");
  console.log("RUNNING STRICT PRODUCT-VENDOR RELATIONSHIP TESTS");
  console.log("=================================================");

  const timestamp = Date.now();
  const testVendorId = `v_strict_${timestamp}`;
  const testSellerId = `s_strict_${timestamp}`;
  const testProductId = `p_strict_${timestamp}`;

  // Clean up any existing state
  try {
    // 1. Create a test seller with approved status
    await mongoSellers.insert({
      id: testVendorId,
      vendorId: testVendorId,
      sellerId: testSellerId,
      name: `Strict Test Vendor ${timestamp}`,
      shopName: `Strict Test Vendor ${timestamp}`,
      email: `strict_${timestamp}@example.com`,
      status: "approved",
    });

    // 2. Create a test product assigned to this test vendor
    await mongoProducts.insert({
      id: testProductId,
      name: `Strict Handloom Silk Saree ${timestamp}`,
      price: 15000,
      vendorId: testVendorId,
      vendorName: `Strict Test Vendor ${timestamp}`,
      active: true,
      status: "approved",
    });

    console.log("\n[TEST 1] Active Vendor -> Product Visibility");
    const approvedData1 = await getApprovedVendorData(true);
    assert.ok(approvedData1.ids.has(testVendorId), "Approved vendor ID must exist in approved vendor data");
    
    const prod1 = await mongoProducts.findById(testProductId);
    assert.ok(isProductVendorValid(prod1, approvedData1), "Product with approved vendor MUST be valid");
    
    const searchRes1 = await searchProducts({ ids: [testProductId] });
    assert.strictEqual(searchRes1.products.length, 1, "Product must appear on User Panel when vendor is approved");
    console.log("✓ TEST 1 PASSED: Product appears on User Panel when vendor exists and is approved.");

    console.log("\n[TEST 2] Vendor Deactivation / Suspension -> Product Invisibility");
    // Suspend vendor
    await mongoSellers.update(testVendorId, { status: "suspended" });

    const approvedData2 = await getApprovedVendorData(true);
    assert.ok(!approvedData2.ids.has(testVendorId), "Suspended vendor ID must NOT exist in approved vendor data");

    assert.strictEqual(isProductVendorValid(prod1, approvedData2), false, "Product of suspended vendor MUST NOT be valid");

    const searchRes2 = await searchProducts({ ids: [testProductId] });
    assert.strictEqual(searchRes2.products.length, 0, "Product must NOT appear on User Panel when vendor is suspended");
    console.log("✓ TEST 2 PASSED: Product automatically stops appearing on User Panel when vendor is suspended.");

    console.log("\n[TEST 3] Vendor Reactivation -> Product Restored Visibility");
    // Reactivate vendor
    await mongoSellers.update(testVendorId, { status: "approved" });

    const approvedData3 = await getApprovedVendorData(true);
    assert.ok(approvedData3.ids.has(testVendorId), "Reapproved vendor ID must exist in approved vendor data");

    const searchRes3 = await searchProducts({ ids: [testProductId] });
    assert.strictEqual(searchRes3.products.length, 1, "Product must reappear on User Panel when vendor is reapproved");
    console.log("✓ TEST 3 PASSED: Product becomes visible again when vendor is reactivated.");

    console.log("\n[TEST 4] Orphaned Product (Missing/Invalid Vendor) -> Invisibility");
    const orphanProductId = `p_orphan_${timestamp}`;
    await mongoProducts.insert({
      id: orphanProductId,
      name: `Orphaned Saree ${timestamp}`,
      price: 5000,
      vendorId: `non_existent_vendor_${timestamp}`,
      vendorName: "Unknown NonExistent Vendor",
      active: true,
      status: "approved",
    });

    const orphanProd = await mongoProducts.findById(orphanProductId);
    const approvedData4 = await getApprovedVendorData(true);
    assert.strictEqual(isProductVendorValid(orphanProd, approvedData4), false, "Orphaned product MUST be invalid");

    const searchRes4 = await searchProducts({ ids: [orphanProductId] });
    assert.strictEqual(searchRes4.products.length, 0, "Orphaned product must NOT appear on User Panel");
    console.log("✓ TEST 4 PASSED: Orphaned products without existing valid vendors are excluded from User Panel.");

    console.log("\n[TEST 5] Zero Valid Vendors -> Zero Displayed Products");
    const mockEmptyData = { ids: new Set(), names: new Set() };
    assert.strictEqual(isProductVendorValid(prod1, mockEmptyData), false, "Product is invalid when zero approved vendors exist");
    console.log("✓ TEST 5 PASSED: Zero valid vendors guarantees zero products displayed.");

  } finally {
    // Cleanup test records
    await mongoProducts.delete(testProductId).catch(() => {});
    await mongoProducts.delete(`p_orphan_${timestamp}`).catch(() => {});
    await mongoSellers.delete(testVendorId).catch(() => {});
  }

  console.log("\n=================================================");
  console.log("ALL PRODUCT-VENDOR RELATIONSHIP TESTS PASSED!");
  console.log("=================================================");
}

runProductVendorRelationshipTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution error:", err);
    process.exit(1);
  });
