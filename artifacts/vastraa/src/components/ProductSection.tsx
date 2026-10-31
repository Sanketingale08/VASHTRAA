import React, { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { ProductCardSkeleton } from "@/components/skeletons";
import { useListProducts } from "@workspace/api-client-react";
import type { ListProductsParams, ProductSummary } from "@workspace/api-client-react";

const GOLD = "#C7CCD1";
const MAROON = "#0A1F44";
const IVORY = "#F4F5F7";

export interface SectionTab {
  label: string;
  category: "paithani" | "designer";
}

export interface ProductSectionProps {
  title: string;
  subtitle?: string;
  viewAllHref?: string;
  params?: ListProductsParams;
  tabs?: SectionTab[];
  bg?: string;
  onQuickView?: (product: ProductSummary) => void;
  flashSale?: boolean;
  countdown?: string;
}

function SkeletonCard() {
  return (
    <div className="flex-none w-[calc(50%-8px)] md:w-[calc(25%-12px)] h-full">
      <ProductCardSkeleton />
    </div>
  );
}

function FlashCountdown({ targetMs }: { targetMs: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()));

  useEffect(() => {
    const id = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1000));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <div className="flex items-center gap-2 text-sm font-bold">
      <span className="text-white/70 text-xs">Ends in:</span>
      {[pad(h), pad(m), pad(s)].map((unit, i) => (
        <React.Fragment key={i}>
          <span className="bg-white/20 text-white px-2 py-0.5 rounded font-mono text-sm min-w-[2.2rem] text-center">
            {unit}
          </span>
          {i < 2 && <span className="text-white/60">:</span>}
        </React.Fragment>
      ))}
    </div>
  );
}

export function ProductSection({
  title,
  subtitle,
  viewAllHref,
  params = {},
  tabs,
  bg,
  onQuickView,
  flashSale,
  countdown,
}: ProductSectionProps) {
  const [activeTabIdx, setActiveTabIdx] = useState(0);
  const activeCategory = tabs?.[activeTabIdx]?.category;

  const queryParams: ListProductsParams = {
    limit: 8,
    ...params,
    ...(activeCategory ? { category: activeCategory } : params?.category ? {} : {}),
  };

  const { data, isLoading, isError } = useListProducts(queryParams);
  const products = data?.products ?? [];

  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: false, align: "start" });
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    const onSelect = () => {
      setCanPrev(emblaApi.canScrollPrev());
      setCanNext(emblaApi.canScrollNext());
    };
    emblaApi.on("select", onSelect);
    onSelect();
    return () => { emblaApi.off("select", onSelect); };
  }, [emblaApi]);

  useEffect(() => {
    emblaApi?.scrollTo(0);
  }, [activeTabIdx, emblaApi]);

  const saleEndMs = countdown
    ? new Date(countdown).getTime()
    : Date.now() + 1000 * 60 * 60 * 23 + 1000 * 60 * 47;

  function buildViewAllHref(): string {
    if (!tabs) return viewAllHref ?? "/paithani/shop";
    const cat = activeCategory ?? "paithani";
    const base = `/${cat}/shop`;
    const qs = new URLSearchParams();
    if (queryParams.newArrival) qs.set("newArrival", "true");
    if (queryParams.bestSeller) qs.set("bestSeller", "true");
    if (queryParams.hasDiscount) qs.set("hasDiscount", "true");
    if (queryParams.occasion) qs.set("occasion", queryParams.occasion);
    if (queryParams.sort && queryParams.sort !== "rating_desc") qs.set("sort", queryParams.sort);
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
  }

  const effectiveViewAll = buildViewAllHref();

  return (
    <section className="py-12 md:py-16" style={{ background: bg ?? IVORY }}>
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Standardized Section Header */}
        <div className="text-center mb-8 md:mb-10">
          <div className="flex items-center justify-center gap-3 md:gap-4 mb-2.5">
            <span
              className="flex-1 max-w-[60px] md:max-w-[80px] h-px"
              style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }}
            />
            <div className="flex items-center gap-2">
              {flashSale && <span className="text-2xl">⚡</span>}
              <h2
                className={`font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide ${
                  flashSale ? "text-white" : "text-[#0A1F44]"
                }`}
              >
                {title}
              </h2>
            </div>
            <span
              className="flex-1 max-w-[60px] md:max-w-[80px] h-px"
              style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }}
            />
          </div>
          {subtitle && (
            <p
              className={`text-sm md:text-base max-w-2xl mx-auto ${
                flashSale ? "text-white/70" : "text-gray-500"
              }`}
            >
              {subtitle}
            </p>
          )}

          {flashSale && (
            <div className="flex justify-center mt-3">
              <FlashCountdown targetMs={saleEndMs} />
            </div>
          )}

          {tabs && tabs.length > 0 && (
            <div className="flex justify-center mt-4">
              <div className="inline-flex gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/10 border border-[#C7CCD1]/30">
                {tabs.map((tab, idx) => (
                  <button
                    key={tab.label}
                    onClick={() => setActiveTabIdx(idx)}
                    className={`px-4 py-1.5 rounded-lg text-xs md:text-sm font-semibold transition-all ${
                      activeTabIdx === idx
                        ? "bg-[#0A1F44] text-[#F4F5F7] shadow-sm"
                        : "text-gray-500 hover:text-[#0A1F44]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Carousel */}
        <div className="relative">
          <button
            onClick={scrollPrev}
            disabled={!canPrev}
            className="absolute -left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all disabled:opacity-0"
            style={{ background: IVORY, borderColor: GOLD + "55", color: MAROON }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={scrollNext}
            disabled={!canNext}
            className="absolute -right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border transition-all disabled:opacity-0"
            style={{ background: IVORY, borderColor: GOLD + "55", color: MAROON }}
          >
            <ChevronRight size={20} />
          </button>

          <div ref={emblaRef} className="overflow-hidden px-1">
            <div className="flex gap-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
              ) : isError || products.length === 0 ? (
                <div className="w-full py-12 text-center text-gray-400">
                  <p className="text-sm font-medium">No products available at the moment.</p>
                </div>
              ) : (
                products.map((p, i) => (
                  <div key={p.id} className="flex-none w-[calc(50%-8px)] md:w-[calc(25%-12px)]">
                    <ProductCard
                      product={p}
                      index={i}
                      onQuickView={onQuickView}
                      flashSaleEndMs={flashSale ? saleEndMs : undefined}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Bottom-Right View All Button */}
        <div className="mt-6 md:mt-8 flex justify-end">
          <Link
            href={effectiveViewAll}
            className="inline-flex items-center gap-1 font-bold text-xs md:text-sm uppercase tracking-wider px-5 py-2.5 rounded-md border transition-all duration-300 hover:shadow-md"
            style={
              flashSale
                ? { borderColor: GOLD, color: GOLD, backgroundColor: "rgba(255,255,255,0.08)" }
                : { borderColor: MAROON, color: MAROON, backgroundColor: "white" }
            }
          >
            View All →
          </Link>
        </div>
      </div>
    </section>
  );
}
