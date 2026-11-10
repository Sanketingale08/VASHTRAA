import React, { useEffect, useState, useCallback } from "react";
import { useSearch, useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, TrendingDown, IndianRupee, ShoppingBag, Users, Store,
  RotateCcw, Package, Download, FileSpreadsheet, FileText, Printer,
  BarChart2, RefreshCw, Copy, ChevronLeft, ChevronRight, Search,
  Calendar, Filter, Sparkles, AlertCircle, ArrowUpRight
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders, adminKey as getAdminKey } from "@/lib/adminApi";
import { AdminErrorBoundary, AdminErrorState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAVY = "#0A1F44";
const GOLD = "#C7CCD1";
const PIE_COLORS = [GOLD, "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EF4444", "#06B6D4", "#84CC16"];
const REPORTS_POLL_MS = 60_000;

function fmt(n: number) {
  if (n == null || isNaN(n)) return "₹0";
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(2)} Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(2)} L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(1)} K`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function fmtDate(d: string) {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
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

function useAdminKey() {
  return getAdminKey();
}

// ── Period selector ───────────────────────────────────────────────────────────
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "7d", label: "Last 7 Days" },
  { key: "30d", label: "Last 30 Days" },
  { key: "monthly", label: "This Month" },
  { key: "quarterly", label: "This Quarter" },
  { key: "yearly", label: "This Year" },
  { key: "custom", label: "Custom Range" },
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
    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-1.5 bg-gray-50/80 p-1.5 rounded-xl border border-gray-200/80">
        {PERIODS.map((p) => {
          const active = period === p.key;
          return (
            <button
              key={p.key}
              onClick={() => onChange(p.key, from, to)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-all ${
                active
                  ? "bg-[#0A1F44] text-white shadow-xs"
                  : "text-gray-600 hover:text-gray-900 hover:bg-white/60"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {period === "custom" && (
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-gray-200 shadow-xs">
            <Calendar size={14} className="text-gray-400" />
            <input
              type="date"
              value={from}
              onChange={(e) => onChange("custom", e.target.value, to)}
              className="text-xs font-medium text-gray-700 bg-transparent border-none focus:outline-none"
            />
            <span className="text-xs text-gray-400 font-bold">→</span>
            <input
              type="date"
              value={to}
              onChange={(e) => onChange("custom", from, e.target.value)}
              className="text-xs font-medium text-gray-700 bg-transparent border-none focus:outline-none"
            />
          </div>
        )}

        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors shadow-xs disabled:opacity-50"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-[#0A1F44]" : "text-gray-500"} />
          <span>Refresh</span>
        </button>

        <button
          onClick={onCopyLink}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors shadow-xs"
        >
          <Copy size={13} className="text-gray-500" />
          <span>Share Link</span>
        </button>
      </div>
    </div>
  );
}

// ── KPI Card Component ────────────────────────────────────────────────────────
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
    <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs hover:shadow-md transition-all duration-200 group relative overflow-hidden">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 leading-tight">{label}</span>
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105"
          style={{ background: iconBg }}
        >
          <Icon size={18} style={{ color: iconColor }} />
        </div>
      </div>
      <div className="text-2xl lg:text-3xl font-serif font-bold tracking-tight" style={{ color: NAVY }}>
        {value}
      </div>
      {sub && <div className="text-xs text-gray-500 mt-1.5 pt-1.5 border-t border-gray-100">{sub}</div>}
      {trend !== undefined && (
        <div className="mt-2.5 pt-2 border-t border-gray-100 flex items-center gap-1">
          <span
            className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
              trend >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
            }`}
          >
            {trend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend >= 0 ? "+" : ""}
            {trend}%
          </span>
          <span className="text-xs text-gray-400">vs prior period</span>
        </div>
      )}
    </div>
  );
}

