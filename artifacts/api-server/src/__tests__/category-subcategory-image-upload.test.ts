import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import adminCategoriesRouter from "../routes/adminCategories";
import {
  mongoProductCategories,
  mongoR2Assets,
  mongoSiteSettings,
  connectToMongoDB,
} from "@workspace/db";
import { uploadPublicCategoryImage } from "../lib/objectStorage";
import { getSubcategoriesForCategory } from "../../../vastraa/src/constants/categories";

const TEST_ADMIN_KEY = "test-category-upload-admin-key";

function createTestApp() {
  const app = express();
  app.use(cookieParser());
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/admin/upload/")) {
      return next();
    }
    return express.json({ limit: "15mb" })(req, res, next);
  });
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/admin/upload/")) {
      return next();
    }
    return express.urlencoded({ extended: true })(req, res, next);
  });

  // Mount router at /api
  app.use("/api", adminCategoriesRouter);

  return app;
}

describe("Admin Category & Subcategory Image Upload & User-side Sync", () => {
  beforeAll(async () => {
    process.env.NODE_ENV = "test";
    process.env.ADMIN_API_KEY = TEST_ADMIN_KEY;
    await connectToMongoDB();
    try {
      await mongoSiteSettings.set("admin_2fa_enabled", "false");
    } catch {}
  });

  it("uploadPublicCategoryImage uploads binary to R2 and records asset metadata without base64 in DB", async () => {
    // 1x1 transparent PNG buffer
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const result = await uploadPublicCategoryImage(
      samplePng,
      "png",
      "image/png",
      "paithani"
    );

    expect(result).toBeDefined();
    expect(result.publicRelPath).toContain("categories/");
    expect(result.objectKey).toContain("categories/");
    expect(result.objectKey.startsWith("data:")).toBe(false); // Never a base64 string
    expect(result.size).toBe(samplePng.length);

    // Verify it was logged in mongoR2Assets
    const assetRecord = await mongoR2Assets.findByKey(result.objectKey);
    expect(assetRecord).toBeDefined();
    expect(assetRecord?.assetType).toBe("category_image");
    expect(assetRecord?.status).toBe("uploaded");
  });

  it("POST /api/admin/upload/category-image accepts binary buffer and returns clean URL", async () => {
    const app = createTestApp();
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const res = await request(app)
      .post("/api/admin/upload/category-image?category=paithani")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .set("Content-Type", "image/png")
      .send(samplePng);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toBeDefined();
    expect(res.body.url.startsWith("data:")).toBe(false); // Must not be base64
    expect(res.body.objectKey).toBeDefined();
    expect(res.body.size).toBe(samplePng.length);
  });

  it("POST /api/admin/upload/category-image auto-detects image format via magic bytes even if Content-Type is generic or omitted", async () => {
    const app = createTestApp();
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const res = await request(app)
      .post("/api/admin/upload/category-image?category=banarasi-silk")
      .set("x-admin-key", TEST_ADMIN_KEY)
      .set("Content-Type", "application/octet-stream")
      .send(samplePng);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.url).toContain("categories/");
    expect(res.body.url).toContain(".png");
  });

  it("POST /api/admin/upload/category-image authenticates via admin cookie fallback", async () => {
    const app = createTestApp();
    const samplePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const res = await request(app)
      .post("/api/admin/upload/category-image?category=chanderi")
      .set("Cookie", `admin_key=${TEST_ADMIN_KEY}`)
      .set("Content-Type", "image/png")
      .send(samplePng);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("POST /api/admin/categories/:id/cover-image automatically detects base64 and converts to R2 URL", async () => {
    const app = createTestApp();

    // Ensure category exists
    await mongoProductCategories.create({
      name: "Paithani Sarees",
      slug: "paithani",
      type: "main",
    });

    const base64DataUri =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const res = await request(app)
      .post(`/api/admin/categories/paithani/cover-image`)
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ coverImage: base64DataUri });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.coverImage).toBeDefined();
    expect(res.body.coverImage.startsWith("data:")).toBe(false); // Converted to storage URL!
    expect(res.body.coverImage).toContain("categories/");

    // Verify DB does NOT have base64
    const updatedCat = await mongoProductCategories.findById("paithani");
    expect(updatedCat?.coverImage).toBeDefined();
    expect(updatedCat?.coverImage?.startsWith("data:")).toBe(false);
  });

  it("assigns cover image to subcategory and synchronizes embedded subcategory in parent doc", async () => {
    const app = createTestApp();
    const timestamp = Date.now();
    const subId = `sub-kanchipuram-${timestamp}`;
    const parentName = `Silk Sarees ${timestamp}`;

    // Create parent category with an embedded subcategory
    const parent = await mongoProductCategories.create({
      name: parentName,
      type: "main",
      subcategories: [
        {
          id: subId,
          name: "Pure Kanchipuram",
          slug: `kanchipuram-${timestamp}`,
          active: true,
          subtypes: ["Temple Border"],
        },
      ],
    });

    // Upload an image URL for the subcategory
    const imageUrl = "/uploads/categories/kanchipuram-pure-cover.webp";
    const res = await request(app)
      .post(`/api/admin/categories/${subId}/cover-image`)
      .set("x-admin-key", TEST_ADMIN_KEY)
      .send({ coverImage: imageUrl });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.coverImage).toBe(imageUrl);

    // Verify standalone subcategory document has coverImage
    const subDoc = await mongoProductCategories.findById(subId);
    expect(subDoc).toBeDefined();
    expect(subDoc?.coverImage).toBe(imageUrl);

    // Verify parent category's embedded subcategory array is also updated!
    const parentDoc = await mongoProductCategories.findById(parent.id);
    const embeddedSub = parentDoc?.subcategories?.find(
      (s: any) => s.id === subId
    );
    expect(embeddedSub).toBeDefined();
    expect(embeddedSub?.coverImage).toBe(imageUrl);
  });

  it("DELETE /api/admin/categories/:id/cover-image removes the image reference", async () => {
    const app = createTestApp();

    // Set initial image
    await mongoProductCategories.update("paithani", {
      coverImage: "/uploads/categories/paithani-cover.png",
    });

    const res = await request(app)
      .delete(`/api/admin/categories/paithani/cover-image`)
      .set("x-admin-key", TEST_ADMIN_KEY);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.coverImage).toBeNull();

    const cat = await mongoProductCategories.findById("paithani");
    expect(cat?.coverImage).toBeNull();
  });

  it("frontend getSubcategoriesForCategory correctly maps coverImage from DB response", () => {
    const mockDbCategories = [
      {
        id: "cat-paithani-default",
        slug: "paithani",
        name: "Paithani Sarees",
        subcategories: [
          {
            id: "sub-paithani-bridal",
            name: "Bridal",
            slug: "bridal",
            coverImage: "/uploads/categories/bridal-circle.webp",
            subtypes: ["Semi Paithani", "Pure Silk"],
          },
        ],
      },
    ];

    const subs = getSubcategoriesForCategory("paithani", mockDbCategories);
    const bridalSub = subs.find((s) => s.slug === "bridal" || s.name === "Bridal");

    expect(bridalSub).toBeDefined();
    expect(bridalSub?.coverImage).toBe("/uploads/categories/bridal-circle.webp");
  });
});
