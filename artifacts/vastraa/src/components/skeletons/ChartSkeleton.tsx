import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ChartSkeletonProps {
  title?: string;
  height?: number | string;
  className?: string;
}

export function ChartSkeleton({
  title,
  height = 320,
  className,
}: ChartSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading chart data"
      className={cn(
        "bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-6 shadow-xs flex flex-col justify-between",
        className
      )}
      style={{ minHeight: typeof height === "number" ? `${height}px` : height }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="space-y-1.5">
          {title ? (
            <p className="font-serif font-bold text-base text-[#0A1F44] dark:text-[#E5E8EC]">
              {title}
            </p>
          ) : (
            <Skeleton className="h-5 w-40 rounded" />
          )}
          <Skeleton className="h-3 w-28 rounded" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-7 w-16 rounded-lg" />
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      </div>

      {/* Simulated Chart Bars / Grid */}
      <div className="flex-1 flex items-end gap-3 sm:gap-6 pt-6 pb-2 px-2 border-b border-gray-100 dark:border-white/5">
        {[40, 65, 30, 85, 55, 95, 70, 45, 80, 60].map((h, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
            <Skeleton
              className="w-full rounded-t-md transition-all"
              style={{ height: `${h}%` }}
            />
            <Skeleton className="h-2.5 w-6 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default ChartSkeleton;
