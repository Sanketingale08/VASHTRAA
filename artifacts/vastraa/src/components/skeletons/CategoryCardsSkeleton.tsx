import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CategoryCardsSkeletonProps {
  count?: number;
  className?: string;
}

export function CategoryCardsSkeleton({
  count = 6,
  className,
}: CategoryCardsSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading categories"
      className={cn(
        "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4 md:gap-6",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col items-center gap-3">
          <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-[#C7CCD1]/30 p-1">
            <Skeleton className="w-full h-full rounded-full" />
          </div>
          <Skeleton className="h-4 w-20 rounded" />
        </div>
      ))}
    </div>
  );
}

export default CategoryCardsSkeleton;
