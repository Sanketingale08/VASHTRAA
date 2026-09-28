import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Award,
  Crown,
  Clock,
  Sparkles,
  Play,
  ArrowRight,
  ZoomIn,
  Eye,
  ShoppingBag,
  Heart,
  Search,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { ProductSection } from "@/components/ProductSection";
import { VendorCard } from "@/components/VendorCard";
import { QuickViewModal } from "@/components/QuickViewModal";
import { StatsBar } from "@/components/StatsBar";
import { useListProducts, getListProductsQueryKey, useListVendors } from "@workspace/api-client-react";
import type { ProductSummary, VendorSummary } from "@workspace/api-client-react";

interface HeroBanner {
  id: string;
  imageUrl: string;
  title?: string | null;
  slideIntervalMs?: number | null;
}

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

const DEFAULT_HERO_SLIDES = [
  {
    id: "slide-3",
    title: "Timeless Paithani. Contemporary Designer Sarees.",
    subtitle: "Discover authentic Paithani and designer sarees, thoughtfully curated for weddings, festivals, celebrations, and modern wardrobes.",
    image: "https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?q=80&w=1600&auto=format&fit=crop",
    fallbackImage: "/images/hero-designer-1.png",
    lotNo: "Designer Edition",
    lotTitle: "Modern Concept Drape",
    lotValuation: "Designer Silk",
    specZari: "Silk & Zari",
    specWeave: "Handloom Weave",
    specProvenance: "Maharashtra Craft",
  },
];

