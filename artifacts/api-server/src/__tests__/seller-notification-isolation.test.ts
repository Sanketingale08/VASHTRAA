import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

const sendTransactionalEmailMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock("../lib/transactionalEmail", () => ({
  sendTransactionalEmail: sendTransactionalEmailMock,
}));

// Test entities
const VENDOR_A_ID = "vendor-uuid-seller-a";
const VENDOR_A_OWNER_ID = "owner-seller-a";
const PRODUCT_A_ID = "prod-uuid-a";

const VENDOR_B_ID = "vendor-uuid-seller-b";
const VENDOR_B_OWNER_ID = "owner-seller-b";
const PRODUCT_B_ID = "prod-uuid-b";

const CUSTOMER_USER_ID = "customer-user-1";
const MULTI_SELLER_ORDER_ID = "order-multi-101";

// Database state for test mocking
const state = vi.hoisted(() => ({
  orders: [] as any[],
  products: [] as any[],
  vendors: [] as any[],
  tickets: [] as any[],
  ticketMessages: [] as any[],
  notifications: [] as any[],
  notifIdCounter: 0,
}));

vi.mock("drizzle-orm", () => ({
  eq: (col: any, val: any) => ({ col, val }),
  and: (...args: any[]) => ({ args }),
  desc: (col: any) => col,
  asc: (col: any) => col,
  sql: Object.assign((...args: any[]) => args, { raw: (s: string) => s, empty: () => "" }),
  ilike: (col: any, val: any) => ({ col, val }),
  or: (...args: any[]) => ({ args }),
  inArray: (col: any, vals: any[]) => ({ col, vals }),
  gte: (col: any, val: any) => ({ col, val }),
  lte: (col: any, val: any) => ({ col, val }),
}));

