import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ProductCardSkeletonProps {
  className?: string;
  index?: number;
}

export function ProductCardSkeleton({ className, index = 0 }: ProductCardSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading product"
      className={cn(
        "relative bg-white dark:bg-[#12141A] rounded-2xl overflow-hidden border border-[#C7CCD1]/30 dark:border-white/10 shadow-xs flex flex-col h-full",
        className
      )}
    >
      {/* Top badges placeholder */}
      <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1.5">
        <Skeleton className="h-5 w-16 rounded-md bg-white/70 dark:bg-white/20" />
      </div>

      {/* Floating wishlist button placeholder */}
      <div className="absolute top-2.5 right-2.5 z-10">
        <Skeleton className="w-8 h-8 rounded-full bg-white/80 dark:bg-white/20" />
      </div>

      {/* Aspect 3/4 Image Canvas */}
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-[#F8F7F4] dark:bg-[#1E2329]">
        <Skeleton className="w-full h-full rounded-none" />
      </div>

      {/* Product Details Content */}
      <div className="p-4 bg-white dark:bg-[#12141A] flex flex-col flex-1 justify-between gap-3">
        <div className="space-y-2">
          {/* Vendor line */}
          <Skeleton className="h-3 w-24 rounded" />

          {/* Product Title (2 lines) */}
          <Skeleton className="h-4 w-full rounded" />
          <Skeleton className="h-4 w-3/4 rounded" />
        </div>

        <div>
          {/* Star Rating line */}
          <div className="flex items-center gap-2 mb-2.5">
            <Skeleton className="h-3.5 w-12 rounded" />
            <Skeleton className="h-3 w-8 rounded" />
          </div>

          {/* Price & Discount Line */}
          <div className="flex items-baseline justify-between pt-2.5 border-t border-[#C7CCD1]/20 dark:border-white/10">
            <div className="flex items-baseline gap-2">
              <Skeleton className="h-5 w-16 rounded" />
              <Skeleton className="h-3.5 w-12 rounded" />
            </div>
            <Skeleton className="h-3 w-10 rounded" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductCardSkeleton;
