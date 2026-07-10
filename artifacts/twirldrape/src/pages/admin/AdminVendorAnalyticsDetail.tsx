import React, { useEffect, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, MapPin, Mail, FileText, Star, Package, ShoppingBag,
  CheckCircle, Clock, XCircle, Truck, RotateCcw, IndianRupee, BadgeCheck,
  Phone, Landmark, Home, Users, TrendingUp, Wallet,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Line, LineChart,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

interface AnalyticsDetail {
  shop: {
    id: string; name: string; location: string; bio: string | null; tagline: string | null;
    avatar: string; contactEmail: string | null; mobile: string | null; gstin: string | null;
    status: string; registeredAt: string | null;
    shopStreet: string | null; shopCity: string | null; shopState: string | null; shopPincode: string | null;
  };
  verification: {
    kycVerified: boolean; kycResubmissionRequested: boolean;
    panVerified: boolean; panNumber: string | null; panCardUrl: string | null;
    gstVerified: boolean; gstCertUrl: string | null;
    bankVerified: boolean; bankHolder: string | null; bankName: string | null; bankAccount: string | null; bankIfsc: string | null;
  };
  products: { total: number; active: number; inactive: number; featured: number; outOfStock: number; lowStock: number };
  orders: { received: number; confirmed: number; dispatched: number; delivered: number; cancelled: number; returned: number; statusFunnel: Record<string, number> };
  revenue: { gross: number; net: number; commission: number; refunded: number; pendingSettlement: number; completedSettlement: number; granularity: string; trend: { period: string; revenue: number; orders: number }[] };
  customers: { total: number; new30d: number; repeat: number; avgRating: number; reviewCount: number; ratingDistribution: Record<string, number> };
  performanceScore: {
    score: number; badge: string; fulfillmentRate: number; ratingScore: number;
    cancellationRate: number; returnRate: number; inventoryAvailability: number; responseScore: number;
  };
  settlements: { id: string; amount: number; type: string; status: string; note: string | null; createdAt: string }[];
}

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

const BADGE_META: Record<string, { bg: string; color: string }> = {
  Excellent: { bg: "#f0fdf4", color: "#15803d" },
  Good: { bg: "#eff6ff", color: "#1d4ed8" },
  Average: { bg: "#fffbeb", color: "#b45309" },
  "Needs Improvement": { bg: "#fef2f2", color: "#b91c1c" },
};

const VERIFICATION_FIELDS: { key: "kyc" | "pan" | "gst" | "bank"; label: string; verified: (d: AnalyticsDetail) => boolean }[] = [
  { key: "kyc", label: "KYC", verified: (d) => d.verification.kycVerified },
  { key: "pan", label: "PAN", verified: (d) => d.verification.panVerified },
  { key: "gst", label: "GST", verified: (d) => d.verification.gstVerified },
  { key: "bank", label: "Bank", verified: (d) => d.verification.bankVerified },
];

const ORDER_STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  confirmed: { label: "Confirmed", color: "#3B82F6", icon: <Clock size={14} /> },
  dispatched: { label: "Dispatched", color: GOLD, icon: <Truck size={14} /> },
  delivered: { label: "Delivered", color: "#10B981", icon: <CheckCircle size={14} /> },
  cancelled: { label: "Cancelled", color: "#EF4444", icon: <XCircle size={14} /> },
  returned: { label: "Returned", color: "#8B5CF6", icon: <RotateCcw size={14} /> },
};

const GRANULARITIES = ["daily", "weekly", "monthly", "yearly"] as const;

