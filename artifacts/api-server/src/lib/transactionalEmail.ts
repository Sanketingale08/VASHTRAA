import fs from "fs";
import path from "path";
import { clerkClient } from "@clerk/express";
import { Resend } from "resend";
import nodemailer from "nodemailer";
import crypto from "crypto";
import {
  db,
  emailOutboxTable,
  sellerRegistrationDraftsTable,
  mongoNotificationPreferences,
  mongoUsers,
  mongoOrders,
  mongoSellers,
  mongoVendors,
  vendorsTable,
  ordersTable,
  mongoGeneric,
  mongoSiteSettings,
  siteSettingsTable,
  isMongoDbConnected,
} from "@workspace/db";
import { eq, and, or, lte, lt, inArray, isNull } from "drizzle-orm";
import { logger } from "./logger";
import { insertAdminNotification } from "./adminNotifications";

export const APP_NAME = "VASTRAA";
export const DEFAULT_FROM_ADDRESS = "noreply@vastraasaree.com";
export const DEFAULT_FROM_NAME = "VASTRAA";
export const DEFAULT_REPLY_TO = "support@vastraasaree.com";
export const DEFAULT_FROM = `"${DEFAULT_FROM_NAME}" <${DEFAULT_FROM_ADDRESS}>`;

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 300];

export interface SmtpConfigOverrides {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
  fromName?: string;
  fromEmail?: string;
  replyTo?: string;
}

export interface CachedEmailConfig {
  enabled?: boolean;
  smtpHost?: string;
  smtpPort?: number;
  smtpSecure?: boolean;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
  smtpFromName?: string;
  smtpFromEmail?: string;
  replyTo?: string;
  resendApiKey?: string;
  lastLoaded: number;
}

let cachedEmailConfig: CachedEmailConfig | null = null;

export function clearEmailSettingsCache(): void {
  cachedEmailConfig = null;
}

export function getFrontendUrl(): string {
  return (
    process.env.FRONTEND_URL ||
    process.env.APP_URL ||
    process.env.CLIENT_URL ||
    process.env.VITE_APP_URL ||
    "https://vastraasaree.com"
  ).replace(/\/+$/, "");
}

export function getBackendUrl(): string {
  return (
    process.env.BACKEND_URL ||
    process.env.API_URL ||
    "https://api.vastraasaree.com"
  ).replace(/\/+$/, "");
}

/**
 * Resolves the absolute path to the local Vastraa logo PNG.
 */
export function getLogoPngPath(): string {
  const candidatePaths = [
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "images", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "api-server", "public", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "api-server", "invoice-template", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "vastraa", "public", "images", "logo.png"),
    path.resolve(process.cwd(), "artifacts", "vastraa", "public", "logo.png"),
    path.resolve(process.cwd(), "public", "images", "logo.png"),
    path.resolve(process.cwd(), "public", "logo.png"),
    path.resolve(process.cwd(), "invoice-template", "logo.png"),
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p;
  }
  return candidatePaths[0];
}

/**
 * Returns a Nodemailer-compliant inline CID attachment object for the Vastraa logo.
 */
export function getVastraaLogoAttachment(): {
  filename: string;
  path: string;
  cid: string;
  contentType: string;
} | null {
  const logoPath = getLogoPngPath();
  if (fs.existsSync(logoPath)) {
    return {
      filename: "vastraa-logo.png",
      path: logoPath,
      cid: "vastraa-logo",
      contentType: "image/png",
    };
  }
  return null;
}

/**
 * Resolves the absolute URL or CID for the Vastraa logo used in all email templates.
 * 1. Checks process.env.EMAIL_LOGO_URL or process.env.LOGO_URL (e.g. CDN or cloud storage).
 * 2. If EMAIL_LOGO_INLINE is "true" or "cid", uses inline MIME CID attachment "cid:vastraa-logo".
 * 3. Falls back to frontend or backend URL + /logo.png.
 */
export function getEmailLogoUrl(): string {
  if (process.env.EMAIL_LOGO_URL && process.env.EMAIL_LOGO_URL.trim()) {
    return process.env.EMAIL_LOGO_URL.trim();
  }
  if (process.env.LOGO_URL && process.env.LOGO_URL.trim()) {
    return process.env.LOGO_URL.trim();
  }
  if (process.env.EMAIL_LOGO_INLINE === "true" || process.env.EMAIL_LOGO_INLINE === "cid") {
    return "cid:vastraa-logo";
  }
  const frontend = getFrontendUrl();
  return `${frontend}/logo.png`;
}

export function isEmailEnabled(): boolean {
  return process.env.EMAIL_ENABLED !== "false" && process.env.EMAIL_ENABLED !== "0";
}

export function getReplyToAddress(): string {
  return (
    cachedEmailConfig?.replyTo ||
    process.env.SMTP_REPLY_TO ||
    process.env.EMAIL_REPLY_TO ||
    process.env.SUPPORT_EMAIL ||
    DEFAULT_REPLY_TO
  );
}

export async function refreshEmailSettingsCache(): Promise<CachedEmailConfig> {
  const enabled = isEmailEnabled();
  let host = process.env.SMTP_HOST || process.env.EMAIL_HOST || "smtppro.zoho.in";
  let port = parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || "", 10) || 465;
  let secure = process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === "true"
    : (process.env.EMAIL_SECURE !== undefined
      ? process.env.EMAIL_SECURE === "true"
      : (port === 465));
  let user = process.env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_USERNAME || "support@vastraasaree.com";
  let pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || "";
  let fromName = process.env.SMTP_FROM_NAME || process.env.EMAIL_FROM_NAME || DEFAULT_FROM_NAME;
  let fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM_ADDRESS || DEFAULT_FROM_ADDRESS;
  let replyTo = process.env.SMTP_REPLY_TO || process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || DEFAULT_REPLY_TO;
  let from = process.env.SMTP_FROM || process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL || "";
  let resendApiKey = process.env.RESEND_API_KEY || "";

  try {
    if (mongoSiteSettings && typeof mongoSiteSettings.get === "function") {
      const [dbHost, dbPort, dbSecure, dbUser, dbPass, dbFrom, dbFromName, dbFromEmail, dbReplyTo, dbResend] = await Promise.all([
        mongoSiteSettings.get("smtp_host"),
        mongoSiteSettings.get("smtp_port"),
        mongoSiteSettings.get("smtp_secure"),
        mongoSiteSettings.get("smtp_user"),
        mongoSiteSettings.get("smtp_pass"),
        mongoSiteSettings.get("smtp_from"),
        mongoSiteSettings.get("smtp_from_name"),
        mongoSiteSettings.get("smtp_from_email"),
        mongoSiteSettings.get("smtp_reply_to"),
        mongoSiteSettings.get("resend_api_key"),
      ]);
      if (dbHost && String(dbHost).trim()) host = String(dbHost).trim();
      if (dbPort) port = parseInt(String(dbPort), 10) || port;
      if (dbSecure !== null && dbSecure !== undefined) secure = String(dbSecure) === "true";
      if (dbUser && String(dbUser).trim()) user = String(dbUser).trim();
      if (dbPass && String(dbPass).trim()) pass = String(dbPass).trim();
      if (dbFrom && String(dbFrom).trim()) from = String(dbFrom).trim();
      if (dbFromName && String(dbFromName).trim()) fromName = String(dbFromName).trim();
      if (dbFromEmail && String(dbFromEmail).trim()) fromEmail = String(dbFromEmail).trim();
      if (dbReplyTo && String(dbReplyTo).trim()) replyTo = String(dbReplyTo).trim();
      if (dbResend && String(dbResend).trim()) resendApiKey = String(dbResend).trim();
    }
  } catch {}

  cachedEmailConfig = {
    enabled,
    smtpHost: host,
    smtpPort: port,
    smtpSecure: secure,
    smtpUser: user,
    smtpPass: pass,
    smtpFrom: from,
    smtpFromName: fromName,
    smtpFromEmail: fromEmail,
    replyTo,
    resendApiKey,
    lastLoaded: Date.now(),
  };

  return cachedEmailConfig;
}

export function getCachedEmailConfig(): CachedEmailConfig | null {
  return cachedEmailConfig;
}

/**
 * Returns a configured Nodemailer SMTP transporter (supporting Zoho Mail, Hostinger, Gmail, and custom SMTP).
 * Reads:
 *   EMAIL_HOST/SMTP_HOST, EMAIL_PORT/SMTP_PORT, EMAIL_SECURE/SMTP_SECURE, EMAIL_USER/SMTP_USER, EMAIL_PASSWORD/SMTP_PASS,
 *   plus dynamic settings and connection timeouts.
 */
export function getSmtpTransporter(overrides?: SmtpConfigOverrides): nodemailer.Transporter | null {
  const host = overrides?.host ?? process.env.SMTP_HOST ?? process.env.EMAIL_HOST ?? cachedEmailConfig?.smtpHost ?? "smtppro.zoho.in";
  if (!host || host.trim() === "" || host.includes("placeholder")) {
    return null;
  }

  const port = overrides?.port ?? (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : (process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : (cachedEmailConfig?.smtpPort || 465)));
  const isSecure = overrides?.secure ?? (process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === "true"
    : (process.env.EMAIL_SECURE !== undefined
      ? process.env.EMAIL_SECURE === "true"
      : (cachedEmailConfig?.smtpSecure ?? (port === 465))));
  const user = overrides?.user ?? process.env.SMTP_USER ?? process.env.EMAIL_USER ?? process.env.SMTP_USERNAME ?? cachedEmailConfig?.smtpUser;
  const pass = overrides?.pass ?? process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS ?? process.env.EMAIL_PASSWORD ?? process.env.EMAIL_PASS ?? cachedEmailConfig?.smtpPass;

  const isPlaceholderPass = !pass || pass.includes("placeholder") || pass.includes("your_zoho") || pass.includes("your_password");
  if (isPlaceholderPass && process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== "production") {
    return null;
  }

  const auth = user && pass ? { user: user.trim(), pass: pass.trim() } : undefined;
  const isZoho = host.toLowerCase().includes("zoho");

  return nodemailer.createTransport({
    host: host.trim(),
    port,
    secure: isSecure,
    auth,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    requireTLS: !isSecure && (port === 587 || isZoho),
    connectionTimeout: parseInt(process.env.SMTP_CONNECTION_TIMEOUT || "10000", 10),
    greetingTimeout: parseInt(process.env.SMTP_GREETING_TIMEOUT || "10000", 10),
    socketTimeout: parseInt(process.env.SMTP_SOCKET_TIMEOUT || "15000", 10),
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== "false",
      minVersion: "TLSv1.2",
    },
  });
}

/**
 * Verifies Hostinger / Zoho / SMTP server connectivity and authentication.
 * Returns status and safe diagnostics without exposing passwords.
 */
