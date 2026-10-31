import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import app from "../app";
import { inMemoryAdvertisements } from "../routes/advertisements";

describe("Advertisements API Endpoints", () => {
  const adminKey = process.env.ADMIN_API_KEY || "Admin@123";

  beforeEach(async () => {
    inMemoryAdvertisements.clear();
    try {
      const { mongoGeneric, isMongoDbConnected } = await import("@workspace/db");
      if (isMongoDbConnected()) {
        const col = mongoGeneric.getCollection("advertisements");
        await col.deleteMany({});
      }
    } catch {}
  });

  describe("Public GET /api/advertisements", () => {
    it("returns an empty array when no advertisements exist", async () => {
      const res = await request(app).get("/api/advertisements");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });

    it("returns only active advertisements within scheduled date range", async () => {
      const now = new Date();
      const past = new Date(now.getTime() - 86400000 * 2);
      const future = new Date(now.getTime() + 86400000 * 2);
      const wayPast = new Date(now.getTime() - 86400000 * 10);
      const wayFuture = new Date(now.getTime() + 86400000 * 10);

      // 1. Active ad with no date restriction
      inMemoryAdvertisements.set("ad-1", {
        id: "ad-1",
        title: "Active No Dates",
        imageUrl: "/api/storage/public-objects/advertisements/ad1.jpg",
        displayOrder: 2,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 2. Inactive ad
      inMemoryAdvertisements.set("ad-2", {
        id: "ad-2",
        title: "Inactive Ad",
        imageUrl: "/api/storage/public-objects/advertisements/ad2.jpg",
        displayOrder: 1,
        isActive: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 3. Active valid within start and end date
      inMemoryAdvertisements.set("ad-3", {
        id: "ad-3",
        title: "Active Scheduled Range",
        imageUrl: "/api/storage/public-objects/advertisements/ad3.jpg",
        displayOrder: 1,
        isActive: true,
        startDate: past,
        endDate: future,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 4. Future scheduled (not yet started)
      inMemoryAdvertisements.set("ad-4", {
        id: "ad-4",
        title: "Future Scheduled",
        imageUrl: "/api/storage/public-objects/advertisements/ad4.jpg",
        displayOrder: 3,
        isActive: true,
        startDate: future,
        endDate: wayFuture,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 5. Expired ad
      inMemoryAdvertisements.set("ad-5", {
        id: "ad-5",
        title: "Expired Ad",
        imageUrl: "/api/storage/public-objects/advertisements/ad5.jpg",
        displayOrder: 4,
        isActive: true,
        startDate: wayPast,
        endDate: past,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app).get("/api/advertisements");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);

      // Verify sorted by displayOrder (ad-3 order 1, ad-1 order 2)
      expect(res.body[0].id).toBe("ad-3");
      expect(res.body[1].id).toBe("ad-1");

      // Verify inactive, scheduled, and expired are excluded
      const ids = res.body.map((b: any) => b.id);
      expect(ids).not.toContain("ad-2");
      expect(ids).not.toContain("ad-4");
      expect(ids).not.toContain("ad-5");
    });
  });

  describe("Admin Advertisement Management Endpoints", () => {
    it("rejects unauthorized access when x-admin-key is missing", async () => {
      const res = await request(app).get("/api/admin/advertisements");
      expect(res.status).toBe(403);
    });

    it("creates a new advertisement with valid fields", async () => {
      const payload = {
        title: "Grand Festive Saree Sale",
        description: "Up to 40% off on authentic Paithani sarees",
        imageUrl: "https://r2.vastraa.com/advertisements/festive.jpg",
        linkUrl: "/category/paithani",
        displayOrder: 1,
        isActive: true,
      };

      const res = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send(payload);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty("id");
      expect(res.body.title).toBe(payload.title);
      expect(res.body.description).toBe(payload.description);
      expect(res.body.imageUrl).toBe(payload.imageUrl);
      expect(res.body.linkUrl).toBe(payload.linkUrl);
      expect(res.body.status).toBe("active");
    });

    it("supports creating advertisement with title optional (Scenario 1 & 2)", async () => {
      // Scenario 1: Uploaded image with no title or external URL
      const res1 = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          uploadedImageUrl: "/api/storage/public-objects/advertisements/untitled-upload.jpg",
          displayOrder: 1,
        });

      expect(res1.status).toBe(201);
      expect(res1.body.title).toBe("");
      expect(res1.body.imageUrl).toBe("/api/storage/public-objects/advertisements/untitled-upload.jpg");
      expect(res1.body.imageSource).toBe("upload");

      // Scenario 2: Image URL with no title or uploaded file
      const res2 = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          externalImageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
          displayOrder: 2,
        });

      expect(res2.status).toBe(201);
      expect(res2.body.title).toBe("");
      expect(res2.body.imageUrl).toBe("https://images.unsplash.com/photo-1610030469983-98e550d6193c");
      expect(res2.body.imageSource).toBe("url");
    });

    it("supports creating advertisement with both image and title provided (Scenario 3 & 4)", async () => {
      // Scenario 3: Uploaded image + title
      const res3 = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "Royal Silk Paithani",
          uploadedImageUrl: "/api/storage/public-objects/advertisements/royal-silk.jpg",
          displayOrder: 1,
        });

      expect(res3.status).toBe(201);
      expect(res3.body.title).toBe("Royal Silk Paithani");
      expect(res3.body.imageSource).toBe("upload");

      // Scenario 4: Image URL + title
      const res4 = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "Designer Saree Festival",
          externalImageUrl: "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b",
          displayOrder: 2,
        });

      expect(res4.status).toBe(201);
      expect(res4.body.title).toBe("Designer Saree Festival");
      expect(res4.body.imageSource).toBe("url");
    });

    it("enforces mutual exclusivity and required image source (Scenario 5 & 6)", async () => {
      // Scenario 5: Both image sources empty
      const resEmpty = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "Ad with No Image",
        });

      expect(resEmpty.status).toBe(400);
      expect(resEmpty.body.error).toBe("Please upload an image or enter an image URL.");

      // Scenario 6: Both image sources provided
      const resBoth = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "Conflicting Ad",
          uploadedImageUrl: "/api/storage/public-objects/advertisements/ad.jpg",
          externalImageUrl: "https://images.unsplash.com/photo-1610030469983-98e550d6193c",
        });

      expect(resBoth.status).toBe(400);
      expect(resBoth.body.error).toBe("Please provide either an uploaded image or an image URL, but not both.");
    });

    it("lists all advertisements with computed status for admin", async () => {
      const now = new Date();
      inMemoryAdvertisements.set("ad-test-1", {
        id: "ad-test-1",
        title: "Active Ad",
        imageUrl: "/test.jpg",
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      inMemoryAdvertisements.set("ad-test-2", {
        id: "ad-test-2",
        title: "Expired Ad",
        imageUrl: "/test2.jpg",
        displayOrder: 2,
        isActive: true,
        endDate: new Date(now.getTime() - 100000),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/admin/advertisements")
        .set("x-admin-key", adminKey);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);

      const ad1 = res.body.find((a: any) => a.id === "ad-test-1");
      const ad2 = res.body.find((a: any) => a.id === "ad-test-2");

      expect(ad1.status).toBe("active");
      expect(ad2.status).toBe("expired");
    });

    it("updates an existing advertisement via PUT", async () => {
      inMemoryAdvertisements.set("ad-update", {
        id: "ad-update",
        title: "Initial Title",
        imageUrl: "/initial.jpg",
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .put("/api/admin/advertisements/ad-update")
        .set("x-admin-key", adminKey)
        .send({
          title: "Updated Title",
          displayOrder: 5,
        });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe("Updated Title");
      expect(res.body.displayOrder).toBe(5);
    });

    it("toggles advertisement active state via PATCH", async () => {
      inMemoryAdvertisements.set("ad-toggle", {
        id: "ad-toggle",
        title: "Toggle Test",
        imageUrl: "/toggle.jpg",
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .patch("/api/admin/advertisements/ad-toggle/toggle-status")
        .set("x-admin-key", adminKey)
        .send({ isActive: false });

      expect(res.status).toBe(200);
      expect(res.body.isActive).toBe(false);
      expect(res.body.status).toBe("inactive");
    });

    it("deletes an advertisement via DELETE", async () => {
      inMemoryAdvertisements.set("ad-delete", {
        id: "ad-delete",
        title: "Delete Me",
        imageUrl: "/del.jpg",
        displayOrder: 1,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .delete("/api/admin/advertisements/ad-delete")
        .set("x-admin-key", adminKey);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(inMemoryAdvertisements.has("ad-delete")).toBe(false);
    });

    it("rejects advertisement image upload without admin key", async () => {
      const dummyBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const res = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("Content-Type", "image/jpeg")
        .send(dummyBuffer);

      expect(res.status).toBe(403);
    });

    it("rejects advertisement image upload with empty body", async () => {
      const res = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .set("Content-Type", "image/jpeg")
        .send(Buffer.alloc(0));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("No image data received");
    });

    it("successfully uploads an advertisement image and serves it via public-objects", async () => {
      // 1x1 transparent PNG buffer
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const uploadRes = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .set("Content-Type", "image/png")
        .set("x-file-name", "banner-promo.png")
        .send(pngBuffer);

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body).toHaveProperty("publicUrl");
      expect(uploadRes.body.message).toBe("Image uploaded successfully");
      expect(uploadRes.body.publicUrl).toContain("/api/storage/public-objects/advertisements/");
      expect(uploadRes.body.publicUrl).toMatch(/\.png$/);
      expect(uploadRes.body.objectKey).toContain("advertisements/");

      // Verify the image is immediately accessible via the public storage route
      const serveRes = await request(app).get(uploadRes.body.publicUrl);
      expect(serveRes.status).toBe(200);
      expect(serveRes.headers["content-type"]).toContain("image/png");
      expect(serveRes.body.length).toBe(pngBuffer.length);

      // Verify end-to-end: create an advertisement using this uploaded image and fetch via public API
      const createRes = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "New Artisan Launch",
          description: "Exclusive Paithani silk showcase",
          imageUrl: uploadRes.body.publicUrl,
          objectKey: uploadRes.body.objectKey,
          linkUrl: "/paithani",
          displayOrder: 1,
          isActive: true,
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.imageUrl).toBe(uploadRes.body.publicUrl);
      expect(createRes.body.objectKey).toBe(uploadRes.body.objectKey);

      // Verify public storefront fetches the advertisement with the correct image URL
      const publicStoreRes = await request(app).get("/api/advertisements");
      expect(publicStoreRes.status).toBe(200);
      const matched = publicStoreRes.body.find((ad: any) => ad.id === createRes.body.id);
      expect(matched).toBeDefined();
      expect(matched.imageUrl).toBe(uploadRes.body.publicUrl);
      expect(matched.title).toBe("New Artisan Launch");
    });

    it("successfully uploads via multipart/form-data and returns Image uploaded successfully", async () => {
      const pngBuffer = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );

      const uploadRes = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .attach("image", pngBuffer, "festive-banner.png");

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.success).toBe(true);
      expect(uploadRes.body.message).toBe("Image uploaded successfully");
      expect(uploadRes.body.publicUrl).toContain("/api/storage/public-objects/advertisements/");
      expect(uploadRes.body.objectKey).toContain("advertisements/");

      // Verify served
      const serveRes = await request(app).get(uploadRes.body.publicUrl);
      expect(serveRes.status).toBe(200);
      expect(serveRes.body.length).toBe(pngBuffer.length);
    });

    it("rejects non-image files with meaningful error message", async () => {
      const textBuffer = Buffer.from("Hello world, this is a plain text file, not an image!");

      const res = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .set("Content-Type", "text/plain")
        .set("x-file-name", "document.txt")
        .send(textBuffer);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed");
    });

    it("rejects advertisement files exceeding the 25MB limit", async () => {
      // Create an oversized dummy buffer (>25MB)
      const oversizeBuffer = Buffer.alloc(25 * 1024 * 1024 + 1024, 0xff);

      const res = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .set("Content-Type", "image/jpeg")
        .send(oversizeBuffer);

      expect(res.status).toBe(413);
      expect(res.body.error).toContain("Image size exceeds 25MB limit");
    });

    it("maintains strict image isolation between different advertisements without mix-ups", async () => {
      // 1. Upload Ad 1 image (PNG 1x1)
      const pngBuffer1 = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64"
      );
      const res1 = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .attach("image", pngBuffer1, "ad-one.png");
      expect(res1.status).toBe(200);

      // 2. Upload Ad 2 image (JPEG minimal buffer)
      const jpegBuffer2 = Buffer.from([
        0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
        0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
        0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
        0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
        0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
        0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
        0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
        0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
        0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x09, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00,
        0x3f, 0x00, 0xbf, 0x00, 0xff, 0xd9,
      ]);
      const res2 = await request(app)
        .post("/api/admin/upload/advertisement-image")
        .set("x-admin-key", adminKey)
        .attach("image", jpegBuffer2, "ad-two.jpg");
      expect(res2.status).toBe(200);

      expect(res1.body.publicUrl).not.toBe(res2.body.publicUrl);
      expect(res1.body.objectKey).not.toBe(res2.body.objectKey);

      // Create two ads
      const ad1 = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "Ad One Paithani",
          imageUrl: res1.body.publicUrl,
          displayOrder: 1,
          isActive: true,
        });
      expect(ad1.status).toBe(201);

      const ad2 = await request(app)
        .post("/api/admin/advertisements")
        .set("x-admin-key", adminKey)
        .send({
          title: "Ad Two Designer",
          imageUrl: res2.body.publicUrl,
          displayOrder: 2,
          isActive: true,
        });
      expect(ad2.status).toBe(201);

      // Fetch public ads and assert isolated image mapping
      const storeRes = await request(app).get("/api/advertisements");
      expect(storeRes.status).toBe(200);
      expect(storeRes.body.length).toBe(2);

      const fetchedAd1 = storeRes.body.find((a: any) => a.id === ad1.body.id);
      const fetchedAd2 = storeRes.body.find((a: any) => a.id === ad2.body.id);

      expect(fetchedAd1.imageUrl).toBe(res1.body.publicUrl);
      expect(fetchedAd2.imageUrl).toBe(res2.body.publicUrl);

      // Test deactivation: deactivate ad1 -> only ad2 remains visible
      await request(app)
        .patch(`/api/admin/advertisements/${ad1.body.id}/toggle-status`)
        .set("x-admin-key", adminKey)
        .send({ isActive: false });

      const storeAfterToggle = await request(app).get("/api/advertisements");
      expect(storeAfterToggle.body.length).toBe(1);
      expect(storeAfterToggle.body[0].id).toBe(ad2.body.id);

      // Test deletion: delete ad2 -> zero active ads remain
      await request(app)
        .delete(`/api/admin/advertisements/${ad2.body.id}`)
        .set("x-admin-key", adminKey);

      const storeAfterDelete = await request(app).get("/api/advertisements");
      expect(storeAfterDelete.body.length).toBe(0);
    });
  });
});

