import { Router, Request, Response } from "express";
import { mongoUsers, mongoSessions, mongoVendors, mongoSellers } from "@workspace/db";
import {
  getGoogleOAuthUrl,
  verifyGoogleTokenOrCode,
  createGoogleAuthChallenge,
  verifyGoogleAuthOtp,
  resendGoogleAuthOtp,
} from "../lib/googleAuth";
import { logger } from "../lib/logger";
import { createAuthSession, setRefreshTokenCookie, type UserRole } from "../lib/sessions";
import { sendAccountWelcomeEmail } from "../lib/transactionalEmail";

const router = Router();

/**
 * GET /api/auth/google/url — Generates the Google OAuth authorization URL.
 */
router.get("/auth/google/url", async (req: Request, res: Response): Promise<void> => {
  try {
    const role = (req.query.role as string) === "seller" ? "seller" : "customer";
    const mode = (req.query.mode as string) === "signup" ? "signup" : "login";
    const returnTo = (req.query.returnTo as string) || (req.query.redirect as string) || "";
    const redirectUri = (req.query.redirectUri as string) || `${req.protocol}://${req.get("host")}/google-callback`;

    const stateObj = { role, mode, returnTo, redirectUri, nonce: Math.random().toString(36).substring(2) };
    const state = Buffer.from(JSON.stringify(stateObj)).toString("base64url");
    const url = getGoogleOAuthUrl(redirectUri, state);

    res.status(200).json({ success: true, url, state });
  } catch (err: any) {
    logger.error({ err }, "[GoogleAuth API] Error generating OAuth URL");
    res.status(500).json({ success: false, error: "Unable to initialize Google Login." });
  }
});

/**
 * Helper function to authenticate existing user or create a new user account from verified Google identity.
 * Strictly enforces server-side role resolution:
 *  - New social-login users ALWAYS default to "customer" role.
 *  - Social login NEVER auto-grants seller access or creates approved vendor profiles.
 *  - Existing accounts preserve their database role without being overwritten.
 *  - Seller dashboard access is strictly granted ONLY if an approved vendor profile exists in DB.
 *  - Customers attempting seller login are redirected to seller onboarding (/seller/register).
 */
