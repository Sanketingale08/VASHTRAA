import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import app from "../app";
import { mongoOrders, mongoShipments } from "@workspace/db";

const ADMIN_KEY = process.env.ADMIN_KEY || "Admin@123";

describe("Admin Orders API Endpoints", () => {
  const testOrderId = `ord_saree_${Date.now()}`;
  const testOrderDoc = {
    id: testOrderId,
    displayId: "V999",
    userId: "usr_sneha_patil",
    customerName: "Sneha Patil",
    address: {
      name: "Sneha Patil",
      phone: "9876500000",
      line1: "505 FC Road",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411005",
    },
    items: [
      {
        productId: "p_silk_101",
        name: "Authentic Paithani Saree",
        price: 1500000,
        quantity: 1,
        vendorId: "v_yeola_01",
        vendorName: "Yeola Silk Co",
      },
    ],
    total: 1500000,
    status: "confirmed",
    paymentMethod: "upi",
    paymentStatus: "paid",
    statusHistory: [
      { status: "confirmed", timestamp: new Date().toISOString(), note: "Placed order" },
    ],
    isDemo: false,
    isTest: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    try {
      await mongoOrders.insert(testOrderDoc);
    } catch {}
  });

  afterEach(async () => {
    try {
      await mongoOrders.delete(testOrderId);
    } catch {}
  });

  it("rejects unauthorized access without admin credentials", async () => {
    const res = await request(app).get("/api/admin/orders");
    expect([401, 403]).toContain(res.status);
  });

  it("lists realtime orders with admin headers", async () => {
    const res = await request(app)
      .get("/api/admin/orders")
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
    expect(Array.isArray(res.body.orders)).toBe(true);
    const found = res.body.orders.find((o: any) => o.id === testOrderId || o.displayId === "V999");
    expect(found).toBeDefined();
    expect(found.displayId).toBe("V999");
  });

  it("fetches single order details via GET /api/admin/orders/:orderId", async () => {
    const res = await request(app)
      .get(`/api/admin/orders/${testOrderId}`)
      .set("x-admin-key", ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.id).toBe(testOrderId);
    expect(res.body.order.status).toBe("confirmed");
    expect(res.body.shipments).toBeDefined();
  });

  it("updates order status via PATCH /api/admin/orders/:orderId/status", async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${testOrderId}/status`)
      .set("x-admin-key", ADMIN_KEY)
      .send({
        status: "processing",
        note: "Verified by admin, item being packed",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify order was updated in DB
    const updated = await mongoOrders.findById(testOrderId);
    expect(updated.status).toBe("processing");
    const lastHistory = updated.statusHistory[updated.statusHistory.length - 1];
    expect(lastHistory.status).toBe("processing");
    expect(lastHistory.note).toBe("Verified by admin, item being packed");
  });

  it("updates tracking information via PATCH /api/admin/orders/:orderId/tracking", async () => {
    const res = await request(app)
      .patch(`/api/admin/orders/${testOrderId}/tracking`)
      .set("x-admin-key", ADMIN_KEY)
      .send({
        courierName: "Delhivery Surface",
        trackingNumber: "SR-DEL-88776655",
        trackingUrl: "https://delhivery.com/track/SR-DEL-88776655",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await mongoOrders.findById(testOrderId);
    expect(updated.courierName).toBe("Delhivery Surface");
    expect(updated.trackingNumber).toBe("SR-DEL-88776655");
    expect(updated.awbNumber).toBe("SR-DEL-88776655");
  });

  it("cancels an order via POST /api/admin/orders/:orderId/cancel", async () => {
    const res = await request(app)
      .post(`/api/admin/orders/${testOrderId}/cancel`)
      .set("x-admin-key", ADMIN_KEY)
      .send({
        reason: "Customer cancelled via phone support",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updated = await mongoOrders.findById(testOrderId);
    expect(updated.status).toBe("cancelled");
    expect(updated.cancelReason).toBe("Customer cancelled via phone support");
  });
});
