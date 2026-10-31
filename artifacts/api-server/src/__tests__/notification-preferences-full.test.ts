import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

let mockUserId = "user-alice";

vi.mock("../middlewares/isAuthenticated", () => ({
  requireAuth: (req: any, res: any, next: any) => {
    if (!mockUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = mockUserId;
    req.user = { id: mockUserId, email: `${mockUserId}@example.com` };
    next();
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!mockUserId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    req.userId = mockUserId;
    req.user = { id: mockUserId, email: `${mockUserId}@example.com` };
    next();
  },
}));

import notificationsRouter from "../routes/notifications";
import { mongoNotificationPreferences, mongoNotifications } from "@workspace/db";
import { sendPromotionalCampaignEmail } from "../lib/transactionalEmail";

describe("Notification Preferences Functionality & Cleanup Test Suite", () => {
  let app: Express;

  beforeEach(() => {
    mockUserId = "user-alice";
    mongoNotificationPreferences.clearInMemory();
    mongoNotifications.clearInMemory();
    app = express();
    app.use(express.json());
    app.use("/api", notificationsRouter);
  });

  describe("1. Initial State & Defaults", () => {
    it("returns explicit defaults for a user with no preferences record", async () => {
      const res = await request(app).get("/api/notifications/preferences");
      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        orderUpdates: true,
        offerAlerts: true,
        emailOrderUpdates: true,
        emailMarketingUpdates: true,
        emailOfferUpdates: true,
      });
      // Verify removed stock fields do NOT exist in the response
      expect(res.body.stockAlerts).toBeUndefined();
      expect(res.body.emailStockAlerts).toBeUndefined();
    });

    it("rejects unauthorized access when no auth context exists", async () => {
      mockUserId = "";
      const res = await request(app).get("/api/notifications/preferences");
      expect(res.status).toBe(401);
    });
  });

  describe("2. Toggles Persist Independently (In-App & Email)", () => {
    it("allows updating orderUpdates to false and persists in storage", async () => {
      const patchRes = await request(app)
        .patch("/api/notifications/preferences")
        .send({ orderUpdates: false });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.success).toBe(true);
      expect(patchRes.body.preferences.orderUpdates).toBe(false);
      expect(patchRes.body.preferences.offerAlerts).toBe(true);

      const getRes = await request(app).get("/api/notifications/preferences");
      expect(getRes.status).toBe(200);
      expect(getRes.body.orderUpdates).toBe(false);
      expect(getRes.body.offerAlerts).toBe(true);
    });

    it("allows updating offerAlerts to false without resetting orderUpdates", async () => {
      // First turn orderUpdates off
      await request(app)
        .patch("/api/notifications/preferences")
        .send({ orderUpdates: false });

      // Then turn offerAlerts off
      const patchRes = await request(app)
        .patch("/api/notifications/preferences")
        .send({ offerAlerts: false });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.preferences.orderUpdates).toBe(false);
      expect(patchRes.body.preferences.offerAlerts).toBe(false);
      expect(patchRes.body.preferences.emailOrderUpdates).toBe(true);

      const getRes = await request(app).get("/api/notifications/preferences");
      expect(getRes.body.orderUpdates).toBe(false);
      expect(getRes.body.offerAlerts).toBe(false);
    });

    it("allows toggling each of the three email preferences independently", async () => {
      // Toggle emailMarketingUpdates to false
      const res1 = await request(app)
        .patch("/api/notifications/preferences")
        .send({ emailMarketingUpdates: false });
      expect(res1.body.preferences.emailMarketingUpdates).toBe(false);
      expect(res1.body.preferences.emailOrderUpdates).toBe(true);
      expect(res1.body.preferences.emailOfferUpdates).toBe(true);

      // Toggle emailOfferUpdates to false
      const res2 = await request(app)
        .patch("/api/notifications/preferences")
        .send({ emailOfferUpdates: false });
      expect(res2.body.preferences.emailMarketingUpdates).toBe(false);
      expect(res2.body.preferences.emailOfferUpdates).toBe(false);
      expect(res2.body.preferences.emailOrderUpdates).toBe(true);

      // Toggle emailOrderUpdates to false
      const res3 = await request(app)
        .patch("/api/notifications/preferences")
        .send({ emailOrderUpdates: false });
      expect(res3.body.preferences.emailMarketingUpdates).toBe(false);
      expect(res3.body.preferences.emailOfferUpdates).toBe(false);
      expect(res3.body.preferences.emailOrderUpdates).toBe(false);
    });

    it("rejects non-boolean preference updates or invalid keys", async () => {
      const res = await request(app)
        .patch("/api/notifications/preferences")
        .send({ orderUpdates: "yes" as any });
      expect(res.status).toBe(400);

      const resEmpty = await request(app)
        .patch("/api/notifications/preferences")
        .send({});
      expect(resEmpty.status).toBe(400);
    });
  });

  describe("3. Stock Notification Categories Completely Removed", () => {
    it("strips legacy stockAlerts and emailStockAlerts from payloads and responses", async () => {
      const patchRes = await request(app)
        .patch("/api/notifications/preferences")
        .send({
          orderUpdates: true,
          stockAlerts: false, // obsolete key sent by legacy client
          emailStockAlerts: false, // obsolete key
        });

      expect(patchRes.status).toBe(200);
      expect(patchRes.body.preferences.stockAlerts).toBeUndefined();
      expect(patchRes.body.preferences.emailStockAlerts).toBeUndefined();
      expect(patchRes.body.stockAlerts).toBeUndefined();
      expect(patchRes.body.emailStockAlerts).toBeUndefined();

      const getRes = await request(app).get("/api/notifications/preferences");
      expect(getRes.body.stockAlerts).toBeUndefined();
      expect(getRes.body.emailStockAlerts).toBeUndefined();
    });

    it("handles legacy database documents safely without errors", async () => {
      // Simulate an older document in MongoDB / memory that had stockAlerts
      mongoNotificationPreferences.inMemoryNotificationPreferencesMap.set("user-legacy", {
        userId: "user-legacy",
        orderUpdates: true,
        offerAlerts: true,
        emailOrderUpdates: true,
        emailMarketingUpdates: true,
        emailOfferUpdates: true,
        ...({ stockAlerts: false, emailStockAlerts: false } as any),
      });

      mockUserId = "user-legacy";
      const getRes = await request(app).get("/api/notifications/preferences");
      expect(getRes.status).toBe(200);
      expect(getRes.body).toEqual({
        orderUpdates: true,
        offerAlerts: true,
        emailOrderUpdates: true,
        emailMarketingUpdates: true,
        emailOfferUpdates: true,
      });
      expect(getRes.body.stockAlerts).toBeUndefined();
    });
  });

  describe("4. Multi-Tenant User Isolation", () => {
    it("ensures User A cannot modify or leak preferences to User B", async () => {
      // User A (Alice) sets orderUpdates = false, emailMarketingUpdates = false
      mockUserId = "user-alice";
      await request(app)
        .patch("/api/notifications/preferences")
        .send({ orderUpdates: false, emailMarketingUpdates: false });

      // User B (Bob) checks preferences — Bob's defaults remain untouched!
      mockUserId = "user-bob";
      const bobRes = await request(app).get("/api/notifications/preferences");
      expect(bobRes.body.orderUpdates).toBe(true);
      expect(bobRes.body.emailMarketingUpdates).toBe(true);

      // User B sets emailOfferUpdates = false
      await request(app)
        .patch("/api/notifications/preferences")
        .send({ emailOfferUpdates: false });

      // Verify User A still has their own settings
      mockUserId = "user-alice";
      const aliceRes = await request(app).get("/api/notifications/preferences");
      expect(aliceRes.body.orderUpdates).toBe(false);
      expect(aliceRes.body.emailMarketingUpdates).toBe(false);
      expect(aliceRes.body.emailOfferUpdates).toBe(true); // Bob's change did not leak!
    });
  });

  describe("5. Promotional Email Delivery Preference Gating", () => {
    it("suppresses promotional campaign emails when emailMarketingUpdates is OFF", async () => {
      await mongoNotificationPreferences.upsert("user-marketing-test", {
        emailMarketingUpdates: false,
      });

      const sent = await sendPromotionalCampaignEmail({
        userId: "user-marketing-test",
        subject: "Festive Saree Sale",
        htmlContent: "<p>Save 50% on all silks!</p>",
      });

      expect(sent).toBe(false);
    });
  });
});
