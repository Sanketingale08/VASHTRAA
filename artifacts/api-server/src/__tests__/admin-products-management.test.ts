import { describe, it, expect, beforeAll } from "vitest";
import { connectToMongoDB, mongoProducts, getCollection } from "@workspace/db";
import app from "../app";
import request from "supertest";

const TEST_ADMIN_KEY = "test-e2e-admin-products-key";

describe("Admin Product Management – 5 Actions & Data Synchronization", () => {
  beforeAll(async () => {
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    await connectToMongoDB();
  });

  it("Tests all 5 individual actions: Approve, Reject, Activate, Deactivate, Delete", async () => {
    // 1. Create a fresh test product in MongoDB
    const testId = `PRD_TEST_${Date.now()}`;
    const created = await mongoProducts.insert({
      id: testId,
      name: "Handcrafted Zari Silk Saree E2E Test",
      price: 9999,
      basePrice: 8500,
      category: "paithani",
      status: "pending",
      active: true,
      stock: 12,
      vendorId: "VEND_SELLER_S",
    });

    expect(created.id).toBe(testId);
    let dbDoc = await mongoProducts.findById(testId);
    expect(dbDoc?.status).toBe("pending");

    // ── ACTION 1: APPROVE ───────────────────────────────────────────────────
    const approveRes = await request(app)
      .post(`/api/admin/products/${testId}/approve`)
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ remark: "Approved for storefront listing" });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.product.status).toBe("approved");
    expect(approveRes.body.product.active).toBe(true);

    // Verify MongoDB directly
    dbDoc = await mongoProducts.findById(testId);
    expect(dbDoc?.status).toBe("approved");
    expect(dbDoc?.active).toBe(true);

    // ── ACTION 2: DEACTIVATE ────────────────────────────────────────────────
    const deactivateRes = await request(app)
      .post(`/api/admin/products/${testId}/deactivate`)
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({});

    expect(deactivateRes.status).toBe(200);
    expect(deactivateRes.body.product.active).toBe(false);

    // Verify MongoDB directly
    dbDoc = await mongoProducts.findById(testId);
    expect(dbDoc?.active).toBe(false);

    // ── ACTION 3: ACTIVATE ──────────────────────────────────────────────────
    const activateRes = await request(app)
      .post(`/api/admin/products/${testId}/activate`)
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({});

    expect(activateRes.status).toBe(200);
    expect(activateRes.body.product.active).toBe(true);

    // Verify MongoDB directly
    dbDoc = await mongoProducts.findById(testId);
    expect(dbDoc?.active).toBe(true);

    // ── ACTION 4: REJECT ────────────────────────────────────────────────────
    const rejectRes = await request(app)
      .post(`/api/admin/products/${testId}/reject`)
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ reason: "Quality check failed" });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.product.status).toBe("rejected");
    expect(rejectRes.body.product.active).toBe(false);

    // Verify MongoDB directly
    dbDoc = await mongoProducts.findById(testId);
    expect(dbDoc?.status).toBe("rejected");
    expect(dbDoc?.active).toBe(false);

    // ── ACTION 5: DELETE ────────────────────────────────────────────────────
    const deleteRes = await request(app)
      .delete(`/api/admin/products/${testId}`)
      .set("x-admin-key", TEST_ADMIN_KEY);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.ok).toBe(true);

    // Verify MongoDB directly
    dbDoc = await mongoProducts.findById(testId);
    expect(dbDoc).toBeNull();

    const rawMongo = await getCollection("products").findOne({ id: testId });
    expect(rawMongo).toBeNull();
  });

  it("Tests bulk actions: approve, deactivate, activate, reject, and delete", async () => {
    // Create 3 test products
    const ids: string[] = [];
    for (let i = 1; i <= 3; i++) {
      const pid = `PRD_BULK_${Date.now()}_${i}`;
      await mongoProducts.insert({
        id: pid,
        name: `Bulk Test Saree ${i}`,
        price: 5000 + i * 500,
        status: "pending",
        active: true,
        category: "paithani",
        vendorId: "VEND_SELLER_S",
      });
      ids.push(pid);
    }

    // Bulk Approve
    const bulkApprove = await request(app)
      .post("/api/admin/products/bulk")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ ids, action: "approve" });
    expect(bulkApprove.status).toBe(200);

    for (const id of ids) {
      const doc = await mongoProducts.findById(id);
      expect(doc?.status).toBe("approved");
      expect(doc?.active).toBe(true);
    }

    // Bulk Deactivate
    const bulkDeactivate = await request(app)
      .post("/api/admin/products/bulk")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ ids, action: "deactivate" });
    expect(bulkDeactivate.status).toBe(200);

    for (const id of ids) {
      const doc = await mongoProducts.findById(id);
      expect(doc?.active).toBe(false);
    }

    // Bulk Activate
    const bulkActivate = await request(app)
      .post("/api/admin/products/bulk")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ ids, action: "activate" });
    expect(bulkActivate.status).toBe(200);

    for (const id of ids) {
      const doc = await mongoProducts.findById(id);
      expect(doc?.active).toBe(true);
    }

    // Bulk Reject
    const bulkReject = await request(app)
      .post("/api/admin/products/bulk")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ ids, action: "reject" });
    expect(bulkReject.status).toBe(200);

    for (const id of ids) {
      const doc = await mongoProducts.findById(id);
      expect(doc?.status).toBe("rejected");
      expect(doc?.active).toBe(false);
    }

    // Bulk Delete
    const bulkDelete = await request(app)
      .post("/api/admin/products/bulk")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ ids, action: "delete" });
    expect(bulkDelete.status).toBe(200);

    for (const id of ids) {
      const doc = await mongoProducts.findById(id);
      expect(doc).toBeNull();
      const raw = await getCollection("products").findOne({ id });
      expect(raw).toBeNull();
    }
  });
});

