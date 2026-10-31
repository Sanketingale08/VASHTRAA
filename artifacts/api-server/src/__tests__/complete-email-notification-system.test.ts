import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock nodemailer before importing transactionalEmail
const sendMailMock = vi.hoisted(() => vi.fn());
const verifyMock = vi.hoisted(() => vi.fn());

vi.mock("nodemailer", () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: sendMailMock,
      verify: verifyMock,
    })),
  },
}));

// In-memory mock store for MongoDB and PostgreSQL
const mockUsers = vi.hoisted(() => new Map<string, any>());
const mockOrders = vi.hoisted(() => new Map<string, any>());
const mockOutbox = vi.hoisted(() => [] as any[]);
const mockPreferences = vi.hoisted(() => new Map<string, any>());

vi.mock("@workspace/db", () => {
  return {
    db: {
      insert: vi.fn(() => ({
        values: vi.fn(async (val: any) => {
          mockOutbox.push(val);
          return [val];
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(async () => []),
        })),
      })),
    },
    mongoUsers: {
      findById: vi.fn(async (id: string) => mockUsers.get(id) || null),
      findByEmail: vi.fn(async (email: string) => {
        for (const u of mockUsers.values()) {
          if (u.email === email) return u;
        }
        return null;
      }),
    },
    mongoOrders: {
      findById: vi.fn(async (id: string) => mockOrders.get(id) || null),
    },
    mongoNotificationPreferences: {
      findByUserId: vi.fn(async (userId: string) => mockPreferences.get(userId) || {}),
    },
    mongoEmailOutbox: {
      create: vi.fn(async (doc: any) => {
        mockOutbox.push(doc);
        return doc;
      }),
      update: vi.fn(async (id: string, updates: any) => {
        const found = mockOutbox.find((o) => o.id === id);
        if (found) Object.assign(found, updates);
        return found;
      }),
    },
    emailOutboxTable: {},
    eq: vi.fn(),
    and: vi.fn(),
    desc: vi.fn(),
    sql: vi.fn(),
    isMongoDbConnected: vi.fn(() => true),
  };
});

