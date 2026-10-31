import { db, adminAuditLogsTable, mongoGeneric } from "@workspace/db";

export interface AuditLogParams {
  action?: string;
  eventType?: string;
  module?: string;
  details?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  ipAddress?: string | null;
  status?: "success" | "failure";
  actor?: string;
  role?: string;
  email?: string;
  userId?: string;
  userAgent?: string | null;
}

const SENSITIVE_KEYS = new Set([
  "password",
  "confirmpassword",
  "newpassword",
  "currentpassword",
  "token",
  "accesstoken",
  "refreshtoken",
  "passwordhash",
  "otp",
  "code",
  "secret",
  "creditcard",
  "cvv",
]);

function sanitizeLogData(obj: any): any {
  if (!obj || typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeLogData);

  const clean: Record<string, any> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (SENSITIVE_KEYS.has(key.toLowerCase())) {
      clean[key] = "[REDACTED]";
    } else if (val && typeof val === "object") {
      clean[key] = sanitizeLogData(val);
    } else {
      clean[key] = val;
    }
  }
  return clean;
}

/**
 * Append-only audit log writer. Never throws — audit log failures must not crash the caller.
 * Automatically redacts passwords, tokens, OTPs, and sensitive fields.
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const action = params.action || params.eventType || "security_event";
    const module = params.module || "Security";
    const details = sanitizeLogData(params.details || params.metadata || {});

    const doc = {
      id,
      _id: id,
      actor: params.actor || params.role || "System",
      action,
      module,
      details,
      ipAddress: params.ipAddress ?? null,
      status: params.status ?? "success",
      email: params.email ?? null,
      userId: params.userId ?? null,
      createdAt: new Date(),
    };

    const writePromise = (async () => {
      try {
        await mongoGeneric.getCollection("admin_audit_logs").insertOne(doc as any);
      } catch {
        await db.insert(adminAuditLogsTable).values({
          actor: doc.actor,
          action: doc.action,
          module: doc.module,
          details: doc.details,
          ipAddress: doc.ipAddress,
          status: doc.status as any,
        });
      }
    })();

    const timeoutPromise = new Promise((resolve) => setTimeout(resolve, 1000));
    await Promise.race([writePromise, timeoutPromise]);
  } catch (err) {
    // Non-blocking audit log catch
  }
}

export function getIp(req: any): string {
  if (req?.ip) {
    return req.ip;
  }
  return (
    ((req?.headers?.["x-forwarded-for"] as string) ?? "").split(",")[0]?.trim() ||
    req?.socket?.remoteAddress ||
    "unknown"
  );
}
