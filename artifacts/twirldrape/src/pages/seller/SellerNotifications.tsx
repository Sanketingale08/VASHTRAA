import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import {
  Bell, Package, AlertTriangle, PackageX, Clock, RotateCcw,
  Trash2, CheckCheck, CheckCircle, Search, XCircle, Wallet, IndianRupee, FileClock, Circle, ExternalLink, AlertCircle,
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";
const sellerBasePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SellerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, any> | null;
}

function deepLinkFor(n: SellerNotification): string | null {
  const m = n.metadata || {};
  if (m.orderId) return `${sellerBasePath}/seller/orders`;
  if (m.productId) return `${sellerBasePath}/seller/products`;
  if (m.ticketId) return `${sellerBasePath}/seller/support`;
  return null;
}

function typeIcon(type: string, size = 16) {
  switch (type) {
    case "new_order": return <Package size={size} className="text-green-600" />;
    case "payment_success": return <CheckCircle size={size} className="text-green-600" />;
    case "low_stock": return <AlertTriangle size={size} className="text-amber-500" />;
    case "out_of_stock": return <PackageX size={size} className="text-red-500" />;
    case "return_requested_seller": return <RotateCcw size={size} className="text-amber-500" />;
    case "refund_requested_seller": return <Clock size={size} className="text-amber-500" />;
    case "product_pending_approval": return <FileClock size={size} className="text-amber-500" />;
    case "order_cancelled_seller": return <XCircle size={size} className="text-red-500" />;
    case "settlement_released": return <Wallet size={size} className="text-green-600" />;
    case "payout_successful": return <IndianRupee size={size} className="text-green-600" />;
    case "new_customer_query": return <Clock size={size} className="text-blue-500" />;
    default: return <Bell size={size} className="text-gray-400" />;
  }
}

function formatDate(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "new_order,payment_success,order_cancelled_seller", label: "Orders" },
  { key: "low_stock,out_of_stock", label: "Stock" },
  { key: "return_requested_seller,refund_requested_seller", label: "Returns & Refunds" },
  { key: "product_pending_approval,product_approved,product_rejected", label: "Products" },
  { key: "settlement_released,payout_successful", label: "Payouts" },
  { key: "new_customer_query", label: "Queries" },
];

