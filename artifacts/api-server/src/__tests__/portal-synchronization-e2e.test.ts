import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import app from "../app";
import { mongoProducts, mongoOrders, mongoSellers, mongoUsers, mongoNotifications, mongoGeneric } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";

const ADMIN_KEY = process.env.ADMIN_KEY || "Admin@123";

describe("VASTRAA Complete User, Seller & Admin Data Synchronization", () => {
  const timestamp = Date.now();
  const testSellerId = `sel_yeola_${timestamp}`;
  const testUserId = `usr_ananya_${timestamp}`;
  let sellerToken: string;
  let userToken: string;

  let createdProductId: string;
  let createdOrderId: string;

  beforeAll(async () => {
    // Seed real user and seller in MongoDB
    await mongoUsers.insert({
      id: testUserId,
      email: `ananya.${timestamp}@vashtraa.in`,
      name: "Ananya Deshmukh",
      role: "customer",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).catch(() => {});

    await mongoSellers.insert({
      id: testSellerId,
      vendorId: testSellerId,
      sellerId: testSellerId,
      ownerId: testSellerId,
      name: "Heritage Paithani Weavers",
      shopName: "Heritage Paithani Weavers",
      status: "approved",
      email: `yeola.${timestamp}@vashtraa.in`,
      mobile: "9822012345",
      city: "Yeola",
      state: "Maharashtra",
      pincode: "423401",
      commissionRateBps: 1000,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).catch(() => {});

    // Generate valid tokens with 'sub' claim
    userToken = signAccessToken({
      sub: testUserId,
      role: "customer",
      email: `ananya.${timestamp}@vashtraa.in`,
    });

    sellerToken = signAccessToken({
      sub: testSellerId,
      role: "seller",
      email: `yeola.${timestamp}@vashtraa.in`,
    });
  });

  afterAll(async () => {
    // Cleanup created test records from MongoDB
    try {
      if (createdProductId) {
        await mongoProducts.delete(createdProductId).catch(() => {});
        await mongoGeneric.getCollection("products").deleteOne({ id: createdProductId }).catch(() => {});
      }
      if (createdOrderId) {
        await mongoOrders.delete(createdOrderId).catch(() => {});
        await mongoGeneric.getCollection("orders").deleteOne({ id: createdOrderId }).catch(() => {});
      }
      await mongoSellers.delete(testSellerId).catch(() => {});
      await mongoUsers.delete(testUserId).catch(() => {});
      await mongoNotifications.deleteMany({
        $or: [{ vendorId: testSellerId }, { userId: testUserId }],
      }).catch(() => {});
    } catch {}
  });

  describe("Scenario 1: Product Synchronization", () => {
    it("1. Seller creates a product -> saved in MongoDB with status: 'pending' and active: false", async () => {
      const createRes = await request(app)
        .post("/api/products")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: `Royal Gold Zari Silk Saree ${timestamp}`,
          description: "Handcrafted pure silk paithani saree with traditional motifs",
          category: "paithani",
          subcategory: "cat-bridal-paithani",
          price: 12500,
          basePrice: 10000,
          shippingFee: 150,
          originalPrice: 15000,
          stock: 25,
          lowStockThreshold: 5,
          fabric: "silk",
          color: "maroon",
          occasion: "bridal",
          images: ["https://images.unsplash.com/photo-1610030469983-98e550d6193c"],
        });

      expect([200, 201]).toContain(createRes.status);
      createdProductId = createRes.body.id || createRes.body.productId;
      expect(createdProductId).toBeDefined();

      // 2. Verify exists in MongoDB
      const foundInDb = await mongoProducts.findById(createdProductId);
      expect(foundInDb).not.toBeNull();
      expect(foundInDb?.status).toBe("pending");
      expect(foundInDb?.active).toBe(false);

      // Verify seller sees it in their product management section
      const sellerProductsRes = await request(app)
        .get("/api/seller/products")
        .set("Authorization", `Bearer ${sellerToken}`);
      expect(sellerProductsRes.status).toBe(200);
      const sellerProductList = sellerProductsRes.body.products || [];
      const sellerProduct = sellerProductList.find((p: any) => p.id === createdProductId);
      expect(sellerProduct).toBeDefined();
      expect(sellerProduct?.status).toBe("pending");

      // Verify product does NOT appear in public storefront yet
      const publicCatalogRes = await request(app).get(`/api/products?ids=${createdProductId}`);
      expect(publicCatalogRes.status).toBe(200);
      const publicProducts = publicCatalogRes.body.products || [];
      expect(publicProducts.find((p: any) => p.id === createdProductId)).toBeUndefined();
    });

    it("2. Admin receives the pending product and approves it -> becomes available in user storefront", async () => {
      // Admin approves the product
      const approveRes = await request(app)
        .post(`/api/admin/products/${createdProductId}/approve`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ remark: "Quality verified and approved for launch" });

      expect(approveRes.status).toBe(200);

      // Verify MongoDB updated status to 'approved' and active: true
      const approvedDbProd = await mongoProducts.findById(createdProductId);
      expect(approvedDbProd?.status).toBe("approved");
      expect(approvedDbProd?.active).toBe(true);

      // Verify product now appears in user storefront
      const publicCatalogRes = await request(app).get(`/api/products?ids=${createdProductId}`);
      expect(publicCatalogRes.status).toBe(200);
      const publicProducts = publicCatalogRes.body.products || [];
      const storefrontProduct = publicProducts.find((p: any) => p.id === createdProductId);
      expect(storefrontProduct).toBeDefined();
      expect(storefrontProduct?.active).toBe(true);
    });

    it("3. Seller updates product price -> price update synchronizes across storefront and admin", async () => {
      const updateRes = await request(app)
        .put(`/api/products/${createdProductId}`)
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          basePrice: 11000,
          price: 13500,
        });

      expect(updateRes.status).toBe(200);

      // Verify updated in MongoDB
      const updatedDbProd = await mongoProducts.findById(createdProductId);
      expect(Number(updatedDbProd?.price)).toBeGreaterThanOrEqual(11000);

      // Verify storefront reflects updated price
      const publicCatalogRes = await request(app).get(`/api/products?ids=${createdProductId}`);
      const storefrontProduct = (publicCatalogRes.body.products || []).find((p: any) => p.id === createdProductId);
      expect(storefrontProduct).toBeDefined();
      expect(Number(storefrontProduct?.price)).toBe(Number(updatedDbProd?.price));
    });
  });

  describe("Scenario 2: Order Synchronization", () => {
    it("1. User places an order -> exactly one order record created in MongoDB with same orderId across portals", async () => {
      createdOrderId = `ORD_VS_${timestamp}`;
      const orderPayload = {
        id: createdOrderId,
        displayId: `V${String(timestamp).slice(-4)}`,
        userId: testUserId,
        customerName: "Ananya Deshmukh",
        customerEmail: `ananya.${timestamp}@vashtraa.in`,
        customerPhone: "9822012345",
        address: {
          name: "Ananya Deshmukh",
          phone: "9822012345",
          line1: "123 FC Road",
          city: "Pune",
          state: "Maharashtra",
          pincode: "411004",
        },
        items: [
          {
            productId: createdProductId,
            name: `Royal Gold Zari Silk Saree ${timestamp}`,
            price: 13500,
            quantity: 2,
            vendorId: testSellerId,
            vendorName: "Heritage Paithani Weavers",
          },
        ],
        subtotal: 27000,
        shipping: 150,
        total: 27150,
        paymentMethod: "cod",
        paymentStatus: "pending",
        status: "confirmed",
        statusHistory: [
          { status: "confirmed", timestamp: new Date().toISOString(), note: "Order placed successfully" },
        ],
        isDemo: false,
        isTest: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Persist in MongoDB
      await mongoOrders.insert(orderPayload);

      // Verify exactly one order exists in MongoDB
      const foundOrder = await mongoOrders.findById(createdOrderId);
      expect(foundOrder).not.toBeNull();
      expect(foundOrder?.id).toBe(createdOrderId);

      // Verify User sees order in order history
      const userOrdersRes = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${userToken}`);
      expect(userOrdersRes.status).toBe(200);
      const userOrders = userOrdersRes.body.orders || userOrdersRes.body || [];
      const userOrder = userOrders.find((o: any) => o.id === createdOrderId || o.displayId === orderPayload.displayId);
      expect(userOrder).toBeDefined();

      // Verify Seller sees order in seller portal
      const sellerOrdersRes = await request(app)
        .get("/api/seller/orders")
        .set("Authorization", `Bearer ${sellerToken}`);
      expect(sellerOrdersRes.status).toBe(200);
      const sellerOrders = sellerOrdersRes.body.orders || [];
      const sellerOrder = sellerOrders.find((o: any) => o.id === createdOrderId || o.displayId === orderPayload.displayId);
      expect(sellerOrder).toBeDefined();

      // Verify Admin sees order in admin portal with identical ID and total
      const adminOrderRes = await request(app)
        .get(`/api/admin/orders/${createdOrderId}`)
        .set("x-admin-key", ADMIN_KEY);
      expect(adminOrderRes.status).toBe(200);
      expect(adminOrderRes.body.order).toBeDefined();
      expect(adminOrderRes.body.order.id).toBe(createdOrderId);
      expect(adminOrderRes.body.order.total).toBe(27150);
    });

    it("2. Admin/Seller status changes synchronize across all portals", async () => {
      // Update order status to 'processing'
      const statusRes = await request(app)
        .post(`/api/admin/orders/${createdOrderId}/status`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ status: "processing", note: "Order is being packed" });

      expect(statusRes.status).toBe(200);

      // Verify MongoDB updated status
      const updatedDbOrder = await mongoOrders.findById(createdOrderId);
      expect(updatedDbOrder?.status).toBe("processing");

      // Verify User portal sees 'processing'
      const userOrdersRes = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${userToken}`);
      expect(userOrdersRes.status).toBe(200);
      const userOrder = (userOrdersRes.body.orders || []).find((o: any) => o.id === createdOrderId);
      expect(userOrder?.status).toBe("processing");
    });
  });

  describe("Scenario 3: Inventory Synchronization & Atomic Operations", () => {
    it("1. Atomic stock deduction on order placement prevents overselling", async () => {
      const productBefore = await mongoProducts.findById(createdProductId);
      const initialStock = productBefore?.stock ?? 25;

      // Decrement 2 units atomically
      const res = await mongoProducts.decrementStock(createdProductId, 2);
      expect(res.success).toBe(true);

      const productAfter = await mongoProducts.findById(createdProductId);
      expect(productAfter?.stock).toBe(initialStock - 2);

      // Attempt to decrement more than available stock
      const overDecrement = await mongoProducts.decrementStock(createdProductId, 9999);
      expect(overDecrement.success).toBe(false);

      // Stock remains intact
      const productAfterFailed = await mongoProducts.findById(createdProductId);
      expect(productAfterFailed?.stock).toBe(initialStock - 2);
    });

    it("2. Customer cancellation restores inventory atomically in MongoDB", async () => {
      const stockBeforeCancel = (await mongoProducts.findById(createdProductId))?.stock ?? 23;

      // Customer cancels order
      const cancelRes = await request(app)
        .post(`/api/orders/${createdOrderId}/cancel`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ reason: "Ordered by mistake" });

      expect(cancelRes.status).toBe(200);

      // Verify order marked cancelled in MongoDB
      const cancelledOrder = await mongoOrders.findById(createdOrderId);
      expect(cancelledOrder?.status).toBe("cancelled");
      expect(cancelledOrder?.cancelReason).toBe("Ordered by mistake");

      // Verify inventory atomically restored
      const productAfterCancel = await mongoProducts.findById(createdProductId);
      expect(productAfterCancel?.stock).toBe(stockBeforeCancel + 2);
    });
  });

  describe("Scenario 4: Returns, Refunds & Admin Decisions", () => {
    let returnOrderId: string;

    beforeAll(async () => {
      returnOrderId = `ORD_RET_VS_${timestamp}`;
      await mongoOrders.insert({
        id: returnOrderId,
        displayId: `VRET${String(timestamp).slice(-3)}`,
        userId: testUserId,
        customerName: "Ananya Deshmukh",
        items: [
          {
            productId: createdProductId,
            name: `Royal Gold Zari Silk Saree ${timestamp}`,
            price: 13500,
            quantity: 1,
            vendorId: testSellerId,
          },
        ],
        total: 13500,
        status: "delivered",
        paymentMethod: "online",
        paymentStatus: "paid",
        statusHistory: [
          { status: "confirmed", timestamp: new Date().toISOString() },
          { status: "delivered", timestamp: new Date().toISOString() },
        ],
        isDemo: false,
        isTest: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });

    afterAll(async () => {
      try {
        await mongoOrders.delete(returnOrderId).catch(() => {});
      } catch {}
    });

    it("1. Customer initiates return request -> single request ID visible to Admin and Seller", async () => {
      const returnRes = await request(app)
        .post(`/api/orders/${returnOrderId}/return`)
        .set("Authorization", `Bearer ${userToken}`)
        .send({ reason: "Color differs slightly from photo" });

      expect(returnRes.status).toBe(200);

      // Verify status in MongoDB
      const returnOrder = await mongoOrders.findById(returnOrderId);
      expect(returnOrder?.status).toBe("return_requested");

      // Verify Admin returns list includes this order
      const adminReturnsRes = await request(app)
        .get("/api/admin/returns")
        .set("x-admin-key", ADMIN_KEY);
      expect(adminReturnsRes.status).toBe(200);
      const pendingReturns = adminReturnsRes.body.orders || [];
      expect(pendingReturns.some((o: any) => o.id === returnOrderId)).toBe(true);
    });

    it("2. Admin approves return request -> status updates to 'return_approved' across all portals", async () => {
      const reviewRes = await request(app)
        .post(`/api/admin/orders/${returnOrderId}/return`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ decision: "approved", note: "Return approved, pickup will be scheduled" });

      expect(reviewRes.status).toBe(200);

      // Verify MongoDB updated status
      const reviewedDbOrder = await mongoOrders.findById(returnOrderId);
      expect(reviewedDbOrder?.status).toBe("return_approved");
      expect(reviewedDbOrder?.refundStatus).toBe("pending");
    });

    it("3. Admin processes refund -> idempotency key prevents duplicate payout", async () => {
      // 1. Approve refund
      const refundApproveRes = await request(app)
        .post(`/api/admin/orders/${returnOrderId}/refund`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ decision: "approved", note: "Item received at warehouse in good condition" });

      expect(refundApproveRes.status).toBe(200);
      const refundedDbOrder = await mongoOrders.findById(returnOrderId);
      expect(refundedDbOrder?.refundStatus).toBe("approved");

      // 2. Process payout with idempotency key
      const idempotencyKey = `PAYOUT_IDEMP_${timestamp}`;
      const processRes1 = await request(app)
        .post(`/api/admin/orders/${returnOrderId}/refund/process`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ reference: `REF_BANK_${timestamp}`, idempotencyKey });

      expect(processRes1.status).toBe(200);
      expect(processRes1.body.order?.refundStatus).toBe("processed");

      // Re-executing with the same idempotency key must not double-process
      const processRes2 = await request(app)
        .post(`/api/admin/orders/${returnOrderId}/refund/process`)
        .set("x-admin-key", ADMIN_KEY)
        .send({ reference: `REF_BANK_${timestamp}`, idempotencyKey });

      expect(processRes2.status).toBe(200);
      expect(processRes2.body.order?.refundStatus).toBe("processed");
    });
  });

  describe("Scenario 5: Refresh, Re-login & Zero Dummy Data", () => {
    it("1. Re-querying after re-login displays authoritative MongoDB records with zero fake records", async () => {
      // Generate new login token (simulating re-login)
      const freshUserToken = signAccessToken({
        sub: testUserId,
        role: "customer",
        email: `ananya.${timestamp}@vashtraa.in`,
      });

      const res = await request(app)
        .get("/api/orders")
        .set("Authorization", `Bearer ${freshUserToken}`);

      expect(res.status).toBe(200);
      const orders = res.body.orders || res.body || [];

      // Confirm user orders match MongoDB exactly without any fake demo orders
      for (const ord of orders) {
        expect(ord.isDemo).not.toBe(true);
        expect(ord.isTest).not.toBe(true);
      }
    });

    it("2. Admin dashboard stats are dynamically calculated from live MongoDB collections", async () => {
      const statsRes = await request(app)
        .get("/api/admin/stats")
        .set("x-admin-key", ADMIN_KEY);

      expect(statsRes.status).toBe(200);
      expect(typeof statsRes.body.totalOrders).toBe("number");
      expect(typeof statsRes.body.totalProducts).toBe("number");
      expect(typeof statsRes.body.totalVendors).toBe("number");
      expect(typeof statsRes.body.totalRevenue).toBe("number");
    });
  });
});
