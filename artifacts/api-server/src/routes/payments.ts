import { Router, type Request, type Response } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { requireAdminKey } from "../middlewares/isAdmin";
import {
  db,
  mongoOrders,
  mongoProducts,
  mongoSellers,
  mongoGeneric,
  getNextSequenceValue,
  isMongoDbConnected,
  ordersTable,
  productsTable,
  vendorSettlementsTable,
  couponsTable,
  couponRedemptionsTable,
  mongoCoupons,
} from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { validateAndCalculateCoupon } from "../lib/couponValidation";
import {
  getCashfreeConfig,
  createCashfreePgOrder,
  getCashfreePgOrder,
  getCashfreePgOrderPayments,
  payCashfreePgOrderWithUpi,
  simulateCashfreePgPayment,
  verifyCashfreeWebhookSignature,
  testCashfreeConnection,
} from "../lib/cashfree";
import {
  calculateVastraaFinancials,
  toPaise,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_COMMISSION_GST_BPS,
  DEFAULT_TCS_BPS,
} from "../lib/pricingEngine";
import { getApprovedVendorData, isProductVendorValid } from "../lib/vendorValidation";
import { recordStockChange } from "../lib/stockHistory";
import { insertSellerNotification } from "../lib/sellerNotifications";
import { insertOrderStatusNotification } from "../lib/orderNotifications";
import { emitOrderEvent, emitFinancialsEvent } from "../lib/socket";
import { safeInvalidatePattern } from "../lib/cacheEngine";
import { logger } from "../lib/logger";
import fs from "fs";
import path from "path";
import { generateInvoicePdf } from "../lib/invoiceRenderer";
import { ensureOrderInvoicesGenerated } from "../lib/invoiceStorage";

