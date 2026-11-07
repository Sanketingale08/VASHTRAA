import React, { useState, useMemo, useRef } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  ChevronRight,
  ChevronLeft,
  Search,
  X,
  Tag,
  ArrowRight,
  Sparkles,
  Layers,
  Crown,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { cn } from "@/lib/utils";
import { CATALOG_CATEGORIES, CatalogCategoryItem } from "@/constants/categories";
import { getCategoryOrSubcategoryImage } from "@/constants/categoryImages";
import { BUDGET_RANGES, BudgetRange, getBudgetById, getBudgetByPrice } from "@/constants/budget";

// Dedicated routes for saree subcategories
const DEDICATED_SAREE_ROUTES: Record<string, string> = {
  paithani: "/paithani",
  designer: "/designer",
  gadwal: "/gadwal",
  banarasi: "/banarasi",
  kanjivaram: "/kanjivaram",
  chanderi: "/chanderi",
  bandhani: "/bandhani",
  "mysore-silk": "/mysore-silk",
  ikat: "/ikat",
  cotton: "/cotton",
  silk: "/silk",
  "other-traditional": "/other-traditional",
};

/**
 * Builds the canonical product listing URL for a category/subcategory with budget filters.
 */
export function buildProductListingUrl(
  categorySlug: string,
  subcategorySlug: string | null,
  budget: BudgetRange
): string {
  const params = new URLSearchParams();
  params.set("budget", budget.id);
  if (budget.min !== undefined) params.set("minPrice", String(budget.min));
  if (budget.max !== undefined) params.set("maxPrice", String(budget.max));

  // 1. Sarees main category handling
  if (categorySlug === "sarees") {
    if (!subcategorySlug || subcategorySlug === "all" || subcategorySlug === "all-sarees" || subcategorySlug === "explore-all") {
      params.set("category", "sarees");
      const qs = params.toString();
      return `/sarees${qs ? `?${qs}` : ""}`;
    }

    // Check if subcategory has a dedicated route
    const normSub = subcategorySlug.toLowerCase().trim();
    if (DEDICATED_SAREE_ROUTES[normSub]) {
      params.set("category", normSub);
      const qs = params.toString();
      return `${DEDICATED_SAREE_ROUTES[normSub]}${qs ? `?${qs}` : ""}`;
    }

    params.set("category", "sarees");
    params.set("subcategory", normSub);
    const qs = params.toString();
    return `/sarees${qs ? `?${qs}` : ""}`;
  }

  // 2. Other main categories (kurtis, kurta-sets, ethnic-dresses, western-dresses, winter-wear)
  params.set("category", categorySlug);
  if (subcategorySlug && subcategorySlug !== "all" && subcategorySlug !== "explore-all") {
    params.set("subcategory", subcategorySlug);
  }

  const qs = params.toString();
  return `/${categorySlug}${qs ? `?${qs}` : ""}`;
}