vi.mock("@workspace/db", () => {
  function queryResult(getRows: () => unknown[]): any {
    const rows = getRows();
    return {
      limit: vi.fn(() => queryResult(getRows)),
      for: vi.fn(() => queryResult(getRows)),
      orderBy: vi.fn(() => queryResult(getRows)),
      offset: vi.fn(() => queryResult(getRows)),
      then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
      catch: (fn: any) => Promise.resolve(rows).catch(fn),
    };
  }

  function makeSelectChain(getRows: () => unknown[]) {
    return {
      from: vi.fn(() => ({
        where: vi.fn(() => queryResult(getRows)),
      })),
    };
  }

  const mockDb: any = {
    select: vi.fn((fields?: any) => ({
      from: vi.fn((table: any) => ({
        where: vi.fn((condition: any) => {
          const tableName = table?._t;
          if (tableName === "orders") {
            return queryResult(() => state.orders);
          }
          if (tableName === "products") {
            return queryResult(() => {
              const idVal = condition?.col === "id" ? condition?.val : condition?.args?.find((a: any) => a?.col === "id")?.val;
              if (idVal) {
                return state.products.filter((p) => p.id === idVal);
              }
              return state.products;
            });
          }
          if (tableName === "vendors") {
            return queryResult(() => state.vendors);
          }
          if (tableName === "notifications") {
            return queryResult(() => {
              const eqVendor = condition?.args?.find((a: any) => a?.col === "vendor_id" || a?.col?.vendorId === "vendor_id") || (condition?.col === "vendor_id" || condition?.col?.vendorId === "vendor_id" ? condition : null);
              const filtered = eqVendor?.val ? state.notifications.filter((n) => n.vendorId === eqVendor.val) : state.notifications;
              if (fields && (fields.count || fields.total)) {
                return [{ count: filtered.length, total: filtered.length }];
              }
              return filtered;
            });
          }
          if (tableName === "support_tickets") {
            return queryResult(() => state.tickets);
          }
          return queryResult(() => []);
        }),
      })),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((data: any) => {
        const rows = Array.isArray(data) ? data : [data];
        const tableName = table?._t;
        const inserted = rows.map((r) => {
          const row = { id: r.id || `gen-id-${++state.notifIdCounter}`, ...r, createdAt: new Date() };
          if (tableName === "notifications") state.notifications.push(row);
          if (tableName === "support_tickets") state.tickets.push(row);
          if (tableName === "ticket_messages") state.ticketMessages.push(row);
          return row;
        });
        return {
          returning: vi.fn().mockResolvedValue(inserted),
          then: (resolve: any) => Promise.resolve(inserted).then(resolve),
        };
      }),
    })),
    update: vi.fn((table: any) => ({
      set: vi.fn((values: any) => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{ id: "updated-1" }]),
          then: (resolve: any) => Promise.resolve([{ id: "updated-1" }]).then(resolve),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: "deleted-1" }]),
        then: (resolve: any) => Promise.resolve([{ id: "deleted-1" }]).then(resolve),
      })),
    })),
    transaction: vi.fn(async (cb: any) => cb(mockDb)),
  };

  return {
    db: mockDb,
    ADMIN_NOTIFICATION_USER_ID: "admin-sentinel",
    mongoSupport: { insertTicket: vi.fn().mockResolvedValue(undefined) },
    mongoVendors: { findById: vi.fn().mockResolvedValue(null) },
    mongoGeneric: { getCollection: vi.fn() },
    mongoNotifications: null,
    notificationsTable: { _t: "notifications", vendorId: "vendor_id", userId: "user_id", read: "read", createdAt: "created_at" },
    supportTicketsTable: { _t: "support_tickets", id: "id", vendorId: "vendor_id", userId: "user_id" },
    ticketMessagesTable: { _t: "ticket_messages" },
    ordersTable: { _t: "orders", id: "id", userId: "user_id" },
    productsTable: { _t: "products", id: "id", vendorId: "vendor_id" },
    vendorsTable: { _t: "vendors", id: "id", ownerId: "owner_id" },
    CUSTOMER_TICKET_CATEGORIES: [
      "Order Issue",
      "Delivery/Shipping Delay",
      "Product Quality Issue",
      "Wrong/Damaged Item",
      "Return/Refund",
      "Product Query",
    ],
    routeTicket: (userType: string, category: string, vendorId?: string | null) => {
      if (userType === "seller") return "admin";
      if (vendorId) return "seller";
      return "admin";
    },
    eq: (col: any, val: any) => ({ col, val }),
    and: (...args: any[]) => ({ args }),
    desc: (col: any) => col,
    sql: (strings: any, ...values: any[]) => strings.join(""),
    ilike: (col: any, val: any) => ({ col, val }),
    or: (...args: any[]) => ({ args }),
    inArray: (col: any, vals: any[]) => ({ col, vals }),
    gte: (col: any, val: any) => ({ col, val }),
    lte: (col: any, val: any) => ({ col, val }),
  };
});

// Mock middlewares
vi.mock("../middlewares/isAuthenticated", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = CUSTOMER_USER_ID;
    next();
  },
}));

vi.mock("../middlewares/isSeller", () => ({
  isSeller: (req: any, _res: any, next: any) => {
    // Dynamically assign seller based on auth header
    const authHeader = req.headers["authorization"] || "";
    if (authHeader.includes("seller-b")) {
      req.vendorId = VENDOR_B_ID;
      req.userId = VENDOR_B_OWNER_ID;
    } else {
      req.vendorId = VENDOR_A_ID;
      req.userId = VENDOR_A_OWNER_ID;
    }
    next();
  },
}));

import supportRouter from "../routes/support";
import sellerNotificationsRouter from "../routes/sellerNotifications";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(supportRouter);
  app.use(sellerNotificationsRouter);
  return app;
}