export async function verifySmtpConnection(overrides?: SmtpConfigOverrides): Promise<{
  configured: boolean;
  success: boolean;
  connected: boolean;
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  from?: string;
  error?: string;
}> {
  // Always inspect fresh environment settings or refresh cache
  await refreshEmailSettingsCache().catch(() => {});

  const host = overrides?.host ?? (process.env.SMTP_HOST || process.env.EMAIL_HOST || cachedEmailConfig?.smtpHost);
  const user = overrides?.user ?? (process.env.SMTP_USER || process.env.EMAIL_USER || process.env.SMTP_USERNAME || cachedEmailConfig?.smtpUser);
  const pass = overrides?.pass ?? (process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || cachedEmailConfig?.smtpPass);

  const isPlaceholder = (val?: string) =>
    !val ||
    val.trim() === "" ||
    val.includes("placeholder") ||
    val.includes("your_") ||
    val.includes("example.com");

  const isConfigured = Boolean(
    host && !isPlaceholder(host) &&
    user && !isPlaceholder(user) &&
    pass && !isPlaceholder(pass)
  );

  if (!isConfigured) {
    return {
      configured: false,
      success: false,
      connected: false,
      error: "SMTP credentials (Host, Username, Password) are not fully configured",
    };
  }

  const port = overrides?.port ?? (process.env.EMAIL_PORT ? parseInt(process.env.EMAIL_PORT, 10) : (process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : (cachedEmailConfig?.smtpPort || 465)));
  const isSecure = overrides?.secure ?? (process.env.EMAIL_SECURE !== undefined
    ? process.env.EMAIL_SECURE === "true"
    : (process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === "true"
      : (cachedEmailConfig?.smtpSecure ?? (port === 465))));
  const rawUser = user || "";
  const maskedUser = rawUser
    ? rawUser.replace(/^(.)(.*)(@.*)$/, (_, f, m, end) => `${f}${"*".repeat(Math.max(1, m.length))}${end}`)
    : undefined;

  const transporter = getSmtpTransporter({
    host,
    port,
    secure: isSecure,
    user,
    pass,
  });

  if (!transporter) {
    return {
      configured: true,
      success: false,
      connected: false,
      error: "Unable to create SMTP transporter",
    };
  }

  try {
    await transporter.verify();
    logger.info({ host: host.trim(), port, secure: isSecure, user: maskedUser }, "[SMTP] Hostinger SMTP connection verified successfully");
    return {
      configured: true,
      success: true,
      connected: true,
      host: host.trim(),
      port,
      secure: isSecure,
      user: maskedUser,
      from: getSenderAddress(overrides?.from ? { from: overrides.from } : undefined),
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    const errCode = err?.code || "SMTP_VERIFY_ERROR";
    logger.error({ host: host.trim(), port, errCode, error: errMsg }, "[SMTP] SMTP connection verification failed");
    return {
      configured: true,
      success: false,
      connected: false,
      host: host.trim(),
      port,
      secure: isSecure,
      user: maskedUser,
      from: getSenderAddress(overrides?.from ? { from: overrides.from } : undefined),
      error: errMsg,
    };
  }
}

/**
 * Validates required Zoho SMTP environment variables during application startup.
 * Throws a fatal exception and fails fast in production if required SMTP variables are missing.
 */
export function validateProductionSmtpConfig(): void {
  const host = process.env.SMTP_HOST || process.env.EMAIL_HOST;
  const port = process.env.SMTP_PORT || process.env.EMAIL_PORT;
  const user = process.env.SMTP_USER || process.env.EMAIL_USER;
  const pass = process.env.SMTP_PASSWORD || process.env.SMTP_PASS || process.env.EMAIL_PASSWORD;

  const isProduction = process.env.NODE_ENV === "production";

  const missing: string[] = [];
  if (!host || host.trim() === "" || host.includes("placeholder")) missing.push("SMTP_HOST / EMAIL_HOST");
  if (!port || String(port).trim() === "") missing.push("SMTP_PORT / EMAIL_PORT");
  if (!user || user.trim() === "" || user.includes("placeholder")) missing.push("SMTP_USER / EMAIL_USER");
  if (!pass || pass.trim() === "" || pass.includes("placeholder") || pass.includes("your_zoho")) missing.push("SMTP_PASSWORD / SMTP_PASS / EMAIL_PASSWORD");

  if (missing.length > 0) {
    const errorMsg = `[SMTP CONFIG ERROR] Missing required SMTP environment variables for production email delivery: ${missing.join(", ")}`;
    if (isProduction) {
      logger.fatal({ missing }, errorMsg);
      throw new Error(errorMsg);
    } else {
      logger.warn({ missing }, `[SMTP CONFIG NOTICE] ${errorMsg}`);
    }
  } else {
    logger.info(
      {
        host,
        port,
        secure: process.env.SMTP_SECURE || process.env.EMAIL_SECURE || "true",
        user: user.replace(/^(.)(.*)(@.*)$/, (_, f, m, end) => `${f}${"*".repeat(Math.max(1, m.length))}${end}`),
      },
      "[SMTP CONFIG] Production Zoho SMTP configuration validated successfully"
    );
  }
}

export function getResendClient(): Resend | null {
  const apiKey = cachedEmailConfig?.resendApiKey || process.env.RESEND_API_KEY;
  if (
    !apiKey ||
    apiKey.trim() === "" ||
    apiKey.includes("placeholder") ||
    apiKey.includes("your_resend") ||
    apiKey.startsWith("re_123456")
  ) {
    return null;
  }
  return new Resend(apiKey.trim());
}

export function getSenderAddress(overrides?: { from?: string; fromName?: string; fromEmail?: string }): string {
  const fromName =
    overrides?.fromName ||
    cachedEmailConfig?.smtpFromName ||
    process.env.EMAIL_FROM_NAME ||
    process.env.SMTP_FROM_NAME ||
    DEFAULT_FROM_NAME;

  const configuredFrom =
    overrides?.fromEmail ||
    overrides?.from ||
    cachedEmailConfig?.smtpFromEmail ||
    cachedEmailConfig?.smtpFrom ||
    process.env.EMAIL_FROM_ADDRESS ||
    process.env.SMTP_FROM_EMAIL ||
    process.env.SMTP_FROM ||
    process.env.EMAIL_USER ||
    process.env.SMTP_USER ||
    process.env.RESEND_FROM_EMAIL ||
    process.env.FROM_EMAIL;

  if (configuredFrom && configuredFrom.trim()) {
    const trimmed = configuredFrom.trim();
    if (trimmed.includes("<")) return trimmed;
    return `"${fromName}" <${trimmed}>`;
  }
  return `"${fromName}" <${DEFAULT_FROM_ADDRESS}>`;
}

/**
/**
 * Resolves the email address attached to an order from MongoDB Atlas or PostgreSQL Drizzle.
 * Inspects order.customerEmail, order.email, order.userEmail, order.contactEmail,
 * order.address.email, shippingAddress.email, deliveryAddress.email, and billingAddress.email.
 */
export async function getOrderAttachedEmail(
  orderId: string
): Promise<{ email: string | null; name?: string; source: string }> {
  const cleanOrderId = (orderId || "").trim();
  if (!cleanOrderId) return { email: null, source: "none" };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  try {
    let order: any = null;

    // 1. Check MongoDB Atlas mongoOrders
    if (mongoOrders && typeof mongoOrders.findById === "function") {
      order = await mongoOrders.findById(cleanOrderId);
    }

    // 2. Check direct MongoDB collection (matching id, displayId, orderId, or _id)
    if (!order && isMongoDbConnected()) {
      try {
        const col = mongoGeneric.getCollection("orders");
        order = await col.findOne({
          $or: [
            { id: cleanOrderId },
            { displayId: cleanOrderId },
            { orderId: cleanOrderId },
            { _id: cleanOrderId as any },
          ],
        });
      } catch {}
    }

    // 3. Check SQL ordersTable (Postgres / SQLite)
    if (!order) {
      try {
        const rows = await db
          .select()
          .from(ordersTable)
          .where(or(eq(ordersTable.id, cleanOrderId), eq(ordersTable.displayId, cleanOrderId)))
          .limit(1);
        if (rows.length > 0) order = rows[0];
      } catch {}
    }

    if (order) {
      const addr = (order.address || order.shippingAddress || order.deliveryAddress || order.billingAddress) as any;
      const candidates = [
        order.customerEmail,
        order.email,
        order.userEmail,
        order.contactEmail,
        addr?.email,
        addr?.contactEmail,
        addr?.customerEmail,
        addr?.userEmail,
      ];

      for (const cand of candidates) {
        if (typeof cand === "string" && emailRegex.test(cand.trim())) {
          const name =
            (addr && (addr.name || addr.fullName || addr.recipientName)) ||
            order.customerName ||
            order.userName ||
            undefined;
          return {
            email: cand.trim().toLowerCase(),
            name,
            source: "order_attached",
          };
        }
      }
    }
  } catch (err) {
    logger.debug({ err, cleanOrderId }, "[transactionalEmail] getOrderAttachedEmail error");
  }

  return { email: null, source: "none" };
}

/**
 * Resolves a trusted customer or user email address from:
 * 1. Email attached to the order (highest priority when orderId is provided)
 * 2. Direct email string passed as userId
 * 3. MongoDB Atlas users collection
 * 4. Clerk users API
 * 5. Seller / Vendor accounts
 */
export async function getRecipientEmail(
  userId: string,
  orderId?: string | null
): Promise<{ email: string | null; name?: string; source: string }> {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  // 1. If an orderId is provided, first prioritize the email attached to that order!
  if (orderId && orderId.trim()) {
    const attached = await getOrderAttachedEmail(orderId);
    if (attached.email) {
      return attached;
    }
  }

  const cleanId = (userId || "").trim();

  // 2. If cleanId itself is already a valid email address
  if (emailRegex.test(cleanId)) {
    return { email: cleanId.toLowerCase(), source: "direct" };
  }

  if (!cleanId) return { email: null, source: "none" };

  // 3. Check MongoDB Atlas users collection
  try {
    if (mongoUsers && typeof mongoUsers.findById === "function") {
      const user = await mongoUsers.findById(cleanId);
      if (user?.email && emailRegex.test(user.email)) {
        return {
          email: user.email.trim().toLowerCase(),
          name: user.name || undefined,
          source: "mongodb",
        };
      }
    }
  } catch (err) {
    logger.debug({ err, cleanId }, "[transactionalEmail] mongoUsers lookup notice");
  }

  // 4. Fallback to Clerk API
  try {
    const user = await clerkClient.users.getUser(cleanId);
    const email = user.primaryEmailAddress?.emailAddress ?? user.emailAddresses?.[0]?.emailAddress ?? null;
    if (email && emailRegex.test(email)) {
      const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined;
      return { email: email.trim().toLowerCase(), name, source: "clerk" };
    }
  } catch {
    // Clerk user not found or error
  }

  // 5. Fallback check for seller / vendor accounts
  const sellerRes = await getSellerRecipientEmail(cleanId);
  if (sellerRes.email) {
    return {
      email: sellerRes.email,
      name: sellerRes.name || sellerRes.storeName,
      source: sellerRes.source,
    };
  }

  return { email: null, source: "none" };
}

/**
 * Resolves a seller's registered email address, contact person/store name, and verified profile
 * from MongoDB Atlas mongoSellers / mongoVendors and owner accounts.
 */
export async function getSellerRecipientEmail(
  vendorId: string
): Promise<{ email: string | null; name?: string; storeName?: string; source: string }> {
  const cleanId = (vendorId || "").trim();
  if (!cleanId) return { email: null, source: "none" };

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(cleanId)) {
    return { email: cleanId.toLowerCase(), source: "direct" };
  }

  // 1. Check MongoDB Atlas mongoSellers / mongoVendors
  try {
    const sellersRepo = mongoSellers || mongoVendors;
    if (sellersRepo) {
      const seller =
        (await sellersRepo.findById?.(cleanId)) ||
        (await sellersRepo.findByVendorId?.(cleanId)) ||
        (await sellersRepo.findBySellerId?.(cleanId)) ||
        (await sellersRepo.findByOwnerId?.(cleanId));

      if (seller) {
        const storeName = seller.shopName || seller.name || seller.sellerName || "Seller Partner";
        const directEmail = seller.contactEmail || seller.email;
        if (directEmail && emailRegex.test(directEmail)) {
          return {
            email: directEmail.trim().toLowerCase(),
            name: seller.sellerName || seller.name || storeName,
            storeName,
            source: "mongo_seller",
          };
        }

        // Check seller owner account in mongoUsers
        const ownerId = seller.ownerId || seller.userId;
        if (ownerId && mongoUsers && typeof mongoUsers.findById === "function") {
          const ownerUser = await mongoUsers.findById(ownerId);
          if (ownerUser?.email && emailRegex.test(ownerUser.email)) {
            return {
              email: ownerUser.email.trim().toLowerCase(),
              name: ownerUser.name || storeName,
              storeName,
              source: "mongo_seller_owner",
            };
          }
        }
      }
    }
  } catch (err) {
    logger.debug({ err, cleanId }, "[transactionalEmail] mongoSellers lookup notice");
  }

  // 2. Check mongoUsers directly (in case vendorId was passed as ownerId)
  try {
    if (mongoUsers && typeof mongoUsers.findById === "function") {
      const user = await mongoUsers.findById(cleanId);
      if (user?.email && emailRegex.test(user.email)) {
        return {
          email: user.email.trim().toLowerCase(),
          name: user.name,
          storeName: user.name,
          source: "mongo_user",
        };
      }
    }
  } catch {}

  // 3. Fallback to PostgreSQL vendorsTable
  try {
    if (vendorsTable) {
      const [vendor] = await db
        .select()
        .from(vendorsTable)
        .where(eq(vendorsTable.id, cleanId))
        .limit(1);

      if (vendor) {
        const storeName = vendor.name || "Seller Partner";
        if (vendor.contactEmail && emailRegex.test(vendor.contactEmail)) {
          return {
            email: vendor.contactEmail.trim().toLowerCase(),
            name: storeName,
            storeName,
            source: "pg_vendor",
          };
        }
        if (vendor.ownerId) {
          const ownerRes = await getRecipientEmail(vendor.ownerId);
          if (ownerRes.email) {
            return {
              email: ownerRes.email,
              name: ownerRes.name || storeName,
              storeName,
              source: "pg_vendor_owner",
            };
          }
        }
      }
    }
  } catch {}

  return { email: null, source: "none" };
}

// Preserve existing getUserEmail for backward compatibility
export async function getUserEmail(userId: string): Promise<string | null> {
  const res = await getRecipientEmail(userId);
  return res.email;
}

export type TransactionalEmailType =
  // Customer Order Lifecycle
  | "order_placed"
  | "order_confirmed"
  | "order_processing"
  | "order_packed"
  | "order_shipped"
  | "out_for_delivery"
  | "order_delivered"
  | "order_cancelled"
  | "order_status_updated"
  | "vendor_item_rejected"
  // Returns & Refunds
  | "return_requested"
  | "return_approved"
  | "return_rejected"
  | "refund_requested"
  | "refund_approved"
  | "refund_rejected"
  | "refund_processed"
  | "refund_completed"
  // Payments
  | "payment_successful"
  | "payment_failed"
  // Account & Security
  | "account_welcome"
  | "customer_email_verification"
  | "password_reset"
  | "password_changed"
  | "security_alert"
  | "email_change_otp"
  | "phone_change_otp"
  | "registration_otp"
  // Offers & Promotions
  | "promotional_campaign"
  | "coupon_available"
  | "coupon_expiry"
  // Customer Support
  | "support_ticket_created"
  | "support_ticket_status"
  | "support_ticket_reply"
  // Seller Order Notifications
  | "seller_new_order"
  | "seller_order_cancelled"
  | "seller_order_status_updated"
  // Vendor Lifecycle
  | "vendor_lifecycle"
  | "seller_approval"
  | "seller_rejection"
  | "seller_suspension"
  | "seller_reactivation"
  | "seller_registration_nudge"
  | "seller_verification";

export interface SellerItemInfo {
  name: string;
  quantity: number;
  price: number;
  subtotal?: number;
  variant?: string;
  sku?: string;
}

export interface EmailPayload {
  userId: string;
  type: TransactionalEmailType;
  orderId?: string | null;
  vendorId?: string | null;
  itemName?: string;
  extraItemCount?: number;
  totalAmount?: number | string;
  note?: string;
  reference?: string;
  trackingNumber?: string;
  courierName?: string;
  carrier?: string;
  trackingUrl?: string;
  ticketId?: string;
  subject?: string;
  customHtml?: string;
  customText?: string;
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  idempotencyKey?: string;
  toEmail?: string;
  // Detailed Order & Customer Data
  items?: Array<{
    name: string;
    quantity: number;
    price?: number;
    subtotal?: number;
    variant?: string;
    sku?: string;
  }>;
  shippingAddress?: {
    name?: string;
    address?: string;
    street?: string;
    city?: string;
    state?: string;
    pincode?: string;
    postalCode?: string;
    phone?: string;
    email?: string;
  };
  paymentMethod?: string;
  paymentStatus?: string;
  previousStatus?: string;
  newStatus?: string;
  updatedTimestamp?: string | Date;
  // Seller specific fields
  sellerStoreName?: string;
  sellerItems?: SellerItemInfo[];
  settlementAmount?: number | string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPincode?: string;
  customerDeliveryRegion?: string;
}

