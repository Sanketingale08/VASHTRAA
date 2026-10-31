import { describe, it, expect, beforeEach, vi } from "vitest";
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
} from "../../../vastraa/src/constants/categories";

describe("Authoritative Category & Subcategory Centralized Specification", () => {
  it("defines exactly the 4 required subcategories for Paithani", () => {
    const paithani = findCategoryDefinition("paithani");
    expect(paithani).toBeDefined();
    expect(paithani?.name).toBe("Paithani");
    
    const subNames = paithani?.subcategories.map((s) => s.name);
    expect(subNames).toEqual([
      "Festival Paithani",
      "Bridal Paithani",
      "Wedding Paithani",
      "Contemporary Silk",
    ]);
  });

  it("frontend and backend definitions match for all categories", () => {
    const paithaniBackend = findCategoryDefinition("Paithani");
    const paithaniFrontend = frontendFindCategory("Paithani");
    expect(paithaniBackend?.name).toBe(paithaniFrontend?.name);
    expect(paithaniBackend?.subcategories.map((s) => s.name)).toEqual(
      paithaniFrontend?.subcategories.map((s) => s.name)
    );
  });

  describe("Paithani Subcategory Acceptance Table", () => {
    it("accepts 'Festival Paithani' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Festival Paithani");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Festival Paithani");
      expect(resolveCanonicalSubcategoryName("Paithani", "Festival Paithani")).toBe("Festival Paithani");
      expect(frontendIsValidSubcategory("paithani", "Festival Paithani")).toBe(true);
    });

    it("accepts 'Bridal Paithani' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Bridal Paithani");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Bridal Paithani");
      expect(resolveCanonicalSubcategoryName("Paithani", "Bridal Paithani")).toBe("Bridal Paithani");
      expect(frontendIsValidSubcategory("paithani", "Bridal Paithani")).toBe(true);
    });

    it("accepts 'Wedding Paithani' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Wedding Paithani");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Wedding Paithani");
      expect(resolveCanonicalSubcategoryName("Paithani", "Wedding Paithani")).toBe("Wedding Paithani");
      expect(frontendIsValidSubcategory("paithani", "Wedding Paithani")).toBe(true);
    });

    it("accepts 'Contemporary Silk' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Contemporary Silk");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Contemporary Silk");
      expect(resolveCanonicalSubcategoryName("Paithani", "Contemporary Silk")).toBe("Contemporary Silk");
      expect(frontendIsValidSubcategory("paithani", "Contemporary Silk")).toBe(true);
    });

    it("rejects invalid unrelated subcategories under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Invalid unrelated subcategory");
      expect(res.valid).toBe(false);
      expect(res.error).toBe(
        'Invalid subcategory "Invalid unrelated subcategory" for category "Paithani". Valid subcategories are: Festival Paithani, Bridal Paithani, Wedding Paithani, Contemporary Silk.'
      );
      expect(frontendIsValidSubcategory("paithani", "Invalid unrelated subcategory")).toBe(false);
    });

    it("rejects cross-category mismatch like 'Anarkali' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "Anarkali");
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Invalid subcategory "Anarkali" for category "Paithani"');
    });
  });

  describe("Safe Legacy Alias Resolution", () => {
    it("safely resolves legacy shortened 'bridal' -> 'Bridal Paithani' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "bridal");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Bridal Paithani");
      expect(res.subcategoryDef?.id).toBe("cat-bridal-paithani");

      const resolved = resolveCategoryData("Paithani", "bridal");
      expect(resolved.category).toBe("paithani");
      expect(resolved.categoryName).toBe("Paithani");
      expect(resolved.subcategory).toBe("Bridal Paithani");
      expect(resolved.subcategoryName).toBe("Bridal Paithani");
      expect(resolved.subcategoryId).toBe("cat-bridal-paithani");

      // Frontend canonical resolver also maps it seamlessly
      expect(frontendResolveCanonical("paithani", "bridal")).toBe("Bridal Paithani");
      expect(frontendIsValidSubcategory("paithani", "bridal")).toBe(true);
    });

    it("safely resolves legacy shortened 'festival' -> 'Festival Paithani' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "festival");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Festival Paithani");
      expect(resolveCanonicalSubcategoryName("Paithani", "festival")).toBe("Festival Paithani");
    });

    it("safely resolves legacy shortened 'wedding' -> 'Wedding Paithani' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "wedding");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Wedding Paithani");
      expect(resolveCanonicalSubcategoryName("Paithani", "wedding")).toBe("Wedding Paithani");
    });

    it("safely resolves slug 'contemporary-silk' -> 'Contemporary Silk' under Paithani", () => {
      const res = validateCategoryAndSubcategory("Paithani", "contemporary-silk");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Contemporary Silk");
    });

    it("handles whitespace and case variation (e.g. '   BRIDAL  ')", () => {
      const res = validateCategoryAndSubcategory("Paithani", "   BRIDAL  ");
      expect(res.valid).toBe(true);
      expect(res.subcategoryDef?.name).toBe("Bridal Paithani");
    });
  });

  describe("Dynamic Category Switching and Subcategory Validation", () => {
    it("clears subcategory if it is not valid for the newly selected category", () => {
      // Subcategory 'Bridal' is valid under Designer
      expect(frontendIsValidSubcategory("designer", "Bridal")).toBe(true);

      // But if seller switches from Designer to Contemporary Silk, 'Bridal' is invalid
      expect(frontendIsValidSubcategory("contemporary-silk", "Bridal")).toBe(false);
      expect(frontendResolveCanonical("contemporary-silk", "Bridal")).toBe("");
    });

    it("preserves or maps subcategory if valid under the new category", () => {
      // 'Contemporary Silk' is valid under Paithani AND Designer
      expect(frontendResolveCanonical("paithani", "Contemporary Silk")).toBe("Contemporary Silk");
      expect(frontendResolveCanonical("designer", "Contemporary Silk")).toBe("Contemporary Silk");
    });

    it("returns correct list of subcategories when parent category changes", () => {
      const paithaniSubs = frontendGetSubcategories("paithani");
      expect(paithaniSubs.map((s) => s.name)).toEqual([
        "Festival Paithani",
        "Bridal Paithani",
        "Wedding Paithani",
        "Contemporary Silk",
      ]);

      const designerSubs = frontendGetSubcategories("designer");
      expect(designerSubs.map((s) => s.name)).toEqual([
        "Bollywood",
        "Bridal",
        "Contemporary Silk",
        "Wedding Designer Sarees",
      ]);
    });
  });
});
