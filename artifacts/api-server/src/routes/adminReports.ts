import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdminKey } from "../middlewares/isAdmin";

const router = Router();

// ── Period validation ─────────────────────────────────────────────────────────
const VALID_PERIODS = new Set(["today", "7d", "30d", "monthly", "quarterly", "yearly", "custom"]);

class PeriodError extends Error {
  readonly statusCode = 400;
  constructor(period: string) {
    super(`Invalid period "${period}". Must be one of: today, 7d, 30d, monthly, quarterly, yearly, custom`);
  }
}

// ── Period helper ─────────────────────────────────────────────────────────────
function parsePeriod(period: string, from?: string, to?: string) {
  const now = new Date();
  let start: Date;
  let end: Date = new Date();
  end.setHours(23, 59, 59, 999);

  switch (period) {
    case "today":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case "7d":
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
      break;
    case "monthly":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarterly": {
      const q = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), q * 3, 1);
      break;
    }
    case "yearly":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    case "custom":
      start = from ? new Date(from) : new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
      if (to) { end = new Date(to); end.setHours(23, 59, 59, 999); }
      break;
    default:
      if (!VALID_PERIODS.has(period)) throw new PeriodError(period);
      // Fallback for "30d" (already handled above but kept for safety)
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
  }
  // Ensure start is always start-of-day for rolling periods
  if (period !== "custom") start.setHours(0, 0, 0, 0);

  const duration = Math.max(end.getTime() - start.getTime(), 86400000);
  const prevEnd = new Date(start);
  const prevStart = new Date(start.getTime() - duration);
  const days = duration / 86400000;
  // Allowlisted groupBy values — used as SQL literal fragments, never as bind params
  const groupBy: "day" | "week" | "month" = days > 90 ? "month" : days > 14 ? "week" : "day";

  return { start, end, prevStart, prevEnd, groupBy };
}

// Build a date_trunc SQL fragment with a literal (not parameterised) unit.
// groupBy is always one of our three allowlisted strings.
function truncSql(groupBy: "day" | "week" | "month", col: string) {
  if (groupBy === "month") return sql.raw(`date_trunc('month', ${col})`);
  if (groupBy === "week")  return sql.raw(`date_trunc('week',  ${col})`);
  return sql.raw(`date_trunc('day', ${col})`);
}

/**
 * Build a single aligned period-over-period comparison query.
 *
 * Strategy:
 *   1. The prior period is [prevStart, start) — the same elapsed duration as
 *      [start, end], ending strictly before the current period starts.
 *      parsePeriod() computes prevStart = start - duration  (D = start - prevStart).
 *
 *   2. Current-period buckets are generated via
 *        generate_series(trunc(start), trunc(end), interval)   (calendar-aligned).
 *      Each bucket i spans: [b_i, b_i + 1 unit).
 *
 *   3. Prior bucket i is defined by an **explicit range join**:
 *        prior orders with  created_at ∈ [b_i - D,  b_i + 1 unit - D)
 *      This maps every prior order to exactly one bucket — the one whose
 *      calendar window, when shifted back by the period duration, contains
 *      the order. No date_trunc is applied to prior orders, so orders at
 *      week/month boundaries are never split across two buckets.
 *
 *   4. The guard  AND o.created_at ∈ [prevStart, start)  ensures we only
 *      count orders in the prior period even if the shifted bucket range
 *      extends slightly beyond that window at the edges.
 *
 *   5. The prev_date label for current bucket b_i is  (b_i - D)::date.
 *
 * Returns exactly N rows — one per current-period bucket — with both current
 * and prior revenue/orders embedded.
 *
 * groupBy is allowlisted to "day"|"week"|"month" — safe to embed as sql.raw.
 */
