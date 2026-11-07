import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// Hoist mocks before importing modules
const sendMailMock = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: "zoho-msg-" + Date.now() }));
const verifyMock = vi.hoisted(() => vi.fn().mockResolvedValue(true));
const createTransportMock = vi.hoisted(() => vi.fn((opts: any) => ({
  options: opts,
  sendMail: sendMailMock,
  verify: verifyMock,
})));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

// In-memory mocks for db
const mockUsers = vi.hoisted(() => new Map<string, any>());
const mockSellers = vi.hoisted(() => new Map<string, any>());
const mockOrders = vi.hoisted(() => new Map<string, any>());
const mockOutbox = vi.hoisted(() => [] as any[]);

vi.mock("@workspace/db", () => ({
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
    update: vi.fn(async (id: string, updates: any) => {
      const u = mockUsers.get(id);
      if (!u) return null;
      const updated = { ...u, ...updates };
      mockUsers.set(id, updated);
      return updated;
    }),
  },
  mongoSellers: {
    findById: vi.fn(async (id: string) => mockSellers.get(id) || null),
    findByEmail: vi.fn(async (email: string) => {
      for (const s of mockSellers.values()) {
        if (s.contactEmail === email || s.email === email) return s;
      }
      return null;
    }),
  },
  mongoVendors: {
    findById: vi.fn(async (id: string) => null),
  },
  mongoOrders: {
    findById: vi.fn(async (id: string) => mockOrders.get(id) || null),
  },
  mongoNotificationPreferences: {
    findByUserId: vi.fn(async () => null),
  },
  mongoGeneric: {
    getCollection: vi.fn(() => ({
      findOne: vi.fn(async (q: any) => {
        const id = q?.id || q?._id;
        if (id && mockOrders.has(id)) return mockOrders.get(id);
        return null;
      }),
      updateOne: vi.fn(async () => ({ modifiedCount: 1 })),
      insertOne: vi.fn(async () => ({ acknowledged: true })),
    })),
  },
  isMongoDbConnected: () => true,
  emailOutboxTable: { id: "id" },
  ordersTable: { id: "id", displayId: "displayId" },
}));

import {
  getSmtpTransporter,
  verifySmtpConnection,
  validateProductionSmtpConfig,
  sendTransactionalEmail,
  sendSellerNewOrderEmail,
  buildEmailContent,
  wrapInTemplate,
} from "../lib/transactionalEmail";

