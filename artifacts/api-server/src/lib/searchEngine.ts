import { db, productsTable, eq, mongoProducts, mongoSellers, mongoProductCategories, CATALOG_CATEGORIES, PRESERVED_SAREE_CATEGORIES, findCategoryDefinition, findSubcategoryDefinition } from "@workspace/db";
import type { Product } from "@workspace/db";
import type { Filter } from "mongodb";
import { calculateVastraaFinancials, toPaise, toRupees } from "./pricingEngine";

export const COLOR_MAP: Record<string, string[]> = {
  red: ["red", "maroon", "#c0392b", "#e74c3c", "#800000", "#ff0000", "#d32f2f"],
  maroon: ["maroon", "red", "#0a1f44", "#800000", "#4a0000"],
  blue: ["blue", "navy", "royal blue", "#2980b9", "#1e3799", "#0000ff", "#1976d2", "#0d47a1"],
  green: ["green", "emerald", "mint", "#27ae60", "#2e7d32", "#008000", "#10ac84"],
  yellow: ["yellow", "gold", "mustard", "#f1c40f", "#f39c12", "#ffd700"],
  pink: ["pink", "rose", "magenta", "#e91e8c", "#d81b60", "#ff69b4"],
  purple: ["purple", "violet", "lavender", "#8e44ad", "#6a1b9a", "#800080"],
  cream: ["cream", "beige", "off-white", "#f5e6c8", "#fffdd0", "#faf0e6"],
  gold: ["gold", "yellow", "#c7ccd1", "#ffd700", "#d4af37"],
  black: ["black", "charcoal", "#2c2c2c", "#000000", "#1a1a1a"],
  orange: ["orange", "peach", "#e67e22", "#d35400", "#ff9800"],
  mint: ["mint", "green", "#1abc9c", "#00b894"],
};

export const CATEGORIES = [
  "paithani",
  "designer",
  "gadwal",
  "banarasi",
  "kanjivaram",
  "chanderi",
  "bandhani",
  "mysore-silk",
  "ikat",
  "cotton",
  "silk",
  "other-traditional",
];
export const FABRICS = [
  "silk",
  "cotton",
  "georgette",
  "net",
  "chiffon",
  "tissue",
  "organza",
  "crepe",
  "satin",
  "tussar",
  "muga",
  "khadi",
  "velvet",
];
export const OCCASIONS = [
  "bridal",
  "wedding",
  "festival",
  "festive",
  "casual",
  "party",
  "formal",
  "puja",
];
export const COLORS = [
  "red",
  "maroon",
  "blue",
  "green",
  "yellow",
  "pink",
  "purple",
  "cream",
  "gold",
  "black",
  "orange",
  "mint",
  "wine",
  "peach",
  "silver",
];

/**
 * Helper to build all category/subcategory identifiers for a given category filter query.
 * If a target category matches a parent category, any subcategory belonging to that parent is included.
 */
