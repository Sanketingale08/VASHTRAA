import { Router } from "express";
import { getCollection, isMongoDbConnected } from "@workspace/db";
import { requireAdminKey } from "../middlewares/isAdmin";

const router = Router();

// ── Period validation ─────────────────────────────────────────────────────────
const VALID_PERIODS = new Set([
  "today",
  "yesterday",
  "7d",
  "30d",
  "monthly",
  "last_month",
  "lastMonth",
  "quarterly",
  "yearly",
  "this_year",
  "custom",
]);

class PeriodError extends Error {
  readonly statusCode = 400;
  constructor(period: string) {
    super(
      `Invalid period "${period}". Must be one of: today, yesterday, 7d, 30d, monthly, last_month, quarterly, yearly, custom`
    );
  }
}

// ── Period helper ─────────────────────────────────────────────────────────────
function parsePeriod(period: string, from?: string, to?: string) {
  const now = new Date();
  let start: Date;
  let end: Date = new Date();
  end.setHours(23, 59, 59, 999);

  let prevStart: Date;
  let prevEnd: Date;

  switch (period) {
    case "today": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      break;
    }
    case "yesterday": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 23, 59, 59, 999);
      break;
    }
    case "7d": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7, 23, 59, 59, 999);
      break;
    }
    case "30d": {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 23, 59, 59, 999);
      break;
    }
    case "monthly": {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const daysIntoMonth = Math.max(1, now.getDate());
      prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, daysIntoMonth, 23, 59, 59, 999);
      break;
    }
    case "last_month":
    case "lastMonth": {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      prevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999);
      break;
    }
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1, 0, 0, 0, 0);
      prevStart = new Date(now.getFullYear(), (q - 1) * 3, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
      break;
    }
    case "this_year":
    case "yearly": {
      start = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
      prevStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate(), 23, 59, 59, 999);
      break;
    }
    case "custom": {
      start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
      if (to) {
        end = new Date(to);
        end.setHours(23, 59, 59, 999);
      }
      const dur = Math.max(end.getTime() - start.getTime(), 86400000);
      prevEnd = new Date(start.getTime() - 1);
      prevStart = new Date(start.getTime() - dur);
      break;
    }
    default: {
      if (!VALID_PERIODS.has(period)) throw new PeriodError(period);
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 29, 0, 0, 0, 0);
      prevStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 59, 0, 0, 0, 0);
      prevEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30, 23, 59, 59, 999);
    }
  }

  const durationMs = Math.max(end.getTime() - start.getTime(), 86400000);
  const days = Math.max(1, Math.ceil(durationMs / 86400000));
  const groupBy: "day" | "week" | "month" = days > 90 ? "month" : days > 31 ? "week" : "day";

  return { start, end, prevStart, prevEnd, groupBy, days };
}

