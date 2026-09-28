import React from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { useLocation } from "wouter";

const GOLD = "#C7CCD1";

export const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

export interface CategoryCardData {
  label: string;
  tagline: string;
  description: string;
  image: string;
  fallback: string;
  bg: string;
  chipLabel: string;
}

/**
 * Shared category card used by New Arrivals, Paithani, Designer,
 * Bridal Collection, Party Wear, Festival, and other category pages.
 *
 * Pass `href` for navigation-based cards (all category pages except New Arrivals).
 * Pass `onSelect` + `isActive` for in-page filter cards (New Arrivals).
 */
export function CategoryCard({
  card,
  index,
  isActive = false,
  onSelect,
  href,
  ctaText = "Shop Now",
}: {
  card: CategoryCardData;
  index: number;
  isActive?: boolean;
  onSelect?: () => void;
  href?: string;
  ctaText?: string;
}) {
  const [, navigate] = useLocation();

  function handleClick() {
    if (onSelect) {
      onSelect();
    } else if (href) {
      navigate(href);
    }
  }

  const buttonLabel = onSelect && isActive ? "Showing Below" : ctaText;

  return (
    <motion.div
      custom={index}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true }}
      variants={fadeUp}
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      onClick={handleClick}
      className="relative group rounded-2xl overflow-hidden min-h-[240px] md:min-h-[280px] flex flex-col justify-end cursor-pointer shadow-lg hover:shadow-2xl transition-shadow duration-500"
      style={{
        background: card.bg,
        outline: isActive ? `3px solid ${GOLD}` : "3px solid transparent",
        outlineOffset: "2px",
      }}
    >
      <img
        src={card.image}
        alt={card.label}
        className="absolute inset-0 w-full h-full object-cover opacity-30 group-hover:opacity-40 group-hover:scale-105 transition-all duration-700"
        onError={(e) => {
          (e.target as HTMLImageElement).src = card.fallback;
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />

      <div className="relative z-10 p-7 md:p-9">
        <span
          className="inline-block px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] mb-4 border"
          style={{ color: GOLD, borderColor: GOLD + "55", background: GOLD + "15" }}
        >
          ✨ {card.chipLabel}
        </span>
        <p className="text-xs font-bold uppercase tracking-[0.2em] mb-2" style={{ color: GOLD }}>
          {card.tagline}
        </p>
        <h3 className="font-serif text-2xl md:text-3xl font-bold text-white mb-3 leading-tight">
          {card.label}
        </h3>
        <p className="text-white/65 text-sm mb-6 leading-relaxed max-w-sm">
          {card.description}
        </p>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleClick();
          }}
          className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-6 py-3 rounded-sm transition-all duration-300 group-hover:gap-3"
          style={{ background: GOLD, color: "#0A1F44" }}
        >
          {buttonLabel} <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}
