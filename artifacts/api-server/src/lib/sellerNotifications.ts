import { db, mongoVendors, mongoGeneric } from "@workspace/db";
import { notificationsTable, vendorsTable } from "@workspace/db";
import { eq } from "@workspace/db";
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

  try {
    const vendor = await mongoVendors.findById(vendorId);
    if (!vendor || !vendor.ownerId) return;

    const id = crypto.randomUUID();
    await mongoGeneric.getCollection("notifications").insertOne({
      id,
      _id: id,
      userId: vendor.ownerId,
      vendorId,
      type,
      title,
      body,
      isRead: false,
      metadata: metadata ?? {},
      createdAt: new Date(),
    } as any);
  } catch {
    const client = opts.tx ?? db;

    const [vendor] = await client
      .select({ ownerId: vendorsTable.ownerId })
      .from(vendorsTable)
      .where(eq(vendorsTable.id, vendorId))
      .limit(1);

    if (!vendor || !vendor.ownerId) return;

    await client.insert(notificationsTable).values({
      userId: vendor.ownerId,
      vendorId,
      type,
      title,
      body,
      metadata: metadata ?? {},
    });
  }
}

export async function insertSellerNotificationForVendors(
  vendorIds: string[],
  type: SellerNotificationType,
  title: string,
  body: string,
  metadata?: Record<string, unknown>,
  tx?: any
): Promise<void> {
  await Promise.all(
    vendorIds.map((vendorId) => insertSellerNotification({ tx, vendorId, type, title, body, metadata }))
  );
}
