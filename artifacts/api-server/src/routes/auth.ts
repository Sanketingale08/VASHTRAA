import crypto from "crypto";
import { Router, Request, Response } from "express";
import { db, vendorsTable, eq, or, mongoUsers, mongoSessions, mongoSellers } from "@workspace/db";
import { hashPassword, verifyPassword } from "../lib/passwords";
import {
  createAuthSession,
  rotateRefreshToken,
  revokeSession,
  revokeAllUserSessions,
  listActiveUserSessions,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromReq,
} from "../lib/sessions";
import { authRateLimiter, refreshRateLimiter, passwordResetLimiter, otpRateLimiter } from "../middlewares/rateLimiter";
import { isCustomer } from "../middlewares/isCustomer";
import { isSeller } from "../middlewares/isSeller";
import { writeAuditLog, getIp } from "../lib/auditLog";
import { checkAccountLockout, recordFailedAttempt, recordSuccessfulLogin } from "../lib/authSecurity";
import { verifyAccessToken } from "../lib/jwt";
import { sendAccountWelcomeEmail, sendEmailVerificationEmail } from "../lib/transactionalEmail";
import { logger } from "../lib/logger";
import {
  sendCustomerRegistrationCode,
  verifyCustomerRegistrationCode,
  consumeCustomerRegistrationCode,
  isCustomerEmailVerified,
} from "../lib/customerVerification";

const router = Router();

/**
 * Returns the sanitized client base URL for email redirects & links.
 */
function getClientBaseUrl(req: Request): string {
  const origin = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : undefined);
  if (origin && typeof origin === "string" && !origin.includes("undefined")) {
    return origin.replace(/\/$/, "");
  }
  return (process.env.FRONTEND_URL || process.env.APP_URL || process.env.SITE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/$/, "");
}

/**
 * POST /api/auth/register/send-otp (and /auth/register/send-otp)
 * Issues and sends a 6-digit email verification code for customer account registration.
 */
const handleSendRegistrationOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, name } = req.body || {};
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({ success: false, error: "Please enter a valid email address." });
      return;
    }

    const result = await sendCustomerRegistrationCode(email.trim(), name);
    if (!result.delivered) {
      const isAlreadyExists = result.error?.includes("already exists");
      res.status(isAlreadyExists ? 409 : 400).json({
        success: false,
        error: result.error || "Unable to send the verification code. Please try again.",
      });
      return;
    }

    res.json({
      success: true,
      message: `Verification code sent successfully to ${email.trim()}. Please check your inbox.`,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Failed to send verification code. Please try again." });
  }
};

router.post("/auth/register/send-otp", authRateLimiter, handleSendRegistrationOtp);
router.post("/api/auth/register/send-otp", authRateLimiter, handleSendRegistrationOtp);

/**
 * POST /api/auth/register/verify-otp (and /auth/register/verify-otp)
 * Verifies the 6-digit code submitted by the customer.
 */
const handleVerifyRegistrationOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, code } = req.body || {};
    if (!email || !code) {
      res.status(400).json({ success: false, error: "Email address and 6-digit verification code are required." });
      return;
    }

    const result = verifyCustomerRegistrationCode(String(email), String(code));
    if (!result.valid) {
      res.status(400).json({ success: false, error: result.error || "Invalid verification code. Please try again." });
      return;
    }

    res.json({
      success: true,
      message: "Email verified successfully! You can now complete your registration.",
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Failed to verify code. Please try again." });
  }
};

router.post("/auth/register/verify-otp", authRateLimiter, handleVerifyRegistrationOtp);
router.post("/api/auth/register/verify-otp", authRateLimiter, handleVerifyRegistrationOtp);

/**
 * In-memory resend rate limiting: 30s cooldown and max 5 per hour per email address
 */
const resendVerificationTracker = new Map<string, { lastSentAt: number; count: number }>();
const RESEND_COOLDOWN_MS = 30 * 1000;
const RESEND_MAX_HOURLY = 5;

/**
 * Customer Sign Up Endpoint — Creates a new customer account in MongoDB Atlas users collection
 * with isEmailVerified: false, generates a hashed time-limited verification token, and sends
 * the verification email before allowing login.
 */