function alignedComparisonSql(
  groupBy: "day" | "week" | "month",
  start: Date,
  end: Date,
  prevStart: Date,
) {
  const u = groupBy; // already allowlisted — never user-supplied
  return sql`
    WITH current_buckets AS (
      SELECT
        gs                                                                AS bucket_start,
        gs + ${sql.raw(`'1 ${u}'::interval`)}                             AS bucket_end,
        gs::date                                                          AS bucket,
        (row_number() OVER (ORDER BY gs) - 1)::int                        AS idx
      FROM generate_series(
        ${sql.raw(`date_trunc('${u}',`)} ${start}::timestamptz),
        ${sql.raw(`date_trunc('${u}',`)} ${end}::timestamptz),
        ${sql.raw(`'1 ${u}'::interval`)}
      ) AS gs
    ),
    current_agg AS (
      SELECT ${sql.raw(`date_trunc('${u}',`)} created_at)::date AS bucket,
             count(*)::int                                AS orders,
             coalesce(sum(total), 0)::bigint              AS revenue
      FROM   orders
      WHERE  created_at >= ${start} AND created_at <= ${end}
      GROUP  BY 1
    ),
    prior_agg AS (
      -- Explicit range join: prior bucket i covers orders in
      --   [b_i - D,  b_i + 1 unit - D)   where D = start − prevStart.
      -- Each prior order maps to exactly one bucket — no date_trunc splitting
      -- at week/month boundaries when D is not a whole multiple of the unit.
      SELECT
        cb.bucket,
        count(o.id)::int                                  AS orders,
        coalesce(sum(o.total), 0)::bigint                 AS revenue
      FROM   current_buckets cb
      LEFT   JOIN orders o
             ON  o.created_at >= cb.bucket_start - (${start}::timestamptz - ${prevStart}::timestamptz)
             AND o.created_at <  cb.bucket_end   - (${start}::timestamptz - ${prevStart}::timestamptz)
             AND o.created_at >= ${prevStart}
             AND o.created_at <  ${start}::timestamptz
      GROUP  BY cb.bucket
    )
    SELECT
      cb.bucket::text                                                        AS date,
      coalesce(ca.orders,  0)::int                                           AS orders,
      coalesce(ca.revenue, 0)::bigint                                        AS revenue,
      (cb.bucket_start - (${start}::timestamptz - ${prevStart}::timestamptz))::date::text
                                                                             AS prev_date,
      coalesce(pa.orders,  0)::int                                           AS prev_orders,
      coalesce(pa.revenue, 0)::bigint                                        AS prev_revenue
    FROM   current_buckets cb
    LEFT   JOIN current_agg ca ON ca.bucket = cb.bucket
    LEFT   JOIN prior_agg   pa ON pa.bucket = cb.bucket
    ORDER  BY cb.idx
  `;
}

function rows(result: any): any[] {
  return result?.rows ?? [];
}
function row(result: any): any {
  return rows(result)[0] ?? {};
}

// ── Revenue report ────────────────────────────────────────────────────────────
router.get("/admin/reports/revenue", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end, prevStart, prevEnd, groupBy } = parsePeriod(
      period as string, from as string, to as string,
    );

    const [summaryRes, prevRes, commRes] = await Promise.all([
      db.execute(sql`
        SELECT
          count(*)::int                                                                             AS total_orders,
          coalesce(sum(total), 0)::bigint                                                           AS gross_revenue,
          coalesce(sum(tax), 0)::bigint                                                             AS tax_collected,
          coalesce(sum(shipping), 0)::bigint                                                        AS shipping_collected,
          coalesce(avg(total), 0)::int                                                              AS avg_order_value,
          coalesce(sum(CASE WHEN refund_status IN ('approved','completed','processed') THEN total ELSE 0 END), 0)::bigint
                                                                                                   AS refund_amount
        FROM orders
        WHERE created_at >= ${start} AND created_at <= ${end}
      `),
      db.execute(sql`
        SELECT coalesce(sum(total), 0)::bigint AS gross_revenue
        FROM orders WHERE created_at >= ${prevStart} AND created_at < ${start}::timestamptz
      `),
      db.execute(sql`
        SELECT
          coalesce(sum(commission), 0)::bigint  AS commission,
          coalesce(sum(net_payout), 0)::bigint  AS vendor_earnings
        FROM vendor_settlements
        WHERE created_at >= ${start} AND created_at <= ${end}
          AND type = 'order_settlement' AND commission IS NOT NULL
      `),
    ]);

    const s = row(summaryRes);
    const prev = row(prevRes);
    const comm = row(commRes);
    const gross = Number(s.gross_revenue ?? 0);
    const prevGross = Number(prev.gross_revenue ?? 0);
    const refund = Number(s.refund_amount ?? 0);
    const commission = Number(comm.commission ?? 0);
    const vendorEarnings = Number(comm.vendor_earnings ?? 0);
    const growthPct = prevGross > 0 ? Math.round(((gross - prevGross) / prevGross) * 1000) / 10 : 0;

    // Single aligned query: N current buckets + N prior buckets at the same
    // relative elapsed position. Both series are guaranteed identical-length.
    const compRes = await db.execute(alignedComparisonSql(groupBy, start, end, prevStart));
    const compRows = rows(compRes);

    res.json({
      summary: {
        totalOrders: Number(s.total_orders ?? 0),
        grossRevenue: gross,
        netRevenue: gross - refund,
        commission,
        vendorEarnings: vendorEarnings || Math.max(0, gross - commission - refund),
        refundAmount: refund,
        taxCollected: Number(s.tax_collected ?? 0),
        shippingCollected: Number(s.shipping_collected ?? 0),
        avgOrderValue: Number(s.avg_order_value ?? 0),
        growthPct,
      },
      trend: compRows.map((r) => ({
        date: r.date, orders: Number(r.orders), revenue: Number(r.revenue),
      })),
      prevTrend: compRows.map((r) => ({
        date: r.prev_date, orders: Number(r.prev_orders), revenue: Number(r.prev_revenue),
      })),
    });
  } catch (err) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log.error({ err }, "Revenue report failed");
    res.status(500).json({ error: "Failed to fetch revenue report" });
  }
});

