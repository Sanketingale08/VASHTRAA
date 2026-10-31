import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { Express } from "express";
import cookieParser from "cookie-parser";
import authRouter from "../routes/auth";
import sellerRouter from "../routes/seller";
import vendorRouter from "../routes/vendors";
import { mongoSellers } from "@workspace/db";
import { getCookieName } from "../lib/sessions";

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
      insert: () => ({
        values: (vals: any) => ({
          returning: () => Promise.resolve([{ id: "VEND_SHOP_001", ...vals }]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => ({
            returning: () => Promise.resolve([{ id: "VEND_SHOP_001", name: "Paithani Royal Weaves" }]),
          }),
        }),
      }),
    },
    isMongoDbConnected: () => false,
  };
});

describe("Seller Shop Name Registration & Persistence", () => {
  let app: Express;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use("/api", authRouter);
    app.use("/api", sellerRouter);
    app.use("/api", vendorRouter);
  });

  it("stores exact Shop Name during registration and returns it on login & profile fetch", async () => {
    const OFFICIAL_SHOP_NAME = "Paithani Royal Weaves";
    const REGISTER_EMAIL = "seller@paithani.com";

    let insertedSellerRecord: any = null;

    vi.spyOn(mongoSellers, "insert").mockImplementation((doc: any) => {
      insertedSellerRecord = { ...doc };
      return Promise.resolve(insertedSellerRecord);
    });

    vi.spyOn(mongoSellers, "findByEmail").mockImplementation(() => {
      return Promise.resolve(insertedSellerRecord);
    });

    vi.spyOn(mongoSellers, "findById").mockImplementation(() => {
      return Promise.resolve(insertedSellerRecord);
    });

    vi.spyOn(mongoSellers, "findByOwnerId").mockImplementation(() => {
      return Promise.resolve(insertedSellerRecord);
    });

    // 1. Register new seller with official Shop Name
    const regRes = await request(app)
      .post("/api/seller/register")
      .send({
        email: REGISTER_EMAIL,
        password: "PaithaniPassword@123",
        name: OFFICIAL_SHOP_NAME,
        shopName: OFFICIAL_SHOP_NAME,
        location: "Yeola, Maharashtra",
        mobile: "9876543210",
        panNumber: "ABCDE1234F",
        panCardUrl: "https://storage.vashtraa.com/pan.pdf",
        bankHolder: OFFICIAL_SHOP_NAME,
        bankName: "HDFC Bank",
        bankAccount: "501001234567",
        bankIfsc: "HDFC0001234",
        shopCity: "Yeola",
        shopState: "Maharashtra",
        shopPincode: "423401",
        termsAccepted: true,
        status: "approved",
      });

    expect(regRes.status).toBe(201);
    expect(regRes.body.name).toBe(OFFICIAL_SHOP_NAME);
    expect(insertedSellerRecord).toBeDefined();
    expect(insertedSellerRecord.name).toBe(OFFICIAL_SHOP_NAME);
    expect(insertedSellerRecord.shopName).toBe(OFFICIAL_SHOP_NAME);

    // 2. Seller Login
    const loginRes = await request(app)
      .post("/api/seller/login")
      .send({
        email: REGISTER_EMAIL,
        password: "PaithaniPassword@123",
      });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.success).toBe(true);
    expect(loginRes.body.user.name).toBe(OFFICIAL_SHOP_NAME);
    expect(loginRes.body.vendor.name).toBe(OFFICIAL_SHOP_NAME);
    expect(loginRes.body.vendor.shopName).toBe(OFFICIAL_SHOP_NAME);

    // 3. Fetch Seller Profile with token
    const token = loginRes.body.token;
    const profileRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(profileRes.status).toBe(200);
    expect(profileRes.body.name).toBe(OFFICIAL_SHOP_NAME);
    expect(profileRes.body.shopName).toBe(OFFICIAL_SHOP_NAME);
  }, 15000);
});
