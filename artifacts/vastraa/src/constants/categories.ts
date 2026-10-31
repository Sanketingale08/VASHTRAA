/**
 * Authoritative Catalog Categories and Subcategory Mapping for VASTRAA Frontend
 *
 * Requirements:
 * - Single, clear category dropdown containing ONLY the 7 allowed catalog categories.
 * - Dynamic subcategory mapping determined strictly by parent category.
 * - Reset selected subcategory when changing parent category if invalid.
 */

export interface CatalogSubcategoryItem {
  id: string;
  name: string;
  slug: string;
}

export interface CatalogCategoryItem {
  id: string;
  name: string;
  slug: string;
  subcategories: CatalogSubcategoryItem[];
}

export const CATALOG_CATEGORIES: CatalogCategoryItem[] = [
  {
    id: "cat-paithani-default",
    name: "Paithani",
    slug: "paithani",
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
    subcategories: [
      { id: "cat-indo-western-fusion", name: "Indo-Western Fusion", slug: "indo-western-fusion" },
      { id: "cat-contemporary-drape", name: "Contemporary Drape", slug: "contemporary-drape" },
      { id: "cat-cocktail-paithani", name: "Cocktail Paithani", slug: "cocktail-paithani" },
      { id: "cat-party-wear-western", name: "Party Wear", slug: "party-wear" },
    ],
  },
];

export const CATEGORY_DROPDOWN_OPTIONS = CATALOG_CATEGORIES.map((c) => ({
  value: c.slug,
  label: c.name,
  id: c.id,
}));

