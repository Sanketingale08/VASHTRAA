import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface SearchSuggestionsSkeletonProps {
  className?: string;
  count?: number;
}

export function SearchSuggestionsSkeleton({ className }: SearchSuggestionsSkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading search suggestions"
      className={cn("p-4 space-y-4 bg-white dark:bg-[#12141A] rounded-2xl shadow-xl border border-gray-100 dark:border-white/10", className)}
    >
      <div className="flex items-center justify-between">
        <Skeleton className="h-3.5 w-24 rounded" />
      </div>

      <div className="space-y-2.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 py-1">
            <Skeleton className="w-4 h-4 rounded-full shrink-0" />
            <Skeleton className="h-4 flex-1 rounded" />
            <Skeleton className="h-4 w-16 rounded-full" />
          </div>
        ))}
      </div>

      <div className="pt-3 border-t border-gray-100 dark:border-white/5 space-y-2">
        <Skeleton className="h-3 w-28 rounded" />
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2 p-1.5 rounded-lg border border-gray-100 dark:border-white/5">
              <Skeleton className="w-10 h-12 rounded shrink-0" />
              <div className="space-y-1 flex-1 min-w-0">
                <Skeleton className="h-3 w-4/5 rounded" />
                <Skeleton className="h-3 w-12 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default SearchSuggestionsSkeleton;
