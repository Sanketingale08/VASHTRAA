/**
 * weeklyAdminReport.ts
 *
 * Background worker that fires every Monday at 09:00 (server local time) and
 * emails the Super Admin a summary of the COMPLETED prior week's KPIs.
 *
 * Reporting period
 * ─────────────────
 * At 09:00 Monday, "the past week" is the calendar week that just finished:
 *   start  = previous Monday  00:00:00.000 (= today − 7 days, start of day)
 *   end    = yesterday (Sunday) 23:59:59.999
 *
 * Schedule algorithm
 * ───────────────────
 * An interval ticks every 5 minutes. On each tick it checks:
 *   1. Is it Monday?
 *   2. Is the hour 09?
 *   3. Has the weekly_report_last_sent_week setting in site_settings already
 *      been set to this ISO week key (e.g. "2026-W33")?
 * If 1 and 2 pass but 3 says it's already been sent, the tick is skipped.
 *
 * Durability / concurrency safety
 * ────────────────────────────────
 * The "sent this week" state is persisted to site_settings so that process
 * restarts within the 09:xx window do NOT re-send the email. Multiple API
 * instances are handled by an atomic conditional upsert that only writes when
 * the stored value differs from the current week key; the first instance to
 * commit claims the week and subsequent instances see 0 affected rows and skip.
 *
 * Retry semantics
 * ───────────────
 * - If the KPI query fails: we do NOT claim the week, so the next 5-minute
 *   tick within the 09:xx window will retry the full sequence.
 * - If the Resend send fails: the week is already claimed (to prevent
 *   duplicates). The failure is logged for manual follow-up. The admin will
 *   receive the report the following week.
 *
 * Recipient
 * ─────────
 * The `admin_email` value stored in site_settings (set via Admin → Settings →
 * Profile). Falls back to the SUPER_ADMIN_EMAIL env var. If neither is set the
 * worker logs a warning and skips without claiming the week.
 */

import { Resend } from "resend";
import { db, siteSettingsTable, eq, sql } from "@workspace/db";
import { logger } from "../lib/logger";

// ── Constants ─────────────────────────────────────────────────────────────────

const APP_NAME = "VASTRAA";
const FROM_ADDRESS = "orders@vastraa.com";

/** site_settings key used to persist the last-sent ISO week. */
export const LAST_SENT_WEEK_KEY = "weekly_report_last_sent_week";

