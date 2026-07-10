import React, { useEffect, useMemo, useState } from "react";
import {
  Wallet, CheckCircle, XCircle, Clock, IndianRupee, TrendingUp, TrendingDown,
  Download, FileSpreadsheet, Percent, Receipt, RotateCcw, CreditCard,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

function fmt(n: number) {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

interface Settlement {
  id: string; vendorId: string; vendorName: string; amount: number; type: string;
  status: string; paymentMethod: string | null; transactionId: string | null;
  note: string | null; createdAt: string; reviewedAt: string | null;
}

interface CommissionRule {
  id: string; scope: string; category: string | null; vendorId: string | null;
  vendorName: string | null; rate: number; active: boolean; createdAt: string;
}

interface RevenueReport {
  summary: { grossRevenue: number; netRevenue: number; platformRevenue: number; vendorRevenue: number; commissionRevenue: number; taxesCollected: number; shippingRevenue: number };
  rows: { orderId: string; date: string; total: number; tax: number; shipping: number; commission: number; vendorRevenue: number; paymentMethod: string }[];
}

interface PaymentReport {
  successfulCount: number; successfulAmount: number; pendingCount: number; pendingAmount: number;
  failedCount: number; failedAmount: number; methodBreakdown: { method: string; count: number; amount: number }[];
  transactions: { orderId: string; date: string; amount: number; method: string; status: string }[];
}

interface RefundReport {
  totalRequests: number; approvedCount: number; rejectedCount: number; pendingCount: number;
  totalRefundAmount: number; reasons: { reason: string; count: number }[]; avgProcessingHours: number;
  requests: { orderId: string; amount: number; status: string; reason: string; date: string }[];
}

interface ProfitAnalysis {
  grossProfit: number; netProfit: number; marketplaceExpenses: number; vendorSettlementsPaid: number;
  commissionEarnings: number; operationalCosts: number; monthlyProfit: { month: string; profit: number; revenue: number }[];
  yearlyProfit: { year: string; profit: number }[]; profitGrowthPercent: number;
}

const TABS = [
  { key: "settlements", label: "Settlements", icon: Wallet },
  { key: "commission", label: "Commission Rules", icon: Percent },
  { key: "revenue", label: "Revenue Report", icon: IndianRupee },
  { key: "payments", label: "Payment Report", icon: CreditCard },
  { key: "refunds", label: "Refund Report", icon: RotateCcw },
  { key: "profit", label: "Profit Analysis", icon: TrendingUp },
] as const;

type TabKey = typeof TABS[number]["key"];

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#fffbeb", color: "#b45309" },
    approved: { bg: "#eff6ff", color: "#1d4ed8" },
    rejected: { bg: "#fef2f2", color: "#b91c1c" },
    completed: { bg: "#f0fdf4", color: "#15803d" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function useAdminKey() {
  return typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";
}

function SettlementsPanel() {
  const adminKey = useAdminKey();
  const [data, setData] = useState<{ settlements: Settlement[]; summary: { pendingTotal: number; completedTotal: number; count: number } } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewMeta, setReviewMeta] = useState<{ paymentMethod: string; transactionId: string }>({ paymentMethod: "", transactionId: "" });
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  function load() {
    if (!adminKey) return;
    setLoading(true);
    const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    fetch(`${basePath}/api/admin/financial/settlements${q}`, { headers: { "x-admin-key": adminKey }, credentials: "include" })
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [adminKey, statusFilter]);

  async function review(id: string, decision: "approve" | "reject" | "complete") {
    setBusyId(id);
    try {
      await fetch(`${basePath}/api/admin/financial/settlements/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({
          decision,
          paymentMethod: reviewMeta.paymentMethod || undefined,
          transactionId: reviewMeta.transactionId || undefined,
        }),
      });
      setReviewingId(null);
      setReviewMeta({ paymentMethod: "", transactionId: "" });
      load();
    } finally {
      setBusyId(null);
    }
  }

  const settlements = data?.settlements ?? [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Pending Payout</span>
          <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data?.summary.pendingTotal ?? 0)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Completed</span>
          <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data?.summary.completedTotal ?? 0)}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Total Settlements</span>
          <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{data?.summary.count ?? 0}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>Vendor Settlements</h3>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="completed">Completed</option>
          </select>
        </div>
        {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
        {!loading && settlements.length === 0 && <div className="py-10 text-center text-sm text-gray-400">No settlements found.</div>}
        {!loading && settlements.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Amount</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3.5 font-semibold" style={{ color: NAVY }}>{s.vendorName}</td>
                    <td className="px-4 py-3.5 text-xs capitalize text-gray-500">{s.type}</td>
                    <td className="px-4 py-3.5 text-right font-semibold" style={{ color: NAVY }}>{fmt(s.amount)}</td>
                    <td className="px-4 py-3.5"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3.5">
                      {s.status === "pending" && (
                        <div className="flex justify-end gap-1.5">
                          <button disabled={busyId === s.id} onClick={() => review(s.id, "approve")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">
                            <CheckCircle size={12} /> Approve
                          </button>
                          <button disabled={busyId === s.id} onClick={() => review(s.id, "reject")} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">
                            <XCircle size={12} /> Reject
                          </button>
                        </div>
                      )}
                      {s.status === "approved" && reviewingId !== s.id && (
                        <div className="flex justify-end">
                          <button onClick={() => setReviewingId(s.id)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                            <Clock size={12} /> Process
                          </button>
                        </div>
                      )}
                      {s.status === "approved" && reviewingId === s.id && (
                        <div className="flex flex-col items-end gap-1.5">
                          <input placeholder="Payment method" value={reviewMeta.paymentMethod} onChange={(e) => setReviewMeta((m) => ({ ...m, paymentMethod: e.target.value }))} className="text-xs px-2 py-1 rounded border border-gray-200 w-36" />
                          <input placeholder="Transaction ID" value={reviewMeta.transactionId} onChange={(e) => setReviewMeta((m) => ({ ...m, transactionId: e.target.value }))} className="text-xs px-2 py-1 rounded border border-gray-200 w-36" />
                          <div className="flex gap-1">
                            <button disabled={busyId === s.id} onClick={() => review(s.id, "complete")} className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">Confirm</button>
                            <button onClick={() => setReviewingId(null)} className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-gray-200">Cancel</button>
                          </div>
                        </div>
                      )}
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

function CommissionRulesPanel() {
  const adminKey = useAdminKey();
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"global" | "category" | "vendor">("global");
  const [category, setCategory] = useState("paithani");
  const [vendorId, setVendorId] = useState("");
  const [rate, setRate] = useState("10");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  function load() {
    if (!adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/financial/commission-rules`, { headers: { "x-admin-key": adminKey }, credentials: "include" })
      .then((r) => r.json())
      .then((d) => setRules(d.rules ?? []))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [adminKey]);

  async function createRule() {
    setCreating(true);
    setError("");
    try {
      const rateNum = parseFloat(rate) / 100;
      const r = await fetch(`${basePath}/api/admin/financial/commission-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({ scope, category: scope === "category" ? category : undefined, vendorId: scope === "vendor" ? vendorId : undefined, rate: rateNum }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      setVendorId("");
      load();
    } catch (e: any) {
      setError(e.message ?? "Failed to create rule");
    } finally {
      setCreating(false);
    }
  }

  async function deactivate(id: string) {
    await fetch(`${basePath}/api/admin/financial/commission-rules/${id}/deactivate`, {
      method: "POST",
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Create Commission Rule</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Scope</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
              <option value="global">Global (default)</option>
              <option value="category">Category</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>
          {scope === "category" && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
                <option value="paithani">Paithani</option>
                <option value="designer">Designer</option>
              </select>
            </div>
          )}
          {scope === "vendor" && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Vendor ID</label>
              <input value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="vendor UUID" className="text-xs px-2 py-2 rounded-lg border border-gray-200 w-56" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Rate (%)</label>
            <input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 w-24" />
          </div>
          <button onClick={createRule} disabled={creating || (scope === "vendor" && !vendorId)} className="text-xs font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: NAVY }}>
            {creating ? "Saving…" : "Create Rule"}
          </button>
        </div>
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
        <p className="text-xs text-gray-400 mt-3">Precedence: vendor-specific &gt; category &gt; global. Default flat commission is 10% until an active rule overrides it.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>Active & Past Rules</h3>
        </div>
        {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
        {!loading && rules.length === 0 && <div className="py-10 text-center text-sm text-gray-400">No custom commission rules yet — flat 10% applies platform-wide.</div>}
        {!loading && rules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Scope</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Target</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Rate</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3.5 capitalize font-semibold" style={{ color: NAVY }}>{r.scope}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">{r.scope === "category" ? r.category : r.scope === "vendor" ? r.vendorName : "All vendors"}</td>
                    <td className="px-4 py-3.5 text-right font-semibold" style={{ color: NAVY }}>{(r.rate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: r.active ? "#f0fdf4" : "#f3f4f6", color: r.active ? "#15803d" : "#9ca3af" }}>
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {r.active && (
                        <button onClick={() => deactivate(r.id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Deactivate</button>
                      )}
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

function useDateFilters() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [from, to]);
  const filterBar = (
    <div className="flex gap-2">
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
    </div>
  );
  return { query, filterBar };
}

function RevenueReportPanel() {
  const adminKey = useAdminKey();
  const { query, filterBar } = useDateFilters();
  const [data, setData] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/financial/reports/revenue?${query}`, { headers: { "x-admin-key": adminKey }, credentials: "include" })
      .then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [adminKey, query]);

  async function exportPdf() {
    if (!data) return;
    setExporting("pdf");
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
      doc.setFontSize(16); doc.text("Revenue Report", 14, 14);
      doc.setFontSize(9); doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, 14, 20);
      autoTable(doc, {
        startY: 26,
        head: [["Order", "Date", "Total", "Tax", "Shipping", "Commission", "Vendor Revenue", "Payment"]],
        body: data.rows.map((r) => [r.orderId.slice(0, 8), new Date(r.date).toLocaleDateString("en-IN"), fmt(r.total), fmt(r.tax), fmt(r.shipping), fmt(r.commission), fmt(r.vendorRevenue), r.paymentMethod]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
      });
      doc.save(`revenue-report-${Date.now()}.pdf`);
    } finally { setExporting(null); }
  }

  async function exportExcel() {
    if (!data) return;
    setExporting("excel");
    try {
      const ws = XLSX.utils.json_to_sheet(data.rows.map((r) => ({ Order: r.orderId, Date: r.date, Total: r.total, Tax: r.tax, Shipping: r.shipping, Commission: r.commission, "Vendor Revenue": r.vendorRevenue, Payment: r.paymentMethod })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Revenue Report");
      XLSX.writeFile(wb, `revenue-report-${Date.now()}.xlsx`);
    } finally { setExporting(null); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        {filterBar}
        <div className="flex gap-2">
          <button onClick={exportPdf} disabled={exporting !== null || !data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
          <button onClick={exportExcel} disabled={exporting !== null || !data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={13} /> Excel
          </button>
        </div>
      </div>
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Gross Revenue</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{fmt(data.summary.grossRevenue)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Net Revenue</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{fmt(data.summary.netRevenue)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Platform Commission</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{fmt(data.summary.platformRevenue)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Vendor Revenue</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{fmt(data.summary.vendorRevenue)}</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Order</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Total</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Commission</th>
                    <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Vendor Rev.</th>
                    <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.rows.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-xs text-gray-400">No orders in this range</td></tr>}
                  {data.rows.map((r) => (
                    <tr key={r.orderId} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3 text-xs text-gray-500">{r.orderId.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-xs text-gray-400">{new Date(r.date).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{fmt(r.total)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(r.commission)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-600">{fmt(r.vendorRevenue)}</td>
                      <td className="px-4 py-3 text-xs capitalize text-gray-500">{r.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PaymentReportPanel() {
  const adminKey = useAdminKey();
  const { query, filterBar } = useDateFilters();
  const [data, setData] = useState<PaymentReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/financial/reports/payments?${query}`, { headers: { "x-admin-key": adminKey }, credentials: "include" })
      .then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [adminKey, query]);

  return (
    <div className="space-y-4">
      {filterBar}
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5"><CheckCircle size={12} className="text-emerald-500" /> Successful</span>
              <div className="text-lg font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.successfulAmount)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.successfulCount} transactions</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5"><Clock size={12} className="text-amber-500" /> Pending</span>
              <div className="text-lg font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.pendingAmount)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.pendingCount} transactions</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5"><XCircle size={12} className="text-red-500" /> Failed</span>
              <div className="text-lg font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.failedAmount)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.failedCount} transactions</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Payment Method Breakdown</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.methodBreakdown.map((m) => ({ method: m.method, amount: m.amount }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="method" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="amount" fill={GOLD} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

function RefundReportPanel() {
  const adminKey = useAdminKey();
  const { query, filterBar } = useDateFilters();
  const [data, setData] = useState<RefundReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/financial/reports/refunds?${query}`, { headers: { "x-admin-key": adminKey }, credentials: "include" })
      .then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [adminKey, query]);

  return (
    <div className="space-y-4">
      {filterBar}
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Total Requests</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{data.totalRequests}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Refund Amount</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{fmt(data.totalRefundAmount)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Approved / Rejected</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{data.approvedCount} / {data.rejectedCount}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Avg Processing</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{data.avgProcessingHours}h</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold mb-3" style={{ color: NAVY }}>Return Reasons</h3>
            <div className="space-y-2">
              {data.reasons.length === 0 && <div className="text-xs text-gray-400">No returns in this range</div>}
              {data.reasons.map((r) => (
                <div key={r.reason} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{r.reason}</span>
                  <span className="font-semibold" style={{ color: NAVY }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProfitAnalysisPanel() {
  const adminKey = useAdminKey();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [data, setData] = useState<ProfitAnalysis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/financial/profit-analysis?period=${period}`, { headers: { "x-admin-key": adminKey }, credentials: "include" })
      .then((r) => r.json()).then(setData).finally(() => setLoading(false));
  }, [adminKey, period]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
        {(["daily", "weekly", "monthly", "yearly"] as const).map((p) => (
          <button key={p} onClick={() => setPeriod(p)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors"
            style={{ background: period === p ? NAVY : "transparent", color: period === p ? "white" : "#6b7280" }}>
            {p}
          </button>
        ))}
      </div>
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Gross Profit</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.grossProfit)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Net Profit</span>
              <div className="text-xl font-serif font-bold mt-2 flex items-center gap-1.5" style={{ color: NAVY }}>
                {fmt(data.netProfit)}
                <span className={`inline-flex items-center text-xs font-semibold ${data.profitGrowthPercent >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {data.profitGrowthPercent >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {Math.abs(data.profitGrowthPercent).toFixed(1)}%
                </span>
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Commission Earnings</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.commissionEarnings)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Vendor Settlements Paid</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.vendorSettlementsPaid)}</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Monthly Profit</h3>
            {data.monthlyProfit.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-gray-400">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.monthlyProfit}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="profit" fill={GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FinancialManagementContent() {
  const [tab, setTab] = useState<TabKey>("settlements");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <Receipt size={20} style={{ color: GOLD }} /> Financial Management
        </h1>
        <p className="text-sm text-gray-400 mt-0.5">Settlements, commission rules, revenue &amp; profit reporting</p>
      </div>

      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors"
            style={{ background: tab === key ? NAVY : "transparent", color: tab === key ? "white" : "#6b7280" }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      {tab === "settlements" && <SettlementsPanel />}
      {tab === "commission" && <CommissionRulesPanel />}
      {tab === "revenue" && <RevenueReportPanel />}
      {tab === "payments" && <PaymentReportPanel />}
      {tab === "refunds" && <RefundReportPanel />}
      {tab === "profit" && <ProfitAnalysisPanel />}
    </div>
  );
}

export default function AdminFinancialManagement() {
  return (
    <AdminGuard>
      <AdminLayout>
        <FinancialManagementContent />
      </AdminLayout>
    </AdminGuard>
  );
}