function formatInr(amount: number | string | undefined | null): string {
  if (amount == null || amount === "") return "";
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (Number.isNaN(num)) return String(amount);
  return `₹${num.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

/**
 * Converts rich HTML email bodies into clean, readable plain-text alternatives.
 */
export function htmlToPlainText(html: string): string {
  if (!html) return "";
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<li>/gi, " • ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<td[^>]*>/gi, " ")
    .replace(/<\/table>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

/**
 * Wraps content in a responsive, mobile-optimized HTML template matching VASTRAA's
 * luxury branding (Deep Imperial Purple #3B1254, Royal Gold #D4AF37, Plum #4A154B, white card).
 */
export function wrapInTemplate(
  subject: string,
  body: string,
  options?: { customerName?: string; previewText?: string; logoUrl?: string }
): string {
  const year = new Date().getFullYear();
  const greeting = options?.customerName
    ? `<p style="margin:0 0 16px;font-size:16px;font-weight:600;color:#3B1254;">Namaste ${options.customerName},</p>`
    : "";
  const preview = options?.previewText
    ? `<div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${options.previewText}</div>`
    : "";
  const logoUrl = options?.logoUrl || getEmailLogoUrl();

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#FAF7FD;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  ${preview}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#FAF7FD;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:620px;background-color:#FFFFFF;border-radius:16px;overflow:hidden;border:1px solid #E9D5FF;box-shadow:0 4px 24px -2px rgba(59,18,84,0.08);">
          <!-- Brand Header: Luxury Royal Purple & Gold with High-Contrast White Logo Badge -->
          <tr>
            <td style="background-color:#3B1254;padding:26px 36px 20px;text-align:center;border-bottom:3px solid #C5A265;">
              <table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td align="center" style="background-color:#FFFFFF;border-radius:12px;padding:12px 28px;border:1px solid #D4AF37;box-shadow:0 4px 14px rgba(0,0,0,0.22);">
                    <a href="${getFrontendUrl()}" target="_blank" style="text-decoration:none;display:inline-block;">
                      <img src="${logoUrl}" alt="VASTRAA" width="170" style="border:0;display:block;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;max-height:48px;max-width:200px;width:auto;margin:0 auto;" />
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:8px 0 0;font-size:11px;letter-spacing:2px;color:#C5A265;text-transform:uppercase;font-weight:600;">The Art of Indian Drape</p>
            </td>
          </tr>
          <!-- Main Body -->
          <tr>
            <td style="padding:36px;color:#1E293B;font-size:15px;line-height:1.65;">
              ${greeting}
              ${body}
            </td>
          </tr>
          <!-- Brand Footer -->
          <tr>
            <td style="background-color:#FAF7FD;padding:24px 36px;border-top:1px solid #E9D5FF;text-align:center;">
              <p style="margin:0 0 12px;font-size:13px;color:#6B7280;">
                <a href="${getFrontendUrl()}/account/orders" style="color:#4A154B;text-decoration:none;font-weight:600;margin:0 8px;">My Orders</a> •
                <a href="${getFrontendUrl()}/account/support" style="color:#4A154B;text-decoration:none;font-weight:600;margin:0 8px;">Help & Support</a> •
                <a href="${getFrontendUrl()}" style="color:#4A154B;text-decoration:none;font-weight:600;margin:0 8px;">Visit VASTRAA</a>
              </p>
              <p style="margin:0 0 8px;font-size:13px;font-weight:700;color:#3B1254;letter-spacing:0.5px;">
                VASTRAA – The Art of Indian Drape
              </p>
              <p style="margin:0 0 8px;font-size:12px;color:#6B7280;">
                &copy; ${year} VASTRAA. All rights reserved. Connecting master weavers across India with saree connoisseurs.
              </p>
              <p style="margin:0;font-size:11px;color:#6B7280;">
                Have questions or need assistance? Write to our concierge at <a href="mailto:${getReplyToAddress()}" style="color:#7E22CE;text-decoration:none;font-weight:600;">${getReplyToAddress()}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildEmailContent(
  type: TransactionalEmailType,
  itemName: string,
  extra: string,
  note?: string,
  reference?: string,
  payload?: EmailPayload
): { subject: string; html: string } {
  const itemLabel = `<strong>${itemName}${extra}</strong>`;
  const orderId = payload?.orderId || reference || "";
  const amountStr = payload?.totalAmount ? formatInr(payload.totalAmount) : "";
  const amountHtml = amountStr ? `<p style="margin:12px 0;font-size:15px;">Total Amount: <strong style="color:#3B1254;">${amountStr}</strong></p>` : "";
  const btnStyle = "background-color:#4A154B;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;letter-spacing:0.5px;box-shadow:0 4px 12px rgba(74,21,75,0.2);";

  switch (type) {
    case "order_placed": {
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);
      return {
        subject: `Your ${APP_NAME} Order Placed Successfully${orderId ? ` (#${orderId})` : ""}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#E0F2FE;color:#0369A1;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Order Placed</span>
          </div>
          <p>Thank you for shopping with <strong>${APP_NAME}</strong>! Your order for ${itemLabel} has been successfully placed.</p>
          ${amountHtml}
          <p>We are coordinating with our artisanal weavers to prepare your package with utmost care.</p>
          ${orderId ? `
          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">View Order Details</a>
          </div>` : ""}
          <p style="font-size:13px;color:#64748B;">You will receive another update as soon as your order is confirmed and packaged.</p>
        `,
      };
    }

    case "order_confirmed": {
      const itemsList = payload?.items && payload.items.length > 0
        ? payload.items
        : [{ name: itemName || "Handcrafted Saree", quantity: 1, price: typeof payload?.totalAmount === "number" ? payload.totalAmount : 0, subtotal: typeof payload?.totalAmount === "number" ? payload.totalAmount : 0 }];

      const totalItemsCount = itemsList.reduce((acc, it) => acc + (it.quantity || 1), 0);
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);

      const itemsRowsHtml = itemsList.map((it) => {
        const itemSubtotal = it.subtotal != null ? it.subtotal : (it.price || 0) * (it.quantity || 1);
        const variantInfo = (it as any).variant ? `<br/><span style="font-size:12px;color:#64748B;">Option: ${(it as any).variant}</span>` : "";
        return `
          <tr style="border-bottom:1px solid #E2E8F0;">
            <td style="padding:12px 10px;font-size:14px;color:#1E293B;">
              <strong>${it.name}</strong>
              ${variantInfo}
            </td>
            <td style="padding:12px 10px;font-size:14px;color:#475569;text-align:center;">${it.quantity}</td>
            <td style="padding:12px 10px;font-size:14px;color:#475569;text-align:right;">${formatInr(it.price)}</td>
            <td style="padding:12px 10px;font-size:14px;color:#0A1F44;font-weight:700;text-align:right;">${formatInr(itemSubtotal)}</td>
          </tr>
        `;
      }).join("");

      const addr = payload?.shippingAddress;
      const addrHtml = addr ? `
        <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:24px 0;">
          <h4 style="margin:0 0 10px;font-size:14px;color:#0A1F44;text-transform:uppercase;letter-spacing:0.5px;">Delivery Address</h4>
          <p style="margin:0 0 4px;font-size:14px;font-weight:600;color:#1E293B;">${addr.name || ""}</p>
          <p style="margin:0 0 4px;font-size:14px;color:#475569;">${[addr.address, addr.street, addr.city, addr.state].filter(Boolean).join(", ")}</p>
          <p style="margin:0 0 4px;font-size:14px;color:#475569;">PIN: <strong>${addr.pincode || addr.postalCode || ""}</strong></p>
          ${addr.phone ? `<p style="margin:0;font-size:14px;color:#64748B;">Contact Phone: ${addr.phone}</p>` : ""}
        </div>
      ` : "";

      const paymentMethod = payload?.paymentMethod || (payload as any).paymentMode || "Prepaid";
      const paymentStatus = payload?.paymentStatus || "Confirmed";
      const paymentHtml = `
        <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:24px 0;">
          <h4 style="margin:0 0 10px;font-size:14px;color:#0A1F44;text-transform:uppercase;letter-spacing:0.5px;">Payment Details</h4>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr>
              <td style="font-size:14px;color:#64748B;padding-bottom:6px;">Payment Method:</td>
              <td style="font-size:14px;font-weight:600;color:#1E293B;text-align:right;padding-bottom:6px;">${paymentMethod}</td>
            </tr>
            <tr>
              <td style="font-size:14px;color:#64748B;padding-bottom:6px;">Payment Status:</td>
              <td style="font-size:14px;font-weight:700;color:#15803D;text-align:right;padding-bottom:6px;">${paymentStatus}</td>
            </tr>
            ${amountStr ? `
            <tr>
              <td style="font-size:15px;font-weight:700;color:#0A1F44;padding-top:8px;border-top:1px solid #CBD5E1;">Grand Total:</td>
              <td style="font-size:16px;font-weight:800;color:#0A1F44;text-align:right;padding-top:8px;border-top:1px solid #CBD5E1;">${amountStr}</td>
            </tr>` : ""}
          </table>
        </div>
      `;

      return {
        subject: `Your ${APP_NAME} order ${orderId ? `#${orderId} ` : ""}has been confirmed`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Order Confirmed</span>
          </div>
          <p>Thank you for shopping with <strong>${APP_NAME}</strong>! Your order for ${itemLabel} has been <strong>confirmed</strong>.</p>
          ${amountHtml}
          ${reference ? `<p style="font-size:13px;color:#64748B;">Order reference: <code>${reference}</code></p>` : ""}

          <h4 style="margin:24px 0 12px;font-size:15px;color:#0A1F44;text-transform:uppercase;letter-spacing:0.5px;">Order Summary (${totalItemsCount} ${totalItemsCount === 1 ? "Item" : "Items"})</h4>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;border-collapse:collapse;">
            <thead>
              <tr style="background-color:#F1F5F9;border-bottom:2px solid #CBD5E1;font-size:12px;color:#475569;text-transform:uppercase;">
                <th style="padding:10px;text-align:left;">Product</th>
                <th style="padding:10px;text-align:center;">Qty</th>
                <th style="padding:10px;text-align:right;">Price</th>
                <th style="padding:10px;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>

          ${paymentHtml}
          ${addrHtml}

          <p style="margin-top:20px;">Our artisan partners are preparing your items with great care. You'll receive another update as soon as your order is packed and dispatched.</p>
          ${orderId ? `
          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">Track Your Order</a>
          </div>` : ""}
        `,
      };
    }

    case "order_status_updated": {
      const prev = payload?.previousStatus || "Processing";
      const next = payload?.newStatus || "Updated";
      const updatedTime = payload?.updatedTimestamp
        ? (payload.updatedTimestamp instanceof Date ? payload.updatedTimestamp.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : String(payload.updatedTimestamp))
        : new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const trackingNumber = payload?.trackingNumber || reference;
      const courierName = payload?.courierName || payload?.carrier;
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);

      return {
        subject: `Order Status Update: #${orderId || "Order"} is now ${next} — ${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#E0F2FE;color:#0369A1;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Status Update</span>
          </div>
          <p>The status of your order <strong>#${orderId || "Order"}</strong> (${itemLabel}) has been updated.</p>

          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:12px;padding:20px;margin:24px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding-bottom:12px;font-size:14px;color:#64748B;">Order Number:</td>
                <td style="padding-bottom:12px;font-size:14px;font-weight:700;color:#0A1F44;text-align:right;">#${orderId || "Pending"}</td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;font-size:14px;color:#64748B;">Status Progress:</td>
                <td style="padding-bottom:12px;text-align:right;">
                  <span style="background-color:#F1F5F9;color:#475569;font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px;text-transform:uppercase;">${prev}</span>
                  <span style="margin:0 6px;color:#94A3B8;font-weight:bold;">➔</span>
                  <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px;text-transform:uppercase;">${next}</span>
                </td>
              </tr>
              <tr>
                <td style="padding-bottom:12px;font-size:14px;color:#64748B;">Updated At:</td>
                <td style="padding-bottom:12px;font-size:14px;color:#1E293B;text-align:right;">${updatedTime}</td>
              </tr>
              ${courierName ? `
              <tr>
                <td style="padding-bottom:12px;font-size:14px;color:#64748B;">Courier:</td>
                <td style="padding-bottom:12px;font-size:14px;font-weight:600;color:#0A1F44;text-align:right;">${courierName}</td>
              </tr>` : ""}
              ${trackingNumber ? `
              <tr>
                <td style="font-size:14px;color:#64748B;">Tracking / AWB:</td>
                <td style="font-size:14px;font-family:monospace;font-weight:700;color:#0A1F44;text-align:right;">${trackingNumber}</td>
              </tr>` : ""}
            </table>
          </div>

          ${note ? `<div style="background-color:#EFF6FF;border-left:4px solid #3B82F6;padding:12px 16px;margin:20px 0;font-size:13px;color:#1E40AF;"><strong>Update Note:</strong> ${note}</div>` : ""}

          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">Track Order Online</a>
          </div>
        `,
      };
    }

    case "order_processing": {
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);
      return {
        subject: `Your ${APP_NAME} order ${orderId ? `#${orderId} ` : ""}is being processed`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEF3C7;color:#B45309;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Processing</span>
          </div>
          <p>Your order for ${itemLabel} is currently <strong>processing</strong> with our master artisan partners.</p>
          <p>Each piece is inspected for fabric authenticity, weave density, and finishing before dispatch.</p>
          ${orderId ? `
          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">Track Order Status</a>
          </div>` : ""}
        `,
      };
    }

    case "order_packed": {
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);
      return {
        subject: `Your ${APP_NAME} order ${orderId ? `#${orderId} ` : ""}is packed and ready`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DBEAFE;color:#1D4ED8;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Packed</span>
          </div>
          <p>Good news! Your order for ${itemLabel} has been <strong>packed and secured</strong> in our premium packaging.</p>
          <p>It is currently awaiting courier pickup for dispatch. You'll receive tracking details shortly.</p>
          ${orderId ? `
          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">View Order Details</a>
          </div>` : ""}
        `,
      };
    }

    case "order_shipped": {
      const trackingNumber = payload?.trackingNumber || reference;
      const courierName = payload?.courierName || payload?.carrier;
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);
      return {
        subject: `Your ${APP_NAME} Order ${orderId ? `#${orderId} ` : ""}Has Been Shipped`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#EEF2FF;color:#4338CA;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Dispatched</span>
          </div>
          <p>Great news! Your order for ${itemLabel} has been <strong>dispatched</strong> and is on its way to you.</p>
          ${courierName ? `<p><strong>Courier:</strong> ${courierName}</p>` : ""}
          ${trackingNumber ? `<p><strong>Tracking Number (AWB):</strong> <code>${trackingNumber}</code></p>` : ""}
          <p>You can track your package live at any time using the link below:</p>
          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">Track Your Package</a>
          </div>
        `,
      };
    }

    case "out_for_delivery":
      return {
        subject: `Your ${APP_NAME} order ${orderId ? `#${orderId} ` : ""}is out for delivery today`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#E0F2FE;color:#0284C7;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Out For Delivery</span>
          </div>
          <p>Your order for ${itemLabel} is <strong>out for delivery today</strong> and should arrive shortly.</p>
          ${reference ? `<p>Tracking reference: <code>${reference}</code></p>` : ""}
          <p>Please ensure someone is available at your delivery address to receive the parcel.</p>
        `,
      };

    case "order_delivered": {
      const trackingUrl = payload?.trackingUrl || (orderId ? `${getFrontendUrl()}/account/orders/${orderId}` : `${getFrontendUrl()}/account/orders`);
      return {
        subject: `Your ${APP_NAME} order ${orderId ? `#${orderId} ` : ""}has been delivered`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Delivered</span>
          </div>
          <p>Your order for ${itemLabel} has been <strong>delivered</strong>. We hope you love your handcrafted piece!</p>
          ${reference ? `<p>Tracking reference: <code>${reference}</code></p>` : ""}
          <p>If you have any feedback or questions regarding your order, our support team is always here to assist.</p>
          ${orderId ? `
          <div style="margin:28px 0;text-align:center;">
            <a href="${trackingUrl}" style="${btnStyle}">View Order Summary</a>
          </div>` : ""}
        `,
      };
    }

    case "order_cancelled":
      return {
        subject: `Order Cancelled: Your ${APP_NAME} order ${orderId ? `#${orderId} ` : ""}has been cancelled`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FFE4E6;color:#BE123C;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Cancelled</span>
          </div>
          <p>We wanted to let you know that your order for ${itemLabel} has been <strong>cancelled</strong>.</p>
          ${note ? `<p><strong>Reason:</strong> ${note}</p>` : ""}
          <p>If payment was already completed, an automatic refund has been initiated to your original payment method.</p>
        `,
      };

    case "vendor_item_rejected":
      return {
        subject: `Update on your ${APP_NAME} order ${orderId ? `#${orderId}` : ""}`,
        html: `
          <p>We wanted to let you know that a seller is unable to fulfil ${itemLabel}.</p>
          <p>If your order contains other items, those are still being prepared. If you have questions, please contact our support team.</p>
        `,
      };

    case "payment_successful":
      return {
        subject: `Payment received for order ${orderId ? `#${orderId} — ` : ""}${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Payment Successful</span>
          </div>
          <p>Your payment for order <strong>#${orderId || "Order"}</strong> (${itemLabel}) was <strong>successful</strong>.</p>
          ${amountHtml}
          ${reference ? `<p style="font-size:13px;color:#64748B;">Transaction ID: <code>${reference}</code></p>` : ""}
          <p>Thank you for choosing ${APP_NAME}. Your order is confirmed and currently in preparation.</p>
        `,
      };

    case "payment_failed":
      return {
        subject: `Payment Unsuccessful: Payment failed for your ${APP_NAME} order ${orderId ? `#${orderId}` : ""}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FFE4E6;color:#BE123C;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Payment Failed</span>
          </div>
          <p>We were unable to process the payment for order <strong>#${orderId || "Order"}</strong> (${itemLabel}).</p>
          ${amountHtml}
          ${note ? `<p><strong>Details:</strong> ${note}</p>` : ""}
          <p>Your order has not been placed. You can retry payment anytime using UPI, Netbanking, or Debit/Credit card.</p>
          ${orderId ? `
          <div style="margin:28px 0;text-align:center;">
            <a href="https://vastraasaree.com/account/orders/${orderId}" style="${btnStyle}">Retry Payment</a>
          </div>` : ""}
        `,
      };

    case "return_requested":
      return {
        subject: `Return request received — ${APP_NAME}`,
        html: `
          <p>We've received your return request for order <strong>#${orderId}</strong> (${itemLabel}).</p>
          <p>Our team is reviewing it and will get back to you shortly with return pickup details. You'll receive another email once a decision has been made.</p>
        `,
      };

    case "return_approved":
      return {
        subject: `Your return has been approved — ${APP_NAME}`,
        html: `
          <p>Great news! Your return request for order <strong>#${orderId}</strong> (${itemLabel}) has been <strong>approved</strong>.</p>
          ${note ? `<p><strong>Note from our team:</strong> ${note}</p>` : ""}
          <p>Please follow the return shipping instructions provided by our support team.</p>
        `,
      };

    case "return_rejected":
      return {
        subject: `Update on your return request — ${APP_NAME}`,
        html: `
          <p>We're sorry to inform you that your return request for order <strong>#${orderId}</strong> (${itemLabel}) was <strong>not approved</strong>.</p>
          ${note ? `<p><strong>Reason:</strong> ${note}</p>` : ""}
          <p>If you have questions, please reach out to our customer concierge.</p>
        `,
      };

    case "refund_requested":
      return {
        subject: `Refund request received — ${APP_NAME}`,
        html: `
          <p>We've received your refund request for order <strong>#${orderId}</strong> (${itemLabel}).</p>
          <p>Our finance team is reviewing it and will process the credit upon verification.</p>
        `,
      };

    case "refund_approved":
      return {
        subject: `Your refund has been approved — ${APP_NAME}`,
        html: `
          <p>Great news! Your refund for order <strong>#${orderId}</strong> (${itemLabel}) has been <strong>approved</strong> and will be processed shortly.</p>
          ${note ? `<p><strong>Note:</strong> ${note}</p>` : ""}
          <p>Refunds typically appear within 5–7 business days depending on your payment method.</p>
        `,
      };

    case "refund_rejected":
      return {
        subject: `Update on your refund request — ${APP_NAME}`,
        html: `
          <p>We're sorry to inform you that your refund request for order <strong>#${orderId}</strong> (${itemLabel}) was <strong>not approved</strong>.</p>
          ${note ? `<p><strong>Reason:</strong> ${note}</p>` : ""}
          <p>If you have questions, please reach out to our support team.</p>
        `,
      };

    case "refund_processed":
    case "refund_completed":
      return {
        subject: `Refund Completed: Your refund has been paid out — ${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Refund Completed</span>
          </div>
          <p>Your refund for order <strong>#${orderId}</strong> (${itemLabel}) has been <strong>successfully transferred</strong>.</p>
          ${reference ? `<p><strong>Payment Reference / UTR:</strong> <code>${reference}</code></p>` : ""}
          <p>If you have not received the funds within 3 business days, please quote the reference above to your bank or reach out to our concierge.</p>
        `,
      };

    case "account_welcome":
      return {
        subject: `Welcome to VASTRAA — Your Account is Ready`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Welcome</span>
          </div>
          <p>Welcome to <strong>${APP_NAME}</strong>, the destination for authentic Indian handloom sarees and artisanal heritage textiles.</p>
          <p>Your account is ready! As a valued member of the ${APP_NAME} community, you can:</p>
          <ul style="padding-left:20px;line-height:1.8;color:#334155;">
            <li>Browse exclusive collections directly from traditional master weavers</li>
            <li>Track your orders and shipments in real-time</li>
            <li>Enjoy seamless returns, priority customer care, and rewards</li>
          </ul>
          <div style="margin:28px 0;text-align:center;">
            <a href="https://vastraasaree.com/catalog" style="${btnStyle}">Explore Handloom Sarees</a>
          </div>
        `,
      };

    case "password_changed":
      return {
        subject: `Your ${APP_NAME} Account Password Changed Successfully`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Security Notice</span>
          </div>
          <p>This is a confirmation that your <strong>${APP_NAME}</strong> account password was updated successfully.</p>
          <p>If you initiated this change, no further action is required.</p>
          <p style="color:#DC2626;font-size:13px;line-height:1.6;margin-top:20px;border-left:3px solid #DC2626;padding-left:12px;">
            <strong>Did not make this change?</strong> Please reset your password immediately or contact our support team at <a href="mailto:support@vastraasaree.com" style="color:#DC2626;">support@vastraasaree.com</a> to secure your account.
          </p>
        `,
      };

    case "security_alert":
      return {
        subject: `Security Alert: ${APP_NAME} account details updated`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Security Alert</span>
          </div>
          <p>An important security action was recorded on your ${APP_NAME} account:</p>
          <p><strong>${note || "Account security settings were updated"}</strong></p>
          <p style="font-size:13px;color:#64748B;">Date & Time: ${new Date().toLocaleString("en-IN")}</p>
          <p>If you authorized this change, you can safely disregard this message.</p>
        `,
      };

    case "support_ticket_created": {
      const ticketId = payload?.ticketId || reference || "Ticket";
      return {
        subject: `Support Ticket Received: #${ticketId} — ${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#E0F2FE;color:#0369A1;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Support Request</span>
          </div>
          <p>Thank you for contacting ${APP_NAME} Customer Support. We have received your query.</p>
          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 8px;font-size:14px;"><strong>Ticket ID:</strong> #${ticketId}</p>
            <p style="margin:0 0 8px;font-size:14px;"><strong>Subject:</strong> ${itemName || "Support Request"}</p>
            <p style="margin:0;font-size:14px;"><strong>Status:</strong> <span style="color:#0A1F44;font-weight:600;">Open</span></p>
          </div>
          <p>Our dedicated support concierge typically responds within 24 hours. You can view updates and reply directly from your support dashboard.</p>
          <div style="margin:28px 0;text-align:center;">
            <a href="https://vastraasaree.com/account/support" style="${btnStyle}">View Support Ticket</a>
          </div>
        `,
      };
    }

    case "support_ticket_reply": {
      const ticketId = payload?.ticketId || reference || "Ticket";
      return {
        subject: `New reply on Support Ticket #${ticketId} — ${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">New Reply</span>
          </div>
          <p>You have received a new reply on your support ticket <strong>#${ticketId}</strong> (<em>${itemName}</em>):</p>
          <div style="background-color:#F8FAFC;border-left:4px solid #0A1F44;padding:16px;margin:20px 0;font-style:italic;color:#334155;">
            "${note || "A support specialist has responded to your inquiry."}"
          </div>
          <div style="margin:28px 0;text-align:center;">
            <a href="https://vastraasaree.com/account/support" style="${btnStyle}">Reply in Support Portal</a>
          </div>
        `,
      };
    }

    case "support_ticket_status": {
      const ticketId = payload?.ticketId || reference || "Ticket";
      return {
        subject: `Update on Support Ticket #${ticketId} — ${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#EEF2FF;color:#4338CA;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Status Update</span>
          </div>
          <p>The status of your support ticket <strong>#${ticketId}</strong> (${itemName}) has been updated.</p>
          ${note ? `<p><strong>Update:</strong> ${note}</p>` : ""}
          <div style="margin:28px 0;text-align:center;">
            <a href="https://vastraasaree.com/account/support" style="${btnStyle}">Check Ticket Status</a>
          </div>
        `,
      };
    }

    case "coupon_available":
      return {
        subject: `Special offer: New coupon code "${reference || "DISCOUNT"}" for you — ${APP_NAME}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Special Offer</span>
          </div>
          <p>We are delighted to offer you an exclusive discount on your next handcrafted saree purchase:</p>
          <div style="margin:24px 0;text-align:center;">
            <div style="display:inline-block;background-color:#F8FAFC;border:2px dashed #C5A265;padding:18px 36px;border-radius:12px;">
              <span style="font-family:monospace;font-size:28px;font-weight:700;letter-spacing:5px;color:#0A1F44;">${reference || "VASTRAA"}</span>
              <p style="margin:8px 0 0;font-size:14px;color:#C5A265;font-weight:600;">${note || "Special Discount"}</p>
            </div>
          </div>
          <div style="margin:28px 0;text-align:center;">
            <a href="https://vastraasaree.com/catalog" style="${btnStyle}">Shop & Apply Coupon</a>
          </div>
        `,
      };

    case "seller_new_order": {
      const storeGreeting = payload?.sellerStoreName || "Seller Partner";
      const settlementStr = payload?.settlementAmount != null ? formatInr(payload.settlementAmount) : "";
      const regionStr =
        payload?.customerDeliveryRegion ||
        [payload?.deliveryCity, payload?.deliveryState, payload?.deliveryPincode].filter(Boolean).join(", ") ||
        "India";

      const itemsList =
        payload?.sellerItems && payload.sellerItems.length > 0
          ? payload.sellerItems
          : [{ name: itemName || "Handloom Item", quantity: 1, price: typeof payload?.totalAmount === "number" ? payload.totalAmount : 0 }];

      const itemsRowsHtml = itemsList
        .map((it) => {
          const itemSubtotal = it.subtotal != null ? it.subtotal : it.price * (it.quantity || 1);
          return `
            <tr style="border-bottom:1px solid #E2E8F0;">
              <td style="padding:12px 8px;font-size:14px;color:#1E293B;"><strong>${it.name}</strong></td>
              <td style="padding:12px 8px;font-size:14px;color:#475569;text-align:center;">${it.quantity}</td>
              <td style="padding:12px 8px;font-size:14px;color:#475569;text-align:right;">${formatInr(it.price)}</td>
              <td style="padding:12px 8px;font-size:14px;color:#0A1F44;font-weight:700;text-align:right;">${formatInr(itemSubtotal)}</td>
            </tr>
          `;
        })
        .join("");

      return {
        subject: `New Order Received: #${orderId || "Order"} — ${APP_NAME} Action Required`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEF3C7;color:#92400E;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">New Order</span>
          </div>
          <p>Congratulations! You have received a new order on <strong>${APP_NAME}</strong>.</p>
          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 6px;font-size:14px;"><strong>Order ID:</strong> #${orderId || "Pending"}</p>
            <p style="margin:0 0 6px;font-size:14px;"><strong>Store Name:</strong> ${storeGreeting}</p>
            <p style="margin:0 0 6px;font-size:14px;"><strong>Customer Delivery Destination:</strong> ${regionStr}</p>
            ${settlementStr ? `<p style="margin:0;font-size:14px;"><strong>Your Estimated Net Settlement:</strong> <span style="color:#0A1F44;font-weight:700;">${settlementStr}</span></p>` : ""}
          </div>
          <h4 style="margin:24px 0 12px;font-size:15px;color:#0A1F44;text-transform:uppercase;letter-spacing:0.5px;">Ordered Products</h4>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;border-collapse:collapse;">
            <thead>
              <tr style="background-color:#F1F5F9;border-bottom:2px solid #CBD5E1;font-size:12px;color:#475569;text-transform:uppercase;">
                <th style="padding:10px 8px;text-align:left;">Product</th>
                <th style="padding:10px 8px;text-align:center;">Qty</th>
                <th style="padding:10px 8px;text-align:right;">Unit Price</th>
                <th style="padding:10px 8px;text-align:right;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${itemsRowsHtml}
            </tbody>
          </table>
          <div style="background-color:#EFF6FF;border-left:4px solid #3B82F6;padding:12px 16px;border-radius:4px;margin:20px 0;font-size:13px;color:#1E40AF;">
            <strong>Next Steps:</strong> Please inspect, package, and mark this order as packed in your seller portal within 48 hours for courier dispatch.
          </div>
          <div style="margin:28px 0;text-align:center;">
            <a href="${orderId ? `${getFrontendUrl()}/seller/orders/${orderId}` : `${getFrontendUrl()}/seller/orders`}" style="${btnStyle}">
              Open Seller Portal & Fulfill Order
            </a>
          </div>
        `,
      };
    }

    case "seller_order_status_updated": {
      const prev = payload?.previousStatus ? payload.previousStatus.replace(/_/g, " ").toUpperCase() : "PENDING";
      const curr = payload?.newStatus ? payload.newStatus.replace(/_/g, " ").toUpperCase() : (reference || "UPDATED");
      const storeGreeting = payload?.sellerStoreName || "Seller Partner";
      return {
        subject: `Order #${orderId || "Order"} Status Updated: ${curr} — ${APP_NAME} Seller Notice`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#E0E7FF;color:#3730A3;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Order Status Update</span>
          </div>
          <p>Hello <strong>${storeGreeting}</strong>,</p>
          <p>The status of order <strong>#${orderId || "Order"}</strong> has been updated in the ${APP_NAME} marketplace.</p>
          <div style="background-color:#F8FAFC;border:1px solid #E2E8F0;border-radius:8px;padding:16px;margin:20px 0;">
            <p style="margin:0 0 6px;font-size:14px;"><strong>Order ID:</strong> #${orderId || "Pending"}</p>
            <p style="margin:0 0 6px;font-size:14px;"><strong>Previous Status:</strong> ${prev}</p>
            <p style="margin:0 0 6px;font-size:14px;"><strong>New Status:</strong> <span style="color:#0A1F44;font-weight:700;">${curr}</span></p>
            ${payload?.updatedTimestamp ? `<p style="margin:0;font-size:14px;color:#64748B;"><strong>Updated At:</strong> ${new Date(payload.updatedTimestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</p>` : ""}
          </div>
          ${note ? `<p style="font-size:14px;color:#475569;"><strong>Notes / Tracking:</strong> ${note}</p>` : ""}
          <div style="margin:28px 0;text-align:center;">
            <a href="${orderId ? `${getFrontendUrl()}/seller/orders/${orderId}` : `${getFrontendUrl()}/seller/orders`}" style="${btnStyle}">
              View Order in Seller Portal
            </a>
          </div>
        `,
      };
    }

    case "seller_order_cancelled":
      return {
        subject: `Order #${orderId || "Order"} Cancelled — ${APP_NAME} Seller Notice`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEE2E2;color:#991B1B;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Order Cancelled</span>
          </div>
          <p>This is to inform you that order <strong>#${orderId || "Order"}</strong> (${itemLabel}) was cancelled.</p>
          ${note ? `<p><strong>Cancellation Reason:</strong> ${note}</p>` : ""}
          <p>Any reserved inventory for this order has been returned to your store stock.</p>
          <div style="margin:28px 0;text-align:center;">
            <a href="${getFrontendUrl()}/seller/orders" style="${btnStyle}">View Seller Orders</a>
          </div>
        `,
      };

    case "email_change_otp": {
      const code = payload?.reference || reference || "";
      return {
        subject: `Your Verification Code for VASTRAA Email Change is ${code}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#F3E8FF;color:#581C87;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Security Verification</span>
          </div>
          <p style="font-size:15px;color:#3B1254;margin-bottom:16px;">We received a request to update the registered email address for your <strong>${APP_NAME}</strong> account.</p>
          <p style="font-size:14px;color:#475569;margin-bottom:24px;">Please enter the following 6-digit verification code to confirm this email address:</p>
          
          <div style="margin:28px 0;text-align:center;">
            <div style="display:inline-block;background-color:#FAF5FF;border:2px solid #7E22CE;border-radius:12px;padding:20px 40px;box-shadow:0 4px 16px rgba(59,18,84,0.08);">
              <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#3B1254;display:block;">${code}</span>
              <span style="font-size:12px;color:#7E22CE;font-weight:600;margin-top:6px;display:block;letter-spacing:0.5px;">Valid for 10 minutes</span>
            </div>
          </div>

          <div style="background-color:#FAF5FF;border-left:4px solid #7E22CE;padding:12px 16px;margin:24px 0;border-radius:4px;">
            <p style="margin:0;font-size:13px;color:#3B1254;"><strong>Important:</strong> Do not share this verification code with anyone. VASTRAA support representatives will never ask for your code.</p>
          </div>
          <p style="font-size:12px;color:#94A3B8;margin-top:20px;">If you did not request this verification code, please ignore this email or review your account security settings.</p>
        `,
      };
    }

    case "phone_change_otp": {
      const code = payload?.reference || reference || "";
      const phoneFormatted = payload?.note ? `<p style="font-size:14px;color:#475569;margin-bottom:16px;">${payload.note}</p>` : "";
      return {
        subject: `Your Verification Code for VASTRAA Mobile Number Update is ${code}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#F3E8FF;color:#581C87;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Security Verification</span>
          </div>
          <p style="font-size:15px;color:#3B1254;margin-bottom:16px;">We received a request to update the registered mobile phone number for your <strong>${APP_NAME}</strong> account.</p>
          ${phoneFormatted}
          <p style="font-size:14px;color:#475569;margin-bottom:24px;">Please enter the following 6-digit verification code sent to your email to confirm this change:</p>
          
          <div style="margin:28px 0;text-align:center;">
            <div style="display:inline-block;background-color:#FAF5FF;border:2px solid #7E22CE;border-radius:12px;padding:20px 40px;box-shadow:0 4px 16px rgba(59,18,84,0.08);">
              <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#3B1254;display:block;">${code}</span>
              <span style="font-size:12px;color:#7E22CE;font-weight:600;margin-top:6px;display:block;letter-spacing:0.5px;">Valid for 10 minutes</span>
            </div>
          </div>
          <p style="font-size:12px;color:#94A3B8;margin-top:20px;">If you did not request this update, please ignore this email or change your password immediately.</p>
        `,
      };
    }

    case "registration_otp": {
      const code = payload?.reference || reference || "";
      return {
        subject: `Your ${APP_NAME} Verification Code is ${code}`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#F3E8FF;color:#581C87;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Email Verification</span>
          </div>
          <p style="font-size:15px;color:#3B1254;margin-bottom:16px;">Welcome to <strong>${APP_NAME}</strong>! We are delighted to have you join our marketplace dedicated to authentic handloom sarees and artisanal weaves.</p>
          <p style="font-size:14px;color:#475569;margin-bottom:24px;">Please enter the following 6-digit verification code to verify your email address and complete your registration:</p>
          
          <div style="margin:28px 0;text-align:center;">
            <div style="display:inline-block;background-color:#FAF5FF;border:2px solid #7E22CE;border-radius:12px;padding:20px 40px;box-shadow:0 4px 16px rgba(59,18,84,0.08);">
              <span style="font-family:'Courier New',Courier,monospace;font-size:36px;font-weight:800;letter-spacing:8px;color:#3B1254;display:block;">${code}</span>
              <span style="font-size:12px;color:#7E22CE;font-weight:600;margin-top:6px;display:block;letter-spacing:0.5px;">Valid for 10 minutes</span>
            </div>
          </div>

          <div style="background-color:#FAF5FF;border-left:4px solid #7E22CE;padding:12px 16px;margin:24px 0;border-radius:4px;">
            <p style="margin:0;font-size:13px;color:#3B1254;"><strong>Important:</strong> Do not share this verification code with anyone. VASTRAA support representatives will never ask for your code.</p>
          </div>
          <p style="font-size:12px;color:#94A3B8;margin-top:20px;">If you did not initiate this registration on VASTRAA, you can safely ignore this email.</p>
        `,
      };
    }

    case "customer_email_verification": {
      const verificationUrl = payload?.reference || payload?.trackingUrl || reference || "";
      const name = itemName || "Valued Customer";
      return {
        subject: "Verify Your VASTRAA Account",
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#F3E8FF;color:#581C87;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Email Verification</span>
          </div>
          <p style="font-size:16px;font-weight:700;color:#3B1254;margin-bottom:16px;">Welcome to VASTRAA – The Art of Indian Drape!</p>
          <p style="font-size:14px;color:#475569;margin-bottom:12px;">Hello <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#475569;margin-bottom:16px;">Thank you for creating your account.</p>
          <p style="font-size:14px;color:#475569;margin-bottom:24px;">Please verify your email address by clicking the button below.</p>
          
          <div style="margin:28px 0;text-align:center;">
            <a href="${verificationUrl}" target="_blank" style="background:#4A154B;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 32px;border-radius:8px;display:inline-block;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 12px rgba(74,21,75,0.2);">
              Verify My Email
            </a>
          </div>

          <div style="background-color:#FAF5FF;border-left:4px solid #7E22CE;padding:12px 16px;margin:24px 0;border-radius:4px;">
            <p style="margin:0;font-size:13px;font-weight:600;color:#581C87;">This verification link will expire in 15 minutes.</p>
          </div>

          <p style="font-size:12px;color:#64748B;line-height:1.6;margin-top:20px;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${verificationUrl}" style="color:#7E22CE;word-break:break-all;font-size:12px;">${verificationUrl}</a>
          </p>

          <p style="font-size:12px;color:#94A3B8;margin-top:24px;">If you did not create this account, please ignore this email.</p>
        `,
      };
    }

    case "password_reset": {
      const resetUrl = payload?.reference || payload?.trackingUrl || reference || "";
      const isSeller = Boolean(payload?.vendorId || payload?.sellerStoreName);
      const portal = isSeller ? "Seller Portal" : "Account";
      const name = itemName || (isSeller ? "Seller Partner" : "Valued Customer");
      return {
        subject: `Reset your ${APP_NAME} ${portal} password`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#F3E8FF;color:#581C87;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Password Reset</span>
          </div>
          <p style="font-size:15px;color:#3B1254;margin-bottom:16px;">Hello <strong>${name}</strong>,</p>
          <p style="font-size:14px;color:#475569;margin-bottom:16px;">We received a request to reset the password for your <strong>${APP_NAME} ${portal}</strong>.</p>
          <p style="font-size:14px;color:#475569;margin-bottom:24px;">Click the button below to set a new password. For security, this single-use link is valid for <strong>1 hour</strong>.</p>
          
          <div style="margin:28px 0;text-align:center;">
            <a href="${resetUrl}" target="_blank" style="background:#4A154B;color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;padding:14px 28px;border-radius:8px;display:inline-block;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 12px rgba(74,21,75,0.2);">
              Reset Password
            </a>
          </div>

          <p style="font-size:13px;color:#64748B;line-height:1.6;margin-top:24px;">
            If the button doesn't work, copy and paste this link into your browser:<br/>
            <a href="${resetUrl}" style="color:#7E22CE;word-break:break-all;font-size:12px;">${resetUrl}</a>
          </p>

          <div style="background-color:#FAF5FF;border-left:4px solid #7E22CE;padding:12px 16px;margin:24px 0;border-radius:4px;">
            <p style="margin:0;font-size:13px;color:#3B1254;"><strong>Important:</strong> If you did not request a password reset, please ignore this email or contact <a href="mailto:support@vastraasaree.com" style="color:#7E22CE;">support@vastraasaree.com</a>. Your current password remains secure.</p>
          </div>
        `,
      };
    }

    case "seller_approval":
      return {
        subject: `Your ${APP_NAME} Seller Store is Approved & Live!`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Store Approved</span>
          </div>
          <p>Congratulations! Your seller store <strong>${payload?.sellerStoreName || itemName || "Seller Store"}</strong> has been <strong>approved</strong> by the ${APP_NAME} onboarding team.</p>
          <p>Your store is now active and accessible to saree connoisseurs across India. You can begin adding your catalog, updating stock, and receiving orders.</p>
          <div style="margin:28px 0;text-align:center;">
            <a href="${getFrontendUrl()}/seller/dashboard" style="${btnStyle}">Open Seller Dashboard</a>
          </div>
          <p style="font-size:13px;color:#64748B;">Our seller partner concierge is available to guide you on product photography, packaging guidelines, and dispatch scheduling.</p>
        `,
      };

    case "seller_rejection":
      return {
        subject: `Update on your ${APP_NAME} Seller Application`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FFE4E6;color:#BE123C;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Application Status</span>
          </div>
          <p>Thank you for your interest in partnering with <strong>${APP_NAME}</strong>.</p>
          <p>After reviewing the details submitted for <strong>${payload?.sellerStoreName || itemName || "your store"}</strong>, we are unable to approve your application at this time.</p>
          ${note ? `<div style="background-color:#F8FAFC;border-left:4px solid #BE123C;padding:12px 16px;margin:20px 0;font-size:14px;color:#334155;"><strong>Reason:</strong> ${note}</div>` : ""}
          <p>If you believe there was a misunderstanding or if you would like to submit additional documentation, please reply to this email or reach out to our team at <a href="mailto:${getReplyToAddress()}" style="color:#C5A265;">${getReplyToAddress()}</a>.</p>
        `,
      };

    case "seller_suspension":
      return {
        subject: `Important: Your ${APP_NAME} Seller Account has been Suspended`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#FEE2E2;color:#991B1B;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Account Suspended</span>
          </div>
          <p>This is to inform you that your seller store <strong>${payload?.sellerStoreName || itemName || "Seller Store"}</strong> has been temporarily <strong>suspended</strong>.</p>
          <p>While suspended, your listings are hidden from customer search and new orders cannot be placed.</p>
          ${note ? `<div style="background-color:#F8FAFC;border-left:4px solid #991B1B;padding:12px 16px;margin:20px 0;font-size:14px;color:#334155;"><strong>Reason:</strong> ${note}</div>` : ""}
          <p>To request a review or submit an appeal, please contact the seller compliance team at <a href="mailto:${getReplyToAddress()}" style="color:#C5A265;">${getReplyToAddress()}</a>.</p>
        `,
      };

    case "seller_reactivation":
      return {
        subject: `Your ${APP_NAME} Seller Account has been Reactivated`,
        html: `
          <div style="margin-bottom:20px;">
            <span style="background-color:#DCFCE7;color:#15803D;font-size:12px;font-weight:700;padding:4px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:1px;">Account Reactivated</span>
          </div>
          <p>Good news! Your seller store <strong>${payload?.sellerStoreName || itemName || "Seller Store"}</strong> has been <strong>reactivated</strong> by the ${APP_NAME} administrator.</p>
          <p>Your listings are once again active and visible to shoppers. You can log into your seller portal to manage your inventory and orders.</p>
          <div style="margin:28px 0;text-align:center;">
            <a href="${getFrontendUrl()}/seller/dashboard" style="${btnStyle}">Go to Seller Dashboard</a>
          </div>
        `,
      };

    default:
      return {
        subject: `Notification from ${APP_NAME}`,
        html: `<p>${note || `Update regarding ${itemLabel}`}</p>`,
      };
  }
}

const recentSendsCache = new Map<string, number>();

setInterval(() => {
  const cutoff = Date.now() - 300_000;
  for (const [key, ts] of recentSendsCache.entries()) {
    if (ts < cutoff) recentSendsCache.delete(key);
  }
}, 60_000).unref();

/**
 * Checks whether an identical email has already been sent or is pending, preventing duplicates.
 */
async function checkIsDuplicate(
  userId: string,
  type: string,
  orderId?: string | null,
  idempotencyKey?: string | null
): Promise<boolean> {
  const cacheKey = `${userId}:${type}:${orderId || ""}:${idempotencyKey || ""}`;
  const lastSent = recentSendsCache.get(cacheKey);
  if (lastSent && Date.now() - lastSent < 120_000) {
    return true;
  }

  // 1. Check MongoDB Atlas email_outbox
  try {
    if (isMongoDbConnected()) {
      const col = mongoGeneric.getCollection("email_outbox");
      if (idempotencyKey) {
        const foundKey = await col.findOne({
          idempotencyKey,
          status: { $in: ["sent", "pending"] },
        });
        if (foundKey) return true;
      }
      if (orderId) {
        const found = await col.findOne({
          userId,
          type,
          orderId,
          status: { $in: ["sent", "pending"] },
        });
        if (found) return true;
      }
    }
  } catch {}

  // 2. Fallback check relational table
  try {
    if (idempotencyKey) {
      const existingKey = await db
        .select({ id: emailOutboxTable.id })
        .from(emailOutboxTable)
        .where(
          and(
            eq(emailOutboxTable.idempotencyKey, idempotencyKey),
            inArray(emailOutboxTable.status, ["sent", "pending"] as const)
          )
        )
        .limit(1);
      if (existingKey.length > 0) return true;
    }
    if (orderId) {
      const existing = await db
        .select({ id: emailOutboxTable.id })
        .from(emailOutboxTable)
        .where(
          and(
            eq(emailOutboxTable.userId, userId),
            eq(emailOutboxTable.type, type),
            eq(emailOutboxTable.orderId, orderId),
            inArray(emailOutboxTable.status, ["sent", "pending"] as const)
          )
        )
        .limit(1);
      if (existing.length > 0) return true;
    }
  } catch {}
  return false;
}

/**
 * Inserts a record into email_outbox table (and MongoDB email_outbox collection).
 */
async function insertOutboxRow(entry: {
  userId: string;
  orderId?: string | null;
  vendorId?: string | null;
  type: string;
  toEmail: string;
  subject: string;
  html: string;
  status?: "pending" | "sent" | "failed" | "dead" | "skipped";
  errorMessage?: string | null;
  sender?: string | null;
  providerMessageId?: string | null;
  idempotencyKey?: string | null;
}): Promise<{ id: string }> {
  const rowId = crypto.randomUUID();
  const now = new Date();
  const initialStatus = entry.status || "pending";
  const sender = entry.sender || getSenderAddress();

  // 1. Always persist to MongoDB Atlas email_outbox collection first (Primary DB)
  try {
    if (isMongoDbConnected()) {
      const col = mongoGeneric.getCollection("email_outbox");
      await col.insertOne({
        id: rowId,
        userId: entry.userId,
        orderId: entry.orderId || null,
        vendorId: entry.vendorId || null,
        type: entry.type,
        toEmail: entry.toEmail,
        subject: entry.subject,
        html: entry.html,
        status: initialStatus,
        attempts: 0,
        nextRetryAt: now,
        errorMessage: entry.errorMessage || null,
        sender,
        providerMessageId: entry.providerMessageId || null,
        idempotencyKey: entry.idempotencyKey || null,
        createdAt: now,
        updatedAt: now,
      });
    }
  } catch (mErr) {
    logger.debug({ mErr, userId: entry.userId }, "[emailOutbox] mongo insert notice");
  }

  // 2. Also write to relational table if available
  try {
    const [inserted] = await db
      .insert(emailOutboxTable)
      .values({
        id: rowId,
        userId: entry.userId,
        orderId: entry.orderId || null,
        vendorId: entry.vendorId || null,
        type: entry.type,
        toEmail: entry.toEmail,
        subject: entry.subject,
        html: entry.html,
        status: initialStatus,
        attempts: 0,
        nextRetryAt: now,
        errorMessage: entry.errorMessage || null,
        sender,
        providerMessageId: entry.providerMessageId || null,
        idempotencyKey: entry.idempotencyKey || null,
        createdAt: now,
        updatedAt: now,
      } as any)
      .returning({ id: emailOutboxTable.id });
    if (inserted?.id) return { id: inserted.id };
  } catch (dbErr) {
    logger.debug({ dbErr, userId: entry.userId }, "[emailOutbox] db.insert fallback to mongo notice");
  }

  return { id: rowId };
}

/**
 * Attempts delivery using primary SMTP (Nodemailer) with Resend fallback.
 * Works seamlessly whether called with `attemptSend(entry)` or `attemptSend(resend, entry)`
 * to maintain strict backward compatibility with existing tests and workers.
 */
async function attemptSend(first: any, second?: any): Promise<{ delivered: boolean; error?: string | null; messageId?: string; simulated?: boolean }> {
  const resendArg: Resend | null = second ? first : null;
  const entry: {
    id: string;
    toEmail: string;
    subject: string;
    html: string;
    text?: string;
    attempts: number;
    orderId?: string | null;
    userId: string;
    vendorId?: string | null;
    attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>;
  } = second || first;

  const now = new Date();
  const nextAttempt = entry.attempts + 1;
  const from = getSenderAddress();
  const replyTo = getReplyToAddress();
  const plainText = entry.text || htmlToPlainText(entry.html);

  let delivered = false;
  let simulated = false;
  let lastError: string | null = null;
  let providerMessageId: string | null = null;

  // 1. Primary delivery: Hostinger / Zoho / custom SMTP via Nodemailer
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const sendOpts: any = {
        from,
        to: entry.toEmail,
        replyTo,
        subject: entry.subject,
        html: entry.html,
        text: plainText,
      };
      if (entry.attachments && entry.attachments.length > 0) {
        sendOpts.attachments = [...entry.attachments];
      }
      if (entry.html && entry.html.includes("cid:vastraa-logo")) {
        const logoAtt = getVastraaLogoAttachment();
        if (logoAtt) {
          sendOpts.attachments = sendOpts.attachments || [];
          if (!sendOpts.attachments.some((a: any) => a.cid === "vastraa-logo")) {
            sendOpts.attachments.push(logoAtt);
          }
        }
      }
      const info = await smtp.sendMail(sendOpts);
      providerMessageId = info.messageId || null;
      logger.info({ to: entry.toEmail, messageId: info.messageId, orderId: entry.orderId }, "[emailOutbox] Email delivered via SMTP");
      delivered = true;
    } catch (smtpErr: any) {
      lastError = smtpErr instanceof Error ? smtpErr.message : String(smtpErr);
      logger.warn({ to: entry.toEmail, error: lastError }, "[emailOutbox] SMTP send failed; checking fallback transport");
    }
  }

  // 2. Secondary delivery: Resend API fallback (or when Resend client was explicitly passed in tests)
  if (!delivered) {
    const resend = resendArg || getResendClient();
    if (resend) {
      try {
        const sendPayload: any = {
          from,
          to: [entry.toEmail],
          reply_to: replyTo,
          subject: entry.subject,
          html: entry.html,
          text: plainText,
        };
        if (entry.attachments && entry.attachments.length > 0) {
          sendPayload.attachments = [...entry.attachments];
        }
        if (entry.html && entry.html.includes("cid:vastraa-logo")) {
          const logoAtt = getVastraaLogoAttachment();
          if (logoAtt) {
            sendPayload.attachments = sendPayload.attachments || [];
            if (!sendPayload.attachments.some((a: any) => a.filename === logoAtt.filename || a.cid === "vastraa-logo")) {
              try {
                sendPayload.attachments.push({
                  filename: logoAtt.filename,
                  content: fs.readFileSync(logoAtt.path),
                });
              } catch {}
            }
          }
        }
        const res = await resend.emails.send(sendPayload);
        if (res.error) {
          throw new Error(typeof res.error === "string" ? res.error : (res.error?.message || JSON.stringify(res.error)));
        }
        providerMessageId = res.data?.id || null;
        logger.info({ to: entry.toEmail, id: res.data?.id, orderId: entry.orderId }, "[emailOutbox] Email delivered via Resend");
        delivered = true;
      } catch (resendErr: any) {
        lastError = resendErr instanceof Error ? resendErr.message : String(resendErr);
        logger.warn({ to: entry.toEmail, error: lastError }, "[emailOutbox] Resend delivery failed");
      }
    }
  }

  // Update outbox status based on delivery outcome
  if (delivered) {
    try {
      await db
        .update(emailOutboxTable)
        .set({
          status: "sent",
          attempts: nextAttempt,
          lastAttemptAt: now,
          updatedAt: now,
          sender: from,
          providerMessageId: providerMessageId || undefined,
          errorMessage: null,
        })
        .where(eq(emailOutboxTable.id, entry.id));
    } catch {}
    try {
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection("email_outbox");
        await col.updateOne(
          { $or: [{ id: entry.id }, { _id: entry.id as any }] },
          {
            $set: {
              status: "sent",
              attempts: nextAttempt,
              lastAttemptAt: now,
              updatedAt: now,
              sender: from,
              providerMessageId: providerMessageId || undefined,
              errorMessage: null,
            },
          }
        );
      }
    } catch {}
  } else {
    const errMsg = lastError || "No active email transport available";
    if (nextAttempt >= MAX_ATTEMPTS) {
      logger.warn(
        { orderId: entry.orderId, userId: entry.userId, attempts: nextAttempt, error: errMsg },
        "[emailOutbox] Email permanently failed after max attempts — manual follow-up required"
      );
      try {
        await db
          .update(emailOutboxTable)
          .set({
            status: "dead",
            attempts: nextAttempt,
            lastAttemptAt: now,
            updatedAt: now,
            sender: from,
            errorMessage: errMsg,
          })
          .where(eq(emailOutboxTable.id, entry.id));
      } catch {}
      try {
        if (isMongoDbConnected()) {
          const col = mongoGeneric.getCollection("email_outbox");
          await col.updateOne(
            { $or: [{ id: entry.id }, { _id: entry.id as any }] },
            {
              $set: {
                status: "dead",
                attempts: nextAttempt,
                lastAttemptAt: now,
                updatedAt: now,
                sender: from,
                errorMessage: errMsg,
              },
            }
          );
        }
      } catch {}

      // Insert admin alert for manual follow-up
      const isVendorEmail = entry.vendorId != null;
      const notifTitle = isVendorEmail ? "Vendor email delivery permanently failed" : "Customer email delivery permanently failed";
      const notifBody = entry.orderId != null
        ? `Email for order ${entry.orderId} to ${entry.toEmail} could not be delivered after ${nextAttempt} attempts and requires follow-up.`
        : `Email to ${entry.toEmail} could not be delivered after ${nextAttempt} attempts and requires follow-up.`;

      insertAdminNotification({
        type: "email_delivery_failed",
        title: notifTitle,
        body: notifBody,
        metadata: {
          outboxId: entry.id,
          orderId: entry.orderId,
          userId: entry.userId,
          toEmail: entry.toEmail,
          subject: entry.subject,
          attempts: nextAttempt,
          error: errMsg,
        },
      }).catch(() => {});
    } else {
      const backoffSeconds = RETRY_BACKOFF_SECONDS[nextAttempt - 1] ?? 300;
      const nextRetryAt = new Date(now.getTime() + backoffSeconds * 1000);
      try {
        await db
          .update(emailOutboxTable)
          .set({
            status: "failed",
            attempts: nextAttempt,
            lastAttemptAt: now,
            nextRetryAt,
            updatedAt: now,
            sender: from,
            errorMessage: errMsg,
          })
          .where(eq(emailOutboxTable.id, entry.id));
      } catch {}
      try {
        if (isMongoDbConnected()) {
          const col = mongoGeneric.getCollection("email_outbox");
          await col.updateOne(
            { $or: [{ id: entry.id }, { _id: entry.id as any }] },
            {
              $set: {
                status: "failed",
                attempts: nextAttempt,
                lastAttemptAt: now,
                nextRetryAt,
                updatedAt: now,
                sender: from,
                errorMessage: errMsg,
              },
            }
          );
        }
      } catch {}
    }
  }

  return { delivered, error: lastError || (delivered ? null : "No active email transport available"), simulated, messageId: providerMessageId || undefined };
}

/**
 * Main transactional email dispatcher for customers and orders.
 * Handles recipient resolution, consent checking, idempotency, template rendering,
 * and delivery. Never throws to the caller.
 */
export interface SendTransactionalEmailResult {
  queued: boolean;
  delivered: boolean;
  status: "pending" | "sent" | "failed" | "skipped";
  duplicate?: boolean;
  duplicateSuppressed?: boolean;
  error?: string;
  outboxId?: string;
  simulated?: boolean;
  messageId?: string;
}

export async function sendTransactionalEmail(payload: EmailPayload): Promise<SendTransactionalEmailResult> {
  try {
    const { userId, type, orderId } = payload;

    if (!cachedEmailConfig || Date.now() - cachedEmailConfig.lastLoaded > 60_000) {
      await refreshEmailSettingsCache().catch(() => {});
    }

    // 1. Resolve recipient email from database records (or direct payload if provided)
    let recipient: { email: string | null; name?: string; storeName?: string; source: string } | null = payload.toEmail || (payload as any).recipientEmail
      ? {
          email: (payload.toEmail || (payload as any).recipientEmail)!.trim().toLowerCase(),
          name: payload.sellerStoreName || payload.itemName,
          storeName: payload.sellerStoreName,
          source: "payload",
        }
      : null;

    if (!recipient) {
      if (type.startsWith("seller_") || payload.vendorId) {
        const sellerLookup = await getSellerRecipientEmail(payload.vendorId || userId);
        if (sellerLookup.email) {
          recipient = {
            email: sellerLookup.email,
            name: payload.sellerStoreName || sellerLookup.name || sellerLookup.storeName,
            storeName: sellerLookup.storeName,
            source: sellerLookup.source,
          };
        }
      }
      if (!recipient) {
        recipient = await getRecipientEmail(userId, orderId);
      }
    }

    if (!recipient || !recipient.email) {
      logger.warn({ userId, type, orderId }, "[transactionalEmail] Skipped: No valid recipient email found for user");
      await insertOutboxRow({
        userId,
        orderId: orderId || null,
        vendorId: payload.vendorId || null,
        type,
        toEmail: "unknown@unresolved.local",
        subject: payload.subject || `Notification: ${type}`,
        html: `<p>Unresolved recipient for user ${userId}</p>`,
        status: "skipped",
        errorMessage: "no_valid_recipient",
        sender: getSenderAddress(),
      });
      return { queued: false, delivered: false, status: "skipped", error: "no_valid_recipient" };
    }

    const toEmail = recipient.email;

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(toEmail)) {
      logger.warn({ userId, type, orderId, toEmail }, "[transactionalEmail] Skipped: Invalid recipient email format");
      return { queued: false, delivered: false, status: "skipped", error: "invalid_recipient_email" };
    }

    // 2. Check communication consent / preferences (seller operational emails always bypass customer order update toggles)
    const isSellerEmail = type.startsWith("seller_");
    const isOrderEmail =
      !isSellerEmail &&
      (type.startsWith("order_") ||
        type.startsWith("return_") ||
        type.startsWith("refund_") ||
        type.startsWith("payment_") ||
        type === "out_for_delivery" ||
        type === "vendor_item_rejected");
    const isPromotional = type === "promotional_campaign";
    const isCoupon = type.startsWith("coupon_");

    if (isOrderEmail || isPromotional || isCoupon) {
      try {
        const prefs = await mongoNotificationPreferences.findByUserId(userId);
        if (isOrderEmail && prefs.emailOrderUpdates === false) {
          logger.info({ userId, type, orderId }, "[transactionalEmail] Skipped: User opted out of emailOrderUpdates");
          await insertOutboxRow({
            userId,
            orderId: orderId || null,
            vendorId: payload.vendorId || null,
            type,
            toEmail,
            subject: payload.subject || `Notification: ${type}`,
            html: `<p>Opted out of emailOrderUpdates</p>`,
            status: "skipped",
            errorMessage: "user_opted_out",
            sender: getSenderAddress(),
          });
          return { queued: false, delivered: false, status: "skipped", error: "user_opted_out" };
        }
        if (isPromotional && !prefs.emailMarketingUpdates) {
          logger.info({ userId, type }, "[transactionalEmail] Skipped: User opted out of emailMarketingUpdates");
          await insertOutboxRow({
            userId,
            orderId: null,
            vendorId: payload.vendorId || null,
            type,
            toEmail,
            subject: payload.subject || "Promotion",
            html: `<p>Opted out of emailMarketingUpdates</p>`,
            status: "skipped",
            errorMessage: "user_opted_out",
            sender: getSenderAddress(),
          });
          return { queued: false, delivered: false, status: "skipped", error: "user_opted_out" };
        }
        if (isCoupon && !prefs.emailOfferUpdates) {
          logger.info({ userId, type }, "[transactionalEmail] Skipped: User opted out of emailOfferUpdates");
          await insertOutboxRow({
            userId,
            orderId: null,
            vendorId: payload.vendorId || null,
            type,
            toEmail,
            subject: payload.subject || "Offer",
            html: `<p>Opted out of emailOfferUpdates</p>`,
            status: "skipped",
            errorMessage: "user_opted_out",
            sender: getSenderAddress(),
          });
          return { queued: false, delivered: false, status: "skipped", error: "user_opted_out" };
        }
      } catch {}
    }

    // 3. Idempotency Check: Prevent duplicate sends (isolated per vendor in multi-vendor orders)
    const idempotencyKey =
      payload.idempotencyKey ||
      (orderId
        ? payload.vendorId
          ? `${type}:${orderId}:${payload.vendorId}`
          : `${type}:${orderId}`
        : null);
    if (idempotencyKey) {
      const isDuplicate = await checkIsDuplicate(userId, type, orderId, idempotencyKey);
      if (isDuplicate) {
        logger.info({ userId, type, orderId, idempotencyKey }, "[transactionalEmail] Suppressed duplicate email send");
        return { queued: false, delivered: true, duplicate: true, duplicateSuppressed: true, status: "skipped", error: "suppressed_duplicate" };
      }
    }

    // 4. Enrich order details if orderId is provided but details are missing
    let enrichedPayload = { ...payload };
    if (
      orderId &&
      (type === "order_placed" ||
        type === "order_confirmed" ||
        type === "order_status_updated" ||
        type === "order_processing" ||
        type === "order_packed" ||
        type === "order_shipped" ||
        type === "order_delivered" ||
        type === "order_cancelled") &&
      (!payload.items || payload.items.length === 0)
    ) {
      try {
        let orderDoc: any = null;
        if (mongoOrders) {
          orderDoc = await mongoOrders.findById(orderId).catch(() => null);
        }
        if (!orderDoc) {
          const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1).catch(() => []);
          orderDoc = rows[0] || null;
        }
        if (orderDoc) {
          const rawItems = Array.isArray(orderDoc.items)
            ? orderDoc.items
            : typeof orderDoc.items === "string"
            ? JSON.parse(orderDoc.items || "[]")
            : [];
          enrichedPayload = {
            ...enrichedPayload,
            items: rawItems.map((it: any) => ({
              productName: it.productName || it.name || it.title || "Vastraa Designer Saree",
              quantity: it.quantity || 1,
              price: it.price || it.unitPrice || 0,
              sellerName: it.sellerName || it.storeName || it.vendorName,
              sellerStoreName: it.sellerStoreName || it.storeName,
            })),
            totalAmount: enrichedPayload.totalAmount ?? (orderDoc.totalAmount || orderDoc.total || orderDoc.grandTotal),
            paymentMethod: enrichedPayload.paymentMethod || orderDoc.paymentMethod,
            paymentStatus: enrichedPayload.paymentStatus || orderDoc.paymentStatus,
            shippingAddress: enrichedPayload.shippingAddress || (orderDoc.shippingAddress ? (typeof orderDoc.shippingAddress === "string" ? JSON.parse(orderDoc.shippingAddress) : orderDoc.shippingAddress) : undefined),
            trackingNumber: enrichedPayload.trackingNumber || orderDoc.trackingNumber || orderDoc.trackingCode,
            courierName: enrichedPayload.courierName || orderDoc.courierName || orderDoc.carrier,
          };
        }
      } catch (enrichErr: any) {
        logger.debug({ err: enrichErr?.message, orderId }, "[transactionalEmail] Order lookup enrichment notice");
      }
    }

    // 5. Build Email Content
    const extra = enrichedPayload.extraItemCount && enrichedPayload.extraItemCount > 0 ? ` and ${enrichedPayload.extraItemCount} more item(s)` : "";
    const built = enrichedPayload.customHtml && enrichedPayload.subject
      ? { subject: enrichedPayload.subject, html: enrichedPayload.customHtml }
      : buildEmailContent(type, enrichedPayload.itemName || "your order", extra, enrichedPayload.note, enrichedPayload.reference, enrichedPayload);

    const subject = enrichedPayload.subject || built.subject;
    const bodyHtml = built.html;
    const greetingName = enrichedPayload.sellerStoreName || recipient.storeName || recipient.name;
    const fullHtml = wrapInTemplate(subject, bodyHtml, { customerName: greetingName });
    const fullText = enrichedPayload.customText || htmlToPlainText(fullHtml);

    // 6. Insert outbox entry
    const outboxRow = await insertOutboxRow({
      userId,
      orderId: orderId || null,
      vendorId: payload.vendorId || null,
      type,
      toEmail,
      subject,
      html: fullHtml,
      status: "pending",
      sender: getSenderAddress(),
      idempotencyKey: idempotencyKey || null,
    });

    // 7. Deliver
    let delivery: any = { delivered: false, error: null as string | null };
    try {
      delivery = await attemptSend({
        id: outboxRow.id,
        userId,
        orderId: orderId || null,
        vendorId: payload.vendorId || null,
        type,
        toEmail,
        subject,
        html: fullHtml,
        text: fullText,
        attempts: 0,
        attachments: payload.attachments,
        idempotencyKey: idempotencyKey || null,
      });
    } catch (sendErr: any) {
      delivery = { delivered: false, error: sendErr?.message || String(sendErr) };
    }

    if (delivery.delivered && idempotencyKey) {
      const cacheKey = `${userId}:${type}:${orderId || ""}:${idempotencyKey}`;
      recentSendsCache.set(cacheKey, Date.now());
    }

    return {
      queued: true,
      delivered: delivery.delivered,
      status: delivery.delivered ? "sent" : "failed",
      error: delivery.error || undefined,
      outboxId: outboxRow.id,
      simulated: (delivery as any).simulated,
      messageId: (delivery as any).messageId,
    };
  } catch (err: any) {
    logger.error({ err: err?.message, userId: payload.userId, type: payload.type }, "[transactionalEmail] Error queuing email");
    return { queued: false, delivered: false, status: "failed", error: err?.message };
  }
}

/**
 * Welcome email sent to customers upon registration.
 */
export async function sendAccountWelcomeEmail(opts: {
  userId: string;
  name?: string;
  email?: string;
}): Promise<{ delivered: boolean; status: string; queued: boolean }> {
  const toEmail = opts.email || (await getUserEmail(opts.userId));
  if (!toEmail) return { delivered: false, status: "skipped", queued: false };

  const result = await sendTransactionalEmail({
    userId: opts.userId,
    toEmail,
    type: "account_welcome",
    itemName: opts.name || "Customer",
    idempotencyKey: `welcome:${opts.userId}`,
  });
  return {
    delivered: result.delivered,
    status: result.status,
    queued: result.queued,
  };
}

/**
 * Confirmation email sent after a password has been changed or reset.
 */
export async function sendPasswordChangedEmail(opts: {
  userId: string;
  name?: string;
  email?: string;
}): Promise<{ delivered: boolean; status: string; queued: boolean }> {
  const toEmail = opts.email || (await getUserEmail(opts.userId));
  if (!toEmail) return { delivered: false, status: "skipped", queued: false };

  const result = await sendTransactionalEmail({
    userId: opts.userId,
    toEmail,
    type: "password_changed",
    itemName: opts.name || "Customer",
    idempotencyKey: `pwd_changed:${opts.userId}:${Date.now()}`,
  });
  return {
    delivered: result.delivered,
    status: result.status,
    queued: result.queued,
  };
}

/**
 * Security alert email for account updates.
 */
export async function sendAccountSecurityAlertEmail(opts: {
  userId: string;
  email?: string;
  alertType?: string;
  title?: string;
  details?: string;
}): Promise<{ delivered: boolean; status: string; queued: boolean }> {
  const toEmail = opts.email || (await getUserEmail(opts.userId));
  const title = opts.alertType || opts.title || "Account Security Alert";
  const result = await sendTransactionalEmail({
    userId: opts.userId,
    toEmail: toEmail || undefined,
    type: "security_alert",
    subject: `Security Alert: ${title} — ${APP_NAME}`,
    note: opts.details || title,
  });
  return {
    delivered: result.delivered,
    status: result.status,
    queued: result.queued,
  };
}

export interface SendSellerNewOrderEmailOptions {
  vendorId: string;
  orderId: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
    subtotal?: number;
    sku?: string;
    variant?: string;
  }>;
  settlementAmount?: number | string;
  sellerStoreName?: string;
  deliveryCity?: string;
  deliveryState?: string;
  deliveryPincode?: string;
  shippingAddress?: any;
  toEmail?: string;
}

/**
 * Sends a New Order notification email to a seller with their items, delivery region,
 * and estimated net settlement payout.
 */
export async function sendSellerNewOrderEmail(
  opts: SendSellerNewOrderEmailOptions
): Promise<SendTransactionalEmailResult> {
  const { vendorId, orderId, sellerStoreName, toEmail } = opts;
  let items = opts.items;
  let settlementAmount = opts.settlementAmount;
  let deliveryCity = opts.deliveryCity;
  let deliveryState = opts.deliveryState;
  let deliveryPincode = opts.deliveryPincode;

  // Fallback: If items or address details are omitted, fetch from MongoDB / SQL orders
  if (!items || items.length === 0 || !deliveryCity) {
    try {
      let orderDoc: any = null;
      if (mongoOrders && typeof mongoOrders.findById === "function") {
        orderDoc = await mongoOrders.findById(orderId);
      }
      if (!orderDoc && typeof mongoOrders?.findByOrderId === "function") {
        orderDoc = await mongoOrders.findByOrderId(orderId);
      }
      if (!orderDoc) {
        const rows = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
        if (rows.length > 0) orderDoc = rows[0];
      }

      if (orderDoc) {
        if (!items || items.length === 0) {
          const rawItems = (orderDoc.items || []) as any[];
          const sellerItems = rawItems.filter(
            (i: any) => i.vendorId === vendorId || i.sellerId === vendorId
          );
          items = sellerItems.map((i: any) => ({
            name: i.title || i.name || "Handcrafted Saree",
            quantity: Number(i.quantity) || 1,
            price: Number(i.price) || 0,
            subtotal: (Number(i.quantity) || 1) * (Number(i.price) || 0),
            sku: i.sku,
            variant: i.variant,
          }));
        }

        const addr = opts.shippingAddress || orderDoc.shippingAddress || orderDoc.address;
        if (addr) {
          deliveryCity = deliveryCity || addr.city;
          deliveryState = deliveryState || addr.state;
          deliveryPincode = deliveryPincode || addr.pincode || addr.postalCode;
        }
      }
    } catch (err) {
      logger.debug({ err, orderId, vendorId }, "[sendSellerNewOrderEmail] Fallback order lookup notice");
    }
  }

  const region = [deliveryCity, deliveryState, deliveryPincode].filter(Boolean).join(", ");
  const firstItemName = items && items[0] ? items[0].name : "Handcrafted Saree";

  return sendTransactionalEmail({
    userId: vendorId,
    type: "seller_new_order",
    orderId,
    vendorId,
    toEmail,
    sellerStoreName,
    itemName: firstItemName,
    sellerItems: items,
    settlementAmount,
    deliveryCity,
    deliveryState,
    deliveryPincode,
    customerDeliveryRegion: region || undefined,
  });
}

export interface SendSellerOrderCancelledEmailOptions {
  vendorId: string;
  orderId: string;
  reason?: string;
  itemName?: string;
  sellerStoreName?: string;
  toEmail?: string;
}

/**
 * Sends an Order Cancelled notification email to a seller.
 */
export async function sendSellerOrderCancelledEmail(
  opts: SendSellerOrderCancelledEmailOptions
): Promise<SendTransactionalEmailResult> {
  return sendTransactionalEmail({
    userId: opts.vendorId,
    type: "seller_order_cancelled",
    orderId: opts.orderId,
    vendorId: opts.vendorId,
    toEmail: opts.toEmail,
    sellerStoreName: opts.sellerStoreName,
    itemName: opts.itemName || "an ordered item",
    note: opts.reason,
  });
}

export interface SendSellerOrderStatusUpdatedEmailOptions {
  vendorId: string;
  orderId: string;
  previousStatus?: string;
  newStatus: string;
  note?: string;
  sellerStoreName?: string;
  toEmail?: string;
}

/**
 * Sends an Order Status Update notification email to a seller.
 */
export async function sendSellerOrderStatusUpdatedEmail(
  opts: SendSellerOrderStatusUpdatedEmailOptions
): Promise<SendTransactionalEmailResult> {
  return sendTransactionalEmail({
    userId: opts.vendorId,
    type: "seller_order_status_updated",
    orderId: opts.orderId,
    vendorId: opts.vendorId,
    toEmail: opts.toEmail,
    sellerStoreName: opts.sellerStoreName,
    previousStatus: opts.previousStatus,
    newStatus: opts.newStatus,
    note: opts.note,
    updatedTimestamp: new Date().toISOString(),
  });
}

/**
 * Customer Support ticket notifications (ticket created, staff replied, status updated).
 */
export async function sendSupportTicketEmail(opts: {
  type: "support_ticket_created" | "support_ticket_status" | "support_ticket_reply";
  userId?: string | null;
  ticketId?: string;
  ticketSubject?: string;
  status?: string;
  messagePreview?: string;
  ticket?: {
    id: string;
    subject: string;
    userId?: string;
    category?: string;
    customerEmail?: string | null;
    customerName?: string | null;
  };
  replyBody?: string;
  note?: string;
  recipientEmail?: string | null;
}): Promise<{ delivered: boolean; status: string; queued: boolean }> {
  const ticketId = opts.ticketId || opts.ticket?.id || "ticket";
  const subject = opts.ticketSubject || opts.ticket?.subject || "Support Query";
  const targetUserId = opts.userId || opts.ticket?.userId || opts.recipientEmail || opts.ticket?.customerEmail;
  if (!targetUserId) return { delivered: false, status: "skipped", queued: false };

  const result = await sendTransactionalEmail({
    userId: targetUserId,
    type: opts.type,
    ticketId,
    reference: ticketId,
    itemName: subject,
    note: opts.messagePreview || opts.replyBody || opts.note,
    idempotencyKey: opts.type === "support_ticket_reply"
      ? `ticket_reply:${ticketId}:${Date.now()}`
      : `ticket:${opts.type}:${ticketId}`,
  });
  return {
    delivered: result.delivered,
    status: result.status,
    queued: result.queued,
  };
}

/**
 * Shared internal helper for vendor lifecycle emails (approval, suspension, rejection).
 */
async function sendVendorLifecycleEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  subject: string;
  body: string;
}): Promise<void> {
  // Resolve recipient address
  let toEmail: string | null = opts.contactEmail ?? null;
  if (!toEmail && opts.ownerId) {
    toEmail = await getUserEmail(opts.ownerId);
  }

  if (!toEmail) {
    logger.warn(
      { vendorId: opts.vendorId, vendorName: opts.vendorName },
      "[transactionalEmail] Could not resolve email for vendor — email not sent, manual follow-up required"
    );
    return;
  }

  const html = wrapInTemplate(opts.subject, opts.body);
  const text = htmlToPlainText(html);

  const outboxRow = await insertOutboxRow({
    userId: opts.ownerId ?? opts.vendorId,
    orderId: null,
    vendorId: opts.vendorId,
    type: "vendor_lifecycle",
    toEmail,
    subject: opts.subject,
    html,
    status: "pending",
  });

  const resend = getResendClient();
  if (resend) {
    await attemptSend(resend, {
      id: outboxRow.id,
      orderId: null,
      vendorId: opts.vendorId,
      userId: opts.ownerId ?? opts.vendorId,
      toEmail,
      subject: opts.subject,
      html,
      text,
      attempts: 0,
    });
  } else {
    await attemptSend({
      id: outboxRow.id,
      orderId: null,
      vendorId: opts.vendorId,
      userId: opts.ownerId ?? opts.vendorId,
      toEmail,
      subject: opts.subject,
      html,
      text,
      attempts: 0,
    });
  }
}

export async function sendVendorApprovalEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  dashboardUrl?: string;
}): Promise<void> {
  const dashboardUrl = opts.dashboardUrl ?? "https://vastraasaree.com/seller/dashboard";
  const subject = `Your VASTRAA store is live — Welcome aboard!`;
  const body = `
    <p>Congratulations! Your store <strong>${opts.vendorName}</strong> has been <strong>approved</strong> by the VASTRAA team.</p>
    <p>Your store is now live and you can start listing your sarees right away.</p>
    <p style="margin:24px 0;">
      <a href="${dashboardUrl}"
         style="background:#0A1F44;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Go to Seller Dashboard
      </a>
    </p>
    <p>If you have any questions, our support team is here to help.</p>
    <p>Welcome to the VASTRAA family!</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorSuspensionEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  reason?: string;
}): Promise<void> {
  const subject = `Your VASTRAA store has been suspended`;
  const body = `
    <p>We regret to inform you that your store <strong>${opts.vendorName}</strong> has been <strong>suspended</strong> by the VASTRAA team.</p>
    <p>Your store listings are no longer visible to shoppers while the suspension is in effect.</p>
    ${opts.reason ? `<p><strong>Reason:</strong> ${opts.reason}</p>` : ""}
    <p>If you believe this is an error or would like to appeal, please contact our support team with your store details and we will review your case.</p>
    <p>We appreciate your understanding and hope to resolve this as quickly as possible.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorRejectionEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  reason?: string;
}): Promise<void> {
  const subject = `Update on your VASTRAA seller application`;
  const body = `
    <p>Thank you for your interest in selling on VASTRAA.</p>
    <p>After reviewing your application for <strong>${opts.vendorName}</strong>, we are unable to approve your store at this time.</p>
    ${opts.reason ? `<p><strong>Reason:</strong> ${opts.reason}</p>` : ""}
    <p>If you have questions about this decision or would like guidance on reapplying, please reach out to our support team — we are happy to help.</p>
    <p>Thank you for your understanding.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorReactivationEmailForVendor(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  dashboardUrl?: string;
}): Promise<void> {
  const dashboardUrl = opts.dashboardUrl ?? "https://vastraasaree.com/seller/dashboard";
  const subject = `Your VASTRAA seller account has been reactivated`;
  const body = `
    <p>Good news! Your store <strong>${opts.vendorName}</strong> has been <strong>reactivated</strong>.</p>
    <p>Your store listings are once again active and visible to shoppers on VASTRAA.</p>
    <p style="margin:24px 0;">
      <a href="${dashboardUrl}"
         style="background:#0A1F44;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Go to Seller Dashboard
      </a>
    </p>
    <p>If you have any questions, our support team is always available at support@vastraasaree.com.</p>
    <p>Welcome back to VASTRAA!</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorPayoutRequestApprovedEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  amount: number;
}): Promise<void> {
  const amountFormatted = `₹${opts.amount.toLocaleString("en-IN")}`;
  const subject = `Your payout request of ${amountFormatted} has been approved — ${APP_NAME}`;
  const body = `
    <p>Great news! Your payout request of <strong>${amountFormatted}</strong> from <strong>${opts.vendorName}</strong> has been <strong>approved</strong>.</p>
    <p>Our team will now process the transfer. You will receive another email with the payment reference once the funds have been sent.</p>
    <p>If you have any questions in the meantime, please reach out to our support team.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorPayoutApprovedEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  amount: number;
  utrNumber?: string | null;
}): Promise<void> {
  const amountFormatted = `₹${opts.amount.toLocaleString("en-IN")}`;
  const subject = `Your payout of ${amountFormatted} has been processed — ${APP_NAME}`;
  const body = `
    <p>Great news! Your payout of <strong>${amountFormatted}</strong> from <strong>${opts.vendorName}</strong> has been <strong>successfully transferred</strong>.</p>
    ${opts.utrNumber ? `<p>UTR / Transaction Reference: <code>${opts.utrNumber}</code></p>` : ""}
    <p>The funds should reflect in your registered bank account within 1–3 business days, depending on your bank.</p>
    <p>If you have any questions, please reach out to our support team with the reference above.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendVendorPayoutRejectedEmail(opts: {
  vendorId: string;
  vendorName: string;
  contactEmail: string | null;
  ownerId: string | null;
  amount: number;
  note?: string | null;
}): Promise<void> {
  const amountFormatted = `₹${opts.amount.toLocaleString("en-IN")}`;
  const subject = `Update on your payout request — ${APP_NAME}`;
  const body = `
    <p>We're writing to let you know that your payout request for <strong>${amountFormatted}</strong> from <strong>${opts.vendorName}</strong> has been <strong>declined</strong> at this time.</p>
    ${opts.note ? `<p>Reason: ${opts.note}</p>` : ""}
    <p>If you believe this is an error or need clarification, please contact our support team and we will be happy to assist.</p>
    <p>You can raise a new payout request from your seller dashboard once any issues have been resolved.</p>
  `;
  await sendVendorLifecycleEmail({ ...opts, subject, body });
}

export async function sendSellerRegistrationNudgeEmail(opts: {
  userId: string;
  registrationUrl?: string;
}): Promise<boolean> {
  const toEmail = await getUserEmail(opts.userId);
  if (!toEmail) {
    logger.warn({ userId: opts.userId }, "[transactionalEmail] Could not resolve email for seller registration nudge — not queued");
    return false;
  }

  const registrationUrl = opts.registrationUrl ?? "https://vastraasaree.com/seller/register";
  const subject = `Complete your VASTRAA seller registration`;
  const body = `
    <p>Hi there,</p>
    <p>You started your seller registration on VASTRAA but haven't finished yet. Your progress has been saved — pick up right where you left off!</p>
    <p style="margin:24px 0;">
      <a href="${registrationUrl}"
         style="background:#0A1F44;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        Continue Registration
      </a>
    </p>
    <p>Once approved, you'll be able to list your sarees and reach thousands of shoppers across India.</p>
    <p>If you have any questions or need help, feel free to reach out to our support team — we're happy to assist.</p>
    <p>We hope to see you on VASTRAA soon!</p>
  `;

  const html = wrapInTemplate(subject, body);
  const text = htmlToPlainText(html);

  const outboxRow = await insertOutboxRow({
    userId: opts.userId,
    orderId: null,
    type: "seller_registration_nudge",
    toEmail,
    subject,
    html,
    status: "pending",
  });

  const resend = getResendClient();
  if (resend) {
    await attemptSend(resend, {
      id: outboxRow.id,
      orderId: null,
      userId: opts.userId,
      toEmail,
      subject,
      html,
      text,
      attempts: 0,
    });
  } else {
    await attemptSend({
      id: outboxRow.id,
      orderId: null,
      userId: opts.userId,
      toEmail,
      subject,
      html,
      text,
      attempts: 0,
    });
  }

  return true;
}

export function startSellerRegistrationNudgeWorker(intervalMs = 60 * 60 * 1000): void {
  const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

  const run = async () => {
    const cutoff = new Date(Date.now() - IDLE_THRESHOLD_MS);

    const eligibleDrafts = await db
      .select({ id: sellerRegistrationDraftsTable.id, userId: sellerRegistrationDraftsTable.userId })
      .from(sellerRegistrationDraftsTable)
      .where(
        and(
          lt(sellerRegistrationDraftsTable.updatedAt, cutoff),
          isNull(sellerRegistrationDraftsTable.nudgeSentAt)
        )
      );

    if (eligibleDrafts.length === 0) return;

    logger.info({ count: eligibleDrafts.length }, "[sellerNudge] Found stale drafts — processing nudge emails");

    for (const draft of eligibleDrafts) {
      try {
        const toEmail = await getUserEmail(draft.userId);
        if (!toEmail) continue;

        const registrationUrl = "https://vastraasaree.com/seller/register";
        const subject = `Complete your VASTRAA seller registration`;
        const body = `
          <p>Hi there,</p>
          <p>You started your seller registration on VASTRAA but haven't finished yet. Your progress has been saved — pick up right where you left off!</p>
          <p style="margin:24px 0;">
            <a href="${registrationUrl}"
               style="background:#0A1F44;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
              Continue Registration
            </a>
          </p>
          <p>Once approved, you'll be able to list your sarees and reach thousands of shoppers across India.</p>
          <p>If you have any questions or need help, feel free to reach out to our support team — we're happy to assist.</p>
          <p>We hope to see you on VASTRAA soon!</p>
        `;
        const html = wrapInTemplate(subject, body);
        const text = htmlToPlainText(html);
        const claimedAt = new Date();

        let outboxEntry: any;
        await db.transaction(async (tx) => {
          const claimed = await tx
            .update(sellerRegistrationDraftsTable)
            .set({ nudgeSentAt: claimedAt })
            .where(
              and(
                eq(sellerRegistrationDraftsTable.id, draft.id),
                isNull(sellerRegistrationDraftsTable.nudgeSentAt)
              )
            )
            .returning({ id: sellerRegistrationDraftsTable.id });

          if (claimed.length === 0) return;

          const [entry] = await tx
            .insert(emailOutboxTable)
            .values({
              userId: draft.userId,
              orderId: null,
              type: "seller_registration_nudge",
              toEmail,
              subject,
              html,
              status: "pending",
              attempts: 0,
              nextRetryAt: new Date(),
            } as any)
            .returning();

          outboxEntry = entry;
        });

        if (!outboxEntry) continue;

        const resend = getResendClient();
        if (resend) {
          await attemptSend(resend, { ...outboxEntry, orderId: null, userId: draft.userId, text });
        } else {
          await attemptSend({ ...outboxEntry, orderId: null, userId: draft.userId, text });
        }
      } catch (err) {
        logger.error({ err, userId: draft.userId }, "[sellerNudge] Error processing draft");
      }
    }
  };

  run().catch((err) => logger.error({ err }, "[sellerNudge] Error in initial nudge worker run"));
  setInterval(() => {
    run().catch((err) => logger.error({ err }, "[sellerNudge] Error in nudge worker tick"));
  }, intervalMs).unref();
}

/**
 * Sends a coupon availability announcement email.
 */
export async function sendCouponAvailableEmail(opts: {
  userId: string;
  couponCode: string;
  discountText: string;
  expiresAt?: string | Date;
  validUntil?: string | Date;
}): Promise<{ delivered: boolean; status: string; queued: boolean }> {
  const result = await sendTransactionalEmail({
    userId: opts.userId,
    type: "coupon_available",
    reference: opts.couponCode,
    note: opts.discountText,
  });
  return {
    delivered: result.delivered,
    status: result.status,
    queued: result.queued,
  };
}

/**
 * Sends a coupon-expiry reminder email.
 */
export async function sendCouponExpiryEmail(opts: {
  userId: string;
  couponCode: string;
  daysLeft: number;
}): Promise<void> {
  await sendTransactionalEmail({
    userId: opts.userId,
    type: "coupon_expiry",
    reference: opts.couponCode,
    subject: `Your coupon "${opts.couponCode}" expires in ${opts.daysLeft} day${opts.daysLeft !== 1 ? "s" : ""} — ${APP_NAME}`,
    customHtml: `
      <p>Hi there,</p>
      <p>Just a reminder that your coupon code <strong>${opts.couponCode}</strong> will expire in <strong>${opts.daysLeft} day${opts.daysLeft !== 1 ? "s" : ""}</strong>.</p>
      <p>Use it before it's gone to enjoy your discount on your next authentic handloom saree!</p>
      <div style="margin:24px 0;text-align:center;">
        <a href="https://vastraasaree.com/catalog" style="background-color:#0A1F44;color:#FFFFFF;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;display:inline-block;">
          Shop Now
        </a>
      </div>
    `,
  });
}

/**
 * @deprecated Stock alert emails have been removed per product requirements.
 */
export async function sendWishlistRestockEmail(_opts: {
  userId: string;
  productName: string;
  productId: string;
}): Promise<void> {
  return;
}

/**
 * Sends a promotional / marketing email to a user if emailMarketingUpdates preference is true.
 */
export async function sendPromotionalCampaignEmail(opts: {
  userId: string;
  subject: string;
  htmlContent: string;
}): Promise<boolean> {
  const result = await sendTransactionalEmail({
    userId: opts.userId,
    type: "promotional_campaign",
    subject: opts.subject,
    customHtml: opts.htmlContent,
  });
  return result.queued;
}

/**
 * Sends a 6-digit OTP email for Google Social Login verification.
 */
export async function sendGoogleAuthOtpEmail(opts: {
  toEmail: string;
  otp: string;
  name?: string;
  targetRole?: "customer" | "seller";
}): Promise<{ delivered: boolean; error?: string }> {
  const roleTitle = opts.targetRole === "seller" ? "Seller Account" : "Account";
  const greeting = opts.name ? `Hi ${opts.name},` : "Hi there,";
  const subject = `Your ${APP_NAME} Google Verification Code: ${opts.otp}`;
  const body = `
    <p>${greeting}</p>
    <p>Thank you for authenticating with Google on ${APP_NAME}.</p>
    <p>Please enter the following 6-digit verification code to complete your ${roleTitle} sign-in / sign-up:</p>
    <div style="margin:24px 0;text-align:center;">
      <span style="font-family:monospace;font-size:32px;font-weight:700;letter-spacing:6px;color:#0A1F44;background:#F4F5F7;padding:12px 24px;border-radius:8px;border:1px solid #C7CCD1;display:inline-block;">
        ${opts.otp}
      </span>
    </div>
    <p style="color:#666;font-size:13px;">This OTP will expire in 10 minutes. If you did not request this code, please ignore this email.</p>
  `;
  const html = wrapInTemplate(subject, body);
  const text = htmlToPlainText(html);

  logger.info({ toEmail: opts.toEmail, targetRole: opts.targetRole }, "[GoogleAuth] Sending Google OTP email");

  // Try SMTP first
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const sendOpts: any = {
        from: getSenderAddress(),
        to: opts.toEmail,
        subject,
        html,
        text,
      };
      if (html.includes("cid:vastraa-logo")) {
        const logoAtt = getVastraaLogoAttachment();
        if (logoAtt) sendOpts.attachments = [logoAtt];
      }
      await smtp.sendMail(sendOpts);
      return { delivered: true };
    } catch (err: any) {
      logger.warn({ err: err?.message, toEmail: opts.toEmail }, "[GoogleAuth] SMTP failed, attempting Resend fallback");
    }
  }

  // Try Resend fallback
  const resend = getResendClient();
  if (resend) {
    try {
      const res = await resend.emails.send({
        from: getSenderAddress(),
        to: [opts.toEmail],
        subject,
        html,
        text,
      });
      if (!res.error) return { delivered: true };
    } catch {}
  }

  return { delivered: false, error: "Unable to deliver verification email. Please try again." };
}

/**
 * Sends a password reset email with single-use link.
 * Integrates directly with sendTransactionalEmail, MongoDB email_outbox, and background retry worker.
 */
export async function sendPasswordResetEmail(opts: {
  toEmail: string;
  name: string;
  resetUrl: string;
  targetRole: "customer" | "seller";
}): Promise<{ delivered: boolean; error?: string; messageId?: string }> {
  const cleanEmail = (opts.toEmail || "").trim().toLowerCase();
  const isSeller = opts.targetRole === "seller";

  const result = await sendTransactionalEmail({
    userId: cleanEmail,
    toEmail: cleanEmail,
    type: "password_reset",
    itemName: opts.name,
    reference: opts.resetUrl,
    vendorId: isSeller ? "seller" : undefined,
    sellerStoreName: isSeller ? "Seller Portal" : undefined,
  });

  if (result.delivered) {
    return {
      delivered: true,
      messageId: result.messageId || "sent",
    };
  }

  return {
    delivered: false,
    error: result.error || "Unable to deliver password reset email. Please try again later.",
  };
}

/**
 * Sends a branded HTML email verification link to a customer upon registration or resend.
 */
export async function sendEmailVerificationEmail(opts: {
  toEmail: string;
  name?: string;
  verificationUrl: string;
}): Promise<{ delivered: boolean; error?: string; messageId?: string }> {
  const cleanEmail = (opts.toEmail || "").trim().toLowerCase();

  const result = await sendTransactionalEmail({
    userId: cleanEmail,
    toEmail: cleanEmail,
    type: "customer_email_verification",
    itemName: opts.name?.trim() || "Valued Customer",
    reference: opts.verificationUrl,
  });

  if (result.delivered) {
    return {
      delivered: true,
      messageId: result.messageId || "sent",
    };
  }

  return {
    delivered: false,
    error: result.error || "Unable to deliver verification email. Please try again later.",
  };
}

/**
 * Background outbox retry worker.
 * Periodically processes pending and failed emails with exponential backoff.
 * Actively processes MongoDB Atlas email_outbox collection and legacy relational tables.
 */
export function startEmailOutboxWorker(intervalMs = 30_000): NodeJS.Timeout {
  logger.info("[emailOutbox] Starting outbox retry worker");

  const SENT_RETENTION_DAYS = 30;
  const DEAD_RETENTION_DAYS = 90;

  const tick = async () => {
    const now = new Date();

    // 1. Primary: Retry pending and failed emails from MongoDB Atlas email_outbox
    try {
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection("email_outbox");
        const pendingDocs = await col
          .find({
            status: { $in: ["pending", "failed"] },
            nextRetryAt: { $lte: now },
            attempts: { $lt: MAX_ATTEMPTS },
          })
          .limit(25)
          .toArray();

        for (const doc of pendingDocs) {
          const entry: any = {
            id: doc.id || String(doc._id),
            toEmail: doc.toEmail,
            subject: doc.subject,
            html: doc.html,
            attempts: doc.attempts || 0,
            orderId: doc.orderId,
            userId: doc.userId,
            vendorId: doc.vendorId,
          };
          await attemptSend(entry);
        }
      }
    } catch (mErr) {
      logger.error({ err: mErr }, "[emailOutbox] Error processing pending MongoDB outbox entries");
    }

    // 2. Fallback: Retry pending/failed emails from relational table
    try {
      const pending = await db
        .select()
        .from(emailOutboxTable)
        .where(
          and(
            inArray(emailOutboxTable.status, ["pending", "failed"] as const),
            lte(emailOutboxTable.nextRetryAt, now),
            lt(emailOutboxTable.attempts, MAX_ATTEMPTS)
          )
        )
        .limit(20);

      for (const entry of pending) {
        await attemptSend(entry);
      }
    } catch (err) {
      logger.debug({ err }, "[emailOutbox] Relational outbox poll skipped/handled");
    }

    // 3. Purge old "sent" and "dead" rows from MongoDB Atlas
    try {
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection("email_outbox");
        const sentCutoff = new Date(now.getTime() - SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        await col.deleteMany({ status: "sent", createdAt: { $lt: sentCutoff } });

        const deadCutoff = new Date(now.getTime() - DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
        await col.deleteMany({ status: "dead", createdAt: { $lt: deadCutoff } });
      }
    } catch {}

    // 4. Purge old rows from relational table
    try {
      const sentCutoff = new Date(now.getTime() - SENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await db
        .delete(emailOutboxTable)
        .where(and(eq(emailOutboxTable.status, "sent"), lt(emailOutboxTable.createdAt, sentCutoff)));
    } catch {}

    try {
      const deadCutoff = new Date(now.getTime() - DEAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
      await db
        .delete(emailOutboxTable)
        .where(and(eq(emailOutboxTable.status, "dead"), lt(emailOutboxTable.createdAt, deadCutoff)));
    } catch {}
  };

  const handle = setInterval(() => {
    tick().catch((err) => {
      logger.error({ err }, "[emailOutbox] Error in outbox worker tick");
    });
  }, intervalMs);

  // Trigger initial tick 3 seconds after startup
  setTimeout(() => {
    tick().catch(() => {});
  }, 3000);

  return handle;
}

/**
 * Sends a live test email to verify SMTP / Resend transport configuration.
 */
export async function sendTestEmail(toEmail: string, customSubject?: string): Promise<{
  success: boolean;
  transport: "smtp" | "resend" | "simulated";
  messageId?: string;
  error?: string;
}> {
  await refreshEmailSettingsCache().catch(() => {});
  const cleanEmail = (toEmail || "").trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { success: false, transport: "smtp", error: "Invalid recipient email address" };
  }

  const subject = customSubject || `VASTRAA – Test Email Verification`;
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; background: #ffffff;">
      <h2 style="color: #0A1F44; margin-bottom: 12px;">Email Delivery Test Successful</h2>
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">
        This test message confirms that your <strong>VASTRAA</strong> email transport configuration is active and functioning properly.
      </p>
      <div style="background: #F4F5F7; border-left: 4px solid #0A1F44; padding: 14px 18px; border-radius: 6px; margin: 20px 0; font-size: 13px; color: #4B5563;">
        <p style="margin: 0 0 6px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <p style="margin: 0;"><strong>Recipient:</strong> ${cleanEmail}</p>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #666666;">
        All customer notifications, order status updates, and account verification codes will use this transport.
      </p>
    </div>
  `;

  const html = wrapInTemplate(subject, body);
  const text = `VASTRAA – Email Delivery Test Successful\n\nThis test message confirms that your VASTRAA email transport is active.\nTimestamp: ${new Date().toISOString()}`;
  const from = getSenderAddress();

  // 1. Try SMTP
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const sendOpts: any = {
        from,
        to: cleanEmail,
        subject,
        html,
        text,
      };
      if (html.includes("cid:vastraa-logo")) {
        const logoAtt = getVastraaLogoAttachment();
        if (logoAtt) sendOpts.attachments = [logoAtt];
      }
      const info = await smtp.sendMail(sendOpts);
      logger.info({ to: cleanEmail, messageId: info.messageId }, "[sendTestEmail] Test email delivered via SMTP");
      return { success: true, transport: "smtp", messageId: info.messageId };
    } catch (smtpErr: any) {
      const msg = smtpErr?.message || String(smtpErr);
      logger.error({ to: cleanEmail, error: msg }, "[sendTestEmail] SMTP test send failed");
      return { success: false, transport: "smtp", error: msg };
    }
  }

  // 2. Try Resend
  const resend = getResendClient();
  if (resend) {
    try {
      const res = await resend.emails.send({
        from,
        to: [cleanEmail],
        subject,
        html,
        text,
      });
      if (res.error) {
        throw new Error(typeof res.error === "string" ? res.error : (res.error?.message || JSON.stringify(res.error)));
      }
      logger.info({ to: cleanEmail, id: res.data?.id }, "[sendTestEmail] Test email delivered via Resend");
      return { success: true, transport: "resend", messageId: res.data?.id };
    } catch (resendErr: any) {
      const msg = resendErr?.message || String(resendErr);
      logger.error({ to: cleanEmail, error: msg }, "[sendTestEmail] Resend test send failed");
      return { success: false, transport: "resend", error: msg };
    }
  }

  return {
    success: false,
    transport: "smtp",
    error: "No active email transport available. Please configure SMTP host/credentials or a Resend API key in Admin Settings.",
  };
}

