import React, { useState, useCallback, useDeferredValue, useEffect, useRef } from "react";
import { useSearch, useLocation, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useListProducts, useListVendors } from "@workspace/api-client-react";
import type { ListProductsParams, ListProductsSort } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { ProductGridSkeleton } from "@/components/skeletons";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import {
  Search, X, RotateCcw, Star, Home, ChevronRight, ChevronDown, SlidersHorizontal, Check, AlertCircle
} from "lucide-react";
import { PriceRangeCards } from "@/components/PriceRangeCards";
import { getSubcategoriesForCategory } from "@/constants/categories";

const MotionDiv = motion.div as any;
const MotionAside = motion.aside as any;
const MotionSpan = motion.span as any;

export interface ProductsListingProps {
  heroBanner?: string;
  category?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  badgeLabel?: string;
  headerContent?: React.ReactNode;
  hideHero?: boolean;
  limit?: number;
  topBannerImage?: string;
  inGridBanner?: {
    afterCount?: number;
    image: string;
    alt?: string;
  };
}

import {
  ProductFilters,
  DEFAULT_PRODUCT_FILTERS,
  parseArrayParam,
  parseFiltersFromParams,
  countFilterItems,
  validateFilterValues,
} from "@/lib/productFilterState";

export type { ProductFilters };
export { DEFAULT_PRODUCT_FILTERS, parseArrayParam, parseFiltersFromParams, countFilterItems, validateFilterValues };

const FABRIC_OPTIONS = ["Pure Silk", "Silk", "Paithani Silk", "Art Silk", "Cotton", "Chiffon", "Georgette", "Organza", "Banarasi Silk", "Linen", "Other"];

const COLOR_OPTIONS = [
  { value: "red", label: "Red", hex: "#c0392b" },
  { value: "maroon", label: "Maroon", hex: "#800000" },
  { value: "blue", label: "Blue", hex: "#2980b9" },
  { value: "green", label: "Green", hex: "#27ae60" },
  { value: "pink", label: "Pink", hex: "#e91e8c" },
  { value: "purple", label: "Purple", hex: "#8e44ad" },
  { value: "yellow", label: "Yellow", hex: "#f1c40f" },
  { value: "orange", label: "Orange", hex: "#e67e22" },
  { value: "black", label: "Black", hex: "#2c2c2c" },
  { value: "white", label: "White", hex: "#ffffff" },
  { value: "gold", label: "Gold", hex: "#d4af37" },
  { value: "multicolor", label: "Multicolor", hex: "linear-gradient(135deg, red, yellow, green, blue)" },
];

const PATTERN_OPTIONS = ["Floral", "Traditional", "Geometric", "Checks", "Stripes", "Paisley", "Zari", "Printed", "Embroidered", "Woven", "Other"];
const OCCASION_OPTIONS = ["Wedding", "Bridal", "Festival", "Party", "Reception", "Casual", "Festive", "Traditional", "Office", "Other"];
const GENDER_OPTIONS = ["Women", "Girls", "Unisex", "Other"];
const SAREE_TYPE_OPTIONS = ["Paithani", "Designer Saree", "Wedding Saree", "Party Wear Saree", "Bollywood Saree", "Traditional Saree", "Contemporary Saree", "Silk Saree", "Other"];
const SAREE_STYLE_OPTIONS = ["Traditional", "Contemporary", "Designer", "Bridal", "Party Wear", "Bollywood", "Festive", "Wedding", "Classic", "Modern"];
const PACK_OF_OPTIONS = ["Pack of 1", "Pack of 2", "Pack of 3", "Other"];

const PAITHANI_COLLECTIONS = [
  { slug: "royal-festival", title: "Royal Festival Collections", tag: "Curated for Celebrations" },
  { slug: "bridal-paithani", title: "Bridal Paithani Collections", tag: "The Ultimate Trousseau" },
  { slug: "heritage-weaving", title: "Heritage Weaving Collections", tag: "Passed Down Through Generations" },
];

const DESIGNER_COLLECTIONS = [
  { slug: "bollywood-fashion", title: "Bollywood Fashion Sarees", tag: "Star-Studded Ensembles" },
  { slug: "party-wear", title: "Party Wear Sarees", tag: "Dance the Night Away" },
  { slug: "reception-collections", title: "Reception Collections", tag: "Evening Glamour" },
  { slug: "wedding-designer", title: "Wedding Designer Collections", tag: "For the Modern Bride" },
  { slug: "contemporary-fashion", title: "Contemporary Fashion Sarees", tag: "What's Trending Right Now" },
];

