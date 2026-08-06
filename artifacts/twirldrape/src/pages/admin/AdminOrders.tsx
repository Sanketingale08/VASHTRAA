import React, { useEffect, useMemo, useState } from "react";
import { ShoppingBag, Search, Download, RefreshCw } from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface OrderAddress {
  name?: string;
  line1?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

interface AdminOrder {
  id: string;
  userId: string;
  items: OrderItem[];
  address: OrderAddress | null;
  total: number;
  status: string;
  paymentMethod: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "return_requested", label: "Return Requested" },
  { value: "return_approved", label: "Return Approved" },
  { value: "return_rejected", label: "Return Rejected" },
];

function fmtMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function statusTone(status: string): "orange" | "blue" | "green" | "red" | "gray" {
  if (status === "pending") return "orange";
  if (status === "confirmed" || status === "processing") return "blue";
  if (status === "shipped" || status === "delivered") return "green";
  if (status === "cancelled" || status === "return_rejected") return "red";
  return "gray";
}

function StatusPill({ label }: { label: string }) {
  const tone = statusTone(label);
  const map = {
    orange: { bg: "#fffbeb", color: "#b45309" },
    blue: { bg: "#eff6ff", color: "#1d4ed8" },
    green: { bg: "#f0fdf4", color: "#15803d" },
    red: { bg: "#fef2f2", color: "#b91c1c" },
    gray: { bg: "#f3f4f6", color: "#6b7280" },
  } as const;
  const s = map[tone];
  return (
    <span
      className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

function OrdersContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const adminKey =
    typeof window !== "undefined"
      ? sessionStorage.getItem("td_admin_key") ?? ""
      : "";

  function loadOrders(status?: string) {
    setLoading(true);
    setError("");
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    fetch(`/api/admin/orders${qs}`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Server error ${r.status}`);
        }
        return r.json();
      })
      .then((d) => setOrders(d.orders ?? []))
      .catch((err) => setError(err.message || "Failed to load orders"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOrders(statusFilter || undefined);
  }, [adminKey, statusFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      if (o.id.toLowerCase().includes(q)) return true;
      const customerName = o.address?.name ?? "";
      if (customerName.toLowerCase().includes(q)) return true;
      if (o.status.replace(/_/g, " ").includes(q)) return true;
      if (o.items.some((item) => item.name.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [orders, search]);

  async function exportCSV() {
    setExportLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const qs = params.toString() ? `?${params.toString()}` : "";
      const r = await fetch(`/api/admin/orders/export.csv${qs}`, {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${r.status})`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = statusFilter || "all";
      a.download = `orders-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Export failed");
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-xl font-serif font-bold flex items-center gap-2"
            style={{ color: NAVY }}
          >
            <ShoppingBag size={18} /> Orders
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            View and export all customer orders
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => loadOrders(statusFilter || undefined)}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50"
            style={{ color: NAVY }}
            title="Refresh"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={exportCSV}
            disabled={exportLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: NAVY }}
            title="Export all matching orders to CSV"
          >
            <Download size={13} /> {exportLoading ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by order ID, customer name, or item…"
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-300 bg-white shadow-sm"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-300 bg-white shadow-sm px-3 py-2 min-w-[160px]"
          style={{ color: NAVY }}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Summary bar */}
      {!loading && (
        <p className="text-xs text-gray-400">
          Showing{" "}
          <span className="font-semibold text-gray-600">{filtered.length}</span>{" "}
          {filtered.length === 1 ? "order" : "orders"}
          {search.trim() || statusFilter
            ? " matching current filters"
            : ""}
        </p>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {loading && (
          <div className="py-16 text-center text-gray-400 text-sm">
            Loading orders…
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">
            {search.trim() || statusFilter
              ? "No orders match your filters."
              : "No orders found."}
          </div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  <th className="px-5 py-3 text-left whitespace-nowrap">Order ID</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap">Customer</th>
                  <th className="px-5 py-3 text-left">Items</th>
                  <th className="px-5 py-3 text-right whitespace-nowrap">Total</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap">Status</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap">Payment</th>
                  <th className="px-5 py-3 text-left whitespace-nowrap">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-3 font-mono text-xs text-gray-400 whitespace-nowrap">
                      #{o.id.startsWith("TD") ? o.id : o.id.replace(/-/g,"").slice(0,8).toUpperCase()}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <span className="text-sm font-medium" style={{ color: NAVY }}>
                        {o.address?.name ?? <span className="text-gray-400 italic">—</span>}
                      </span>
                    </td>
                    <td className="px-5 py-3 max-w-[240px]">
                      <div className="text-sm" style={{ color: NAVY }}>
                        {o.items[0]?.name}
                        {o.items.length > 1 && (
                          <span className="text-gray-400 text-xs ml-1">
                            +{o.items.length - 1} more
                          </span>
                        )}
                      </div>
                      {o.items.length > 0 && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {o.items.reduce((sum, i) => sum + i.quantity, 0)} item
                          {o.items.reduce((sum, i) => sum + i.quantity, 0) !== 1 ? "s" : ""}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right whitespace-nowrap font-semibold" style={{ color: NAVY }}>
                      {fmtMoney(o.total)}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <StatusPill label={o.status} />
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-500 capitalize">
                      {o.paymentMethod ? o.paymentMethod.replace(/_/g, " ") : "—"}
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-xs text-gray-400">
                      {new Date(o.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminOrders() {
  return (
    <AdminGuard>
      <AdminLayout>
        <OrdersContent />
      </AdminLayout>
    </AdminGuard>
  );
}