// ── Sales report ──────────────────────────────────────────────────────────────
router.get("/admin/reports/sales", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to, page = "1", limit = "20" } = req.query;
    const { start, end, prevStart, groupBy } = parsePeriod(period as string, from as string, to as string);
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(100, parseInt(limit as string) || 20);
    const offset = (pageNum - 1) * limitNum;

    const [summaryRes, byCatRes, byMethodRes, totalRes, ordersRes] = await Promise.all([
      db.execute(sql`
        SELECT
          count(*)::int                                     AS total_orders,
          coalesce(sum(total), 0)::bigint                   AS sales_revenue,
          coalesce(avg(total), 0)::int                      AS avg_order_value,
          coalesce(sum(jsonb_array_length(items)::bigint), 0) AS total_items_sold
        FROM orders WHERE created_at >= ${start} AND created_at <= ${end}
      `),
      // Join to products so deleted/re-categorised products still surface correctly.
      // item snapshot stores productId but not category; p.category is the live value,
      // 'unknown' is the fallback when the product no longer exists.
      db.execute(sql`
        SELECT
          coalesce(p.category, 'unknown')                   AS category,
          count(*)::int                                     AS cnt,
          coalesce(sum((item->>'price')::numeric * (item->>'quantity')::numeric), 0)::bigint AS revenue
        FROM orders
        CROSS JOIN jsonb_array_elements(orders.items) AS item
        LEFT JOIN products p ON p.id::text = (item->>'productId')
        WHERE orders.created_at >= ${start} AND orders.created_at <= ${end}
        GROUP BY 1 ORDER BY revenue DESC
      `),
      db.execute(sql`
        SELECT payment_method AS method, count(*)::int AS cnt,
          coalesce(sum(total), 0)::bigint AS amount
        FROM orders WHERE created_at >= ${start} AND created_at <= ${end}
        GROUP BY 1 ORDER BY amount DESC
      `),
      db.execute(sql`
        SELECT count(*)::int AS total FROM orders
        WHERE created_at >= ${start} AND created_at <= ${end}
      `),
      db.execute(sql`
        SELECT id, created_at::date::text AS date, total, status,
          payment_method, jsonb_array_length(items) AS item_count
        FROM orders WHERE created_at >= ${start} AND created_at <= ${end}
        ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}
      `),
    ]);

    // Single aligned query: N current buckets + N prior buckets at the same
    // relative elapsed position. Both series are guaranteed identical-length.
    const compRes = await db.execute(alignedComparisonSql(groupBy, start, end, prevStart));
    const compRows = rows(compRes);

    const s = row(summaryRes);
    const total = Number(row(totalRes).total ?? 0);

    res.json({
      summary: {
        totalOrders: Number(s.total_orders ?? 0),
        totalItemsSold: Number(s.total_items_sold ?? 0),
        salesRevenue: Number(s.sales_revenue ?? 0),
        avgOrderValue: Number(s.avg_order_value ?? 0),
      },
      byCategory: rows(byCatRes).map((r) => ({
        category: r.category, count: Number(r.cnt), revenue: Number(r.revenue),
      })),
      byPaymentMethod: rows(byMethodRes).map((r) => ({
        method: r.method, count: Number(r.cnt), amount: Number(r.amount),
      })),
      trend: compRows.map((r) => ({
        date: r.date, orders: Number(r.orders), revenue: Number(r.revenue),
      })),
      prevTrend: compRows.map((r) => ({
        date: r.prev_date, orders: Number(r.prev_orders), revenue: Number(r.prev_revenue),
      })),
      orders: rows(ordersRes).map((r) => ({
        id: r.id, date: r.date, total: Number(r.total), status: r.status,
        paymentMethod: r.payment_method, itemCount: Number(r.item_count),
      })),
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log.error({ err }, "Sales report failed");
    res.status(500).json({ error: "Failed to fetch sales report" });
  }
});

