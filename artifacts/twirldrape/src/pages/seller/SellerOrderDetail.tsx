import React, { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Truck, Check, X, AlertCircle } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { OrderTrackingTimeline } from "@/components/OrderTrackingTimeline";
import { getApiUrl } from "@/lib/api";

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const IVORY = "#FAF6EE";
const CREAM = "#F5EDE0";

function statusColors(status: string) {
  switch (status) {
    case "confirmed": return { bg: "#EFF6FF", text: "#1D4ED8" };
    case "processing": return { bg: "#FFF7ED", text: "#C2410C" };
    case "dispatched": return { bg: "#F3E8FF", text: "#7E22CE" };
    case "out_for_delivery": return { bg: "#FFFBEB", text: "#B45309" };
    case "delivered": return { bg: "#DCFCE7", text: "#166534" };
    case "cancelled": return { bg: "#FEE2E2", text: "#991B1B" };
    default: return { bg: "#F3F4F6", text: "#374151" };
  }
}

function statusLabel(s: string) {
  return { confirmed: "Confirmed", processing: "Processing", dispatched: "Dispatched", out_for_delivery: "Out for Delivery", delivered: "Delivered", cancelled: "Cancelled" }[s] ?? s;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface OrderDetail {
  id: string;
  createdAt: string;
  status: string;
  statusHistory: any[];
  shippingCity: string;
  shippingState: string;
  deliveryMethod: string;
  paymentMethod: string;
  vendorItems: { productId: string; name: string; price: number; quantity: number; images: string[] }[];
  vendorTotal: number;
}

export default function SellerOrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  async function fetchOrder() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(getApiUrl(`/api/seller/orders/${orderId}`), { credentials: "include" });
      if (res.status === 404 || res.status === 403) {
        setError("Order not found or you don't have permission to view it.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrder(data);
    } catch {
      setError("Failed to load order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOrder(); }, [orderId]);

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!courierName.trim()) { setDispatchError("Courier name is required"); return; }
    if (!trackingNumber.trim()) { setDispatchError("Tracking number is required"); return; }
    setDispatching(true);
    setDispatchError("");
    try {
      const res = await fetch(getApiUrl(`/api/orders/${orderId}/dispatch`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ courierName: courierName.trim(), trackingNumber: trackingNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setDispatchError(data.error ?? "Failed to dispatch order"); return; }
      setDispatchSuccess(true);
      setCourierName("");
      setTrackingNumber("");
      await fetchOrder();
    } catch {
      setDispatchError("Failed to dispatch order. Please try again.");
    } finally {
      setDispatching(false);
    }
  }

  const canDispatch = order && !["dispatched", "out_for_delivery", "delivered", "cancelled"].includes(order.status);

  return (
    <SellerLayout title="Order Detail">
      <div className="max-w-4xl">
        <Link href="/seller/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to Orders
        </Link>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: MAROON }} />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500 text-sm">{error}</div>
        ) : order ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
            className="space-y-5">
            {/* Header */}
            <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold mb-1">Order</p>
                  <h2 className="font-mono text-lg font-bold" style={{ color: MAROON }}>
                    #{order.id.slice(0, 8).toUpperCase()}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="px-3 py-1.5 rounded-full text-sm font-semibold"
                    style={{ background: statusColors(order.status).bg, color: statusColors(order.status).text }}>
                    {statusLabel(order.status)}
                  </span>
                  <div className="text-xs text-gray-500 flex gap-3">
                    <span className="capitalize">{order.deliveryMethod} delivery</span>
                    <span>•</span>
                    <span className="capitalize">{order.paymentMethod.replace("_", " ")}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Items */}
              <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
                <h3 className="font-serif text-base font-bold mb-4" style={{ color: MAROON }}>Your Items</h3>
                <div className="space-y-3">
                  {order.vendorItems.map((item) => {
                    const img = item.images?.[0];
                    return (
                      <div key={item.productId} className="flex items-center gap-3">
                        {img ? (
                          <img src={img} alt={item.name} className="w-12 h-12 object-cover rounded-lg shrink-0" />
                        ) : (
                          <div className="w-12 h-12 rounded-lg shrink-0 flex items-center justify-center"
                            style={{ background: CREAM }}>
                            <span className="text-xs text-gray-400">—</span>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">Qty: {item.quantity} × ₹{item.price.toLocaleString("en-IN")}</p>
                        </div>
                        <p className="text-sm font-semibold shrink-0" style={{ color: MAROON }}>
                          ₹{(item.price * item.quantity).toLocaleString("en-IN")}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                  <span className="text-sm font-semibold text-gray-700">Your Total</span>
                  <span className="text-base font-bold" style={{ color: MAROON }}>
                    ₹{order.vendorTotal.toLocaleString("en-IN")}
                  </span>
                </div>
              </div>

              {/* Shipping + Dispatch */}
              <div className="space-y-5">
                <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
                  <h3 className="font-serif text-base font-bold mb-3" style={{ color: MAROON }}>Shipping To</h3>
                  <p className="text-sm text-gray-700">
                    {order.shippingCity}{order.shippingCity && order.shippingState ? ", " : ""}{order.shippingState}
                  </p>
                  {!order.shippingCity && !order.shippingState && (
                    <p className="text-sm text-gray-400">Location not available</p>
                  )}
                </div>

                {/* Dispatch panel */}
                {canDispatch && (
                  <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Truck size={16} style={{ color: MAROON }} />
                      <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>Mark as Dispatched</h3>
                    </div>

                    <AnimatePresence>
                      {dispatchSuccess && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded-lg px-3 py-2.5 mb-4">
                          <Check size={14} /> Order marked as dispatched
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <form onSubmit={handleDispatch} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#3D1515" }}>
                          Courier / Carrier
                        </label>
                        <input
                          type="text"
                          value={courierName}
                          onChange={(e) => { setCourierName(e.target.value); setDispatchError(""); }}
                          placeholder="e.g. Blue Dart, DTDC, Delhivery"
                          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition"
                          style={{ borderColor: "#C9A84C44", background: IVORY }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "#3D1515" }}>
                          Tracking Number
                        </label>
                        <input
                          type="text"
                          value={trackingNumber}
                          onChange={(e) => { setTrackingNumber(e.target.value); setDispatchError(""); }}
                          placeholder="Enter tracking number"
                          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition"
                          style={{ borderColor: "#C9A84C44", background: IVORY }}
                        />
                      </div>

                      {dispatchError && (
                        <div className="flex items-center gap-1.5 text-red-500 text-xs">
                          <AlertCircle size={12} /> {dispatchError}
                        </div>
                      )}

                      <button type="submit" disabled={dispatching}
                        className="w-full py-2.5 text-sm font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-60"
                        style={{ background: MAROON, color: IVORY }}>
                        {dispatching ? "Dispatching…" : "Mark as Dispatched"}
                      </button>
                    </form>
                  </div>
                )}

                {order.status === "dispatched" && (() => {
                  const dispatchEntry = (order.statusHistory as any[]).find(h => h.status === "dispatched" && h.courierName);
                  if (!dispatchEntry) return null;
                  return (
                    <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
                      <div className="flex items-center gap-2 mb-3">
                        <Truck size={16} style={{ color: MAROON }} />
                        <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>Dispatch Info</h3>
                      </div>
                      <div className="space-y-1.5 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Courier</span>
                          <span className="font-medium">{dispatchEntry.courierName}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Tracking</span>
                          <span className="font-mono font-medium">{dispatchEntry.trackingNumber}</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Timeline */}
            <OrderTrackingTimeline
              statusHistory={order.statusHistory}
              currentStatus={order.status}
              createdAt={order.createdAt}
            />
          </motion.div>
        ) : null}
      </div>
    </SellerLayout>
  );
}
