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

const KENBURNS_CSS = `
@keyframes td-kb-a {
  from { transform: scale(1.0) translate(0%, 0%); }
  to   { transform: scale(1.09) translate(-2%, -1.5%); }
}
@keyframes td-kb-b {
  from { transform: scale(1.0) translate(0%, 0%); }
  to   { transform: scale(1.09) translate(2%, 1.5%); }
}
`;

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
    const ms = images[activeIndex]?.slideIntervalMs ?? 6000;
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

  const kbAnim = activeIndex % 2 === 0 ? "td-kb-a" : "td-kb-b";

  return (
    <>
      <style>{KENBURNS_CSS}</style>
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
            transition={{ duration: 0.85, ease: "easeInOut" }}
            style={{ zIndex: 1 }}
          >
            <img
              src={images[activeIndex]?.imageUrl}
              alt="Hero banner"
              className="w-full h-full object-cover"
              style={{
                objectPosition: "top center",
                animation: `${kbAnim} 9s ease-in-out forwards`,
                willChange: "transform",
              }}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}
