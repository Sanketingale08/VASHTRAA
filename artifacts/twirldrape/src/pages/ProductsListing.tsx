import React, { useState, useCallback, useDeferredValue, useEffect, useRef } from "react";
import { useSearch, useLocation } from "wouter";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Layout } from "@/components/Layout";
import { useListProducts, useListVendors, useGetProductFacets } from "@workspace/api-client-react";
import type { ListProductsParams, ListProductsSort, GetProductFacetsParams } from "@workspace/api-client-react";
import { ProductCard } from "@/components/ProductCard";
import { motion, AnimatePresence } from "framer-motion";
import { SlidersHorizontal, X, ChevronDown, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProductsListingProps {
  category: "paithani" | "designer";
  title: string;
  subtitle: string;
}

const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"];
const OCCASIONS = ["bridal", "festival", "casual", "party", "formal"];
const COLORS = [
  { value: "red", label: "Red", hex: "#c0392b" },
  { value: "maroon", label: "Maroon", hex: "#1E6B5A" },
  { value: "blue", label: "Blue", hex: "#2980b9" },
  { value: "green", label: "Green", hex: "#27ae60" },
  { value: "yellow", label: "Yellow", hex: "#f1c40f" },
  { value: "pink", label: "Pink", hex: "#e91e8c" },
  { value: "purple", label: "Purple", hex: "#8e44ad" },
  { value: "cream", label: "Cream", hex: "#f5e6c8" },
  { value: "gold", label: "Gold", hex: "#C9A84C" },
  { value: "black", label: "Black", hex: "#2c2c2c" },
  { value: "orange", label: "Orange", hex: "#e67e22" },
  { value: "mint", label: "Mint", hex: "#1abc9c" },
];

const SORT_OPTIONS: { value: ListProductsSort; label: string }[] = [
  { value: "rating_desc", label: "Top Rated" },
  { value: "newest", label: "New Arrivals" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

type QuickChip = "all" | "bestSeller" | "newArrival" | "onSale";

const RATING_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: "Any Rating", value: undefined },
  { label: "3★ & above", value: 3 },
  { label: "4★ & above", value: 4 },
  { label: "4.5★ & above", value: 4.5 },
];

const PRICE_SLIDER_MAX = 50000;
const PRICE_SLIDER_STEP = 500;

function formatPrice(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function ProductsListing({ category, title, subtitle }: ProductsListingProps) {
  const searchStr = useSearch();
  const [pathname, navigate] = useLocation();

  const initParams = new URLSearchParams(searchStr);

  const [search, setSearch] = useState<string>(() => initParams.get("q") ?? "");
  const [fabric, setFabric] = useState<string | undefined>(() => initParams.get("fabric") || undefined);
  const [color, setColor] = useState<string | undefined>(() => initParams.get("color") || undefined);
  const [occasion, setOccasion] = useState<string | undefined>(() => initParams.get("occasion") || undefined);
  const [vendorId, setVendorId] = useState<string | undefined>(() => initParams.get("vendor") || undefined);
  const [minPrice, setMinPrice] = useState<number | undefined>(() => {
    const v = initParams.get("minPrice");
    return v ? Number(v) : undefined;
  });
  const [maxPrice, setMaxPrice] = useState<number | undefined>(() => {
    const v = initParams.get("maxPrice");
    return v ? Number(v) : undefined;
  });
  const [sort, setSort] = useState<ListProductsSort>(() => {
    const v = initParams.get("sort") as ListProductsSort | null;
    return v && SORT_OPTIONS.some((o) => o.value === v) ? v : "rating_desc";
  });
  const [page, setPage] = useState<number>(() => {
    const v = initParams.get("page");
    return v ? Math.max(1, Number(v)) : 1;
  });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickChip, setQuickChip] = useState<QuickChip>(() => {
    const v = initParams.get("chip") as QuickChip | null;
    return v && ["bestSeller", "newArrival", "onSale"].includes(v) ? v : "all";
  });
  const [minRating, setMinRating] = useState<number | undefined>(() => {
    const v = initParams.get("minRating");
    return v ? Number(v) : undefined;
  });
  const [hasDiscount, setHasDiscount] = useState<boolean>(() => initParams.get("discount") === "1");

  const [priceRange, setPriceRange] = useState<[number, number]>([
    minPrice ?? 0,
    maxPrice ?? PRICE_SLIDER_MAX,
  ]);

  const deferredSearch = useDeferredValue(search);

  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (fabric) params.set("fabric", fabric);
    if (color) params.set("color", color);
    if (occasion) params.set("occasion", occasion);
    if (vendorId) params.set("vendor", vendorId);
    if (minPrice !== undefined && minPrice > 0) params.set("minPrice", String(minPrice));
    if (maxPrice !== undefined && maxPrice < PRICE_SLIDER_MAX) params.set("maxPrice", String(maxPrice));
    if (sort !== "rating_desc") params.set("sort", sort);
    if (page > 1) params.set("page", String(page));
    if (quickChip !== "all") params.set("chip", quickChip);
    if (minRating !== undefined) params.set("minRating", String(minRating));
    if (hasDiscount) params.set("discount", "1");

    const qs = params.toString();
    navigateRef.current(`${pathnameRef.current}${qs ? "?" + qs : ""}`, { replace: true });
  }, [search, fabric, color, occasion, vendorId, minPrice, maxPrice, sort, page, quickChip, minRating, hasDiscount]);

  const params: ListProductsParams = {
    category,
    sort,
    page,
    limit: 12,
    ...(deferredSearch && { search: deferredSearch }),
    ...(fabric && { fabric }),
    ...(color && { color }),
    ...(occasion && { occasion }),
    ...(vendorId && { vendorId }),
    ...(minPrice !== undefined && minPrice > 0 && { minPrice }),
    ...(maxPrice !== undefined && maxPrice < PRICE_SLIDER_MAX && { maxPrice }),
    ...(quickChip === "bestSeller" && { bestSeller: true }),
    ...(quickChip === "newArrival" && { newArrival: true }),
    ...(quickChip === "onSale" || hasDiscount ? { hasDiscount: true } : {}),
    ...(minRating !== undefined && { minRating }),
  };

  const { data, isLoading } = useListProducts(params);
  const { data: vendors } = useListVendors();

  const facetParams: GetProductFacetsParams = {
    category,
    ...(deferredSearch && { search: deferredSearch }),
    ...(fabric && { fabric }),
    ...(color && { color }),
    ...(occasion && { occasion }),
    ...(vendorId && { vendorId }),
    ...(minPrice !== undefined && minPrice > 0 && { minPrice }),
    ...(maxPrice !== undefined && maxPrice < PRICE_SLIDER_MAX && { maxPrice }),
    ...(quickChip === "bestSeller" && { bestSeller: true }),
    ...(quickChip === "newArrival" && { newArrival: true }),
    ...(quickChip === "onSale" || hasDiscount ? { hasDiscount: true } : {}),
    ...(minRating !== undefined && { minRating }),
  };

  const { data: facets } = useGetProductFacets(facetParams);

  const resetFilters = useCallback(() => {
    setFabric(undefined);
    setColor(undefined);
    setOccasion(undefined);
    setVendorId(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
    setPriceRange([0, PRICE_SLIDER_MAX]);
    setSearch("");
    setQuickChip("all");
    setMinRating(undefined);
    setHasDiscount(false);
    setPage(1);
  }, []);

  function handleQuickChip(chip: QuickChip) {
    setQuickChip((prev) => (prev === chip ? "all" : chip));
    setPage(1);
  }

  function handlePriceRangeCommit(values: number[]) {
    const [lo, hi] = values as [number, number];
    setMinPrice(lo > 0 ? lo : undefined);
    setMaxPrice(hi < PRICE_SLIDER_MAX ? hi : undefined);
    setPage(1);
  }

  const colorLabel = COLORS.find((c) => c.value === color)?.label;
  const vendorLabel = vendors?.find((v) => v.id === vendorId)?.name;
  const ratingLabel = RATING_OPTIONS.find((r) => r.value === minRating && r.value !== undefined)?.label;

  const activeFilterCount = [
    fabric,
    color,
    occasion,
    vendorId,
    minPrice !== undefined && minPrice > 0 ? minPrice : undefined,
    maxPrice !== undefined && maxPrice < PRICE_SLIDER_MAX ? maxPrice : undefined,
    search,
    quickChip !== "all" ? quickChip : undefined,
    minRating,
    hasDiscount ? true : undefined,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;
  const products = data?.products ?? [];
  const totalPages = data?.totalPages ?? 1;

  const chipBase = "shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full border transition-all";
  const chipActive = "bg-[#C9A84C] text-[#1E6B5A] border-[#C9A84C]";
  const chipInactive = "border-[#C9A84C]/30 text-[#3D1A1A]/70 hover:border-[#C9A84C] hover:text-[#3D1A1A]";

  const priceMin = priceRange[0];
  const priceMax = priceRange[1];
  const hasPriceFilter = priceMin > 0 || priceMax < PRICE_SLIDER_MAX;

  return (
    <Layout>
      <div className="min-h-screen bg-[#F3F8F5] text-[#3D1A1A]">

        {/* Page Header */}
        <div className="py-12 border-b border-[#C9A84C]/20 bg-[#E6F0EA]">
          <div className="container mx-auto px-4 text-center">
            <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-3">{subtitle}</p>
            <h1 className="font-serif text-4xl md:text-5xl font-bold text-[#1E6B5A]">
              {title}
            </h1>
            <div className="w-16 h-0.5 bg-[#C9A84C] mx-auto mt-6" />
          </div>
        </div>

        <div className="container mx-auto px-4 py-8 max-w-7xl">

          {/* Quick-filter chip bar */}
          <div className="overflow-x-auto pb-1 mb-6 -mx-4 px-4">
            <div className="flex gap-2 flex-nowrap">
              <button
                onClick={() => handleQuickChip("all")}
                className={cn(chipBase, quickChip === "all" ? chipActive : chipInactive)}
              >
                All
              </button>
              <button
                onClick={() => handleQuickChip("bestSeller")}
                className={cn(chipBase, quickChip === "bestSeller" ? chipActive : chipInactive)}
              >
                ⭐ Best Sellers
              </button>
              <button
                onClick={() => handleQuickChip("newArrival")}
                className={cn(chipBase, quickChip === "newArrival" ? chipActive : chipInactive)}
              >
                ✨ New Arrivals
              </button>
              <button
                onClick={() => handleQuickChip("onSale")}
                className={cn(chipBase, quickChip === "onSale" ? chipActive : chipInactive)}
              >
                🏷️ On Sale
              </button>
            </div>
          </div>

          {/* Search + Sort Bar */}
          <div className="flex flex-col sm:flex-row gap-4 mb-4">
            <div className="relative flex-1">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder={`Search ${category} sarees…`}
                className="w-full pl-9 pr-4 py-3 border rounded-sm text-sm focus:outline-none focus:border-[#C9A84C] transition-colors bg-[#F3F8F5] border-[#C9A84C]/30 text-[#3D1A1A] placeholder-[#3D1A1A]/40"
              />
            </div>

            <div className="flex gap-3">
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => { setSort(e.target.value as ListProductsSort); setPage(1); }}
                  className="appearance-none pl-4 pr-9 py-3 border rounded-sm text-sm font-medium focus:outline-none focus:border-[#C9A84C] cursor-pointer transition-colors bg-[#F3F8F5] border-[#C9A84C]/30 text-[#3D1A1A] placeholder-[#3D1A1A]/40"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-50" />
              </div>

              <button
                onClick={() => setFiltersOpen(!filtersOpen)}
                className={cn(
                  "flex items-center gap-2 px-4 py-3 border rounded-sm text-sm font-semibold transition-all",
                  hasActiveFilters
                    ? "bg-[#C9A84C] text-[#1E6B5A] border-[#C9A84C]"
                    : "border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                )}
              >
                <SlidersHorizontal size={16} />
                Filters
                {hasActiveFilters && (
                  <span className="bg-[#1E6B5A] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Active Filter Chips */}
          <AnimatePresence>
            {hasActiveFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden mb-6"
              >
                <div className="flex flex-wrap gap-2 py-1">
                  {search && (
                    <FilterChip label={`"${search}"`} onRemove={() => { setSearch(""); setPage(1); }} />
                  )}
                  {quickChip === "bestSeller" && (
                    <FilterChip label="⭐ Best Sellers" onRemove={() => { setQuickChip("all"); setPage(1); }} />
                  )}
                  {quickChip === "newArrival" && (
                    <FilterChip label="✨ New Arrivals" onRemove={() => { setQuickChip("all"); setPage(1); }} />
                  )}
                  {quickChip === "onSale" && (
                    <FilterChip label="🏷️ On Sale" onRemove={() => { setQuickChip("all"); setPage(1); }} />
                  )}
                  {color && (
                    <FilterChip
                      label={colorLabel ?? color}
                      color={COLORS.find((c) => c.value === color)?.hex}
                      onRemove={() => { setColor(undefined); setPage(1); }}
                    />
                  )}
                  {fabric && (
                    <FilterChip label={fabric} onRemove={() => { setFabric(undefined); setPage(1); }} />
                  )}
                  {occasion && (
                    <FilterChip label={occasion} onRemove={() => { setOccasion(undefined); setPage(1); }} />
                  )}
                  {hasPriceFilter && (
                    <FilterChip
                      label={`${formatPrice(priceMin)} – ${formatPrice(priceMax)}`}
                      onRemove={() => {
                        setMinPrice(undefined);
                        setMaxPrice(undefined);
                        setPriceRange([0, PRICE_SLIDER_MAX]);
                        setPage(1);
                      }}
                    />
                  )}
                  {ratingLabel && (
                    <FilterChip label={ratingLabel} onRemove={() => { setMinRating(undefined); setPage(1); }} />
                  )}
                  {hasDiscount && (
                    <FilterChip label="🏷️ Discounted" onRemove={() => { setHasDiscount(false); setPage(1); }} />
                  )}
                  {vendorLabel && (
                    <FilterChip label={vendorLabel} onRemove={() => { setVendorId(undefined); setPage(1); }} />
                  )}
                  {activeFilterCount > 1 && (
                    <button
                      onClick={resetFilters}
                      className="text-xs text-red-400 hover:text-red-500 font-medium flex items-center gap-1 px-2 py-1 rounded"
                    >
                      <X size={12} /> Clear all
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-8">

            {/* Filter Sidebar */}
            <AnimatePresence>
              {filtersOpen && (
                <motion.aside
                  initial={{ opacity: 0, width: 0, x: -20 }}
                  animate={{ opacity: 1, width: 280, x: 0 }}
                  exit={{ opacity: 0, width: 0, x: -20 }}
                  transition={{ duration: 0.3 }}
                  className="shrink-0 overflow-hidden"
                >
                  <div className="w-[280px] p-5 rounded-lg border bg-white border-[#C9A84C]/10 space-y-6 sticky top-24">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold uppercase tracking-wider text-xs text-[#C9A84C]">Filters</h3>
                      {hasActiveFilters && (
                        <button
                          onClick={resetFilters}
                          className="text-xs text-red-400 hover:text-red-500 font-medium flex items-center gap-1"
                        >
                          <X size={12} /> Clear all
                        </button>
                      )}
                    </div>

                    {/* Customer Rating */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Customer Rating</h4>
                      <div className="space-y-2">
                        {RATING_OPTIONS.map((opt) => {
                          const ratingCount = opt.value !== undefined ? (facets?.rating[String(opt.value)] ?? 0) : undefined;
                          const isZero = ratingCount === 0;
                          return (
                            <label key={String(opt.value)} className={cn("flex items-center gap-3 cursor-pointer group", isZero && "opacity-40")}>
                              <input
                                type="radio"
                                name="minRating"
                                checked={minRating === opt.value}
                                onChange={() => { setMinRating(opt.value); setPage(1); }}
                                className="accent-[#C9A84C]"
                              />
                              <span className="text-sm flex items-center gap-1 group-hover:text-[#C9A84C] transition-colors">
                                {opt.value !== undefined && (
                                  <span className="flex">
                                    {[1, 2, 3, 4, 5].map((s) => (
                                      <Star
                                        key={s}
                                        size={10}
                                        className={s <= Math.floor(opt.value!) ? "fill-[#C9A84C] text-[#C9A84C]" : "text-gray-300"}
                                      />
                                    ))}
                                  </span>
                                )}
                                {opt.label}
                                {ratingCount !== undefined && (
                                  <span className="text-[10px] opacity-50 ml-0.5">({ratingCount})</span>
                                )}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* On Sale / Discounts */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Discounts</h4>
                      <label className="flex items-center gap-3 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={hasDiscount}
                          onChange={(e) => { setHasDiscount(e.target.checked); setPage(1); }}
                          className="accent-[#C9A84C]"
                        />
                        <span className="text-sm group-hover:text-[#C9A84C] transition-colors">🏷️ On Sale only</span>
                      </label>
                    </div>

                    {/* Price Range Slider */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-4">Price Range</h4>
                      <div className="px-1">
                        <SliderPrimitive.Root
                          min={0}
                          max={PRICE_SLIDER_MAX}
                          step={PRICE_SLIDER_STEP}
                          value={priceRange}
                          onValueChange={(vals) => setPriceRange(vals as [number, number])}
                          onValueCommit={handlePriceRangeCommit}
                          className="relative flex w-full touch-none select-none items-center"
                        >
                          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[#C9A84C]/20">
                            <SliderPrimitive.Range className="absolute h-full bg-[#C9A84C]" />
                          </SliderPrimitive.Track>
                          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-[#C9A84C] bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]" />
                          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full border-2 border-[#C9A84C] bg-white shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A84C]" />
                        </SliderPrimitive.Root>
                      </div>
                      <div className="flex justify-between mt-3 text-xs text-[#3D1A1A]/70 font-medium">
                        <span>{formatPrice(priceMin)}</span>
                        <span>{formatPrice(priceMax)}{priceMax >= PRICE_SLIDER_MAX ? "+" : ""}</span>
                      </div>
                    </div>

                    {/* Color */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Color</h4>
                      <div className="flex flex-wrap gap-2">
                        {COLORS.map((c) => {
                          const colorCount = facets?.color[c.value] ?? 0;
                          const isZero = colorCount === 0;
                          return (
                            <button
                              key={c.value}
                              title={`${c.label} (${colorCount})`}
                              onClick={() => { setColor(color === c.value ? undefined : c.value); setPage(1); }}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 transition-all",
                                color === c.value
                                  ? "border-[#C9A84C] scale-110 shadow-md"
                                  : isZero
                                    ? "border-transparent opacity-30 cursor-not-allowed"
                                    : "border-transparent hover:border-[#C9A84C]/50"
                              )}
                              style={{ backgroundColor: c.hex }}
                            />
                          );
                        })}
                      </div>
                      {color && (
                        <p className="text-xs mt-2 opacity-60 capitalize">
                          {colorLabel} selected
                          {facets?.color[color] !== undefined && (
                            <span className="ml-1">({facets.color[color]})</span>
                          )}
                        </p>
                      )}
                    </div>

                    {/* Fabric */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Fabric</h4>
                      <div className="space-y-1">
                        {FABRICS.map((f) => {
                          const fabricCount = facets?.fabric[f] ?? 0;
                          const isZero = fabricCount === 0;
                          return (
                            <label key={f} className={cn("flex items-center justify-between gap-3 cursor-pointer group", isZero && "opacity-40")}>
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={fabric === f}
                                  onChange={() => { setFabric(fabric === f ? undefined : f); setPage(1); }}
                                  className="accent-[#C9A84C]"
                                />
                                <span className="text-sm capitalize group-hover:text-[#C9A84C] transition-colors">{f}</span>
                              </div>
                              <span className="text-[11px] opacity-50 shrink-0">({fabricCount})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Subcategory / Occasion */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Subcategory / Occasion</h4>
                      <div className="space-y-1">
                        {OCCASIONS.map((o) => {
                          const occasionCount = facets?.occasion[o] ?? 0;
                          const isZero = occasionCount === 0;
                          return (
                            <label key={o} className={cn("flex items-center justify-between gap-3 cursor-pointer group", isZero && "opacity-40")}>
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  checked={occasion === o}
                                  onChange={() => { setOccasion(occasion === o ? undefined : o); setPage(1); }}
                                  className="accent-[#C9A84C]"
                                />
                                <span className="text-sm capitalize group-hover:text-[#C9A84C] transition-colors">{o}</span>
                              </div>
                              <span className="text-[11px] opacity-50 shrink-0">({occasionCount})</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    {/* Brand / Shop */}
                    {vendors && vendors.length > 0 && (
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Brand / Shop</h4>
                        <div className="space-y-1">
                          {vendors.map((v) => {
                            const vendorCount = facets?.vendor[v.id] ?? 0;
                            const isZero = vendorCount === 0;
                            return (
                              <label key={v.id} className={cn("flex items-center justify-between gap-3 cursor-pointer group", isZero && "opacity-40")}>
                                <div className="flex items-center gap-3">
                                  <input
                                    type="checkbox"
                                    checked={vendorId === v.id}
                                    onChange={() => { setVendorId(vendorId === v.id ? undefined : v.id); setPage(1); }}
                                    className="accent-[#C9A84C]"
                                  />
                                  <span className="text-sm group-hover:text-[#C9A84C] transition-colors">{v.name}</span>
                                </div>
                                <span className="text-[11px] opacity-50 shrink-0">({vendorCount})</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.aside>
              )}
            </AnimatePresence>

            {/* Products Grid */}
            <div className="flex-1 min-w-0">

              {/* Results count */}
              <div className="flex items-center justify-between mb-6">
                <p className="text-sm opacity-60">
                  {isLoading ? "Loading…" : `${data?.total ?? 0} products found`}
                </p>
              </div>

              {isLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-lg aspect-[3/4] animate-pulse bg-[#E6F0EA]" />
                  ))}
                </div>
              ) : products.length === 0 ? (
                <div className="text-center py-24">
                  <p className="text-4xl mb-4">🪡</p>
                  <h3 className="font-serif text-2xl mb-3">No sarees found</h3>
                  <p className="opacity-60 mb-6 text-sm">Try adjusting your filters or search term</p>
                  <button
                    onClick={resetFilters}
                    className="bg-[#1E6B5A] text-[#F3F8F5] border border-[#C9A84C]/50 px-6 py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#C9A84C] hover:text-[#1E6B5A] transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products.map((product, i) => (
                    <ProductCard key={product.id} product={product} index={i} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex justify-center gap-2 mt-12">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 border rounded text-sm font-medium transition-colors disabled:opacity-30 border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                  >
                    ← Prev
                  </button>

                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = i + 1;
                    return (
                      <button
                        key={pg}
                        onClick={() => setPage(pg)}
                        className={cn(
                          "w-10 h-10 border rounded text-sm font-medium transition-colors",
                          page === pg
                            ? "bg-[#C9A84C] text-[#1E6B5A] border-[#C9A84C]"
                            : "border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                        )}
                      >
                        {pg}
                      </button>
                    );
                  })}

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page >= totalPages}
                    className="px-4 py-2 border rounded text-sm font-medium transition-colors disabled:opacity-30 border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                  >
                    Next →
                  </button>
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
  color?: string;
  onRemove: () => void;
}

function FilterChip({ label, color, onRemove }: FilterChipProps) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#C9A84C]/15 border border-[#C9A84C]/40 text-[#3D1A1A] text-xs font-semibold"
    >
      {color && (
        <span
          className="w-2.5 h-2.5 rounded-full border border-black/10 shrink-0"
          style={{ backgroundColor: color }}
        />
      )}
      <span className="capitalize">{label}</span>
      <button
        onClick={onRemove}
        className="ml-0.5 rounded-full hover:bg-[#C9A84C]/30 transition-colors p-0.5"
        aria-label={`Remove ${label} filter`}
      >
        <X size={10} />
      </button>
    </motion.span>
  );
}
