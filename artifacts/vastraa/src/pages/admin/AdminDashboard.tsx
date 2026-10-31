import React, { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import {
  TrendingUp, TrendingDown, ShoppingBag, Package, Users, Store,
  RotateCcw, Clock, IndianRupee, AlertTriangle, RefreshCw,
  ChevronRight, Activity, BarChart2, FileText, ArrowRight
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminFetch } from "@/lib/adminApi";
import { AdminErrorBoundary, AdminErrorState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";
import { DashboardStatsSkeleton, ChartSkeleton } from "@/components/skeletons";

const NAVY = "#0A1F44";
const DASHBOARD_POLL_MS = 30000;

interface Stats {
  totalOrders?: number;
  totalRevenue?: number;
  totalCustomers?: number;
  totalUsers?: number;
  deliveredOrders?: number;
  cancelledOrders?: number;
  returnedOrders?: number;
  confirmedOrders?: number;
  lateAcceptanceOrders?: number;
  dispatchedOrders?: number;
  refundedRevenue?: number;
  totalProducts?: number;
  activeProducts?: number;
  totalVendors?: number;
  approvedVendors?: number;
  activeVendors?: number;
  pendingVendors?: number;
  growthPct?: number;
  dailyRevenue?: { date: string; revenue: number; orders: number }[];
}

function fmt(n: number | null | undefined) {
  const val = Number(n ?? 0);
  if (isNaN(val)) return "₹0";
  if (val >= 10000000) return `₹${(val / 10000000).toFixed(2)} Cr`;
  if (val >= 100000) return `₹${(val / 100000).toFixed(2)} L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(1)} K`;
  return `₹${val.toLocaleString("en-IN")}`;
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  } catch {
    return d;
  }
}

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  sub?: string;
  alert?: boolean;
  trend?: string;
  trendUp?: boolean;
  onClick?: () => void;
}

function MetricCard({ label, value, icon: Icon, iconBg, iconColor, sub, alert, trend, trendUp, onClick }: MetricCardProps) {
  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:shadow-md relative overflow-hidden group ${
        onClick ? "cursor-pointer" : ""
      } ${alert ? "border-amber-300 ring-2 ring-amber-100" : "border-gray-200/80 hover:border-[#C7CCD1]"}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{label}</span>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105" style={{ background: iconBg }}>
          <Icon size={18} style={{ color: iconColor }} />
        </div>
      </div>
      
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl lg:text-3xl font-serif font-bold tracking-tight" style={{ color: NAVY }}>
          {value}
        </div>
        {trend && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold px-2 py-0.5 rounded-full ${
            trendUp ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}>
            {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {trend}
          </span>
        )}
      </div>

      {sub && (
        <div className="text-xs text-gray-500 mt-2 flex items-center justify-between pt-2 border-t border-gray-100">
          <span>{sub}</span>
          {onClick && <ChevronRight size={14} className="text-gray-400 group-hover:translate-x-0.5 transition-transform" />}
        </div>
      )}
    </div>
  );
}

function CustomTooltip({ active, payload, label }: any) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-[#0A1F44] text-white p-3 rounded-xl shadow-xl border border-white/10 text-xs">
        <p className="font-bold text-gray-300 mb-1">{fmtDate(label)}</p>
        <p className="text-emerald-400 font-semibold text-sm">Revenue: {fmt(data.revenue)}</p>
        <p className="text-gray-300 mt-0.5">Orders: {data.orders}</p>
      </div>
    );
  }
  return null;
}