// ── Vendor report ─────────────────────────────────────────────────────────────
router.get("/admin/reports/vendors", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end } = parsePeriod(period as string, from as string, to as string);

    const [vendorCountsRes, topVendorsRes, settlementRes] = await Promise.all([
      db.execute(sql`
        SELECT
          count(*)::int                                       AS total,
          count(*) filter (WHERE status = 'approved')::int   AS active,
          count(*) filter (WHERE status = 'pending')::int    AS pending,
          count(*) filter (WHERE status = 'suspended')::int  AS suspended
        FROM vendors
      `),
      db.execute(sql`
        SELECT
          vs.vendor_id::text,
          coalesce(v.name, 'Unknown')                         AS vendor_name,
          count(*)::int                                       AS settlement_count,
          coalesce(sum(vs.product_amount), 0)::bigint         AS total_revenue,
          coalesce(sum(vs.commission), 0)::bigint             AS commission,
          coalesce(sum(vs.net_payout), 0)::bigint             AS net_payout,
          count(*) filter (WHERE vs.status = 'pending')::int  AS pending_settlements
        FROM vendor_settlements vs
        LEFT JOIN vendors v ON vs.vendor_id = v.id
        WHERE vs.created_at >= ${start} AND vs.created_at <= ${end}
          AND vs.type = 'order_settlement'
        GROUP BY vs.vendor_id, v.name
        ORDER BY total_revenue DESC LIMIT 15
      `),
      db.execute(sql`
        SELECT
          count(*) filter (WHERE status IN ('pending','processing'))::int    AS pending_count,
          count(*) filter (WHERE status IN ('completed','paid'))::int        AS completed_count,
          coalesce(sum(net_payout) filter (WHERE status IN ('pending','processing')), 0)::bigint AS pending_amount,
          coalesce(sum(net_payout) filter (WHERE status IN ('completed','paid')), 0)::bigint     AS completed_amount
        FROM vendor_settlements
        WHERE created_at >= ${start} AND created_at <= ${end}
      `),
    ]);

    const vc = row(vendorCountsRes);
    const ss = row(settlementRes);

    res.json({
      summary: {
        totalVendors: Number(vc.total ?? 0),
        activeVendors: Number(vc.active ?? 0),
        pendingVendors: Number(vc.pending ?? 0),
        suspendedVendors: Number(vc.suspended ?? 0),
      },
      topVendors: rows(topVendorsRes).map((r) => ({
        vendorId: r.vendor_id, vendorName: r.vendor_name,
        settlementCount: Number(r.settlement_count),
        totalRevenue: Number(r.total_revenue), commission: Number(r.commission),
        netPayout: Number(r.net_payout), pendingSettlements: Number(r.pending_settlements),
      })),
      settlementSummary: {
        pendingCount: Number(ss.pending_count ?? 0),
        completedCount: Number(ss.completed_count ?? 0),
        pendingAmount: Number(ss.pending_amount ?? 0),
        completedAmount: Number(ss.completed_amount ?? 0),
      },
    });
  } catch (err) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log.error({ err }, "Vendor report failed");
    res.status(500).json({ error: "Failed to fetch vendor report" });
  }
});

