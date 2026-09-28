import { db, adminAuditLogsTable, mongoGeneric } from "@workspace/db";

export interface AuditLogParams {
  action: string;
  module: string;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  status?: "success" | "failure";
  actor?: string;
}

/**
 * Append-only audit log writer. Never throws — audit log failures must not
 * crash the caller. Fire this after a successful mutation (or with
 * status: "failure" on error paths you want to track).
 */
export async function writeAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const id = crypto.randomUUID();
    const doc = {
      id,
      _id: id,
      actor: params.actor ?? "Super Admin",
      action: params.action,
      module: params.module,
      details: params.details ?? null,
      ipAddress: params.ipAddress ?? null,
      status: params.status ?? "success",
      createdAt: new Date(),
    };

    try {
      await mongoGeneric.getCollection("admin_audit_logs").insertOne(doc as any);
    } catch {
      await db.insert(adminAuditLogsTable).values({
        actor: params.actor ?? "Super Admin",
        action: params.action,
        module: params.module,
        details: params.details ?? null,
        ipAddress: params.ipAddress ?? null,
        status: params.status ?? "success",
      });
    }
  } catch (err) {
    // Intentionally swallowed — audit writes must not crash callers
    console.error("[auditLog] write failed:", err);
  }
}

export function getIp(req: any): string {
  return (
    ((req.headers?.["x-forwarded-for"] as string) ?? "").split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}