const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// HELPER: Authoritative confirmation of order after successful payment
// Idempotent: Can safely be called by both verify-order endpoint and webhook
// ─────────────────────────────────────────────────────────────────────────────
export async function confirmOrderPayment(
  orderId: string,
  paymentDetails: {
    paymentId?: string;
    paymentMethod?: string;
    amount?: number;
    rawPayload?: any;
  }
): Promise<{ success: boolean; order: any; alreadyConfirmed?: boolean }> {
  // 1. Fetch current order
  let order: any = await mongoOrders.findById(orderId);
  if (!order) {
    try {
      const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
      order = ord;
    } catch {}
  }

  if (!order) {
    throw new Error(`Order ${orderId} not found`);
  }

  // Idempotency check: if order is already paid & confirmed, return immediately
  if (order.paymentStatus === "paid" && (order.status === "confirmed" || order.status === "processing" || order.status === "shipped" || order.status === "delivered")) {
    return { success: true, order, alreadyConfirmed: true };
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // 2. Deduct inventory if not already deducted
  const resolvedItems = Array.isArray(order.items) ? order.items : [];
  for (const item of resolvedItems) {
    if (!item.productId) continue;
    try {
      const p = await mongoProducts.findById(item.productId);
      const prevStock = p?.stock ?? 10;
      const decRes = await mongoProducts.decrementStock(item.productId, item.quantity);
      const newStock = decRes.stock;

      try {
        await db
          .update(productsTable)
          .set({ stock: sql`${productsTable.stock} - ${item.quantity}` })
          .where(and(eq(productsTable.id, item.productId), gte(productsTable.stock, item.quantity)));
      } catch {}

      await recordStockChange({
        tx: db as any,
        productId: item.productId,
        vendorId: item.vendorId ?? null,
        previousStock: prevStock,
        newStock,
        source: "order",
        reason: "Cashfree payment confirmed",
        actorId: order.userId,
        orderId,
      }).catch(() => {});

      const notifVendorId = item.vendorId || item.sellerId;
      if (notifVendorId) {
        const threshold = item.lowStockThreshold ?? 5;
        if (newStock <= 0) {
          await insertSellerNotification({
            tx: db as any,
            vendorId: notifVendorId,
            type: "out_of_stock",
            title: "Product out of stock",
            body: `"${item.name}" is now out of stock following order ${order.displayId || orderId}.`,
            metadata: { productId: item.productId, orderId },
          }).catch(() => {});
        } else if (newStock <= threshold) {
          await insertSellerNotification({
            tx: db as any,
            vendorId: notifVendorId,
            type: "low_stock",
            title: "Low stock alert",
            body: `"${item.name}" has only ${newStock} unit(s) left.`,
            metadata: { productId: item.productId, orderId },
          }).catch(() => {});
        }
      }
    } catch (stockErr) {
      logger.error({ stockErr, orderId, productId: item.productId }, "Failed stock adjustment during payment confirmation");
    }
  }

  // 3. Create seller settlements exactly once (idempotent check)
  let existingSettlements: any[] = [];
  try {
    existingSettlements = await db
      .select()
      .from(vendorSettlementsTable)
      .where(eq(vendorSettlementsTable.orderId, orderId));
  } catch {
    if (isMongoDbConnected()) {
      try {
        existingSettlements = await mongoGeneric.getCollection("vendor_settlements").find({ orderId }).toArray();
      } catch {}
    }
  }

  if (existingSettlements.length === 0) {
    const customerState = order.address?.state || "Maharashtra";
    const isIntraState = customerState.trim().toLowerCase() === "maharashtra";

    // Group items by vendor
    const vendorOrderGroups = new Map<string, { itemNames: string[]; items: any[]; vendorTotal: number }>();
    for (const item of resolvedItems) {
      const vId = item.vendorId || item.sellerId;
      if (!vId) continue;
      const group = vendorOrderGroups.get(vId) ?? { itemNames: [], items: [], vendorTotal: 0 };
      group.itemNames.push(item.name);
      group.items.push(item);
      group.vendorTotal += (item.price || 0) * (item.quantity || 1);
      vendorOrderGroups.set(vId, group);
    }

    for (const [vendorId, group] of vendorOrderGroups) {
      const vendorFinancials = calculateVastraaFinancials({
        basePricePaise: toPaise(group.vendorTotal),
        shippingPaise: 0,
        productGstBps: 500,
        intraState: isIntraState,
      });

      const settlementRecord = {
        vendorId,
        orderId,
        type: "order_settlement",
        status: "pending",
        amount: vendorFinancials.sellerSettlement,
        pricingVersion: "v2",
        sellerBasePrice: vendorFinancials.sellerBasePrice,
        platformCommission: vendorFinancials.platformCommission,
        shippingFee: vendorFinancials.shippingFee,
        taxableAmount: vendorFinancials.taxableAmount,
        gstRateBps: vendorFinancials.gstRateBps,
        gstAmount: vendorFinancials.gstAmount,
        cgst: vendorFinancials.cgst,
        sgst: vendorFinancials.sgst,
        igst: vendorFinancials.igst,
        customerPays: vendorFinancials.customerPays,
        gstOnCommission: vendorFinancials.gstOnCommission,
        tcsDeduction: vendorFinancials.tcsDeduction,
        sellerSettlement: vendorFinancials.sellerSettlement,
        platformKeeps: vendorFinancials.platformKeeps,
        commissionBps: DEFAULT_COMMISSION_BPS,
        commissionGstBps: DEFAULT_COMMISSION_GST_BPS,
        tcsBps: DEFAULT_TCS_BPS,
        createdAt: now,
      };

      try {
        await db.insert(vendorSettlementsTable).values(settlementRecord as any);
      } catch {}

      if (isMongoDbConnected()) {
        try {
          await mongoGeneric.getCollection("vendor_settlements").insertOne(settlementRecord as any);
        } catch {}
      }

      // Notify vendor about new confirmed order
      await insertSellerNotification({
        tx: db as any,
        vendorId,
        type: "new_order",
        title: "New order received",
        body: `Order ${order.displayId || orderId} has been confirmed. Payable settlement: ₹${(vendorFinancials.sellerSettlement / 100).toFixed(2)}.`,
        metadata: {
          orderId,
          amount: vendorFinancials.sellerSettlement,
          items: group.items,
          shippingAddress: order.address || order.shippingAddress,
        },
      }).catch(() => {});
    }
  }

  // 4. Update order status to paid and confirmed
  const updatedStatusHistory = Array.isArray(order.statusHistory)
    ? [...order.statusHistory, { status: "confirmed", timestamp: nowIso, note: `Cashfree payment verified (${paymentDetails.paymentId || "Online"})` }]
    : [{ status: "confirmed", timestamp: nowIso, note: "Cashfree payment verified" }];

  const updateFields: any = {
    paymentStatus: "paid",
    status: "confirmed",
    cashfreePaymentId: paymentDetails.paymentId || order.cashfreePaymentId || null,
    paymentVerifiedAt: now,
    statusHistory: updatedStatusHistory,
    updatedAt: now,
  };

  // 4b. Auto-generate official standardized invoice snapshots and PDF
  let invoiceBuffer: Buffer | null = null;
  let invoiceFilename: string | null = null;
  try {
    const snapshots = await ensureOrderInvoicesGenerated({ ...order, ...updateFields });
    if (snapshots.length > 0) {
      updateFields.invoiceNumber = snapshots[0].invoiceNumber;
      updateFields.invoiceUrl = `/api/orders/${order.id}/invoice`;
    }

    const invRes = await generateInvoicePdf({ ...order, ...updateFields });
    invoiceBuffer = invRes.pdfBuffer;
    invoiceFilename = invRes.filename;

    const invoicesDir = path.resolve(process.cwd(), "public", "invoices");
    if (!fs.existsSync(invoicesDir)) {
      fs.mkdirSync(invoicesDir, { recursive: true });
    }
    await fs.promises.writeFile(path.join(invoicesDir, invoiceFilename), invoiceBuffer);
  } catch (invErr) {
    logger.warn({ invErr, orderId }, "Could not generate invoice PDF during payment confirmation");
  }

  await mongoOrders.update(orderId, updateFields);
  try {
    await db.update(ordersTable).set(updateFields).where(eq(ordersTable.id, orderId));
  } catch {}

  // 5. Send customer notification with invoice attachment
  const firstItem = order.items?.[0]?.name || "Item";
  const extraItems = Math.max(0, (order.items?.length || 1) - 1);
  const attachedEmail =
    ((order.address as any)?.email as string) ||
    ((order.address as any)?.contactEmail as string) ||
    ((order.address as any)?.customerEmail as string) ||
    ((order as any).customerEmail as string) ||
    ((order as any).email as string) ||
    ((order as any).userEmail as string);

  await insertOrderStatusNotification({
    tx: db as any,
    userId: order.userId,
    customerEmail: attachedEmail || undefined,
    type: "payment_successful",
    orderId,
    itemName: firstItem,
    extraItemCount: extraItems,
    totalAmount: paymentDetails.amount || order.total,
  }).catch(() => {});
  await insertOrderStatusNotification({
    tx: db as any,
    userId: order.userId,
    customerEmail: attachedEmail || undefined,
    type: "order_confirmed",
    orderId,
    itemName: firstItem,
    extraItemCount: extraItems,
    invoiceAttachment:
      invoiceBuffer && invoiceFilename
        ? {
            filename: invoiceFilename,
            content: invoiceBuffer,
          }
        : undefined,
  }).catch(() => {});

  // 6. Emit real-time events
  emitOrderEvent("order:status_changed", {
    orderId,
    displayId: order.displayId || orderId,
    userId: order.userId,
    status: "confirmed",
    paymentStatus: "paid",
  });
  emitOrderEvent("payment:status_updated", {
    orderId,
    displayId: order.displayId || orderId,
    userId: order.userId,
    status: "confirmed",
    paymentStatus: "paid",
  });

  safeInvalidatePattern(/financial|settlement|commission|revenue|payment|refund|profit/);
  try {
    emitFinancialsEvent("financials:updated", {
      source: "payment:confirmed",
      orderId,
      displayId: order.displayId || orderId,
      paymentId: paymentDetails.paymentId,
      amount: paymentDetails.amount || order.total,
    });
    emitFinancialsEvent("settlement:created", {
      orderId,
      amount: paymentDetails.amount || order.total,
    });
  } catch {}

  // Record coupon redemption if order used a coupon and not already recorded
  if (order.couponCode) {
    try {
      const cleanCode = String(order.couponCode).trim().toUpperCase();
      let coupon: any = null;
      try {
        coupon = await mongoCoupons.findByCode(cleanCode);
      } catch {}
      if (!coupon) {
        const rows = await db.select().from(couponsTable).where(eq(couponsTable.code, cleanCode)).limit(1).catch(() => []);
        coupon = rows[0] || null;
      }
      if (coupon) {
        const existingRedemptions = await db
          .select({ id: couponRedemptionsTable.id })
          .from(couponRedemptionsTable)
          .where(and(eq(couponRedemptionsTable.couponId, coupon.id), eq(couponRedemptionsTable.orderId, orderId)))
          .limit(1)
          .catch(() => []);
        if (existingRedemptions.length === 0) {
          await mongoCoupons.atomicIncrementUsage(coupon.id, coupon.maxUses).catch(() => {});
          await db.update(couponsTable).set({ usedCount: sql`${couponsTable.usedCount} + 1` }).where(eq(couponsTable.id, coupon.id)).catch(() => {});
          await db.insert(couponRedemptionsTable).values({ couponId: coupon.id, userId: order.userId, orderId }).catch(() => {});
        }
      }
    } catch (cErr) {
      logger.warn({ cErr, orderId }, "Could not record coupon redemption during payment confirmation");
    }
  }

  return { success: true, order: { ...order, ...updateFields } };
}

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/payments/cashfree/create-order
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payments/cashfree/create-order", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { items: clientItems, address, deliveryMethod, couponCode, isBuyNow } = req.body;

    if (!clientItems || !Array.isArray(clientItems) || clientItems.length === 0) {
      res.status(400).json({ error: "No items in order" });
      return;
    }

    const resolvedAddress = address ? {
      ...address,
      email: address.email || address.contactEmail || address.customerEmail || (req.body as any)?.customerEmail || (req.body as any)?.email || (req as any)?.userEmail || "",
      line1: address.line1 || address.address || "",
      pincode: address.pincode || address.pinCode || "",
    } : null;

    if (!resolvedAddress || !resolvedAddress.name || !resolvedAddress.line1 || !resolvedAddress.city || !resolvedAddress.state || !resolvedAddress.pincode || !/^\d{6}$/.test(String(resolvedAddress.pincode).trim())) {
      res.status(400).json({ error: "Invalid delivery address or pincode (must be 6 digits)" });
      return;
    }

    // Deduplication check: prevent rapid duplicate Cashfree order creation (3 seconds)
    try {
      const recentPendingOrder = await mongoOrders.findOne({
        userId: req.userId,
        status: "payment_pending",
        createdAt: { $gte: new Date(Date.now() - 3000) },
      });
      if (recentPendingOrder && recentPendingOrder.cashfreePaymentSessionId) {
        const config = await getCashfreeConfig();
        res.json({
          success: true,
          orderId: recentPendingOrder.id,
          cfOrderId: recentPendingOrder.cashfreeOrderId,
          paymentSessionId: recentPendingOrder.cashfreePaymentSessionId,
          orderAmount: recentPendingOrder.total,
          orderCurrency: "INR",
          isSimulated: false,
          env: config.env,
        });
        return;
      }
    } catch {}

    // Validate products from database
    const approvedVendorData = await getApprovedVendorData();
    const resolvedItems: any[] = [];

    for (const item of clientItems) {
      let p: any = await mongoProducts.findById(item.productId);
      if (!p) {
        try {
          const rows = await db
            .select()
            .from(productsTable)
            .where(eq(productsTable.id, item.productId))
            .limit(1);
          if (rows.length > 0) p = rows[0];
        } catch {}
      }

      if (!p) {
        res.status(400).json({ error: `Product "${item.name || item.productId}" was not found in catalog` });
        return;
      }

      if (!isProductVendorValid(p, approvedVendorData)) {
        res.status(400).json({ error: `Product "${p.name}" is unavailable because vendor is not active` });
        return;
      }

      const requestedQty = parseInt(item.quantity, 10);
      if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
        res.status(400).json({ error: `Invalid quantity for "${p.name}"` });
        return;
      }

      if ((p.stock ?? 0) <= 0) {
        res.status(400).json({ error: `"${p.name}" is currently out of stock` });
        return;
      }

      if (requestedQty > (p.stock ?? 0)) {
        res.status(400).json({ error: `Only ${p.stock} unit(s) of "${p.name}" available` });
        return;
      }

      const itemBasePaise = toPaise(p.price * requestedQty);
      const itemBreakdown = calculateVastraaFinancials({
        basePricePaise: itemBasePaise,
        shippingPaise: 0,
        productGstBps: 500,
        intraState: true,
      });

      resolvedItems.push({
        productId: p.id,
        name: p.name,
        price: p.price,
        basePrice: p.basePrice ?? Math.round(p.price / 1.155),
        originalPrice: p.originalPrice ?? p.price,
        quantity: requestedQty,
        images: Array.isArray(p.images) ? p.images : [p.images].filter(Boolean),
        vendorName: p.vendorName || "VASTRAA Weaver",
        vendorId: p.vendorId || p.sellerId || null,
        sellerId: p.sellerId || p.vendorId || null,
        lowStockThreshold: p.lowStockThreshold ?? 5,
        sellerBasePrice: itemBreakdown.sellerBasePrice,
        platformCommission: itemBreakdown.platformCommission,
        shippingFee: itemBreakdown.shippingFee,
        taxableAmount: itemBreakdown.taxableAmount,
        gstRateBps: itemBreakdown.gstRateBps,
        gstAmount: itemBreakdown.gstAmount,
        cgst: itemBreakdown.cgst,
        sgst: itemBreakdown.sgst,
        igst: itemBreakdown.igst,
        customerPays: itemBreakdown.customerPays,
        gstOnCommission: itemBreakdown.gstOnCommission,
        tcsDeduction: itemBreakdown.tcsDeduction,
        sellerSettlement: itemBreakdown.sellerSettlement,
        commissionBps: DEFAULT_COMMISSION_BPS,
        commissionGstBps: DEFAULT_COMMISSION_GST_BPS,
        tcsBps: DEFAULT_TCS_BPS,
      });
    }

    // Price calculation
    const totalSellingPrice = resolvedItems.reduce((s: number, i: any) => s + i.price * i.quantity, 0);
    const platformFee = 20;
    const codFee = 0; // Not applicable for online payment
    const shipping = 0;
    let discount = 0;
    let validatedCouponDoc: any = null;
    if (couponCode) {
      const cleanCode = String(couponCode).trim().toUpperCase();
      const couponValidation = await validateAndCalculateCoupon({
        code: cleanCode,
        userId: req.userId,
        items: resolvedItems.map((i: any) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          category: (productMap.get(i.productId)?.category) || (productMap.get(i.productId)?.subcategory) || null,
        })),
        cartSubtotal: totalSellingPrice,
      });

      if (!couponValidation.valid) {
        res.status(400).json({
          error: couponValidation.error,
          couponInvalid: true,
          shortfall: couponValidation.shortfall,
          minimumOrderValue: couponValidation.minimumOrderValue,
        });
        return;
      }

      discount = couponValidation.discount;
      validatedCouponDoc = couponValidation.coupon;
    }

    const subtotal = totalSellingPrice;
    const finalTotal = totalSellingPrice - discount + platformFee + shipping;

    const seq = await getNextSequenceValue("order_id");
    const newOrderId = `V${seq}`;
    const now = new Date();
    const nowIso = now.toISOString();

    const customerState = resolvedAddress.state || "Maharashtra";
    const isIntraState = customerState.trim().toLowerCase() === "maharashtra";

    const orderFinancials = calculateVastraaFinancials({
      basePricePaise: toPaise(totalSellingPrice - discount),
      shippingPaise: 0,
      productGstBps: 500,
      intraState: isIntraState,
    });

    const orderDoc = {
      id: newOrderId,
      displayId: newOrderId,
      userId: req.userId,
      items: resolvedItems,
      address: resolvedAddress,
      deliveryMethod: deliveryMethod || "standard",
      paymentMethod: "cashfree",
      paymentStatus: "pending",
      couponCode: validatedCouponDoc ? validatedCouponDoc.code : null,
      subtotal,
      discount,
      platformFee,
      shipping: 0,
      tax: 0,
      codFee: 0,
      total: finalTotal,
      financials: {
        ...orderFinancials,
        platformFee,
        codFee: 0,
        shipping: 0,
      },
      status: "payment_pending",
      statusHistory: [{ status: "payment_pending", timestamp: nowIso, note: "Cashfree checkout initiated" }],
      createdAt: now,
      updatedAt: now,
    };

    // 1. Insert order with pending payment status
    await mongoOrders.insert(orderDoc as any);
    try {
      await db.insert(ordersTable).values(orderDoc as any);
    } catch {}

    // 2. Create Cashfree payment order via server API
    const userEmail = resolvedAddress.email || (req as any).userEmail || "customer@vastraa.com";
    const userPhone = resolvedAddress.phone || "9999999999";
    const userName = resolvedAddress.name || "Customer";

    const host = req.get("host") || "localhost:5000";
    const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
    const appOrigin = `${protocol}://${host}`;

    const cfOrderRes = await createCashfreePgOrder({
      orderId: newOrderId,
      orderAmount: finalTotal,
      currency: "INR",
      customer: {
        id: req.userId,
        email: userEmail,
        phone: userPhone,
        name: userName,
      },
      returnUrl: `${appOrigin}/orders/${newOrderId}?cf_id={order_id}`,
      notifyUrl: `${appOrigin}/api/payments/cashfree/webhook`,
      orderNote: `VASTRAA Order ${newOrderId}`,
    });

    // 3. Save Cashfree order ID & payment-session ID in database
    await mongoOrders.update(newOrderId, {
      cashfreeOrderId: cfOrderRes.cfOrderId || newOrderId,
      cashfreePaymentSessionId: cfOrderRes.paymentSessionId,
    });
    try {
      await db
        .update(ordersTable)
        .set({
          cashfreeOrderId: cfOrderRes.cfOrderId || newOrderId,
          cashfreePaymentSessionId: cfOrderRes.paymentSessionId,
        } as any)
        .where(eq(ordersTable.id, newOrderId));
    } catch {}

    const config = await getCashfreeConfig();
    res.json({
      success: true,
      orderId: newOrderId,
      cfOrderId: cfOrderRes.cfOrderId,
      paymentSessionId: cfOrderRes.paymentSessionId,
      orderAmount: finalTotal,
      orderCurrency: "INR",
      isSimulated: Boolean(cfOrderRes.isSimulated),
      env: config.env,
    });
  } catch (err: any) {
    logger.error({ err }, "Cashfree create-order endpoint failed");
    res.status(500).json({ error: err?.message || "Failed to initiate Cashfree checkout" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/payments/cashfree/pay-upi
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payments/cashfree/pay-upi", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { orderId, upiId } = req.body;
    if (!orderId || !upiId) {
      res.status(400).json({ error: "orderId and upiId are required" });
      return;
    }

    const trimmedUpiId = String(upiId).trim();
    if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(trimmedUpiId)) {
      res.status(400).json({ error: "Invalid UPI ID format (e.g. username@okhdfcbank)" });
      return;
    }

    let order: any = await mongoOrders.findById(orderId);
    if (!order) {
      try {
        const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
        order = ord;
      } catch {}
    }

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.userId !== req.userId && !(req as any).isAdmin) {
      res.status(403).json({ error: "Unauthorized access to order" });
      return;
    }

    if (order.paymentStatus === "paid") {
      res.json({
        success: true,
        orderId,
        paymentStatus: "paid",
        alreadyPaid: true,
        message: "Order is already paid.",
      });
      return;
    }

    const paymentSessionId = order.cashfreePaymentSessionId;
    if (!paymentSessionId) {
      res.status(400).json({ error: "Order has no active Cashfree payment session" });
      return;
    }

    const upiResult = await payCashfreePgOrderWithUpi({
      paymentSessionId,
      upiId: trimmedUpiId,
      upiExpiryMinutes: 10,
    });

    if (upiResult.success && upiResult.cfPaymentId) {
      const now = new Date();
      const updatedHistory = Array.isArray(order.statusHistory)
        ? [...order.statusHistory, { status: "payment_pending", timestamp: now.toISOString(), note: `Cashfree UPI Collect initiated to ${trimmedUpiId}` }]
        : [{ status: "payment_pending", timestamp: now.toISOString(), note: `Cashfree UPI Collect initiated to ${trimmedUpiId}` }];

      await mongoOrders.update(orderId, {
        cashfreePaymentId: String(upiResult.cfPaymentId),
        statusHistory: updatedHistory,
        updatedAt: now,
      });
      try {
        await db.update(ordersTable).set({
          cashfreePaymentId: String(upiResult.cfPaymentId),
          statusHistory: updatedHistory,
          updatedAt: now,
        } as any).where(eq(ordersTable.id, orderId));
      } catch {}
    }

    const config = await getCashfreeConfig();

    res.json({
      success: upiResult.success,
      orderId,
      cfPaymentId: upiResult.cfPaymentId,
      paymentStatus: upiResult.paymentStatus,
      action: upiResult.action,
      message: upiResult.message,
      env: config.env,
    });
  } catch (err: any) {
    logger.error({ err }, "Cashfree pay-upi endpoint failed");
    res.status(500).json({ error: err?.message || "Failed to initiate UPI payment request" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/orders/:orderId/pay
// Initiates payment session or Cash on Delivery switch for an unpaid order.
// Enforces authentication, ownership, server-side pricing, and idempotency.
// ─────────────────────────────────────────────────────────────────────────────
const handleOrderPay = async (req: any, res: any): Promise<void> => {
  try {
    const { orderId } = req.params;
    const { paymentMethod, upiId } = req.body || {};

    if (!orderId) {
      res.status(400).json({ error: "Order ID is required" });
      return;
    }

    // 1. Fetch order
    let order: any = await mongoOrders.findById(orderId);
    if (!order) {
      try {
        const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
        order = ord;
      } catch {}
    }

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // 2. Enforce authentication & order ownership
    if (order.userId !== req.userId && !(req as any).isAdmin) {
      res.status(403).json({ error: "Unauthorized access to order payment" });
      return;
    }

    // 3. Status checks
    if (order.status === "cancelled") {
      res.status(400).json({ error: "Cannot process payment for a cancelled order" });
      return;
    }

    if (order.paymentStatus === "paid") {
      res.json({
        success: true,
        orderId,
        paymentStatus: "paid",
        alreadyPaid: true,
        message: "This order is already paid.",
      });
      return;
    }

    // 4. Handle switch to Cash on Delivery (COD)
    if (paymentMethod === "cod") {
      if (order.total > 50000) {
        res.status(400).json({ error: "Orders above ₹50,000 are not eligible for Cash on Delivery" });
        return;
      }

      const now = new Date();
      const currentCodFee = order.codFee ?? (order.paymentMethod === "cod" ? 10 : 0);
      const newCodFee = 10;
      const feeDiff = newCodFee - currentCodFee;
      const newTotal = order.total + feeDiff;

      const updateData: any = {
        paymentMethod: "cod",
        paymentStatus: "pending",
        codFee: newCodFee,
        total: newTotal,
        updatedAt: now,
      };

      if (Array.isArray(order.statusHistory)) {
        updateData.statusHistory = [
          ...order.statusHistory,
          { status: order.status, timestamp: now.toISOString(), note: "Customer selected Cash on Delivery (Pay on Delivery)" },
        ];
      }

      await mongoOrders.update(orderId, updateData);
      try {
        await db.update(ordersTable).set(updateData).where(eq(ordersTable.id, orderId));
      } catch {}

      emitOrderEvent("order:status_changed", {
        orderId,
        displayId: order.displayId || orderId,
        userId: order.userId,
        status: order.status,
        paymentStatus: "pending",
        paymentMethod: "cod",
      });
      emitOrderEvent("payment:status_updated", {
        orderId,
        displayId: order.displayId || orderId,
        userId: order.userId,
        paymentStatus: "pending",
        paymentMethod: "cod",
      });

      res.json({
        success: true,
        switchedToCod: true,
        orderId,
        paymentMethod: "cod",
        paymentStatus: "pending",
        codFee: newCodFee,
        total: newTotal,
        message: "Order updated to Cash on Delivery. Payment will be collected upon delivery.",
      });
      return;
    }

    // 5. Prepaid payment session retrieval or creation
    // Calculate payable amount strictly from server-side order total
    const payableAmount = order.total;
    const config = await getCashfreeConfig();

    let sessionFound = false;
    let paymentSessionId = order.cashfreePaymentSessionId;
    let cfOrderId = order.cashfreeOrderId;

    // Check if existing session in Cashfree is still active
    if (cfOrderId && paymentSessionId) {
      try {
        const cfOrder = await getCashfreePgOrder(cfOrderId);
        if (cfOrder && cfOrder.order_status === "ACTIVE" && cfOrder.payment_session_id) {
          paymentSessionId = cfOrder.payment_session_id;
          sessionFound = true;
        }
      } catch {
        sessionFound = false;
      }
    }

    if (!sessionFound) {
      const host = req.get("host") || "localhost:5000";
      const protocol = req.protocol === "https" || req.get("x-forwarded-proto") === "https" ? "https" : "http";
      const appOrigin = `${protocol}://${host}`;

      const userEmail = (req as any).userEmail || "customer@vastraa.com";
      const userPhone = order.address?.phone || "9999999999";
      const userName = order.address?.name || "Customer";

      const newCfOrderId = `${order.id}_${Date.now().toString().slice(-6)}`;

      const cfOrderRes = await createCashfreePgOrder({
        orderId: newCfOrderId,
        orderAmount: payableAmount,
        currency: "INR",
        customer: {
          id: req.userId,
          email: userEmail,
          phone: userPhone,
          name: userName,
        },
        returnUrl: `${appOrigin}/orders/${order.id}?cf_id={order_id}`,
        notifyUrl: `${appOrigin}/api/payments/cashfree/webhook`,
        orderNote: `VASTRAA Order ${order.id} Payment`,
      });

      cfOrderId = newCfOrderId;
      paymentSessionId = cfOrderRes.paymentSessionId;

      const updateFields: any = {
        cashfreeOrderId: cfOrderId,
        cashfreePaymentSessionId: paymentSessionId,
        updatedAt: new Date(),
      };
      if (paymentMethod && paymentMethod !== "cod") {
        updateFields.paymentMethod = paymentMethod;
      }

      await mongoOrders.update(orderId, updateFields);
      try {
        await db.update(ordersTable).set(updateFields).where(eq(ordersTable.id, orderId));
      } catch {}
    }

    // 6. Optional UPI Collect flow if upiId is provided
    let upiResponse = null;
    if (upiId && paymentSessionId) {
      const trimmedUpiId = String(upiId).trim();
      if (!/^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/.test(trimmedUpiId)) {
        res.status(400).json({ error: "Invalid UPI ID format (e.g. username@okhdfcbank)" });
        return;
      }

      upiResponse = await payCashfreePgOrderWithUpi({
        paymentSessionId,
        upiId: trimmedUpiId,
        upiExpiryMinutes: 10,
      });

      if (upiResponse.success && upiResponse.cfPaymentId) {
        await mongoOrders.update(orderId, {
          cashfreePaymentId: String(upiResponse.cfPaymentId),
          updatedAt: new Date(),
        });
        try {
          await db.update(ordersTable).set({
            cashfreePaymentId: String(upiResponse.cfPaymentId),
            updatedAt: new Date(),
          } as any).where(eq(ordersTable.id, orderId));
        } catch {}
      }
    }

    res.json({
      success: true,
      orderId,
      cfOrderId,
      paymentSessionId,
      orderAmount: payableAmount,
      orderCurrency: "INR",
      isSimulated: false,
      env: config.env,
      upiResponse,
    });
  } catch (err: any) {
    logger.error({ err, orderId: req.params.orderId }, "Error processing order payment session");
    res.status(500).json({ error: err?.message || "Failed to initialize payment session for order" });
  }
};

router.post("/orders/:orderId/pay", isCustomer, handleOrderPay);
router.post("/payments/order/:orderId/session", isCustomer, handleOrderPay);
// Allows sandbox test simulation of UPI approvals when in sandbox mode.
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payments/cashfree/simulate-payment", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { orderId, paymentStatus = "SUCCESS" } = req.body;
    if (!orderId) {
      res.status(400).json({ error: "orderId is required" });
      return;
    }

    const config = await getCashfreeConfig();
    if (config.env !== "sandbox") {
      res.status(400).json({ error: "Simulation is only permitted in Cashfree Sandbox environment" });
      return;
    }

    let order: any = await mongoOrders.findById(orderId);
    if (!order) {
      try {
        const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
        order = ord;
      } catch {}
    }

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    if (order.userId !== req.userId && !(req as any).isAdmin) {
      res.status(403).json({ error: "Unauthorized access to order" });
      return;
    }

    if (order.paymentStatus === "paid") {
      res.json({
        success: true,
        orderId,
        paymentStatus: "paid",
        status: order.status,
        message: "Order is already paid.",
      });
      return;
    }

    // Attempt Cashfree Sandbox API simulation
    let cfPaymentId = order.cashfreePaymentId;
    if (!cfPaymentId) {
      const payments = await getCashfreePgOrderPayments(order.cashfreeOrderId || orderId);
      if (payments.length > 0 && payments[0].cf_payment_id) {
        cfPaymentId = String(payments[0].cf_payment_id);
      }
    }

    if (cfPaymentId) {
      await simulateCashfreePgPayment({
        paymentId: cfPaymentId,
        paymentStatus: paymentStatus === "FAILED" ? "FAILED" : "SUCCESS",
      }).catch((err) => {
        logger.warn({ err: err?.message, cfPaymentId }, "Cashfree PG /simulate call skipped or failed");
      });
    }

    if (paymentStatus === "SUCCESS") {
      const confirmRes = await confirmOrderPayment(orderId, {
        paymentId: cfPaymentId || `SIM_SANDBOX_${Date.now()}`,
        paymentStatus: "SUCCESS",
        paymentAmount: Number(order.total),
        paymentCurrency: "INR",
        paymentMethod: "upi",
      });

      res.json({
        success: true,
        orderId,
        paymentStatus: "paid",
        status: "confirmed",
        message: "Payment successfully approved in Cashfree sandbox simulation.",
        order: confirmRes.order,
      });
    } else {
      const now = new Date();
      await mongoOrders.update(orderId, {
        paymentStatus: "failed",
        status: "payment_failed",
        updatedAt: now,
      });
      try {
        await db.update(ordersTable).set({
          paymentStatus: "failed",
          status: "payment_failed",
          updatedAt: now,
        } as any).where(eq(ordersTable.id, orderId));
      } catch {}

      try {
        const firstItem = order.items?.[0]?.name || "Item";
        const extraItems = Math.max(0, (order.items?.length || 1) - 1);
        await insertOrderStatusNotification({
          userId: order.userId,
          type: "payment_failed",
          orderId,
          itemName: firstItem,
          extraItemCount: extraItems,
          totalAmount: order.total,
          note: "Payment attempt failed or was cancelled.",
        });
      } catch (notifErr) {
        logger.warn({ notifErr, orderId }, "Could not send payment_failed notification during simulation");
      }

      res.json({
        success: false,
        orderId,
        paymentStatus: "failed",
        status: "payment_failed",
        message: "Payment failure simulated in sandbox.",
      });
    }
  } catch (err: any) {
    logger.error({ err }, "Cashfree simulate-payment endpoint failed");
    res.status(500).json({ error: err?.message || "Failed to simulate sandbox payment" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: GET /api/payments/cashfree/verify-order/:orderId
// ─────────────────────────────────────────────────────────────────────────────
router.get("/payments/cashfree/verify-order/:orderId", isCustomer, async (req: any, res: any): Promise<void> => {
  try {
    const { orderId } = req.params;

    let order: any = await mongoOrders.findById(orderId);
    if (!order) {
      try {
        const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
        order = ord;
      } catch {}
    }

    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    // Ensure customer owns the order
    if (order.userId !== req.userId && !(req as any).isAdmin) {
      res.status(403).json({ error: "Unauthorized access to order" });
      return;
    }

    // If already verified and marked paid, return success immediately (idempotent)
    if (order.paymentStatus === "paid") {
      res.json({
        success: true,
        orderId,
        paymentStatus: "paid",
        status: order.status,
        paid: true,
        paymentId: order.cashfreePaymentId,
        alreadyVerified: true,
      });
      return;
    }

    // Query Cashfree PG API for authoritative status
    const cfOrderId = order.cashfreeOrderId || orderId;
    let cfOrder: any = null;
    let payments: any[] = [];

    try {
      cfOrder = await getCashfreePgOrder(cfOrderId);
      payments = await getCashfreePgOrderPayments(cfOrderId);
    } catch (apiErr: any) {
      logger.error({ apiErr, orderId, cfOrderId }, "Failed to query Cashfree order status");
    }

    // Strict payment verification: status SUCCESS, currency match, amount match
    const successfulPayment = payments.find((p: any) => {
      if (p.payment_status !== "SUCCESS") return false;
      if (p.payment_currency && p.payment_currency.toUpperCase() !== "INR") return false;
      if (typeof p.payment_amount === "number") {
        const diff = Math.abs(p.payment_amount - order.total);
        if (diff > 1.0) {
          logger.warn({ paymentAmount: p.payment_amount, orderTotal: order.total, orderId }, "Payment amount mismatch");
          return false;
        }
      }
      return true;
    });

    const isOrderPaid = cfOrder?.order_status === "PAID" &&
      (!cfOrder?.order_currency || cfOrder.order_currency.toUpperCase() === "INR") &&
      Math.abs((cfOrder.order_amount ?? order.total) - order.total) <= 1.0;

    const isPaid = isOrderPaid || !!successfulPayment;

    if (isPaid) {
      const paymentRef = successfulPayment?.cf_payment_id
        ? String(successfulPayment.cf_payment_id)
        : cfOrder?.cf_order_id
        ? String(cfOrder.cf_order_id)
        : undefined;

      const confirmRes = await confirmOrderPayment(orderId, {
        paymentId: paymentRef,
        paymentMethod: successfulPayment?.payment_method || "cashfree_upi",
        amount: successfulPayment?.payment_amount ?? order.total,
        rawPayload: { cfOrder, payments },
      });

      res.json({
        success: true,
        orderId,
        paymentStatus: "paid",
        status: confirmRes.order.status,
        paid: true,
        paymentId: paymentRef,
      });
      return;
    }

    // If latest payment explicitly failed
    const failedPayment = payments.find((p: any) => p.payment_status === "FAILED" || p.payment_status === "USER_DROPPED");
    if (failedPayment || cfOrder?.order_status === "EXPIRED" || cfOrder?.order_status === "TERMINATED") {
      const updateData = {
        paymentStatus: "failed",
        status: "payment_failed",
        updatedAt: new Date(),
      };
      await mongoOrders.update(orderId, updateData);
      try {
        await db.update(ordersTable).set(updateData as any).where(eq(ordersTable.id, orderId));
      } catch {}

      try {
        const firstItem = order.items?.[0]?.name || "Item";
        const extraItems = Math.max(0, (order.items?.length || 1) - 1);
        await insertOrderStatusNotification({
          userId: order.userId,
          type: "payment_failed",
          orderId,
          itemName: firstItem,
          extraItemCount: extraItems,
          totalAmount: order.total,
          note: failedPayment?.payment_message || "Payment attempt failed or was cancelled in your UPI app.",
        });
      } catch (notifErr) {
        logger.warn({ notifErr, orderId }, "Could not send payment_failed notification during verify-order");
      }

      res.json({
        success: false,
        orderId,
        paymentStatus: "failed",
        status: "payment_failed",
        message: failedPayment?.payment_message || "Payment attempt failed or was cancelled in your UPI app.",
      });
      return;
    }

    // Still pending / active
    res.json({
      success: false,
      orderId,
      paymentStatus: "pending",
      status: order.status,
      message: "Payment is pending approval in your UPI app.",
    });
  } catch (err: any) {
    logger.error({ err }, "Cashfree verify-order endpoint error");
    res.status(500).json({ error: err?.message || "Failed to verify order payment" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/payments/cashfree/webhook
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payments/cashfree/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getCashfreeConfig();
    const signature = (req.headers["x-webhook-signature"] as string) || "";
    const timestamp = (req.headers["x-webhook-timestamp"] as string) || "";
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    // 1. Verify signature
    const isValid = verifyCashfreeWebhookSignature({
      signature,
      timestamp,
      rawBody,
      secretKey: config.webhookSecret || config.secretKey,
    });

    if (!isValid) {
      // In sandbox development environment, allow gracefully if signature header is absent or mock
      if (config.env === "sandbox" && (!signature || signature === "test-sig")) {
        logger.warn("Processing sandbox webhook without strict signature");
      } else {
        logger.warn({ timestamp, hasSig: !!signature }, "Cashfree PG webhook signature validation failed");
        res.status(401).json({ error: "Invalid webhook signature" });
        return;
      }
    }

    const payload = req.body || {};
    const eventType = payload.type || payload.event || "";
    const eventData = payload.data || {};
    const orderData = eventData.order || {};
    const paymentData = eventData.payment || {};
    const orderId = orderData.order_id || payload.order_id || eventData.order_id;

    logger.info({ eventType, orderId }, "Received Cashfree PG webhook event");

    if (!orderId) {
      res.status(200).json({ status: "OK", message: "No order ID in payload" });
      return;
    }

    // 2. Handle payment success events idempotently
    if (
      eventType === "PAYMENT_SUCCESS_WEBHOOK" ||
      eventType === "ORDER_PAID" ||
      paymentData.payment_status === "SUCCESS" ||
      orderData.order_status === "PAID"
    ) {
      await confirmOrderPayment(orderId, {
        paymentId: paymentData.cf_payment_id ? String(paymentData.cf_payment_id) : undefined,
        paymentMethod: paymentData.payment_method || "cashfree",
        amount: paymentData.payment_amount,
        rawPayload: payload,
      });
      res.status(200).json({ status: "OK", message: "Payment processed" });
      return;
    }

    // 3. Handle payment failure events
    if (eventType === "PAYMENT_FAILED_WEBHOOK" || paymentData.payment_status === "FAILED") {
      const now = new Date();
      await mongoOrders.update(orderId, {
        paymentStatus: "failed",
        status: "payment_failed",
        updatedAt: now,
      });
      try {
        await db
          .update(ordersTable)
          .set({ paymentStatus: "failed", status: "payment_failed", updatedAt: now } as any)
          .where(eq(ordersTable.id, orderId));
      } catch {}

      try {
        let order: any = await mongoOrders.findById(orderId).catch(() => null);
        if (!order) {
          const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, orderId)).limit(1);
          order = ord;
        }
        if (order && order.userId) {
          const firstItem = order.items?.[0]?.name || "Item";
          const extraItems = Math.max(0, (order.items?.length || 1) - 1);
          await insertOrderStatusNotification({
            userId: order.userId,
            type: "payment_failed",
            orderId,
            itemName: firstItem,
            extraItemCount: extraItems,
            totalAmount: order.total,
            note: paymentData.payment_message || "Payment declined or failed",
          }).catch(() => {});
        }
      } catch {}

      res.status(200).json({ status: "OK", message: "Failure recorded" });
      return;
    }

    res.status(200).json({ status: "OK", message: "Event ignored" });
  } catch (err: any) {
    logger.error({ err }, "Cashfree PG webhook processing error");
    res.status(500).json({ error: "Webhook processing error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/payouts/cashfree/webhook
// ─────────────────────────────────────────────────────────────────────────────
router.post("/payouts/cashfree/webhook", async (req: Request, res: Response): Promise<void> => {
  try {
    const config = await getCashfreeConfig();
    const signature = (req.headers["x-webhook-signature"] as string) || "";
    const timestamp = (req.headers["x-webhook-timestamp"] as string) || "";
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);

    const isValid = verifyCashfreeWebhookSignature({
      signature,
      timestamp,
      rawBody,
      secretKey: config.payoutWebhookSecret || config.payoutClientSecret || config.secretKey,
    });

    if (!isValid && !(config.payoutEnv === "sandbox" && !signature)) {
      logger.warn("Cashfree Payout webhook signature validation failed");
      res.status(401).json({ error: "Invalid webhook signature" });
      return;
    }

    const payload = req.body || {};
    const event = payload.event || payload.type || "";
    const transferData = payload.data || payload;
    const transferId = transferData.transferId || transferData.referenceId;
    const utr = transferData.utr;
    const status = (transferData.status || "").toUpperCase();

    logger.info({ event, transferId, status, utr }, "Received Cashfree Payout webhook");

    if (transferId) {
      const now = new Date();
      let newStatus: string = "processing";
      if (status === "SUCCESS" || event === "TRANSFER_SUCCESS") {
        newStatus = "paid";
      } else if (status === "FAILED" || event === "TRANSFER_FAILED") {
        newStatus = "failed";
      } else if (status === "REVERSED" || event === "TRANSFER_REVERSED") {
        newStatus = "on_hold";
      }

      if (isMongoDbConnected()) {
        try {
          await mongoGeneric.getCollection("vendor_settlements").updateMany(
            { $or: [{ cashfreeTransferId: transferId }, { payoutReference: transferId }, { id: transferId }] },
            {
              $set: {
                status: newStatus,
                utrNumber: utr || null,
                failureReason: transferData.reason || null,
                paidAt: newStatus === "paid" ? now : null,
                updatedAt: now,
              },
            }
          );
        } catch {}
      }

      try {
        await db
          .update(vendorSettlementsTable)
          .set({
            status: newStatus as any,
            utrNumber: utr || null,
            failureReason: transferData.reason || null,
            paidAt: newStatus === "paid" ? now : null,
          } as any)
          .where(eq(vendorSettlementsTable.cashfreeTransferId, transferId));
      } catch {}
    }

    res.status(200).json({ status: "OK" });
  } catch (err: any) {
    logger.error({ err }, "Cashfree Payout webhook processing error");
    res.status(500).json({ error: "Payout webhook error" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ENDPOINT: POST /api/admin/payments/test-connection
// ─────────────────────────────────────────────────────────────────────────────
router.post("/admin/payments/test-connection", requireAdminKey, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await testCashfreeConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || "Failed to test Cashfree connection" });
  }
});

export default router;
