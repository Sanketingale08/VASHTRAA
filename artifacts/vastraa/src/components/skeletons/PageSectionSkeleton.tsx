import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { cn } from "@/lib/utils";

export interface PageSectionSkeletonProps {
  titleWidth?: string;
  count?: number;
  className?: string;
}

export function PageSectionSkeleton({
  titleWidth = "w-64",
  count = 4,
  className,
}: PageSectionSkeletonProps) {
  return (
    <section
      role="status"
      aria-busy="true"
      aria-label="Loading section"
      className={cn("py-12 md:py-16 bg-white dark:bg-[#0B0C10]", className)}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8">
        {/* Section Title with Decorative Lines Skeleton */}
        <div className="text-center mb-8 md:mb-10">
          <div className="flex items-center justify-center gap-4 mb-2.5">
            <span className="flex-1 max-w-[80px] h-px bg-gray-200 dark:bg-gray-800" />
            <Skeleton className={cn("h-8 rounded", titleWidth)} />
            <span className="flex-1 max-w-[80px] h-px bg-gray-200 dark:bg-gray-800" />
          </div>
          <Skeleton className="h-4 w-48 rounded mx-auto mt-2" />
        </div>

        {/* Product Grid Skeleton */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {Array.from({ length: count }).map((_, i) => (
            <ProductCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default PageSectionSkeleton;
