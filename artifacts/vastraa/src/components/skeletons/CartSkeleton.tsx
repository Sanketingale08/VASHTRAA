import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CartSkeletonProps {
  className?: string;
}

export function CartSkeleton({ className }: CartSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading shopping cart"
      className={cn("min-h-screen bg-[#F4F5F7] dark:bg-[#1E2329] py-8 md:py-12", className)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        <div className="space-y-2">
          <Skeleton className="h-8 w-44 rounded" />
          <Skeleton className="h-4 w-32 rounded" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Cart Items List */}
          <div className="lg:col-span-8 space-y-4">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-5 shadow-xs flex flex-col sm:flex-row gap-4 items-center justify-between"
              >
                <div className="flex items-center gap-4 w-full sm:w-auto">
                  <Skeleton className="w-20 h-24 rounded-xl shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-48 rounded" />
                    <Skeleton className="h-3 w-28 rounded" />
                    <Skeleton className="h-5 w-20 rounded" />
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-6 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-0 border-gray-100 dark:border-white/5">
                  <Skeleton className="h-9 w-28 rounded-lg" />
                  <Skeleton className="h-5 w-20 rounded" />
                  <Skeleton className="w-8 h-8 rounded-full" />
                </div>
              </div>
            ))}
          </div>

          {/* Price Summary */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs space-y-5 sticky top-24">
              <Skeleton className="h-5 w-32 rounded" />

              <div className="space-y-3 pb-4 border-b border-gray-100 dark:border-white/5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-16 rounded" />
                  <Skeleton className="h-4 w-12 rounded" />
                </div>
              </div>

              <div className="flex justify-between items-baseline">
                <Skeleton className="h-5 w-24 rounded" />
                <Skeleton className="h-7 w-28 rounded" />
              </div>

              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CartSkeleton;
