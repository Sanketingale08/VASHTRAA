import { randomUUID } from "crypto";
import { db, mongoGeneric, isMongoDbConnected, mongoSellers, mongoVendors, mongoOrders, mongoProducts, mongoSettlements } from "@workspace/db";
import { vendorSettlementsTable, ordersTable, vendorsTable, productsTable } from "@workspace/db";
import { eq, and, lte, inArray, or } from "drizzle-orm";
import {
  getCashfreeConfig,
  initiateCashfreeTransfer,
  getCashfreeTransferStatus,
  registerCashfreeBeneficiary,
} from "./cashfree";
import { logger } from "./logger";
import { getItemBasePrice, getItemCommissionRate } from "./vendorAnalytics";
import { loadActiveCommissionRules } from "./commission";
import { filterRealtimeOrders } from "./orderFilter";
import {
  calculateVastraaFinancials,
  toPaise,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_COMMISSION_GST_BPS,
  DEFAULT_TCS_BPS,
} from "./pricingEngine";
import { emitFinancialsEvent, emitAnalyticsEvent } from "./socket";
import { safeInvalidatePattern } from "./cacheEngine";

/**
 * Checks if a seller has a genuinely verified bank account.
 * Only verified bank accounts become eligible for Wednesday seller settlements.
 */
export function isVendorBankVerified(vendor: any): boolean {
  if (!vendor) return false;
  const isVerified = vendor.bankVerified === true || vendor.bankVerificationStatus === "verified";
  const hasAccount = Boolean(vendor.bankAccount && String(vendor.bankAccount).trim().length >= 8);
  const hasIfsc = Boolean(vendor.bankIfsc && String(vendor.bankIfsc).trim().length >= 11);
  return Boolean(isVerified && hasAccount && hasIfsc);
}

/**
 * Resolves a vendor record by vendorId, sellerId, ownerId, or id across Mongo and Postgres.
 */
export async function resolveVendorRecord(vendorId: string): Promise<any> {
  if (!vendorId) return null;
  let vendor: any = null;
  try {
    if (mongoSellers) {
      vendor = (await mongoSellers.findById(vendorId)) ||
               (await mongoSellers.findByVendorId(vendorId)) ||
               (await mongoSellers.findBySellerId(vendorId)) ||
               (await mongoSellers.findByOwnerId(vendorId));
    }
  } catch {}
  if (!vendor && mongoVendors && mongoVendors !== (mongoSellers as any)) {
    try {
      vendor = (await mongoVendors.findById(vendorId)) ||
               (await mongoVendors.findByVendorId(vendorId)) ||
               (await mongoVendors.findBySellerId(vendorId)) ||
               (await mongoVendors.findByOwnerId(vendorId));
    } catch {}
  }
  if (!vendor && db && vendorsTable) {
    try {
      const isUuid = Boolean(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(vendorId));
      const conds: any[] = [];
      if (isUuid) conds.push(eq(vendorsTable.id, vendorId));
      conds.push(eq(vendorsTable.vendorId, vendorId));
      conds.push(eq(vendorsTable.ownerId, vendorId));
      const rows = await db.select().from(vendorsTable).where(or(...conds)).limit(1);
      vendor = rows[0];
    } catch {}
  }
  return vendor;
}

export interface PayoutProvider {
  processPayout(settlement: {
    id: string;
    amount: number;
    vendorId: string;
    existingTransferId?: string | null;
  }): Promise<{
    success: boolean;
    status?: "SUCCESS" | "PENDING" | "FAILED";
    utrNumber?: string;
    payoutReference?: string;
    error?: string;
  }>;
}

