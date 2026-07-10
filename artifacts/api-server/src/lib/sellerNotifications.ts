import { db } from "@workspace/db";
import { notificationsTable, vendorsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import type { SellerNotificationType } from "@workspace/db";

interface InsertSellerNotificationOpts {
  tx?: any;
  vendorId: string;
  type: SellerNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}

export async function insertSellerNotification(opts: InsertSellerNotificationOpts): Promise<void> {
  const { vendorId, type, title, body, metadata } = opts;
  const client = opts.tx ?? db;

  const [vendor] = await client
    .select({ ownerId: vendorsTable.ownerId })
    .from(vendorsTable)
    .where(eq(vendorsTable.id, vendorId))
    .limit(1);

  if (!vendor) return;

  await client.insert(notificationsTable).values({
    userId: vendor.ownerId,
    vendorId,
    type,
    title,
    body,
    metadata: metadata ?? {},
  });
}

export async function insertSellerNotificationForVendors(
  vendorIds: string[],
  type: SellerNotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await Promise.all(
    vendorIds.map((vendorId) => insertSellerNotification({ vendorId, type, title, body, metadata }))
  );
}
