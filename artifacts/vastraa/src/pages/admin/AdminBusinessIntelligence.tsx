import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  TrendingUp, TrendingDown, IndianRupee, ShoppingBag, Package, Users, Store,
  Award, LineChart as LineChartIcon, RefreshCw,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, AreaChart, Area,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { AdminErrorBoundary, AdminErrorState, AdminEmptyState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
import { adminHeaders, adminKey } from '@/lib/adminApi';
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";

type Period = "daily" | "weekly" | "monthly" | "yearly" | "custom";

interface Overview {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  totalVendors: number;
  totalProfit: number;
  totalRefundAmount: number;
  marketplaceGrowthPercent: number;
  orderGrowthPercent: number;
  activeCustomersInPeriod: number;
}

interface VendorRow { id: string; name: string; shopCity: string; totalRevenue: number; totalOrders: number; productsSold: number; rating: number; performanceScore: number; performanceBadge: string; fulfillmentRate: number }
interface ProductRow { id: string; name: string; vendorName: string; category: string; unitsSold: number; revenue: number; rating: number; stock: number }
interface ViewedProductRow { id: string; name: string; totalViews: number; vendorName: string; category: string; conversionRate: number; wishlistCount: number }
interface SearchTermRow { term: string; searchCount: number; resultCount: number; availability: string }
interface ShopRow { id: string; shopName: string; totalRevenue: number; totalOrders: number; averageOrderValue: number; rating: number; performanceScore: number }

interface BIData {
  period: Period;
  range: { from: string; to: string };
  overview: Overview;
  topVendors: VendorRow[];
  topProducts: ProductRow[];
  mostViewedProducts: ViewedProductRow[];
  mostSearchedProducts: SearchTermRow[];
  trendingKeywords: string[];
  highestRevenueShops: ShopRow[];
  customerGrowth: { newRegistrations: number; activeCustomers: number; returningCustomers: number; retentionRate: number; trend: { period: string; count: number }[] };
  vendorGrowth: { newRegistrations: number; activeVendors: number; pendingApprovals: number; suspendedVendors: number; trend: { period: string; count: number }[] };
  revenueGrowth: { currentPeriodRevenue: number; previousPeriodRevenue: number; growthPercent: number; trend: { period: string; revenue: number }[] };
  salesTrends: { totalOrders: number; productsSold: number; averageOrderValue: number; salesByCategory: { category: string; orders: number; unitsSold: number; revenue: number }[]; salesByVendor: { vendorId: string; vendorName: string; orders: number; revenue: number }[] };
  returnTrends: { totalReturns: number; returnRate: number; returnReasons: { reason: string; count: number }[]; refundAmount: number; topReturnedProducts: { productId: string; name: string; count: number }[]; topReturnVendors: { vendorId: string; name: string; count: number }[]; trend: { period: string; count: number }[] };
  dataValidation?: { hasInconsistencies: boolean; warning: string | null };
}

function fmt(n: number) {
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

function fmtBucket(b: string) {
  if (/^\d{4}$/.test(b)) return b;
  if (/^\d{4}-\d{2}$/.test(b)) return new Date(`${b}-01`).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
  const d = new Date(b);
  if (!isNaN(d.getTime())) return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return b;
}

const PERIODS: { value: Period; label: string }[] = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "custom", label: "Custom" },
];

