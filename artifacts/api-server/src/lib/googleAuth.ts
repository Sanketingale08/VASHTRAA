import crypto from "crypto";
import { OAuth2Client } from "google-auth-library";
import { logger } from "./logger";
import { sendGoogleAuthOtpEmail } from "./transactionalEmail";

export interface GoogleIdentity {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export interface GoogleAuthChallenge {
  id: string;
  email: string;
  googleId: string;
  name: string;
  picture?: string;
  targetRole: "customer" | "seller";
  mode: "login" | "signup";
  otp: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  lastResendAt: Date;
}

// In-memory challenge store (persisted in Node process lifetime)
const challengeStore = new Map<string, GoogleAuthChallenge>();

// Clean expired challenges periodically
setInterval(() => {
  const now = new Date();
  for (const [id, ch] of challengeStore.entries()) {
    if (ch.expiresAt < now) {
      challengeStore.delete(id);
    }
  }
}, 60_000).unref();

function getGoogleClientId(): string {
  return process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || "";
}

function getGoogleClientSecret(): string {
  return process.env.GOOGLE_CLIENT_SECRET || "";
}

/**
 * Returns Google's official OAuth Authorization URL for production authentication.
 */
export function getGoogleOAuthUrl(redirectUri: string, state: string): string {
  const clientId = getGoogleClientId();
  if (!clientId) {
    throw new Error(
      "Google OAuth is not configured on the server. Please set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
    );
  }

  const oauth2Client = new OAuth2Client(
    clientId,
    getGoogleClientSecret(),
    redirectUri
  );

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: [
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/userinfo.email",
      "openid",
    ],
    state,
    prompt: "select_account",
  });
}

/**
 * Verifies Google authorization code or ID token server-side directly with Google's OAuth servers.
 * Never trusts user-supplied email or profile data from the browser.
 */
export async function verifyGoogleTokenOrCode(
  codeOrToken: string,
  redirectUri?: string
): Promise<GoogleIdentity> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();

  if (!clientId) {
    throw new Error(
      "Google OAuth client is not configured on the server. Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables."
    );
  }

  try {
    const oauth2Client = new OAuth2Client(clientId, clientSecret, redirectUri);

    let idToken = "";
    if (codeOrToken.length > 20 && !codeOrToken.startsWith("4/")) {
      idToken = codeOrToken;
    } else {
      const tokenResponse = await oauth2Client.getToken(codeOrToken);
      idToken = tokenResponse.tokens.id_token || "";
    }

    if (!idToken) {
      throw new Error("No ID Token received from Google authorization server.");
    }

    const ticket = await oauth2Client.verifyIdToken({
      idToken,
      audience: clientId,
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error("Invalid Google ID token payload.");
    }

    if (!payload.email_verified) {
      throw new Error("Google account email address is not verified.");
    }

    return {
      googleId: payload.sub,
      email: payload.email!.trim().toLowerCase(),
      name: payload.name || payload.given_name || payload.email!.split("@")[0],
      picture: payload.picture,
      emailVerified: true,
    };
  } catch (err: any) {
    logger.error({ err: err?.message || err }, "[GoogleAuth] Server-side OAuth verification failed");
    throw new Error(err?.message || "Failed to verify Google authentication.");
  }
}

/**
 * Creates a cryptographically secure 6-digit OTP challenge for the authenticated Google account.
 */
export async function createGoogleAuthChallenge(opts: {
  email: string;
  googleId: string;
  name: string;
  picture?: string;
  targetRole: "customer" | "seller";
  mode: "login" | "signup";
}): Promise<{ challengeId: string; email: string; targetRole: "customer" | "seller" }> {
  const challengeId = crypto.randomUUID();
  const otp = crypto.randomInt(100000, 999999).toString();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

  const challenge: GoogleAuthChallenge = {
    id: challengeId,
    email: opts.email.trim().toLowerCase(),
    googleId: opts.googleId,
    name: opts.name,
    picture: opts.picture,
    targetRole: opts.targetRole,
    mode: opts.mode,
    otp,
    expiresAt,
    attempts: 0,
    maxAttempts: 5,
    lastResendAt: now,
  };

  challengeStore.set(challengeId, challenge);

  // Send real OTP to verified Google email via project's existing email OTP functionality
  await sendGoogleAuthOtpEmail({
    toEmail: challenge.email,
    otp: challenge.otp,
    name: challenge.name,
    targetRole: challenge.targetRole,
  });

  logger.info(
    { challengeId, email: challenge.email, targetRole: challenge.targetRole },
    "[GoogleAuth] Google OTP challenge created & email queued"
  );

  return {
    challengeId,
    email: challenge.email,
    targetRole: challenge.targetRole,
  };
}

