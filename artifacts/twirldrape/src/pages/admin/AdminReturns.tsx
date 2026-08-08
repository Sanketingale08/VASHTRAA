import React, { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle, XCircle, Clock, RotateCcw, IndianRupee, BadgeCheck, Search, Download, ArrowUpDown } from "lucide-react";
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
  refundStatus: string | null;
  refundMethod: string | null;
  refundProcessedAt: string | null;
  refundReference: string | null;
  returnReason: string | null;
  updatedAt: string;
  createdAt: string;
  returnRequestedAt: string;
}

function fmtMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function getElapsedInfo(isoDate: string): { label: string; ageDays: number } {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);
  let label: string;
  if (diffMins < 60) label = diffMins <= 1 ? "just now" : `${diffMins} minutes ago`;
  else if (diffHours < 24) label = diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
  else label = diffDays === 1 ? "1 day ago" : `${diffDays} days ago`;
  return { label, ageDays: diffDays };
}

function AgeBadge({ ageDays }: { ageDays: number }) {
  if (ageDays >= 7) {
    return (
      <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "#fef2f2", color: "#b91c1c" }}>
        ⚠ {ageDays}d — overdue
      </span>
    );
  }
  if (ageDays >= 3) {
    return (
      <span className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full"
        style={{ background: "#fffbeb", color: "#b45309" }}>
        ⏳ {ageDays}d — aging
      </span>
    );
  }
  return null;
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
  if (status === "processed") return "green";
  if (status === "rejected") return "red";
  return "gray";
}

const TABS = ["all", "returns", "refunds"] as const;

function ReturnsContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"oldest" | "newest">("oldest");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const processingInFlight = useRef<Set<string>>(new Set());
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadOrders() {
    setLoading(true);
    fetch(`/api/admin/returns`, {
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
    let list = orders;
    if (tab === "returns") list = list.filter((o) => o.status.startsWith("return_"));
    else if (tab === "refunds") list = list.filter((o) => !!o.refundStatus);

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((o) => {
        if (o.id.toLowerCase().includes(q)) return true;
        const customerName = o.address?.name ?? "";
        if (customerName.toLowerCase().includes(q)) return true;
        if (o.items.some((item) => item.name.toLowerCase().includes(q))) return true;
        return false;
      });
    }

    list = [...list].sort((a, b) => {
      const diff = new Date(a.returnRequestedAt).getTime() - new Date(b.returnRequestedAt).getTime();
      return sortOrder === "oldest" ? diff : -diff;
    });

    return list;
  }, [orders, tab, search, sortOrder]);

  async function reviewReturn(orderId: string, decision: "approved" | "rejected") {
    const key = orderId + "return" + decision;
    setActionLoading(key);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/return`, {
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
      const res = await fetch(`/api/admin/orders/${orderId}/refund`, {
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

  async function processRefund(orderId: string) {
    const key = orderId + "refundprocess";
    if (processingInFlight.current.has(key)) return;
    processingInFlight.current.add(key);
    setActionLoading(key);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/refund/process`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reference: noteDrafts[orderId] || undefined }),
      });
      if (res.ok) {
        const data = await res.json();
        setOrders((prev) => prev.map((o) => (o.id === orderId ? data.order : o)));
        setNoteDrafts((p) => { const n = { ...p }; delete n[orderId]; return n; });
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.error || "Failed to mark refund as processed");
      }
    } catch {
      setError("Failed to mark refund as processed");
    } finally {
      processingInFlight.current.delete(key);
      setActionLoading(null);
    }
  }

  const tabCounts = useMemo(() => ({
    all: orders.length,
    returns: orders.filter((o) => o.status.startsWith("return_")).length,
    refunds: orders.filter((o) => !!o.refundStatus).length,
  }), [orders]);

  function exportCSV() {
    const headers = ["Order ID", "Customer Name", "Item Names", "Total (₹)", "Status", "Refund Status", "Requested Date", "Updated Date", "Payout Ref", "Processed At"];
    const rows = filtered.map((o) => [
      o.id,
      o.address?.name ?? "",
      o.items.map((i) => i.name).join("; "),
      (o.total / 100).toFixed(2),
      o.status.replace(/_/g, " "),
      o.refundStatus ? o.refundStatus.replace(/_/g, " ") : "",
      new Date(o.returnRequestedAt).toLocaleString("en-IN"),
      new Date(o.updatedAt).toLocaleString("en-IN"),
      o.refundReference ?? "",
      o.refundProcessedAt ? new Date(o.refundProcessedAt).toLocaleString("en-IN") : "",
    ]);

    // Build summary row
    const totalRefundAmount = filtered.reduce((sum, o) => sum + o.total, 0);
    const statusCounts: Record<string, number> = {};
    for (const o of filtered) {
      const s = o.status.replace(/_/g, " ");
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    }
    const statusBreakdown = Object.entries(statusCounts)
      .map(([s, c]) => `${s}: ${c}`)
      .join("; ");
    const summaryRow = [
      "SUMMARY",
      "",
      `Total rows: ${filtered.length}`,
      (totalRefundAmount / 100).toFixed(2),
      statusBreakdown,
      "",
      "",
      "",
      "",
      "",
    ];

    const escape = (val: string) => `"${val.replace(/"/g, '""')}"`;
    const csv = [headers, ...rows, summaryRow].map((row) => row.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const tabLabel = tab === "all" ? "all" : tab;
    a.download = `returns-${tabLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <RotateCcw size={18} /> Returns & Refunds
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Review and act on customer return and refund requests</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setSortOrder((s) => s === "oldest" ? "newest" : "oldest")}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50"
            style={{ color: NAVY }}
            title="Toggle sort order"
          >
            <ArrowUpDown size={13} /> {sortOrder === "oldest" ? "Oldest first" : "Newest first"}
          </button>
          <button
            onClick={exportCSV}
            disabled={filtered.length === 0}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ color: NAVY }}
            title="Export current view to CSV"
          >
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by order ID, customer name, or item…"
          className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-blue-300 bg-white shadow-sm"
        />
      </div>

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
          <div className="py-16 text-center text-gray-400 text-sm">
            {search.trim() ? "No requests match your search." : "No return or refund requests match this filter."}
          </div>
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
                        <span className="font-mono text-xs text-gray-400">#{o.id.startsWith("TD") ? o.id : o.id.replace(/-/g,"").slice(0,8).toUpperCase()}</span>
                        {o.address?.name && (
                          <span className="text-xs font-medium text-gray-600">{o.address.name}</span>
                        )}
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
                      <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                        Total {fmtMoney(o.total)} · <span className="text-amber-600 font-medium">Requested {new Date(o.returnRequestedAt).toLocaleString("en-IN")}</span>
                        {(() => { const { label, ageDays } = getElapsedInfo(o.returnRequestedAt); return (<><span className="text-gray-500">({label})</span><AgeBadge ageDays={ageDays} /></>); })()}
                        · Updated {new Date(o.updatedAt).toLocaleString("en-IN")}
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
                        placeholder={o.refundStatus === "approved" ? "Payout reference (optional)…" : "Optional note…"}
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
                        {o.refundStatus === "approved" && (
                          <ActionBtn
                            icon={<BadgeCheck size={12} />}
                            label="Mark payout done"
                            color="#1d4ed8" bg="#eff6ff"
                            loading={actionLoading === o.id + "refundprocess"}
                            onClick={() => processRefund(o.id)}
                          />
                        )}
                        {o.status !== "return_requested" && o.refundStatus !== "pending" && o.refundStatus !== "approved" && (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-400">
                            <Clock size={11} /> No action needed
                          </span>
                        )}
                      </div>
                      {o.refundStatus === "processed" && (
                        <div className="text-xs text-blue-700 bg-blue-50 rounded-lg px-2.5 py-1.5">
                          <span className="font-semibold">Paid out</span>
                          {o.refundProcessedAt && (
                            <> · {new Date(o.refundProcessedAt).toLocaleString("en-IN")}</>
                          )}
                          {o.refundReference && (
                            <div className="mt-0.5 text-blue-600">Ref: {o.refundReference}</div>
                          )}
                        </div>
                      )}
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