// ── Date parsing helper for Mongo docs ─────────────────────────────────────────
function getDocDate(doc: any, field = "createdAt"): Date | null {
  const val = doc?.[field];
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "object" && val.$date) {
    const d = new Date(val.$date);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

function formatDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ── Financial Extraction for Order ────────────────────────────────────────────
interface OrderFinancials {
  gross: number;
  discount: number;
  net: number;
  commission: number;
  vendorEarnings: number;
  refundAmount: number;
  tax: number;
  shipping: number;
  isEligibleOrder: boolean;
  isRefundProcessed: boolean;
}

function extractOrderFinancials(o: any): OrderFinancials {
  // Demo / test exclusion
  if (o.isDemo === true || o.isTest === true || o.test === true || o.demo === true) {
    return { gross: 0, discount: 0, net: 0, commission: 0, vendorEarnings: 0, refundAmount: 0, tax: 0, shipping: 0, isEligibleOrder: false, isRefundProcessed: false };
  }

  // Cancelled orders are not completed sales
  if (o.status === "cancelled") {
    return { gross: 0, discount: 0, net: 0, commission: 0, vendorEarnings: 0, refundAmount: 0, tax: 0, shipping: 0, isEligibleOrder: false, isRefundProcessed: false };
  }

  // Incomplete online payment checkouts that were abandoned
  if (o.status === "payment_pending" && o.paymentStatus !== "paid") {
    return { gross: 0, discount: 0, net: 0, commission: 0, vendorEarnings: 0, refundAmount: 0, tax: 0, shipping: 0, isEligibleOrder: false, isRefundProcessed: false };
  }

  const items = Array.isArray(o.items) ? o.items : [];
  let itemSum = 0;
  for (const it of items) {
    const p = Number(it.price ?? it.basePrice ?? 0);
    const q = Number(it.quantity ?? 1);
    itemSum += p * q;
  }

  // Gross Revenue = actual product sales value before discounts and refunds
  // Do not add shipping charges, GST, or platform fees to product gross revenue
  const gross = itemSum > 0 ? itemSum : Number(o.subtotal ?? o.total ?? 0);
  const discount = Math.max(0, Number(o.discount ?? 0));

  // Refund status check
  const isRefundProcessed =
    ["approved", "completed", "processed"].includes(String(o.refundStatus || "").toLowerCase()) ||
    o.status === "refunded";
  const refundAmount = isRefundProcessed ? Number(o.refundAmount || o.total || gross) : 0;

  // Taxes
  let tax = Number(o.tax ?? o.gst ?? 0);
  if (!tax && o.financials?.gstAmount) {
    const rawGst = Number(o.financials.gstAmount);
    tax = rawGst > 1000 && gross < 10000 ? Math.round(rawGst / 100) : rawGst;
  }

  // Shipping
  const shipping = Number(o.shipping ?? o.shippingFee ?? 0);

  // Platform Commission: 18% of eligible product base price, or actual commission record
  let commission = 0;
  if (o.financials?.platformCommission) {
    const rawComm = Number(o.financials.platformCommission);
    commission = rawComm > gross ? Math.round(rawComm / 100) : rawComm;
  } else {
    let itemCommTotal = 0;
    for (const it of items) {
      if (it.platformCommission) {
        const ic = Number(it.platformCommission);
        itemCommTotal += ic > (it.price || 1) ? ic / 100 : ic;
      }
    }
    if (itemCommTotal > 0) {
      commission = Math.round(itemCommTotal);
    } else {
      // Default VASTRAA commission is 18% of eligible product sales
      commission = Math.round(gross * 0.18);
    }
  }

  // Vendor Earnings
  let vendorEarnings = 0;
  if (o.financials?.sellerSettlement) {
    const rawSet = Number(o.financials.sellerSettlement);
    vendorEarnings = rawSet > gross ? Math.round(rawSet / 100) : rawSet;
  } else {
    vendorEarnings = Math.max(0, gross - discount - commission - refundAmount);
  }

  // Net Revenue = Gross - discount - refunds
  const net = Math.max(0, gross - discount - refundAmount);

  return {
    gross,
    discount,
    net,
    commission,
    vendorEarnings,
    refundAmount,
    tax,
    shipping,
    isEligibleOrder: true,
    isRefundProcessed,
  };
}

// ── Daily Ledger Bucket Map Helper ────────────────────────────────────────────
interface LedgerBucket {
  date: string;
  orders: number;
  revenue: number; // Gross Revenue
  discounts: number;
  netRevenue: number;
  commission: number;
  vendorEarnings: number;
  refundAmount: number;
  gst: number;
  shipping: number;
  prevDate: string;
  prevOrders: number;
  prevRevenue: number;
}

function buildDailyBuckets(start: Date, end: Date, prevStart: Date, prevEnd: Date): Map<string, LedgerBucket> {
  const map = new Map<string, LedgerBucket>();
  const durationMs = end.getTime() - start.getTime();

  // Create bucket for every single calendar day from start to end
  const cur = new Date(start);
  while (cur <= end) {
    const dateStr = formatDateKey(cur);
    const prevDate = new Date(cur.getTime() - durationMs);
    const prevDateStr = formatDateKey(prevDate);

    map.set(dateStr, {
      date: dateStr,
      orders: 0,
      revenue: 0,
      discounts: 0,
      netRevenue: 0,
      commission: 0,
      vendorEarnings: 0,
      refundAmount: 0,
      gst: 0,
      shipping: 0,
      prevDate: prevDateStr,
      prevOrders: 0,
      prevRevenue: 0,
    });

    cur.setDate(cur.getDate() + 1);
  }

  return map;
}

// ── Revenue report ────────────────────────────────────────────────────────────
router.get("/admin/reports/revenue", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end, prevStart, prevEnd } = parsePeriod(
      period as string,
      from as string,
      to as string
    );

    const ordersCol = getCollection("orders");
    const settlementsCol = getCollection("vendor_settlements");

    // Retrieve all non-test orders in wide range
    const [allOrders, settlements] = await Promise.all([
      ordersCol.find({ isDemo: { $ne: true }, isTest: { $ne: true } }).toArray(),
      settlementsCol.find({}).toArray(),
    ]);

    const buckets = buildDailyBuckets(start, end, prevStart, prevEnd);

    let totalOrders = 0;
    let grossRevenue = 0;
    let totalDiscounts = 0;
    let netRevenue = 0;
    let platformCommission = 0;
    let vendorEarnings = 0;
    let refundAmount = 0;
    let taxCollected = 0;
    let shippingCollected = 0;

    let prevGrossRevenue = 0;
    let prevTotalOrders = 0;

    // Process current and previous period orders
    for (const o of allOrders) {
      const d = getDocDate(o, "createdAt");
      if (!d) continue;

      const fin = extractOrderFinancials(o);
      if (!fin.isEligibleOrder) continue;

      // Current Period
      if (d >= start && d <= end) {
        totalOrders += 1;
        grossRevenue += fin.gross;
        totalDiscounts += fin.discount;
        netRevenue += fin.net;
        platformCommission += fin.commission;
        vendorEarnings += fin.vendorEarnings;
        refundAmount += fin.refundAmount;
        taxCollected += fin.tax;
        shippingCollected += fin.shipping;

        const dateKey = formatDateKey(d);
        const b = buckets.get(dateKey);
        if (b) {
          b.orders += 1;
          b.revenue += fin.gross;
          b.discounts += fin.discount;
          b.netRevenue += fin.net;
          b.commission += fin.commission;
          b.vendorEarnings += fin.vendorEarnings;
          b.refundAmount += fin.refundAmount;
          b.gst += fin.tax;
          b.shipping += fin.shipping;
        }
      }

      // Prior Period
      if (d >= prevStart && d <= prevEnd) {
        prevTotalOrders += 1;
        prevGrossRevenue += fin.gross;

        // Shift prior date into matching current bucket
        const shifted = new Date(d.getTime() + (end.getTime() - start.getTime()));
        const shiftedKey = formatDateKey(shifted);
        const b = buckets.get(shiftedKey);
        if (b) {
          b.prevOrders += 1;
          b.prevRevenue += fin.gross;
        }
      }
    }

    // Reconcile commission with actual settlements if available in period
    const currentSettlements = settlements.filter((s: any) => {
      const sd = getDocDate(s, "createdAt");
      return sd && sd >= start && sd <= end && s.type === "order_settlement";
    });
    const settlementCommission = currentSettlements.reduce((acc: number, s: any) => {
      const rawC = Number(s.commission || 0);
      return acc + (rawC > 10000 ? Math.round(rawC / 100) : rawC);
    }, 0);
    if (settlementCommission > 0 && platformCommission === 0) {
      platformCommission = settlementCommission;
    }

    const growthPct =
      prevGrossRevenue > 0
        ? Math.round(((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 1000) / 10
        : 0;

    const avgOrderValue = totalOrders > 0 ? Math.round(grossRevenue / totalOrders) : 0;

    const summary = {
      totalOrders,
      grossRevenue,
      discounts: totalDiscounts,
      netRevenue,
      commission: platformCommission,
      vendorEarnings,
      refundAmount,
      taxCollected,
      shippingCollected,
      avgOrderValue,
      growthPct,
      prevRevenue: prevGrossRevenue,
      prevOrders: prevTotalOrders,
    };

    // Sort newest date first for daily ledger table
    const trend = Array.from(buckets.values());
    const prevTrend = trend.map((b) => ({
      date: b.prevDate,
      orders: b.prevOrders,
      revenue: b.prevRevenue,
    }));

    res.json({
      summary,
      trend,
      prevTrend,
    });
  } catch (err: any) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log?.error?.({ err }, "Revenue report failed");
    res.json({
      summary: {
        totalOrders: 0,
        grossRevenue: 0,
        discounts: 0,
        netRevenue: 0,
        commission: 0,
        vendorEarnings: 0,
        refundAmount: 0,
        taxCollected: 0,
        shippingCollected: 0,
        avgOrderValue: 0,
        growthPct: 0,
      },
      trend: [],
      prevTrend: [],
    });
  }
});

