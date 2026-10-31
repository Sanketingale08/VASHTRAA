import React from "react";
import { Link, useLocation } from "wouter";
import { Sparkles, ArrowRight, Tag, Crown, IndianRupee } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PriceRangeOption {
  id: string;
  label: string;
  subtext: string;
  min?: number;
  max?: number;
  badge?: string;
  icon?: React.ReactNode;
}

export const PRICE_RANGES: PriceRangeOption[] = [
  {
    id: "under-500",
    label: "Under ₹500",
    subtext: "Budget Finds",
    min: 0,
    max: 500,
    badge: "Budget",
  },
  {
    id: "under-1000",
    label: "Under ₹1,000",
    subtext: "Popular Favorites",
    min: 0,
    max: 1000,
    badge: "Popular",
  },
  {
    id: "under-2000",
    label: "Under ₹2,000",
    subtext: "Festive Collection",
    min: 0,
    max: 2000,
    badge: "Best Value",
  },
  {
    id: "2000-5000",
    label: "₹2,000 – ₹5,000",
    subtext: "Handloom Weaves",
    min: 2000,
    max: 5000,
    badge: "Handloom",
  },
  {
    id: "premium",
    label: "Premium (₹5,000+)",
    subtext: "Royal & Bridal",
    min: 5000,
    max: undefined,
    badge: "Luxury",
    icon: <Crown size={14} className="text-amber-400 inline-block ml-1" />,
  },
];

interface PriceRangeCardsProps {
  variant?: "home" | "strip" | "grid";
  activeMin?: number;
  activeMax?: number;
  onSelect?: (min?: number, max?: number) => void;
  className?: string;
}

export function PriceRangeCards({
  variant = "home",
  activeMin,
  activeMax,
  onSelect,
  className,
}: PriceRangeCardsProps) {
  const [, setLocation] = useLocation();

  const isOptionSelected = (option: PriceRangeOption) => {
    return (
      (activeMin === option.min || (option.min === 0 && (activeMin === 0 || activeMin === undefined) && activeMax !== undefined)) &&
      (activeMax === option.max || (option.max === undefined && activeMax === undefined))
    );
  };

  const handleCardClick = (option: PriceRangeOption) => {
    if (onSelect) {
      const isSelected = isOptionSelected(option);
      if (isSelected) {
        onSelect(undefined, undefined);
      } else {
        onSelect(option.min, option.max);
      }
    } else {
      const params = new URLSearchParams();
      if (option.min !== undefined) params.set("minPrice", String(option.min));
      if (option.max !== undefined) params.set("maxPrice", String(option.max));
      const qs = params.toString();
      setLocation(`/products${qs ? `?${qs}` : ""}`);
    }
  };

  if (variant === "strip") {
    return (
      <div className={cn("flex items-center gap-2 py-1 overflow-x-auto scrollbar-none", className)}>
        <span className="text-xs font-bold text-[#0A1F44] uppercase tracking-wider flex items-center gap-1 shrink-0 mr-1">
          <Tag size={13} className="text-[#C7CCD1]" /> Budget:
        </span>
        {PRICE_RANGES.map((option) => {
          const isSelected = isOptionSelected(option);
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => handleCardClick(option)}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 cursor-pointer flex items-center gap-1.5 shrink-0 border",
                isSelected
                  ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-xs font-semibold"
                  : "bg-white text-[#0A1F44] border-[#C7CCD1]/40 hover:border-[#0A1F44] hover:bg-gray-50"
              )}
            >
              <span>{option.label}</span>
              {option.badge && !isSelected && (
                <span className="text-[9px] px-1.5 py-0.2 bg-[#F4F5F7] text-[#0A1F44] font-semibold rounded-full border border-[#C7CCD1]/30">
                  {option.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 xs:gap-3 sm:gap-4 items-stretch", className)}>
      {PRICE_RANGES.map((option) => {
        const isSelected = isOptionSelected(option);
        return (
          <div
            key={option.id}
            onClick={() => handleCardClick(option)}
            className={cn(
              "group relative overflow-hidden rounded-xl p-4 transition-all duration-200 cursor-pointer flex flex-col justify-between h-full min-h-[140px] border-2 shadow-xs hover:shadow-md box-border",
              isSelected
                ? "bg-gradient-to-br from-[#0A1F44] to-[#162B54] text-white border-[#0A1F44]"
                : "bg-white dark:bg-[#1f242d] hover:border-[#0A1F44]/50 border-[#C7CCD1]/40 text-[#0A1F44] dark:text-white"
            )}
          >
            {/* Top Row: Badge & Icon */}
            <div className="flex items-center justify-between h-6 mb-2">
              {option.badge ? (
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    isSelected
                      ? "bg-white/15 text-[#FCE3B4] border-white/20"
                      : "bg-[#F4F5F7] text-[#0A1F44] border-[#C7CCD1]/30"
                  )}
                >
                  {option.badge}
                </span>
              ) : <div />}
              {option.icon ? option.icon : <div />}
            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col justify-center">
              <h4 className={cn("font-serif font-bold text-base sm:text-lg leading-tight mb-1", isSelected ? "text-white" : "text-[#0A1F44] dark:text-white")}>
                {option.label}
              </h4>
              <p className={cn("text-xs leading-snug", isSelected ? "text-gray-200" : "text-gray-500 dark:text-gray-400")}>
                {option.subtext}
              </p>
            </div>

            {/* Bottom Arrow Indicator */}
            <div className="mt-3 flex items-center justify-end h-4">
              <span className={cn("text-[11px] font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform", isSelected ? "text-[#FCE3B4]" : "text-[#0A1F44] opacity-70 group-hover:opacity-100")}>
                Explore <ArrowRight size={12} />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
