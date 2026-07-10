import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Minus, Plus, Trash2, Tag, X, Heart, Clock, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useCart } from "@/context/CartContext";
import type { StockAdjustment } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useUser } from "@clerk/react";
import { useListProducts } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");


const RECENTLY_VIEWED_KEY = "twirl_recently_viewed";

function getRecentlyViewed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function CartPage() {
  const { items, removeItem, updateQuantity, clearCart, refreshStock } = useCart();
  const { wishlistedIds, toggle: toggleWishlist } = useWishlist();
  const { isSignedIn } = useUser();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | { code: string; type: "percent" | "flat"; value: number; description: string; expiresAt: string | null }>(null);
  const [couponError, setCouponError] = useState("");
  const [couponLoading, setCouponLoading] = useState(false);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [stockNotice, setStockNotice] = useState<StockAdjustment[]>([]);
  const validatedRef = React.useRef(false);

  useEffect(() => {
    if (validatedRef.current) return;
    if (items.length === 0) return;
    validatedRef.current = true;
    refreshStock().then((adjustments) => {
      if (adjustments.length > 0) setStockNotice(adjustments);
    });
  }, [items, refreshStock]);

  useEffect(() => {
    const ids = getRecentlyViewed().slice(0, 8);
    const cartIds = new Set(items.map((i) => i.productId));
    setRecentIds(ids.filter((id) => !cartIds.has(id)));
  }, [items]);

  const { data: recentData } = useListProducts(
    { ids: recentIds.join(","), limit: 8 } as any,
    { query: { enabled: recentIds.length > 0 } }
  );

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  let discount = 0;
  if (appliedCoupon) {
    if (appliedCoupon.type === "percent") {
      discount = Math.round(subtotal * appliedCoupon.value / 100);
    } else {
      discount = Math.min(appliedCoupon.value, subtotal);
    }
  }

  const afterDiscount = subtotal - discount;
  const shipping = afterDiscount >= 5000 ? 0 : afterDiscount === 0 ? 0 : 199;
  const gst = Math.round(afterDiscount * 0.05);
  const total = afterDiscount + shipping + gst;
  const hasOutOfStock = items.some((i) => i.stock === 0);

  async function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    if (!code) return;
    setCouponLoading(true);
    setCouponError("");
    try {
      const res = await fetch(`${basePath}/api/coupons/validate?code=${encodeURIComponent(code)}`, {
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setCouponError((err as any).error || "Invalid coupon code");
        return;
      }
      const data = await res.json();
      setAppliedCoupon({ code: data.code, type: data.type, value: data.value, description: data.description, expiresAt: data.expiresAt ?? null });
      setCouponCode("");
    } catch {
      setCouponError("Could not validate coupon. Please try again.");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponError("");
  }

  const couponHoursLeft = appliedCoupon?.expiresAt
    ? (new Date(appliedCoupon.expiresAt).getTime() - Date.now()) / 3600000
    : null;
  const couponExpiringSoon = couponHoursLeft !== null && couponHoursLeft > 0 && couponHoursLeft <= 72;
  const couponDaysLeft = couponExpiringSoon ? Math.max(1, Math.ceil((couponHoursLeft as number) / 24)) : null;

  function moveToWishlist(productId: string) {
    if (!isSignedIn) {
      alert("Please sign in to save items to your wishlist.");
      return;
    }
    toggleWishlist(productId);
    removeItem(productId);
  }

  function getDeliveryDate() {
    const date = new Date();
    let businessDays = 0;
    while (businessDays < 7) {
      date.setDate(date.getDate() + 1);
      const day = date.getDay();
      if (day !== 0 && day !== 6) businessDays++;
    }
    return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  }

  if (items.length === 0) {
    return (
      <Layout>
        <div className="min-h-[70vh] flex flex-col items-center justify-center gap-6 px-4 py-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center"
          >
            <ShoppingBag size={72} className="text-[#C9A84C]/30 mx-auto mb-4" />
            <h1 className="font-serif text-3xl font-bold text-[#1E6B5A] dark:text-[#F3F8F5] mb-2">
              Your cart is empty
            </h1>
            <p className="text-gray-500 mb-8">Discover our exquisite saree collection</p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/paithani/shop">
                <button className="px-8 py-3 bg-[#1E6B5A] text-[#F3F8F5] font-semibold rounded-sm hover:bg-[#6a1826] transition-colors">
                  Shop Paithani
                </button>
              </Link>
              <Link href="/designer/shop">
                <button className="px-8 py-3 border-2 border-[#C9A84C] text-[#1E6B5A] dark:text-[#C9A84C] font-semibold rounded-sm hover:bg-[#C9A84C]/10 transition-colors">
                  Shop Designer
                </button>
              </Link>
            </div>
          </motion.div>

          {recentIds.length > 0 && recentData?.products && recentData.products.length > 0 && (
            <div className="w-full max-w-6xl px-4">
              <RecentlyViewedSection products={recentData.products} />
            </div>
          )}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
    <div className="min-h-screen bg-[#F3F8F5] dark:bg-[#111418] pt-6 pb-20">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-1">Shopping</p>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#1E6B5A] dark:text-[#F3F8F5]">
            Your Cart
          </h1>
          <p className="text-gray-500 text-sm mt-1">{items.length} item{items.length !== 1 ? "s" : ""}</p>
        </motion.div>

        {stockNotice.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 px-4 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="text-sm text-amber-800 dark:text-amber-300">
                  <p className="font-semibold mb-1">We updated your cart</p>
                  <ul className="space-y-0.5 list-disc list-inside">
                    {stockNotice.map((adj) => (
                      <li key={adj.productId}>
                        {adj.nowOutOfStock ? (
                          <>"{adj.name}" is now out of stock.</>
                        ) : (
                          <>Only {adj.currentStock} left of "{adj.name}" — quantity reduced from {adj.previousQuantity} to {adj.newQuantity}.</>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <button
                onClick={() => setStockNotice([])}
                className="text-amber-500 hover:text-amber-700 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item, idx) => (
              <motion.div
                key={item.productId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className={`bg-white dark:bg-[#1E2329] rounded-lg border p-4 flex flex-col gap-2 ${item.stock === 0 ? "border-red-400/60" : "border-[#C9A84C]/10"}`}
              >
                {item.stock === 0 && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs font-semibold bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                    <AlertTriangle size={13} className="shrink-0" />
                    This item is now out of stock and cannot be purchased. Please remove it.
                  </div>
                )}
                <div className="flex gap-4">
                <Link href={`/products/${item.productId}`} className="shrink-0">
                  <img
                    src={item.images[0] ?? "/images/product-1.png"}
                    alt={item.name}
                    className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-md border border-[#C9A84C]/10 hover:opacity-90 transition-opacity"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/products/${item.productId}`}>
                    <h3 className="font-serif text-base md:text-lg font-semibold text-[#1E6B5A] dark:text-[#F3F8F5] hover:text-[#C9A84C] transition-colors line-clamp-2">
                      {item.name}
                    </h3>
                  </Link>
                  <p className="text-xs text-gray-500 mt-0.5 capitalize">{item.category} · {item.vendorName}</p>

                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    <div className="flex items-center border border-[#C9A84C]/30 rounded">
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                        className="p-1.5 hover:bg-[#C9A84C]/10 transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="px-4 text-sm font-bold min-w-[2.5rem] text-center">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                        disabled={item.quantity >= item.stock}
                        className="p-1.5 hover:bg-[#C9A84C]/10 transition-colors disabled:opacity-40"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <p className="font-bold text-[#1E6B5A] dark:text-[#C9A84C]">
                      ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                    </p>
                    {item.quantity > 1 && (
                      <p className="text-xs text-gray-500">
                        ₹{item.price.toLocaleString("en-IN")} each
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-3">
                    <button
                      onClick={() => moveToWishlist(item.productId)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#1E6B5A] dark:hover:text-[#C9A84C] transition-colors"
                    >
                      <Heart size={13} /> Save for Later
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      onClick={() => removeItem(item.productId)}
                      className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
                </div>
              </motion.div>
            ))}

            <button
              onClick={clearCart}
              className="text-xs text-gray-400 hover:text-red-500 transition-colors underline"
            >
              Clear entire cart
            </button>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-[#1E2329] rounded-lg border border-[#C9A84C]/10 p-6 sticky top-24 space-y-5"
            >
              <h2 className="font-serif text-xl font-bold text-[#1E6B5A] dark:text-[#F3F8F5]">
                Order Summary
              </h2>

              {/* Coupon */}
              <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-semibold">
                      <Tag size={14} />
                      <span>{appliedCoupon.code}</span>
                      <span className="font-normal text-xs">({appliedCoupon.description})</span>
                    </div>
                    <button onClick={removeCoupon} className="text-green-600 hover:text-green-800">
                      <X size={14} />
                    </button>
                  </div>
                ) : null}
                {appliedCoupon && couponExpiringSoon && (
                  <div className="mt-2 flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-md px-3 py-2 text-amber-800 dark:text-amber-400 text-xs">
                    <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                    <span>
                      Your coupon "{appliedCoupon.code}" expires in {couponDaysLeft} day{couponDaysLeft !== 1 ? "s" : ""} — complete checkout soon to use it.
                    </span>
                  </div>
                )}
                {!appliedCoupon && (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                        placeholder="Coupon code"
                        className="flex-1 border border-[#C9A84C]/30 rounded-md px-3 py-2 text-sm bg-transparent text-[#1E6B5A] dark:text-[#F3F8F5] placeholder-gray-400 focus:outline-none focus:border-[#C9A84C]"
                      />
                      <button
                        onClick={applyCoupon}
                        disabled={couponLoading}
                        className="px-4 py-2 bg-[#C9A84C] text-[#1E6B5A] text-sm font-bold rounded-md hover:bg-[#b59539] transition-colors disabled:opacity-60"
                      >
                        {couponLoading ? "..." : "Apply"}
                      </button>
                    </div>
                    {couponError && <p className="text-xs text-red-500">{couponError}</p>}
                  </div>
                )}
              </div>

              {/* Price Breakdown */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Subtotal ({items.reduce((s, i) => s + i.quantity, 0)} items)</span>
                  <span>₹{subtotal.toLocaleString("en-IN")}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-green-600 dark:text-green-400">
                    <span>Coupon discount</span>
                    <span>−₹{discount.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>Shipping</span>
                  <span className={shipping === 0 ? "text-green-600 font-semibold" : ""}>
                    {shipping === 0 ? "FREE" : `₹${shipping}`}
                  </span>
                </div>
                <div className="flex justify-between text-gray-600 dark:text-gray-400">
                  <span>GST (5%)</span>
                  <span>₹{gst.toLocaleString("en-IN")}</span>
                </div>
                <div className="flex justify-between font-bold text-lg text-[#1E6B5A] dark:text-[#F3F8F5] pt-3 border-t border-[#C9A84C]/20">
                  <span>Total</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {afterDiscount > 0 && afterDiscount < 5000 && (
                <p className="text-xs text-center text-gray-500 bg-[#F3F8F5] dark:bg-[#2A2E35] rounded px-3 py-2">
                  Add ₹{(5000 - afterDiscount).toLocaleString("en-IN")} more for free shipping
                </p>
              )}

              <div className="text-xs text-center text-gray-500 bg-[#F3F8F5] dark:bg-[#2A2E35] rounded px-3 py-2">
                📦 Estimated delivery: <span className="font-semibold">{getDeliveryDate()}</span>
              </div>

              {hasOutOfStock && (
                <div className="flex items-center gap-1.5 text-red-500 text-xs font-semibold bg-red-50 dark:bg-red-900/20 rounded px-3 py-2">
                  <AlertTriangle size={13} className="shrink-0" />
                  Remove out-of-stock items to proceed to checkout.
                </div>
              )}
              {hasOutOfStock ? (
                <button
                  disabled
                  title="Remove out-of-stock items to proceed to checkout"
                  className="w-full bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 py-4 font-bold uppercase tracking-wider text-sm rounded-sm cursor-not-allowed"
                >
                  Proceed to Checkout
                </button>
              ) : (
                <Link href="/checkout">
                  <button className="w-full bg-[#1E6B5A] hover:bg-[#6a1826] text-[#F3F8F5] py-4 font-bold uppercase tracking-wider text-sm rounded-sm transition-colors">
                    Proceed to Checkout
                  </button>
                </Link>
              )}

              <button
                onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = `${basePath}/`; }}
                className="w-full py-2.5 border border-[#C9A84C]/40 text-[#1E6B5A] dark:text-[#C9A84C] hover:border-[#C9A84C] text-sm font-semibold rounded-sm transition-colors"
              >
                Continue Shopping
              </button>

              <div className="flex gap-4 text-center text-xs text-gray-400 pt-1">
                <div className="flex-1">🔒 Secure Payment</div>
                <div className="flex-1">🚚 Pan India Delivery</div>
                <div className="flex-1">↩️ Easy Returns</div>
              </div>
            </motion.div>
          </div>
        </div>

        {/* Recently Viewed */}
        {recentIds.length > 0 && recentData?.products && recentData.products.length > 0 && (
          <RecentlyViewedSection products={recentData.products} />
        )}
      </div>
    </div>
    </Layout>
  );
}

function RecentlyViewedSection({ products }: { products: any[] }) {
  return (
    <section className="mt-16">
      <div className="flex items-center gap-3 mb-6">
        <Clock size={18} className="text-[#C9A84C]" />
        <h2 className="font-serif text-2xl font-bold text-[#1E6B5A] dark:text-[#F3F8F5]">
          Recently Viewed
        </h2>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {products.slice(0, 8).map((product) => (
          <Link key={product.id} href={`/products/${product.id}`}>
            <div className="bg-white dark:bg-[#1E2329] rounded-lg border border-[#C9A84C]/10 overflow-hidden hover:border-[#C9A84C] hover:shadow-md transition-all cursor-pointer group">
              <div className="aspect-square overflow-hidden">
                <img
                  src={product.images?.[0] ?? "/images/product-1.png"}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
              </div>
              <div className="p-3">
                <p className="text-xs text-gray-500 mb-0.5">{product.vendorName}</p>
                <p className="text-sm font-serif font-semibold text-[#1E6B5A] dark:text-[#F3F8F5] line-clamp-2">
                  {product.name}
                </p>
                <p className="text-sm font-bold text-[#1E6B5A] dark:text-[#C9A84C] mt-1">
                  ₹{product.price?.toLocaleString("en-IN")}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
