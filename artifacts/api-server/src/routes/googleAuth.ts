import { Router, Request, Response } from "express";
import { mongoUsers, mongoSessions, mongoVendors } from "@workspace/db";
import {
  getGoogleOAuthUrl,
  verifyGoogleTokenOrCode,
  createGoogleAuthChallenge,
  verifyGoogleAuthOtp,
  resendGoogleAuthOtp,
} from "../lib/googleAuth";
import { logger } from "../lib/logger";

const router = Router();

/**
 * GET /api/auth/google/url — Generates the Google OAuth authorization URL.
 */
router.get("/auth/google/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const role = (req.query.role as string) === "seller" ? "seller" : "customer";
    const mode = (req.query.mode as string) === "signup" ? "signup" : "login";
    const redirectUri = (req.query.redirectUri as string) || `${req.protocol}://${req.get("host")}/google-callback`;

    const stateObj = { role, mode, nonce: Math.random().toString(36).substring(2) };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");
    const url = getGoogleOAuthUrl(redirectUri, state);

    res.status(200).json({ success: true, url, state });
  } catch (err: any) {
    logger.error({ err }, "[GoogleAuth API] Error generating OAuth URL");
    res.status(500).json({ success: false, error: "Unable to initialize Google Login." });
  }
});

/**
 * POST /api/auth/google/callback — Handles Google OAuth response, verifies identity server-side,
 * checks existing account, creates Google OTP challenge, and sends 6-digit OTP.
 */
router.post("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, token, role, mode, redirectUri } = req.body || {};
    const codeOrToken = (code || token || "").toString().trim();

    if (!codeOrToken) {
      res.status(400).json({ success: false, error: "Missing Google authorization code or token." });
      return;
    }

    const targetRole = role === "seller" ? "seller" : "customer";
    const targetMode = mode === "signup" ? "signup" : "login";
    const callbackRedirectUri = redirectUri || `${req.protocol}://${req.get("host")}/google-callback`;

    // Verify identity server-side with Google (never trust frontend profile data)
    const identity = await verifyGoogleTokenOrCode(codeOrToken, callbackRedirectUri);

    if (!identity || !identity.email) {
      res.status(400).json({ success: false, error: "Unable to retrieve verified email from Google." });
      return;
    }

    const cleanEmail = identity.email.toLowerCase().trim();

    // Check existing account in database
    const existingUser = await mongoUsers.findByEmail(cleanEmail);

    // Create secure 6-digit OTP challenge
    const challengeResult = await createGoogleAuthChallenge({
      email: cleanEmail,
      googleId: identity.googleId,
      name: identity.name,
      picture: identity.picture,
      targetRole,
      mode: targetMode,
    });

    res.status(200).json({
      success: true,
      requiresOtp: true,
      challengeId: challengeResult.challengeId,
      email: challengeResult.email,
      targetRole: challengeResult.targetRole,
      accountExists: !!existingUser,
      message: `OTP sent to ${challengeResult.email}`,
    });
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "[GoogleAuth API] Callback verification error");
    res.status(400).json({
      success: false,
      error: err?.message || "Google authentication failed. Please try again.",
    });
  }
});

/**
 * POST /api/auth/google/verify-otp — Verifies the 6-digit OTP, creates or authenticates user/seller account,
 * creates active session token, and returns user payload + target redirect URL.
 */
router.post("/auth/google/verify-otp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId, otp, targetRole: reqTargetRole } = req.body || {};

    if (!challengeId || typeof challengeId !== "string") {
      res.status(400).json({ success: false, error: "Invalid or missing OTP session ID." });
      return;
    }

    if (!otp || typeof otp !== "string" || !otp.trim()) {
      res.status(400).json({ success: false, error: "Please enter the 6-digit OTP code." });
      return;
    }

    // Verify OTP
    const verification = verifyGoogleAuthOtp(
      challengeId,
      otp.trim(),
      reqTargetRole as "customer" | "seller" | undefined
    );

    if (!verification.success || !verification.challenge) {
      res.status(400).json({
        success: false,
        error: verification.error || "OTP verification failed.",
        code: verification.code,
      });
      return;
    }

    const { email, googleId, name, picture, targetRole } = verification.challenge;

    // Check if account already exists
    let user = await mongoUsers.findByEmail(email);

    if (user) {
      // Account exists — authenticate existing account & update Google metadata if missing
      const updateData: Record<string, any> = {};
      if (!user.googleId) updateData.googleId = googleId;
      if (!user.authProvider) updateData.authProvider = "google";
      if (picture && (!user.avatar || !user.profilePicture)) {
        updateData.avatar = picture;
        updateData.profilePicture = picture;
      }
      if (Object.keys(updateData).length > 0) {
        user = (await mongoUsers.update(user.id, updateData)) || user;
      }
    } else {
      // Account does not exist — create new user account using verified Google identity
      user = await mongoUsers.insert({
        name: name || email.split("@")[0],
        email,
        passwordHash: "",
        role: targetRole === "seller" ? "seller" : "customer",
        googleId,
        authProvider: "google",
        avatar: picture || "/images/artisan-1.png",
        profilePicture: picture || "/images/artisan-1.png",
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    // If target role is seller, ensure seller/vendor record is active
    let redirectUrl = "/account/overview";

    if (targetRole === "seller" || user.role === "seller") {
      let vendor = await mongoVendors.findByOwnerId(user.id);
      if (!vendor) {
        vendor = await mongoVendors.insert({
          name: `${user.name}'s Shop`,
          location: "Yeola, Maharashtra",
          rating: 4.8,
          sareesCount: 0,
          avatar: picture || "/images/artisan-1.png",
          bio: `Handcrafted saree collection by ${user.name}`,
          contactEmail: user.email,
          status: "approved",
          ownerId: user.id,
          vendorId: `VEND_${user.id.substring(0, 8).toUpperCase()}`,
        });
      }

      if (vendor.status === "suspended") {
        res.status(403).json({
          success: false,
          error: "Your seller account has been suspended. Please contact support.",
          code: "VENDOR_SUSPENDED",
        });
        return;
      }

      redirectUrl = "/seller/dashboard";
    }

    // Create session in MongoDB
    const session = await mongoSessions.createSession(user.id);

    logger.info(
      { userId: user.id, email: user.email, role: user.role, redirectUrl },
      "[GoogleAuth API] Successful Google authentication + OTP verification"
    );

    res.status(200).json({
      success: true,
      token: session.token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatar: user.avatar || user.profilePicture,
      },
      redirectUrl,
    });
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "[GoogleAuth API] OTP verification error");
    res.status(500).json({
      success: false,
      error: "Unable to verify OTP. Please try again.",
    });
  }
});

/**
 * POST /api/auth/google/resend-otp — Resends 6-digit OTP to the verified Google email with rate-limiting.
 */
router.post("/auth/google/resend-otp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { challengeId } = req.body || {};

    if (!challengeId || typeof challengeId !== "string") {
      res.status(400).json({ success: false, error: "Invalid challenge session." });
      return;
    }

    const result = await resendGoogleAuthOtp(challengeId);

    if (!result.success) {
      res.status(400).json({ success: false, error: result.error });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (err: any) {
    logger.error({ err }, "[GoogleAuth API] Error resending OTP");
    res.status(500).json({ success: false, error: "Unable to resend OTP. Please try again." });
  }
});

export default router;
