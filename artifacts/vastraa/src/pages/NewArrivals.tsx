import React, { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight, Home, ChevronRight, ChevronDown } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { QuickViewModal } from "@/components/QuickViewModal";
import { useListProducts } from "@workspace/api-client-react";
import type { ProductSummary, ListProductsSort } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";

import { PriceRangeCards } from "@/components/PriceRangeCards";

type CategoryFilter = "all" | "paithani" | "designer";

const SORT_OPTIONS: { value: ListProductsSort; label: string }[] = [
  { value: "newest", label: "Newest Arrivals" },
  { value: "rating_desc", label: "Top Rated" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
];

function SkeletonCard() {
  return (
    <div className="rounded-2xl overflow-hidden bg-white border border-[#C7CCD1]/20 shadow-xs animate-pulse flex flex-col h-full">
      <div className="aspect-[3/4] bg-gray-200" />
      <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
        <div className="space-y-2">
          <div className="h-2.5 bg-gray-200 rounded w-1/3" />
          <div className="h-4 bg-gray-200 rounded w-5/6" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
        <div className="space-y-2 pt-2 border-t border-gray-100">
          <div className="h-3 bg-gray-200 rounded w-1/4" />
          <div className="h-5 bg-gray-200 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function NewArrivals() {
  const [quickViewProduct, setQuickViewProduct] = useState<ProductSummary | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [sort, setSort] = useState<ListProductsSort>("newest");
  const [minPrice, setMinPrice] = useState<number | undefined>(undefined);
  const [maxPrice, setMaxPrice] = useState<number | undefined>(undefined);

  const { data, isLoading } = useListProducts({
    newArrival: true,
    sort,
    limit: 16,
    ...(categoryFilter !== "all" ? { category: categoryFilter } : {}),
    ...(minPrice !== undefined ? { minPrice } : {}),
    ...(maxPrice !== undefined ? { maxPrice } : {}),
  });

  const products = data?.products ?? [];
  const totalCount = data?.total ?? 0;

  const shopAllHref =
    categoryFilter === "paithani"
      ? "/paithani/shop?newArrival=true"
      : categoryFilter === "designer"
      ? "/designer/shop?newArrival=true"
      : null;

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
              <span className="text-[#0A1F44] font-bold">New Arrivals</span>
            </nav>
          </div>
        </div>


        {/* Main Content Area */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

          {/* Filter Chips & Sort Controls */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8 pb-4 border-b border-[#C7CCD1]/20">
            {/* Category Pill Filters */}
            <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto no-scrollbar pb-1 sm:pb-0">
              <button
                onClick={() => setCategoryFilter("all")}
                className={cn(
                  "shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full border transition-all cursor-pointer shadow-xs",
                  categoryFilter === "all"
                    ? "bg-[#0A1F44] text-[#F4F5F7] border-[#0A1F44]"
                    : "bg-white border-[#C7CCD1]/40 text-[#3D1A1A]/80 hover:border-[#0A1F44]/40 hover:text-[#0A1F44]"
                )}
              >
                All New Arrivals
              </button>
              <button
                onClick={() => setCategoryFilter("paithani")}
                className={cn(
                  "shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full border transition-all cursor-pointer shadow-xs",
                  categoryFilter === "paithani"
                    ? "bg-[#0A1F44] text-[#F4F5F7] border-[#0A1F44]"
                    : "bg-white border-[#C7CCD1]/40 text-[#3D1A1A]/80 hover:border-[#0A1F44]/40 hover:text-[#0A1F44]"
                )}
              >
                🪡 Paithani Sarees
              </button>
              <button
                onClick={() => setCategoryFilter("designer")}
                className={cn(
                  "shrink-0 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-full border transition-all cursor-pointer shadow-xs",
                  categoryFilter === "designer"
                    ? "bg-[#0A1F44] text-[#F4F5F7] border-[#0A1F44]"
                    : "bg-white border-[#C7CCD1]/40 text-[#3D1A1A]/80 hover:border-[#0A1F44]/40 hover:text-[#0A1F44]"
                )}
              >
                💎 Designer Sarees
              </button>
            </div>

            {/* Sort & Count */}
            <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
              <p className="text-xs text-gray-500 font-medium sm:hidden">
                {!isLoading && `${products.length} sarees`}
              </p>
              <div className="relative">
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as ListProductsSort)}
                  className="appearance-none pl-3.5 pr-8 py-2 bg-white border border-[#C7CCD1]/40 rounded-lg text-xs font-semibold text-[#0A1F44] focus:outline-none focus:border-[#0A1F44] cursor-pointer transition-colors shadow-xs"
                >
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
              </div>
            </div>
          </div>

          {/* Quick Price Range Filters */}
          <div className="mb-6 bg-white/60 backdrop-blur-xs p-3 rounded-xl border border-[#C7CCD1]/30">
            <PriceRangeCards
              variant="strip"
              activeMin={minPrice}
              activeMax={maxPrice}
              onSelect={(min, max) => {
                setMinPrice(min);
                setMaxPrice(max);
              }}
            />
          </div>

          {/* Standardized Responsive Product Grid */}
          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-12 text-center my-4 shadow-xs">
              <div className="w-16 h-16 bg-[#F4F5F7] rounded-full flex items-center justify-center mx-auto mb-4 text-2xl">
                ✨
              </div>
              <h3 className="font-serif text-xl sm:text-2xl font-bold text-[#0A1F44] mb-2">No products available at the moment.</h3>
              <p className="text-gray-500 text-sm max-w-md mx-auto mb-6">
                Please check back soon for authentic handcrafted sarees from registered artisans.
              </p>
              {categoryFilter !== "all" && (
                <button
                  onClick={() => setCategoryFilter("all")}
                  className="bg-[#0A1F44] text-white px-6 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors shadow-sm"
                >
                  View All New Arrivals
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
              {products.map((product, i) => (
                <div key={product.id} className="h-full flex flex-col">
                  <ProductCard product={product} index={i} onQuickView={setQuickViewProduct} />
                </div>
              ))}
            </div>
          )}

          {/* Bottom Action Section */}
          {!isLoading && products.length > 0 && (
            <div className="mt-12 sm:mt-16 text-center">
              {shopAllHref ? (
                <Link
                  href={shopAllHref}
                  className="inline-flex items-center gap-2 font-bold text-xs sm:text-sm uppercase tracking-widest px-8 py-3.5 rounded-lg border-2 border-[#0A1F44] text-[#0A1F44] bg-white hover:bg-[#0A1F44] hover:text-white transition-all shadow-xs"
                >
                  Browse Full {categoryFilter === "paithani" ? "Paithani" : "Designer"} Catalog <ArrowRight size={14} />
                </Link>
              ) : (
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    href="/paithani/shop?newArrival=true"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold text-xs sm:text-sm uppercase tracking-widest px-8 py-3.5 rounded-lg border-2 border-[#0A1F44] text-[#0A1F44] bg-white hover:bg-[#0A1F44] hover:text-white transition-all shadow-xs"
                  >
                    View All Paithani Sarees <ArrowRight size={14} />
                  </Link>
                  <Link
                    href="/designer/shop?newArrival=true"
                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 font-bold text-xs sm:text-sm uppercase tracking-widest px-8 py-3.5 rounded-lg border-2 border-[#0A1F44] text-[#0A1F44] bg-white hover:bg-[#0A1F44] hover:text-white transition-all shadow-xs"
                  >
                    View All Designer Sarees <ArrowRight size={14} />
                  </Link>
                </div>
              )}
            </div>
          )}

        </div>
      </div>

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
      )}
    </Layout>
  );
}
