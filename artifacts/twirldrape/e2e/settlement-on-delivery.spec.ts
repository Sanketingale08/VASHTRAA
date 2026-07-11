/**
 * Settlement creation on order delivery — Playwright e2e test.
 *
 * This test exercises the real API server and real PostgreSQL database:
 *   1. Seeds a test vendor, product, and order directly in the DB (beforeAll).
 *   2. Calls PATCH /api/orders/:id/status (admin key) to mark the order delivered.
 *   3. Queries the DB to confirm a vendor_settlements row was created with
 *      correct productAmount, commission, settlementTax, and netPayout values.
 *   4. Verifies the settlement appears via GET /api/seller/settlements when
 *      authenticated as the vendor owner (requires CLERK_SECRET_KEY).
 *
 * Required env vars:
 *   DATABASE_URL   — development PostgreSQL connection string
 *   ADMIN_API_KEY  — must match the API server's x-admin-key guard
 *   API_BASE_URL   — defaults to http://localhost:3001 (the API server port)
 *
 * Optional env vars (only for the GET /seller/settlements assertion):
 *   CLERK_SECRET_KEY — enables the vendor Clerk session test; skipped otherwise
 *
 * Math for the seeded fixture (price=10000, qty=2, no custom rules → 10 % default):
 *   productAmount  = 10000 × 2 = 20 000
 *   commission     = round(20 000 × 0.10) = 2 000
 *   shippingCharge = 0  (order.shipping = 0)
 *   settlementTax  = round(2 000 × 0.18) = 360
 *   netPayout      = 20 000 − 2 000 − 0 − 360 = 17 640
 */

import { test, expect } from "@playwright/test";
import { randomUUID } from "crypto";
import { signInSeller, createVerifiedSeller, cleanupSeller } from "./fixtures/seller-auth";

const API_BASE = process.env.API_BASE_URL ?? "http://localhost:3001";
const ADMIN_KEY = process.env.ADMIN_API_KEY ?? "";
const DB_URL = process.env.DATABASE_URL ?? "";

const VENDOR_ID = randomUUID();
const PRODUCT_ID = randomUUID();
const ORDER_ID = randomUUID();

let pgClient: any = null;
let clerkVendorUserId: string | null = null;

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function connectDb() {
  const { Client } = await import("pg");
  const client = new Client({ connectionString: DB_URL });
  await client.connect();
  return client;
}

async function seedTestData(client: any) {
  await client.query(
    `INSERT INTO vendors (id, name, location, owner_id, status)
     VALUES ($1, 'E2E Settlement Vendor', 'Mumbai', $2, 'approved')
     ON CONFLICT (id) DO NOTHING`,
    [VENDOR_ID, `e2e-settle-placeholder-${VENDOR_ID}`],
  );

  await client.query(
    `INSERT INTO products (id, name, description, price, category, fabric, color, occasion,
                           vendor_id, vendor_name, images, variants, specifications)
     VALUES ($1, 'E2E Settlement Saree', 'Test saree for settlement e2e', 10000, 'sarees',
             'silk', 'red', 'festival', $2, 'E2E Settlement Vendor', '[]', '[]', '[]')
     ON CONFLICT (id) DO NOTHING`,
    [PRODUCT_ID, VENDOR_ID],
  );

  const items = JSON.stringify([
    { productId: PRODUCT_ID, name: "E2E Settlement Saree", price: 10000, quantity: 2 },
  ]);
  const address = JSON.stringify({
    name: "E2E Buyer",
    line1: "1 Test Lane",
    city: "Mumbai",
    state: "Maharashtra",
    pincode: "400001",
  });
  await client.query(
    `INSERT INTO orders (id, user_id, items, address, delivery_method, payment_method,
                         subtotal, discount, shipping, tax, total, status, status_history, vendor_acceptances)
     VALUES ($1, 'e2e-buyer-settle', $2, $3, 'standard', 'cod', 20000, 0, 0, 0, 20000,
             'confirmed', '[]', '{}')
     ON CONFLICT (id) DO NOTHING`,
    [ORDER_ID, items, address],
  );
}

