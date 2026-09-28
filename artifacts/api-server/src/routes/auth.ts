import { Router, Request, Response } from "express";
import { mongoUsers, mongoSessions, mongoSellers } from "@workspace/db";
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
import { authRateLimiter, refreshRateLimiter, passwordResetLimiter } from "../middlewares/rateLimiter";
import { isCustomer } from "../middlewares/isCustomer";
import { isSeller } from "../middlewares/isSeller";
import { writeAuditLog, getIp } from "../lib/auditLog";

const router = Router();

/**
 * Customer Sign Up Endpoint — Creates a new customer account in MongoDB Atlas users collection.
 */
router.post("/auth/sign-up", authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, id, userId, username, password, confirmPassword } = req.body || {};
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

    // Check if user already exists in MongoDB
    const existingUser = await mongoUsers.findByEmail(cleanEmail);
    if (existingUser) {
      res.status(400).json({ success: false, error: "An account with this email or User ID already exists. Please log in instead." });
      return;
    }

    // Hash password & store user in MongoDB
    const passwordHash = hashPassword(password);
    let user;
    try {
      user = await mongoUsers.insert({
        name: name.trim(),
        email: cleanEmail,
        passwordHash,
        role: "customer",
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

    // Create session & JWT access token
    const { accessToken, refreshToken, session } = await createAuthSession(user.id, user.email, "customer", req);
    setRefreshTokenCookie(res, "customer", refreshToken, session.id);

    res.status(201).json({
      success: true,
      token: accessToken,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      error: err?.message && !err.message.includes("E11000") ? err.message : "Unable to create account. Please try again."
    });
  }
});

/**
 * Customer Sign In Endpoint — Authenticates customer credentials against MongoDB Atlas users collection.
 */
router.post("/auth/sign-in", authRateLimiter, async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, id, userId, username, password } = req.body || {};
    const rawIdentifier = (email || id || userId || username || "").toString();

    if (!rawIdentifier || !rawIdentifier.trim() || !password || typeof password !== "string") {
      res.status(401).json({ success: false, error: "Invalid email/User ID or password." });
      return;
    }

    const cleanEmail = rawIdentifier.trim().toLowerCase();
    const user = await mongoUsers.findByEmail(cleanEmail);

    if (!user) {
      writeAuditLog({
        eventType: "login_failure",
        role: "customer",
        email: cleanEmail,
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "user_not_found" },
      });
      res.status(401).json({ success: false, error: "Invalid email/User ID or password." });
      return;
    }

    const isPasswordValid = verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      writeAuditLog({
        eventType: "login_failure",
        role: "customer",
        userId: user.id,
        email: cleanEmail,
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "invalid_password" },
      });
      res.status(401).json({ success: false, error: "Invalid email/User ID or password." });
      return;
    }

    // Create auth session & JWT access token
    const { accessToken, refreshToken, session } = await createAuthSession(user.id, user.email, "customer", req);
    setRefreshTokenCookie(res, "customer", refreshToken, session.id);

    res.status(200).json({
      success: true,
      token: accessToken,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Invalid email or password." });
  }
});

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
    const sessionId = (req as any).sessionId;
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
      userId: (req as any).userId || "anonymous",
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

    await revokeSession(sessionId, "user_revoked_session");
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
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
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
    if (result.success) {
      res.status(200).json(result);
    } else {
      res.status(400).json(result);
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
router.get("/auth/verify-reset-token", async (req: Request, res: Response): Promise<void> => {
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
router.get("/seller/verify-reset-token", async (req: Request, res: Response): Promise<void> => {
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
router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
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
router.post("/seller/reset-password", async (req: Request, res: Response): Promise<void> => {
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
    const { email, password } = req.body || {};
    if (!email || typeof email !== "string" || !email.trim() || !password || typeof password !== "string") {
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }

    const cleanEmail = email.trim().toLowerCase();

    // 1. Look up seller directly in dedicated Seller collection
    let seller = await mongoSellers.findByEmail(cleanEmail);
    let user: any = null;

    if (seller) {
      if (!seller.passwordHash) {
        // Check fallback user record if passwordHash missing on seller doc
        user = await mongoUsers.findByEmail(cleanEmail);
        if (user && user.role === "seller" && user.passwordHash) {
          seller.passwordHash = user.passwordHash;
          await mongoSellers.update(seller.id, { passwordHash: user.passwordHash });
        }
      }
    } else {
      // Check if seller user exists in mongoUsers with role seller
      user = await mongoUsers.findByEmail(cleanEmail);
      if (user && user.role === "seller") {
        let vendor = await mongoSellers.findByOwnerId(user.id);
        if (!vendor) {
          vendor = await mongoSellers.insert({
            id: user.id,
            name: `${user.name}'s Shop`,
            sellerName: user.name,
            shopName: `${user.name}'s Shop`,
            email: user.email,
            contactEmail: user.email,
            mobile: user.phone || "",
            passwordHash: user.passwordHash,
            location: "Yeola, Maharashtra",
            rating: 4.8,
            sareesCount: 0,
            avatar: user.avatar || "/images/artisan-1.png",
            status: "approved",
            ownerId: user.id,
            sellerId: `TDV_${user.id.substring(0, 8).toUpperCase()}`,
          });
        }
        seller = vendor;
      }
    }

    if (!seller || !seller.passwordHash) {
      writeAuditLog({
        eventType: "login_failure",
        role: "seller",
        email: cleanEmail,
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "seller_not_found" },
      });
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }

    // Verify password against stored passwordHash on seller record
    const isValid = verifyPassword(password, seller.passwordHash);
    if (!isValid) {
      writeAuditLog({
        eventType: "login_failure",
        role: "seller",
        email: cleanEmail,
        userId: seller.ownerId || seller.id,
        ipAddress: getIp(req),
        userAgent: req.headers["user-agent"] || "",
        metadata: { reason: "invalid_password" },
      });
      res.status(401).json({ success: false, error: "Invalid email or password." });
      return;
    }

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
        name: seller.name,
        email: seller.email || seller.contactEmail,
        role: "seller",
      },
      vendor: {
        id: seller.id,
        sellerId: seller.sellerId || (seller as any).vendorId,
        name: seller.name,
        status: seller.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: "Invalid email or password." });
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

    setRefreshTokenCookie(res, "seller", rotated.refreshToken, rotated.session.id);

    res.status(200).json({
      success: true,
      token: rotated.accessToken,
      accessToken: rotated.accessToken,
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
    const sessionId = (req as any).sessionId;
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
      userId: (req as any).userId || "anonymous",
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

    await revokeSession(sessionId, "seller_revoked_session");
    res.status(200).json({ success: true, message: "Session revoked successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to revoke session" });
  }
});

export default router;
