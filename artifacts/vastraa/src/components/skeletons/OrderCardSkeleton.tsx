import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface OrderCardSkeletonProps {
  count?: number;
  className?: string;
}

export function OrderCardSkeleton({
  count = 3,
  className,
}: OrderCardSkeletonProps) {
  return (
    <div
      aria-busy="true"
      aria-label="Loading orders"
      className={cn("space-y-4", className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          role="status"
          aria-busy="true"
          aria-label="Loading order"
          className="bg-white dark:bg-[#12141A] rounded-2xl border border-[#C7CCD1]/30 dark:border-white/10 p-5 shadow-xs space-y-4"
        >
          {/* Order Header */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-white/5">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-28 rounded" />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <Skeleton className="h-3 w-36 rounded" />
            </div>
            <div className="text-right">
              <Skeleton className="h-5 w-24 rounded ml-auto" />
              <Skeleton className="h-3 w-16 rounded ml-auto mt-1" />
            </div>
          </div>

          {/* Items Row */}
          <div className="space-y-3">
            {[1, 2].map((itemIdx) => (
              <div key={itemIdx} className="flex items-center gap-4">
                <div className="w-16 h-20 rounded-xl overflow-hidden shrink-0 border border-gray-100 dark:border-white/5">
                  <Skeleton className="w-full h-full rounded-none" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <Skeleton className="h-4 w-4/5 rounded" />
                  <Skeleton className="h-3 w-32 rounded" />
                  <Skeleton className="h-3.5 w-20 rounded" />
                </div>
              </div>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-3 border-t border-gray-100 dark:border-white/5">
            <Skeleton className="h-9 w-28 rounded-xl" />
            <Skeleton className="h-9 w-32 rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default OrderCardSkeleton;