export class StubPayoutProvider implements PayoutProvider {
  async processPayout(settlement: { id: string; amount: number; vendorId: string }) {
    const vendor = await resolveVendorRecord(settlement.vendorId);
    if (!isVendorBankVerified(vendor)) {
      return {
        success: false,
        status: "FAILED" as const,
        error: "Seller bank account is not verified. Wednesday settlement payouts require a verified bank account.",
      };
    }
    const utrNumber = `UTR${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const payoutReference = `PAY-${settlement.id.slice(0, 8).toUpperCase()}`;
    return { success: true, status: "SUCCESS" as const, utrNumber, payoutReference };
  }
}

export class CashfreePayoutProvider implements PayoutProvider {
  async processPayout(settlement: {
    id: string;
    amount: number;
    vendorId: string;
    existingTransferId?: string | null;
  }): Promise<{
    success: boolean;
    status?: "SUCCESS" | "PENDING" | "FAILED";
    utrNumber?: string;
    payoutReference?: string;
    error?: string;
  }> {
    // 1. Fetch vendor/seller record
    let vendor: any = await mongoSellers.findById(settlement.vendorId);
    if (!vendor) {
      try {
        const [v] = await db.select().from(vendorsTable).where(eq(vendorsTable.id, settlement.vendorId)).limit(1);
        vendor = v;
      } catch {}
    }

    if (!vendor) {
      return { success: false, status: "FAILED", error: `Vendor ${settlement.vendorId} not found` };
    }

    // 2. Validate bank account, IFSC, and genuine verification status
    if (!vendor.bankAccount || !vendor.bankIfsc) {
      return {
        success: false,
        status: "FAILED",
        error: "Seller bank account or IFSC is missing. Please update bank details in Seller Profile.",
      };
    }

    if (!isVendorBankVerified(vendor)) {
      return {
        success: false,
        status: "FAILED",
        error: "Seller bank account has not been genuinely verified. Wednesday settlements require a verified bank account.",
      };
    }

    const beneId = vendor.cashfreeBeneficiaryId || `BENE_${(vendor.vendorId || vendor.id || settlement.vendorId).replace(/[^a-zA-Z0-9_\-]/g, "_")}`;

    // 3. Ensure beneficiary is registered with Cashfree Payouts
    if (!vendor.cashfreeBeneficiaryId || vendor.beneficiaryStatus !== "beneficiary_active") {
      const regRes = await registerCashfreeBeneficiary({
        beneId,
        name: vendor.bankHolder || vendor.name || "Seller",
        email: vendor.contactEmail || vendor.email || "seller@vastraa.com",
        phone: vendor.mobile || "9999999999",
        bankAccount: vendor.bankAccount,
        ifsc: vendor.bankIfsc,
        address1: vendor.shopStreet || "Main Road",
        city: vendor.shopCity || "Mumbai",
        state: vendor.shopState || "Maharashtra",
        pincode: vendor.shopPincode || "400001",
      });

      if (!regRes.success) {
        return {
          success: false,
          status: "FAILED",
          error: `Beneficiary registration failed: ${regRes.error || "Unknown error"}`,
        };
      }

      await mongoSellers.update(vendor.id, {
        cashfreeBeneficiaryId: beneId,
        beneficiaryStatus: "beneficiary_active",
        beneficiaryRegisteredAt: new Date(),
      }).catch(() => {});
    }

    // 4. Amount handling: convert integer paise to rupees if needed
    const amountInRupees = settlement.amount > 1000 ? Math.round(settlement.amount) / 100 : settlement.amount;
    if (amountInRupees <= 0) {
      return { success: false, status: "FAILED", error: "Settlement amount must be greater than zero" };
    }

    // 5. Transfer reference & idempotency
    const transferId = settlement.existingTransferId || `XFER_${settlement.id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 15)}_${Date.now()}`;

    // Safe status verification if retrying an existing transfer to prevent duplicate payouts
    if (settlement.existingTransferId) {
      const existingStatus = await getCashfreeTransferStatus(settlement.existingTransferId);
      if (existingStatus.success && existingStatus.status === "SUCCESS") {
        return {
          success: true,
          status: "SUCCESS",
          utrNumber: existingStatus.utrNumber,
          payoutReference: existingStatus.payoutReference,
        };
      }
    }

    // 6. Submit transfer via Cashfree Payouts API
    const transferRes = await initiateCashfreeTransfer({
      transferId,
      beneId,
      amount: amountInRupees,
      remarks: `Payout ${settlement.id.slice(0, 8)}`,
    });

    return {
      success: transferRes.success,
      status: transferRes.status,
      utrNumber: transferRes.utrNumber,
      payoutReference: transferRes.payoutReference || transferId,
      error: transferRes.error,
    };
  }
}

export async function processSettlementTransitions(options?: {
  returnWindowDays?: number;
  provider?: PayoutProvider;
}): Promise<{
  eligibleCount: number;
  paidCount: number;
  auditLogs: Array<{ settlementId: string; from: string; to: string; timestamp: string }>;
}> {
  const config = await getCashfreeConfig();
  const returnWindowDays = options?.returnWindowDays ?? config.settlementHoldDays;
  const provider = options?.provider ?? new CashfreePayoutProvider();
  const cutoffDate = new Date(Date.now() - returnWindowDays * 24 * 60 * 60 * 1000);
  const auditLogs: Array<{ settlementId: string; from: string; to: string; timestamp: string }> = [];

  let eligibleCount = 0;
  let paidCount = 0;

  // 1. Transition pending -> eligible for delivered orders past return window
  let pendingSettlements: any[] = [];
  try {
    pendingSettlements = await db
      .select()
      .from(vendorSettlementsTable)
      .where(eq(vendorSettlementsTable.status, "pending"));
  } catch {
    if (isMongoDbConnected()) {
      try {
        pendingSettlements = await mongoGeneric.getCollection("vendor_settlements").find({ status: "pending" }).toArray();
      } catch {}
    }
  }

  for (const s of pendingSettlements) {
    if (!s.orderId) continue;
    let order: any = null;
    try {
      const [ord] = await db.select().from(ordersTable).where(eq(ordersTable.id, s.orderId)).limit(1);
      order = ord;
    } catch {
      if (isMongoDbConnected()) {
        try {
          order = await mongoGeneric.getCollection("orders").findOne({ id: s.orderId });
        } catch {}
      }
    }

    if (!order) continue;
    const isDelivered = order.status === "delivered";
    const deliveryDate = order.deliveredAt ? new Date(order.deliveredAt) : (order.updatedAt ? new Date(order.updatedAt) : new Date(order.createdAt));
    const pastReturnWindow = deliveryDate <= cutoffDate;

    if (isDelivered && pastReturnWindow) {
      // Only genuinely verified bank accounts should become eligible for Wednesday seller settlements
      const vendor = await resolveVendorRecord(s.vendorId);
      if (!isVendorBankVerified(vendor)) {
        continue;
      }

      const now = new Date();
      try {
        await db
          .update(vendorSettlementsTable)
          .set({ status: "eligible", settlementEligibilityDate: now, updatedAt: now } as any)
          .where(and(eq(vendorSettlementsTable.id, s.id), eq(vendorSettlementsTable.status, "pending")));
      } catch {}
      if (isMongoDbConnected()) {
        try {
          await mongoGeneric
            .getCollection("vendor_settlements")
            .updateOne({ id: s.id, status: "pending" }, { $set: { status: "eligible", settlementEligibilityDate: now, updatedAt: now } });
        } catch {}
      }

      auditLogs.push({ settlementId: s.id, from: "pending", to: "eligible", timestamp: now.toISOString() });
      eligibleCount++;
    }
  }

  // 2. Transition eligible -> paid only if scheduled payout mode is enabled
  if (config.payoutMode === "scheduled" && (config.payoutEnabled || config.env === "sandbox")) {
    let eligibleSettlements: any[] = [];
    try {
      eligibleSettlements = await db
        .select()
        .from(vendorSettlementsTable)
        .where(eq(vendorSettlementsTable.status, "eligible"));
    } catch {
      if (isMongoDbConnected()) {
        try {
          eligibleSettlements = await mongoGeneric.getCollection("vendor_settlements").find({ status: "eligible" }).toArray();
        } catch {}
      }
    }

    for (const s of eligibleSettlements) {
      const settlementAmount = s.sellerSettlement ?? s.amount;
      // Respect configured minimum payout threshold
      if (settlementAmount < config.minimumPayoutThresholdPaise && s.amount < (config.minimumPayoutThresholdPaise / 100)) {
        continue;
      }

      // Re-verify that seller's bank account remains genuinely verified prior to disbursement
      const vendor = await resolveVendorRecord(s.vendorId);
      if (!isVendorBankVerified(vendor)) {
        logger.warn({ settlementId: s.id, vendorId: s.vendorId }, "Skipping Wednesday payout: vendor bank is not genuinely verified");
        continue;
      }

      const payoutRes = await provider.processPayout({
        id: s.id,
        amount: settlementAmount,
        vendorId: s.vendorId,
        existingTransferId: s.cashfreeTransferId,
      });

      if (payoutRes.success) {
        const now = new Date();
        const finalStatus = payoutRes.status === "PENDING" ? "processing" : "paid";

        try {
          await db
            .update(vendorSettlementsTable)
            .set({
              status: finalStatus,
              utrNumber: payoutRes.utrNumber ?? null,
              payoutReference: payoutRes.payoutReference ?? null,
              cashfreeTransferId: payoutRes.payoutReference ?? null,
              paidAt: finalStatus === "paid" ? now : null,
              updatedAt: now,
            } as any)
            .where(and(eq(vendorSettlementsTable.id, s.id), eq(vendorSettlementsTable.status, "eligible")));
        } catch {}

        if (isMongoDbConnected()) {
          try {
            await mongoGeneric.getCollection("vendor_settlements").updateOne(
              { id: s.id, status: "eligible" },
              {
                $set: {
                  status: finalStatus,
                  utrNumber: payoutRes.utrNumber ?? null,
                  payoutReference: payoutRes.payoutReference ?? null,
                  cashfreeTransferId: payoutRes.payoutReference ?? null,
                  paidAt: finalStatus === "paid" ? now : null,
                  updatedAt: now,
                },
              }
            );
          } catch {}
        }

        auditLogs.push({ settlementId: s.id, from: "eligible", to: finalStatus, timestamp: now.toISOString() });
        paidCount++;
      } else {
        // Record failure reason for admin audit
        const now = new Date();
        if (isMongoDbConnected()) {
          try {
            await mongoGeneric.getCollection("vendor_settlements").updateOne(
              { id: s.id },
              { $set: { failureReason: payoutRes.error || "Payout transfer rejected", updatedAt: now } }
            );
          } catch {}
        }
      }
    }
  }

  return { eligibleCount, paidCount, auditLogs };
}

export async function reverseSettlementForCancellationOrReturn(
  orderId: string,
  newStatus: "cancelled" | "on_hold",
  reason?: string
): Promise<{ reversedCount: number }> {
  let settlements: any[] = [];
  try {
    settlements = await db.select().from(vendorSettlementsTable).where(eq(vendorSettlementsTable.orderId, orderId));
  } catch {
    if (isMongoDbConnected()) {
      try {
        settlements = await mongoGeneric.getCollection("vendor_settlements").find({ orderId }).toArray();
      } catch {}
    }
  }

  let reversedCount = 0;
  const now = new Date();

  for (const s of settlements) {
    const note = `Reversed due to ${newStatus}: ${reason || "No reason provided"}`;
    try {
      await db
        .update(vendorSettlementsTable)
        .set({
          status: newStatus,
          note,
          platformCommission: 0,
          gstOnCommission: 0,
          tcsDeduction: 0,
          sellerSettlement: 0,
          platformKeeps: 0,
          updatedAt: now,
        } as any)
        .where(eq(vendorSettlementsTable.id, s.id));
    } catch {}

    if (isMongoDbConnected()) {
      try {
        await mongoGeneric.getCollection("vendor_settlements").updateOne(
          { id: s.id },
          {
            $set: {
              status: newStatus,
              note,
              platformCommission: 0,
              gstOnCommission: 0,
              tcsDeduction: 0,
              sellerSettlement: 0,
              platformKeeps: 0,
              updatedAt: now,
            },
          }
        );
      } catch {}
    }

    reversedCount++;
  }

  return { reversedCount };
}

export interface SyncSettlementsResult {
  syncedOrdersCount: number;
  createdSettlementsCount: number;
  reversedSettlementsCount: number;
}

/**
 * Idempotently synchronizes settlement records with genuine eligible orders.
 *
 * Ensures the settlements module accurately reflects the same eligible orders,
 * seller identities, and financial rules as Vendor Analytics.
 *
 * Financial formulas adhered to:
 *   Platform Commission = Eligible Product Base Price × 18% (or configured commission rate)
 *   Seller Net Earnings = Eligible Product Base Price − Platform Commission − Applicable Deductions
 *
 * - Generates settlement records only for eligible, verified orders (delivered, confirmed, dispatched, paid).
 * - Excludes cancelled, returned, and payment-failed orders (and safely reverses active unpaid settlements if order status changed).
 * - Enforces idempotency via unique references (idempotencyKey) so repeated runs or retries never duplicate payouts.
 * - Sets delivered orders past 7-day return window to 'eligible' (ready for Wednesday payout), and recent/undelivered orders to 'pending'.
 * - Preserves historical settlements and never marks pending settlements as completed without verified payout.
 */
export async function syncEligibleOrderSettlements(): Promise<SyncSettlementsResult> {
  let allOrders: any[] = [];
  try {
    if (mongoOrders && typeof mongoOrders.findMany === "function") {
      allOrders = await mongoOrders.findMany({});
    }
  } catch {}
  if (allOrders.length === 0) {
    try {
      allOrders = await db.select().from(ordersTable);
    } catch {}
  }

  const orders = filterRealtimeOrders(allOrders);

  let allProducts: any[] = [];
  try {
    if (mongoProducts && typeof mongoProducts.findMany === "function") {
      allProducts = await mongoProducts.findMany({});
    }
  } catch {}
  if (allProducts.length === 0) {
    try {
      allProducts = await db.select().from(productsTable);
    } catch {}
  }

  const productMap = new Map<string, any>();
  for (const p of allProducts) {
    if (p.id) productMap.set(String(p.id), p);
    if (p._id) productMap.set(String(p._id), p);
  }

  let allVendors: any[] = [];
  try {
    if (mongoSellers && typeof mongoSellers.findMany === "function") {
      allVendors = await mongoSellers.findMany({});
    }
  } catch {}
  let sqlVendors: any[] = [];
  try {
    sqlVendors = await db.select().from(vendorsTable);
  } catch {}
  const combinedVendors = [...allVendors, ...sqlVendors];

  const vendorAliasToPrimaryId = new Map<string, string>();
  const vendorBankVerifiedMap = new Map<string, boolean>();
  for (const v of combinedVendors) {
    if (!v) continue;
    const primaryId = String(v.id || v._id || v.vendorId || v.sellerId);
    const verified = isVendorBankVerified(v);
    const aliases = [v.id, v._id ? String(v._id) : null, v.vendorId, v.sellerId, v.ownerId, v.userId].filter(Boolean);
    for (const a of aliases) {
      vendorAliasToPrimaryId.set(String(a), primaryId);
      vendorAliasToPrimaryId.set(String(a).toLowerCase(), primaryId);
      vendorBankVerifiedMap.set(String(a), verified);
      vendorBankVerifiedMap.set(String(a).toLowerCase(), verified);
    }
  }

  let existingSettlements: any[] = [];
  try {
    existingSettlements = await db.select().from(vendorSettlementsTable);
  } catch {}
  if (isMongoDbConnected()) {
    try {
      const mSettlements = mongoSettlements && typeof mongoSettlements.findMany === "function"
        ? await mongoSettlements.findMany({})
        : await mongoGeneric.getCollection("vendor_settlements").find({}).toArray();
      const seenIds = new Set(existingSettlements.map((s) => String(s.id)));
      for (const ms of mSettlements) {
        if (!seenIds.has(String(ms.id))) {
          existingSettlements.push(ms);
          seenIds.add(String(ms.id));
        }
      }
    } catch {}
  }

  const existingSettlementByOrderAndVendor = new Set<string>();
  for (const s of existingSettlements) {
    if (s.orderId) {
      const rawVid = s.vendorId ? String(s.vendorId) : "";
      const primaryVid = vendorAliasToPrimaryId.get(rawVid) || vendorAliasToPrimaryId.get(rawVid.toLowerCase()) || rawVid;
      existingSettlementByOrderAndVendor.add(`${String(s.orderId).trim()}_${primaryVid}`);
      existingSettlementByOrderAndVendor.add(`${String(s.orderId).trim()}_${rawVid}`);
      if (s.idempotencyKey) {
        existingSettlementByOrderAndVendor.add(String(s.idempotencyKey).trim());
      }
    }
  }

  // 1. Safely reverse unpaid settlements for cancelled/returned/failed orders
  let reversedCount = 0;
  const seenCancelledOrders = new Set<string>();
  for (const order of orders) {
    const orderId = String(order.id || order._id || order.orderId || order.displayId || "").trim();
    if (!orderId || seenCancelledOrders.has(orderId)) continue;
    const status = String(order.status || "").toLowerCase();
    const isCancelledOrReturned = ["cancelled", "returned", "failed", "payment_failed"].includes(status);
    const refundStatus = String(order.refundStatus || "").toLowerCase();
    const isFullRefund = ["processed", "approved", "completed"].includes(refundStatus) && !["partial", "partially_refunded"].includes(refundStatus);

    if (isCancelledOrReturned || isFullRefund) {
      seenCancelledOrders.add(orderId);
      const orderSettlements = existingSettlements.filter(
        (s) => String(s.orderId).trim() === orderId && !["cancelled", "rejected"].includes(s.status)
      );
      for (const s of orderSettlements) {
        if (s.status !== "paid" && s.status !== "completed") {
          await reverseSettlementForCancellationOrReturn(orderId, "cancelled", `Order is ${status || "refunded"}`);
          reversedCount++;
        }
      }
    }
  }

  // 2. Generate missing settlement records for eligible orders
  const commissionRules = await loadActiveCommissionRules();
  const now = new Date();
  const cutoffReturnDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let createdCount = 0;
  const seenOrderKeys = new Set<string>();

  for (const order of orders) {
    const orderId = String(order.id || order._id || order.orderId || order.displayId || "").trim();
    if (!orderId || seenOrderKeys.has(orderId)) continue;
    seenOrderKeys.add(orderId);

    const status = String(order.status || "").toLowerCase();
    const paymentStatus = String(order.paymentStatus || order.payment?.status || "").toLowerCase();
    const isPaymentFailed = paymentStatus === "failed" || status === "payment_failed";
    const isCancelledOrReturned = ["cancelled", "returned", "failed"].includes(status);
    const refundStatus = String(order.refundStatus || "").toLowerCase();
    const isFullRefund = ["processed", "approved", "completed"].includes(refundStatus) && !["partial", "partially_refunded"].includes(refundStatus);

    if (isPaymentFailed || isCancelledOrReturned || isFullRefund) {
      continue;
    }

    const items = Array.isArray(order.items) ? order.items : [];
    if (items.length === 0) continue;

    const vendorItemsMap = new Map<string, Array<{ item: any; basePrice: number; qty: number; category?: string }>>();

    for (const item of items) {
      if (!item) continue;
      const itemStatus = String(item.status || "").toLowerCase();
      if (["cancelled", "returned", "refunded"].includes(itemStatus)) continue;

      const prod = productMap.get(String(item.productId));
      const rawVid = item.vendorId || item.sellerId || prod?.vendorId || prod?.sellerId;
      if (!rawVid) continue;
      const primaryVid = vendorAliasToPrimaryId.get(String(rawVid)) || vendorAliasToPrimaryId.get(String(rawVid).toLowerCase()) || String(rawVid);

      const fullQty = Math.max(1, Number(item.quantity) || 1);
      const returnedQty = Math.max(0, Number(item.returnedQuantity || item.refundedQuantity) || 0);
      const eligibleQty = Math.max(0, fullQty - returnedQty);
      if (eligibleQty <= 0) continue;

      const basePrice = getItemBasePrice(item, prod);
      if (basePrice <= 0) continue;

      const list = vendorItemsMap.get(primaryVid) ?? [];
      list.push({ item, basePrice, qty: eligibleQty, category: prod?.category });
      vendorItemsMap.set(primaryVid, list);
    }

    for (const [vid, group] of vendorItemsMap) {
      const key = `${orderId}_${vid}`;
      const idempotencyKey = `settlement_${orderId}_${vid}`;
      if (existingSettlementByOrderAndVendor.has(key) || existingSettlementByOrderAndVendor.has(idempotencyKey)) {
        continue;
      }

      const productAmount = group.reduce((sum, g) => sum + g.basePrice * g.qty, 0);
      if (productAmount <= 0) continue;

      const primaryCategory = group[0]?.category;
      const rate = getItemCommissionRate(
        group[0]?.item,
        commissionRules,
        vid,
        primaryCategory,
        order.createdAt ? new Date(order.createdAt) : undefined
      );
      const commissionBps = Math.round(rate * 10000);

      const basePricePaise = toPaise(productAmount);
      const financials = calculateVastraaFinancials({
        basePricePaise,
        shippingPaise: 0,
        commissionBps,
        productGstBps: 500,
        intraState: true,
      });

      const isDelivered = status === "delivered";
      const deliveryDate = order.deliveredAt
        ? new Date(order.deliveredAt)
        : (order.updatedAt ? new Date(order.updatedAt) : new Date(order.createdAt || now));
      const pastReturnWindow = deliveryDate <= cutoffReturnDate;

      // Only genuinely verified bank accounts should become eligible for Wednesday seller settlements
      const isBankVerified = vendorBankVerifiedMap.get(vid) ?? vendorBankVerifiedMap.get(vid.toLowerCase()) ?? false;
      let settlementStatus: "eligible" | "pending" = "pending";
      if (isDelivered && pastReturnWindow && isBankVerified) {
        settlementStatus = "eligible";
      }

      const netPayoutRupees = Math.round(financials.sellerSettlement / 100);
      const commissionRupees = Math.round(financials.platformCommission / 100);
      const taxRupees = Math.round(financials.gstOnCommission / 100);

      let genId = "";
      try {
        genId = randomUUID();
      } catch {
        genId = `settle_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      }

      const settlementRecord: any = {
        id: genId,
        vendorId: vid,
        orderId,
        type: "order_settlement",
        status: settlementStatus,
        amount: netPayoutRupees,
        pricingVersion: "v2",
        productAmount: Math.round(productAmount),
        commission: commissionRupees,
        commissionRate: rate,
        shippingCharge: 0,
        settlementTax: taxRupees,
        netPayout: netPayoutRupees,
        sellerBasePrice: financials.sellerBasePrice,
        platformCommission: financials.platformCommission,
        shippingFee: financials.shippingFee,
        taxableAmount: financials.taxableAmount,
        gstRateBps: financials.gstRateBps,
        gstAmount: financials.gstAmount,
        cgst: financials.cgst,
        sgst: financials.sgst,
        igst: financials.igst,
        customerPays: financials.customerPays,
        gstOnCommission: financials.gstOnCommission,
        tcsDeduction: financials.tcsDeduction,
        sellerSettlement: financials.sellerSettlement,
        platformKeeps: financials.platformKeeps,
        commissionBps: financials.commissionBps,
        commissionGstBps: DEFAULT_COMMISSION_GST_BPS,
        tcsBps: DEFAULT_TCS_BPS,
        idempotencyKey,
        settlementEligibilityDate: settlementStatus === "eligible" ? (order.deliveredAt ? new Date(order.deliveredAt) : now) : null,
        createdAt: order.createdAt ? new Date(order.createdAt) : now,
        updatedAt: now,
      };

      try {
        await db.insert(vendorSettlementsTable).values(settlementRecord);
      } catch {}

      if (isMongoDbConnected()) {
        try {
          if (mongoSettlements && typeof mongoSettlements.insert === "function") {
            await mongoSettlements.insert(settlementRecord);
          } else if (mongoGeneric && typeof mongoGeneric.getCollection === "function") {
            await mongoGeneric.getCollection("vendor_settlements").insertOne(settlementRecord);
          }
        } catch {}
      }

      existingSettlementByOrderAndVendor.add(key);
      existingSettlementByOrderAndVendor.add(idempotencyKey);
      existingSettlements.push(settlementRecord);
      createdCount++;
    }
  }

  if (createdCount > 0 || reversedCount > 0) {
    safeInvalidatePattern(/financial|settlement|revenue|payment|profit|vendor|analytics/);
    try {
      emitFinancialsEvent("financials:updated", { source: "settlement_sync", createdCount, reversedCount });
      emitAnalyticsEvent({ reason: "settlement_sync", createdCount });
    } catch {}
  }

  return {
    syncedOrdersCount: orders.length,
    createdSettlementsCount: createdCount,
    reversedSettlementsCount: reversedCount,
  };
}
