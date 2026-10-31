import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface CheckoutSkeletonProps {
  className?: string;
}

export function CheckoutSkeleton({ className }: CheckoutSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading checkout"
      className={cn("min-h-screen bg-[#F4F5F7] dark:bg-[#1E2329] py-8 md:py-12", className)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
        {/* Header */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-48 rounded" />
          <Skeleton className="h-4 w-72 rounded" />
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Delivery & Payment Sections */}
          <div className="lg:col-span-7 space-y-6">
            {/* Step 1: Address Card */}
            <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Skeleton className="w-6 h-6 rounded-full" />
                  <Skeleton className="h-5 w-36 rounded" />
                </div>
                <Skeleton className="h-8 w-24 rounded-lg" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <Skeleton className="h-24 rounded-xl border border-gray-200" />
                <Skeleton className="h-24 rounded-xl border border-gray-200" />
              </div>
            </div>

            {/* Step 2: Delivery Method */}
            <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-5 w-32 rounded" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
            </div>

            {/* Step 3: Payment Options */}
            <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <Skeleton className="w-6 h-6 rounded-full" />
                <Skeleton className="h-5 w-40 rounded" />
              </div>
              <div className="space-y-3">
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
                <Skeleton className="h-14 rounded-xl" />
              </div>
            </div>
          </div>

          {/* Right Column: Order Summary Sticky Card */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs space-y-5 sticky top-24">
              <Skeleton className="h-6 w-36 rounded" />

              {/* Items Preview Strip */}
              <div className="space-y-3 pb-4 border-b border-gray-100 dark:border-white/5">
                {[1, 2].map((idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <Skeleton className="w-14 h-16 rounded-xl shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-4/5 rounded" />
                      <Skeleton className="h-3 w-20 rounded" />
                    </div>
                    <Skeleton className="h-4 w-16 rounded" />
                  </div>
                ))}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2.5 pb-4 border-b border-gray-100 dark:border-white/5">
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-16 rounded" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24 rounded" />
                  <Skeleton className="h-4 w-14 rounded" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-20 rounded" />
                  <Skeleton className="h-4 w-12 rounded" />
                </div>
              </div>

              {/* Total & CTA */}
              <div className="flex justify-between items-baseline pt-1">
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

export default CheckoutSkeleton;