async function authenticateOrRegisterGoogleUser(
  opts: {
    email: string;
    googleId: string;
    name: string;
    picture?: string;
    targetRole?: "customer" | "seller";
    returnTo?: string;
  },
  req: Request,
  res: Response
) {
  const cleanEmail = opts.email.toLowerCase().trim();

  // 1. Account lookup: If targetRole is specified, search for matching role-specific account first
  let user = null;
  if (opts.targetRole) {
    user = await mongoUsers.findByEmail(cleanEmail, opts.targetRole);
  }

  // 2. If not found by role-specific email, check by stable googleId matching the targetRole
  if (!user) {
    const byGoogle = await mongoUsers.findByGoogleId(opts.googleId);
    if (byGoogle) {
      if (!opts.targetRole || byGoogle.role === opts.targetRole) {
        user = byGoogle;
      }
    }
  }

  // 3. Fallback check by verified email
  if (!user) {
    if (opts.targetRole === "seller") {
      user = await mongoUsers.findByEmail(cleanEmail, "seller");
    } else if (opts.targetRole === "customer") {
      user = await mongoUsers.findByEmail(cleanEmail, "customer");
    }
    if (!user && !opts.targetRole) {
      user = await mongoUsers.findByEmail(cleanEmail);
    }
  }

  let isNewUser = false;

  // 3. New user registration: Social login MUST default to customer with least privilege
  // Clicking a social login button must NEVER automatically grant seller access!
  if (!user) {
    isNewUser = true;
    user = await mongoUsers.insert({
      name: opts.name || cleanEmail.split("@")[0],
      email: cleanEmail,
      passwordHash: "",
      role: "customer", // Always customer by default
      googleId: opts.googleId,
      authProvider: "google",
      avatar: opts.picture || "/images/artisan-1.png",
      profilePicture: opts.picture || "/images/artisan-1.png",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    if (user && user.role === "customer") {
      void sendAccountWelcomeEmail({
        userId: user.id,
        name: user.name,
        email: user.email,
      }).catch((err) => {
        logger.warn({ err, userId: user.id }, "[GoogleAuth] Failed to send welcome email");
      });
    }
  } else {
    // Existing user: Link googleId if not yet linked, and update avatar if missing
    // CRITICAL: NEVER overwrite or escalate existing account's role when signing in through Google!
    const updateData: Record<string, any> = {};
    if (!user.googleId) updateData.googleId = opts.googleId;
    if (!user.authProvider) updateData.authProvider = "google";
    if (opts.picture && (!user.avatar || !user.profilePicture)) {
      updateData.avatar = opts.picture;
      updateData.profilePicture = opts.picture;
    }
    if (Object.keys(updateData).length > 0) {
      user = (await mongoUsers.update(user.id, updateData)) || user;
    }
  }

  // 4. Role determination & Dashboard Redirection:
  // Derived strictly from verified server-side database records, NEVER from client params!
  let effectiveRole: UserRole = "customer";
  let redirectUrl = opts.returnTo || "/account/overview";

  if (user.role === "seller") {
    // Verify whether this seller account has an approved vendor profile in the database
    let vendor = null;
    try {
      if (mongoVendors) {
        vendor = (await mongoVendors.findByOwnerId(user.id)) ||
                 (await mongoVendors.findByEmail(cleanEmail)) ||
                 (await mongoVendors.findById(user.id));
      }
    } catch {}

    if (!vendor) {
      try {
        if (mongoSellers && mongoSellers !== mongoVendors) {
          vendor = (await mongoSellers.findByOwnerId(user.id)) ||
                   (await mongoSellers.findByEmail(cleanEmail)) ||
                   (await mongoSellers.findById(user.id));
        }
      } catch {}
    }

    if (vendor) {
      const vStatus = vendor.status || vendor.approvalStatus;
      if (vStatus === "suspended") {
        const error: any = new Error("Your seller account has been suspended. Please contact support.");
        error.code = "VENDOR_SUSPENDED";
        error.statusCode = 403;
        throw error;
      }
      if (vStatus === "rejected" || vStatus === "declined") {
        const error: any = new Error("Your vendor application has been rejected by Super Admin.");
        error.code = "VENDOR_REJECTED";
        error.statusCode = 403;
        throw error;
      }
      if (vStatus === "approved" || vStatus === "active") {
        effectiveRole = "seller";
        redirectUrl = opts.returnTo || "/seller/dashboard";
      } else {
        // Pending or not approved: cannot access seller dashboard
        effectiveRole = "customer";
        redirectUrl = "/seller/register";
      }
    } else {
      // Seller user with no approved vendor profile: redirect to seller onboarding
      effectiveRole = "customer";
      redirectUrl = "/seller/register";
    }
  } else if (user.role === "admin" || (user as any).role === "super_admin") {
    effectiveRole = "admin";
    redirectUrl = "/admin/dashboard";
  } else {
    // Role is "customer"
    effectiveRole = "customer";
    if (opts.targetRole === "seller") {
      // Customer attempting to log in via seller portal:
      // Redirect to seller onboarding (registration) page, maintaining customer role
      redirectUrl = "/seller/register";
    } else {
      redirectUrl = opts.returnTo || "/account/overview";
    }
  }

  // 5. Create authenticated session using the verified server-side role
  const { accessToken, refreshToken, session } = await createAuthSession(
    user.id,
    user.email,
    effectiveRole,
    req
  );
  setRefreshTokenCookie(res, effectiveRole, refreshToken, session.id);

  return {
    token: accessToken,
    accessToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: effectiveRole,
      avatar: user.avatar || user.profilePicture,
    },
    redirectUrl,
    isNewUser,
  };
}

/**
 * POST /api/auth/google/callback — Direct Google OAuth Handler.
 * Verifies identity server-side, checks existing account (Login vs Create Account),
 * issues session token, and returns target redirect URL to land on VASTRAA Dashboard.
 */
router.post("/auth/google/callback", async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, token, role, mode, state, redirectUri } = req.body || {};
    const codeOrToken = (code || token || "").toString().trim();

    if (!codeOrToken) {
      res.status(400).json({ success: false, error: "Missing Google authorization code or token." });
      return;
    }

    let targetRole: "customer" | "seller" = role === "seller" ? "seller" : "customer";
    let returnTo: string | undefined = undefined;

    if (state && typeof state === "string") {
      try {
        const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8"));
        if (decoded.role === "seller" || decoded.role === "customer") {
          targetRole = decoded.role;
        }
        if (decoded.returnTo && typeof decoded.returnTo === "string") {
          returnTo = decoded.returnTo;
        }
      } catch {
        /* ignore invalid state parsing */
      }
    }

    const callbackRedirectUri = redirectUri || `${req.protocol}://${req.get("host")}/google-callback`;

    // Verify identity server-side with Google (never trust frontend profile data)
    const identity = await verifyGoogleTokenOrCode(codeOrToken, callbackRedirectUri);

    if (!identity || !identity.email) {
      res.status(400).json({ success: false, error: "Unable to retrieve verified email from Google." });
      return;
    }

    // Direct Login / Registration flow with server-side role resolution
    const authResult = await authenticateOrRegisterGoogleUser(
      {
        email: identity.email,
        googleId: identity.googleId,
        name: identity.name,
        picture: identity.picture,
        targetRole,
        returnTo,
      },
      req,
      res
    );

    logger.info(
      { userId: authResult.user.id, email: authResult.user.email, role: authResult.user.role, redirectUrl: authResult.redirectUrl, isNewUser: authResult.isNewUser },
      "[GoogleAuth API] Direct Google SSO login/registration successful"
    );

    res.status(200).json({
      success: true,
      token: authResult.token,
      accessToken: authResult.accessToken,
      user: authResult.user,
      redirectUrl: authResult.redirectUrl,
      isNewUser: authResult.isNewUser,
    });
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "[GoogleAuth API] Callback verification error");
    const statusCode = err?.statusCode || (err?.code === "VENDOR_SUSPENDED" || err?.code === "VENDOR_REJECTED" ? 403 : 400);
    res.status(statusCode).json({
      success: false,
      error: err?.message || "Google authentication failed. Please try again.",
      code: err?.code,
    });
  }
});

/**
 * POST /api/auth/google/verify-otp — Verifies the 6-digit OTP, authenticates user account,
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

    // Direct Login / Registration flow with server-side role resolution
    const authResult = await authenticateOrRegisterGoogleUser(
      {
        email,
        googleId,
        name,
        picture,
        targetRole,
      },
      req,
      res
    );

    logger.info(
      { userId: authResult.user.id, email: authResult.user.email, role: authResult.user.role, redirectUrl: authResult.redirectUrl },
      "[GoogleAuth API] Successful Google authentication + OTP verification"
    );

    res.status(200).json({
      success: true,
      token: authResult.token,
      accessToken: authResult.accessToken,
      user: authResult.user,
      redirectUrl: authResult.redirectUrl,
      isNewUser: authResult.isNewUser,
    });
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "[GoogleAuth API] OTP verification error");
    const statusCode = err?.statusCode || (err?.code === "VENDOR_SUSPENDED" || err?.code === "VENDOR_REJECTED" ? 403 : 500);
    res.status(statusCode).json({
      success: false,
      error: err?.message || "Unable to verify OTP. Please try again.",
      code: err?.code,
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
