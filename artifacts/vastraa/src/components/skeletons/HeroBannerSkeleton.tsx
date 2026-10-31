import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface HeroBannerSkeletonProps {
  className?: string;
  height?: string;
}

export function HeroBannerSkeleton({
  className,
  height = "h-[450px] md:h-[580px]",
}: HeroBannerSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading hero banner"
      className={cn(
        "relative w-full overflow-hidden bg-[#0A1F44]/5 dark:bg-[#0B0C10]",
        height,
        className
      )}
    >
      <Skeleton className="w-full h-full rounded-none" />

      {/* Hero content overlay placeholder */}
      <div className="absolute inset-0 flex items-center">
        <div className="max-w-7xl mx-auto px-6 md:px-12 w-full space-y-4 md:space-y-6">
          <Skeleton className="h-5 w-32 rounded-full bg-white/40 dark:bg-white/10" />
          <div className="space-y-3">
            <Skeleton className="h-10 md:h-14 w-3/4 max-w-xl rounded-lg bg-white/50 dark:bg-white/10" />
            <Skeleton className="h-5 md:h-6 w-1/2 max-w-md rounded bg-white/40 dark:bg-white/10" />
          </div>
          <div className="flex gap-4 pt-2">
            <Skeleton className="h-12 w-40 rounded-xl bg-white/60 dark:bg-white/20" />
            <Skeleton className="h-12 w-36 rounded-xl bg-white/30 dark:bg-white/10" />
          </div>
        </div>
      </div>

      {/* Pagination dots */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        <Skeleton className="w-8 h-2 rounded-full bg-white/70" />
        <Skeleton className="w-2 h-2 rounded-full bg-white/40" />
        <Skeleton className="w-2 h-2 rounded-full bg-white/40" />
      </div>
    </div>
  );
}

export default HeroBannerSkeleton;
