import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Link } from "wouter";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface AdvertisementItem {
  id: string;
  title?: string;
  description?: string | null;
  imageUrl: string;
  linkUrl?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

/**
 * Resolves advertisement image URL from full URLs, API storage routes, or R2 object keys.
 */
export function getAdvertisementImageSrc(image?: string | null): string {
  const value = image?.trim();
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("data:")) {
    return value;
  }
  if (value.startsWith("/api/storage/public-objects/")) return value;
  if (value.startsWith("api/storage/public-objects/")) return `/${value}`;
  if (value.startsWith("/storage/public-objects/")) return `/api${value}`;
  if (value.startsWith("storage/public-objects/")) return `/api/${value}`;
  if (value.startsWith("/objects/")) return `/api/storage${value}`;
  if (value.startsWith("advertisements/")) return `/api/storage/public-objects/${value}`;
  if (value.startsWith("/advertisements/")) return `/api/storage/public-objects${value}`;
  return value;
}

interface AdvertisementCarouselProps {
  /** Optional override for ads (used in admin live preview) */
  advertisements?: AdvertisementItem[];
  className?: string;
  autoPlayIntervalMs?: number;
  /** Whether clicking an advertisement navigates via wouter Link (default true, false for admin previews) */
  interactiveLinks?: boolean;
}

let cachedAds: AdvertisementItem[] | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000;

export function AdvertisementCarousel({
  advertisements: propAds,
  className = "",
  autoPlayIntervalMs = 6000,
  interactiveLinks = true,
}: AdvertisementCarouselProps) {
  const [fetchedAds, setFetchedAds] = useState<AdvertisementItem[]>(() => {
    if (propAds) return propAds;
    if (cachedAds && Date.now() - lastFetchTime < CACHE_TTL_MS) {
      return cachedAds;
    }
    return [];
  });

  // Fetch active advertisements from public endpoint if not passed as prop, with 60s memory caching
  useEffect(() => {
    if (propAds) return;

    let isMounted = true;
    if (cachedAds && Date.now() - lastFetchTime < CACHE_TTL_MS) {
      setFetchedAds(cachedAds);
      return;
    }

    apiFetch("/api/advertisements")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AdvertisementItem[]) => {
        if (!isMounted) return;
        cachedAds = Array.isArray(data) ? data : [];
        lastFetchTime = Date.now();
        setFetchedAds(cachedAds);
      })
      .catch(() => {
        if (!isMounted) return;
        setFetchedAds([]);
      });

    return () => {
      isMounted = false;
    };
  }, [propAds]);

  const ads = propAds || fetchedAds;

  // Strict constraint: If no active advertisements, hide completely with zero DOM rendering
  if (!ads || ads.length === 0) {
    return null;
  }

  return (
    <AdvertisementCarouselView
      ads={ads}
      className={className}
      autoPlayIntervalMs={autoPlayIntervalMs}
      interactiveLinks={interactiveLinks}
    />
  );
}

