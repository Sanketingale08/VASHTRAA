import { db } from "@workspace/db";
import { notificationsTable, ADMIN_NOTIFICATION_USER_ID } from "@workspace/db";
import type { AdminNotificationType } from "@workspace/db";

interface InsertAdminNotificationOpts {
  tx?: any;
  type: AdminNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function insertAdminNotification(opts: InsertAdminNotificationOpts): Promise<void> {
  const { type, title, body, metadata } = opts;
  const client = opts.tx ?? db;

  await client.insert(notificationsTable).values({
    userId: ADMIN_NOTIFICATION_USER_ID,
    type,
    title,
    body,
    metadata: metadata ?? {},
  });
}
