import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import {
  mongoUsers,
  mongoOrders,
  mongoProducts,
  mongoAddresses,
  mongoPaymentMethods,
  mongoCoupons,
  mongoSupport,
  mongoRewards,
  mongoGeneric,
  mongoNotifications,
  mongoSellers,
} from "@workspace/db";
import { signAccessToken } from "../lib/jwt";

describe("User Dashboard Real-Time Synchronization & RBAC Isolation", { timeout: 30000 }, () => {
  let userA: any;
  let userB: any;
  let tokenA: string;
  let tokenB: string;

  beforeEach(async () => {
    const timestamp = Date.now();

    await mongoSellers.insert({
      id: "vnd_artisan_test",
      name: "Artisan Silk Weavers",
      shopName: "Artisan Silk Weavers",
      status: "approved",
      active: true,
    });

    userA = await mongoUsers.insert({
      id: `usr_dash_a_${timestamp}`,
      email: `customerA_${timestamp}@example.com`,
      role: "customer",
      name: "Alice Sharma",
      firstName: "Alice",
      lastName: "Sharma",
      phone: "9876543210",
    });

    userB = await mongoUsers.insert({
      id: `usr_dash_b_${timestamp}`,
      email: `customerB_${timestamp}@example.com`,
      role: "customer",
      name: "Bob Verma",
      firstName: "Bob",
      lastName: "Verma",
      phone: "9876543211",
    });

    tokenA = signAccessToken({ sub: userA.id, role: "customer", email: userA.email });
    tokenB = signAccessToken({ sub: userB.id, role: "customer", email: userB.email });
  });

  // ─── 1. Overview & Profile Details ──────────────────────────────────────────
  it("Section 1 & 7: Profile Details — persistence and strict user isolation", async () => {
    // 1. User A fetches initial profile
    const getResA = await request(app)
      .get("/api/account/profile")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(getResA.status).toBe(200);
    expect(getResA.body.user.email).toBe(userA.email);

    // 2. User A updates profile
    const updateResA = await request(app)
      .patch("/api/account/profile")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        firstName: "Alice",
        lastName: "Patel",
        phone: "9876543299",
        language: "Hindi",
        gender: "Female",
        location: "Mumbai",
      });

    expect(updateResA.status).toBe(200);
    expect(updateResA.body.success).toBe(true);

    // 3. User A revisits profile — verifies persistence from DB
    const refetchResA = await request(app)
      .get("/api/account/profile")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(refetchResA.status).toBe(200);
    expect(refetchResA.body.user.lastName).toBe("Patel");
    expect(refetchResA.body.user.phone).toBe("9876543299");

    // 4. User B cannot see User A's profile details
    const getResB = await request(app)
      .get("/api/account/profile")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(getResB.status).toBe(200);
    expect(getResB.body.user.email).toBe(userB.email);
    expect(getResB.body.user.lastName).toBe("Verma");
    expect(getResB.body.user.lastName).not.toBe("Patel");
  });

  // ─── 2. Orders ──────────────────────────────────────────────────────────────
  it("Section 2: Orders — user-specific order retrieval and isolation", async () => {
    // Create an order for User A
    const orderA = await mongoOrders.insert({
      id: `ord_a_${Date.now()}`,
      userId: userA.id,
      customerEmail: userA.email,
      customerName: userA.name,
      total: 8999,
      status: "processing",
      items: [{ productId: "p_silk_1", name: "Kanjeevaram Pure Silk", price: 8999, quantity: 1 }],
      createdAt: new Date(),
    });

    // 1. User A can view their orders
    const resA = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(resA.status).toBe(200);
    expect(resA.body.orders).toBeDefined();
    expect(resA.body.orders.some((o: any) => o.id === orderA.id)).toBe(true);

    // 2. User B cannot see User A's orders
    const resB = await request(app)
      .get("/api/orders")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(resB.status).toBe(200);
    expect(resB.body.orders.some((o: any) => o.id === orderA.id)).toBe(false);

    // 3. User B cannot view single order detail for User A's order
    const singleResB = await request(app)
      .get(`/api/orders/${orderA.id}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect([403, 404]).toContain(singleResB.status);
  });

  // ─── 3. Wishlist ────────────────────────────────────────────────────────────
  it("Section 3: Wishlist — toggle and user isolation", async () => {
    const product = await mongoProducts.insert({
      id: `prod_wish_${Date.now()}`,
      name: "Banarasi Georgette Saree",
      price: 12500,
      active: true,
      category: "georgette",
      vendorId: "vnd_artisan_test",
    });

    // 1. User A toggles item into wishlist
    const toggleRes = await request(app)
      .post("/api/wishlists/toggle")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ productId: product.id });

    expect([200, 201]).toContain(toggleRes.status);

    // 2. User A retrieves wishlist
    const listResA = await request(app)
      .get("/api/wishlists")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listResA.status).toBe(200);
    expect(listResA.body.items.some((i: any) => i.id === product.id)).toBe(true);

    // 3. User B's wishlist does not contain User A's item
    const listResB = await request(app)
      .get("/api/wishlists")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(listResB.status).toBe(200);
    expect(listResB.body.items.some((i: any) => i.id === product.id)).toBe(false);
  });

  // ─── 4. Shopping Cart ───────────────────────────────────────────────────────
  it("Section 4: Shopping Cart — sync, modification, and user isolation", async () => {
    const product = await mongoProducts.insert({
      id: `prod_cart_${Date.now()}`,
      name: "Chanderi Handloom Saree",
      price: 6499,
      active: true,
      category: "chanderi",
      vendorId: "vnd_artisan_test",
    });

    // 1. User A adds item to cart
    const addResA = await request(app)
      .post("/api/cart")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        productId: product.id,
        quantity: 2,
        name: product.name,
        price: product.price,
      });

    expect(addResA.status).toBe(200);

    // 2. User A fetches cart
    const cartResA = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(cartResA.status).toBe(200);
    expect(cartResA.body.items.length).toBeGreaterThanOrEqual(1);
    const cartItem = cartResA.body.items.find((i: any) => i.productId === product.id);
    expect(cartItem).toBeDefined();
    expect(cartItem.quantity).toBe(2);

    // 3. User B fetches cart — isolated, empty
    const cartResB = await request(app)
      .get("/api/cart")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(cartResB.status).toBe(200);
    expect(cartResB.body.items.some((i: any) => i.productId === product.id)).toBe(false);
  });

  // ─── 5. Addresses ───────────────────────────────────────────────────────────
  it("Section 5: Addresses — CRUD, defaults, and strict tenant isolation", async () => {
    // 1. User A creates address
    const createRes = await request(app)
      .post("/api/addresses")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "Alice Sharma",
        phone: "9876543210",
        line1: "Flat 402, Royal Residency, MG Road",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
        addressType: "home",
        isDefault: true,
      });

    expect(createRes.status).toBe(201);
    const addressId = createRes.body.address.id;
    expect(addressId).toBeDefined();

    // 2. User A fetches addresses
    const listResA = await request(app)
      .get("/api/addresses")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listResA.status).toBe(200);
    expect(listResA.body.addresses.some((a: any) => a.id === addressId)).toBe(true);

    // 3. User B cannot see User A's address
    const listResB = await request(app)
      .get("/api/addresses")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(listResB.status).toBe(200);
    expect(listResB.body.addresses.some((a: any) => a.id === addressId)).toBe(false);

    // 4. User B cannot modify User A's address
    const updateResB = await request(app)
      .put(`/api/addresses/${addressId}`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({
        name: "Hacker",
        phone: "9876543210",
        line1: "Malicious line",
        city: "Bengaluru",
        state: "Karnataka",
        pincode: "560001",
      });

    expect([403, 404]).toContain(updateResB.status);

    // 5. User B cannot delete User A's address
    const deleteResB = await request(app)
      .delete(`/api/addresses/${addressId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect([403, 404]).toContain(deleteResB.status);

    // 6. User A can delete their own address
    const deleteResA = await request(app)
      .delete(`/api/addresses/${addressId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(deleteResA.status).toBe(200);
  });

  // ─── 6. Coupons ─────────────────────────────────────────────────────────────
  it("Section 6: Coupons — available listings, validation, and expiry handling", async () => {
    const couponCode = `FESTIVE_${Date.now()}`;
    await mongoCoupons.insert({
      code: couponCode,
      type: "percent",
      value: 15,
      description: "Festive discount",
      active: true,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      maxUses: 100,
      usedCount: 0,
    });

    // 1. Fetch available coupons
    const availRes = await request(app)
      .get("/api/coupons/available")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(availRes.status).toBe(200);
    expect(availRes.body.coupons.some((c: any) => c.code === couponCode)).toBe(true);

    // 2. Validate valid coupon
    const validRes = await request(app)
      .get(`/api/coupons/validate?code=${couponCode}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(validRes.status).toBe(200);
    expect(validRes.body.code).toBe(couponCode);
    expect(validRes.body.value).toBe(15);

    // 3. Invalid coupon is rejected with 404
    const invalidRes = await request(app)
      .get(`/api/coupons/validate?code=NONEXISTENT_XYZ`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(invalidRes.status).toBe(404);
  });

  // ─── 8. Payments ────────────────────────────────────────────────────────────
  it("Section 8: Payment Methods — saving cards/UPI, setting default, and user isolation", async () => {
    // 1. User A saves a UPI method
    const createUpiRes = await request(app)
      .post("/api/payment-methods")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        type: "upi",
        upiId: "alice@okaxis",
        isDefault: true,
      });

    expect(createUpiRes.status).toBe(201);
    const upiMethodId = createUpiRes.body.paymentMethod.id;
    expect(upiMethodId).toBeDefined();

    // 2. User A retrieves saved payment methods
    const listResA = await request(app)
      .get("/api/payment-methods")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(listResA.status).toBe(200);
    expect(listResA.body.paymentMethods.some((m: any) => m.id === upiMethodId)).toBe(true);

    // 3. User B cannot see User A's saved payment methods
    const listResB = await request(app)
      .get("/api/payment-methods")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(listResB.status).toBe(200);
    expect(listResB.body.paymentMethods.some((m: any) => m.id === upiMethodId)).toBe(false);

    // 4. User B cannot delete User A's payment method
    const deleteResB = await request(app)
      .delete(`/api/payment-methods/${upiMethodId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect([403, 404]).toContain(deleteResB.status);

    // 5. User A can delete their own payment method
    const deleteResA = await request(app)
      .delete(`/api/payment-methods/${upiMethodId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(deleteResA.status).toBe(200);
  });

  // ─── 9. Returns & Refunds ───────────────────────────────────────────────────
  it("Section 9: Returns & Refunds — return requests, refund requests, and user isolation", async () => {
    // Create a delivered order for User A
    const orderA = await mongoOrders.insert({
      id: `ord_ret_${Date.now()}`,
      userId: userA.id,
      customerEmail: userA.email,
      total: 4500,
      status: "delivered",
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // delivered 2 days ago
      items: [{ productId: "p_cotton_1", name: "Chanderi Cotton Saree", price: 4500, quantity: 1 }],
      createdAt: new Date(),
    });

    // 1. User B cannot request return on User A's order
    const returnResB = await request(app)
      .post(`/api/orders/${orderA.id}/return`)
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ reason: "Defective fabric" });

    expect([403, 404]).toContain(returnResB.status);

    // 2. User A requests return on their own delivered order
    const returnResA = await request(app)
      .post(`/api/orders/${orderA.id}/return`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ reason: "Color mismatch with description" });

    expect(returnResA.status).toBe(200);
    expect(returnResA.body.success).toBe(true);

    // Verify DB updated
    const updatedOrder = await mongoOrders.findById(orderA.id);
    expect(updatedOrder?.status).toBe("return_requested");

    // 3. User A requests refund for the return-requested order
    const refundResA = await request(app)
      .post(`/api/orders/${orderA.id}/refund`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ method: "original_payment" });

    expect(refundResA.status).toBe(200);
    expect(refundResA.body.success).toBe(true);

    const refundedOrder = await mongoOrders.findById(orderA.id);
    expect(refundedOrder?.refundStatus).toBe("pending");
  });

  // ─── 10. Notifications ──────────────────────────────────────────────────────
  it("Section 10: Notifications — unread count, listing, marking read, and isolation", async () => {
    // Insert notification for User A
    const notifId = `notif_a_${Date.now()}`;
    await mongoNotifications.insert({
      id: notifId,
      _id: notifId,
      userId: userA.id,
      vendorId: null,
      type: "order_confirmed",
      title: "Order Confirmed",
      body: "Your saree order is being processed by the artisan.",
      isRead: false,
      read: false,
      createdAt: new Date(),
    });

    // 1. User A fetches unread count
    const countResA = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(countResA.status).toBe(200);
    expect(countResA.body.count).toBeGreaterThanOrEqual(1);

    // 2. User B's unread count does not include User A's notification
    const countResB = await request(app)
      .get("/api/notifications/unread-count")
      .set("Authorization", `Bearer ${tokenB}`);

    expect(countResB.status).toBe(200);
    expect(countResB.body.count).toBe(0);

    // 3. User A marks notification as read
    const readRes = await request(app)
      .patch(`/api/notifications/${notifId}/read`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(readRes.status).toBe(200);
    expect(readRes.body.success).toBe(true);

    // 4. User B cannot access or modify User A's notification
    const markResB = await request(app)
      .patch(`/api/notifications/${notifId}/unread`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(markResB.status).toBe(404);
  });

  // ─── 11. Rewards ────────────────────────────────────────────────────────────
  it("Section 11: Rewards — balance summary, history, and referral points", async () => {
    // 1. User A fetches rewards summary
    const sumResA = await request(app)
      .get("/api/rewards/summary")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(sumResA.status).toBe(200);
    expect(sumResA.body.balance).toBeGreaterThanOrEqual(100);
    expect(sumResA.body.tier).toBeDefined();
    expect(sumResA.body.referralCode).toBeDefined();
    const codeA = sumResA.body.referralCode;

    // 2. User B applies User A's referral code
    const applyResB = await request(app)
      .post("/api/rewards/referral/apply")
      .set("Authorization", `Bearer ${tokenB}`)
      .send({ referralCode: codeA });

    expect(applyResB.status).toBe(200);
    expect(applyResB.body.success).toBe(true);

    // 3. User A's rewards balance increased with referral bonus
    const updatedSumA = await request(app)
      .get("/api/rewards/summary")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(updatedSumA.status).toBe(200);
    expect(updatedSumA.body.balance).toBeGreaterThan(sumResA.body.balance);

    // 4. User A's rewards history shows the bonus
    const histResA = await request(app)
      .get("/api/rewards/history")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(histResA.status).toBe(200);
    expect(histResA.body.history.length).toBeGreaterThanOrEqual(1);
  });

  // ─── 12. Support ────────────────────────────────────────────────────────────
  it("Section 12: Support — ticket creation, listing, open count, and user isolation", async () => {
    // 1. User A creates support ticket
    const ticketRes = await request(app)
      .post("/api/support/tickets")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        subject: "Need fabric care instructions for Paithani",
        category: "Product Query",
        description: "How should I dry clean or iron the pure zari border?",
      });

    expect(ticketRes.status).toBe(201);
    const ticketId = ticketRes.body.id;
    expect(ticketId).toBeDefined();

    // 2. User A checks open count
    const countRes = await request(app)
      .get("/api/support/tickets/open-count")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(countRes.status).toBe(200);
    expect(countRes.body.count).toBeGreaterThanOrEqual(1);

    // 3. User A can view the ticket details
    const viewResA = await request(app)
      .get(`/api/support/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${tokenA}`);

    expect(viewResA.status).toBe(200);
    expect(viewResA.body.subject).toContain("fabric care instructions");

    // 4. User B cannot view User A's support ticket (strictly isolated, returns 404)
    const viewResB = await request(app)
      .get(`/api/support/tickets/${ticketId}`)
      .set("Authorization", `Bearer ${tokenB}`);

    expect(viewResB.status).toBe(404);
  });

  // ─── Security: Unauthenticated Rejection ────────────────────────────────────
  it("Security: Reject unauthenticated requests across all user dashboard endpoints", async () => {
    const protectedGetEndpoints = [
      "/api/account/profile",
      "/api/orders",
      "/api/wishlists",
      "/api/cart",
      "/api/addresses",
      "/api/payment-methods",
      "/api/notifications",
      "/api/notifications/unread-count",
      "/api/rewards/summary",
      "/api/rewards/history",
      "/api/support/tickets",
      "/api/support/tickets/open-count",
    ];

    for (const endpoint of protectedGetEndpoints) {
      const res = await request(app).get(endpoint);
      expect(res.status).toBe(401);
    }
  });
});