const handleSignUp = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, id, userId, username, password, confirmPassword, otp } = req.body || {};
    const rawIdentifier = (email || id || userId || username || "").toString();

    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ success: false, error: "Full Name is required." });
      return;
    }

    if (!rawIdentifier || !rawIdentifier.trim()) {
      res.status(400).json({ success: false, error: "Email address or User ID is required." });
      return;
    }

    const cleanEmail = rawIdentifier.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = emailRegex.test(cleanEmail);
    const isUserId = cleanEmail.length >= 3 && !/\s/.test(cleanEmail);

    if (!isEmail && !isUserId) {
      res.status(400).json({ success: false, error: "Please enter a valid email address or User ID." });
      return;
    }

    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ success: false, error: "Password must be at least 6 characters long." });
      return;
    }

    if (confirmPassword && password !== confirmPassword) {
      res.status(400).json({ success: false, error: "Passwords do not match." });
      return;
    }

    // Optional OTP verification fallback for backward compatibility
    let isOtpVerified = false;
    if (otp && isEmail) {
      const verifyRes = verifyCustomerRegistrationCode(cleanEmail, String(otp));
      if (!verifyRes.valid) {
        res.status(400).json({ success: false, error: verifyRes.error || "Invalid verification code." });
        return;
      }
      isOtpVerified = true;
    }

    // Check if customer user already exists in MongoDB Atlas
    const existingUser = await mongoUsers.findByEmail(cleanEmail, "customer");
    if (existingUser) {
      res.status(400).json({ success: false, error: "A Customer account with this email address already exists. Please log in instead." });
      return;
    }

    // Generate secure, unique, time-limited email verification token
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes expiry

    // Hash password & store user in MongoDB Atlas
    const passwordHash = hashPassword(password);
    let user;
    try {
      user = await mongoUsers.insert({
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: "customer",
        isEmailVerified: isOtpVerified,
        emailVerified: isOtpVerified,
        emailVerificationTokenHash: isOtpVerified ? null : tokenHash,
        emailVerificationExpires: isOtpVerified ? null : expires,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } catch (insertErr: any) {
      if (
        insertErr?.code === 11000 ||
        insertErr?.message?.includes("E11000") ||
        insertErr?.message?.includes("duplicate key")
      ) {
        res.status(400).json({ success: false, error: "An account with this email or User ID already exists. Please log in instead." });
        return;
      }
      throw insertErr;
    }

    if (isOtpVerified) {
      consumeCustomerRegistrationCode(cleanEmail);
      const { accessToken, refreshToken, session } = await createAuthSession(user.id, user.email, "customer", req);
      setRefreshTokenCookie(res, "customer", refreshToken, session.id);

      void sendAccountWelcomeEmail({
        userId: user.id,
        name: user.name,
        email: user.email,
      });

      res.status(201).json({
        success: true,
        token: accessToken,
        accessToken,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          isEmailVerified: true,
          emailVerified: true,
        },
      });
      return;
    }

    // Send verification email with 15-minute time-limited link
    if (isEmail) {
      const clientBaseUrl = getClientBaseUrl(req);
      const verificationUrl = `${clientBaseUrl}/verify-email?token=${rawToken}`;

      void sendEmailVerificationEmail({
        toEmail: cleanEmail,
        name: user.name,
        verificationUrl,
      });
    }

    // Do NOT issue JWT or session tokens before verification
    res.status(201).json({
      success: true,
      message: "Your account has been created successfully. Please check your email and verify your account before logging in.",
      requiresVerification: true,
      email: cleanEmail,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        isEmailVerified: false,
      },
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[handleSignUp] Error creating user account");
    res.status(500).json({
      success: false,
      error: err?.message && !err.message.includes("E11000") ? err.message : "Unable to create account. Please try again."
    });
  }
};

router.post("/auth/sign-up", authRateLimiter, handleSignUp);
router.post("/api/auth/sign-up", authRateLimiter, handleSignUp);

/**
 * GET /api/auth/verify-email?token=TOKEN
 * Validates the time-limited token, marks the email as verified in MongoDB,
 * removes the verification token fields, and redirects user to login.
 */
