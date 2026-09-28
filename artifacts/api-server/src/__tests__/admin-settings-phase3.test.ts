/**
 * Admin Settings Phase 3 — integration tests
 *
 * Covers:
 *  - GET  /api/settings/maintenance-status  (public — no auth required)
 *  - PATCH /api/admin/settings/maintenance-mode  (toggle + validation)
 *  - GET  /api/admin/settings/platform  (defaults, all 9 keys)
 *  - PATCH /api/admin/settings/platform  (persists valid keys, ignores unknown)
 *  - GET  /api/admin/settings/system-health  (db, uptime, maintenanceMode)
 *  - maintenanceMode middleware: enabled→503 for shopper routes; admin/health bypass
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const ADMIN_KEY = "test-admin-key-phase3-settings";

// ─── hoisted mutable state ───────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  /** Current value for any site_settings query (simplified: same value for all keys) */
  settingValue: null as string | null,
  /** All upserted settings rows, keyed by key */
  upserted: new Map<string, string>(),
  /** audit log writes */
  auditLogs: [] as any[],
  idCounter: 0,
}));

// ─── @workspace/db mock ──────────────────────────────────────────────────────

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = {
    _t: "site_settings", key: "key", value: "value", updatedAt: "updated_at",
  };
  const adminAuditLogsTable: any = { _t: "admin_audit_logs" };
  const adminLoginSessionsTable: any = { _t: "admin_login_sessions" };

  function queryResult(rows: unknown[]): any {
    return {
      limit: vi.fn(() => queryResult(rows)),
      offset: vi.fn(() => queryResult(rows)),
      for: vi.fn(() => queryResult(rows)),
      orderBy: vi.fn(() => queryResult(rows)),
      where: vi.fn(() => queryResult(rows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  const db: any = {
    select: vi.fn((_spec?: any) => {
      const isCountQuery = !!(_spec && Object.prototype.hasOwnProperty.call(_spec, "total"));
      const isOneQuery = !!(_spec && Object.prototype.hasOwnProperty.call(_spec, "one"));
      return {
        from: vi.fn((table: any) => {
          if (table._t === "site_settings") {
            // Always return the current settingValue so getSetting() works for any key
            const row = state.settingValue !== null ? [{ value: state.settingValue }] : [];
            return queryResult(row);
          }
          if (table._t === "admin_audit_logs") {
            if (isCountQuery) {
              return { where: vi.fn(() => ({ then: (r: any) => Promise.resolve([{ total: 0 }]).then(r), catch: (f: any) => Promise.resolve([{ total: 0 }]).catch(f) })) };
            }
            return { where: vi.fn(() => ({ orderBy: vi.fn(() => ({ limit: vi.fn(() => ({ offset: vi.fn(() => Promise.resolve([])) })) })) })) };
          }
          if (isOneQuery) {
            // Used by system-health DB check: SELECT 1 — always return a row
            return queryResult([{ one: 1 }]);
          }
          return queryResult([]);
        }),
      };
    }),

    insert: vi.fn((table: any) => ({
      values: vi.fn((vals: any) => {
        if (table._t === "admin_audit_logs") {
          state.auditLogs.push({ id: `log-${++state.idCounter}`, ...vals });
        }
        return {
          onConflictDoUpdate: vi.fn((_opts: any) => {
            if (table._t === "site_settings" && vals.key) {
              state.upserted.set(vals.key, vals.value);
            }
            return Promise.resolve();
          }),
          returning: vi.fn(() => Promise.resolve([{ id: `row-${++state.idCounter}` }])),
        };
      }),
    })),

    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
  };

  return { db, siteSettingsTable, adminAuditLogsTable, adminLoginSessionsTable };
});

// ─── mock requireAdminKey ─────────────────────────────────────────────────────

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, res: any, next: any) => {
    if (req.headers["x-admin-key"] === ADMIN_KEY) return next();
    return res.status(403).json({ error: "Forbidden" });
  },
  sha256hex: (s: string) => `hash:${s}`,
  clearAdminKeyCache: vi.fn(),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn((p: any) => { state.auditLogs.push(p); return Promise.resolve(); }),
  getIp: vi.fn(() => "127.0.0.1"),
}));

vi.mock("../lib/adminNotifications", () => ({ clearAdminNotifPrefCache: vi.fn() }));
vi.mock("../middlewares/maintenanceMode", () => ({ clearMaintenanceModeCache: vi.fn() }));

// ─── build test app ───────────────────────────────────────────────────────────

let app: Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.settingValue = null;
  state.upserted.clear();
  state.auditLogs = [];

  app = express();
  app.use(express.json());
  const { default: router } = await import("../routes/adminSettings");
  app.use("/api", router);
});

// ─── GET /api/settings/maintenance-status ─────────────────────────────────────

describe("GET /api/settings/maintenance-status (public)", () => {
  it("returns { maintenance: false } when nothing stored", async () => {
    state.settingValue = null;
    const res = await request(app).get("/api/settings/maintenance-status");
    expect(res.status).toBe(200);
    expect(res.body.maintenance).toBe(false);
  });

  it("returns { maintenance: true } when stored value is 'true'", async () => {
    state.settingValue = "true";
    const res = await request(app).get("/api/settings/maintenance-status");
    expect(res.status).toBe(200);
    expect(res.body.maintenance).toBe(true);
  });

  it("returns { maintenance: false } when stored value is 'false'", async () => {
    state.settingValue = "false";
    const res = await request(app).get("/api/settings/maintenance-status");
    expect(res.status).toBe(200);
    expect(res.body.maintenance).toBe(false);
  });

  it("does NOT require an admin key", async () => {
    // No x-admin-key header — should still return 200
    const res = await request(app).get("/api/settings/maintenance-status");
    expect(res.status).toBe(200);
  });
});

