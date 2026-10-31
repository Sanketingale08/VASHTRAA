import rateLimit from "express-rate-limit";
import { writeAuditLog, getIp } from "../lib/auditLog";

const isTest = process.env.NODE_ENV === "test";

/**
 * Throttles login & registration attempts to prevent brute-force attacks.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 1000 : 15, // max 15 attempts per IP per window
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
  max: isTest ? 1000 : 5, // max 5 requests per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many password reset requests. Please wait 15 minutes before trying again.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles OTP send & verify requests to prevent SMS/email bombing and brute-forcing.
 */
export const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isTest ? 1000 : 10, // max 10 attempts per window
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many verification requests. Please wait a few minutes before trying again.",
    code: "TOO_MANY_REQUESTS",
  },
  handler: (req, res, _next, options) => {
    writeAuditLog({
      eventType: "otp_rate_limit_exceeded",
      role: "unknown",
      ipAddress: getIp(req),
      userAgent: (req.headers["user-agent"] as string) || "",
      metadata: { endpoint: req.originalUrl, limit: options.max },
    }).catch(() => {});
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Throttles silent token refresh endpoint.
 */
export const refreshRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 60, // max 60 refreshes per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many session refresh requests.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles file / media uploads to prevent storage and bandwidth exhaustion.
 */
export const fileUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 40, // max 40 uploads per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many upload requests. Please wait before uploading more files.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles public coupon code validation to prevent automated dictionary brute-forcing.
 */
export const couponValidateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 30, // max 30 code validations per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many coupon validation attempts. Please wait a few minutes.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles guest support ticket & inquiry creation to prevent spam floods.
 */
export const ticketCreationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 15, // max 15 tickets per 15 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many support requests submitted. Please wait before opening another ticket.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles review submissions to prevent rating manipulation and DB write amplification.
 */
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: isTest ? 1000 : 10, // max 10 reviews per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Review submission limit reached. Please wait before posting more reviews.",
    code: "TOO_MANY_REQUESTS",
  },
});

/**
 * Throttles expensive PDF export endpoints to prevent heap memory exhaustion and OOM.
 */
export const pdfExportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: isTest ? 1000 : 5, // max 5 exports per 5 mins
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: "Too many PDF export requests. Please wait a few minutes before downloading again.",
    code: "TOO_MANY_REQUESTS",
  },
});

