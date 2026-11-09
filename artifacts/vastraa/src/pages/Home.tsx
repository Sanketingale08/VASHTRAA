import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import {
  Star,
  CheckCircle,
  ArrowRight,
  X,
  Check,
  Clock,
  Trash2,
  Eye,
  Sparkles,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons";
import { ProductSection } from "@/components/ProductSection";
import { QuickViewModal } from "@/components/QuickViewModal";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { PriceRangeCards } from "@/components/PriceRangeCards";
import { BUDGET_RANGES, getBudgetById, getBudgetByPrice } from "@/constants/budget";
import { AdvertisementCarousel } from "@/components/AdvertisementCarousel";
import type { ProductSummary } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import {
  isCategoryProduct,
  CATALOG_CATEGORIES,
  isMainCatalogCategory,
} from "@/constants/categories";

const GOLD = "#C7CCD1";
const MAROON = "#0A1F44";
const IVORY = "#F4F5F7";
const CREAM = "#E5E8EC";
const NAVY_DARK = "#0B0C10";
const ROYAL_ACCENT = "#2C3E6B";

function SectionTitle({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="text-center mb-8 md:mb-10">
      <div className="flex items-center justify-center gap-3 md:gap-4 mb-2.5">
        <span
          className="flex-1 max-w-[60px] md:max-w-[80px] h-px"
          style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }}
        />
        <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#0A1F44]">
          {children}
        </h2>
        <span
          className="flex-1 max-w-[60px] md:max-w-[80px] h-px"
          style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }}
        />
      </div>
      {subtitle && (
        <p className="text-sm md:text-base text-gray-500 max-w-2xl mx-auto">
          {subtitle}
        </p>
      )}
    </div>
  );
}

const categories = [
  { label: "Paithani Sarees", image: "/images/hero-paithani-1.png", href: "/paithani" },
  { label: "Designer Sarees", image: "/images/hero-designer-1.png", href: "/designer" },
  { label: "Bridal Collection", image: "/images/hero-paithani-2.png", href: "/paithani/shop" },
  { label: "Party Wear", image: "/images/hero-designer-2.png", href: "/designer/shop" },
  { label: "Festival Collection", image: "/images/hero-paithani-3.png", href: "/festival" },
  { label: "New Arrivals", image: "/images/product-1.png", href: "/paithani/shop?newArrival=true" },
];

const testimonials = [
  { name: "Priya Sharma", city: "Mumbai", rating: 5, quote: "The Paithani saree I ordered was absolutely stunning — the colors were exactly as shown and the quality is exceptional. Received so many compliments at the wedding!", avatar: "/images/artisan-1.png" },
  { name: "Ananya Kulkarni", city: "Pune", rating: 5, quote: "VASTRAA made finding my bridal saree a dream. The vendor was super responsive and the saree arrived beautifully packed. Highly recommend!", avatar: "/images/artisan-2.png" },
  { name: "Deepa Menon", city: "Bangalore", rating: 5, quote: "I've been searching for authentic Yeola Paithani for years. VASTRAA connected me directly with the weaver and the saree is a masterpiece. Worth every rupee.", avatar: "/images/artisan-3.png" },
];


