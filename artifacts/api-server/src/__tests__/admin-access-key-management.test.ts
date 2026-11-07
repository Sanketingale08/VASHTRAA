import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import bcrypt from "bcryptjs";

// ── In-Memory Settings Store ──────────────────────────────────────────────────
const settingsStore = new Map<string, string>();

vi.mock("@workspace/db", () => {
  return {
    mongoSiteSettings: {
      get: vi.fn(async (key: string) => settingsStore.get(key) ?? null),
      set: vi.fn(async (key: string, val: string) => { settingsStore.set(key, val); }),
      delete: vi.fn(async (key: string) => { settingsStore.delete(key); }),
    },
    siteSettingsTable: { key: "key", value: "value" },
    adminLoginSessionsTable: { id: "id" },
    adminAuditLogsTable: { id: "id" },
    mongoGeneric: {
      getCollection: vi.fn(() => ({
        findOne: vi.fn(async () => null),
        insertOne: vi.fn(async () => {}),
      })),
    },
    mongoAuditLogs: {
      insert: vi.fn(async () => {}),
    },
    isMongoDbConnected: vi.fn(() => true),
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          onConflictDoUpdate: vi.fn(async () => {}),
          returning: vi.fn(async () => [{ id: "test-id" }]),
        })),
      })),
      delete: vi.fn(() => ({
        where: vi.fn(async () => {}),
      })),
    },
  };
});

// Import router and middlewares after mocking @workspace/db
import adminSettingsRouter from "../routes/adminSettings";
import { clearAdminKeyCache, verifyAdminAccessKey } from "../middlewares/isAdmin";

describe("Admin Access Key Management & Security", () => {
  const INITIAL_KEY = "Admin@InitialTest2026";
  const NEW_KEY = "Vastraa@NewSecureKey2026!";
  let app: Express;

  beforeEach(async () => {
    settingsStore.clear();
    clearAdminKeyCache();

    // Seed initial bcrypt hash in settingsStore
    const initialHash = await bcrypt.hash(INITIAL_KEY, 10);
    settingsStore.set("admin_key_hash", initialHash);

    // Build Express test instance
    app = express();
    app.use(express.json());
    // Mount router at both /api and root to support /api/admin/... and /admin/...
    app.use("/api", adminSettingsRouter);
    app.use(adminSettingsRouter);
  });

  it("1. Rejects unauthenticated access key change requests", async () => {
    const res = await request(app)
      .post("/api/admin/settings/change-access-key")
      .send({
        currentKey: INITIAL_KEY,
        newKey: NEW_KEY,
        confirmKey: NEW_KEY,
      });

    expect(res.status).toBe(403);
  });

  it("2. Rejects access key change when current key is incorrect", async () => {
    const res = await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: "WrongCurrentPassword123",
        newKey: NEW_KEY,
        confirmKey: NEW_KEY,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Current access key is incorrect");
  });

  it("3. Rejects when newKey and confirmKey do not match", async () => {
    const res = await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: NEW_KEY,
        confirmKey: "DifferentKey123!",
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("do not match");
  });

  it("4. Rejects when newKey is too short or identical to current key", async () => {
    // Too short (< 8 chars)
    const shortRes = await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: "short",
        confirmKey: "short",
      });

    expect(shortRes.status).toBe(400);
    expect(shortRes.body.error).toContain("at least 8 characters");

    // Identical
    const sameRes = await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: INITIAL_KEY,
        confirmKey: INITIAL_KEY,
      });

    expect(sameRes.status).toBe(400);
    expect(sameRes.body.error).toContain("differ from the current key");
  });

  it("5. Successfully updates access key with secure bcrypt hash in MongoDB and deletes plaintext", async () => {
    // Also simulate a legacy plaintext key in settings to verify it gets deleted
    settingsStore.set("admin_access_key", "old-plain-text-key");
    settingsStore.set("admin_key", "old-plain-text-key-2");

    const res = await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: NEW_KEY,
        confirmKey: NEW_KEY,
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("Access Key updated successfully");

    // Verify stored key in DB
    const storedHash = settingsStore.get("admin_key_hash");
    expect(storedHash).toBeDefined();
    // Must be a bcrypt hash (starts with $2)
    expect(storedHash?.startsWith("$2")).toBe(true);

    // Verify bcrypt comparison matches new key
    const isBcryptMatch = await bcrypt.compare(NEW_KEY, storedHash!);
    expect(isBcryptMatch).toBe(true);

    // SECURITY: Ensure raw plaintext key is NEVER stored in database
    expect(settingsStore.get("admin_access_key")).toBeUndefined();
    expect(settingsStore.get("admin_key")).toBeUndefined();
  });

  it("6. Authenticates future requests with updated key and rejects old key", async () => {
    // 1. Change key
    const changeRes = await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: NEW_KEY,
        confirmKey: NEW_KEY,
      });

    expect(changeRes.status).toBe(200);

    // 2. New key works for admin endpoints
    const newKeyRes = await request(app)
      .get("/api/admin/settings/profile")
      .set("x-admin-key", NEW_KEY);

    expect(newKeyRes.status).toBe(200);

    // 3. Old key is immediately rejected
    const oldKeyRes = await request(app)
      .get("/api/admin/settings/profile")
      .set("x-admin-key", INITIAL_KEY);

    expect(oldKeyRes.status).toBe(403);
  });

  it("7. Persists access key across server restart simulation", async () => {
    // 1. Change key
    await request(app)
      .post("/api/admin/settings/change-access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: NEW_KEY,
        confirmKey: NEW_KEY,
      });

    // 2. Simulate server restart: clear all in-memory caches
    clearAdminKeyCache();

    // 3. Verify key is read directly from MongoDB store and validates
    const isValid = await verifyAdminAccessKey(NEW_KEY);
    expect(isValid).toBe(true);

    const isOldValid = await verifyAdminAccessKey(INITIAL_KEY);
    expect(isOldValid).toBe(false);

    // 4. Admin API request succeeds after simulated restart
    const apiRes = await request(app)
      .get("/api/admin/settings/platform")
      .set("x-admin-key", NEW_KEY);

    expect(apiRes.status).toBe(200);
  });

  it("8. Does not expose access key or its hash in API responses", async () => {
    // Check profile
    const profileRes = await request(app)
      .get("/api/admin/settings/profile")
      .set("x-admin-key", INITIAL_KEY);

    expect(profileRes.status).toBe(200);
    expect(JSON.stringify(profileRes.body)).not.toContain(INITIAL_KEY);
    expect(JSON.stringify(profileRes.body)).not.toContain("admin_key_hash");

    // Check platform settings
    const platformRes = await request(app)
      .get("/api/admin/settings/platform")
      .set("x-admin-key", INITIAL_KEY);

    expect(platformRes.status).toBe(200);
    expect(JSON.stringify(platformRes.body)).not.toContain(INITIAL_KEY);
    expect(JSON.stringify(platformRes.body)).not.toContain("admin_key_hash");
  });

  it("9. Supports PUT /api/admin/settings/access-key endpoint alias", async () => {
    const res = await request(app)
      .put("/api/admin/settings/access-key")
      .set("x-admin-key", INITIAL_KEY)
      .send({
        currentKey: INITIAL_KEY,
        newKey: NEW_KEY,
        confirmKey: NEW_KEY,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toContain("Access Key updated successfully");
  });
});