// ── Status pill ───────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    delivered: { bg: "#F0FDF4", color: "#166534" },
    confirmed: { bg: "#FEF3C7", color: "#92400E" },
    dispatched: { bg: "#EFF6FF", color: "#1E40AF" },
    cancelled: { bg: "#FEF2F2", color: "#991B1B" },
    returned: { bg: "#F3E8FF", color: "#6B21A8" },
    return_requested: { bg: "#F3E8FF", color: "#6B21A8" },
    return_rejected: { bg: "#FEF2F2", color: "#991B1B" },
    pending: { bg: "#FEF3C7", color: "#92400E" },
    approved: { bg: "#F0FDF4", color: "#166534" },
    completed: { bg: "#F0FDF4", color: "#166534" },
  };
  const s = map[status] ?? { bg: "#F3F4F6", color: "#374151" };
  return (
    <span
      className="inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full capitalize"
      style={{ background: s.bg, color: s.color }}
    >
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      {children}
      <div className="flex items-center gap-2 ml-auto">
        <button
          onClick={onPdf}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-40 shadow-xs"
        >
          <Download size={13} className="text-gray-500" /> PDF
        </button>
        <button
          onClick={onExcel}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-40 shadow-xs"
        >
          <FileSpreadsheet size={13} className="text-emerald-600" /> Excel
        </button>
        <button
          onClick={onCsv}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors disabled:opacity-40 shadow-xs"
        >
          <FileText size={13} className="text-blue-600" /> CSV
        </button>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 transition-colors shadow-xs"
        >
          <Printer size={13} className="text-gray-500" /> Print
        </button>
      </div>
    </div>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
      <span className="text-xs text-gray-500">
        Page <span className="font-bold text-gray-800">{page}</span> of <span className="font-bold text-gray-800">{totalPages}</span>
      </span>
      <div className="flex items-center gap-1.5">
        <button
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 shadow-xs"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => onChange(page + 1)}
          className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-30 shadow-xs"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function ReportSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 h-28 animate-pulse flex flex-col justify-between">
            <div className="h-3 bg-gray-100 rounded w-2/3" />
            <div className="h-7 bg-gray-200 rounded w-3/4" />
            <div className="h-3 bg-gray-100 rounded w-1/2" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 h-72 animate-pulse" />
        <div className="bg-white rounded-2xl border border-gray-200 p-6 h-72 animate-pulse" />
      </div>
    </div>
  );
}

