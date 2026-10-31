import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";

const state = vi.hoisted(() => ({
  userId: "user-buyer-100",
  isAdmin: false,
  mockOrder: null as any,
  updatedOrderData: null as any,
  emittedEvents: [] as Array<{ event: string; payload: any }>,
}));

vi.mock("../middlewares/isCustomer", () => ({
  isCustomer: (req: any, res: any, next: any) => {
    if (!state.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = state.userId;
    req.isAdmin = state.isAdmin;
    next();
  },
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(() => Promise.resolve([])),
        })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  ordersTable: { id: "id" },
  mongoOrders: {
    findById: vi.fn(async (id: string) => {
      if (state.mockOrder && state.mockOrder.id === id) {
        return state.mockOrder;
      }
      return null;
    }),
    update: vi.fn(async (id: string, data: any) => {
      state.updatedOrderData = { ...state.mockOrder, ...data };
      return state.updatedOrderData;
    }),
  },
  mongoProducts: {
    findById: vi.fn(),
  },
  mongoSellers: {},
  mongoGeneric: {
    getCollection: vi.fn(),
  },
  isMongoDbConnected: vi.fn(() => true),
  getNextSequenceValue: vi.fn(async () => "1001"),
}));

vi.mock("../lib/cashfree", () => ({
  getCashfreeConfig: vi.fn(async () => ({
    appId: "TEST_APP_ID",
    secretKey: "TEST_SECRET",
    env: "sandbox",
    apiVersion: "2023-08-01",
  })),
  createCashfreePgOrder: vi.fn(async (input: any) => ({
    cfOrderId: "CF_ORDER_12345",
    orderId: input.orderId,
    paymentSessionId: "session_cf_mock_9999",
    orderStatus: "ACTIVE",
    orderAmount: input.orderAmount,
    orderCurrency: "INR",
    isSimulated: false,
  })),
  getCashfreePgOrder: vi.fn(async (cfOrderId: string) => ({
    cf_order_id: cfOrderId,
    order_id: "ORD_100",
    order_status: "ACTIVE",
    payment_session_id: "session_cf_mock_9999",
    order_amount: 1499,
  })),
  getCashfreePgOrderPayments: vi.fn(async () => []),
  payCashfreePgOrderWithUpi: vi.fn(async ({ upiId }: any) => ({
    success: true,
    cfPaymentId: "CF_PAY_8899",
    paymentStatus: "PENDING",
    channel: "collect",
    upiId,
  })),
  verifyCashfreeWebhookSignature: vi.fn(() => true),
  testCashfreeConnection: vi.fn(),
}));

vi.mock("../lib/socket", () => ({
  emitOrderEvent: vi.fn((event: string, payload: any) => {
    state.emittedEvents.push({ event, payload });
  }),
  emitFinancialsEvent: vi.fn(),
}));

vi.mock("../lib/cacheEngine", () => ({
  safeInvalidatePattern: vi.fn(),
}));

import paymentsRouter from "../routes/payments";

describe("Order Pay Interaction & Payment Options (POST /api/orders/:orderId/pay)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use("/api", paymentsRouter);

    state.userId = "user-buyer-100";
    state.isAdmin = false;
    state.mockOrder = {
      id: "ORD_100",
      displayId: "V100",
      userId: "user-buyer-100",
      items: [{ productId: "p1", name: "Paithani Saree", price: 1499, quantity: 1 }],
      total: 1499,
      subtotal: 1479,
      platformFee: 20,
      codFee: 0,
      deliveryMethod: "standard",
      paymentMethod: "card",
      paymentStatus: "pending",
      status: "confirmed",
      address: {
        name: "Priya Sharma",
        phone: "9876543210",
        line1: "MG Road",
        city: "Pune",
        state: "Maharashtra",
        pincode: "411001",
      },
    };
    state.updatedOrderData = null;
    state.emittedEvents = [];
  });

  it("TC-PAY-01: enforces order ownership (blocks user attempting to pay for another user's order)", async () => {
    state.userId = "user-attacker-999"; // Different user

    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "upi" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Unauthorized access");
  });

  it("TC-PAY-02: returns 404 if order does not exist", async () => {
    const res = await request(app)
      .post("/api/orders/NON_EXISTENT_ORDER/pay")
      .send({ paymentMethod: "upi" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Order not found");
  });

  it("TC-PAY-03: blocks payment request for cancelled orders", async () => {
    state.mockOrder.status = "cancelled";

    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "card" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Cannot process payment for a cancelled order");
  });

  it("TC-PAY-04: idempotency - returns alreadyPaid if order is already marked paid", async () => {
    state.mockOrder.paymentStatus = "paid";

    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "card" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.alreadyPaid).toBe(true);
  });

  it("TC-PAY-05: converts order to Cash on Delivery (Pay on Delivery) when eligible", async () => {
    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "cod" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.switchedToCod).toBe(true);
    expect(res.body.paymentMethod).toBe("cod");
    expect(res.body.paymentStatus).toBe("pending");
    expect(res.body.codFee).toBe(10);
    expect(res.body.total).toBe(1509); // 1499 + 10 COD fee

    expect(state.updatedOrderData.paymentMethod).toBe("cod");
    expect(state.updatedOrderData.paymentStatus).toBe("pending");

    // Real-time events emitted
    const statusEvent = state.emittedEvents.find(e => e.event === "order:status_changed");
    const paymentEvent = state.emittedEvents.find(e => e.event === "payment:status_updated");
    expect(statusEvent).toBeDefined();
    expect(paymentEvent).toBeDefined();
  });

  it("TC-PAY-06: rejects Cash on Delivery if order total exceeds ₹50,000 threshold", async () => {
    state.mockOrder.total = 65000;

    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "cod" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Orders above ₹50,000 are not eligible");
  });

  it("TC-PAY-07: server authority - payable amount is derived strictly from server order total", async () => {
    // Client tries to tamper with amount
    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "card", clientAmount: 1.0 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.orderAmount).toBe(1499); // Server authority preserved!
    expect(res.body.paymentSessionId).toBeDefined();
  });

  it("TC-PAY-08: successfully initiates UPI Collect when valid VPA is passed", async () => {
    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "upi", upiId: "customer@okhdfcbank" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.upiResponse).toBeDefined();
    expect(res.body.upiResponse.success).toBe(true);
    expect(res.body.upiResponse.channel).toBe("collect");
  });

  it("TC-PAY-09: rejects invalid UPI ID format", async () => {
    const res = await request(app)
      .post("/api/orders/ORD_100/pay")
      .send({ paymentMethod: "upi", upiId: "invalid_vpa_without_bank" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid UPI ID format");
  });
});
