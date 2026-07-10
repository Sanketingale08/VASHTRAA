import React, { useEffect, useMemo, useState } from "react";
import { ShoppingBag, ArrowRight } from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";

interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

interface AdminOrder {
  id: string;
  userId: string;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

const STATUS_FLOW = ["confirmed", "processing", "dispatched", "out_for_delivery", "delivered"] as const;

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  dispatched: "Dispatched",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
  return_requested: "Return requested",
  return_approved: "Return approved",
  return_rejected: "Return rejected",
};

function nextStatus(status: string): string | null {
  const idx = STATUS_FLOW.indexOf(status as any);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

function fmtMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function tone(status: string): "orange" | "green" | "red" | "blue" | "gray" {
  if (status === "delivered") return "green";
  if (status === "cancelled" || status.startsWith("return_rejected")) return "red";
  if (status === "confirmed") return "gray";
  if (status === "dispatched" || status === "out_for_delivery") return "blue";
  return "orange";
}

function StatusPill({ status }: { status: string }) {
  const map = {
    orange: { bg: "#fffbeb", color: "#b45309" },
    green: { bg: "#f0fdf4", color: "#15803d" },
    red: { bg: "#fef2f2", color: "#b91c1c" },
    blue: { bg: "#eff6ff", color: "#1d4ed8" },
    gray: { bg: "#f3f4f6", color: "#6b7280" },
  } as const;
  const s = map[tone(status)];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {STATUS_LABELS[status] ?? status.replace(/_/g, " ")}
    </span>
  );
}

const FILTERS = ["all", "confirmed", "processing", "dispatched", "out_for_delivery", "delivered", "cancelled"] as const;

function OrdersContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadOrders() {
    setLoading(true);
    setError("");
    const qs = filter !== "all" ? `?status=${filter}` : "";
    fetch(`${basePath}/api/admin/orders${qs}`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => setError("Failed to load orders"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadOrders(); }, [adminKey, filter]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: orders.length };
    for (const o of orders) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [orders]);

  async function advanceStatus(order: AdminOrder) {
    const target = nextStatus(order.status);
    if (!target) return;
    setActionLoading(order.id);
    try {
      const res = await fetch(`${basePath}/api/orders/${order.id}/status`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: target }),
      });
      if (res.ok) {
        setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: target } : o)));
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to update order status");
      }
    } catch {
      setError("Failed to update order status");
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <ShoppingBag size={18} /> Orders
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Track and advance order fulfillment status</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap"
              style={{
                background: filter === f ? NAVY : "transparent",
                color: filter === f ? "white" : "#6b7280",
              }}
            >
              {(STATUS_LABELS[f] ?? "All").replace(/_/g, " ")} {counts[f] !== undefined ? `(${counts[f]})` : ""}
            </button>
          ))}
        </div>

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading orders…</div>}

        {!loading && orders.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No orders match this filter.</div>
        )}

        {!loading && orders.length > 0 && (
          <div className="divide-y divide-gray-50">
            {orders.map((o) => {
              const target = nextStatus(o.status);
              return (
                <div key={o.id} className="px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-gray-400">#{o.id.slice(0, 8)}</span>
                      <StatusPill status={o.status} />
                    </div>
                    <div className="text-sm font-medium mt-1" style={{ color: NAVY }}>
                      {o.items?.[0]?.name}{o.items.length > 1 ? ` + ${o.items.length - 1} more` : ""}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      Total {fmtMoney(o.total)} · Placed {new Date(o.createdAt).toLocaleString("en-IN")}
                    </div>
                  </div>

                  <div className="shrink-0">
                    {target ? (
                      <button
                        disabled={actionLoading === o.id}
                        onClick={() => advanceStatus(o)}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                        style={{ background: NAVY, color: "white" }}
                      >
                        {actionLoading === o.id ? "Updating…" : (
                          <>
                            Mark {STATUS_LABELS[target]} <ArrowRight size={12} />
                          </>
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">No further action</span>
                    )}
                  </div>
                </div>
              );
            })}
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
