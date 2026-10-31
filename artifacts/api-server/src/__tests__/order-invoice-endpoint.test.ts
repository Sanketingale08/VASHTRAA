import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { signAccessToken } from "../lib/jwt";
import { mongoOrders, db, ordersTable, eq } from "@workspace/db";

describe("GET /api/orders/:orderId/invoice API Endpoint & Access Control", () => {
  const customerId = "test-invoice-cust-1";
  const customerToken = signAccessToken({ sub: customerId, role: "customer", email: "cust1@example.com" });

  const otherCustomerId = "test-invoice-cust-2";
  const otherCustomerToken = signAccessToken({ sub: otherCustomerId, role: "customer", email: "cust2@example.com" });

  const vendorSellerId = "vendor-invoice-seller-1";
  const vendorToken = signAccessToken({ sub: vendorSellerId, role: "vendor", email: "vendor1@example.com" });

  const otherVendorSellerId = "vendor-invoice-seller-2";
  const otherVendorToken = signAccessToken({ sub: otherVendorSellerId, role: "vendor", email: "vendor2@example.com" });

  const testOrderId = "ORD-INV-TEST-999";
  const adminKey = process.env.ADMIN_API_KEY || "vastraa-super-secret-admin-key-change-in-production";

  beforeAll(async () => {
    // Seed order into mongoOrders
    try {
      await mongoOrders.delete(testOrderId).catch(() => {});
      await mongoOrders.insert({
        id: testOrderId,
        displayId: "V999",
        userId: customerId,
        paymentStatus: "PAID",
        status: "processing",
        total: 1155.0,
        subtotal: 1100.0,
        shipping: 0,
        tax: 55.0,
        createdAt: new Date().toISOString(),
        paymentMethod: "UPI",
        address: {
          name: "Radhika Kulkarni",
          phone: "9876543210",
          line1: "Flat 402, Lotus Residency",
          line2: "Kothrud",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411038",
        },
        items: [
          {
            id: "item-1",
            productId: "prod-1",
            name: "Pure Silk Paithani Saree",
            price: 1155.0,
            quantity: 1,
            vendorName: "Heritage Weavers",
            vendorId: vendorSellerId,
            sku: "PAI-SILK-001",
            hsn: "5007",
            gst_rate: 5.0,
          },
        ],
      } as any);
    } catch (e) {
      console.error("Failed to seed order for invoice endpoint test", e);
    }
  });

  afterAll(async () => {
    try {
      await mongoOrders.delete(testOrderId).catch(() => {});
      await db.delete(ordersTable).where(eq(ordersTable.id, testOrderId)).catch(() => {});
    } catch {}
  });

  it("returns 401 Unauthorized when no credentials or admin key are provided", async () => {
    const res = await request(app).get(`/api/orders/${testOrderId}/invoice`);
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Authentication required");
  });

  it("returns 403 Forbidden when a different customer tries to access the invoice", async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}/invoice`)
      .set("Authorization", `Bearer ${otherCustomerToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not authorized");
  });

  it("returns 403 Forbidden when a different vendor tries to access the invoice", async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}/invoice`)
      .set("Authorization", `Bearer ${otherVendorToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not authorized");
  });

  it("allows order owner (customer) to retrieve invoice as JSON (?format=json)", async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}/invoice?format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.template).toBe("vastraa-v2");
    expect(res.body.invoiceData).toBeDefined();

    const data = res.body.invoiceData;
    expect(data.invoice.number).toBe("INV-V999");
    expect(data.bos.number).toBe("BOS-V999");
    expect(data.customer.name).toBe("Radhika Kulkarni");
    expect(data.seller.name).toBe("Heritage Weavers");
    expect(data.items).toHaveLength(1);
    expect(data.items[0].name).toBe("Pure Silk Paithani Saree");
    expect(data.items[0].unit_price).toBe(1155.0);
    expect(data.items[0].taxable).toBe(1100.0);
    expect(data.items[0].cgst).toBe(27.5);
    expect(data.items[0].sgst).toBe(27.5);
    expect(data.tax.intra_state).toBe(true);
  });

  it("allows order owner (customer) to retrieve rendered HTML (?format=html)", async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}/invoice?format=html`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.text).toContain("TAX INVOICE");
    expect(res.text).toContain("BILL OF SUPPLY");
    expect(res.text).toContain("INV-V999");
    expect(res.text).toContain("Heritage Weavers");
  });

  it("allows admin access via x-admin-key header", async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}/invoice?format=json`)
      .set("x-admin-key", adminKey);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.invoiceData.invoice.number).toBe("INV-V999");
  });

  it("allows vendor access when the vendor owns items in the order", async () => {
    const res = await request(app)
      .get(`/api/orders/${testOrderId}/invoice?format=json`)
      .set("Authorization", `Bearer ${vendorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.invoiceData.seller.name).toBe("Heritage Weavers");
  });

  it("redirects or forwards root alias /orders/:orderId/invoice to /api/orders/:orderId/invoice", async () => {
    const res = await request(app)
      .get(`/orders/${testOrderId}/invoice?format=json`)
      .set("x-admin-key", adminKey);

    // Express redirect gives 302 or 307
    expect([200, 302, 307]).toContain(res.status);
    if (res.status === 302 || res.status === 307) {
      expect(res.headers.location).toContain(`/api/orders/${testOrderId}/invoice`);
    }
  });
});
