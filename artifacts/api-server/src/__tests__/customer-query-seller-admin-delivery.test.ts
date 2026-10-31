import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";

const testState = {
  products: [] as any[],
  productQueries: [] as any[],
  tickets: [] as any[],
  ticketMessages: [] as any[],
  notifications: [] as any[],
  sellers: [] as any[],
};

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          orderBy: () => Promise.resolve([]),
          then: (r: any) => Promise.resolve([]).then(r),
          catch: () => Promise.resolve([]),
        }),
        orderBy: () => Promise.resolve([]),
        then: (r: any) => Promise.resolve([]).then(r),
        catch: () => Promise.resolve([]),
      }),
    }),
    insert: () => ({
      values: (val: any) => ({
        returning: () => Promise.resolve(Array.isArray(val) ? val : [val]),
        catch: () => Promise.resolve([]),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
          catch: () => Promise.resolve([]),
        }),
      }),
    }),
  },
  mongoProducts: {
    findById: vi.fn(async (id: string) => testState.products.find((p) => p.id === id || p._id === id)),
    find: vi.fn(async (filter: any) => {
      if (filter?.vendorId?.$in) {
        return testState.products.filter((p) => filter.vendorId.$in.includes(p.vendorId));
      }
      if (filter?.vendorId) {
        return testState.products.filter((p) => p.vendorId === filter.vendorId);
      }
      return testState.products;
    }),
  },
  mongoGeneric: {
    getCollection: vi.fn((colName: string) => {
      if (colName === "product_queries") {
        return {
          insertOne: vi.fn(async (doc: any) => {
            testState.productQueries.push(doc);
            return { insertedId: doc.id };
          }),
          find: vi.fn((filter: any) => ({
            sort: () => ({
              toArray: async () => {
                return testState.productQueries.filter((q) => {
                  if (filter?.$or) {
                    const matchOr = filter.$or.some((cond: any) => {
                      if (cond.vendorId?.$in) return cond.vendorId.$in.includes(q.vendorId);
                      if (cond.productId?.$in) return cond.productId.$in.includes(q.productId);
                      if (cond.vendorId) return cond.vendorId === q.vendorId;
                      return false;
                    });
                    if (!matchOr) return false;
                  }
                  if (filter?.status && filter.status !== q.status) return false;
                  return true;
                });
              },
            }),
          })),
          findOne: vi.fn(async (filter: any) => {
            return testState.productQueries.find((q) => q.id === filter?.$or?.[0]?.id || q.id === filter?.id);
          }),
          updateOne: vi.fn(async (filter: any, update: any) => {
            const query = testState.productQueries.find((q) => q.id === filter?.$or?.[0]?.id || q.id === filter?.id);
            if (query && update?.$set) {
              Object.assign(query, update.$set);
            }
            return { modifiedCount: 1 };
          }),
          countDocuments: vi.fn(async (filter: any) => {
            return testState.productQueries.filter((q) => {
              if (filter?.$or) {
                const matchOr = filter.$or.some((cond: any) => {
                  if (cond.vendorId?.$in) return cond.vendorId.$in.includes(q.vendorId);
                  if (cond.productId?.$in) return cond.productId.$in.includes(q.productId);
                  return false;
                });
                if (!matchOr) return false;
              }
              if (filter?.status?.$ne && q.status === filter.status.$ne) return false;
              return true;
            }).length;
          }),
        };
      }
      return {
        find: () => ({ toArray: async () => [] }),
        findOne: async () => null,
      };
    }),
  },
  mongoSupport: {
    insertTicket: vi.fn(async (data: any) => {
      testState.tickets.push({ ...data });
      return data;
    }),
    insertTicketMessage: vi.fn(async (data: any) => {
      testState.ticketMessages.push({ ...data, id: `msg_${Date.now()}` });
      return data;
    }),
    findTicketById: vi.fn(async (id: string) => {
      return testState.tickets.find((t) => t.id === id);
    }),
    findTicketMessages: vi.fn(async (ticketId: string) => {
      return testState.ticketMessages.filter((m) => m.ticketId === ticketId);
    }),
    findTickets: vi.fn(async (filter: any) => {
      return testState.tickets.filter((t) => {
        if (filter?.$or) {
          const matched = filter.$or.some((cond: any) => {
            if (cond.vendorId?.$in) return cond.vendorId.$in.includes(t.vendorId);
            if (cond.userId) return cond.userId === t.userId;
            if (cond.userType) {
              if (cond.userType?.$ne) return t.userType !== cond.userType.$ne;
              if (cond.userType?.$in) return cond.userType.$in.includes(t.userType);
              return cond.userType === t.userType;
            }
            if (cond.assignedTo) return cond.assignedTo === t.assignedTo;
            if (cond.escalated) return t.escalated === true;
            return false;
          });
          if (!matched) return false;
        }
        if (filter?.vendorId?.$in && !filter.vendorId.$in.includes(t.vendorId)) return false;
        if (filter?.vendorId && typeof filter.vendorId === "string" && filter.vendorId !== t.vendorId) return false;
        if (filter?.status && filter.status !== t.status) return false;
        return true;
      });
    }),
    countTickets: vi.fn(async (filter: any) => {
      return testState.tickets.length;
    }),
    updateTicket: vi.fn(async (id: string, updates: any) => {
      const ticket = testState.tickets.find((t) => t.id === id);
      if (ticket) Object.assign(ticket, updates);
      return ticket;
    }),
    markMessagesRead: vi.fn(async () => {}),
  },
  mongoNotifications: {
    insert: vi.fn(async (data: any) => {
      testState.notifications.push(data);
      return data;
    }),
    findMany: vi.fn(async (filter: any) => {
      return testState.notifications;
    }),
    count: vi.fn(async () => testState.notifications.length),
  },
  mongoSellers: {
    findById: vi.fn(async (id: string) => testState.sellers.find((s) => s.id === id || s.sellerId === id || s.vendorId === id)),
    findByVendorId: vi.fn(async (id: string) => testState.sellers.find((s) => s.vendorId === id || s.id === id)),
    findBySellerId: vi.fn(async (id: string) => testState.sellers.find((s) => s.sellerId === id || s.id === id)),
    findByOwnerId: vi.fn(async (id: string) => testState.sellers.find((s) => s.ownerId === id)),
  },
  mongoOrders: {
    findById: vi.fn(async () => null),
  },
  ADMIN_NOTIFICATION_USER_ID: "admin-sentinel-user",
  CUSTOMER_TICKET_CATEGORIES: [
    "Order Issue",
    "Delivery/Shipping Delay",
    "Product Quality Issue",
    "Wrong/Damaged Item",
    "Return/Refund",
    "Product Query",
    "Payment Issue",
    "Coupon/Discount Issue",
    "Account/Login Issue",
    "Website/App Technical Issue",
    "Seller Complaint",
    "Other",
  ],
  SELLER_TICKET_CATEGORIES: ["Payout Issue", "Other"],
  routeTicket: (userType: string, category: string, vendorId?: string | null) => {
    if (userType === "seller") return "admin";
    if (vendorId && category === "Product Query") return "seller";
    return "admin";
  },
  productsTable: { id: "id", name: "name", vendorId: "vendorId" },
  productQueriesTable: { id: "id", productId: "productId", vendorId: "vendorId", status: "status", createdAt: "createdAt" },
  supportTicketsTable: { id: "id", vendorId: "vendorId", userId: "userId", userType: "userType", status: "status", updatedAt: "updatedAt" },
  ticketMessagesTable: { id: "id", ticketId: "ticketId", userId: "userId", createdAt: "createdAt" },
  notificationsTable: { id: "id", vendorId: "vendorId", userId: "userId", read: "read", createdAt: "createdAt" },
  ordersTable: { id: "id" },
  productReviewsTable: { id: "id", vendorId: "vendorId" },
  vendorsTable: { id: "id", ownerId: "ownerId" },
}));

