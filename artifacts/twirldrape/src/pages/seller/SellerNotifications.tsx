import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bell, Package, AlertTriangle, PackageX, Clock, RotateCcw,
  Trash2, CheckCheck, CheckCircle, Search, XCircle, Wallet, IndianRupee, FileClock,
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";

interface SellerNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
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
];

export default function SellerNotifications() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const qc = useQueryClient();

  const filterTypes = activeTab === "all" ? undefined : activeTab.split(",");

  useEffect(() => { setPage(1); }, [activeTab, search]);

  const { data, isLoading } = useQuery({
    queryKey: ["seller-notif-list", activeTab, search, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterTypes) for (const t of filterTypes) params.append("type", t);
      if (search.trim()) params.set("search", search.trim());
      const r = await fetch(getApiUrl(`/api/seller/notifications?${params}`), { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ notifications: SellerNotification[]; total: number; page: number; limit: number }>;
    },
    staleTime: 10000,
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

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 20)));
  const hasUnread = notifications.some((n) => !n.read);

  const grouped = notifications.reduce<Record<string, SellerNotification[]>>((acc, n) => {
    const key = formatDate(n.createdAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <SellerLayout title="Notifications">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="font-serif text-xl font-bold" style={{ color: MAROON }}>Notifications</h2>
          <p className="text-sm text-gray-500">Stay on top of orders, stock levels, and customer requests.</p>
        </div>

        <div className="flex flex-wrap gap-3 items-center">
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
          <div className="relative flex-1 min-w-[180px] max-w-xs">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

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
              <p className="text-sm font-medium text-gray-400">No notifications</p>
              <p className="text-xs text-gray-300 mt-1">You're all caught up.</p>
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
                      <p className="text-[10px] text-gray-300 mt-1">{relativeTime(n.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.read && (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          title="Mark as read"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:bg-gray-100"
                          style={{ color: undefined }}
                        >
                          <CheckCircle size={14} className="hover:text-[#1E6B5A]" />
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
