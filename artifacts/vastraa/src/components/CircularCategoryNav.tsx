import React, { useRef, useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { getCategoryOrSubcategoryImage } from "@/constants/categoryImages";

export interface CircularCategoryItem {
  id: string;
  name: string;
  slug: string;
  image?: string;
  fallbackImage?: string;
  route?: string;
  itemCount?: number;
  subtypes?: string[];
}

export interface CircularCategoryNavProps {
  items: CircularCategoryItem[];
  activeSlug?: string | null;
  onSelect: (item: CircularCategoryItem) => void;
  exploreAllLabel?: string;
  exploreAllImage?: string;
  onExploreAll: () => void;
  parentCategorySlug?: string;
  parentCategoryName?: string;
  onBackToParent?: () => void;
  title?: string;
  subtitle?: string;
  className?: string;
  showScrollButtons?: boolean;
}

export function CircularCategoryNav({
  items,
  activeSlug,
  onSelect,
  exploreAllLabel = "Explore All",
  exploreAllImage,
  onExploreAll,
  parentCategorySlug,
  parentCategoryName,
  onBackToParent,
  title,
  subtitle,
  className,
  showScrollButtons = true,
}: CircularCategoryNavProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 6);
      setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 6);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    const el = scrollContainerRef.current;
    if (!el) return;

    const handleResize = () => checkScroll();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [checkScroll, items]);

  // Center active element on mount or activeSlug change
  useEffect(() => {
    if (scrollContainerRef.current) {
      checkScroll();
      const activeEl = scrollContainerRef.current.querySelector<HTMLElement>('[data-active="true"]');
      if (activeEl && typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      }
    }
  }, [activeSlug, checkScroll]);

  if (!items || items.length === 0) {
    return null;
  }

  const isExploreAllActive = !activeSlug || activeSlug === "all" || activeSlug === "";

  const scroll = (direction: "left" | "right") => {
    if (scrollContainerRef.current) {
      const scrollAmount = direction === "left" ? -320 : 320;
      if (typeof scrollContainerRef.current.scrollBy === "function") {
        scrollContainerRef.current.scrollBy({ left: scrollAmount, behavior: "smooth" });
      } else {
        scrollContainerRef.current.scrollLeft += scrollAmount;
      }
      setTimeout(checkScroll, 350);
    }
  };

  const defaultExploreAllImg =
    exploreAllImage ||
    getCategoryOrSubcategoryImage(
      "all",
      parentCategorySlug,
      "/images/artisan-handloom-saree.png"
    );

  return (
    <nav
      aria-label="Category and Subcategory Navigation"
      className={cn("w-full max-w-full overflow-hidden mb-8 relative", className)}
    >
      {/* Optional Breadcrumb / Parent link */}
      {parentCategoryName && onBackToParent && (
        <div className="flex items-center gap-2 mb-3 px-1 text-xs text-gray-500">
          <button
            type="button"
            onClick={onBackToParent}
            className="font-semibold text-[#0A1F44] hover:underline flex items-center gap-1 cursor-pointer transition-colors"
          >
            <ChevronLeft size={14} />
            <span>All {parentCategoryName}</span>
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-600">
            {activeSlug ? items.find((i) => i.slug === activeSlug)?.name || activeSlug : "All Varieties"}
          </span>
        </div>
      )}

      {/* Title & Subtitle if provided */}
      {title && (
        <div className="mb-4 px-1">
          <h2 className="font-serif text-lg sm:text-xl font-bold text-[#0A1F44]">
            {title}
          </h2>
          {subtitle && (
            <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
          )}
        </div>
      )}

      {/* Main Single-Line Carousel Wrapper */}
      <div className="relative group w-full max-w-full">
        {/* Desktop Left Scroll Button */}
        {showScrollButtons && (
          <button
            type="button"
            onClick={() => scroll("left")}
            aria-label="Scroll left"
            className={cn(
              "hidden md:flex absolute -left-2 top-10 sm:top-12 lg:top-14 -translate-y-1/2 z-20",
              "w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 border border-[#D4AF37]/50 shadow-md",
              "items-center justify-center text-[#0A1F44] hover:bg-[#0A1F44] hover:text-[#D4AF37] hover:border-[#0A1F44]",
              "hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none",
              !canScrollLeft ? "opacity-0 pointer-events-none md:opacity-40" : "opacity-90 hover:opacity-100"
            )}
          >
            <ChevronLeft size={18} />
          </button>
        )}

        {/* Desktop Right Scroll Button */}
        {showScrollButtons && (
          <button
            type="button"
            onClick={() => scroll("right")}
            aria-label="Scroll right"
            className={cn(
              "hidden md:flex absolute -right-2 top-10 sm:top-12 lg:top-14 -translate-y-1/2 z-20",
              "w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-white/95 border border-[#D4AF37]/50 shadow-md",
              "items-center justify-center text-[#0A1F44] hover:bg-[#0A1F44] hover:text-[#D4AF37] hover:border-[#0A1F44]",
              "hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer focus:outline-none",
              !canScrollRight ? "opacity-0 pointer-events-none md:opacity-40" : "opacity-90 hover:opacity-100"
            )}
          >
            <ChevronRight size={18} />
          </button>
        )}

        {/* Gradient edge cues on desktop when scrollable */}
        {canScrollLeft && (
          <div className="hidden md:block pointer-events-none absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white via-white/80 to-transparent z-10" />
        )}
        {canScrollRight && (
          <div className="hidden md:block pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white via-white/80 to-transparent z-10" />
        )}

        {/* STRICT SINGLE-LINE HORIZONTAL SCROLLER: flex-nowrap with NO flex-wrap */}
        <div
          ref={scrollContainerRef}
          role="tablist"
          onScroll={checkScroll}
          className="flex flex-nowrap items-start gap-4 sm:gap-6 lg:gap-8 overflow-x-auto pb-4 pt-2 px-2 sm:px-3 scroll-smooth snap-x select-none w-full scrollbar-none [&::-webkit-scrollbar]:hidden"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {/* 1. Explore All / All [Category] Circular Card */}
          <button
            type="button"
            role="tab"
            aria-selected={isExploreAllActive}
            data-active={isExploreAllActive ? "true" : "false"}
            onClick={onExploreAll}
            className="shrink-0 snap-start flex flex-col items-center group cursor-pointer text-center focus:outline-none select-none transition-transform w-[86px] sm:w-[104px] lg:w-[118px]"
          >
            <div
              className={cn(
                "relative rounded-full p-0.5 transition-all duration-300",
                isExploreAllActive
                  ? "ring-2 ring-offset-2 ring-[#0A1F44] shadow-lg shadow-[#0A1F44]/20 scale-105"
                  : "hover:scale-105 hover:shadow-md"
              )}
            >
              <div
                className={cn(
                  "w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 aspect-square rounded-full overflow-hidden bg-gradient-to-br from-[#0A1F44] to-[#1E2D4A] flex items-center justify-center p-0.5 border-2 transition-colors",
                  isExploreAllActive
                    ? "border-[#D4AF37]"
                    : "border-gray-200/90 group-hover:border-[#D4AF37]/80"
                )}
              >
                <div className="w-full h-full rounded-full overflow-hidden relative aspect-square">
                  <img
                    src={getProductImageSrc(defaultExploreAllImg)}
                    alt={exploreAllLabel}
                    onError={replaceProductImageWithFallback}
                    className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500 rounded-full"
                  />
                  <div className="absolute inset-0 bg-[#0A1F44]/35 flex flex-col items-center justify-center text-white backdrop-blur-[0.5px]">
                    <Sparkles size={18} className="text-[#D4AF37] animate-pulse" />
                  </div>
                </div>
              </div>
            </div>

            <span
              title={exploreAllLabel}
              className={cn(
                "text-xs sm:text-[13px] lg:text-sm text-center mt-2.5 max-w-[85px] sm:max-w-[100px] lg:max-w-[115px] line-clamp-2 leading-tight transition-colors break-words",
                isExploreAllActive
                  ? "font-bold text-[#0A1F44]"
                  : "font-medium text-gray-700 group-hover:text-[#0A1F44]"
              )}
            >
              {exploreAllLabel}
            </span>

            {isExploreAllActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1 shadow-xs animate-in fade-in zoom-in duration-200" />
            )}
          </button>

          {/* 2. Category / Subcategory Circular Cards */}
          {items.map((item) => {
            const isSelected =
              activeSlug?.toLowerCase() === item.slug.toLowerCase() ||
              activeSlug?.toLowerCase() === item.name.toLowerCase();

            const resolvedImage =
              item.image ||
              getCategoryOrSubcategoryImage(
                item.slug,
                parentCategorySlug,
                item.fallbackImage
              );

            return (
              <button
                key={item.id || item.slug}
                type="button"
                role="tab"
                aria-selected={isSelected}
                data-active={isSelected ? "true" : "false"}
                onClick={() => onSelect(item)}
                className="shrink-0 snap-start flex flex-col items-center group cursor-pointer text-center focus:outline-none select-none transition-transform w-[86px] sm:w-[104px] lg:w-[118px]"
              >
                <div
                  className={cn(
                    "relative rounded-full p-0.5 transition-all duration-300",
                    isSelected
                      ? "ring-2 ring-offset-2 ring-[#0A1F44] shadow-lg shadow-[#0A1F44]/20 scale-105"
                      : "hover:scale-105 hover:shadow-md"
                  )}
                >
                  <div
                    className={cn(
                      "w-20 h-20 sm:w-24 sm:h-24 lg:w-28 lg:h-28 aspect-square rounded-full overflow-hidden bg-gray-50 flex items-center justify-center p-0.5 border-2 transition-colors",
                      isSelected
                        ? "border-[#D4AF37] bg-white"
                        : "border-gray-200/90 group-hover:border-[#D4AF37]/80"
                    )}
                  >
                    <div className="w-full h-full rounded-full overflow-hidden relative aspect-square">
                      <img
                        src={getProductImageSrc(resolvedImage)}
                        alt={item.name}
                        onError={replaceProductImageWithFallback}
                        className="w-full h-full object-cover object-center group-hover:scale-110 transition-transform duration-500 rounded-full"
                      />
                      {/* Subtle gradient vignette for visual luxury */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent opacity-60 group-hover:opacity-30 transition-opacity" />
                    </div>
                  </div>
                </div>

                <span
                  title={item.name}
                  className={cn(
                    "text-xs sm:text-[13px] lg:text-sm text-center mt-2.5 max-w-[85px] sm:max-w-[100px] lg:max-w-[115px] line-clamp-2 leading-tight transition-colors break-words",
                    isSelected
                      ? "font-bold text-[#0A1F44]"
                      : "font-medium text-gray-700 group-hover:text-[#0A1F44]"
                  )}
                >
                  {item.name}
                </span>

                {isSelected && (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37] mt-1 shadow-xs animate-in fade-in zoom-in duration-200" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
