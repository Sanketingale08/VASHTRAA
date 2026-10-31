import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

let mockUserId = "user-123";

vi.mock("../middlewares/isAuthenticated", () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.userId = mockUserId;
    req.user = { id: mockUserId, email: `${mockUserId}@example.com` };
    next();
  },
  isAuthenticated: (req: any, _res: any, next: any) => {
    req.userId = mockUserId;
    req.user = { id: mockUserId, email: `${mockUserId}@example.com` };
    next();
  },
}));

vi.mock("../middlewares/isAdmin", () => ({
  requireAdminKey: (req: any, _res: any, next: any) => {
    req.user = { id: "admin", role: "super_admin", email: "admin@vastraa.com" };
    next();
  },
  requireAdminOrVendorKey: (req: any, _res: any, next: any) => next(),
}));

import notificationsRouter from "../routes/notifications";
import adminNotificationsRouter from "../routes/adminNotifications";
import { mongoNotifications } from "@workspace/db";

describe("Notifications Actions (User & Admin Portals)", () => {
  let app: Express;

  beforeEach(() => {
    mockUserId = "user-123";
    app = express();
    app.use(express.json());
    app.use("/api", notificationsRouter);
    app.use("/api", adminNotificationsRouter);

    // Clean in-memory storage before each test
    mongoNotifications.clearInMemory();
  });

  describe("Repository Level Operations", () => {
    it("persists individual notification creation, read status, and updates", async () => {
      const created = await mongoNotifications.create({
        userId: "user-test-1",
        title: "Order Placed",
        body: "Your order #101 has been confirmed",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.read).toBe(false);

      // Verify findById works
      const found = await mongoNotifications.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.title).toBe("Order Placed");

      // Mark as read via update
      const updated = await mongoNotifications.update(created.id, { read: true, isRead: true });
      expect(updated?.read).toBe(true);

      const count = await mongoNotifications.count({
        userId: "user-test-1",
        $or: [{ read: false }, { isRead: false }],
      });
      expect(count).toBe(0);
    });

    it("marks all notifications as read for a specific user without affecting others", async () => {
      await mongoNotifications.create({
        userId: "user-A",
        title: "A1",
        body: "A1 body",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "user-A",
        title: "A2",
        body: "A2 body",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "user-B",
        title: "B1",
        body: "B1 body",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });

      await mongoNotifications.markAllRead("user-A", { vendorId: null });

      const unreadA = await mongoNotifications.count({
        userId: "user-A",
        $or: [{ read: false }, { isRead: false }],
      });
      const unreadB = await mongoNotifications.count({
        userId: "user-B",
        $or: [{ read: false }, { isRead: false }],
      });

      expect(unreadA).toBe(0);
      expect(unreadB).toBe(1);
    });

    it("clears all notifications for a specific user without affecting others", async () => {
      await mongoNotifications.create({
        userId: "user-X",
        title: "X1",
        body: "X1 body",
        type: "order",
        read: true,
        isRead: true,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "user-Y",
        title: "Y1",
        body: "Y1 body",
        type: "order",
        read: true,
        isRead: true,
        vendorId: null,
      });

      const deletedCount = await mongoNotifications.clearAll({ userId: "user-X", vendorId: null });
      expect(deletedCount).toBe(1);

      const itemsX = await mongoNotifications.findMany({ userId: "user-X" });
      const itemsY = await mongoNotifications.findMany({ userId: "user-Y" });

      expect(itemsX.length).toBe(0);
      expect(itemsY.length).toBe(1);
    });
  });

  describe("User Notification Endpoints (/api/notifications)", () => {

    it("GET /api/notifications returns only notifications belonging to authenticated user", async () => {
      await mongoNotifications.create({
        userId: "user-123",
        title: "User Order",
        body: "Your saree is packed",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "admin",
        title: "Admin Alert",
        body: "New vendor registered",
        type: "vendor",
        read: false,
        isRead: false,
        vendorId: null,
      });

      const res = await request(app).get("/api/notifications");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.notifications)).toBe(true);
      expect(res.body.notifications.length).toBe(1);
      expect(res.body.notifications[0].title).toBe("User Order");
    });

    it("PATCH /api/notifications/:id/read marks single notification as read", async () => {
      const created = await mongoNotifications.create({
        userId: "user-123",
        title: "User Delivery",
        body: "Out for delivery",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });

      const res = await request(app).patch(`/api/notifications/${created.id}/read`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.notification.read).toBe(true);

      const inDb = await mongoNotifications.findById(created.id);
      expect(inDb?.read).toBe(true);
    });

    it("PATCH /api/notifications/:id/read forbids reading another user's notification", async () => {
      const created = await mongoNotifications.create({
        userId: "other-user-999",
        title: "Secret",
        body: "Secret notification",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });

      const res = await request(app).patch(`/api/notifications/${created.id}/read`);
      expect(res.status).toBe(403);
    });

    it("PATCH /api/notifications/read-all marks all user notifications read", async () => {
      await mongoNotifications.create({
        userId: "user-123",
        title: "Notif 1",
        body: "B1",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "user-123",
        title: "Notif 2",
        body: "B2",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "other-user",
        title: "Notif 3",
        body: "B3",
        type: "order",
        read: false,
        isRead: false,
        vendorId: null,
      });

      const res = await request(app).patch("/api/notifications/read-all");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const unreadUser = await mongoNotifications.count({
        userId: "user-123",
        $or: [{ read: false }, { isRead: false }],
      });
      const unreadOther = await mongoNotifications.count({
        userId: "other-user",
        $or: [{ read: false }, { isRead: false }],
      });

      expect(unreadUser).toBe(0);
      expect(unreadOther).toBe(1);
    });

    it("DELETE /api/notifications/clear-all clears only authenticated user notifications", async () => {
      await mongoNotifications.create({
        userId: "user-123",
        title: "To Clear 1",
        body: "TC1",
        type: "order",
        read: true,
        isRead: true,
        vendorId: null,
      });
      await mongoNotifications.create({
        userId: "admin",
        title: "Admin Stay",
        body: "Admin stay notification",
        type: "admin",
        read: true,
        isRead: true,
        vendorId: null,
      });

      const res = await request(app).delete("/api/notifications/clear-all");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deletedCount).toBe(1);

      const userNotifs = await mongoNotifications.findMany({ userId: "user-123" });
      const adminNotifs = await mongoNotifications.findMany({ userId: "admin" });

      expect(userNotifs.length).toBe(0);
      expect(adminNotifs.length).toBe(1);
    });
  });

  describe("Admin Notification Endpoints (/api/admin/notifications)", () => {

    it("GET /api/admin/notifications/unread-count counts only admin unread notifications", async () => {
      await mongoNotifications.create({
        userId: "admin",
        title: "Vendor Pending",
        body: "Review vendor application",
        type: "vendor",
        read: false,
        isRead: false,
      });
      await mongoNotifications.create({
        userId: "customer-1",
        title: "Customer Unread",
        body: "Order shipped",
        type: "order",
        read: false,
        isRead: false,
      });

      const res = await request(app).get("/api/admin/notifications/unread-count");
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(1);
    });

    it("PATCH /api/admin/notifications/:id/read marks admin notification read", async () => {
      const created = await mongoNotifications.create({
        userId: "admin",
        title: "Dispute Filed",
        body: "Check dispute #90",
        type: "dispute",
        read: false,
        isRead: false,
      });

      const res = await request(app).patch(`/api/admin/notifications/${created.id}/read`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const inDb = await mongoNotifications.findById(created.id);
      expect(inDb?.read).toBe(true);
    });

    it("PATCH /api/admin/notifications/:id/read rejects modifying customer notification", async () => {
      const customerNotif = await mongoNotifications.create({
        userId: "customer-xyz",
        title: "Customer Order",
        body: "Delivery confirmed",
        type: "order",
        read: false,
        isRead: false,
      });

      const res = await request(app).patch(`/api/admin/notifications/${customerNotif.id}/read`);
      expect(res.status).toBe(403);
    });

    it("PATCH /api/admin/notifications/read-all marks all admin notifications read", async () => {
      await mongoNotifications.create({
        userId: "admin",
        title: "Admin 1",
        body: "A1",
        type: "admin",
        read: false,
        isRead: false,
      });
      await mongoNotifications.create({
        userId: "admin",
        title: "Admin 2",
        body: "A2",
        type: "admin",
        read: false,
        isRead: false,
      });
      await mongoNotifications.create({
        userId: "customer-1",
        title: "Customer 1",
        body: "C1",
        type: "order",
        read: false,
        isRead: false,
      });

      const res = await request(app).patch("/api/admin/notifications/read-all");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const adminUnread = await mongoNotifications.count({
        userId: "admin",
        $or: [{ read: false }, { isRead: false }],
      });
      const customerUnread = await mongoNotifications.count({
        userId: "customer-1",
        $or: [{ read: false }, { isRead: false }],
      });

      expect(adminUnread).toBe(0);
      expect(customerUnread).toBe(1);
    });

    it("DELETE /api/admin/notifications/clear-all clears only admin notifications", async () => {
      await mongoNotifications.create({
        userId: "admin",
        title: "Admin Clear 1",
        body: "AC1",
        type: "admin",
        read: true,
        isRead: true,
      });
      await mongoNotifications.create({
        userId: "customer-1",
        title: "Customer Keep",
        body: "CK",
        type: "order",
        read: true,
        isRead: true,
      });

      const res = await request(app).delete("/api/admin/notifications/clear-all");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.deletedCount).toBe(1);

      const adminItems = await mongoNotifications.findMany({ userId: "admin" });
      const customerItems = await mongoNotifications.findMany({ userId: "customer-1" });

      expect(adminItems.length).toBe(0);
      expect(customerItems.length).toBe(1);
    });
  });
});