// ── Sales velocity report ─────────────────────────────────────────────────────
router.get("/admin/reports/sales", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to, page = "1", limit = "20", search = "" } = req.query;
    const { start, end, prevStart, prevEnd, days } = parsePeriod(
      period as string,
      from as string,
      to as string
    );
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);

    const ordersCol = getCollection("orders");
    const rawOrders = await ordersCol
      .find({ isDemo: { $ne: true }, isTest: { $ne: true } })
      .toArray();

    const buckets = buildDailyBuckets(start, end, prevStart, prevEnd);

    const currentOrders: any[] = [];
    let totalItemsSold = 0;
    let salesRevenue = 0;
    let prevSalesRevenue = 0;

    const categoryMap = new Map<string, { count: number; revenue: number }>();
    const paymentMethodMap = new Map<string, { count: number; amount: number }>();

    for (const o of rawOrders) {
      const d = getDocDate(o, "createdAt");
      if (!d) continue;

      const fin = extractOrderFinancials(o);
      if (!fin.isEligibleOrder) continue;

      if (d >= start && d <= end) {
        currentOrders.push(o);
        salesRevenue += fin.gross;

        const items = Array.isArray(o.items) ? o.items : [];
        const orderItemCount = items.reduce((sum: number, it: any) => sum + (Number(it.quantity) || 1), 0);
        totalItemsSold += orderItemCount;

        // Categories
        for (const it of items) {
          const cat = (it.category || (o as any).category || "Traditional Sarees").toLowerCase();
          const p = Number(it.price || it.basePrice || 0) * Number(it.quantity || 1);
          const curr = categoryMap.get(cat) || { count: 0, revenue: 0 };
          curr.count += Number(it.quantity || 1);
          curr.revenue += p;
          categoryMap.set(cat, curr);
        }

        // Payment Method
        const method = (o.paymentMethod || "cod").toLowerCase();
        const currPm = paymentMethodMap.get(method) || { count: 0, amount: 0 };
        currPm.count += 1;
        currPm.amount += fin.gross;
        paymentMethodMap.set(method, currPm);

        const dateKey = formatDateKey(d);
        const b = buckets.get(dateKey);
        if (b) {
          b.orders += 1;
          b.revenue += fin.gross;
        }
      }

      if (d >= prevStart && d <= prevEnd) {
        prevSalesRevenue += fin.gross;

        const shifted = new Date(d.getTime() + (end.getTime() - start.getTime()));
        const shiftedKey = formatDateKey(shifted);
        const b = buckets.get(shiftedKey);
        if (b) {
          b.prevOrders += 1;
          b.prevRevenue += fin.gross;
        }
      }
    }

    const totalOrders = currentOrders.length;
    const avgOrderValue = totalOrders > 0 ? Math.round(salesRevenue / totalOrders) : 0;
    const ordersPerDay = Number((totalOrders / days).toFixed(1));
    const ordersPerWeek = Number(((totalOrders / days) * 7).toFixed(1));
    const ordersPerMonth = Number(((totalOrders / days) * 30).toFixed(1));
    const revenuePerDay = Math.round(salesRevenue / days);
    const growthPct =
      prevSalesRevenue > 0
        ? Math.round(((salesRevenue - prevSalesRevenue) / prevSalesRevenue) * 1000) / 10
        : 0;

    // Peak sales day
    let peakDay: any = null;
    let maxRev = 0;
    for (const b of buckets.values()) {
      if (b.revenue > maxRev) {
        maxRev = b.revenue;
        peakDay = { date: b.date, orders: b.orders, revenue: b.revenue };
      }
    }

    const byCategory = Array.from(categoryMap.entries()).map(([category, val]) => ({
      category,
      count: val.count,
      revenue: val.revenue,
    }));

    const byPaymentMethod = Array.from(paymentMethodMap.entries()).map(([method, val]) => ({
      method,
      count: val.count,
      amount: val.amount,
    }));

    // Filter and paginate order list
    const q = (search as string).toLowerCase().trim();
    const filteredOrders = currentOrders
      .sort((a, b) => (getDocDate(b)?.getTime() || 0) - (getDocDate(a)?.getTime() || 0))
      .filter((o) => {
        if (!q) return true;
        const id = String(o.id || o.displayId || o._id).toLowerCase();
        const status = String(o.status || "").toLowerCase();
        const method = String(o.paymentMethod || "").toLowerCase();
        return id.includes(q) || status.includes(q) || method.includes(q);
      });

    const total = filteredOrders.length;
    const offset = (pageNum - 1) * limitNum;
    const ordersList = filteredOrders.slice(offset, offset + limitNum).map((o) => {
      const items = Array.isArray(o.items) ? o.items : [];
      const itemCount = items.reduce((s: number, it: any) => s + (Number(it.quantity) || 1), 0);
      const fin = extractOrderFinancials(o);
      const od = getDocDate(o, "createdAt") || new Date();
      return {
        id: o.displayId || o.id || String(o._id),
        date: formatDateKey(od),
        total: fin.gross,
        status: o.status || "confirmed",
        paymentMethod: o.paymentMethod || "cod",
        itemCount,
      };
    });

    const trend = Array.from(buckets.values());
    const prevTrend = trend.map((b) => ({
      date: b.prevDate,
      orders: b.prevOrders,
      revenue: b.prevRevenue,
    }));

    res.json({
      summary: {
        totalOrders,
        totalItemsSold,
        salesRevenue,
        avgOrderValue,
        ordersPerDay,
        ordersPerWeek,
        ordersPerMonth,
        revenuePerDay,
        growthPct,
        peakDay,
      },
      byCategory,
      byPaymentMethod,
      trend,
      prevTrend,
      orders: ordersList,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    });
  } catch (err: any) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log?.error?.({ err }, "Sales report failed");
    res.json({
      summary: {
        totalOrders: 0,
        totalItemsSold: 0,
        salesRevenue: 0,
        avgOrderValue: 0,
        ordersPerDay: 0,
        ordersPerWeek: 0,
        ordersPerMonth: 0,
        revenuePerDay: 0,
        growthPct: 0,
        peakDay: null,
      },
      byCategory: [],
      byPaymentMethod: [],
      trend: [],
      prevTrend: [],
      orders: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });
  }
});

