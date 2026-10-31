import React, { useState, useEffect, useRef, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Banner {
  id: string;
  imageUrl: string;
  title?: string | null;
  slideIntervalMs?: number | null;
}

interface HeroBannerSliderProps {
  banners: Banner[];
  fallbackSrc?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function HeroBannerSlider({
  banners,
  fallbackSrc,
  className = "",
  style,
}: HeroBannerSliderProps) {
  // When banners are provided use them; otherwise fall back to fallbackSrc if
  // supplied (admin preview shows a placeholder image), or use an empty list
  // which causes the component to return null (storefront hides via parent guard).
  const images: Banner[] =
    Array.isArray(banners) && banners.length > 0
      ? banners
      : fallbackSrc
      ? [{ id: "fallback", imageUrl: fallbackSrc, slideIntervalMs: 6000 }]
      : [];

  const [activeIndex, setActiveIndex] = useState(0);
  // Track which banner IDs have finished loading — keyed by ID so switching
  // slides immediately hides the incoming image without waiting for an effect.
  const [loadedIds, setLoadedIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Slide timer — safely no-ops when images is empty or a single slide
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (images.length <= 1) return;
    const ms = Math.max(3000, images[activeIndex]?.slideIntervalMs ?? 6000);
    timerRef.current = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % images.length);
    }, ms);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [activeIndex, images.length]);

  // Prefetch the next image — safely no-ops when images is empty
  useEffect(() => {
    if (images.length > 1) {
      const nextIdx = (activeIndex + 1) % images.length;
      const img = new Image();
      img.src = images[nextIdx].imageUrl;
    }
  }, [activeIndex, images]);

  const handleImageLoad = useCallback((id: string) => {
    setLoadedIds((prev) => new Set([...prev, id]));
  }, []);

  const handleImageError = useCallback((id: string) => {
    setFailedIds((prev) => new Set([...prev, id]));
  }, []);

  const activeBanner = images[activeIndex];
  const isActiveLoaded = activeBanner ? loadedIds.has(activeBanner.id) : false;
  const isActiveFailed = activeBanner ? failedIds.has(activeBanner.id) : false;
  const isActiveReady = isActiveLoaded || isActiveFailed;

  // If a banner fails, move on to the next usable slide. When every banner
  // fails (or there is only one), leave the static cream background visible
  // instead of showing a broken image or an endless shimmer.
  useEffect(() => {
    if (images.length <= 1 || !activeBanner || !isActiveFailed) return;

    const nextIndex = Array.from({ length: images.length }, (_, offset) => {
      return (activeIndex + offset + 1) % images.length;
    }).find((index) => !failedIds.has(images[index].id));

    if (nextIndex !== undefined && nextIndex !== activeIndex) {
      setActiveIndex(nextIndex);
    }
  }, [activeBanner, activeIndex, failedIds, images, isActiveFailed]);

  // All hooks have been called unconditionally above — safe to return null now
  if (images.length === 0) return null;

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={style}
    >
      {/* Warm-cream shimmer placeholder — always underneath; animates until
          the active image has finished loading */}
      <div
        className="absolute inset-0"
        style={{
          zIndex: 0,
          background:
            "linear-gradient(135deg, #f5ede3 0%, #e8d5c4 40%, #f0e4d6 60%, #e8d5c4 100%)",
          backgroundSize: "200% 200%",
          animation: isActiveReady
            ? "none"
            : "heroBannerShimmer 2s ease-in-out infinite",
        }}
      />

      <AnimatePresence initial={false}>
        <motion.div
          key={activeBanner?.id ?? activeIndex}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{ zIndex: 1 }}
        >
          {/* Image fades in only after its onLoad fires */}
          {!isActiveFailed && (
            <img
              src={activeBanner?.imageUrl}
              alt="Hero banner"
              loading={activeIndex === 0 ? "eager" : "lazy"}
              onLoad={() => activeBanner && handleImageLoad(activeBanner.id)}
              onError={() => activeBanner && handleImageError(activeBanner.id)}
              className="w-full h-full object-cover"
              style={{
                objectPosition: "top center",
                opacity: isActiveLoaded ? 1 : 0,
                transition: "opacity 0.8s ease-in-out",
              }}
            />
          )}

          {/* Admin-configured caption — only rendered when title is set and
              the image is fully visible */}
          {activeBanner?.title && isActiveLoaded && (
            <div
              className="absolute bottom-0 left-0 right-0 px-8 py-6"
              style={{
                background:
                  "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.00) 100%)",
                zIndex: 2,
              }}
            >
              <p className="text-white font-serif font-semibold text-2xl md:text-3xl drop-shadow">
                {activeBanner.title}
              </p>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <style>{`
        @keyframes heroBannerShimmer {
          0%   { background-position: 0% 50%; }
          50%  { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>
    </div>
  );
}