// ── Customer report ───────────────────────────────────────────────────────────
router.get("/admin/reports/customers", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end, groupBy } = parsePeriod(period as string, from as string, to as string);

    const [summaryRes, newRes, topRes] = await Promise.all([
      db.execute(sql`
        SELECT
          count(DISTINCT user_id)::int         AS total_customers,
          coalesce(avg(spend), 0)::int         AS avg_spend,
          coalesce(avg(cnt), 0)::numeric(10,2) AS avg_orders_per_customer
        FROM (
          SELECT user_id, count(*) AS cnt, sum(total) AS spend
          FROM orders WHERE created_at >= ${start} AND created_at <= ${end}
          GROUP BY user_id
        ) sub
      `),
      db.execute(sql`
        SELECT count(DISTINCT user_id)::int AS new_customers
        FROM orders o
        WHERE created_at >= ${start} AND created_at <= ${end}
          AND NOT EXISTS (
            SELECT 1 FROM orders o2
            WHERE o2.user_id = o.user_id AND o2.created_at < ${start}
          )
      `),
      db.execute(sql`
        SELECT user_id, count(*)::int AS total_orders,
          sum(total)::bigint AS total_spend, avg(total)::int AS avg_spend
        FROM orders WHERE created_at >= ${start} AND created_at <= ${end}
        GROUP BY user_id ORDER BY total_spend DESC LIMIT 20
      `),
    ]);

    const trunc = truncSql(groupBy, "created_at");
    const trendRes = await db.execute(sql`
      SELECT ${trunc}::date::text AS date,
        count(*)::int AS orders, count(DISTINCT user_id)::int AS customers
      FROM orders WHERE created_at >= ${start} AND created_at <= ${end}
      GROUP BY 1 ORDER BY 1
    `);

    const s = row(summaryRes);
    const totalCustomers = Number(s.total_customers ?? 0);
    const newCustomers = Number(row(newRes).new_customers ?? 0);

    res.json({
      summary: {
        totalCustomers,
        newCustomers,
        returningCustomers: Math.max(0, totalCustomers - newCustomers),
        avgSpend: Number(s.avg_spend ?? 0),
        avgOrdersPerCustomer: parseFloat(String(s.avg_orders_per_customer ?? "0")),
      },
      trend: rows(trendRes).map((r) => ({
        date: r.date, orders: Number(r.orders), customers: Number(r.customers),
      })),
      topCustomers: rows(topRes).map((r) => ({
        userId: r.user_id, totalOrders: Number(r.total_orders),
        totalSpend: Number(r.total_spend), avgSpend: Number(r.avg_spend),
      })),
    });
  } catch (err) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log.error({ err }, "Customer report failed");
    res.status(500).json({ error: "Failed to fetch customer report" });
  }
});

