import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { motion } from "framer-motion";
import { Package, ShoppingBag, Download, Layers, Eye, RotateCcw, RefreshCw, Clock } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useOrdersContext } from "@/context/OrdersContext";
import { OrderCardSkeleton, Skeleton } from "@/components/skeletons";
import { InvoiceDocumentsModal } from "@/components/InvoiceDocumentsModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  images: string[];
  vendorName: string;
};

type Order = {
  id: string;
  displayId?: string | null;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  deliveredAt?: string | null;
  paymentMethod?: string;
  paymentStatus?: string;
  refundStatus?: string | null;
  refundProcessedAt?: string | null;
  refundReference?: string | null;
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
  return_requested: "bg-orange-100 text-orange-700",
};

export function OrderHistoryContent({ dashboardMode = false }: { dashboardMode?: boolean }) {
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const { patches, invalidateAt } = useOrdersContext();
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<{ id: string; displayId?: string | null } | null>(null);

  async function downloadOrderInvoice(e: React.MouseEvent, o: Order) {
    e.preventDefault();
    e.stopPropagation();

    const uniqueVendors = Array.from(new Set(((o.items as OrderItem[]) || []).map((i) => i.vendorName).filter(Boolean)));
    if (uniqueVendors.length > 1) {
      setSelectedOrderForInvoice({ id: o.id, displayId: o.displayId });
      return;
    }

    setDownloadingId(o.id);
    try {
      const res = await apiFetch(`/api/orders/${o.id}/invoice`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Invoice-INV-${o.displayId || o.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn("Invoice download error", err);
    } finally {
      setDownloadingId(null);
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    setLoading(true);
    apiFetch(`/api/orders`)
      .then(async r => {
        if (!r.ok) throw new Error("Failed to load orders");
        const data = await r.json();
        setRawOrders(data.orders ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, isSignedIn, invalidateAt]);

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if ([
        "order:created",
        "order:status_changed",
        "order:cancelled",
        "payment:status_updated",
        "return:created",
        "return:updated",
        "return:approved",
        "refund:processed",
        "refund:approved"
      ].includes(detail.name)) {
        apiFetch(`/api/orders`)
          .then(async r => {
            if (!r.ok) return;
            const data = await r.json();
            setRawOrders(data.orders ?? []);
          })
          .catch(() => {});
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, []);

  // Merge in any optimistic patches applied from the order detail page
  const orders = rawOrders.map(o =>
    patches[o.id] ? { ...o, ...patches[o.id] } : o
  );

  const [activeTab, setActiveTab] = useState<"all" | "current" | "delivered" | "cancelled" | "returned">("all");

  const currentOrders = orders.filter((o) => ["confirmed", "processing", "shipped", "out_for_delivery"].includes(o.status));
  const deliveredOrders = orders.filter((o) => o.status === "delivered");
  const cancelledOrders = orders.filter((o) => o.status === "cancelled");
  const returnedOrders = orders.filter((o) => ["returned", "return_requested", "return_approved"].includes(o.status) || !!o.refundStatus);

  let filteredOrders = orders;
  if (activeTab === "current") filteredOrders = currentOrders;
  else if (activeTab === "delivered") filteredOrders = deliveredOrders;
  else if (activeTab === "cancelled") filteredOrders = cancelledOrders;
  else if (activeTab === "returned") filteredOrders = returnedOrders;

  if (authLoading || loading) {
    return (
      <div className={dashboardMode ? "space-y-6" : "min-h-screen bg-[#F4F5F7] dark:bg-[#1E2329]"}>
        <div className={dashboardMode ? "" : "container mx-auto px-4 py-10 max-w-3xl"}>
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <Skeleton className="h-8 w-44 rounded" />
              <Skeleton className="h-4 w-28 rounded" />
            </div>
            <div className="flex gap-2 pb-2 overflow-x-auto">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full shrink-0" />
              ))}
            </div>
            <OrderCardSkeleton count={3} />
          </div>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    if (dashboardMode) return null;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
        <ShoppingBag size={48} className="text-gray-300" />
        <h2 className="font-serif text-2xl text-[#0A1F44]">Sign in to view your orders</h2>
        <Link
          href="/sign-in"
          className="bg-[#0A1F44] text-[#F4F5F7] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
        >
          Sign In
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-4">
        <Package size={48} className="text-gray-300" />
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  const tabs = [
    { key: "all", label: "All Orders", count: orders.length },
    { key: "current", label: "Current", count: currentOrders.length },
    { key: "delivered", label: "Delivered", count: deliveredOrders.length },
    { key: "cancelled", label: "Cancelled", count: cancelledOrders.length },
    { key: "returned", label: "Returned", count: returnedOrders.length },
  ] as const;

  return (
    <div className={dashboardMode ? "space-y-6" : "min-h-screen bg-[#F4F5F7] dark:bg-[#1E2329]"}>
      <div className={dashboardMode ? "" : "container mx-auto px-4 py-10 max-w-3xl"}>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="mb-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">My Orders</h1>
              <p className="text-xs lg:text-sm text-gray-500">
                Track and manage your current, delivered, cancelled, and returned orders.
              </p>
            </div>
          </div>

          {/* Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#C7CCD1]/20 no-scrollbar">
            {tabs.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                    active
                      ? "bg-[#0A1F44] text-white shadow-sm font-semibold"
                      : "bg-white text-gray-600 hover:bg-gray-100 hover:text-[#0A1F44] border border-[#C7CCD1]/20"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${
                      active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {filteredOrders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center justify-center gap-4 py-16 bg-white rounded-xl border border-[#C7CCD1]/20 px-4 text-center"
          >
            <Package size={48} className="text-gray-300" />
            <div>
              <p className="font-semibold text-gray-700 text-sm">
                No {activeTab !== "all" ? activeTab : ""} orders found
              </p>
              <p className="text-gray-400 text-xs mt-1">
                {activeTab === "all"
                  ? "You haven't placed any orders yet. Start shopping to see them here!"
                  : `You don't have any ${activeTab} orders at this moment.`}
              </p>
            </div>
            <Link
              href="/"
              className="bg-[#0A1F44] hover:bg-[#2C3E6B] text-[#F4F5F7] px-6 py-2.5 font-semibold text-xs rounded-lg transition-colors mt-2"
            >
              Browse Collection
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {filteredOrders.map((order, idx) => {
              const placedAt = new Date(order.createdAt);
              const statusClass = statusColors[order.status] ?? "bg-gray-100 text-gray-600";
              const itemCount = (order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0);
              const previewItems = (order.items as OrderItem[]).slice(0, 3);

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.04 * idx }}
                >
                  <Link href={`/orders/${order.id}`}>
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5 hover:border-[#C7CCD1]/60 hover:shadow-lg hover:shadow-[#C7CCD1]/8 hover:-translate-y-0.5 hover:bg-[#FDFAF5] dark:hover:bg-[#2F3540] transition-all duration-200 cursor-pointer">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-full capitalize ${statusClass}`}>
                              {order.status.replace(/_/g, " ")}
                            </span>
                            {order.refundStatus === "processed" && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                                Refund paid out
                                {order.refundProcessedAt && (
                                  <> · {new Date(order.refundProcessedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</>
                                )}
                              </span>
                            )}
                            {order.refundStatus && order.refundStatus !== "processed" && (
                              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full capitalize ${
                                order.refundStatus === "approved" ? "bg-green-100 text-green-700" :
                                order.refundStatus === "rejected" ? "bg-red-100 text-red-700" :
                                "bg-orange-100 text-orange-700"
                              }`}>
                                Refund {order.refundStatus}
                              </span>
                            )}
                            <span className="text-xs text-gray-400">
                              {placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                            </span>
                          </div>
                          <p className="font-mono text-xs text-gray-400 truncate mb-3">#{order.displayId ?? order.id}</p>

                          <div className="flex items-center gap-2 mb-3">
                            {previewItems.map((item, i) => (
                              <div
                                key={`${item.productId}-${i}`}
                                className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-[#C7CCD1]/10 shrink-0"
                              >
                                  <img
                                    src={getProductImageSrc(item.images?.[0])}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                    onError={replaceProductImageWithFallback}
                                  />
                              </div>
                            ))}
                            {(order.items as OrderItem[]).length > 3 && (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 border border-[#C7CCD1]/10 flex items-center justify-center text-xs font-semibold text-gray-500 shrink-0">
                                +{(order.items as OrderItem[]).length - 3}
                              </div>
                            )}
                          </div>

                          <p className="text-xs text-gray-500">
                            {itemCount} item{itemCount !== 1 ? "s" : ""}
                            {(order.items as OrderItem[]).length > 0 && (
                              <span className="ml-1">— {(order.items as OrderItem[])[0].name}{(order.items as OrderItem[]).length > 1 ? ` & ${(order.items as OrderItem[]).length - 1} more` : ""}</span>
                            )}
                          </p>
                        </div>

                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <p className="font-bold text-[#0A1F44] text-base">₹{order.total.toLocaleString("en-IN")}</p>
                          {order.paymentMethod === "cod" ? (
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                              Pay on Delivery
                            </span>
                          ) : order.paymentStatus === "paid" ? (
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-full">
                              Paid
                            </span>
                          ) : order.paymentStatus === "failed" ? (
                            <span className="text-[10px] font-semibold text-red-700 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                              Payment Failed
                            </span>
                          ) : (
                            <span className="text-[10px] font-semibold text-yellow-700 bg-yellow-50 dark:bg-yellow-900/30 px-2 py-0.5 rounded-full">
                              Payment Pending
                            </span>
                          )}
                          {order.paymentMethod !== "cod" && order.paymentStatus !== "paid" && order.status !== "cancelled" && (
                            <span className="text-[10px] font-bold text-white bg-[#0A1F44] px-2 py-0.5 rounded shadow-xs mt-0.5">
                              Pay Now →
                            </span>
                          )}
                          {(() => {
                            const uniqueVendors = Array.from(new Set(((order.items as OrderItem[]) || []).map((i) => i.vendorName).filter(Boolean)));
                            const isMulti = uniqueVendors.length > 1;

                            return isMulti ? (
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setSelectedOrderForInvoice({ id: order.id, displayId: order.displayId });
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0A1F44] hover:text-[#B8912A] border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-900/30 px-2 py-0.5 rounded shadow-2xs mt-1 transition-colors"
                                title="View Master Order Summary and Seller Tax Invoices"
                              >
                                <Layers size={11} className="text-blue-600 dark:text-blue-400" />
                                Invoices ({uniqueVendors.length})
                              </button>
                            ) : (
                              <div className="flex items-center gap-1 mt-1">
                                <button
                                  onClick={(e) => downloadOrderInvoice(e, order)}
                                  disabled={downloadingId === order.id}
                                  className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0A1F44] hover:text-[#B8912A] border border-gray-200 dark:border-gray-600 hover:border-[#B8912A]/40 bg-white dark:bg-[#1E2329] px-2 py-0.5 rounded shadow-2xs transition-colors"
                                  title="Download official Tax Invoice & Bill of Supply"
                                >
                                  <Download size={11} className={downloadingId === order.id ? "animate-bounce" : ""} />
                                  {downloadingId === order.id ? "Downloading…" : "Invoice"}
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setSelectedOrderForInvoice({ id: order.id, displayId: order.displayId });
                                  }}
                                  className="p-1 text-[11px] font-semibold text-gray-500 hover:text-[#0A1F44] border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-[#1E2329] transition-colors"
                                  title="View invoice details and preview"
                                  aria-label="View invoice documents"
                                >
                                  <Eye size={11} />
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      {/* 7-Day Return & Exchange Actions & Deadlines */}
                      {(() => {
                        const isDelivered = order.status === "delivered";
                        const deliveryDate = order.deliveredAt ? new Date(order.deliveredAt) : order.updatedAt ? new Date(order.updatedAt) : new Date(order.createdAt);
                        const daysSinceDelivery = Math.floor((Date.now() - deliveryDate.getTime()) / (1000 * 60 * 60 * 24));
                        const daysRemaining = Math.max(0, 7 - daysSinceDelivery);
                        const isReturnWindowOpen = isDelivered && daysSinceDelivery <= 7;
                        const hasReturnClaim = ["returned", "return_requested", "return_approved"].includes(order.status) || Boolean(order.refundStatus);

                        if (isDelivered && !hasReturnClaim) {
                          return (
                            <div className="mt-3 pt-3 border-t border-[#C7CCD1]/20 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 text-xs">
                                <Clock size={13} className={isReturnWindowOpen ? "text-emerald-600" : "text-gray-400"} />
                                {isReturnWindowOpen ? (
                                  <span className="font-medium text-emerald-700 dark:text-emerald-400">
                                    Eligible for 7-Day Return / Exchange · <strong className="font-semibold">{daysRemaining} day{daysRemaining === 1 ? "" : "s"} left</strong>
                                  </span>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">
                                    Return window closed (delivered {daysSinceDelivery} days ago)
                                  </span>
                                )}
                              </div>
                              {isReturnWindowOpen && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.location.href = `${BASE}/account/returns?orderId=${order.id}&action=return`;
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border border-orange-200 text-orange-700 bg-orange-50 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300 transition-colors"
                                  >
                                    <RotateCcw size={12} />
                                    Request Return
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.location.href = `${BASE}/account/returns?orderId=${order.id}&action=exchange`;
                                    }}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300 transition-colors"
                                  >
                                    <RefreshCw size={12} />
                                    Request Exchange
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        }

                        if (hasReturnClaim) {
                          return (
                            <div className="mt-3 pt-3 border-t border-[#C7CCD1]/20 flex items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A1F44] dark:text-[#C7CCD1]">
                                <RotateCcw size={13} className="text-[#0A1F44] dark:text-[#C7CCD1]" />
                                Return / Exchange Active · Tracking Live
                              </span>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  window.location.href = `${BASE}/account/returns`;
                                }}
                                className="text-xs font-bold text-[#0A1F44] dark:text-[#C7CCD1] hover:underline"
                              >
                                View Tracker →
                              </button>
                            </div>
                          );
                        }

                        return null;
                      })()}
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Invoice Documents Modal */}
      <InvoiceDocumentsModal
        orderId={selectedOrderForInvoice?.id || null}
        displayId={selectedOrderForInvoice?.displayId}
        isOpen={Boolean(selectedOrderForInvoice)}
        onClose={() => setSelectedOrderForInvoice(null)}
      />
    </div>
  );
}

export function OrderHistoryPage() {
  return <Layout><OrderHistoryContent /></Layout>;
}

export default OrderHistoryPage;

