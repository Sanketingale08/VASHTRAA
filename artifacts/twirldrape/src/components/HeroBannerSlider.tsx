import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface Banner {
  id: string;
  imageUrl: string;
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
  fallbackSrc = "/images/home-paithani.png",
  className = "",
  style,
}: HeroBannerSliderProps) {
  const images: Banner[] =
    Array.isArray(banners) && banners.length > 0
      ? banners
      : [{ id: "fallback", imageUrl: fallbackSrc, slideIntervalMs: 6000 }];

  const [activeIndex, setActiveIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    if (images.length > 1) {
      const nextIdx = (activeIndex + 1) % images.length;
      const img = new Image();
      img.src = images[nextIdx].imageUrl;
    }
  }, [activeIndex, images]);

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={style}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={images[activeIndex]?.id ?? activeIndex}
          className="absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: "easeInOut" }}
          style={{ zIndex: 1 }}
        >
          <img
            src={images[activeIndex]?.imageUrl}
            alt="Hero banner"
            loading={activeIndex === 0 ? "eager" : "lazy"}
            className="w-full h-full object-cover"
            style={{ objectPosition: "top center" }}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