// ── Helpers ───────────────────────────────────────────────────────────────────

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function getAdminEmail(): Promise<string | null> {
  try {
    const [row] = await db
      .select({ value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(eq(siteSettingsTable.key, "admin_email"));
    if (row?.value) return row.value;
  } catch {
    // fall through to env fallback
  }
  return process.env.SUPER_ADMIN_EMAIL ?? null;
}

/**
 * Returns an ISO 8601 week key string such as "2026-W33".
 *
 * Uses the Thursday-of-the-week method to determine the ISO week year:
 * the ISO year of a date is the year of the Thursday in the same Mon–Sun week.
 * This correctly handles year-end dates that belong to the first week of the
 * next year (e.g., Dec 31 2025 → "2026-W01") and early-January dates that
 * belong to the last week of the prior year.
 */
export function isoWeekKey(d: Date): string {
  // Move to the Thursday of the same week (Mon-based: Mon=0 … Sun=6)
  const monBasedDay = (d.getDay() + 6) % 7; // 0=Mon … 6=Sun
  const thu = new Date(d);
  thu.setDate(d.getDate() + (3 - monBasedDay)); // Thu is at Mon-offset 3

  // The ISO year is the year of that Thursday
  const isoYear = thu.getFullYear();

  // Week 1 starts on the Monday of the week containing Jan 4 of the ISO year
  const jan4 = new Date(isoYear, 0, 4);
  const startOfWeek1 = new Date(jan4);
  startOfWeek1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));

  const diffMs = d.getTime() - startOfWeek1.getTime();
  const week = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

/**
 * Returns the reporting period for the week that just ended when this function
 * is called on a Monday. `start` is the prior Monday at 00:00, `end` is
 * yesterday (Sunday) at 23:59:59.999.
 */
export function getCompletedWeekPeriod(now: Date): { start: Date; end: Date } {
  // end = yesterday 23:59:59.999
  const end = new Date(now);
  end.setDate(now.getDate() - 1);
  end.setHours(23, 59, 59, 999);

  // start = 6 days before end (= prior Monday), beginning of day
  const start = new Date(end);
  start.setDate(end.getDate() - 6);
  start.setHours(0, 0, 0, 0);

  return { start, end };
}

/**
 * Reads the last-sent week from site_settings. Returns null if not set.
 */
export async function readLastSentWeek(): Promise<string | null> {
  const [row] = await db
    .select({ value: siteSettingsTable.value })
    .from(siteSettingsTable)
    .where(eq(siteSettingsTable.key, LAST_SENT_WEEK_KEY));
  return row?.value ?? null;
}

/**
 * Atomically claims this week's send slot.
 *
 * Uses an INSERT … ON CONFLICT DO UPDATE … WHERE that only applies the update
 * when the stored value differs from the target week. Returns true when this
 * instance successfully claimed the slot; returns false when another instance
 * already did (0 rows affected).
 */
export async function claimWeek(weekKey: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO site_settings (key, value, updated_at)
    VALUES (${LAST_SENT_WEEK_KEY}, ${weekKey}, now())
    ON CONFLICT (key) DO UPDATE
      SET value      = EXCLUDED.value,
          updated_at = now()
      WHERE site_settings.value IS DISTINCT FROM EXCLUDED.value
    RETURNING key
  `);
  const claimed = (result?.rows ?? []).length > 0;
  return claimed;
}

function rows(result: any): any[] {
  return result?.rows ?? [];
}
function row(result: any): any {
  return rows(result)[0] ?? {};
}

// ── KPI query ─────────────────────────────────────────────────────────────────

export interface WeeklyKpis {
  grossRevenue: number;
  totalOrders: number;
  newCustomers: number;
  lowStockCount: number;
  /** Return rate as a percentage, e.g. 4.5 = 4.5 % */
  returnRate: number;
  pendingSettlementAmount: number;
  periodStart: string; // ISO date, e.g. "2026-08-10"
  periodEnd: string;   // ISO date, e.g. "2026-08-16"
}

export async function fetchWeeklyKpis(now: Date): Promise<WeeklyKpis> {
  const { start, end } = getCompletedWeekPeriod(now);

  const [revenueRes, newCustRes, lowStockRes, returnsRes, settlementRes] = await Promise.all([
    // Revenue & order count for the completed week
    db.execute(sql`
      SELECT
        coalesce(sum(total), 0)::bigint AS gross_revenue,
        count(*)::int                   AS total_orders
      FROM orders
      WHERE created_at >= ${start} AND created_at <= ${end}
    `),

    // New customers: users whose very first order falls in this period
    db.execute(sql`
      SELECT count(DISTINCT user_id)::int AS new_customers
      FROM orders o
      WHERE created_at >= ${start} AND created_at <= ${end}
        AND NOT EXISTS (
          SELECT 1 FROM orders o2
          WHERE o2.user_id = o.user_id AND o2.created_at < ${start}
        )
    `),

    // Low-stock product count (snapshot at time of report)
    db.execute(sql`
      SELECT count(*)::int AS low_stock_count
      FROM products
      WHERE stock > 0 AND stock <= low_stock_threshold
    `),

    // Return requests initiated during the period (via immutable status_history timestamps)
    db.execute(sql`
      SELECT count(DISTINCT o.id)::int AS return_requests
      FROM orders o,
        jsonb_array_elements(o.status_history) AS entry
      WHERE entry->>'status' = 'return_requested'
        AND (entry->>'timestamp')::timestamptz >= ${start}
        AND (entry->>'timestamp')::timestamptz <= ${end}
    `),

    // Pending vendor settlements (total balance outstanding, not period-specific)
    db.execute(sql`
      SELECT coalesce(sum(net_payout), 0)::bigint AS pending_amount
      FROM vendor_settlements
      WHERE status IN ('pending', 'processing')
    `),
  ]);

  const rev  = row(revenueRes);
  const cust = row(newCustRes);
  const ls   = row(lowStockRes);
  const ret  = row(returnsRes);
  const sett = row(settlementRes);

  const totalOrders    = Number(rev.total_orders    ?? 0);
  const returnRequests = Number(ret.return_requests ?? 0);
  const returnRate     = totalOrders > 0
    ? Math.round((returnRequests / totalOrders) * 1000) / 10
    : 0;

  return {
    grossRevenue:            Number(rev.gross_revenue   ?? 0),
    totalOrders,
    newCustomers:            Number(cust.new_customers  ?? 0),
    lowStockCount:           Number(ls.low_stock_count  ?? 0),
    returnRate,
    pendingSettlementAmount: Number(sett.pending_amount ?? 0),
    periodStart: start.toISOString().split("T")[0]!,
    periodEnd:   end.toISOString().split("T")[0]!,
  };
}

// ── HTML template ─────────────────────────────────────────────────────────────

function wrapInTemplate(subject: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:32px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          <tr>
            <td style="background:#7c3aed;padding:24px 32px;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;">${APP_NAME}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;color:#333333;font-size:15px;line-height:1.6;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="background:#f9f9f9;padding:16px 32px;border-top:1px solid #eeeeee;color:#888888;font-size:13px;text-align:center;">
              &copy; ${new Date().getFullYear()} ${APP_NAME}. All rights reserved.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function inr(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

export function buildReportEmail(kpis: WeeklyKpis): { subject: string; html: string } {
  const subject = `Weekly Marketplace Report — ${kpis.periodStart} to ${kpis.periodEnd}`;

  const body = `
    <p>Hi Admin,</p>
    <p>Here is your weekly marketplace summary for <strong>${kpis.periodStart}</strong> to <strong>${kpis.periodEnd}</strong>.</p>

    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:24px 0;">
      <tr style="background:#7c3aed;color:#ffffff;">
        <td style="padding:10px 16px;font-weight:700;font-size:14px;">Metric</td>
        <td style="padding:10px 16px;font-weight:700;font-size:14px;text-align:right;">Value</td>
      </tr>
      <tr style="background:#f9f5ff;">
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;">Total Revenue</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;text-align:right;font-weight:600;">${inr(kpis.grossRevenue)}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;">Total Orders</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;text-align:right;font-weight:600;">${kpis.totalOrders.toLocaleString("en-IN")}</td>
      </tr>
      <tr style="background:#f9f5ff;">
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;">New Customers</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;text-align:right;font-weight:600;">${kpis.newCustomers.toLocaleString("en-IN")}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;">Return Rate</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;text-align:right;font-weight:600;">${kpis.returnRate}%</td>
      </tr>
      <tr style="background:#f9f5ff;">
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;">Low-Stock Products</td>
        <td style="padding:10px 16px;border-bottom:1px solid #eeeeee;font-size:14px;text-align:right;font-weight:600;">${kpis.lowStockCount.toLocaleString("en-IN")}</td>
      </tr>
      <tr>
        <td style="padding:10px 16px;font-size:14px;">Pending Settlements</td>
        <td style="padding:10px 16px;font-size:14px;text-align:right;font-weight:600;">${inr(kpis.pendingSettlementAmount)}</td>
      </tr>
    </table>

    <p style="margin:24px 0;">
      <a href="https://vastraa.com/admin/reports"
         style="background:#7c3aed;color:#ffffff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600;display:inline-block;">
        View Full Reports
      </a>
    </p>

    <p style="color:#888888;font-size:13px;">This is an automated weekly summary sent every Monday at 9 AM. The recipient address is set in Admin → Settings → Profile.</p>
  `;

  return { subject, html: wrapInTemplate(subject, body) };
}

// ── Worker ────────────────────────────────────────────────────────────────────

/** Dependency-injectable operations — production defaults are used when omitted. */
export interface WorkerDeps {
  /** Read the last-sent ISO week from persistent storage. */
  readLastSentWeek?: () => Promise<string | null>;
  /** Atomically claim this week's send slot; returns false if another instance already did. */
  claimWeek?: (weekKey: string) => Promise<boolean>;
  /** Resolve the admin recipient email. */
  getAdminEmail?: () => Promise<string | null>;
  /** Fetch 7-day KPI data for the report. */
  fetchWeeklyKpis?: (now: Date) => Promise<WeeklyKpis>;
  /** Send the composed email. */
  sendEmail?: (opts: { to: string; subject: string; html: string }) => Promise<void>;
}

/**
 * Starts the weekly admin report worker.
 *
 * @param checkIntervalMs  How often the worker polls for Monday 09:xx.
 *                         Defaults to 5 minutes; pass a smaller value in tests.
 * @param getNow           Clock injection for tests; defaults to `() => new Date()`.
 * @param deps             Optional overrides for each I/O operation (for unit tests).
 */
export function startWeeklyAdminReportWorker(
  checkIntervalMs = 5 * 60 * 1000,
  getNow: () => Date = () => new Date(),
  deps: WorkerDeps = {},
): void {
  const _readLastSentWeek  = deps.readLastSentWeek  ?? readLastSentWeek;
  const _claimWeek         = deps.claimWeek         ?? claimWeek;
  const _getAdminEmail     = deps.getAdminEmail     ?? getAdminEmail;
  const _fetchWeeklyKpis   = deps.fetchWeeklyKpis   ?? fetchWeeklyKpis;

  const _sendEmail = deps.sendEmail ?? (async (opts) => {
    const resend = getResendClient();
    if (!resend) throw new Error("RESEND_API_KEY not set");
    await resend.emails.send({
      from: `${APP_NAME} <${FROM_ADDRESS}>`,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    });
  });

  const run = async () => {
    const now = getNow();
    const dayOfWeek = now.getDay(); // 0=Sun 1=Mon … 6=Sat
    const hour      = now.getHours();

    // Only proceed on Monday between 09:00 and 09:59 (server local time)
    if (dayOfWeek !== 1 || hour !== 9) return;

    const thisWeek = isoWeekKey(now);

    // Fast pre-check against DB so we avoid fetching KPIs on restarts within the hour
    const lastSent = await _readLastSentWeek();
    if (lastSent === thisWeek) return;

    logger.info({ week: thisWeek }, "[weeklyAdminReport] Preparing weekly marketplace summary");

    const toEmail = await _getAdminEmail();
    if (!toEmail) {
      logger.warn("[weeklyAdminReport] No admin_email in site_settings or SUPER_ADMIN_EMAIL env — skipping");
      return; // do NOT claim; will retry on next tick when email is configured
    }

    // Verify Resend is available before doing expensive KPI work (production default only)
    if (!deps.sendEmail) {
      const apiKey = process.env.RESEND_API_KEY;
      if (!apiKey) {
        logger.warn("[weeklyAdminReport] RESEND_API_KEY not set — skipping weekly report email");
        return; // do NOT claim; will retry on next tick
      }
    }

    // Fetch KPIs. If this fails, do NOT claim so the next tick within the hour retries.
    let kpis: WeeklyKpis;
    try {
      kpis = await _fetchWeeklyKpis(now);
    } catch (err) {
      logger.error({ err }, "[weeklyAdminReport] KPI query failed — will retry on next tick within the hour");
      return;
    }

    // Atomically claim this week's send slot. If another instance already did it,
    // _claimWeek returns false and we bail without sending a duplicate.
    const claimed = await _claimWeek(thisWeek);
    if (!claimed) {
      logger.info({ week: thisWeek }, "[weeklyAdminReport] Week already claimed by another instance — skipping");
      return;
    }

    // We own this week's send. Build and send the email.
    const { subject, html } = buildReportEmail(kpis);

    try {
      await _sendEmail({ to: toEmail, subject, html });
      logger.info({ week: thisWeek, to: toEmail }, "[weeklyAdminReport] Weekly summary sent successfully");
    } catch (err) {
      // Week is already claimed — we cannot retry without risking a duplicate.
      // Log for manual follow-up; the admin will receive the report next week.
      logger.error(
        { err, week: thisWeek, to: toEmail },
        "[weeklyAdminReport] Send failed — week is already claimed, manual follow-up required"
      );
    }
  };

  // Run once at startup (handles restarts within the Monday 09:xx window)
  // then on a recurring interval. The scheduling guard inside run() ensures
  // the email is only sent on Monday at 09:xx and never twice in the same week.
  run().catch((err) => logger.error({ err }, "[weeklyAdminReport] Error in initial worker run"));
  setInterval(() => {
    run().catch((err) => logger.error({ err }, "[weeklyAdminReport] Unexpected error in worker tick"));
  }, checkIntervalMs).unref();

  logger.info("[weeklyAdminReport] Weekly admin report worker started (fires Mondays at 09:xx)");
}
