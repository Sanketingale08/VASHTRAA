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
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons";
import { ProductSection } from "@/components/ProductSection";
import { QuickViewModal } from "@/components/QuickViewModal";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { PriceRangeCards } from "@/components/PriceRangeCards";
import { AdvertisementCarousel } from "@/components/AdvertisementCarousel";
import type { ProductSummary } from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { isPaithaniProduct, isDesignerProduct } from "@/constants/categories";

const GOLD = "#C7CCD1";
const MAROON = "#0A1F44";
const IVORY = "#F4F5F7";
const CREAM = "#E5E8EC";
const NAVY_DARK = "#0B0C10";
const ROYAL_ACCENT = "#2C3E6B";

const PAITHANI_DESIGNER_TABS = [
  { label: "Paithani", category: "paithani" as const },
  { label: "Designer", category: "designer" as const },
];

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
    <section className="py-12 md:py-16 bg-white dark:bg-[#0B0C10]" role="status" aria-busy="true">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <SectionTitle subtitle="Pick up where you left off">
          Recently Viewed Products
        </SectionTitle>
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-32 h-10 rounded-full bg-gray-200 animate-pulse" />
          <div className="w-32 h-10 rounded-full bg-gray-200 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
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

  const [selectedCategory, setSelectedCategory] = useState<"paithani" | "designer">("paithani");
  const userSelectedTabRef = useRef(false);

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

  const hasIds = ids.length > 0;
  const recentlyViewedParams = { ids: hasIds ? ids.join(",") : undefined, limit: 16 };
  const { data: recentData, isLoading: isRecentLoading } = useListProducts(recentlyViewedParams, {
    query: {
      enabled: hasIds,
      queryKey: getListProductsQueryKey(recentlyViewedParams),
    },
  });

  const categoryCatalogParams = { category: selectedCategory, limit: 8 };
  const { data: categoryData, isLoading: isCategoryLoading } = useListProducts(categoryCatalogParams, {
    query: {
      queryKey: getListProductsQueryKey(categoryCatalogParams),
    },
  });

  // Automatically sync tab with category of latest viewed product on mount/update if user hasn't toggled
  useEffect(() => {
    if (userSelectedTabRef.current || !hasIds || !recentData?.products?.length) return;
    const latestProduct = recentData.products.find((p) => p.id === ids[0]);
    if (latestProduct) {
      if (isDesignerProduct(latestProduct) && selectedCategory !== "designer") {
        setSelectedCategory("designer");
      } else if (isPaithaniProduct(latestProduct) && selectedCategory !== "paithani") {
        setSelectedCategory("paithani");
      }
    }
  }, [recentData?.products, ids, hasIds, selectedCategory]);

  const categoryRecentlyViewed = useMemo(() => {
    if (!recentData?.products || !hasIds) return [];
    return recentData.products
      .filter((p) => (selectedCategory === "paithani" ? isPaithaniProduct(p) : isDesignerProduct(p)))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  }, [recentData?.products, ids, hasIds, selectedCategory]);

  const hasRecentlyViewedForCategory = categoryRecentlyViewed.length > 0;
  const productsToDisplay = hasRecentlyViewedForCategory
    ? categoryRecentlyViewed
    : (categoryData?.products ?? []);

  const isLoading = hasIds ? isRecentLoading : isCategoryLoading;

  return (
    <section className="py-12 md:py-16 bg-white dark:bg-[#0B0C10]">
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        <SectionTitle
          subtitle={
            hasRecentlyViewedForCategory
              ? `Pick up where you left off with your viewed ${selectedCategory === "paithani" ? "Paithani" : "Designer"} sarees`
              : `Explore handcrafted ${selectedCategory === "paithani" ? "Paithani" : "Designer"} sarees`
          }
        >
          Recently Viewed Products
        </SectionTitle>

        {/* 2 Options: Paithani and Designer */}
        <div className="flex items-center justify-center gap-2.5 sm:gap-3 mb-8" role="tablist" aria-label="Recently viewed categories">
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "paithani"}
            onClick={() => {
              userSelectedTabRef.current = true;
              setSelectedCategory("paithani");
            }}
            className={cn(
              "px-6 sm:px-8 py-2.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border flex items-center justify-center min-w-[120px] sm:min-w-[140px]",
              selectedCategory === "paithani"
                ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md ring-2 ring-[#0A1F44]/20 font-bold"
                : "bg-white text-[#0A1F44] border-[#C7CCD1]/60 hover:border-[#0A1F44] hover:bg-gray-50 font-medium"
            )}
          >
            Paithani
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={selectedCategory === "designer"}
            onClick={() => {
              userSelectedTabRef.current = true;
              setSelectedCategory("designer");
            }}
            className={cn(
              "px-6 sm:px-8 py-2.5 rounded-full text-xs sm:text-sm font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border flex items-center justify-center min-w-[120px] sm:min-w-[140px]",
              selectedCategory === "designer"
                ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md ring-2 ring-[#0A1F44]/20 font-bold"
                : "bg-white text-[#0A1F44] border-[#C7CCD1]/60 hover:border-[#0A1F44] hover:bg-gray-50 font-medium"
            )}
          >
            Designer
          </button>
        </div>

        {/* Product Cards Grid or Skeletons or Empty State */}
        {isLoading && productsToDisplay.length === 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : productsToDisplay.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            {productsToDisplay.slice(0, 8).map((p, i) => (
              <ProductCard key={p.id} product={p} index={i} onQuickView={onQuickView} />
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-gray-500 bg-gray-50 rounded-xl border border-dashed border-gray-200">
            <p className="text-sm">No {selectedCategory === "paithani" ? "Paithani" : "Designer"} sarees viewed yet.</p>
            <Link
              href={selectedCategory === "paithani" ? "/paithani" : "/designer"}
              className="inline-block mt-3 text-xs font-bold uppercase tracking-wider text-[#0A1F44] underline hover:text-[#2C3E6B]"
            >
              Explore {selectedCategory === "paithani" ? "Paithani" : "Designer"} Collection →
            </Link>
          </div>
        )}

        <div className="mt-6 md:mt-8 flex justify-end">
          <Link
            href={selectedCategory === "paithani" ? "/paithani/shop" : "/designer/shop"}
            className="inline-flex items-center gap-1 font-bold text-xs md:text-sm uppercase tracking-wider px-5 py-2.5 rounded-md border border-[#0A1F44] text-[#0A1F44] bg-white transition-all duration-300 hover:shadow-md hover:bg-[#0A1F44] hover:text-white"
          >
            View All {selectedCategory === "paithani" ? "Paithani" : "Designer"} Sarees →
          </Link>
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

  const [selectedCategory, setSelectedCategory] = useState<"paithani" | "designer" | "all">(() => {
    const cat = searchParams.get("category")?.toLowerCase();
    if (cat === "designer") return "designer";
    if (cat === "all" || cat === "all-sarees" || cat === "sarees") return "all";
    return "paithani";
  });

  const handleBudgetSelect = (min?: number, max?: number) => {
    const params = new URLSearchParams();
    if (selectedCategory === "designer") {
      params.set("category", "designer");
      if (min !== undefined) params.set("minPrice", String(min));
      if (max !== undefined) params.set("maxPrice", String(max));
      const qs = params.toString();
      navigate(`/designer?${qs}`);
    } else if (selectedCategory === "all") {
      params.set("category", "all-sarees");
      if (min !== undefined) params.set("minPrice", String(min));
      if (max !== undefined) params.set("maxPrice", String(max));
      const qs = params.toString();
      navigate(`/products?${qs}`);
    } else {
      // paithani (default)
      params.set("category", "paithani");
      if (min !== undefined) params.set("minPrice", String(min));
      if (max !== undefined) params.set("maxPrice", String(max));
      const qs = params.toString();
      navigate(`/paithani?${qs}`);
    }
  };

  const catalogLink = React.useMemo(() => {
    if (selectedCategory === "designer") {
      return "/designer?category=designer";
    }
    if (selectedCategory === "all") {
      return "/products?category=all-sarees";
    }
    return "/paithani?category=paithani";
  }, [selectedCategory]);

  const categoryLabel = selectedCategory === "paithani" ? "Paithani" : selectedCategory === "designer" ? "Designer" : "All Saree";

  return (
    <Layout>
      {/* ── 1. MAIN HERO: ARTISAN HANDLOOM COLLECTION (CARD LAYOUT) ── */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-4 pb-2 sm:pt-6 sm:pb-4 md:pt-8 md:pb-6">
        <div className="relative w-full overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-[#031535] via-[#07224F] to-[#02102B] text-white border border-[#D4AF37]/30 shadow-2xl shadow-[#031535]/25 px-6 sm:px-10 md:px-12 lg:px-14 py-8 sm:py-10 md:py-12 lg:py-14">
          {/* Top golden luxury accent line */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E2C799]/50 to-transparent pointer-events-none" />

          {/* Subtle background mandala / lotus ornaments */}
          <div className="absolute -left-16 -bottom-16 opacity-15 pointer-events-none text-[#D4AF37]">
            <svg width="340" height="340" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.8">
              <circle cx="50" cy="50" r="45" strokeDasharray="2 2" />
              <circle cx="50" cy="50" r="35" />
              <path d="M50 5 C55 25, 75 25, 75 50 C75 75, 55 75, 50 95 C45 75, 25 75, 25 50 C25 25, 45 25, 50 5 Z" />
              <path d="M5 50 C25 55, 25 75, 50 75 C75 75, 75 55, 95 50 C75 45, 75 25, 50 25 C25 25, 25 45, 5 50 Z" />
            </svg>
          </div>
          <div className="absolute -right-20 -top-20 opacity-10 pointer-events-none text-[#D4AF37]">
            <svg width="360" height="360" viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="0.8">
              <circle cx="50" cy="50" r="40" />
              <path d="M50 10 C60 30, 80 30, 80 50 C80 70, 60 70, 50 90 C40 70, 20 70, 20 50 C20 30, 40 30, 50 10 Z" />
            </svg>
          </div>

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Saree showcase image (Fixed Left Side) */}
            <div className="lg:col-span-5 flex justify-center items-center relative py-4 lg:py-0">
              {/* Golden radial ambient aura glow */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-64 h-64 sm:w-80 sm:h-80 md:w-96 md:h-96 rounded-full bg-[radial-gradient(circle,rgba(226,199,153,0.25)_0%,rgba(212,175,55,0.08)_50%,transparent_75%)] blur-2xl sm:blur-3xl" />
              </div>

              {/* Decorative concentric rings backdrop */}
              <div className="absolute w-56 h-56 sm:w-72 sm:h-72 md:w-80 md:h-80 rounded-full border border-[#E2C799]/30 pointer-events-none flex items-center justify-center">
                <div className="w-44 h-44 sm:w-56 sm:h-56 md:w-64 md:h-64 rounded-full border border-[#E2C799]/20 border-dashed" />
              </div>

              {/* Floating saree image */}
              <div className="relative z-10 w-56 sm:w-72 md:w-80 lg:w-96 max-h-[340px] sm:max-h-[400px] flex items-center justify-center py-2">
                <img
                  src="/images/artisan-handloom-saree.png"
                  alt="Authentic Paithani & Designer Saree"
                  className="w-auto h-auto max-w-full max-h-[300px] sm:max-h-[360px] md:max-h-[400px] object-contain filter drop-shadow-[0_20px_35px_rgba(0,0,0,0.7)] hover:scale-105 transition-transform duration-500 select-none"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = "/images/product-1.png";
                  }}
                />
              </div>
            </div>

            {/* Text content & CTA Buttons (Right Side) */}
            <div className="lg:col-span-7 text-center lg:text-left flex flex-col justify-center items-center lg:items-start">
              {/* Eyebrow / Label */}
              <div className="inline-flex items-center gap-2 mb-3.5 px-3.5 py-1.5 rounded-full bg-white/5 border border-[#E2C799]/30 backdrop-blur-xs text-[#E2C799]">
                <svg className="w-3.5 h-3.5 fill-current text-[#E2C799] shrink-0" viewBox="0 0 24 24">
                  <path d="M12 3c-1.5 3-4 5-7 5 3 2 4.5 5 5 8 1-3 2.5-6 5.5-8-3 0-5.5-2-7-5z" />
                  <path d="M12 11c-1 2-2.5 3.5-4.5 4 2 1.5 3 3.5 3.5 5 1-1.5 2-3.5 4-5-2-.5-3.5-2-4.5-4z" opacity="0.7" />
                </svg>
                <span className="text-xs uppercase tracking-[0.22em] font-bold text-[#E2C799]">
                  ARTISAN HANDLOOM COLLECTION
                </span>
              </div>

              {/* Main Heading (H1) */}
              <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-5xl xl:text-6xl font-bold text-white mb-4 sm:mb-5 leading-[1.15] tracking-tight">
                Authentic Paithani &amp; Designer Sarees
              </h1>

              {/* Description */}
              <p className="text-sm sm:text-base md:text-lg text-gray-200/90 leading-relaxed max-w-xl mb-7 sm:mb-8 font-light">
                Handcrafted by master artisans from Maharashtra, our sarees feature vibrant silk fabrics adorned with traditional peacock, muniya, and floral motifs, making them perfect for special occasions.
              </p>

              {/* Primary & Secondary CTA Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5 sm:gap-4 w-full sm:w-auto">
                <Link
                  href="/paithani"
                  className="inline-flex items-center justify-center gap-2.5 bg-[#FCE3B4] hover:bg-[#fbd89a] text-[#031535] font-bold px-7 py-3.5 sm:py-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider transition-all duration-200 shadow-xl hover:shadow-2xl hover:-translate-y-0.5 group whitespace-nowrap active:scale-[0.98] cursor-pointer"
                >
                  <span>SHOP PAITHANI SAREES</span>
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1 text-[#031535]" />
                </Link>
                <Link
                  href="/designer"
                  className="inline-flex items-center justify-center gap-2.5 bg-white/10 hover:bg-white/20 text-white border border-[#FCE3B4]/60 hover:border-[#FCE3B4] font-bold px-7 py-3.5 sm:py-4 rounded-xl text-xs sm:text-sm uppercase tracking-wider transition-all duration-200 shadow-lg hover:shadow-xl hover:-translate-y-0.5 group whitespace-nowrap backdrop-blur-xs active:scale-[0.98] cursor-pointer"
                >
                  <span>SHOP DESIGNER SAREES</span>
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1 text-[#FCE3B4]" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 2. SHOP BY BUDGET (MYNTRA-STYLE PRICE CARDS & CATEGORY FILTER) ── */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 my-12">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between mb-6 gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#C7CCD1]">Shop By Budget</p>
            <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">Explore Saree Collections by Price</h2>
          </div>
          <Link
            href={catalogLink}
            className="text-xs font-bold text-[#0A1F44] uppercase tracking-wider hover:underline flex items-center gap-1"
          >
            View All {selectedCategory === "all" ? "Sarees" : selectedCategory === "paithani" ? "Paithani" : "Designer"} in Catalog <ArrowRight size={13} />
          </Link>
        </div>

        {/* Category Selection Buttons */}
        <div className="flex items-center gap-2.5 sm:gap-3 mb-6 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedCategory("paithani")}
            className={cn(
              "px-5 sm:px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border flex items-center justify-center min-w-[110px]",
              selectedCategory === "paithani"
                ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md ring-2 ring-[#0A1F44]/20 font-bold"
                : "bg-white text-[#0A1F44] border-[#C7CCD1]/50 hover:border-[#0A1F44] hover:bg-gray-50 font-medium"
            )}
          >
            Paithani
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("designer")}
            className={cn(
              "px-5 sm:px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border flex items-center justify-center min-w-[110px]",
              selectedCategory === "designer"
                ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md ring-2 ring-[#0A1F44]/20 font-bold"
                : "bg-white text-[#0A1F44] border-[#C7CCD1]/50 hover:border-[#0A1F44] hover:bg-gray-50 font-medium"
            )}
          >
            Designer
          </button>
          <button
            type="button"
            onClick={() => setSelectedCategory("all")}
            className={cn(
              "px-5 sm:px-6 py-2.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer border flex items-center justify-center min-w-[110px]",
              selectedCategory === "all"
                ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md ring-2 ring-[#0A1F44]/20 font-bold"
                : "bg-white text-[#0A1F44] border-[#C7CCD1]/50 hover:border-[#0A1F44] hover:bg-gray-50 font-medium"
            )}
          >
            All Sarees
          </button>
        </div>

        {/* Interactive Price Cards */}
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
