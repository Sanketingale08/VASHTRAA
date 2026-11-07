/**
 * VASTRAA Category-Specific Product Specifications Engine
 *
 * Defines dynamic, category-dependent specification schemas for all 7 official categories:
 * 1. Sarees (includes conditional unstitched matching blouse piece fields & gallery)
 * 2. Kurtis
 * 3. Kurta Sets
 * 4. Ethnic Dresses
 * 5. Western Dresses
 * 6. Winter Wear
 * 7. Tops
 */

import {
  FABRICS_OPTIONS,
  WEAVING_TECHNIQUES_OPTIONS,
  WORK_TYPES_OPTIONS,
  BORDER_TYPES_OPTIONS,
  PALLU_DESIGNS_OPTIONS,
  OCCASIONS_OPTIONS,
  ORIGINS_OPTIONS,
  SAREE_LENGTHS_OPTIONS,
  COLORS_OPTIONS,
  KURTI_LENGTHS_OPTIONS,
  KURTI_FITS_OPTIONS,
  SLEEVE_LENGTHS_OPTIONS,
  NECK_TYPES_OPTIONS,
  KURTA_SET_PIECES_OPTIONS,
  BOTTOM_TYPES_OPTIONS,
  DUPATTA_TYPES_OPTIONS,
  DRESS_LENGTHS_OPTIONS,
  WESTERN_DRESS_FITS_OPTIONS,
  WINTER_GARMENT_TYPES_OPTIONS,
  WINTER_WARMTH_LEVELS_OPTIONS,
  TOPS_NECK_TYPES,
  TOPS_SLEEVE_LENGTHS,
  TOPS_FITS,
  TOPS_PATTERNS,
} from "./categories";

export interface CategorySpecField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean";
  options?: readonly string[];
  placeholder?: string;
  required?: boolean;
  hint?: string;
  order: number;
}

// ─── CATEGORY SPECIFIC DROPDOWN VALUES ──────────────────────────────────────

// Kurtis
export const KURTI_TYPES_OPTIONS = [
  "Straight Kurti",
  "A-Line Kurti",
  "Anarkali Kurti",
  "Angrakha Kurti",
  "Kaftan Kurti",
  "Short Kurti",
  "Flared Kurti",
  "High-Low Kurti",
  "Shirt Style Kurti",
  "Denim Kurti",
  "Front Slit Kurti",
  "Floor Length Kurti",
] as const;

export const KURTI_PATTERNS_OPTIONS = [
  "Solid / Plain",
  "Floral Print",
  "Geometric Print",
  "Striped",
  "Bandhani / Tie & Dye",
  "Hand Block Print",
  "Chikankari Handwork",
  "Gota Patti Detailing",
  "Embroidered Yoke",
  "Foil Print",
  "Abstract Print",
  "Kalamkari Print",
] as const;

export const CLOSURE_TYPES_OPTIONS = [
  "Slip-On / Pull Over",
  "Front Button Placket",
  "Side Zipper",
  "Back Zipper",
  "Tie-Up Dori / Strings",
  "Hook and Eye",
  "Back Keyhole Button",
  "Wrap with Belt",
] as const;

// Kurta Sets
export const KURTA_SET_BOTTOM_LENGTHS = [
  "Ankle Length (Standard)",
  "Full Length / Floor Touch",
  "Calf Length (Cropped)",
  "Above Ankle",
] as const;

export const KURTA_SET_DUPATTA_INCLUDED_OPTIONS = [
  "Yes (Included in Set)",
  "No (Kurta + Bottom Only)",
] as const;

export const KURTA_SET_DUPATTA_FABRICS = [
  "Chiffon",
  "Organza",
  "Silk Blend",
  "Pure Cotton",
  "Net Embellished",
  "Georgette",
  "Banarasi Zari",
  "Bandhani Tie & Dye",
  "Chanderi Silk",
  "Not Applicable",
] as const;

