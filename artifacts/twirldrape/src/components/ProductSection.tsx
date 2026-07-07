import React, { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { useListProducts } from "@workspace/api-client-react";
import type { ListProductsParams, ProductSummary } from "@workspace/api-client-react";

const GOLD = "#C9A84C";
const MAROON = "#7B1C2C";
const IVORY = "#FAF6EE";

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
    <div className="flex-none w-[calc(50%-8px)] md:w-[calc(25%-12px)] rounded-lg overflow-hidden bg-[#F5EDE0] dark:bg-[#2A2E35] animate-pulse">
      <div className="aspect-square bg-gray-200 dark:bg-[#3A3E45]" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-gray-200 dark:bg-[#3A3E45] rounded w-3/4" />
        <div className="h-4 bg-gray-200 dark:bg-[#3A3E45] rounded" />
        <div className="h-3 bg-gray-200 dark:bg-[#3A3E45] rounded w-1/2" />
      </div>
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

  const { data, isLoading } = useListProducts(queryParams);
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
    <section className="py-16 md:py-20" style={{ background: bg ?? IVORY }}>
      <div className="container mx-auto px-4">
        {/* Header */}
        <div className="mb-8 md:mb-10">
          {flashSale ? (
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">⚡</span>
                  <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold text-white">
                    {title}
                  </h2>
                </div>
                {subtitle && <p className="text-white/60 text-sm md:text-base">{subtitle}</p>}
              </div>
              <FlashCountdown targetMs={saleEndMs} />
            </div>
          ) : (
            <div className="text-center mb-2">
              <div className="flex items-center justify-center gap-4 mb-3">
                <span
                  className="flex-1 max-w-[80px] h-px"
                  style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }}
                />
                <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#7B1C2C]">
                  {title}
                </h2>
                <span
                  className="flex-1 max-w-[80px] h-px"
                  style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }}
                />
              </div>
              {subtitle && <p className="text-sm md:text-base text-gray-500">{subtitle}</p>}
            </div>
          )}

          {/* Tabs + View All row */}
          {(tabs || viewAllHref) && (
            <div className="flex items-center justify-between mt-4">
              {tabs ? (
                <div className="flex gap-1 p-1 rounded-xl bg-black/5 dark:bg-white/10">
                  {tabs.map((tab, idx) => (
                    <button
                      key={tab.label}
                      onClick={() => setActiveTabIdx(idx)}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        activeTabIdx === idx
                          ? "bg-[#7B1C2C] text-[#FAF6EE] shadow-sm"
                          : "text-gray-500 hover:text-[#7B1C2C]"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              ) : <div />}
              <Link
                href={effectiveViewAll}
                className="text-xs font-bold uppercase tracking-wider text-[#7B1C2C] hover:text-[#C9A84C] flex items-center gap-1 transition-colors"
                style={flashSale ? { color: GOLD } : {}}
              >
                View All →
              </Link>
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
              ) : products.length === 0 ? (
                <div className="w-full py-12 text-center text-gray-400">
                  <p className="text-sm">No products found in this collection yet.</p>
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

        {/* Bottom View All */}
        <div className="mt-10 text-center">
          <Link
            href={effectiveViewAll}
            className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-3.5 rounded-sm border-2 transition-all"
            style={
              flashSale
                ? { borderColor: GOLD, color: GOLD }
                : { borderColor: MAROON, color: MAROON }
            }
          >
            View All {title} →
          </Link>
        </div>
      </div>
    </section>
  );
}
