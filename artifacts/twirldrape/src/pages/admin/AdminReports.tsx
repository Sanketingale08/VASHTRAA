import React, { useEffect, useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, IndianRupee, ShoppingBag, Users, Store,
  RotateCcw, Package, Download, FileSpreadsheet, FileText, Printer,
  BarChart2, RefreshCw, Copy, ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
import { adminHeaders, adminKey as getAdminKey } from '@/lib/adminApi';
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";
const PIE_COLORS = [GOLD, "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4", "#84CC16"];

function fmt(n: number) {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtDate(d: string) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/** RFC 4180-compliant CSV cell escaping. */
function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvEscape).join(",")).join("\n");
}

function useAdminKey() { return getAdminKey(); }

// ── Period selector ───────────────────────────────────────────────────────────
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "monthly", label: "This Month" },
  { key: "quarterly", label: "This Quarter" },
  { key: "yearly", label: "This Year" },
  { key: "custom", label: "Custom" },
] as const;
type Period = typeof PERIODS[number]["key"];

interface PeriodFilterProps {
  period: Period;
  from: string;
  to: string;
  onChange: (p: Period, from: string, to: string) => void;
  onRefresh: () => void;
  onCopyLink: () => void;
  loading?: boolean;
}

function PeriodFilter({ period, from, to, onChange, onRefresh, onCopyLink, loading }: PeriodFilterProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => onChange(p.key, from, to)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-all"
            style={{
              background: period === p.key ? NAVY : "white",
              color: period === p.key ? GOLD : "#6B7280",
              border: period === p.key ? `1px solid ${NAVY}` : "1px solid #E5E7EB",
            }}
          >
            {p.label}
          </button>
        ))}
      </div>
      {period === "custom" && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={from}
            onChange={(e) => onChange("custom", e.target.value, to)}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={to}
            onChange={(e) => onChange("custom", from, e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg border border-gray-200"
          />
        </div>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
      >
        <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Refresh
      </button>
      <button
        onClick={onCopyLink}
        className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"
      >
        <Copy size={12} /> Copy link
      </button>
    </div>
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  sub?: string;
  trend?: number;
}

function KpiCard({ label, value, icon: Icon, iconBg, iconColor, sub, trend }: KpiCardProps) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400 leading-tight">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>
      </div>
      <div className="text-2xl font-serif font-bold" style={{ color: NAVY }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
      {trend !== undefined && (
        <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
          {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          {trend >= 0 ? "+" : ""}{trend}% vs prev period
        </div>
      )}
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    delivered: { bg: "#f0fdf4", color: "#15803d" },
    confirmed: { bg: "#fffbeb", color: "#b45309" },
    dispatched: { bg: "#eff6ff", color: "#1d4ed8" },
    cancelled: { bg: "#fef2f2", color: "#b91c1c" },
    returned: { bg: "#fdf4ff", color: "#7e22ce" },
    return_requested: { bg: "#fdf4ff", color: "#7e22ce" },
    return_rejected: { bg: "#fef2f2", color: "#b91c1c" },
    pending: { bg: "#fffbeb", color: "#b45309" },
    approved: { bg: "#f0fdf4", color: "#15803d" },
    completed: { bg: "#f0fdf4", color: "#15803d" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span className="inline-flex text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: s.bg, color: s.color }}>
      {status?.replace(/_/g, " ") ?? "—"}
    </span>
  );
}

// ── Export bar ────────────────────────────────────────────────────────────────
interface ExportBarProps {
  onPdf: () => void;
  onExcel: () => void;
  onCsv: () => void;
  disabled?: boolean;
  children?: React.ReactNode;
}

function ExportBar({ onPdf, onExcel, onCsv, disabled, children }: ExportBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <div className="flex items-center gap-2 ml-auto">
        <button onClick={onPdf} disabled={disabled} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
          <Download size={13} /> PDF
        </button>
        <button onClick={onExcel} disabled={disabled} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
          <FileSpreadsheet size={13} /> Excel
        </button>
        <button onClick={onCsv} disabled={disabled} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
          <FileText size={13} /> CSV
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          <Printer size={13} /> Print
        </button>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
        <ChevronLeft size={16} />
      </button>
      <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
      <button disabled={page >= totalPages} onClick={() => onChange(page + 1)} className="p-1 rounded hover:bg-gray-100 disabled:opacity-30">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton({ count = 4, className = "h-28" }: { count?: number; className?: string }) {
  return (
    <div className={`grid grid-cols-2 lg:grid-cols-4 gap-4`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className={`bg-white rounded-2xl border border-gray-200 animate-pulse ${className}`} />
      ))}
    </div>
  );
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{msg}</div>;
}

// ── REVENUE TAB ───────────────────────────────────────────────────────────────
const REPORTS_POLL_MS = 60_000;

function RevenueTab({ period, from, to }: { period: Period; from: string; to: string }) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    setError("");
    const q = new URLSearchParams({ period, ...(period === "custom" && from ? { from } : {}), ...(period === "custom" && to ? { to } : {}) });
    fetch(`${basePath}/api/admin/reports/revenue?${q}`, { headers: adminHeaders(), credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e: any) => setError(`Failed to load revenue report${e?.message ? `: ${e.message}` : ""}`))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  // Immediate fetch when load identity changes (period / date range changed).
  useEffect(() => { load(); }, [load]);
  // Background polling every 60 s, paused while tab is hidden.
  useVisibilityPolling(load, REPORTS_POLL_MS, { fireOnMount: false });

  const s = data?.summary ?? {};
  const trend = data?.trend ?? [];
  const prevTrend: any[] = data?.prevTrend ?? [];

  // Merge prior-period revenue into each current-period data point by index
  // so the chart can draw both lines on the same x-axis positions.
  const mergedTrend = trend.map((r: any, i: number) => ({
    ...r,
    prevRevenue: prevTrend[i]?.revenue ?? null,
  }));

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Revenue Report", 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Metric", "Value"]],
      body: [
        ["Total Orders", s.totalOrders],
        ["Gross Revenue", fmt(s.grossRevenue)],
        ["Net Revenue", fmt(s.netRevenue)],
        ["Platform Commission", fmt(s.commission)],
        ["Vendor Earnings", fmt(s.vendorEarnings)],
        ["Refund Amount", fmt(s.refundAmount)],
        ["Tax Collected", fmt(s.taxCollected)],
        ["Shipping Collected", fmt(s.shippingCollected)],
        ["Avg Order Value", fmt(s.avgOrderValue)],
        ["Revenue Growth", `${s.growthPct}%`],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`revenue-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet([
      { Metric: "Total Orders", Value: s.totalOrders },
      { Metric: "Gross Revenue", Value: s.grossRevenue },
      { Metric: "Net Revenue", Value: s.netRevenue },
      { Metric: "Commission", Value: s.commission },
      { Metric: "Vendor Earnings", Value: s.vendorEarnings },
      { Metric: "Refund Amount", Value: s.refundAmount },
      { Metric: "Tax Collected", Value: s.taxCollected },
      { Metric: "Shipping Collected", Value: s.shippingCollected },
      { Metric: "Avg Order Value", Value: s.avgOrderValue },
    ]);
    const ws2 = XLSX.utils.json_to_sheet(trend);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    XLSX.utils.book_append_sheet(wb, ws2, "Trend");
    XLSX.writeFile(wb, `revenue-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [["Date", "Orders", "Revenue"], ...trend.map((r: any) => [r.date, r.orders, r.revenue])];
    const a = document.createElement("a");
    a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `revenue-trend-${Date.now()}.csv`;
    a.click();
  }

  if (loading) return <Skeleton count={10} />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Orders" value={s.totalOrders?.toLocaleString("en-IN") ?? 0} icon={ShoppingBag} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Gross Revenue" value={fmt(s.grossRevenue ?? 0)} icon={IndianRupee} iconBg="rgba(201,168,76,0.12)" iconColor={GOLD} trend={s.growthPct} />
        <KpiCard label="Net Revenue" value={fmt(s.netRevenue ?? 0)} icon={TrendingUp} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Platform Commission" value={fmt(s.commission ?? 0)} icon={BarChart2} iconBg="rgba(13,27,54,0.08)" iconColor={NAVY} />
        <KpiCard label="Vendor Earnings" value={fmt(s.vendorEarnings ?? 0)} icon={Store} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Refund Amount" value={fmt(s.refundAmount ?? 0)} icon={RotateCcw} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
        <KpiCard label="Tax Collected" value={fmt(s.taxCollected ?? 0)} icon={FileText} iconBg="rgba(16,185,129,0.08)" iconColor="#10B981" />
        <KpiCard label="Shipping Collected" value={fmt(s.shippingCollected ?? 0)} icon={Package} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" />
        <KpiCard label="Avg Order Value" value={fmt(s.avgOrderValue ?? 0)} icon={IndianRupee} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Revenue Growth" value={`${s.growthPct >= 0 ? "+" : ""}${s.growthPct ?? 0}%`} icon={s.growthPct >= 0 ? TrendingUp : TrendingDown} iconBg={s.growthPct >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"} iconColor={s.growthPct >= 0 ? "#10B981" : "#EF4444"} sub="vs prior period" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Revenue Trend</h3>
          {trend.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data for this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mergedTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={56} />
                <Tooltip
                  formatter={(v: number, name: string) => [fmt(v), name === "revenue" ? "This Period" : "Prior Period"]}
                  labelFormatter={fmtDate}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "revenue" ? "This Period" : "Prior Period"} />
                <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: GOLD }} name="revenue" />
                <Line type="monotone" dataKey="prevRevenue" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 3" dot={false} activeDot={{ r: 3, fill: "#9CA3AF" }} name="prevRevenue" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Revenue Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={[{ name: "Platform", value: s.commission ?? 0 }, { name: "Vendors", value: s.vendorEarnings ?? 0 }, { name: "Refunds", value: s.refundAmount ?? 0 }]} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={52} />
              <Tooltip formatter={(v: number) => [fmt(v)]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {[GOLD, "#8B5CF6", "#EF4444"].map((c, i) => <Cell key={i} fill={c} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Data table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={trend.length === 0}>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Revenue by Period</h3>
          </ExportBar>
        </div>
        {trend.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">No revenue data for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Orders</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {trend.map((r: any) => (
                  <tr key={r.date} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-medium" style={{ color: NAVY }}>{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{Number(r.orders).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{fmt(Number(r.revenue))}</td>
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

// ── SALES TAB ─────────────────────────────────────────────────────────────────
function SalesTab({ period, from, to }: { period: Period; from: string; to: string }) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true); setError("");
    const q = new URLSearchParams({ period, page: String(page), ...(period === "custom" && from ? { from } : {}), ...(period === "custom" && to ? { to } : {}) });
    fetch(`${basePath}/api/admin/reports/sales?${q}`, { headers: adminHeaders(), credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setData).catch((e: any) => setError(`Failed to load sales report${e?.message ? `: ${e.message}` : ""}`)).finally(() => setLoading(false));
  }, [adminKey, period, from, to, page]);

  // Immediate fetch when load identity changes (period / date range changed).
  useEffect(() => { load(); }, [load]);
  // Background polling every 60 s, paused while tab is hidden.
  useVisibilityPolling(load, REPORTS_POLL_MS, { fireOnMount: false });

  const s = data?.summary ?? {};
  const byCategory = data?.byCategory ?? [];
  const byMethod = data?.byPaymentMethod ?? [];
  const trend = data?.trend ?? [];
  const prevTrend: any[] = data?.prevTrend ?? [];
  const mergedTrend = trend.map((r: any, i: number) => ({
    ...r,
    prevRevenue: prevTrend[i]?.revenue ?? null,
  }));
  const orders = (data?.orders ?? []).filter((o: any) =>
    !search || o.id?.toLowerCase().includes(search.toLowerCase()) || o.status?.includes(search.toLowerCase())
  );

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Sales Report", 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Order ID", "Date", "Total", "Status", "Payment Method", "Items"]],
      body: (data?.orders ?? []).map((o: any) => [o.id, fmtDate(o.date), fmt(o.total), o.status, o.paymentMethod, o.itemCount]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`sales-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet((data?.orders ?? []).map((o: any) => ({
      "Order ID": o.id, Date: o.date, Total: o.total, Status: o.status, "Payment Method": o.paymentMethod, Items: o.itemCount,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Orders");
    XLSX.writeFile(wb, `sales-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [["Order ID", "Date", "Total", "Status", "Payment Method", "Items"],
      ...(data?.orders ?? []).map((o: any) => [o.id, o.date, o.total, o.status, o.paymentMethod, o.itemCount])];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `sales-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <Skeleton count={4} />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Orders" value={(s.totalOrders ?? 0).toLocaleString("en-IN")} icon={ShoppingBag} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Items Sold" value={(s.totalItemsSold ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Sales Revenue" value={fmt(s.salesRevenue ?? 0)} icon={IndianRupee} iconBg="rgba(201,168,76,0.12)" iconColor={GOLD} />
        <KpiCard label="Avg Order Value" value={fmt(s.avgOrderValue ?? 0)} icon={TrendingUp} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Daily Sales Trend</h3>
          {trend.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={mergedTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={56} />
                <Tooltip
                  formatter={(v: number, n: string) => {
                    if (n === "revenue") return [fmt(v), "This Period"];
                    if (n === "prevRevenue") return [fmt(v), "Prior Period"];
                    return [v, "Orders"];
                  }}
                  labelFormatter={fmtDate}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} formatter={(v) => v === "revenue" ? "This Period" : v === "prevRevenue" ? "Prior Period" : "Orders"} />
                <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} dot={false} name="revenue" />
                <Line type="monotone" dataKey="prevRevenue" stroke="#9CA3AF" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="prevRevenue" connectNulls />
                <Line type="monotone" dataKey="orders" stroke="#3B82F6" strokeWidth={1.5} dot={false} name="orders" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-serif font-bold text-sm mb-3" style={{ color: NAVY }}>By Category</h3>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart><Pie data={byCategory.map((r: any) => ({ name: r.category, value: r.revenue }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                {byCategory.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip formatter={(v: number) => [fmt(v)]} contentStyle={{ fontSize: 11, borderRadius: 8 }} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-serif font-bold text-sm mb-3" style={{ color: NAVY }}>By Payment Method</h3>
            {byMethod.length === 0 ? <div className="text-xs text-gray-400">No data</div> : (
              <div className="space-y-2">
                {byMethod.map((m: any) => (
                  <div key={m.method} className="flex items-center justify-between text-xs">
                    <span className="font-medium capitalize" style={{ color: NAVY }}>{m.method?.replace(/_/g, " ") || "Unknown"}</span>
                    <span className="text-gray-500">{m.count} orders · {fmt(m.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 space-y-3">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={(data?.orders?.length ?? 0) === 0}>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Order List</h3>
          </ExportBar>
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by order ID or status…" className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg" />
          </div>
        </div>
        {orders.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No orders found.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Order</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Total</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Payment</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Items</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {orders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: NAVY }}>{o.id?.slice(0, 16)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(o.date)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-sm" style={{ color: NAVY }}>{fmt(o.total)}</td>
                    <td className="px-4 py-3"><StatusPill status={o.status} /></td>
                    <td className="px-4 py-3 text-xs capitalize text-gray-500">{o.paymentMethod?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-4 py-3 text-right text-xs text-gray-500">{o.itemCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} totalPages={data?.totalPages ?? 1} onChange={setPage} />
      </div>
    </div>
  );
}

// ── VENDOR TAB ────────────────────────────────────────────────────────────────
function VendorTab({ period, from, to }: { period: Period; from: string; to: string }) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true); setError("");
    const q = new URLSearchParams({ period, ...(period === "custom" && from ? { from } : {}), ...(period === "custom" && to ? { to } : {}) });
    fetch(`${basePath}/api/admin/reports/vendors?${q}`, { headers: adminHeaders(), credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setData).catch((e: any) => setError(`Failed to load vendor report${e?.message ? `: ${e.message}` : ""}`)).finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  // Immediate fetch when load identity changes (period / date range changed).
  useEffect(() => { load(); }, [load]);
  // Background polling every 60 s, paused while tab is hidden.
  useVisibilityPolling(load, REPORTS_POLL_MS, { fireOnMount: false });

  const s = data?.summary ?? {};
  const top = data?.topVendors ?? [];
  const ss = data?.settlementSummary ?? {};

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Vendor Report", 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Vendor", "Settlements", "Revenue", "Commission", "Net Payout", "Pending"]],
      body: top.map((v: any) => [v.vendorName, v.settlementCount, fmt(v.totalRevenue), fmt(v.commission), fmt(v.netPayout), v.pendingSettlements]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`vendor-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(top.map((v: any) => ({ Vendor: v.vendorName, Settlements: v.settlementCount, Revenue: v.totalRevenue, Commission: v.commission, "Net Payout": v.netPayout, Pending: v.pendingSettlements })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, `vendor-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [["Vendor", "Revenue", "Commission", "Net Payout", "Pending Settlements"],
      ...top.map((v: any) => [v.vendorName, v.totalRevenue, v.commission, v.netPayout, v.pendingSettlements])];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `vendor-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <Skeleton count={4} />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Vendors" value={s.totalVendors ?? 0} icon={Store} iconBg="rgba(13,27,54,0.08)" iconColor={NAVY} />
        <KpiCard label="Active Vendors" value={s.activeVendors ?? 0} icon={Store} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Pending Approval" value={s.pendingVendors ?? 0} icon={Store} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" />
        <KpiCard label="Suspended" value={s.suspendedVendors ?? 0} icon={Store} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pending Settlements" value={ss.pendingCount ?? 0} icon={IndianRupee} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" sub={fmt(ss.pendingAmount ?? 0)} />
        <KpiCard label="Completed Settlements" value={ss.completedCount ?? 0} icon={IndianRupee} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" sub={fmt(ss.completedAmount ?? 0)} />
      </div>

      {top.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Top Vendors by Revenue</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={top.slice(0, 10).map((v: any) => ({ name: v.vendorName?.slice(0, 14), revenue: v.totalRevenue, commission: v.commission }))} margin={{ top: 5, right: 5, bottom: 40, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} angle={-35} textAnchor="end" interval={0} />
              <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={56} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v), n === "revenue" ? "Revenue" : "Commission"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
              <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} name="revenue" />
              <Bar dataKey="commission" fill="#3B82F6" radius={[4, 4, 0, 0]} name="commission" />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={top.length === 0}>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Vendor Performance</h3>
          </ExportBar>
        </div>
        {top.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No vendor data for this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Vendor</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Settlements</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Revenue</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Commission</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Net Payout</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Pending</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {top.map((v: any) => (
                  <tr key={v.vendorId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-semibold" style={{ color: NAVY }}>{v.vendorName}</td>
                    <td className="px-4 py-3 text-right text-gray-600">{v.settlementCount}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{fmt(v.totalRevenue)}</td>
                    <td className="px-4 py-3 text-right text-red-500">-{fmt(v.commission)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-700">{fmt(v.netPayout)}</td>
                    <td className="px-4 py-3 text-right">{v.pendingSettlements > 0 ? <span className="text-amber-600 font-semibold">{v.pendingSettlements}</span> : <span className="text-gray-400">0</span>}</td>
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

// ── CUSTOMER TAB ──────────────────────────────────────────────────────────────
function CustomerTab({ period, from, to }: { period: Period; from: string; to: string }) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true); setError("");
    const q = new URLSearchParams({ period, ...(period === "custom" && from ? { from } : {}), ...(period === "custom" && to ? { to } : {}) });
    fetch(`${basePath}/api/admin/reports/customers?${q}`, { headers: adminHeaders(), credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setData).catch((e: any) => setError(`Failed to load customer report${e?.message ? `: ${e.message}` : ""}`)).finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  // Immediate fetch when load identity changes (period / date range changed).
  useEffect(() => { load(); }, [load]);
  // Background polling every 60 s, paused while tab is hidden.
  useVisibilityPolling(load, REPORTS_POLL_MS, { fireOnMount: false });

  const s = data?.summary ?? {};
  const trend = data?.trend ?? [];
  const topCustomers = data?.topCustomers ?? [];

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFontSize(16); doc.text("Customer Report", 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Customer ID", "Total Orders", "Total Spend", "Avg Spend"]],
      body: topCustomers.map((c: any) => [c.userId?.slice(0, 20), c.totalOrders, fmt(c.totalSpend), fmt(c.avgSpend)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`customer-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(topCustomers.map((c: any) => ({ "Customer ID": c.userId, Orders: c.totalOrders, "Total Spend": c.totalSpend, "Avg Spend": c.avgSpend })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `customer-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [["Customer ID", "Orders", "Total Spend", "Avg Spend"],
      ...topCustomers.map((c: any) => [c.userId, c.totalOrders, c.totalSpend, c.avgSpend])];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `customer-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <Skeleton count={5} />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Customers" value={(s.totalCustomers ?? 0).toLocaleString("en-IN")} icon={Users} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
        <KpiCard label="New Customers" value={(s.newCustomers ?? 0).toLocaleString("en-IN")} icon={Users} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Returning" value={(s.returningCustomers ?? 0).toLocaleString("en-IN")} icon={Users} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Avg Spend" value={fmt(s.avgSpend ?? 0)} icon={IndianRupee} iconBg="rgba(201,168,76,0.12)" iconColor={GOLD} />
        <KpiCard label="Avg Orders / Customer" value={Number(s.avgOrdersPerCustomer ?? 0).toFixed(1)} icon={ShoppingBag} iconBg="rgba(13,27,54,0.08)" iconColor={NAVY} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Customer & Order Trend</h3>
          {trend.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} width={36} />
                <Tooltip labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Line type="monotone" dataKey="customers" stroke={GOLD} strokeWidth={2} dot={false} name="Customers" />
                <Line type="monotone" dataKey="orders" stroke="#8B5CF6" strokeWidth={1.5} dot={false} name="Orders" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>New vs Returning</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart><Pie data={[{ name: "New", value: s.newCustomers ?? 0 }, { name: "Returning", value: s.returningCustomers ?? 0 }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
              <Cell fill={GOLD} /><Cell fill="#8B5CF6" />
            </Pie><Tooltip formatter={(v: number) => [v, ""]} contentStyle={{ fontSize: 11, borderRadius: 8 }} /></PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={topCustomers.length === 0}>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Top Customers by Spend</h3>
          </ExportBar>
        </div>
        {topCustomers.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No customer data for this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Customer ID</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Orders</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Total Spend</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Avg Spend</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {topCustomers.map((c: any, i: number) => (
                  <tr key={c.userId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs font-bold text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-mono text-xs" style={{ color: NAVY }}>{c.userId?.slice(0, 20)}…</td>
                    <td className="px-4 py-3 text-right text-gray-600">{c.totalOrders}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{fmt(c.totalSpend)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmt(c.avgSpend)}</td>
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

// ── PRODUCT TAB ───────────────────────────────────────────────────────────────
function ProductTab({ period, from, to }: { period: Period; from: string; to: string }) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true); setError("");
    const q = new URLSearchParams({ period, ...(period === "custom" && from ? { from } : {}), ...(period === "custom" && to ? { to } : {}) });
    fetch(`${basePath}/api/admin/reports/products?${q}`, { headers: adminHeaders(), credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setData).catch((e: any) => setError(`Failed to load product report${e?.message ? `: ${e.message}` : ""}`)).finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  // Immediate fetch when load identity changes (period / date range changed).
  useEffect(() => { load(); }, [load]);
  // Background polling every 60 s, paused while tab is hidden.
  useVisibilityPolling(load, REPORTS_POLL_MS, { fireOnMount: false });

  const s = data?.summary ?? {};
  const bestSellers = data?.bestSellers ?? [];
  const mostWishlisted = data?.mostWishlisted ?? [];
  const byCategory = data?.byCategory ?? [];
  const lowStockList = data?.lowStockList ?? [];

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Product Report", 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Product", "Category", "Vendor", "Units Sold", "Revenue"]],
      body: bestSellers.map((p: any) => [p.name, p.category, p.vendorName, p.unitsSold, fmt(p.revenue)]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`product-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(bestSellers.map((p: any) => ({ Product: p.name, Category: p.category, Vendor: p.vendorName, "Units Sold": p.unitsSold, Revenue: p.revenue })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Best Sellers");
    XLSX.writeFile(wb, `product-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [["Product", "Category", "Units Sold", "Revenue"],
      ...bestSellers.map((p: any) => [p.name, p.category, p.unitsSold, p.revenue])];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `product-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <Skeleton count={7} />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Products" value={(s.total ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(13,27,54,0.08)" iconColor={NAVY} />
        <KpiCard label="Active" value={(s.active ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Pending Approval" value={(s.pending ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" />
        <KpiCard label="Featured" value={(s.featured ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(201,168,76,0.12)" iconColor={GOLD} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Rejected" value={s.rejected ?? 0} icon={Package} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
        <KpiCard label="Low Stock" value={s.lowStock ?? 0} icon={Package} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" sub="Above 0, below threshold" />
        <KpiCard label="Out of Stock" value={s.outOfStock ?? 0} icon={Package} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Best Selling Products</h3>
          {bestSellers.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No sales data for this period</div> : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bestSellers.map((p: any) => ({ name: p.name?.slice(0, 18), units: p.unitsSold, revenue: p.revenue }))} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#6B7280" }} width={140} />
                <Tooltip formatter={(v: number, n: string) => [n === "units" ? `${v} units` : fmt(v)]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Bar dataKey="units" fill={GOLD} radius={[0, 4, 4, 0]} name="units" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-serif font-bold text-sm mb-3" style={{ color: NAVY }}>By Category</h3>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart><Pie data={byCategory.map((r: any) => ({ name: r.category, value: r.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                {byCategory.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} /></PieChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
            <h3 className="font-serif font-bold text-sm mb-3" style={{ color: NAVY }}>Most Wishlisted</h3>
            {mostWishlisted.length === 0 ? <div className="text-xs text-gray-400">No wishlist data</div> : (
              <div className="space-y-2">
                {mostWishlisted.slice(0, 5).map((p: any) => (
                  <div key={p.productId} className="flex items-center justify-between text-xs">
                    <span className="font-medium truncate max-w-[140px]" style={{ color: NAVY }}>{p.name || p.productId?.slice(0, 12)}</span>
                    <span className="text-gray-400 shrink-0">{p.wishlistCount} ❤</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={bestSellers.length === 0}>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Best Sellers Table</h3>
          </ExportBar>
        </div>
        {bestSellers.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No sales in this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">#</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Product</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Category</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Vendor</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Units</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Revenue</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {bestSellers.map((p: any, i: number) => (
                  <tr key={p.productId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs font-bold text-gray-400">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold max-w-[220px] truncate" style={{ color: NAVY }}>{p.name || p.productId}</td>
                    <td className="px-4 py-3 capitalize text-xs text-gray-500">{p.category}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{p.vendorName || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{p.unitsSold}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {lowStockList.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-amber-200">
            <h3 className="text-sm font-bold text-amber-800">⚠ Low Stock Alert ({lowStockList.length} products)</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-amber-200">
                <th className="px-4 py-2 text-left text-xs font-bold text-amber-600 uppercase">Product</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-amber-600 uppercase">Category</th>
                <th className="px-4 py-2 text-left text-xs font-bold text-amber-600 uppercase">Vendor</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-amber-600 uppercase">Stock</th>
                <th className="px-4 py-2 text-right text-xs font-bold text-amber-600 uppercase">Threshold</th>
              </tr></thead>
              <tbody className="divide-y divide-amber-100">
                {lowStockList.map((p: any) => (
                  <tr key={p.id} className="hover:bg-amber-100/40">
                    <td className="px-4 py-2.5 font-medium text-amber-900 truncate max-w-[200px]">{p.name}</td>
                    <td className="px-4 py-2.5 capitalize text-xs text-amber-700">{p.category}</td>
                    <td className="px-4 py-2.5 text-xs text-amber-700">{p.vendorName || "—"}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-amber-800">{p.stock}</td>
                    <td className="px-4 py-2.5 text-right text-amber-600">{p.threshold}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── RETURN TAB ────────────────────────────────────────────────────────────────
function ReturnTab({ period, from, to }: { period: Period; from: string; to: string }) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true); setError("");
    const q = new URLSearchParams({ period, ...(period === "custom" && from ? { from } : {}), ...(period === "custom" && to ? { to } : {}) });
    fetch(`${basePath}/api/admin/reports/returns?${q}`, { headers: adminHeaders(), credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(setData).catch((e: any) => setError(`Failed to load return report${e?.message ? `: ${e.message}` : ""}`)).finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  // Immediate fetch when load identity changes (period / date range changed).
  useEffect(() => { load(); }, [load]);
  // Background polling every 60 s, paused while tab is hidden.
  useVisibilityPolling(load, REPORTS_POLL_MS, { fireOnMount: false });

  const s = data?.summary ?? {};
  const trend = data?.trend ?? [];
  const byReason = data?.byReason ?? [];
  const recentReturns = data?.recentReturns ?? [];
  const topReturnedProducts = data?.topReturnedProducts ?? [];

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Return & Refund Report", 14, 14);
    autoTable(doc, {
      startY: 22,
      head: [["Order ID", "Date", "Total", "Status", "Return Reason", "Refund Status"]],
      body: recentReturns.map((r: any) => [r.orderId?.slice(0, 16), fmtDate(r.date), fmt(r.total), r.status, r.returnReason || "—", r.refundStatus || "—"]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`return-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(recentReturns.map((r: any) => ({ "Order ID": r.orderId, Date: r.date, Total: r.total, Status: r.status, "Return Reason": r.returnReason, "Refund Status": r.refundStatus })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Returns");
    XLSX.writeFile(wb, `return-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [["Order ID", "Date", "Total", "Status", "Return Reason", "Refund Status"],
      ...recentReturns.map((r: any) => [r.orderId, r.date, r.total, r.status, r.returnReason, r.refundStatus])];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `return-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <Skeleton count={5} />;
  if (error) return <ErrorMsg msg={error} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Return Requests" value={s.totalReturnRequests ?? 0} icon={RotateCcw} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
        <KpiCard label="Approved Returns" value={s.approvedReturns ?? 0} icon={RotateCcw} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Rejected Returns" value={s.rejectedReturns ?? 0} icon={RotateCcw} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
        <KpiCard label="Return Rate" value={`${s.returnRate ?? 0}%`} icon={TrendingDown} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" sub="Returns / Total orders" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <KpiCard label="Refund Requests" value={s.refundRequests ?? 0} icon={IndianRupee} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Completed Refunds" value={s.completedRefunds ?? 0} icon={IndianRupee} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Refund Amount" value={fmt(s.refundAmount ?? 0)} icon={IndianRupee} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Return & Refund Trend</h3>
          {trend.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No data</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmtDate} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} width={28} />
                <Tooltip labelFormatter={fmtDate} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                <Line type="monotone" dataKey="returnRequests" stroke="#8B5CF6" strokeWidth={2} dot={false} name="Returns" />
                <Line type="monotone" dataKey="refunds" stroke="#EF4444" strokeWidth={1.5} dot={false} name="Refunds" />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-3" style={{ color: NAVY }}>Return Reasons</h3>
          {byReason.length === 0 ? <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No return data</div> : (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart><Pie data={byReason.map((r: any) => ({ name: r.reason?.slice(0, 20), value: r.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, percent }: any) => `${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                {byReason.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie><Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} /></PieChart>
            </ResponsiveContainer>
          )}
          <div className="mt-2 space-y-1">
            {byReason.slice(0, 5).map((r: any, i: number) => (
              <div key={r.reason} className="flex items-center gap-2 text-xs">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                <span className="text-gray-600 truncate flex-1">{r.reason}</span>
                <span className="font-semibold" style={{ color: NAVY }}>{r.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {topReturnedProducts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 className="font-serif font-bold text-sm mb-4" style={{ color: NAVY }}>Most Returned Products</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topReturnedProducts.map((p: any, i: number) => (
              <div key={p.productId} className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate" style={{ color: NAVY }}>{p.name || p.productId}</div>
                  <div className="text-xs text-gray-400 capitalize">{p.category}</div>
                </div>
                <span className="text-xs font-bold text-red-500 shrink-0">{p.returnCount} returns</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={recentReturns.length === 0}>
            <h3 className="text-sm font-bold" style={{ color: NAVY }}>Return & Refund Records</h3>
          </ExportBar>
        </div>
        {recentReturns.length === 0 ? <div className="py-10 text-center text-sm text-gray-400">No return records for this period.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Order</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Reason</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Refund</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-50">
                {recentReturns.map((r: any) => (
                  <tr key={r.orderId} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3 font-mono text-xs font-semibold" style={{ color: NAVY }}>{r.orderId?.slice(0, 16)}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">{fmtDate(r.date)}</td>
                    <td className="px-4 py-3 text-right font-semibold" style={{ color: NAVY }}>{fmt(r.total)}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500 max-w-[160px] truncate">{r.returnReason || "—"}</td>
                    <td className="px-4 py-3">{r.refundStatus ? <StatusPill status={r.refundStatus} /> : <span className="text-xs text-gray-400">—</span>}</td>
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

// ── TABS CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { key: "revenue",   label: "Revenue",   icon: IndianRupee },
  { key: "sales",     label: "Sales",     icon: ShoppingBag },
  { key: "vendors",   label: "Vendor",    icon: Store },
  { key: "customers", label: "Customer",  icon: Users },
  { key: "products",  label: "Product",   icon: Package },
  { key: "returns",   label: "Return",    icon: RotateCcw },
] as const;
type TabKey = typeof TABS[number]["key"];

// ── MAIN COMPONENT ────────────────────────────────────────────────────────────
const VALID_TABS = new Set(TABS.map((t) => t.key));
const VALID_PERIODS = new Set(PERIODS.map((p) => p.key));

function ReportsContent() {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

  // Derive state from URL query string, falling back to sensible defaults.
  const params = new URLSearchParams(search);
  const rawTab = params.get("tab") ?? "";
  const tab: TabKey = VALID_TABS.has(rawTab as TabKey) ? (rawTab as TabKey) : "revenue";

  const rawPeriod = params.get("period") ?? "";
  const period: Period = VALID_PERIODS.has(rawPeriod as Period) ? (rawPeriod as Period) : "30d";

  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  function updateParams(updates: Record<string, string>) {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    navigate(`${location}?${next.toString()}`, { replace: true });
  }

  function handleTabChange(key: TabKey) {
    updateParams({ tab: key });
  }

  function handlePeriodChange(p: Period, f: string, t: string) {
    updateParams({
      period: p,
      from: p === "custom" ? f : "",
      to: p === "custom" ? t : "",
    });
  }

  function handleRefresh() {
    setRefreshKey((k) => k + 1);
  }

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast({ title: "Report link copied", description: "Your filtered report view is ready to share." });
    } catch {
      toast({
        title: "Could not copy link",
        description: "Please copy the URL from your browser address bar.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>
            Reports
          </h1>
        </div>
      </div>

      {/* Period filter */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <PeriodFilter
          period={period}
          from={from}
          to={to}
          onChange={handlePeriodChange}
          onRefresh={handleRefresh}
          onCopyLink={handleCopyLink}
        />
      </div>

      {/* Tab navigation */}
      <div className="flex overflow-x-auto gap-1 pb-1 -mb-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0"
            style={{
              background: tab === key ? NAVY : "white",
              color: tab === key ? GOLD : "#6B7280",
              border: tab === key ? `1px solid ${NAVY}` : "1px solid #E5E7EB",
            }}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tab content — key forces remount on refresh */}
      <div key={`${tab}-${period}-${from}-${to}-${refreshKey}`}>
        {tab === "revenue"   && <RevenueTab   period={period} from={from} to={to} />}
        {tab === "sales"     && <SalesTab     period={period} from={from} to={to} />}
        {tab === "vendors"   && <VendorTab    period={period} from={from} to={to} />}
        {tab === "customers" && <CustomerTab  period={period} from={from} to={to} />}
        {tab === "products"  && <ProductTab   period={period} from={from} to={to} />}
        {tab === "returns"   && <ReturnTab    period={period} from={from} to={to} />}
      </div>
    </div>
  );
}

export default function AdminReports() {
  return (
    <AdminGuard>
      <AdminLayout>
        <ReportsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
