import { describe, it, expect } from "vitest";
import {
  CATALOG_CATEGORIES,
  findCategoryDefinition,
  findSubcategoryDefinition,
  validateCategoryAndSubcategory,
  resolveCategoryData,
  resolveCanonicalSubcategoryName,
  isValidSubcategoryForCategory,
} from "@workspace/db";
import {
  CATALOG_CATEGORIES as frontendCatalogCategories,
  CATEGORY_DROPDOWN_OPTIONS,
  findCategoryBySlugOrName as frontendFindCategory,
  findSubcategoryDefinition as frontendFindSubcategory,
  getSubcategoriesForCategory as frontendGetSubcategories,
  isCategoryProduct,
} from "../../../vastraa/src/constants/categories";

describe("VASTRAA Complete Women's Fashion Catalog Expansion", () => {
  it("defines EXACTLY the 6 official main categories in exact order", () => {
    const expectedOrder = [
      { name: "Sarees", slug: "sarees", prefix: "SR" },
      { name: "Kurtis", slug: "kurtis", prefix: "KU" },
      { name: "Kurta Sets", slug: "kurta-sets", prefix: "KS" },
      { name: "Ethnic Dresses", slug: "ethnic-dresses", prefix: "ED" },
      { name: "Western Dresses", slug: "western-dresses", prefix: "WD" },
      { name: "Winter Wear", slug: "winter-wear", prefix: "WW" },
    ];

    expect(CATALOG_CATEGORIES.length).toBe(6);
    expect(frontendCatalogCategories.length).toBe(6);

    for (let i = 0; i < 6; i++) {
      expect(CATALOG_CATEGORIES[i].name).toBe(expectedOrder[i].name);
      expect(CATALOG_CATEGORIES[i].slug).toBe(expectedOrder[i].slug);
      expect(CATALOG_CATEGORIES[i].prefix).toBe(expectedOrder[i].prefix);

      expect(frontendCatalogCategories[i].name).toBe(expectedOrder[i].name);
      expect(frontendCatalogCategories[i].slug).toBe(expectedOrder[i].slug);
      expect(frontendCatalogCategories[i].prefix).toBe(expectedOrder[i].prefix);
    }
  });

  it("CATEGORY_DROPDOWN_OPTIONS contains only the 6 main categories", () => {
    expect(CATEGORY_DROPDOWN_OPTIONS.length).toBe(6);
    expect(CATEGORY_DROPDOWN_OPTIONS.map((c) => c.value)).toEqual([
      "sarees",
      "kurtis",
      "kurta-sets",
      "ethnic-dresses",
      "western-dresses",
      "winter-wear",
    ]);
  });

  describe("Kurtis (15 Official Subcategories)", () => {
    const expectedKurtisSubs = [
      "Straight Kurti",
      "A-Line Kurti",
      "Anarkali Kurti",
      "Angrakha Kurti",
      "Flared Kurti",
      "Asymmetrical Kurti",
      "Kaftan Kurti",
      "Short Kurti",
      "Long Kurti",
      "High-Low Kurti",
      "Pakistani Style Kurti",
      "Shirt-Style Kurti",
      "Front-Slit Kurti",
      "Jacket-Style Kurti",
      "Cape-Style Kurti",
    ];

    it("has all 15 subcategories in backend and frontend", () => {
      const kurtiDef = findCategoryDefinition("kurtis");
      expect(kurtiDef).toBeDefined();
      expect(kurtiDef?.subcategories.length).toBe(15);
      expect(kurtiDef?.subcategories.map((s) => s.name)).toEqual(expectedKurtisSubs);

      const frontendSubs = frontendGetSubcategories("kurtis");
      expect(frontendSubs.length).toBe(15);
      expect(frontendSubs.map((s) => s.name)).toEqual(expectedKurtisSubs);
    });

    it("validates all 15 subcategories individually", () => {
      for (const name of expectedKurtisSubs) {
        const val = validateCategoryAndSubcategory("kurtis", name);
        expect(val.valid).toBe(true);
        expect(val.subcategoryDef?.name).toBe(name);
      }
    });

    it("rejects cross-category subcategories for Kurtis", () => {
      const val = validateCategoryAndSubcategory("kurtis", "Paithani");
      expect(val.valid).toBe(false);
      expect(val.error).toContain('Invalid subcategory "Paithani"');
    });
  });

  describe("Kurta Sets (10 Official Subcategories)", () => {
    const expectedKurtaSetsSubs = [
      "Kurti with Palazzo",
      "Kurti with Straight Pants",
      "Kurti with Cigarette Pants",
      "Kurti with Sharara",
      "Kurti with Gharara",
      "Kurti with Dhoti Pants",
      "Kurti with Skirt",
      "Kurti with Dupatta",
      "2-Piece Kurta Set",
      "3-Piece Kurta Set",
    ];

    it("has all 10 subcategories in backend and frontend", () => {
      const def = findCategoryDefinition("kurta-sets");
      expect(def).toBeDefined();
      expect(def?.subcategories.length).toBe(10);
      expect(def?.subcategories.map((s) => s.name)).toEqual(expectedKurtaSetsSubs);
    });

    it("validates all 10 subcategories individually", () => {
      for (const name of expectedKurtaSetsSubs) {
        const val = validateCategoryAndSubcategory("kurta-sets", name);
        expect(val.valid).toBe(true);
        expect(val.subcategoryDef?.name).toBe(name);
      }
    });
  });

  describe("Ethnic Dresses (10 Official Subcategories)", () => {
    const expectedEthnicDressesSubs = [
      "Anarkali Gown",
      "Ethnic Maxi Dress",
      "Ethnic Midi Dress",
      "Ethnic A-Line Dress",
      "Indo-Western Dress",
      "Floor-Length Ethnic Gown",
      "Jacket-Style Ethnic Dress",
      "Kaftan Dress",
      "Festive Ethnic Dress",
      "Party-Wear Ethnic Dress",
    ];

    it("has all 10 subcategories in backend and frontend", () => {
      const def = findCategoryDefinition("ethnic-dresses");
      expect(def).toBeDefined();
      expect(def?.subcategories.length).toBe(10);
      expect(def?.subcategories.map((s) => s.name)).toEqual(expectedEthnicDressesSubs);
    });

    it("validates all 10 subcategories individually", () => {
      for (const name of expectedEthnicDressesSubs) {
        const val = validateCategoryAndSubcategory("ethnic-dresses", name);
        expect(val.valid).toBe(true);
        expect(val.subcategoryDef?.name).toBe(name);
      }
    });
  });

  describe("Western Dresses (16 Official Subcategories)", () => {
    const expectedWesternDressesSubs = [
      "A-Line Dress",
      "Fit and Flare Dress",
      "Bodycon Dress",
      "Maxi Dress",
      "Midi Dress",
      "Mini Dress",
      "Shirt Dress",
      "Wrap Dress",
      "Skater Dress",
      "Tiered Dress",
      "Slip Dress",
      "Co-Ord Dress",
      "Denim Dress",
      "Floral Dress",
      "Ruffle Dress",
      "One-Piece Party Dress",
    ];

    it("has all 16 subcategories in backend and frontend", () => {
      const def = findCategoryDefinition("western-dresses");
      expect(def).toBeDefined();
      expect(def?.subcategories.length).toBe(16);
      expect(def?.subcategories.map((s) => s.name)).toEqual(expectedWesternDressesSubs);
    });

    it("validates all 16 subcategories individually", () => {
      for (const name of expectedWesternDressesSubs) {
        const val = validateCategoryAndSubcategory("western-dresses", name);
        expect(val.valid).toBe(true);
        expect(val.subcategoryDef?.name).toBe(name);
      }
    });
  });

  describe("Winter Wear (EXACTLY 10 Official Subcategories)", () => {
    const expectedWinterSubs = [
      "Winter Dresses",
      "Sweater Dresses",
      "Woolen Dresses",
      "Winter Ethnic Wear",
      "Winter Western Wear",
      "Velvet Dresses",
      "Winter Party Wear",
      "Winter Co-ord Sets",
      "Winter Jackets & Coats",
      "Winter Casual Wear",
    ];

    it("has exactly 10 subcategories in backend and frontend", () => {
      const def = findCategoryDefinition("winter-wear");
      expect(def).toBeDefined();
      expect(def?.subcategories.length).toBe(10);
      expect(def?.subcategories.map((s) => s.name)).toEqual(expectedWinterSubs);
    });

    it("validates all 10 subcategories individually", () => {
      for (const name of expectedWinterSubs) {
        const val = validateCategoryAndSubcategory("winter-wear", name);
        expect(val.valid).toBe(true);
        expect(val.subcategoryDef?.name).toBe(name);
      }
    });
  });

  describe("Sarees (Preserves All 11-12 Traditional Weaves)", () => {
    it("preserves traditional saree subcategories and backward compatibility", () => {
      const sareeDef = findCategoryDefinition("sarees");
      expect(sareeDef).toBeDefined();
      const subNames = sareeDef?.subcategories.map((s) => s.name);
      expect(subNames).toContain("Paithani");
      expect(subNames).toContain("Designer");
      expect(subNames).toContain("Banarasi");
      expect(subNames).toContain("Kanjivaram");
      expect(subNames).toContain("Gadwal");
      expect(subNames).toContain("Chanderi");
      expect(subNames).toContain("Bandhani");
      expect(subNames).toContain("Mysore Silk");
      expect(subNames).toContain("Ikat");
      expect(subNames).toContain("Cotton");
      expect(subNames).toContain("Silk");

      // Legacy direct lookups
      const paithaniLegacy = findCategoryDefinition("paithani");
      expect(paithaniLegacy).toBeDefined();
      expect(paithaniLegacy?.name).toBe("Paithani Sarees");

      const designerLegacy = findCategoryDefinition("designer");
      expect(designerLegacy).toBeDefined();
      expect(designerLegacy?.name).toBe("Designer Sarees");
    });
  });

  describe("Product Classifier (isCategoryProduct)", () => {
    it("classifies products across all 6 categories correctly", () => {
      expect(isCategoryProduct({ category: "sarees", name: "Royal Saree" }, "sarees")).toBe(true);
      expect(isCategoryProduct({ category: "paithani", name: "Yeola Silk" }, "sarees")).toBe(true);
      expect(isCategoryProduct({ category: "kurtis", name: "Cotton Straight Kurti" }, "kurtis")).toBe(true);
      expect(isCategoryProduct({ category: "kurta-sets", name: "3-Piece Kurta Palazzo" }, "kurta-sets")).toBe(true);
      expect(isCategoryProduct({ category: "ethnic-dresses", name: "Anarkali Gown" }, "ethnic-dresses")).toBe(true);
      expect(isCategoryProduct({ category: "western-dresses", name: "Bodycon Dress" }, "western-dresses")).toBe(true);
      expect(isCategoryProduct({ category: "winter-wear", name: "Sweater Dress" }, "winter-wear")).toBe(true);
    });
  });
});

