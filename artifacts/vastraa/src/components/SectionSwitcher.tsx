import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export function SectionSwitcher() {
  const [location] = useLocation();

  const isPaithani = location.startsWith("/paithani");
  const isDesigner = location.startsWith("/designer");

  return (
    <div className="w-full border-b border-[#C7CCD1]/20 bg-[#F4F5F7] dark:bg-[#1E2329] sticky top-[73px] z-30 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-center space-x-8 md:space-x-16">
          <Link href="/paithani">
            <span className={cn(
              "block py-3 font-serif text-lg tracking-wide transition-colors relative cursor-pointer",
              isPaithani ? "text-[#0A1F44] dark:text-[#C7CCD1] font-semibold" : "text-gray-500 hover:text-[#0A1F44] dark:hover:text-[#C7CCD1]"
            )}>
              Paithani Sarees
              {isPaithani && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#C7CCD1]"></span>
              )}
            </span>
          </Link>
          <Link href="/designer">
            <span className={cn(
              "block py-3 font-serif text-lg tracking-wide transition-colors relative cursor-pointer",
              isDesigner ? "text-[#0A1F44] dark:text-[#C7CCD1] font-semibold" : "text-gray-500 hover:text-[#0A1F44] dark:hover:text-[#C7CCD1]"
            )}>
              Designer Sarees
              {isDesigner && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#C7CCD1]"></span>
              )}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