/**
 * Verifies OTP against the Google Auth Challenge.
 * Single-use: deletes challenge upon successful verification.
 */
export function verifyGoogleAuthOtp(
  challengeId: string,
  inputOtp: string,
  expectedRole?: "customer" | "seller"
): { success: boolean; challenge?: GoogleAuthChallenge; error?: string; code?: string } {
  const challenge = challengeStore.get(challengeId);

  if (!challenge) {
    return {
      success: false,
      error: "Authentication session expired or invalid. Please click 'Continue with Google' again.",
      code: "CHALLENGE_NOT_FOUND",
    };
  }

  if (new Date() > challenge.expiresAt) {
    challengeStore.delete(challengeId);
    return {
      success: false,
      error: "OTP has expired. Please request a new verification code.",
      code: "OTP_EXPIRED",
    };
  }

  if (challenge.attempts >= challenge.maxAttempts) {
    challengeStore.delete(challengeId);
    return {
      success: false,
      error: "Too many failed attempts. Please restart Google Login.",
      code: "TOO_MANY_ATTEMPTS",
    };
  }

  if (expectedRole && challenge.targetRole !== expectedRole) {
    return {
      success: false,
      error: "Role mismatch detected during authentication.",
      code: "ROLE_MISMATCH",
    };
  }

  const cleanInput = (inputOtp || "").trim();
  if (cleanInput !== challenge.otp) {
    challenge.attempts += 1;
    const remaining = challenge.maxAttempts - challenge.attempts;
    if (remaining <= 0) {
      challengeStore.delete(challengeId);
      return {
        success: false,
        error: "Too many incorrect OTP attempts. Please restart Google Login.",
        code: "TOO_MANY_ATTEMPTS",
      };
    }
    return {
      success: false,
      error: `Invalid OTP code. ${remaining} attempt${remaining !== 1 ? "s" : ""} remaining.`,
      code: "INVALID_OTP",
    };
  }

  // OTP is valid! Delete challenge so it cannot be re-used.
  challengeStore.delete(challengeId);
  return { success: true, challenge };
}

/**
 * Resends a 6-digit OTP for an active Google Auth Challenge with rate-limiting.
 */
export async function resendGoogleAuthOtp(
  challengeId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const challenge = challengeStore.get(challengeId);

  if (!challenge) {
    return {
      success: false,
      error: "Session expired. Please click 'Continue with Google' again.",
    };
  }

  const now = new Date();
  const timeSinceLastResend = now.getTime() - challenge.lastResendAt.getTime();
  const COOLDOWN_MS = 60 * 1000; // 60 seconds rate limit

  if (timeSinceLastResend < COOLDOWN_MS) {
    const secondsLeft = Math.ceil((COOLDOWN_MS - timeSinceLastResend) / 1000);
    return {
      success: false,
      error: `Please wait ${secondsLeft} second${secondsLeft !== 1 ? "s" : ""} before requesting a new OTP.`,
    };
  }

  // Generate new OTP and reset expiration timer
  const newOtp = crypto.randomInt(100000, 999999).toString();
  challenge.otp = newOtp;
  challenge.expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
  challenge.attempts = 0;
  challenge.lastResendAt = now;

  await sendGoogleAuthOtpEmail({
    toEmail: challenge.email,
    otp: challenge.otp,
    name: challenge.name,
    targetRole: challenge.targetRole,
  });

  return {
    success: true,
    message: `A new OTP has been sent to ${challenge.email}`,
  };
}