// Ethnic Dresses
export const ETHNIC_DRESS_TYPES = [
  "Anarkali Gown",
  "Ethnic Maxi Dress",
  "Ethnic Midi Dress",
  "Ethnic A-Line Dress",
  "Indo-Western Fusion Gown",
  "Floor-Length Festive Gown",
  "Jacket-Style Ethnic Dress",
  "Kaftan Dress",
  "Festive Puja Dress",
  "Party-Wear Gown",
] as const;

export const ETHNIC_DRESS_SILHOUETTES = [
  "Fit & Flare",
  "A-Line Flow",
  "Tiered / Flounce Flare",
  "Empire Waist Gown",
  "Straight Column",
  "Cape Silhouette",
  "Pleated Floor Gown",
  "Asymmetrical Hem",
] as const;

export const ETHNIC_DRESS_EMBELLISHMENTS = [
  "Zari & Resham Threadwork",
  "Sequin & Shimmer Work",
  "Mirror Work Handcraft",
  "Gota Patti Work",
  "Beadwork & Pearls",
  "Chikankari Yoke",
  "Lace Trim & Cutwork",
  "Minimal / Plain",
] as const;

// Western Dresses
export const WESTERN_DRESS_TYPES = [
  "Bodycon Dress",
  "A-Line Dress",
  "Skater Dress",
  "Maxi Dress",
  "Midi Dress",
  "Mini Dress",
  "Shift Dress",
  "Wrap Dress",
  "Slip Dress",
  "Shirt Dress",
  "Tiered / Smocked Dress",
] as const;

export const WESTERN_DRESS_SILHOUETTES = [
  "Fitted Bodycon",
  "Fit and Flare",
  "Straight Shift",
  "A-Line",
  "Mermaid / Trumpet",
  "Asymmetrical Hem",
  "Oversized Flow",
  "Wrap Silhouette",
] as const;

export const WESTERN_DRESS_WAISTLINES = [
  "Natural Waist",
  "Empire Waist (Under Bust)",
  "Dropped Waist",
  "Elasticated / Smocked Waist",
  "Belted Waist",
  "No Waist Seam / Shift",
  "Drawstring Waist",
] as const;

// Tops
export const TOP_TYPES_OPTIONS = [
  "Western Top",
  "Crop Top",
  "Peplum Top",
  "Tunic",
  "Shirt Style Top",
  "Wrap Top",
  "Kaftan Top",
  "Tank Top",
  "Corset Style Top",
  "Cold Shoulder Top",
  "Ruffle Top",
  "Party Wear Top",
  "Girls Casual Top",
  "Girls Party Top",
] as const;

export const TOP_LENGTHS_OPTIONS = [
  "Crop (Above Waist)",
  "Waist Length",
  "Hip Length (Regular)",
  "Longline / Tunic Length",
] as const;

export const TOP_EMBELLISHMENTS_OPTIONS = [
  "Minimal / Clean",
  "Thread Embroidery",
  "Lace Inserts",
  "Ruffles & Frills",
  "Smocked Detailing",
  "Sequin / Shimmer",
  "Beadwork",
  "Fringes & Tassels",
  "Pin Tucks",
] as const;

// Matching Saree Blouse Options
export const BLOUSE_FABRICS_OPTIONS = [
  "Pure Silk",
  "Raw Silk",
  "Brocade Silk with Zari",
  "Cotton Silk (Sico)",
  "Pure Cotton",
  "Organza Silk",
  "Velvet",
  "Georgette",
  "Tissue Silk",
  "Art Silk",
] as const;

export const BLOUSE_LENGTHS_OPTIONS = [
  "0.80 Metre (Standard Unstitched)",
  "0.85 Metre (Extended Unstitched)",
  "0.90 Metre",
  "1.00 Metre (Heavy Designer Work)",
  "1.20 Metres (Plus Size & Heavy Embroidery)",
] as const;

