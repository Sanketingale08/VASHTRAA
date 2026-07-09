import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, ShoppingBag, MapPin, Package } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const CREAM = "#F5EDE0";
const IVORY = "#FAF6EE";

const PERIOD_OPTIONS = [
  { label: "7 days", value: 7 },
  { label: "30 days", value: 30 },
  { label: "90 days", value: 90 },
];

const STATUS_COLORS: Record<string, string> = {
  confirmed: "#3B82F6",
  processing: "#F97316",
  dispatched: "#8B5CF6",
  out_for_delivery: "#F59E0B",
  delivered: "#10B981",
  cancelled: "#EF4444",
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Confirmed",
  processing: "Processing",
  dispatched: "Dispatched",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

function shortDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function formatRevenue(v: number) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`;
  return `₹${v}`;
}

interface Analytics {
  dailyRevenue: { date: string; revenue: number; orders: number }[];
  ordersByStatus: Record<string, number>;
  topProducts: { productId: string; name: string; qtySold: number; revenue: number; image: string | null }[];
  customerStates: { state: string; count: number }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#C9A84C]/20 rounded-lg px-3 py-2 shadow-md text-xs">
      <p className="font-semibold mb-1" style={{ color: MAROON }}>{label}</p>
      <p>Revenue: <span className="font-bold">₹{payload[0]?.value?.toLocaleString("en-IN")}</span></p>
      {payload[1] && <p>Orders: <span className="font-bold">{payload[1]?.value}</span></p>}
    </div>
  );
};

export default function SellerAnalytics() {
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(getApiUrl(`/api/seller/analytics?period=${period}`), { credentials: "include" })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then(setData)
      .catch(() => setError("Failed to load analytics. Please try again."))
      .finally(() => setLoading(false));
  }, [period]);

  const totalRevenue = data?.dailyRevenue.reduce((s, d) => s + d.revenue, 0) ?? 0;
  const totalOrders = data ? Object.values(data.ordersByStatus).reduce((s, v) => s + v, 0) : 0;

  const pieData = data
    ? Object.entries(data.ordersByStatus).map(([status, count]) => ({
        name: STATUS_LABELS[status] ?? status,
        value: count,
        color: STATUS_COLORS[status] ?? "#9CA3AF",
      }))
    : [];

  const chartData = (data?.dailyRevenue ?? []).map((d) => ({
    ...d,
    label: shortDate(d.date),
  }));

  return (
    <SellerLayout title="Analytics">
      <div className="max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>Analytics</h2>
            <p className="text-sm text-gray-500 mt-0.5">Your store performance overview</p>
          </div>
          <div className="flex gap-1.5 bg-white rounded-lg border p-1" style={{ borderColor: "#C9A84C33" }}>
            {PERIOD_OPTIONS.map(({ label, value }) => (
              <button key={value} onClick={() => setPeriod(value)}
                className="px-3 py-1.5 text-xs font-semibold rounded-md transition-all"
                style={{ background: period === value ? MAROON : "transparent", color: period === value ? "white" : "#6B7280" }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: MAROON }} />
          </div>
        ) : error ? (
          <div className="text-center py-16 text-sm text-red-500">{error}</div>
        ) : data ? (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { icon: TrendingUp, label: `Revenue (${period}d)`, value: `₹${totalRevenue.toLocaleString("en-IN")}` },
                { icon: ShoppingBag, label: "Total Orders", value: totalOrders.toString() },
                { icon: Package, label: "Products Sold", value: data.topProducts.reduce((s, p) => s + p.qtySold, 0).toString() },
              ].map(({ icon: Icon, label, value }) => (
                <motion.div key={label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-xl border border-[#C9A84C]/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: MAROON + "15" }}>
                      <Icon size={14} style={{ color: MAROON }} />
                    </div>
                    <span className="text-xs text-gray-500 font-medium">{label}</span>
                  </div>
                  <p className="text-xl font-bold font-serif" style={{ color: MAROON }}>{value}</p>
                </motion.div>
              ))}
            </div>

            {/* Revenue Bar Chart */}
            <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
              <h3 className="font-serif text-base font-bold mb-4" style={{ color: MAROON }}>Daily Revenue</h3>
              {totalRevenue === 0 ? (
                <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No revenue data for this period</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#9CA3AF" }}
                      interval={period <= 7 ? 0 : period <= 30 ? 4 : 13} />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={formatRevenue} width={48} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="revenue" fill={MAROON} radius={[3, 3, 0, 0]} maxBarSize={32} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Orders by Status Donut */}
              <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
                <h3 className="font-serif text-base font-bold mb-4" style={{ color: MAROON }}>Orders by Status</h3>
                {pieData.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No order data yet</div>
                ) : (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                        dataKey="value" paddingAngle={2}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number, name: string) => [value, name]} />
                      <Legend formatter={(value) => <span style={{ fontSize: 11, color: "#6B7280" }}>{value}</span>} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Customer States */}
              <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
                <div className="flex items-center gap-2 mb-4">
                  <MapPin size={14} style={{ color: MAROON }} />
                  <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>Customers by State</h3>
                </div>
                {data.customerStates.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-gray-400 text-sm">No data yet</div>
                ) : (
                  <div className="space-y-2.5 mt-1">
                    {data.customerStates.slice(0, 8).map(({ state, count }, i) => {
                      const max = data.customerStates[0].count;
                      return (
                        <div key={state}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="font-medium text-gray-700">{state}</span>
                            <span className="text-gray-500">{count} order{count !== 1 ? "s" : ""}</span>
                          </div>
                          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <motion.div className="h-full rounded-full" style={{ background: MAROON }}
                              initial={{ width: 0 }} animate={{ width: `${(count / max) * 100}%` }}
                              transition={{ delay: i * 0.05, duration: 0.5 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Top Products */}
            <div className="bg-white rounded-xl border border-[#C9A84C]/20 p-5">
              <h3 className="font-serif text-base font-bold mb-4" style={{ color: MAROON }}>Top Products</h3>
              {data.topProducts.length === 0 ? (
                <div className="text-center py-10 text-gray-400 text-sm">No sales data yet</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b" style={{ borderColor: "#C9A84C22" }}>
                      <th className="text-left pb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Product</th>
                      <th className="text-right pb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Units Sold</th>
                      <th className="text-right pb-3 text-xs font-bold uppercase tracking-wider text-gray-500">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((p, i) => (
                      <tr key={p.productId} className="border-b last:border-b-0" style={{ borderColor: "#F3F4F6" }}>
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 w-4 text-center font-bold">{i + 1}</span>
                            {p.image ? (
                              <img src={p.image} alt={p.name} className="w-9 h-9 rounded-lg object-cover shrink-0" />
                            ) : (
                              <div className="w-9 h-9 rounded-lg shrink-0" style={{ background: CREAM }} />
                            )}
                            <span className="font-medium text-gray-800 truncate max-w-[180px]">{p.name}</span>
                          </div>
                        </td>
                        <td className="py-3 text-right font-semibold text-gray-700">{p.qtySold}</td>
                        <td className="py-3 text-right font-bold" style={{ color: MAROON }}>
                          ₹{p.revenue.toLocaleString("en-IN")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        ) : null}
      </div>
    </SellerLayout>
  );
}