const handleVerifyEmail = async (req: Request, res: Response): Promise<void> => {
  try {
    const rawToken = (req.query.token || req.body?.token || "").toString().trim();
    const acceptsHtml = (req.headers.accept || "").includes("text/html");
    const clientBaseUrl = getClientBaseUrl(req);

    if (!rawToken) {
      if (acceptsHtml) {
        res.redirect(`${clientBaseUrl}/verify-email?status=invalid&error=Token+is+required`);
        return;
      }
      res.status(400).json({
        success: false,
        error: "Verification token is required.",
        code: "TOKEN_REQUIRED",
      });
      return;
    }

    // Hash token using SHA-256 to compare with stored token hash
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    // Match hashed token against MongoDB user record
    const user = await mongoUsers.findByVerificationTokenHash(tokenHash);

    if (!user) {
      if (acceptsHtml) {
        res.redirect(`${clientBaseUrl}/verify-email?status=invalid`);
        return;
      }
      res.status(400).json({
        success: false,
        error: "This verification link is invalid, expired, or has already been used.",
        code: "INVALID_OR_USED_TOKEN",
      });
      return;
    }

    // Check expiration (15-minute validity)
    if (user.emailVerificationExpires && new Date() > new Date(user.emailVerificationExpires)) {
      // Invalidate expired token fields in MongoDB
      await mongoUsers.update(user.id, {}, ["emailVerificationTokenHash", "emailVerificationExpires"]);

      if (acceptsHtml) {
        res.redirect(`${clientBaseUrl}/verify-email?status=expired&email=${encodeURIComponent(user.email)}`);
        return;
      }
      res.status(400).json({
        success: false,
        error: "This verification link has expired. Please request a new verification email.",
        code: "TOKEN_EXPIRED",
        email: user.email,
      });
      return;
    }

    // Handle already-verified accounts gracefully
    if (user.isEmailVerified === true) {
      await mongoUsers.update(user.id, {}, ["emailVerificationTokenHash", "emailVerificationExpires"]);

      if (acceptsHtml) {
        res.redirect(`${clientBaseUrl}/sign-in?alreadyVerified=true`);
        return;
      }
      res.status(200).json({
        success: true,
        message: "Your email address has already been verified. Please log in.",
        code: "ALREADY_VERIFIED",
        redirectUrl: "/sign-in",
      });
      return;
    }

    // Mark email as verified and remove token and expiration fields
    await mongoUsers.verifyUserEmail(user.id);

    writeAuditLog({
      eventType: "customer_email_verified",
      role: "customer",
      userId: user.id,
      email: user.email,
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    // Send welcome email after email is successfully verified
    void sendAccountWelcomeEmail({
      userId: user.id,
      name: user.name,
      email: user.email,
    });

    if (acceptsHtml) {
      res.redirect(`${clientBaseUrl}/sign-in?verified=true`);
      return;
    }

    res.status(200).json({
      success: true,
      message: "Email verified successfully.",
      redirectUrl: "/sign-in?verified=true",
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[handleVerifyEmail] Error during email verification");
    res.status(500).json({
      success: false,
      error: "An unexpected error occurred during email verification. Please try again.",
    });
  }
};

router.get("/auth/verify-email", handleVerifyEmail);
router.get("/api/auth/verify-email", handleVerifyEmail);

/**
 * POST /api/auth/resend-verification
 * Resends verification email with a new secure token, invalidates the previous token,
 * applies rate limiting, and does not expose user existence.
 */
const handleResendVerification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};
    if (!email || typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      res.status(400).json({
        success: false,
        error: "Please enter a valid email address.",
      });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const now = Date.now();

    // Enforce rate limiting: 30s cooldown and 5 per hour per email
    const tracking = resendVerificationTracker.get(cleanEmail);
    if (tracking && process.env.NODE_ENV !== "test") {
      const elapsed = now - tracking.lastSentAt;
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSec = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        res.status(429).json({
          success: false,
          error: `Please wait ${waitSec} second${waitSec !== 1 ? "s" : ""} before requesting another verification email.`,
          retryAfter: waitSec,
        });
        return;
      }

      if (tracking.count >= RESEND_MAX_HOURLY && now - tracking.lastSentAt < 60 * 60 * 1000) {
        res.status(429).json({
          success: false,
          error: "Too many verification requests. Please try again later.",
        });
        return;
      }
    }

    // Generic success message to prevent account enumeration
    const genericSuccessMessage = "If your account requires verification, a verification email has been sent.";

    const user = await mongoUsers.findByEmail(cleanEmail, "customer");

    if (!user || user.role !== "customer" || user.isEmailVerified === true) {
      res.status(200).json({
        success: true,
        message: genericSuccessMessage,
      });
      return;
    }

    // Generate new secure token and expire previous one
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15-minute expiry

    await mongoUsers.update(user.id, {
      emailVerificationTokenHash: tokenHash,
      emailVerificationExpires: expires,
    });

    const newCount = (tracking && now - tracking.lastSentAt < 60 * 60 * 1000) ? tracking.count + 1 : 1;
    resendVerificationTracker.set(cleanEmail, { lastSentAt: now, count: newCount });

    const clientBaseUrl = getClientBaseUrl(req);
    const verificationUrl = `${clientBaseUrl}/verify-email?token=${rawToken}`;

    await sendEmailVerificationEmail({
      toEmail: cleanEmail,
      name: user.name,
      verificationUrl,
    });

    res.status(200).json({
      success: true,
      message: genericSuccessMessage,
    });
  } catch (err: any) {
    logger.error({ err: err?.message }, "[handleResendVerification] Error resending verification email");
    res.status(500).json({
      success: false,
      error: "Failed to send verification email. Please try again.",
    });
  }
};

router.post("/auth/resend-verification", otpRateLimiter, handleResendVerification);
router.post("/api/auth/resend-verification", otpRateLimiter, handleResendVerification);

/**
 * Customer Sign In Endpoint — Authenticates customer credentials against MongoDB Atlas users collection.
 */
const handleSignIn = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, id, userId, username, password } = req.body || {};
    const rawIdentifier = (email || id || userId || username || "").toString();

    if (!rawIdentifier || !rawIdentifier.trim() || !password || typeof password !== "string") {
      res.status(401).json({ success: false, error: "Invalid ID or Password." });
      return;
    }

    const cleanEmail = rawIdentifier.trim().toLowerCase();

    const clientIp = getIp(req);

    // Check account lockout state before password check
    const lockout = await checkAccountLockout(cleanEmail, "customer", clientIp);
    if (lockout.isLocked) {
      writeAuditLog({
        eventType: "login_lockout_blocked",
        role: "customer",
        email: cleanEmail,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
        metadata: { remainingSeconds: lockout.remainingSeconds },
      });
      res.status(429).json({
        success: false,
        error: lockout.retryMessage || "Your login is temporarily locked. Please try again later.",
        code: "ACCOUNT_TEMPORARILY_LOCKED",
        retryAfterSeconds: lockout.remainingSeconds,
      });
      return;
    }

    // 1. Look up user by email or ID/userId for Customer role
    let user = await mongoUsers.findByEmail(cleanEmail, "customer");
    if (!user) {
      const byId = (await mongoUsers.findById(rawIdentifier.trim())) || (await mongoUsers.findById(cleanEmail));
      if (byId && (byId.role === "customer" || !byId.role)) {
        user = byId;
      }
    }
    if (!user) {
      const candidate = await mongoUsers.findByEmail(cleanEmail);
      if (candidate && (candidate.role === "customer" || !candidate.role)) {
        user = candidate;
      } else if (candidate && candidate.role === "seller") {
        res.status(403).json({
          success: false,
          error: "This email is registered as a Seller account. Please log in using the Seller Portal.",
          code: "SELLER_ACCOUNT_WRONG_PORTAL",
        });
        return;
      }
    }

    if (!user) {
      const failState = await recordFailedAttempt(cleanEmail, "customer", clientIp, req);
      writeAuditLog({
        eventType: "login_failure",
        role: "customer",
        email: cleanEmail,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "user_not_found", attempts: failState.attempts },
      });

      if (failState.isLocked) {
        res.status(429).json({
          success: false,
          error: `Too many failed login attempts. Your account is temporarily locked for ${failState.lockMinutes} minutes.`,
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryAfterSeconds: failState.remainingSeconds,
        });
        return;
      }

      res.status(401).json({ success: false, error: "Invalid ID or Password." });
      return;
    }

    // Self-heal user email if missing or empty
    if ((!user.email || user.email === "") && rawIdentifier.trim().includes("@")) {
      user.email = rawIdentifier.trim().toLowerCase();
      mongoUsers.update(user.id, { email: user.email }).catch(() => {});
    }

    const isPasswordValid = verifyPassword(password, user.passwordHash) || verifyPassword(password.trim(), user.passwordHash);
    if (!isPasswordValid) {
      const failState = await recordFailedAttempt(cleanEmail, "customer", clientIp, req);
      writeAuditLog({
        eventType: "login_failure",
        role: "customer",
        userId: user.id,
        email: user.email || cleanEmail,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "invalid_password", attempts: failState.attempts },
      });

      if (failState.isLocked) {
        res.status(429).json({
          success: false,
          error: `Too many failed login attempts. Your account is temporarily locked for ${failState.lockMinutes} minutes.`,
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryAfterSeconds: failState.remainingSeconds,
        });
        return;
      }

      res.status(401).json({ success: false, error: "Invalid ID or Password." });
      return;
    }

    // Reset failed attempt tracking on successful login
    await recordSuccessfulLogin(cleanEmail, "customer", clientIp, req);

    // Enforce email verification before creating session or issuing JWT tokens
    if (user.role === "customer" && user.isEmailVerified === false) {
      writeAuditLog({
        eventType: "login_rejected_unverified_email",
        role: "customer",
        userId: user.id,
        email: user.email || cleanEmail,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
      });
      res.status(403).json({
        success: false,
        error: "Please verify your email address before logging in. Check your inbox for the verification link.",
        code: "EMAIL_NOT_VERIFIED",
        isEmailVerified: false,
        email: user.email || cleanEmail,
      });
      return;
    }

    // Create auth session & JWT access token
    const effectiveEmail = user.email || cleanEmail;
    const { accessToken, refreshToken, session } = await createAuthSession(user.id, effectiveEmail, "customer", req);
    setRefreshTokenCookie(res, "customer", refreshToken, session.id);

    res.status(200).json({
      success: true,
      token: accessToken,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: effectiveEmail,
        role: user.role || "customer",
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Invalid ID or Password." });
  }
};

