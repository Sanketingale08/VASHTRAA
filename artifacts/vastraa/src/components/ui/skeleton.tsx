import React from "react";
import { cn } from "@/lib/utils";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean;
}

export function Skeleton({
  className,
  shimmer = true,
  ...props
}: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-[#E5E8EC] dark:bg-[#1E2329]",
        shimmer ? "skeleton-shimmer" : "animate-pulse",
        className
      )}
      {...props}
    />
  );
}

export default Skeleton;

export { ProductCardSkeleton } from "@/components/skeletons/ProductCardSkeleton";
export { ProductGridSkeleton } from "@/components/skeletons/ProductGridSkeleton";
export { ProductDetailsSkeleton } from "@/components/skeletons/ProductDetailsSkeleton";
export { TableRowSkeleton } from "@/components/skeletons/TableRowSkeleton";
export { DashboardStatsSkeleton } from "@/components/skeletons/DashboardStatsSkeleton";
export { ChartSkeleton } from "@/components/skeletons/ChartSkeleton";
export { OrderCardSkeleton } from "@/components/skeletons/OrderCardSkeleton";
export { ProfileSkeleton } from "@/components/skeletons/ProfileSkeleton";
export { PageSectionSkeleton } from "@/components/skeletons/PageSectionSkeleton";
export { HeroBannerSkeleton } from "@/components/skeletons/HeroBannerSkeleton";
export { CategoryCardsSkeleton } from "@/components/skeletons/CategoryCardsSkeleton";
export { CheckoutSkeleton } from "@/components/skeletons/CheckoutSkeleton";
export { CartSkeleton } from "@/components/skeletons/CartSkeleton";
export { SearchSuggestionsSkeleton } from "@/components/skeletons/SearchSuggestionsSkeleton";