export async function getMatchingCategoryIdentifiers(targetFilter: string): Promise<Set<string>> {
  const targetLower = targetFilter.toLowerCase().trim();
  const targetSlug = targetLower.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

  const matchingSet = new Set<string>();
  matchingSet.add(targetLower);
  matchingSet.add(targetSlug);

  // Dynamic authoritative catalog resolution for all saree categories
  if (targetSlug === "all-sarees" || targetSlug === "sarees" || targetSlug === "saree") {
    const sareeCat = CATALOG_CATEGORIES.find((c) => c.slug === "sarees");
    const sareeCategories = sareeCat ? [sareeCat, ...PRESERVED_SAREE_CATEGORIES] : PRESERVED_SAREE_CATEGORIES;
    for (const cat of sareeCategories) {
      if (cat.id) matchingSet.add(cat.id.toLowerCase());
      if (cat.slug) matchingSet.add(cat.slug.toLowerCase());
      if (cat.name) matchingSet.add(cat.name.toLowerCase());
      if (cat.slug) matchingSet.add(`${cat.slug}-sarees`);
      for (const sub of (cat.subcategories || [])) {
        if (sub.id) matchingSet.add(sub.id.toLowerCase());
        if (sub.slug) matchingSet.add(sub.slug.toLowerCase());
        if (sub.name) matchingSet.add(sub.name.toLowerCase());
        if (cat.slug && sub.slug) matchingSet.add(`${cat.slug}-${sub.slug}`);
        for (const st of sub.subtypes || []) {
          if (st) matchingSet.add(st.toLowerCase());
        }
      }
    }
  } else {
    const catDef = findCategoryDefinition(targetFilter);
    if (catDef) {
      if (catDef.id) matchingSet.add(catDef.id.toLowerCase());
      if (catDef.slug) matchingSet.add(catDef.slug.toLowerCase());
      if (catDef.name) {
        matchingSet.add(catDef.name.toLowerCase());
      }
      if (catDef.slug) {
        matchingSet.add(`${catDef.slug}-sarees`);
        matchingSet.add(`${catDef.slug} sarees`);
        matchingSet.add(`${catDef.slug}-saree`);
      }
      for (const sub of (catDef.subcategories || [])) {
        if (sub.id) matchingSet.add(sub.id.toLowerCase());
        if (sub.slug) matchingSet.add(sub.slug.toLowerCase());
        if (sub.name) matchingSet.add(sub.name.toLowerCase());
        if (catDef.slug && sub.slug) matchingSet.add(`${catDef.slug}-${sub.slug}`);
        for (const st of sub.subtypes || []) {
          if (st) matchingSet.add(st.toLowerCase());
        }
      }
    }
  }

  // Pre-populate canonical hierarchy identifiers
  if (targetSlug === "sarees" || targetSlug === "saree") {
    [
      "sarees", "saree", "sari", "saris", "cat-sarees-default",
      "paithani", "designer", "gadwal", "banarasi", "kanjivaram",
      "chanderi", "bandhani", "mysore-silk", "ikat", "cotton", "silk", "other-traditional",
      "cat-paithani-default", "cat-designer-default", "cat-gadwal-default", "cat-banarasi-default",
      "cat-kanjivaram-default", "cat-chanderi-default", "cat-bandhani-default", "cat-mysore-silk-default",
      "cat-ikat-default", "cat-cotton-default", "cat-silk-default", "cat-other-traditional-default",
      "bridal", "wedding-paithani-main", "western-paithani-main", "bollywood", "contemporary-silk-main", "party"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "kurtis" || targetSlug === "kurti") {
    [
      "kurtis", "kurti", "kurta", "kurtas", "cat-kurtis-default",
      "straight-kurti", "a-line-kurti", "anarkali-kurti", "angrakha-kurti", "flared-kurti",
      "asymmetrical-kurti", "kaftan-kurti", "short-kurti", "long-kurti", "high-low-kurti",
      "pakistani-style-kurti", "shirt-style-kurti", "front-slit-kurti", "jacket-style-kurti", "cape-style-kurti"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "kurta-sets" || targetSlug === "kurta-set") {
    [
      "kurta-sets", "kurta-set", "kurta sets", "kurti set", "kurti-sets", "cat-kurta-sets-default",
      "kurti-with-palazzo", "kurti-with-straight-pants", "kurti-with-cigarette-pants",
      "kurti-with-sharara", "kurti-with-gharara", "kurti-with-dhoti-pants", "kurti-with-skirt",
      "kurti-with-dupatta", "2-piece-kurta-set", "3-piece-kurta-set"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "ethnic-dresses" || targetSlug === "ethnic-dress") {
    [
      "ethnic-dresses", "ethnic-dress", "ethnic dresses", "cat-ethnic-dresses-default",
      "anarkali-gown", "ethnic-maxi-dress", "ethnic-midi-dress", "ethnic-a-line-dress",
      "indo-western-dress", "floor-length-ethnic-gown", "jacket-style-ethnic-dress",
      "kaftan-dress", "festive-ethnic-dress", "party-wear-ethnic-dress"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "western-dresses" || targetSlug === "western-dress") {
    [
      "western-dresses", "western-dress", "western dresses", "cat-western-dresses-default",
      "a-line-dress", "fit-and-flare-dress", "bodycon-dress", "maxi-dress", "midi-dress",
      "mini-dress", "shirt-dress", "wrap-dress", "skater-dress", "tiered-dress",
      "slip-dress", "co-ord-dress", "denim-dress", "floral-dress", "ruffle-dress", "one-piece-party-dress"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "winter-wear" || targetSlug === "winter" || targetSlug === "winterwear") {
    [
      "winter-wear", "winter", "winterwear", "winter wear", "cat-winter-wear-default",
      "winter-dresses", "sweater-dresses", "woolen-dresses", "winter-ethnic-wear",
      "winter-western-wear", "velvet-dresses", "winter-party-wear", "winter-co-ord-sets",
      "winter-jackets-coats", "winter-casual-wear"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "tops" || targetSlug === "top" || targetSlug === "ladies-tops" || targetSlug === "womens-tops" || targetSlug === "girls-tops" || targetSlug === "ladies-and-girls-tops") {
    [
      "tops", "top", "ladies-tops", "womens-tops", "girls-tops", "ladies and girls tops", "ladies & girls tops", "cat-tops-default",
      // Women's Tops
      "casual-tops", "crop-tops", "peplum-tops", "tunic-tops", "shirt-style-tops", "blouse-tops",
      "tank-tops", "sleeveless-tops", "off-shoulder-tops", "one-shoulder-tops", "halter-neck-tops",
      "cold-shoulder-tops", "wrap-tops", "ruffle-tops", "tie-up-tops", "printed-tops", "embroidered-tops",
      "lace-tops", "party-wear-tops", "formal-tops", "long-tops", "short-tops", "high-low-tops", "basic-solid-tops",
      // Girls' Tops
      "girls-casual-tops", "girls-printed-tops", "girls-graphic-tops", "girls-crop-tops", "girls-ruffle-tops",
      "girls-peplum-tops", "girls-party-wear-tops", "girls-embroidered-tops", "girls-sleeveless-tops",
      "girls-full-sleeve-tops", "girls-off-shoulder-tops", "girls-tunic-tops", "girls-basic-solid-tops",
      // Seasonal Tops
      "winter-tops", "sweatshirt-tops", "sweater-tops", "thermal-tops", "full-sleeve-tops"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "paithani" || targetSlug === "paithani-sarees" || targetSlug.includes("paithani")) {
    [
      "paithani", "paithani-sarees", "paithani sarees", "paithani saree", "paithani-saree",
      "cat-paithani-default", "cat-paithani-sarees",
      "bridal", "cat-bridal-default", "bridal-paithani", "cat-bridal-paithani", "cat-bridal-paithani-sub", "bridal paithani",
      "weddings", "wedding", "wedding-paithani", "cat-wedding-paithani", "cat-wedding-paithani-main", "wedding-paithani-main", "wedding paithani",
      "western", "western-paithani", "cat-western-paithani", "cat-western-paithani-main", "western-paithani-main", "western paithani",
      "festival-paithani", "cat-festival-paithani", "festival paithani",
      "royal-festival", "traditional-yeola", "cat-traditional-yeola", "traditional yeola",
      "pure-silk-handloom", "cat-pure-silk-handloom", "pure silk handloom",
      "royal-zari-border", "cat-royal-zari-border", "royal zari border",
      "bridal-wedding-paithani", "cat-bridal-wedding-paithani",
      "indo-western-fusion", "cat-indo-western-fusion",
      "contemporary-drape", "cat-contemporary-drape",
      "cocktail-paithani", "cat-cocktail-paithani",
      "modern-paithani", "cat-modern-paithani",
      "heritage-weaving", "yeola", "yeola-paithani", "yeola paithani"
    ].forEach(id => matchingSet.add(id));
  } else if (targetSlug === "designer" || targetSlug === "designer-sarees" || targetSlug.includes("designer")) {
    [
      "designer", "designer-sarees", "designer sarees", "designer saree", "designer-saree",
      "cat-designer-default", "cat-designer-sarees",
      "bollywood", "bollywood-sarees", "cat-bollywood-sarees", "cat-bollywood-default", "bollywood sarees", "bollywood saree",
      "contemporary-silk", "contemporary-silk-main", "cat-contemporary-silk", "cat-contemporary-silk-main", "cat-contemporary-silk-bollywood", "contemporary silk", "contemporary saree", "contemporary",
      "party", "party-wear", "cat-party-wear", "cat-party-default", "party wear", "cocktail",
      "bollywood-party-wear", "cat-bollywood-party-wear",
      "celebrity-designer", "cat-celebrity-designer",
      "bollywood-bridal", "cat-bollywood-bridal",
      "designer-bridal", "cat-designer-bridal",
      "wedding-designer-sarees", "cat-wedding-designer-sarees", "wedding designer sarees",
      "bollywood-fashion", "contemporary-fashion", "reception-collections", "wedding-designer",
      "fusion-silk", "cat-fusion-silk",
      "digital-print-silk", "cat-digital-print-silk",
      "art-silk", "cat-art-silk",
      "bridal-designer", "cat-bridal-designer",
      "wedding-silk", "cat-wedding-silk",
      "royal-trousseau", "cat-royal-trousseau"
    ].forEach(id => matchingSet.add(id));
  }

  try {
    const categories = await mongoProductCategories.listActive().catch(() => []);
    
    const directMatches = categories.filter(c => {
      const cSlug = (c.slug || "").toLowerCase().trim();
      const cName = (c.name || "").toLowerCase().trim();
      const cId = (c.id || "").toLowerCase().trim();
      return (
        cId === targetLower ||
        cSlug === targetSlug ||
        cName === targetLower ||
        matchingSet.has(cId) ||
        matchingSet.has(cSlug) ||
        (cSlug && targetSlug && (cSlug.includes(targetSlug) || targetSlug.includes(cSlug))) ||
        (cName && targetLower && (cName.includes(targetLower) || targetLower.includes(cName)))
      );
    });

    for (const match of directMatches) {
      if (match.id) matchingSet.add(String(match.id).toLowerCase().trim());
      if (match.slug) matchingSet.add(match.slug.toLowerCase().trim());
      if (match.name) matchingSet.add(match.name.toLowerCase().trim());
    }

    let addedNew = true;
    while (addedNew) {
      addedNew = false;
      for (const c of categories) {
        if (c.parentId) {
          const parentIdStr = String(c.parentId).toLowerCase().trim();
          const parentSlug = parentIdStr.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
          if (matchingSet.has(parentIdStr) || matchingSet.has(parentSlug)) {
            const childSlug = (c.slug || "").toLowerCase().trim();
            const childName = (c.name || "").toLowerCase().trim();
            const childId = String(c.id || "").toLowerCase().trim();

            if (childId && !matchingSet.has(childId)) { matchingSet.add(childId); addedNew = true; }
            if (childSlug && !matchingSet.has(childSlug)) { matchingSet.add(childSlug); addedNew = true; }
            if (childName && !matchingSet.has(childName)) { matchingSet.add(childName); addedNew = true; }
          }
        }
      }
    }
  } catch {}

  return matchingSet;
}

/**
 * Helper to compute the effective customer-facing selling price.
 * Matches normalizeProduct and customer storefront display.
 */
export function getEffectiveSellingPrice(p: any): number | null {
  if (!p) return null;
  const numPrice = p.price != null && p.price !== "" ? Number(p.price) : NaN;
  if (!isNaN(numPrice) && numPrice > 0) {
    return numPrice;
  }
  const baseNum = p.basePrice != null && p.basePrice !== "" ? Number(p.basePrice) : NaN;
  if (!isNaN(baseNum) && baseNum > 0) {
    const shippingNum = p.shippingFee != null && !isNaN(Number(p.shippingFee)) ? Number(p.shippingFee) : 100;
    const fin = calculateVastraaFinancials({
      basePricePaise: toPaise(baseNum),
      shippingPaise: toPaise(shippingNum),
    });
    const calculated = Math.round(toRupees(fin.customerPays));
    return !isNaN(calculated) && calculated > 0 ? calculated : null;
  }
  return null;
}

/**
 * Identify whether a product belongs to Paithani saree collections
 * based on category hierarchy, subcategory, sareeType, fabric, and title keywords.
 */
export function isProductPaithani(p: any, matchingSet?: Set<string>): boolean {
  if (!p) return false;
  const pCat = String(p.category || "").toLowerCase().trim();
  const pCatSlug = pCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const pCatId = String(p.categoryId || "").toLowerCase().trim();
  const pParentId = String((p as any).parentCategoryId || "").toLowerCase().trim();
  const pSubcat = String(p.subcategory || "").toLowerCase().trim();
  const pSubcatSlug = pSubcat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const pChildCat = String((p as any).childCategory || "").toLowerCase().trim();
  const pChildCatSlug = pChildCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const pSareeType = String((p as any).sareeType || "").toLowerCase().trim();
  const pName = String(p.name || "").toLowerCase().trim();
  const pCollection = String(p.collection || "").toLowerCase().trim();
  const pFabric = String(p.fabric || "").toLowerCase().trim();

  const hasPaithaniKeyword =
    pCatSlug.includes("paithani") || pCat.includes("paithani") ||
    pSubcatSlug.includes("paithani") || pSubcat.includes("paithani") ||
    pChildCatSlug.includes("paithani") || pChildCat.includes("paithani") ||
    pSareeType.includes("paithani") ||
    pName.includes("paithani") ||
    pCatSlug.includes("yeola") || pName.includes("yeola") || pSubcatSlug.includes("yeola") ||
    pCatId.includes("paithani") || pParentId.includes("paithani");

  const isExplicitDesigner =
    (pCat === "designer" || pCatSlug === "designer" || pCatId === "cat-designer-default" || pParentId === "cat-designer-default" ||
     pCat === "bollywood" || pCatSlug === "bollywood" || pCatId === "cat-bollywood-default") &&
    !hasPaithaniKeyword;

  if (isExplicitDesigner) {
    return false;
  }

  if (hasPaithaniKeyword) {
    return true;
  }

  if (matchingSet) {
    if (
      (pCat && matchingSet.has(pCat)) || (pCatSlug && matchingSet.has(pCatSlug)) ||
      (pCatId && matchingSet.has(pCatId)) || (pParentId && matchingSet.has(pParentId)) ||
      (pSubcat && matchingSet.has(pSubcat)) || (pSubcatSlug && matchingSet.has(pSubcatSlug)) ||
      (pChildCat && matchingSet.has(pChildCat)) || (pChildCatSlug && matchingSet.has(pChildCatSlug)) ||
      (pSareeType && matchingSet.has(pSareeType))
    ) {
      return true;
    }
  }

  const paithaniCanonical = [
    "paithani", "paithani-sarees", "paithani sarees", "paithani saree", "paithani-saree",
    "cat-paithani-default", "cat-paithani-sarees",
    "festival-paithani", "cat-festival-paithani", "festival paithani",
    "wedding-paithani", "cat-wedding-paithani", "cat-wedding-paithani-main", "wedding paithani",
    "western-paithani", "cat-western-paithani", "cat-western-paithani-main", "western paithani",
    "royal-festival", "bridal-paithani", "cat-bridal-paithani", "cat-bridal-paithani-sub", "bridal paithani",
    "traditional-yeola", "cat-traditional-yeola", "traditional yeola",
    "pure-silk-handloom", "cat-pure-silk-handloom", "pure silk handloom",
    "royal-zari-border", "cat-royal-zari-border", "royal zari border",
    "bridal-wedding-paithani", "cat-bridal-wedding-paithani",
    "indo-western-fusion", "cat-indo-western-fusion",
    "contemporary-drape", "cat-contemporary-drape",
    "cocktail-paithani", "cat-cocktail-paithani",
    "modern-paithani", "cat-modern-paithani",
    "heritage-weaving", "yeola", "yeola-paithani", "yeola paithani"
  ];

  for (const id of paithaniCanonical) {
    if (
      pCat === id || pCatSlug === id ||
      pCatId === id || pParentId === id ||
      pSubcat === id || pSubcatSlug === id ||
      pChildCat === id || pChildCatSlug === id ||
      pSareeType === id
    ) {
      return true;
    }
  }

  if (pCollection.includes("paithani") || pFabric.includes("paithani")) {
    return true;
  }

  return false;
}

/**
 * Identify whether a product belongs to Designer saree collections
 * based on category hierarchy, subcategory, sareeType, and title keywords.
 */
export function isProductDesigner(p: any, matchingSet?: Set<string>): boolean {
  if (!p) return false;
  const pCat = String(p.category || "").toLowerCase().trim();
  const pCatSlug = pCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const pCatId = String(p.categoryId || "").toLowerCase().trim();
  const pParentId = String((p as any).parentCategoryId || "").toLowerCase().trim();
  const pSubcat = String(p.subcategory || "").toLowerCase().trim();
  const pSubcatSlug = pSubcat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const pChildCat = String((p as any).childCategory || "").toLowerCase().trim();
  const pChildCatSlug = pChildCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const pSareeType = String((p as any).sareeType || "").toLowerCase().trim();
  const pName = String(p.name || "").toLowerCase().trim();
  const pCollection = String(p.collection || "").toLowerCase().trim();

  const hasDesignerKeyword =
    pCatSlug.includes("designer") || pCat.includes("designer") ||
    pCatSlug.includes("bollywood") || pCat.includes("bollywood") ||
    pCatSlug.includes("contemporary") || pCat.includes("contemporary") ||
    pSubcatSlug.includes("designer") || pSubcat.includes("designer") ||
    pSubcatSlug.includes("bollywood") || pSubcat.includes("bollywood") ||
    pSubcatSlug.includes("contemporary") || pSubcat.includes("contemporary") ||
    pChildCatSlug.includes("designer") || pChildCat.includes("designer") ||
    pChildCatSlug.includes("bollywood") || pChildCat.includes("bollywood") ||
    pChildCatSlug.includes("contemporary") || pChildCat.includes("contemporary") ||
    pSareeType.includes("designer") || pSareeType.includes("bollywood") || pSareeType.includes("contemporary") ||
    pName.includes("designer") || pName.includes("bollywood") || pName.includes("contemporary") ||
    pName.includes("party wear") || pName.includes("cocktail") || pName.includes("sequin") || pName.includes("couture") ||
    pCatId.includes("designer") || pParentId.includes("designer") ||
    pCatId.includes("bollywood") || pParentId.includes("bollywood");

  const isExplicitPaithani =
    (pCat === "paithani" || pCatSlug === "paithani" || pCatSlug.includes("paithani") ||
     pCatId === "cat-paithani-default" || pParentId === "cat-paithani-default" ||
     pCatId === "cat-wedding-paithani-main" || pCatId === "cat-western-paithani-main" ||
     pCatSlug.includes("yeola") || pName.includes("paithani") || pName.includes("yeola")) &&
    !hasDesignerKeyword;

  if (isExplicitPaithani) {
    return false;
  }

  if (hasDesignerKeyword) {
    return true;
  }

  if (matchingSet) {
    if (
      (pCat && matchingSet.has(pCat)) || (pCatSlug && matchingSet.has(pCatSlug)) ||
      (pCatId && matchingSet.has(pCatId)) || (pParentId && matchingSet.has(pParentId)) ||
      (pSubcat && matchingSet.has(pSubcat)) || (pSubcatSlug && matchingSet.has(pSubcatSlug)) ||
      (pChildCat && matchingSet.has(pChildCat)) || (pChildCatSlug && matchingSet.has(pChildCatSlug)) ||
      (pSareeType && matchingSet.has(pSareeType))
    ) {
      return true;
    }
  }

  const designerCanonical = [
    "designer", "designer-sarees", "designer sarees", "designer saree", "designer-saree",
    "cat-designer-default", "cat-designer-sarees",
    "bollywood", "bollywood-sarees", "cat-bollywood-sarees", "cat-bollywood-default", "bollywood sarees", "bollywood saree",
    "bollywood-party-wear", "cat-bollywood-party-wear",
    "celebrity-designer", "cat-celebrity-designer",
    "bollywood-bridal", "cat-bollywood-bridal",
    "designer-bridal", "cat-designer-bridal",
    "contemporary-silk", "cat-contemporary-silk", "cat-contemporary-silk-main", "cat-contemporary-silk-bollywood", "contemporary silk", "contemporary saree", "contemporary",
    "wedding-designer-sarees", "cat-wedding-designer-sarees", "wedding designer sarees",
    "bollywood-fashion", "contemporary-fashion", "reception-collections", "wedding-designer",
    "fusion-silk", "cat-fusion-silk",
    "digital-print-silk", "cat-digital-print-silk",
    "art-silk", "cat-art-silk",
    "bridal-designer", "cat-bridal-designer",
    "wedding-silk", "cat-wedding-silk",
    "royal-trousseau", "cat-royal-trousseau",
    "party-wear", "cat-party-wear", "party wear", "party"
  ];

  for (const id of designerCanonical) {
    if (
      pCat === id || pCatSlug === id ||
      pCatId === id || pParentId === id ||
      pSubcat === id || pSubcatSlug === id ||
      pChildCat === id || pChildCatSlug === id ||
      pSareeType === id
    ) {
      return true;
    }
  }

  if (pCollection.includes("designer") || pCollection.includes("bollywood") || pCollection.includes("contemporary")) {
    return true;
  }

  return false;
}

const STOP_WORDS = new Set(["saree", "sarees", "sari", "saris", "collection", "buy", "online", "best", "for", "with", "in", "and", "the", "a", "of"]);

const SYNONYM_MAP: Record<string, string> = {
  wedding: "bridal",
  marriage: "bridal",
  bride: "bridal",
  festive: "festival",
  diwali: "festival",
  pooja: "festival",
  puja: "festival",
};

export interface SearchOptions {
  search?: string;
  category?: string;
  subcategory?: string;
  childCategory?: string;
  collection?: string;
  fabric?: string | string[];
  color?: string | string[];
  brand?: string | string[];
  size?: string | string[];
  sleeveLength?: string | string[];
  neckStyle?: string | string[];
  pattern?: string | string[];
  occasion?: string | string[];
  gender?: string | string[];
  sareeType?: string | string[];
  sareeStyle?: string | string[];
  packOf?: string | string[];
  countryOfOrigin?: string | string[];
  subtype?: string | string[];
  weavingTechnique?: string | string[];
  workType?: string | string[];
  borderType?: string | string[];
  palluDesign?: string | string[];
  sareeLength?: string | string[];
  origin?: string | string[];
  vendorId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minDiscount?: number;
  bestSeller?: boolean;
  newArrival?: boolean;
  isFeatured?: boolean;
  hasDiscount?: boolean;
  hasOffer?: boolean;
  blouseIncluded?: boolean;
  availability?: "in_stock" | "out_of_stock" | string;
  ids?: string[];
  sort?: string;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  products: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SearchSuggestionResult {
  products: Array<{
    id: string;
    name: string;
    price: number;
    originalPrice?: number | null;
    image?: string;
    images: string[];
    category: string;
    color: string;
    vendorName: string;
    rating: number;
  }>;
  categories: Array<{ label: string; category: string }>;
  colors: Array<{ label: string; color: string }>;
  occasions: Array<{ label: string; occasion: string }>;
  totalCount: number;
}

/**
 * Tokenize raw search query string into clean tokens
 */
export function tokenizeQuery(query: string): string[] {
  if (!query || !query.trim()) return [];
  const rawTokens = query.trim().toLowerCase().split(/[\s,._\-\/]+/);
  const cleanTokens: string[] = [];
  for (const token of rawTokens) {
    if (!token) continue;
    if (STOP_WORDS.has(token) && rawTokens.length > 1) continue;
    const mapped = SYNONYM_MAP[token] || token;
    cleanTokens.push(mapped);
  }
  return cleanTokens.length > 0 ? cleanTokens : [query.trim().toLowerCase()];
}

import { getApprovedVendorData, isProductVendorValid, type ApprovedVendorData } from "./vendorValidation";

/**
 * Fetch active/approved seller IDs to ensure inactive/suspended sellers' products are omitted.
 */
export async function getApprovedVendorIds(): Promise<Set<string>> {
  const data = await getApprovedVendorData();
  return data.ids;
}

/**
 * Compute relevance score for a product given search tokens and full query string.
 */
export function computeRelevanceScore(product: Product, tokens: string[], rawQuery: string): number {
  let score = 0;
  const nameLower = (product.name || "").toLowerCase();
  const descLower = (product.description || "").toLowerCase();
  const catLower = (product.category || "").toLowerCase();
  const subcatLower = (product.subcategory || "").toLowerCase();
  const colorLower = (product.color || "").toLowerCase();
  const fabricLower = (product.fabric || "").toLowerCase();
  const occasionLower = (product.occasion || "").toLowerCase();
  const brandLower = (product.brand || "").toLowerCase();
  const patternLower = (product.designPattern || "").toLowerCase();
  const vendorLower = (product.vendorName || "").toLowerCase();

  const fullQueryLower = rawQuery.trim().toLowerCase();

  // 1. Full Query Match on Name
  if (nameLower === fullQueryLower) score += 250;
  else if (nameLower.startsWith(fullQueryLower)) score += 150;
  else if (nameLower.includes(fullQueryLower)) score += 90;

  for (const token of tokens) {
    if (!token) continue;

    // Word boundary or prefix match in Name
    const nameWords = nameLower.split(/\s+/);
    if (nameWords.some(w => w === token)) {
      score += 100;
    } else if (nameWords.some(w => w.startsWith(token))) {
      score += 70;
    } else if (nameLower.includes(token)) {
      score += 40;
    }

    // Category / Subcategory Match
    if (catLower === token || subcatLower === token) {
      score += 80;
    } else if (catLower.startsWith(token) || subcatLower.startsWith(token)) {
      score += 55;
    }

    // Color Match (including hex or color map aliases)
    const aliases = COLOR_MAP[token] || [token];
    if (aliases.some(a => colorLower.includes(a) || a.includes(colorLower))) {
      score += 65;
    } else if (colorLower.startsWith(token)) {
      score += 50;
    }

    // Occasion Match
    if (occasionLower === token || (token === "wedding" && occasionLower === "bridal") || (token === "festive" && occasionLower === "festival")) {
      score += 60;
    } else if (occasionLower.startsWith(token)) {
      score += 40;
    }

    // Fabric Match
    if (fabricLower === token || fabricLower.startsWith(token)) {
      score += 45;
    }

    // Brand / Pattern / Vendor
    if (brandLower.includes(token) || patternLower.includes(token) || vendorLower.includes(token)) {
      score += 30;
    }

    // Description Match
    if (descLower.includes(token)) {
      score += 15;
    }
  }

  // Boost best sellers & highly rated products
  if (product.isBestSeller) score += 10;
  if (product.isNewArrival) score += 5;
  if (typeof product.rating === "number") score += Math.round(product.rating * 2);

  return score;
}

/**
 * Filter product array against single token (checks all searchable fields)
 */
function matchesToken(p: Product, token: string): boolean {
  if (!token) return true;

  const escapedToken = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escapedToken}|\\b${escapedToken}`, "i");

  // Category
  if (regex.test(p.category || "") || regex.test(p.subcategory || "")) return true;

  // Name & Description
  if (regex.test(p.name || "") || regex.test(p.description || "")) return true;

  // Color & Hex
  const colorVal = (p.color || "").toLowerCase();
  if (regex.test(colorVal)) return true;
  const colorAliases = COLOR_MAP[token];
  if (colorAliases && colorAliases.some(a => colorVal.includes(a) || a.includes(colorVal))) return true;

  // Occasion & Fabric
  if (regex.test(p.occasion || "") || regex.test(p.fabric || "")) return true;
  if (token === "wedding" && p.occasion === "bridal") return true;
  if (token === "festive" && p.occasion === "festival") return true;

  // Brand, Design Pattern, Vendor
  if (regex.test(p.brand || "") || regex.test(p.designPattern || "") || regex.test(p.vendorName || "")) return true;

  // Specifications & Variants
  if (Array.isArray(p.specifications)) {
    if (p.specifications.some(s => regex.test(s.key || "") || regex.test(s.value || ""))) return true;
  }
  if (Array.isArray(p.variants)) {
    if (p.variants.some(v => regex.test(v.color || "") || regex.test(v.size || "") || (v.attributes && v.attributes.some(a => regex.test(a.name || "") || regex.test(a.value || ""))))) return true;
  }

  return false;
}

/**
 * Perform intelligent product search across MongoDB products
 */
export async function searchProducts(options: SearchOptions): Promise<SearchResult> {
  const {
    search = "",
    category,
    fabric,
    color,
    occasion,
    vendorId,
    minPrice,
    maxPrice,
    minRating,
    bestSeller,
    newArrival,
    isFeatured,
    hasDiscount,
    ids,
    sort,
    page = 1,
    limit = 24,
  } = options;

  const pageNum = Math.max(1, page);
  const limitNum = Math.min(100, Math.max(1, limit));
  const offset = (pageNum - 1) * limitNum;

  // 1. Fetch approved vendor data to enforce strict Product -> Vendor rule
  const approvedVendorData = await getApprovedVendorData();

  // 2. Fetch products from MongoDB with server-side filter pushdown
  const productMap = new Map<string, Product>();

  // Push common filters directly down to MongoDB Atlas
  const mongoFilter: any = {
    active: { $ne: false },
  };

  if (vendorId) {
    mongoFilter.$or = [
      { vendorId: String(vendorId).trim() },
      { sellerId: String(vendorId).trim() },
    ];
  }

  if (bestSeller) mongoFilter.isBestSeller = true;
  if (newArrival) mongoFilter.isNewArrival = true;
  if (isFeatured) mongoFilter.isFeatured = true;
  if (ids && ids.length > 0) mongoFilter.id = { $in: ids };
  if (minPrice !== undefined || maxPrice !== undefined) {
    mongoFilter.price = {
      ...(minPrice !== undefined ? { $gte: minPrice } : {}),
      ...(maxPrice !== undefined ? { $lte: maxPrice } : {}),
    };
  }

  const projection = {
    id: 1,
    name: 1,
    description: 1,
    price: 1,
    basePrice: 1,
    originalPrice: 1,
    stock: 1,
    images: 1,
    category: 1,
    categoryId: 1,
    categoryName: 1,
    parentCategoryId: 1,
    parentCategoryName: 1,
    subcategory: 1,
    subcategoryId: 1,
    subcategoryName: 1,
    childCategory: 1,
    fabric: 1,
    color: 1,
    occasion: 1,
    brand: 1,
    designPattern: 1,
    vendorId: 1,
    vendorName: 1,
    sellerId: 1,
    rating: 1,
    reviewCount: 1,
    active: 1,
    status: 1,
    isBestSeller: 1,
    isNewArrival: 1,
    isFeatured: 1,
    specifications: 1,
    variants: 1,
    createdAt: 1,
    updatedAt: 1,
  };

  try {
    const mProducts = await mongoProducts.findMany(mongoFilter, { projection }).catch(() => []);
    for (const p of mProducts) {
      if (p.id) productMap.set(p.id, p);
    }
  } catch {}

  // Dual data-source compatibility: merge any products present in relational/fallback store
  try {
    const pgProducts = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.active, true))
      .catch(() => []);
    for (const p of pgProducts) {
      if (p && p.id && !productMap.has(p.id)) {
        productMap.set(p.id, p as any);
      }
    }
  } catch {}

  let allProducts = Array.from(productMap.values());

  // 3. Apply seller approval and product status filters
  allProducts = allProducts.filter(p => {
    // Product status check: strictly approved or active
    if (p.active === false) return false;
    const st = String(p.status || "").toLowerCase().trim();
    if (st !== "approved" && st !== "active") {
      return false;
    }

    // Strict Vendor Validation: Product MUST have a valid, active vendor
    if (!isProductVendorValid(p, approvedVendorData)) {
      return false;
    }
    return true;
  });

  // 4. Apply explicit field & collection filters
  if (category && category !== "all") {
    const filterCat = category.toLowerCase().trim();
    const filterSlug = filterCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    if (filterSlug === "all-sarees" || filterSlug === "sarees" || filterSlug === "saree") {
      // In Vastraa saree portal, all-sarees displays all active saree products across all 12 categories
    } else if (filterSlug === "paithani-sarees" || filterCat === "paithani sarees" || filterSlug === "paithani" || filterSlug === "paithani-saree") {
      const matchingIdentifiers = await getMatchingCategoryIdentifiers("paithani");
      allProducts = allProducts.filter(p => isProductPaithani(p, matchingIdentifiers));
    } else if (filterSlug === "designer-sarees" || filterCat === "designer sarees" || filterSlug === "designer" || filterSlug === "designer-saree") {
      const matchingIdentifiers = await getMatchingCategoryIdentifiers("designer");
      allProducts = allProducts.filter(p => isProductDesigner(p, matchingIdentifiers));
    } else if (filterSlug === "bridal" || filterSlug === "bridal-sarees" || filterCat.includes("bridal") || filterSlug === "wedding") {
      allProducts = allProducts.filter(p => {
        const pCat = (p.category || "").toLowerCase().trim();
        const pSubcat = (p.subcategory || "").toLowerCase().trim();
        const pChildCat = ((p as any).childCategory || "").toLowerCase().trim();
        const pOccasion = (p.occasion || "").toLowerCase().trim();
        return (
          pCat.includes("bridal") || pSubcat.includes("bridal") || pChildCat.includes("bridal") ||
          pOccasion === "bridal" || pOccasion.includes("wedding") || pOccasion.includes("bridal") ||
          (p.collection && p.collection.toLowerCase().includes("bridal"))
        );
      });
    } else if (filterSlug === "party" || filterSlug === "party-wear" || filterCat.includes("party")) {
      allProducts = allProducts.filter(p => {
        const pCat = (p.category || "").toLowerCase().trim();
        const pSubcat = (p.subcategory || "").toLowerCase().trim();
        const pChildCat = ((p as any).childCategory || "").toLowerCase().trim();
        const pOccasion = (p.occasion || "").toLowerCase().trim();
        return (
          pCat.includes("party") || pSubcat.includes("party") || pChildCat.includes("party") ||
          pOccasion === "party" || pOccasion.includes("party") || pOccasion.includes("reception") ||
          (p.collection && p.collection.toLowerCase().includes("party"))
        );
      });
    } else if (filterSlug === "festival" || filterSlug === "festive" || filterCat.includes("festival")) {
      allProducts = allProducts.filter(p => {
        const pCat = (p.category || "").toLowerCase().trim();
        const pSubcat = (p.subcategory || "").toLowerCase().trim();
        const pChildCat = ((p as any).childCategory || "").toLowerCase().trim();
        const pOccasion = (p.occasion || "").toLowerCase().trim();
        return (
          pCat.includes("festival") || pSubcat.includes("festival") || pChildCat.includes("festival") ||
          pOccasion === "festival" || pOccasion === "festive" || pOccasion.includes("festival") ||
          (p.collection && p.collection.toLowerCase().includes("festival"))
        );
      });
    } else {
      const matchingIdentifiers = await getMatchingCategoryIdentifiers(category);
      allProducts = allProducts.filter(p => {
        const pCat = (p.category || "").toLowerCase().trim();
        const pCatSlug = pCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pCatId = String((p as any).categoryId || "").toLowerCase().trim();
        const pCatName = String((p as any).categoryName || "").toLowerCase().trim();
        const pCatNameSlug = pCatName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pParentId = String((p as any).parentCategoryId || "").toLowerCase().trim();
        const pParentName = String((p as any).parentCategoryName || "").toLowerCase().trim();
        const pParentSlug = pParentName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pSubcat = (p.subcategory || "").toLowerCase().trim();
        const pSubcatSlug = pSubcat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pSubId = String((p as any).subcategoryId || "").toLowerCase().trim();
        const pSubName = String((p as any).subcategoryName || "").toLowerCase().trim();
        const pSubNameSlug = pSubName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
        const pChildCat = ((p as any).childCategory || "").toLowerCase().trim();
        const pChildCatSlug = pChildCat.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

        if (
          (pCat && matchingIdentifiers.has(pCat)) ||
          (pCatSlug && matchingIdentifiers.has(pCatSlug)) ||
          (pCatId && matchingIdentifiers.has(pCatId)) ||
          (pCatName && matchingIdentifiers.has(pCatName)) ||
          (pCatNameSlug && matchingIdentifiers.has(pCatNameSlug)) ||
          (pParentId && matchingIdentifiers.has(pParentId)) ||
          (pParentName && matchingIdentifiers.has(pParentName)) ||
          (pParentSlug && matchingIdentifiers.has(pParentSlug)) ||
          (pSubcat && matchingIdentifiers.has(pSubcat)) ||
          (pSubcatSlug && matchingIdentifiers.has(pSubcatSlug)) ||
          (pSubId && matchingIdentifiers.has(pSubId)) ||
          (pSubName && matchingIdentifiers.has(pSubName)) ||
          (pSubNameSlug && matchingIdentifiers.has(pSubNameSlug)) ||
          (pChildCat && matchingIdentifiers.has(pChildCat)) ||
          (pChildCatSlug && matchingIdentifiers.has(pChildCatSlug))
        ) {
          return true;
        }

        if (pCat && (pCat === filterCat || pCatSlug === filterSlug || pCat.includes(filterCat) || filterCat.includes(pCat))) {
          return true;
        }
        if (pSubcat && (pSubcat === filterCat || pSubcatSlug === filterSlug || pSubcat.includes(filterCat) || filterCat.includes(pSubcat))) {
          return true;
        }
        if (pCatName && (pCatName === filterCat || pCatNameSlug === filterSlug || pCatName.includes(filterCat) || filterCat.includes(pCatName))) {
          return true;
        }
        return false;
      });
    }
  }

  // Subcategory Filter
  if (options.subcategory && options.subcategory !== "all") {
    const subFilter = String(options.subcategory).toLowerCase().trim();
    const subSlug = subFilter.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const subAliases: Record<string, string[]> = {
      "bridal": ["bridal", "bridal-paithani", "bridal paithani", "cat-bridal-paithani", "bridal-wedding-paithani", "cat-bridal-default"],
      "bridal-paithani": ["bridal", "bridal-paithani", "bridal paithani", "cat-bridal-paithani", "bridal-wedding-paithani", "cat-bridal-default"],
      "wedding-paithani": ["wedding", "weddings", "wedding-paithani", "wedding paithani", "cat-wedding-paithani", "cat-wedding-paithani-main", "wedding-paithani-main", "traditional-yeola", "yeola"],
      "wedding-paithani-main": ["wedding", "weddings", "wedding-paithani", "wedding paithani", "cat-wedding-paithani", "cat-wedding-paithani-main", "wedding-paithani-main", "traditional-yeola", "yeola"],
      "weddings": ["wedding", "weddings", "wedding-paithani", "wedding paithani", "cat-wedding-paithani", "cat-wedding-paithani-main", "wedding-paithani-main", "traditional-yeola", "yeola"],
      "western": ["western", "western-paithani", "western-paithani-main", "western paithani", "cat-western-paithani", "cat-western-paithani-main", "indo-western-fusion", "cocktail-paithani"],
      "western-paithani": ["western", "western-paithani", "western-paithani-main", "western paithani", "cat-western-paithani", "cat-western-paithani-main", "indo-western-fusion", "cocktail-paithani"],
      "western-paithani-main": ["western", "western-paithani", "western-paithani-main", "western paithani", "cat-western-paithani", "cat-western-paithani-main", "indo-western-fusion", "cocktail-paithani"],
      "festival-paithani": ["festival", "festive", "festival-paithani", "festival paithani", "cat-festival-paithani", "royal-festival"],
      "contemporary-silk": ["contemporary", "contemporary-silk", "contemporary-silk-main", "contemporary silk", "cat-contemporary-silk", "cat-contemporary-silk-main", "modern-paithani", "fusion-silk"],
      "contemporary-silk-main": ["contemporary", "contemporary-silk", "contemporary-silk-main", "contemporary silk", "cat-contemporary-silk", "cat-contemporary-silk-main", "modern-paithani", "fusion-silk"],
      "bollywood": ["bollywood", "bollywood-sarees", "bollywood sarees", "cat-bollywood-sarees", "cat-bollywood-default", "bollywood-party-wear", "celebrity-designer"],
      "party": ["party", "party-wear", "party wear", "cat-party-wear", "cat-party-default", "cocktail-paithani", "cocktail"],
      "party-wear": ["party", "party-wear", "party wear", "cat-party-wear", "cat-party-default", "cocktail-paithani", "cocktail"],
      "wedding-designer-sarees": ["wedding", "wedding-designer-sarees", "wedding designer", "cat-wedding-designer-sarees", "reception-collections"],
      "womens-tops": [
        "womens-tops", "women-tops", "women tops", "women's tops", "womens tops",
        "casual-tops", "crop-tops", "peplum-tops", "tunic-tops", "shirt-style-tops", "blouse-tops",
        "tank-tops", "sleeveless-tops", "off-shoulder-tops", "one-shoulder-tops", "halter-neck-tops",
        "cold-shoulder-tops", "wrap-tops", "ruffle-tops", "tie-up-tops", "printed-tops", "embroidered-tops",
        "lace-tops", "party-wear-tops", "formal-tops", "long-tops", "short-tops", "high-low-tops", "basic-solid-tops"
      ],
      "girls-tops": [
        "girls-tops", "girl-tops", "girls tops", "girls' tops",
        "girls-casual-tops", "girls-printed-tops", "girls-graphic-tops", "girls-crop-tops", "girls-ruffle-tops",
        "girls-peplum-tops", "girls-party-wear-tops", "girls-embroidered-tops", "girls-sleeveless-tops",
        "girls-full-sleeve-tops", "girls-off-shoulder-tops", "girls-tunic-tops", "girls-basic-solid-tops"
      ],
      "seasonal-tops": [
        "seasonal-tops", "seasonal tops",
        "winter-tops", "sweatshirt-tops", "sweater-tops", "thermal-tops", "full-sleeve-tops"
      ],
    };

    const targetAliases = new Set<string>([subFilter, subSlug]);
    for (const [key, aliases] of Object.entries(subAliases)) {
      if (key === subSlug || aliases.includes(subFilter) || aliases.includes(subSlug)) {
        aliases.forEach(a => targetAliases.add(a));
      }
    }

    try {
      const subDef = findSubcategoryDefinition(subSlug) || findSubcategoryDefinition(subFilter);
      if (subDef) {
        if (subDef.id) targetAliases.add(subDef.id.toLowerCase().trim());
        if (subDef.slug) targetAliases.add(subDef.slug.toLowerCase().trim());
        if (subDef.name) targetAliases.add(subDef.name.toLowerCase().trim());
        if (subDef.subtypes) {
          subDef.subtypes.forEach(st => {
            targetAliases.add(st.toLowerCase().trim());
            targetAliases.add(st.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
          });
        }
      }
    } catch {}

    allProducts = allProducts.filter(p => {
      const pSub = String(p.subcategory || "").toLowerCase().trim();
      const pSubSlug = pSub.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const pSubName = String((p as any).subcategoryName || "").toLowerCase().trim();
      const pSubNameSlug = pSubName.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      const pSubId = String((p as any).subcategoryId || "").toLowerCase().trim();
      const pChild = String((p as any).childCategory || "").toLowerCase().trim();
      const pChildSlug = pChild.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

      const productValues = [pSub, pSubSlug, pSubName, pSubNameSlug, pSubId, pChild, pChildSlug].filter(Boolean);

      // Check direct or alias match
      for (const val of productValues) {
        if (targetAliases.has(val)) return true;
      }

      // Check bidirectional containment
      return (
        pSub === subFilter ||
        pSubSlug === subSlug ||
        (pSub && (pSub.includes(subFilter) || subFilter.includes(pSub))) ||
        (pSubSlug && (pSubSlug.includes(subSlug) || subSlug.includes(pSubSlug))) ||
        pSubName === subFilter ||
        pSubNameSlug === subSlug ||
        (pSubName && (pSubName.includes(subFilter) || subFilter.includes(pSubName))) ||
        pSubId === subFilter ||
        pSubId === subSlug ||
        pChild === subFilter ||
        pChildSlug === subSlug
      );
    });
  }


  // Collection Filter
  if (options.collection && options.collection !== "all") {
    const colFilter = String(options.collection).toLowerCase().trim();
    const colSlug = colFilter.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    allProducts = allProducts.filter(p => {
      const pCol = (p.collection || "").toLowerCase().trim();
      const pSubcat = (p.subcategory || "").toLowerCase().trim();
      const pChild = ((p as any).childCategory || "").toLowerCase().trim();
      const pOccasion = (p.occasion || "").toLowerCase().trim();
      const pName = (p.name || "").toLowerCase().trim();

      if (colSlug === "royal-festival" || colFilter.includes("festival")) {
        return pCol === "royal-festival" || pOccasion === "festival" || pSubcat.includes("festival") || pChild.includes("festival") || pName.includes("festival");
      }
      if (colSlug === "bridal-paithani" || colFilter.includes("bridal") || colSlug === "wedding-paithani") {
        return pCol === "bridal-paithani" || pOccasion === "bridal" || pSubcat.includes("bridal") || pSubcat.includes("wedding") || pChild.includes("wedding") || pName.includes("bridal") || pName.includes("wedding");
      }
      if (colSlug === "heritage-weaving" || colFilter.includes("heritage")) {
        return pCol === "heritage-weaving" || pSubcat.includes("heritage") || (p.designPattern && p.designPattern.toLowerCase().includes("zari")) || pName.includes("heritage") || pName.includes("pure");
      }
      if (colSlug === "bollywood-fashion" || colSlug === "bollywood-sarees" || colFilter.includes("bollywood")) {
        return pCol === "bollywood-fashion" || pSubcat.includes("bollywood") || pChild.includes("bollywood") || pName.includes("bollywood");
      }
      if (colSlug === "party-wear" || colFilter.includes("party")) {
        return pCol === "party-wear" || pOccasion === "party" || pSubcat.includes("party") || pName.includes("party");
      }
      if (colSlug === "reception-collections" || colFilter.includes("reception")) {
        return pCol === "reception-collections" || pSubcat.includes("reception") || pOccasion === "party" || pName.includes("reception");
      }
      if (colSlug === "wedding-designer" || colFilter.includes("wedding")) {
        return pCol === "wedding-designer" || pOccasion === "bridal" || pSubcat.includes("wedding") || pName.includes("wedding");
      }
      if (colSlug === "contemporary-fashion" || colSlug === "contemporary-silk" || colFilter.includes("contemporary")) {
        return pCol === "contemporary-fashion" || pSubcat.includes("contemporary") || pChild.includes("contemporary") || pName.includes("contemporary");
      }
      if (colSlug === "best-sellers" || colSlug === "bestseller") {
        return Boolean(p.isBestSeller);
      }
      if (colSlug === "trending") {
        return Boolean(p.isFeatured || p.isBestSeller || (p.viewCount && p.viewCount > 0));
      }
      if (colSlug === "new-arrivals" || colSlug === "newarrival") {
        return Boolean(p.isNewArrival);
      }
      if (colSlug === "recommended") {
        return Boolean(p.rating && p.rating >= 4.0);
      }
      return pCol === colFilter || pCol.includes(colFilter);
    });
  }

  function parseArrayParam(val: any): string[] {
    if (!val) return [];
    if (Array.isArray(val)) return val.map((s) => String(s).toLowerCase().trim()).filter(Boolean);
    if (typeof val === "string") return val.split(",").map((s) => s.toLowerCase().trim()).filter(Boolean);
    return [];
  }

  const selectedFabrics = parseArrayParam(fabric);
  if (selectedFabrics.length > 0) {
    allProducts = allProducts.filter(p => {
      const pFab = (p.fabric || "").toLowerCase().trim();
      return selectedFabrics.some(f => pFab === f || pFab.includes(f) || f.includes(pFab));
    });
  }

  const selectedColors = parseArrayParam(color);
  if (selectedColors.length > 0) {
    allProducts = allProducts.filter(p => {
      const pColor = (p.color || "").toLowerCase().trim();
      return selectedColors.some(c => {
        if (pColor === c || pColor.includes(c) || c.includes(pColor)) return true;
        const aliases = COLOR_MAP[c];
        if (aliases && aliases.some(a => pColor.includes(a) || a.includes(pColor))) return true;
        return false;
      });
    });
  }

  const selectedBrands = parseArrayParam(options.brand);
  if (selectedBrands.length > 0) {
    allProducts = allProducts.filter(p => {
      const pBrand = (p.brand || "").toLowerCase().trim();
      return selectedBrands.some(b => pBrand === b || pBrand.includes(b));
    });
  }

  const selectedPatterns = parseArrayParam(options.pattern);
  if (selectedPatterns.length > 0) {
    allProducts = allProducts.filter(p => {
      const pPattern = (p.designPattern || "").toLowerCase().trim();
      return selectedPatterns.some(pat => pPattern === pat || pPattern.includes(pat));
    });
  }

  const selectedOccasions = parseArrayParam(occasion);
  if (selectedOccasions.length > 0) {
    allProducts = allProducts.filter(p => {
      const pOccasion = (p.occasion || "").toLowerCase().trim();
      return selectedOccasions.some(o => pOccasion === o || (o === "wedding" && pOccasion === "bridal") || (o === "festive" && pOccasion === "festival"));
    });
  }

  const selectedGenders = parseArrayParam(options.gender);
  if (selectedGenders.length > 0) {
    allProducts = allProducts.filter(p => {
      const pGender = ((p as any).gender || "Women").toLowerCase().trim();
      return selectedGenders.some(g => pGender === g || pGender.includes(g));
    });
  }

  const selectedSareeTypes = parseArrayParam(options.sareeType);
  if (selectedSareeTypes.length > 0) {
    allProducts = allProducts.filter(p => {
      const pType = ((p as any).sareeType || p.subcategory || p.category || "").toLowerCase().trim();
      return selectedSareeTypes.some(st => pType === st || pType.includes(st));
    });
  }

  const selectedSareeStyles = parseArrayParam(options.sareeStyle);
  if (selectedSareeStyles.length > 0) {
    allProducts = allProducts.filter(p => {
      const pStyle = ((p as any).sareeStyle || p.designPattern || "").toLowerCase().trim();
      return selectedSareeStyles.some(ss => pStyle === ss || pStyle.includes(ss));
    });
  }

  const selectedPackOf = parseArrayParam(options.packOf);
  if (selectedPackOf.length > 0) {
    allProducts = allProducts.filter(p => {
      const pPack = ((p as any).packOf || "Pack of 1").toLowerCase().trim();
      return selectedPackOf.some(pk => pPack === pk || pPack.includes(pk));
    });
  }

  const selectedOrigins = parseArrayParam(options.countryOfOrigin || (options as any).origin);
  if (selectedOrigins.length > 0) {
    allProducts = allProducts.filter(p => {
      const pOrigin = String((p as any).origin || (p as any).countryOfOrigin || "India").toLowerCase().trim();
      return selectedOrigins.some(ori => pOrigin === ori || pOrigin.includes(ori));
    });
  }

  const selectedSubtypes = parseArrayParam(options.subtype);
  if (selectedSubtypes.length > 0) {
    allProducts = allProducts.filter(p => {
      const pSubtype = String((p as any).subtype || (p as any).childCategory || "").toLowerCase().trim();
      return selectedSubtypes.some(st => pSubtype === st || pSubtype.includes(st) || st.includes(pSubtype));
    });
  }

  const selectedWeaves = parseArrayParam(options.weavingTechnique);
  if (selectedWeaves.length > 0) {
    allProducts = allProducts.filter(p => {
      const pWeave = String((p as any).weavingTechnique || "").toLowerCase().trim();
      return selectedWeaves.some(w => pWeave === w || pWeave.includes(w) || w.includes(pWeave));
    });
  }

  const selectedWorks = parseArrayParam(options.workType);
  if (selectedWorks.length > 0) {
    allProducts = allProducts.filter(p => {
      const pWork = String((p as any).workType || (p as any).designPattern || "").toLowerCase().trim();
      return selectedWorks.some(wt => pWork === wt || pWork.includes(wt) || wt.includes(pWork));
    });
  }

  const selectedBorders = parseArrayParam(options.borderType);
  if (selectedBorders.length > 0) {
    allProducts = allProducts.filter(p => {
      const pBorder = String((p as any).borderType || "").toLowerCase().trim();
      return selectedBorders.some(bt => pBorder === bt || pBorder.includes(bt) || bt.includes(pBorder));
    });
  }

  const selectedPallus = parseArrayParam(options.palluDesign);
  if (selectedPallus.length > 0) {
    allProducts = allProducts.filter(p => {
      const pPallu = String((p as any).palluDesign || "").toLowerCase().trim();
      return selectedPallus.some(pd => pPallu === pd || pPallu.includes(pd) || pd.includes(pPallu));
    });
  }

  const selectedLengths = parseArrayParam(options.sareeLength);
  if (selectedLengths.length > 0) {
    allProducts = allProducts.filter(p => {
      const pLen = String((p as any).sareeLength || "").toLowerCase().trim();
      return selectedLengths.some(sl => pLen === sl || pLen.includes(sl) || sl.includes(pLen));
    });
  }

  // Size Filter (e.g. XS, S, M, L, XL, XXL, 3XL, 2-3Y, 3-4Y...)
  const selectedSizes = parseArrayParam((options as any).size);
  if (selectedSizes.length > 0) {
    allProducts = allProducts.filter(p => {
      const pSizes: string[] = [];
      if (Array.isArray((p as any).sizes)) {
        (p as any).sizes.forEach((s: any) => pSizes.push(String(s).toLowerCase().trim()));
      }
      if ((p as any).size) {
        pSizes.push(String((p as any).size).toLowerCase().trim());
      }
      if (Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (Array.isArray(v.attributes)) {
            for (const a of v.attributes) {
              if (String(a.name || "").toLowerCase().trim() === "size") {
                pSizes.push(String(a.value || "").toLowerCase().trim());
              }
            }
          }
        }
      }
      return selectedSizes.some(sz => pSizes.some(ps => ps === sz || ps.includes(sz) || sz.includes(ps)));
    });
  }

  // Sleeve Length Filter
  const selectedSleeveLengths = parseArrayParam((options as any).sleeveLength || (options as any).sleeve);
  if (selectedSleeveLengths.length > 0) {
    allProducts = allProducts.filter(p => {
      const pSleeve = String((p as any).sleeveLength || (p as any).weavingTechnique || "").toLowerCase().trim();
      let varSleeves: string[] = [];
      if (Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (Array.isArray(v.attributes)) {
            for (const a of v.attributes) {
              if (String(a.name || "").toLowerCase().includes("sleeve")) {
                varSleeves.push(String(a.value || "").toLowerCase().trim());
              }
            }
          }
        }
      }
      return selectedSleeveLengths.some(sl =>
        pSleeve === sl || pSleeve.includes(sl) || sl.includes(pSleeve) ||
        varSleeves.some(vs => vs === sl || vs.includes(sl) || sl.includes(vs))
      );
    });
  }

  // Neck Style Filter
  const selectedNeckStyles = parseArrayParam((options as any).neckStyle || (options as any).neck);
  if (selectedNeckStyles.length > 0) {
    allProducts = allProducts.filter(p => {
      const pNeck = String((p as any).neckStyle || (p as any).neckType || (p as any).borderType || "").toLowerCase().trim();
      let varNecks: string[] = [];
      if (Array.isArray(p.variants)) {
        for (const v of p.variants) {
          if (Array.isArray(v.attributes)) {
            for (const a of v.attributes) {
              if (String(a.name || "").toLowerCase().includes("neck")) {
                varNecks.push(String(a.value || "").toLowerCase().trim());
              }
            }
          }
        }
      }
      return selectedNeckStyles.some(ns =>
        pNeck === ns || pNeck.includes(ns) || ns.includes(pNeck) ||
        varNecks.some(vn => vn === ns || vn.includes(ns) || ns.includes(vn))
      );
    });
  }

  if (vendorId) {
    const targetVendorId = String(vendorId).trim().toLowerCase();
    const vendorMatches = new Set<string>([targetVendorId]);
    try {
      const s = await mongoSellers.findById(vendorId);
      if (s) {
        if (s.id) vendorMatches.add(String(s.id).toLowerCase());
        if (s.vendorId) vendorMatches.add(String(s.vendorId).toLowerCase());
        if (s.sellerId) vendorMatches.add(String(s.sellerId).toLowerCase());
        if ((s as any).ownerId) vendorMatches.add(String((s as any).ownerId).toLowerCase());
      }
    } catch {}

    allProducts = allProducts.filter(p => {
      const pVid = String(p.vendorId || "").trim().toLowerCase();
      const pSid = String((p as any).sellerId || "").trim().toLowerCase();
      return vendorMatches.has(pVid) || vendorMatches.has(pSid);
    });
  }
  if (minPrice !== undefined || maxPrice !== undefined) {
    allProducts = allProducts.filter(p => {
      const price = getEffectiveSellingPrice(p);
      if (price === null) return false;
      if (minPrice !== undefined && price < minPrice) return false;
      if (maxPrice !== undefined && price > maxPrice) return false;
      return true;
    });
  }
  if (minRating !== undefined) allProducts = allProducts.filter(p => typeof p.rating === "number" && p.rating >= minRating);

  if (options.minDiscount !== undefined) {
    const targetDisc = Number(options.minDiscount);
    allProducts = allProducts.filter(p => {
      const price = typeof p.price === "number" ? p.price : Number(p.price);
      const orig = typeof p.originalPrice === "number" ? p.originalPrice : Number(p.originalPrice);
      if (!orig || isNaN(orig) || isNaN(price) || orig <= price) return false;
      const pct = Math.round(((orig - price) / orig) * 100);
      return pct >= targetDisc;
    });
  }

  if (bestSeller) allProducts = allProducts.filter(p => Boolean(p.isBestSeller));
  if (newArrival) allProducts = allProducts.filter(p => Boolean(p.isNewArrival));
  if (isFeatured) allProducts = allProducts.filter(p => Boolean(p.isFeatured));
  if (hasDiscount || options.hasOffer) {
    allProducts = allProducts.filter(p => {
      const price = typeof p.price === "number" ? p.price : Number(p.price);
      const orig = typeof p.originalPrice === "number" ? p.originalPrice : Number(p.originalPrice);
      return orig != null && !isNaN(orig) && !isNaN(price) && orig > price;
    });
  }
  if (options.blouseIncluded !== undefined) {
    allProducts = allProducts.filter(p => Boolean((p as any).blouseIncluded) === Boolean(options.blouseIncluded));
  }
  if (options.availability) {
    const avail = String(options.availability).toLowerCase().trim();
    if (avail === "in_stock" || avail === "instock") {
      allProducts = allProducts.filter(p => p.stock > 0);
    } else if (avail === "out_of_stock" || avail === "outofstock") {
      allProducts = allProducts.filter(p => p.stock <= 0);
    }
  }
  if (ids && ids.length > 0) allProducts = allProducts.filter(p => ids.includes(p.id));

  // 5. Apply Natural Language Search Query Filter & Scoring
  const trimmedSearch = search.trim();
  const tokens = tokenizeQuery(trimmedSearch);

  let scoredProducts: Array<{ product: Product; score: number }> = [];

  if (tokens.length > 0) {
    for (const p of allProducts) {
      // Must match EVERY token (intelligently, e.g. blue AND paithani)
      const matchesAllTokens = tokens.every(token => matchesToken(p, token));
      if (matchesAllTokens) {
        const score = computeRelevanceScore(p, tokens, trimmedSearch);
        scoredProducts.push({ product: p, score });
      }
    }
  } else {
    scoredProducts = allProducts.map(p => ({ product: p, score: 0 }));
  }

  // Helper to ensure 100% stable, deterministic sorting (secondary _id / id tiebreaker)
  const tieBreak = (a: ScoredProduct, b: ScoredProduct): number => {
    const aId = String((a.product as any)._id || a.product.id || "");
    const bId = String((b.product as any)._id || b.product.id || "");
    return bId.localeCompare(aId);
  };

  // 6. Sort by Relevance Score or Sort Option
  if (trimmedSearch && (!sort || sort === "relevance" || sort === "rating_desc")) {
    scoredProducts.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const rateDiff = (b.product.rating ?? 0) - (a.product.rating ?? 0);
      if (rateDiff !== 0) return rateDiff;
      return tieBreak(a, b);
    });
  } else {
    switch (sort) {
      case "price_asc":
        scoredProducts.sort((a, b) => {
          const diff = (getEffectiveSellingPrice(a.product) ?? 0) - (getEffectiveSellingPrice(b.product) ?? 0);
          return diff !== 0 ? diff : tieBreak(a, b);
        });
        break;
      case "price_desc":
        scoredProducts.sort((a, b) => {
          const diff = (getEffectiveSellingPrice(b.product) ?? 0) - (getEffectiveSellingPrice(a.product) ?? 0);
          return diff !== 0 ? diff : tieBreak(a, b);
        });
        break;
      case "rating_desc":
        scoredProducts.sort((a, b) => {
          const diff = (b.product.rating ?? 0) - (a.product.rating ?? 0);
          return diff !== 0 ? diff : tieBreak(a, b);
        });
        break;
      case "newest":
        scoredProducts.sort((a, b) => {
          const aNew = a.product.isNewArrival ? 1 : 0;
          const bNew = b.product.isNewArrival ? 1 : 0;
          if (bNew !== aNew) return bNew - aNew;
          const aTime = a.product.createdAt ? new Date(a.product.createdAt).getTime() : 0;
          const bTime = b.product.createdAt ? new Date(b.product.createdAt).getTime() : 0;
          const timeDiff = bTime - aTime;
          return timeDiff !== 0 ? timeDiff : tieBreak(a, b);
        });
        break;
      default:
        scoredProducts.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          const rateDiff = (b.product.rating ?? 0) - (a.product.rating ?? 0);
          if (rateDiff !== 0) return rateDiff;
          return tieBreak(a, b);
        });
    }
  }

  const finalProducts = scoredProducts.map(sp => sp.product);
  const total = finalProducts.length;
  const paginated = finalProducts.slice(offset, offset + limitNum);

  return {
    products: paginated,
    total,
    page: pageNum,
    limit: limitNum,
    totalPages: Math.ceil(total / limitNum) || 1,
  };
}

/**
 * Generate real-time search suggestions for navbar autocomplete
 */
export async function getSearchSuggestions(query: string, limit: number = 5): Promise<SearchSuggestionResult> {
  const trimmed = (query || "").trim();
  if (!trimmed || trimmed.length < 1) {
    return { products: [], categories: [], colors: [], occasions: [], totalCount: 0 };
  }

  const searchRes = await searchProducts({ search: trimmed, limit: 10 });

  const matchedProducts = searchRes.products.slice(0, limit).map(p => ({
    id: p.id,
    name: p.name,
    price: p.price,
    originalPrice: p.originalPrice,
    image: Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : undefined,
    images: Array.isArray(p.images) ? p.images : [],
    category: p.category,
    color: p.color,
    vendorName: p.vendorName || "Artisan Seller",
    rating: p.rating ?? 4.5,
  }));

  // Match Categories
  const tokens = tokenizeQuery(trimmed);
  const matchedCategories: Array<{ label: string; category: string }> = [];
  const categoryNames: Record<string, string> = {
    paithani: "Paithani Sarees",
    designer: "Designer Sarees",
    bridal: "Bridal Sarees",
    party: "Party Wear Sarees",
  };

  for (const catKey of CATEGORIES) {
    const label = categoryNames[catKey] || `${catKey.toUpperCase()} Sarees`;
    if (tokens.some(t => catKey.startsWith(t) || label.toLowerCase().includes(t))) {
      matchedCategories.push({ label, category: catKey });
    }
  }

  // Match Colors
  const matchedColors: Array<{ label: string; color: string }> = [];
  for (const colorKey of COLORS) {
    const label = colorKey.charAt(0).toUpperCase() + colorKey.slice(1);
    if (tokens.some(t => colorKey.startsWith(t) || label.toLowerCase().startsWith(t))) {
      matchedColors.push({ label, color: colorKey });
    }
  }

  // Match Occasions
  const matchedOccasions: Array<{ label: string; occasion: string }> = [];
  for (const occKey of OCCASIONS) {
    const label = occKey.charAt(0).toUpperCase() + occKey.slice(1);
    if (tokens.some(t => occKey.startsWith(t) || label.toLowerCase().startsWith(t) || (t === "wedding" && occKey === "bridal") || (t === "festive" && occKey === "festival"))) {
      matchedOccasions.push({ label, occasion: occKey });
    }
  }

  return {
    products: matchedProducts,
    categories: matchedCategories,
    colors: matchedColors,
    occasions: matchedOccasions,
    totalCount: searchRes.total,
  };
}

/**
 * Computes dynamic facet counts based on current matching active products
 */
export async function getProductFacets(options: SearchOptions) {
  const searchRes = await searchProducts({ ...options, page: 1, limit: 10000 });
  const products = searchRes.products;

  const fabricsMap: Record<string, number> = {};
  const colorsMap: Record<string, number> = {};
  const brandsMap: Record<string, number> = {};
  const patternsMap: Record<string, number> = {};
  const occasionsMap: Record<string, number> = {};
  const gendersMap: Record<string, number> = {};
  const sareeTypesMap: Record<string, number> = {};
  const sareeStylesMap: Record<string, number> = {};
  const packOfMap: Record<string, number> = {};
  const originsMap: Record<string, number> = {};
  const subcategoriesMap: Record<string, number> = {};
  const sizesMap: Record<string, number> = {};
  const sleeveLengthsMap: Record<string, number> = {};
  const neckStylesMap: Record<string, number> = {};

  let minFoundPrice = Infinity;
  let maxFoundPrice = 0;

  for (const p of products) {
    const subNames = [p.subcategory, (p as any).subcategoryName, (p as any).childCategory].filter(Boolean);
    const countedKeys = new Set<string>();
    for (const sub of subNames) {
      const rawStr = String(sub).trim();
      const subSlug = rawStr.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      
      const keysToCount = [rawStr, rawStr.toLowerCase(), subSlug];
      if (subSlug === "bridal" || subSlug === "bridal-paithani") {
        keysToCount.push("bridal", "Bridal", "bridal-paithani", "Bridal Paithani");
      } else if (subSlug === "wedding" || subSlug === "wedding-paithani") {
        keysToCount.push("wedding", "Wedding", "wedding-paithani", "Wedding Paithani");
      } else if (subSlug === "festival" || subSlug === "festival-paithani") {
        keysToCount.push("festival", "Festival", "festival-paithani", "Festival Paithani");
      } else if (subSlug === "contemporary" || subSlug === "contemporary-silk") {
        keysToCount.push("contemporary", "Contemporary", "contemporary-silk", "Contemporary Silk");
      } else if (subSlug === "bollywood" || subSlug === "bollywood-sarees") {
        keysToCount.push("bollywood", "Bollywood", "bollywood-sarees", "Bollywood Sarees");
      }
      
      for (const k of keysToCount) {
        if (!countedKeys.has(k)) {
          countedKeys.add(k);
          subcategoriesMap[k] = (subcategoriesMap[k] || 0) + 1;
        }
      }
    }
    if (p.fabric) fabricsMap[p.fabric] = (fabricsMap[p.fabric] || 0) + 1;
    if (p.color) colorsMap[p.color] = (colorsMap[p.color] || 0) + 1;
    if (p.brand) brandsMap[p.brand] = (brandsMap[p.brand] || 0) + 1;
    if (p.designPattern) patternsMap[p.designPattern] = (patternsMap[p.designPattern] || 0) + 1;
    if (p.occasion) occasionsMap[p.occasion] = (occasionsMap[p.occasion] || 0) + 1;
    if ((p as any).gender) gendersMap[(p as any).gender] = (gendersMap[(p as any).gender] || 0) + 1;
    if ((p as any).sareeType) sareeTypesMap[(p as any).sareeType] = (sareeTypesMap[(p as any).sareeType] || 0) + 1;
    if ((p as any).sareeStyle) sareeStylesMap[(p as any).sareeStyle] = (sareeStylesMap[(p as any).sareeStyle] || 0) + 1;
    if ((p as any).packOf) packOfMap[(p as any).packOf] = (packOfMap[(p as any).packOf] || 0) + 1;
    if ((p as any).countryOfOrigin) originsMap[(p as any).countryOfOrigin] = (originsMap[(p as any).countryOfOrigin] || 0) + 1;

    // Size facet collection
    if ((p as any).sizes && Array.isArray((p as any).sizes)) {
      for (const sz of (p as any).sizes) sizesMap[String(sz)] = (sizesMap[String(sz)] || 0) + 1;
    } else if ((p as any).size) {
      sizesMap[String((p as any).size)] = (sizesMap[String((p as any).size)] || 0) + 1;
    }
    if (Array.isArray(p.variants)) {
      for (const v of p.variants) {
        if (Array.isArray(v.attributes)) {
          for (const a of v.attributes) {
            const an = String(a.name || "").toLowerCase().trim();
            if (an === "size" && a.value) {
              sizesMap[String(a.value)] = (sizesMap[String(a.value)] || 0) + 1;
            } else if (an.includes("sleeve") && a.value) {
              sleeveLengthsMap[String(a.value)] = (sleeveLengthsMap[String(a.value)] || 0) + 1;
            } else if (an.includes("neck") && a.value) {
              neckStylesMap[String(a.value)] = (neckStylesMap[String(a.value)] || 0) + 1;
            }
          }
        }
      }
    }
    if ((p as any).sleeveLength) sleeveLengthsMap[String((p as any).sleeveLength)] = (sleeveLengthsMap[String((p as any).sleeveLength)] || 0) + 1;
    if ((p as any).neckStyle) neckStylesMap[String((p as any).neckStyle)] = (neckStylesMap[String((p as any).neckStyle)] || 0) + 1;
    if ((p as any).neckType) neckStylesMap[String((p as any).neckType)] = (neckStylesMap[String((p as any).neckType)] || 0) + 1;

    if (p.price < minFoundPrice) minFoundPrice = p.price;
    if (p.price > maxFoundPrice) maxFoundPrice = p.price;
  }

  return {
    subcategory: subcategoriesMap,
    fabric: fabricsMap,
    color: colorsMap,
    brand: brandsMap,
    pattern: patternsMap,
    occasion: occasionsMap,
    gender: gendersMap,
    sareeType: sareeTypesMap,
    sareeStyle: sareeStylesMap,
    packOf: packOfMap,
    countryOfOrigin: originsMap,
    size: sizesMap,
    sleeveLength: sleeveLengthsMap,
    neckStyle: neckStylesMap,
    minPrice: minFoundPrice === Infinity ? 0 : minFoundPrice,
    maxPrice: maxFoundPrice,
    totalCount: products.length,
  };
}
