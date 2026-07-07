import React, { useEffect, useState } from "react";
import { useParams, Link } from "wouter";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { CheckCircle2, Truck, Zap, MapPin, CreditCard, Smartphone, HandCoins, Package } from "lucide-react";
import { Layout } from "@/components/Layout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  images: string[];
  vendorName: string;
};

type OrderAddress = {
  name: string; phone: string; line1: string; line2?: string;
  city: string; state: string; pincode: string;
};

type Order = {
  id: string;
  userId: string;
  items: OrderItem[];
  address: OrderAddress;
  deliveryMethod: "standard" | "express";
  paymentMethod: "upi" | "card" | "cod";
  couponCode: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  status: string;
  createdAt: string;
};

function getDeliveryDate(method: "standard" | "express", from: string) {
  const date = new Date(from);
  const days = method === "express" ? 3 : 7;
  let count = 0;
  while (count < days) {
    date.setDate(date.getDate() + 1);
    const d = date.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const paymentLabels: Record<string, { label: string; Icon: React.ElementType }> = {
  upi: { label: "UPI", Icon: Smartphone },
  card: { label: "Credit / Debit Card", Icon: CreditCard },
  cod: { label: "Cash on Delivery", Icon: HandCoins },
};

export function OrderConfirmationPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const { isSignedIn, isLoaded } = useUser();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    if (!orderId) {
      setError("Order not found");
      setLoading(false);
      return;
    }
    fetch(`${BASE}/api/orders/${orderId}`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) throw new Error("Order not found");
        const data = await r.json();
        setOrder(data.order);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, orderId]);

  if (!isLoaded || loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-10 h-10 border-2 border-[#C9A84C] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm opacity-60">Loading your order…</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
          <Package size={48} className="text-gray-300" />
          <h2 className="font-serif text-2xl text-[#7B1C2C]">Order Not Found</h2>
          <p className="text-gray-500 text-sm">{error || "This order doesn't exist or belongs to another account."}</p>
          <Link href="/" className="bg-[#7B1C2C] text-[#FAF6EE] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm">
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  const { label: payLabel, Icon: PayIcon } = paymentLabels[order.paymentMethod] ?? { label: order.paymentMethod, Icon: CreditCard };
  const placedAt = new Date(order.createdAt);
  const deliveryEst = getDeliveryDate(order.deliveryMethod, order.createdAt);

  return (
    <Layout>
      <div className="min-h-screen bg-[#FAF6EE] dark:bg-[#1E2329]">
        <div className="container mx-auto px-4 py-8 max-w-3xl">

          {/* Success header */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-8"
          >
            <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={40} className="text-green-500" />
            </div>
            <h1 className="font-serif text-3xl font-bold text-[#7B1C2C] mb-2">Order Confirmed!</h1>
            <p className="text-gray-500 text-sm">
              Thank you for shopping with TwirlDrape. Your order has been placed successfully.
            </p>
          </motion.div>

          <div className="space-y-5">
            {/* Order meta */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5"
            >
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Order ID</p>
                  <p className="font-mono font-bold text-xs text-[#7B1C2C] break-all">{order.id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Placed On</p>
                  <p className="font-semibold text-sm">
                    {placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {placedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Status</p>
                  <span className="inline-flex items-center gap-1.5 bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full capitalize">
                    <CheckCircle2 size={11} /> {order.status}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Items */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5"
            >
              <h2 className="font-serif text-lg font-bold text-[#7B1C2C] mb-4">
                Items Ordered ({(order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0)})
              </h2>
              <div className="space-y-4">
                {(order.items as OrderItem[]).map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="flex gap-3 items-start">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-[#C9A84C]/10">
                      {item.images?.[0] && (
                        <img src={item.images[0]} alt={item.name} className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-snug">{item.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.vendorName}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity} × ₹{item.price.toLocaleString("en-IN")}</p>
                    </div>
                    <p className="font-bold text-sm shrink-0">₹{(item.price * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Pricing summary */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5"
            >
              <h2 className="font-serif text-lg font-bold text-[#7B1C2C] mb-4">Price Breakdown</h2>
              <div className="space-y-2.5 text-sm">
                <div className="flex justify-between"><span className="opacity-60">Subtotal</span><span>₹{order.subtotal.toLocaleString("en-IN")}</span></div>
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                    <span>− ₹{order.discount.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="opacity-60">Shipping</span>
                  <span>{order.shipping === 0 ? <span className="text-green-600 font-semibold">Free</span> : `₹${order.shipping}`}</span>
                </div>
                <div className="flex justify-between"><span className="opacity-60">GST (5%)</span><span>₹{order.tax.toLocaleString("en-IN")}</span></div>
                <div className="border-t border-[#C9A84C]/20 pt-2.5 flex justify-between font-bold text-[#7B1C2C] text-base">
                  <span>Total Paid</span>
                  <span>₹{order.total.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </motion.div>

            {/* Delivery & Payment */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-5"
            >
              <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={14} className="text-[#C9A84C]" />
                  <h3 className="font-semibold text-sm">Shipping Address</h3>
                </div>
                <p className="text-sm font-bold">{(order.address as OrderAddress).name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{(order.address as OrderAddress).phone}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {[(order.address as OrderAddress).line1, (order.address as OrderAddress).line2, (order.address as OrderAddress).city, (order.address as OrderAddress).state, (order.address as OrderAddress).pincode].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  {order.deliveryMethod === "express" ? <Zap size={14} className="text-[#C9A84C]" /> : <Truck size={14} className="text-[#C9A84C]" />}
                  <h3 className="font-semibold text-sm">Delivery Method</h3>
                </div>
                <p className="text-sm font-bold capitalize">{order.deliveryMethod === "express" ? "⚡ Express (3 days)" : "🚚 Standard (7 days)"}</p>
                <p className="text-xs text-gray-500 mt-1">Est. delivery by</p>
                <p className="text-xs font-semibold text-[#7B1C2C] mt-0.5">{deliveryEst}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-[#C9A84C]/10">
                  <PayIcon size={14} className="text-[#C9A84C]" />
                  <div>
                    <p className="text-xs text-gray-400">Payment</p>
                    <p className="text-xs font-semibold">{payLabel}</p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center pt-2 pb-8 flex flex-col items-center gap-3"
            >
              <Link
                href="/"
                className="inline-block bg-[#7B1C2C] hover:bg-[#6a1826] text-[#FAF6EE] px-10 py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm transition-colors"
              >
                Continue Shopping
              </Link>
              <Link
                href="/orders"
                className="text-sm text-[#7B1C2C] hover:underline font-medium"
              >
                View all orders
              </Link>
              <p className="mt-1 text-xs text-gray-400">
                Questions? <a href="mailto:support@twirldrape.com" className="text-[#7B1C2C] hover:underline">Contact support</a>
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