export const BLOUSE_DESIGNS_OPTIONS = [
  "Matching Running Blouse Piece",
  "Contrast Pure Silk Piece",
  "Heavy Zari Border for Sleeves & Back",
  "Brocade Jacquard All-Over Weave",
  "Embroidered Yoke & Sleeves Piece",
  "Plain Contrast with Zari Patti",
  "Printed Matching Silk Piece",
] as const;

// ─── MASTER CATEGORY SPECIFICATIONS CONFIGURATION ───────────────────────────

export const CATEGORY_SPECIFICATIONS_REGISTRY: Record<string, CategorySpecField[]> = {
  sarees: [
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 1 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 2 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 3 },
    { key: "weavingTechnique", label: "Weaving Technique", type: "select", options: WEAVING_TECHNIQUES_OPTIONS, order: 4 },
    { key: "workType", label: "Work Type", type: "select", options: WORK_TYPES_OPTIONS, order: 5 },
    { key: "borderType", label: "Border Type", type: "select", options: BORDER_TYPES_OPTIONS, order: 6 },
    { key: "palluDesign", label: "Pallu Design", type: "select", options: PALLU_DESIGNS_OPTIONS, order: 7 },
    { key: "sareeLength", label: "Product Length", type: "select", options: SAREE_LENGTHS_OPTIONS, order: 8 },
    { key: "origin", label: "Origin / Weaving Region", type: "select", options: ORIGINS_OPTIONS, order: 9 },
    { key: "sareeType", label: "Product Type", type: "text", placeholder: "e.g. Pure Silk Paithani / Banarasi Katan", order: 10 },
    { key: "sareeStyle", label: "Product Style", type: "text", placeholder: "e.g. Traditional Royal / Contemporary Drape", order: 11 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Heritage / Your Label", order: 12 },
  ],

  kurtis: [
    { key: "kurtiType", label: "Kurti Type", type: "select", options: KURTI_TYPES_OPTIONS, required: true, order: 1 },
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 2 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 3 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 4 },
    { key: "sleeveLength", label: "Sleeve Length", type: "select", options: SLEEVE_LENGTHS_OPTIONS, order: 5 },
    { key: "neckStyle", label: "Neck Style", type: "select", options: NECK_TYPES_OPTIONS, order: 6 },
    { key: "kurtiLength", label: "Kurti Length", type: "select", options: KURTI_LENGTHS_OPTIONS, order: 7 },
    { key: "fit", label: "Fit", type: "select", options: KURTI_FITS_OPTIONS, order: 8 },
    { key: "pattern", label: "Pattern", type: "select", options: KURTI_PATTERNS_OPTIONS, order: 9 },
    { key: "workType", label: "Work / Embellishment", type: "select", options: WORK_TYPES_OPTIONS, order: 10 },
    { key: "closureType", label: "Closure Type", type: "select", options: CLOSURE_TYPES_OPTIONS, order: 11 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Daily / Your Brand", order: 12 },
  ],

  "kurta-sets": [
    { key: "setType", label: "Set Type", type: "select", options: KURTA_SET_PIECES_OPTIONS, required: true, order: 1 },
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 2 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 3 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 4 },
    { key: "kurtaLength", label: "Kurta Length", type: "select", options: KURTI_LENGTHS_OPTIONS, order: 5 },
    { key: "sleeveLength", label: "Sleeve Length", type: "select", options: SLEEVE_LENGTHS_OPTIONS, order: 6 },
    { key: "neckStyle", label: "Neck Style", type: "select", options: NECK_TYPES_OPTIONS, order: 7 },
    { key: "bottomType", label: "Bottom Type", type: "select", options: BOTTOM_TYPES_OPTIONS, order: 8 },
    { key: "bottomLength", label: "Bottom Length", type: "select", options: KURTA_SET_BOTTOM_LENGTHS, order: 9 },
    { key: "dupattaIncluded", label: "Dupatta Included", type: "select", options: KURTA_SET_DUPATTA_INCLUDED_OPTIONS, order: 10 },
    { key: "dupattaFabric", label: "Dupatta Fabric", type: "select", options: KURTA_SET_DUPATTA_FABRICS, order: 11 },
    { key: "pattern", label: "Pattern", type: "select", options: KURTI_PATTERNS_OPTIONS, order: 12 },
    { key: "workType", label: "Work Type", type: "select", options: WORK_TYPES_OPTIONS, order: 13 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Couture", order: 14 },
  ],

  "ethnic-dresses": [
    { key: "dressType", label: "Dress Type", type: "select", options: ETHNIC_DRESS_TYPES, required: true, order: 1 },
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 2 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 3 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 4 },
    { key: "dressLength", label: "Dress Length", type: "select", options: DRESS_LENGTHS_OPTIONS, order: 5 },
    { key: "sleeveLength", label: "Sleeve Length", type: "select", options: SLEEVE_LENGTHS_OPTIONS, order: 6 },
    { key: "neckStyle", label: "Neck Style", type: "select", options: NECK_TYPES_OPTIONS, order: 7 },
    { key: "silhouette", label: "Silhouette", type: "select", options: ETHNIC_DRESS_SILHOUETTES, order: 8 },
    { key: "pattern", label: "Pattern", type: "select", options: KURTI_PATTERNS_OPTIONS, order: 9 },
    { key: "embellishment", label: "Embellishment", type: "select", options: ETHNIC_DRESS_EMBELLISHMENTS, order: 10 },
    { key: "fit", label: "Fit", type: "select", options: KURTI_FITS_OPTIONS, order: 11 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Glam", order: 12 },
  ],

  "western-dresses": [
    { key: "dressType", label: "Dress Type", type: "select", options: WESTERN_DRESS_TYPES, required: true, order: 1 },
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 2 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 3 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 4 },
    { key: "dressLength", label: "Dress Length", type: "select", options: DRESS_LENGTHS_OPTIONS, order: 5 },
    { key: "sleeveLength", label: "Sleeve Length", type: "select", options: SLEEVE_LENGTHS_OPTIONS, order: 6 },
    { key: "neckline", label: "Neckline", type: "select", options: NECK_TYPES_OPTIONS, order: 7 },
    { key: "fit", label: "Fit", type: "select", options: WESTERN_DRESS_FITS_OPTIONS, order: 8 },
    { key: "silhouette", label: "Silhouette", type: "select", options: WESTERN_DRESS_SILHOUETTES, order: 9 },
    { key: "pattern", label: "Pattern", type: "select", options: TOPS_PATTERNS, order: 10 },
    { key: "waistline", label: "Waistline", type: "select", options: WESTERN_DRESS_WAISTLINES, order: 11 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Studio", order: 12 },
  ],

  "winter-wear": [
    { key: "winterWearType", label: "Winter Wear Type", type: "select", options: WINTER_GARMENT_TYPES_OPTIONS, required: true, order: 1 },
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 2 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 3 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 4 },
    { key: "sleeveLength", label: "Sleeve Length", type: "select", options: SLEEVE_LENGTHS_OPTIONS, order: 5 },
    { key: "neckStyle", label: "Neck Style", type: "select", options: NECK_TYPES_OPTIONS, order: 6 },
    { key: "fit", label: "Fit", type: "select", options: KURTI_FITS_OPTIONS, order: 7 },
    { key: "warmthLevel", label: "Warmth Level", type: "select", options: WINTER_WARMTH_LEVELS_OPTIONS, order: 8 },
    { key: "pattern", label: "Pattern", type: "select", options: TOPS_PATTERNS, order: 9 },
    { key: "winterWearLength", label: "Length", type: "select", options: DRESS_LENGTHS_OPTIONS, order: 10 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Warmth", order: 11 },
  ],

  tops: [
    { key: "topType", label: "Top Type", type: "select", options: TOP_TYPES_OPTIONS, required: true, order: 1 },
    { key: "fabric", label: "Fabric / Material", type: "select", options: FABRICS_OPTIONS, required: true, order: 2 },
    { key: "color", label: "Product Colour", type: "select", options: COLORS_OPTIONS, required: true, order: 3 },
    { key: "occasion", label: "Occasion", type: "select", options: OCCASIONS_OPTIONS, required: true, order: 4 },
    { key: "sleeveType", label: "Sleeve Type", type: "select", options: TOPS_SLEEVE_LENGTHS, order: 5 },
    { key: "neckline", label: "Neckline", type: "select", options: TOPS_NECK_TYPES, order: 6 },
    { key: "topLength", label: "Top Length", type: "select", options: TOP_LENGTHS_OPTIONS, order: 7 },
    { key: "fit", label: "Fit", type: "select", options: TOPS_FITS, order: 8 },
    { key: "pattern", label: "Pattern", type: "select", options: TOPS_PATTERNS, order: 9 },
    { key: "closureType", label: "Closure Type", type: "select", options: CLOSURE_TYPES_OPTIONS, order: 10 },
    { key: "embellishment", label: "Embellishment", type: "select", options: TOP_EMBELLISHMENTS_OPTIONS, order: 11 },
    { key: "brand", label: "Brand", type: "text", placeholder: "e.g. VASTRAA Tops", order: 12 },
  ],
};

