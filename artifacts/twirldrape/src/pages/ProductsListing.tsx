import React, { useState, useCallback, useDeferredValue } from "react";
import { Layout } from "@/components/Layout";
import { useListProducts, useListVendors } from "@workspace/api-client-react";
import type { ListProductsParams, ListProductsSort } from "@workspace/api-client-react";
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
  { value: "maroon", label: "Maroon", hex: "#7B1C2C" },
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

export function ProductsListing({ category, title, subtitle }: ProductsListingProps) {
  const isDesigner = category === "designer";

  const [search, setSearch] = useState("");
  const [fabric, setFabric] = useState<string | undefined>();
  const [color, setColor] = useState<string | undefined>();
  const [occasion, setOccasion] = useState<string | undefined>();
  const [vendorId, setVendorId] = useState<string | undefined>();
  const [minPrice, setMinPrice] = useState<number | undefined>();
  const [maxPrice, setMaxPrice] = useState<number | undefined>();
  const [sort, setSort] = useState<ListProductsSort>("rating_desc");
  const [page, setPage] = useState(1);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [quickChip, setQuickChip] = useState<QuickChip>("all");
  const [minRating, setMinRating] = useState<number | undefined>();
  const [hasDiscount, setHasDiscount] = useState(false);

  const deferredSearch = useDeferredValue(search);

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
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
    ...(quickChip === "bestSeller" && { bestSeller: true }),
    ...(quickChip === "newArrival" && { newArrival: true }),
    ...(quickChip === "onSale" || hasDiscount ? { hasDiscount: true } : {}),
    ...(minRating !== undefined && { minRating }),
  };

  const { data, isLoading } = useListProducts(params);
  const { data: vendors } = useListVendors();

  const resetFilters = useCallback(() => {
    setFabric(undefined);
    setColor(undefined);
    setOccasion(undefined);
    setVendorId(undefined);
    setMinPrice(undefined);
    setMaxPrice(undefined);
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

  const activeFilterCount = [
    fabric,
    color,
    occasion,
    vendorId,
    minPrice,
    maxPrice,
    search,
    quickChip !== "all" ? quickChip : undefined,
    minRating,
    hasDiscount ? true : undefined,
  ].filter(Boolean).length;

  const hasActiveFilters = activeFilterCount > 0;
  const products = data?.products ?? [];
  const totalPages = data?.totalPages ?? 1;

  const bg = isDesigner ? "bg-[#1E2329] text-[#F5EDE0]" : "bg-[#FAF6EE] text-[#3D1A1A]";
  const filterBg = isDesigner ? "bg-[#2A2E35] border-[#C9A84C]/20" : "bg-white border-[#C9A84C]/10";
  const inputCls = isDesigner
    ? "bg-[#1E2329] border-[#C9A84C]/30 text-[#F5EDE0] placeholder-[#F5EDE0]/40"
    : "bg-[#FAF6EE] border-[#C9A84C]/30 text-[#3D1A1A] placeholder-[#3D1A1A]/40";

  const chipBase = "shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full border transition-all";
  const chipActive = "bg-[#C9A84C] text-[#7B1C2C] border-[#C9A84C]";
  const chipInactive = isDesigner
    ? "border-[#C9A84C]/30 text-[#F5EDE0]/70 hover:border-[#C9A84C] hover:text-[#F5EDE0]"
    : "border-[#C9A84C]/30 text-[#3D1A1A]/70 hover:border-[#C9A84C] hover:text-[#3D1A1A]";

  return (
    <div className={isDesigner ? "dark" : ""}>
      <Layout>
        <div className={cn("min-h-screen", bg)}>

          {/* Page Header */}
          <div className={cn("py-12 border-b border-[#C9A84C]/20", isDesigner ? "bg-[#2A2E35]" : "bg-[#F5EDE0]")}>
            <div className="container mx-auto px-4 text-center">
              <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-3">{subtitle}</p>
              <h1 className={cn("font-serif text-4xl md:text-5xl font-bold", isDesigner ? "text-[#F5EDE0]" : "text-[#7B1C2C]")}>
                {title}
              </h1>
              <div className="w-16 h-0.5 bg-[#C9A84C] mx-auto mt-6" />
            </div>
          </div>

          <div className="container mx-auto px-4 py-8 max-w-7xl">

            {/* Quick-filter chip bar — horizontally scrollable on mobile */}
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
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 opacity-40" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                  placeholder={`Search ${category} sarees…`}
                  className={cn(
                    "w-full pl-9 pr-4 py-3 border rounded-sm text-sm focus:outline-none focus:border-[#C9A84C] transition-colors",
                    inputCls
                  )}
                />
              </div>

              <div className="flex gap-3">
                <div className="relative">
                  <select
                    value={sort}
                    onChange={(e) => { setSort(e.target.value as ListProductsSort); setPage(1); }}
                    className={cn(
                      "appearance-none pl-4 pr-9 py-3 border rounded-sm text-sm font-medium focus:outline-none focus:border-[#C9A84C] cursor-pointer transition-colors",
                      inputCls
                    )}
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
                      ? "bg-[#C9A84C] text-[#7B1C2C] border-[#C9A84C]"
                      : isDesigner
                        ? "border-[#C9A84C]/30 text-[#F5EDE0] hover:border-[#C9A84C]"
                        : "border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                  )}
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {hasActiveFilters && (
                    <span className="bg-[#7B1C2C] text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>
              </div>
            </div>

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
                    <div className={cn("w-[280px] p-5 rounded-lg border space-y-6 sticky top-24", filterBg)}>
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
                          {RATING_OPTIONS.map((opt) => (
                            <label key={String(opt.value)} className="flex items-center gap-3 cursor-pointer group">
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
                              </span>
                            </label>
                          ))}
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

                      {/* Price Range */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Price Range</h4>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            placeholder="Min ₹"
                            value={minPrice ?? ""}
                            onChange={(e) => { setMinPrice(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
                            className={cn("w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-[#C9A84C]", inputCls)}
                          />
                          <input
                            type="number"
                            placeholder="Max ₹"
                            value={maxPrice ?? ""}
                            onChange={(e) => { setMaxPrice(e.target.value ? Number(e.target.value) : undefined); setPage(1); }}
                            className={cn("w-full px-3 py-2 border rounded text-xs focus:outline-none focus:border-[#C9A84C]", inputCls)}
                          />
                        </div>
                      </div>

                      {/* Color */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Color</h4>
                        <div className="flex flex-wrap gap-2">
                          {COLORS.map((c) => (
                            <button
                              key={c.value}
                              title={c.label}
                              onClick={() => { setColor(color === c.value ? undefined : c.value); setPage(1); }}
                              className={cn(
                                "w-7 h-7 rounded-full border-2 transition-all",
                                color === c.value
                                  ? "border-[#C9A84C] scale-110 shadow-md"
                                  : "border-transparent hover:border-[#C9A84C]/50"
                              )}
                              style={{ backgroundColor: c.hex }}
                            />
                          ))}
                        </div>
                        {color && (
                          <p className="text-xs mt-2 opacity-60 capitalize">{color} selected</p>
                        )}
                      </div>

                      {/* Fabric */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Fabric</h4>
                        <div className="space-y-1">
                          {FABRICS.map((f) => (
                            <label key={f} className="flex items-center gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={fabric === f}
                                onChange={() => { setFabric(fabric === f ? undefined : f); setPage(1); }}
                                className="accent-[#C9A84C]"
                              />
                              <span className="text-sm capitalize group-hover:text-[#C9A84C] transition-colors">{f}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Subcategory / Occasion (renamed from Occasion) */}
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Subcategory / Occasion</h4>
                        <div className="space-y-1">
                          {OCCASIONS.map((o) => (
                            <label key={o} className="flex items-center gap-3 cursor-pointer group">
                              <input
                                type="checkbox"
                                checked={occasion === o}
                                onChange={() => { setOccasion(occasion === o ? undefined : o); setPage(1); }}
                                className="accent-[#C9A84C]"
                              />
                              <span className="text-sm capitalize group-hover:text-[#C9A84C] transition-colors">{o}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Brand / Shop (renamed from Vendor) */}
                      {vendors && vendors.length > 0 && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider opacity-60 mb-3">Brand / Shop</h4>
                          <div className="space-y-1">
                            {vendors.map((v) => (
                              <label key={v.id} className="flex items-center gap-3 cursor-pointer group">
                                <input
                                  type="checkbox"
                                  checked={vendorId === v.id}
                                  onChange={() => { setVendorId(vendorId === v.id ? undefined : v.id); setPage(1); }}
                                  className="accent-[#C9A84C]"
                                />
                                <span className="text-sm group-hover:text-[#C9A84C] transition-colors">{v.name}</span>
                              </label>
                            ))}
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
                      <div key={i} className={cn("rounded-lg aspect-[3/4] animate-pulse", isDesigner ? "bg-[#2A2E35]" : "bg-[#F5EDE0]")} />
                    ))}
                  </div>
                ) : products.length === 0 ? (
                  <div className="text-center py-24">
                    <p className="text-4xl mb-4">🪡</p>
                    <h3 className="font-serif text-2xl mb-3">No sarees found</h3>
                    <p className="opacity-60 mb-6 text-sm">Try adjusting your filters or search term</p>
                    <button
                      onClick={resetFilters}
                      className="bg-[#C9A84C] text-[#7B1C2C] px-6 py-3 font-bold uppercase tracking-wider text-xs rounded-sm"
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
                      className={cn(
                        "px-4 py-2 border rounded text-sm font-medium transition-colors disabled:opacity-30",
                        isDesigner
                          ? "border-[#C9A84C]/30 text-[#F5EDE0] hover:border-[#C9A84C]"
                          : "border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                      )}
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
                              ? "bg-[#C9A84C] text-[#7B1C2C] border-[#C9A84C]"
                              : isDesigner
                                ? "border-[#C9A84C]/30 text-[#F5EDE0] hover:border-[#C9A84C]"
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
                      className={cn(
                        "px-4 py-2 border rounded text-sm font-medium transition-colors disabled:opacity-30",
                        isDesigner
                          ? "border-[#C9A84C]/30 text-[#F5EDE0] hover:border-[#C9A84C]"
                          : "border-[#C9A84C]/30 text-[#3D1A1A] hover:border-[#C9A84C]"
                      )}
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
    </div>
  );
}
