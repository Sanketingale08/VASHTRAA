/**
 * Authoritative Catalog Categories and Subcategories Specification
 *
 * Defines the strict, authoritative list of available seller product categories
 * and their respective subcategories for VASTRAA.
 */

export interface CatalogSubcategory {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  slug: string;
  type: string;
  prefix: string;
  subcategories: CatalogSubcategory[];
}

export const CATALOG_CATEGORIES: CatalogCategory[] = [
  {
    id: "cat-paithani-default",
    name: "Paithani",
    slug: "paithani",
    type: "main",
    prefix: "PS",
    subcategories: [
      { id: "cat-festival-paithani", name: "Festival Paithani", slug: "festival-paithani" },
      { id: "cat-bridal-paithani", name: "Bridal Paithani", slug: "bridal-paithani" },
      { id: "cat-wedding-paithani", name: "Wedding Paithani", slug: "wedding-paithani" },
      { id: "cat-contemporary-silk-paithani", name: "Contemporary Silk", slug: "contemporary-silk" },
    ],
  },
  {
    id: "cat-designer-default",
    name: "Designer",
    slug: "designer",
    type: "main",
    prefix: "DS",
    subcategories: [
      { id: "cat-bollywood-sarees", name: "Bollywood", slug: "bollywood" },
      { id: "cat-designer-bridal", name: "Bridal", slug: "bridal" },
      { id: "cat-contemporary-silk", name: "Contemporary Silk", slug: "contemporary-silk" },
      { id: "cat-wedding-designer-sarees", name: "Wedding Designer Sarees", slug: "wedding-designer-sarees" },
    ],
  },
  {
    id: "cat-bollywood-default",
    name: "Bollywood",
    slug: "bollywood",
    type: "main",
    prefix: "BL",
    subcategories: [
      { id: "cat-bollywood-party-wear", name: "Bollywood Party Wear", slug: "bollywood-party-wear" },
      { id: "cat-celebrity-designer", name: "Celebrity Designer", slug: "celebrity-designer" },
      { id: "cat-bollywood-bridal", name: "Bollywood Bridal", slug: "bollywood-bridal" },
      { id: "cat-contemporary-silk-bollywood", name: "Contemporary Silk", slug: "contemporary-silk" },
    ],
  },
  {
    id: "cat-bridal-default",
    name: "Bridal",
    slug: "bridal",
    type: "main",
    prefix: "BS",
    subcategories: [
      { id: "cat-bridal-paithani-sub", name: "Bridal Paithani", slug: "bridal-paithani" },
      { id: "cat-bridal-designer", name: "Bridal Designer", slug: "bridal-designer" },
      { id: "cat-wedding-silk", name: "Wedding Silk", slug: "wedding-silk" },
      { id: "cat-royal-trousseau", name: "Royal Trousseau", slug: "royal-trousseau" },
    ],
  },
  {
    id: "cat-contemporary-silk-main",
    name: "Contemporary Silk",
    slug: "contemporary-silk",
    type: "main",
    prefix: "CS",
    subcategories: [
      { id: "cat-modern-paithani", name: "Modern Paithani", slug: "modern-paithani" },
      { id: "cat-fusion-silk", name: "Fusion Silk", slug: "fusion-silk" },
      { id: "cat-digital-print-silk", name: "Digital Print Silk", slug: "digital-print-silk" },
      { id: "cat-art-silk", name: "Art Silk", slug: "art-silk" },
    ],
  },
  {
    id: "cat-wedding-paithani-main",
    name: "Wedding Paithani",
    slug: "wedding-paithani",
    type: "main",
    prefix: "WP",
    subcategories: [
      { id: "cat-traditional-yeola", name: "Traditional Yeola", slug: "traditional-yeola" },
      { id: "cat-pure-silk-handloom", name: "Pure Silk Handloom", slug: "pure-silk-handloom" },
      { id: "cat-royal-zari-border", name: "Royal Zari Border", slug: "royal-zari-border" },
      { id: "cat-bridal-wedding-paithani", name: "Bridal Wedding Paithani", slug: "bridal-wedding-paithani" },
    ],
  },
  {
    id: "cat-western-paithani-main",
    name: "Western Paithani",
    slug: "western-paithani",
    type: "main",
    prefix: "WW",
    subcategories: [
      { id: "cat-indo-western-fusion", name: "Indo-Western Fusion", slug: "indo-western-fusion" },
      { id: "cat-contemporary-drape", name: "Contemporary Drape", slug: "contemporary-drape" },
      { id: "cat-cocktail-paithani", name: "Cocktail Paithani", slug: "cocktail-paithani" },
      { id: "cat-party-wear-western", name: "Party Wear", slug: "party-wear" },
    ],
  },
];

