import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import adminCategoriesRouter from "../routes/adminCategories";
import { signAccessToken } from "../lib/jwt";
import {
  findCategoryDefinition,
  findSubcategoryDefinition,
  validateCategoryAndSubcategory,
  resolveCategoryData,
  registerDynamicSubcategory,
  getDynamicSubcategories,
  mongoProductCategories,
  mongoProducts,
  mongoSellers,
} from "@workspace/db";
import {
  isMainCatalogCategory,
  getSubcategoriesForCategory,
  registerClientDynamicSubcategory,
  getClientDynamicSubcategories,
} from "../../../vastraa/src/constants/categories";

describe("Dynamic Subcategory Functionality for Sellers", () => {
  it("allows registering and retrieving dynamic subcategories under an existing main category", () => {
    const parentSlug = "paithani";
    const testSub = {
      id: "sub-paithani-festive-shimmer",
      name: "Festive Shimmer",
      slug: "festive-shimmer",
      route: "/paithani?subcategory=festive-shimmer",
      subtypes: ["Golden Shimmer", "Silver Shimmer"],
    };

    registerDynamicSubcategory(parentSlug, testSub);

    const subs = getDynamicSubcategories(parentSlug);
    expect(subs.some((s) => s.name === "Festive Shimmer")).toBe(true);

    const found = findSubcategoryDefinition(parentSlug, "Festive Shimmer");
    expect(found).toBeDefined();
    expect(found?.name).toBe("Festive Shimmer");
    expect(found?.slug).toBe("festive-shimmer");
  });

  it("validates product with dynamic subcategory successfully", () => {
    const parentSlug = "paithani";
    const validation = validateCategoryAndSubcategory(parentSlug, "Festive Shimmer");
    expect(validation.valid).toBe(true);
    expect(validation.categoryDef?.slug).toBe("paithani");
    expect(validation.subcategoryDef?.name).toBe("Festive Shimmer");

    const resolved = resolveCategoryData(parentSlug, "Festive Shimmer");
    expect(resolved.category).toBe("paithani");
    expect(resolved.categoryName).toBe("Paithani Sarees");
    expect(resolved.subcategory).toBe("Festive Shimmer");
    expect(resolved.subcategoryName).toBe("Festive Shimmer");
    expect(resolved.subcategoryId).toBe("sub-paithani-festive-shimmer");
  });

  it("registers and merges client dynamic subcategories in frontend utilities", () => {
    const parentSlug = "designer";
    const testSub = {
      id: "sub-designer-glam-velvet",
      name: "Glam Velvet",
      slug: "glam-velvet",
      route: "/designer?subcategory=glam-velvet",
      subtypes: ["Deep Maroon Velvet", "Midnight Blue Velvet"],
    };

    registerClientDynamicSubcategory(parentSlug, testSub);

    const clientSubs = getClientDynamicSubcategories(parentSlug);
    expect(clientSubs.some((s) => s.name === "Glam Velvet")).toBe(true);

    const allSubs = getSubcategoriesForCategory(parentSlug);
    expect(allSubs.some((s) => s.name === "Glam Velvet")).toBe(true);
  });

  it("merges database-loaded active categories into getSubcategoriesForCategory", () => {
    const mockDbCategories = [
      {
        id: "cat-paithani-default",
        slug: "paithani",
        name: "Paithani Sarees",
        subcategories: [
          {
            id: "sub-custom-handwoven-zari",
            name: "Custom Handwoven Zari",
            slug: "custom-handwoven-zari",
            route: "/paithani?subcategory=custom-handwoven-zari",
            subtypes: [],
          },
        ],
      },
    ];

    const subs = getSubcategoriesForCategory("paithani", mockDbCategories);
    expect(subs.some((s) => s.name === "Custom Handwoven Zari")).toBe(true);
    // Preserves static subcategories
    expect(subs.some((s) => s.name === "Bridal")).toBe(true);
    expect(subs.some((s) => s.name === "Weddings")).toBe(true);
    expect(subs.some((s) => s.name === "Western")).toBe(true);
  });

  it("guarantees newly created subcategories are excluded from top-level main category navigation", () => {
    const subcategoryDoc = {
      id: "sub-custom-123",
      name: "Custom Handwoven Zari",
      slug: "custom-handwoven-zari",
      parentId: "paithani",
      type: "subcategory",
      active: true,
    };

    // isMainCatalogCategory must return false for subcategories with parentId or type === 'subcategory'
    expect(isMainCatalogCategory(subcategoryDoc)).toBe(false);

    // Regular main category returns true
    const mainCategoryDoc = {
      id: "cat-paithani-default",
      name: "Paithani Sarees",
      slug: "paithani",
      active: true,
    };
    expect(isMainCatalogCategory(mainCategoryDoc)).toBe(true);
  });

  it("deduplicates newly created subcategories under the same parent in mongoProductCategories", async () => {
    const sub1 = await mongoProductCategories.create({
      name: "Royal Heritage Weave",
      parentId: "paithani",
      type: "subcategory",
      sellerId: "test-seller-1",
    });

    expect(sub1).toBeDefined();
    expect(sub1.name).toBe("Royal Heritage Weave");
    expect(sub1.type).toBe("subcategory");
    expect(sub1.parentId).toBe("paithani");

    // Creating identical subcategory under same parent returns the existing document without creating duplicate
    const sub2 = await mongoProductCategories.create({
      name: "Royal Heritage Weave",
      parentId: "paithani",
      type: "subcategory",
      sellerId: "test-seller-1",
    });

    expect(sub2.id).toBe(sub1.id);
  });

  describe("Backend API Authorization & Workflow for Seller Subcategory Creation", () => {
    let app: express.Express;
    const sellerId = "seller-user-001";
    const sellerEmail = "artisan@vastraa.com";
    const sellerToken = signAccessToken({
      sub: sellerId,
      role: "seller",
      email: sellerEmail,
    });

    beforeEach(async () => {
      await mongoSellers.insert({
        id: sellerId,
        vendorId: sellerId,
        sellerId: sellerId,
        ownerId: sellerId,
        name: "Heritage Paithani Weavers",
        shopName: "Heritage Paithani Weavers",
        storeName: "Heritage Paithani Weavers",
        status: "approved",
        email: sellerEmail,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).catch(() => {});

      app = express();
      app.use(express.json());
      app.use("/api", adminCategoriesRouter);
    });

    it("rejects unauthenticated requests with 401", async () => {
      const res = await request(app)
        .post("/api/seller/categories")
        .send({ name: "Unauth Subcategory", parentId: "paithani" });

      expect(res.status).toBe(401);
      expect(res.body.error).toContain("Authentication required");
    });

    it("strictly blocks sellers from creating main categories with exact error message", async () => {
      // 1. Without parentId
      const resWithoutParent = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ name: "Arbitrary Saree Collection" });

      expect(resWithoutParent.status).toBe(403);
      expect(resWithoutParent.body.error).toBe(
        "Sellers are not permitted to create arbitrary catalog categories. Please choose from the official catalog categories."
      );

      // 2. With type: 'main'
      const resMainType = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ name: "New Main Saree Line", type: "main", parentId: "paithani" });

      expect(resMainType.status).toBe(403);
      expect(resMainType.body.error).toBe(
        "Sellers are not permitted to create arbitrary catalog categories. Please choose from the official catalog categories."
      );
    });

    it("returns 404 when seller provides non-existent parent category ID", async () => {
      const res = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({ name: "Alien Drape", parentId: "non-existent-category-xyz" });

      expect(res.status).toBe(404);
      expect(res.body.error).toContain("not found. Please provide an existing and valid parent main category ID.");
    });

    it("allows seller to create new subcategory under an existing main category and saves required MongoDB fields", async () => {
      const res = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: "Handloom Peshwai Weave",
          parentId: "paithani",
          description: "Authentic Peshwai silk weave",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.subcategory).toBeDefined();

      const created = res.body.subcategory;
      // 1. Unique subcategory ID
      expect(created.id).toBeDefined();
      expect(typeof created.id).toBe("string");
      expect(created.id.length).toBeGreaterThan(0);

      // 2. Subcategory name
      expect(created.name).toBe("Handloom Peshwai Weave");

      // 3. Parent main category ID
      expect(created.parentId).toBeDefined();
      expect(["paithani", "cat-paithani-default"]).toContain(created.parentId);

      // 4. Seller ID
      expect(created.sellerId).toBeDefined();

      // 5. Creation timestamp
      expect(created.createdAt).toBeDefined();

      // 6. Active status
      expect(created.active).toBe(true);
      expect(created.status).toBe("approved");

      // 7. Type
      expect(created.type).toBe("subcategory");
    });

    it("prevents duplicate subcategories under the same main category", async () => {
      // First attempt
      const res1 = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: "Royal Zari Muniya",
          parentId: "paithani",
        });

      expect(res1.status).toBe(201);

      // Second attempt with duplicate name under same parent
      const res2 = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: "Royal Zari Muniya",
          parentId: "paithani",
        });

      expect(res2.status).toBe(201);
      expect(res2.body.subcategory.id).toBe(res1.body.subcategory.id);
    });

    it("allows newly created subcategory to be immediately used for product creation and linking", () => {
      // Verify subcategory resolves and validates for products
      const validation = validateCategoryAndSubcategory("paithani", "Handloom Peshwai Weave");
      expect(validation.valid).toBe(true);
      expect(validation.subcategoryDef?.name).toBe("Handloom Peshwai Weave");

      const productCategoryData = resolveCategoryData("paithani", "Handloom Peshwai Weave");
      expect(productCategoryData.categoryId).toBeDefined();
      expect(productCategoryData.categoryName).toBe("Paithani Sarees");
      expect(productCategoryData.subcategoryId).toBeDefined();
      expect(productCategoryData.subcategoryName).toBe("Handloom Peshwai Weave");
    });

    it("guarantees customer storefront category navigation displays only main categories", () => {
      const dynamicSubcategory = {
        id: "sub-peshwai-999",
        name: "Handloom Peshwai Weave",
        slug: "handloom-peshwai-weave",
        parentId: "cat-paithani-default",
        type: "subcategory",
        active: true,
      };

      // Must NOT be treated as a main category
      expect(isMainCatalogCategory(dynamicSubcategory)).toBe(false);

      // Main categories ARE treated as main categories
      const mainCategory = {
        id: "cat-paithani-default",
        name: "Paithani Sarees",
        slug: "paithani",
        type: "main",
        active: true,
      };
      expect(isMainCatalogCategory(mainCategory)).toBe(true);
    });

    it("completes full end-to-end workflow: Seller Login → Select Main Category → Create Subcategory → Save to MongoDB → Add Product → Admin Approval → Display Product Under Correct Main Category on User Side", async () => {
      // Step 1: Seller Authentication (verified via valid seller token)
      expect(sellerToken).toBeDefined();

      // Step 2 & 3: Select Main Category ("paithani") and Create Subcategory
      const subcategoryResponse = await request(app)
        .post("/api/seller/categories")
        .set("Authorization", `Bearer ${sellerToken}`)
        .send({
          name: "Yeola Shalu Silk",
          parentId: "paithani",
          description: "Traditional Maharashtrian Yeola Shalu silk drape",
        });

      expect(subcategoryResponse.status).toBe(201);
      const createdSubcategory = subcategoryResponse.body.subcategory;

      // Step 4: Verify Saved in MongoDB with all required fields
      expect(createdSubcategory.id).toBeDefined();
      expect(createdSubcategory.name).toBe("Yeola Shalu Silk");
      expect(createdSubcategory.parentId).toBeDefined();
      expect(createdSubcategory.sellerId).toBe(sellerId);
      expect(createdSubcategory.createdAt).toBeDefined();
      expect(createdSubcategory.active).toBe(true);

      const dbLookup = await mongoProductCategories.findById(createdSubcategory.id);
      expect(dbLookup).toBeDefined();
      expect(dbLookup?.name).toBe("Yeola Shalu Silk");

      // Step 5: Add Product with Main Category & newly created Subcategory
      const resolvedCatData = resolveCategoryData("paithani", "Yeola Shalu Silk");
      expect(resolvedCatData.categoryId).toBeDefined();
      expect(resolvedCatData.subcategoryId).toBe(createdSubcategory.id);

      const productId = `PS_TEST_${Date.now()}`;
      const productDoc = await mongoProducts.insert({
        id: productId,
        name: "Authentic Yeola Shalu Paithani Saree",
        description: "Handcrafted pure silk paithani saree with traditional peacocks",
        price: 18500,
        basePrice: 16500,
        category: resolvedCatData.category as any,
        categoryName: resolvedCatData.categoryName,
        categoryId: resolvedCatData.categoryId,
        parentCategoryId: resolvedCatData.parentCategoryId,
        parentCategoryName: resolvedCatData.parentCategoryName,
        subcategory: resolvedCatData.subcategory,
        subcategoryName: resolvedCatData.subcategoryName,
        subcategoryId: resolvedCatData.subcategoryId,
        vendorId: sellerId,
        sellerId: sellerId,
        vendorName: "Heritage Paithani Weavers",
        status: "pending", // Newly submitted products start pending
        active: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      expect(productDoc.categoryId).toBe(resolvedCatData.categoryId);
      expect(productDoc.subcategoryId).toBe(createdSubcategory.id);
      expect(productDoc.status).toBe("pending");

      // Step 6: Admin Approval
      const approvedProduct = await mongoProducts.update(productId, {
        status: "approved",
        active: true,
        approvalRemark: "Verified genuine handloom artistry",
      });

      expect(approvedProduct?.status).toBe("approved");
      expect(approvedProduct?.active).toBe(true);

      // Step 7: Display Product Under Correct Main Category on User Side
      const activeProductsInStore = await mongoProducts.findMany({
        status: "approved",
        active: true,
      });

      const matchedStoreProduct = activeProductsInStore.find((p) => p.id === productId);
      expect(matchedStoreProduct).toBeDefined();
      expect(matchedStoreProduct?.categoryId).toBe(resolvedCatData.categoryId);
      expect(matchedStoreProduct?.category).toBe("paithani");
      expect(matchedStoreProduct?.subcategoryId).toBe(createdSubcategory.id);
      expect(matchedStoreProduct?.subcategoryName).toBe("Yeola Shalu Silk");

      // Step 8: User navigation check
      // Ensure createdSubcategory does NOT appear as a main category on user side
      expect(isMainCatalogCategory(createdSubcategory)).toBe(false);

      // Ensure createdSubcategory DOES appear inside parent main category's subcategories
      const userFacingSubs = getSubcategoriesForCategory("paithani", [
        {
          id: "cat-paithani-default",
          slug: "paithani",
          name: "Paithani Sarees",
          subcategories: [createdSubcategory],
        },
      ]);
      expect(userFacingSubs.some((s) => s.name === "Yeola Shalu Silk")).toBe(true);
    });
  });
});
