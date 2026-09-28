import crypto from "crypto";
import { mongoUsers, mongoVendors, mongoSellers, getCollection, isMongoDbConnected, setMongoConnected } from "@workspace/db";
import { hashPassword, verifyPassword } from "./passwords";
import { sendPasswordResetEmail } from "./transactionalEmail";
import { logger } from "./logger";

export interface PasswordResetToken {
  id: string;
  token: string;
  userId: string;
  email: string;
  targetRole: "customer" | "seller";
  expiresAt: Date;
  used: boolean;
  createdAt: Date;
  usedAt?: Date;
}

// In-memory token store for high performance and offline fallback
const inMemoryResetTokens = new Map<string, PasswordResetToken>();

// Periodically purge expired tokens from memory
setInterval(() => {
  const now = new Date();
  for (const [key, t] of inMemoryResetTokens.entries()) {
    if (t.expiresAt < now) {
      inMemoryResetTokens.delete(key);
    }
  }
}, 60_000).unref();

/**
 * Retrieves a token record by token string from MongoDB or in-memory fallback.
 */
async function findTokenRecord(tokenString: string): Promise<PasswordResetToken | null> {
  if (!tokenString) return null;
  const cleanToken = tokenString.trim();

  if (isMongoDbConnected()) {
    try {
      const col = getCollection<PasswordResetToken>("password_reset_tokens");
      const found = await col.findOne({ token: cleanToken });
      if (found) return found;
    } catch {
      setMongoConnected(false);
    }
  }

  return inMemoryResetTokens.get(cleanToken) || null;
}

/**
 * Saves or updates a token record in MongoDB and in-memory fallback.
 */
async function saveTokenRecord(tokenRecord: PasswordResetToken): Promise<void> {
  inMemoryResetTokens.set(tokenRecord.token, tokenRecord);

  if (isMongoDbConnected()) {
    try {
      const col = getCollection<PasswordResetToken>("password_reset_tokens");
      await col.updateOne(
        { token: tokenRecord.token },
        { $set: tokenRecord },
        { upsert: true }
      );
    } catch (err: any) {
      setMongoConnected(false);
      logger.warn({ err: err?.message }, "[PasswordReset] Saved token to in-memory fallback store");
    }
  }
}

/**
 * Invalidates any existing unused tokens for a specific email and targetRole.
 */
async function invalidatePreviousTokens(email: string, targetRole: "customer" | "seller"): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();

  for (const [token, record] of inMemoryResetTokens.entries()) {
    if (record.email === cleanEmail && record.targetRole === targetRole && !record.used) {
      record.used = true;
      record.usedAt = new Date();
      inMemoryResetTokens.set(token, record);
    }
  }

  if (isMongoDbConnected()) {
    try {
      const col = getCollection<PasswordResetToken>("password_reset_tokens");
      await col.updateMany(
        { email: cleanEmail, targetRole, used: false },
        { $set: { used: true, usedAt: new Date() } }
      );
    } catch {
      setMongoConnected(false);
    }
  }
}

/**
 * Requests a password reset link for a given email and account role.
 * Securely handles email matching without exposing whether an account exists.
 */
export async function requestPasswordReset(
  rawEmail: string,
  targetRole: "customer" | "seller",
  originUrl?: string
): Promise<{ success: boolean; message?: string; error?: string; debugResetUrl?: string }> {
  if (!rawEmail || typeof rawEmail !== "string" || !rawEmail.trim()) {
    return {
      success: true,
      message: "If an account with that email address exists, a password reset link has been sent to your email.",
    };
  }

  const cleanEmail = rawEmail.trim().toLowerCase();

  // Determine user / seller account based on targetRole
  let userOrSeller: { id: string; name: string; email: string } | null = null;

  if (targetRole === "seller") {
    // For sellers, search dedicated Seller data collection
    const seller = await mongoSellers.findByEmail(cleanEmail);
    if (seller) {
      userOrSeller = {
        id: seller.id,
        name: seller.name || seller.sellerName || seller.shopName || "Seller Partner",
        email: seller.email || seller.contactEmail || cleanEmail,
      };
    } else {
      // Check seller role user in mongoUsers
      const u = await mongoUsers.findByEmail(cleanEmail);
      if (u && u.role === "seller") {
        userOrSeller = { id: u.id, name: u.name, email: u.email };
      } else {
        // Check vendorsTable in PostgreSQL database
        try {
          const { db, vendorsTable } = await import("@workspace/db");
          const { eq } = await import("drizzle-orm");
          const vendors = await db
            .select()
            .from(vendorsTable)
            .where(eq(vendorsTable.contactEmail, cleanEmail))
            .limit(1);
          if (vendors.length > 0) {
            const v = vendors[0];
            userOrSeller = {
              id: v.id,
              name: v.name || "Seller Partner",
              email: v.contactEmail || cleanEmail,
            };
          }
        } catch (err: any) {
          logger.warn({ err: err?.message, email: cleanEmail }, "[PasswordReset] Error querying vendorsTable");
        }
      }
    }
  } else {
    // For customer users
    const u = await mongoUsers.findByEmail(cleanEmail);
    if (u && u.role !== "seller") {
      userOrSeller = { id: u.id, name: u.name, email: u.email };
    }
  }

  if (userOrSeller) {
    // Invalidate prior active tokens for this email + role
    await invalidatePreviousTokens(cleanEmail, targetRole);

    // Generate 64-character cryptographically secure token
    const tokenString = crypto.randomBytes(32).toString("hex");
    const id = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour expiration

    const tokenRecord: PasswordResetToken = {
      id,
      token: tokenString,
      userId: userOrSeller.id,
      email: cleanEmail,
      targetRole,
      expiresAt,
      used: false,
      createdAt: now,
    };

    await saveTokenRecord(tokenRecord);

    // Build reset URL
    const baseUrl = (originUrl || "http://localhost:5000").replace(/\/$/, "");
    const resetPath = targetRole === "seller" ? "/seller/reset-password" : "/reset-password";
    const resetUrl = `${baseUrl}${resetPath}?token=${tokenString}`;

    // Send email
    const emailResult = await sendPasswordResetEmail({
      toEmail: cleanEmail,
      name: userOrSeller.name || (targetRole === "seller" ? "Seller Partner" : "Customer"),
      resetUrl,
      targetRole,
    });

    if (!emailResult.delivered) {
      logger.error(
        { userId: userOrSeller.id, email: cleanEmail, targetRole, error: emailResult.error },
        "[PasswordReset] Reset email delivery failed"
      );
      return {
        success: false,
        error: emailResult.error
          ? `Email delivery failed: ${emailResult.error}`
          : "We were unable to deliver the reset email. Please check server email configuration or try again later.",
      };
    }

    logger.info(
      { userId: userOrSeller.id, email: cleanEmail, targetRole, resetUrl },
      "[PasswordReset] Password reset token generated and email process completed"
    );

    return {
      success: true,
      message: "If an account with that email address exists, a password reset link has been sent to your email.",
      debugResetUrl: emailResult.debugResetUrl || resetUrl,
    };
  }

  logger.info({ email: cleanEmail, targetRole }, "[PasswordReset] Reset requested for non-existing or mismatched account");

  return {
    success: true,
    message: "If an account with that email address exists, a password reset link has been sent to your email.",
  };
}

