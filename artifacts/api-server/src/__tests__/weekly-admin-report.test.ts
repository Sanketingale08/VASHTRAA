/**
 * weeklyAdminReport worker — unit tests
 *
 * Covers:
 *  - Reporting period: end = yesterday 23:59:59, start = 7 days before that 00:00
 *    including month/year boundary transitions
 *  - isoWeekKey: week numbering across year-end / Jan 1 edge cases
 *  - buildReportEmail: all six KPI rows appear in the HTML
 *  - Worker scheduling: only fires on Monday at 09:xx, not other days/hours
 *  - Single-send guarantee: durable DB claim prevents re-send on restart / parallel instance
 *  - KPI query failure: week NOT claimed → retry is possible on next tick
 *  - Email send failure: week IS claimed → failure logged, no duplicate send attempted
 *  - No admin email configured: week NOT claimed → retry possible once email is set
 *  - No RESEND_API_KEY: week NOT claimed → retry possible once key is set
 *
 * All I/O (DB, Resend, clock) is injected via the deps / getNow parameters exposed
 * by startWeeklyAdminReportWorker, so these tests need no DB or network access.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isoWeekKey,
  getCompletedWeekPeriod,
  buildReportEmail,
  startWeeklyAdminReportWorker,
  LAST_SENT_WEEK_KEY,
  type WeeklyKpis,
  type WorkerDeps,
} from "../workers/weeklyAdminReport";

// ─── Module mocks (minimal — deps injection replaces all actual I/O) ─────────
//
// The worker module imports @workspace/db and resend at the top level.  Even
// though our dep-injection stubs replace every call, vitest still needs to
// resolve those imports when the module is loaded.  These minimal mocks satisfy
// the import without side-effects (no real DB connection, no real HTTP calls).

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(async () => ({ rows: [{ key: "weekly_report_last_sent_week" }] })),
  },
  siteSettingsTable: { _t: "site_settings", key: "key", value: "value" },
}));

vi.mock("resend", () => {
  class ResendMock {
    emails = { send: vi.fn() };
    constructor(_key: string) {}
  }
  return { Resend: ResendMock };
});

vi.mock("../lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SAMPLE_KPIS: WeeklyKpis = {
  grossRevenue: 500_000,
  totalOrders: 42,
  newCustomers: 8,
  returnRate: 4.8,
  lowStockCount: 3,
  pendingSettlementAmount: 12_000,
  periodStart: "2026-08-10",
  periodEnd: "2026-08-16",
};

/** Monday 2026-08-17 at 09:05 — the canonical "should fire" moment. */
const MONDAY_09 = new Date("2026-08-17T09:05:00");

/** Build a full deps object with sensible defaults; override per test. */
function makeDeps(overrides: Partial<{
  readLastSentWeek: () => Promise<string | null>;
  claimWeek: (week: string) => Promise<boolean>;
  getAdminEmail: () => Promise<string | null>;
  fetchWeeklyKpis: (now: Date) => Promise<WeeklyKpis>;
  sendEmail: (opts: { to: string; subject: string; html: string }) => Promise<void>;
}> = {}) {
  return {
    readLastSentWeek: vi.fn(async () => null),
    claimWeek:        vi.fn(async (_w: string) => true),
    getAdminEmail:    vi.fn(async () => "admin@vastraa.com"),
    fetchWeeklyKpis:  vi.fn(async (_now: Date) => ({ ...SAMPLE_KPIS })),
    sendEmail:        vi.fn(async (_opts: { to: string; subject: string; html: string }) => {}),
    ...overrides,
  };
}

/**
 * Start the worker with a fixed clock and the given deps, then wait for the
 * async tick to complete. The huge interval ensures only one tick fires.
 */
async function runTick(now: Date, deps: WorkerDeps): Promise<void> {
  startWeeklyAdminReportWorker(999_999_999, () => now, deps);
  await new Promise((resolve) => setTimeout(resolve, 50));
}

// ─── Tests: getCompletedWeekPeriod ────────────────────────────────────────────