export const ALLOWED_CATEGORY_NAMES = CATALOG_CATEGORIES.map((c) => c.name);
export const ALLOWED_CATEGORY_SLUGS = CATALOG_CATEGORIES.map((c) => c.slug);

export function normalizeCategoryString(str: string): string {
  return String(str || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Finds a catalog category definition by either name, slug, or ID.
 */
export function findCategoryDefinition(input?: string | null): CatalogCategory | null {
  if (!input) return null;
  const raw = String(input).trim();
  const slug = normalizeCategoryString(raw);

  for (const cat of CATALOG_CATEGORIES) {
    if (
      cat.id.toLowerCase() === raw.toLowerCase() ||
      cat.slug === slug ||
      cat.name.toLowerCase() === raw.toLowerCase()
    ) {
      return cat;
    }
  }

  // Handle aliases like "Designer Saree", "Designer Sarees", "Paithani Sarees", "Paithani Saree"
  if (slug === "designer-saree" || slug === "designer-sarees") {
    return CATALOG_CATEGORIES.find((c) => c.slug === "designer") || null;
  }
  if (slug === "paithani-saree" || slug === "paithani-sarees") {
    return CATALOG_CATEGORIES.find((c) => c.slug === "paithani") || null;
  }

  return null;
}

/**
 * Gets the valid subcategories for a given category.
 */
export function getValidSubcategoriesForCategory(catInput?: string | null): CatalogSubcategory[] {
  const cat = findCategoryDefinition(catInput);
  return cat ? cat.subcategories : [];
}

export const SUBCATEGORY_LEGACY_ALIASES: Record<string, Record<string, string>> = {
  paithani: {
    bridal: "bridal-paithani",
    "bridal-paithani": "bridal-paithani",
    festival: "festival-paithani",
    festive: "festival-paithani",
    "festival-paithani": "festival-paithani",
    wedding: "wedding-paithani",
    "wedding-paithani": "wedding-paithani",
    contemporary: "contemporary-silk",
    "contemporary-silk": "contemporary-silk",
    "contemporary-silk-paithani": "contemporary-silk",
    yeola: "wedding-paithani",
    "traditional-yeola": "wedding-paithani",
  },
  designer: {
    bollywood: "bollywood",
    bridal: "bridal",
    contemporary: "contemporary-silk",
    "contemporary-silk": "contemporary-silk",
    wedding: "wedding-designer-sarees",
    "wedding-designer": "wedding-designer-sarees",
  },
  bollywood: {
    "party-wear": "bollywood-party-wear",
    party: "bollywood-party-wear",
    celebrity: "celebrity-designer",
    bridal: "bollywood-bridal",
    contemporary: "contemporary-silk",
    "contemporary-silk": "contemporary-silk",
  },
  bridal: {
    paithani: "bridal-paithani",
    designer: "bridal-designer",
    wedding: "wedding-silk",
    trousseau: "royal-trousseau",
  },
  "contemporary-silk": {
    modern: "modern-paithani",
    fusion: "fusion-silk",
    digital: "digital-print-silk",
    art: "art-silk",
  },
  "wedding-paithani": {
    yeola: "traditional-yeola",
    handloom: "pure-silk-handloom",
    "pure-silk": "pure-silk-handloom",
    zari: "royal-zari-border",
    bridal: "bridal-wedding-paithani",
  },
  "western-paithani": {
    fusion: "indo-western-fusion",
    drape: "contemporary-drape",
    cocktail: "cocktail-paithani",
    party: "party-wear",
  },
};

/**
 * Finds a valid subcategory definition under a given parent category.
 */
export function findSubcategoryDefinition(
  catInput?: string | null,
  subcatInput?: string | null
): CatalogSubcategory | null {
  if (!catInput || !subcatInput) return null;
  const cat = findCategoryDefinition(catInput);
  if (!cat) return null;

  const rawSub = String(subcatInput).trim();
  const subSlug = normalizeCategoryString(rawSub);

  // 1. Direct match by id, slug, or name
  for (const sub of cat.subcategories) {
    if (
      sub.id.toLowerCase() === rawSub.toLowerCase() ||
      sub.slug === subSlug ||
      sub.name.toLowerCase() === rawSub.toLowerCase() ||
      normalizeCategoryString(sub.name) === subSlug
    ) {
      return sub;
    }
  }

  // 2. Safe alias mapping for unambiguous legacy values (e.g. "bridal" -> "Bridal Paithani" for Paithani)
  const aliasSlug = SUBCATEGORY_LEGACY_ALIASES[cat.slug]?.[subSlug];
  if (aliasSlug) {
    const aliasSub = cat.subcategories.find((s) => s.slug === aliasSlug);
    if (aliasSub) return aliasSub;
  }

  return null;
}

/**
 * Resolves the canonical human-readable name of a subcategory if valid for the category.
 */
export function resolveCanonicalSubcategoryName(
  catInput?: string | null,
  subcatInput?: string | null
): string {
  if (!subcatInput || !String(subcatInput).trim()) return "";
  const sub = findSubcategoryDefinition(catInput, subcatInput);
  return sub ? sub.name : "";
}

/**
 * Checks if a subcategory is valid for a given category.
 */
export function isValidSubcategoryForCategory(
  catInput?: string | null,
  subcatInput?: string | null
): boolean {
  if (!subcatInput || !String(subcatInput).trim()) return true;
  return Boolean(findSubcategoryDefinition(catInput, subcatInput));
}
export function validateCategoryAndSubcategory(
  catInput?: string | null,
  subcatInput?: string | null
): {
  valid: boolean;
  error?: string;
  categoryDef?: CatalogCategory;
  subcategoryDef?: CatalogSubcategory | null;
} {
  const cat = findCategoryDefinition(catInput);
  if (!cat) {
    return {
      valid: false,
      error: `Invalid category: "${catInput}". Available categories are: ${ALLOWED_CATEGORY_NAMES.join(", ")}.`,
    };
  }

  if (!subcatInput || !String(subcatInput).trim()) {
    return { valid: true, categoryDef: cat, subcategoryDef: null };
  }

  const sub = findSubcategoryDefinition(cat.slug, subcatInput);
  if (!sub) {
    const validNames = cat.subcategories.map((s) => s.name).join(", ");
    return {
      valid: false,
      error: `Invalid subcategory "${subcatInput}" for category "${cat.name}". Valid subcategories are: ${validNames}.`,
    };
  }

  return { valid: true, categoryDef: cat, subcategoryDef: sub };
}

/**
 * Resolves authoritative category and subcategory persistence data.
 */
export function resolveCategoryData(
  catInput?: string | null,
  subcatInput?: string | null
): {
  categoryId: string;
  categoryName: string;
  category: string;
  parentCategoryId: string;
  parentCategoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  subcategory: string | null;
} {
  const cat = findCategoryDefinition(catInput) || CATALOG_CATEGORIES[0];
  const sub = findSubcategoryDefinition(cat.slug, subcatInput);

  return {
    categoryId: cat.id,
    categoryName: cat.name,
    category: cat.slug,
    parentCategoryId: cat.id,
    parentCategoryName: cat.name,
    subcategoryId: sub ? sub.id : null,
    subcategoryName: sub ? sub.name : (subcatInput ? String(subcatInput).trim() : null),
    subcategory: sub ? sub.name : (subcatInput ? String(subcatInput).trim() : null),
  };
}
