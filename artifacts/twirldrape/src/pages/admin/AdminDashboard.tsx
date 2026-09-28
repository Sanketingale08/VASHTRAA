import React, { useState } from "react";
import { useVisibilityPolling } from "@/hooks/useVisibilityPolling";
import {
  TrendingUp, ShoppingBag, Package, Users, Store,
  RotateCcw, Clock, IndianRupee, AlertTriangle, AlertCircle, RefreshCw
} from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders } from "@/lib/adminApi";

const NAVY = "#0A1F44";
const GOLD = "#C7CCD1";

interface Stats {
  totalOrders?: number;
  totalRevenue?: number;
  totalCustomers?: number;
  deliveredOrders?: number;
  cancelledOrders?: number;
  returnedOrders?: number;
  confirmedOrders?: number;
  lateAcceptanceOrders?: number;
  dispatchedOrders?: number;
  refundedRevenue?: number;
  totalProducts?: number;
  totalVendors?: number;
  approvedVendors?: number;
  activeVendors?: number;
  pendingVendors?: number;
  growthPct?: number;
  dailyRevenue?: { date: string; revenue: number; orders: number }[];
}

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
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
}

function MetricCard({ label, value, icon: Icon, iconBg, iconColor, sub, alert }: MetricCardProps) {
  return (
    <div className={`bg-white rounded-2xl border p-5 shadow-sm transition-all ${alert ? "border-amber-300" : "border-[#C7CCD1]/30"}`}>
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: iconBg }}>
          <Icon size={16} style={{ color: iconColor }} />
        </div>
      </div>
      <div className="text-2xl font-serif font-bold" style={{ color: NAVY }}>{value}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AdminErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("AdminDashboard ErrorBoundary caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-white rounded-2xl border border-red-200 p-8 shadow-sm text-center max-w-md mx-auto my-12 space-y-4">
          <div className="w-12 h-12 bg-red-100 rounded-2xl flex items-center justify-center mx-auto text-red-600">
            <AlertCircle size={24} />
          </div>
          <h2 className="font-serif font-bold text-lg text-gray-900">Dashboard Loading Error</h2>
          <p className="text-xs text-gray-500">
            {this.state.error?.message || "An unexpected error occurred while rendering the dashboard."}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, error: null });
              window.location.reload();
            }}
            className="px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer shadow-md inline-flex items-center gap-2"
            style={{ background: NAVY, color: GOLD }}
          >
            <RefreshCw size={14} /> Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const DASHBOARD_POLL_MS = 30_000;

function DashboardContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function loadStats() {
    fetch(`/api/admin/stats`, {
      headers: adminHeaders(),
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `Failed to fetch stats (HTTP ${r.status})`);
        }
        return r.json();
      })
      .then((d: Stats) => {
        setStats(d);
        setError("");
      })
      .catch((err: Error) => {
        setError(err.message || "Failed to load platform stats");
      })
      .finally(() => setLoading(false));
  }

  // Initial load + background polling (30 s), paused while tab is hidden.
  useVisibilityPolling(loadStats, DASHBOARD_POLL_MS);

  const orderStatusData = stats
    ? [
        { name: "Awaiting", value: stats.confirmedOrders ?? 0, color: "#F59E0B" },
        { name: "Dispatched", value: stats.dispatchedOrders ?? 0, color: GOLD },
        { name: "Delivered", value: stats.deliveredOrders ?? 0, color: "#10B981" },
        { name: "Cancelled", value: stats.cancelledOrders ?? 0, color: "#EF4444" },
        { name: "Returned", value: stats.returnedOrders ?? 0, color: "#8B5CF6" },
      ]
    : [];

  const dailyRevenueData = stats?.dailyRevenue ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>Platform Overview</h1>
        <p className="text-sm text-gray-400 mt-0.5">Real-time marketplace metrics</p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 h-28 animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600 flex items-center justify-between">
          <span>{error}</span>
          <button
            onClick={() => { setLoading(true); loadStats(); }}
            className="text-xs font-bold underline cursor-pointer ml-4"
          >
            Retry
          </button>
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <MetricCard label="Total Revenue" value={fmt(stats.totalRevenue ?? 0)} icon={IndianRupee}
              iconBg="rgba(199,204,209,0.12)" iconColor={GOLD} sub="All completed orders" />
            <MetricCard label="Total Orders" value={(stats.totalOrders ?? 0).toLocaleString("en-IN")} icon={ShoppingBag}
              iconBg="rgba(59,130,246,0.1)" iconColor="#3B82F6" sub={`${stats.deliveredOrders ?? 0} delivered`} />
            <MetricCard label="Products" value={(stats.totalProducts ?? 0).toLocaleString("en-IN")} icon={Package}
              iconBg="rgba(16,185,129,0.1)" iconColor="#10B981" sub="Active catalogue" />
            <MetricCard label="Customers" value={(stats.totalCustomers ?? 0).toLocaleString("en-IN")} icon={Users}
              iconBg="rgba(139,92,246,0.1)" iconColor="#8B5CF6" sub="Unique buyers" />
            <MetricCard label="Active Vendors" value={stats.activeVendors ?? 0} icon={Store}
              iconBg="rgba(13,27,54,0.08)" iconColor={NAVY} sub={`${stats.totalVendors ?? 0} total`} />
            <MetricCard label="Pending Approval" value={stats.pendingVendors ?? 0} icon={Clock}
              iconBg="rgba(245,158,11,0.1)" iconColor="#D97706" sub="Awaiting review" />
            <MetricCard label="Awaiting Acceptance" value={stats.confirmedOrders ?? 0} icon={AlertTriangle}
              iconBg="rgba(245,158,11,0.1)" iconColor="#D97706"
              sub={(stats.lateAcceptanceOrders ?? 0) > 0 ? `${stats.lateAcceptanceOrders} overdue >24h` : "Pending vendor action"}
              alert={(stats.lateAcceptanceOrders ?? 0) > 0} />
            <MetricCard label="Revenue Growth" value={`${(stats.growthPct ?? 0) > 0 ? "+" : ""}${stats.growthPct ?? 0}%`}
              icon={TrendingUp} iconBg={(stats.growthPct ?? 0) >= 0 ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)"}
              iconColor={(stats.growthPct ?? 0) >= 0 ? "#10B981" : "#EF4444"}
              sub="vs prior 30 days" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="font-serif font-bold text-base" style={{ color: NAVY }}>Daily Revenue</h2>
                  <p className="text-xs text-gray-400">Last 30 days</p>
                </div>
                <TrendingUp size={16} className="text-green-500" />
              </div>
              {dailyRevenueData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-400 text-sm">No revenue data yet</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dailyRevenueData} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9CA3AF" }}
                      tickFormatter={fmtDate} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={52} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Revenue"]} labelFormatter={fmtDate}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2}
                      dot={false} activeDot={{ r: 4, fill: GOLD }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="mb-5">
                <h2 className="font-serif font-bold text-base" style={{ color: NAVY }}>Order Status</h2>
                <p className="text-xs text-gray-400">Distribution</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={orderStatusData} layout="vertical" margin={{ top: 0, right: 10, bottom: 0, left: 0 }}>
                  <XAxis type="number" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#6B7280" }} width={68} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {orderStatusData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {(stats.refundedRevenue ?? 0) > 0 && (
            <div className="flex items-center gap-3 bg-purple-50 border border-purple-100 rounded-xl p-4">
              <RotateCcw size={16} className="text-purple-500 shrink-0" />
              <div className="text-sm">
                <span className="font-semibold text-purple-700">Refunds Processed: </span>
                <span className="text-purple-600">{fmt(stats.refundedRevenue ?? 0)}</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminDashboard() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary>
          <DashboardContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