router.post("/auth/sign-in", authRateLimiter, handleSignIn);
router.post("/api/auth/sign-in", authRateLimiter, handleSignIn);

/**
 * Customer Silent Token Refresh Endpoint — Rotates refresh token & issues new JWT access token.
 */
router.post("/auth/refresh", refreshRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const creds = getRefreshTokenFromReq(req, "customer");
    if (!creds) {
      res.status(401).json({ success: false, error: "No refresh token provided", code: "REFRESH_TOKEN_REQUIRED" });
      return;
    }

    const rotated = await rotateRefreshToken(creds.sessionId, creds.refreshToken, req);
    if (!rotated) {
      clearRefreshTokenCookie(res, "customer");
      res.status(401).json({ success: false, error: "Invalid or revoked refresh token. Please sign in again.", code: "SESSION_EXPIRED" });
      return;
    }

    setRefreshTokenCookie(res, "customer", rotated.refreshToken, rotated.session.id);

    res.status(200).json({
      success: true,
      token: rotated.accessToken,
      accessToken: rotated.accessToken,
    });
  } catch (err) {
    res.status(401).json({ success: false, error: "Unable to refresh session." });
  }
});

/**
 * Current User Endpoint — Fetches the authenticated user profile from MongoDB Atlas.
 */
router.get("/auth/me", isCustomer, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const latestUser = (await mongoUsers.findById(userId)) || (req as any).user;
    if (!latestUser) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const nameParts = (latestUser.name || "").split(" ");

    res.status(200).json({
      success: true,
      user: {
        id: latestUser.id,
        name: latestUser.name,
        firstName: nameParts[0] || latestUser.name || "",
        lastName: nameParts.slice(1).join(" ") || "",
        email: latestUser.email,
        role: latestUser.role || "customer",
        phone: latestUser.phone || "",
        alternateMobile: latestUser.alternateMobile || "",
        dateOfBirth: latestUser.dateOfBirth || "",
        gender: latestUser.gender || "",
        location: latestUser.location || "",
        language: latestUser.language || "English",
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: "Unauthorized" });
  }
});

/**
 * Customer Sign Out Endpoint — Terminates active session & clears HTTP-only cookie.
 */
const handleSignOut = async (req: Request, res: Response): Promise<void> => {
  try {
    let sessionId = (req as any).sessionId;
    let userId = (req as any).userId;

    if (!sessionId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        const payload = verifyAccessToken(token);
        if (payload?.sid) {
          sessionId = payload.sid;
          userId = payload.sub;
        }
      }
    }

    if (sessionId) {
      await revokeSession(sessionId, "user_logout");
    }

    const creds = getRefreshTokenFromReq(req, "customer");
    if (creds?.sessionId) {
      await revokeSession(creds.sessionId, "user_logout");
    }

    clearRefreshTokenCookie(res, "customer");

    writeAuditLog({
      eventType: "logout",
      role: "customer",
      userId: userId || "anonymous",
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (err: any) {
    clearRefreshTokenCookie(res, "customer");
    res.status(200).json({ success: true });
  }
};

router.post("/auth/sign-out", handleSignOut);
router.post("/auth/logout", handleSignOut);

/**
 * Logout From All Devices — Revokes all active sessions for customer across all devices.
 */
router.post("/auth/logout-all", isCustomer, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    if (userId) {
      await revokeAllUserSessions(userId, "customer", "logout_all_devices");
    }
    clearRefreshTokenCookie(res, "customer");

    writeAuditLog({
      eventType: "logout_all_devices",
      role: "customer",
      userId,
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    res.status(200).json({ success: true, message: "Logged out from all devices successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to logout from all devices" });
  }
});

/**
 * GET /api/auth/sessions — List active sessions for Customer
 */
router.get("/auth/sessions", isCustomer, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const currentSessionId = (req as any).sessionId;

    const sessions = await listActiveUserSessions(userId, "customer");
    const sanitized = sessions.map((s) => ({
      id: s.id,
      device: s.device,
      os: s.os,
      browser: s.browser,
      ipAddress: s.ipAddress,
      loginTime: s.createdAt,
      lastActive: s.lastActivityAt,
      isCurrent: s.id === currentSessionId,
    }));

    res.status(200).json({ success: true, sessions: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: "Unable to retrieve active sessions" });
  }
});

