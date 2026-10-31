import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface DashboardStatsSkeletonProps {
  count?: number;
  columns?: 2 | 4 | "responsive";
  className?: string;
}

export function DashboardStatsSkeleton({
  count = 4,
  columns = "responsive",
  className,
}: DashboardStatsSkeletonProps) {
  const gridColsClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 4
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading dashboard statistics"
      className={cn("grid gap-4", gridColsClass, className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-white dark:bg-[#12141A] rounded-2xl border border-gray-200/80 dark:border-white/10 p-5 shadow-xs flex flex-col justify-between h-32"
        >
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-28 rounded" />
            <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex items-baseline justify-between">
              <Skeleton className="h-7 w-32 rounded" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default DashboardStatsSkeleton;