describe("Complete VASTRAA Email Notification System", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.clear();
    mockOrders.clear();
    mockOutbox.length = 0;
    mockPreferences.clear();

    // Default Hostinger SMTP test environment
    process.env.SMTP_HOST = "smtp.hostinger.com";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "true";
    process.env.SMTP_USER = "notifications@vastraa.com";
    process.env.SMTP_PASS = "SecretHostingerPass123!";
    process.env.SMTP_FROM = '"VASTRAA" <notifications@vastraa.com>';
    process.env.TEST_EMAIL_DELIVERY = "true";

    sendMailMock.mockResolvedValue({ messageId: "msg-test-12345" });
    verifyMock.mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. SMTP Configuration & Hostinger Connection Verification
  // ─────────────────────────────────────────────────────────────────────────────
  describe("SMTP Configuration & Verification", () => {
    it("verifies SMTP connection safely without leaking SMTP password", async () => {
      const { verifySmtpConnection } = await import("../lib/transactionalEmail");
      const result = await verifySmtpConnection();

      expect(result.configured).toBe(true);
      expect(result.success).toBe(true);
      expect(result.host).toBe("smtp.hostinger.com");
      expect(result.port).toBe(465);
      expect(result.from).toBe('"VASTRAA" <notifications@vastraa.com>');
      // Password must NEVER be exposed
      expect((result as any).pass).toBeUndefined();
      expect(JSON.stringify(result)).not.toContain("SecretHostingerPass123!");
    });

    it("reports configured=false when SMTP credentials are completely missing", async () => {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;

      const { verifySmtpConnection } = await import("../lib/transactionalEmail");
      const result = await verifySmtpConnection();

      expect(result.configured).toBe(false);
      expect(result.success).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Recipient Email Resolution & Safety
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Recipient Email Resolution", () => {
    it("resolves recipient email from MongoDB Atlas user record", async () => {
      mockUsers.set("cust-101", {
        id: "cust-101",
        name: "Priya Sharma",
        email: "priya.sharma@example.com",
      });

      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-101",
        type: "order_confirmed",
        orderId: "ord-101",
        itemName: "Banarasi Silk Saree",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "priya.sharma@example.com",
          from: '"VASTRAA" <notifications@vastraa.com>',
        })
      );
    });

    it("falls back to order shippingAddress email when user record has no email", async () => {
      mockUsers.set("cust-no-email", {
        id: "cust-no-email",
        name: "Guest Buyer",
      });
      mockOrders.set("ord-address-fallback", {
        id: "ord-address-fallback",
        userId: "cust-no-email",
        shippingAddress: {
          email: "guest.buyer@example.com",
        },
      });

      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-no-email",
        orderId: "ord-address-fallback",
        type: "order_placed",
        itemName: "Anarkali Suit",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "guest.buyer@example.com",
        })
      );
    });

    it("safely skips sending and records status when recipient has no valid email", async () => {
      mockUsers.set("cust-empty", {
        id: "cust-empty",
        name: "Unknown",
        email: "",
      });

      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-empty",
        type: "order_confirmed",
        orderId: "ord-invalid",
        itemName: "Item",
      });

      expect(res.delivered).toBe(false);
      expect(res.status).toBe("skipped");
      expect(sendMailMock).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Email Templates, Luxury Branding & Plain Text
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Email Branding & Plain Text Generation", () => {
    it("renders VASTRAA brand colors, logo header, and plain text alternative", async () => {
      mockUsers.set("cust-brand", {
        id: "cust-brand",
        name: "Aarav Patel",
        email: "aarav@example.com",
      });

      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      await sendTransactionalEmail({
        userId: "cust-brand",
        type: "order_confirmed",
        orderId: "ord-brand-1",
        itemName: "Royal Bandhani Kurta",
        totalAmount: 4999,
      });

      const mailOptions = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
      expect(mailOptions.html).toContain("VASTRAA");
      expect(mailOptions.html).toContain("#0A1F44"); // Navy brand color
      expect(mailOptions.html).toContain("#C5A265"); // Royal Gold accent
      expect(mailOptions.html).toContain("₹4,999"); // Indian Rupee formatting
      expect(mailOptions.text).toBeDefined();
      expect(mailOptions.text).toContain("VASTRAA");
      expect(mailOptions.text).toContain("Royal Bandhani Kurta");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Account Notifications
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Account Notifications", () => {
    it("sends account welcome email upon customer registration", async () => {
      const { sendAccountWelcomeEmail } = await import("../lib/transactionalEmail");
      const res = await sendAccountWelcomeEmail({
        userId: "new-user-1",
        name: "Ananya Roy",
        email: "ananya.roy@example.com",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ananya.roy@example.com",
          subject: expect.stringContaining("Welcome to VASTRAA"),
        })
      );
    });

    it("sends password changed confirmation email", async () => {
      mockUsers.set("user-pwd", {
        id: "user-pwd",
        name: "Rohit Verma",
        email: "rohit.verma@example.com",
      });

      const { sendPasswordChangedEmail } = await import("../lib/transactionalEmail");
      const res = await sendPasswordChangedEmail({
        userId: "user-pwd",
        email: "rohit.verma@example.com",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "rohit.verma@example.com",
          subject: expect.stringContaining("Password Changed"),
        })
      );
    });

    it("sends account security alert email", async () => {
      const { sendAccountSecurityAlertEmail } = await import("../lib/transactionalEmail");
      const res = await sendAccountSecurityAlertEmail({
        userId: "sec-user-1",
        email: "security@example.com",
        alertType: "New Login Detected",
        details: "Login from Chrome on Windows near Mumbai, India",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "security@example.com",
          subject: expect.stringContaining("Security Alert"),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Order Lifecycle Notifications End-to-End
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Order Lifecycle Notifications", () => {
    beforeEach(() => {
      mockUsers.set("cust-order", {
        id: "cust-order",
        name: "Vikram Malhotra",
        email: "vikram@example.com",
      });
    });

    it("sends order_placed notification email", async () => {
      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-order",
        type: "order_placed",
        orderId: "ord-pl-001",
        itemName: "Embroidered Sherwani",
        totalAmount: 18500,
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "vikram@example.com",
          subject: expect.stringContaining("Order Placed Successfully"),
        })
      );
    });

    it("sends order_shipped email with tracking number and carrier", async () => {
      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-order",
        type: "order_shipped",
        orderId: "ord-sh-002",
        itemName: "Embroidered Sherwani",
        trackingNumber: "DELHIVERY987654321",
        carrier: "Delhivery Express",
      });

      expect(res.delivered).toBe(true);
      const call = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
      expect(call.subject).toContain("Shipped");
      expect(call.html).toContain("DELHIVERY987654321");
      expect(call.html).toContain("Delhivery Express");
      expect(call.text).toContain("DELHIVERY987654321");
    });

    it("sends order_delivered notification email", async () => {
      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-order",
        type: "order_delivered",
        orderId: "ord-del-003",
        itemName: "Embroidered Sherwani",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/delivered/i),
        })
      );
    });

    it("sends order_cancelled notification email", async () => {
      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-order",
        type: "order_cancelled",
        orderId: "ord-can-004",
        itemName: "Embroidered Sherwani",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringMatching(/cancelled/i),
        })
      );
    });

    it("sends return_approved and refund_completed emails", async () => {
      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");

      const returnRes = await sendTransactionalEmail({
        userId: "cust-order",
        type: "return_approved",
        orderId: "ord-ret-005",
        itemName: "Embroidered Sherwani",
      });
      expect(returnRes.delivered).toBe(true);

      const refundRes = await sendTransactionalEmail({
        userId: "cust-order",
        type: "refund_completed",
        orderId: "ord-ref-006",
        itemName: "Embroidered Sherwani",
        reference: "CF_REF_887766",
      });
      expect(refundRes.delivered).toBe(true);

      const refundCall = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
      expect(refundCall.subject).toMatch(/refund/i);
      expect(refundCall.html).toContain("CF_REF_887766");
    });

    it("sends payment_failed notification email with retry advice", async () => {
      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");
      const res = await sendTransactionalEmail({
        userId: "cust-order",
        type: "payment_failed",
        orderId: "ord-fail-007",
        itemName: "Embroidered Sherwani",
        totalAmount: 18500,
      });

      expect(res.delivered).toBe(true);
      const call = sendMailMock.mock.calls[sendMailMock.mock.calls.length - 1][0];
      expect(call.subject).toMatch(/payment/i);
      expect(call.html).toContain("₹18,500");
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Promotional Emails & Preference Consent Gating
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Offers & Promotions with Consent Gating", () => {
    it("suppresses promotional email when customer has opted out in database preferences", async () => {
      mockUsers.set("cust-promo-optout", {
        id: "cust-promo-optout",
        email: "optout@example.com",
      });
      mockPreferences.set("cust-promo-optout", {
        emailOfferUpdates: false,
        emailMarketingUpdates: false,
      });

      const { sendCouponAvailableEmail } = await import("../lib/transactionalEmail");
      const res = await sendCouponAvailableEmail({
        userId: "cust-promo-optout",
        couponCode: "DIWALI50",
        discountText: "50% off",
      });

      expect(res.delivered).toBe(false);
      expect(res.status).toBe("skipped");
      expect(sendMailMock).not.toHaveBeenCalled();
    });

    it("delivers promotional email when customer has consented", async () => {
      mockUsers.set("cust-promo-optin", {
        id: "cust-promo-optin",
        email: "optin@example.com",
      });
      mockPreferences.set("cust-promo-optin", {
        emailOfferUpdates: true,
        emailMarketingUpdates: true,
      });

      const { sendCouponAvailableEmail } = await import("../lib/transactionalEmail");
      const res = await sendCouponAvailableEmail({
        userId: "cust-promo-optin",
        couponCode: "ROYALFEST",
        discountText: "₹2,000 off",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "optin@example.com",
          subject: expect.stringContaining("ROYALFEST"),
        })
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Customer Support Notifications
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Customer Support Notifications", () => {
    it("sends ticket created, reply, and status change emails", async () => {
      mockUsers.set("cust-supp", {
        id: "cust-supp",
        email: "support.buyer@example.com",
      });

      const { sendSupportTicketEmail } = await import("../lib/transactionalEmail");

      // 1. Ticket Created
      const createRes = await sendSupportTicketEmail({
        userId: "cust-supp",
        type: "support_ticket_created",
        ticketId: "TCK-8812",
        ticketSubject: "Saree Blouse Sizing Inquiry",
        status: "Open",
      });
      expect(createRes.delivered).toBe(true);

      // 2. Ticket Reply
      const replyRes = await sendSupportTicketEmail({
        userId: "cust-supp",
        type: "support_ticket_reply",
        ticketId: "TCK-8812",
        ticketSubject: "Saree Blouse Sizing Inquiry",
        messagePreview: "Our styling team has reviewed your measurements and recommends size 38.",
      });
      expect(replyRes.delivered).toBe(true);

      // 3. Ticket Status Updated
      const statusRes = await sendSupportTicketEmail({
        userId: "cust-supp",
        type: "support_ticket_status",
        ticketId: "TCK-8812",
        ticketSubject: "Saree Blouse Sizing Inquiry",
        status: "Resolved",
      });
      expect(statusRes.delivered).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 8. Deduplication & Idempotency
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Deduplication & Idempotency", () => {
    it("suppresses duplicate email send when identical event is processed in rapid succession", async () => {
      mockUsers.set("cust-dedup", {
        id: "cust-dedup",
        email: "dedup@example.com",
      });

      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");

      // First send
      const first = await sendTransactionalEmail({
        userId: "cust-dedup",
        type: "order_confirmed",
        orderId: "ord-dedup-1",
        itemName: "Chanderi Saree",
      });
      expect(first.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledTimes(1);

      // Immediate duplicate trigger for the same order & type
      const second = await sendTransactionalEmail({
        userId: "cust-dedup",
        type: "order_confirmed",
        orderId: "ord-dedup-1",
        itemName: "Chanderi Saree",
      });
      expect(second.delivered).toBe(true);
      expect(second.duplicate).toBe(true);
      // Transport should NOT have been called again!
      expect(sendMailMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 9. Failure Isolation (Non-blocking)
  // ─────────────────────────────────────────────────────────────────────────────
  describe("Failure Isolation", () => {
    it("does not throw or disrupt business workflows when SMTP transport fails", async () => {
      mockUsers.set("cust-err", {
        id: "cust-err",
        email: "err@example.com",
      });

      sendMailMock.mockRejectedValueOnce(new Error("Hostinger SMTP 550 Mailbox temporarily unavailable"));

      const { sendTransactionalEmail } = await import("../lib/transactionalEmail");

      // Must NOT throw:
      let caughtError: any = null;
      let res: any;
      try {
        res = await sendTransactionalEmail({
          userId: "cust-err",
          type: "order_confirmed",
          orderId: "ord-err-1",
          itemName: "Silk Scarf",
        });
      } catch (err) {
        caughtError = err;
      }

      if (caughtError) console.error("Failure isolation error:", caughtError);
      expect(caughtError).toBeNull();
      expect(res.delivered).toBe(false);
      expect(res.status).toBe("failed");
    });
  });
});
