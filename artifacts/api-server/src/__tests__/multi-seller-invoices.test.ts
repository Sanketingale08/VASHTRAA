import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { signAccessToken } from "../lib/jwt";
import { mongoOrders, mongoGeneric, isMongoDbConnected } from "@workspace/db";
import { findStoredInvoice, saveInvoiceSnapshot, type StoredInvoiceSnapshot } from "../lib/invoiceStorage";

describe("Multi-Seller Invoice Management, Master Order Summary, & Snapshot Immutability", () => {
  const customerId = "cust_multi_seller_1";
  const customerToken = signAccessToken({ sub: customerId, role: "customer", email: "customer@example.com" });

  const sellerAId = "seller_heritage_weavers";
  const sellerAToken = signAccessToken({ sub: sellerAId, role: "vendor", email: "sellerA@example.com" });

  const sellerBId = "seller_varanasi_silks";
  const sellerBToken = signAccessToken({ sub: sellerBId, role: "vendor", email: "sellerB@example.com" });

  const strangerSellerId = "seller_unrelated";
  const strangerSellerToken = signAccessToken({ sub: strangerSellerId, role: "vendor", email: "stranger@example.com" });

  const adminKey = process.env.ADMIN_API_KEY || "vastraa-super-secret-admin-key-change-in-production";

  const multiOrderId = "ORD-MULTI-TEST-100";
  const codOrderId = "ORD-COD-TEST-200";

  beforeAll(async () => {
    // Clean up any previous test orders or snapshots
    try {
      await mongoOrders.delete(multiOrderId).catch(() => {});
      await mongoOrders.delete(codOrderId).catch(() => {});
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
        await col.deleteMany({ orderId: { $in: [multiOrderId, codOrderId] } }).catch(() => {});
      }
    } catch {}

    // 1. Seed Multi-Seller Order (Paid via UPI)
    // Seller A: Paithani ₹5,000 (taxable 4761.90, 5% GST 238.10) + Silk ₹2,000 (taxable 1904.76, 5% GST 95.24) -> Total ₹7,000
    // Seller B: Designer ₹3,000 (taxable 2678.57, 12% GST 321.43) -> Total ₹3,000
    // Master Total: ₹10,000
    try {
      await mongoOrders.insert({
        id: multiOrderId,
        displayId: "V100",
        userId: customerId,
        paymentStatus: "PAID",
        status: "processing",
        total: 10000.0,
        subtotal: 9345.23,
        shipping: 0,
        tax: 654.77,
        createdAt: "2026-10-20T10:00:00.000Z",
        paymentMethod: "UPI",
        cashfreePaymentId: "CF_PAY_UPI_98765",
        address: {
          name: "Ananya Sharma",
          phone: "9123456780",
          line1: "12B, Nariman Point",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400021",
        },
        items: [
          {
            id: "item-a1",
            productId: "prod-paithani-1",
            name: "Yeola Pure Silk Paithani Saree",
            price: 5000.0,
            quantity: 1,
            vendorName: "Heritage Weavers",
            vendorId: sellerAId,
            sellerId: sellerAId,
            sku: "PAI-YEO-001",
            hsn: "5007",
            gst_rate: 5.0,
          },
          {
            id: "item-b1",
            productId: "prod-designer-1",
            name: "Royal Zari Designer Saree",
            price: 3000.0,
            quantity: 1,
            vendorName: "Varanasi Silks",
            vendorId: sellerBId,
            sellerId: sellerBId,
            sku: "DES-ROY-002",
            hsn: "5208",
            gst_rate: 12.0,
          },
          {
            id: "item-a2",
            productId: "prod-silk-2",
            name: "Classic Mulberry Silk Saree",
            price: 2000.0,
            quantity: 1,
            vendorName: "Heritage Weavers",
            vendorId: sellerAId,
            sellerId: sellerAId,
            sku: "SLK-MUL-003",
            hsn: "5007",
            gst_rate: 5.0,
          },
        ],
      } as any);

      // 2. Seed COD Order (Payment Pending)
      await mongoOrders.delete(codOrderId).catch(() => {});
      await mongoOrders.insert({
        id: codOrderId,
        displayId: "V200",
        userId: customerId,
        paymentStatus: "PENDING",
        status: "confirmed",
        total: 5000.0,
        subtotal: 4761.90,
        shipping: 0,
        tax: 238.10,
        createdAt: "2026-10-21T11:00:00.000Z",
        paymentMethod: "COD",
        address: {
          name: "Ananya Sharma",
          phone: "9123456780",
          line1: "12B, Nariman Point",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400021",
        },
        items: [
          {
            id: "item-cod-1",
            productId: "prod-paithani-1",
            name: "Yeola Pure Silk Paithani Saree",
            price: 5000.0,
            quantity: 1,
            vendorName: "Heritage Weavers",
            vendorId: sellerAId,
            sellerId: sellerAId,
            sku: "PAI-YEO-001",
            hsn: "5007",
            gst_rate: 5.0,
          },
        ],
      } as any);
    } catch (e) {
      console.error("Failed to seed multi-seller test orders", e);
    }
  });

  afterAll(async () => {
    try {
      await mongoOrders.delete(multiOrderId).catch(() => {});
      await mongoOrders.delete(codOrderId).catch(() => {});
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection<StoredInvoiceSnapshot>("invoices");
        await col.deleteMany({ orderId: { $in: [multiOrderId, codOrderId] } }).catch(() => {});
      }
    } catch {}
  });

  it("1. Lists all invoice documents for customer (Master Order Summary + Seller A + Seller B)", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiOrderId}/invoices`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isMultiVendor).toBe(true);

    const docs = res.body.documents;
    expect(docs.length).toBeGreaterThanOrEqual(3);

    const mos = docs.find((d: any) => d.documentType === "master_order_summary");
    expect(mos).toBeDefined();
    expect(mos.invoiceNumber).toBe("MOS-V100");
    expect(mos.grandTotal).toBe(10000.0);

    const sellerADoc = docs.find((d: any) => d.sellerId === sellerAId);
    expect(sellerADoc).toBeDefined();
    expect(sellerADoc.documentType).toBe("tax_invoice");
    expect(sellerADoc.grandTotal).toBe(7000.0);

    const sellerBDoc = docs.find((d: any) => d.sellerId === sellerBId);
    expect(sellerBDoc).toBeDefined();
    expect(sellerBDoc.documentType).toBe("tax_invoice");
    expect(sellerBDoc.grandTotal).toBe(3000.0);
  }, 25000);

  it("2. Strictly isolates Seller A from seeing Seller B's invoice or Master Order Summary", async () => {
    // Seller A list invoices
    const listRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoices`)
      .set("Authorization", `Bearer ${sellerAToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.documents.every((d: any) => d.sellerId === sellerAId)).toBe(true);
    expect(listRes.body.documents.some((d: any) => d.sellerId === sellerBId)).toBe(false);
    expect(listRes.body.documents.some((d: any) => d.documentType === "master_order_summary")).toBe(false);

    // Seller A cannot fetch Master Order Summary directly (403 Forbidden)
    const mosRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?documentType=master_order_summary`)
      .set("Authorization", `Bearer ${sellerAToken}`);
    expect(mosRes.status).toBe(403);
    expect(mosRes.body.error).toContain("master order summary");

    // Seller A cannot fetch Seller B's tax invoice directly (403 Forbidden)
    const sellerBRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?vendorId=${sellerBId}`)
      .set("Authorization", `Bearer ${sellerAToken}`);
    expect(sellerBRes.status).toBe(403);

    // Unrelated Seller cannot access the order at all (403 Forbidden)
    const strangerRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice`)
      .set("Authorization", `Bearer ${strangerSellerToken}`);
    expect(strangerRes.status).toBe(403);
  }, 25000);

  it("3. Master Order Summary contains all 3 products totaling ₹10,000", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?documentType=master_order_summary&format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    const inv = res.body.invoiceData;
    expect(inv.invoice.number).toBe("MOS-V100");
    expect(inv.document_title).toBe("MASTER ORDER SUMMARY");
    expect(inv.items).toHaveLength(3);
    expect(inv.totals.grand).toBe(10000.0);
    expect(inv.totals.words).toBe("Ten Thousand Rupees Only");
    expect(inv.company.legal_name).toContain("Vastraa");
  });

  it("4. Seller A Tax Invoice contains ONLY Seller A items (2 sarees totaling ₹7,000)", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?vendorId=${sellerAId}&format=json`)
      .set("Authorization", `Bearer ${sellerAToken}`);

    expect(res.status).toBe(200);
    const inv = res.body.invoiceData;
    expect(inv.document_title).toBe("TAX INVOICE");
    expect(inv.seller.name).toBe("Heritage Weavers");
    expect(inv.items).toHaveLength(2);
    expect(inv.items.map((it: any) => it.sku)).toEqual(["PAI-YEO-001", "SLK-MUL-003"]);
    expect(inv.totals.items_subtotal).toBe(7000.0);
    expect(inv.totals.grand).toBe(7000.0);
    expect(inv.totals.words).toBe("Seven Thousand Rupees Only");
  });

  it("5. Seller B Tax Invoice contains ONLY Seller B items (1 saree totaling ₹3,000)", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?vendorId=${sellerBId}&format=json`)
      .set("Authorization", `Bearer ${sellerBToken}`);

    expect(res.status).toBe(200);
    const inv = res.body.invoiceData;
    expect(inv.document_title).toBe("TAX INVOICE");
    expect(inv.seller.name).toBe("Varanasi Silks");
    expect(inv.items).toHaveLength(1);
    expect(inv.items[0].sku).toBe("DES-ROY-002");
    expect(inv.items[0].total).toBe(3000.0);
    expect(inv.totals.grand).toBe(3000.0);
    expect(inv.totals.words).toBe("Three Thousand Rupees Only");
  });

  it("6. Reconciles seller invoices with Master Order Summary (₹7,000 + ₹3,000 = ₹10,000)", async () => {
    const mosRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?documentType=master_order_summary&format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    const sellerARes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?vendorId=${sellerAId}&format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    const sellerBRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?vendorId=${sellerBId}&format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    const mosTotal = mosRes.body.invoiceData.totals.grand;
    const sellerATotal = sellerARes.body.invoiceData.totals.grand;
    const sellerBTotal = sellerBRes.body.invoiceData.totals.grand;

    expect(sellerATotal + sellerBTotal).toBe(mosTotal);
  });

  it("7. Displays correct payment status and gateway reference for Online Paid order", async () => {
    const res = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?documentType=master_order_summary&format=html`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("CF_PAY_UPI_98765");
    expect(res.text).toContain("Order total paid via UPI");
  });

  it("8. Displays correct COD payment status (PENDING on Delivery) for COD order", async () => {
    const res = await request(app)
      .get(`/api/orders/${codOrderId}/invoice?format=html`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
    expect(res.text).toContain("Cash on Delivery");
    expect(res.text).toContain("Payment: PENDING on Delivery");
  });

  it("9. Generates Credit Note when requested for refunded/cancelled order", async () => {
    // Update multi-seller order to cancelled/refunded
    await mongoOrders.update(multiOrderId, {
      status: "cancelled",
      refundReference: "REF-CASHFREE-778899",
      refundAmount: 10000.0,
      cancelReason: "Customer requested cancellation before dispatch",
    });

    const cnRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?documentType=credit_note&format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(cnRes.status).toBe(200);
    const inv = cnRes.body.invoiceData;
    expect(inv.invoice.number).toBe("CN-V100");
    expect(inv.document_title).toBe("CREDIT NOTE");
    expect(inv.order.payment_status).toBe("REFUNDED");
    expect(inv.order.refund_ref).toBe("REF-CASHFREE-778899");
    expect(inv.order.original_invoice_no).toBeDefined();

    // Verify HTML contains Credit Note details
    const cnHtmlRes = await request(app)
      .get(`/api/orders/${multiOrderId}/invoice?documentType=credit_note&format=html`)
      .set("Authorization", `Bearer ${customerToken}`);
    expect(cnHtmlRes.status).toBe(200);
    expect(cnHtmlRes.text).toContain("CREDIT NOTE");
    expect(cnHtmlRes.text).toContain("Original Invoice No:");
    expect(cnHtmlRes.text.toLowerCase()).toContain("refunded");
    expect(cnHtmlRes.text).toContain("REF-CASHFREE-778899");
  });

  it("10. Guarantees Snapshot Immutability (subsequent requests return identical stored snapshot)", async () => {
    // Check initial stored snapshot for COD order
    const firstRes = await request(app)
      .get(`/api/orders/${codOrderId}/invoice?format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(firstRes.status).toBe(200);
    const firstInvoiceNumber = firstRes.body.invoiceData.invoice.number;
    const firstGrandTotal = firstRes.body.invoiceData.totals.grand;

    // Simulate price tampering or product price update in database
    await mongoOrders.update(codOrderId, {
      total: 99999.0, // Tampered total in DB
      address: {
        name: "Different Tampered Name",
      },
    });

    // Re-download invoice
    const secondRes = await request(app)
      .get(`/api/orders/${codOrderId}/invoice?format=json`)
      .set("Authorization", `Bearer ${customerToken}`);

    expect(secondRes.status).toBe(200);
    // Verified: Served from immutable snapshot, so invoice total and customer remain unchanged!
    expect(secondRes.body.invoiceData.invoice.number).toBe(firstInvoiceNumber);
    expect(secondRes.body.invoiceData.totals.grand).toBe(firstGrandTotal);
    expect(secondRes.body.invoiceData.customer.name).toBe("Ananya Sharma");
  });
});
