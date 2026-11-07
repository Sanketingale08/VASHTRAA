import React from "react";
import { useLocation } from "wouter";
import { ArrowRight, Tag, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUDGET_RANGES, BudgetRange, getBudgetById } from "@/constants/budget";

export interface PriceRangeOption {
  id: string;
  label: string;
  subtext: string;
  min?: number;
  max?: number;
  badge?: string;
  icon?: React.ReactNode;
}

export const PRICE_RANGES: PriceRangeOption[] = BUDGET_RANGES
  .filter((b) => b.id !== "under-500")
  .map((b) => ({
    id: b.id,
    label: b.label,
    subtext: b.subtext,
    min: b.min,
    max: b.max,
    badge: b.badge,
    icon: b.id === "5000-above" ? <Crown size={13} className="text-amber-400 inline-block ml-1" /> : undefined,
  }));

export interface PriceRangeCardsProps {
  variant?: "home" | "strip" | "grid";
  activeMin?: number;
  activeMax?: number;
  category?: string;
  onSelect?: (min?: number, max?: number, budgetId?: string) => void;
  className?: string;
}

export function PriceRangeCards({
  variant = "home",
  activeMin,
  activeMax,
  category,
  onSelect,
  className,
}: PriceRangeCardsProps) {
  const [, setLocation] = useLocation();

  const isOptionSelected = (option: PriceRangeOption) => {
    if (activeMin === undefined && activeMax === undefined) return false;

    // Direct comparison
    if (activeMin === option.min && activeMax === option.max) return true;

    // Handle inclusive/exclusive price boundaries and legacy test ranges
    if (option.id === "under-500") {
      return (activeMin === 0 || activeMin === undefined) && (activeMax === 499 || activeMax === 500);
    }
    if (option.id === "500-1000") {
      return (
        (activeMin === 500 || (activeMin === 0 && (activeMax === 999 || activeMax === 1000))) &&
        (activeMax === 999 || activeMax === 1000)
      );
    }
    if (option.id === "1000-2000") {
      return (
        (activeMin === 1000 || (activeMin === 0 && (activeMax === 1999 || activeMax === 2000))) &&
        (activeMax === 1999 || activeMax === 2000)
      );
    }
    if (option.id === "2000-5000") {
      return activeMin === 2000 && (activeMax === 4999 || activeMax === 5000);
    }
    if (option.id === "5000-above") {
      return activeMin === 5000 && (activeMax === undefined || activeMax === null);
    }

    return false;
  };

  const handleCardClick = (option: PriceRangeOption) => {
    if (onSelect) {
      const isSelected = isOptionSelected(option);
      if (isSelected) {
        onSelect(undefined, undefined, undefined);
      } else {
        onSelect(option.min, option.max, option.id);
      }
    } else {
      const params = new URLSearchParams();
      params.set("budget", option.id);
      if (option.min !== undefined) params.set("minPrice", String(option.min));
      if (option.max !== undefined) params.set("maxPrice", String(option.max));
      if (category) params.set("category", category);
      const qs = params.toString();
      setLocation(`/shop-by-budget?${qs}`);
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
    <div
      className={cn(
        "flex lg:grid lg:grid-cols-4 gap-3.5 sm:gap-4 items-stretch overflow-x-auto pb-3 pt-1 px-1 scrollbar-none snap-x",
        className
      )}
    >
      {PRICE_RANGES.map((option) => {
        const isSelected = isOptionSelected(option);
        return (
          <div
            key={option.id}
            role="button"
            tabIndex={0}
            onClick={() => handleCardClick(option)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                handleCardClick(option);
              }
            }}
            className={cn(
              "group relative overflow-hidden rounded-xl p-5 sm:p-6 transition-all duration-300 cursor-pointer flex flex-col justify-between min-h-[185px] sm:min-h-[195px] border shadow-xs hover:shadow-lg hover:-translate-y-1 box-border min-w-[210px] sm:min-w-[220px] lg:min-w-0 snap-start flex-1 text-left",
              isSelected
                ? "bg-gradient-to-br from-[#0A1F44] to-[#162B54] text-white border-[#0A1F44] shadow-md ring-2 ring-[#D4AF37]/50"
                : "bg-white hover:border-[#D4AF37] border-stone-200/90 text-[#0A1F44] hover:bg-[#FAF9F5]/40"
            )}
          >
            {/* Top Row: Badge & Crown/Icon */}
            <div className="flex items-center justify-between mb-3">
              {option.badge ? (
                <span
                  className={cn(
                    "text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border transition-colors shadow-2xs",
                    isSelected
                      ? "bg-white/15 text-[#FCE3B4] border-white/20"
                      : "bg-[#FDFBF7] text-[#0A1F44] border-[#D4AF37]/40 group-hover:bg-[#0A1F44] group-hover:text-white group-hover:border-[#0A1F44]"
                  )}
                >
                  {option.badge}
                </span>
              ) : <div />}

              {option.icon ? (
                <div className="w-5 h-5 rounded-full bg-amber-400/10 flex items-center justify-center border border-amber-400/20">
                  {option.icon}
                </div>
              ) : null}
            </div>

            {/* Middle Section: Price Range (Primary Focus) and Description */}
            <div className="flex-1 flex flex-col justify-center my-2">
              <h4
                className={cn(
                  "font-serif font-bold text-xl sm:text-2xl lg:text-[22px] leading-tight tracking-tight transition-colors mb-1.5",
                  isSelected ? "text-white" : "text-[#0A1F44]"
                )}
              >
                {option.label}
              </h4>
              <p
                className={cn(
                  "text-xs sm:text-sm font-medium leading-snug transition-colors",
                  isSelected ? "text-gray-200" : "text-gray-500"
                )}
              >
                {option.subtext}
              </p>
            </div>

            {/* Bottom Row: Explore Action Indicator */}
            <div
              className={cn(
                "mt-4 pt-3 border-t flex items-center justify-between transition-colors",
                isSelected ? "border-white/15" : "border-stone-100 group-hover:border-[#D4AF37]/30"
              )}
            >
              <span
                className={cn(
                  "text-xs font-bold flex items-center gap-1.5 transition-colors",
                  isSelected
                    ? "text-[#FCE3B4]"
                    : "text-[#0A1F44] group-hover:text-[#D4AF37]"
                )}
              >
                <span>Explore</span>
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-1" />
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
