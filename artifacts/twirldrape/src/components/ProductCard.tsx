import React from "react";
import { Heart, Star } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useWishlist } from "@/context/WishlistContext";
import { useUser } from "@clerk/react";
import type { ProductSummary } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

type ProductCardProduct = {
  id: string;
  name: string;
  vendorName?: string;
  vendor?: string;
  price: number;
  originalPrice?: number | null;
  rating: number;
  reviewCount?: number;
  reviews?: number;
  image?: string;
  images?: string[];
  isBestSeller?: boolean;
  isNewArrival?: boolean;
};

interface ProductCardProps {
  product: ProductCardProduct;
  index?: number;
}

export function ProductCard({ product, index = 0 }: ProductCardProps) {
  const { wishlistedIds, toggle } = useWishlist();
  const { isSignedIn } = useUser();
  const isWishlisted = wishlistedIds.has(product.id);

  const vendorLabel = product.vendorName ?? product.vendor ?? "";
  const reviewCount = product.reviewCount ?? product.reviews ?? 0;
  const image =
    (product.images && product.images.length > 0 ? product.images[0] : undefined) ??
    product.image ??
    "/images/product-1.png";

  function handleWishlistClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      window.location.href = `${basePath}/sign-in`;
      return;
    }
    toggle(product.id);
  }

  return (
    <Link href={`/products/${product.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: index * 0.1 }}
        className="group relative bg-[#F5EDE0] dark:bg-[#2A2E35] rounded-lg overflow-hidden border border-[#C9A84C]/10 hover:border-[#C9A84C] transition-all duration-300 hover:shadow-[0_0_15px_rgba(201,168,76,0.3)] cursor-pointer"
        data-testid={`card-product-${product.id}`}
      >
        {/* Badges */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          {product.isBestSeller && (
            <span className="bg-[#C9A84C] text-[#7B1C2C] text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              Best Seller
            </span>
          )}
          {product.isNewArrival && (
            <span className="bg-[#7B1C2C] text-[#FAF6EE] text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              New Arrival
            </span>
          )}
          {product.originalPrice && (
            <span className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              Sale
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={handleWishlistClick}
          title={isSignedIn ? (isWishlisted ? "Remove from wishlist" : "Add to wishlist") : "Sign in to save"}
          className="absolute top-2 right-2 z-10 p-2 bg-white/80 dark:bg-black/40 backdrop-blur rounded-full hover:bg-white transition-colors"
        >
          <Heart
            size={18}
            className={cn(
              "transition-colors",
              isWishlisted
                ? "fill-[#7B1C2C] text-[#7B1C2C]"
                : "text-gray-600 dark:text-gray-300",
            )}
          />
        </button>

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          <img
            src={image}
            alt={product.name}
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-700"
          />

          {/* Quick Add Overlay */}
          <div className="absolute inset-x-0 bottom-0 p-4 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/80 to-transparent">
            <button
              onClick={(e) => e.preventDefault()}
              className="w-full bg-[#C9A84C] hover:bg-[#b59539] text-[#7B1C2C] font-semibold py-2 text-sm transition-colors rounded"
            >
              Quick Add
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{vendorLabel}</p>
          <h3 className="font-serif text-lg leading-tight mb-2 line-clamp-2 min-h-[2.75rem] text-[#7B1C2C] dark:text-[#FAF6EE]">
            {product.name}
          </h3>

          <div className="flex items-center gap-1 mb-2">
            <div className="flex text-[#C9A84C]">
              <Star size={14} className="fill-current" />
            </div>
            <span className="text-xs font-medium">{product.rating}</span>
            <span className="text-xs text-gray-500">({reviewCount})</span>
          </div>

          <div className="flex items-end gap-2">
            <span className="font-semibold text-lg text-[#7B1C2C] dark:text-[#C9A84C]">
              ₹{product.price.toLocaleString("en-IN")}
            </span>
            {product.originalPrice && (
              <span className="text-sm text-gray-500 line-through mb-0.5">
                ₹{product.originalPrice.toLocaleString("en-IN")}
              </span>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
