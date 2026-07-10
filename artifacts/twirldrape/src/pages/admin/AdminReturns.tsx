import React, { useEffect, useMemo, useState } from "react";
import { CheckCircle, XCircle, Clock, RotateCcw, IndianRupee } from "lucide-react";
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
  refundStatus: string | null;
  refundMethod: string | null;
  returnReason: string | null;
  updatedAt: string;
  createdAt: string;
}

function fmtMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function StatusPill({ label, tone }: { label: string; tone: "orange" | "green" | "red" | "gray" }) {
  const map = {
    orange: { bg: "#fffbeb", color: "#b45309" },
    green: { bg: "#f0fdf4", color: "#15803d" },
    red: { bg: "#fef2f2", color: "#b91c1c" },
    gray: { bg: "#f3f4f6", color: "#6b7280" },
  } as const;
  const s = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

function returnTone(status: string): "orange" | "green" | "red" | "gray" {
  if (status === "return_requested") return "orange";
  if (status === "return_approved") return "green";
  if (status === "return_rejected") return "red";
  return "gray";
}

function refundTone(status: string | null): "orange" | "green" | "red" | "gray" {
  if (status === "pending") return "orange";
  if (status === "approved") return "green";
  if (status === "rejected") return "red";
  return "gray";
}

const TABS = ["all", "returns", "refunds"] as const;

function ReturnsContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadOrders() {
    setLoading(true);
    fetch(`${basePath}/api/admin/returns`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setOrders(d.orders ?? []))
      .catch(() => setError("Failed to load return/refund requests"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadOrders(); }, [adminKey]);

  const filtered = useMemo(() => {
    if (tab === "returns") return orders.filter((o) => o.status.startsWith("return_"));
    if (tab === "refunds") return orders.filter((o) => !!o.refundStatus);
    return orders;
  }, [orders, tab]);

  async function reviewReturn(orderId: string, decision: "approved" | "rejected") {
    const key = orderId + "return" + decision;
    setActionLoading(key);
    try {
      const res = await fetch(`${basePath}/api/admin/orders/${orderId}/return`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision, note: noteDrafts[orderId] || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to update return status");
      }
    } catch {
      setError("Failed to update return status");
    } finally {
      setActionLoading(null);
    }
  }

  async function reviewRefund(orderId: string, decision: "approved" | "rejected") {
    const key = orderId + "refund" + decision;
    setActionLoading(key);
    try {
      const res = await fetch(`${basePath}/api/admin/orders/${orderId}/refund`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ decision, note: noteDrafts[orderId] || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to update refund status");
      }
    } catch {
      setError("Failed to update refund status");
    } finally {
      setActionLoading(null);
    }
  }

  const tabCounts = useMemo(() => ({
    all: orders.length,
    returns: orders.filter((o) => o.status.startsWith("return_")).length,
    refunds: orders.filter((o) => !!o.refundStatus).length,
  }), [orders]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <RotateCcw size={18} /> Returns & Refunds
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Review and act on customer return and refund requests</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap"
              style={{
                background: tab === t ? NAVY : "transparent",
                color: tab === t ? "white" : "#6b7280",
              }}
            >
              {t} ({tabCounts[t]})
            </button>
          ))}
        </div>

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading requests…</div>}

        {!loading && filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No return or refund requests match this filter.</div>
        )}

        {!loading && filtered.length > 0 && (
          <div className="divide-y divide-gray-50">
            {filtered.map((o) => {
              let returnData: { reason?: string; itemNotes?: unknown } | null = null;
              if (o.returnReason) {
                try { returnData = JSON.parse(o.returnReason); } catch { returnData = { reason: o.returnReason }; }
              }
              return (
                <div key={o.id} className="px-5 py-4">
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-400">#{o.id.slice(0, 8)}</span>
                        <StatusPill label={o.status} tone={returnTone(o.status)} />
                        {o.refundStatus && (
                          <span className="inline-flex items-center gap-1">
                            <IndianRupee size={11} className="text-gray-400" />
                            <StatusPill label={`refund ${o.refundStatus}`} tone={refundTone(o.refundStatus)} />
                          </span>
                        )}
                      </div>
                      <div className="text-sm font-medium mt-1" style={{ color: NAVY }}>
                        {o.items?.[0]?.name}{o.items.length > 1 ? ` + ${o.items.length - 1} more` : ""}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5">
                        Total {fmtMoney(o.total)} · Updated {new Date(o.updatedAt).toLocaleString("en-IN")}
                      </div>
                      {returnData?.reason && (
                        <div className="text-xs text-gray-500 mt-1.5 bg-gray-50 rounded-lg px-2.5 py-1.5 max-w-md">
                          <span className="font-semibold text-gray-600">Return reason: </span>{returnData.reason}
                        </div>
                      )}
                      {o.refundMethod && (
                        <div className="text-xs text-gray-400 mt-1">Refund method: {o.refundMethod.replace(/_/g, " ")}</div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2 shrink-0 w-full md:w-64">
                      <input
                        value={noteDrafts[o.id] ?? ""}
                        onChange={(e) => setNoteDrafts((p) => ({ ...p, [o.id]: e.target.value }))}
                        placeholder="Optional note…"
                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-blue-300"
                      />
                      <div className="flex flex-wrap gap-1.5">
                        {o.status === "return_requested" && (
                          <>
                            <ActionBtn
                              icon={<CheckCircle size={12} />}
                              label="Approve return"
                              color="#15803d" bg="#f0fdf4"
                              loading={actionLoading === o.id + "returnapproved"}
                              onClick={() => reviewReturn(o.id, "approved")}
                            />
                            <ActionBtn
                              icon={<XCircle size={12} />}
                              label="Reject return"
                              color="#b91c1c" bg="#fef2f2"
                              loading={actionLoading === o.id + "returnrejected"}
                              onClick={() => reviewReturn(o.id, "rejected")}
                            />
                          </>
                        )}
                        {o.refundStatus === "pending" && (
                          <>
                            <ActionBtn
                              icon={<CheckCircle size={12} />}
                              label="Approve refund"
                              color="#15803d" bg="#f0fdf4"
                              loading={actionLoading === o.id + "refundapproved"}
                              onClick={() => reviewRefund(o.id, "approved")}
                            />
                            <ActionBtn
                              icon={<XCircle size={12} />}
                              label="Reject refund"
                              color="#b91c1c" bg="#fef2f2"
                              loading={actionLoading === o.id + "refundrejected"}
                              onClick={() => reviewRefund(o.id, "rejected")}
                            />
                          </>
                        )}
                        {o.status !== "return_requested" && o.refundStatus !== "pending" && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={11} /> No action needed
                          </span>
                        )}
                      </div>
                    </div>
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

function ActionBtn({ icon, label, color, bg, loading, onClick }: {
  icon: React.ReactNode; label: string; color: string; bg: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      disabled={loading}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {loading ? "…" : icon} {label}
    </button>
  );
}

export default function AdminReturns() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ReturnsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
