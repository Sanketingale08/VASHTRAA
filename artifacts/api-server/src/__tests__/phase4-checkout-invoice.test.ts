import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { calculateVastraaFinancials } from "../lib/pricingEngine";
import { signAccessToken } from "../lib/jwt";
import { mongoVendors, mongoProducts, mongoOrders, db, vendorsTable, productsTable, ordersTable, eq } from "@workspace/db";

describe("Phase 4: Customer Checkout & Invoice PDF Breakdown", () => {
  const customerId = "test-customer-phase4";
  const customerToken = signAccessToken({ sub: customerId, role: "customer", email: "customer.p4@example.com" });
  const sellerId = "vendor-seller-p4";

  beforeAll(async () => {
    try {
      await mongoVendors.insert({
        id: sellerId,
        ownerId: sellerId,
        vendorId: sellerId,
        sellerId,
        name: "Phase 4 Handlooms",
        contactEmail: "p4@example.com",
        status: "approved",
      } as any).catch(() => {});

      await db.insert(vendorsTable).values({
        id: sellerId,
        name: "Phase 4 Handlooms",
        contactEmail: "p4@example.com",
        status: "approved",
        ownerId: sellerId,
      }).onConflictDoNothing();

      const prod1Id = "650000000000000000000001";
      const prod2Id = "650000000000000000000002";

      await mongoProducts.insert({
        _id: prod1Id as any,
        id: prod1Id,
        name: "Paithani Silk Saree",
        price: 1000,
        stock: 10,
        vendorName: "Phase 4 Handlooms",
        vendorId: sellerId,
        active: true,
        status: "approved",
      } as any).catch(() => {});

      await db.insert(productsTable).values({
        id: prod1Id,
        name: "Paithani Silk Saree",
        price: 1000,
        stock: 10,
        vendorName: "Phase 4 Handlooms",
        vendorId: sellerId,
        category: "saree",
      }).onConflictDoNothing();

      await mongoProducts.insert({
        _id: prod2Id as any,
        id: prod2Id,
        name: "Kanjeevaram Silk Saree",
        price: 2000,
        stock: 10,
        vendorName: "Phase 4 Handlooms",
        vendorId: sellerId,
        active: true,
        status: "approved",
      } as any).catch(() => {});

      await db.insert(productsTable).values({
        id: prod2Id,
        name: "Kanjeevaram Silk Saree",
        price: 2000,
        stock: 10,
        vendorName: "Phase 4 Handlooms",
        vendorId: sellerId,
        category: "saree",
      }).onConflictDoNothing();
    } catch {}
  });

  describe("1. Intra-State Order (Seller: MH, Customer: MH)", () => {
    it("computes exact intra-state GST split (CGST 2.5% + SGST 2.5%) and customer total equals stored customerPays to the paisa", () => {
      const basePricePaise = 100000; // ₹1,000
      const shippingPaise = 10000;  // ₹100
      const financials = calculateVastraaFinancials({
        basePricePaise,
        shippingPaise,
        productGstBps: 500,
        intraState: true,
      });

      expect(financials.sellerBasePrice).toBe(100000);
      expect(financials.platformCommission).toBe(18000); // ₹180
      expect(financials.shippingFee).toBe(10000);         // ₹100
      expect(financials.taxableAmount).toBe(110000);      // ₹1,100
      expect(financials.gstAmount).toBe(5500);            // ₹55
      expect(financials.cgst).toBe(2750);                 // ₹27.50 (2.5%)
      expect(financials.sgst).toBe(2750);                 // ₹27.50 (2.5%)
      expect(financials.igst).toBe(0);                    // ₹0
      expect(financials.customerPays).toBe(115500);       // ₹1,155.00

      // Total equality check
      const sumComponents = financials.taxableAmount + financials.cgst + financials.sgst;
      expect(sumComponents).toBe(financials.customerPays);
    });

    it("creates an intra-state order via API and validates stored financial breakdown on order", async () => {
      const payload = {
        items: [
          {
            productId: "650000000000000000000001",
            name: "Paithani Silk Saree",
            price: 1000,
            quantity: 1,
            vendorName: "Phase 4 Handlooms",
            vendorId: sellerId,
          }
        ],
        address: {
          name: "Anita Deshmukh",
          phone: "9876543210",
          line1: "123 MG Road",
          city: "Mumbai",
          state: "Maharashtra", // Intra-state
          pincode: "400001",
        },
        deliveryMethod: "standard",
        paymentMethod: "upi",
        subtotal: 1000,
        shipping: 199,
        tax: 59.95,
        total: 1258.95,
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.orderId).toBeDefined();

      const order = res.body.order;
      expect(order).toBeDefined();
      expect(order.financials).toBeDefined();

      // Stored customerPays must equal sum of taxableAmount + gstAmount to the paisa (125895 paise)
      expect(order.financials.sellerBasePrice).toBe(100000);
      expect(order.financials.platformCommission).toBe(18000);
      expect(order.financials.shippingFee).toBe(19900);
      expect(order.financials.taxableAmount).toBe(119900);
      expect(order.financials.gstAmount).toBe(5995);
      expect(order.financials.cgst).toBe(2997);
      expect(order.financials.sgst).toBe(2998);
      expect(order.financials.igst).toBe(0);
      expect(order.financials.customerPays).toBe(125895);
    }, 20000);
  });

  describe("2. Inter-State Order (Seller: MH, Customer: KA)", () => {
    it("computes exact inter-state GST split (IGST 5%) and customer total equals stored customerPays to the paisa", () => {
      const basePricePaise = 200000; // ₹2,000
      const shippingPaise = 10000;  // ₹100
      const financials = calculateVastraaFinancials({
        basePricePaise,
        shippingPaise,
        productGstBps: 500,
        intraState: false, // Inter-state
      });

      expect(financials.sellerBasePrice).toBe(200000);
      expect(financials.platformCommission).toBe(36000); // ₹360
      expect(financials.shippingFee).toBe(10000);         // ₹100
      expect(financials.taxableAmount).toBe(210000);      // ₹2,100
      expect(financials.gstAmount).toBe(10500);           // ₹105
      expect(financials.cgst).toBe(0);
      expect(financials.sgst).toBe(0);
      expect(financials.igst).toBe(10500);                // ₹105 (5%)
      expect(financials.customerPays).toBe(220500);       // ₹2,205.00

      // Total equality check
      const sumComponents = financials.taxableAmount + financials.igst;
      expect(sumComponents).toBe(financials.customerPays);
    });

    it("creates an inter-state order via API and validates stored financial breakdown on order", async () => {
      const payload = {
        items: [
          {
            productId: "650000000000000000000002",
            name: "Kanjeevaram Silk Saree",
            price: 2000,
            quantity: 1,
            vendorName: "Phase 4 Handlooms",
            vendorId: sellerId,
          }
        ],
        address: {
          name: "Suresh Rao",
          phone: "9876543211",
          line1: "456 Brigade Road",
          city: "Bengaluru",
          state: "Karnataka", // Inter-state
          pincode: "560001",
        },
        deliveryMethod: "standard",
        paymentMethod: "card",
        subtotal: 2000,
        shipping: 199,
        tax: 109.95,
        total: 2308.95,
      };

      const res = await request(app)
        .post("/api/orders")
        .set("Authorization", `Bearer ${customerToken}`)
        .send(payload);

      expect(res.status).toBe(200);
      expect(res.body.orderId).toBeDefined();

      const order = res.body.order;
      expect(order).toBeDefined();
      expect(order.financials).toBeDefined();

      // Stored customerPays must equal total payable to the paisa (230895 paise = ₹2,308.95)
      expect(order.financials.sellerBasePrice).toBe(200000);
      expect(order.financials.platformCommission).toBe(36000);
      expect(order.financials.shippingFee).toBe(19900);
      expect(order.financials.taxableAmount).toBe(219900);
      expect(order.financials.gstAmount).toBe(10995);
      expect(order.financials.cgst).toBe(0);
      expect(order.financials.sgst).toBe(0);
      expect(order.financials.igst).toBe(10995);
      expect(order.financials.customerPays).toBe(230895);
    }, 20000);
  });

  afterAll(async () => {
    try {
      await mongoOrders.deleteMany({
        $or: [
          { "items.vendorId": sellerId },
          { userId: customerId },
        ],
      } as any);
      await db.delete(ordersTable).where(eq(ordersTable.userId, customerId)).catch(() => {});
      await mongoProducts.deleteMany({ vendorId: sellerId } as any);
      await db.delete(productsTable).where(eq(productsTable.vendorId, sellerId)).catch(() => {});
      await mongoVendors.delete(sellerId).catch(() => {});
      await db.delete(vendorsTable).where(eq(vendorsTable.id, sellerId)).catch(() => {});
    } catch {}
  });
});