function RecentlyViewedSkeleton() {
  return (
    <section className="py-12 md:py-16 bg-white dark:bg-[#0B0C10] border-t border-b border-gray-100 dark:border-gray-800/60" role="status" aria-busy="true">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <div className="flex justify-center mb-4">
          <div className="w-36 h-6 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
        </div>
        <SectionTitle subtitle="Pick up where you left off">
          Recently Viewed Products
        </SectionTitle>
        <div className="flex flex-wrap items-center justify-center gap-2.5 sm:gap-3 mb-8">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="w-24 sm:w-28 h-9 rounded-full bg-gray-200 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5 lg:gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentlyViewedSection({ onQuickView }: { onQuickView: (p: ProductSummary) => void }) {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("twirl_recently_viewed") ?? "[]");
    } catch {
      return [];
    }
  });

  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  useEffect(() => {
    function loadIds() {
      try {
        const stored: string[] = JSON.parse(localStorage.getItem("twirl_recently_viewed") ?? "[]");
        setIds(stored);
      } catch {
        setIds([]);
      }
    }

    loadIds();
    document.addEventListener("visibilitychange", loadIds);
    window.addEventListener("popstate", loadIds);

    return () => {
      document.removeEventListener("visibilitychange", loadIds);
      window.removeEventListener("popstate", loadIds);
    };
  }, []);

  const handleClearHistory = () => {
    try {
      localStorage.removeItem("twirl_recently_viewed");
      setIds([]);
      setSelectedCategory("all");
    } catch {}
  };

  const hasIds = ids.length > 0;
  const recentlyViewedParams = { ids: hasIds ? ids.join(",") : undefined, limit: 20 };
  const { data: recentData, isLoading: isRecentLoading } = useListProducts(recentlyViewedParams, {
    query: {
      enabled: hasIds,
      queryKey: getListProductsQueryKey(recentlyViewedParams),
    },
  });

  const fallbackParams = selectedCategory === "all"
    ? { limit: 8 }
    : { category: selectedCategory as any, limit: 8 };

  const { data: fallbackData, isLoading: isFallbackLoading } = useListProducts(fallbackParams, {
    query: {
      enabled: !hasIds,
      queryKey: getListProductsQueryKey(fallbackParams),
    },
  });

  // Category Tabs encompassing all categories
  const categoryTabs = useMemo(() => {
    return [
      { id: "all", name: "All Categories", shortName: "All", slug: "all" },
      ...CATALOG_CATEGORIES.map((c) => ({
        id: c.id,
        name: c.name,
        shortName: c.name,
        slug: c.slug,
      })),
    ];
  }, []);

  const currentCategoryItem = useMemo(() => {
    if (selectedCategory === "all") {
      return { id: "all", name: "All Categories", shortName: "All", slug: "all" };
    }
    return categoryTabs.find((c) => c.slug === selectedCategory) || categoryTabs[0];
  }, [selectedCategory, categoryTabs]);

  // All viewed products sorted in reverse chronological order
  const allViewedProducts = useMemo(() => {
    if (!recentData?.products || !hasIds) return [];
    return [...recentData.products].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }, [recentData?.products, ids, hasIds]);

  // Count viewed products for every category
  const viewedCountByCategory = useMemo(() => {
    const counts: Record<string, number> = {
      all: allViewedProducts.length,
    };
    if (!allViewedProducts.length) return counts;
    for (const cat of CATALOG_CATEGORIES) {
      counts[cat.slug] = allViewedProducts.filter((p) => isCategoryProduct(p, cat.slug)).length;
    }
    return counts;
  }, [allViewedProducts]);

  // Filter recently viewed products for the active tab
  const categoryRecentlyViewed = useMemo(() => {
    if (selectedCategory === "all") return allViewedProducts;
    return allViewedProducts.filter((p) => isCategoryProduct(p, selectedCategory));
  }, [allViewedProducts, selectedCategory]);

  const productsToDisplay = hasIds
    ? categoryRecentlyViewed.slice(0, 8)
    : (fallbackData?.products?.slice(0, 8) ?? []);

  const isLoading = hasIds ? isRecentLoading : isFallbackLoading;

  const categoryShopUrl = useMemo(() => {
    if (selectedCategory === "all") return "/products";
    return `/${selectedCategory}`;
  }, [selectedCategory]);

  const subtitle = useMemo(() => {
    if (hasIds) {
      if (selectedCategory === "all") {
        return "Pick up right where you left off across all your viewed styles";
      }
      return `Pick up where you left off with your viewed ${currentCategoryItem.shortName}`;
    }
    if (selectedCategory === "all") {
      return "Handcrafted luxury and contemporary pieces curated for you";
    }
    return `Explore handcrafted ${currentCategoryItem.shortName} and discover your style`;
  }, [hasIds, selectedCategory, currentCategoryItem.shortName]);

  return (
    <section className="py-12 md:py-16 bg-white dark:bg-[#0B0C10] border-t border-b border-gray-100 dark:border-gray-800/60" aria-label="Recently Viewed Products">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Eyebrow & Optional Clear History Action */}
        <div className="flex items-center justify-between gap-4 mb-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold tracking-wide bg-[#0A1F44]/5 dark:bg-[#0A1F44]/25 text-[#0A1F44] dark:text-[#C7CCD1] border border-[#0A1F44]/15 dark:border-gray-800">
            <Clock className="w-3.5 h-3.5 text-[#0A1F44] dark:text-[#D4AF37]" />
            <span>{hasIds ? "Your Browsing History" : "Featured For You"}</span>
            {hasIds && allViewedProducts.length > 0 && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            )}
          </div>

          {hasIds && (
            <button
              type="button"
              onClick={handleClearHistory}
              aria-label="Clear recently viewed history"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 transition-colors px-3 py-1 rounded-full hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer border border-transparent hover:border-rose-200 dark:hover:border-rose-900/40"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        <SectionTitle subtitle={subtitle}>
          Recently Viewed Products
        </SectionTitle>

        {/* Dynamic Category Tabs across All Categories */}
        <div className="mb-8">
          <div
            className="flex items-center gap-2 sm:gap-2.5 overflow-x-auto no-scrollbar pb-2 sm:pb-0 sm:flex-wrap sm:justify-center px-1"
            role="tablist"
            aria-label="Recently viewed categories"
          >
            {categoryTabs.map((cat) => {
              const isSelected = selectedCategory === cat.slug;
              const count = viewedCountByCategory[cat.slug] || 0;
              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedCategory(cat.slug)}
                  className={cn(
                    "px-4 sm:px-5 py-2 rounded-full text-xs sm:text-sm tracking-wide transition-all duration-200 cursor-pointer border flex items-center justify-center gap-1.5 shrink-0 whitespace-nowrap",
                    isSelected
                      ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md ring-2 ring-[#0A1F44]/20 font-bold dark:bg-[#2C3E6B] dark:border-[#2C3E6B]"
                      : "bg-white dark:bg-[#1E2329] text-[#0A1F44] dark:text-[#E5E8EC] border-gray-200 dark:border-gray-700/80 hover:border-[#0A1F44] dark:hover:border-[#C7CCD1] hover:bg-gray-50 dark:hover:bg-gray-800 font-medium"
                  )}
                >
                  <span>{cat.shortName}</span>
                  {hasIds && count > 0 && (
                    <span
                      className={cn(
                        "px-1.5 py-0.2 rounded-full text-[10px] font-bold leading-tight transition-colors",
                        isSelected
                          ? "bg-white/20 text-white"
                          : "bg-gray-100 dark:bg-gray-800 text-[#0A1F44] dark:text-[#D4AF37]"
                      )}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Product Cards Grid or Skeletons or Empty State */}
        {isLoading && productsToDisplay.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5 lg:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : productsToDisplay.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5 sm:gap-5 lg:gap-6">
            {productsToDisplay.map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} onQuickView={onQuickView} />
            ))}
          </div>
        ) : (
          <div className="text-center py-12 px-4 bg-gray-50/80 dark:bg-[#1E2329]/50 rounded-2xl border border-dashed border-gray-200 dark:border-gray-800 max-w-lg mx-auto">
            <div className="w-12 h-12 rounded-full bg-[#0A1F44]/5 dark:bg-[#0A1F44]/20 flex items-center justify-center mx-auto mb-3 text-[#0A1F44] dark:text-[#D4AF37]">
              <Eye className="w-5 h-5 text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="font-serif text-base font-semibold text-gray-900 dark:text-gray-100 mb-1">
              No {currentCategoryItem.shortName} viewed yet
            </h3>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">
              Explore our handcrafted {currentCategoryItem.shortName.toLowerCase()} and add pieces to your personal browsing list.
            </p>
            <Link
              href={categoryShopUrl}
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-full bg-[#0A1F44] text-white hover:bg-[#2C3E6B] transition-colors shadow-sm"
            >
              <span>Explore {currentCategoryItem.shortName} Collection</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}

        {/* Bottom Catalog Action Link */}
        <div className="mt-8 flex justify-center sm:justify-end">
          <Link
            href={categoryShopUrl}
            className="inline-flex items-center gap-2 font-bold text-xs sm:text-sm uppercase tracking-wider px-6 py-3 rounded-lg border border-[#0A1F44] text-[#0A1F44] bg-white dark:bg-[#1E2329] dark:text-[#E5E8EC] dark:border-gray-700 transition-all duration-300 hover:shadow-md hover:bg-[#0A1F44] hover:text-white dark:hover:bg-[#2C3E6B] group"
          >
            <span>
              {selectedCategory === "all"
                ? "Explore Complete Catalog"
                : `View All ${currentCategoryItem.shortName}`}
            </span>
            <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function SareeCategoriesShowcaseSection() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const { data: dbCategoriesData } = useQuery<{ categories: any[] }>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      try {
        const res = await fetch(`${basePath}/api/categories`);
        if (!res.ok) return { categories: [] };
        return res.json();
      } catch {
        return { categories: [] };
      }
    },
    staleTime: 15_000,
    refetchOnWindowFocus: true,
  });

  // Official main categories (sarees, kurtis, kurta-sets, ethnic-dresses, western-dresses, winter-wear, tops)
  const officialOrder = ["sarees", "kurtis", "kurta-sets", "ethnic-dresses", "western-dresses", "winter-wear", "tops"];
  const dbCategories = dbCategoriesData?.categories || [];

  const displayCategories = officialOrder
    .map((slug) => {
      const fallback = CATALOG_CATEGORIES.find((cat) => cat.slug === slug);
      if (!fallback) return null;
      const dbMatch = dbCategories.find((c: any) => c.slug === slug || c.id === fallback.id);
      // Respect admin-controlled visibility: if explicitly marked inactive in DB, hide it
      if (dbMatch && dbMatch.active === false) return null;
      return {
        id: dbMatch?.id || fallback.id,
        name: dbMatch?.name || fallback.name,
        slug: fallback.slug,
        image: dbMatch?.coverImage || dbMatch?.image || fallback.coverImage || "/images/product-4.png",
        imageUpdatedAt: dbMatch?.imageUpdatedAt || dbMatch?.updatedAt || null,
        imageVersion: dbMatch?.imageVersion || null,
        description: dbMatch?.description || fallback.description,
        displayOrder: typeof dbMatch?.displayOrder === "number" ? dbMatch.displayOrder : fallback.displayOrder,
        productCount: typeof dbMatch?.productCount === "number" ? dbMatch.productCount : undefined,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return (
    <section className="py-6 sm:py-8 md:py-10 bg-gradient-to-b from-[#F4F5F7]/80 to-white" aria-label="Explore by Category">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
        <h1 className="sr-only">Explore by Category</h1>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3.5 sm:gap-4 md:gap-5">
          {displayCategories.map((cat, idx) => {
            const href = `/${cat.slug}`;
            return (
              <motion.div
                key={cat.id || cat.slug}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: idx * 0.05 }}
              >
                <Link
                  href={href}
                  className="group flex flex-col h-full bg-white hover:bg-[#F4F5F7]/80 rounded-2xl p-3 border border-[#C7CCD1]/40 hover:border-[#0A1F44]/40 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 text-center"
                >
                  <div className="relative aspect-[4/5] w-full rounded-xl overflow-hidden bg-gray-100 mb-3 shadow-2xs">
                    <img
                      src={getProductImageSrc(cat.image, cat.imageUpdatedAt || cat.imageVersion)}
                      alt={cat.name}
                      onError={replaceProductImageWithFallback}
                      className="w-full h-full object-cover object-top group-hover:scale-108 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-40 group-hover:opacity-20 transition-opacity" />
                    {typeof cat.productCount === "number" && cat.productCount > 0 && (
                      <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0A1F44]/80 text-white backdrop-blur-xs shadow-xs">
                        {cat.productCount} {cat.productCount === 1 ? "item" : "items"}
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-xs sm:text-sm md:text-base font-bold text-[#0A1F44] group-hover:text-[#2C3E6B] transition-colors line-clamp-1">
                    {cat.name}
                  </h3>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [quickViewProduct, setQuickViewProduct] = useState<ProductSummary | null>(null);
  const searchStr = useSearch();
  const searchParams = React.useMemo(() => new URLSearchParams(searchStr), [searchStr]);
  const [, navigate] = useLocation();

  const handleBudgetSelect = (min?: number, max?: number, budgetId?: string) => {
    const budget = budgetId
      ? getBudgetById(budgetId)
      : getBudgetByPrice(min, max) || (min !== undefined || max !== undefined ? null : BUDGET_RANGES[0]);

    const params = new URLSearchParams();
    if (budget) {
      params.set("budget", budget.id);
      if (budget.min !== undefined) params.set("minPrice", String(budget.min));
      if (budget.max !== undefined) params.set("maxPrice", String(budget.max));
    } else {
      if (min !== undefined) params.set("minPrice", String(min));
      if (max !== undefined) params.set("maxPrice", String(max));
    }

    const qs = params.toString();
    navigate(`/shop-by-budget${qs ? `?${qs}` : ""}`);
  };

  return (
    <Layout>
      {/* ── 1. WOMEN'S FASHION CATEGORIES SHOWCASE ── */}
      <SareeCategoriesShowcaseSection />

      {/* ── 2. SHOP BY BUDGET ── */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 my-12" aria-labelledby="shop-by-budget-heading">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C7CCD1]">SHOP BY BUDGET</p>
          <h2 id="shop-by-budget-heading" className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">
            Explore Collections by Price
          </h2>
        </div>

        {/* Display only the budget cards */}
        <PriceRangeCards
          variant="home"
          onSelect={handleBudgetSelect}
        />
      </section>

      {/* ── ADVERTISEMENT SCROLLING WINDOW ── */}
      <AdvertisementCarousel autoPlayIntervalMs={6000} />

      {/* ── RECENTLY VIEWED (FOR RETURN VISITORS) ── */}
      <RecentlyViewedSection onQuickView={setQuickViewProduct} />

      {/* ── TESTIMONIALS ── */}
      <section className="py-12 md:py-16 bg-[#F4F5F7]">
        <div className="max-w-7xl mx-auto px-4 md:px-8">
          <SectionTitle subtitle="Real stories from our cherished customers across India">
            Loved by Thousands
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-xl p-6 border shadow-sm flex flex-col gap-4 bg-white" style={{ borderColor: GOLD + "44" }}>
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={16} className="fill-current text-[#0A1F44]" />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed italic flex-1">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: GOLD + "22" }}>
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border-2" style={{ borderColor: GOLD + "55" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div>
                    <p className="font-semibold text-sm" style={{ color: MAROON }}>{t.name}</p>
                    <p className="text-xs text-gray-400">{t.city}</p>
                  </div>
                  <CheckCircle size={16} className="ml-auto" style={{ color: MAROON }} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUICK VIEW MODAL ── */}
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </Layout>
  );
}