/**
 * DELETE /api/auth/sessions/:sessionId — Revoke a specific Customer session
 */
router.delete("/auth/sessions/:sessionId", isCustomer, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).userId;

    const sessions = await listActiveUserSessions(userId, "customer");
    const target = sessions.find((s) => s.id === sessionId);

    if (!target) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    await revokeSession(String(sessionId), "user_revoked_session");
    res.status(200).json({ success: true, message: "Session revoked successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to revoke session" });
  }
});

/**
 * Customer & Seller Password Reset Endpoints
 */
import { requestPasswordReset, validateResetToken, performPasswordReset } from "../lib/passwordReset";

/**
 * POST /api/auth/forgot-password — Initiate user forgot password flow
 */
router.post("/auth/forgot-password", passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};
    const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
    const result = await requestPasswordReset(email, "customer", origin);
    const { debugResetUrl, ...safeResult } = result as any;
    if (result.success) {
      res.status(200).json(safeResult);
    } else {
      res.status(400).json(safeResult);
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || "Unable to send password reset email. Please try again later.",
    });
  }
});

/**
 * POST /api/seller/forgot-password — Initiate seller forgot password flow
 */
router.post("/seller/forgot-password", passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body || {};
    const origin = req.headers.origin || `${req.protocol}://${req.get("host")}`;
    const result = await requestPasswordReset(email, "seller", origin);
    const { debugResetUrl, ...safeResult } = result as any;
    if (result.success) {
      res.status(200).json(safeResult);
    } else {
      res.status(400).json(safeResult);
    }
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message || "Unable to send password reset email. Please try again later.",
    });
  }
});

/**
 * GET /api/auth/verify-reset-token — Verify reset link for customer or seller
 */
router.get("/auth/verify-reset-token", passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req.query.token as string) || "";
    const role = (req.query.role as string) === "seller" ? "seller" : "customer";
    const result = await validateResetToken(token, role);
    if (result.valid) {
      res.status(200).json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, ...result });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, valid: false, error: "Invalid or expired password reset link." });
  }
});

/**
 * GET /api/seller/verify-reset-token — Verify reset link specifically for seller
 */
router.get("/seller/verify-reset-token", passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const token = (req.query.token as string) || "";
    const result = await validateResetToken(token, "seller");
    if (result.valid) {
      res.status(200).json({ success: true, ...result });
    } else {
      res.status(400).json({ success: false, ...result });
    }
  } catch (err: any) {
    res.status(400).json({ success: false, valid: false, error: "Invalid or expired password reset link." });
  }
});

/**
 * POST /api/auth/reset-password — Execute password update for customer or seller
 */
router.post("/auth/reset-password", passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword, password, confirmPassword, role } = req.body || {};
    const targetPassword = newPassword || password || "";
    const expectedRole = role === "seller" ? "seller" : "customer";

    const result = await performPasswordReset(token, targetPassword, confirmPassword, expectedRole);
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Unable to update password. Please try again." });
  }
});

/**
 * POST /api/seller/reset-password — Execute password update specifically for seller
 */
router.post("/seller/reset-password", passwordResetLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { token, newPassword, password, confirmPassword } = req.body || {};
    const targetPassword = newPassword || password || "";

    const result = await performPasswordReset(token, targetPassword, confirmPassword, "seller");
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Unable to update password. Please try again." });
  }
});

/**
 * POST /api/seller/login — Authenticates seller credentials against the dedicated Seller data collection.
 */
