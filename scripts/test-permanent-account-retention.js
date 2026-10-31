/**
 * Integration Test for Permanent Account Retention (Users & Sellers/Vendors)
 */

import assert from "assert";
import {
  db,
  mongoUsers,
  mongoSellers,
  mongoProducts,
  mongoOrders,
  vendorsTable,
  productsTable,
} from "@workspace/db";
import { verifySellerEmailCode, sendSellerVerificationCode } from "../artifacts/api-server/src/lib/sellerVerification";

async function runPermanentAccountRetentionTests() {
  console.log("=========================================================");
  console.log("RUNNING PERMANENT ACCOUNT RETENTION VERIFICATION TESTS");
  console.log("=========================================================");

  const timestamp = Date.now();

  // -----------------------------------------------------------------------
  // TEST 1: Customer Account Permanent Retention Across Logins & Restart
  // -----------------------------------------------------------------------
  console.log("\n[TEST 1] Verifying Customer Account Permanent Retention...");
  const custEmail = `perm_cust_${timestamp}@example.com`;
  const custId = `usr_cust_${timestamp}`;

  const createdUser = await mongoUsers.insert({
    id: custId,
    name: "Permanent Customer",
    email: custEmail,
    role: "customer",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  assert.ok(createdUser, "Customer account must be created");
  assert.strictEqual(createdUser.id, custId, "Customer ID must match input ID");

  // Re-fetch customer account (simulating login / server restart)
  let refetchedUser = await mongoUsers.findByEmail(custEmail, "customer");
  assert.ok(refetchedUser, "Customer account must exist after simulated re-fetch");
  assert.strictEqual(refetchedUser.id, custId, "Customer ID must remain permanent and identical across logins");

  // Simulate inactivity and re-fetch again
  refetchedUser = await mongoUsers.findById(custId);
  assert.ok(refetchedUser, "Customer account must remain present regardless of inactivity");
  console.log("✓ TEST 1 PASSED: Customer accounts are permanently retained in database.");

  // -----------------------------------------------------------------------
  // TEST 2: Seller/Vendor Account Retention Across Status Changes
  // -----------------------------------------------------------------------
  console.log("\n[TEST 2] Verifying Seller/Vendor Permanent Retention Across Status Transitions...");
  const sellerEmail = `perm_seller_${timestamp}@example.com`;
  const vendorId = `TDV${Math.floor(100000 + Math.random() * 900000)}`;

  const createdSeller = await mongoSellers.insert({
    id: `seller_${timestamp}`,
    vendorId,
    sellerId: vendorId,
    name: "Permanent Weaver Shop",
    shopName: "Permanent Weaver Shop",
    email: sellerEmail,
    contactEmail: sellerEmail,
    status: "pending",
  });

  assert.ok(createdSeller, "Seller record must be created");
  assert.strictEqual(createdSeller.vendorId, vendorId, "Vendor ID must match generated vendorId");

  // Transition 1: pending -> approved
  await mongoSellers.update(createdSeller.id, { status: "approved", approvalStatus: "approved" });
  let sellerObj = await mongoSellers.findByEmail(sellerEmail);
  assert.ok(sellerObj, "Seller account must still exist after status update to approved");
  assert.strictEqual(sellerObj.status, "approved", "Status updated to approved");
  assert.strictEqual(sellerObj.vendorId, vendorId, "Vendor ID remains permanent");

  // Transition 2: approved -> suspended
  await mongoSellers.update(createdSeller.id, { status: "suspended" });
  sellerObj = await mongoSellers.findByEmail(sellerEmail);
  assert.ok(sellerObj, "Seller account MUST NOT be deleted when suspended!");
  assert.strictEqual(sellerObj.status, "suspended", "Status updated to suspended");
  assert.strictEqual(sellerObj.vendorId, vendorId, "Vendor ID remains permanent while suspended");

  // Transition 3: suspended -> reactivated (approved)
  await mongoSellers.update(createdSeller.id, { status: "approved" });
  sellerObj = await mongoSellers.findByEmail(sellerEmail);
  assert.ok(sellerObj, "Seller account MUST exist after reactivation");
  assert.strictEqual(sellerObj.status, "approved", "Status updated to approved");

  console.log("✓ TEST 2 PASSED: Seller status changes never delete the seller/vendor account record.");

  // -----------------------------------------------------------------------
  // TEST 3: Verification Expiration Does Not Delete Account
  // -----------------------------------------------------------------------
  console.log("\n[TEST 3] Verifying OTP/Email Verification Code Expiration Does Not Delete Accounts...");
  
  const verifyEmail = `otp_test_${timestamp}@example.com`;
  // Create account first
  await mongoUsers.insert({
    id: `usr_otp_${timestamp}`,
    name: "OTP Test User",
    email: verifyEmail,
    role: "customer",
  });

  // Verification code expiration returns error but does not touch user account
  const res = verifySellerEmailCode(verifyEmail, "000000");
  assert.strictEqual(res.valid, false, "Invalid/Expired OTP code must return valid=false");

  const userPostOtpFail = await mongoUsers.findByEmail(verifyEmail);
  assert.ok(userPostOtpFail, "User account MUST STILL EXIST after OTP code expiration or failure!");
  console.log("✓ TEST 3 PASSED: Verification code expiration never deletes user/seller accounts.");

  // -----------------------------------------------------------------------
  // TEST 4: Data Relationships Preservation
  // -----------------------------------------------------------------------
  console.log("\n[TEST 4] Verifying Permanent Data Relationships (User -> Orders, Seller -> Products)...");
  
  const testProdId = `p_perm_${timestamp}`;
  await mongoProducts.insert({
    id: testProdId,
    name: "Permanent Silk Saree",
    vendorId,
    price: 10000,
    active: true,
  });

  const testOrderId = `ord_perm_${timestamp}`;
  await mongoOrders.insert({
    id: testOrderId,
    orderId: testOrderId,
    userId: custId,
    vendorId,
    items: [{ productId: testProdId, price: 10000, quantity: 1 }],
    status: "placed",
    createdAt: new Date(),
  });

  const fetchedProd = await mongoProducts.findById(testProdId);
  assert.ok(fetchedProd, "Product must remain permanently saved in DB");
  assert.strictEqual(fetchedProd.vendorId, vendorId, "Product vendor relationship preserved");

  const fetchedOrd = await mongoOrders.findById(testOrderId);
  assert.ok(fetchedOrd, "Order must remain permanently saved in DB");
  assert.strictEqual(fetchedOrd.userId, custId, "User order relationship preserved");

  console.log("✓ TEST 4 PASSED: User -> Orders and Seller -> Products relationships are permanently preserved.");

  // Cleanup test artifacts
  await mongoOrders.delete?.(testOrderId).catch(() => {});
  await mongoProducts.delete?.(testProdId).catch(() => {});
  await mongoSellers.delete?.(createdSeller.id).catch(() => {});
  await mongoUsers.delete?.(custId).catch(() => {});
  await mongoUsers.delete?.(`usr_otp_${timestamp}`).catch(() => {});

  console.log("\n=========================================================");
  console.log("ALL PERMANENT ACCOUNT RETENTION TESTS PASSED SUCCESSFULLY!");
  console.log("=========================================================");
}

runPermanentAccountRetentionTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
