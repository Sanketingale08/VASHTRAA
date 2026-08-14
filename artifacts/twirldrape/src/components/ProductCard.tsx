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
  vendorId?: string | null;
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
  active?: boolean;
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
        className="group relative bg-white rounded-xl overflow-hidden border border-[#C9A84C]/20 shadow-sm hover:border-[#C9A84C]/55 hover:shadow-lg transition-all duration-300 cursor-pointer"
        style={{ boxShadow: "0 1px 4px rgba(201,168,76,0.07), 0 0 0 1px rgba(201,168,76,0.12)" }}
        data-testid={`card-product-${product.id}`}
      >
        {/* Badges */}
        <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5">
          {(product.active === false) && (
            <span className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ background: "linear-gradient(90deg, #b45309 0%, #d97706 100%)" }}>
              Out of Stock
            </span>
          )}
          {product.active !== false && product.stock === 0 && (
            <span className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ background: "linear-gradient(90deg, #6b7280 0%, #9ca3af 100%)" }}>
              Sold Out
            </span>
          )}
          {product.active !== false && product.stock !== 0 && product.isBestSeller && (
            <span className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ background: "linear-gradient(90deg, #2F9FC6 0%, #45B9AF 50%, #32C092 100%)" }}>
              Best Seller
            </span>
          )}
          {product.active !== false && product.stock !== 0 && product.isNewArrival && (
            <span className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ background: "linear-gradient(90deg, #6C63D5 0%, #9B7FE8 100%)" }}>
              New Arrival
            </span>
          )}
          {product.active !== false && product.stock !== 0 && discount > 0 && (
            <span className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ background: "linear-gradient(90deg, #4A7FC1 0%, #6B9FE4 100%)" }}>
              {discount}% Off
            </span>
          )}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={handleWishlistClick}
          title={isSignedIn ? (isWishlisted ? "Remove from wishlist" : "Add to wishlist") : "Sign in to save"}
          className="absolute top-2 right-2 z-10 p-1.5 bg-white/90 backdrop-blur-sm border border-[#C9A84C]/20 rounded-full hover:bg-white hover:border-[#C9A84C]/50 transition-all shadow-sm"
        >
          <Heart
            size={16}
            className={cn(
              "transition-colors",
              isWishlisted
                ? "fill-[#1E6B5A] text-[#1E6B5A]"
                : "text-gray-400",
            )}
          />
        </button>

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-[#FAF7F2]">
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
          <div className="absolute inset-x-0 bottom-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 bg-gradient-to-t from-black/75 via-black/30 to-transparent flex gap-2">
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
              disabled={(product.stock ?? 1) === 0 || product.active === false}
              className={cn(
                "flex-1 font-bold py-2 text-xs tracking-wider uppercase rounded-md transition-colors",
                (product.stock ?? 1) === 0 || product.active === false
                  ? "bg-gray-400 text-white cursor-not-allowed opacity-80"
                  : "bg-[#8BB8F5] hover:bg-[#6da3f0] text-[#1a2d50]"
              )}
            >
              {product.active === false ? "Out of Stock" : (product.stock ?? 1) === 0 ? "Sold Out" : "Add to Cart"}
            </button>
            {onQuickView && (
              <button
                onClick={handleQuickView}
                title="Quick View"
                className="p-2 bg-white/20 hover:bg-white/40 text-white rounded-md transition-colors"
              >
                <Eye size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-4 bg-white">
          {product.vendorId && vendorLabel ? (
            <Link
              href={`/weavers/${product.vendorId}`}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              className="inline-block text-[11px] text-[#1E6B5A]/70 hover:text-[#1E6B5A] mb-1 font-medium tracking-wide uppercase transition-colors"
            >
              by {vendorLabel}
            </Link>
          ) : (
            <p className="text-[11px] text-gray-400 mb-1 font-medium tracking-wide uppercase">{vendorLabel}</p>
          )}
          <h3 className="font-serif text-base leading-snug mb-2 line-clamp-2 min-h-[2.5rem] text-[#2D1B1B]">
            {product.name}
          </h3>

          <div className="flex items-center gap-1 mb-3">
            <Star size={12} className="fill-[#C9A84C] text-[#C9A84C]" />
            <span className="text-xs font-semibold text-[#2D1B1B]">{product.rating}</span>
            <span className="text-xs text-gray-300">({reviewCount})</span>
          </div>

          <div className="flex items-end gap-2 flex-wrap border-t border-[#C9A84C]/10 pt-3">
            <span className="font-bold text-[15px] text-[#1E6B5A]">
              ₹{product.price.toLocaleString("en-IN")}
            </span>
            {product.originalPrice && (
              <>
                <span className="text-xs text-gray-300 line-through mb-0.5">
                  ₹{product.originalPrice.toLocaleString("en-IN")}
                </span>
                <span className="text-[11px] font-bold text-emerald-600 mb-0.5">{discount}% off</span>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
