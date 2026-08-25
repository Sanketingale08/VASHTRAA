/**
 * Real PostgreSQL regression coverage for Vendor ID allocation.
 *
 * Run only with:
 *   INTEGRATION_TEST_DATABASE_NAME=<dedicated-test-db> \
 *   DATABASE_URL=<that-test-db-url> \
 *   pnpm --filter @workspace/api-server test:integration
 *
 * This intentionally rejects every database other than the explicitly named,
 * dedicated test database before @workspace/db is imported or modified.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { sql } from "drizzle-orm";

const ADMIN_KEY = "vendor-approval-integration-test-key";
const fixtureVendorIds: string[] = [];
let db: any;
let pool: any;

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/transactionalEmail", () => ({
  sendVendorApprovalEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorSuspensionEmailForVendor: vi.fn().mockResolvedValue(undefined),
  sendVendorRejectionEmailForVendor: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/sellerNotifications", () => ({
  insertSellerNotification: vi.fn().mockResolvedValue(undefined),
  insertSellerNotificationForVendors: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/adminNotifications", () => ({
  insertAdminNotification: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../lib/auditLog", () => ({
  writeAuditLog: vi.fn().mockResolvedValue(undefined),
  getIp: vi.fn().mockReturnValue("127.0.0.1"),
}));

type SequenceState = {
  lastValue: bigint;
  isCalled: boolean;
};

async function loadDedicatedIntegrationDatabase(): Promise<void> {
  if (process.env.RUN_DB_INTEGRATION_TESTS !== "1") {
    throw new Error("Set RUN_DB_INTEGRATION_TESTS=1 to run database integration tests.");
  }

  const expectedDatabaseName = process.env.INTEGRATION_TEST_DATABASE_NAME;
  if (!expectedDatabaseName || !/(^|[_-])test($|[_-])/i.test(expectedDatabaseName)) {
    throw new Error(
      "INTEGRATION_TEST_DATABASE_NAME must name a dedicated database containing 'test'.",
    );
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL must point to the dedicated integration test database.");
  }

  const urlDatabaseName = decodeURIComponent(
    new URL(process.env.DATABASE_URL).pathname.replace(/^\//, ""),
  );
  if (urlDatabaseName !== expectedDatabaseName) {
    throw new Error(
      `Refusing to run database integration tests against "${urlDatabaseName || "unknown"}". ` +
        `Expected "${expectedDatabaseName}".`,
    );
  }

  // Do not statically import this module: its constructor requires DATABASE_URL.
  const database = await import("@workspace/db");
  db = database.db;
  pool = database.pool;
  const result = await db.execute(sql`SELECT current_database() AS database_name`);
  const connectedDatabaseName = (result.rows[0] as { database_name: string }).database_name;
  if (connectedDatabaseName !== expectedDatabaseName) {
    await pool.end();
    db = undefined;
    pool = undefined;
    throw new Error(
      `Refusing to run database integration tests against "${connectedDatabaseName}". ` +
        `Expected "${expectedDatabaseName}".`,
    );
  }
}

async function applyVendorIdMigration(): Promise<void> {
  const migrationUrl = new URL(
    "../../../../lib/db/drizzle/0045_harden_vendor_id_sequence.sql",
    import.meta.url,
  );
  const migration = readFileSync(migrationUrl, "utf8").replace(
    /--> statement-breakpoint/g,
    "",
  );

  // The migration uses a session-level advisory lock, so every statement
  // must run on one checked-out PostgreSQL connection.
  const client = await pool.connect();
  try {
    await client.query(migration);
  } finally {
    client.release();
  }
}

async function readSequenceState(): Promise<SequenceState> {
  const result = await db.execute(sql`
    SELECT last_value::text AS last_value, is_called
      FROM vendor_id_seq
  `);
  const row = result.rows[0] as { last_value: string; is_called: boolean };
  return {
    lastValue: BigInt(row.last_value),
    isCalled: row.is_called,
  };
}

async function readHighestStoredVendorNumber(): Promise<bigint> {
  const result = await db.execute(sql`
    SELECT COALESCE(
      MAX((substring(vendor_id FROM '^TDV([0-9]+)$'))::bigint),
      0
    )::text AS highest
      FROM vendors
     WHERE vendor_id ~ '^TDV[0-9]+$'
  `);
  return BigInt((result.rows[0] as { highest: string }).highest);
}

/**
 * Put the test allocation range safely beyond both the current sequence and
 * all stored IDs. The sequence is intentionally never restored backward.
 */
