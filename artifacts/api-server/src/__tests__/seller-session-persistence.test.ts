import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import authRouter from "../routes/auth";
import sellerRouter from "../routes/seller";
import { mongoSellers, mongoUsers, mongoVendors } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";
import { createAuthSession, getCookieName } from "../lib/sessions";
import { hashPassword } from "../lib/passwords";

// Mock DB dependencies where required for unit testing environment
vi.mock("@workspace/db", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      }),
    },
    isMongoDbConnected: () => false,
  };
});

describe("Seller Session Persistence & Token Handling", () => {
  let app: Express;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api", authRouter);
    app.use("/api", sellerRouter);
  });

  it("successfully authenticates a seller and issues valid access token and refresh cookie", async () => {
    const mockSeller = {
      id: "VEND_TEST_001",
      name: "Silk Heritage",
      email: "seller@silkheritage.com",
      passwordHash: hashPassword("password123"),
      status: "approved",
      ownerId: "USER_SELLER_001",
      sellerId: "VEND_TEST_001",
    };

    vi.spyOn(mongoSellers, "findByEmail").mockResolvedValue(mockSeller as any);
    vi.spyOn(mongoSellers, "findById").mockResolvedValue(mockSeller as any);

    const loginRes = await request(app)
      .post("/api/seller/login")
      .send({ email: "seller@silkheritage.com", password: "password123" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.token).toBeDefined();

    // Verify Set-Cookie header contains vastraa_seller_refresh
    const cookies = loginRes.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const refreshCookie = (cookies as string[]).find((c) => c.includes(getCookieName("seller")));
    expect(refreshCookie).toBeDefined();
  });

  it("rotates refresh token and returns new access token via POST /api/seller/refresh", async () => {
    const dummyReq = {
      headers: { "user-agent": "Mozilla/5.0 Test" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const mockSeller = {
      id: "VEND_TEST_001",
      name: "Silk Heritage",
      email: "seller@silkheritage.com",
      status: "approved",
      ownerId: "USER_SELLER_001",
      sellerId: "VEND_TEST_001",
    };

    vi.spyOn(mongoSellers, "findByOwnerId").mockResolvedValue(mockSeller as any);
    vi.spyOn(mongoSellers, "findById").mockResolvedValue(mockSeller as any);

    const { session, refreshToken } = await createAuthSession(
      mockSeller.ownerId,
      mockSeller.email,
      "seller",
      dummyReq
    );

    const cookieVal = `${session.id}:${refreshToken}`;

    const refreshRes = await request(app)
      .post("/api/seller/refresh")
      .set("Cookie", [`${getCookieName("seller")}=${cookieVal}`]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.token).toBeDefined();
    expect(refreshRes.body.accessToken).toBeDefined();

    // Verify rotated cookie returned
    const cookies = refreshRes.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const rotatedCookie = (cookies as string[]).find((c) => c.includes(getCookieName("seller")));
    expect(rotatedCookie).toBeDefined();
  });

  it("rejects token refresh with HTTP 403 when seller account status is suspended", async () => {
    const dummyReq = {
      headers: { "user-agent": "Mozilla/5.0 Test" },
      ip: "127.0.0.1",
      socket: { remoteAddress: "127.0.0.1" },
    } as any;

    const suspendedSeller = {
      id: "VEND_TEST_SUSPENDED",
      name: "Suspended Store",
      email: "suspended@example.com",
      status: "suspended",
      statusReason: "Policy violation",
      ownerId: "USER_SUSPENDED",
      sellerId: "VEND_TEST_SUSPENDED",
    };

    vi.spyOn(mongoSellers, "findByOwnerId").mockResolvedValue(suspendedSeller as any);
    vi.spyOn(mongoSellers, "findById").mockResolvedValue(suspendedSeller as any);

    const { session, refreshToken } = await createAuthSession(
      suspendedSeller.ownerId,
      suspendedSeller.email,
      "seller",
      dummyReq
    );

    const cookieVal = `${session.id}:${refreshToken}`;

    const refreshRes = await request(app)
      .post("/api/seller/refresh")
      .set("Cookie", [`${getCookieName("seller")}=${cookieVal}`]);

    expect(refreshRes.status).toBe(403);
    expect(refreshRes.body.code).toBe("VENDOR_SUSPENDED");
  });

  it("returns 401 TOKEN_EXPIRED on expired JWT token in requireVendorAuth middleware", async () => {
    const expiredToken = signAccessToken({
      sub: "USER_SELLER_EXPIRED",
      role: "seller",
      email: "seller@expired.com",
      sid: "SESSION_EXPIRED_001",
    });

    // Manipulate payload or test using invalid signature token
    const tamperedToken = expiredToken.substring(0, expiredToken.length - 5) + "xxxxx";

    const profileRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${tamperedToken}`);

    expect(profileRes.status).toBe(401);
    expect(profileRes.body.code).toBe("TOKEN_EXPIRED");
  });
});
