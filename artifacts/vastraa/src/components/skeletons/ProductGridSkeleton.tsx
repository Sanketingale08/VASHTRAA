import React from "react";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { cn } from "@/lib/utils";

export interface ProductGridSkeletonProps {
  count?: number;
  columns?: 2 | 3 | 4 | "responsive";
  className?: string;
  cardClassName?: string;
}

export function ProductGridSkeleton({
  count = 8,
  columns = "responsive",
  className,
  cardClassName,
}: ProductGridSkeletonProps) {
  const gridColsClass =
    columns === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : columns === 3
      ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
      : columns === 4
      ? "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      : "grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4";

  return (
    <div
      aria-busy="true"
      aria-label="Loading products grid"
      className={cn("grid gap-6 items-stretch", gridColsClass, className)}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="h-full flex flex-col">
          <ProductCardSkeleton index={i} className={cardClassName} />
        </div>
      ))}
    </div>
  );
}

export default ProductGridSkeleton;
