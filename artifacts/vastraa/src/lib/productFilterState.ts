export interface ProductFilters {
  collection?: string;
  subcategory?: string;
  fabric: string[];
  color: string[];
  brand: string[];
  pattern: string[];
  occasion: string[];
  gender: string[];
  sareeType: string[];
  sareeStyle: string[];
  packOf: string[];
  countryOfOrigin: string[];
  vendorId?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  minDiscount?: number;
  newArrival: boolean;
  hasOffer: boolean;
  blouseIncluded?: boolean;
  availability?: string;
  hasDiscount: boolean;
}

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  collection: undefined,
  subcategory: undefined,
  fabric: [],
  color: [],
  brand: [],
  pattern: [],
  occasion: [],
  gender: [],
  sareeType: [],
  sareeStyle: [],
  packOf: [],
  countryOfOrigin: [],
  vendorId: undefined,
  minPrice: undefined,
  maxPrice: undefined,
  minRating: undefined,
  minDiscount: undefined,
  newArrival: false,
  hasOffer: false,
  blouseIncluded: undefined,
  availability: undefined,
  hasDiscount: false,
};

export function parseArrayParam(param: string | null): string[] {
  if (!param) return [];
  return param.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}

export function parseFiltersFromParams(params: URLSearchParams): ProductFilters {
  const rawMin = params.get("minPrice");
  const minPrice = rawMin !== null && rawMin !== "" && !isNaN(Number(rawMin)) ? Number(rawMin) : undefined;

  const rawMax = params.get("maxPrice");
  const maxPrice = rawMax !== null && rawMax !== "" && !isNaN(Number(rawMax)) ? Number(rawMax) : undefined;

  const rawRating = params.get("minRating");
  const minRating = rawRating ? Number(rawRating) : undefined;

  const rawDiscount = params.get("minDiscount");
  const minDiscount = rawDiscount ? Number(rawDiscount) : undefined;

  const rawBlouse = params.get("blouseIncluded");
  const blouseIncluded = rawBlouse === "true" ? true : rawBlouse === "false" ? false : undefined;

  return {
    collection: params.get("collection") || undefined,
    subcategory: params.get("subcategory") || undefined,
    fabric: parseArrayParam(params.get("fabric")),
    color: parseArrayParam(params.get("color")),
    brand: parseArrayParam(params.get("brand")),
    pattern: parseArrayParam(params.get("pattern")),
    occasion: parseArrayParam(params.get("occasion")),
    gender: parseArrayParam(params.get("gender")),
    sareeType: parseArrayParam(params.get("sareeType")),
    sareeStyle: parseArrayParam(params.get("sareeStyle")),
    packOf: parseArrayParam(params.get("packOf")),
    countryOfOrigin: parseArrayParam(params.get("countryOfOrigin")),
    vendorId: params.get("vendor") || undefined,
    minPrice,
    maxPrice,
    minRating,
    minDiscount,
    newArrival: params.get("newArrival") === "true",
    hasOffer: params.get("offers") === "true" || params.get("hasOffer") === "true",
    blouseIncluded,
    availability: params.get("availability") || undefined,
    hasDiscount: params.get("discount") === "1",
  };
}

export function countFilterItems(f: ProductFilters): number {
  return [
    f.collection,
    f.subcategory,
    f.fabric.length > 0,
    f.color.length > 0,
    f.brand.length > 0,
    f.pattern.length > 0,
    f.occasion.length > 0,
    f.gender.length > 0,
    f.sareeType.length > 0,
    f.sareeStyle.length > 0,
    f.packOf.length > 0,
    f.countryOfOrigin.length > 0,
    f.vendorId,
    (f.minPrice !== undefined || f.maxPrice !== undefined),
    f.minRating !== undefined,
    f.minDiscount !== undefined,
    f.newArrival,
    f.hasOffer,
    f.blouseIncluded !== undefined,
    f.availability,
    f.hasDiscount,
  ].filter(Boolean).length;
}

export function validateFilterValues(filters: ProductFilters): { valid: boolean; error: string | null } {
  if (
    filters.minPrice !== undefined &&
    filters.maxPrice !== undefined &&
    filters.minPrice > filters.maxPrice
  ) {
    return { valid: false, error: "Min price cannot be greater than max price." };
  }
  if (
    (filters.minPrice !== undefined && filters.minPrice < 0) ||
    (filters.maxPrice !== undefined && filters.maxPrice < 0)
  ) {
    return { valid: false, error: "Price values cannot be negative." };
  }
  return { valid: true, error: null };
}
