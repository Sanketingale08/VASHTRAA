import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface TableRowSkeletonProps {
  columns?: number;
  rows?: number;
  className?: string;
  cellClassName?: string;
}

export function TableRowSkeleton({
  columns = 6,
  rows = 5,
  className,
  cellClassName,
}: TableRowSkeletonProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rIdx) => (
        <tr
          key={rIdx}
          aria-hidden="true"
          className={cn("border-b border-gray-100 dark:border-white/5", className)}
        >
          {Array.from({ length: columns }).map((_, cIdx) => (
            <td key={cIdx} className={cn("px-4 py-3.5", cellClassName)}>
              {cIdx === 0 ? (
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
                  <div className="space-y-1.5 flex-1 min-w-0">
                    <Skeleton className="h-4 w-3/4 rounded" />
                    <Skeleton className="h-3 w-1/2 rounded" />
                  </div>
                </div>
              ) : cIdx === columns - 1 ? (
                <div className="flex justify-end gap-2">
                  <Skeleton className="h-7 w-14 rounded-md" />
                </div>
              ) : (
                <Skeleton
                  className={cn(
                    "h-4 rounded",
                    cIdx % 2 === 0 ? "w-20" : "w-14"
                  )}
                />
              )}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export default TableRowSkeleton;
