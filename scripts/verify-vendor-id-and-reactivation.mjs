import { formatVendorId, getNextSequenceValue } from "../lib/db/src/mongo.ts";
import { mongoSellers } from "../lib/db/src/mongoRepositories.ts";

async function runVerification() {
  console.log("==========================================");
  console.log("VERIFYING VENDOR ID & REACTIVATION FLOW");
  console.log("==========================================");

  // 1. Format Vendor ID test
  console.log("\n1. Testing Vendor ID Formatting:");
  const id1 = formatVendorId(1);
  const id25 = formatVendorId(25);
  const id999999 = formatVendorId(999999);
  const id1000000 = formatVendorId(1000000);

  console.log(`- Sequence 1: ${id1} (Expected: TDV000001)`);
  console.log(`- Sequence 25: ${id25} (Expected: TDV000025)`);
  console.log(`- Sequence 999999: ${id999999} (Expected: TDV999999)`);
  console.log(`- Sequence 1000000: ${id1000000} (Expected: TDV1000000)`);

  if (id1 !== "TDV000001" || id25 !== "TDV000025" || id999999 !== "TDV999999" || id1000000 !== "TDV1000000") {
    throw new Error("Vendor ID formatting mismatch!");
  }
  console.log("✅ Vendor ID formatting passed.");

  // 2. Sequential counter test
  console.log("\n2. Testing Sequential Concurrency-Safe Counter:");
  const seqA = await getNextSequenceValue("test_seq");
  const seqB = await getNextSequenceValue("test_seq");
  const seqC = await getNextSequenceValue("test_seq");

  console.log(`- Next seq A: ${seqA}, B: ${seqB}, C: ${seqC}`);
  if (seqB !== seqA + 1 || seqC !== seqB + 1) {
    throw new Error("Sequence counter is not strictly sequential!");
  }
  console.log("✅ Sequential counter test passed.");

  // 3. New Seller Registration (Pending) -> No Vendor ID initially
  console.log("\n3. Testing Seller Registration (Pending):");
  const registeredSeller = await mongoSellers.insert({
    name: "Verification Sarees",
    email: `seller_${Date.now()}@example.com`,
    status: "pending",
  });

  console.log(`- Registered Seller Status: ${registeredSeller.status}`);
  console.log(`- Registered Seller Vendor ID: ${registeredSeller.vendorId || "null"}`);
  if (registeredSeller.status !== "pending") {
    throw new Error("Registered seller status should be pending!");
  }
  console.log("✅ Pending registration passed.");

  // 4. Admin Approval -> Generates Vendor ID
  console.log("\n4. Testing Super Admin Approval (Pending -> Approved):");
  const approvedSeller = await mongoSellers.update(registeredSeller.id, {
    status: "approved",
  });

  console.log(`- Approved Seller Status: ${approvedSeller?.status}`);
  console.log(`- Approved Seller Vendor ID: ${approvedSeller?.vendorId}`);
  if (!approvedSeller?.vendorId || !approvedSeller.vendorId.startsWith("TDV")) {
    throw new Error("Approval did not generate a valid Vendor ID!");
  }
  const assignedVendorId = approvedSeller.vendorId;
  console.log("✅ Vendor ID generation on approval passed.");

  // 5. Duplicate Approval / Re-call -> Keeps Same Vendor ID
  console.log("\n5. Testing Idempotent Approval (No duplicate Vendor ID generation):");
  const reApprovedSeller = await mongoSellers.update(registeredSeller.id, {
    status: "approved",
  });
  console.log(`- Re-approved Seller Vendor ID: ${reApprovedSeller?.vendorId}`);
  if (reApprovedSeller?.vendorId !== assignedVendorId) {
    throw new Error("Vendor ID changed during re-approval!");
  }
  console.log("✅ Idempotent approval passed.");

  // 6. Seller Profile Update -> Vendor ID remains unchanged
  console.log("\n6. Testing Seller Profile Update (Vendor ID Immutability):");
  const updatedSeller = await mongoSellers.update(registeredSeller.id, {
    name: "Verification Sarees Updated",
    mobile: "9876543210",
    vendorId: "HACKED_ID_ATTEMPT", // should be ignored by mongoSellers.update
  });

  console.log(`- Updated Seller Name: ${updatedSeller?.name}`);
  console.log(`- Updated Seller Vendor ID: ${updatedSeller?.vendorId}`);
  if (updatedSeller?.vendorId !== assignedVendorId) {
    throw new Error("Vendor ID was modified during profile update!");
  }
  console.log("✅ Vendor ID immutability passed.");

  // 7. Deactivation (Approved -> Suspended) -> Vendor ID remains unchanged
  console.log("\n7. Testing Seller Deactivation:");
  const deactivatedSeller = await mongoSellers.update(registeredSeller.id, {
    status: "suspended",
  });
  console.log(`- Deactivated Seller Status: ${deactivatedSeller?.status}`);
  console.log(`- Deactivated Seller Vendor ID: ${deactivatedSeller?.vendorId}`);
  console.log(`- Reactivation Welcome Pending: ${deactivatedSeller?.reactivationWelcomePending}`);
  if (deactivatedSeller?.status !== "suspended" || deactivatedSeller?.vendorId !== assignedVendorId) {
    throw new Error("Vendor ID changed or status invalid on deactivation!");
  }
  console.log("✅ Deactivation passed.");

  // 8. Reactivation (Suspended -> Approved) -> Sets reactivationWelcomePending = true, Keeps Vendor ID
  console.log("\n8. Testing Super Admin Reactivation:");
  const reactivatedSeller = await mongoSellers.update(registeredSeller.id, {
    status: "approved",
  });
  console.log(`- Reactivated Seller Status: ${reactivatedSeller?.status}`);
  console.log(`- Reactivated Seller Vendor ID: ${reactivatedSeller?.vendorId}`);
  console.log(`- Reactivation Welcome Pending: ${reactivatedSeller?.reactivationWelcomePending}`);

  if (reactivatedSeller?.status !== "approved" || reactivatedSeller?.vendorId !== assignedVendorId) {
    throw new Error("Vendor ID changed on reactivation!");
  }
  if (!reactivatedSeller?.reactivationWelcomePending) {
    throw new Error("reactivationWelcomePending was NOT set to true on reactivation!");
  }
  console.log("✅ Reactivation passed.");

  // 9. Dismiss Reactivation Welcome Popup -> Clears flag
  console.log("\n9. Testing Dismiss Reactivation Welcome Popup:");
  const dismissedSeller = await mongoSellers.update(registeredSeller.id, {
    reactivationWelcomePending: false,
  });
  console.log(`- Reactivation Welcome Pending after dismiss: ${dismissedSeller?.reactivationWelcomePending}`);
  if (dismissedSeller?.reactivationWelcomePending !== false) {
    throw new Error("reactivationWelcomePending was not cleared on dismiss!");
  }
  console.log("✅ Dismiss reactivation welcome passed.");

  console.log("\n==========================================");
  console.log("ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!");
  console.log("==========================================");
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
