import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, ShoppingBag, Minus, Plus, Trash2, ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { useCart } from "@/context/CartContext";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function CartDrawer() {
  const { items, isDrawerOpen, closeDrawer, removeItem, updateQuantity, totalItems } = useCart();

  const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const shipping = subtotal >= 5000 ? 0 : 199;
  const gst = Math.round(subtotal * 0.05);
  const total = subtotal + shipping + gst;

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
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[#FAF6EE] dark:bg-[#1E2329] shadow-2xl z-50 flex flex-col"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#C9A84C]/20">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-[#7B1C2C]" />
                <h2 className="font-serif text-xl font-bold text-[#7B1C2C] dark:text-[#FAF6EE]">
                  Your Cart
                </h2>
                {totalItems > 0 && (
                  <span className="bg-[#C9A84C] text-[#7B1C2C] text-xs font-bold px-2 py-0.5 rounded-full">
                    {totalItems}
                  </span>
                )}
              </div>
              <button
                onClick={closeDrawer}
                className="p-2 hover:bg-[#C9A84C]/10 rounded-full transition-colors"
              >
                <X size={20} className="text-[#7B1C2C] dark:text-[#FAF6EE]" />
              </button>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {items.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
                  <ShoppingBag size={48} className="text-[#C9A84C]/40" />
                  <p className="text-[#7B1C2C]/60 dark:text-[#FAF6EE]/60 font-serif text-lg">
                    Your cart is empty
                  </p>
                  <p className="text-sm text-gray-500">
                    Discover our exquisite saree collection
                  </p>
                  <button
                    onClick={closeDrawer}
                    className="mt-2 px-6 py-2 bg-[#7B1C2C] text-[#FAF6EE] text-sm font-semibold rounded-sm hover:bg-[#6a1826] transition-colors"
                  >
                    Continue Shopping
                  </button>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex gap-3 bg-white dark:bg-[#2A2E35] rounded-lg p-3 border border-[#C9A84C]/10"
                  >
                    <Link
                      href={`/products/${item.productId}`}
                      onClick={closeDrawer}
                      className="shrink-0"
                    >
                      <img
                        src={item.images[0] ?? "/images/product-1.png"}
                        alt={item.name}
                        className="w-20 h-20 object-cover rounded-md border border-[#C9A84C]/10"
                      />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/products/${item.productId}`}
                        onClick={closeDrawer}
                      >
                        <p className="text-sm font-serif font-semibold text-[#7B1C2C] dark:text-[#FAF6EE] line-clamp-2 leading-snug hover:text-[#C9A84C] transition-colors">
                          {item.name}
                        </p>
                      </Link>
                      <p className="text-xs text-gray-500 mt-0.5">{item.vendorName}</p>
                      <p className="text-sm font-bold text-[#7B1C2C] dark:text-[#C9A84C] mt-1">
                        ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                      </p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center border border-[#C9A84C]/30 rounded">
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity - 1)}
                            className="p-1 hover:bg-[#C9A84C]/10 transition-colors"
                          >
                            <Minus size={12} />
                          </button>
                          <span className="px-3 text-sm font-semibold min-w-[2rem] text-center">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.productId, item.quantity + 1)}
                            disabled={item.quantity >= item.stock}
                            className="p-1 hover:bg-[#C9A84C]/10 transition-colors disabled:opacity-40"
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
                ))
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="border-t border-[#C9A84C]/20 px-6 py-4 bg-white dark:bg-[#1E2329] space-y-3">
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
                  <div className="flex justify-between font-bold text-base text-[#7B1C2C] dark:text-[#FAF6EE] pt-2 border-t border-[#C9A84C]/20">
                    <span>Total</span>
                    <span>₹{total.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                {subtotal < 5000 && (
                  <p className="text-xs text-center text-gray-500">
                    Add ₹{(5000 - subtotal).toLocaleString("en-IN")} more for free shipping
                  </p>
                )}
                <Link href="/cart" onClick={closeDrawer}>
                  <button className="w-full bg-[#7B1C2C] hover:bg-[#6a1826] text-[#FAF6EE] py-3 font-bold uppercase tracking-wider text-sm flex items-center justify-center gap-2 rounded-sm transition-colors">
                    View Cart & Checkout <ArrowRight size={16} />
                  </button>
                </Link>
                <button
                  onClick={closeDrawer}
                  className="w-full py-2 text-sm text-[#7B1C2C] dark:text-[#C9A84C] hover:underline transition-colors"
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