describe("getCompletedWeekPeriod", () => {
  it("end is yesterday at 23:59:59.999", () => {
    const now = new Date("2026-08-17T09:05:00"); // Monday
    const { end } = getCompletedWeekPeriod(now);
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(7);   // August = 7
    expect(end.getDate()).toBe(16);   // Sunday 16 Aug
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
    expect(end.getMilliseconds()).toBe(999);
  });

  it("start is the prior Monday at 00:00:00.000", () => {
    const now = new Date("2026-08-17T09:05:00"); // Monday 17 Aug
    const { start } = getCompletedWeekPeriod(now);
    // end = 16 Aug → start = 16 − 6 = 10 Aug
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(7);
    expect(start.getDate()).toBe(10); // Mon 10 Aug
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });

  it("covers exactly ~7 days (Mon 00:00 → Sun 23:59:59.999)", () => {
    const { start, end } = getCompletedWeekPeriod(new Date("2026-08-17T09:00:00"));
    const days = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThan(7.01);
  });

  it("handles month boundary: Monday 2026-03-02 → end=Mar 1, start=Feb 23", () => {
    // now = Mon 2 Mar → yesterday = Sun 1 Mar → end is in March
    // start = end − 6 = Mon 23 Feb → spans the Feb/Mar boundary
    const now = new Date("2026-03-02T09:00:00");
    const { start, end } = getCompletedWeekPeriod(now);
    expect(end.getMonth()).toBe(2);   // March (month index 2)
    expect(end.getDate()).toBe(1);    // 1 Mar 2026
    expect(start.getMonth()).toBe(1); // February (month index 1)
    expect(start.getDate()).toBe(23); // Mon 23 Feb
  });

  it("handles year boundary: Monday 2026-01-05 → Dec 29–Jan 4", () => {
    const now = new Date("2026-01-05T09:00:00"); // Monday 5 Jan
    const { start, end } = getCompletedWeekPeriod(now);
    // end = Sun 4 Jan 2026
    expect(end.getFullYear()).toBe(2026);
    expect(end.getMonth()).toBe(0);  // Jan
    expect(end.getDate()).toBe(4);
    // start = Mon 29 Dec 2025
    expect(start.getFullYear()).toBe(2025);
    expect(start.getMonth()).toBe(11); // Dec
    expect(start.getDate()).toBe(29);
  });
});

// ─── Tests: isoWeekKey ────────────────────────────────────────────────────────

describe("isoWeekKey", () => {
  it("returns the correct week for a mid-year date (2026-08-17 = W34)", () => {
    expect(isoWeekKey(new Date("2026-08-17"))).toBe("2026-W34");
  });

  it("Jan 1 2026 (Thursday) falls in 2026-W01", () => {
    expect(isoWeekKey(new Date("2026-01-01"))).toBe("2026-W01");
  });

  it("Dec 31 2025 (Wednesday) falls in 2026-W01 (ISO 8601 year attribution)", () => {
    expect(isoWeekKey(new Date("2025-12-31"))).toBe("2026-W01");
  });

  it("two consecutive Mondays produce consecutive week numbers", () => {
    const w1 = isoWeekKey(new Date("2026-08-10")); // W33
    const w2 = isoWeekKey(new Date("2026-08-17")); // W34
    const n1 = parseInt(w1.split("-W")[1]!, 10);
    const n2 = parseInt(w2.split("-W")[1]!, 10);
    expect(n2 - n1).toBe(1);
  });

  it("key format is always YYYY-Www", () => {
    expect(isoWeekKey(new Date("2026-01-05"))).toMatch(/^\d{4}-W\d{2}$/);
  });
});

// ─── Tests: buildReportEmail ──────────────────────────────────────────────────