vi.mock("../middlewares/isAuthenticated", () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    if (req.headers["x-user-id"]) {
      req.userId = req.headers["x-user-id"];
    }
    next();
  },
  requireAuth: (req: any, res: any, next: any) => {
    if (req.headers["x-user-id"]) {
      req.userId = req.headers["x-user-id"];
      return next();
    }
    res.status(401).json({ error: "Unauthorized" });
  },
}));

vi.mock("../middlewares/isSeller", () => ({
  isSeller: (req: any, res: any, next: any) => {
    const sellerHeader = req.headers["x-seller-id"] || "vendor_123";
    req.vendorId = sellerHeader;
    req.sellerId = sellerHeader;
    req.vendor = {
      id: sellerHeader,
      vendorId: sellerHeader,
      sellerId: sellerHeader,
      ownerId: `owner_${sellerHeader}`,
    };
    req.userId = `user_${sellerHeader}`;
    next();
  },
}));

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, _res: any, next: any) => {
    req.userRole = "admin";
    next();
  },
}));

vi.mock("../lib/socket", () => ({
  emitProductEvent: vi.fn(),
}));

import reviewsRouter from "../routes/reviews";
import supportRouter from "../routes/support";
import sellerCustomersRouter from "../routes/sellerCustomers";
import sellerSupportRouter from "../routes/sellerSupport";
import adminSupportRouter from "../routes/adminSupport";