router.post("/seller/login", authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, identifier } = req.body || {};
    const inputIdentifier = (email || identifier || "").trim();
    if (!inputIdentifier || !password || typeof password !== "string") {
      res.status(401).json({ success: false, error: "Invalid ID or Password." });
      return;
    }

    const cleanEmail = inputIdentifier.toLowerCase();
    const cleanPassword = password.trim();
    const clientIp = getIp(req);

    // Check account lockout state before login processing
    const lockout = await checkAccountLockout(cleanEmail, "seller", clientIp);
    if (lockout.isLocked) {
      writeAuditLog({
        eventType: "login_lockout_blocked",
        role: "seller",
        email: cleanEmail,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
        metadata: { remainingSeconds: lockout.remainingSeconds },
      });
      res.status(429).json({
        success: false,
        error: lockout.retryMessage || "Your login is temporarily locked. Please try again later.",
        code: "ACCOUNT_TEMPORARILY_LOCKED",
        retryAfterSeconds: lockout.remainingSeconds,
      });
      return;
    }

    // 1. Look up seller and user records by email, ownerId, sellerId, vendorId, or id
    let seller = await mongoSellers.findByEmail(cleanEmail);
    if (!seller) {
      seller = (await mongoSellers.findById(inputIdentifier)) ||
               (await mongoSellers.findBySellerId(inputIdentifier)) ||
               (await mongoSellers.findByVendorId(inputIdentifier)) ||
               (await mongoSellers.findByOwnerId(inputIdentifier));
    }

    let user: any = await mongoUsers.findByEmail(cleanEmail, "seller");
    if (!user) {
      user = await mongoUsers.findById(inputIdentifier);
      if (user && user.role !== "seller") {
        user = null;
      }
    }

    if (!seller && user) {
      seller = (await mongoSellers.findByOwnerId(user.id)) || (await mongoSellers.findById(user.id));
    }

    if (!user && seller) {
      if (seller.ownerId) {
        user = await mongoUsers.findById(seller.ownerId);
      }
      if (!user && (seller.email || seller.contactEmail)) {
        user = (await mongoUsers.findByEmail(seller.email, "seller")) ||
               (seller.contactEmail ? await mongoUsers.findByEmail(seller.contactEmail, "seller") : null);
        if (user && user.role !== "seller") {
          user = null;
        }
      }
    }

    // Fallback: search Postgres vendorsTable if seller missing from Mongo
    if (!seller) {
      try {
        const conditions: any[] = [];
        if (vendorsTable.contactEmail) {
          conditions.push(eq(vendorsTable.contactEmail, cleanEmail));
          conditions.push(sql`lower(${vendorsTable.contactEmail}) = ${cleanEmail}`);
        }
        if (vendorsTable.id) conditions.push(eq(vendorsTable.id, inputIdentifier));
        if (vendorsTable.ownerId) conditions.push(eq(vendorsTable.ownerId, inputIdentifier));
        if ((vendorsTable as any).vendorId) conditions.push(eq((vendorsTable as any).vendorId, inputIdentifier));

        if (conditions.length > 0) {
          const pgRows = await db
            .select()
            .from(vendorsTable)
            .where(or(...conditions))
            .limit(1);

          if (pgRows.length > 0) {
            const pgVendor = pgRows[0];
            if (!user && pgVendor.ownerId) {
              user = await mongoUsers.findById(pgVendor.ownerId);
            }
            if (!user && pgVendor.contactEmail) {
              user = await mongoUsers.findByEmail(pgVendor.contactEmail);
            }
            const pwdHash = user?.passwordHash || "";
            seller = await mongoSellers.insert({
              id: pgVendor.id,
              name: pgVendor.name,
              sellerName: pgVendor.name,
              shopName: pgVendor.name,
              email: pgVendor.contactEmail || cleanEmail,
              contactEmail: pgVendor.contactEmail || cleanEmail,
              mobile: pgVendor.mobile || "",
              location: pgVendor.location,
              passwordHash: pwdHash,
              status: pgVendor.status as any,
              ownerId: pgVendor.ownerId || pgVendor.id,
              sellerId: pgVendor.vendorId || pgVendor.id,
              vendorId: pgVendor.vendorId || pgVendor.id,
            });
          }
        }
      } catch {}
    }

    // Auto-provision seller document if user exists with role 'seller'
    if (!seller && user && user.role === "seller") {
      seller = await mongoSellers.insert({
        id: user.id,
        name: `${user.name}'s Shop`,
        sellerName: user.name,
        shopName: `${user.name}'s Shop`,
        email: user.email,
        contactEmail: user.email,
        mobile: user.phone || "",
        passwordHash: user.passwordHash || "",
        location: "India",
        rating: 4.8,
        sareesCount: 0,
        status: "approved",
        ownerId: user.id,
        sellerId: `VEND_${user.id.substring(0, 8).toUpperCase()}`,
      });
    }

    const candidateHashes = [
      seller?.passwordHash,
      user?.passwordHash,
    ].filter((h): h is string => Boolean(h && typeof h === "string" && (h.trim().startsWith("pbkdf2:") || h.trim().startsWith("$pbkdf2$") || h.trim().startsWith("pbkdf2$"))));

    if (!seller || candidateHashes.length === 0) {
      const failState = await recordFailedAttempt(cleanEmail, "seller", clientIp, req);
      writeAuditLog({
        eventType: "login_failure",
        role: "seller",
        email: cleanEmail,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "seller_not_found_or_no_password", attempts: failState.attempts },
      });
      if (failState.isLocked) {
        res.status(429).json({
          success: false,
          error: `Too many failed login attempts. Your account is temporarily locked for ${failState.lockMinutes} minutes.`,
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryAfterSeconds: failState.remainingSeconds,
        });
        return;
      }
      if (user && user.role === "customer") {
        res.status(403).json({
          success: false,
          error: "This account is registered as a Customer. Access to Seller Panel requires a Seller account.",
          code: "CUSTOMER_ACCOUNT_WRONG_PORTAL",
        });
        return;
      }
      res.status(401).json({ success: false, error: "Invalid ID or Password." });
      return;
    }

    // Verify password against candidate PBKDF2 hashes (supports raw & trimmed password)
    let isValid = false;
    let matchedHash = "";
    for (const hash of candidateHashes) {
      if (verifyPassword(password, hash) || verifyPassword(cleanPassword, hash)) {
        isValid = true;
        matchedHash = hash;
        break;
      }
    }

    if (!isValid || !matchedHash) {
      const failState = await recordFailedAttempt(cleanEmail, "seller", clientIp, req);
      writeAuditLog({
        eventType: "login_failure",
        role: "seller",
        email: cleanEmail,
        userId: seller.ownerId || seller.id,
        ipAddress: clientIp,
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "invalid_password", attempts: failState.attempts },
      });
      if (failState.isLocked) {
        res.status(429).json({
          success: false,
          error: `Too many failed login attempts. Your account is temporarily locked for ${failState.lockMinutes} minutes.`,
          code: "ACCOUNT_TEMPORARILY_LOCKED",
          retryAfterSeconds: failState.remainingSeconds,
        });
        return;
      }
      res.status(401).json({ success: false, error: "Invalid ID or Password." });
      return;
    }

    // Synchronize valid matched password hash across seller and user records if out of sync
    if (seller && seller.passwordHash !== matchedHash) {
      seller.passwordHash = matchedHash;
      try {
        await mongoSellers.update(seller.id, { passwordHash: matchedHash });
      } catch {}
    }
    if (user && user.role === "seller" && user.passwordHash !== matchedHash) {
      user.passwordHash = matchedHash;
      try {
        await mongoUsers.update(user.id, { passwordHash: matchedHash });
      } catch {}
    }

    // Fetch freshest seller status directly from MongoDB
    try {
      let freshSeller: any = null;
      if (seller.id) freshSeller = await mongoSellers.findById(seller.id);
      if (!freshSeller && cleanEmail) freshSeller = await mongoSellers.findByEmail(cleanEmail);
      if (!freshSeller && seller.ownerId) freshSeller = await mongoSellers.findByOwnerId(seller.ownerId);
      if (freshSeller) {
        seller = { ...seller, ...freshSeller };
      }
    } catch {}

    // Check status in Postgres vendorsTable if available for authoritative approval state
    let currentStatus = seller.status || "approved";
    let currentStatusReason = seller.statusReason || null;
    try {
      const isUuid = Boolean(seller.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seller.id));
      const pgConditions: any[] = [];
      if (isUuid) pgConditions.push(eq(vendorsTable.id, seller.id));
      if (seller.ownerId) pgConditions.push(eq(vendorsTable.ownerId, seller.ownerId));
      if (cleanEmail && vendorsTable.contactEmail) pgConditions.push(eq(vendorsTable.contactEmail, cleanEmail));

      if (pgConditions.length > 0) {
        const pgRows = await db
          .select({ status: vendorsTable.status, statusReason: vendorsTable.statusReason })
          .from(vendorsTable)
          .where(or(...pgConditions))
          .limit(1);
        if (pgRows.length > 0) {
          const pgStatus = pgRows[0].status;
          const mongoStatus = seller.status;

          // If MongoDB has an active/approved account, do NOT let stale Postgres suspension block login!
          if ((mongoStatus === "active" || mongoStatus === "approved") && (pgStatus === "suspended" || pgStatus === "deactivated")) {
            currentStatus = mongoStatus;
            currentStatusReason = null;
            // Self-heal Postgres to synchronize with MongoDB active status
            try {
              await db
                .update(vendorsTable)
                .set({ status: "approved", statusReason: null })
                .where(or(...pgConditions));
            } catch {}
          } else {
            currentStatus = pgStatus || currentStatus;
            currentStatusReason = pgRows[0].statusReason ?? currentStatusReason;
          }
        }
      }
    } catch {}

    if (currentStatus === "pending" || (seller as any)?.approvalStatus === "pending") {
      res.status(403).json({
        success: false,
        error: "Your shop registration is pending Super Admin approval. Please wait for approval before logging in.",
        code: "VENDOR_PENDING",
        status: "pending",
      });
      return;
    }

    if (currentStatus === "rejected" || (currentStatus as string) === "declined" || (seller as any)?.approvalStatus === "rejected" || (seller as any)?.approvalStatus === "declined") {
      res.status(403).json({
        success: false,
        error: currentStatusReason ? `Your shop application was rejected: ${currentStatusReason}` : "Your shop application has been rejected by Super Admin.",
        code: "VENDOR_REJECTED",
        status: currentStatus,
        statusReason: currentStatusReason,
      });
      return;
    }

    if (currentStatus === "suspended") {
      res.status(403).json({
        success: false,
        error: "Your account has been suspended.",
        code: "VENDOR_SUSPENDED",
        status: currentStatus,
        statusReason: currentStatusReason,
      });
      return;
    }

    if (currentStatus === "deactivated") {
      res.status(403).json({
        success: false,
        error: "Your account has been deactivated.",
        code: "VENDOR_DEACTIVATED",
        status: currentStatus,
        statusReason: currentStatusReason,
      });
      return;
    }

    if (currentStatus !== "approved" && currentStatus !== "active") {
      res.status(403).json({
        success: false,
        error: "Your seller account is not active.",
        code: "VENDOR_INACTIVE",
        status: currentStatus,
      });
      return;
    }

    // Reset failed login tracking on success
    await recordSuccessfulLogin(cleanEmail, "seller");

    writeAuditLog({
      eventType: "login_success",
      role: "seller",
      userId: seller.ownerId || seller.id,
      email: cleanEmail,
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    // Create seller auth session & JWT access token
    const sellerUserId = seller.ownerId || seller.id;
    const { accessToken, refreshToken, session } = await createAuthSession(sellerUserId, seller.email || seller.contactEmail || cleanEmail, "seller", req);
    setRefreshTokenCookie(res, "seller", refreshToken, session.id);

    res.status(200).json({
      success: true,
      token: accessToken,
      accessToken,
      user: {
        id: sellerUserId,
        name: seller.shopName || seller.name,
        email: seller.email || seller.contactEmail || cleanEmail,
        role: "seller",
      },
      vendor: {
        id: seller.id,
        sellerId: seller.sellerId || (seller as any).vendorId || seller.id,
        name: seller.shopName || seller.name,
        shopName: seller.shopName || seller.name,
        status: currentStatus,
        reactivationPending: Boolean(seller.reactivationPending || seller.reactivationWelcomePending),
        reactivationWelcomePending: Boolean(seller.reactivationWelcomePending || seller.reactivationPending),
      },
    });
  } catch (err: any) {
    console.error("Seller login processing error:", err);
    req.log?.error({ err }, "Seller login processing error");
    res.status(500).json({ success: false, error: "An unexpected error occurred during seller login. Please try again." });
  }
});

