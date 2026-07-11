import React, { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  BadgeCheck,
  Star,
  Truck,
  RefreshCcw,
  CreditCard,
  Store,
  Headphones,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { ProductSection } from "@/components/ProductSection";
import { VendorCard } from "@/components/VendorCard";
import { QuickViewModal } from "@/components/QuickViewModal";
import { StatsBar } from "@/components/StatsBar";
import { useListProducts, getListProductsQueryKey, useListVendors } from "@workspace/api-client-react";
import type { ProductSummary, VendorSummary } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const GOLD = "#C9A84C";
const MAROON = "#1E6B5A";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";

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
    <div className="text-center mb-10 md:mb-14">
      <div className="flex items-center justify-center gap-4 mb-3">
        <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
        <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#1E6B5A]">
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
  { label: "Festival Collection", image: "/images/hero-paithani-3.png", href: "/paithani/shop?occasion=festival" },
  { label: "New Arrivals", image: "/images/product-1.png", href: "/paithani/shop?newArrival=true" },
];

const trustFeatures = [
  { icon: <BadgeCheck className="w-8 h-8" style={{ color: GOLD }} />, title: "100% Authentic Products", desc: "Every saree is verified and sourced directly from trusted weavers and artisans." },
  { icon: <ShieldCheck className="w-8 h-8" style={{ color: GOLD }} />, title: "Verified Vendors & Quality Assured", desc: "All vendors go through a rigorous quality check before listing on TwirlDrape." },
  { icon: <CreditCard className="w-8 h-8" style={{ color: GOLD }} />, title: "Secure Payments & Data Protection", desc: "Bank-grade encryption keeps your payment and personal data completely safe." },
  { icon: <RefreshCcw className="w-8 h-8" style={{ color: GOLD }} />, title: "Easy Returns & Refunds", desc: "Hassle-free returns within 7 days — no questions asked, full refund guaranteed." },
  { icon: <Truck className="w-8 h-8" style={{ color: GOLD }} />, title: "Fast & Reliable Pan India Delivery", desc: "Swift shipping across all states with real-time tracking on every order." },
  { icon: <Headphones className="w-8 h-8" style={{ color: GOLD }} />, title: "Dedicated Support 24/7", desc: "Our saree experts are always available to help you find the perfect drape." },
];

const testimonials = [
  { name: "Priya Sharma", city: "Mumbai", rating: 5, quote: "The Paithani saree I ordered was absolutely stunning — the colors were exactly as shown and the quality is exceptional. Received so many compliments at the wedding!", avatar: "/images/artisan-1.png" },
  { name: "Ananya Kulkarni", city: "Pune", rating: 5, quote: "TwirlDrape made finding my bridal saree a dream. The vendor was super responsive and the saree arrived beautifully packed. Highly recommend!", avatar: "/images/artisan-2.png" },
  { name: "Deepa Menon", city: "Bangalore", rating: 5, quote: "I've been searching for authentic Yeola Paithani for years. TwirlDrape connected me directly with the weaver and the saree is a masterpiece. Worth every rupee.", avatar: "/images/artisan-3.png" },
];

function PeacockIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="24" cy="36" rx="5" ry="7" fill="#1E6B5A" />
      <path d="M24 29 Q22 22 23 17" stroke="#1E6B5A" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="23" cy="14.5" r="3.5" fill="#1E6B5A" />
      <path d="M21 12 Q18 8 20 6" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M23 11 Q22 7 23 5" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M25 12 Q27 8 26 6" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
      <path d="M24 28 Q14 21 9 17" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <path d="M24 28 Q17 19 15 13" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <path d="M24 28 Q24 18 24 12" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <path d="M24 28 Q31 19 33 13" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <path d="M24 28 Q34 21 39 17" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" opacity="0.8" />
      <circle cx="9" cy="16" r="2.2" fill="#C9A84C" opacity="0.7" />
      <circle cx="15" cy="12" r="2.2" fill="#C9A84C" opacity="0.7" />
      <circle cx="24" cy="11" r="2.2" fill="#C9A84C" opacity="0.7" />
      <circle cx="33" cy="12" r="2.2" fill="#C9A84C" opacity="0.7" />
      <circle cx="39" cy="16" r="2.2" fill="#C9A84C" opacity="0.7" />
    </svg>
  );
}