function DashboardContent() {
  const [, setLocation] = useLocation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  function loadStats(showSpinner = false) {
    if (showSpinner) setIsRefreshing(true);
    adminFetch("/api/admin/stats")
      .then((d: Stats) => {
        setStats(d);
        setError("");
        setLastUpdated(new Date());
      })
      .catch((err: any) => {
        setError(getFriendlyErrorMessage(err, "Dashboard statistics"));
      })
      .finally(() => {
        setLoading(false);
        setIsRefreshing(false);
      });
  }

  // Initial load on mount
  useEffect(() => {
    loadStats(false);
  }, []);

  useEffect(() => {
    const handleRealtime = () => {
      loadStats(false);
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, []);

  const totalOrdersCount = stats?.totalOrders || 1;
  const orderStatusData = stats
    ? [
        { name: "Awaiting", value: stats.confirmedOrders ?? 0, color: "#F59E0B" },
        { name: "Dispatched", value: stats.dispatchedOrders ?? 0, color: "#3B82F6" },
        { name: "Delivered", value: stats.deliveredOrders ?? 0, color: "#10B981" },
        { name: "Cancelled", value: stats.cancelledOrders ?? 0, color: "#EF4444" },
        { name: "Returned", value: stats.returnedOrders ?? 0, color: "#8B5CF6" },
      ]
    : [];

  const dailyRevenueData = stats?.dailyRevenue ?? [];

  return (
    <div className="space-y-8 pb-8">
      {/* ── Header & Control Bar ────────────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Live Marketplace
            </span>
            {lastUpdated && (
              <span className="text-xs text-gray-400">
                Updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-serif font-bold text-[#0A1F44] mt-1.5">Platform Overview</h1>
          <p className="text-xs text-gray-500">Real-time marketplace revenue, seller activity, and order metrics</p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadStats(true)}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-gray-50 text-gray-700 border border-gray-200 hover:bg-gray-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin text-[#0A1F44]" : "text-gray-500"} />
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* ── Loading Skeleton ───────────────────────────────────────────── */}
      {loading && (
        <div className="space-y-6" role="status" aria-busy="true" aria-label="Loading admin dashboard statistics">
          <DashboardStatsSkeleton count={8} />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <ChartSkeleton height={320} />
            </div>
            <div>
              <ChartSkeleton height={320} />
            </div>
          </div>
        </div>
      )}

      {/* ── Error Banner ────────────────────────────────────────────────── */}
      {error && (
        <AdminErrorState
          title="Unable to load dashboard statistics"
          message={error}
          onRetry={() => { setLoading(true); loadStats(true); }}
          compact
        />
      )}

      {/* ── Stats & Charts Content ──────────────────────────────────────── */}
      {stats && (
        <>
          {/* ── Primary Financial & Operational Metrics Grid ───────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Total Revenue"
              value={fmt(stats.totalRevenue ?? 0)}
              icon={IndianRupee}
              iconBg="rgba(199,204,209,0.18)"
              iconColor="#0A1F44"
              sub="Completed & active sales"
              trend={`${(stats.growthPct ?? 0) >= 0 ? "+" : ""}${stats.growthPct ?? 0}%`}
              trendUp={(stats.growthPct ?? 0) >= 0}
              onClick={() => setLocation("/admin/financial")}
            />
            <MetricCard
              label="Total Orders"
              value={(stats.totalOrders ?? 0).toLocaleString("en-IN")}
              icon={ShoppingBag}
              iconBg="rgba(59,130,246,0.1)"
              iconColor="#3B82F6"
              sub={`${(stats.deliveredOrders ?? 0).toLocaleString("en-IN")} delivered`}
              onClick={() => setLocation("/admin/orders")}
            />
            <MetricCard
              label="Catalogue Products"
              value={(stats.totalProducts ?? 0).toLocaleString("en-IN")}
              icon={Package}
              iconBg="rgba(16,185,129,0.1)"
              iconColor="#10B981"
              sub={`${stats.activeProducts ?? 0} active listings`}
              onClick={() => setLocation("/admin/products")}
            />
            <MetricCard
              label="Active Vendors"
              value={stats.activeVendors ?? 0}
              icon={Store}
              iconBg="rgba(13,27,54,0.08)"
              iconColor="#0A1F44"
              sub={`${stats.totalVendors ?? 0} registered shops`}
              onClick={() => setLocation("/admin/vendors")}
            />
          </div>

          {/* ── Secondary Operational Metrics Grid ──────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard
              label="Customers"
              value={(stats.totalCustomers ?? 0).toLocaleString("en-IN")}
              icon={Users}
              iconBg="rgba(139,92,246,0.1)"
              iconColor="#8B5CF6"
              sub="Registered buyers"
            />
            <MetricCard
              label="Pending Vendors"
              value={stats.pendingVendors ?? 0}
              icon={Clock}
              iconBg="rgba(245,158,11,0.1)"
              iconColor="#D97706"
              sub="Awaiting verification"
              alert={(stats.pendingVendors ?? 0) > 0}
              onClick={() => setLocation("/admin/vendors?status=pending")}
            />
            <MetricCard
              label="Awaiting Acceptance"
              value={stats.confirmedOrders ?? 0}
              icon={AlertTriangle}
              iconBg="rgba(245,158,11,0.1)"
              iconColor="#D97706"
              sub={(stats.lateAcceptanceOrders ?? 0) > 0 ? `⚠️ ${stats.lateAcceptanceOrders} overdue >24h` : "Pending vendor dispatch"}
              alert={(stats.lateAcceptanceOrders ?? 0) > 0}
              onClick={() => setLocation("/admin/orders?status=confirmed")}
            />
            <MetricCard
              label="30-Day Growth"
              value={`${(stats.growthPct ?? 0) >= 0 ? "+" : ""}${stats.growthPct ?? 0}%`}
              icon={TrendingUp}
              iconBg={(stats.growthPct ?? 0) >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"}
              iconColor={(stats.growthPct ?? 0) >= 0 ? "#10B981" : "#EF4444"}
              sub="Compared to prior 30d"
              onClick={() => setLocation("/admin/business-intelligence")}
            />
          </div>

          {/* ── Charts & Visualizations ────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Daily Revenue Area Chart */}
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col justify-between">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="font-serif font-bold text-lg text-[#0A1F44]">Daily Revenue Trend</h2>
                  <p className="text-xs text-gray-500">Sales velocity over the last 30 days</p>
                </div>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-xs text-gray-600 font-medium">
                  <Activity size={14} className="text-emerald-600" />
                  <span>30 Days Velocity</span>
                </div>
              </div>

              {dailyRevenueData.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                  <BarChart2 size={32} className="mb-2 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No revenue data recorded yet</p>
                  <p className="text-xs text-gray-400 mt-0.5">Completed orders will populate the chart graph.</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={dailyRevenueData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0A1F44" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0A1F44" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={fmtDate}
                      interval="preserveStartEnd"
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#6B7280" }}
                      tickFormatter={fmt}
                      width={56}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#0A1F44"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueGrad)"
                      activeDot={{ r: 5, fill: "#0A1F44", stroke: "#fff", strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Order Status Distribution */}
            <div className="bg-white rounded-2xl border border-gray-200/80 p-6 shadow-xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-serif font-bold text-lg text-[#0A1F44]">Order Status</h2>
                    <p className="text-xs text-gray-500">Distribution by fulfillment phase</p>
                  </div>
                </div>

                <div className="space-y-3.5 mb-6">
                  {orderStatusData.map((item) => {
                    const pct = Math.round((item.value / totalOrdersCount) * 100);
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-gray-700 flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ background: item.color }} />
                            {item.name}
                          </span>
                          <span className="font-bold text-gray-900">
                            {item.value} <span className="font-normal text-gray-400">({pct}%)</span>
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.max(3, pct)}%`, background: item.color }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-xs text-gray-500">View detailed order list</span>
                <button
                  onClick={() => setLocation("/admin/orders")}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#0A1F44] hover:underline"
                >
                  Manage Orders <ArrowRight size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* ── Refunds & Alert Banner ─────────────────────────────────────── */}
          {(stats.refundedRevenue ?? 0) > 0 && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-purple-50/80 border border-purple-200/80 rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <RotateCcw size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-purple-900 text-sm">Refunds Processed</h4>
                  <p className="text-xs text-purple-700 mt-0.5">
                    A total of <span className="font-bold">{fmt(stats.refundedRevenue ?? 0)}</span> has been refunded to buyers for returned or cancelled items.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setLocation("/admin/returns")}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 transition-colors shadow-xs shrink-0"
              >
                Review Returns & Refunds
              </button>
            </div>
          )}

          {/* ── Admin Management Shortcuts Footer Bar ──────────────────────── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[
              { label: "Vendor Approvals", desc: `${stats.pendingVendors ?? 0} pending`, href: "/admin/vendors?status=pending", icon: Store },
              { label: "Products Catalogue", desc: `${stats.totalProducts ?? 0} total products`, href: "/admin/products", icon: Package },
              { label: "Financial Reports", desc: "Statements & payouts", href: "/admin/financial", icon: FileText },
              { label: "System Reports", desc: "Analytics & export", href: "/admin/reports", icon: BarChart2 },
            ].map((shortcut) => (
              <button
                key={shortcut.label}
                onClick={() => setLocation(shortcut.href)}
                className="flex items-center gap-3 bg-white border border-gray-200/80 p-4 rounded-xl text-left hover:border-[#0A1F44] hover:shadow-xs transition-all group"
              >
                <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center text-[#0A1F44] group-hover:bg-[#0A1F44] group-hover:text-white transition-colors shrink-0">
                  <shortcut.icon size={16} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-gray-900 truncate">{shortcut.label}</p>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">{shortcut.desc}</p>
                </div>
                <ChevronRight size={14} className="text-gray-300 group-hover:text-[#0A1F44] group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Dashboard statistics">
          <DashboardContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
