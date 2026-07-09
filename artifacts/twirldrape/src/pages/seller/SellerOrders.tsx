import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Search, ChevronRight, Package } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const CREAM = "#F5EDE0";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "confirmed", label: "Confirmed" },
  { key: "processing", label: "Processing" },
  { key: "dispatched", label: "Dispatched" },
  { key: "out_for_delivery", label: "Out for Delivery" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
];

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

function statusLabel(status: string) {
  return {
    confirmed: "Confirmed",
    processing: "Processing",
    dispatched: "Dispatched",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    cancelled: "Cancelled",
  }[status] ?? status;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

interface SellerOrder {
  id: string;
  createdAt: string;
  status: string;
  customerName: string;
  vendorItems: { name: string; price: number; quantity: number }[];
  vendorTotal: number;
  itemCount: number;
}

const PER_PAGE = 10;

export default function SellerOrders() {
  const [orders, setOrders] = useState<SellerOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("all");
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async (status: string, q: string) => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (status !== "all") params.set("status", status);
      if (q) params.set("search", q);
      const res = await fetch(getApiUrl(`/api/seller/orders?${params}`), { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrders(data.orders ?? []);
      setPage(1);
    } catch {
      setError("Failed to load orders. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(tab, appliedSearch); }, [tab, appliedSearch, load]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setAppliedSearch(searchInput.trim());
  }

  const totalPages = Math.max(1, Math.ceil(orders.length / PER_PAGE));
  const paged = orders.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <SellerLayout title="Orders">
      <div className="max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>My Orders</h2>
            <p className="text-sm text-gray-500 mt-0.5">Orders that contain your products</p>
          </div>
          {!loading && (
            <span className="text-sm font-semibold px-3 py-1.5 rounded-full" style={{ background: CREAM, color: MAROON }}>
              {orders.length} order{orders.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <form onSubmit={handleSearch} className="mb-4 flex gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by order ID…"
              className="w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border outline-none transition"
              style={{ borderColor: "#C9A84C44", background: "white" }}
            />
          </div>
          <button type="submit" className="px-4 py-2.5 text-sm font-semibold rounded-lg" style={{ background: MAROON, color: "white" }}>
            Search
          </button>
          {appliedSearch && (
            <button type="button" onClick={() => { setAppliedSearch(""); setSearchInput(""); }}
              className="px-3 py-2.5 text-sm text-gray-500 rounded-lg border" style={{ borderColor: "#e5e7eb" }}>
              Clear
            </button>
          )}
        </form>

        <div className="flex gap-1.5 mb-5 flex-wrap">
          {STATUS_TABS.map(({ key, label }) => (
            <button key={key} onClick={() => { setTab(key); setPage(1); }}
              className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all"
              style={{ background: tab === key ? MAROON : "#F3F4F6", color: tab === key ? "white" : "#6B7280" }}>
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: MAROON }} />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-sm text-red-500">{error}</div>
        ) : orders.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-xl border border-[#C9A84C]/20">
            <Package size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="font-medium text-gray-500">No orders found</p>
            <p className="text-xs text-gray-400 mt-1">Orders containing your products will appear here</p>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-[#C9A84C]/20 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C9A84C22", background: CREAM }}>
                    {["Order ID", "Customer", "Items", "Your Total", "Date", "Status", ""].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paged.map((order, i) => {
                    const c = statusColors(order.status);
                    return (
                      <motion.tr key={order.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }}
                        className="border-b last:border-b-0 hover:bg-[#FAF6EE]/60 transition-colors" style={{ borderColor: "#F3F4F6" }}>
                        <td className="px-4 py-3.5 font-mono text-xs text-gray-500">
                          #{order.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="px-4 py-3.5 font-medium" style={{ color: MAROON }}>{order.customerName}</td>
                        <td className="px-4 py-3.5 text-gray-600 max-w-[180px]">
                          <span className="truncate block">{order.vendorItems[0]?.name}</span>
                          {order.itemCount > 1 && <span className="text-gray-400 text-xs">+{order.itemCount - 1} more</span>}
                        </td>
                        <td className="px-4 py-3.5 font-semibold" style={{ color: MAROON }}>
                          ₹{order.vendorTotal.toLocaleString("en-IN")}
                        </td>
                        <td className="px-4 py-3.5 text-gray-500 text-xs">{formatDate(order.createdAt)}</td>
                        <td className="px-4 py-3.5">
                          <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: c.bg, color: c.text }}>
                            {statusLabel(order.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <Link href={`/seller/orders/${order.id}`}
                            className="flex items-center gap-1 text-xs font-semibold hover:underline" style={{ color: MAROON }}>
                            View <ChevronRight size={12} />
                          </Link>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-gray-500">
                  Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, orders.length)} of {orders.length}
                </p>
                <div className="flex gap-1">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40" style={{ borderColor: "#C9A84C44" }}>
                    Previous
                  </button>
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 text-xs rounded-lg border disabled:opacity-40" style={{ borderColor: "#C9A84C44" }}>
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SellerLayout>
  );
}
