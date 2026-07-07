import React, { useState, useEffect } from "react";
import { Heart, Star, Eye } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
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
  stock?: number;
  category?: string;
  description?: string;
  occasion?: string;
  fabric?: string;
};

interface ProductCardProps {
  product: ProductCardProduct;
  index?: number;
  onQuickView?: (product: ProductSummary) => void;
  flashSaleEndMs?: number;
}

function CardCountdown({ endMs }: { endMs: number }) {
  const [rem, setRem] = useState(() => Math.max(0, endMs - Date.now()));
  useEffect(() => {
    const id = setInterval(() => setRem(r => Math.max(0, r - 1000)), 1000);
    return () => clearInterval(id);
  }, [endMs]);
  const h = Math.floor(rem / 3600000);
  const m = Math.floor((rem % 3600000) / 60000);
  const s = Math.floor((rem % 60000) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  if (rem === 0) return <span className="text-[10px] font-bold text-white uppercase tracking-wide">Sale Ended</span>;
  return (
    <div className="flex items-center gap-1 text-[10px] font-mono font-bold text-white">
      <span>⏱</span>
      <span>{pad(h)}:{pad(m)}:{pad(s)}</span>
    </div>
  );
}

export function ProductCard({ product, index = 0, onQuickView, flashSaleEndMs }: ProductCardProps) {
  const { wishlistedIds, toggle } = useWishlist();
  const { addItem } = useCart();
  const { isSignedIn } = useUser();
  const isWishlisted = wishlistedIds.has(product.id);

  const vendorLabel = product.vendorName ?? product.vendor ?? "";
  const reviewCount = product.reviewCount ?? product.reviews ?? 0;
  const image =
    (product.images && product.images.length > 0 ? product.images[0] : undefined) ??
    product.image ??
    "/images/product-1.png";

  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;

  function handleWishlistClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isSignedIn) {
      window.location.href = `${basePath}/sign-in`;
      return;
    }
    toggle(product.id);
  }

  function handleQuickView(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (onQuickView) {
      onQuickView(product as ProductSummary);
    }
  }

  return (
    <Link href={`/products/${product.id}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: Math.min(index * 0.05, 0.3) }}
        className="group relative bg-[#F5EDE0] dark:bg-[#2A2E35] rounded-lg overflow-hidden border border-[#C9A84C]/10 hover:border-[#C9A84C] transition-all duration-300 hover:shadow-[0_0_15px_rgba(201,168,76,0.3)] cursor-pointer"
        data-testid={`card-product-${product.id}`}
      >
        {/* Badges */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1">
          {product.stock === 0 && (
            <span className="bg-gray-700 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              Sold Out
            </span>
          )}
          {product.stock !== 0 && product.isBestSeller && (
            <span className="bg-[#C9A84C] text-[#7B1C2C] text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              Best Seller
            </span>
          )}
          {product.stock !== 0 && product.isNewArrival && (
            <span className="bg-[#7B1C2C] text-[#FAF6EE] text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              New Arrival
            </span>
          )}
          {product.stock !== 0 && discount > 0 && (
            <span className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded">
              {discount}% Off
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
            onError={(e) => { (e.target as HTMLImageElement).src = "/images/product-1.png"; }}
          />

          {/* Flash Sale Countdown Badge */}
          {flashSaleEndMs != null && discount > 0 && (
            <div className="absolute top-0 inset-x-0 z-20 bg-[#3D1A1A]/90 px-3 py-1.5 flex items-center justify-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#C9A84C]">⚡ Sale ends in</span>
              <CardCountdown endMs={flashSaleEndMs} />
            </div>
          )}

          {/* Hover Overlay */}
          <div className="absolute inset-x-0 bottom-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/80 to-transparent flex gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if ((product.stock ?? 1) === 0) return;
                addItem({
                  id: product.id,
                  productId: product.id,
                  name: product.name,
                  price: product.price,
                  originalPrice: product.originalPrice ?? null,
                  images: product.images ?? (product.image ? [product.image] : []),
                  vendorName: vendorLabel,
                  stock: product.stock ?? 10,
                  category: product.category ?? "",
                });
              }}
              disabled={(product.stock ?? 1) === 0}
              className={cn(
                "flex-1 font-semibold py-2 text-xs transition-colors rounded",
                (product.stock ?? 1) === 0
                  ? "bg-gray-500 text-white cursor-not-allowed opacity-80"
                  : "bg-[#C9A84C] hover:bg-[#b59539] text-[#7B1C2C]"
              )}
            >
              {(product.stock ?? 1) === 0 ? "Sold Out" : "Add to Cart"}
            </button>
            {onQuickView && (
              <button
                onClick={handleQuickView}
                title="Quick View"
                className="p-2 bg-white/20 hover:bg-white/40 text-white rounded transition-colors"
              >
                <Eye size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{vendorLabel}</p>
          <h3 className="font-serif text-base leading-tight mb-2 line-clamp-2 min-h-[2.6rem] text-[#7B1C2C] dark:text-[#FAF6EE]">
            {product.name}
          </h3>

          <div className="flex items-center gap-1 mb-2">
            <div className="flex text-[#C9A84C]">
              <Star size={13} className="fill-current" />
            </div>
            <span className="text-xs font-semibold">{product.rating}</span>
            <span className="text-xs text-gray-400">({reviewCount})</span>
          </div>

          <div className="flex items-end gap-2 flex-wrap">
            <span className="font-bold text-base text-[#7B1C2C] dark:text-[#C9A84C]">
              ₹{product.price.toLocaleString("en-IN")}
            </span>
            {product.originalPrice && (
              <>
                <span className="text-xs text-gray-400 line-through mb-0.5">
                  ₹{product.originalPrice.toLocaleString("en-IN")}
                </span>
                <span className="text-xs font-bold text-green-600 mb-0.5">{discount}% off</span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