/**
 * Validates a reset token before displaying the reset password form.
 */
export async function validateResetToken(
  tokenString: string,
  expectedRole: "customer" | "seller"
): Promise<{ valid: boolean; error?: string; email?: string; targetRole?: "customer" | "seller" }> {
  if (!tokenString || typeof tokenString !== "string" || !tokenString.trim()) {
    return { valid: false, error: "Invalid password reset token." };
  }

  const record = await findTokenRecord(tokenString.trim());

  if (!record) {
    return { valid: false, error: "Invalid or expired password reset link. Please request a new one." };
  }

  if (record.used) {
    return { valid: false, error: "This password reset link has already been used. Please request a new one." };
  }

  if (record.expiresAt < new Date()) {
    return { valid: false, error: "This password reset link has expired. Please request a new one." };
  }

  if (record.targetRole !== expectedRole) {
    const intended = record.targetRole === "seller" ? "seller" : "user";
    return {
      valid: false,
      error: `This password reset link is intended for ${intended} accounts and cannot be used here.`,
    };
  }

  return {
    valid: true,
    email: record.email,
    targetRole: record.targetRole,
  };
}

/**
 * Executes password update for a validated reset token.
 */
export async function performPasswordReset(
  tokenString: string,
  newPassword: string,
  confirmPassword: string,
  expectedRole: "customer" | "seller"
): Promise<{ success: boolean; error?: string; message?: string }> {
  const validation = await validateResetToken(tokenString, expectedRole);

  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  if (!newPassword || typeof newPassword !== "string") {
    return { success: false, error: "New Password is required." };
  }

  if (!confirmPassword || typeof confirmPassword !== "string") {
    return { success: false, error: "Confirm New Password is required." };
  }

  if (newPassword.length < 6) {
    return { success: false, error: "Password must be at least 6 characters long." };
  }

  if (newPassword !== confirmPassword) {
    return { success: false, error: "Passwords do not match." };
  }

  const record = (await findTokenRecord(tokenString.trim()))!;

  // Hash new password securely with PBKDF2
  const newPasswordHash = hashPassword(newPassword);

  if (expectedRole === "seller") {
    let seller = await mongoSellers.findById(record.userId) || await mongoSellers.findByEmail(record.email);
    if (seller) {
      await mongoSellers.update(seller.id, {
        passwordHash: newPasswordHash,
        updatedAt: new Date(),
      });
      if (seller.ownerId) {
        await mongoUsers.update(seller.ownerId, { passwordHash: newPasswordHash, updatedAt: new Date() }).catch(() => {});
      }
    } else {
      let u = await mongoUsers.findByEmail(record.email);
      if (u) {
        await mongoUsers.update(u.id, { passwordHash: newPasswordHash, updatedAt: new Date() });
      } else {
        return { success: false, error: "Account associated with this reset link no longer exists." };
      }
    }
  } else {
    let user = await mongoUsers.findById(record.userId) || await mongoUsers.findByEmail(record.email);
    if (!user) {
      return { success: false, error: "Account associated with this reset link no longer exists." };
    }
    await mongoUsers.update(user.id, {
      passwordHash: newPasswordHash,
      updatedAt: new Date(),
    });
  }

  // Mark token as used
  record.used = true;
  record.usedAt = new Date();
  await saveTokenRecord(record);

  // Invalidate all other tokens for this email + role
  await invalidatePreviousTokens(record.email, expectedRole);

  // Revoke all active sessions for this account upon password reset for security
  try {
    const { revokeAllUserSessions } = await import("./sessions");
    await revokeAllUserSessions(record.userId, expectedRole, "password_reset");
  } catch {}

  logger.info({ email: record.email, targetRole: expectedRole }, "[PasswordReset] Successfully updated password");

  return {
    success: true,
    message: "Your password has been updated successfully. You can now sign in with your new password.",
  };
}