function DetailContent() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [data, setData] = useState<AnalyticsDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [granularity, setGranularity] = useState<typeof GRANULARITIES[number]>("monthly");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementNote, setSettlementNote] = useState("");
  const [settlementBusy, setSettlementBusy] = useState(false);

  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function load() {
    if (!id || !adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/vendor-analytics/${id}?granularity=${granularity}`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setData(d); setError(""); })
      .catch(() => setError("Failed to load vendor analytics"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [id, granularity, adminKey]);
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [id, granularity, adminKey]);

  async function doVerification(field: "kyc" | "pan" | "gst" | "bank", action: "verify" | "reject" | "request_documents") {
    if (!id) return;
    setActionLoading(field + action);
    try {
      const res = await fetch(`${basePath}/api/admin/vendor-analytics/${id}/verification`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ field, action }),
      });
      if (res.ok) load();
    } finally {
      setActionLoading(null);
    }
  }

  async function releaseSettlement(type: "release" | "payout") {
    if (!id || !settlementAmount) return;
    setSettlementBusy(true);
    try {
      const res = await fetch(`${basePath}/api/admin/vendor-analytics/${id}/settlements`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: Number(settlementAmount), type, note: settlementNote || undefined }),
      });
      if (res.ok) {
        setSettlementAmount("");
        setSettlementNote("");
        load();
      }
    } finally {
      setSettlementBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => setLocation("/admin/vendor-analytics")} className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all">
          <ArrowLeft size={16} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>
            {data?.shop.name ?? "Vendor Analytics"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Full analytics, verification & settlements · auto-refreshes every 15s</p>
        </div>
      </div>

      {loading && !data && (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center text-gray-400 text-sm animate-pulse">
          Loading vendor analytics…
        </div>
      )}
      {error && <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>}

      {data && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-start gap-4 mb-5">
                <img src={data.shop.avatar} alt={data.shop.name} className="w-14 h-14 rounded-xl object-cover border border-gray-100"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }} />
                <div className="flex-1 min-w-0">
                  <h2 className="font-serif font-bold text-base" style={{ color: NAVY }}>{data.shop.name}</h2>
                  {data.shop.tagline && <p className="text-xs text-gray-500 mt-0.5 italic">{data.shop.tagline}</p>}
                </div>
              </div>
              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5 text-gray-600">
                  <MapPin size={13} className="shrink-0 text-gray-400" />
                  <span className="text-xs">{data.shop.location}</span>
                </div>
                {data.shop.contactEmail && (
                  <div className="flex items-center gap-2.5 text-gray-600">
                    <Mail size={13} className="shrink-0 text-gray-400" />
                    <span className="text-xs truncate">{data.shop.contactEmail}</span>
                  </div>
                )}
              </div>
              {data.shop.bio && <p className="text-xs text-gray-500 mt-4 leading-relaxed border-t border-gray-100 pt-4">{data.shop.bio}</p>}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">Performance Score</h3>
                <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{
                  background: (BADGE_META[data.performanceScore.badge] ?? BADGE_META.Average).bg,
                  color: (BADGE_META[data.performanceScore.badge] ?? BADGE_META.Average).color,
                }}>{data.performanceScore.badge}</span>
              </div>
              <div className="text-3xl font-serif font-bold mb-3" style={{ color: NAVY }}>{data.performanceScore.score}%</div>
              <div className="space-y-2 text-xs">
                {[
                  ["Fulfillment", data.performanceScore.fulfillmentRate],
                  ["Rating", data.performanceScore.ratingScore],
                  ["Low cancellation", 100 - data.performanceScore.cancellationRate],
                  ["Low returns", 100 - data.performanceScore.returnRate],
                  ["Inventory availability", data.performanceScore.inventoryAvailability],
                  ["Response time", data.performanceScore.responseScore],
                ].map(([label, val]) => (
                  <div key={label as string} className="flex items-center gap-2">
                    <span className="text-gray-500 w-32 shrink-0">{label}</span>
                    <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${val}%`, background: GOLD }} />
                    </div>
                    <span className="text-gray-400 w-8 text-right">{val}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Verification Controls</h3>
              {VERIFICATION_FIELDS.map(({ key, label, verified }) => (
                <div key={key} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-b-0">
                  <div>
                    <span className="text-xs font-semibold text-gray-700">{label}</span>
                    <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded"
                      style={{ background: verified(data) ? "#f0fdf4" : "#f3f4f6", color: verified(data) ? "#15803d" : "#9ca3af" }}>
                      {verified(data) ? "Verified" : "Pending"}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      disabled={actionLoading === key + "verify" || verified(data)}
                      onClick={() => doVerification(key, "verify")}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md disabled:opacity-40"
                      style={{ background: "#f0fdf4", color: "#15803d" }}
                    >
                      Verify
                    </button>
                    <button
                      disabled={actionLoading === key + "request_documents"}
                      onClick={() => doVerification(key, "request_documents")}
                      className="text-[10px] font-semibold px-2 py-1 rounded-md disabled:opacity-40"
                      style={{ background: "#fffbeb", color: "#b45309" }}
                    >
                      Request docs
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-1 flex items-center gap-1.5">
                <Wallet size={12} /> Settlements
              </h3>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Pending</span>
                <span className="font-semibold" style={{ color: NAVY }}>{fmt(data.revenue.pendingSettlement)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Completed</span>
                <span className="font-semibold" style={{ color: NAVY }}>{fmt(data.revenue.completedSettlement)}</span>
              </div>
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <input
                  type="number"
                  value={settlementAmount}
                  onChange={(e) => setSettlementAmount(e.target.value)}
                  placeholder="Amount (₹)"
                  className="w-full text-xs px-2.5 py-2 rounded-lg border border-gray-200"
                />
                <input
                  value={settlementNote}
                  onChange={(e) => setSettlementNote(e.target.value)}
                  placeholder="Note (optional)"
                  className="w-full text-xs px-2.5 py-2 rounded-lg border border-gray-200"
                />
                <div className="flex gap-2">
                  <button
                    disabled={settlementBusy || !settlementAmount}
                    onClick={() => releaseSettlement("release")}
                    className="flex-1 text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
                    style={{ background: "#eff6ff", color: "#1d4ed8" }}
                  >
                    {settlementBusy ? "…" : "Release settlement"}
                  </button>
                  <button
                    disabled={settlementBusy || !settlementAmount}
                    onClick={() => releaseSettlement("payout")}
                    className="flex-1 text-xs font-semibold py-2 rounded-lg disabled:opacity-50"
                    style={{ background: "#f0fdf4", color: "#15803d" }}
                  >
                    {settlementBusy ? "…" : "Record payout"}
                  </button>
                </div>
              </div>
              {data.settlements.length > 0 && (
                <div className="pt-2 border-t border-gray-100 space-y-1.5 max-h-32 overflow-y-auto">
                  {data.settlements.map((s) => (
                    <div key={s.id} className="flex justify-between text-[11px]">
                      <span className="text-gray-500 capitalize">{s.type} · {new Date(s.createdAt).toLocaleDateString("en-IN")}</span>
                      <span className="font-semibold text-gray-700">{fmt(s.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Gross Revenue", value: fmt(data.revenue.gross), icon: IndianRupee, color: GOLD, bg: "rgba(201,168,76,0.1)" },
                { label: "Commission", value: fmt(data.revenue.commission), icon: BadgeCheck, color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
                { label: "Products", value: `${data.products.active}/${data.products.total}`, icon: Package, color: "#10B981", bg: "rgba(16,185,129,0.1)" },
                { label: "Customers", value: data.customers.total, icon: Users, color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                  </div>
                  <div className="text-xl font-serif font-bold" style={{ color: NAVY }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-serif font-bold text-base mb-5" style={{ color: NAVY }}>Order Status Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(ORDER_STATUS_META).map(([key, meta]) => {
                  const count = (data.orders as any)[key] ?? 0;
                  return (
                    <div key={key} className="text-center rounded-xl p-3 border border-gray-100">
                      <div className="flex justify-center mb-1.5" style={{ color: meta.color }}>{meta.icon}</div>
                      <div className="text-xl font-serif font-bold" style={{ color: NAVY }}>{count}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{meta.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-5">
                <h3 className="font-serif font-bold text-base flex items-center gap-1.5" style={{ color: NAVY }}>
                  <TrendingUp size={16} style={{ color: GOLD }} /> Revenue Trend
                </h3>
                <div className="flex gap-1">
                  {GRANULARITIES.map((g) => (
                    <button
                      key={g}
                      onClick={() => setGranularity(g)}
                      className="text-[11px] font-semibold px-2.5 py-1 rounded-md capitalize transition-colors"
                      style={{ background: granularity === g ? NAVY : "transparent", color: granularity === g ? "white" : "#6b7280" }}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>
              {data.revenue.trend.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={data.revenue.trend} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="period" tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={50} />
                    <Tooltip formatter={(v: number) => [fmt(v), "Revenue"]} contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }} />
                    <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.5} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="py-12 text-center text-gray-400 text-sm">No revenue data for this vendor yet.</div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-serif font-bold text-base mb-4" style={{ color: NAVY }}>Customer Insights</h3>
                <div className="space-y-2.5 text-sm">
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">Total customers</span><span className="font-semibold text-xs" style={{ color: NAVY }}>{data.customers.total}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">New (30d)</span><span className="font-semibold text-xs" style={{ color: NAVY }}>{data.customers.new30d}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">Repeat customers</span><span className="font-semibold text-xs" style={{ color: NAVY }}>{data.customers.repeat}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500 text-xs">Avg rating</span>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                      <Star size={11} fill="currentColor" /> {data.customers.avgRating.toFixed(1)} ({data.customers.reviewCount})
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-serif font-bold text-base mb-4" style={{ color: NAVY }}>Rating Distribution</h3>
                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map((star) => {
                    const count = data.customers.ratingDistribution[String(star)] ?? 0;
                    const pct = data.customers.reviewCount > 0 ? (count / data.customers.reviewCount) * 100 : 0;
                    return (
                      <div key={star} className="flex items-center gap-2 text-xs">
                        <span className="w-8 text-gray-500">{star}★</span>
                        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: GOLD }} />
                        </div>
                        <span className="w-6 text-right text-gray-400">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-serif font-bold text-base mb-4" style={{ color: NAVY }}>Shop & Bank Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[
                  { icon: Phone, label: "Mobile", value: data.shop.mobile ? `+91 ${data.shop.mobile}` : null },
                  { icon: FileText, label: "PAN Number", value: data.verification.panNumber },
                  { icon: Landmark, label: "Bank", value: data.verification.bankName },
                  { icon: Landmark, label: "Account", value: data.verification.bankAccount ? `••••${data.verification.bankAccount.slice(-4)} (${data.verification.bankIfsc ?? ""})` : null },
                  { icon: Home, label: "Shop Address", value: [data.shop.shopStreet, data.shop.shopCity, data.shop.shopState, data.shop.shopPincode].filter(Boolean).join(", ") || null },
                  { icon: CheckCircle, label: "Registered", value: data.shop.registeredAt ? new Date(data.shop.registeredAt).toLocaleDateString("en-IN") : null },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50">
                    <Icon size={13} className="mt-0.5 shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-xs font-semibold truncate ${value ? "text-gray-700" : "text-gray-300 italic"}`}>{value ?? "Not provided"}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminVendorAnalyticsDetail() {
  return (
    <AdminGuard>
      <AdminLayout>
        <DetailContent />
      </AdminLayout>
    </AdminGuard>
  );
}