describe("Customer Query and Message delivery to Seller and Admin", () => {
  let app: express.Express;

  beforeEach(() => {
    testState.products = [
      {
        id: "prod_banarasi_01",
        _id: "prod_banarasi_01",
        name: "Pure Katan Silk Banarasi Saree",
        vendorId: "vendor_123",
      },
    ];
    testState.sellers = [
      {
        id: "vendor_123",
        vendorId: "vendor_123",
        sellerId: "VEND_123",
        ownerId: "owner_vendor_123",
      },
    ];
    testState.productQueries = [];
    testState.tickets = [];
    testState.ticketMessages = [];
    testState.notifications = [];

    app = express();
    app.use(express.json());
    app.use("/api", reviewsRouter);
    app.use("/api", supportRouter);
    app.use("/api", sellerCustomersRouter);
    app.use("/api", sellerSupportRouter);
    app.use("/api", adminSupportRouter);
  });

  it("delivers product query to both seller and admin, creates ticket, and sends notifications", async () => {
    // 1. Customer submits a question on product
    const queryRes = await request(app)
      .post("/api/products/prod_banarasi_01/queries")
      .send({
        customerName: "Aarti Sharma",
        customerEmail: "aarti@example.com",
        subject: "Blouse piece length",
        message: "Does this Banarasi saree come with an unstitched 80cm blouse piece?",
      });

    expect(queryRes.status).toBe(201);
    expect(queryRes.body.status).toBe("Open");
    expect(queryRes.body.vendorId).toBe("vendor_123");

    // 2. Query document is stored with Open status
    expect(testState.productQueries.length).toBe(1);
    expect(testState.productQueries[0].status).toBe("Open");
    expect(testState.productQueries[0].customerName).toBe("Aarti Sharma");

    // 3. Support ticket was auto-created under 'Product Query'
    expect(testState.tickets.length).toBe(1);
    const ticket = testState.tickets[0];
    expect(ticket.category).toBe("Product Query");
    expect(ticket.vendorId).toBe("vendor_123");
    expect(ticket.assignedTo).toBe("seller");

    // 4. Notifications were dispatched to BOTH Seller and Admin
    const sellerNotif = testState.notifications.find((n) => n.vendorId === "vendor_123" || n.userId === "owner_vendor_123");
    const adminNotif = testState.notifications.find((n) => n.userId === "admin-sentinel-user");

    expect(sellerNotif).toBeDefined();
    expect(sellerNotif?.type).toBe("new_customer_query");
    expect(adminNotif).toBeDefined();

    // 5. Seller fetches queries via GET /api/seller/queries
    const sellerQueriesRes = await request(app)
      .get("/api/seller/queries")
      .set("x-seller-id", "vendor_123");

    expect(sellerQueriesRes.status).toBe(200);
    expect(sellerQueriesRes.body.queries.length).toBe(1);
    expect(sellerQueriesRes.body.queries[0].message).toContain("unstitched 80cm blouse piece");

    // 6. Seller views support tickets via GET /api/seller/support/tickets
    const sellerTicketsRes = await request(app)
      .get("/api/seller/support/tickets")
      .set("x-seller-id", "vendor_123");

    expect(sellerTicketsRes.status).toBe(200);
    expect(sellerTicketsRes.body.tickets.length).toBe(1);

    // 7. Admin views support tickets via GET /api/admin/support/tickets?scope=customer
    const adminTicketsRes = await request(app)
      .get("/api/admin/support/tickets?scope=customer")
      .set("x-admin-key", "secret");

    expect(adminTicketsRes.status).toBe(200);
    expect(adminTicketsRes.body.tickets.length).toBe(1);
    expect(adminTicketsRes.body.tickets[0].category).toBe("Product Query");
  });

  it("delivers support inquiry to admin and seller when submitted with order or vendor reference", async () => {
    const ticketRes = await request(app)
      .post("/api/support/tickets")
      .send({
        name: "Priya Patel",
        email: "priya@example.com",
        subject: "Delivery inquiry",
        category: "Product Query",
        description: "When will my custom silk order ship?",
        vendorId: "vendor_123",
      });

    expect(ticketRes.status).toBe(201);
    expect(ticketRes.body.vendorId).toBe("vendor_123");

    // Both Admin and Seller notified
    const sellerNotif = testState.notifications.find((n) => n.vendorId === "vendor_123");
    const adminNotif = testState.notifications.find((n) => n.userId === "admin-sentinel-user");

    expect(sellerNotif).toBeDefined();
    expect(adminNotif).toBeDefined();

    // Listed in seller tickets
    const sellerTicketsRes = await request(app)
      .get("/api/seller/tickets")
      .set("x-seller-id", "vendor_123");
    expect(sellerTicketsRes.body.tickets.length).toBe(1);

    // Listed in admin tickets
    const adminTicketsRes = await request(app)
      .get("/api/admin/support/tickets?scope=customer");
    expect(adminTicketsRes.body.tickets.length).toBe(1);
  });
});