function KpiCard({ label, value, icon: Icon, growth, sub }: { label: string; value: string; icon: React.ElementType; growth?: number; sub?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-start justify-between mb-4">
        <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
        <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(199,204,209,0.12)" }}>
          <Icon size={16} style={{ color: GOLD }} />
        </div>
      </div>
      <div className="text-2xl font-serif font-bold" style={{ color: NAVY }}>{value}</div>
      <div className="flex items-center gap-1.5 mt-1">
        {growth !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${growth >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {growth >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {Math.abs(growth).toFixed(1)}%
          </span>
        )}
        {sub && <span className="text-xs text-gray-400">{sub}</span>}
      </div>
    </div>
  );
}

function TrendCard({ title, data, dataKey, color, currency }: { title: string; data: { period: string; [k: string]: any }[]; dataKey: string; color: string; currency?: boolean }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>{title}</h3>
      {(!data || data.length === 0) ? (
        <div className="h-48 flex items-center justify-center text-xs text-gray-400">No data for this period</div>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={data.map((d) => ({ ...d, label: fmtBucket(d.period) }))}>
            <defs>
              <linearGradient id={`grad-${title.replace(/\s/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false}
              tickFormatter={(v) => (currency ? fmt(v) : String(v))} />
            <Tooltip formatter={(v: number) => (currency ? fmt(v) : v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#grad-${title.replace(/\s/g, "")})`} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function BusinessIntelligenceContent() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<Period>("monthly");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<BIData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [productSort, setProductSort] = useState<"revenue" | "unitsSold" | "rating" | "category">("revenue");


  const query = useMemo(() => {
    const p = new URLSearchParams();
    p.set("period", period === "custom" ? "monthly" : period);
    if (period === "custom" && from) p.set("from", from);
    if (period === "custom" && to) p.set("to", to);
    return p.toString();
  }, [period, from, to]);

  function load() {
    if (!adminKey()) return;
    if (period === "custom" && (!from || !to)) return;
    setLoading(true);
    fetch(`/api/admin/bi/dashboard?${query}`, {
      headers: adminHeaders(),
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const err: any = new Error(body.error || `HTTP ${r.status}`);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then((d) => { setData(d); setError(""); })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Business intelligence")))
      .finally(() => setLoading(false));
  }

  // Immediate fetch when query changes (initial load + filter changes).
  useEffect(() => { load(); }, [query]);

  const ov = data?.overview;

  const sortedTopProducts = useMemo(() => {
    if (!data?.topProducts) return [];
    const rows = [...data.topProducts];
    rows.sort((a, b) => {
      if (productSort === "category") return (a.category ?? "").localeCompare(b.category ?? "");
      if (productSort === "unitsSold") return b.unitsSold - a.unitsSold;
      if (productSort === "rating") return (b.rating ?? 0) - (a.rating ?? 0);
      return b.revenue - a.revenue;
    });
    return rows;
  }, [data, productSort]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <LineChartIcon size={20} style={{ color: GOLD }} /> Business Intelligence
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {data?.range ? `${new Date(data.range.from).toLocaleDateString("en-IN")} – ${new Date(data.range.to).toLocaleDateString("en-IN")}` : "Loading…"}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors shadow-xs"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-[#0D1B36]" : "text-gray-500"} />
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setPeriod(p.value)}
                className="px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors"
                style={{ background: period === p.value ? NAVY : "transparent", color: period === p.value ? "white" : "#6b7280" }}
              >
                {p.label}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
            </>
          )}
        </div>
      </div>

      {data?.dataValidation?.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 text-xs text-amber-800 flex items-center gap-2">
          <span>ℹ️</span>
          <span>{data.dataValidation.warning}</span>
        </div>
      )}

      {error && (
        <AdminErrorState
          title="Business intelligence data is temporarily unavailable"
          message={error}
          onRetry={load}
          compact
        />
      )}

      {loading && !data && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 h-28 animate-pulse" />
          ))}
        </div>
      )}

      {ov && data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Revenue" value={fmt(ov.totalRevenue)} icon={IndianRupee} growth={ov.marketplaceGrowthPercent} sub="vs previous period" />
            <KpiCard label="Total Orders" value={ov.totalOrders.toLocaleString("en-IN")} icon={ShoppingBag} growth={ov.orderGrowthPercent} sub="vs previous period" />
            <KpiCard label="Total Profit" value={fmt(ov.totalProfit)} icon={TrendingUp} sub="commission earnings" />
            <KpiCard label="Refunds" value={fmt(ov.totalRefundAmount)} icon={TrendingDown} sub="returned amount" />
            <KpiCard label="Products" value={ov.totalProducts.toLocaleString("en-IN")} icon={Package} sub="active listings" />
            <KpiCard label="Customers" value={ov.totalCustomers.toLocaleString("en-IN")} icon={Users} sub={`${ov.activeCustomersInPeriod} active this period`} />
            <KpiCard label="Vendors" value={(ov.totalVendors ?? 0).toLocaleString("en-IN")} icon={Store} sub={`${data.vendorGrowth?.activeVendors ?? 0} active`} />
            <KpiCard label="Avg Order Value" value={fmt(data.salesTrends?.averageOrderValue ?? 0)} icon={Award} sub="per order" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TrendCard title="Revenue Trend" data={data.revenueGrowth?.trend ?? []} dataKey="revenue" color={GOLD} currency />
            <TrendCard title="Customer Growth" data={data.customerGrowth?.trend ?? []} dataKey="count" color="#10B981" />
            <TrendCard title="Vendor Growth" data={data.vendorGrowth?.trend ?? []} dataKey="count" color="#8B5CF6" />
            <TrendCard title="Return Trend" data={data.returnTrends?.trend ?? []} dataKey="count" color="#EF4444" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Top Vendors</h3>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {(data.topVendors ?? []).length === 0 && <div className="py-8 text-center text-xs text-gray-400">No data</div>}
                {(data.topVendors ?? []).map((v, i) => (
                  <div key={v.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60 cursor-pointer" onClick={() => setLocation(`/admin/vendor-analytics/${v.id}`)}>
                    <span className="text-xs font-bold w-5 text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: NAVY }}>{v.name}</div>
                      <div className="text-xs text-gray-400">{v.shopCity} · {v.totalOrders} orders</div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: NAVY }}>{fmt(v.totalRevenue)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-2 flex-wrap">
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Top Products</h3>
                <div className="flex items-center gap-1">
                  {([
                    { key: "revenue", label: "Revenue" },
                    { key: "unitsSold", label: "Units" },
                    { key: "rating", label: "Rating" },
                    { key: "category", label: "Category" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setProductSort(opt.key)}
                      className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition ${productSort === opt.key ? "text-white" : "text-gray-500 hover:bg-gray-100"}`}
                      style={productSort === opt.key ? { background: NAVY } : undefined}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="divide-y divide-gray-50 max-h-96 overflow-y-auto">
                {sortedTopProducts.length === 0 && <div className="py-8 text-center text-xs text-gray-400">No sales in this period</div>}
                {sortedTopProducts.map((p, i) => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60">
                    <span className="text-xs font-bold w-5 text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: NAVY }}>{p.name}</div>
                      <div className="text-xs text-gray-400">{p.vendorName} · {p.category} · {p.unitsSold} sold · ★{(p.rating ?? 0).toFixed(1)}</div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: NAVY }}>{fmt(p.revenue)}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Most Viewed Products</h3>
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {(data.mostViewedProducts ?? []).length === 0 && <div className="py-8 text-center text-xs text-gray-400">No view data yet</div>}
                {(data.mostViewedProducts ?? []).slice(0, 10).map((p, i) => (
                  <div key={p.id} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60">
                    <span className="text-xs font-bold w-5 text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold truncate" style={{ color: NAVY }}>{p.name}</div>
                      <div className="text-xs text-gray-400">{p.vendorName} · {p.conversionRate}% conversion</div>
                    </div>
                    <div className="text-sm font-semibold" style={{ color: NAVY }}>{p.totalViews}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Most Searched Keywords</h3>
              </div>
              <div className="divide-y divide-gray-50 max-h-72 overflow-y-auto">
                {(data.mostSearchedProducts ?? []).length === 0 && <div className="py-8 text-center text-xs text-gray-400">No search data yet</div>}
                {(data.mostSearchedProducts ?? []).slice(0, 10).map((k, i) => (
                  <div key={k.term} className="px-5 py-3 flex items-center gap-3 hover:bg-gray-50/60">
                    <span className="text-xs font-bold w-5 text-gray-300">{i + 1}</span>
                    <div className="flex-1 min-w-0 text-sm font-semibold truncate" style={{ color: NAVY }}>{k.term}</div>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: k.availability === "In Stock" ? "#f0fdf4" : "#fef2f2", color: k.availability === "In Stock" ? "#15803d" : "#b91c1c" }}>{k.availability}</span>
                    <div className="text-xs font-semibold text-gray-400">{k.searchCount} searches</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold" style={{ color: NAVY }}>Highest Revenue Shops</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={(data.highestRevenueShops ?? []).map((s) => ({ name: s.shopName.length > 14 ? s.shopName.slice(0, 14) + "…" : s.shopName, revenue: s.totalRevenue }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                <Bar dataKey="revenue" fill={GOLD} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminBusinessIntelligence() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Business Intelligence">
          <BusinessIntelligenceContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
