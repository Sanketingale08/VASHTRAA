import React from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";

export function SectionSwitcher() {
  const [location] = useLocation();

  if (location === "/") return null;

  const isPaithani = location.startsWith("/paithani");
  const isDesigner = location.startsWith("/designer");

  return (
    <div className="w-full border-b border-[#C9A84C]/20 bg-[#FAF6EE] dark:bg-[#1E2329] sticky top-[73px] z-30 shadow-sm">
      <div className="container mx-auto px-4">
        <div className="flex justify-center space-x-8 md:space-x-16">
          <Link href="/paithani">
            <span className={cn(
              "block py-3 font-serif text-lg tracking-wide transition-colors relative cursor-pointer",
              isPaithani ? "text-[#7B1C2C] dark:text-[#C9A84C] font-semibold" : "text-gray-500 hover:text-[#7B1C2C] dark:hover:text-[#C9A84C]"
            )}>
              Paithani Sarees
              {isPaithani && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#C9A84C]"></span>
              )}
            </span>
          </Link>
          <Link href="/designer">
            <span className={cn(
              "block py-3 font-serif text-lg tracking-wide transition-colors relative cursor-pointer",
              isDesigner ? "text-[#7B1C2C] dark:text-[#C9A84C] font-semibold" : "text-gray-500 hover:text-[#7B1C2C] dark:hover:text-[#C9A84C]"
            )}>
              Designer Sarees
              {isDesigner && (
                <span className="absolute bottom-0 left-0 w-full h-0.5 bg-[#C9A84C]"></span>
              )}
            </span>
          </Link>
        </div>
      </div>
    </div>
  );
}