export default function ShopByBudget() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchStr), [searchStr]);

  // Search filter query within category selection page
  const [searchQuery, setSearchQuery] = useState("");

  const activeCategoryParam = searchParams.get("category");

  // Friendly display name for active category/subcategory
  const activeCategoryName = useMemo(() => {
    if (!activeCategoryParam) return null;
    const norm = activeCategoryParam.toLowerCase().trim();
    if (norm === "all" || norm === "all-sarees") return "All Sarees";

    const mainMatch = CATALOG_CATEGORIES.find((c) => c.slug === norm);
    if (mainMatch) return mainMatch.name;

    for (const cat of CATALOG_CATEGORIES) {
      const subMatch = cat.subcategories.find((s) => s.slug === norm);
      if (subMatch) return subMatch.name;
    }

    return activeCategoryParam.charAt(0).toUpperCase() + activeCategoryParam.slice(1);
  }, [activeCategoryParam]);

  // Resolve current budget from URL query parameter or fallback to popular default
  const activeBudget: BudgetRange = useMemo(() => {
    const budgetParam = searchParams.get("budget");
    if (budgetParam) {
      const found = getBudgetById(budgetParam);
      if (found) return found;
    }

    const rawMin = searchParams.get("minPrice");
    const rawMax = searchParams.get("maxPrice");
    if (rawMin !== null || rawMax !== null) {
      const foundByPrice = getBudgetByPrice(
        rawMin ? Number(rawMin) : undefined,
        rawMax ? Number(rawMax) : undefined
      );
      if (foundByPrice) return foundByPrice;
    }

    // Default to ₹500–₹1,000 (Popular everyday favorites)
    return BUDGET_RANGES[1];
  }, [searchParams]);

  // Handle budget switch without leaving page
  const handleBudgetChange = (budget: BudgetRange) => {
    const params = new URLSearchParams(searchStr);
    params.set("budget", budget.id);
    if (budget.min !== undefined) params.set("minPrice", String(budget.min));
    else params.delete("minPrice");
    if (budget.max !== undefined) params.set("maxPrice", String(budget.max));
    else params.delete("maxPrice");

    navigate(`/shop-by-budget?${params.toString()}`);
  };

  // Filter categories and subcategories based on user search query
  const filteredCategories = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return CATALOG_CATEGORIES;

    return CATALOG_CATEGORIES.map((cat) => {
      const catMatches = cat.name.toLowerCase().includes(query) || cat.description.toLowerCase().includes(query);
      const matchingSubs = cat.subcategories.filter((sub) =>
        sub.name.toLowerCase().includes(query) || sub.slug.toLowerCase().includes(query)
      );

      if (catMatches) {
        return cat;
      }

      if (matchingSubs.length > 0) {
        return {
          ...cat,
          subcategories: matchingSubs,
        };
      }

      return null;
    }).filter(Boolean) as CatalogCategoryItem[];
  }, [searchQuery]);

  return (
    <Layout>
      <div className="bg-[#FAF9F5] min-h-screen pb-20">
        {/* ── BREADCRUMBS ── */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2">
          <nav className="flex items-center gap-1.5 text-xs text-gray-500 flex-wrap" aria-label="Breadcrumb" data-testid="breadcrumbs-nav">
            <Link href="/" className="hover:text-[#0A1F44] transition-colors">
              Home
            </Link>
            <ChevronRight size={12} className="text-gray-400" />
            <Link href="/shop-by-budget" className="hover:text-[#0A1F44] transition-colors">
              Shop by Budget
            </Link>
            <ChevronRight size={12} className="text-gray-400" />
            <span className="font-semibold text-[#0A1F44]">{activeBudget.label}</span>
            {activeCategoryName && (
              <>
                <ChevronRight size={12} className="text-gray-400" />
                <span className="font-bold text-[#D4AF37] px-2 py-0.5 rounded-full bg-[#D4AF37]/10 border border-[#D4AF37]/30">
                  {activeCategoryName}
                </span>
              </>
            )}
          </nav>
        </div>

        {/* ── HERO BANNER & BUDGET CONTROLS ── */}
        <header className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="bg-gradient-to-br from-[#031535] via-[#0A1F44] to-[#162B54] rounded-2xl p-6 sm:p-8 md:p-10 text-white shadow-2xl relative overflow-hidden border border-[#D4AF37]/35">
            {/* Top golden luxury accent line */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#E2C799]/60 to-transparent pointer-events-none" />

            {/* Background Decorative Flourishes */}
            <div className="absolute -right-16 -bottom-16 w-80 h-80 rounded-full bg-[#D4AF37]/10 blur-3xl pointer-events-none" />
            <div className="absolute -left-16 -top-16 w-80 h-80 rounded-full bg-[#D4AF37]/10 blur-3xl pointer-events-none" />

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Heading, Eyebrow, Badges, Description & Budget Controls */}
              <div className="lg:col-span-7 xl:col-span-7 flex flex-col justify-center">
                {/* Eyebrow & Badge */}
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#D4AF37]">
                    SHOP BY BUDGET
                  </span>
                  <span className="text-gray-400">•</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#D4AF37]/20 text-[#FCE3B4] border border-[#D4AF37]/40 tracking-wider uppercase">
                    <Tag size={10} className="text-[#D4AF37]" />
                    {activeBudget.badge} — {activeBudget.subtext}
                  </span>
                  {activeCategoryName && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-white/10 text-[#FCE3B4] border border-[#D4AF37]/30 tracking-wider uppercase">
                      <Sparkles size={10} className="text-[#FCE3B4]" />
                      Category: {activeCategoryName}
                    </span>
                  )}
                </div>

                {/* Page Heading */}
                <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight mb-3">
                  Explore Collections {activeBudget.label}
                </h1>

                {/* Description */}
                <p className="text-sm sm:text-base text-gray-200/90 leading-relaxed mb-6 max-w-xl font-light">
                  Choose a category to discover styles within your selected budget. Every piece is handpicked, artisan-finished, and verified for quality.
                </p>

                {/* ── CHANGE BUDGET CONTROL ── */}
                <div className="pt-2">
                  <p className="text-xs font-semibold text-gray-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                    <Layers size={13} className="text-[#D4AF37]" /> Select Budget Range:
                  </p>
                  <div className="flex flex-wrap items-center gap-2 sm:gap-2.5" data-testid="change-budget-controls">
                    {BUDGET_RANGES.map((b) => {
                      const isCurrent = b.id === activeBudget.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => handleBudgetChange(b)}
                          className={cn(
                            "px-3.5 sm:px-4 py-2 rounded-xl text-xs font-semibold tracking-wide transition-all duration-200 cursor-pointer border flex items-center gap-1.5",
                            isCurrent
                              ? "bg-[#D4AF37] text-[#0A1F44] border-[#D4AF37] font-bold shadow-md shadow-black/20 ring-2 ring-white/30 scale-105"
                              : "bg-white/10 text-white border-white/20 hover:bg-white/20 hover:border-white/40"
                          )}
                        >
                          <span>{b.label}</span>
                          {b.badge && (
                            <span
                              className={cn(
                                "text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase",
                                isCurrent ? "bg-[#0A1F44] text-white" : "bg-black/30 text-gray-200"
                              )}
                            >
                              {b.badge}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Right Column: Hero Fashion Models Showcase in Remaining Space */}
              <div className="lg:col-span-5 xl:col-span-5 relative flex items-center justify-center lg:justify-end">
                <div className="relative w-full max-w-md lg:max-w-none">
                  {/* Golden radial ambient aura glow */}
                  <div className="absolute -inset-3 bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.25)_0%,rgba(10,31,68,0.1)_60%,transparent_80%)] blur-2xl pointer-events-none" />

                  {/* Decorative concentric rings backdrop */}
                  <div className="absolute -inset-2 rounded-2xl border border-[#D4AF37]/20 pointer-events-none -rotate-1 hidden sm:block" />

                  {/* High-fashion image card */}
                  <div className="relative z-10 overflow-hidden rounded-2xl bg-black border border-[#D4AF37]/45 shadow-2xl shadow-black/70 group transition-all duration-500 hover:border-[#D4AF37] hover:shadow-[0_20px_45px_rgba(212,175,55,0.22)]">
                    {/* Metallic top line */}
                    <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#FCE3B4] to-transparent pointer-events-none z-20" />

                    {/* Top Right Floating Badge */}
                    <div className="absolute top-3 right-3 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-[#D4AF37]/60 text-[#FCE3B4] text-[10px] font-bold tracking-widest uppercase shadow-md">
                      <Crown size={12} className="text-[#D4AF37]" />
                      <span>VASTRAA EDIT</span>
                    </div>

                    {/* Image */}
                    <div className="relative overflow-hidden aspect-[16/9] bg-black">
                      <img
                        src="/images/shop-by-budget-hero.jpg"
                        alt="VASTRAA Curated Ethnic & Contemporary Collections"
                        className="w-full h-full object-cover object-center transform transition-transform duration-700 ease-out group-hover:scale-105 select-none"
                        loading="eager"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = "/images/artisan-handloom-saree.png";
                        }}
                      />
                      {/* Vignette gradients */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/20 pointer-events-none" />
                      <div className="absolute inset-0 bg-gradient-to-r from-black/30 via-transparent to-black/30 pointer-events-none" />
                    </div>

                    {/* Bottom Info Strip */}
                    <div className="p-3 bg-gradient-to-r from-[#031535] via-[#0A1F44] to-[#031535] border-t border-[#D4AF37]/30 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-full bg-[#D4AF37]/20 border border-[#D4AF37]/40 flex items-center justify-center shrink-0">
                          <Sparkles size={12} className="text-[#FCE3B4]" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold text-white tracking-wide truncate">
                            6 Curated Fashion Worlds
                          </p>
                          <p className="text-[9px] text-[#E2C799] font-medium truncate">
                            Sarees • Kurtis • Gowns • Dresses • Suits • Winter
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-[#0A1F44] bg-[#FCE3B4] px-2 py-0.5 rounded-full shadow-xs">
                        All Budgets
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* ── CATEGORY SEARCH BAR ── */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mb-8">
          <div className="bg-white rounded-xl shadow-xs border border-stone-200 p-2 sm:p-3 flex items-center gap-2">
            <Search size={18} className="text-stone-400 ml-2 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search categories, weaves, or styles (e.g. Paithani, Straight Kurti, Velvet, Anarkali)..."
              className="w-full text-xs sm:text-sm bg-transparent outline-none text-[#0A1F44] placeholder-stone-400 py-1"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="p-1.5 rounded-full hover:bg-stone-100 text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </section>

        {/* ── ALL MAIN CATEGORIES AND SUBCATEGORIES ON ONE PAGE ── */}
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          {filteredCategories.length === 0 ? (
            <div className="bg-white rounded-2xl border border-stone-200 p-12 text-center max-w-lg mx-auto shadow-xs">
              <Search size={36} className="mx-auto text-stone-300 mb-3" />
              <h3 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">No Categories Found</h3>
              <p className="text-xs text-stone-500 mb-4">
                We couldn't find any category matching "{searchQuery}". Try a different keyword or reset your search.
              </p>
              <button
                type="button"
                data-testid="empty-clear-search-btn"
                onClick={() => setSearchQuery("")}
                className="px-4 py-2 bg-[#0A1F44] text-white rounded-full text-xs font-semibold cursor-pointer hover:bg-[#162B54]"
              >
                Clear Search
              </button>
            </div>
          ) : (
            filteredCategories.map((category) => (
              <CategorySection
                key={category.id}
                category={category}
                activeBudget={activeBudget}
                activeCategoryParam={activeCategoryParam}
              />
            ))
          )}
        </main>
      </div>
    </Layout>
  );
}

interface CategorySectionProps {
  category: CatalogCategoryItem;
  activeBudget: BudgetRange;
  activeCategoryParam?: string | null;
}

function CategorySection({ category, activeBudget, activeCategoryParam }: CategorySectionProps) {
  const [, navigate] = useLocation();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const isFocusedCategory = useMemo(() => {
    if (!activeCategoryParam) return false;
    const norm = activeCategoryParam.toLowerCase().trim();
    return category.slug === norm || category.subcategories.some((s) => s.slug === norm);
  }, [category, activeCategoryParam]);

  const checkScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 10);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 10);
  };

  const handleScroll = (direction: "left" | "right") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const offset = direction === "left" ? -320 : 320;
    el.scrollBy({ left: offset, behavior: "smooth" });
    setTimeout(checkScroll, 350);
  };

  // Prepend "Explore All" as the primary first card
  const allItems = useMemo(() => {
    const exploreAllCard = {
      id: `${category.slug}-explore-all`,
      name: `Explore All ${category.name}`,
      slug: "all",
      isAll: true,
      image: getCategoryOrSubcategoryImage(category.slug, category.slug, category.coverImage),
    };

    const subCards = category.subcategories.map((sub) => ({
      id: sub.id,
      name: sub.name,
      slug: sub.slug,
      isAll: false,
      image: getCategoryOrSubcategoryImage(sub.slug, category.slug),
    }));

    return [exploreAllCard, ...subCards];
  }, [category]);

  const handleSelectCard = (item: { slug: string; isAll: boolean }) => {
    const url = buildProductListingUrl(
      category.slug,
      item.isAll ? null : item.slug,
      activeBudget
    );
    navigate(url);
  };

  return (
    <section
      aria-labelledby={`cat-heading-${category.slug}`}
      className="bg-white rounded-2xl border border-stone-200/80 p-5 sm:p-7 shadow-xs hover:shadow-sm transition-shadow"
    >
      {/* ── SECTION HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-6 pb-4 border-b border-stone-100">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2
              id={`cat-heading-${category.slug}`}
              className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-[#0A1F44]"
            >
              {category.name}
            </h2>
            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#FAF9F5] text-stone-600 border border-stone-200">
              {category.subcategories.length} {category.slug === "sarees" ? "Weaves & Styles" : "Subcategories"}
            </span>
            {isFocusedCategory && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#D4AF37]/15 text-[#B8860B] border border-[#D4AF37]/40 flex items-center gap-1">
                <Sparkles size={11} className="text-[#D4AF37]" /> Focused Collection
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-stone-500 max-w-2xl line-clamp-2">
            {category.description}
          </p>
        </div>

        {/* View All In Category Link */}
        <button
          type="button"
          onClick={() => handleSelectCard({ slug: "all", isAll: true })}
          className="text-xs font-bold text-[#0A1F44] uppercase tracking-wider hover:text-[#D4AF37] hover:underline flex items-center gap-1 cursor-pointer shrink-0 self-start sm:self-auto"
        >
          View All {category.name} ({activeBudget.label}) <ArrowRight size={13} />
        </button>
      </div>

      {/* ── CIRCULAR CATEGORY & SUBCATEGORY CARDS ROW ── */}
      <div className="relative group/nav">
        {/* Left Scroll Button */}
        {canScrollLeft && (
          <button
            type="button"
            aria-label={`Scroll ${category.name} left`}
            onClick={() => handleScroll("left")}
            className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow-md border border-stone-200 items-center justify-center text-[#0A1F44] hover:bg-stone-50 hover:scale-105 transition-all cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
        )}

        {/* Right Scroll Button */}
        {canScrollRight && (
          <button
            type="button"
            aria-label={`Scroll ${category.name} right`}
            onClick={() => handleScroll("right")}
            className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white shadow-md border border-stone-200 items-center justify-center text-[#0A1F44] hover:bg-stone-50 hover:scale-105 transition-all cursor-pointer"
          >
            <ChevronRight size={16} />
          </button>
        )}

        {/* Scrollable Container */}
        <div
          ref={scrollContainerRef}
          onScroll={checkScroll}
          className="flex items-start gap-4 sm:gap-6 overflow-x-auto pb-4 pt-1 px-1 scrollbar-none snap-x"
        >
          {allItems.map((item) => {
            const isCardActive = !item.isAll && activeCategoryParam && item.slug.toLowerCase() === activeCategoryParam.toLowerCase().trim();

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectCard(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectCard(item);
                  }
                }}
                className="group flex flex-col items-center text-center cursor-pointer shrink-0 snap-start w-[84px] sm:w-[98px] lg:w-[110px]"
              >
                {/* Circular Card Image */}
                <div
                  className={cn(
                    "relative w-18 h-18 sm:w-22 sm:h-22 lg:w-24 lg:h-24 rounded-full overflow-hidden border-2 transition-all duration-300 p-0.5 shadow-xs group-hover:shadow-md group-hover:-translate-y-1",
                    isCardActive
                      ? "border-[#D4AF37] ring-4 ring-[#D4AF37]/35 shadow-md bg-[#D4AF37]/10"
                      : item.isAll
                      ? "border-[#0A1F44] bg-[#0A1F44]/5 group-hover:border-[#D4AF37]"
                      : "border-stone-200 bg-stone-50 group-hover:border-[#D4AF37]"
                  )}
                >
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="w-full h-full object-cover rounded-full group-hover:scale-110 transition-transform duration-500"
                    onError={(e) => {
                      // Fallback to artisan handloom image on load failure
                      (e.target as HTMLImageElement).src = "/images/artisan-handloom-saree.png";
                    }}
                  />
                  {item.isAll && (
                    <div className="absolute inset-0 bg-[#0A1F44]/40 flex items-center justify-center rounded-full text-white text-[10px] font-bold uppercase tracking-wider backdrop-blur-xs">
                      All
                    </div>
                  )}
                  {isCardActive && (
                    <div className="absolute -top-1 -right-1 z-20 px-1.5 py-0.5 rounded-full bg-[#D4AF37] text-[#0A1F44] text-[8px] font-black uppercase tracking-wider shadow-xs border border-white">
                      Selected
                    </div>
                  )}
                </div>

                {/* Category / Subcategory Label */}
                <span
                  className={cn(
                    "mt-2 text-[11px] sm:text-xs font-semibold leading-tight line-clamp-2 transition-colors",
                    isCardActive
                      ? "text-[#B8860B] font-bold"
                      : item.isAll
                      ? "text-[#0A1F44] font-bold group-hover:text-[#D4AF37]"
                      : "text-stone-700 group-hover:text-[#0A1F44]"
                  )}
                >
                  {item.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
