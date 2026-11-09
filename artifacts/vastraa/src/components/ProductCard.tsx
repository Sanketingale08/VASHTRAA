import React, { useState, useEffect } from "react";
import { Heart, Star, Eye, ShoppingBag } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useUser } from "@clerk/react";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
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
  const [, setLocation] = useLocation();
  const { wishlistedIds, toggle } = useWishlist();
  const { addItem } = useCart();
  const { isSignedIn } = useUser();
  const isWishlisted = wishlistedIds.has(product.id);

  const vendorLabel = product.vendorName ?? product.vendor ?? "";
  const reviewCount = product.reviewCount ?? product.reviews ?? 0;
  const image = getProductImageSrc(
    (product.images && product.images.length > 0 ? product.images[0] : undefined) ??
    product.image,
    (product as any).imageUpdatedAt || (product as any).updatedAt || (product as any).imageVersion
  );

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
        className="group relative bg-white rounded-2xl overflow-hidden border border-[#C7CCD1]/30 hover:border-[#0A1F44]/40 shadow-xs hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col h-full"
        data-testid={`card-product-${product.id}`}
      >
        {/* Top Badges Overlay */}
        <div className="absolute top-2.5 left-2.5 z-10 flex flex-col gap-1.5 pointer-events-none">
          {product.active === false && (
            <span className="text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm bg-gradient-to-r from-amber-700 to-amber-600 border border-amber-500/30">
              Out of Stock
            </span>
          )}
          {product.active !== false && product.stock === 0 && (
            <span className="text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm bg-gradient-to-r from-gray-700 to-gray-600 border border-gray-500/30">
              Sold Out
            </span>
          )}
          {product.active !== false && product.stock !== 0 && product.isBestSeller && (
            <span className="text-[#F4F5F7] text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-md bg-[#0A1F44] border border-[#C7CCD1]/50 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#C7CCD1] animate-pulse" />
              Best Seller
            </span>
          )}
          {product.active !== false && product.stock !== 0 && product.isNewArrival && (
            <span className="text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm bg-[#2C3E6B] border border-[#C7CCD1]/30">
              New Arrival
            </span>
          )}
          {product.active !== false && product.stock !== 0 && discount > 0 && (
            <span className="text-white text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm bg-rose-800 border border-rose-600/30">
              {discount}% Off
            </span>
          )}
        </div>

        {/* Wishlist Floating Button */}
        <button
          onClick={handleWishlistClick}
          title={isSignedIn ? (isWishlisted ? "Remove from wishlist" : "Add to wishlist") : "Sign in to save"}
          className="absolute top-2.5 right-2.5 z-10 p-2 bg-white/90 backdrop-blur-md border border-[#C7CCD1]/40 rounded-full hover:bg-white hover:border-[#0A1F44] hover:scale-110 transition-all shadow-xs"
        >
          <Heart
            size={16}
            className={cn(
              "transition-colors",
              isWishlisted
                ? "fill-[#0A1F44] text-[#0A1F44]"
                : "text-gray-400 group-hover/btn:text-[#0A1F44]"
            )}
          />
        </button>

        {/* Product Image Canvas */}
        <div className="relative aspect-[3/4] overflow-hidden bg-[#F8F7F4] flex items-center justify-center">
          <img
            src={image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            width="300"
            height="400"
            className="object-cover w-full h-full group-hover:scale-105 transition-transform duration-500 ease-out"
            onError={replaceProductImageWithFallback}
          />

          {/* Flash Sale Countdown Banner */}
          {flashSaleEndMs != null && discount > 0 && (
            <div className="absolute top-0 inset-x-0 z-20 bg-[#0A1F44]/95 backdrop-blur-sm px-3 py-1.5 flex items-center justify-center gap-2 border-b border-[#C7CCD1]/30">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#C7CCD1]">⚡ Sale ends in</span>
              <CardCountdown endMs={flashSaleEndMs} />
            </div>
          )}

          {/* Quick Action Overlay Bar */}
          <div className="absolute inset-x-0 bottom-0 p-3 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out bg-gradient-to-t from-[#0A1F44]/95 via-[#0A1F44]/60 to-transparent flex gap-2 z-20">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                if ((product.stock ?? 1) === 0 || product.active === false) return;
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
                "flex-1 font-bold py-2.5 px-3 text-xs tracking-wider uppercase rounded-md transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer",
                (product.stock ?? 1) === 0 || product.active === false
                  ? "bg-gray-500 text-white cursor-not-allowed opacity-80"
                  : "bg-white text-[#0A1F44] hover:bg-[#F4F5F7] hover:text-[#0A1F44] font-bold"
              )}
            >
              {product.active === false ? "Out of Stock" : (product.stock ?? 1) === 0 ? "Sold Out" : "Add to Cart"}
            </button>
            {onQuickView && (
              <button
                onClick={handleQuickView}
                title="Quick View"
                className="p-2.5 bg-white/20 hover:bg-white/40 text-white rounded-md transition-all backdrop-blur-sm cursor-pointer"
              >
                <Eye size={16} />
              </button>
            )}
          </div>
        </div>

        {/* Product Details Content */}
        <div className="p-4 bg-white flex flex-col flex-1 justify-between">
          <div>
            {product.vendorId && vendorLabel ? (
              <span
                role="link"
                tabIndex={0}
                onClick={(e: React.MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLocation(`/stores/${product.vendorId}`);
                }}
                className="inline-block text-[10px] text-[#2C3E6B] font-bold tracking-[0.15em] uppercase hover:text-[#0A1F44] mb-1 transition-colors cursor-pointer line-clamp-1 min-h-[1.125rem]"
              >
                by {vendorLabel}
              </span>
            ) : (
              <p className="text-[10px] text-gray-400 mb-1 font-bold tracking-[0.15em] uppercase line-clamp-1 min-h-[1.125rem]">{vendorLabel || "VASTRAA"}</p>
            )}
            
            <h3 className="font-serif text-sm sm:text-base font-bold leading-snug mb-2 line-clamp-2 min-h-[2.5rem] text-[#0A1F44] group-hover:text-[#2C3E6B] transition-colors">
              {product.name}
            </h3>
          </div>

          <div>
            {/* Rating */}
            <div className="flex items-center gap-1.5 mb-2.5">
              <div className="flex items-center">
                <Star size={12} className="fill-[#0A1F44] text-[#0A1F44]" />
              </div>
              <span className="text-xs font-bold text-[#0A1F44]">{product.rating.toFixed(1)}</span>
              <span className="text-[11px] text-gray-400">({reviewCount})</span>
            </div>

            {/* Price & Discount */}
            <div className="flex items-baseline justify-between pt-2.5 border-t border-[#C7CCD1]/20">
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="font-serif font-bold text-base sm:text-lg text-[#0A1F44]">
                  ₹{product.price.toLocaleString("en-IN")}
                </span>
                {product.originalPrice && (
                  <span className="text-xs text-gray-400 line-through font-normal">
                    ₹{product.originalPrice.toLocaleString("en-IN")}
                  </span>
                )}
              </div>
              {discount > 0 && (
                <span className="text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  {discount}% off
                </span>
              )}
            </div>

            {/* Mobile Quick Add to Bag Action (Visible on mobile/tablet where hover doesn't exist) */}
            <div className="mt-2.5 lg:hidden">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if ((product.stock ?? 1) === 0 || product.active === false) return;
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
                  "w-full py-2 px-2 text-[10px] xs:text-[11px] font-bold tracking-wider uppercase rounded-lg transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer min-h-[38px]",
                  (product.stock ?? 1) === 0 || product.active === false
                    ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                    : "bg-[#0A1F44] text-[#F4F5F7] active:bg-[#2C3E6B]"
                )}
              >
                <ShoppingBag size={13} className="shrink-0" />
                <span>{product.active === false ? "Out of Stock" : (product.stock ?? 1) === 0 ? "Sold Out" : "Add to Bag"}</span>
              </button>
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}
