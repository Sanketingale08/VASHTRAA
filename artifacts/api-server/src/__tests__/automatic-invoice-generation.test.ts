import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { signAccessToken } from "../lib/jwt";
import { mongoOrders, mongoGeneric, isMongoDbConnected } from "@workspace/db";
import {
  findStoredInvoice,
  listInvoicesForOrder,
  ensureOrderInvoicesGenerated,
  type StoredInvoiceSnapshot,
} from "../lib/invoiceStorage";
import { confirmOrderPayment } from "../routes/payments";

describe("Automatic Invoice Generation Workflow — Online Payment & Cash on Delivery", () => {
  const customerId = "cust_auto_inv_1";
  const customerToken = signAccessToken({ sub: customerId, role: "customer", email: "auto_cust@example.com" });

  const sellerAId = "seller_auto_A";
  const sellerBId = "seller_auto_B";

  const codOrderId = "ORD-AUTO-COD-101";
  const onlineOrderId = "ORD-AUTO-ONLINE-102";
  const multiOnlineOrderId = "ORD-AUTO-MULTI-103";

  beforeAll(async () => {
    // Clean up test orders & snapshots
    try {
      await mongoOrders.delete(codOrderId).catch(() => {});
      await mongoOrders.delete(onlineOrderId).catch(() => {});
      await mongoOrders.delete(multiOnlineOrderId).catch(() => {});
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
        await col.deleteMany({ orderId: { $in: [codOrderId, onlineOrderId, multiOnlineOrderId] } }).catch(() => {});
      }
    } catch {}

    // Seed test orders into mongoOrders
    await mongoOrders.insert({
      id: codOrderId,
      displayId: "COD-101",
      userId: customerId,
      paymentMethod: "cod",
      paymentStatus: "pending",
      status: "confirmed",
      total: 3500,
      subtotal: 3333.33,
      tax: 166.67,
      shipping: 0,
      createdAt: new Date().toISOString(),
      address: {
        name: "Pooja Patel",
        phone: "9876543210",
        line1: "42 MG Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
      },
      items: [
        {
          productId: "prod_paithani_saree_1",
          name: "Yeola Pure Silk Paithani",
          price: 3500,
          quantity: 1,
          vendorId: sellerAId,
          vendorName: "Yeola Heritage Handlooms",
          images: ["/images/paithani-1.png"],
        },
      ],
    });

    await mongoOrders.insert({
      id: onlineOrderId,
      displayId: "ONLINE-102",
      userId: customerId,
      paymentMethod: "upi",
      paymentStatus: "pending",
      status: "pending",
      total: 4200,
      subtotal: 4000,
      tax: 200,
      shipping: 0,
      createdAt: new Date().toISOString(),
      address: {
        name: "Rahul Verma",
        phone: "9822001122",
        line1: "15 Marine Lines",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400020",
      },
      items: [
        {
          productId: "prod_designer_saree_1",
          name: "Embroidered Georgette Designer Saree",
          price: 4200,
          quantity: 1,
          vendorId: sellerBId,
          vendorName: "Varanasi Heritage Weaves",
          images: ["/images/designer-1.png"],
        },
      ],
    });

    await mongoOrders.insert({
      id: multiOnlineOrderId,
      displayId: "MULTI-103",
      userId: customerId,
      paymentMethod: "card",
      paymentStatus: "pending",
      status: "pending",
      total: 10000,
      subtotal: 9345.23,
      tax: 654.77,
      shipping: 0,
      createdAt: new Date().toISOString(),
      address: {
        name: "Sunita Deshmukh",
        phone: "9822334455",
        line1: "78 Bandra Kurla Complex",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400051",
      },
      items: [
        {
          productId: "prod_paithani_saree_2",
          name: "Kavadi Motif Paithani Saree",
          price: 7000,
          quantity: 1,
          vendorId: sellerAId,
          vendorName: "Yeola Heritage Handlooms",
          images: ["/images/paithani-2.png"],
        },
        {
          productId: "prod_designer_saree_2",
          name: "Chiffon Zari Designer Saree",
          price: 3000,
          quantity: 1,
          vendorId: sellerBId,
          vendorName: "Varanasi Heritage Weaves",
          images: ["/images/designer-2.png"],
        },
      ],
    });
  });

  afterAll(async () => {
    try {
      await mongoOrders.delete(codOrderId).catch(() => {});
      await mongoOrders.delete(onlineOrderId).catch(() => {});
      await mongoOrders.delete(multiOnlineOrderId).catch(() => {});
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
        await col.deleteMany({ orderId: { $in: [codOrderId, onlineOrderId, multiOnlineOrderId] } }).catch(() => {});
      }
    } catch {}
  });

  it("1. Automatically generates and stores invoice when a COD order is created", async () => {
    const codOrder = await mongoOrders.findById(codOrderId);
    expect(codOrder).toBeDefined();

    // Trigger automatic generation
    const snapshots = await ensureOrderInvoicesGenerated(codOrder);
    expect(snapshots.length).toBeGreaterThan(0);

    const snapshot = snapshots[0];
    expect(snapshot.orderId).toBe(codOrderId);
    expect(snapshot.masterOrderId).toBe(codOrderId);
    expect(snapshot.documentType).toBe("tax_invoice");
    expect(snapshot.documentTitle).toBe("TAX INVOICE");
    expect(snapshot.paymentMethod).toBe("COD");
    expect(snapshot.paymentStatus).toBe("PENDING");
    expect(snapshot.financials.grandTotal).toBe(3500);

    // Verify snapshot is stored in database
    const stored = await findStoredInvoice(codOrderId, undefined, "tax_invoice");
    expect(stored).toBeDefined();
    expect(stored?.invoiceNumber).toBe(snapshot.invoiceNumber);

    // Verify order record was updated with invoiceNumber and invoiceUrl
    const updatedOrder = await mongoOrders.findById(codOrderId);
    expect(updatedOrder?.invoiceNumber).toBe(snapshot.invoiceNumber);
    expect(updatedOrder?.invoiceUrl).toBe(`/api/orders/${codOrderId}/invoice`);
  });

  it("2. Automatically generates and stores invoice when Online Payment is confirmed", async () => {
    // Confirm payment via confirmOrderPayment (called by Cashfree webhook/verify-order)
    const result = await confirmOrderPayment(onlineOrderId, {
      paymentId: "CF_PAY_TEST_AUTO_999",
      paymentMethod: "upi",
      amount: 4200,
    });

    expect(result.success).toBe(true);
    expect(result.order.paymentStatus).toBe("paid");
    expect(result.order.status).toBe("confirmed");

    // Verify stored snapshot was automatically generated
    const stored = await findStoredInvoice(onlineOrderId, undefined, "tax_invoice");
    expect(stored).toBeDefined();
    expect(stored?.documentType).toBe("tax_invoice");
    expect(stored?.paymentMethod).toBe("UPI");
    expect(stored?.paymentStatus).toBe("PAID");
    expect(stored?.gatewayReference).toBe("CF_PAY_TEST_AUTO_999");
    expect(stored?.financials.grandTotal).toBe(4200);

    // Verify customer and order linkages
    expect(stored?.customerId).toBe(customerId);
    expect(stored?.masterOrderId).toBe(onlineOrderId);
    expect(stored?.sellerId).toBe(sellerBId);
  }, 25000);

  it("3. Multi-Seller Online Order automatically generates Master Order Summary AND separate Seller Invoices", async () => {
    // Confirm payment for multi-seller checkout
    const result = await confirmOrderPayment(multiOnlineOrderId, {
      paymentId: "CF_PAY_MULTI_CARD_888",
      paymentMethod: "card",
      amount: 10000,
    });

    expect(result.success).toBe(true);

    // List all invoices generated for this order
    const snapshots = await listInvoicesForOrder(multiOnlineOrderId);
    expect(snapshots.length).toBe(3); // Master Order Summary + Seller A + Seller B

    const mos = snapshots.find((s) => s.documentType === "master_order_summary");
    const invA = snapshots.find((s) => s.sellerId === sellerAId);
    const invB = snapshots.find((s) => s.sellerId === sellerBId);

    expect(mos).toBeDefined();
    expect(mos?.documentTitle).toBe("MASTER ORDER SUMMARY");
    expect(mos?.financials.grandTotal).toBe(10000);
    expect(mos?.sellerId).toBeNull(); // Marketplace summary

    expect(invA).toBeDefined();
    expect(invA?.documentTitle).toBe("TAX INVOICE");
    expect(invA?.financials.grandTotal).toBe(7000); // 7000 attributable to Seller A

    expect(invB).toBeDefined();
    expect(invB?.documentTitle).toBe("TAX INVOICE");
    expect(invB?.financials.grandTotal).toBe(3000); // 3000 attributable to Seller B

    // Check financial reconciliation
    expect(Number(invA?.financials.grandTotal || 0) + Number(invB?.financials.grandTotal || 0)).toBe(Number(mos?.financials.grandTotal));
  }, 25000);

  it("4. Idempotency: Retrying confirmation or refreshing page creates ZERO duplicate records", async () => {
    const initialList = await listInvoicesForOrder(multiOnlineOrderId);
    const initialCount = initialList.length;
    const initialInvNumbers = initialList.map((s) => s.invoiceNumber).sort();

    // Simulate page refresh or retried payment webhook
    const order = await mongoOrders.findById(multiOnlineOrderId);
    const secondCall = await ensureOrderInvoicesGenerated(order);

    const afterList = await listInvoicesForOrder(multiOnlineOrderId);
    expect(afterList.length).toBe(initialCount);
    expect(afterList.map((s) => s.invoiceNumber).sort()).toEqual(initialInvNumbers);
  });

  it("5. Template Consistency: Single-seller and Multi-seller all use the same approved template", async () => {
    const resSingleJson = await request(app)
      .get(`/api/orders/${onlineOrderId}/invoice?format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(resSingleJson.status).toBe(200);
    expect(resSingleJson.body.template).toBe("vastraa-v2");

    const resSingleHtml = await request(app)
      .get(`/api/orders/${onlineOrderId}/invoice?format=html`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(resSingleHtml.status).toBe(200);
    expect(resSingleHtml.text).toContain("TAX INVOICE");
    expect(resSingleHtml.text).toContain("BILL OF SUPPLY");

    const resMultiJson = await request(app)
      .get(`/api/orders/${multiOnlineOrderId}/invoice?documentType=master_order_summary&format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(resMultiJson.status).toBe(200);
    expect(resMultiJson.body.template).toBe("vastraa-v2");

    const resMultiHtml = await request(app)
      .get(`/api/orders/${multiOnlineOrderId}/invoice?documentType=master_order_summary&format=html`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(resMultiHtml.status).toBe(200);
    expect(resMultiHtml.text).toContain("TAX INVOICE");
    expect(resMultiHtml.text).toContain("BILL OF SUPPLY");
  });
});