async function moveSequenceForwardForTest(): Promise<bigint> {
  const [sequence, highestStored] = await Promise.all([
    readSequenceState(),
    readHighestStoredVendorNumber(),
  ]);
  const nextNumber = sequence.isCalled
    ? sequence.lastValue + 1n
    : sequence.lastValue;
  const anchor = nextNumber > highestStored
    ? nextNumber + 1000n
    : highestStored + 1000n;

  await db.execute(sql`
    SELECT setval('vendor_id_seq', ${anchor.toString()}::bigint, true)
  `);
  return anchor;
}

async function createPendingVendor(label: string): Promise<string> {
  const id = randomUUID();
  fixtureVendorIds.push(id);
  await db.execute(sql`
    INSERT INTO vendors (id, name, location, status, owner_id, contact_email)
    VALUES (
      ${id}::uuid,
      ${`Integration Test ${label}`},
      'Integration Test Location',
      'pending',
      NULL,
      NULL
    )
  `);
  return id;
}

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: unknown, next: () => void) => {
    req.log = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
    next();
  });
  const { default: vendorsRouter } = await import("../routes/vendors");
  app.use("/api", vendorsRouter);
  return app;
}

function vendorNumber(vendorId: string): bigint {
  return BigInt(vendorId.replace(/^TDV/, ""));
}

describe.sequential("Vendor ID allocation with PostgreSQL", () => {
  let app: Express;

  beforeAll(async () => {
    process.env.ADMIN_API_KEY = ADMIN_KEY;
    await loadDedicatedIntegrationDatabase();
    await applyVendorIdMigration();
    app = await buildApp();
  });

  afterEach(async () => {
    for (const id of fixtureVendorIds.splice(0)) {
      await db.execute(sql`DELETE FROM vendors WHERE id = ${id}::uuid`);
    }
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("assigns distinct sequential Vendor IDs to simultaneous approvals", async () => {
    const anchor = await moveSequenceForwardForTest();
    const firstVendorId = await createPendingVendor("concurrent one");
    const secondVendorId = await createPendingVendor("concurrent two");

    const [first, second] = await Promise.all([
      request(app)
        .post(`/api/admin/vendors/${firstVendorId}/approve`)
        .set("x-admin-key", ADMIN_KEY)
        .send({}),
      request(app)
        .post(`/api/admin/vendors/${secondVendorId}/approve`)
        .set("x-admin-key", ADMIN_KEY)
        .send({}),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    const allocatedNumbers = [
      vendorNumber(first.body.vendor.vendorId),
      vendorNumber(second.body.vendor.vendorId),
    ].sort((a, b) => (a < b ? -1 : 1));

    expect(new Set(allocatedNumbers).size).toBe(2);
    expect(allocatedNumbers).toEqual([anchor + 1n, anchor + 2n]);
  });

  it("keeps the original Vendor ID when the same approval is retried", async () => {
    const anchor = await moveSequenceForwardForTest();
    const vendorId = await createPendingVendor("retry");

    const first = await request(app)
      .post(`/api/admin/vendors/${vendorId}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});
    const second = await request(app)
      .post(`/api/admin/vendors/${vendorId}/approve`)
      .set("x-admin-key", ADMIN_KEY)
      .send({});

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.vendor.vendorId).toBe(`TDV${String(anchor + 1n).padStart(6, "0")}`);
    expect(second.body.vendor.vendorId).toBe(first.body.vendor.vendorId);

    const sequence = await readSequenceState();
    expect(sequence.lastValue).toBe(anchor + 1n);
  });

  it("does not move an already-ahead sequence backward when the migration reruns", async () => {
    const anchor = await moveSequenceForwardForTest();
    const beforeMigration = await readSequenceState();
    expect(beforeMigration.lastValue).toBe(anchor);
    expect(anchor).toBeGreaterThan(await readHighestStoredVendorNumber());

    await applyVendorIdMigration();

    const afterMigration = await readSequenceState();
    expect(afterMigration).toEqual(beforeMigration);
  });
});