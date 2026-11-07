/**
 * Product Synchronization Unit Tests
 *
 * Verifies that:
 *  1. Active products stored in Mongo AND Postgres are merged and returned by searchProducts().
 *  2. Approved vendor resolving checks vendorId, ownerId, sellerId, and Postgres vendors.
 *  3. Product status "active" or "approved" correctly displays products on the user side.
 *  4. Product status "rejected", "inactive", or "declined" filters products out.
 *  5. Category slug matching handles category names like "Paithani Sarees" when filtering by "paithani".
 *  6. Multiple active products (e.g., 3 active products) are all returned without artificial limit capping.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const state = vi.hoisted(() => ({
  mongoSellers: [
    { id: "seller-1", vendorId: "v-1", ownerId: "user-1", status: "approved" },
    { id: "seller-2", vendorId: "v-2", ownerId: "user-2", status: "active" },
  ] as any[],
  mongoProducts: [
    {
      id: "prod-1",
      name: "Paithani Pure Silk Saree",
      category: "Paithani Sarees",
      price: 12000,
      active: true,
      status: "active",
      vendorId: "v-1",
      rating: 4.5,
    },
    {
      id: "prod-2",
      name: "Designer Georgette Saree",
      category: "Designer Sarees",
      price: 8500,
      active: true,
      status: "approved",
      vendorId: "user-2",
      rating: 4.8,
    },
  ] as any[],
  pgProducts: [
    {
      id: "prod-3",
      name: "Bridal Zari Work Saree",
      category: "Bridal Sarees",
      price: 25000,
      active: true,
      status: "active",
      vendorId: "v-1",
      rating: 4.9,
    },
  ] as any[],
  pgVendors: [
    { id: "v-1", ownerId: "user-1", status: "approved" },
  ] as any[],
}));

vi.mock("@workspace/db", () => {
  const productsTable = { __table: "products", active: "active" };
  const vendorsTable = { __table: "vendors" };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn((table: any) => {
          const isProducts = table?.active === "active" || table?.__table === "products" || table === productsTable;
          const data = isProducts ? state.pgProducts : state.pgVendors;
          const prom: any = Promise.resolve(data);
          prom.where = vi.fn(() => Promise.resolve(state.pgProducts));
          return prom;
        }),
      })),
    },
    productsTable,
    vendorsTable,
    eq: vi.fn(),
    mongoProducts: {
      findMany: vi.fn(async (filter?: any) => {
        if (filter && filter.active === true) {
          return state.mongoProducts.filter(p => p.active === true);
        }
        return state.mongoProducts;
      }),
    },
    mongoSellers: {
      findMany: vi.fn(async () => state.mongoSellers),
    },
    findCategoryDefinition: vi.fn((slug: string) => {
      if (slug === "paithani") return { id: "cat-paithani-default", slug: "paithani" };
      if (slug === "designer") return { id: "cat-designer-default", slug: "designer" };
      return null;
    }),
    normalizeCategoryString: (s: string) => String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-"),
  };
});

import { searchProducts, getApprovedVendorIds } from "../lib/searchEngine";

describe("Product Synchronization Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("getApprovedVendorIds includes seller id, vendorId, sellerId, ownerId, and pgVendors", async () => {
    const approved = await getApprovedVendorIds();
    expect(approved.has("v-1")).toBe(true);
    expect(approved.has("user-1")).toBe(true);
    expect(approved.has("v-2")).toBe(true);
    expect(approved.has("user-2")).toBe(true);
  });

  it("searchProducts merges active products from both Mongo and Postgres", async () => {
    const res = await searchProducts({});
    expect(res.total).toBe(3);
    expect(res.products).toHaveLength(3);
    const ids = res.products.map(p => p.id);
    expect(ids).toContain("prod-1");
    expect(ids).toContain("prod-2");
    expect(ids).toContain("prod-3");
  });

  it("searchProducts correctly handles category slug matching for Paithani Sarees", async () => {
    const res = await searchProducts({ category: "paithani" });
    expect(res.products.map(p => p.id)).toContain("prod-1");
  });

  it("searchProducts correctly handles category slug matching for Designer Sarees", async () => {
    const res = await searchProducts({ category: "designer" });
    expect(res.products.map(p => p.id)).toContain("prod-2");
  });

  it("searchProducts matches all Paithani variations in paithani category filter", async () => {
    const testPaithaniItems = [
      {
        id: "prod-p-wedding",
        name: "Royal Heritage Weave Saree",
        category: "cat-wedding-paithani-main",
        price: 18000,
        active: true,
        status: "approved",
        vendorId: "v-1",
        rating: 4.9,
      },
      {
        id: "prod-p-western",
        name: "Indo-Western Silk Drape",
        category: "western-paithani",
        price: 14000,
        active: true,
        status: "approved",
        vendorId: "v-1",
        rating: 4.7,
      },
      {
        id: "prod-p-yeola",
        name: "Authentic Yeola Handloom Saree",
        category: "indian-wear",
        subcategory: "Traditional Yeola",
        price: 22000,
        active: true,
        status: "approved",
        vendorId: "v-1",
        rating: 5.0,
      },
    ];

    state.mongoProducts.push(...testPaithaniItems);
    const res = await searchProducts({ category: "paithani" });
    const ids = res.products.map(p => p.id);

    expect(ids).toContain("prod-1"); // Paithani Pure Silk Saree
    expect(ids).toContain("prod-p-wedding");
    expect(ids).toContain("prod-p-western");
    expect(ids).toContain("prod-p-yeola");
    expect(ids).not.toContain("prod-2"); // Designer Georgette Saree must NOT show in Paithani

    // Cleanup
    state.mongoProducts.splice(state.mongoProducts.length - testPaithaniItems.length, testPaithaniItems.length);
  });

  it("searchProducts matches all Designer variations in designer category filter", async () => {
    const testDesignerItems = [
      {
        id: "prod-d-bollywood",
        name: "Red Carpet Shimmer Saree",
        category: "bollywood",
        price: 12500,
        active: true,
        status: "approved",
        vendorId: "user-2",
        rating: 4.8,
      },
      {
        id: "prod-d-contemporary",
        name: "Contemporary Art Silk Drape",
        category: "contemporary-silk",
        price: 9500,
        active: true,
        status: "approved",
        vendorId: "user-2",
        rating: 4.6,
      },
      {
        id: "prod-d-named",
        name: "Bollywood Glamour Sequin Saree",
        category: "party",
        price: 11000,
        active: true,
        status: "approved",
        vendorId: "user-2",
        rating: 4.9,
      },
    ];

    state.mongoProducts.push(...testDesignerItems);
    const res = await searchProducts({ category: "designer" });
    const ids = res.products.map(p => p.id);

    expect(ids).toContain("prod-2"); // Designer Georgette Saree
    expect(ids).toContain("prod-d-bollywood");
    expect(ids).toContain("prod-d-contemporary");
    expect(ids).toContain("prod-d-named");
    expect(ids).not.toContain("prod-1"); // Paithani Pure Silk Saree must NOT show in Designer

    // Cleanup
    state.mongoProducts.splice(state.mongoProducts.length - testDesignerItems.length, testDesignerItems.length);
  });

  it("searchProducts filters out rejected or inactive products", async () => {
    // Temporarily mark prod-2 as rejected
    state.mongoProducts[1].status = "rejected";
    const res = await searchProducts({});
    expect(res.total).toBe(2);
    expect(res.products.map(p => p.id)).not.toContain("prod-2");

    // Restore prod-2
    state.mongoProducts[1].status = "approved";
  });

  it("searchProducts prioritizes newest specifications, images, and description when Mongo record is updated", async () => {
    // prod-1 in Mongo has updated specs, images, description with newer updatedAt
    const updatedDate = new Date(Date.now() + 10000);
    state.mongoProducts[0].updatedAt = updatedDate;
    state.mongoProducts[0].specifications = [{ key: "Weave", value: "Pure Handloom Zari" }];
    state.mongoProducts[0].images = ["https://example.com/updated_paithani.jpg"];
    state.mongoProducts[0].description = "Updated luxury handcrafted Paithani saree description.";

    // Existing Postgres record has older data
    state.pgProducts.push({
      id: "prod-1",
      name: "Paithani Pure Silk Saree (Old)",
      description: "Old description",
      category: "Paithani Sarees",
      price: 12000,
      active: true,
      status: "active",
      vendorId: "v-1",
      updatedAt: new Date(Date.now() - 50000),
      specifications: [{ key: "OldSpec", value: "OldValue" }],
      images: ["https://example.com/old_paithani.jpg"],
    });

    const res = await searchProducts({});
    const prod1 = res.products.find(p => p.id === "prod-1");
    expect(prod1).toBeDefined();
    expect(prod1?.specifications).toEqual([{ key: "Weave", value: "Pure Handloom Zari" }]);
    expect(prod1?.images).toEqual(["https://example.com/updated_paithani.jpg"]);
    expect(prod1?.description).toBe("Updated luxury handcrafted Paithani saree description.");

    // Clean up
    state.pgProducts.pop();
  });

  it("preserves updated empty specifications or updated images without falling back to stale arrays", async () => {
    const updatedDate = new Date(Date.now() + 20000);
    state.mongoProducts[0].updatedAt = updatedDate;
    state.mongoProducts[0].specifications = [];
    state.mongoProducts[0].images = ["https://example.com/single_image.jpg"];

    state.pgProducts.push({
      id: "prod-1",
      name: "Paithani Pure Silk Saree",
      category: "Paithani Sarees",
      price: 12000,
      active: true,
      status: "active",
      vendorId: "v-1",
      updatedAt: new Date(Date.now() - 50000),
      specifications: [{ key: "StaleKey", value: "StaleValue" }],
      images: ["https://example.com/stale1.jpg", "https://example.com/stale2.jpg"],
    });

    const res = await searchProducts({});
    const prod1 = res.products.find(p => p.id === "prod-1");
    expect(prod1).toBeDefined();
    // Must reflect the seller's intentional removal of specifications (empty array) rather than resurrecting stale ones
    expect(prod1?.specifications).toEqual([]);
    expect(prod1?.images).toEqual(["https://example.com/single_image.jpg"]);

    state.pgProducts.pop();
  });
});
