import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { writeAuditLog, getIp } from "../lib/auditLog";

const CSRF_COOKIE_NAME = "vastraa_csrf";
const CSRF_HEADER_NAME = "x-csrf-token";

export function generateCsrfToken(): string {
  return crypto.randomBytes(24).toString("hex");
}

export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  // Safe HTTP methods do not mutate state
  const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(req.method.toUpperCase());

  // Check existing CSRF cookie token or set a new one
  let csrfCookie = req.cookies?.[CSRF_COOKIE_NAME];
  if (!csrfCookie) {
    csrfCookie = generateCsrfToken();
    const isProd = process.env.NODE_ENV === "production";
    res.cookie(CSRF_COOKIE_NAME, csrfCookie, {
      httpOnly: false, // Accessible to frontend JS to read & echo in request headers
      secure: isProd,
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  if (isSafeMethod) {
    return next();
  }

  // Exempt requests using Authorization: Bearer header (immune to browser CSRF)
  const authHeader = req.headers.authorization || req.headers.Authorization;
  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return next();
  }

  // Exempt Webhook / Public API routes if needed
  const path = req.originalUrl || req.url || "";
  if (path.includes("/api/webhooks") || path.includes("/api/stripe/webhook")) {
    return next();
  }

  // Compare CSRF header/body against cookie token
  const providedToken = (req.headers[CSRF_HEADER_NAME] || req.body?._csrf || req.headers["x-xsrf-token"]) as string | undefined;

  if (providedToken && csrfCookie) {
    try {
      const bufProvided = Buffer.from(String(providedToken).trim());
      const bufExpected = Buffer.from(String(csrfCookie).trim());
      if (bufProvided.length === bufExpected.length && crypto.timingSafeEqual(bufProvided, bufExpected)) {
        return next();
      }
    } catch {}
  }

  writeAuditLog({
    eventType: "csrf_violation",
    role: "unknown",
    userId: (req as any).userId || "anonymous",
    ipAddress: getIp(req),
    userAgent: req.headers["user-agent"] || "",
    metadata: { path, method: req.method },
  });

  // Return 403 Forbidden
  res.status(403).json({
    error: "Invalid or missing CSRF token. Please refresh the page and try again.",
    code: "CSRF_FAILED",
  });
}