// ── REVENUE TAB ───────────────────────────────────────────────────────────────
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
      .catch((e: any) => setError(getFriendlyErrorMessage(e, "Revenue report")))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  useEffect(() => { load(); }, [load]);

  const s = data?.summary ?? {};
  const trend = data?.trend ?? [];
  const prevTrend: any[] = data?.prevTrend ?? [];

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
      styles: { fontSize: 9 }, headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255] },
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

  if (loading) return <ReportSkeleton count={5} />;
  if (error) return <AdminErrorState title="Unable to load revenue report" message={error} onRetry={load} compact />;

  return (
    <div className="space-y-6">
      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Orders" value={(s.totalOrders ?? 0).toLocaleString("en-IN")} icon={ShoppingBag} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Gross Revenue" value={fmt(s.grossRevenue ?? 0)} icon={IndianRupee} iconBg="rgba(10,31,68,0.1)" iconColor={NAVY} trend={s.growthPct} />
        <KpiCard label="Net Revenue" value={fmt(s.netRevenue ?? 0)} icon={TrendingUp} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Platform Commission" value={fmt(s.commission ?? 0)} icon={BarChart2} iconBg="rgba(10,31,68,0.08)" iconColor={NAVY} />
        <KpiCard label="Vendor Earnings" value={fmt(s.vendorEarnings ?? 0)} icon={Store} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
      </div>

      {/* Secondary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Refund Amount" value={fmt(s.refundAmount ?? 0)} icon={RotateCcw} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
        <KpiCard label="Tax Collected" value={fmt(s.taxCollected ?? 0)} icon={FileText} iconBg="rgba(16,185,129,0.08)" iconColor="#10B981" />
        <KpiCard label="Shipping Collected" value={fmt(s.shippingCollected ?? 0)} icon={Package} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" />
        <KpiCard label="Avg Order Value" value={fmt(s.avgOrderValue ?? 0)} icon={IndianRupee} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard
          label="Revenue Growth"
          value={`${(s.growthPct ?? 0) >= 0 ? "+" : ""}${s.growthPct ?? 0}%`}
          icon={(s.growthPct ?? 0) >= 0 ? TrendingUp : TrendingDown}
          iconBg={(s.growthPct ?? 0) >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"}
          iconColor={(s.growthPct ?? 0) >= 0 ? "#10B981" : "#EF4444"}
          sub="vs prior period"
        />
      </div>

      {/* Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-serif font-bold text-base text-[#0A1F44]">Revenue Velocity Trend</h3>
              <p className="text-xs text-gray-500">Comparison of current period vs prior period revenue trajectory</p>
            </div>
          </div>
          {trend.length === 0 ? (
            <div className="h-60 flex items-center justify-center text-gray-400 text-xs bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              No revenue trend recorded for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={mergedTrend} margin={{ top: 10, right: 10, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmtDate} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmt} width={56} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, name: string) => [fmt(v), name === "revenue" ? "This Period" : "Prior Period"]} labelFormatter={fmtDate} />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} formatter={(v) => (v === "revenue" ? "This Period" : "Prior Period")} />
                <Line type="monotone" dataKey="revenue" stroke={NAVY} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: NAVY }} name="revenue" />
                <Line type="monotone" dataKey="prevRevenue" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="prevRevenue" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-1">Financial Distribution</h3>
            <p className="text-xs text-gray-500 mb-4">Platform vs vendor revenue split</p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={[{ name: "Commission", value: s.commission ?? 0 }, { name: "Vendors", value: s.vendorEarnings ?? 0 }, { name: "Refunds", value: s.refundAmount ?? 0 }]} margin={{ top: 10, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmt} width={52} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => [fmt(v)]} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {[NAVY, "#8B5CF6", "#EF4444"].map((c, i) => (
                    <Cell key={i} fill={c} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Detailed Data Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={trend.length === 0}>
            <div>
              <h3 className="text-base font-bold text-[#0A1F44]">Daily Revenue Ledger</h3>
              <p className="text-xs text-gray-500">Itemized daily revenue and order aggregation</p>
            </div>
          </ExportBar>
        </div>
        {trend.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No revenue data available for the selected period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Orders</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Gross Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {trend.map((r: any) => (
                  <tr key={r.date} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-[#0A1F44]">{fmtDate(r.date)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-600 font-medium">{Number(r.orders).toLocaleString("en-IN")}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{fmt(Number(r.revenue))}</td>
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
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e: any) => setError(getFriendlyErrorMessage(e, "Sales report")))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to, page]);

  useEffect(() => { load(); }, [load]);

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
      styles: { fontSize: 8 }, headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255] },
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
    const rows = [
      ["Order ID", "Date", "Total", "Status", "Payment Method", "Items"],
      ...(data?.orders ?? []).map((o: any) => [o.id, o.date, o.total, o.status, o.paymentMethod, o.itemCount]),
    ];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `sales-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <ReportSkeleton count={4} />;
  if (error) return <AdminErrorState title="Unable to load sales report" message={error} onRetry={load} compact />;

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Orders" value={(s.totalOrders ?? 0).toLocaleString("en-IN")} icon={ShoppingBag} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Items Sold" value={(s.totalItemsSold ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Sales Revenue" value={fmt(s.salesRevenue ?? 0)} icon={IndianRupee} iconBg="rgba(10,31,68,0.1)" iconColor={NAVY} />
        <KpiCard label="Avg Order Value" value={fmt(s.avgOrderValue ?? 0)} icon={TrendingUp} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
      </div>

      {/* Trends & Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">Daily Sales Velocity</h3>
          {trend.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-xs bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
              No sales recorded for this period
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={mergedTrend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmtDate} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmt} width={56} axisLine={false} tickLine={false} />
                <Tooltip
                  formatter={(v: number, n: string) => {
                    if (n === "revenue") return [fmt(v), "This Period"];
                    if (n === "prevRevenue") return [fmt(v), "Prior Period"];
                    return [v, "Orders"];
                  }}
                  labelFormatter={fmtDate}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} formatter={(v) => (v === "revenue" ? "This Period" : v === "prevRevenue" ? "Prior Period" : "Orders")} />
                <Line type="monotone" dataKey="revenue" stroke={NAVY} strokeWidth={2.5} dot={false} name="revenue" />
                <Line type="monotone" dataKey="prevRevenue" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} name="prevRevenue" connectNulls />
                <Line type="monotone" dataKey="orders" stroke="#3B82F6" strokeWidth={1.5} dot={false} name="orders" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
            <h3 className="font-serif font-bold text-sm text-[#0A1F44] mb-3">Sales by Category</h3>
            <ResponsiveContainer width="100%" height={150}>
              <PieChart>
                <Pie data={byCategory.map((r: any) => ({ name: r.category, value: r.revenue }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={60} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                  {byCategory.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [fmt(v)]} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
            <h3 className="font-serif font-bold text-sm text-[#0A1F44] mb-3">Payment Methods</h3>
            {byMethod.length === 0 ? (
              <div className="text-xs text-gray-400">No payment data recorded</div>
            ) : (
              <div className="space-y-2.5">
                {byMethod.map((m: any) => (
                  <div key={m.method} className="flex items-center justify-between text-xs pb-2 border-b border-gray-100 last:border-0 last:pb-0">
                    <span className="font-semibold text-gray-700 capitalize">{m.method?.replace(/_/g, " ") || "Unknown"}</span>
                    <span className="text-gray-500 font-medium">{m.count} orders · <span className="font-bold text-[#0A1F44]">{fmt(m.amount)}</span></span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100 space-y-4">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={(data?.orders?.length ?? 0) === 0}>
            <div>
              <h3 className="text-base font-bold text-[#0A1F44]">Order Transactions</h3>
              <p className="text-xs text-gray-500">Filterable order log for the selected period</p>
            </div>
          </ExportBar>

          <div className="relative max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by order ID or status…"
              className="w-full pl-9 pr-4 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20"
            />
          </div>
        </div>

        {orders.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No orders found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Payment Method</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((o: any) => (
                  <tr key={o.id} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-[#0A1F44]">{o.id?.slice(0, 16)}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">{fmtDate(o.date)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{fmt(o.total)}</td>
                    <td className="px-5 py-3.5"><StatusPill status={o.status} /></td>
                    <td className="px-5 py-3.5 text-xs capitalize text-gray-600 font-medium">{o.paymentMethod?.replace(/_/g, " ") || "—"}</td>
                    <td className="px-5 py-3.5 text-right text-xs text-gray-600 font-semibold">{o.itemCount}</td>
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
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e: any) => setError(getFriendlyErrorMessage(e, "Vendor report")))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  useEffect(() => { load(); }, [load]);

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
      styles: { fontSize: 8 }, headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255] },
    });
    doc.save(`vendor-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(top.map((v: any) => ({ Vendor: v.vendorName, Settlements: v.settlementCount, Revenue: v.totalRevenue, Commission: v.commission, "Net Payout": v.netPayout, Pending: v.pendingSettlements })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Vendors");
    XLSX.writeFile(wb, `vendor-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [
      ["Vendor", "Revenue", "Commission", "Net Payout", "Pending Settlements"],
      ...top.map((v: any) => [v.vendorName, v.totalRevenue, v.commission, v.netPayout, v.pendingSettlements]),
    ];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `vendor-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <ReportSkeleton count={4} />;
  if (error) return <AdminErrorState title="Unable to load vendor report" message={error} onRetry={load} compact />;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Vendors" value={s.totalVendors ?? 0} icon={Store} iconBg="rgba(10,31,68,0.08)" iconColor={NAVY} />
        <KpiCard label="Active Vendors" value={s.activeVendors ?? 0} icon={Store} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Pending Approval" value={s.pendingVendors ?? 0} icon={Store} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" />
        <KpiCard label="Suspended" value={s.suspendedVendors ?? 0} icon={Store} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Pending Settlements" value={ss.pendingCount ?? 0} icon={IndianRupee} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" sub={fmt(ss.pendingAmount ?? 0)} />
        <KpiCard label="Completed Settlements" value={ss.completedCount ?? 0} icon={IndianRupee} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" sub={fmt(ss.completedAmount ?? 0)} />
      </div>

      {/* Top Vendors Chart */}
      {top.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">Top Vendor Revenue & Commission</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={top.slice(0, 10).map((v: any) => ({ name: v.vendorName?.slice(0, 14), revenue: v.totalRevenue, commission: v.commission }))} margin={{ top: 5, right: 5, bottom: 35, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} angle={-25} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmt} width={56} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number, n: string) => [fmt(v), n === "revenue" ? "Revenue" : "Commission"]} />
              <Bar dataKey="revenue" fill={NAVY} radius={[6, 6, 0, 0]} name="revenue" />
              <Bar dataKey="commission" fill="#3B82F6" radius={[6, 6, 0, 0]} name="commission" />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={top.length === 0}>
            <div>
              <h3 className="text-base font-bold text-[#0A1F44]">Vendor Settlement & Performance</h3>
              <p className="text-xs text-gray-500">Breakdown of earnings, commission deductions, and pending payouts</p>
            </div>
          </ExportBar>
        </div>
        {top.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No vendor performance records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Settlements</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Revenue</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Commission</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Net Payout</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Pending</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {top.map((v: any) => (
                  <tr key={v.vendorId} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-semibold text-[#0A1F44]">
                      {v.vendorName}
                      {(v.sellerId || v.vendorId) && (
                        <span className="text-xs font-mono text-gray-400 font-normal ml-1.5">({v.sellerId || v.vendorId})</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right text-gray-600 font-medium">{v.settlementCount}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{fmt(v.totalRevenue)}</td>
                    <td className="px-5 py-3.5 text-right font-medium text-red-600">-{fmt(v.commission)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-emerald-700">{fmt(v.netPayout)}</td>
                    <td className="px-5 py-3.5 text-right font-bold">
                      {v.pendingSettlements > 0 ? (
                        <span className="text-amber-600 font-bold">{v.pendingSettlements}</span>
                      ) : (
                        <span className="text-gray-400 font-normal">0</span>
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
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e: any) => setError(getFriendlyErrorMessage(e, "Customer report")))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  useEffect(() => { load(); }, [load]);

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
      styles: { fontSize: 8 }, headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255] },
    });
    doc.save(`customer-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(topCustomers.map((c: any) => ({ "Customer ID": c.userId, Orders: c.totalOrders, "Total Spend": c.totalSpend, "Avg Spend": c.avgSpend })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Customers");
    XLSX.writeFile(wb, `customer-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [
      ["Customer ID", "Orders", "Total Spend", "Avg Spend"],
      ...topCustomers.map((c: any) => [c.userId, c.totalOrders, c.totalSpend, c.avgSpend]),
    ];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `customer-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <ReportSkeleton count={5} />;
  if (error) return <AdminErrorState title="Unable to load customer report" message={error} onRetry={load} compact />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KpiCard label="Total Customers" value={(s.totalCustomers ?? 0).toLocaleString("en-IN")} icon={Users} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
        <KpiCard label="New Customers" value={(s.newCustomers ?? 0).toLocaleString("en-IN")} icon={Users} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Returning" value={(s.returningCustomers ?? 0).toLocaleString("en-IN")} icon={Users} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Avg Spend" value={fmt(s.avgSpend ?? 0)} icon={IndianRupee} iconBg="rgba(10,31,68,0.1)" iconColor={NAVY} />
        <KpiCard label="Avg Orders / Customer" value={Number(s.avgOrdersPerCustomer ?? 0).toFixed(1)} icon={ShoppingBag} iconBg="rgba(10,31,68,0.08)" iconColor={NAVY} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">Customer Acquisition & Order Growth</h3>
          {trend.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-xs bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmtDate} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} width={36} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={fmtDate} />
                <Line type="monotone" dataKey="customers" stroke={NAVY} strokeWidth={2.5} dot={false} name="Customers" />
                <Line type="monotone" dataKey="orders" stroke="#8B5CF6" strokeWidth={1.5} dot={false} name="Orders" />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">New vs Returning Split</h3>
            <ResponsiveContainer width="100%" height={210}>
              <PieChart>
                <Pie data={[{ name: "New", value: s.newCustomers ?? 0 }, { name: "Returning", value: s.returningCustomers ?? 0 }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
                  <Cell fill={NAVY} />
                  <Cell fill="#8B5CF6" />
                </Pie>
                <Tooltip formatter={(v: number) => [v, ""]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={topCustomers.length === 0}>
            <div>
              <h3 className="text-base font-bold text-[#0A1F44]">Top Customers by Total Spend</h3>
              <p className="text-xs text-gray-500">Highest value buyer profiles for the selected period</p>
            </div>
          </ExportBar>
        </div>
        {topCustomers.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No customer records found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Customer ID</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Orders</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Total Spend</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Avg Spend</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topCustomers.map((c: any, i: number) => (
                  <tr key={c.userId} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-bold text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3.5 font-mono text-xs font-semibold text-[#0A1F44]">{c.userId?.slice(0, 20)}…</td>
                    <td className="px-5 py-3.5 text-right text-gray-600 font-medium">{c.totalOrders}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{fmt(c.totalSpend)}</td>
                    <td className="px-5 py-3.5 text-right text-gray-500 font-medium">{fmt(c.avgSpend)}</td>
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
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e: any) => setError(getFriendlyErrorMessage(e, "Product report")))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  useEffect(() => { load(); }, [load]);

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
      styles: { fontSize: 8 }, headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255] },
    });
    doc.save(`product-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(bestSellers.map((p: any) => ({ Product: p.name, Category: p.category, Vendor: p.vendorName, "Units Sold": p.unitsSold, Revenue: p.revenue })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Best Sellers");
    XLSX.writeFile(wb, `product-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [
      ["Product", "Category", "Units Sold", "Revenue"],
      ...bestSellers.map((p: any) => [p.name, p.category, p.unitsSold, p.revenue]),
    ];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `product-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <ReportSkeleton count={5} />;
  if (error) return <AdminErrorState title="Unable to load product report" message={error} onRetry={load} compact />;

  return (
    <div className="space-y-6">
      {/* Primary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total Products" value={(s.total ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(10,31,68,0.08)" iconColor={NAVY} />
        <KpiCard label="Active Listings" value={(s.active ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Pending Approval" value={(s.pending ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" />
        <KpiCard label="Featured Products" value={(s.featured ?? 0).toLocaleString("en-IN")} icon={Package} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Rejected" value={s.rejected ?? 0} icon={Package} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
        <KpiCard label="Low Stock Alert" value={s.lowStock ?? 0} icon={Package} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" sub="Below stock threshold" />
        <KpiCard label="Out of Stock" value={s.outOfStock ?? 0} icon={Package} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
      </div>

      {/* Best Sellers Chart & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">Top Best Selling Products</h3>
          {bestSellers.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-xs bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No sales data recorded</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={bestSellers.map((p: any) => ({ name: p.name?.slice(0, 18), units: p.unitsSold, revenue: p.revenue }))} layout="vertical" margin={{ top: 5, right: 60, bottom: 5, left: 10 }}>
                <XAxis type="number" tick={{ fontSize: 11, fill: "#6B7280" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} width={140} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number, n: string) => [n === "units" ? `${v} units` : fmt(v)]} />
                <Bar dataKey="units" fill={NAVY} radius={[0, 6, 6, 0]} name="units" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
            <h3 className="font-serif font-bold text-sm text-[#0A1F44] mb-3">Products by Category</h3>
            <ResponsiveContainer width="100%" height={140}>
              <PieChart>
                <Pie data={byCategory.map((r: any) => ({ name: r.category, value: r.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} label={({ name, percent }: any) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                  {byCategory.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
            <h3 className="font-serif font-bold text-sm text-[#0A1F44] mb-3">Most Wishlisted Items</h3>
            {mostWishlisted.length === 0 ? (
              <div className="text-xs text-gray-400">No wishlist activity</div>
            ) : (
              <div className="space-y-2">
                {mostWishlisted.slice(0, 5).map((p: any) => (
                  <div key={p.productId} className="flex items-center justify-between text-xs pb-1.5 border-b border-gray-100 last:border-0 last:pb-0">
                    <span className="font-semibold text-gray-700 truncate max-w-[140px]">{p.name || p.productId?.slice(0, 12)}</span>
                    <span className="text-rose-600 font-bold shrink-0">{p.wishlistCount} ❤</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Best Sellers Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={bestSellers.length === 0}>
            <div>
              <h3 className="text-base font-bold text-[#0A1F44]">Best Sellers Catalogue</h3>
              <p className="text-xs text-gray-500">Itemized units sold and revenue per product</p>
            </div>
          </ExportBar>
        </div>
        {bestSellers.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No product sales in this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">#</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Product</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Vendor</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Units</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Revenue</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {bestSellers.map((p: any, i: number) => (
                  <tr key={p.productId} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-bold text-gray-400">{i + 1}</td>
                    <td className="px-5 py-3.5 font-bold text-[#0A1F44] max-w-[220px] truncate">{p.name || p.productId}</td>
                    <td className="px-5 py-3.5 capitalize text-xs text-gray-500 font-medium">{p.category}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 font-medium">{p.vendorName || "—"}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{p.unitsSold}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{fmt(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Low Stock Alert List */}
      {lowStockList.length > 0 && (
        <div className="bg-amber-50/80 border border-amber-200/80 rounded-2xl overflow-hidden shadow-xs">
          <div className="p-4 border-b border-amber-200/80 flex items-center justify-between">
            <h3 className="text-sm font-bold text-amber-900 flex items-center gap-2">
              <AlertCircle size={16} className="text-amber-600" />
              Low Stock Warning ({lowStockList.length} products needing replenishment)
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-amber-200/80 bg-amber-100/40">
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-amber-800 uppercase">Product</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-amber-800 uppercase">Category</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-amber-800 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-amber-800 uppercase">Stock</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-amber-800 uppercase">Threshold</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100">
                {lowStockList.map((p: any) => (
                  <tr key={p.id} className="hover:bg-amber-100/60 transition-colors">
                    <td className="px-4 py-3 font-semibold text-amber-950 truncate max-w-[200px]">{p.name}</td>
                    <td className="px-4 py-3 capitalize text-xs text-amber-800">{p.category}</td>
                    <td className="px-4 py-3 text-xs text-amber-800">{p.vendorName || "—"}</td>
                    <td className="px-4 py-3 text-right font-bold text-amber-900">{p.stock}</td>
                    <td className="px-4 py-3 text-right text-amber-700">{p.threshold}</td>
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
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setData)
      .catch((e: any) => setError(getFriendlyErrorMessage(e, "Return report")))
      .finally(() => setLoading(false));
  }, [adminKey, period, from, to]);

  useEffect(() => { load(); }, [load]);

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
      styles: { fontSize: 8 }, headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255] },
    });
    doc.save(`return-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(recentReturns.map((r: any) => ({ "Order ID": r.orderId, Date: r.date, Total: r.total, Status: r.status, "Return Reason": r.returnReason, "Refund Status": r.refundStatus })));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Returns");
    XLSX.writeFile(wb, `return-report-${Date.now()}.xlsx`);
  }

  function exportCsv() {
    const rows = [
      ["Order ID", "Date", "Total", "Status", "Return Reason", "Refund Status"],
      ...recentReturns.map((r: any) => [r.orderId, r.date, r.total, r.status, r.returnReason, r.refundStatus]),
    ];
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(toCsv(rows));
    a.download = `return-report-${Date.now()}.csv`; a.click();
  }

  if (loading) return <ReportSkeleton count={5} />;
  if (error) return <AdminErrorState title="Unable to load return report" message={error} onRetry={load} compact />;

  return (
    <div className="space-y-6">
      {/* KPI Row 1 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Return Requests" value={s.totalReturnRequests ?? 0} icon={RotateCcw} iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" />
        <KpiCard label="Approved Returns" value={s.approvedReturns ?? 0} icon={RotateCcw} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Rejected Returns" value={s.rejectedReturns ?? 0} icon={RotateCcw} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
        <KpiCard label="Return Rate" value={`${s.returnRate ?? 0}%`} icon={TrendingDown} iconBg="rgba(245,158,11,0.1)" iconColor="#F59E0B" sub="Returns / Total orders" />
      </div>

      {/* KPI Row 2 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Refund Requests" value={s.refundRequests ?? 0} icon={IndianRupee} iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" />
        <KpiCard label="Completed Refunds" value={s.completedRefunds ?? 0} icon={IndianRupee} iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" />
        <KpiCard label="Refund Amount" value={fmt(s.refundAmount ?? 0)} icon={IndianRupee} iconBg="rgba(239,68,68,0.1)" iconColor="#EF4444" />
      </div>

      {/* Charts & Reasons */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">Return & Refund Trend</h3>
          {trend.length === 0 ? (
            <div className="h-56 flex items-center justify-center text-gray-400 text-xs bg-gray-50/50 rounded-xl border border-dashed border-gray-200">No return data</div>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7280" }} tickFormatter={fmtDate} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#6B7280" }} width={28} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={fmtDate} />
                <Line type="monotone" dataKey="returnRequests" stroke="#8B5CF6" strokeWidth={2.5} dot={false} name="Returns" />
                <Line type="monotone" dataKey="refunds" stroke="#EF4444" strokeWidth={1.5} dot={false} name="Refunds" />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col justify-between">
          <div>
            <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-3">Return Reasons Breakdown</h3>
            {byReason.length === 0 ? (
              <div className="h-44 flex items-center justify-center text-gray-400 text-xs">No return data</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={byReason.map((r: any) => ({ name: r.reason?.slice(0, 20), value: r.count }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={65} label={({ percent }: any) => `${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 10 }}>
                    {byReason.map((_: any, i: number) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
            <div className="mt-2 space-y-1.5 pt-2 border-t border-gray-100">
              {byReason.slice(0, 4).map((r: any, i: number) => (
                <div key={r.reason} className="flex items-center gap-2 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                  <span className="text-gray-600 truncate flex-1 font-medium">{r.reason}</span>
                  <span className="font-bold text-[#0A1F44]">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Top Returned Products Grid */}
      {topReturnedProducts.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs">
          <h3 className="font-serif font-bold text-base text-[#0A1F44] mb-4">Most Returned Products</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {topReturnedProducts.map((p: any, i: number) => (
              <div key={p.productId} className="flex items-center gap-3 bg-gray-50/80 border border-gray-100 rounded-xl px-4 py-3">
                <span className="text-xs font-bold text-gray-400 w-5">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-[#0A1F44] truncate">{p.name || p.productId}</div>
                  <div className="text-xs text-gray-400 capitalize">{p.category}</div>
                </div>
                <span className="text-xs font-bold text-red-600 shrink-0">{p.returnCount} returns</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200/80 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-gray-100">
          <ExportBar onPdf={exportPdf} onExcel={exportExcel} onCsv={exportCsv} disabled={recentReturns.length === 0}>
            <div>
              <h3 className="text-base font-bold text-[#0A1F44]">Return & Refund Audit Log</h3>
              <p className="text-xs text-gray-500">Full history of return requests and refund resolutions</p>
            </div>
          </ExportBar>
        </div>
        {recentReturns.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">No return records for this period.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-right text-[11px] font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Reason</th>
                  <th className="px-5 py-3.5 text-left text-[11px] font-bold text-gray-500 uppercase tracking-wider">Refund Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentReturns.map((r: any) => (
                  <tr key={r.orderId} className="hover:bg-gray-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-mono text-xs font-bold text-[#0A1F44]">{r.orderId?.slice(0, 16)}</td>
                    <td className="px-5 py-3.5 text-xs text-gray-500">{fmtDate(r.date)}</td>
                    <td className="px-5 py-3.5 text-right font-bold text-[#0A1F44]">{fmt(r.total)}</td>
                    <td className="px-5 py-3.5"><StatusPill status={r.status} /></td>
                    <td className="px-5 py-3.5 text-xs text-gray-600 font-medium max-w-[180px] truncate">{r.returnReason || "—"}</td>
                    <td className="px-5 py-3.5">
                      {r.refundStatus ? <StatusPill status={r.refundStatus} /> : <span className="text-xs text-gray-400">—</span>}
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

// ── TABS CONFIG ───────────────────────────────────────────────────────────────
const TABS = [
  { key: "revenue", label: "Revenue Report", icon: IndianRupee },
  { key: "sales", label: "Sales Velocity", icon: ShoppingBag },
  { key: "vendors", label: "Vendor Performance", icon: Store },
  { key: "customers", label: "Customer Insights", icon: Users },
  { key: "products", label: "Product Analytics", icon: Package },
  { key: "returns", label: "Returns & Refunds", icon: RotateCcw },
] as const;
type TabKey = typeof TABS[number]["key"];

const VALID_TABS = new Set(TABS.map((t) => t.key));
const VALID_PERIODS = new Set(PERIODS.map((p) => p.key));

// ── MAIN REPORTS CONTENT ──────────────────────────────────────────────────────
function ReportsContent() {
  const search = useSearch();
  const [location, navigate] = useLocation();
  const [refreshKey, setRefreshKey] = useState(0);
  const { toast } = useToast();

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
      toast({ title: "Report link copied", description: "Filtered report view URL copied to clipboard." });
    } catch {
      toast({
        title: "Could not copy link",
        description: "Please copy the URL from your browser address bar.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="space-y-8 pb-8">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#0A1F44]/5 text-[#0A1F44] border border-[#0A1F44]/10">
              <Sparkles size={12} className="text-[#0A1F44]" />
              Platform Intelligence
            </span>
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#0A1F44]">Executive Reports & Analytics</h1>
          <p className="text-xs text-gray-500">Multi-dimensional marketplace metrics, financial reports, and operational audits</p>
        </div>
      </div>

      {/* Period Filter Card */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-5 shadow-xs">
        <PeriodFilter
          period={period}
          from={from}
          to={to}
          onChange={handlePeriodChange}
          onRefresh={handleRefresh}
          onCopyLink={handleCopyLink}
        />
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar border-b border-gray-200/80">
        {TABS.map(({ key, label, icon: Icon }) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={`flex items-center gap-2.5 whitespace-nowrap px-4 py-3 rounded-xl text-xs font-bold transition-all shrink-0 border ${
                active
                  ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-xs"
                  : "bg-white text-gray-600 border-gray-200/80 hover:bg-gray-50 hover:border-gray-300"
              }`}
            >
              <Icon size={15} className={active ? "text-[#C7CCD1]" : "text-gray-400"} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div key={`${tab}-${period}-${from}-${to}-${refreshKey}`}>
        {tab === "revenue" && <RevenueTab period={period} from={from} to={to} />}
        {tab === "sales" && <SalesTab period={period} from={from} to={to} />}
        {tab === "vendors" && <VendorTab period={period} from={from} to={to} />}
        {tab === "customers" && <CustomerTab period={period} from={from} to={to} />}
        {tab === "products" && <ProductTab period={period} from={from} to={to} />}
        {tab === "returns" && <ReturnTab period={period} from={from} to={to} />}
      </div>
    </div>
  );
}

export default function AdminReports() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Platform Reports">
          <ReportsContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