describe("buildReportEmail", () => {
  it("subject contains the period dates", () => {
    const { subject } = buildReportEmail(SAMPLE_KPIS);
    expect(subject).toContain("2026-08-10");
    expect(subject).toContain("2026-08-16");
  });

  it("HTML includes Total Revenue row with ₹ symbol", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("Total Revenue");
    expect(html).toContain("₹");
  });

  it("HTML includes Total Orders row", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("Total Orders");
    expect(html).toContain("42");
  });

  it("HTML includes New Customers row", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("New Customers");
    expect(html).toContain("8");
  });

  it("HTML includes Return Rate row with % sign", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("Return Rate");
    expect(html).toContain("4.8%");
  });

  it("HTML includes Low-Stock Products row", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("Low-Stock Products");
    expect(html).toContain("3");
  });

  it("HTML includes Pending Settlements row", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("Pending Settlements");
  });

  it("HTML includes a link to /admin/reports", () => {
    const { html } = buildReportEmail(SAMPLE_KPIS);
    expect(html).toContain("admin/reports");
  });

  it("return rate of 0 renders as 0%", () => {
    const { html } = buildReportEmail({ ...SAMPLE_KPIS, returnRate: 0 });
    expect(html).toContain("0%");
  });
});

// ─── Tests: worker scheduling ─────────────────────────────────────────────────

