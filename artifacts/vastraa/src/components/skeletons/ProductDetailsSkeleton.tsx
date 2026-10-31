import React from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCardSkeleton } from "./ProductCardSkeleton";
import { cn } from "@/lib/utils";

export interface ProductDetailsSkeletonProps {
  className?: string;
  isDesigner?: boolean;
}

export function ProductDetailsSkeleton({
  className,
  isDesigner = false,
}: ProductDetailsSkeletonProps) {
  const bg = "bg-[#F4F5F7] text-[#3D1A1A]";
  const cardBg = "bg-white";

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading product details"
      className={cn("min-h-screen py-8 md:py-12", bg, className)}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        {/* Breadcrumb Skeleton */}
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-12 rounded" />
          <span className="opacity-30">/</span>
          <Skeleton className="h-4 w-20 rounded" />
          <span className="opacity-30">/</span>
          <Skeleton className="h-4 w-32 rounded" />
        </div>

        {/* 2-Column Product Detail Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12">
          {/* Left Column: Image Gallery Skeleton */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative aspect-[3/4] sm:aspect-square w-full rounded-2xl overflow-hidden shadow-sm border border-[#C7CCD1]/20">
              <Skeleton className="w-full h-full rounded-none" />
              <div className="absolute top-4 right-4">
                <Skeleton className="w-10 h-10 rounded-full" />
              </div>
            </div>

            {/* Thumbnail Strip */}
            <div className="flex gap-3 overflow-x-auto pb-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="w-20 h-20 shrink-0 rounded-xl overflow-hidden border border-[#C7CCD1]/30"
                >
                  <Skeleton className="w-full h-full rounded-none" />
                </div>
              ))}
            </div>
          </div>

          {/* Right Column: Product Info & Purchase Controls Skeleton */}
          <div className="lg:col-span-5 space-y-6">
            {/* Vendor & Category Badge */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-28 rounded-full" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Skeleton className="h-8 w-full rounded" />
              <Skeleton className="h-8 w-4/5 rounded" />
            </div>

            {/* Rating & Reviews */}
            <div className="flex items-center gap-3">
              <Skeleton className="h-5 w-24 rounded" />
              <Skeleton className="h-4 w-16 rounded" />
            </div>

            {/* Price block */}
            <div className={cn("p-4 rounded-xl border border-[#C7CCD1]/20 space-y-2", cardBg)}>
              <div className="flex items-baseline gap-3">
                <Skeleton className="h-8 w-32 rounded" />
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-6 w-16 rounded-md" />
              </div>
              <Skeleton className="h-3 w-48 rounded" />
            </div>

            {/* Attribute Chips (Fabric, Color, Occasion) */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-20 rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-8 w-20 rounded-lg" />
                <Skeleton className="h-8 w-24 rounded-lg" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>

            {/* Quantity & CTA Buttons */}
            <div className="space-y-3 pt-4 border-t border-[#C7CCD1]/20">
              <div className="flex items-center gap-4">
                <Skeleton className="h-12 w-32 rounded-xl" />
                <Skeleton className="h-12 flex-1 rounded-xl" />
              </div>
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>

            {/* Shipping & Trust Box */}
            <div className={cn("p-5 rounded-2xl border border-[#C7CCD1]/20 space-y-4", cardBg)}>
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-3 w-48 rounded" />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="w-8 h-8 rounded-full shrink-0" />
                <div className="space-y-1.5 flex-1">
                  <Skeleton className="h-4 w-36 rounded" />
                  <Skeleton className="h-3 w-40 rounded" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Related Products Skeleton Section */}
        <div className="pt-12 border-t border-[#C7CCD1]/20 space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-6 w-48 rounded" />
            <Skeleton className="h-4 w-64 rounded" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetailsSkeleton;
