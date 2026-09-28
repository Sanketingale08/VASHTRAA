import { requestPasswordReset, validateResetToken, performPasswordReset } from "../lib/passwordReset";
import { mongoUsers, mongoSellers as mongoVendors } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/passwords";

async function runVerification() {
  console.log("=== Starting Password Reset Verification ===");

  const custEmail = "user.test@vastraa.com";
  const sellerEmail = "seller.test@vastraa.com";
  const oldPass = "OldPass123";
  const newPass = "NewPass456";

  // 1. Setup Customer User in DB
  const oldHash = hashPassword(oldPass);
  let custUser = await mongoUsers.findByEmail(custEmail);
  if (!custUser) {
    custUser = await mongoUsers.insert({
      name: "Customer User Test",
      email: custEmail,
      passwordHash: oldHash,
      role: "customer",
    });
  } else {
    await mongoUsers.update(custUser.id, { passwordHash: oldHash, role: "customer" });
  }

  // 2. Setup Seller User in DB
  let sellerUser = await mongoUsers.findByEmail(sellerEmail);
  if (!sellerUser) {
    sellerUser = await mongoUsers.insert({
      name: "Seller Partner Test",
      email: sellerEmail,
      passwordHash: oldHash,
      role: "seller",
    });
    await mongoVendors.insert({
      name: "Seller Partner Shop",
      contactEmail: sellerEmail,
      ownerId: sellerUser.id,
      status: "approved",
    });
  } else {
    await mongoUsers.update(sellerUser.id, { passwordHash: oldHash, role: "seller" });
  }

  console.log("✓ Test users initialized");

  // 3. User Forgot Password Request
  const reqCust = await requestPasswordReset(custEmail, "customer", "http://localhost:5000");
  console.log("✓ User Forgot Password requested:", reqCust.success, reqCust.debugResetUrl);
  if (!reqCust.debugResetUrl) throw new Error("Missing debugResetUrl for user");

  // Extract token
  const custToken = new URL(reqCust.debugResetUrl).searchParams.get("token")!;
  console.log("✓ Extracted Customer Token:", custToken.substring(0, 10) + "...");

  // 4. Validate Token
  const valCust = await validateResetToken(custToken, "customer");
  console.log("✓ Validated Customer Token:", valCust.valid, valCust.email);
  if (!valCust.valid) throw new Error("Token validation failed");

  // 5. Test Role Isolation (Seller reset page validating user token must FAIL)
  const crossVal1 = await validateResetToken(custToken, "seller");
  console.log("✓ Cross-Role Isolation Test 1 (User token on seller route): valid =", crossVal1.valid, "(error:", crossVal1.error, ")");
  if (crossVal1.valid) throw new Error("Role isolation failed! User token allowed on seller endpoint");

  // 6. Execute Password Reset for User
  const resetCust = await performPasswordReset(custToken, newPass, newPass, "customer");
  console.log("✓ User Password Reset executed:", resetCust.success, resetCust.message);
  if (!resetCust.success) throw new Error("User password reset failed: " + resetCust.error);

  // 7. Test Token Invalidation / Single-Use
  const revalCust = await validateResetToken(custToken, "customer");
  console.log("✓ Token Single-Use Test (Re-using used token): valid =", revalCust.valid, "(error:", revalCust.error, ")");
  if (revalCust.valid) throw new Error("Single-use enforcement failed! Token reusable");

  // 8. Verify Updated Database Credentials for User
  const updatedCust = await mongoUsers.findByEmail(custEmail);
  const isOldCustPassValid = verifyPassword(oldPass, updatedCust!.passwordHash);
  const isNewCustPassValid = verifyPassword(newPass, updatedCust!.passwordHash);
  console.log("✓ User Old Password Works:", isOldCustPassValid, "(Expected: false)");
  console.log("✓ User New Password Works:", isNewCustPassValid, "(Expected: true)");
  if (isOldCustPassValid || !isNewCustPassValid) throw new Error("Database password hash update failed for user");

  // 9. Seller Forgot Password Request
  const reqSeller = await requestPasswordReset(sellerEmail, "seller", "http://localhost:5000");
  console.log("✓ Seller Forgot Password requested:", reqSeller.success, reqSeller.debugResetUrl);
  const sellerToken = new URL(reqSeller.debugResetUrl!).searchParams.get("token")!;

  // 10. Test Role Isolation (User reset page validating seller token must FAIL)
  const crossVal2 = await validateResetToken(sellerToken, "customer");
  console.log("✓ Cross-Role Isolation Test 2 (Seller token on user route): valid =", crossVal2.valid, "(error:", crossVal2.error, ")");
  if (crossVal2.valid) throw new Error("Role isolation failed! Seller token allowed on user endpoint");

  // 11. Execute Password Reset for Seller
  const resetSeller = await performPasswordReset(sellerToken, newPass, newPass, "seller");
  console.log("✓ Seller Password Reset executed:", resetSeller.success, resetSeller.message);
  if (!resetSeller.success) throw new Error("Seller password reset failed: " + resetSeller.error);

  // 12. Verify Updated Database Credentials for Seller
  const updatedSeller = await mongoUsers.findByEmail(sellerEmail);
  const isOldSellerPassValid = verifyPassword(oldPass, updatedSeller!.passwordHash);
  const isNewSellerPassValid = verifyPassword(newPass, updatedSeller!.passwordHash);
  console.log("✓ Seller Old Password Works:", isOldSellerPassValid, "(Expected: false)");
  console.log("✓ Seller New Password Works:", isNewSellerPassValid, "(Expected: true)");
  if (isOldSellerPassValid || !isNewSellerPassValid) throw new Error("Database password hash update failed for seller");

  console.log("\n==================================================");
  console.log("🎉 ALL PASSWORD RESET VERIFICATION TESTS PASSED!");
  console.log("==================================================");
}

runVerification().catch((err) => {
  console.error("❌ Verification Failed:", err);
  process.exit(1);
});