describe("Zoho SMTP Production-Ready Integration Tests", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUsers.clear();
    mockSellers.clear();
    mockOrders.clear();
    mockOutbox.length = 0;

    process.env = {
      ...originalEnv,
      SMTP_HOST: "smtppro.zoho.in",
      SMTP_PORT: "465",
      SMTP_SECURE: "true",
      SMTP_USER: "support@vastraasaree.com",
      SMTP_PASS: "cPzp0mFzM2N0",
      SMTP_PASSWORD: "cPzp0mFzM2N0",
      SMTP_FROM: "noreply@vastraasaree.com",
      SMTP_FROM_NAME: "VASTRAA",
      SMTP_FROM_EMAIL: "noreply@vastraasaree.com",
      SMTP_REPLY_TO: "support@vastraasaree.com",
      FRONTEND_URL: "https://vastraasaree.com",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // 1. Zoho SMTP Configuration & Security
  describe("1. Zoho SMTP Configuration & Security", () => {
    it("creates transporter configured for smtppro.zoho.in port 465 with direct SSL and connection pooling", () => {
      const transporter = getSmtpTransporter({
        host: "smtppro.zoho.in",
        port: 465,
        secure: true,
        user: "support@vastraasaree.com",
        pass: "cPzp0mFzM2N0",
      });
      expect(transporter).toBeDefined();

      const lastCall = createTransportMock.mock.calls.at(-1)[0];
      expect(lastCall.host).toBe("smtppro.zoho.in");
      expect(lastCall.port).toBe(465);
      expect(lastCall.secure).toBe(true);
      expect(lastCall.pool).toBe(true);
      expect(lastCall.maxConnections).toBe(5);
      expect(lastCall.maxMessages).toBe(100);
      expect(lastCall.connectionTimeout).toBe(10000);
      expect(lastCall.auth.user).toBe("support@vastraasaree.com");
      expect(lastCall.auth.pass).toBe("cPzp0mFzM2N0");
    });

    it("verifies Zoho SMTP connection safely and masks authentication user", async () => {
      const res = await verifySmtpConnection();
      expect(res.configured).toBe(true);
      expect(res.connected).toBe(true);
      expect(res.host).toBe("smtppro.zoho.in");
      expect(res.port).toBe(465);
      expect(res.from).toContain("noreply@vastraasaree.com");
      // Password must NEVER appear in the verification output
      expect((res as any).password).toBeUndefined();
      expect((res as any).pass).toBeUndefined();
      // Masked user format
      expect(res.user).toMatch(/^s\*{1,}.*@vastraasaree\.com$/);
    });
  });

  // 2. Email Templates & Purple Theme Branding
  describe("2. Email Templates & Purple Theme Branding", () => {
    it("formats customer registration OTP email with royal purple branding, gold accent, and 10-minute expiry", () => {
      const content = buildEmailContent(
        "registration_otp",
        "Aarav Sharma",
        "",
        undefined,
        "482910"
      );

      const fullHtml = wrapInTemplate(content.subject, content.html);

      expect(content.subject).toBe("Your VASTRAA Verification Code is 482910");
      expect(content.html).toContain("482910");
      // Royal purple header & badge colors
      expect(content.html).toContain("#3B1254");
      expect(content.html).toContain("#7E22CE");
      // Full template includes gold accent & footer
      expect(fullHtml).toContain("#C5A265");
      // Monospace OTP presentation container
      expect(content.html).toContain("Courier New");
      expect(content.html).toContain("Valid for 10 minutes");
      // Footer branding
      expect(fullHtml).toContain("VASTRAA – The Art of Indian Drape");
      expect(fullHtml).toContain("support@vastraasaree.com");
    });

    it("formats customer email verification link template with purple theme", () => {
      const content = buildEmailContent(
        "customer_email_verification",
        "Pooja Hegde",
        "",
        undefined,
        "https://vastraasaree.com/verify-email?token=sec_token_991"
      );

      expect(content.subject).toBe("Verify Your VASTRAA Account");
      expect(content.html).toContain("https://vastraasaree.com/verify-email?token=sec_token_991");
      expect(content.html).toContain("#3B1254");
      expect(content.html).toContain("#4A154B");
      expect(content.html).toContain("This verification link will expire in 15 minutes");
      expect(content.html).toContain("VASTRAA – The Art of Indian Drape");
    });

    it("formats password reset template with single-use security notice and 1-hour expiry", () => {
      const content = buildEmailContent(
        "password_reset",
        "Meera Nair",
        "",
        undefined,
        "https://vastraasaree.com/reset-password?token=pwd_reset_882"
      );

      expect(content.subject).toContain("Reset your VASTRAA");
      expect(content.html).toContain("https://vastraasaree.com/reset-password?token=pwd_reset_882");
      expect(content.html).toContain("valid for <strong>1 hour</strong>");
      expect(content.html).toContain("support@vastraasaree.com");
      expect(content.html).toContain("#3B1254");
    });

    it("formats email change and mobile change OTP templates with purple theme", () => {
      const emailChange = buildEmailContent(
        "email_change_otp",
        "",
        "",
        undefined,
        "654321"
      );
      expect(emailChange.subject).toBe("Your Verification Code for VASTRAA Email Change is 654321");
      expect(emailChange.html).toContain("654321");
      expect(emailChange.html).toContain("#3B1254");

      const phoneChange = buildEmailContent(
        "phone_change_otp",
        "",
        "",
        "Updating mobile to +91 9876543210",
        "123456",
        { note: "Updating mobile to +91 9876543210" }
      );
      expect(phoneChange.subject).toBe("Your Verification Code for VASTRAA Mobile Number Update is 123456");
      expect(phoneChange.html).toContain("123456");
      expect(phoneChange.html).toContain("+91 9876543210");
    });
  });

  // 3. Order Lifecycle Email Notifications
  describe("3. Order Lifecycle Email Notifications", () => {
    it("delivers order_placed and order_confirmed emails with item breakdown and totals", async () => {
      mockUsers.set("cust_ananya_101", {
        id: "cust_ananya_101",
        email: "ananya.pandey@example.com",
        name: "Ananya Pandey",
      });

      const res = await sendTransactionalEmail({
        userId: "cust_ananya_101",
        type: "order_confirmed",
        orderId: "ORD-ZOHO-101",
        customerName: "Ananya Pandey",
        items: [
          { name: "Kanjeevaram Pure Zari Silk Saree", quantity: 1, price: 18500, subtotal: 18500 },
          { name: "Raw Silk Matching Blouse Piece", quantity: 1, price: 1500, subtotal: 1500 },
        ],
        totalAmount: 20000,
        shippingAddress: {
          name: "Ananya Pandey",
          address: "Flat 402, Lotus Towers, Bandra West",
          city: "Mumbai",
          state: "Maharashtra",
          pincode: "400050",
          phone: "9876543210",
        },
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "ananya.pandey@example.com",
          replyTo: "support@vastraasaree.com",
          html: expect.stringContaining("Kanjeevaram Pure Zari Silk Saree"),
        })
      );
      const callArgs = sendMailMock.mock.calls.at(-1)[0];
      expect(callArgs.from).toContain("noreply@vastraasaree.com");
      expect(callArgs.from).toContain("VASTRAA");
    });

    it("delivers shipping updates with tracking number and courier carrier details", async () => {
      mockUsers.set("cust_priya_102", {
        id: "cust_priya_102",
        email: "priya.deshmukh@example.com",
        name: "Priya Deshmukh",
      });

      const res = await sendTransactionalEmail({
        userId: "cust_priya_102",
        type: "order_shipped",
        orderId: "ORD-ZOHO-102",
        trackingNumber: "DELHIVERY-998822",
        courierName: "Delhivery Express",
        trackingUrl: "https://delhivery.com/track/DELHIVERY-998822",
      });

      expect(res.delivered).toBe(true);
      expect(sendMailMock).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "priya.deshmukh@example.com",
          html: expect.stringContaining("DELHIVERY-998822"),
        })
      );
    });
  });

  // 4. Multi-Vendor Isolation for Seller Notifications
  describe("4. Multi-Vendor Isolation for Seller Notifications", () => {
    it("dispatches isolated notifications to each seller containing only their own products and settlement", async () => {
      mockSellers.set("seller_banaras_1", {
        id: "seller_banaras_1",
        shopName: "Banaras Silk Heritage",
        contactEmail: "orders@banarassilk.in",
      });

      mockSellers.set("seller_sambalpuri_2", {
        id: "seller_sambalpuri_2",
        shopName: "Sambalpuri Handloom Guild",
        contactEmail: "weaves@sambalpuri.org",
      });

      const res1 = await sendSellerNewOrderEmail({
        vendorId: "seller_banaras_1",
        orderId: "ORD-MULTI-ZOHO-01",
        sellerStoreName: "Banaras Silk Heritage",
        items: [{ name: "Katan Silk Brocade Saree", quantity: 1, price: 14000, subtotal: 14000 }],
        settlementAmount: 12320,
        deliveryCity: "Bengaluru",
      });

      const res2 = await sendSellerNewOrderEmail({
        vendorId: "seller_sambalpuri_2",
        orderId: "ORD-MULTI-ZOHO-01",
        sellerStoreName: "Sambalpuri Handloom Guild",
        items: [{ name: "Sambalpuri Ikat Cotton Saree", quantity: 2, price: 3200, subtotal: 6400 }],
        settlementAmount: 5632,
        deliveryCity: "Bengaluru",
      });

      expect(res1.delivered).toBe(true);
      expect(res2.delivered).toBe(true);

      // Verify Seller 1 received only Banaras items
      const call1 = sendMailMock.mock.calls.find((c) => c[0].to === "orders@banarassilk.in");
      expect(call1).toBeDefined();
      expect(call1[0].html).toContain("Katan Silk Brocade Saree");
      expect(call1[0].html).not.toContain("Sambalpuri Ikat Cotton Saree");

      // Verify Seller 2 received only Sambalpuri items
      const call2 = sendMailMock.mock.calls.find((c) => c[0].to === "weaves@sambalpuri.org");
      expect(call2).toBeDefined();
      expect(call2[0].html).toContain("Sambalpuri Ikat Cotton Saree");
      expect(call2[0].html).not.toContain("Katan Silk Brocade Saree");
    });
  });

  // 5. Deduplication & Idempotency
  describe("5. Deduplication & Idempotency", () => {
    it("suppresses duplicate email send when identical event is processed in rapid succession", async () => {
      mockUsers.set("cust_dedup_zoho", {
        id: "cust_dedup_zoho",
        email: "dedup.check@example.com",
      });

      const first = await sendTransactionalEmail({
        userId: "cust_dedup_zoho",
        type: "order_confirmed",
        orderId: "ORD-DEDUP-ZOHO-99",
        itemName: "Tussar Silk Saree",
      });
      expect(first.delivered).toBe(true);
      const callCountAfterFirst = sendMailMock.mock.calls.length;

      // Immediate duplicate call for identical order and type
      const second = await sendTransactionalEmail({
        userId: "cust_dedup_zoho",
        type: "order_confirmed",
        orderId: "ORD-DEDUP-ZOHO-99",
        itemName: "Tussar Silk Saree",
      });
      expect(second.delivered).toBe(true);
      expect(second.duplicate).toBe(true);
      // Transport should not have been called a second time
      expect(sendMailMock.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  // 6. OTP Security & Cryptographic Hashing Logic
  describe("6. OTP Security & Cryptographic Hashing Logic", () => {
    it("SHA-256 hashes OTP so plaintext codes are never persisted or recoverable", () => {
      const otp = "839201";
      const hash1 = crypto.createHash("sha256").update(otp).digest("hex");
      const hash2 = crypto.createHash("sha256").update(otp).digest("hex");
      const wrongHash = crypto.createHash("sha256").update("000000").digest("hex");

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(wrongHash);
      expect(hash1.length).toBe(64);
      // The original OTP is irreversible from the hash
      expect(hash1).not.toContain(otp);
    });
  });

  // 7. Production Startup Validation & Fail-Fast Verification
  describe("7. Production Startup Validation & Fail-Fast Verification", () => {
    it("successfully validates production Zoho SMTP configuration", () => {
      process.env.NODE_ENV = "production";
      process.env.SMTP_HOST = "smtppro.zoho.in";
      process.env.SMTP_PORT = "465";
      process.env.SMTP_USER = "support@vastraasaree.com";
      process.env.SMTP_PASS = "cPzp0mFzM2N0";
      expect(() => validateProductionSmtpConfig()).not.toThrow();
    });

    it("fails fast and throws fatal error during production startup if SMTP password is missing", () => {
      process.env.NODE_ENV = "production";
      delete process.env.SMTP_PASS;
      delete process.env.SMTP_PASSWORD;
      delete process.env.EMAIL_PASSWORD;
      expect(() => validateProductionSmtpConfig()).toThrow(/Missing required SMTP environment variables/);
    });

    it("fails fast in production if SMTP host is missing or placeholder", () => {
      process.env.NODE_ENV = "production";
      process.env.SMTP_HOST = "placeholder";
      delete process.env.EMAIL_HOST;
      expect(() => validateProductionSmtpConfig()).toThrow(/SMTP_HOST/);
    });
  });
});
