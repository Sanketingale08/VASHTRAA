import { describe, it, expect } from "vitest";
import {
  CATALOG_CATEGORIES,
  findCategoryDefinition,
  findSubcategoryDefinition,
  validateCategoryAndSubcategory,
  resolveCategoryData,
  resolveCanonicalSubcategoryName,
  isValidSubcategoryForCategory,
  SUBCATEGORY_LEGACY_ALIASES,
} from "@workspace/db";
import {
  findCategoryBySlugOrName as frontendFindCategory,
  findSubcategoryDefinition as frontendFindSubcategory,
  resolveCanonicalSubcategoryName as frontendResolveCanonical,
  isValidSubcategoryForCategory as frontendIsValidSubcategory,
  getSubcategoriesForCategory as frontendGetSubcategories,
  isMainCatalogCategory,
} from "../../../vastraa/src/constants/categories";

describe("Authoritative Category & Subcategory Centralized Specification", () => {
  it("defines the primary subcategories for Paithani: Bridal, Weddings, Western", () => {
    const paithani = findCategoryDefinition("paithani");
    expect(paithani).toBeDefined();
    expect(paithani?.name).toBe("Paithani Sarees");

    const subNames = paithani?.subcategories.map((s) => s.name);
    expect(subNames).toContain("Bridal");
    expect(subNames).toContain("Weddings");
    expect(subNames).toContain("Western");
    expect(subNames?.slice(0, 3)).toEqual(["Bridal", "Weddings", "Western"]);

    const bridal = paithani?.subcategories.find((s) => s.slug === "bridal");
    expect(bridal?.route).toBe("/bridal");

    const weddings = paithani?.subcategories.find((s) => s.slug === "wedding-paithani-main");
    expect(weddings?.route).toBe("/wedding-paithani-main");

    const western = paithani?.subcategories.find((s) => s.slug === "western-paithani-main");
    expect(western?.route).toBe("/western-paithani-main");
  });

  it("defines the primary subcategories for Designer Saree: Bollywood, Contemporary Silk, Party Wear", () => {
    const designer = findCategoryDefinition("designer");
    expect(designer).toBeDefined();
    expect(designer?.name).toBe("Designer Sarees");

    const subNames = designer?.subcategories.map((s) => s.name);
    expect(subNames).toContain("Bollywood");
    expect(subNames).toContain("Contemporary Silk");
    expect(subNames).toContain("Party Wear");
    expect(subNames?.slice(0, 3)).toEqual(["Bollywood", "Contemporary Silk", "Party Wear"]);

    const bollywood = designer?.subcategories.find((s) => s.slug === "bollywood");
    expect(bollywood?.route).toBe("/bollywood");

    const contSilk = designer?.subcategories.find((s) => s.slug === "contemporary-silk-main");
    expect(contSilk?.route).toBe("/contemporary-silk-main");

    const party = designer?.subcategories.find((s) => s.slug === "party");
    expect(party?.route).toBe("/party");
  });

  it("frontend and backend definitions match for all categories and subcategories", () => {
    const paithaniBackend = findCategoryDefinition("Paithani");
    const paithaniFrontend = frontendFindCategory("Paithani");
    expect(paithaniBackend?.name).toBe(paithaniFrontend?.name);
    expect(paithaniBackend?.subcategories.map((s) => s.name)).toEqual(
      paithaniFrontend?.subcategories.map((s) => s.name)
    );

    const designerBackend = findCategoryDefinition("Designer");
    const designerFrontend = frontendFindCategory("Designer");
    expect(designerBackend?.name).toBe(designerFrontend?.name);
    expect(designerBackend?.subcategories.map((s) => s.name)).toEqual(
      designerFrontend?.subcategories.map((s) => s.name)
    );
  });

  describe("Subcategories are excluded from main categories filter", () => {
    it("isMainCatalogCategory correctly filters out subcategories and incorrect entries", () => {
      expect(isMainCatalogCategory({ slug: "bollywood", type: "subcategory" })).toBe(false);
      expect(isMainCatalogCategory({ slug: "contemporary-silk-main", parentId: "cat-designer-default" })).toBe(false);
      expect(isMainCatalogCategory({ slug: "party" })).toBe(false);
      expect(isMainCatalogCategory({ slug: "bridal" })).toBe(false);
      expect(isMainCatalogCategory({ slug: "wedding-paithani-main" })).toBe(false);
      expect(isMainCatalogCategory({ slug: "western-paithani-main" })).toBe(false);

      // Main categories pass
      expect(isMainCatalogCategory({ slug: "paithani", type: "main" })).toBe(true);
      expect(isMainCatalogCategory({ slug: "designer", type: "main" })).toBe(true);
      expect(isMainCatalogCategory({ slug: "banarasi", type: "main" })).toBe(true);
    });
  });

  describe("Paithani Subcategory Acceptance Table", () => {
    it("accepts 'Bridal' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Bridal");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Bridal");
      expect(frontendIsValidSubcategory("paithani", "Bridal")).toBe(true);
    });

    it("accepts 'Weddings' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Weddings");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Weddings");
      expect(frontendIsValidSubcategory("paithani", "Weddings")).toBe(true);
    });

    it("accepts 'Western' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Western");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Western");
      expect(frontendIsValidSubcategory("paithani", "Western")).toBe(true);
    });

    it("rejects cross-category mismatch like 'Anarkali' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Anarkali");
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid subcategory "Anarkali"');
    });
  });

  describe("Safe Legacy Alias Resolution", () => {
    it("safely resolves legacy shortened 'bridal' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "bridal");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Bridal");
      expect(frontendIsValidSubcategory("paithani", "bridal")).toBe(true);
    });

    it("safely resolves legacy 'wedding' or 'weddings' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "weddings");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Weddings");
    });

    it("safely resolves 'western' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "western");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Western");
    });
  });

  describe("Designer Saree Subcategory Acceptance", () => {
    it("accepts 'Bollywood' under Designer", () => {
      const res = validateCategoryAndSubcategory("Designer", "Bollywood");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Bollywood");
      expect(frontendIsValidSubcategory("designer", "Bollywood")).toBe(true);
    });

    it("accepts 'Contemporary Silk' under Designer", () => {
      const res = validateCategoryAndSubcategory("Designer", "Contemporary Silk");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Contemporary Silk");
      expect(frontendIsValidSubcategory("designer", "Contemporary Silk")).toBe(true);
    });

    it("accepts 'Party Wear' under Designer", () => {
      const res = validateCategoryAndSubcategory("Designer", "Party Wear");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Party Wear");
      expect(frontendIsValidSubcategory("designer", "Party Wear")).toBe(true);
    });
  });
});
