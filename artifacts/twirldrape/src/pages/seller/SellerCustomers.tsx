import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { useLocation } from "wouter";
import {
  Search, Users, Star, MessageCircle, LifeBuoy, X, Send, Flag,
  ChevronRight, Mail, Phone, MapPin, ShoppingBag, IndianRupee, AlertCircle,
  ShieldAlert, Lock, RotateCcw, Paperclip, ArrowUpDown, Bell, PackageX, ShoppingCart,
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const CREAM = "#E5E8EC";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.4, delay: i * 0.05, ease: "easeOut" as const },
  }),
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
function formatMoney(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

async function apiGet(path: string) {
  const res = await fetch(getApiUrl(path), { credentials: "include" });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
  return res.json();
}
async function apiSend(path: string, method: string, body?: any) {
  const res = await fetch(getApiUrl(path), {
    method,
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Request failed");
  return res.json();
}

const TABS = [
  { key: "overview", label: "Overview", icon: Users },
  { key: "customers", label: "Customers", icon: Users },
  { key: "reviews", label: "Reviews", icon: Star },
  { key: "queries", label: "Product Queries", icon: MessageCircle },
  { key: "tickets", label: "Support Tickets", icon: LifeBuoy },
];

export default function SellerCustomers() {
  const [tab, setTab] = useState("overview");
  const [summary, setSummary] = useState<any>(null);
  const [dashSummary, setDashSummary] = useState<any>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    apiGet("/api/seller/customers-summary").then(setSummary).catch(() => {});
    apiGet("/api/seller/dashboard-summary").then(setDashSummary).catch(() => {});
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <SellerLayout title="Customer Management">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-1.5 flex flex-wrap gap-1"
        >
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: tab === key ? MAROON : "transparent",
                color: tab === key ? "#fff" : "#6b7280",
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </motion.div>

        {tab === "overview" && <OverviewTab summary={summary} dashSummary={dashSummary} onNavigate={setTab} />}
        {tab === "customers" && <CustomersTab onSelect={(id) => setSelectedCustomer(id)} />}
        {tab === "reviews" && <ReviewsTab onChange={loadSummary} />}
        {tab === "queries" && <QueriesTab onChange={loadSummary} />}
        {tab === "tickets" && <TicketsTab onChange={loadSummary} />}
      </div>

      {selectedCustomer && (
        <CustomerDetailModal userId={selectedCustomer} onClose={() => setSelectedCustomer(null)} />
      )}
    </SellerLayout>
  );
}

function OverviewTab({ summary, dashSummary, onNavigate }: { summary: any; dashSummary: any; onNavigate: (t: string) => void }) {
  const [, setLocation] = useLocation();

  const statCards = [
    { label: "Unread Notifications", value: dashSummary?.unreadNotifications ?? "—", icon: Bell, sub: "in your inbox", nav: () => setLocation("/seller/notifications") },
    { label: "New Orders", value: dashSummary?.newOrders ?? "—", icon: ShoppingCart, sub: "awaiting fulfillment", nav: () => setLocation("/seller/orders") },
    { label: "Pending Returns", value: dashSummary?.pendingReturns ?? "—", icon: RotateCcw, sub: "return requests", nav: () => setLocation("/seller/orders") },
    { label: "Low Stock Alerts", value: dashSummary?.lowStock ?? "—", icon: PackageX, sub: "products running low", nav: () => setLocation("/seller/inventory") },
    { label: "Open Tickets", value: dashSummary?.openTickets ?? "—", icon: LifeBuoy, sub: "needs attention", nav: () => onNavigate("tickets") },
    { label: "Pending Queries", value: dashSummary?.pendingQueries ?? "—", icon: MessageCircle, sub: "awaiting reply", nav: () => onNavigate("queries") },
    { label: "Active Complaints", value: dashSummary?.activeComplaints ?? "—", icon: Flag, sub: "order & return issues", nav: () => onNavigate("tickets") },
    { label: "Active Disputes", value: dashSummary?.activeDisputes ?? "—", icon: ShieldAlert, sub: "escalated to admin", nav: () => onNavigate("tickets") },
  ];

  const cards = [
    { label: "Total Customers", value: summary?.totalCustomers ?? "—", icon: Users, sub: `${summary?.activeCustomers ?? 0} active (90d)`, tab: "customers" },
    { label: "Average Rating", value: summary ? summary.avgRating.toFixed(1) : "—", icon: Star, sub: `${summary?.totalReviews ?? 0} reviews`, tab: "reviews" },
    { label: "Reported Reviews", value: summary?.reportedReviews ?? "—", icon: Flag, sub: "flagged for moderation", tab: "reviews" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Seller Snapshot</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((c, i) => (
            <motion.button
              key={c.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              onClick={c.nav}
              className="text-left bg-white rounded-2xl border border-[#C7CCD1]/20 p-5 hover:border-[#C7CCD1]/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: GOLD }}>
                <c.icon size={16} style={{ color: MAROON }} />
              </div>
              <p className="text-2xl font-bold" style={{ color: MAROON }}>{c.value}</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">{c.label}</p>
              <p className="text-[10px] text-gray-400">{c.sub}</p>
            </motion.button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Customers & Reviews</h3>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map((c, i) => (
            <motion.button
              key={c.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              onClick={() => onNavigate(c.tab)}
              className="text-left bg-white rounded-2xl border border-[#C7CCD1]/20 p-5 hover:border-[#C7CCD1]/50 transition-colors"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: MAROON }}>
                <c.icon size={16} className="text-white" />
              </div>
              <p className="text-2xl font-bold" style={{ color: MAROON }}>{c.value}</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">{c.label}</p>
              <p className="text-[10px] text-gray-400">{c.sub}</p>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}

function statusBadgeProps(status: string) {
  // Badge label shows what action can be taken (Active customers can be Deactivated, Inactive can be Activated)
  // But per spec the label is "Activate" for Active state and "Deactivate" for Inactive state.
  if (status === "Active") return { label: "Activate", bg: "#dcfce7", color: "#166534" };
  return { label: "Deactivate", bg: "#f3f4f6", color: "#9ca3af" };
}

function OrderStatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pending:    { bg: "#fef9c3", color: "#854d0e" },
    confirmed:  { bg: "#dbeafe", color: "#1e40af" },
    processing: { bg: "#e0f2fe", color: "#0369a1" },
    shipped:    { bg: "#f3e8ff", color: "#7e22ce" },
    delivered:  { bg: "#dcfce7", color: "#166534" },
    cancelled:  { bg: "#fee2e2", color: "#991b1b" },
    returned:   { bg: "#fce7f3", color: "#9d174d" },
  };
  const style = map[status?.toLowerCase()] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full capitalize" style={{ background: style.bg, color: style.color }}>
      {status}
    </span>
  );
}

function CustomersTab({ onSelect }: { onSelect: (userId: string) => void }) {
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    const q = search ? `?search=${encodeURIComponent(search)}` : "";
    apiGet(`/api/seller/customers${q}`)
      .then((d) => setCustomers(d.customers))
      .catch(() => setCustomers([]))
      .finally(() => setLoading(false));
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="bg-white rounded-2xl border border-[#C7CCD1]/20 overflow-hidden">
      {/* Search bar */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, mobile, email, or address…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/30 focus:border-[#C7CCD1]"
          />
        </div>
        <span className="text-xs text-gray-400 shrink-0">{customers.length} customers</span>
      </div>

      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((n) => <div key={n} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          {search ? "No customers match your search." : "No customers yet."}
        </div>
      ) : (
        <>
          {/* Desktop table header */}
          <div className="hidden lg:grid grid-cols-[1fr_140px_180px_160px_100px_80px_90px] gap-3 px-5 py-2.5 border-b border-gray-100 bg-gray-50/60">
            {["Name", "Mobile", "Email", "Address", "Orders", "Status", ""].map((h) => (
              <p key={h} className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{h}</p>
            ))}
          </div>

          <div className="divide-y divide-gray-50">
            {customers.map((c) => {
              const badge = statusBadgeProps(c.status);
              const address = [c.city, c.state].filter(Boolean).join(", ") || "—";

              return (
                <div key={c.userId} className="px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                  {/* Desktop row */}
                  <div className="hidden lg:grid grid-cols-[1fr_140px_180px_160px_100px_80px_90px] gap-3 items-center">
                    {/* Name + avatar */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0" style={{ background: GOLD }}>
                        {c.name[0]?.toUpperCase()}
                      </div>
                      <p className="text-sm font-semibold text-gray-700 truncate">{c.name}</p>
                    </div>
                    {/* Mobile */}
                    <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
                      <Phone size={11} className="shrink-0 text-gray-400" />
                      <span className="truncate">{c.phone || "—"}</span>
                    </div>
                    {/* Email */}
                    <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
                      <Mail size={11} className="shrink-0 text-gray-400" />
                      <span className="truncate">{c.email || "—"}</span>
                    </div>
                    {/* Address */}
                    <div className="flex items-center gap-1 text-xs text-gray-500 min-w-0">
                      <MapPin size={11} className="shrink-0 text-gray-400" />
                      <span className="truncate">{address}</span>
                    </div>
                    {/* Orders + spend */}
                    <div className="text-right">
                      <p className="text-xs font-bold" style={{ color: MAROON }}>{formatMoney(c.totalSpent)}</p>
                      <p className="text-[10px] text-gray-400">{c.totalOrders} orders</p>
                    </div>
                    {/* Status badge */}
                    <div>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: badge.bg, color: badge.color }}>
                        {badge.label}
                      </span>
                    </div>
                    {/* View Details button */}
                    <div>
                      <button
                        onClick={() => onSelect(c.userId)}
                        className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-colors hover:border-[#0A1F44]/40 hover:text-[#0A1F44]"
                        style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
                      >
                        View <ChevronRight size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="lg:hidden flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: GOLD }}>
                      {c.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-700 truncate">{c.name}</p>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                      </div>
                      {c.phone && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1"><Phone size={10} /> {c.phone}</p>
                      )}
                      {c.email && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1"><Mail size={10} /> {c.email}</p>
                      )}
                      {(c.city || c.state) && (
                        <p className="text-[11px] text-gray-500 flex items-center gap-1"><MapPin size={10} /> {address}</p>
                      )}
                      <div className="flex items-center justify-between mt-1.5">
                        <div>
                          <span className="text-xs font-bold" style={{ color: MAROON }}>{formatMoney(c.totalSpent)}</span>
                          <span className="text-[10px] text-gray-400 ml-1.5">· {c.totalOrders} orders</span>
                        </div>
                        <button
                          onClick={() => onSelect(c.userId)}
                          className="text-[11px] font-semibold flex items-center gap-1 hover:opacity-70"
                          style={{ color: MAROON }}
                        >
                          View Details <ChevronRight size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </motion.div>
  );
}

function CustomerDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    apiGet(`/api/seller/customers/${userId}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    /* Slide-over panel from the right */
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      {/* Scrim */}
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        onClick={(e) => e.stopPropagation()}
        className="relative bg-white w-full max-w-lg h-full overflow-y-auto flex flex-col shadow-2xl"
      >
        {/* Sticky header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
          <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Customer Details</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {loading ? (
          <div className="p-6 space-y-4 flex-1">
            {[1, 2, 3, 4].map((n) => <div key={n} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : !data ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-10 text-center">
            Could not load customer details.
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Profile hero */}
            <div className="px-6 py-5" style={{ background: `linear-gradient(135deg, ${MAROON}12, ${GOLD}0a)` }}>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0 shadow-sm" style={{ background: MAROON }}>
                  {data.name[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-serif text-lg font-bold text-gray-800">{data.name}</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Customer since {data.orders.length > 0 ? formatDate(data.orders[data.orders.length - 1].createdAt) : "—"}
                  </p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="bg-white/80 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold" style={{ color: MAROON }}>{data.totalOrders}</p>
                  <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1"><ShoppingBag size={10} /> Orders</p>
                </div>
                <div className="bg-white/80 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold" style={{ color: MAROON }}>{formatMoney(data.totalSpent)}</p>
                  <p className="text-[10px] text-gray-500 flex items-center justify-center gap-1"><IndianRupee size={10} /> Spent with you</p>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Contact information */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Contact Information</h4>
                <div className="bg-gray-50 rounded-xl divide-y divide-gray-100">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Mail size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 font-medium">Email</p>
                      <p className="text-sm text-gray-700">{data.email || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Phone size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 font-medium">Mobile Number</p>
                      <p className="text-sm text-gray-700">{data.phone || "—"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <MapPin size={14} className="text-gray-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] text-gray-400 font-medium">Address</p>
                      <p className="text-sm text-gray-700">
                        {[data.city, data.state].filter(Boolean).join(", ") || "—"}
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Order history */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                  Order History <span className="normal-case font-normal text-gray-300">({data.orders.length})</span>
                </h4>
                {data.orders.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">No orders yet.</p>
                ) : (
                  <div className="space-y-2">
                    {data.orders.map((o: any) => (
                      <div key={o.id} className="rounded-xl border border-gray-100 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-700 truncate">
                              {o.vendorItems.map((i: any) => i.name).join(", ")}
                            </p>
                            <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(o.createdAt)}</p>
                          </div>
                          <div className="text-right shrink-0 space-y-1">
                            <p className="text-xs font-bold" style={{ color: MAROON }}>{formatMoney(o.vendorTotal)}</p>
                            <OrderStatusPill status={o.status} />
                          </div>
                        </div>
                        {o.vendorItems.length > 1 && (
                          <div className="mt-2 space-y-1">
                            {o.vendorItems.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-[11px] text-gray-500 pl-2 border-l border-gray-200">
                                <span className="truncate">{item.name} × {item.quantity}</span>
                                <span className="shrink-0 ml-2">{formatMoney(item.price * item.quantity)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Reviews */}
              {data.reviews.length > 0 && (
                <section>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">
                    Reviews <span className="normal-case font-normal text-gray-300">({data.reviews.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {data.reviews.map((r: any) => (
                      <div key={r.id} className="p-3 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-1 mb-1.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <Star key={i} size={11} className={i < r.rating ? "fill-[#C7CCD1] text-[#C7CCD1]" : "text-gray-200"} />
                          ))}
                          <span className="text-[10px] text-gray-400 ml-1">{formatDate(r.createdAt)}</span>
                        </div>
                        <p className="text-xs text-gray-600 leading-relaxed">{r.comment || "—"}</p>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Account activity summary */}
              <section>
                <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Activity</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-base font-bold text-gray-700">{data.queries.length}</p>
                    <p className="text-[10px] text-gray-400">Product Queries</p>
                  </div>
                  <div className="bg-gray-50 rounded-xl p-3 text-center">
                    <p className="text-base font-bold text-gray-700">{data.tickets.length}</p>
                    <p className="text-[10px] text-gray-400">Support Tickets</p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ReviewsTab({ onChange }: { onChange: () => void }) {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "reported">("all");
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiGet(`/api/seller/reviews${filter === "reported" ? "?reported=true" : ""}`)
      .then((d) => setReviews(d.reviews))
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const reply = async (id: string) => {
    const text = replyDraft[id]?.trim();
    if (!text) return;
    setBusy(id);
    setError("");
    try {
      await apiSend(`/api/seller/reviews/${id}/reply`, "POST", { reply: text });
      setReplyDraft((d) => ({ ...d, [id]: "" }));
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const report = async (id: string) => {
    setBusy(id);
    try {
      await apiSend(`/api/seller/reviews/${id}/report`, "POST", { reason: "Inappropriate content" });
      load();
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-4">
      <div className="flex gap-2">
        {[{ key: "all", label: "All Reviews" }, { key: "reported", label: "Reported" }].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key as any)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: filter === f.key ? MAROON : "#fff", color: filter === f.key ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : reviews.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 py-16 text-center text-gray-400 text-sm">
          <Star size={32} className="mx-auto mb-3 opacity-30" />
          No reviews yet.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700">{r.customerName} · {r.productName}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} className={i < r.rating ? "fill-[#C7CCD1] text-[#C7CCD1]" : "text-gray-200"} />
                    ))}
                    <span className="text-[10px] text-gray-400 ml-2">{formatDate(r.createdAt)}</span>
                    {r.reported && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-2" style={{ background: "#fee2e2", color: "#991b1b" }}>
                        Reported
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-2">{r.comment}</p>
                </div>
                {!r.reported && (
                  <button
                    onClick={() => report(r.id)}
                    disabled={busy === r.id}
                    className="shrink-0 flex items-center gap-1 text-[11px] font-semibold text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Flag size={12} /> Report
                  </button>
                )}
              </div>

              {r.sellerReply ? (
                <div className="mt-3 ml-4 pl-3 border-l-2" style={{ borderColor: GOLD }}>
                  <p className="text-[11px] font-bold" style={{ color: MAROON }}>Your reply</p>
                  <p className="text-xs text-gray-600 mt-0.5">{r.sellerReply}</p>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    value={replyDraft[r.id] ?? ""}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [r.id]: e.target.value }))}
                    placeholder="Write a reply..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C7CCD1]"
                  />
                  <button
                    onClick={() => reply(r.id)}
                    disabled={busy === r.id}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                    style={{ background: MAROON }}
                  >
                    <Send size={12} /> Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

const QUERY_STATUS_TABS = ["all", "Open", "In Progress", "Resolved"];

function QueriesTab({ onChange }: { onChange: () => void }) {
  const [queries, setQueries] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("all");
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    apiGet(`/api/seller/queries?status=${status}`)
      .then((d) => setQueries(d.queries))
      .catch(() => setQueries([]))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const reply = async (id: string) => {
    const text = replyDraft[id]?.trim();
    if (!text) return;
    setBusy(id);
    setError("");
    try {
      await apiSend(`/api/seller/queries/${id}/reply`, "POST", { reply: text, status: "Resolved" });
      setReplyDraft((d) => ({ ...d, [id]: "" }));
      load();
      onChange();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {QUERY_STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: status === s ? MAROON : "#fff", color: status === s ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-24 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : queries.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 py-16 text-center text-gray-400 text-sm">
          <MessageCircle size={32} className="mx-auto mb-3 opacity-30" />
          No product queries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {queries.map((q) => (
            <div key={q.id} className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700">{q.customerName} · {q.productName}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatDate(q.createdAt)}</p>
                  <p className="text-sm text-gray-600 mt-2">{q.message}</p>
                </div>
                <span
                  className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                  style={{
                    background: q.status === "Resolved" ? "#dcfce7" : q.status === "In Progress" ? "#fef3c7" : "#dbeafe",
                    color: q.status === "Resolved" ? "#166534" : q.status === "In Progress" ? "#b45309" : "#1d4ed8",
                  }}
                >
                  {q.status}
                </span>
              </div>

              {q.sellerReply ? (
                <div className="mt-3 ml-4 pl-3 border-l-2" style={{ borderColor: GOLD }}>
                  <p className="text-[11px] font-bold" style={{ color: MAROON }}>Your reply</p>
                  <p className="text-xs text-gray-600 mt-0.5">{q.sellerReply}</p>
                </div>
              ) : (
                <div className="mt-3 flex gap-2">
                  <input
                    value={replyDraft[q.id] ?? ""}
                    onChange={(e) => setReplyDraft((d) => ({ ...d, [q.id]: e.target.value }))}
                    placeholder="Write a reply..."
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C7CCD1]"
                  />
                  <button
                    onClick={() => reply(q.id)}
                    disabled={busy === q.id}
                    className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                    style={{ background: MAROON }}
                  >
                    <Send size={12} /> Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

const TICKET_STATUSES = ["Open", "In Progress", "Waiting for Customer", "Resolved", "Closed"];
const TICKET_PRIORITIES = ["Low", "Medium", "High", "Urgent"];

function priorityColor(p: string) {
  switch (p) {
    case "Urgent": return { bg: "#fee2e2", text: "#991b1b" };
    case "High": return { bg: "#ffedd5", text: "#c2410c" };
    case "Medium": return { bg: "#fef3c7", text: "#b45309" };
    default: return { bg: "#f3f4f6", text: "#6b7280" };
  }
}

const VIEW_FILTERS = [
  { key: "all", label: "All Tickets" },
  { key: "complaints", label: "Complaints" },
  { key: "disputes", label: "Disputes" },
];

const SORT_OPTIONS = [
  { key: "newest", label: "Newest first" },
  { key: "oldest", label: "Oldest first" },
  { key: "priority", label: "Priority" },
];

const PRIORITY_RANK: Record<string, number> = { Urgent: 3, High: 2, Medium: 1, Low: 0 };

function TicketsTab({ onChange }: { onChange: () => void }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [openTicket, setOpenTicket] = useState<any>(null);
  const PAGE_SIZE = 8;

  const load = useCallback(() => {
    setLoading(true);
    apiGet(`/api/seller/tickets${statusFilter !== "all" ? `?status=${encodeURIComponent(statusFilter)}` : ""}`)
      .then((d) => setTickets(d.tickets))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [view, search, sort, statusFilter]);

  const filtered = tickets
    .filter((t) => {
      if (view === "disputes") return !!t.isDispute;
      if (view === "complaints") return t.category === "Order Issue" || t.category === "Return/Refund";
      return true;
    })
    .filter((t) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return t.subject?.toLowerCase().includes(q) || t.category?.toLowerCase().includes(q) || t.customerName?.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (sort === "oldest") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sort === "priority") return (PRIORITY_RANK[b.priority] ?? 0) - (PRIORITY_RANK[a.priority] ?? 0);
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {VIEW_FILTERS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: view === v.key ? MAROON : "#fff", color: view === v.key ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}
          >
            {v.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C7CCD1]"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-xs"
        >
          <option value="all">All statuses</option>
          {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1.5">
          <ArrowUpDown size={13} className="text-gray-400" />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-xs"
          >
            {SORT_OPTIONS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <span className="text-xs text-gray-400 ml-auto">{filtered.length} tickets</span>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : pageItems.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 py-16 text-center text-gray-400 text-sm">
          <LifeBuoy size={32} className="mx-auto mb-3 opacity-30" />
          No support tickets found.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 divide-y divide-gray-50">
          {pageItems.map((t) => {
            const pc = priorityColor(t.priority);
            return (
              <button
                key={t.id}
                onClick={() => setOpenTicket(t)}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700 truncate flex items-center gap-1.5">
                    {t.subject}
                    {t.isDispute && (
                      <span className="inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fee2e2", color: "#991b1b" }}>
                        <ShieldAlert size={9} /> Dispute
                      </span>
                    )}
                  </p>
                  <p className="text-[10px] text-gray-400">{t.category} · {formatDate(t.createdAt)}</p>
                </div>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: pc.bg, color: pc.text }}>
                  {t.priority}
                </span>
                <span className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0" style={{ background: "#f3f4f6", color: "#374151" }}>
                  {t.status}
                </span>
                <ChevronRight size={14} className="text-gray-300 shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-xs font-medium text-[#0A1F44] border border-[#C7CCD1]/30 rounded-lg disabled:opacity-40"
          >
            Previous
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-xs font-medium text-[#0A1F44] border border-[#C7CCD1]/30 rounded-lg disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {openTicket && (
        <TicketDetailModal
          ticketId={openTicket.id}
          onClose={() => setOpenTicket(null)}
          onChanged={() => { load(); onChange(); }}
        />
      )}
    </motion.div>
  );
}

function TicketDetailModal({ ticketId, onClose, onChanged }: { ticketId: string; onClose: () => void; onChanged: () => void }) {
  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [noteMode, setNoteMode] = useState<"reply" | "note">("reply");

  const load = useCallback(() => {
    apiGet(`/api/seller/tickets/${ticketId}`).then(setTicket).catch(() => {}).finally(() => setLoading(false));
  }, [ticketId]);

  useEffect(() => { load(); }, [load]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiSend(`/api/seller/tickets/${ticketId}/messages`, "POST", { body: reply.trim() });
      setReply("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const sendInternalNote = async () => {
    if (!internalNote.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiSend(`/api/seller/tickets/${ticketId}/messages`, "POST", { body: internalNote.trim(), internal: true });
      setInternalNote("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const escalate = async () => {
    if (!confirm("Escalate this ticket to a dispute needing admin review?")) return;
    setBusy(true);
    setError("");
    try {
      await apiSend(`/api/seller/tickets/${ticketId}/escalate`, "POST");
      load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addEvidence = async () => {
    if (!evidenceUrl.trim()) return;
    setBusy(true);
    setError("");
    try {
      await apiSend(`/api/seller/tickets/${ticketId}/evidence`, "POST", { url: evidenceUrl.trim() });
      setEvidenceUrl("");
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const updateField = async (field: "status" | "priority", value: string) => {
    setBusy(true);
    try {
      await apiSend(`/api/seller/tickets/${ticketId}`, "PATCH", { [field]: value });
      load();
      onChanged();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-xl w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>{ticket?.subject ?? "Ticket"}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading || !ticket ? (
          <div className="p-6 space-y-3">{[1, 2].map((n) => <div key={n} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}</div>
        ) : (
          <div className="p-6 space-y-4">
            {error && (
              <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle size={15} /> {error}
              </div>
            )}
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400">Status</label>
                <select
                  value={ticket.status}
                  disabled={busy}
                  onChange={(e) => updateField("status", e.target.value)}
                  className="block mt-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs"
                >
                  {TICKET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-gray-400">Priority</label>
                <select
                  value={ticket.priority}
                  disabled={busy}
                  onChange={(e) => updateField("priority", e.target.value)}
                  className="block mt-1 px-3 py-1.5 rounded-lg border border-gray-200 text-xs"
                >
                  {TICKET_PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              {ticket.isDispute ? (
                <span className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg" style={{ background: "#fee2e2", color: "#991b1b" }}>
                  <ShieldAlert size={11} /> Dispute · {ticket.disputeStatus?.replace(/_/g, " ") ?? "needs admin"}
                </span>
              ) : (
                <button
                  onClick={escalate}
                  disabled={busy}
                  className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg border border-gray-200 hover:border-red-200 transition-colors"
                >
                  <ShieldAlert size={12} /> Escalate to Admin
                </button>
              )}
              {ticket.status !== "Closed" && ticket.status !== "Resolved" && (
                <span className="flex items-center gap-1 text-[10px] text-gray-400">
                  <RotateCcw size={11} /> Reopened by customer if resolved again
                </span>
              )}
            </div>

            {ticket.evidenceUrls?.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase text-gray-400 mb-1.5">Evidence</p>
                <div className="flex flex-wrap gap-2">
                  {ticket.evidenceUrls.map((u: string, i: number) => (
                    <a
                      key={i}
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-gray-200 text-gray-600 hover:border-[#C7CCD1] hover:text-[#0A1F44] transition-colors"
                    >
                      <Paperclip size={11} /> Evidence {i + 1}
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                placeholder="Paste evidence link (image/document URL)..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C7CCD1]"
              />
              <button
                onClick={addEvidence}
                disabled={busy || !evidenceUrl.trim()}
                className="px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1 border border-gray-200 text-gray-600 hover:border-[#C7CCD1] disabled:opacity-50"
              >
                <Paperclip size={12} /> Attach
              </button>
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {ticket.messages.map((m: any) => (
                m.internal ? (
                  <div key={m.id} className="p-3 rounded-xl text-xs bg-amber-50 border border-amber-200 text-amber-800 flex items-start gap-2">
                    <Lock size={12} className="mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wide mb-0.5">Internal note</p>
                      {m.body}
                    </div>
                  </div>
                ) : (
                  <div
                    key={m.id}
                    className={`p-3 rounded-xl text-xs max-w-[85%] ${m.isStaff ? "ml-auto text-white" : "bg-gray-100 text-gray-700"}`}
                    style={m.isStaff ? { background: MAROON } : {}}
                  >
                    {m.body}
                  </div>
                )
              ))}
            </div>

            <div className="flex gap-1.5 p-1 bg-gray-100 rounded-lg w-fit">
              <button
                onClick={() => setNoteMode("reply")}
                className="px-3 py-1 rounded-md text-[11px] font-semibold transition-colors"
                style={{ background: noteMode === "reply" ? "#fff" : "transparent", color: noteMode === "reply" ? MAROON : "#6b7280" }}
              >
                Reply to customer
              </button>
              <button
                onClick={() => setNoteMode("note")}
                className="px-3 py-1 rounded-md text-[11px] font-semibold transition-colors flex items-center gap-1"
                style={{ background: noteMode === "note" ? "#fff" : "transparent", color: noteMode === "note" ? MAROON : "#6b7280" }}
              >
                <Lock size={10} /> Internal note
              </button>
            </div>

            {noteMode === "reply" ? (
              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply to customer..."
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C7CCD1]"
                />
                <button
                  onClick={sendReply}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                  style={{ background: MAROON }}
                >
                  <Send size={12} /> Send
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  value={internalNote}
                  onChange={(e) => setInternalNote(e.target.value)}
                  placeholder="Add a note visible only to your team..."
                  className="flex-1 px-3 py-2 rounded-lg border border-amber-200 text-xs focus:outline-none focus:border-amber-400 bg-amber-50"
                />
                <button
                  onClick={sendInternalNote}
                  disabled={busy}
                  className="px-3 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-1"
                  style={{ background: "#b45309" }}
                >
                  <Lock size={12} /> Save
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </div>
  );
}
