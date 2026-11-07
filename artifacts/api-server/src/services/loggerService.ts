import { mongoLogs, AuditLogDocument, ApplicationLogDocument } from "@workspace/db";
import { Request } from "express";

// Sensitive fields blacklisted from logs
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordhash",
  "token",
  "refreshtoken",
  "accesstoken",
  "secret",
  "jwt_secret",
  "authorization",
  "cookie",
  "cvv",
  "cardnumber",
  "pannumber",
  "bankaccountnumber",
  "accountnumber",
  "ifsc",
  "otp",
  "privatekey",
  "secretaccesskey",
  "apikey",
]);

/**
 * Recursively sanitizes any payload to redact sensitive credentials, tokens, or PII.
 */
export function sanitizeLogPayload(obj: any, depth = 0): any {
  if (depth > 6 || obj === null || obj === undefined) return obj;
  if (typeof obj !== "object") return obj;

  if (Array.isArray(obj)) {
    return obj.slice(0, 50).map((item) => sanitizeLogPayload(item, depth + 1));
  }

  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SENSITIVE_KEYS.has(lowerKey)) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof val === "object" && val !== null) {
      sanitized[key] = sanitizeLogPayload(val, depth + 1);
    } else if (typeof val === "string" && val.length > 500) {
      sanitized[key] = val.substring(0, 500) + "... [truncated]";
    } else {
      sanitized[key] = val;
    }
  }
  return sanitized;
}

export class LoggerService {
  private static serviceName = "vastraa-backend";
  private static environment = process.env.NODE_ENV || "development";

  /**
   * Records a business audit action (permanent, compliance-ready).
   */
  static async logAudit(params: {
    req?: Request;
    actor: {
      id: string;
      role: "admin" | "seller" | "customer" | "system";
      email?: string;
      ip?: string;
      userAgent?: string;
    };
    action: string;
    resource: {
      type: "product" | "seller" | "order" | "category" | "coupon" | "settlement" | "auth" | "system";
      id: string;
      name?: string;
    };
    result: "success" | "failure";
    failureReason?: string;
    message: string;
    requestId?: string;
    metadata?: Record<string, any>;
    changes?: {
      before?: Record<string, any>;
      after?: Record<string, any>;
    };
  }): Promise<void> {
    const timestamp = new Date().toISOString();
    const requestId = params.requestId || (params.req as any)?.id || "req_untracked";
    const ip = params.actor.ip || params.req?.ip || params.req?.socket?.remoteAddress;
    const userAgent = params.actor.userAgent || params.req?.headers?.["user-agent"] as string;

    const auditEntry: AuditLogDocument = {
      timestamp,
      service: this.serviceName,
      environment: this.environment,
      actor: {
        id: params.actor.id,
        role: params.actor.role,
        email: params.actor.email,
        ip,
        userAgent,
      },
      action: params.action,
      resource: params.resource,
      request: params.req
        ? {
            method: params.req.method,
            route: params.req.originalUrl || params.req.url,
          }
        : undefined,
      result: params.result,
      failureReason: params.failureReason,
      requestId,
      message: params.message,
      metadata: params.metadata ? sanitizeLogPayload(params.metadata) : undefined,
      changes: params.changes
        ? {
            before: params.changes.before ? sanitizeLogPayload(params.changes.before) : undefined,
            after: params.changes.after ? sanitizeLogPayload(params.changes.after) : undefined,
          }
        : undefined,
    };

    console.log(JSON.stringify({ type: "AUDIT", ...auditEntry }));

    setImmediate(() => {
      mongoLogs.insertAuditLog(auditEntry).catch(() => {});
    });
  }

  /**
   * Records an application/diagnostic log entry.
   */
  static async logApp(
    level: "debug" | "info" | "warn" | "error" | "fatal",
    message: string,
    details?: {
      requestId?: string;
      actor?: { id?: string; role?: string };
      error?: Error;
      metadata?: Record<string, any>;
    }
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const logDoc: Omit<ApplicationLogDocument, "createdAt"> = {
      timestamp,
      level,
      service: this.serviceName,
      environment: this.environment,
      message,
      requestId: details?.requestId,
      actor: details?.actor,
      metadata: details?.metadata ? sanitizeLogPayload(details?.metadata) : undefined,
    };

    if (details?.error) {
      logDoc.error = {
        name: details.error.name,
        message: details.error.message,
        stack: this.environment === "development" ? details.error.stack : undefined,
      };
    }

    if (level === "error" || level === "fatal") {
      console.error(JSON.stringify({ type: "APP_ERROR", ...logDoc }));
    } else {
      console.log(JSON.stringify({ type: "APP_LOG", ...logDoc }));
    }

    setImmediate(() => {
      mongoLogs.insertAppLog(logDoc).catch(() => {});
    });
  }

  /**
   * Records a third-party API call (Cashfree, Shiprocket, Cloudflare R2, Zoho SMTP).
   */
  static async logThirdParty(params: {
    provider: "cashfree" | "shiprocket" | "cloudflare_r2" | "zoho_smtp";
    endpoint: string;
    method: string;
    statusCode: number;
    durationMs: number;
    success: boolean;
    retryCount?: number;
    requestId?: string;
    error?: string;
    metadata?: Record<string, any>;
  }): Promise<void> {
    const timestamp = new Date().toISOString();
    const logDoc: Omit<ApplicationLogDocument, "createdAt"> = {
      timestamp,
      level: params.success ? "info" : "error",
      service: this.serviceName,
      environment: this.environment,
      message: `[ThirdParty:${params.provider}] ${params.method} ${params.endpoint} -> ${params.statusCode} (${params.durationMs}ms)`,
      requestId: params.requestId,
      thirdParty: {
        provider: params.provider,
        endpoint: params.endpoint,
        method: params.method,
        statusCode: params.statusCode,
        durationMs: params.durationMs,
        success: params.success,
        retryCount: params.retryCount || 0,
      },
      metadata: params.metadata ? sanitizeLogPayload(params.metadata) : undefined,
    };

    if (params.error) {
      logDoc.error = { name: "ThirdPartyError", message: params.error };
    }

    console.log(JSON.stringify({ type: "THIRD_PARTY", ...logDoc }));

    setImmediate(() => {
      mongoLogs.insertAppLog(logDoc).catch(() => {});
    });
  }
}

