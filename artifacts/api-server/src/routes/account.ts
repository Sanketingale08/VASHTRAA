import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { mongoUsers } from "@workspace/db";
import { Resend } from "resend";
import crypto from "crypto";
import { emitUserEvent } from "../lib/socket";
import { sendTransactionalEmail, sendAccountSecurityAlertEmail } from "../lib/transactionalEmail";

const router = Router();


// ─── In-memory phone OTP store ──────────────────────────────────────────────
// userId → { otpHash, phone, expiresAt, lastRequestAt, requests: Date[], attempts: number }
interface OtpEntry {
  otpHash: string;
  phone: string;
  expiresAt: Date;
  lastRequestAt: Date;
  requests: Date[];
  attempts: number;     // verify attempts for brute-force protection
}
const phoneOtpStore = new Map<string, OtpEntry>();

const OTP_TTL_MS      = 10 * 60 * 1000;  // 10 minutes
const COOLDOWN_MS     = 30 * 1000;       // 30 seconds resend cooldown
const RATE_LIMIT      = 5;               // max OTP *send* requests per hour
const RATE_WINDOW     = 60 * 60 * 1000;  // 1 hour
const MAX_VERIFY_TRIES = 5;              // max verify attempts before OTP is invalidated

function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999));
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp.trim()).digest("hex");
}

async function getUserEmail(userId: string, fallbackEmail?: string | null): Promise<string | null> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  // 1. Check fallbackEmail from authenticated request
  if (fallbackEmail && emailRegex.test(fallbackEmail.trim())) {
    return fallbackEmail.trim().toLowerCase();
  }
  // 2. Check if userId is itself an email address
  if (emailRegex.test(userId.trim())) {
    return userId.trim().toLowerCase();
  }
  // 3. Mongo user lookup by id or email
  try {
    const mongoUser = await mongoUsers.findById(userId);
    if (mongoUser?.email && emailRegex.test(mongoUser.email)) {
      return mongoUser.email.trim().toLowerCase();
    }
    const mongoUserByEmail = await mongoUsers.findByEmail(userId, "customer");
    if (mongoUserByEmail?.email && emailRegex.test(mongoUserByEmail.email)) {
      return mongoUserByEmail.email.trim().toLowerCase();
    }
  } catch { /* ignore */ }
  // 4. Clerk user lookup
  try {
    const u = await clerkClient.users.getUser(userId);
    const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null;
    if (email && emailRegex.test(email)) return email.trim().toLowerCase();
  } catch { /* ignore */ }

  return null;
}

// ─── In-memory email change OTP store ─────────────────────────────────────
interface EmailOtpEntry {
  otpHash: string;
  newEmail: string;
  expiresAt: Date;
  lastRequestAt: Date;
  requests: Date[];
  attempts: number;
}
const emailOtpStore = new Map<string, EmailOtpEntry>();

async function sendOtpEmail(toEmail: string, otp: string, phone: string): Promise<{ delivered: boolean; error?: string }> {
  try {
    const result = await sendTransactionalEmail({
      userId: toEmail,
      toEmail,
      type: "phone_change_otp",
      reference: otp,
      note: `Use this verification code to update your registered mobile number to +91 ${phone}.`,
    });

    if (result.delivered) {
      return { delivered: true };
    }

    return { delivered: false, error: result.error || "Email delivery failed" };
  } catch (err: any) {
    return { delivered: false, error: err?.message || "Failed to dispatch verification email" };
  }
}

async function sendEmailChangeOtpEmail(toEmail: string, otp: string): Promise<{ delivered: boolean; error?: string }> {
  try {
    const result = await sendTransactionalEmail({
      userId: toEmail,
      toEmail,
      type: "email_change_otp",
      reference: otp,
      note: "Use this verification code to confirm your new email address.",
    });

    if (result.delivered) {
      return { delivered: true };
    }

    return { delivered: false, error: result.error || "Email delivery failed" };
  } catch (err: any) {
    return { delivered: false, error: err?.message || "Failed to dispatch verification email" };
  }
}

