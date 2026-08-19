import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, ShoppingBag, Star, ChevronLeft, ChevronRight, ExternalLink, Minus, Plus } from "lucide-react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useUser } from "@clerk/react";
import type { ProductSummary } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface QuickViewModalProps {
  product: ProductSummary | null;
  onClose: () => void;
}

export function QuickViewModal({ product, onClose }: QuickViewModalProps) {
  const { wishlistedIds, toggle } = useWishlist();
  const { addItem } = useCart();
  const { isSignedIn } = useUser();
  const [imgIdx, setImgIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    if (product) { setImgIdx(0); setQty(1); setAdded(false); }
  }, [product]);

  useEffect(() => {
    if (!product) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", handler); document.body.style.overflow = ""; };
  }, [product, onClose]);

  if (!product) return null;

  const images = product.images?.length ? product.images : ["/images/product-1.png"];
  const isWishlisted = wishlistedIds.has(product.id);
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : 0;
  const isOutOfStock = (product.stock ?? 1) <= 0;
  const maxQty = isOutOfStock ? 0 : Math.min(product.stock ?? 10, 10);

  function handleAddToCart() {
    if (isOutOfStock) return;
    addItem({
      id: product!.id,
      productId: product!.id,
      name: product!.name,
      price: product!.price,
      originalPrice: product!.originalPrice ?? null,
      images: images,
      vendorName: product!.vendorName,
      stock: product!.stock ?? 10,
      category: product!.category,
    }, qty);
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }

  function handleWishlist(e: React.MouseEvent) {
    e.preventDefault();
    if (!isSignedIn) { window.location.href = `${basePath}/sign-in`; return; }
    toggle(product!.id);
  }

  return (
    <AnimatePresence>
      <motion.div
        key="qv-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className="fixed inset-0 z-[900] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          key="qv-modal"
          initial={{ opacity: 0, y: 32, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 32, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          className="bg-white dark:bg-[#1E2329] rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-col md:flex-row">
            {/* Image Column */}
            <div className="md:w-[42%] relative bg-[#E6F0EA] dark:bg-[#2A2E35] rounded-t-2xl md:rounded-l-2xl md:rounded-tr-none overflow-hidden min-h-[280px] md:min-h-[420px]">
              <img
                src={images[imgIdx]}
                alt={product.name}
                className="w-full h-full object-cover"
                style={{ maxHeight: "420px" }}
              />
              {images.length > 1 && (
                <>
                  <button
                    onClick={() => setImgIdx((i) => (i - 1 + images.length) % images.length)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 hover:bg-white rounded-full shadow transition-all"
                  >
                    <ChevronLeft size={16} className="text-[#1E6B5A]" />
                  </button>
                  <button
                    onClick={() => setImgIdx((i) => (i + 1) % images.length)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white/80 hover:bg-white rounded-full shadow transition-all"
                  >
                    <ChevronRight size={16} className="text-[#1E6B5A]" />
                  </button>
                  <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {images.map((_, i) => (
                      <button
                        key={i}
                        onClick={() => setImgIdx(i)}
                        className={cn("w-1.5 h-1.5 rounded-full transition-all", i === imgIdx ? "bg-[#C9A84C] scale-125" : "bg-white/60")}
                      />
                    ))}
                  </div>
                </>
              )}
              <div className="absolute top-3 left-3 flex flex-col gap-1">
                {product.isBestSeller && (
                  <span
                    className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                    style={{ background: "linear-gradient(90deg, #2F9FC6 0%, #45B9AF 50%, #32C092 100%)" }}
                  >
                    Best Seller
                  </span>
                )}
                {product.isNewArrival && (
                  <span
                    className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                    style={{ background: "linear-gradient(90deg, #6C63D5 0%, #9B7FE8 100%)" }}
                  >
                    New Arrival
                  </span>
                )}
                {discount > 0 && (
                  <span
                    className="text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-full"
                    style={{ background: "linear-gradient(90deg, #4A7FC1 0%, #6B9FE4 100%)" }}
                  >
                    {discount}% Off
                  </span>
                )}
              </div>
            </div>

            {/* Details Column */}
            <div className="flex-1 p-6 flex flex-col gap-4 overflow-auto">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{product.vendorName}</p>
                  <h2 className="font-serif text-xl md:text-2xl font-bold text-[#1E6B5A] dark:text-[#F3F8F5] leading-tight">
                    {product.name}
                  </h2>
                </div>
                <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-[#2A2E35] transition-colors shrink-0">
                  <X size={20} className="text-gray-400" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-0.5">
                  {[1,2,3,4,5].map((s) => (
                    <Star key={s} size={14} className={cn("transition-colors", s <= Math.round(product.rating) ? "fill-[#C9A84C] text-[#C9A84C]" : "text-gray-200")} />
                  ))}
                </div>
                <span className="text-sm font-semibold text-[#1E6B5A]">{product.rating}</span>
                <span className="text-xs text-gray-400">({product.reviewCount} reviews)</span>
              </div>

              <div className="flex items-end gap-3">
                <span className="font-bold text-2xl text-[#1E6B5A] dark:text-[#C9A84C]">
                  ₹{product.price.toLocaleString("en-IN")}
                </span>
                {product.originalPrice && (
                  <>
                    <span className="text-base text-gray-400 line-through mb-0.5">₹{product.originalPrice.toLocaleString("en-IN")}</span>
                    <span className="text-sm font-bold text-green-600 mb-0.5">Save ₹{(product.originalPrice - product.price).toLocaleString("en-IN")}</span>
                  </>
                )}
              </div>

              {product.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3">
                  {product.description}
                </p>
              )}

              {isOutOfStock ? (
                <div
                  data-testid="out-of-stock-banner"
                  className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg"
                >
                  <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Out of Stock
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-[#1E6B5A] dark:text-[#F3F8F5]">Qty:</span>
                  <div className="flex items-center border border-[#C9A84C]/30 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#2A2E35] transition-colors"
                      disabled={qty <= 1}
                    >
                      <Minus size={14} className="text-[#1E6B5A]" />
                    </button>
                    <span className="px-4 py-2 font-semibold text-sm border-x border-[#C9A84C]/30 min-w-[40px] text-center">
                      {qty}
                    </span>
                    <button
                      onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                      className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-[#2A2E35] transition-colors"
                      disabled={qty >= maxQty}
                    >
                      <Plus size={14} className="text-[#1E6B5A]" />
                    </button>
                  </div>
                  {product.stock != null && product.stock <= 5 && product.stock > 0 && (
                    <span className="text-xs text-orange-500 font-medium">Only {product.stock} left</span>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-auto">
                <button
                  onClick={handleAddToCart}
                  disabled={isOutOfStock}
                  data-testid="quick-view-add-to-cart"
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-3 font-bold text-sm uppercase tracking-wider rounded-sm transition-all",
                    isOutOfStock
                      ? "bg-gray-400 text-white cursor-not-allowed opacity-80"
                      : added
                      ? "bg-green-600 text-white"
                      : "bg-[#8BB8F5] hover:bg-[#6da3f0] text-[#1a2d50]"
                  )}
                >
                  <ShoppingBag size={16} />
                  {isOutOfStock ? "Out of Stock" : added ? "Added!" : "Add to Cart"}
                </button>
                <button
                  onClick={handleWishlist}
                  title={isWishlisted ? "Remove from wishlist" : "Save to wishlist"}
                  className="p-3 border-2 border-[#C9A84C]/30 hover:border-[#1E6B5A] rounded-sm transition-all"
                >
                  <Heart
                    size={18}
                    className={cn("transition-colors", isWishlisted ? "fill-[#1E6B5A] text-[#1E6B5A]" : "text-gray-400")}
                  />
                </button>
              </div>

              <Link
                href={`/products/${product.id}`}
                onClick={onClose}
                className="flex items-center justify-center gap-2 text-sm font-semibold text-[#1E6B5A] hover:underline"
              >
                View Full Details <ExternalLink size={13} />
              </Link>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
