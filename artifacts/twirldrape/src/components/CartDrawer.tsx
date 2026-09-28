import React, { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, Minus, Plus, Trash2, ArrowRight, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function CartDrawer() {
  const { items, isDrawerOpen, closeDrawer, removeItem, updateQuantity, totalItems, refreshStock } = useCart();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    if (isDrawerOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDrawerOpen, closeDrawer]);

  useEffect(() => {
    if (isDrawerOpen) {
      refreshStock();
    }
  }, [isDrawerOpen, refreshStock]);

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const shipping = subtotal >= 5000 ? 0 : 199;
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + shipping + gst;
  const hasOutOfStock = items.some((i) => i.stock === 0);

  return (
    <AnimatePresence>
      {isDrawerOpen && (
        <>
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
            onClick={closeDrawer}
          />
          <motion.div
            key="drawer"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[#F4F5F7] dark:bg-[#1E2329] shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#C7CCD1]/20">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-[#0A1F44]" />
                <h2 className="font-serif text-xl font-bold text-[#0A1F44] dark:text-[#F4F5F7]">
                  Your Cart
                </h2>
                {totalItems > 0 && (
                  <span className="bg-[#C7CCD1] text-[#0A1F44] text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalItems}
                  </span>
                )}
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 hover:bg-[#C7CCD1]/10 rounded-full transition-colors"
              >
                <X size={20} className="text-[#0A1F44] dark:text-[#F4F5F7]" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                  <ShoppingBag size={48} className="text-[#C7CCD1]/40" />
                  <p className="text-[#0A1F44]/60 dark:text-[#F4F5F7]/60 font-serif text-lg">
                    Your cart is empty
                  </p>
                  <p className="text-sm text-gray-500">
                    Discover our exquisite saree collection
                  </p>
                  <button
                    onClick={closeDrawer}
                    className="mt-2 px-6 py-2 bg-[#0A1F44] text-[#F4F5F7] text-sm font-semibold rounded-sm hover:bg-[#6a1826] transition-colors"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.productId}
                    className={`flex flex-col gap-2 bg-white dark:bg-[#2A2E35] rounded-lg p-3 border ${item.stock === 0 ? "border-red-400/60" : "border-[#C7CCD1]/10"}`}
                  >
                    {item.stock === 0 && (
                      <div className="flex items-center gap-1.5 text-red-500 text-xs font-semibold bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                        <AlertTriangle size={13} className="shrink-0" />
                        This item is now out of stock and cannot be purchased. Please remove it.
                      </div>
                    )}
                    <div className="flex gap-3">
                    <Link
                      href={`/products/${item.productId}`}
                      onClick={closeDrawer}
                      className="shrink-0"
                    >
                      <img
                        src={getProductImageSrc(item.images[0])}
                        alt={item.name}
                        className="w-20 h-20 object-cover rounded-md border border-[#C7CCD1]/10"
                        onError={replaceProductImageWithFallback}
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/products/${item.productId}`}
                        onClick={closeDrawer}
                      >
                        <p className="text-sm font-serif font-semibold text-[#0A1F44] dark:text-[#F4F5F7] line-clamp-2 leading-snug hover:text-[#C7CCD1] transition-colors">
                          {item.name}
                        </p>
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{item.vendorName}</p>
                      <p className="text-sm font-bold text-[#0A1F44] dark:text-[#C7CCD1] mt-1">
                        ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center border border-[#C7CCD1]/30 rounded">
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="p-1 hover:bg-[#C7CCD1]/10 transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="px-3 text-sm font-semibold min-w-[2rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.stock}
                            className="p-1 hover:bg-[#C7CCD1]/10 transition-colors disabled:opacity-40"
                          >
                            <Plus size={12} />
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.productId)}
                          className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-[#C7CCD1]/20 px-6 py-4 bg-white dark:bg-[#1E2329] space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-gray-600 dark:text-gray-400">
                    <span>Subtotal</span>
                    <span>₹{subtotal.toLocaleString("en-IN")}</span>
                  </div>
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
                  <div className="flex justify-between font-bold text-base text-[#0A1F44] dark:text-[#F4F5F7] pt-2 border-t border-[#C7CCD1]/20">
                    <span>Total</span>
                    <span>₹{total.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                {subtotal < 5000 && (
                  <p className="text-xs text-center text-gray-500">
                    Add ₹{(5000 - subtotal).toLocaleString("en-IN")} more for free shipping
                  </p>
                )}
                {hasOutOfStock && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs font-semibold bg-red-50 dark:bg-red-900/20 rounded px-2 py-1.5">
                    <AlertTriangle size={13} className="shrink-0" />
                    Remove out-of-stock items to proceed to checkout.
                  </div>
                )}
                {hasOutOfStock ? (
                  <button
                    disabled
                    title="Remove out-of-stock items to proceed to checkout"
                    className="w-full bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 py-3 font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 rounded-sm cursor-not-allowed"
                  >
                    View Cart & Checkout <ArrowRight size={16} />
                  </button>
                ) : (
                  <Link href="/cart" onClick={closeDrawer}>
                    <button className="w-full bg-[#0A1F44] hover:bg-[#6a1826] text-[#F4F5F7] py-3 font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 rounded-sm transition-colors">
                      View Cart & Checkout <ArrowRight size={16} />
                    </button>
                  </Link>
                )}
                <button
                  onClick={closeDrawer}
                  className="w-full py-2 text-sm text-[#0A1F44] dark:text-[#C7CCD1] hover:underline transition-colors"
                >
                  Continue Shopping
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