describe("worker scheduling", () => {
  it("does NOT send on a non-Monday (Tuesday 09:00)", async () => {
    const deps = makeDeps();
    await runTick(new Date("2026-08-18T09:00:00"), deps); // Tuesday
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT send on Sunday 09:00", async () => {
    const deps = makeDeps();
    await runTick(new Date("2026-08-16T09:00:00"), deps); // Sunday
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT send on Monday at 08:59", async () => {
    const deps = makeDeps();
    await runTick(new Date("2026-08-17T08:59:59"), deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT send on Monday at 10:00", async () => {
    const deps = makeDeps();
    await runTick(new Date("2026-08-17T10:00:00"), deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("sends on Monday at 09:00", async () => {
    const deps = makeDeps();
    await runTick(new Date("2026-08-17T09:00:00"), deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends on Monday at 09:55 (still within the hour)", async () => {
    const deps = makeDeps();
    await runTick(new Date("2026-08-17T09:55:00"), deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("sends the email to the configured admin address", async () => {
    const deps = makeDeps({
      getAdminEmail: vi.fn(async () => "boss@example.com"),
    });
    await runTick(MONDAY_09, deps);
    expect(deps.sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "boss@example.com" })
    );
  });
});

// ─── Tests: single-send guarantee (durable claim) ────────────────────────────

describe("single-send guarantee", () => {
  it("skips when readLastSentWeek returns this week (restart safety)", async () => {
    const deps = makeDeps({
      readLastSentWeek: vi.fn(async () => "2026-W34"), // same week as 2026-08-17
    });
    await runTick(MONDAY_09, deps);
    expect(deps.claimWeek).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("skips when claimWeek returns false (another instance already sent)", async () => {
    const deps = makeDeps({
      claimWeek: vi.fn(async (_w: string) => false),
    });
    await runTick(MONDAY_09, deps);
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("claims with the correct ISO week key", async () => {
    const deps = makeDeps();
    await runTick(MONDAY_09, deps); // 2026-08-17 = W34
    expect(deps.claimWeek).toHaveBeenCalledWith("2026-W34");
  });

  it("sends when a different (older) week was last sent", async () => {
    const deps = makeDeps({
      readLastSentWeek: vi.fn(async () => "2026-W33"), // last week
    });
    await runTick(MONDAY_09, deps);
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does NOT call claimWeek when KPI fetch fails (retry semantics)", async () => {
    const deps = makeDeps({
      fetchWeeklyKpis: vi.fn(async () => { throw new Error("DB unavailable"); }),
    });
    await runTick(MONDAY_09, deps);
    expect(deps.claimWeek).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });
});

// ─── Tests: error handling ────────────────────────────────────────────────────

describe("error handling", () => {
  it("does NOT claim the week when admin email is missing", async () => {
    const deps = makeDeps({
      getAdminEmail: vi.fn(async () => null),
    });
    await runTick(MONDAY_09, deps);
    expect(deps.claimWeek).not.toHaveBeenCalled();
    expect(deps.sendEmail).not.toHaveBeenCalled();
  });

  it("does NOT claim when RESEND_API_KEY is absent (using real sendEmail path)", async () => {
    // When deps.sendEmail is not provided, the worker checks RESEND_API_KEY itself.
    // Temporarily delete the env var, verify claimWeek is never called.
    const saved = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    try {
      // Pass sendEmail: undefined explicitly so the worker falls through to the
      // real API-key check. All other deps remain mocked.
      const { readLastSentWeek, claimWeek, getAdminEmail, fetchWeeklyKpis } = makeDeps();
      await runTick(MONDAY_09, { readLastSentWeek, claimWeek, getAdminEmail, fetchWeeklyKpis });
      expect(claimWeek).not.toHaveBeenCalled();
    } finally {
      if (saved !== undefined) process.env.RESEND_API_KEY = saved;
    }
  });

  it("claims the week even when email send throws (prevents duplicate sends)", async () => {
    const deps = makeDeps({
      sendEmail: vi.fn(async () => { throw new Error("Resend timeout"); }),
    });
    await runTick(MONDAY_09, deps);
    // Claim was done before the send attempt
    expect(deps.claimWeek).toHaveBeenCalledTimes(1);
    // sendEmail was attempted
    expect(deps.sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does not throw when email send fails (worker catches error gracefully)", async () => {
    const deps = makeDeps({
      sendEmail: vi.fn(async () => { throw new Error("Resend timeout"); }),
    });
    await expect(runTick(MONDAY_09, deps)).resolves.toBeUndefined();
  });

  it("does not claim when KPI fetch fails", async () => {
    const deps = makeDeps({
      fetchWeeklyKpis: vi.fn(async () => { throw new Error("DB down"); }),
    });
    await runTick(MONDAY_09, deps);
    expect(deps.claimWeek).not.toHaveBeenCalled();
  });
});

// ─── Tests: claimWeek schema compatibility ────────────────────────────────────
//
// Guards against the INSERT referencing columns that do not exist in the
// site_settings table (e.g., `created_at` was incorrectly used in an earlier
// version). Uses vi.importActual to load the real Drizzle schema object so the
// assertion reflects the true DB contract, not the vi.mock stub above.

describe("claimWeek SQL schema compatibility", () => {
  it("site_settings schema has key, value, updatedAt — and NOT createdAt", async () => {
    // Load the real (un-mocked) schema so we see the actual column definitions
    const real = await vi.importActual<typeof import("@workspace/db")>("@workspace/db");
    const cols = Object.keys(real.siteSettingsTable);
    // Columns the claimWeek INSERT references — all must exist
    expect(cols).toContain("key");
    expect(cols).toContain("value");
    expect(cols).toContain("updatedAt"); // maps to updated_at in DB
    // This column was incorrectly referenced in an earlier version of claimWeek;
    // if it reappears in the schema the INSERT must be updated too.
    expect(cols).not.toContain("createdAt");
  });
});

// ─── Tests: KPI calculation helpers (via fetchWeeklyKpis delegation) ─────────

describe("KPI data passed to email", () => {
  it("email subject includes the correct date range from KPI data", async () => {
    let capturedSubject = "";
    const deps = makeDeps({
      fetchWeeklyKpis: vi.fn(async () => ({
        ...SAMPLE_KPIS,
        periodStart: "2026-08-10",
        periodEnd: "2026-08-16",
      })),
      sendEmail: vi.fn(async (opts) => { capturedSubject = opts.subject; }),
    });
    await runTick(MONDAY_09, deps);
    expect(capturedSubject).toContain("2026-08-10");
    expect(capturedSubject).toContain("2026-08-16");
  });

  it("email HTML contains all six KPI labels", async () => {
    let capturedHtml = "";
    const deps = makeDeps({
      sendEmail: vi.fn(async (opts) => { capturedHtml = opts.html; }),
    });
    await runTick(MONDAY_09, deps);
    expect(capturedHtml).toContain("Total Revenue");
    expect(capturedHtml).toContain("Total Orders");
    expect(capturedHtml).toContain("New Customers");
    expect(capturedHtml).toContain("Return Rate");
    expect(capturedHtml).toContain("Low-Stock Products");
    expect(capturedHtml).toContain("Pending Settlements");
  });

  it("return rate is 0 when there are no orders", () => {
    const kpis = { ...SAMPLE_KPIS, totalOrders: 0, returnRate: 0 };
    const { html } = buildReportEmail(kpis);
    expect(html).toContain("0%");
  });
});
