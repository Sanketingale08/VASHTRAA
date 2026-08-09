/**
 * maintenanceMode middleware — unit tests
 *
 * This file deliberately does NOT mock "../middlewares/maintenanceMode" so we
 * can import and exercise the real middleware. We mock @workspace/db to control
 * what the middleware reads from site_settings.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

// ─── hoisted state ────────────────────────────────────────────────────────────

const state = vi.hoisted(() => ({
  /** The value returned for site_settings.maintenance_mode */
  maintenanceValue: "false",
}));

// ─── mock @workspace/db (controls what the middleware reads) ──────────────────

vi.mock("@workspace/db", () => {
  const siteSettingsTable: any = { _t: "site_settings", key: "key", value: "value" };

  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          then: (resolve: any) =>
            Promise.resolve(
              state.maintenanceValue !== null ? [{ value: state.maintenanceValue }] : []
            ).then(resolve),
          catch: (fn: any) => Promise.resolve([]).catch(fn),
        })),
      })),
    })),
  };

  return { db, siteSettingsTable };
});

// ─── build a fresh app with the real middleware before each test ──────────────

let testApp: Express;

beforeEach(async () => {
  vi.clearAllMocks();

  // Import the real middleware fresh so module-level cache is isolated by vitest
  const { maintenanceMode, clearMaintenanceModeCache } = await import("../middlewares/maintenanceMode");
  clearMaintenanceModeCache(); // always start with a fresh cache

  testApp = express();
  testApp.use(maintenanceMode);
  // Simulate a typical shopper API route
  testApp.get("/api/products", (_req, res) => res.json({ products: [] }));
  // Admin route that must always pass
  testApp.get("/api/admin/settings/profile", (_req, res) => res.json({ ok: true }));
  // Seller route that must always pass (sellers need to keep operating during maintenance)
  testApp.get("/api/seller/products", (_req, res) => res.json({ products: [] }));
  // Health check that must always pass
  testApp.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  // Public maintenance-status probe that must always pass
  testApp.get("/api/settings/maintenance-status", (_req, res) =>
    res.json({ maintenance: true })
  );
});

// ─── tests ────────────────────────────────────────────────────────────────────

describe("maintenanceMode middleware — disabled", () => {
  it("passes shopper routes through when maintenance is 'false'", async () => {
    state.maintenanceValue = "false";
    const res = await request(testApp).get("/api/products");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ products: [] });
  });

  it("passes shopper routes when no setting is stored (null → defaults off)", async () => {
    state.maintenanceValue = ""; // empty string → not "true" → off
    const res = await request(testApp).get("/api/products");
    expect(res.status).toBe(200);
  });
});

describe("maintenanceMode middleware — enabled", () => {
  beforeEach(async () => {
    state.maintenanceValue = "true";
    // Clear the 30s cache so this test reads the fresh value from DB
    const { clearMaintenanceModeCache } = await import("../middlewares/maintenanceMode");
    clearMaintenanceModeCache();
  });

  it("returns 503 + { maintenance: true } for a shopper API route", async () => {
    const res = await request(testApp).get("/api/products");
    expect(res.status).toBe(503);
    expect(res.body.maintenance).toBe(true);
    expect(typeof res.body.message).toBe("string");
  });

  it("still passes /api/admin/* routes", async () => {
    const res = await request(testApp).get("/api/admin/settings/profile");
    expect(res.status).toBe(200);
  });

  it("still passes /api/health", async () => {
    const res = await request(testApp).get("/api/health");
    expect(res.status).toBe(200);
  });

  it("still passes /api/settings/maintenance-status (public probe)", async () => {
    const res = await request(testApp).get("/api/settings/maintenance-status");
    expect(res.status).toBe(200);
  });

  it("still passes /api/seller/* so sellers keep operating during maintenance", async () => {
    const res = await request(testApp).get("/api/seller/products");
    expect(res.status).toBe(200);
  });
});
