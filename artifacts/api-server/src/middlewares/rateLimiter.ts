import rateLimit from "express-rate-limit";
import { writeAuditLog, getIp } from "../lib/auditLog";

/**
 * Throttles login & registration attempts to prevent brute-force attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15, // max 15 attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many authentication attempts. Please try again in 15 minutes.",
    code: "TOO_MANY_REQUESTS",
  },
  handler: (req, res, _next, options) => {
    writeAuditLog({
      eventType: "brute_force_blocked",
      role: "unknown",
      userId: (req as any).userId || "anonymous",
      ipAddress: getIp(req),
      userAgent: req.headers["user-agent"] || "",
      metadata: { endpoint: req.originalUrl, limit: options.max },
    });
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Throttles password reset requests to prevent email spam / enumeration.
 */
export const passwordResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many password reset requests. Please wait 15 minutes before trying again.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles OTP send & verify requests.
 */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // max 5 attempts
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many verification requests. Please wait a few minutes before trying again.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles silent token refresh endpoint.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60, // max 60 refreshes per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many session refresh requests.",
    code: "TOO_MANY_REQUESTS",
  },
});