// ─── Profile GET ─────────────────────────────────────────────────────────────
router.get("/account/profile", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const userId = req.userId;
    let mongoUser = await mongoUsers.findById(userId);
    if (!mongoUser && req.user?.email) {
      mongoUser = await mongoUsers.findByEmail(req.user.email, req.userRole || "customer");
    }

    let firstName = "";
    let lastName = "";
    if (mongoUser?.name) {
      const parts = mongoUser.name.split(" ");
      firstName = parts[0] || "";
      lastName = parts.slice(1).join(" ") || "";
    }

    let email = mongoUser?.email || req.user?.email || "";
    let phone = mongoUser?.phone || "";
    let alternateMobile = mongoUser?.alternateMobile || "";
    let dateOfBirth = mongoUser?.dateOfBirth || "";
    let gender = mongoUser?.gender || "";
    let location = mongoUser?.location || "";
    let language = mongoUser?.language || "English";
    let profilePicture = (mongoUser as any)?.profilePicture || (mongoUser as any)?.avatar || "";
    let address = (mongoUser as any)?.address || "";

    // If address is not explicitly on mongoUser, try to fetch default address from saved addresses
    if (!address) {
      try {
        const { mongoAddresses } = await import("@workspace/db");
        const addrs = await mongoAddresses.findByUserId(userId);
        const defAddr = addrs.find((a) => a.isDefault) || addrs[0];
        if (defAddr) {
          address = [defAddr.line1, defAddr.line2, defAddr.city, defAddr.state, defAddr.pincode].filter(Boolean).join(", ");
        }
      } catch { /* ignore */ }
    }

    // Merge Clerk user metadata fallback if available
    try {
      const clerkUser = await clerkClient.users.getUser(userId);
      if (clerkUser) {
        if (!firstName) firstName = clerkUser.firstName || "";
        if (!lastName) lastName = clerkUser.lastName || "";
        if (!email) email = clerkUser.primaryEmailAddress?.emailAddress || "";
        if (!profilePicture && clerkUser.imageUrl) profilePicture = clerkUser.imageUrl;
        const meta = (clerkUser.publicMetadata ?? {}) as Record<string, string>;
        if (!phone && meta.phone) phone = meta.phone;
        if (!alternateMobile && meta.alternateMobile) alternateMobile = meta.alternateMobile;
        if (!dateOfBirth && meta.dateOfBirth) dateOfBirth = meta.dateOfBirth;
        if (!gender && meta.gender) gender = meta.gender;
        if (!location && meta.location) location = meta.location;
        if (!language && meta.language) language = meta.language;
        if (!profilePicture && meta.profilePicture) profilePicture = meta.profilePicture;
        if (!address && meta.address) address = meta.address;
      }
    } catch { /* ignore */ }

    const fullName = [firstName, lastName].filter(Boolean).join(" ") || mongoUser?.name || "Customer";

    res.json({
      success: true,
      user: {
        id: userId,
        name: fullName,
        firstName,
        lastName,
        email,
        role: mongoUser?.role || req.userRole || "customer",
        phone,
        alternateMobile,
        dateOfBirth,
        gender,
        location,
        language,
        profilePicture,
        avatar: profilePicture,
        address,
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to fetch profile");
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// ─── Phone OTP: request ──────────────────────────────────────────────────────
router.post("/account/phone-otp/request", requireAuth, async (req: any, res: any): Promise<void> => {
  const { phone } = req.body;
  if (!phone || !/^\d{10}$/.test(phone)) {
    res.status(400).json({ error: "A valid 10-digit phone number is required." });
    return;
  }
  const userId: string = req.userId;
  const now = new Date();

  // Rate limiting & cooldown
  const entry = phoneOtpStore.get(userId);
  if (entry) {
    const timeSinceLast = now.getTime() - entry.lastRequestAt.getTime();
    if (timeSinceLast < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - timeSinceLast) / 1000);
      res.status(429).json({ error: `Please wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before requesting another code.` });
      return;
    }
  }
  const recentRequests = (entry?.requests ?? []).filter(
    (d) => now.getTime() - d.getTime() < RATE_WINDOW
  );
  if (recentRequests.length >= RATE_LIMIT) {
    res.status(429).json({ error: "Too many OTP requests. Please try again later." });
    return;
  }

  const toEmail = await getUserEmail(userId, req.user?.email || req.userEmail);
  if (!toEmail) {
    res.status(400).json({ error: "Could not resolve your registered email address. Please update your profile first." });
    return;
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  phoneOtpStore.set(userId, {
    otpHash,
    phone,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    lastRequestAt: now,
    requests: [...recentRequests, now],
    attempts: 0,
  });

  const sendRes = await sendOtpEmail(toEmail, otp, phone);
  if (!sendRes.delivered) {
    req.log?.error({ error: sendRes.error }, "[phone-otp] Failed to send OTP email — invalidating entry");
    phoneOtpStore.delete(userId);
    res.status(500).json({
      error: `Failed to deliver verification email to ${toEmail}: ${sendRes.error || "Email service unavailable"}. Please ensure email settings are configured in Admin Settings.`,
    });
    return;
  }

  res.json({
    success: true,
    sentTo: toEmail.replace(/^(.{2})(.*)(@.+)$/, "$1***$3"),
    message: `Verification code sent successfully to ${toEmail}.`,
  });
});

// ─── Phone OTP: verify ───────────────────────────────────────────────────────
router.post("/account/phone-otp/verify", requireAuth, async (req: any, res: any): Promise<void> => {
  const { phone, code } = req.body;
  if (!phone || !code) {
    res.status(400).json({ error: "Phone and code are required." });
    return;
  }
  const userId: string = req.userId;
  const entry = phoneOtpStore.get(userId);

  if (!entry) {
    res.status(400).json({ error: "No pending verification. Please request a new code." });
    return;
  }
  if (new Date() > entry.expiresAt) {
    phoneOtpStore.delete(userId);
    res.status(400).json({ error: "Verification code has expired. Please request a new one." });
    return;
  }
  if (entry.phone !== phone) {
    res.status(400).json({ error: "Phone number does not match the pending verification." });
    return;
  }

  // Brute-force protection: max attempts before OTP is invalidated
  if (entry.attempts >= MAX_VERIFY_TRIES) {
    phoneOtpStore.delete(userId);
    res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    return;
  }

  const codeHash = hashOtp(String(code).trim());
  if (entry.otpHash !== codeHash) {
    entry.attempts += 1;
    const remaining = MAX_VERIFY_TRIES - entry.attempts;
    if (remaining <= 0) {
      phoneOtpStore.delete(userId);
      res.status(429).json({ error: "Too many incorrect attempts. Please request a new code." });
    } else {
      res.status(400).json({
        error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
      });
    }
    return;
  }

  // OTP valid — update phone in database and metadata
  phoneOtpStore.delete(userId);
  try {
    const updatedUser = await mongoUsers.update(userId, { phone, updatedAt: new Date() });
    try {
      await clerkClient.users.updateUserMetadata(userId, {
        publicMetadata: { phone },
      });
    } catch { /* ignore Clerk errors for custom auth users */ }

    emitUserEvent(userId, "profile:updated", { user: updatedUser, phone });
    res.json({ success: true, phone, user: updatedUser });
  } catch (err) {
    req.log?.error({ err }, "[phone-otp] Failed to update phone number");
    res.status(500).json({ error: "Failed to update phone number. Please try again." });
  }
});

// ─── Email OTP: request ──────────────────────────────────────────────────────
router.post("/account/email-otp/request", requireAuth, async (req: any, res: any): Promise<void> => {
  const { newEmail } = req.body || {};
  if (!newEmail || typeof newEmail !== "string" || !newEmail.trim()) {
    res.status(400).json({ error: "Please enter a valid new email address." });
    return;
  }

  const cleanNewEmail = newEmail.trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(cleanNewEmail)) {
    res.status(400).json({ error: "Please enter a valid email address." });
    return;
  }

  const userId: string = req.userId;
  const currentUser = await mongoUsers.findById(userId);
  if (currentUser && (currentUser.email || "").toLowerCase() === cleanNewEmail) {
    res.status(400).json({ error: "New email address must be different from your current email address." });
    return;
  }

  // Check if new email is registered by another Customer account
  const existingCustomer = await mongoUsers.findByEmail(cleanNewEmail, "customer");
  if (existingCustomer && existingCustomer.id !== userId && (existingCustomer as any)._id !== userId) {
    res.status(400).json({ error: "This email address is already registered with another Customer account." });
    return;
  }

  const now = new Date();
  const entry = emailOtpStore.get(userId);
  if (entry) {
    const timeSinceLast = now.getTime() - entry.lastRequestAt.getTime();
    if (timeSinceLast < COOLDOWN_MS) {
      const waitSec = Math.ceil((COOLDOWN_MS - timeSinceLast) / 1000);
      res.status(429).json({ error: `Please wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before requesting another code.` });
      return;
    }
  }
  const recentRequests = (entry?.requests ?? []).filter(
    (d) => now.getTime() - d.getTime() < RATE_WINDOW
  );
  if (recentRequests.length >= RATE_LIMIT) {
    res.status(429).json({ error: "Too many verification requests. Please try again later." });
    return;
  }

  const otp = generateOtp();
  const otpHash = hashOtp(otp);
  emailOtpStore.set(userId, {
    otpHash,
    newEmail: cleanNewEmail,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    lastRequestAt: now,
    requests: [...recentRequests, now],
    attempts: 0,
  });

  const sendRes = await sendEmailChangeOtpEmail(cleanNewEmail, otp);
  if (!sendRes.delivered) {
    req.log?.error({ error: sendRes.error }, "[email-otp] Failed to send verification email");
    emailOtpStore.delete(userId);
    res.status(500).json({
      error: `Failed to deliver verification email to ${cleanNewEmail}: ${sendRes.error || "Email service unavailable"}. Please ensure email settings are configured in Admin Settings.`,
    });
    return;
  }

  res.json({
    success: true,
    message: `Verification code sent successfully to ${cleanNewEmail}.`,
  });
});

// ─── Email OTP: verify ───────────────────────────────────────────────────────
router.post("/account/email-otp/verify", requireAuth, async (req: any, res: any): Promise<void> => {
  const { newEmail, code } = req.body || {};
  if (!newEmail || !code) {
    res.status(400).json({ error: "Email address and 6-digit verification code are required." });
    return;
  }

  const userId: string = req.userId;
  const cleanNewEmail = String(newEmail).trim().toLowerCase();
  const cleanCode = String(code).trim();

  const entry = emailOtpStore.get(userId);

  if (!entry) {
    res.status(400).json({ error: "No pending verification found. Please request a new verification code." });
    return;
  }

  if (new Date() > entry.expiresAt) {
    emailOtpStore.delete(userId);
    res.status(400).json({ error: "Verification code has expired. Please request a new code." });
    return;
  }

  if (entry.newEmail !== cleanNewEmail) {
    res.status(400).json({ error: "Email address does not match the pending verification." });
    return;
  }

  if (entry.attempts >= MAX_VERIFY_TRIES) {
    emailOtpStore.delete(userId);
    res.status(429).json({ error: "Too many incorrect attempts. Please request a new verification code." });
    return;
  }

  const codeHash = hashOtp(cleanCode);
  if (entry.otpHash !== codeHash) {
    entry.attempts += 1;
    const remaining = MAX_VERIFY_TRIES - entry.attempts;
    if (remaining <= 0) {
      emailOtpStore.delete(userId);
      res.status(429).json({ error: "Too many incorrect attempts. Please request a new verification code." });
    } else {
      res.status(400).json({
        error: `Incorrect code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
      });
    }
    return;
  }

  // Double check email uniqueness before updating
  const existingCustomer = await mongoUsers.findByEmail(cleanNewEmail, "customer");
  if (existingCustomer && existingCustomer.id !== userId && (existingCustomer as any)._id !== userId) {
    emailOtpStore.delete(userId);
    res.status(400).json({ error: "This email address is already registered with another Customer account." });
    return;
  }

  // Verification valid — update user email in database
  emailOtpStore.delete(userId);
  try {
    const updatedUser = await mongoUsers.update(userId, { email: cleanNewEmail, updatedAt: new Date() });

    try {
      await clerkClient.users.updateUser(userId, {
        emailAddress: [cleanNewEmail],
      }).catch(() => {});
    } catch { /* ignore Clerk errors for custom auth users */ }

    emitUserEvent(userId, "profile:updated", { user: updatedUser, email: cleanNewEmail });
    void sendAccountSecurityAlertEmail({
      userId,
      email: cleanNewEmail,
      alertType: "Email Address Updated",
      details: `Your VASTRAA account email address was successfully updated to ${cleanNewEmail}. If you did not make this change, please contact support immediately.`,
    }).catch(() => {});
    res.json({
      success: true,
      email: cleanNewEmail,
      user: updatedUser,
      message: "Email address updated successfully!",
    });
  } catch (err: any) {
    req.log?.error({ err }, "[email-otp] Failed to update user email");
    res.status(500).json({ error: err?.message || "Failed to update email address. Please try again." });
  }
});

// ─── Profile PATCH ───────────────────────────────────────────────────────────
router.patch("/account/profile", requireAuth, async (req: any, res: any): Promise<void> => {
  const {
    firstName,
    lastName,
    name,
    phone,
    email,
    alternateMobile,
    dateOfBirth,
    gender,
    language,
    location,
    profilePicture,
    avatar,
    address,
  } = req.body;

  try {
    // Validations
    if (email !== undefined && email !== null && email !== "") {
      const cleanEmail = String(email).trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(cleanEmail)) {
        res.status(400).json({ error: "Please enter a valid email address." });
        return;
      }
      // Check if email belongs to another user
      const existingWithEmail = await mongoUsers.findByEmail(cleanEmail);
      if (existingWithEmail && existingWithEmail.id !== req.userId && (existingWithEmail as any)._id !== req.userId) {
        res.status(400).json({ error: "Email address is already in use by another account." });
        return;
      }
    }

    if (phone !== undefined && phone !== null && phone !== "") {
      const phoneDigits = String(phone).replace(/\D/g, "");
      if (phoneDigits.length !== 10) {
        res.status(400).json({ error: "Mobile number must be a valid 10-digit number." });
        return;
      }
    }

    if (alternateMobile !== undefined && alternateMobile !== null && alternateMobile !== "") {
      const altDigits = String(alternateMobile).replace(/\D/g, "");
      if (altDigits.length !== 10) {
        res.status(400).json({ error: "Alternate mobile must be exactly 10 digits." });
        return;
      }
    }

    // Build update object
    const updateFields: Record<string, any> = { updatedAt: new Date() };

    let computedName = "";
    if (typeof firstName === "string" || typeof lastName === "string") {
      computedName = [firstName ?? "", lastName ?? ""].filter(Boolean).join(" ").trim();
    } else if (typeof name === "string") {
      computedName = name.trim();
    }

    if (computedName) {
      updateFields.name = computedName;
    }

    if (typeof email === "string" && email.trim()) {
      updateFields.email = email.trim().toLowerCase();
    }

    if (typeof phone === "string" && phone.trim()) {
      updateFields.phone = phone.replace(/\D/g, "").slice(0, 10);
    }

    if (alternateMobile !== undefined) updateFields.alternateMobile = String(alternateMobile).trim();
    if (dateOfBirth !== undefined) updateFields.dateOfBirth = String(dateOfBirth).trim();
    if (gender !== undefined) updateFields.gender = String(gender).trim();
    if (language !== undefined) updateFields.language = String(language).trim();
    if (location !== undefined) updateFields.location = String(location).trim();

    const pic = profilePicture ?? avatar;
    if (pic !== undefined) {
      updateFields.profilePicture = String(pic).trim();
      updateFields.avatar = String(pic).trim();
    }

    if (address !== undefined) {
      updateFields.address = String(address).trim();
    }

    // 1. Permanently update database record (mongoUsers)
    const updatedUser = await mongoUsers.update(req.userId, updateFields);

    // 2. Synchronize address to saved_addresses if address is provided
    if (address !== undefined && String(address).trim()) {
      try {
        const { mongoAddresses } = await import("@workspace/db");
        const userAddrs = await mongoAddresses.findByUserId(req.userId);
        const defaultAddr = userAddrs.find((a) => a.isDefault) || userAddrs[0];

        const fullAddrStr = String(address).trim();
        const userName = updatedUser?.name || computedName || "Customer";
        const userPhone = updatedUser?.phone || (typeof phone === "string" ? phone : "") || "9876543210";

        if (defaultAddr) {
          await mongoAddresses.update(defaultAddr.id, {
            name: userName,
            phone: userPhone,
            line1: fullAddrStr,
            isDefault: true,
          });
        } else {
          await mongoAddresses.insert({
            userId: req.userId,
            name: userName,
            phone: userPhone,
            line1: fullAddrStr,
            line2: null,
            landmark: null,
            city: updateFields.location || "City",
            state: "State",
            pincode: "400001",
            country: "India",
            addressType: "home",
            isDefault: true,
          });
        }
      } catch { /* ignore address sync errors */ }
    }

    // 3. Best-effort update for Clerk user if Clerk is active
    try {
      const nameUpdate: Record<string, string> = {};
      if (typeof firstName === "string" && firstName.trim()) nameUpdate.firstName = firstName.trim();
      if (typeof lastName === "string" && lastName.trim()) nameUpdate.lastName = lastName.trim();
      if (Object.keys(nameUpdate).length > 0) {
        await clerkClient.users.updateUser(req.userId, nameUpdate).catch(() => {});
      }

      await clerkClient.users.updateUserMetadata(req.userId, {
        publicMetadata: {
          phone: updateFields.phone ?? updatedUser?.phone ?? "",
          alternateMobile: updateFields.alternateMobile ?? updatedUser?.alternateMobile ?? "",
          dateOfBirth: updateFields.dateOfBirth ?? updatedUser?.dateOfBirth ?? "",
          gender: updateFields.gender ?? updatedUser?.gender ?? "",
          language: updateFields.language ?? updatedUser?.language ?? "English",
          location: updateFields.location ?? updatedUser?.location ?? "",
          profilePicture: updateFields.profilePicture ?? (updatedUser as any)?.profilePicture ?? "",
          address: updateFields.address ?? (updatedUser as any)?.address ?? "",
        },
      }).catch(() => {});
    } catch { /* ignore Clerk errors for custom auth users */ }

    // Parse names for response
    const nameParts = (updatedUser?.name || computedName || "").split(" ");
    const fName = nameParts[0] || "";
    const lName = nameParts.slice(1).join(" ") || "";

    const responseUser = {
      id: updatedUser?.id || req.userId,
      name: updatedUser?.name || computedName,
      firstName: fName,
      lastName: lName,
      email: updatedUser?.email || (typeof email === "string" ? email.trim() : ""),
      phone: updatedUser?.phone || (typeof phone === "string" ? phone : ""),
      alternateMobile: updatedUser?.alternateMobile || "",
      dateOfBirth: updatedUser?.dateOfBirth || "",
      gender: updatedUser?.gender || "",
      location: updatedUser?.location || "",
      language: updatedUser?.language || "English",
      profilePicture: (updatedUser as any)?.profilePicture || updateFields.profilePicture || "",
      avatar: (updatedUser as any)?.avatar || updateFields.avatar || "",
      address: (updatedUser as any)?.address || updateFields.address || "",
    };

    emitUserEvent(req.userId, "profile:updated", { user: responseUser });

    res.json({
      success: true,
      user: responseUser,
    });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update profile metadata");
    res.status(500).json({ error: err?.message ?? "Failed to save profile" });
  }
});

export default router;