// ─── PATCH /api/admin/settings/maintenance-mode ───────────────────────────────

describe("PATCH /api/admin/settings/maintenance-mode", () => {
  it("enables maintenance mode and stores 'true'", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/maintenance-mode")
      .set("x-admin-key", ADMIN_KEY)
      .send({ enabled: true });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.maintenanceMode).toBe(true);
    expect(state.upserted.get("maintenance_mode")).toBe("true");
  });

  it("disables maintenance mode and stores 'false'", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/maintenance-mode")
      .set("x-admin-key", ADMIN_KEY)
      .send({ enabled: false });

    expect(res.status).toBe(200);
    expect(res.body.maintenanceMode).toBe(false);
    expect(state.upserted.get("maintenance_mode")).toBe("false");
  });

  it("returns 400 when enabled is not a boolean", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/maintenance-mode")
      .set("x-admin-key", ADMIN_KEY)
      .send({ enabled: "yes" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/boolean/i);
  });

  it("returns 400 when body is missing enabled", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/maintenance-mode")
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    expect(res.status).toBe(400);
  });

  it("returns 403 without admin key", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/maintenance-mode")
      .send({ enabled: false });
    expect(res.status).toBe(403);
  });

  it("writes an audit log entry after toggling", async () => {
    await request(app)
      .patch("/api/admin/settings/maintenance-mode")
      .set("x-admin-key", ADMIN_KEY)
      .send({ enabled: true });
    const entry = state.auditLogs.find(l => l.action === "maintenance_mode_enabled");
    expect(entry).toBeDefined();
    expect(entry?.module).toBe("System");
  });
});

// ─── GET /api/admin/settings/platform ────────────────────────────────────────

describe("GET /api/admin/settings/platform", () => {
  it("returns all 9 default keys when nothing stored", async () => {
    state.settingValue = null;
    const res = await request(app)
      .get("/api/admin/settings/platform")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    const s = res.body.settings;
    expect(s).toHaveProperty("platform_name", "VASTRAA");
    expect(s).toHaveProperty("country", "India");
    expect(s).toHaveProperty("currency", "INR");
    expect(s).toHaveProperty("timezone", "Asia/Kolkata");
    expect(s).toHaveProperty("date_format", "DD/MM/YYYY");
    expect(Object.keys(s)).toHaveLength(9);
  });

  it("returns 403 without admin key", async () => {
    const res = await request(app).get("/api/admin/settings/platform");
    expect(res.status).toBe(403);
  });
});

// ─── PATCH /api/admin/settings/platform ──────────────────────────────────────

describe("PATCH /api/admin/settings/platform", () => {
  it("persists valid platform fields and writes audit log", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/platform")
      .set("x-admin-key", ADMIN_KEY)
      .send({ platform_name: "MyStore", support_email: "hello@mystore.com" });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(state.upserted.get("platform_name")).toBe("MyStore");
    expect(state.upserted.get("support_email")).toBe("hello@mystore.com");
    const auditEntry = state.auditLogs.find(l => l.action === "platform_settings_updated");
    expect(auditEntry).toBeDefined();
  });

  it("ignores unknown fields and does not store them", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/platform")
      .set("x-admin-key", ADMIN_KEY)
      .send({ platform_name: "Valid", totally_unknown_key: "injected" });

    expect(res.status).toBe(200);
    expect(state.upserted.has("totally_unknown_key")).toBe(false);
    expect(state.upserted.has("platform_name")).toBe(true);
  });

  it("returns 400 when only unknown keys are provided", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/platform")
      .set("x-admin-key", ADMIN_KEY)
      .send({ totally_unknown: "value" });
    expect(res.status).toBe(400);
  });

  it("trims whitespace from string values", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/platform")
      .set("x-admin-key", ADMIN_KEY)
      .send({ platform_name: "  VASTRAA  " });
    expect(res.status).toBe(200);
    expect(state.upserted.get("platform_name")).toBe("VASTRAA");
  });

  it("returns 403 without admin key", async () => {
    const res = await request(app)
      .patch("/api/admin/settings/platform")
      .send({ platform_name: "Hack" });
    expect(res.status).toBe(403);
  });
});

// ─── GET /api/admin/settings/system-health ───────────────────────────────────

describe("GET /api/admin/settings/system-health", () => {
  it("returns status ok with db:true when DB is reachable", async () => {
    state.settingValue = null; // maintenance_mode not set
    const res = await request(app)
      .get("/api/admin/settings/system-health")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.db).toBe(true);
    expect(typeof res.body.uptime).toBe("number");
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
    expect(res.body.maintenanceMode).toBe(false);
  });

  it("reflects maintenanceMode:true when setting is 'true'", async () => {
    state.settingValue = "true";
    const res = await request(app)
      .get("/api/admin/settings/system-health")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.maintenanceMode).toBe(true);
  });

  it("returns 403 without admin key", async () => {
    const res = await request(app).get("/api/admin/settings/system-health");
    expect(res.status).toBe(403);
  });
});

// Middleware bypass/block behaviour lives in a separate file (admin-maintenance-middleware.test.ts)
// so it can import the real middleware without the top-level vi.mock above interfering.
