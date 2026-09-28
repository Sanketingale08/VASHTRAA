import { Router } from "express";
import { clerkClient } from "@clerk/express";
import { requireAuth } from "../middlewares/isAuthenticated";
import { mongoUsers } from "@workspace/db";
import { Resend } from "resend";
import crypto from "crypto";

const router = Router();


// ─── In-memory phone OTP store ──────────────────────────────────────────────
// userId → { otp, phone, expiresAt, requests: Date[], attempts: number }
interface OtpEntry {
  otp: string;
  phone: string;
  expiresAt: Date;
  requests: Date[];
  attempts: number;     // verify attempts for brute-force protection
}
const phoneOtpStore = new Map<string, OtpEntry>();

const OTP_TTL_MS      = 10 * 60 * 1000;  // 10 minutes
const RATE_LIMIT      = 5;               // max OTP *send* requests per hour
const RATE_WINDOW     = 60 * 60 * 1000;  // 1 hour
const MAX_VERIFY_TRIES = 5;              // max verify attempts before OTP is invalidated

function generateOtp(): string {
  return String(crypto.randomInt(100_000, 999_999));
}

async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const email = u.primaryEmailAddress?.emailAddress ?? u.emailAddresses?.[0]?.emailAddress ?? null;
    if (email) return email;
  } catch { /* ignore */ }
  const mongoUser = await mongoUsers.findById(userId);
  return mongoUser?.email ?? null;
}

async function sendOtpEmail(toEmail: string, otp: string, phone: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set; cannot send OTP in production");
    }
    console.info(`[phone-otp] DEV: OTP for +91${phone} → ${otp} (email: ${toEmail})`);
    return;
  }
  const resend = new Resend(apiKey);
  await resend.emails.send({
    from: "noreply@vastraa.com",
    to: toEmail,
    subject: "Your VASTRAA mobile number verification code",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
        <h2 style="color:#1E6B5A;font-size:20px;margin:0 0 8px">Mobile Number Change</h2>
        <p style="color:#555;font-size:14px;margin:0 0 24px">
          You requested to change your registered mobile number to <strong>+91 ${phone}</strong>.
          Use the code below to confirm this change.
        </p>
        <div style="background:#F3F8F5;border:1px solid #C9A84C33;border-radius:12px;padding:24px;text-align:center;margin-bottom:24px">
          <p style="font-size:32px;font-weight:700;letter-spacing:0.3em;color:#1E6B5A;margin:0">${otp}</p>
          <p style="color:#888;font-size:12px;margin:8px 0 0">Valid for 10 minutes</p>
        </div>
        <p style="color:#888;font-size:12px">If you did not request this change, please ignore this email. Your mobile number will not be updated.</p>
      </div>
    `,
  });
}

// ─── Profile GET ─────────────────────────────────────────────────────────────
router.get("/account/profile", requireAuth, async (req: any, res: any): Promise<void> => {
  try {
    const userId = req.userId;
    let mongoUser = await mongoUsers.findById(userId);
    if (!mongoUser && req.user?.email) {
      mongoUser = await mongoUsers.findByEmail(req.user.email);
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

  // Rate limiting
  const entry = phoneOtpStore.get(userId);
  const recentRequests = (entry?.requests ?? []).filter(
    (d) => now.getTime() - d.getTime() < RATE_WINDOW
  );
  if (recentRequests.length >= RATE_LIMIT) {
    res.status(429).json({ error: "Too many OTP requests. Please try again later." });
    return;
  }

  const toEmail = await getUserEmail(userId);
  if (!toEmail) {
    res.status(400).json({ error: "Could not resolve your email address." });
    return;
  }

  const otp = generateOtp();
  phoneOtpStore.set(userId, {
    otp,
    phone,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
    requests: [...recentRequests, now],
    attempts: 0,
  });

  try {
    await sendOtpEmail(toEmail, otp, phone);
  } catch (err) {
    req.log?.error({ err }, "[phone-otp] Failed to send OTP email — invalidating entry");
    phoneOtpStore.delete(userId);
    res.status(500).json({ error: "Failed to send verification email. Please try again." });
    return;
  }

  res.json({ success: true, sentTo: toEmail.replace(/^(.{2})(.*)(@.+)$/, "$1***$3") });
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

  if (entry.otp !== String(code).trim()) {
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

    res.json({ success: true, phone, user: updatedUser });
  } catch (err) {
    req.log?.error({ err }, "[phone-otp] Failed to update phone number");
    res.status(500).json({ error: "Failed to update phone number. Please try again." });
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

    res.json({
      success: true,
      user: {
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
      },
    });
  } catch (err: any) {
    req.log?.error({ err }, "Failed to update profile metadata");
    res.status(500).json({ error: err?.message ?? "Failed to save profile" });
  }
});

export default router;