// ── Vendor performance report ─────────────────────────────────────────────────
router.get("/admin/reports/vendors", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end } = parsePeriod(period as string, from as string, to as string);

    const sellersCol = getCollection("sellers");
    const vendorsCol = getCollection("vendors");
    const settlementsCol = getCollection("vendor_settlements");
    const ordersCol = getCollection("orders");

    const [sellers, rawVendors, settlements, orders] = await Promise.all([
      sellersCol.find({}).toArray(),
      vendorsCol.find({}).toArray(),
      settlementsCol.find({}).toArray(),
      ordersCol.find({ isDemo: { $ne: true }, isTest: { $ne: true } }).toArray(),
    ]);

    // Consolidate unique vendors
    const vendorMap = new Map<string, any>();
    const allVendors = [...sellers, ...rawVendors];

    for (const v of allVendors) {
      const primaryId = String(v.vendorId || v.sellerId || v.id || v._id || "");
      if (!primaryId) continue;
      if (!vendorMap.has(primaryId)) {
        vendorMap.set(primaryId, {
          ...v,
          primaryId,
          aliases: new Set(
            [
              primaryId,
              v.id,
              v.vendorId,
              v.sellerId,
              v.ownerId,
              v.userId,
              v._id ? String(v._id) : null,
              v.shopName,
              v.name,
            ]
              .filter(Boolean)
              .map((x: any) => String(x).toLowerCase())
          ),
          settlementCount: 0,
          totalRevenue: 0,
          commission: 0,
          netPayout: 0,
          pendingSettlements: 0,
          completedSettlements: 0,
          orderCount: 0,
          returnsCount: 0,
          cancellationsCount: 0,
        });
      }
    }

    // Process orders in period for vendor statistics
    for (const o of orders) {
      const d = getDocDate(o, "createdAt");
      if (!d || d < start || d > end) continue;

      const isCancelled = o.status === "cancelled";
      const isReturn = o.status === "return_requested" || o.status === "return_approved" || o.status === "returned";
      const fin = extractOrderFinancials(o);

      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const itemVendorId = String(it.vendorId || it.sellerId || (o as any).vendorId || "").toLowerCase();
        let matched: any = null;

        for (const vs of vendorMap.values()) {
          if (vs.aliases.has(itemVendorId)) {
            matched = vs;
            break;
          }
        }

        if (matched) {
          if (isCancelled) {
            matched.cancellationsCount += 1;
          } else if (fin.isEligibleOrder) {
            matched.orderCount += 1;
            const itemGross = Number(it.price || it.basePrice || 0) * Number(it.quantity || 1);
            matched.totalRevenue += itemGross;
            const itemComm = it.platformCommission
              ? (Number(it.platformCommission) > itemGross ? Number(it.platformCommission) / 100 : Number(it.platformCommission))
              : Math.round(itemGross * 0.18);
            matched.commission += itemComm;
            matched.netPayout += Math.max(0, itemGross - itemComm);
          }
          if (isReturn) {
            matched.returnsCount += 1;
          }
        }
      }
    }

    // Reconcile with settlements
    let totalPendingSettlementAmount = 0;
    let totalCompletedSettlementAmount = 0;
    let totalPendingCount = 0;
    let totalCompletedCount = 0;

    for (const s of settlements) {
      const sd = getDocDate(s, "createdAt");
      const isPeriod = sd && sd >= start && sd <= end;

      const status = String(s.status || "").toLowerCase();
      const rawAmt = Number(s.netPayout ?? s.amount ?? 0);
      const amount = rawAmt > 100000 ? Math.round(rawAmt / 100) : rawAmt;
      const rawComm = Number(s.commission || 0);
      const commission = rawComm > 10000 ? Math.round(rawComm / 100) : rawComm;

      const isPending = ["pending", "processing", "eligible", "approved"].includes(status);
      const isCompleted = ["completed", "paid"].includes(status);

      if (isPending) {
        totalPendingCount += 1;
        totalPendingSettlementAmount += amount;
      }
      if (isCompleted) {
        totalCompletedCount += 1;
        totalCompletedSettlementAmount += amount;
      }

      if (isPeriod) {
        const sVendorId = String(s.vendorId || "").toLowerCase();
        let matched: any = null;
        for (const vs of vendorMap.values()) {
          if (vs.aliases.has(sVendorId)) {
            matched = vs;
            break;
          }
        }
        if (matched) {
          matched.settlementCount += 1;
          if (isPending) matched.pendingSettlements += 1;
          if (isCompleted) matched.completedSettlements += 1;
          // If vendor had no orders in items, use settlement values
          if (matched.totalRevenue === 0) {
            matched.totalRevenue += amount + commission;
            matched.commission += commission;
            matched.netPayout += amount;
          }
        }
      }
    }

    const uniqueVendorsList = Array.from(vendorMap.values());
    const totalVendors = uniqueVendorsList.length;
    const activeVendors = uniqueVendorsList.filter(
      (v) => v.status === "approved" || (!v.status && v.shopName)
    ).length;
    const pendingVendors = uniqueVendorsList.filter((v) => v.status === "pending").length;
    const suspendedVendors = uniqueVendorsList.filter((v) => v.status === "suspended").length;

    const topVendors = uniqueVendorsList
      .map((v) => {
        const totalOrders = v.orderCount + v.cancellationsCount;
        const cancellationRate =
          totalOrders > 0 ? Math.round((v.cancellationsCount / totalOrders) * 1000) / 10 : 0;
        return {
          vendorId: v.primaryId,
          vendorName: v.shopName || v.name || v.sellerName || "Artisan Boutique",
          settlementCount: v.settlementCount,
          orderCount: v.orderCount,
          totalRevenue: v.totalRevenue,
          commission: v.commission,
          netPayout: v.netPayout,
          pendingSettlements: v.pendingSettlements,
          completedSettlements: v.completedSettlements,
          returnsCount: v.returnsCount,
          cancellationRate,
        };
      })
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 20);

    res.json({
      summary: {
        totalVendors,
        activeVendors,
        pendingVendors,
        suspendedVendors,
      },
      topVendors,
      settlementSummary: {
        pendingCount: totalPendingCount,
        completedCount: totalCompletedCount,
        pendingAmount: totalPendingSettlementAmount,
        completedAmount: totalCompletedSettlementAmount,
      },
    });
  } catch (err: any) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log?.error?.({ err }, "Vendor report failed");
    res.json({
      summary: { totalVendors: 0, activeVendors: 0, pendingVendors: 0, suspendedVendors: 0 },
      topVendors: [],
      settlementSummary: { pendingCount: 0, completedCount: 0, pendingAmount: 0, completedAmount: 0 },
    });
  }
});