function FeaturedShopsSkeleton() {
  return (
    <section className="py-16 md:py-20 bg-white">
      <div className="container mx-auto px-4">
        <div className="flex items-end justify-between mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-4 mb-2">
              <span className="flex-1 max-w-[60px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
              <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#1E6B5A]">
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
              <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#1E6B5A]">
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
              {vendorList.length === 0 && (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex-none w-[200px] h-[220px] rounded-2xl bg-gray-100 animate-pulse" />
                ))
              )}
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
            <div key={i} className="rounded-lg overflow-hidden bg-[#E6F0EA] animate-pulse">
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

  // Still determining which IDs to look up (localStorage read pending).
  if (ids === null) return null;

  // Nothing has been viewed yet — nothing to show, no error state needed.
  if (!hasIds) return null;

  // Loading or transient error: keep the section visible with a skeleton
  // instead of silently disappearing, so a slow/flaky API doesn't hide it.
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
            className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-3.5 rounded-sm border-2 transition-all hover:bg-[#1E6B5A]/5"
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

  return (
    <Layout>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${IVORY} 0%, ${CREAM} 60%, #EDD9C0 100%)` }}>
        <div className="container mx-auto px-4 lg:px-12 py-12 md:py-20 lg:py-24">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            <motion.div className="flex-1 max-w-xl" initial={{ opacity: 0, x: -40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8 }}>
              <p className="text-xs md:text-sm font-bold uppercase tracking-[0.25em] mb-4" style={{ color: GOLD }}>
                Celebrate Tradition. Embrace Elegance.
              </p>
              <h1 className="font-serif text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-5" style={{ color: MAROON }}>
                Authentic Paithani &amp;{" "}
                <span style={{ color: GOLD }}>Designer Sarees</span>
              </h1>
              <p className="text-gray-600 text-base md:text-lg mb-8 leading-relaxed">
                Handpicked from master weavers across India — discover sarees that tell a story of heritage, craftsmanship, and timeless beauty.
              </p>
              <div className="flex flex-wrap gap-5 mb-8">
                {[
                  { icon: <BadgeCheck size={15} />, text: "Authenticity Assured" },
                  { icon: <Store size={15} />, text: "Trusted Vendors" },
                  { icon: <ShieldCheck size={15} />, text: "Secure Shopping" },
                ].map((b) => (
                  <div key={b.text} className="flex items-center gap-1.5 text-xs md:text-sm font-medium" style={{ color: MAROON }}>
                    <span style={{ color: GOLD }}>{b.icon}</span>
                    {b.text}
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Link href="/paithani" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 font-bold text-sm uppercase tracking-widest rounded-sm transition-opacity hover:opacity-90" style={{ background: MAROON, color: IVORY }}>
                  Explore Paithani Sarees →
                </Link>
                <Link href="/designer" className="inline-flex items-center justify-center gap-2 px-7 py-3.5 font-bold text-sm uppercase tracking-widest border-2 rounded-sm transition-all hover:bg-[#1E6B5A]/5" style={{ borderColor: MAROON, color: MAROON }}>
                  Explore Designer Sarees →
                </Link>
              </div>
            </motion.div>

            <motion.div className="flex-1 flex justify-center lg:justify-end w-full max-w-sm lg:max-w-none" initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.15 }}>
              <div className="relative w-full max-w-sm lg:max-w-md">
                <div className="rounded-2xl overflow-hidden shadow-2xl border-4" style={{ borderColor: GOLD + "55" }}>
                  <img src="/images/home-paithani.png" alt="Elegant Paithani saree" className="w-full object-cover" style={{ maxHeight: "520px", objectPosition: "top center" }} />
                </div>
                <div className="absolute -bottom-5 -left-5 bg-[#F3F8F5] rounded-xl p-4 shadow-xl border flex items-center gap-3" style={{ borderColor: GOLD + "44" }}>
                  <PeacockIcon size={40} />
                  <div>
                    <p className="font-serif text-lg font-bold tracking-wider" style={{ color: MAROON }}>TWIRLDRAPE</p>
                    <p className="text-[10px] uppercase tracking-widest text-gray-500 mt-0.5">Authentic · Curated · Trusted</p>
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 rounded-full w-20 h-20 flex flex-col items-center justify-center shadow-lg text-white font-bold text-center text-xs" style={{ background: MAROON }}>
                  <span className="text-lg font-serif leading-none" style={{ color: GOLD }}>50K+</span>
                  <span className="text-[9px] uppercase tracking-wider mt-0.5 opacity-90">Happy Customers</span>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
        <div className="absolute -top-32 -right-32 w-72 h-72 rounded-full opacity-10 pointer-events-none" style={{ background: GOLD }} />
        <div className="absolute -bottom-20 -left-20 w-56 h-56 rounded-full opacity-10 pointer-events-none" style={{ background: MAROON }} />
      </section>

      {/* ── STATS ────────────────────────────────────────── */}
      <StatsBar />

      {/* ── SHOP BY CATEGORY ─────────────────────────────── */}
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
                  <span className="text-xs md:text-sm font-semibold text-center transition-colors group-hover:text-[#C9A84C]" style={{ color: MAROON }}>{cat.label}</span>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EXCLUSIVE COLLECTIONS ────────────────────────── */}
      <section className="py-16 md:py-20" style={{ background: IVORY }}>
        <div className="container mx-auto px-4">
          <SectionTitle subtitle="Two worlds of saree artistry — find yours">
            Our Exclusive Collections
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6 }}
              className="relative rounded-2xl overflow-hidden group cursor-pointer min-h-[280px] md:min-h-[340px]" style={{ background: MAROON }}>
              <img src="/images/hero-paithani-1.png" alt="Paithani" className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 group-hover:scale-105 transition-all duration-700" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div className="relative z-10 flex flex-col justify-end h-full p-8 md:p-10">
                <p className="text-xs font-bold uppercase tracking-[0.25em] mb-2" style={{ color: GOLD }}>Authentic Paithani Sarees</p>
                <h3 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-white mb-3 leading-tight">Handwoven Heritage.<br />Timeless Artistry.</h3>
                <p className="text-white/70 text-sm mb-6 max-w-xs">Centuries-old silk weaving tradition from Yeola and Paithan — each saree a living heirloom.</p>
                <Link href="/paithani" className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest self-start transition-opacity hover:opacity-80" style={{ color: GOLD }}>Explore Now →</Link>
              </div>
            </motion.div>
            <motion.div initial={{ opacity: 0, x: 30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.1 }}
              className="relative rounded-2xl overflow-hidden group cursor-pointer min-h-[280px] md:min-h-[340px]" style={{ background: "#F9ECE8" }}>
              <img src="/images/hero-designer-1.png" alt="Designer" className="absolute inset-0 w-full h-full object-cover opacity-25 group-hover:opacity-35 group-hover:scale-105 transition-all duration-700" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
              <div className="relative z-10 flex flex-col justify-end h-full p-8 md:p-10">
                <p className="text-xs font-bold uppercase tracking-[0.25em] mb-2" style={{ color: MAROON }}>Premium Designer Sarees</p>
                <h3 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold mb-3 leading-tight" style={{ color: MAROON }}>Contemporary Designs<br />For Every You.</h3>
                <p className="text-gray-600 text-sm mb-6 max-w-xs">Modern silhouettes, contemporary prints, and luxurious fabrics crafted for the bold, modern woman.</p>
                <Link href="/designer" className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest self-start transition-opacity hover:opacity-80" style={{ color: MAROON }}>Explore Now →</Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── WHY SHOP ─────────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle subtitle="Your trust is our highest priority at every step">
            Why Shop With TwirlDrape?
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
            {trustFeatures.map((f, i) => (
              <motion.div key={f.title} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.08 }}
                className="flex flex-col items-start gap-4 p-6 rounded-xl border hover:shadow-md transition-shadow" style={{ borderColor: GOLD + "33", background: IVORY }}>
                <div className="p-3 rounded-xl" style={{ background: MAROON + "11" }}>{f.icon}</div>
                <div>
                  <h4 className="font-serif text-lg font-semibold mb-1" style={{ color: MAROON }}>{f.title}</h4>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════ */}
      {/* ── 1. FEATURED PRODUCTS ─────────────────────────── */}
      <ProductSection
        title="Featured Products"
        subtitle="Handpicked masterpieces — the finest from our entire collection"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ sort: "rating_desc", minRating: 4.5, limit: 8 }}
        bg={CREAM}
        onQuickView={setQuickViewProduct}
      />

      {/* ── 2. FEATURED SHOPS ────────────────────────────── */}
      <FeaturedShopsSection />

      {/* ── 3. NEW ARRIVALS ──────────────────────────────── */}
      <ProductSection
        title="New Arrivals"
        subtitle="Fresh weaves and contemporary designs — just landed this season"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ newArrival: true, sort: "newest", limit: 8 }}
        bg={IVORY}
        onQuickView={setQuickViewProduct}
      />

      {/* ── 4. BEST SELLERS ──────────────────────────────── */}
      <ProductSection
        title="Best Sellers"
        subtitle="Our most-loved sarees, chosen by thousands of happy customers"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ bestSeller: true, sort: "rating_desc", limit: 8 }}
        bg={CREAM}
        onQuickView={setQuickViewProduct}
      />

      {/* ── 5. TRENDING PRODUCTS ─────────────────────────── */}
      <ProductSection
        title="Trending Products"
        subtitle="What India's most stylish women are draping this season"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ sort: "rating_desc", minRating: 4.0, limit: 8 }}
        bg="white"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 6. FESTIVAL COLLECTIONS ──────────────────────── */}
      <ProductSection
        title="Festival Collections"
        subtitle="Celebrate every occasion in sarees that capture the joy of India's festivals"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ occasion: "festival", sort: "rating_desc", limit: 8 }}
        bg="#FFF3E0"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 7. FLASH SALES ───────────────────────────────── */}
      <ProductSection
        title="Flash Sales"
        subtitle="Limited-time deals on premium sarees — shop before they're gone"
        tabs={PAITHANI_DESIGNER_TABS}
        params={{ hasDiscount: true, sort: "rating_desc", limit: 8 }}
        bg="#3D1A1A"
        onQuickView={setQuickViewProduct}
        flashSale
      />

      {/* ── 8. RECOMMENDED PRODUCTS ──────────────────────── */}
      <ProductSection
        title="Recommended Products"
        subtitle="Curated just for you — sarees we think you'll adore"
        params={{ sort: "rating_desc", minRating: 4.5, limit: 8 }}
        bg={IVORY}
        viewAllHref="/paithani/shop?sort=rating_desc"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 9. FREQUENTLY BOUGHT TOGETHER ────────────────── */}
      <ProductSection
        title="Frequently Bought Together"
        subtitle="Sarees that our customers love to pair and gift together"
        params={{ category: "paithani", sort: "rating_desc", limit: 8 }}
        bg={CREAM}
        viewAllHref="/paithani/shop"
        onQuickView={setQuickViewProduct}
      />

      {/* ── 10. RECENTLY VIEWED ──────────────────────────── */}
      <RecentlyViewedSection onQuickView={setQuickViewProduct} />

      {/* ── TESTIMONIALS ─────────────────────────────────── */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container mx-auto px-4">
          <SectionTitle subtitle="Real stories from our cherished customers across India">
            Loved by Thousands
          </SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div key={t.name} initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: i * 0.1 }}
                className="rounded-xl p-6 border shadow-sm flex flex-col gap-4" style={{ borderColor: GOLD + "33", background: IVORY }}>
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={16} className="fill-current" style={{ color: GOLD }} />
                  ))}
                </div>
                <p className="text-gray-600 text-sm leading-relaxed italic flex-1">&ldquo;{t.quote}&rdquo;</p>
                <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: GOLD + "22" }}>
                  <img src={t.avatar} alt={t.name} className="w-10 h-10 rounded-full object-cover border-2" style={{ borderColor: GOLD + "55" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                  <div>
                    <p className="font-semibold text-sm" style={{ color: MAROON }}>{t.name}</p>
                    <p className="text-xs text-gray-400">{t.city}</p>
                  </div>
                  <CheckCircle size={16} className="ml-auto" style={{ color: GOLD }} />
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── QUICK VIEW MODAL ─────────────────────────────── */}
      <QuickViewModal
        product={quickViewProduct}
        onClose={() => setQuickViewProduct(null)}
      />
    </Layout>
  );
}