// ── Product report ────────────────────────────────────────────────────────────
router.get("/admin/reports/products", requireAdminKey, async (req: any, res: any) => {
  try {
    // Products endpoint groups by static product status — no date_trunc needed
    const { period = "30d", from, to } = req.query;
    const { start, end } = parsePeriod(period as string, from as string, to as string);

    const [productCountsRes, bestSellersRes, wishlistRes, byCatRes, lowStockRes] = await Promise.all([
      db.execute(sql`
        SELECT
          count(*)::int                                                             AS total,
          count(*) filter (WHERE active = true)::int                               AS active,
          count(*) filter (WHERE status = 'pending')::int                          AS pending,
          count(*) filter (WHERE status = 'rejected')::int                         AS rejected,
          count(*) filter (WHERE is_featured = true)::int                          AS featured,
          count(*) filter (WHERE stock > 0 AND stock <= low_stock_threshold)::int  AS low_stock,
          count(*) filter (WHERE stock = 0)::int                                   AS out_of_stock
        FROM products
      `),
      // Best sellers: join products for live category (not stored in item snapshot).
      // Group by productId only; aggregate name/category/vendorName with max()
      // so a deleted product falls back to the snapshot values.
      db.execute(sql`
        SELECT
          item->>'productId'                                    AS product_id,
          max(coalesce(p.name,        item->>'name'))           AS name,
          max(coalesce(p.category,    'unknown'))               AS category,
          max(coalesce(p.vendor_name, item->>'vendorName'))     AS vendor_name,
          sum((item->>'quantity')::int)::int                    AS units_sold,
          sum((item->>'price')::numeric * (item->>'quantity')::numeric)::bigint AS revenue
        FROM orders
        CROSS JOIN jsonb_array_elements(orders.items) AS item
        LEFT JOIN products p ON p.id::text = (item->>'productId')
        WHERE orders.created_at >= ${start} AND orders.created_at <= ${end}
        GROUP BY item->>'productId'
        ORDER BY units_sold DESC LIMIT 10
      `),
      db.execute(sql`
        SELECT w.product_id, p.name, p.category, count(*)::int AS wishlist_count
        FROM wishlists w LEFT JOIN products p ON p.id = w.product_id
        GROUP BY w.product_id, p.name, p.category
        ORDER BY wishlist_count DESC LIMIT 10
      `),
      db.execute(sql`
        SELECT category, count(*)::int AS cnt FROM products GROUP BY category ORDER BY cnt DESC
      `),
      db.execute(sql`
        SELECT id, name, stock, low_stock_threshold AS threshold, category, vendor_name
        FROM products WHERE stock > 0 AND stock <= low_stock_threshold
        ORDER BY stock ASC LIMIT 20
      `),
    ]);

    const pc = row(productCountsRes);

    res.json({
      summary: {
        total: Number(pc.total ?? 0), active: Number(pc.active ?? 0),
        pending: Number(pc.pending ?? 0), rejected: Number(pc.rejected ?? 0),
        featured: Number(pc.featured ?? 0),
        lowStock: Number(pc.low_stock ?? 0), outOfStock: Number(pc.out_of_stock ?? 0),
      },
      bestSellers: rows(bestSellersRes).map((r) => ({
        productId: r.product_id, name: r.name, category: r.category,
        vendorName: r.vendor_name, unitsSold: Number(r.units_sold), revenue: Number(r.revenue),
      })),
      mostWishlisted: rows(wishlistRes).map((r) => ({
        productId: r.product_id, name: r.name, category: r.category,
        wishlistCount: Number(r.wishlist_count),
      })),
      byCategory: rows(byCatRes).map((r) => ({ category: r.category, count: Number(r.cnt) })),
      lowStockList: rows(lowStockRes).map((r) => ({
        id: r.id, name: r.name, stock: Number(r.stock), threshold: Number(r.threshold),
        category: r.category, vendorName: r.vendor_name,
      })),
    });
  } catch (err) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log.error({ err }, "Product report failed");
    res.status(500).json({ error: "Failed to fetch product report" });
  }
});