const SORT_OPTIONS: { value: ListProductsSort; label: string }[] = [
  { value: "rating_desc", label: "Top Rated" },
  { value: "newest", label: "New Arrivals" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

const RATING_OPTIONS = [
  { label: "4★ & above", value: 4 },
  { label: "3★ & above", value: 3 },
];

const DISCOUNT_OPTIONS = [
  { label: "10% and above", value: 10 },
  { label: "20% and above", value: 20 },
  { label: "30% and above", value: 30 },
  { label: "40% and above", value: 40 },
  { label: "50% and above", value: 50 },
];

const PRESET_PRICE_RANGES = [
  { label: "Under ₹500", min: 0, max: 500 },
  { label: "Under ₹1,000", min: 0, max: 1000 },
  { label: "Under ₹2,000", min: 0, max: 2000 },
  { label: "₹2,000 – ₹5,000", min: 2000, max: 5000 },
  { label: "Premium (₹5,000+)", min: 5000, max: undefined },
];

function formatPrice(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

function FilterAccordionSection({
  title,
  activeCount = 0,
  defaultOpen = false,
  children,
}: {
  title: string;
  activeCount?: number;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-[#C7CCD1]/20 py-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between text-left font-bold text-xs uppercase tracking-wider text-[#0A1F44] py-1 cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <span>{title}</span>
          {activeCount > 0 && (
            <span className="bg-[#0A1F44] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
              {activeCount}
            </span>
          )}
        </div>
        <ChevronDown size={14} className={cn("text-gray-400 transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="mt-3 space-y-2">{children}</div>}
    </div>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.innerWidth >= 1024;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isDesktop;
}

export function ProductsListing({
  category,
  title,
  subtitle,
  description,
  heroBanner,
  badgeLabel,
  headerContent,
  hideHero = false,
  limit: limitProp,
  topBannerImage,
  inGridBanner,
}: ProductsListingProps) {
  const isDesktop = useIsDesktop();
  const queryClient = useQueryClient();
  const searchStr = useSearch();
  const [pathname, navigate] = useLocation();
  const gridTopRef = useRef<HTMLDivElement>(null);
  const lastWrittenSearchRef = useRef<string | null>(null);

  const initParams = new URLSearchParams(searchStr);

  const [search, setSearch] = useState<string>(() => initParams.get("search") || initParams.get("q") || "");
  const [sort, setSort] = useState<ListProductsSort>(() => {
    const v = initParams.get("sort") as ListProductsSort | null;
    return v && SORT_OPTIONS.some((o) => o.value === v) ? v : "rating_desc";
  });
  const [page, setPage] = useState<number>(() => {
    const v = initParams.get("page");
    return v ? Math.max(1, Number(v)) : 1;
  });
  const [quickChip, setQuickChip] = useState<string>(() => initParams.get("chip") || "all");

  // Independent Filter States (Hidden by default, separate pending vs applied)
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>(() => parseFiltersFromParams(initParams));
  const [pendingFilters, setPendingFilters] = useState<ProductFilters>(() => parseFiltersFromParams(initParams));
  const [isApplyingFilters, setIsApplyingFilters] = useState(false);
  const [filterError, setFilterError] = useState<string | null>(null);

  const deferredSearch = useDeferredValue(search);

  const queryCategory = initParams.get("category");
  // Keep category strictly restricted: prop takes precedence so Paithani/Designer pages never cross
  const enforcedCategory = category || (queryCategory && queryCategory !== "all" ? queryCategory : undefined);
  const filteredCategory = enforcedCategory;

  const toggleArrayItem = (current: string[], item: string) => {
    const norm = item.toLowerCase().trim();
    if (current.includes(norm)) {
      return current.filter((x) => x !== norm);
    } else {
      return [...current, norm];
    }
  };

  const updatePendingFilter = <K extends keyof ProductFilters>(key: K, value: ProductFilters[K]) => {
    setPendingFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Open / Close / Apply / Cancel Handlers
  const handleOpenFilterPanel = useCallback(() => {
    setPendingFilters({ ...appliedFilters });
    setFilterError(null);
    setIsFilterOpen(true);
  }, [appliedFilters]);

  const handleCloseFilterPanel = useCallback(() => {
    // Cancel and discard pending selections, restoring last applied selections
    setPendingFilters({ ...appliedFilters });
    setFilterError(null);
    setIsFilterOpen(false);
  }, [appliedFilters]);

  const handleToggleFilterPanel = useCallback(() => {
    if (isFilterOpen) {
      handleCloseFilterPanel();
    } else {
      handleOpenFilterPanel();
    }
  }, [isFilterOpen, handleCloseFilterPanel, handleOpenFilterPanel]);

  const handleClearAllPending = useCallback(() => {
    setPendingFilters({ ...DEFAULT_PRODUCT_FILTERS });
    setFilterError(null);
  }, []);

  const handleApplyFilters = useCallback(() => {
    if (isApplyingFilters) return;

    // Validation
    const validation = validateFilterValues(pendingFilters);
    if (!validation.valid) {
      setFilterError(validation.error);
      return;
    }

    setIsApplyingFilters(true);
    setFilterError(null);
    setAppliedFilters({ ...pendingFilters });
    setPage(1);
    setIsFilterOpen(false);
    setIsApplyingFilters(false);
  }, [pendingFilters, isApplyingFilters]);

  const removeAppliedFilter = useCallback((updater: (prev: ProductFilters) => ProductFilters) => {
    setAppliedFilters((prev) => {
      const updated = updater(prev);
      setPendingFilters(updated);
      return updated;
    });
    setPage(1);
  }, []);

  const resetAllAppliedFilters = useCallback(() => {
    setAppliedFilters({ ...DEFAULT_PRODUCT_FILTERS });
    setPendingFilters({ ...DEFAULT_PRODUCT_FILTERS });
    setPage(1);
  }, []);

  // Synchronize applied filters to URL only
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (appliedFilters.collection) params.set("collection", appliedFilters.collection);
    if (appliedFilters.subcategory) params.set("subcategory", appliedFilters.subcategory);
    if (appliedFilters.fabric.length > 0) params.set("fabric", appliedFilters.fabric.join(","));
    if (appliedFilters.color.length > 0) params.set("color", appliedFilters.color.join(","));
    if (appliedFilters.brand.length > 0) params.set("brand", appliedFilters.brand.join(","));
    if (appliedFilters.pattern.length > 0) params.set("pattern", appliedFilters.pattern.join(","));
    if (appliedFilters.occasion.length > 0) params.set("occasion", appliedFilters.occasion.join(","));
    if (appliedFilters.gender.length > 0) params.set("gender", appliedFilters.gender.join(","));
    if (appliedFilters.sareeType.length > 0) params.set("sareeType", appliedFilters.sareeType.join(","));
    if (appliedFilters.sareeStyle.length > 0) params.set("sareeStyle", appliedFilters.sareeStyle.join(","));
    if (appliedFilters.packOf.length > 0) params.set("packOf", appliedFilters.packOf.join(","));
    if (appliedFilters.countryOfOrigin.length > 0) params.set("countryOfOrigin", appliedFilters.countryOfOrigin.join(","));
    if (appliedFilters.vendorId) params.set("vendor", appliedFilters.vendorId);
    if (appliedFilters.minPrice !== undefined) params.set("minPrice", String(appliedFilters.minPrice));
    if (appliedFilters.maxPrice !== undefined) params.set("maxPrice", String(appliedFilters.maxPrice));
    if (sort !== "rating_desc") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    if (quickChip !== "all") params.set("chip", quickChip);
    if (appliedFilters.minRating !== undefined) params.set("minRating", String(appliedFilters.minRating));
    if (appliedFilters.minDiscount !== undefined) params.set("minDiscount", String(appliedFilters.minDiscount));
    if (appliedFilters.newArrival) params.set("newArrival", "true");
    if (appliedFilters.hasOffer) params.set("offers", "true");
    if (appliedFilters.blouseIncluded !== undefined) params.set("blouseIncluded", String(appliedFilters.blouseIncluded));
    if (appliedFilters.availability) params.set("availability", appliedFilters.availability);
    if (appliedFilters.hasDiscount) params.set("discount", "1");
    if (filteredCategory) params.set("category", filteredCategory);

    const qs = params.toString();
    lastWrittenSearchRef.current = qs;
    const targetUrl = `${pathname}${qs ? "?" + qs : ""}`;
    const currentFullSearch = window.location.search.startsWith("?") ? window.location.search.slice(1) : window.location.search;
    if (currentFullSearch !== qs) {
      navigate(targetUrl, { replace: true });
    }
  }, [
    pathname, navigate, search, appliedFilters, sort, page,
    quickChip, filteredCategory
  ]);

  // Synchronize URL changes into applied state (without opening the filter panel)
  useEffect(() => {
    if (lastWrittenSearchRef.current !== null && (searchStr === lastWrittenSearchRef.current || `?${searchStr}` === lastWrittenSearchRef.current)) {
      return;
    }

    const currentParams = new URLSearchParams(searchStr);
    const parsed = parseFiltersFromParams(currentParams);
    setAppliedFilters(parsed);
    setPendingFilters(parsed);

    const newSearch = currentParams.get("search") || currentParams.get("q") || "";
    setSearch((prev) => (prev !== newSearch ? newSearch : prev));

    const newSort = currentParams.get("sort") as ListProductsSort | null;
    if (newSort && SORT_OPTIONS.some((o) => o.value === newSort)) {
      setSort(newSort);
    }

    const newPage = currentParams.get("page");
    if (newPage) {
      setPage(Math.max(1, Number(newPage)));
    }
  }, [searchStr]);

  // Query Facets based on APPLIED filters only (prevents API calls on unconfirmed changes)
  const facetQueryKey = [
    "/api/products/facets",
    filteredCategory, appliedFilters.subcategory, deferredSearch, appliedFilters.collection,
    appliedFilters.fabric.join(","), appliedFilters.color.join(","), appliedFilters.brand.join(","),
    appliedFilters.pattern.join(","), appliedFilters.occasion.join(","), appliedFilters.gender.join(","),
    appliedFilters.sareeType.join(","), appliedFilters.sareeStyle.join(","),
    appliedFilters.packOf.join(","), appliedFilters.countryOfOrigin.join(","),
    appliedFilters.vendorId, appliedFilters.minPrice, appliedFilters.maxPrice,
    appliedFilters.minRating, appliedFilters.minDiscount,
    appliedFilters.newArrival, appliedFilters.hasOffer, appliedFilters.blouseIncluded,
    appliedFilters.availability, appliedFilters.hasDiscount
  ];

  const { data: facets } = useQuery({
    queryKey: facetQueryKey,
    queryFn: async () => {
      const qParams = new URLSearchParams();
      if (filteredCategory) qParams.set("category", filteredCategory);
      if (appliedFilters.subcategory) qParams.set("subcategory", appliedFilters.subcategory);
      if (deferredSearch) qParams.set("search", deferredSearch);
      if (appliedFilters.collection) qParams.set("collection", appliedFilters.collection);
      if (appliedFilters.fabric.length > 0) qParams.set("fabric", appliedFilters.fabric.join(","));
      if (appliedFilters.color.length > 0) qParams.set("color", appliedFilters.color.join(","));
      if (appliedFilters.brand.length > 0) qParams.set("brand", appliedFilters.brand.join(","));
      if (appliedFilters.pattern.length > 0) qParams.set("pattern", appliedFilters.pattern.join(","));
      if (appliedFilters.occasion.length > 0) qParams.set("occasion", appliedFilters.occasion.join(","));
      if (appliedFilters.gender.length > 0) qParams.set("gender", appliedFilters.gender.join(","));
      if (appliedFilters.sareeType.length > 0) qParams.set("sareeType", appliedFilters.sareeType.join(","));
      if (appliedFilters.sareeStyle.length > 0) qParams.set("sareeStyle", appliedFilters.sareeStyle.join(","));
      if (appliedFilters.packOf.length > 0) qParams.set("packOf", appliedFilters.packOf.join(","));
      if (appliedFilters.countryOfOrigin.length > 0) qParams.set("countryOfOrigin", appliedFilters.countryOfOrigin.join(","));
      if (appliedFilters.vendorId) qParams.set("vendorId", appliedFilters.vendorId);
      if (appliedFilters.minPrice !== undefined) qParams.set("minPrice", String(appliedFilters.minPrice));
      if (appliedFilters.maxPrice !== undefined) qParams.set("maxPrice", String(appliedFilters.maxPrice));
      if (appliedFilters.minRating !== undefined) qParams.set("minRating", String(appliedFilters.minRating));
      if (appliedFilters.minDiscount !== undefined) qParams.set("minDiscount", String(appliedFilters.minDiscount));
      if (appliedFilters.newArrival) qParams.set("newArrival", "true");
      if (appliedFilters.hasOffer) qParams.set("offers", "true");
      if (appliedFilters.blouseIncluded !== undefined) qParams.set("blouseIncluded", String(appliedFilters.blouseIncluded));
      if (appliedFilters.availability) qParams.set("availability", appliedFilters.availability);
      if (appliedFilters.hasDiscount) qParams.set("hasDiscount", "true");

      const res = await apiFetch(`/api/products/facets?${qParams.toString()}`);
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5000,
  });

  const isDesignerCategory = filteredCategory === "designer" || pathname.startsWith("/designer");
  const resolvedTopBanner = topBannerImage;
  const resolvedInGridBanner = inGridBanner ?? (isDesignerCategory ? {
    afterCount: 20,
    image: "/images/designer-banner.png",
    alt: "Designer Sarees - Modern Styles | Timeless Elegance",
  } : undefined);

  const productParams: ListProductsParams = {
    ...(filteredCategory && { category: filteredCategory as any }),
    ...(appliedFilters.subcategory && { subcategory: appliedFilters.subcategory }),
    sort,
    page,
    limit: limitProp ?? (isDesignerCategory ? 24 : 12),
    ...(deferredSearch && { search: deferredSearch }),
    ...(appliedFilters.collection && { collection: appliedFilters.collection }),
    ...(appliedFilters.fabric.length > 0 && { fabric: appliedFilters.fabric.join(",") }),
    ...(appliedFilters.color.length > 0 && { color: appliedFilters.color.join(",") }),
    ...(appliedFilters.brand.length > 0 && { brand: appliedFilters.brand.join(",") }),
    ...(appliedFilters.pattern.length > 0 && { pattern: appliedFilters.pattern.join(",") }),
    ...(appliedFilters.occasion.length > 0 && { occasion: appliedFilters.occasion.join(",") }),
    ...(appliedFilters.gender.length > 0 && { gender: appliedFilters.gender.join(",") }),
    ...(appliedFilters.sareeType.length > 0 && { sareeType: appliedFilters.sareeType.join(",") }),
    ...(appliedFilters.sareeStyle.length > 0 && { sareeStyle: appliedFilters.sareeStyle.join(",") }),
    ...(appliedFilters.packOf.length > 0 && { packOf: appliedFilters.packOf.join(",") }),
    ...(appliedFilters.countryOfOrigin.length > 0 && { countryOfOrigin: appliedFilters.countryOfOrigin.join(",") }),
    ...(appliedFilters.vendorId && { vendorId: appliedFilters.vendorId }),
    ...(appliedFilters.minPrice !== undefined && { minPrice: appliedFilters.minPrice }),
    ...(appliedFilters.maxPrice !== undefined && { maxPrice: appliedFilters.maxPrice }),
    ...(quickChip === "bestSeller" && { bestSeller: true }),
    ...(quickChip === "newArrival" || appliedFilters.newArrival ? { newArrival: true } : {}),
    ...(quickChip === "onSale" || appliedFilters.hasDiscount ? { hasDiscount: true } : {}),
    ...(appliedFilters.minRating !== undefined && { minRating: appliedFilters.minRating }),
    ...(appliedFilters.minDiscount !== undefined && { minDiscount: appliedFilters.minDiscount }),
    ...(appliedFilters.blouseIncluded !== undefined && { blouseIncluded: String(appliedFilters.blouseIncluded) }),
    ...(appliedFilters.availability && { availability: appliedFilters.availability }),
    ...(appliedFilters.hasOffer && { offers: "true" }),
  };

  const { data, isLoading, isError } = useListProducts(productParams);
  const { data: vendors } = useListVendors();

  // Real-time synchronization: refresh product list and facets whenever products or inventory update
  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      const eventName = detail.name || "";
      if (
        eventName.startsWith("product:") ||
        eventName.startsWith("inventory:") ||
        eventName === "catalog:updated" ||
        eventName === "seller:product:updated" ||
        eventName === "admin:product:updated"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/products"] });
        queryClient.invalidateQueries({ queryKey: ["/api/products/facets"] });
        const productId = detail.data?.productId || detail.data?.id || detail.data?.payload?.id;
        if (productId) {
          queryClient.invalidateQueries({ queryKey: [`/api/products/${productId}`] });
        }
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [queryClient]);

  const lastSuccessfulDataRef = useRef<typeof data | undefined>(undefined);
  if (data && !isError) {
    lastSuccessfulDataRef.current = data;
  }
  const displayedData = isError ? (lastSuccessfulDataRef.current ?? data) : data;

  const appliedFilterCount = countFilterItems(appliedFilters);
  const pendingFilterCount = countFilterItems(pendingFilters);
  const hasAppliedFilters = appliedFilterCount > 0;

  const products = displayedData?.products ?? [];
  const totalProducts = displayedData?.total ?? 0;
  const totalPages = displayedData?.totalPages ?? 1;

  const displayTitle = filteredCategory === "paithani" ? "Paithani Sarees" : filteredCategory === "designer" ? "Designer Sarees" : (title || "Sarees");
  const availableCollections = filteredCategory === "designer" ? DESIGNER_COLLECTIONS : PAITHANI_COLLECTIONS;
  const availableSubcategories = filteredCategory ? getSubcategoriesForCategory(filteredCategory) : [];

  // Filter Panel Inner Content (Accordion sections bound to pendingFilters)
  const filterSidebarSections = (
    <div className="space-y-1 divide-y divide-[#C7CCD1]/10">
      {/* 0. SUBCATEGORY FILTERS */}
      {availableSubcategories.length > 0 && (
        <FilterAccordionSection title="Subcategory" activeCount={pendingFilters.subcategory ? 1 : 0} defaultOpen={true}>
          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {availableSubcategories.map((sc) => {
              const isSelected = pendingFilters.subcategory?.toLowerCase() === sc.slug || pendingFilters.subcategory?.toLowerCase() === sc.name.toLowerCase();
              const count = facets?.subcategory?.[sc.name] ?? facets?.subcategory?.[sc.slug];
              return (
                <label key={sc.id || sc.slug} className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => updatePendingFilter("subcategory", isSelected ? undefined : sc.slug)}
                      className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-xs group-hover:text-[#0A1F44] transition-colors">{sc.name}</span>
                  </div>
                  {count !== undefined && <span className="text-[11px] font-mono text-gray-400">({count})</span>}
                </label>
              );
            })}
          </div>
        </FilterAccordionSection>
      )}

      {/* 1. COLLECTION FILTERS */}
      <FilterAccordionSection title="Collection Filters" activeCount={pendingFilters.collection ? 1 : 0} defaultOpen={true}>
        <div className="space-y-1.5">
          {availableCollections.map((c) => {
            const isSelected = pendingFilters.collection === c.slug;
            return (
              <label key={c.slug} className="flex items-start gap-2.5 cursor-pointer group py-1">
                <input
                  type="radio"
                  name="collectionFilter"
                  checked={isSelected}
                  onChange={() => updatePendingFilter("collection", isSelected ? undefined : c.slug)}
                  className="accent-[#0A1F44] rounded-full w-3.5 h-3.5 mt-0.5 cursor-pointer"
                />
                <div>
                  <span className="text-xs font-semibold text-[#0A1F44] block group-hover:text-[#2C3E6B]">{c.title}</span>
                  <span className="text-[10px] text-gray-400 block">{c.tag}</span>
                </div>
              </label>
            );
          })}
        </div>
      </FilterAccordionSection>

      {/* 2. FABRIC */}
      <FilterAccordionSection title="Fabric" activeCount={pendingFilters.fabric.length} defaultOpen={true}>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {FABRIC_OPTIONS.map((f) => {
            const count = facets?.fabric?.[f] ?? facets?.fabric?.[f.toLowerCase()];
            const isChecked = pendingFilters.fabric.includes(f.toLowerCase());
            return (
              <label key={f} className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => updatePendingFilter("fabric", toggleArrayItem(pendingFilters.fabric, f))}
                    className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs capitalize group-hover:text-[#0A1F44] transition-colors">{f}</span>
                </div>
                {count !== undefined && <span className="text-[11px] font-mono text-gray-400">({count})</span>}
              </label>
            );
          })}
        </div>
      </FilterAccordionSection>

      {/* 3. COLOR */}
      <FilterAccordionSection title="Color" activeCount={pendingFilters.color.length} defaultOpen={true}>
        <div className="flex flex-wrap gap-2 py-1">
          {COLOR_OPTIONS.map((c) => {
            const isSelected = pendingFilters.color.includes(c.value);
            return (
              <button
                key={c.value}
                type="button"
                title={c.label}
                onClick={() => updatePendingFilter("color", toggleArrayItem(pendingFilters.color, c.value))}
                className={cn(
                  "w-7 h-7 rounded-full border-2 transition-all relative flex items-center justify-center shadow-xs cursor-pointer",
                  isSelected
                    ? "border-[#0A1F44] scale-110 ring-2 ring-[#0A1F44]/20"
                    : "border-gray-200 hover:border-[#0A1F44]/50"
                )}
                style={{ background: c.hex }}
              >
                {isSelected && (
                  <Check size={12} className={c.value === "white" || c.value === "yellow" ? "text-black" : "text-white"} />
                )}
              </button>
            );
          })}
        </div>
      </FilterAccordionSection>

      {/* 4. BRAND */}
      <FilterAccordionSection title="Brand" activeCount={pendingFilters.brand.length}>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {Object.keys(facets?.brand || {}).length > 0 ? (
            Object.entries(facets?.brand || {}).map(([bName, bCount]) => {
              const isChecked = pendingFilters.brand.includes(bName.toLowerCase());
              return (
                <label key={bName} className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
                  <div className="flex items-center gap-2.5">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => updatePendingFilter("brand", toggleArrayItem(pendingFilters.brand, bName))}
                      className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
                    />
                    <span className="text-xs group-hover:text-[#0A1F44] transition-colors">{bName}</span>
                  </div>
                  <span className="text-[11px] font-mono text-gray-400">({bCount as number})</span>
                </label>
              );
            })
          ) : (
            vendors?.map((v: any) => (
              <label key={v.id} className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={pendingFilters.brand.includes(v.name.toLowerCase()) || pendingFilters.vendorId === v.id}
                    onChange={() => updatePendingFilter("brand", toggleArrayItem(pendingFilters.brand, v.name))}
                    className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs group-hover:text-[#0A1F44] transition-colors">{v.name}</span>
                </div>
              </label>
            ))
          )}
        </div>
      </FilterAccordionSection>

      {/* 5. PRICE */}
      <FilterAccordionSection title="Price" activeCount={pendingFilters.minPrice !== undefined || pendingFilters.maxPrice !== undefined ? 1 : 0} defaultOpen={true}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {PRESET_PRICE_RANGES.map((pr) => {
              const isSelected =
                (pendingFilters.minPrice === pr.min || (pr.min === 0 && (pendingFilters.minPrice === 0 || pendingFilters.minPrice === undefined) && pendingFilters.maxPrice !== undefined)) &&
                (pendingFilters.maxPrice === pr.max || (pr.max === undefined && pendingFilters.maxPrice === undefined));
              return (
                <button
                  key={pr.label}
                  type="button"
                  onClick={() => {
                    if (isSelected) {
                      updatePendingFilter("minPrice", undefined);
                      updatePendingFilter("maxPrice", undefined);
                    } else {
                      updatePendingFilter("minPrice", pr.min);
                      updatePendingFilter("maxPrice", pr.max);
                    }
                  }}
                  className={cn(
                    "px-2 py-1.5 rounded border text-[11px] font-semibold text-center transition-all cursor-pointer",
                    isSelected
                      ? "bg-[#0A1F44] text-white border-[#0A1F44]"
                      : "bg-white border-[#C7CCD1]/40 text-[#3D1A1A]/80 hover:border-[#0A1F44]"
                  )}
                >
                  {pr.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 block mb-0.5">Min Price (₹)</label>
              <input
                type="number"
                placeholder="300"
                value={pendingFilters.minPrice ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  updatePendingFilter("minPrice", val);
                }}
                className="w-full px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-[#0A1F44]"
              />
            </div>
            <span className="text-xs text-gray-400 mt-4">–</span>
            <div className="flex-1">
              <label className="text-[10px] text-gray-400 block mb-0.5">Max Price (₹)</label>
              <input
                type="number"
                placeholder="1500+"
                value={pendingFilters.maxPrice ?? ""}
                onChange={(e) => {
                  const val = e.target.value ? Number(e.target.value) : undefined;
                  updatePendingFilter("maxPrice", val);
                }}
                className="w-full px-2 py-1 border rounded text-xs outline-none focus:ring-1 focus:ring-[#0A1F44]"
              />
            </div>
          </div>
        </div>
      </FilterAccordionSection>

      {/* 6. PATTERN */}
      <FilterAccordionSection title="Pattern" activeCount={pendingFilters.pattern.length}>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {PATTERN_OPTIONS.map((pat) => {
            const count = facets?.pattern?.[pat] ?? facets?.pattern?.[pat.toLowerCase()];
            const isChecked = pendingFilters.pattern.includes(pat.toLowerCase());
            return (
              <label key={pat} className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => updatePendingFilter("pattern", toggleArrayItem(pendingFilters.pattern, pat))}
                    className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs group-hover:text-[#0A1F44] transition-colors">{pat}</span>
                </div>
                {count !== undefined && <span className="text-[11px] font-mono text-gray-400">({count})</span>}
              </label>
            );
          })}
        </div>
      </FilterAccordionSection>

      {/* 7. OCCASION */}
      <FilterAccordionSection title="Occasion" activeCount={pendingFilters.occasion.length}>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {OCCASION_OPTIONS.map((occ) => {
            const count = facets?.occasion?.[occ] ?? facets?.occasion?.[occ.toLowerCase()];
            const isChecked = pendingFilters.occasion.includes(occ.toLowerCase());
            return (
              <label key={occ} className="flex items-center justify-between gap-3 cursor-pointer group py-0.5">
                <div className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => updatePendingFilter("occasion", toggleArrayItem(pendingFilters.occasion, occ))}
                    className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
                  />
                  <span className="text-xs group-hover:text-[#0A1F44] transition-colors">{occ}</span>
                </div>
                {count !== undefined && <span className="text-[11px] font-mono text-gray-400">({count})</span>}
              </label>
            );
          })}
        </div>
      </FilterAccordionSection>

      {/* 8. CUSTOMER RATINGS */}
      <FilterAccordionSection title="Customer Ratings" activeCount={pendingFilters.minRating !== undefined ? 1 : 0}>
        <div className="space-y-2">
          {RATING_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="radio"
                name="minRatingRadio"
                checked={pendingFilters.minRating === opt.value}
                onChange={() => updatePendingFilter("minRating", pendingFilters.minRating === opt.value ? undefined : opt.value)}
                className="accent-[#0A1F44] w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs flex items-center gap-1 group-hover:text-[#0A1F44]">
                <span className="flex text-amber-500">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={11}
                      className={s <= opt.value ? "fill-amber-400 text-amber-400" : "text-gray-300"}
                    />
                  ))}
                </span>
                {opt.label}
              </span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 9. GENDER */}
      <FilterAccordionSection title="Gender" activeCount={pendingFilters.gender.length}>
        <div className="space-y-1.5">
          {GENDER_OPTIONS.map((g) => (
            <label key={g} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={pendingFilters.gender.includes(g.toLowerCase())}
                onChange={() => updatePendingFilter("gender", toggleArrayItem(pendingFilters.gender, g))}
                className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs group-hover:text-[#0A1F44]">{g}</span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 10. SAREE TYPE */}
      <FilterAccordionSection title="Saree Type" activeCount={pendingFilters.sareeType.length}>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {SAREE_TYPE_OPTIONS.map((st) => (
            <label key={st} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={pendingFilters.sareeType.includes(st.toLowerCase())}
                onChange={() => updatePendingFilter("sareeType", toggleArrayItem(pendingFilters.sareeType, st))}
                className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs group-hover:text-[#0A1F44]">{st}</span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 11. SAREE STYLE */}
      <FilterAccordionSection title="Saree Style" activeCount={pendingFilters.sareeStyle.length}>
        <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
          {SAREE_STYLE_OPTIONS.map((ss) => (
            <label key={ss} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={pendingFilters.sareeStyle.includes(ss.toLowerCase())}
                onChange={() => updatePendingFilter("sareeStyle", toggleArrayItem(pendingFilters.sareeStyle, ss))}
                className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs group-hover:text-[#0A1F44]">{ss}</span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 12. PACK OF */}
      <FilterAccordionSection title="Pack Of" activeCount={pendingFilters.packOf.length}>
        <div className="space-y-1.5">
          {PACK_OF_OPTIONS.map((pk) => (
            <label key={pk} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={pendingFilters.packOf.includes(pk.toLowerCase())}
                onChange={() => updatePendingFilter("packOf", toggleArrayItem(pendingFilters.packOf, pk))}
                className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs group-hover:text-[#0A1F44]">{pk}</span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 13. DISCOUNT */}
      <FilterAccordionSection title="Discount" activeCount={pendingFilters.minDiscount !== undefined ? 1 : 0}>
        <div className="space-y-1.5">
          {DISCOUNT_OPTIONS.map((disc) => (
            <label key={disc.value} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="radio"
                name="discountFilter"
                checked={pendingFilters.minDiscount === disc.value}
                onChange={() => updatePendingFilter("minDiscount", pendingFilters.minDiscount === disc.value ? undefined : disc.value)}
                className="accent-[#0A1F44] w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs group-hover:text-[#0A1F44]">{disc.label}</span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 14. NEW ARRIVALS */}
      <FilterAccordionSection title="New Arrivals" activeCount={pendingFilters.newArrival ? 1 : 0}>
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={pendingFilters.newArrival}
            onChange={(e) => updatePendingFilter("newArrival", e.target.checked)}
            className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-xs group-hover:text-[#0A1F44]">✨ Recently Added Arrivals</span>
        </label>
      </FilterAccordionSection>

      {/* 15. COUNTRY OF ORIGIN */}
      <FilterAccordionSection title="Country of Origin" activeCount={pendingFilters.countryOfOrigin.length}>
        <div className="space-y-1.5">
          {["India", "Other"].map((co) => (
            <label key={co} className="flex items-center gap-2.5 cursor-pointer group py-0.5">
              <input
                type="checkbox"
                checked={pendingFilters.countryOfOrigin.includes(co.toLowerCase())}
                onChange={() => updatePendingFilter("countryOfOrigin", toggleArrayItem(pendingFilters.countryOfOrigin, co))}
                className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
              />
              <span className="text-xs group-hover:text-[#0A1F44]">{co}</span>
            </label>
          ))}
        </div>
      </FilterAccordionSection>

      {/* 16. OFFERS */}
      <FilterAccordionSection title="Offers & Promotions" activeCount={pendingFilters.hasOffer ? 1 : 0}>
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={pendingFilters.hasOffer}
            onChange={(e) => updatePendingFilter("hasOffer", e.target.checked)}
            className="accent-[#0A1F44] rounded w-3.5 h-3.5 cursor-pointer"
          />
          <span className="text-xs group-hover:text-[#0A1F44]">🔥 Active Offers Only</span>
        </label>
      </FilterAccordionSection>

      {/* 17. BLOUSE INCLUDED */}
      <FilterAccordionSection title="Blouse Included" activeCount={pendingFilters.blouseIncluded !== undefined ? 1 : 0}>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
            <input
              type="radio"
              name="blouseFilter"
              checked={pendingFilters.blouseIncluded === true}
              onChange={() => updatePendingFilter("blouseIncluded", pendingFilters.blouseIncluded === true ? undefined : true)}
              className="accent-[#0A1F44] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-xs group-hover:text-[#0A1F44]">Yes (Includes Blouse)</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
            <input
              type="radio"
              name="blouseFilter"
              checked={pendingFilters.blouseIncluded === false}
              onChange={() => updatePendingFilter("blouseIncluded", pendingFilters.blouseIncluded === false ? undefined : false)}
              className="accent-[#0A1F44] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-xs group-hover:text-[#0A1F44]">No (Saree Only)</span>
          </label>
        </div>
      </FilterAccordionSection>

      {/* 18. AVAILABILITY */}
      <FilterAccordionSection title="Availability" activeCount={pendingFilters.availability ? 1 : 0}>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
            <input
              type="radio"
              name="availFilter"
              checked={pendingFilters.availability === "in_stock"}
              onChange={() => updatePendingFilter("availability", pendingFilters.availability === "in_stock" ? undefined : "in_stock")}
              className="accent-[#0A1F44] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-xs group-hover:text-[#0A1F44]">In Stock</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer group py-0.5">
            <input
              type="radio"
              name="availFilter"
              checked={pendingFilters.availability === "out_of_stock"}
              onChange={() => updatePendingFilter("availability", pendingFilters.availability === "out_of_stock" ? undefined : "out_of_stock")}
              className="accent-[#0A1F44] w-3.5 h-3.5 cursor-pointer"
            />
            <span className="text-xs group-hover:text-[#0A1F44]">Out of Stock</span>
          </label>
        </div>
      </FilterAccordionSection>
    </div>
  );

  return (
    <Layout>
      <div className="min-h-screen bg-[#F4F5F7] text-[#3D1A1A]">
        {/* Top Breadcrumbs */}
        <div className="bg-white border-b border-[#C7CCD1]/20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
            <nav className="flex items-center gap-2 text-xs font-medium text-gray-500">
              <Link href="/" className="hover:text-[#0A1F44] transition-colors flex items-center gap-1">
                <Home size={12} />
                <span>Home</span>
              </Link>
              <ChevronRight size={12} className="text-gray-400" />
              <span className="text-[#0A1F44] font-bold">{displayTitle}</span>
            </nav>
          </div>
        </div>

        {/* Top Graphic Banner */}
        {resolvedTopBanner && (
          <div
            data-testid="top-category-banner"
            className="w-full bg-[#03132B] border-b border-[#C7CCD1]/20 overflow-hidden shadow-xs"
          >
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-5">
              <div className="w-full overflow-hidden rounded-xl sm:rounded-2xl shadow-md border border-[#C7CCD1]/30 aspect-[19/6] bg-[#031535]">
                <img
                  src={resolvedTopBanner}
                  alt={displayTitle ? `${displayTitle} - Authentic Handcrafted Sarees` : "Paithani Sarees - Heritage Handwoven Silk"}
                  className="w-full h-full object-cover object-center"
                  loading="eager"
                />
              </div>
            </div>
          </div>
        )}

        {/* Hero Header Section */}
        {!hideHero && (
          <div className="bg-[#0A1F44] text-white border-b border-[#C7CCD1]/20 py-8 sm:py-10 relative overflow-hidden">
            {heroBanner && (
              <>
                <div
                  className="absolute inset-0 bg-cover bg-right sm:bg-center bg-no-repeat opacity-40 mix-blend-luminosity scale-105"
                  style={{ backgroundImage: `url('${heroBanner}')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#0A1F44] via-[#0A1F44]/90 to-transparent pointer-events-none" />
              </>
            )}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
              <div className="max-w-3xl">
                {badgeLabel && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest bg-white/10 text-[#C7CCD1] border border-[#C7CCD1]/30 backdrop-blur-md mb-3">
                    ✨ {badgeLabel}
                  </span>
                )}
                <h1 className="font-serif text-3xl sm:text-4xl font-extrabold text-white tracking-tight mb-2">
                  {displayTitle}
                </h1>
                {subtitle && (
                  <p className="text-xs sm:text-sm uppercase tracking-[0.2em] font-bold text-[#C7CCD1] mb-2">
                    {subtitle}
                  </p>
                )}
                {description && (
                  <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-light max-w-2xl">
                    {description}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Header Content (Category Cards, StatsBar, etc.) */}
        {!hideHero && headerContent}

        {/* Main Area */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" ref={gridTopRef}>
          {/* Controls Header Bar: Count, Sort & Filters */}
          <div className="flex items-center justify-between gap-2.5 mb-4">
            <div className="flex items-center gap-2">
              <p className="text-xs sm:text-sm font-medium text-[#3D1A1A]/70">
                {isLoading ? (
                  "Loading sarees…"
                ) : (
                  <span>
                    Showing <strong className="text-[#0A1F44]">{products.length}</strong> of <strong className="text-[#0A1F44]">{totalProducts}</strong>
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value as ListProductsSort); setPage(1); }}
                  className="w-auto appearance-none pl-2.5 pr-7 py-2 bg-white border border-[#C7CCD1]/40 rounded-lg text-xs sm:text-sm font-semibold text-[#0A1F44] focus:outline-none focus:border-[#0A1F44] cursor-pointer transition-colors shadow-xs"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
              </div>

              {/* Filter Button */}
              <button
                type="button"
                onClick={handleToggleFilterPanel}
                aria-label="Filter"
                aria-expanded={isFilterOpen}
                data-testid="filter-button"
                className={cn(
                  "flex items-center gap-1.5 px-3 sm:px-4 py-2 border rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-xs cursor-pointer",
                  hasAppliedFilters || isFilterOpen
                    ? "bg-[#0A1F44] text-white border-[#0A1F44]"
                    : "bg-white border-[#C7CCD1]/40 text-[#3D1A1A] hover:border-[#0A1F44]/40 hover:text-[#0A1F44]"
                )}
              >
                <SlidersHorizontal size={14} />
                <span>Filter</span>
                {appliedFilterCount > 0 && (
                  <span className={cn(
                    "text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold",
                    isFilterOpen || hasAppliedFilters ? "bg-white text-[#0A1F44]" : "bg-[#0A1F44] text-white"
                  )}>
                    {appliedFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Quick Price Range Filters Bar */}
          <div className="mb-6 bg-white/70 backdrop-blur-xs p-3 rounded-xl border border-[#C7CCD1]/30">
            <PriceRangeCards
              variant="strip"
              activeMin={appliedFilters.minPrice}
              activeMax={appliedFilters.maxPrice}
              onSelect={(min, max) => {
                setAppliedFilters((prev) => {
                  const updated = { ...prev, minPrice: min, maxPrice: max };
                  setPendingFilters(updated);
                  return updated;
                });
                setPage(1);
              }}
            />
          </div>

          {/* Error Banner if request failed */}
          {isError && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl mb-6 text-sm flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle size={16} />
                <span>Failed to load products with the applied filters. Please check your connection or reset filters.</span>
              </div>
              <button
                type="button"
                onClick={resetAllAppliedFilters}
                className="text-xs font-bold underline hover:no-underline text-rose-800 cursor-pointer"
              >
                Reset Filters
              </button>
            </div>
          )}

          {/* Active Filter Badges */}
          <AnimatePresence>
            {hasAppliedFilters && (
              <MotionDiv
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mb-6"
              >
                <div className="flex flex-wrap items-center gap-2 py-1">
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-400 mr-1">Active Filters:</span>
                  {search && (
                    <FilterChip label={`Search: "${search}"`} onRemove={() => { setSearch(""); setPage(1); }} />
                  )}
                  {appliedFilters.collection && (
                    <FilterChip
                      label={`Collection: ${appliedFilters.collection}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, collection: undefined }))}
                    />
                  )}
                  {appliedFilters.subcategory && (
                    <FilterChip
                      label={`Subcategory: ${appliedFilters.subcategory}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, subcategory: undefined }))}
                    />
                  )}
                  {appliedFilters.fabric.map((f) => (
                    <FilterChip
                      key={f}
                      label={`Fabric: ${f}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, fabric: prev.fabric.filter((x) => x !== f) }))}
                    />
                  ))}
                  {appliedFilters.color.map((c) => (
                    <FilterChip
                      key={c}
                      label={`Color: ${c}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, color: prev.color.filter((x) => x !== c) }))}
                    />
                  ))}
                  {appliedFilters.brand.map((b) => (
                    <FilterChip
                      key={b}
                      label={`Brand: ${b}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, brand: prev.brand.filter((x) => x !== b) }))}
                    />
                  ))}
                  {appliedFilters.pattern.map((p) => (
                    <FilterChip
                      key={p}
                      label={`Pattern: ${p}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, pattern: prev.pattern.filter((x) => x !== p) }))}
                    />
                  ))}
                  {appliedFilters.occasion.map((o) => (
                    <FilterChip
                      key={o}
                      label={`Occasion: ${o}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, occasion: prev.occasion.filter((x) => x !== o) }))}
                    />
                  ))}
                  {appliedFilters.gender.map((g) => (
                    <FilterChip
                      key={g}
                      label={`Gender: ${g}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, gender: prev.gender.filter((x) => x !== g) }))}
                    />
                  ))}
                  {appliedFilters.sareeType.map((st) => (
                    <FilterChip
                      key={st}
                      label={`Type: ${st}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, sareeType: prev.sareeType.filter((x) => x !== st) }))}
                    />
                  ))}
                  {appliedFilters.sareeStyle.map((ss) => (
                    <FilterChip
                      key={ss}
                      label={`Style: ${ss}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, sareeStyle: prev.sareeStyle.filter((x) => x !== ss) }))}
                    />
                  ))}
                  {appliedFilters.packOf.map((pk) => (
                    <FilterChip
                      key={pk}
                      label={`Pack: ${pk}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, packOf: prev.packOf.filter((x) => x !== pk) }))}
                    />
                  ))}
                  {appliedFilters.countryOfOrigin.map((co) => (
                    <FilterChip
                      key={co}
                      label={`Origin: ${co}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, countryOfOrigin: prev.countryOfOrigin.filter((x) => x !== co) }))}
                    />
                  ))}
                  {(appliedFilters.minPrice !== undefined || appliedFilters.maxPrice !== undefined) && (
                    <FilterChip
                      label={`Price: ${appliedFilters.minPrice !== undefined ? formatPrice(appliedFilters.minPrice) : "₹0"} – ${appliedFilters.maxPrice !== undefined ? formatPrice(appliedFilters.maxPrice) : "Any"}`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, minPrice: undefined, maxPrice: undefined }))}
                    />
                  )}
                  {appliedFilters.minRating !== undefined && (
                    <FilterChip
                      label={`Rating: ${appliedFilters.minRating}★ & above`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, minRating: undefined }))}
                    />
                  )}
                  {appliedFilters.minDiscount !== undefined && (
                    <FilterChip
                      label={`Discount: ${appliedFilters.minDiscount}% & above`}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, minDiscount: undefined }))}
                    />
                  )}
                  {appliedFilters.newArrival && (
                    <FilterChip
                      label="New Arrivals"
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, newArrival: false }))}
                    />
                  )}
                  {appliedFilters.hasOffer && (
                    <FilterChip
                      label="Offers Only"
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, hasOffer: false }))}
                    />
                  )}
                  {appliedFilters.blouseIncluded !== undefined && (
                    <FilterChip
                      label={appliedFilters.blouseIncluded ? "Blouse Included" : "No Blouse"}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, blouseIncluded: undefined }))}
                    />
                  )}
                  {appliedFilters.availability && (
                    <FilterChip
                      label={appliedFilters.availability === "in_stock" ? "In Stock" : "Out of Stock"}
                      onRemove={() => removeAppliedFilter((prev) => ({ ...prev, availability: undefined }))}
                    />
                  )}
                  {appliedFilterCount > 1 && (
                    <button
                      type="button"
                      onClick={resetAllAppliedFilters}
                      className="text-xs text-rose-600 hover:text-rose-700 font-bold flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200 transition-colors cursor-pointer"
                    >
                      <X size={12} /> Clear all
                    </button>
                  )}
                </div>
              </MotionDiv>
            )}
          </AnimatePresence>

          {/* Sidebar & Products Grid */}
          <div className="flex gap-8 items-start">
            {/* Desktop Filter Sidebar (Hidden by default, shown when user clicks Filter) */}
            <AnimatePresence>
              {isFilterOpen && isDesktop && (
                <MotionAside
                  initial={{ opacity: 0, width: 0, x: -20 }}
                  animate={{ opacity: 1, width: 280, x: 0 }}
                  exit={{ opacity: 0, width: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  data-testid="desktop-filter-sidebar"
                  className="shrink-0 overflow-hidden"
                >
                  <div className="w-[280px] rounded-2xl border bg-white border-[#C7CCD1]/30 shadow-sm sticky top-24 max-h-[calc(100vh-7rem)] flex flex-col overflow-hidden">
                    {/* Header */}
                    <div className="p-4 pb-3 border-b border-[#C7CCD1]/20 flex items-center justify-between bg-white">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal size={14} className="text-[#0A1F44]" />
                        <h3 className="font-bold uppercase tracking-wider text-xs text-[#0A1F44]">Filters</h3>
                        {pendingFilterCount > 0 && (
                          <span className="bg-[#0A1F44] text-white text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                            {pendingFilterCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleClearAllPending}
                          disabled={pendingFilterCount === 0}
                          className="text-xs text-rose-600 hover:text-rose-700 disabled:opacity-40 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <RotateCcw size={12} /> Clear all
                        </button>
                        <button
                          type="button"
                          onClick={handleCloseFilterPanel}
                          aria-label="Close filters"
                          className="text-gray-400 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    </div>

                    {/* Scrollable Filter Sections */}
                    <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
                      {filterSidebarSections}
                    </div>

                    {/* Footer Actions */}
                    <div className="p-4 pt-3 border-t border-[#C7CCD1]/20 bg-white rounded-b-2xl space-y-2">
                      {filterError && (
                        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 font-medium">
                          {filterError}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCloseFilterPanel}
                          className="flex-1 py-2.5 px-3 border border-[#C7CCD1]/60 text-[#3D1A1A] hover:bg-gray-50 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyFilters}
                          disabled={isApplyingFilters}
                          className="flex-1 py-2.5 px-3 bg-[#0A1F44] text-white hover:bg-[#1E3A8A] rounded-lg text-xs font-bold uppercase tracking-wider shadow-sm transition-colors cursor-pointer text-center disabled:opacity-50"
                        >
                          {isApplyingFilters ? "Applying..." : "Apply Filters"}
                        </button>
                      </div>
                    </div>
                  </div>
                </MotionAside>
              )}
            </AnimatePresence>

            {/* Mobile Filter Drawer */}
            <AnimatePresence>
              {isFilterOpen && !isDesktop && (
                <div className="fixed inset-0 z-50" data-testid="mobile-filter-drawer">
                  <MotionDiv
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={handleCloseFilterPanel}
                    className="absolute inset-0 bg-black/60 backdrop-blur-xs"
                  />
                  <MotionDiv
                    initial={{ x: "100%" }}
                    animate={{ x: 0 }}
                    exit={{ x: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 250 }}
                    className="absolute inset-y-0 right-0 w-full max-w-xs sm:max-w-sm h-full min-h-screen-dynamic bg-white shadow-2xl flex flex-col z-10"
                  >
                    <div className="p-4 pt-safe border-b border-[#C7CCD1]/20 flex items-center justify-between bg-[#F4F5F7]">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal size={16} className="text-[#0A1F44]" />
                        <h3 className="font-serif font-bold text-lg text-[#0A1F44]">Filter Products</h3>
                        {pendingFilterCount > 0 && (
                          <span className="bg-[#0A1F44] text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                            {pendingFilterCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {pendingFilterCount > 0 && (
                          <button
                            type="button"
                            onClick={handleClearAllPending}
                            className="text-xs text-rose-600 hover:text-rose-700 font-medium flex items-center gap-1 transition-colors cursor-pointer"
                          >
                            <RotateCcw size={12} /> Clear all
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleCloseFilterPanel}
                          aria-label="Close filters"
                          className="p-1.5 text-gray-500 hover:text-[#0A1F44] rounded-full hover:bg-white transition-colors cursor-pointer"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </div>

                    <div className="p-5 flex-1 overflow-y-auto scroll-touch scrollbar-thin">
                      {filterSidebarSections}
                    </div>

                    <div className="p-4 pb-safe border-t border-[#C7CCD1]/20 bg-white space-y-2">
                      {filterError && (
                        <div className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-2 font-medium">
                          {filterError}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={handleCloseFilterPanel}
                          className="flex-1 py-3 border border-[#C7CCD1]/60 text-[#3D1A1A] hover:bg-gray-50 rounded-lg text-sm font-bold uppercase tracking-wider transition-colors cursor-pointer text-center"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleApplyFilters}
                          disabled={isApplyingFilters}
                          className="flex-1 bg-[#0A1F44] text-white py-3 rounded-lg text-sm font-bold uppercase tracking-wider shadow-sm hover:bg-[#2C3E6B] transition-colors cursor-pointer text-center disabled:opacity-50"
                        >
                          {isApplyingFilters ? "Applying..." : "Apply Filters"}
                        </button>
                      </div>
                    </div>
                  </MotionDiv>
                </div>
              )}
            </AnimatePresence>

            {/* Products Grid */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
                <ProductGridSkeleton
                  count={8}
                  className={cn(
                    isFilterOpen && isDesktop
                      ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
                      : "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
                  )}
                />
              ) : products.length === 0 ? (
                <div className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-8 sm:p-12 text-center my-4 shadow-xs">
                  <div className="w-16 h-16 bg-[#F4F5F7] rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                    🪡
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] mb-2">
                    {hasAppliedFilters ? "No Sarees Found" : "No products available at the moment."}
                  </h3>
                  <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                    {hasAppliedFilters
                      ? "We couldn't find any products matching your active filters. Try resetting your filters."
                      : "Please check back soon for authentic handcrafted sarees from registered artisans."}
                  </p>
                  {hasAppliedFilters && (
                    <button
                      type="button"
                      onClick={resetAllAppliedFilters}
                      className="bg-[#0A1F44] text-white px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors shadow-sm cursor-pointer"
                    >
                      Clear All Filters
                    </button>
                  )}
                </div>
              ) : (
                <div className={cn(
                  "grid gap-3 sm:gap-6 items-stretch",
                  isFilterOpen && isDesktop
                    ? "grid-cols-2 sm:grid-cols-2 lg:grid-cols-3"
                    : "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5"
                )}>
                  {products.map((product: any, i: number) => {
                    const isAfterTargetCard = resolvedInGridBanner && i === ((resolvedInGridBanner.afterCount ?? 20) - 1);
                    return (
                      <React.Fragment key={product.id || i}>
                        <div className="h-full flex flex-col">
                          <ProductCard product={product} index={i} />
                        </div>
                        {isAfterTargetCard && (
                          <div
                            data-testid="in-grid-designer-banner"
                            className="col-span-full my-4 sm:my-8 rounded-2xl overflow-hidden shadow-lg border border-[#C7CCD1]/30 bg-[#03132B]"
                          >
                            <div className="relative w-full aspect-[19/6] max-h-[380px] overflow-hidden">
                              <img
                                src={resolvedInGridBanner.image}
                                alt={resolvedInGridBanner.alt || "Designer Sarees - Modern Styles | Timeless Elegance"}
                                className="w-full h-full object-cover object-center"
                                loading="lazy"
                              />
                            </div>
                          </div>
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-12 pt-6 border-t border-[#C7CCD1]/20">
                  <p className="text-xs text-gray-500 font-medium">
                    Page <strong className="text-[#0A1F44]">{page}</strong> of <strong className="text-[#0A1F44]">{totalPages}</strong>
                  </p>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => { setPage(Math.max(1, page - 1)); gridTopRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                      disabled={page <= 1}
                      className="px-3.5 py-2 rounded-lg border border-[#C7CCD1]/40 bg-white text-xs font-semibold text-[#0A1F44] hover:bg-[#F4F5F7] hover:border-[#0A1F44] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
                    >
                      ← Prev
                    </button>

                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pg = i + 1;
                      if (totalPages > 5 && page > 3) {
                        pg = page - 3 + i;
                        if (pg > totalPages) pg = totalPages - (4 - i);
                      }
                      return (
                        <button
                          key={pg}
                          type="button"
                          onClick={() => { setPage(pg); gridTopRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                          className={cn(
                            "w-9 h-9 rounded-lg border text-xs font-bold transition-all cursor-pointer shadow-xs flex items-center justify-center",
                            page === pg
                              ? "bg-[#0A1F44] text-white border-[#0A1F44]"
                              : "bg-white border-[#C7CCD1]/40 text-[#3D1A1A] hover:border-[#0A1F44]"
                          )}
                        >
                          {pg}
                        </button>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => { setPage(Math.min(totalPages, page + 1)); gridTopRef.current?.scrollIntoView({ behavior: "smooth" }); }}
                      disabled={page >= totalPages}
                      className="px-3.5 py-2 rounded-lg border border-[#C7CCD1]/40 bg-white text-xs font-semibold text-[#0A1F44] hover:bg-[#F4F5F7] hover:border-[#0A1F44] transition-all disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-xs"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}

interface FilterChipProps {
  label: string;
  onRemove: () => void;
}

function FilterChip({ label, onRemove }: FilterChipProps) {
  return (
    <MotionSpan
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#C7CCD1]/50 text-[#0A1F44] text-xs font-semibold shadow-xs"
    >
      <span className="capitalize">{label}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="ml-0.5 rounded-full hover:bg-gray-100 transition-colors p-0.5 text-gray-400 hover:text-rose-600 cursor-pointer"
      >
        <X size={12} />
      </button>
    </MotionSpan>
  );
}