async function cleanTestData(client: any) {
  await client.query(`DELETE FROM vendor_settlements WHERE order_id = $1`, [ORDER_ID]);
  await client.query(`DELETE FROM orders WHERE id = $1`, [ORDER_ID]);
  await client.query(`DELETE FROM products WHERE id = $1`, [PRODUCT_ID]);
  await client.query(`DELETE FROM vendors WHERE id = $1`, [VENDOR_ID]);
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe("Settlement row created when an order is delivered", () => {
  test.beforeAll(async ({ request }) => {
    if (!DB_URL || !ADMIN_KEY) {
      console.warn("[settlement-e2e] DATABASE_URL or ADMIN_API_KEY not set — skipping setup");
      return;
    }

    pgClient = await connectDb();
    await seedTestData(pgClient);

    // Mark the order delivered via the admin endpoint — this is the code path under test.
    const deliverRes = await request.patch(`${API_BASE}/api/orders/${ORDER_ID}/status`, {
      data: { status: "delivered" },
      headers: {
        "x-admin-key": ADMIN_KEY,
        "Content-Type": "application/json",
      },
    });

    if (!deliverRes.ok()) {
      const body = await deliverRes.text();
      throw new Error(`Delivery API call failed: ${deliverRes.status()} — ${body}`);
    }
  });

  test.afterAll(async () => {
    if (pgClient) {
      await cleanTestData(pgClient);
      await pgClient.end();
      pgClient = null;
    }
    if (clerkVendorUserId) {
      await cleanupSeller(clerkVendorUserId);
      clerkVendorUserId = null;
    }
  });

  // -------------------------------------------------------------------------
  // Core assertion: correct settlement math in the database
  // -------------------------------------------------------------------------

  test("settlement row has correct productAmount, commission, and netPayout", async () => {
    test.skip(!DB_URL || !ADMIN_KEY, "Requires DATABASE_URL and ADMIN_API_KEY");

    const result = await pgClient.query(
      `SELECT vendor_id, order_id, type, status,
              product_amount, commission, commission_rate,
              shipping_charge, settlement_tax, net_payout, amount
       FROM vendor_settlements
       WHERE order_id = $1 AND vendor_id = $2`,
      [ORDER_ID, VENDOR_ID],
    );

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    // Linkage
    expect(row.vendor_id).toBe(VENDOR_ID);
    expect(row.order_id).toBe(ORDER_ID);
    expect(row.type).toBe("order_settlement");

    // Status must be "processing" — initial state for newly created settlements
    expect(row.status).toBe("processing");

    // productAmount = 10 000 × 2 = 20 000
    expect(row.product_amount).toBe(20000);

    // Default commission rate: 10 %
    expect(parseFloat(row.commission_rate)).toBeCloseTo(0.10, 5);

    // commission = round(20 000 × 0.10) = 2 000
    expect(row.commission).toBe(2000);

    // shippingCharge = 0 (order.shipping = 0)
    expect(row.shipping_charge).toBe(0);

    // settlementTax = round(2 000 × 0.18) = 360
    expect(row.settlement_tax).toBe(360);

    // netPayout = 20 000 − 2 000 − 0 − 360 = 17 640
    expect(row.net_payout).toBe(17640);
    expect(row.amount).toBe(17640);
  });

  // -------------------------------------------------------------------------
  // Idempotency: re-delivering does not create a duplicate settlement
  // -------------------------------------------------------------------------

  test("re-delivering the same order does not create a duplicate settlement", async ({ request }) => {
    test.skip(!DB_URL || !ADMIN_KEY, "Requires DATABASE_URL and ADMIN_API_KEY");

    await request.patch(`${API_BASE}/api/orders/${ORDER_ID}/status`, {
      data: { status: "delivered" },
      headers: { "x-admin-key": ADMIN_KEY, "Content-Type": "application/json" },
    });

    const result = await pgClient.query(
      `SELECT COUNT(*) AS cnt FROM vendor_settlements
       WHERE order_id = $1 AND vendor_id = $2`,
      [ORDER_ID, VENDOR_ID],
    );
    expect(parseInt(result.rows[0].cnt, 10)).toBe(1);
  });

  // -------------------------------------------------------------------------
  // GET /seller/settlements — settlement surfaces in the vendor's list
  // (requires CLERK_SECRET_KEY to create and sign in the vendor owner)
  // -------------------------------------------------------------------------

  test("GET /seller/settlements returns the settlement for the authenticated vendor", async ({ page }) => {
    const hasClerk = !!process.env.CLERK_SECRET_KEY;
    test.skip(!DB_URL || !ADMIN_KEY || !hasClerk, "Requires DATABASE_URL, ADMIN_API_KEY, and CLERK_SECRET_KEY");

    // Create a real Clerk user to act as the vendor owner
    const { userId } = await createVerifiedSeller();
    clerkVendorUserId = userId;

    // Patch the vendor row so its owner_id matches the real Clerk userId
    await pgClient.query(`UPDATE vendors SET owner_id = $1 WHERE id = $2`, [userId, VENDOR_ID]);

    // Sign in as that vendor in the browser (inherits Clerk session into cookies)
    const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${process.env.PORT ?? 23779}`;
    await signInSeller(page, baseURL, userId);

    // page.request inherits the browser's Clerk session cookies
    const settleRes = await page.request.get("/api/seller/settlements");
    expect(settleRes.status()).toBe(200);

    const body = await settleRes.json();
    const match = (body.settlements ?? []).find(
      (s: any) => s.orderId === ORDER_ID || s.order_id === ORDER_ID,
    );

    expect(match).toBeTruthy();
    expect(match.status).toBe("processing");
    expect(match.productAmount ?? match.product_amount).toBe(20000);
    expect(match.netPayout ?? match.net_payout).toBe(17640);
    expect(match.commission).toBe(2000);
  });
});