export default function SellerNotifications() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [clearAllState, setClearAllState] = useState<"idle" | "confirm">("idle");
  const qc = useQueryClient();

  const filterTypes = activeTab === "all" ? undefined : activeTab.split(",");

  useEffect(() => { setPage(1); }, [activeTab, search, dateFrom, dateTo]);

  const { data, isLoading } = useQuery({
    queryKey: ["seller-notif-list", activeTab, search, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterTypes) for (const t of filterTypes) params.append("type", t);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(getApiUrl(`/api/seller/notifications?${params}`), { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ notifications: SellerNotification[]; total: number; page: number; limit: number }>;
    },
    staleTime: 10000,
    refetchInterval: 8000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(getApiUrl(`/api/seller/notifications/${id}/read`), { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-notif-list"] });
      qc.invalidateQueries({ queryKey: ["seller-notif-count"] });
    },
  });

  const markUnread = useMutation({
    mutationFn: async (id: string) => {
      await fetch(getApiUrl(`/api/seller/notifications/${id}/unread`), { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-notif-list"] });
      qc.invalidateQueries({ queryKey: ["seller-notif-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch(getApiUrl(`/api/seller/notifications/read-all`), { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-notif-list"] });
      qc.invalidateQueries({ queryKey: ["seller-notif-count"] });
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await fetch(getApiUrl(`/api/seller/notifications/${id}`), { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-notif-list"] });
      qc.invalidateQueries({ queryKey: ["seller-notif-count"] });
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const r = await fetch(getApiUrl("/api/seller/notifications"), { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Failed to clear notifications");
    },
    onSuccess: () => {
      setClearAllState("idle");
      // Optimistically zero out the unread badge immediately
      qc.setQueryData(["seller-notif-count"], { count: 0 });
      qc.invalidateQueries({ queryKey: ["seller-notif-list"] });
      qc.invalidateQueries({ queryKey: ["seller-notif-count"] });
    },
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 20)));
  const hasUnread = notifications.some((n) => !n.read);
  const hasFilters = !!(search || dateFrom || dateTo);

  const grouped = notifications.reduce<Record<string, SellerNotification[]>>((acc, n) => {
    const key = formatDate(n.createdAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <SellerLayout title="Notifications">
      <div className="max-w-4xl mx-auto space-y-4">

        {/* Type filter tabs + Clear All */}
        <div className="flex flex-wrap gap-3 items-center justify-between">
          <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: CREAM }}>
            {TYPE_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key)}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{
                  background: activeTab === key ? "#fff" : "transparent",
                  color: activeTab === key ? MAROON : "#6b7280",
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Clear All button / confirm */}
          <AnimatePresence mode="wait">
            {clearAllState === "confirm" ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border text-xs"
                style={{ borderColor: "#fca5a5", background: "#fef2f2" }}
              >
                <AlertCircle size={13} className="text-red-500 shrink-0" />
                <span className="text-red-700 font-medium">Delete all notifications? This cannot be undone.</span>
                <button
                  onClick={() => clearAll.mutate()}
                  disabled={clearAll.isPending}
                  className="px-2.5 py-1 rounded-lg text-white text-[11px] font-bold disabled:opacity-60"
                  style={{ background: "#dc2626" }}
                >
                  {clearAll.isPending ? "Clearing…" : "Yes, clear all"}
                </button>
                <button
                  onClick={() => setClearAllState("idle")}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-gray-200 bg-white"
                >
                  Cancel
                </button>
              </motion.div>
            ) : (
              total > 0 && (
                <motion.button
                  key="clear-btn"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setClearAllState("confirm")}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors hover:border-red-300 hover:text-red-600"
                  style={{ borderColor: "#E5E7EB", color: "#6b7280" }}
                >
                  <Trash2 size={12} /> Clear All
                </motion.button>
              )
            )}
          </AnimatePresence>
        </div>

        {/* Prominent search bar + date range */}
        <div className="flex flex-col sm:flex-row gap-2 items-stretch">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or keyword…"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
              style={{ borderColor: "#E5E7EB", background: "#fff" }}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
            <span className="text-xs text-gray-400">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl text-gray-600 focus:outline-none focus:border-[#C9A84C]"
            />
            {hasFilters && (
              <button
                onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
                className="text-xs font-semibold px-2 hover:opacity-70"
                style={{ color: MAROON }}
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Mark all read banner */}
        {hasUnread && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between rounded-xl px-4 py-3 border"
            style={{ background: `${MAROON}0d`, borderColor: `${MAROON}22` }}
          >
            <p className="text-sm" style={{ color: MAROON }}>You have unread notifications</p>
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-70 transition-opacity disabled:opacity-50"
              style={{ color: MAROON }}
            >
              <CheckCheck size={15} /> Mark all as read
            </button>
          </motion.div>
        )}

        {/* Notification list */}
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex gap-3 animate-pulse">
                  <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 bg-gray-100 rounded w-1/2" />
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Bell size={36} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-400">
                {hasFilters ? "No notifications match your search" : "No notifications"}
              </p>
              <p className="text-xs text-gray-300 mt-1">
                {hasFilters ? "Try adjusting your filters" : "You're all caught up."}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="px-4 py-2 border-b" style={{ background: CREAM, borderColor: `${GOLD}22` }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#7a5f4e" }}>{dateLabel}</p>
                </div>
                {items.map((n) => (
                  <div
                    key={n.id}
                    className={`flex items-start gap-3 px-4 py-4 border-b border-gray-50 last:border-0 group transition-colors ${!n.read ? "hover:bg-[#F3F8F5]/80" : "hover:bg-gray-50/60"}`}
                    style={!n.read ? { background: `${MAROON}08` } : {}}
                  >
                    <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: n.read ? "#f3f4f6" : "#fff", border: n.read ? "none" : "1px solid #C9A84C33" }}>
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${n.read ? "text-gray-600" : "font-semibold"}`} style={!n.read ? { color: "#3D1A1A" } : {}}>{n.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-gray-300">{relativeTime(n.createdAt)}</p>
                        {deepLinkFor(n) && (
                          <Link
                            href={deepLinkFor(n)!}
                            className="flex items-center gap-0.5 text-[10px] font-semibold hover:opacity-70"
                            style={{ color: MAROON }}
                          >
                            View details <ExternalLink size={10} />
                          </Link>
                        )}
                      </div>
                    </div>
                    {/* Action buttons — hidden until row is hovered */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.read ? (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          title="Mark as read"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-[#1E6B5A] hover:bg-gray-100"
                        >
                          <CheckCircle size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => markUnread.mutate(n.id)}
                          title="Mark as unread"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-[#1E6B5A] hover:bg-gray-100"
                        >
                          <Circle size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => dismiss.mutate(n.id)}
                        title="Dismiss"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {!n.read && <span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: MAROON }} />}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium border border-[#C9A84C]/30 rounded-lg disabled:opacity-40"
              style={{ color: MAROON }}
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium border border-[#C9A84C]/30 rounded-lg disabled:opacity-40"
              style={{ color: MAROON }}
            >
              Next
            </button>
          </div>
        )}
      </div>
    </SellerLayout>
  );
}
