import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { motion } from "framer-motion";
import { Package, ShoppingBag } from "lucide-react";
import { Layout } from "@/components/Layout";
import { useOrdersContext } from "@/context/OrdersContext";

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
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
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
  const { isSignedIn, isLoaded } = useUser();
  const { patches, invalidateAt } = useOrdersContext();
  const [rawOrders, setRawOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    fetch(`${BASE}/api/orders`, { credentials: "include" })
      .then(async r => {
        if (!r.ok) throw new Error("Failed to load orders");
        const data = await r.json();
        setRawOrders(data.orders ?? []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [isLoaded, isSignedIn, invalidateAt]);

  // Merge in any optimistic patches applied from the order detail page
  const orders = rawOrders.map(o =>
    patches[o.id] ? { ...o, ...patches[o.id] } : o
  );

  if (!isLoaded || loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-10 h-10 border-2 border-[#C9A84C] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-sm opacity-60">Loading your orders…</p>
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    if (dashboardMode) return null;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
        <ShoppingBag size={48} className="text-gray-300" />
        <h2 className="font-serif text-2xl text-[#1E6B5A]">Sign in to view your orders</h2>
        <Link
          href="/sign-in"
          className="bg-[#1E6B5A] text-[#F3F8F5] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
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

  return (
    <div className="min-h-screen bg-[#F3F8F5] dark:bg-[#1E2329]">
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="font-serif text-3xl font-bold text-[#1E6B5A] mb-1">My Orders</h1>
          <p className="text-sm text-gray-500 mb-8">
            {orders.length === 0 ? "You haven't placed any orders yet." : `${orders.length} order${orders.length !== 1 ? "s" : ""} placed`}
          </p>
        </motion.div>

        {orders.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex flex-col items-center justify-center gap-6 py-20"
          >
            <Package size={56} className="text-gray-200" />
            <p className="text-gray-400 text-sm">No orders yet. Start shopping to see them here!</p>
            <Link
              href="/"
              className="bg-[#1E6B5A] hover:bg-[#6a1826] text-[#F3F8F5] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm transition-colors"
            >
              Browse Collection
            </Link>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {orders.map((order, idx) => {
              const placedAt = new Date(order.createdAt);
              const statusClass = statusColors[order.status] ?? "bg-gray-100 text-gray-600";
              const itemCount = (order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0);
              const previewItems = (order.items as OrderItem[]).slice(0, 3);

              return (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 * idx }}
                >
                  <Link href={`/orders/${order.id}`}>
                    <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C9A84C]/20 p-5 hover:border-[#C9A84C]/60 hover:shadow-lg hover:shadow-[#C9A84C]/8 hover:-translate-y-0.5 hover:bg-[#FDFAF5] dark:hover:bg-[#2F3540] transition-all duration-200 cursor-pointer">
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
                          <p className="font-mono text-xs text-gray-400 truncate mb-3">#{order.id}</p>

                          <div className="flex items-center gap-2 mb-3">
                            {previewItems.map((item, i) => (
                              <div
                                key={`${item.productId}-${i}`}
                                className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 border border-[#C9A84C]/10 shrink-0"
                              >
                                {item.images?.[0] && (
                                  <img
                                    src={item.images[0]}
                                    alt={item.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => { e.currentTarget.style.display = "none"; }}
                                  />
                                )}
                              </div>
                            ))}
                            {(order.items as OrderItem[]).length > 3 && (
                              <div className="w-12 h-12 rounded-lg bg-gray-100 border border-[#C9A84C]/10 flex items-center justify-center text-xs font-semibold text-gray-500 shrink-0">
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

                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <p className="font-bold text-[#1E6B5A] text-base">₹{order.total.toLocaleString("en-IN")}</p>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderHistoryPage() {
  return <Layout><OrderHistoryContent /></Layout>;
}