// ── Customer insights report ──────────────────────────────────────────────────
router.get("/admin/reports/customers", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end } = parsePeriod(period as string, from as string, to as string);

    const usersCol = getCollection("users");
    const ordersCol = getCollection("orders");

    const [allUsers, allOrders] = await Promise.all([
      usersCol.find({}).toArray(),
      ordersCol.find({ isDemo: { $ne: true }, isTest: { $ne: true } }).toArray(),
    ]);

    // Build user profile lookup
    const userProfileMap = new Map<string, any>();
    for (const u of allUsers) {
      const uid = String(u.id || u.email || u._id);
      userProfileMap.set(uid, u);
      if (u.email) userProfileMap.set(String(u.email).toLowerCase(), u);
    }

    const totalRegisteredCustomers = allUsers.filter(
      (u) => u.role === "customer" || (!u.role && !u.shopName)
    ).length;

    // Track lifetime first order dates
    const customerLifetimeFirstOrder = new Map<string, Date>();
    for (const o of allOrders) {
      const d = getDocDate(o, "createdAt");
      if (!d) continue;
      const fin = extractOrderFinancials(o);
      if (!fin.isEligibleOrder) continue;

      const uid = String(o.userId || o.customerEmail || o.address?.email || "").toLowerCase();
      if (!uid) continue;

      const existing = customerLifetimeFirstOrder.get(uid);
      if (!existing || d < existing) {
        customerLifetimeFirstOrder.set(uid, d);
      }
    }

    // Process orders in period
    const currentCustomerStats = new Map<
      string,
      { count: number; spend: number; name: string; email: string }
    >();
    const dailyCustomerBuckets = new Map<string, { customers: Set<string>; orders: number }>();

    // Initialize daily map
    const cur = new Date(start);
    while (cur <= end) {
      dailyCustomerBuckets.set(formatDateKey(cur), { customers: new Set(), orders: 0 });
      cur.setDate(cur.getDate() + 1);
    }

    let totalCustomerOrders = 0;
    let newCustomersCount = 0;
    let returningCustomersCount = 0;

    for (const o of allOrders) {
      const d = getDocDate(o, "createdAt");
      if (!d || d < start || d > end) continue;

      const fin = extractOrderFinancials(o);
      if (!fin.isEligibleOrder) continue;

      const uid = String(o.userId || o.customerEmail || o.address?.email || "guest").toLowerCase();
      totalCustomerOrders += 1;

      const userDoc = userProfileMap.get(uid);
      const name = userDoc?.name || o.address?.name || o.customerName || "Customer";
      const email = userDoc?.email || o.customerEmail || o.address?.email || uid;

      const curr = currentCustomerStats.get(uid) || { count: 0, spend: 0, name, email };
      curr.count += 1;
      curr.spend += fin.gross;
      currentCustomerStats.set(uid, curr);

      const dateKey = formatDateKey(d);
      const bucket = dailyCustomerBuckets.get(dateKey);
      if (bucket) {
        bucket.customers.add(uid);
        bucket.orders += 1;
      }
    }

    const uniqueCustomersInPeriod = currentCustomerStats.size;
    for (const uid of currentCustomerStats.keys()) {
      const firstDate = customerLifetimeFirstOrder.get(uid);
      if (firstDate && firstDate < start) {
        returningCustomersCount += 1;
      } else {
        newCustomersCount += 1;
      }
    }

    const totalSpend = Array.from(currentCustomerStats.values()).reduce((s, c) => s + c.spend, 0);
    const avgSpend = uniqueCustomersInPeriod > 0 ? Math.round(totalSpend / uniqueCustomersInPeriod) : 0;
    const avgOrdersPerCustomer =
      uniqueCustomersInPeriod > 0
        ? Math.round((totalCustomerOrders / uniqueCustomersInPeriod) * 10) / 10
        : 0;
    const repeatPurchaseRate =
      uniqueCustomersInPeriod > 0
        ? Math.round((returningCustomersCount / uniqueCustomersInPeriod) * 1000) / 10
        : 0;

    const trend = Array.from(dailyCustomerBuckets.entries()).map(([date, val]) => ({
      date,
      customers: val.customers.size,
      orders: val.orders,
    }));

    const topCustomers = Array.from(currentCustomerStats.entries())
      .map(([userId, val]) => ({
        userId,
        name: val.name,
        email: val.email,
        totalOrders: val.count,
        totalSpend: val.spend,
        avgSpend: Math.round(val.spend / val.count),
      }))
      .sort((a, b) => b.totalSpend - a.totalSpend)
      .slice(0, 20);

    res.json({
      summary: {
        totalCustomers: totalRegisteredCustomers,
        customersInPeriod: uniqueCustomersInPeriod,
        newCustomers: newCustomersCount,
        returningCustomers: returningCustomersCount,
        repeatPurchaseRate,
        totalCustomerOrders,
        avgSpend,
        avgOrdersPerCustomer,
      },
      trend,
      topCustomers,
    });
  } catch (err: any) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log?.error?.({ err }, "Customer report failed");
    res.json({
      summary: {
        totalCustomers: 0,
        customersInPeriod: 0,
        newCustomers: 0,
        returningCustomers: 0,
        repeatPurchaseRate: 0,
        totalCustomerOrders: 0,
        avgSpend: 0,
        avgOrdersPerCustomer: 0,
      },
      trend: [],
      topCustomers: [],
    });
  }
});