/**
 * Seller Silent Token Refresh Endpoint
 */
router.post("/seller/refresh", refreshRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const creds = getRefreshTokenFromReq(req, "seller");
    if (!creds) {
      res.status(401).json({ success: false, error: "No refresh token provided", code: "REFRESH_TOKEN_REQUIRED" });
      return;
    }

    const rotated = await rotateRefreshToken(creds.sessionId, creds.refreshToken, req);
    if (!rotated) {
      clearRefreshTokenCookie(res, "seller");
      res.status(401).json({ success: false, error: "Invalid or revoked refresh token. Please sign in again.", code: "SESSION_EXPIRED" });
      return;
    }

    // Verify vendor status before allowing session refresh
    const sellerUserId = rotated.session.userId;
    let seller = (await mongoSellers.findByOwnerId(sellerUserId)) ||
                 (await mongoSellers.findById(sellerUserId)) ||
                 (await mongoSellers.findBySellerId(sellerUserId)) ||
                 (await mongoVendors.findByOwnerId(sellerUserId)) ||
                 (await mongoVendors.findById(sellerUserId));

    let currentStatus = seller?.status || "approved";
    let currentStatusReason = seller?.statusReason || null;
    try {
      const isUuid = Boolean(sellerUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sellerUserId));
      const pgConditions: any[] = [];
      if (isUuid) pgConditions.push(eq(vendorsTable.id, sellerUserId));
      pgConditions.push(eq(vendorsTable.ownerId, sellerUserId));
      if (seller?.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(seller.id)) {
        pgConditions.push(eq(vendorsTable.id, seller.id));
      }

      const pgRows = await db
        .select({ status: vendorsTable.status, statusReason: vendorsTable.statusReason })
        .from(vendorsTable)
        .where(or(...pgConditions))
        .limit(1);
      if (pgRows.length > 0) {
        const pgStatus = pgRows[0].status;
        const mongoStatus = seller?.status;
        if ((mongoStatus === "active" || mongoStatus === "approved") && (pgStatus === "suspended" || pgStatus === "deactivated")) {
          currentStatus = mongoStatus;
          currentStatusReason = null;
          try {
            await db
              .update(vendorsTable)
              .set({ status: "approved", statusReason: null })
              .where(or(...pgConditions));
          } catch {}
        } else {
          currentStatus = pgStatus || currentStatus;
          currentStatusReason = pgRows[0].statusReason ?? currentStatusReason;
        }
      }
    } catch {}

    if (currentStatus === "suspended") {
      clearRefreshTokenCookie(res, "seller");
      res.status(403).json({
        success: false,
        error: "Your account has been suspended.",
        code: "VENDOR_SUSPENDED",
        status: currentStatus,
        statusReason: currentStatusReason,
      });
      return;
    }

    if (currentStatus === "rejected" || currentStatus === "declined") {
      clearRefreshTokenCookie(res, "seller");
      res.status(403).json({
        success: false,
        error: currentStatusReason || "Your shop application has been rejected by Super Admin.",
        code: "VENDOR_REJECTED",
        status: currentStatus,
        statusReason: currentStatusReason,
      });
      return;
    }

    if (currentStatus === "pending") {
      res.status(403).json({
        success: false,
        error: "Your vendor registration is pending Super Admin approval.",
        code: "VENDOR_PENDING",
        status: currentStatus,
      });
      return;
    }

    setRefreshTokenCookie(res, "seller", rotated.refreshToken, rotated.session.id);

    res.status(200).json({
      success: true,
      token: rotated.accessToken,
      accessToken: rotated.accessToken,
      refreshToken: rotated.refreshToken,
      sessionId: rotated.session.id,
    });
  } catch (err) {
    res.status(401).json({ success: false, error: "Unable to refresh seller session." });
  }
});

