import { db, mongoVendors, mongoGeneric } from "@workspace/db";
import { notificationsTable, vendorsTable, productsTable } from "@workspace/db";
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

import { mongoNotifications } from "@workspace/db";
import { sendSellerNewOrderEmail, sendSellerOrderCancelledEmail } from "./transactionalEmail";

export async function insertSellerNotification(opts: InsertSellerNotificationOpts): Promise<void> {
  const { vendorId, type, title, body, metadata } = opts;

  let ownerId: string | null = null;
  try {
    const vendor = (await mongoVendors.findById(vendorId)) ||
                   (await mongoVendors.findByVendorId?.(vendorId)) ||
                   (await mongoVendors.findBySellerId?.(vendorId));
    ownerId = vendor?.ownerId || vendor?.userId || vendor?.id || vendorId;
  } catch {}

  if (!ownerId) {
    ownerId = vendorId;
  }

  const id = crypto.randomUUID();
  const notifDoc = {
    id,
    _id: id,
    userId: ownerId,
    vendorId,
    type,
    title,
    body,
    read: false,
    isRead: false,
    metadata: metadata ?? {},
    createdAt: new Date(),
  };

  try {
    if (mongoNotifications?.insert) {
      await mongoNotifications.insert(notifDoc);
    } else {
      await mongoGeneric.getCollection("notifications").insertOne(notifDoc as any);
    }
  } catch {}

  try {
    const client = opts.tx ?? db;
    await client.insert(notificationsTable).values({
      userId: ownerId,
      vendorId,
      type,
      title,
      body,
      metadata: metadata ?? {},
    }).catch(() => {});
  } catch {}

  // Trigger transactional email to seller for order events asynchronously (non-blocking)
  try {
    if (type === "new_order" && (metadata?.orderId || metadata?.id)) {
      const orderId = String(metadata.orderId || metadata.id);
      sendSellerNewOrderEmail({
        vendorId,
        orderId,
        items: metadata.items as any,
        settlementAmount: (metadata.amount ?? metadata.settlementAmount) as any,
        shippingAddress: metadata.shippingAddress,
      }).catch(() => {});
    } else if (type === "order_cancelled_seller" && (metadata?.orderId || metadata?.id)) {
      const orderId = String(metadata.orderId || metadata.id);
      sendSellerOrderCancelledEmail({
        vendorId,
        orderId,
        reason: body,
      }).catch(() => {});
    }
  } catch {}
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

/**
 * Resolves the vendorId for a specific productId and sends a seller notification ONLY to that owner.
 */
export async function notifySellerForItemEvent(opts: {
  tx?: any;
  productId: string;
  type: SellerNotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const client = opts.tx ?? db;
  const [product] = await client
    .select({ vendorId: productsTable.vendorId })
    .from(productsTable)
    .where(eq(productsTable.id, opts.productId))
    .limit(1);

  if (!product?.vendorId) return null;

  await insertSellerNotification({
    tx: opts.tx,
    vendorId: product.vendorId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    metadata: { ...opts.metadata, productId: opts.productId },
  });

  return product.vendorId;
}

