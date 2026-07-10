import React, { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Search, Users, Star, MessageCircle, LifeBuoy, X, Send, Flag,
  ChevronRight, Mail, Phone, MapPin, ShoppingBag, IndianRupee, AlertCircle,
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.4, delay: i * 0.05, ease: "easeOut" },
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
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  const loadSummary = useCallback(() => {
    apiGet("/api/seller/customers-summary").then(setSummary).catch(() => {});
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  return (
    <SellerLayout title="Customer Management">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 p-1.5 flex flex-wrap gap-1"
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

        {tab === "overview" && <OverviewTab summary={summary} onNavigate={setTab} />}
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

function OverviewTab({ summary, onNavigate }: { summary: any; onNavigate: (t: string) => void }) {
  const cards = [
    { label: "Total Customers", value: summary?.totalCustomers ?? "—", icon: Users, sub: `${summary?.activeCustomers ?? 0} active (90d)`, tab: "customers" },
    { label: "Average Rating", value: summary ? summary.avgRating.toFixed(1) : "—", icon: Star, sub: `${summary?.totalReviews ?? 0} reviews`, tab: "reviews" },
    { label: "Reported Reviews", value: summary?.reportedReviews ?? "—", icon: Flag, sub: "flagged for moderation", tab: "reviews" },
    { label: "Pending Queries", value: summary?.pendingQueries ?? "—", icon: MessageCircle, sub: "awaiting reply", tab: "queries" },
    { label: "Open Tickets", value: summary?.openTickets ?? "—", icon: LifeBuoy, sub: "needs attention", tab: "tickets" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map((c, i) => (
        <motion.button
          key={c.label}
          custom={i}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          onClick={() => onNavigate(c.tab)}
          className="text-left bg-white rounded-2xl border border-[#C9A84C]/20 p-5 hover:border-[#C9A84C]/50 transition-colors"
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
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email or phone"
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C]"
          />
        </div>
        <span className="text-xs text-gray-400 ml-auto">{customers.length} customers</span>
      </div>

      {loading ? (
        <div className="p-5 space-y-3">
          {[1, 2, 3].map((n) => <div key={n} className="h-14 rounded-xl bg-gray-100 animate-pulse" />)}
        </div>
      ) : customers.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm">
          <Users size={32} className="mx-auto mb-3 opacity-30" />
          No customers yet.
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {customers.map((c) => (
            <button
              key={c.userId}
              onClick={() => onSelect(c.userId)}
              className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0" style={{ background: GOLD }}>
                {c.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700 truncate">{c.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{c.email || c.phone || "—"}</p>
              </div>
              <div className="hidden sm:block text-right shrink-0">
                <p className="text-xs font-bold" style={{ color: MAROON }}>{formatMoney(c.totalSpent)}</p>
                <p className="text-[10px] text-gray-400">{c.totalOrders} orders</p>
              </div>
              <span
                className="text-[10px] font-bold px-2 py-1 rounded-full shrink-0"
                style={{ background: c.status === "Active" ? "#dcfce7" : "#f3f4f6", color: c.status === "Active" ? "#166534" : "#6b7280" }}
              >
                {c.status}
              </span>
              <ChevronRight size={14} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function CustomerDetailModal({ userId, onClose }: { userId: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet(`/api/seller/customers/${userId}`)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
      >
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Customer Profile</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((n) => <div key={n} className="h-12 rounded-xl bg-gray-100 animate-pulse" />)}
          </div>
        ) : !data ? (
          <div className="p-10 text-center text-gray-400 text-sm">Could not load customer.</div>
        ) : (
          <div className="p-6 space-y-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0" style={{ background: MAROON }}>
                {data.name[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-serif text-lg font-bold text-gray-800">{data.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-gray-500">
                  {data.email && <span className="flex items-center gap-1"><Mail size={11} /> {data.email}</span>}
                  {data.phone && <span className="flex items-center gap-1"><Phone size={11} /> {data.phone}</span>}
                  {data.city && <span className="flex items-center gap-1"><MapPin size={11} /> {data.city}, {data.state}</span>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl p-4" style={{ background: CREAM }}>
                <p className="text-lg font-bold" style={{ color: MAROON }}>{data.totalOrders}</p>
                <p className="text-[11px] text-gray-500 flex items-center gap-1"><ShoppingBag size={11} /> Total Orders</p>
              </div>
              <div className="rounded-xl p-4" style={{ background: CREAM }}>
                <p className="text-lg font-bold" style={{ color: MAROON }}>{formatMoney(data.totalSpent)}</p>
                <p className="text-[11px] text-gray-500 flex items-center gap-1"><IndianRupee size={11} /> Total Spent</p>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-bold text-gray-700 mb-2">Purchase History</h4>
              <div className="space-y-2">
                {data.orders.map((o: any) => (
                  <div key={o.id} className="flex items-center gap-3 p-3 rounded-xl border border-gray-100">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 truncate">
                        {o.vendorItems.map((i: any) => i.name).join(", ")}
                      </p>
                      <p className="text-[10px] text-gray-400">{formatDate(o.createdAt)}</p>
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{ color: MAROON }}>{formatMoney(o.vendorTotal)}</span>
                  </div>
                ))}
              </div>
            </div>

            {data.reviews.length > 0 && (
              <div>
                <h4 className="text-sm font-bold text-gray-700 mb-2">Reviews</h4>
                <div className="space-y-2">
                  {data.reviews.map((r: any) => (
                    <div key={r.id} className="p-3 rounded-xl border border-gray-100 text-xs text-gray-600">
                      <div className="flex items-center gap-1 mb-1">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} size={11} className={i < r.rating ? "fill-[#C9A84C] text-[#C9A84C]" : "text-gray-200"} />
                        ))}
                      </div>
                      {r.comment}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(data.queries.length > 0 || data.tickets.length > 0) && (
              <div className="grid grid-cols-2 gap-4 text-xs text-gray-500">
                <div>{data.queries.length} product queries</div>
                <div>{data.tickets.length} support tickets</div>
              </div>
            )}
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
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 py-16 text-center text-gray-400 text-sm">
          <Star size={32} className="mx-auto mb-3 opacity-30" />
          No reviews yet.
        </div>
      ) : (
        <div className="space-y-3">
          {reviews.map((r) => (
            <div key={r.id} className="bg-white rounded-2xl border border-[#C9A84C]/20 p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700">{r.customerName} · {r.productName}</p>
                  <div className="flex items-center gap-1 mt-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} size={12} className={i < r.rating ? "fill-[#C9A84C] text-[#C9A84C]" : "text-gray-200"} />
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
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C9A84C]"
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
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 py-16 text-center text-gray-400 text-sm">
          <MessageCircle size={32} className="mx-auto mb-3 opacity-30" />
          No product queries yet.
        </div>
      ) : (
        <div className="space-y-3">
          {queries.map((q) => (
            <div key={q.id} className="bg-white rounded-2xl border border-[#C9A84C]/20 p-5">
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
                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C9A84C]"
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

function TicketsTab({ onChange }: { onChange: () => void }) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [openTicket, setOpenTicket] = useState<any>(null);

  const load = useCallback(() => {
    setLoading(true);
    apiGet(`/api/seller/tickets${statusFilter !== "all" ? `?status=${encodeURIComponent(statusFilter)}` : ""}`)
      .then((d) => setTickets(d.tickets))
      .catch(() => setTickets([]))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  return (
    <motion.div initial="hidden" animate="visible" variants={fadeUp} className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {["all", ...TICKET_STATUSES].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold"
            style={{ background: statusFilter === s ? MAROON : "#fff", color: statusFilter === s ? "#fff" : "#6b7280", border: "1px solid #e5e7eb" }}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map((n) => <div key={n} className="h-16 rounded-xl bg-gray-100 animate-pulse" />)}</div>
      ) : tickets.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 py-16 text-center text-gray-400 text-sm">
          <LifeBuoy size={32} className="mx-auto mb-3 opacity-30" />
          No support tickets yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 divide-y divide-gray-50">
          {tickets.map((t) => {
            const pc = priorityColor(t.priority);
            return (
              <button
                key={t.id}
                onClick={() => setOpenTicket(t)}
                className="w-full px-5 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700 truncate">{t.subject}</p>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
            <div className="flex flex-wrap gap-3">
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
            </div>

            <div className="space-y-3 max-h-72 overflow-y-auto">
              {ticket.messages.map((m: any) => (
                <div
                  key={m.id}
                  className={`p-3 rounded-xl text-xs max-w-[85%] ${m.isStaff ? "ml-auto text-white" : "bg-gray-100 text-gray-700"}`}
                  style={m.isStaff ? { background: MAROON } : {}}
                >
                  {m.body}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to customer..."
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C9A84C]"
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
          </div>
        )}
      </motion.div>
    </div>
  );
}