// ── Product analytics report ──────────────────────────────────────────────────
router.get("/admin/reports/products", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end } = parsePeriod(period as string, from as string, to as string);

    const productsCol = getCollection("products");
    const ordersCol = getCollection("orders");
    const wishlistsCol = getCollection("wishlists");

    const [products, orders, wishlists] = await Promise.all([
      productsCol.find({}).toArray(),
      ordersCol.find({ isDemo: { $ne: true }, isTest: { $ne: true } }).toArray(),
      wishlistsCol.find({}).toArray(),
    ]);

    const total = products.length;
    const active = products.filter((p) => p.active && p.status !== "rejected").length;
    const pending = products.filter((p) => p.status === "pending").length;
    const rejected = products.filter((p) => p.status === "rejected").length;
    const featured = products.filter((p) => p.isFeatured).length;
    const lowStock = products.filter(
      (p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.lowStockThreshold || 5)
    ).length;
    const outOfStock = products.filter((p) => (p.stock || 0) <= 0).length;

    // Track sales per product in the period
    const productSalesMap = new Map<
      string,
      { units: number; revenue: number; name: string; category: string; vendorName: string }
    >();

    for (const p of products) {
      const pid = String(p.productId || p.id || p._id);
      productSalesMap.set(pid, {
        units: 0,
        revenue: 0,
        name: p.name || p.title || "Traditional Saree",
        category: p.categoryName || p.category || "Paithani",
        vendorName: p.vendorName || "Artisan Boutique",
      });
    }

    const categorySalesMap = new Map<string, { count: number; unitsSold: number; revenue: number }>();

    for (const o of orders) {
      const d = getDocDate(o, "createdAt");
      if (!d || d < start || d > end) continue;

      const fin = extractOrderFinancials(o);
      if (!fin.isEligibleOrder) continue;

      const items = Array.isArray(o.items) ? o.items : [];
      for (const it of items) {
        const pid = String(it.productId || it.id || "");
        const units = Number(it.quantity || 1);
        const itemGross = Number(it.price || it.basePrice || 0) * units;

        const stat = productSalesMap.get(pid);
        if (stat) {
          stat.units += units;
          stat.revenue += itemGross;
        } else {
          productSalesMap.set(pid, {
            units,
            revenue: itemGross,
            name: it.name || "Handcrafted Saree",
            category: it.category || "Paithani",
            vendorName: it.vendorName || "Artisan Boutique",
          });
        }

        const cat = (it.category || stat?.category || "traditional").toLowerCase();
        const currCat = categorySalesMap.get(cat) || { count: 0, unitsSold: 0, revenue: 0 };
        currCat.count += 1;
        currCat.unitsSold += units;
        currCat.revenue += itemGross;
        categorySalesMap.set(cat, currCat);
      }
    }

    const allProductSales = Array.from(productSalesMap.entries()).map(([productId, val]) => ({
      productId,
      name: val.name,
      category: val.category,
      vendorName: val.vendorName,
      unitsSold: val.units,
      revenue: val.revenue,
    }));

    const bestSellers = allProductSales
      .filter((p) => p.unitsSold > 0)
      .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
      .slice(0, 15);

    const lowestSellers = allProductSales
      .sort((a, b) => a.unitsSold - b.unitsSold || a.revenue - b.revenue)
      .slice(0, 10);

    // Paithani & Designer specific category analytics
    let paithaniUnits = 0;
    let paithaniRevenue = 0;
    let designerUnits = 0;
    let designerRevenue = 0;

    for (const [cat, val] of categorySalesMap.entries()) {
      if (cat.includes("paithani")) {
        paithaniUnits += val.unitsSold;
        paithaniRevenue += val.revenue;
      }
      if (cat.includes("designer") || cat.includes("bollywood")) {
        designerUnits += val.unitsSold;
        designerRevenue += val.revenue;
      }
    }

    const categoryHighlights = {
      paithani: {
        name: "Paithani Sarees",
        unitsSold: paithaniUnits,
        revenue: paithaniRevenue,
        activeProducts: products.filter((p) => String(p.category || "").toLowerCase().includes("paithani")).length,
      },
      designer: {
        name: "Designer Sarees",
        unitsSold: designerUnits,
        revenue: designerRevenue,
        activeProducts: products.filter((p) => String(p.category || "").toLowerCase().includes("designer")).length,
      },
    };

    const byCategory = Array.from(categorySalesMap.entries()).map(([category, val]) => ({
      category,
      count: val.count,
      unitsSold: val.unitsSold,
      revenue: val.revenue,
    }));

    // Wishlist counts
    const wishlistCountMap = new Map<string, number>();
    for (const w of wishlists) {
      const pid = String(w.productId || "");
      if (pid) {
        wishlistCountMap.set(pid, (wishlistCountMap.get(pid) || 0) + 1);
      }
    }

    const mostWishlisted = Array.from(wishlistCountMap.entries())
      .map(([productId, wishlistCount]) => {
        const prod = products.find((p) => String(p.productId || p.id || p._id) === productId);
        return {
          productId,
          name: prod?.name || prod?.title || "Royal Saree",
          category: prod?.category || "Paithani",
          wishlistCount,
        };
      })
      .sort((a, b) => b.wishlistCount - a.wishlistCount)
      .slice(0, 10);

    // Low stock list
    const lowStockList = products
      .filter((p) => (p.stock || 0) > 0 && (p.stock || 0) <= (p.lowStockThreshold || 5))
      .slice(0, 20)
      .map((p) => ({
        id: p.id || p.productId || String(p._id),
        name: p.name || p.title,
        stock: p.stock || 0,
        threshold: p.lowStockThreshold || 5,
        category: p.category || "Sarees",
        vendorName: p.vendorName || "Artisan Boutique",
      }));

    res.json({
      summary: {
        total,
        active,
        pending,
        rejected,
        featured,
        lowStock,
        outOfStock,
      },
      categoryHighlights,
      bestSellers,
      lowestSellers,
      byCategory,
      mostWishlisted,
      lowStockList,
    });
  } catch (err: any) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log?.error?.({ err }, "Product report failed");
    res.json({
      summary: { total: 0, active: 0, pending: 0, rejected: 0, featured: 0, lowStock: 0, outOfStock: 0 },
      categoryHighlights: {
        paithani: { name: "Paithani", unitsSold: 0, revenue: 0, activeProducts: 0 },
        designer: { name: "Designer", unitsSold: 0, revenue: 0, activeProducts: 0 },
      },
      bestSellers: [],
      lowestSellers: [],
      byCategory: [],
      mostWishlisted: [],
      lowStockList: [],
    });
  }
});