function SectionTitle({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="text-center mb-10 md:mb-14">
      <div className="flex items-center justify-center gap-4 mb-3">
        <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
        <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#0A1F44]">
          {children}
        </h2>
        <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
      </div>
      {subtitle && <p className="text-sm md:text-base text-gray-500">{subtitle}</p>}
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

function FeaturedShopsSkeleton() {
  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
              <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#0A1F44]">
                Featured Shops
              </h2>
              <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
            </div>
            <p className="text-center text-sm text-gray-500">Discover our most trusted weaver collectives and artisan studios</p>
          </div>
        </div>
        <div className="flex gap-4 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex-none w-[200px] h-[220px] rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturedShopsSection() {
  const [scrollIdx, setScrollIdx] = useState(0);
  const { data: vendors, isLoading, isError } = useListVendors();

  if (isLoading || isError) return <FeaturedShopsSkeleton />;

  const vendorList: VendorSummary[] = Array.isArray(vendors) ? vendors : [];

  if (vendorList.length === 0) {
    return (
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4 text-center">
          <div className="flex items-center justify-center gap-4 mb-2">
            <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
            <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#0A1F44]">
              Featured Shops
            </h2>
            <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
          </div>
          <p className="text-sm text-gray-400 mt-4">More shops coming soon — check back shortly!</p>
        </div>
      </section>
    );
  }

  const visibleCount = 4;
  const canPrev = scrollIdx > 0;
  const canNext = scrollIdx + visibleCount < vendorList.length;

  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
              <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#0A1F44]">
                Featured Shops
              </h2>
              <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
            </div>
            <p className="text-center text-sm text-gray-500">Discover our most trusted weaver collectives and artisan studios</p>
          </div>
        </div>

        <div className="relative">
          {canPrev && (
            <button
              onClick={() => setScrollIdx(i => Math.max(0, i - 1))}
              className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border"
              style={{ background: IVORY, borderColor: GOLD + "55", color: MAROON }}
            >
              <ChevronLeft size={20} />
            </button>
          )}
          {canNext && (
            <button
              onClick={() => setScrollIdx(i => Math.min(vendorList.length - visibleCount, i + 1))}
              className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border"
              style={{ background: IVORY, borderColor: GOLD + "55", color: MAROON }}
            >
              <ChevronRight size={20} />
            </button>
          )}
          <div className="overflow-hidden">
            <div
              className="flex gap-4 transition-transform duration-500"
              style={{ transform: `translateX(calc(-${scrollIdx} * (220px + 16px)))` }}
            >
              {vendorList.map(v => (
                <div key={v.id} className="flex-none">
                  <VendorCard vendor={v} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function RecentlyViewedSkeleton() {
  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <SectionTitle subtitle="Pick up where you left off">
          Recently Viewed Products
        </SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg overflow-hidden bg-[#E5E8EC] animate-pulse">
              <div className="aspect-square bg-gray-200" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-gray-200 rounded w-3/4" />
                <div className="h-4 bg-gray-200 rounded" />
                <div className="h-3 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RecentlyViewedSection({ onQuickView }: { onQuickView: (p: ProductSummary) => void }) {
  const [ids, setIds] = useState<string[] | null>(null);

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

  const hasIds = !!ids && ids.length > 0;
  const recentlyViewedParams = { ids: hasIds ? ids!.join(",") : undefined, limit: 8 };
  const { data, isLoading, isError } = useListProducts(recentlyViewedParams, {
    query: {
      enabled: hasIds,
      queryKey: getListProductsQueryKey(recentlyViewedParams),
    },
  });

  if (ids === null || !hasIds) return null;
  if (isLoading || isError) return <RecentlyViewedSkeleton />;

  const products = (data?.products ?? [])
    .slice()
    .sort((a, b) => ids!.indexOf(a.id) - ids!.indexOf(b.id));

  if (products.length === 0) return null;

  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <SectionTitle subtitle="Pick up where you left off">
          Recently Viewed Products
        </SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {products.slice(0, 8).map((p, i) => (
            <ProductCard key={p.id} product={p} index={i} onQuickView={onQuickView} />
          ))}
        </div>
        <div className="mt-8 text-center">
          <Link
            href="/paithani/shop"
            className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-3.5 rounded-sm border-2 transition-all hover:bg-[#0A1F44]/5"
            style={{ borderColor: MAROON, color: MAROON }}
          >
            View All Recently Viewed Products →
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [quickViewProduct, setQuickViewProduct] = useState<ProductSummary | null>(null);

  const slide = DEFAULT_HERO_SLIDES[0];

  return (
    <Layout>
      {/* ── GUARANTEED HERO SLIDER: EDITORIAL COUTURE CANVAS ── */}
      <section className="relative w-full overflow-hidden bg-[#FBF9F8] border-b border-[#E5E8EC]">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 md:py-12">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center min-h-[640px]">
            {/* Left Editorial Narrative */}
            <div className="lg:col-span-5 flex flex-col justify-center pr-0 lg:pr-4 z-10">
              <div className="inline-flex items-center gap-2 mb-4">
                <span className="h-px w-8" style={{ background: GOLD }}></span>
                <span className="text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: ROYAL_ACCENT }}>
                  VASTRAA • THE ART OF INDIAN DRAPE
                </span>
              </div>
              
              <AnimatePresence mode="wait">
                <motion.div
                  key={slide.id}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  transition={{ duration: 0.4 }}
                >
                  <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-4 text-[#0A1F44]">
                    {slide.title}
                  </h1>
                  <p className="text-sm md:text-base text-gray-600 leading-relaxed max-w-md mb-6">
                    {slide.subtitle}
                  </p>

                  {/* Feature Highlights */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-y border-[#E5E8EC] py-4 mb-6">
                    <div>
                      <p className="text-xs font-bold text-[#0A1F44]">Weave Heritage</p>
                      <p className="text-xs text-gray-500">Handwoven Paithani & premium silk sarees</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0A1F44]">Maharashtra Craft</p>
                      <p className="text-xs text-gray-500">Inspired by traditional weaving heritage</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0A1F44]">Silk & Zari</p>
                      <p className="text-xs text-gray-500">Elegant fabrics with traditional craftsmanship</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-[#0A1F44]">Curated Collection</p>
                      <p className="text-xs text-gray-500">Styles for every celebration</p>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/paithani"
                  className="px-6 py-3 text-xs md:text-sm font-bold uppercase tracking-widest text-white rounded-md transition-all shadow-md hover:shadow-lg"
                  style={{ background: MAROON }}
                >
                  Shop Paithani Sarees
                </Link>
                <Link
                  href="/designer"
                  className="px-5 py-3 text-xs md:text-sm font-bold uppercase tracking-widest rounded-md border transition-all hover:bg-[#0A1F44]/5"
                  style={{ borderColor: MAROON, color: MAROON }}
                >
                  Explore Designer Sarees
                </Link>
              </div>

            </div>

            {/* Right Visual Spread */}
            <div className="lg:col-span-7 grid grid-cols-12 gap-4 relative">
              {/* Main Portrait Banner */}
              <div className="col-span-8 relative overflow-hidden rounded-xl border shadow-lg group bg-white" style={{ borderColor: GOLD + "66" }}>
                <img
                  src={slide.image}
                  alt={slide.title}
                  className="w-full h-[520px] object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = slide.fallbackImage; }}
                />
                <div className="absolute top-4 left-4 text-white text-[10px] font-bold px-3 py-1 rounded-sm border uppercase tracking-wider" style={{ background: MAROON, borderColor: GOLD }}>
                  VASTRAA CURATED
                </div>
                <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-lg border flex justify-between items-center shadow-md" style={{ borderColor: GOLD + "44" }}>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{slide.lotNo}</p>
                    <h3 className="font-serif text-base font-bold text-[#0A1F44]">{slide.lotTitle}</h3>
                  </div>
                  <span className="text-sm font-bold text-[#0A1F44]">{slide.lotValuation}</span>
                </div>
              </div>

              {/* Side Stacks */}
              <div className="col-span-4 flex flex-col gap-4">
                <div className="h-[250px] relative overflow-hidden rounded-xl border group shadow-sm bg-white" style={{ borderColor: GOLD + "44" }}>
                  <img
                    src="https://images.unsplash.com/photo-1617627143750-d86bc21e42bb?q=80&w=600&auto=format&fit=crop"
                    alt="Traditional Pallu"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/images/hero-paithani-3.png"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 text-white">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#C7CCD1]">Traditional Pallu</span>
                    <p className="text-xs font-semibold">Handwoven Zari Motifs</p>
                  </div>
                </div>

                <div className="h-[254px] relative overflow-hidden rounded-xl border group shadow-sm bg-white" style={{ borderColor: GOLD + "44" }}>
                  <img
                    src="https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b?q=80&w=600&auto=format&fit=crop"
                    alt="Designer Drape"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/images/hero-designer-2.png"; }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-3 left-3 text-white">
                    <span className="text-[10px] uppercase font-bold tracking-widest text-[#C7CCD1]">Designer Collection</span>
                    <p className="text-xs font-semibold">Contemporary Silhouettes</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LUXURY PROVENANCE STRIP ── */}
      <div className="w-full border-y py-4 bg-[#F4F5F7]" style={{ borderColor: GOLD + "44" }}>
        <div className="max-w-7xl mx-auto px-4 md:px-8 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div className="flex items-center justify-center gap-3">
            <ShieldCheck size={22} className="text-[#0A1F44]" />
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Weave Heritage</p>
              <p className="text-[11px] text-gray-500">Handwoven Paithani & silk sarees</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Award size={22} className="text-[#0A1F44]" />
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Maharashtra Craft</p>
              <p className="text-[11px] text-gray-500">Traditional weaving heritage</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Crown size={22} className="text-[#0A1F44]" />
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Silk & Zari</p>
              <p className="text-[11px] text-gray-500">Elegant fabrics & craftsmanship</p>
            </div>
          </div>
          <div className="flex items-center justify-center gap-3">
            <Sparkles size={22} className="text-[#0A1F44]" />
            <div className="text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Curated Collection</p>
              <p className="text-[11px] text-gray-500">Styles for every celebration</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── STATS BAR ── */}
      <section style={{ borderBottom: `1px solid ${GOLD}44` }}>
        <StatsBar />
      </section>

      {/* ── SHOP BY CATEGORY ── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle subtitle="Browse our curated collections handpicked for every occasion">
            Shop by Category
          </SectionTitle>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-6 md:gap-8">
            {categories.map((cat, i) => (
              <motion.div key={cat.label} initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}>
                <Link href={cat.href} className="flex flex-col items-center group cursor-pointer">
                  <div className="w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 rounded-full overflow-hidden border-4 mb-3 transition-all duration-300 group-hover:shadow-lg group-hover:scale-105" style={{ borderColor: GOLD + "66" }}>
                    <img src={cat.image} alt={cat.label} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onError={e => { (e.target as HTMLImageElement).src = "/images/product-1.png"; }} />
                  </div>
                  <span className="text-xs md:text-sm font-semibold text-center transition-colors group-hover:text-[#C7CCD1]" style={{ color: MAROON }}>{cat.label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ARTISAN WEAVE SPOTLIGHT ── */}
      <section className="max-w-7xl mx-auto px-4 md:px-8 my-10">
        <div className="bg-[#0A1F44] text-white p-8 lg:p-12 rounded-2xl border relative overflow-hidden shadow-2xl" style={{ borderColor: GOLD }}>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[#C7CCD1]"></span>
                <span className="text-xs uppercase tracking-widest text-[#C7CCD1] font-semibold">Artisan Handloom Collection</span>
              </div>
              <h3 className="font-serif text-2xl md:text-3xl font-bold text-white mb-3">
                Authentic Paithani & Designer Sarees
              </h3>
              <p className="text-sm text-gray-300 max-w-xl">
                Handcrafted by master artisans from Maharashtra. Explore vibrant silk drapes adorned with traditional peacock, muniya, and floral motifs for your special occasions.
              </p>
            </div>
            <div className="lg:col-span-5 flex flex-col sm:flex-row items-center justify-end gap-6">
              <Link
                href="/paithani"
                className="w-full sm:w-auto bg-white text-[#0A1F44] font-bold px-6 py-4 rounded-md text-xs uppercase tracking-widest hover:bg-[#E5E8EC] transition-all text-center"
              >
                Shop Paithani Sarees
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURED COLLECTION: THE HERITAGE EDIT ── */}
      <section className="py-16 md:py-20 bg-white border-b border-[#E5E8EC]">
        <div className="container mx-auto px-4">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-10 md:mb-12">
              <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#2C3E6B] block mb-2">
                Featured Collection
              </span>
              <div className="flex items-center justify-center gap-4 mb-3">
                <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
                <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold tracking-wide text-[#0A1F44]">
                  The Heritage Edit
                </h2>
                <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-widest text-[#0A1F44]/70 mb-3">
                PAITHANI COLLECTION
              </p>
              <p className="text-sm md:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
                A curated collection of traditional Paithani sarees featuring distinctive peacock, muniya, asawali and floral motifs, vibrant colours, and intricate zari work.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#F4F5F7] rounded-2xl p-6 md:p-10 border" style={{ borderColor: GOLD + "55" }}>
              <div className="lg:col-span-6 relative overflow-hidden rounded-xl group shadow-md bg-white">
                <img
                  src="/images/hero-paithani-1.png"
                  alt="The Heritage Edit - Paithani Collection"
                  className="w-full h-[380px] md:h-[440px] object-cover transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1000&auto=format&fit=crop"; }}
                />
                <div className="absolute top-4 left-4 text-white text-[10px] font-bold px-3 py-1 rounded-sm border uppercase tracking-wider" style={{ background: MAROON, borderColor: GOLD }}>
                  PAITHANI COLLECTION
                </div>
              </div>

              <div className="lg:col-span-6 flex flex-col justify-between h-full space-y-6">
                <div>
                  <h3 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44] mb-3">
                    The Heritage Edit
                  </h3>
                  <p className="text-sm text-gray-600 leading-relaxed mb-6">
                    A curated collection of traditional Paithani sarees featuring distinctive peacock, muniya, asawali and floral motifs, vibrant colours, and intricate zari work.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y border-[#E5E8EC] py-6 mb-6">
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Fabric</span>
                      <span className="text-sm font-semibold text-[#0A1F44]">Silk / Mulberry Silk</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Craft</span>
                      <span className="text-sm font-semibold text-[#0A1F44]">Handloom Weave</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Origin</span>
                      <span className="text-sm font-semibold text-[#0A1F44]">Yeola, Maharashtra</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Collection</span>
                      <span className="text-sm font-semibold text-[#0A1F44]">Traditional & Contemporary Paithani</span>
                    </div>
                  </div>
                </div>

                <div>
                  <Link
                    href="/paithani"
                    className="inline-flex items-center gap-2 px-8 py-3.5 text-xs md:text-sm font-bold uppercase tracking-widest text-white rounded-md transition-all shadow-md hover:shadow-lg"
                    style={{ background: MAROON }}
                  >
                    Explore Paithani Collection →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 1. FEATURED PRODUCTS ── */}
      <ProductSection
        title="Featured Products"
        subtitle="Handpicked masterpieces — the finest from our entire collection"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ isFeatured: true, limit: 8 } as any}
        bg={CREAM}
        onQuickView={setQuickViewProduct}
      />

      {/* ── 2. FEATURED SHOPS ── */}
      <FeaturedShopsSection />



      {/* ── 3. NEW ARRIVALS ── */}
      <ProductSection
        title="New Arrivals"
        subtitle="Fresh weaves and contemporary designs — just landed this season"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ newArrival: true, sort: "newest", limit: 8 }}
        bg={IVORY}
        onQuickView={setQuickViewProduct}
      />



      {/* ── 4. BEST SELLERS ── */}
      <ProductSection
        title="Best Sellers"
        subtitle="Our most-loved sarees, chosen by thousands of happy customers"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ bestSeller: true, sort: "rating_desc", limit: 8 }}
        bg={CREAM}
        onQuickView={setQuickViewProduct}
      />

      {/* ── 5. TRENDING PRODUCTS ── */}
      <ProductSection
        title="Trending Products"
        subtitle="What India's most stylish women are draping this season"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ sort: "rating_desc", minRating: 4.0, limit: 8 }}
        bg="white"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 6. FESTIVAL COLLECTIONS ── */}
      <ProductSection
        title="Festival Collections"
        subtitle="Celebrate every occasion in sarees that capture the joy of India's festivals"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ occasion: "festival", sort: "rating_desc", limit: 8 }}
        bg="#F4F5F7"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 7. FLASH SALES ── */}
      <ProductSection
        title="Flash Sales"
        subtitle="Limited-time deals on premium sarees — shop before they're gone"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ hasDiscount: true, sort: "rating_desc", limit: 8 }}
        bg="#0A1F44"
        onQuickView={setQuickViewProduct}
        flashSale
      />

      {/* ── 8. RECOMMENDED PRODUCTS ── */}
      <ProductSection
        title="Recommended Products"
        subtitle="Curated just for you — sarees we think you'll adore"
        params={{ sort: "rating_desc", minRating: 4.5, limit: 8 }}
        bg={IVORY}
        viewAllHref="/paithani/shop?sort=rating_desc"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 9. FREQUENTLY BOUGHT TOGETHER ── */}
      <ProductSection
        title="Frequently Bought Together"
        subtitle="Sarees that our customers love to pair and gift together"
        params={{ category: "paithani", sort: "rating_desc", limit: 8 }}
        bg={CREAM}
        viewAllHref="/paithani/shop"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 10. RECENTLY VIEWED ── */}
      <RecentlyViewedSection onQuickView={setQuickViewProduct} />

      {/* ── TESTIMONIALS ── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle subtitle="Real stories from our cherished customers across India">
            Loved by Thousands
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-xl p-6 border shadow-sm flex flex-col gap-4" style={{ borderColor: GOLD + "44", background: IVORY }}>
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