describe("Strict Seller-Specific Notification & Support Ticket Isolation", () => {
  beforeEach(() => {
    state.orders = [
      {
        id: MULTI_SELLER_ORDER_ID,
        userId: CUSTOMER_USER_ID,
        items: [
          { productId: PRODUCT_A_ID, name: "Silk Paithani Saree (Seller A)", price: 5000, quantity: 1 },
          { productId: PRODUCT_B_ID, name: "Designer Georgette Dupatta (Seller B)", price: 2000, quantity: 1 },
        ],
        status: "confirmed",
      },
    ];

    state.products = [
      { id: PRODUCT_A_ID, name: "Silk Paithani Saree", vendorId: VENDOR_A_ID },
      { id: PRODUCT_B_ID, name: "Designer Georgette Dupatta", vendorId: VENDOR_B_ID },
    ];

    state.vendors = [
      { id: VENDOR_A_ID, ownerId: VENDOR_A_OWNER_ID },
      { id: VENDOR_B_ID, ownerId: VENDOR_B_OWNER_ID },
    ];

    state.tickets = [];
    state.ticketMessages = [];
    state.notifications = [];
    state.notifIdCounter = 0;
  });

  it("Scenario 1: Support Ticket raised for Product A routes ONLY to Seller A", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/support/tickets")
      .send({
        subject: "Damaged Saree received",
        category: "Wrong/Damaged Item",
        description: "The Paithani saree has a tear on the pallu.",
        orderId: MULTI_SELLER_ORDER_ID,
        productId: PRODUCT_A_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.assignedTo).toBe("seller");
    expect(res.body.vendorId).toBe(VENDOR_A_ID);
    expect(res.body.productId).toBe(PRODUCT_A_ID);

    // Verify Notification isolation: Seller A must receive notification, Seller B receives 0
    const sellerANotifs = state.notifications.filter((n) => n.vendorId === VENDOR_A_ID);
    const sellerBNotifs = state.notifications.filter((n) => n.vendorId === VENDOR_B_ID);

    expect(sellerANotifs.length).toBe(1);
    expect(sellerANotifs[0].type).toBe("new_customer_query");
    expect(sellerANotifs[0].title).toBe("New customer query");
    expect(sellerBNotifs.length).toBe(0);
  });

  it("Scenario 2: Support Ticket raised for Product B routes ONLY to Seller B", async () => {
    const app = buildApp();

    const res = await request(app)
      .post("/support/tickets")
      .send({
        subject: "Dupatta color mismatch",
        category: "Product Quality Issue",
        description: "The Dupatta shade is different from the image.",
        orderId: MULTI_SELLER_ORDER_ID,
        productId: PRODUCT_B_ID,
      });

    expect(res.status).toBe(201);
    expect(res.body.assignedTo).toBe("seller");
    expect(res.body.vendorId).toBe(VENDOR_B_ID);
    expect(res.body.productId).toBe(PRODUCT_B_ID);

    // Verify Notification isolation: Seller B receives notification, Seller A receives 0
    const sellerANotifs = state.notifications.filter((n) => n.vendorId === VENDOR_A_ID);
    const sellerBNotifs = state.notifications.filter((n) => n.vendorId === VENDOR_B_ID);

    expect(sellerBNotifs.length).toBe(1);
    expect(sellerBNotifs[0].type).toBe("new_customer_query");
    expect(sellerANotifs.length).toBe(0);
  });

  it("Scenario 3: Seller B cannot view notifications or tickets belonging to Seller A", async () => {
    const app = buildApp();

    // Insert a notification directly for Seller A
    state.notifications.push({
      id: "notif-a-1",
      userId: VENDOR_A_OWNER_ID,
      vendorId: VENDOR_A_ID,
      type: "order_cancelled_seller",
      title: "Product A Cancelled",
      body: "Product A was cancelled by customer",
      read: false,
      createdAt: new Date(),
    });

    // Seller B requests their notifications list
    const resB = await request(app)
      .get("/seller/notifications")
      .set("Authorization", "Bearer seller-b");

    expect(resB.status).toBe(200);
    // Seller B's notification list must NOT contain Seller A's notification
    const receivedNotifsB = resB.body.notifications || [];
    const hasSellerANotif = receivedNotifsB.some((n: any) => n.vendorId === VENDOR_A_ID);
    expect(hasSellerANotif).toBe(false);

    // Seller B requests unread count
    const resUnreadB = await request(app)
      .get("/seller/notifications/unread-count")
      .set("Authorization", "Bearer seller-b");

    expect(resUnreadB.status).toBe(200);
    expect(resUnreadB.body.count).toBe(0);
  });
});