// ── Return report ─────────────────────────────────────────────────────────────
// Return-status events are derived from status_history JSONB (each entry has
// { status, timestamp } where timestamp is an immutable ISO string recorded
// when the status transition occurred). This is the only accurate event time —
// updated_at changes on every order mutation, not just return transitions.
// Completed-refund events continue to use coalesce(refund_processed_at, updated_at)
// because refunds are tracked via the refundStatus field, not status_history.
router.get("/admin/reports/returns", requireAdminKey, async (req: any, res: any) => {
  try {
    const { period = "30d", from, to } = req.query;
    const { start, end, groupBy } = parsePeriod(period as string, from as string, to as string);

    // Note: status values are written as SQL string literals directly in the template
    // (not as bind parameters) because they are compile-time constants. Drizzle only
    // parameterises ${variable} interpolations, not string literals in the template body.

    const [summaryRes, totalOrdersRes, byReasonRes, recentRes, topProductsRes] = await Promise.all([

      // KPI counts: use status_history timestamp for return events
      db.execute(sql`
        SELECT
          count(DISTINCT o.id) FILTER (WHERE entry->>'status' = 'return_requested')::int
            AS total_return_requests,
          count(DISTINCT o.id) FILTER (WHERE entry->>'status' IN ('return_approved','returned'))::int
            AS approved_returns,
          count(DISTINCT o.id) FILTER (WHERE entry->>'status' = 'return_rejected')::int
            AS rejected_returns
        FROM orders o,
          jsonb_array_elements(o.status_history) AS entry
        WHERE entry->>'status' IN ('return_requested','return_approved','return_rejected','returned')
          AND (entry->>'timestamp')::timestamptz >= ${start}
          AND (entry->>'timestamp')::timestamptz <= ${end}
      `),

      // Total orders placed in the period for return-rate denominator
      db.execute(sql`
        SELECT count(*)::int AS total_orders FROM orders
        WHERE created_at >= ${start} AND created_at <= ${end}
      `),

      // Return reasons — from orders that had return_requested in the period
      db.execute(sql`
        SELECT coalesce(o.return_reason, 'Not specified') AS reason,
          count(DISTINCT o.id)::int AS cnt
        FROM orders o,
          jsonb_array_elements(o.status_history) AS entry
        WHERE entry->>'status' = 'return_requested'
          AND (entry->>'timestamp')::timestamptz >= ${start}
          AND (entry->>'timestamp')::timestamptz <= ${end}
        GROUP BY 1 ORDER BY cnt DESC
      `),

      // Recent return events — most recent status_history return entry per order
      db.execute(sql`
        SELECT DISTINCT ON (o.id)
          o.id,
          (entry->>'timestamp')::date::text                       AS date,
          o.total,
          o.status,
          o.return_reason,
          o.refund_status,
          o.refund_processed_at::date::text                       AS refund_date
        FROM orders o,
          jsonb_array_elements(o.status_history) AS entry
        WHERE entry->>'status' IN ('return_requested','return_approved','return_rejected','returned')
          AND (entry->>'timestamp')::timestamptz >= ${start}
          AND (entry->>'timestamp')::timestamptz <= ${end}
        ORDER BY o.id, (entry->>'timestamp')::timestamptz DESC
        LIMIT 30
      `),

      // Top returned products — CTE finds distinct returned orders; then join items
      // and products for live category (not stored in item snapshot).
      db.execute(sql`
        WITH returned_orders AS (
          SELECT DISTINCT o.id, o.items
          FROM orders o,
            jsonb_array_elements(o.status_history) AS entry
          WHERE entry->>'status' = 'return_requested'
            AND (entry->>'timestamp')::timestamptz >= ${start}
            AND (entry->>'timestamp')::timestamptz <= ${end}
        )
        SELECT
          item->>'productId'                            AS product_id,
          max(coalesce(p.name,     item->>'name'))      AS name,
          max(coalesce(p.category, 'unknown'))          AS category,
          count(*)::int                                 AS return_count
        FROM returned_orders
        CROSS JOIN jsonb_array_elements(returned_orders.items) AS item
        LEFT JOIN products p ON p.id::text = (item->>'productId')
        GROUP BY item->>'productId'
        ORDER BY return_count DESC LIMIT 10
      `),
    ]);

    // Refund KPIs keyed to refund_processed_at (not return_requested timestamp)
    const refundRes = await db.execute(sql`
      SELECT
        count(*)::int AS refund_requests,
        count(*) FILTER (WHERE refund_status IN ('approved','completed','processed'))::int AS completed_refunds,
        coalesce(
          sum(total) FILTER (WHERE refund_status IN ('approved','completed','processed')),
          0
        )::bigint AS refund_amount
      FROM orders
      WHERE refund_status IS NOT NULL
        AND coalesce(refund_processed_at, updated_at) >= ${start}
        AND coalesce(refund_processed_at, updated_at) <= ${end}
    `);

    // Trend: UNION two streams, each keyed to its accurate event timestamp.
    // Stream 1: return_requested events — status_history timestamp
    // Stream 2: completed-refund events — refund_processed_at (or updated_at)
    const truncEntry = truncSql(groupBy, "(entry->>'timestamp')::timestamptz");
    const truncRef   = truncSql(groupBy, "coalesce(refund_processed_at, updated_at)");
    const trendRes = await db.execute(sql`
      SELECT date, sum(return_request)::int AS return_requests, sum(refund)::int AS refunds
      FROM (
        SELECT
          ${truncEntry}::date::text AS date,
          1 AS return_request,
          0 AS refund
        FROM orders o,
          jsonb_array_elements(o.status_history) AS entry
        WHERE entry->>'status' = 'return_requested'
          AND (entry->>'timestamp')::timestamptz >= ${start}
          AND (entry->>'timestamp')::timestamptz <= ${end}
        UNION ALL
        SELECT
          ${truncRef}::date::text AS date,
          0 AS return_request,
          1 AS refund
        FROM orders
        WHERE refund_status IN ('approved','completed','processed')
          AND coalesce(refund_processed_at, updated_at) >= ${start}
          AND coalesce(refund_processed_at, updated_at) <= ${end}
      ) sub
      GROUP BY date ORDER BY date
    `);

    const s  = row(summaryRes);
    const rf = row(refundRes);
    const totalOrders  = Number(row(totalOrdersRes).total_orders ?? 1);
    const totalReturns = Number(s.total_return_requests ?? 0);
    const returnRate   = totalOrders > 0
      ? Math.round((totalReturns / totalOrders) * 1000) / 10
      : 0;

    res.json({
      summary: {
        totalReturnRequests: totalReturns,
        approvedReturns:     Number(s.approved_returns  ?? 0),
        rejectedReturns:     Number(s.rejected_returns  ?? 0),
        refundRequests:      Number(rf.refund_requests  ?? 0),
        completedRefunds:    Number(rf.completed_refunds ?? 0),
        refundAmount:        Number(rf.refund_amount     ?? 0),
        returnRate,
      },
      byReason: rows(byReasonRes).map((r) => ({ reason: r.reason, count: Number(r.cnt) })),
      trend: rows(trendRes).map((r) => ({
        date: r.date,
        returnRequests: Number(r.return_requests),
        refunds:        Number(r.refunds),
      })),
      recentReturns: rows(recentRes).map((r) => ({
        orderId:      r.id,
        date:         r.date,
        total:        Number(r.total),
        status:       r.status,
        returnReason: r.return_reason,
        refundStatus: r.refund_status,
        refundDate:   r.refund_date,
      })),
      topReturnedProducts: rows(topProductsRes).map((r) => ({
        productId:   r.product_id,
        name:        r.name,
        category:    r.category,
        returnCount: Number(r.return_count),
      })),
    });
  } catch (err) {
    if (err instanceof PeriodError) return res.status(400).json({ error: err.message });
    req.log.error({ err }, "Return report failed");
    res.status(500).json({ error: "Failed to fetch return report" });
  }
});

export default router;