// ── Returns & refunds report ──────────────────────────────────────────────────
router.get("/admin/reports/returns", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end } = parsePeriod(period as string, from as string, to as string);

    const ordersCol = getCollection("orders");
    const rawOrders = await ordersCol
      .find({ isDemo: { $ne: true }, isTest: { $ne: true } })
      .toArray();

    const returnBuckets = new Map<string, { returnRequests: number; refunds: number }>();
    const cur = new Date(start);
    while (cur <= end) {
      returnBuckets.set(formatDateKey(cur), { returnRequests: 0, refunds: 0 });
      cur.setDate(cur.getDate() + 1);
    }

    let totalEligibleOrders = 0;
    let totalReturnRequests = 0;
    let approvedReturns = 0;
    let rejectedReturns = 0;
    let pendingReturns = 0;
    let completedReturns = 0;
    let refundRequests = 0;
    let completedRefunds = 0;
    let totalRefundAmount = 0;
    let pendingRefundAmount = 0;

    const returnReasonsMap = new Map<string, number>();
    const returnedProductsMap = new Map<string, { count: number; name: string; category: string }>();
    const vendorReturnsMap = new Map<string, { count: number; vendorName: string }>();
    const recentReturnsList: any[] = [];

    for (const o of rawOrders) {
      const d = getDocDate(o, "createdAt");
      if (!d || d < start || d > end) continue;

      if (o.status !== "cancelled") totalEligibleOrders += 1;

      const isReturnRequested =
        o.status === "return_requested" ||
        (Array.isArray(o.statusHistory) && o.statusHistory.some((h: any) => h.status === "return_requested"));

      const isReturnApproved =
        o.status === "return_approved" ||
        (Array.isArray(o.statusHistory) && o.statusHistory.some((h: any) => h.status === "return_approved"));

      const isReturnRejected =
        o.status === "return_rejected" ||
        (Array.isArray(o.statusHistory) && o.statusHistory.some((h: any) => h.status === "return_rejected"));

      const isCompleted = o.status === "returned";

      const hasRefundRequest = Boolean(o.refundStatus);
      const isRefundCompleted = ["approved", "completed", "processed"].includes(
        String(o.refundStatus || "").toLowerCase()
      );
      const isRefundPending = String(o.refundStatus || "").toLowerCase() === "pending";

      if (isReturnRequested || hasRefundRequest) {
        if (isReturnRequested) totalReturnRequests += 1;
        if (isReturnApproved) approvedReturns += 1;
        if (isReturnRejected) rejectedReturns += 1;
        if (o.status === "return_requested") pendingReturns += 1;
        if (isCompleted) completedReturns += 1;

        if (hasRefundRequest) refundRequests += 1;
        if (isRefundCompleted) {
          completedRefunds += 1;
          totalRefundAmount += Number(o.refundAmount || o.total || 0);
        }
        if (isRefundPending) {
          pendingRefundAmount += Number(o.refundAmount || o.total || 0);
        }

        // Daily trend
        const dateKey = formatDateKey(d);
        const b = returnBuckets.get(dateKey);
        if (b) {
          if (isReturnRequested) b.returnRequests += 1;
          if (isRefundCompleted) b.refunds += 1;
        }

        // Return reason parsing (supports JSON string or plain text)
        let reasonStr = "Quality / specification mismatch";
        if (o.returnReason) {
          try {
            const parsed = JSON.parse(o.returnReason);
            reasonStr = parsed.reason || parsed.note || o.returnReason;
          } catch {
            reasonStr = String(o.returnReason);
          }
        }
        returnReasonsMap.set(reasonStr, (returnReasonsMap.get(reasonStr) || 0) + 1);

        // Product & Vendor grouping
        const items = Array.isArray(o.items) ? o.items : [];
        for (const it of items) {
          const pid = String(it.productId || it.id || "item");
          const pStat = returnedProductsMap.get(pid) || {
            count: 0,
            name: it.name || "Handcrafted Saree",
            category: it.category || "Paithani",
          };
          pStat.count += 1;
          returnedProductsMap.set(pid, pStat);

          const vid = String(it.vendorId || (o as any).vendorId || "artisan");
          const vStat = vendorReturnsMap.get(vid) || {
            count: 0,
            vendorName: it.vendorName || "Artisan Boutique",
          };
          vStat.count += 1;
          vendorReturnsMap.set(vid, vStat);
        }

        recentReturnsList.push({
          orderId: o.displayId || o.id || String(o._id),
          date: formatDateKey(d),
          total: Number(o.total || 0),
          status: o.status || "return_requested",
          returnReason: reasonStr,
          refundStatus: o.refundStatus || (isRefundCompleted ? "completed" : isRefundPending ? "pending" : null),
          refundDate: o.refundProcessedAt ? formatDateKey(new Date(o.refundProcessedAt)) : null,
        });
      }
    }

    const returnRate =
      totalEligibleOrders > 0
        ? Math.round((totalReturnRequests / totalEligibleOrders) * 1000) / 10
        : 0;

    const byReason = Array.from(returnReasonsMap.entries()).map(([reason, count]) => ({
      reason,
      count,
    }));

    const topReturnedProducts = Array.from(returnedProductsMap.entries()).map(([productId, val]) => ({
      productId,
      name: val.name,
      category: val.category,
      returnCount: val.count,
    }));

    const vendorReturns = Array.from(vendorReturnsMap.entries()).map(([vendorId, val]) => ({
      vendorId,
      vendorName: val.vendorName,
      returnCount: val.count,
    }));

    const trend = Array.from(returnBuckets.entries()).map(([date, val]) => ({
      date,
      returnRequests: val.returnRequests,
      refunds: val.refunds,
    }));

    res.json({
      summary: {
        totalReturnRequests,
        approvedReturns,
        rejectedReturns,
        pendingReturns,
        completedReturns,
        refundRequests,
        completedRefunds,
        refundAmount: totalRefundAmount,
        pendingRefundAmount,
        returnRate,
      },
      byReason,
      trend,
      recentReturns: recentReturnsList.slice(0, 30),
      topReturnedProducts,
      vendorReturns,
    });
  } catch (err: any) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log?.error?.({ err }, "Return report failed");
    res.json({
      summary: {
        totalReturnRequests: 0,
        approvedReturns: 0,
        rejectedReturns: 0,
        pendingReturns: 0,
        completedReturns: 0,
        refundRequests: 0,
        completedRefunds: 0,
        refundAmount: 0,
        pendingRefundAmount: 0,
        returnRate: 0,
      },
      byReason: [],
      trend: [],
      recentReturns: [],
      topReturnedProducts: [],
      vendorReturns: [],
    });
  }
});

export default router;