/**
 * Seller Sign Out Endpoint
 */
const handleSellerSignOut = async (req: Request, res: Response): Promise<void> => {
  try {
    let sessionId = (req as any).sessionId;
    let userId = (req as any).userId;

    if (!sessionId) {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7).trim();
        const payload = verifyAccessToken(token);
        if (payload?.sid) {
          sessionId = payload.sid;
          userId = payload.sub;
        }
      }
    }

    if (sessionId) {
      await revokeSession(sessionId, "seller_logout");
    }

    const creds = getRefreshTokenFromReq(req, "seller");
    if (creds?.sessionId) {
      await revokeSession(creds.sessionId, "seller_logout");
    }

    clearRefreshTokenCookie(res, "seller");

    writeAuditLog({
      eventType: "logout",
      role: "seller",
      userId: userId || "anonymous",
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    res.status(200).json({ success: true, message: "Seller logged out successfully" });
  } catch (err) {
    clearRefreshTokenCookie(res, "seller");
    res.status(200).json({ success: true });
  }
};

router.post("/seller/logout", handleSellerSignOut);
router.post("/seller/sign-out", handleSellerSignOut);

/**
 * Seller Logout From All Devices
 */
router.post("/seller/logout-all", isSeller, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    if (userId) {
      await revokeAllUserSessions(userId, "seller", "logout_all_devices");
    }
    clearRefreshTokenCookie(res, "seller");

    writeAuditLog({
      eventType: "logout_all_devices",
      role: "seller",
      userId,
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
    });

    res.status(200).json({ success: true, message: "Logged out from all devices successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to logout from all devices" });
  }
});

/**
 * GET /api/seller/sessions — List active seller sessions
 */
router.get("/seller/sessions", isSeller, async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).userId;
    const currentSessionId = (req as any).sessionId;

    const sessions = await listActiveUserSessions(userId, "seller");
    const sanitized = sessions.map((s) => ({
      id: s.id,
      device: s.device,
      os: s.os,
      browser: s.browser,
      ipAddress: s.ipAddress,
      loginTime: s.createdAt,
      lastActive: s.lastActivityAt,
      isCurrent: s.id === currentSessionId,
    }));

    res.status(200).json({ success: true, sessions: sanitized });
  } catch (err) {
    res.status(500).json({ success: false, error: "Unable to retrieve active seller sessions" });
  }
});

/**
 * DELETE /api/seller/sessions/:sessionId — Revoke a specific seller session
 */
router.delete("/seller/sessions/:sessionId", isSeller, async (req: Request, res: Response): Promise<void> => {
  try {
    const { sessionId } = req.params;
    const userId = (req as any).userId;

    const sessions = await listActiveUserSessions(userId, "seller");
    const target = sessions.find((s) => s.id === sessionId);

    if (!target) {
      res.status(404).json({ success: false, error: "Session not found" });
      return;
    }

    await revokeSession(String(sessionId), "seller_revoked_session");
    res.status(200).json({ success: true, message: "Session revoked successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to revoke session" });
  }
});

export default router;