export function normalizeCategoryKey(key?: string | null): string {
  return String(key || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function findCategoryBySlugOrName(val?: string | null): CatalogCategoryItem | null {
  if (!val) return null;
  const norm = normalizeCategoryKey(val);
  for (const cat of CATALOG_CATEGORIES) {
    if (cat.slug === norm || normalizeCategoryKey(cat.name) === norm || cat.id === val) {
      return cat;
    }
  }
  // Common aliases
  if (norm === "paithani-saree" || norm === "paithani-sarees") return CATALOG_CATEGORIES[0];
  if (norm === "designer-saree" || norm === "designer-sarees") return CATALOG_CATEGORIES[1];
  return null;
}

export function getSubcategoriesForCategory(catVal?: string | null): CatalogSubcategoryItem[] {
  const cat = findCategoryBySlugOrName(catVal);
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

export function findSubcategoryDefinition(
  catVal?: string | null,
  subcatVal?: string | null
): CatalogSubcategoryItem | null {
  if (!catVal || !subcatVal) return null;
  const cat = findCategoryBySlugOrName(catVal);
  if (!cat) return null;

  const rawSub = String(subcatVal).trim();
  const subSlug = normalizeCategoryKey(rawSub);

  // 1. Direct match by id, slug, or name
  for (const sub of cat.subcategories) {
    if (
      sub.id.toLowerCase() === rawSub.toLowerCase() ||
      sub.slug === subSlug ||
      sub.name.toLowerCase() === rawSub.toLowerCase() ||
      normalizeCategoryKey(sub.name) === subSlug
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

export function resolveCanonicalSubcategoryName(
  catVal?: string | null,
  subcatVal?: string | null
): string {
  if (!subcatVal || !String(subcatVal).trim()) return "";
  const sub = findSubcategoryDefinition(catVal, subcatVal);
  return sub ? sub.name : "";
}

export function isValidSubcategoryForCategory(catVal?: string | null, subcatVal?: string | null): boolean {
  if (!subcatVal || !String(subcatVal).trim()) return true;
  return Boolean(findSubcategoryDefinition(catVal, subcatVal));
}

/**
 * Robust classifier for Paithani sarees across all category variants, subcategories,
 * saree types, fabric, and title/keywords.
 */
export function isPaithaniProduct(p: any): boolean {
  if (!p) return false;
  const cat = String(p.category || "").toLowerCase().trim();
  const catSlug = cat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const catId = String(p.categoryId || "").toLowerCase().trim();
  const parentId = String(p.parentCategoryId || "").toLowerCase().trim();
  const subcat = String(p.subcategory || "").toLowerCase().trim();
  const subcatSlug = subcat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const childCat = String(p.childCategory || "").toLowerCase().trim();
  const childCatSlug = childCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const sareeType = String(p.sareeType || "").toLowerCase().trim();
  const name = String(p.name || "").toLowerCase().trim();

  const hasPaithaniKeyword =
    cat.includes("paithani") || catSlug.includes("paithani") || catId.includes("paithani") || parentId.includes("paithani") ||
    subcat.includes("paithani") || subcatSlug.includes("paithani") ||
    childCat.includes("paithani") || childCatSlug.includes("paithani") ||
    sareeType.includes("paithani") || name.includes("paithani") ||
    name.includes("yeola") || cat.includes("yeola") || catSlug.includes("yeola") || subcat.includes("yeola") ||
    cat === "cat-wedding-paithani-main" || cat === "wedding-paithani" ||
    cat === "cat-western-paithani-main" || cat === "western-paithani" ||
    cat === "cat-paithani-default" ||
    subcat.includes("traditional-yeola") || subcat.includes("pure-silk-handloom") ||
    subcat.includes("royal-zari-border") || subcat.includes("bridal-wedding-paithani") ||
    subcat.includes("cocktail-paithani") || subcat.includes("modern-paithani");

  const isExplicitDesigner =
    (cat === "designer" || catSlug === "designer" || catId === "cat-designer-default" ||
     cat === "bollywood" || catSlug === "bollywood" || catId === "cat-bollywood-default") &&
    !hasPaithaniKeyword;

  if (isExplicitDesigner) return false;
  return hasPaithaniKeyword;
}

/**
 * Robust classifier for Designer sarees across all category variants, subcategories,
 * saree types, fabric, and title/keywords.
 */
export function isDesignerProduct(p: any): boolean {
  if (!p) return false;
  const cat = String(p.category || "").toLowerCase().trim();
  const catSlug = cat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const catId = String(p.categoryId || "").toLowerCase().trim();
  const parentId = String(p.parentCategoryId || "").toLowerCase().trim();
  const subcat = String(p.subcategory || "").toLowerCase().trim();
  const subcatSlug = subcat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const childCat = String(p.childCategory || "").toLowerCase().trim();
  const childCatSlug = childCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const sareeType = String(p.sareeType || "").toLowerCase().trim();
  const name = String(p.name || "").toLowerCase().trim();

  const hasDesignerKeyword =
    cat.includes("designer") || catSlug.includes("designer") || catId.includes("designer") || parentId.includes("designer") ||
    cat.includes("bollywood") || catSlug.includes("bollywood") || catId.includes("bollywood") || parentId.includes("bollywood") ||
    cat.includes("contemporary") || catSlug.includes("contemporary") || catId.includes("contemporary") ||
    subcat.includes("designer") || subcatSlug.includes("designer") ||
    subcat.includes("bollywood") || subcatSlug.includes("bollywood") ||
    subcat.includes("contemporary") || subcatSlug.includes("contemporary") ||
    childCat.includes("designer") || childCatSlug.includes("designer") ||
    childCat.includes("bollywood") || childCatSlug.includes("bollywood") ||
    sareeType.includes("designer") || sareeType.includes("bollywood") || sareeType.includes("contemporary") ||
    name.includes("designer") || name.includes("bollywood") || name.includes("contemporary") ||
    name.includes("party wear") || name.includes("cocktail") || name.includes("sequin") || name.includes("couture") ||
    cat === "cat-designer-default" || cat === "cat-bollywood-default" || cat === "cat-contemporary-silk-main" ||
    subcat.includes("party-wear") || subcat.includes("bridal-designer") || subcat.includes("wedding-silk") ||
    subcat.includes("wedding-designer");

  const isExplicitPaithani =
    (cat === "paithani" || catSlug === "paithani" || catId === "cat-paithani-default" ||
     cat === "wedding-paithani" || cat === "cat-wedding-paithani-main" ||
     cat === "western-paithani" || cat === "cat-western-paithani-main" ||
     name.includes("paithani") || name.includes("yeola")) &&
    !hasDesignerKeyword;

  if (isExplicitPaithani) return false;
  return hasDesignerKeyword;
}
