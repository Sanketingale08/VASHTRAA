import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ShoppingBag, Minus, Plus, Trash2, Tag, X, Heart, Clock } from "lucide-react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useCart } from "@/context/CartContext";
import { useWishlist } from "@/context/WishlistContext";
import { useListProducts } from "@workspace/api-client-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const COUPONS: Record<string, { type: "percent" | "flat"; value: number; label: string }> = {
  SAVE10: { type: "percent", value: 10, label: "10% off" },
  WELCOME50: { type: "flat", value: 50, label: "₹50 off" },
};

const RECENTLY_VIEWED_KEY = "twirl_recently_viewed";

function getRecentlyViewed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function CartPage() {
  const { items, removeItem, updateQuantity, clearCart } = useCart();
  const { wishlistedIds, toggle: toggleWishlist } = useWishlist();
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<null | { code: string; type: "percent" | "flat"; value: number; label: string }>(null);
  const [couponError, setCouponError] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

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

  function applyCoupon() {
    const code = couponCode.trim().toUpperCase();
    const c = COUPONS[code];
    if (!c) {
      setCouponError("Invalid coupon code");
      return;
    }
    setAppliedCoupon({ code, ...c });
    setCouponError("");
    setCouponCode("");
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponError("");
  }

  function moveToWishlist(productId: string) {
    toggleWishlist(productId);
    removeItem(productId);
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
            <h1 className="font-serif text-3xl font-bold text-[#7B1C2C] dark:text-[#FAF6EE] mb-2">
              Your cart is empty
            </h1>
            <p className="text-gray-500 mb-8">Discover our exquisite saree collection</p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/paithani/shop">
                <button className="px-8 py-3 bg-[#7B1C2C] text-[#FAF6EE] font-semibold rounded-sm hover:bg-[#6a1826] transition-colors">
                  Shop Paithani
                </button>
              </Link>
              <Link href="/designer/shop">
                <button className="px-8 py-3 border-2 border-[#C9A84C] text-[#7B1C2C] dark:text-[#C9A84C] font-semibold rounded-sm hover:bg-[#C9A84C]/10 transition-colors">
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
    <div className="min-h-screen bg-[#FAF6EE] dark:bg-[#111418] pt-6 pb-20">
      <div className="container mx-auto px-4 lg:px-8 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-1">Shopping</p>
          <h1 className="font-serif text-3xl md:text-4xl font-bold text-[#7B1C2C] dark:text-[#FAF6EE]">
            Your Cart
          </h1>
          <p className="text-gray-500 text-sm mt-1">{items.length} item{items.length !== 1 ? "s" : ""}</p>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Cart Items */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item, idx) => (
              <motion.div
                key={item.productId}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-white dark:bg-[#1E2329] rounded-lg border border-[#C9A84C]/10 p-4 flex gap-4"
              >
                <Link href={`/products/${item.productId}`} className="shrink-0">
                  <img
                    src={item.images[0] ?? "/images/product-1.png"}
                    alt={item.name}
                    className="w-24 h-24 md:w-32 md:h-32 object-cover rounded-md border border-[#C9A84C]/10 hover:opacity-90 transition-opacity"
                  />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/products/${item.productId}`}>
                    <h3 className="font-serif text-base md:text-lg font-semibold text-[#7B1C2C] dark:text-[#FAF6EE] hover:text-[#C9A84C] transition-colors line-clamp-2">
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
                    <p className="font-bold text-[#7B1C2C] dark:text-[#C9A84C]">
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
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#7B1C2C] dark:hover:text-[#C9A84C] transition-colors"
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
              <h2 className="font-serif text-xl font-bold text-[#7B1C2C] dark:text-[#FAF6EE]">
                Order Summary
              </h2>

              {/* Coupon */}
              <div>
                {appliedCoupon ? (
                  <div className="flex items-center justify-between bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-md px-3 py-2">
                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm font-semibold">
                      <Tag size={14} />
                      <span>{appliedCoupon.code}</span>
                      <span className="font-normal text-xs">({appliedCoupon.label})</span>
                    </div>
                    <button onClick={removeCoupon} className="text-green-600 hover:text-green-800">
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={couponCode}
                        onChange={(e) => { setCouponCode(e.target.value.toUpperCase()); setCouponError(""); }}
                        onKeyDown={(e) => e.key === "Enter" && applyCoupon()}
                        placeholder="Coupon code"
                        className="flex-1 border border-[#C9A84C]/30 rounded-md px-3 py-2 text-sm bg-transparent text-[#7B1C2C] dark:text-[#FAF6EE] placeholder-gray-400 focus:outline-none focus:border-[#C9A84C]"
                      />
                      <button
                        onClick={applyCoupon}
                        className="px-4 py-2 bg-[#C9A84C] text-[#7B1C2C] text-sm font-bold rounded-md hover:bg-[#b59539] transition-colors"
                      >
                        Apply
                      </button>
                    </div>
                    {couponError && <p className="text-xs text-red-500">{couponError}</p>}
                    <p className="text-[10px] text-gray-400">Try: SAVE10 or WELCOME50</p>
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
                <div className="flex justify-between font-bold text-lg text-[#7B1C2C] dark:text-[#FAF6EE] pt-3 border-t border-[#C9A84C]/20">
                  <span>Total</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>
              </div>

              {afterDiscount > 0 && afterDiscount < 5000 && (
                <p className="text-xs text-center text-gray-500 bg-[#FAF6EE] dark:bg-[#2A2E35] rounded px-3 py-2">
                  Add ₹{(5000 - afterDiscount).toLocaleString("en-IN")} more for free shipping
                </p>
              )}

              <Link href="/checkout">
                <button className="w-full bg-[#7B1C2C] hover:bg-[#6a1826] text-[#FAF6EE] py-4 font-bold uppercase tracking-wider text-sm rounded-sm transition-colors">
                  Proceed to Checkout
                </button>
              </Link>

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
        <h2 className="font-serif text-2xl font-bold text-[#7B1C2C] dark:text-[#FAF6EE]">
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
                <p className="text-sm font-serif font-semibold text-[#7B1C2C] dark:text-[#FAF6EE] line-clamp-2">
                  {product.name}
                </p>
                <p className="text-sm font-bold text-[#7B1C2C] dark:text-[#C9A84C] mt-1">
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