function AdvertisementCarouselView({
  ads,
  className,
  autoPlayIntervalMs = 6000,
  interactiveLinks = true,
}: {
  ads: AdvertisementItem[];
  className?: string;
  autoPlayIntervalMs?: number;
  interactiveLinks?: boolean;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const [resetTimerKey, setResetTimerKey] = useState(0);

  // If exactly 2 ads, duplicate them to 4 items so Embla's peek-aligned loop is seamless without edge gaps
  const displayAds = useMemo(() => {
    if (ads.length === 2) {
      return [...ads, ...ads];
    }
    return ads;
  }, [ads]);

  const hasMultiple = ads.length > 1;

  // Initialize Embla carousel with center alignment to show partial cards on both sides
  const [emblaRef, emblaApi] = useEmblaCarousel({
    loop: hasMultiple,
    align: "center",
    skipSnaps: false,
    duration: 35,
  });

  const resetTimer = useCallback(() => {
    setResetTimerKey((prev) => prev + 1);
  }, []);

  const scrollPrev = useCallback(() => {
    if (emblaApi) {
      emblaApi.scrollPrev();
      resetTimer();
    }
  }, [emblaApi, resetTimer]);

  const scrollNext = useCallback(() => {
    if (emblaApi) {
      emblaApi.scrollNext();
      resetTimer();
    }
  }, [emblaApi, resetTimer]);

  const scrollTo = useCallback(
    (index: number) => {
      if (!emblaApi) return;
      if (ads.length === 2 && selectedIndex >= 2) {
        emblaApi.scrollTo(index + 2);
      } else {
        emblaApi.scrollTo(index);
      }
      resetTimer();
    },
    [emblaApi, ads.length, selectedIndex, resetTimer]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  // Preload all advertisement images into browser cache immediately for zero-lag transitions
  useEffect(() => {
    if (!ads || ads.length === 0) return;
    ads.forEach((ad) => {
      const src = getAdvertisementImageSrc(ad.imageUrl);
      if (src && typeof window !== "undefined") {
        const img = new Image();
        img.src = src;
      }
    });
  }, [ads]);

  // Decode the upcoming slide's image ahead of time
  useEffect(() => {
    if (!displayAds || displayAds.length <= 1) return;
    const nextIdx = (selectedIndex + 1) % displayAds.length;
    const nextSrc = getAdvertisementImageSrc(displayAds[nextIdx]?.imageUrl);
    if (nextSrc && typeof window !== "undefined") {
      const img = new Image();
      img.src = nextSrc;
      if ("decode" in img) {
        img.decode().catch(() => {});
      }
    }
  }, [selectedIndex, displayAds]);

  // Automatic scrolling every 6 seconds with infinite looping and pause-on-hover / pause-on-blur
  useEffect(() => {
    if (!emblaApi || displayAds.length <= 1 || isHovered) return;

    let intervalId: any = null;

    const startTimer = () => {
      if (intervalId) clearInterval(intervalId);
      intervalId = setInterval(() => {
        if (!document.hidden && emblaApi) {
          emblaApi.scrollNext();
        }
      }, autoPlayIntervalMs);
    };

    startTimer();

    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (intervalId) clearInterval(intervalId);
      } else {
        startTimer();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [emblaApi, displayAds.length, isHovered, autoPlayIntervalMs, resetTimerKey]);

  const activeDotIndex = ads.length > 0 ? selectedIndex % ads.length : 0;

  return (
    <section
      aria-label="Promotional Showcase"
      className={cn("w-full py-4 sm:py-6 md:py-8 bg-transparent select-none overflow-hidden", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="max-w-5xl mx-auto px-3 sm:px-6">
        <div className="relative group">
          {/* ── Carousel Viewport (Center alignment with peek preview) ── */}
          <div className="overflow-hidden" ref={emblaRef}>
            <div className="flex -ml-3 sm:-ml-4 items-center">
              {displayAds.map((ad, idx) => {
                const isCurrent = idx === selectedIndex;
                const canNavigate = interactiveLinks && Boolean(ad.linkUrl);
                const CardWrapper = canNavigate ? Link : "div";
                const wrapperProps = canNavigate ? { href: ad.linkUrl } : {};

                return (
                  <div
                    key={`${ad.id}-${idx}`}
                    className={cn(
                      "min-w-0 pl-3 sm:pl-4 transition-all duration-300",
                      hasMultiple
                        ? "flex-[0_0_80%] sm:flex-[0_0_83%] md:flex-[0_0_86%]"
                        : "flex-[0_0_100%] max-w-4xl mx-auto"
                    )}
                  >
                    <CardWrapper
                      {...(wrapperProps as any)}
                      className={cn(
                        "block relative w-full rounded-[20px] sm:rounded-[28px] md:rounded-[36px] overflow-hidden",
                        "border-2 border-[#0A1F44] dark:border-white/30 bg-white dark:bg-[#1E2329]",
                        "transition-all duration-300 shadow-sm transform-gpu will-change-transform",
                        isCurrent
                          ? "scale-100 opacity-100 shadow-md ring-1 ring-[#0A1F44]/10"
                          : "scale-[0.97] opacity-85",
                        canNavigate && "cursor-pointer group/card hover:border-[#2C3E6B]"
                      )}
                    >
                      {/* Responsive compact image container adhering to the reference horizontal outline */}
                      <div className="relative w-full aspect-[18/7] sm:aspect-[22/7] md:aspect-[26/7] lg:aspect-[30/7] max-h-[160px] sm:max-h-[200px] md:max-h-[230px] lg:max-h-[250px] bg-gray-50 dark:bg-gray-800 flex items-center justify-center overflow-hidden">
                        <img
                          src={getAdvertisementImageSrc(ad.imageUrl)}
                          alt={ad.title?.trim() || "Advertisement"}
                          className="w-full h-full object-cover object-center transition-transform duration-500 group-hover/card:scale-[1.02] will-change-transform"
                          loading={idx === 0 || idx === 1 ? "eager" : "lazy"}
                          decoding="async"
                          fetchPriority={idx === 0 ? "high" : "auto"}
                          onError={(e) => {
                            const el = e.currentTarget;
                            if (!el.dataset.errored) {
                              el.dataset.errored = "true";
                              el.src = "/images/paithani-banner.jpg";
                            }
                          }}
                        />

                        {/* Optional subtle gradient overlay only if non-empty title or description present */}
                        {Boolean(ad.title?.trim() || ad.description?.trim()) && (
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent p-3 sm:p-4 md:p-5 flex items-end justify-between pointer-events-none">
                            <div className="text-white max-w-2xl pointer-events-auto">
                              {Boolean(ad.title?.trim()) && (
                                <h3 className="font-serif text-sm sm:text-lg md:text-xl font-bold tracking-wide leading-tight drop-shadow-sm">
                                  {ad.title!.trim()}
                                </h3>
                              )}
                              {Boolean(ad.description?.trim()) && (
                                <p className="mt-0.5 sm:mt-1 text-[11px] sm:text-xs text-gray-200 line-clamp-1 sm:line-clamp-2 drop-shadow-sm">
                                  {ad.description!.trim()}
                                </p>
                              )}
                            </div>
                            {Boolean(ad.linkUrl?.trim()) && (
                              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-white bg-white/20 hover:bg-white/30 backdrop-blur-md px-2.5 py-1 rounded-full transition-colors shrink-0 ml-3 pointer-events-auto">
                                Explore <ExternalLink size={11} />
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </CardWrapper>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Navigation Arrows (Visible on hover or mobile, only if multiple ads) ── */}
          {hasMultiple && (
            <>
              <button
                type="button"
                onClick={scrollPrev}
                aria-label="Previous advertisement"
                className="absolute left-1.5 sm:left-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/90 dark:bg-[#0A1F44]/90 text-[#0A1F44] dark:text-white shadow-lg border border-[#C7CCD1]/40 flex items-center justify-center transition-all opacity-80 hover:opacity-100 hover:scale-105 active:scale-95 z-10 focus:outline-hidden cursor-pointer"
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                onClick={scrollNext}
                aria-label="Next advertisement"
                className="absolute right-1.5 sm:right-3 top-1/2 -translate-y-1/2 w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/90 dark:bg-[#0A1F44]/90 text-[#0A1F44] dark:text-white shadow-lg border border-[#C7CCD1]/40 flex items-center justify-center transition-all opacity-80 hover:opacity-100 hover:scale-105 active:scale-95 z-10 focus:outline-hidden cursor-pointer"
              >
                <ChevronRight size={18} />
              </button>
            </>
          )}

          {/* ── Pagination Indicator Pills (Only if multiple ads) ── */}
          {hasMultiple && (
            <div className="flex justify-center items-center gap-1.5 sm:gap-2 mt-3 sm:mt-4">
              {ads.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => scrollTo(i)}
                  aria-label={`Go to advertisement slide ${i + 1}`}
                  className={cn(
                    "h-1.5 sm:h-2 rounded-full transition-all duration-300 focus:outline-hidden cursor-pointer",
                    i === activeDotIndex
                      ? "w-5 sm:w-7 bg-[#0A1F44] dark:bg-[#C7CCD1]"
                      : "w-1.5 sm:w-2 bg-[#C7CCD1]/60 hover:bg-[#C7CCD1]"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