/**
 * Sends a 6-digit email verification code to a seller during shop registration via SMTP or Resend.
 */
export async function sendSellerVerificationEmail(opts: {
  email: string;
  code: string;
}): Promise<{ delivered: boolean; error?: string }> {
  const cleanEmail = (opts.email || "").trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { delivered: false, error: "Please enter a valid email address." };
  }

  const subject = `VASTRAA – Your Seller Registration Verification Code`;
  const body = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333333; background: #ffffff;">
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Hello Seller,</p>
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Thank you for registering with VASTRAA.</p>
      <p style="font-size: 15px; line-height: 1.6; margin-bottom: 16px;">Your email verification code is:</p>
      <div style="background: #F4F5F7; border: 1px solid #C7CCD1; padding: 20px; text-align: center; border-radius: 12px; margin: 24px 0;">
        <span style="font-size: 34px; font-weight: bold; letter-spacing: 8px; color: #0A1F44;">${opts.code}</span>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #555555; margin-bottom: 12px;">Please enter this 6-digit code on the Seller Registration page to verify your email address.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #555555; margin-bottom: 20px;">This code will expire in 5 minutes.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #777777; margin-bottom: 24px;">If you did not request this verification code, please ignore this email.</p>
      <p style="font-size: 14px; line-height: 1.6; color: #333333;">Thank you,<br/><strong>VASTRAA Seller Registration Team</strong></p>
    </div>
  `;

  const html = wrapInTemplate(subject, body);
  const text = `Hello Seller,\n\nThank you for registering with VASTRAA.\n\nYour email verification code is: ${opts.code}\n\nThis code will expire in 5 minutes.\n\nThank you,\nVASTRAA Seller Registration Team`;

  let outboxId: string | null = null;
  try {
    const [entry] = await db
      .insert(emailOutboxTable)
      .values({
        userId: "system_seller_verification",
        type: "seller_verification",
        toEmail: cleanEmail,
        subject,
        html,
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(),
      } as any)
      .returning();
    outboxId = entry?.id || null;
  } catch (dbErr) {
    logger.warn({ email: cleanEmail }, "[transactionalEmail] Failed to record seller verification email in outbox table");
  }

  // 1. Primary delivery attempt via SMTP (Nodemailer)
  const smtpTransporter = getSmtpTransporter();
  if (smtpTransporter) {
    try {
      const from = getSenderAddress();
      const sendOpts: any = {
        from,
        to: cleanEmail,
        subject,
        html,
        text,
      };
      if (html.includes("cid:vastraa-logo")) {
        const logoAtt = getVastraaLogoAttachment();
        if (logoAtt) sendOpts.attachments = [logoAtt];
      }
      const info = await smtpTransporter.sendMail(sendOpts);

      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "sent", attempts: 1, lastAttemptAt: new Date(), errorMessage: null })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }

      logger.info(
        { email: cleanEmail, messageId: info.messageId },
        "[transactionalEmail] Verification code email successfully delivered via SMTP"
      );
      return { delivered: true };
    } catch (smtpErr: any) {
      const errMsg = smtpErr?.message || String(smtpErr);
      const errCode = smtpErr?.code || "SMTP_ERROR";
      logger.error(
        { email: cleanEmail, errorCode: errCode, errorMessage: errMsg },
        "[transactionalEmail] SMTP verification code delivery failed"
      );
      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "failed", errorMessage: `SMTP error: ${errCode}`, lastAttemptAt: new Date() })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }
    }
  }

  // 2. Secondary delivery attempt via Resend API
  const resend = getResendClient();
  if (resend) {
    try {
      const configuredFrom = getSenderAddress();
      let res = await resend.emails.send({
        from: configuredFrom,
        to: [cleanEmail],
        subject,
        html,
      });

      if (res.error) {
        const fallbackFrom = configuredFrom.includes("@vastraasaree.com") || configuredFrom.includes("@vastraa.com")
          ? `${APP_NAME} <onboarding@resend.dev>`
          : `${APP_NAME} <orders@vastraasaree.com>`;
        res = await resend.emails.send({
          from: fallbackFrom,
          to: [cleanEmail],
          subject,
          html,
        });
      }

      if (!res.error && res.data?.id) {
        if (outboxId) {
          db.update(emailOutboxTable)
            .set({ status: "sent", attempts: 1, lastAttemptAt: new Date(), errorMessage: null })
            .where(eq(emailOutboxTable.id, outboxId))
            .catch(() => {});
        }

        logger.info({ email: cleanEmail, id: res.data.id }, "[transactionalEmail] Verification code email successfully delivered via Resend");
        return { delivered: true };
      }

      const errMsg = typeof res.error === "string" ? res.error : (res.error?.message || JSON.stringify(res.error));
      logger.error({ email: cleanEmail, error: errMsg }, "[transactionalEmail] Resend API rejected verification code email");
      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "failed", errorMessage: errMsg, lastAttemptAt: new Date() })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err);
      logger.error({ email: cleanEmail, error: errMsg }, "[transactionalEmail] Exception sending seller verification email via Resend");
      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "failed", errorMessage: errMsg, lastAttemptAt: new Date() })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }
    }
  }

  return {
    delivered: false,
    error: "Unable to send the verification code. Please try again.",
  };
}

/**
 * Sends a 6-digit email verification code to a customer during registration via SMTP (or fallback).
 */
export async function sendRegistrationOtpEmail(opts: {
  email: string;
  code: string;
  name?: string;
}): Promise<{ delivered: boolean; error?: string }> {
  const cleanEmail = (opts.email || "").trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { delivered: false, error: "Please enter a valid email address." };
  }

  const result = await sendTransactionalEmail({
    userId: cleanEmail,
    toEmail: cleanEmail,
    type: "registration_otp",
    reference: opts.code,
    itemName: opts.name || "Customer",
  });

  if (result.delivered) {
    return { delivered: true };
  }

  return {
    delivered: false,
    error: result.error || "Unable to send the verification code. Please try again.",
  };
}

/**
 * Sends a 6-digit verification code to the Super Admin for 2FA setup and verification.
 * Uses production Zoho SMTP as the primary delivery channel with branded VASTRAA email template,
 * and falls back to Resend API if configured.
 */
export async function sendAdmin2faOtpEmail(opts: {
  toEmail: string;
  otp: string;
  name?: string;
}): Promise<{ delivered: boolean; error?: string }> {
  await refreshEmailSettingsCache().catch(() => {});
  const cleanEmail = (opts.toEmail || "").trim().toLowerCase();
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    return { delivered: false, error: "Please enter a valid admin email address." };
  }

  const subject = `Your VASTRAA 2FA Verification Code: ${opts.otp}`;
  const body = `
    <div style="padding: 10px 0;">
      <h2 style="color: #3B1254; font-size: 20px; font-weight: 700; margin-bottom: 16px;">Two-Factor Authentication Setup</h2>
      <p style="font-size: 15px; line-height: 1.6; color: #1E293B; margin-bottom: 20px;">
        A request has been initiated to verify Two-Factor Authentication (2FA) for your VASTRAA Admin account.
      </p>
      <div style="background-color: #F8F5FC; border: 2px dashed #D4AF37; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
        <p style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1.5px; color: #6B7280; margin: 0 0 8px;">Your 6-Digit Verification Code</p>
        <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #3B1254; font-family: monospace;">${opts.otp}</span>
      </div>
      <p style="font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 12px;">
        Enter this code in your Admin Settings to complete two-factor authentication setup.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #B91C1C; font-weight: 600; margin-bottom: 20px;">
        ⏱ This verification code is valid for 5 minutes and can only be used once.
      </p>
      <p style="font-size: 13px; line-height: 1.6; color: #94A3B8; margin-bottom: 24px;">
        If you did not initiate this 2FA setup request, please change your Admin Access Key immediately and ensure your credentials are secure.
      </p>
      <p style="font-size: 14px; line-height: 1.6; color: #333333;">
        Warm regards,<br/>
        <strong>VASTRAA Security Team</strong>
      </p>
    </div>
  `;

  const html = wrapInTemplate(subject, body, { customerName: opts.name || "Administrator" });
  const text = `Namaste ${opts.name || "Administrator"},\n\nA request has been initiated to verify Two-Factor Authentication (2FA) for your VASTRAA Admin account.\n\nYour 6-digit verification code is: ${opts.otp}\n\nThis code expires in 5 minutes and can only be used once.\n\nIf you did not request this, please change your Admin Access Key immediately.\n\nVASTRAA Security Team`;

  let outboxId: string | null = null;
  try {
    const [entry] = await db
      .insert(emailOutboxTable)
      .values({
        userId: "admin_2fa_setup",
        type: "security_alert",
        toEmail: cleanEmail,
        subject,
        html,
        status: "pending",
        attempts: 0,
        nextRetryAt: new Date(),
      } as any)
      .returning();
    outboxId = entry?.id || null;
  } catch {}

  // 1. Primary delivery attempt via SMTP (Production Zoho SMTP)
  const smtp = getSmtpTransporter();
  if (smtp) {
    try {
      const from = getSenderAddress();
      const sendOpts: any = {
        from,
        to: cleanEmail,
        subject,
        html,
        text,
      };
      if (html.includes("cid:vastraa-logo")) {
        const logoAtt = getVastraaLogoAttachment();
        if (logoAtt) sendOpts.attachments = [logoAtt];
      }
      const info = await smtp.sendMail(sendOpts);

      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "sent", attempts: 1, lastAttemptAt: new Date(), errorMessage: null })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }

      logger.info(
        { email: cleanEmail, messageId: info.messageId },
        "[transactionalEmail] Admin 2FA verification email successfully delivered via SMTP"
      );
      return { delivered: true };
    } catch (smtpErr: any) {
      const errMsg = smtpErr?.message || String(smtpErr);
      const errCode = smtpErr?.code || "SMTP_ERROR";
      logger.error(
        { email: cleanEmail, errorCode: errCode, errorMessage: errMsg },
        "[transactionalEmail] SMTP Admin 2FA verification email delivery failed"
      );
      if (outboxId) {
        db.update(emailOutboxTable)
          .set({ status: "failed", errorMessage: `SMTP error: ${errCode}`, lastAttemptAt: new Date() })
          .where(eq(emailOutboxTable.id, outboxId))
          .catch(() => {});
      }
    }
  }

  // 2. Secondary delivery attempt via Resend API
  const resend = getResendClient();
  if (resend) {
    try {
      const configuredFrom = getSenderAddress();
      let res = await resend.emails.send({
        from: configuredFrom,
        to: [cleanEmail],
        subject,
        html,
      });

      if (res.error) {
        const fallbackFrom = configuredFrom.includes("@vastraasaree.com") || configuredFrom.includes("@vastraa.com")
          ? `${APP_NAME} <onboarding@resend.dev>`
          : `${APP_NAME} <security@vastraasaree.com>`;
        res = await resend.emails.send({
          from: fallbackFrom,
          to: [cleanEmail],
          subject,
          html,
        });
      }

      if (!res.error && res.data?.id) {
        if (outboxId) {
          db.update(emailOutboxTable)
            .set({ status: "sent", attempts: 1, lastAttemptAt: new Date(), errorMessage: null })
            .where(eq(emailOutboxTable.id, outboxId))
            .catch(() => {});
        }

        logger.info({ email: cleanEmail, id: res.data.id }, "[transactionalEmail] Admin 2FA verification email successfully delivered via Resend");
        return { delivered: true };
      }

      const errMsg = typeof res.error === "string" ? res.error : (res.error?.message || JSON.stringify(res.error));
      logger.error({ email: cleanEmail, error: errMsg }, "[transactionalEmail] Resend rejected admin 2FA email");
    } catch (resErr: any) {
      logger.error({ email: cleanEmail, error: resErr?.message || resErr }, "[transactionalEmail] Resend exception for admin 2FA email");
    }
  }

  return {
    delivered: false,
    error: "Failed to deliver verification code. Please verify your SMTP / email configuration.",
  };
}

