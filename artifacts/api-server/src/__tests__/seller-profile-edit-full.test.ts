import { describe, expect, it, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { mongoVendors, mongoSellers, db, vendorsTable } from "@workspace/db";
import { signAccessToken } from "../lib/jwt";
import sellerRouter from "../routes/seller";
import vendorsRouter from "../routes/vendors";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.log = { error: () => {}, info: () => {}, warn: () => {} };
    next();
  });
  app.use("/api", sellerRouter);
  app.use("/api", vendorsRouter);
  return app;
}

const sellerAId = "VEND_PROFILE_TEST_A";
const sellerAOwnerId = "USR_PROFILE_TEST_A";
const sellerAEmail = "seller_profile_a@vastraa.com";

const sellerBId = "VEND_PROFILE_TEST_B";
const sellerBOwnerId = "USR_PROFILE_TEST_B";
const sellerBEmail = "seller_profile_b@vastraa.com";

const tokenA = signAccessToken({
  sub: sellerAOwnerId,
  email: sellerAEmail,
  role: "seller",
  sid: "session_profile_a",
});

const tokenB = signAccessToken({
  sub: sellerBOwnerId,
  email: sellerBEmail,
  role: "seller",
  sid: "session_profile_b",
});

describe("Seller Profile Edit/Update & Persistence Matrix", () => {
  const app = createApp();

  beforeEach(async () => {
    const docA: any = {
      id: sellerAId,
      vendorId: sellerAId,
      sellerId: sellerAId,
      ownerId: sellerAOwnerId,
      name: "Old Paithani Shop",
      shopName: "Old Paithani Shop",
      location: "Nashik",
      email: sellerAEmail,
      contactEmail: sellerAEmail,
      mobile: "9876543210",
      status: "approved",
      gstin: "27AAAAA0000A1Z5",
      bio: "Handwoven Paithani sarees",
      tagline: "Authentic Heritage",
      shopStreet: "Main Street 1",
      shopCity: "Nashik",
      shopState: "Maharashtra",
      shopPincode: "422001",
      shopCountry: "India",
      pickupSameAsShop: false,
      pickupLocationName: "Old Warehouse",
      pickupAddressLine1: "Pickup Street 1",
      pickupCity: "Nashik",
      pickupState: "Maharashtra",
      pickupPincode: "422001",
      pickupCountry: "India",
    };

    const docB: any = {
      id: sellerBId,
      vendorId: sellerBId,
      sellerId: sellerBId,
      ownerId: sellerBOwnerId,
      name: "Kanjivaram House",
      shopName: "Kanjivaram House",
      location: "Kanchipuram",
      email: sellerBEmail,
      contactEmail: sellerBEmail,
      mobile: "9123456789",
      status: "approved",
    };

    try {
      await mongoVendors.insert(docA).catch(() => mongoVendors.update(sellerAId, docA));
      await mongoSellers.insert(docA).catch(() => mongoSellers.update(sellerAId, docA));
      await mongoVendors.insert(docB).catch(() => mongoVendors.update(sellerBId, docB));
      await mongoSellers.insert(docB).catch(() => mongoSellers.update(sellerBId, docB));
    } catch {}

    try {
      await db.insert(vendorsTable).values(docA as any).onConflictDoNothing().catch(() => {});
      await db.insert(vendorsTable).values(docB as any).onConflictDoNothing().catch(() => {});
    } catch {}
  });

  it("1. Seller A updates profile details (Name, Tagline, Bio, Location) successfully", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "SS Paithani",
        tagline: "Luxury Handloom Sarees",
        bio: "Pure silk Paithani crafted by master weavers",
        location: "Yeola, Nashik",
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("SS Paithani");
    expect(res.body.shopName).toBe("SS Paithani");
    expect(res.body.tagline).toBe("Luxury Handloom Sarees");
    expect(res.body.bio).toBe("Pure silk Paithani crafted by master weavers");
    expect(res.body.location).toBe("Yeola, Nashik");
  });

  it("2. Mobile number validation — must be 10 digits starting with 6, 7, 8, or 9", async () => {
    const invalidRes = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ mobile: "1234567890" });

    expect(invalidRes.status).toBe(400);
    expect(invalidRes.body.error).toContain("10-digit Indian number");

    const validRes = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ mobile: "9876543210" });

    expect(validRes.status).toBe(200);
    expect(validRes.body.mobile).toBe("9876543210");
  });

  it("3. Synchronizes Shop Name with Business Name", async () => {
    const res = await request(app)
      .patch("/api/seller/profile")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "SS Paithani & Silks",
      });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("SS Paithani & Silks");
    expect(res.body.shopName).toBe("SS Paithani & Silks");
  });

  it("4. Handles 'Pickup Same as Shop Address' by copying and persisting complete shop address separately", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        shopStreet: "Plot 42, Textile Park",
        shopAddressLine2: "Phase 2",
        shopLandmark: "Near Silk Board",
        shopCity: "Yeola",
        shopState: "Maharashtra",
        shopPincode: "423102",
        shopCountry: "India",
        pickupSameAsShop: true,
        pickupLocationName: "Yeola Central Store",
      });

    expect(res.status).toBe(200);
    expect(res.body.pickupSameAsShop).toBe(true);
    expect(res.body.pickupAddressLine1).toBe("Plot 42, Textile Park");
    expect(res.body.pickupAddressLine2).toBe("Phase 2");
    expect(res.body.pickupLandmark).toBe("Near Silk Board");
    expect(res.body.pickupCity).toBe("Yeola");
    expect(res.body.pickupState).toBe("Maharashtra");
    expect(res.body.pickupPincode).toBe("423102");
    expect(res.body.pickupCountry).toBe("India");
    expect(res.body.pickupLocationName).toBe("Yeola Central Store");
  });

  it("5. Persists update permanently and returns updated values on GET /api/seller/profile", async () => {
    await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({
        name: "SS Paithani Store",
        mobile: "8888877777",
        gstin: "27BBB0000B1Z9",
      });

    const getRes = await request(app)
      .get("/api/seller/profile")
      .set("Authorization", `Bearer ${tokenA}`);

    expect(getRes.status).toBe(200);
    expect(getRes.body.name).toBe("SS Paithani Store");
    expect(getRes.body.mobile).toBe("8888877777");
    expect(getRes.body.gstin).toBe("27BBB0000B1Z9");
  });

  it("6. Rejects duplicate email registration when updating email to another seller's email", async () => {
    const duplicateRes = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ contactEmail: sellerBEmail });

    expect(duplicateRes.status).toBe(400);
    expect(duplicateRes.body.error).toContain("already in use");
  });

  it("7. Updates email for seller when new email is valid and unowned", async () => {
    const newEmail = "new_seller_a_email@vastraa.com";
    const res = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ contactEmail: newEmail });

    expect(res.status).toBe(200);
    expect(res.body.contactEmail).toBe(newEmail);
    expect(res.body.id).toBe(sellerAId);
  });

  it("8. Seller Data Isolation — Seller A cannot update Seller B's profile", async () => {
    const res = await request(app)
      .patch(`/api/vendors/${sellerBId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ name: "Hacked Store Name" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Forbidden");
  });

  it("9. Eliminates 'Vendor not found' for valid authenticated seller profile requests", async () => {
    const res1 = await request(app)
      .patch("/api/seller/profile")
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ location: "Nashik City" });

    expect(res1.status).toBe(200);
    expect(res1.body.location).toBe("Nashik City");

    const res2 = await request(app)
      .patch(`/api/vendors/${sellerAId}`)
      .set("Authorization", `Bearer ${tokenA}`)
      .send({ location: "Nashik City II" });

    expect(res2.status).toBe(200);
    expect(res2.body.location).toBe("Nashik City II");
  });
});