// ─── HELPER FUNCTIONS ───────────────────────────────────────────────────────

export function isSareeCategory(categorySlugOrId?: string | null): boolean {
  if (!categorySlugOrId) return true;
  const s = String(categorySlugOrId).toLowerCase().trim();
  return (
    s === "sarees" ||
    s === "saree" ||
    s === "cat-sarees-default" ||
    [
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
    ].includes(s)
  );
}

export function normalizeCategorySlug(rawCategory?: string | null): string {
  if (!rawCategory) return "sarees";
  const s = String(rawCategory).toLowerCase().trim();
  if (isSareeCategory(s)) return "sarees";
  if (s.includes("kurta-set") || s.includes("kurti-set")) return "kurta-sets";
  if (s.includes("kurti") || s.includes("kurta")) return "kurtis";
  if (s.includes("ethnic-dress") || s.includes("ethnic")) return "ethnic-dresses";
  if (s.includes("western-dress") || s.includes("western")) return "western-dresses";
  if (s.includes("winter")) return "winter-wear";
  if (s.includes("top")) return "tops";
  return s;
}

export function getCategorySpecifications(categorySlugOrId?: string | null): CategorySpecField[] {
  const norm = normalizeCategorySlug(categorySlugOrId);
  return CATEGORY_SPECIFICATIONS_REGISTRY[norm] || CATEGORY_SPECIFICATIONS_REGISTRY.sarees;
}

/**
 * Converts dynamic specification form values into a clean key-value array for MongoDB persistence.
 */
export function extractSpecificationsList(
  formValues: Record<string, any>,
  categorySlug: string
): Array<{ key: string; value: string }> {
  const specs: Array<{ key: string; value: string }> = [];
  const fields = getCategorySpecifications(categorySlug);

  for (const field of fields) {
    const val = formValues[field.key];
    if (val !== undefined && val !== null && String(val).trim()) {
      specs.push({
        key: field.label,
        value: String(val).trim(),
      });
    }
  }

  // Also include custom manual specs if any
  if (Array.isArray(formValues.specifications)) {
    for (const item of formValues.specifications) {
      if (item && item.key && String(item.key).trim() && item.value && String(item.value).trim()) {
        const trimmedKey = String(item.key).trim();
        // Avoid duplicate keys
        if (!specs.some((s) => s.key.toLowerCase() === trimmedKey.toLowerCase())) {
          specs.push({
            key: trimmedKey,
            value: String(item.value).trim(),
          });
        }
      }
    }
  }

  return specs;
}

