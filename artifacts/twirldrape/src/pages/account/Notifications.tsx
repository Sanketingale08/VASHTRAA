import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bell, Package, Truck, CheckCircle, XCircle, Tag, Heart,
  Trash2, CheckCheck, Clock, CreditCard, PackageCheck, MapPin, TrendingDown, Zap,
  Search, Circle, ExternalLink,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = basePath;

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, any> | null;
}

function deepLinkFor(n: Notification): string | null {
  const m = n.metadata || {};
  if (m.orderId) return `${basePath}/account/orders`;
  if (m.productId) return `${basePath}/products/${m.productId}`;
  return null;
}

interface Preferences {
  orderUpdates: boolean;
  offerAlerts: boolean;
  stockAlerts: boolean;
  emailOrderUpdates: boolean;
}

function typeIcon(type: string, size = 16) {
  switch (type) {
    case "order_confirmed":
    case "new_order_placed": return <Package size={size} className="text-green-600" />;
    case "order_shipped":    return <Truck size={size} className="text-blue-500" />;
    case "order_delivered":  return <CheckCircle size={size} className="text-green-600" />;
    case "order_cancelled":  return <XCircle size={size} className="text-red-500" />;
    case "return_requested":
    case "refund_requested": return <Clock size={size} className="text-amber-500" />;
    case "return_approved":
    case "refund_approved":  return <CheckCircle size={size} className="text-green-600" />;
    case "return_rejected":
    case "refund_rejected":  return <XCircle size={size} className="text-red-500" />;
    case "coupon_expiry":    return <Tag size={size} className="text-emerald-600" />;
    case "wishlist_restock": return <Heart size={size} className="text-rose-500" />;
    case "payment_successful": return <CreditCard size={size} className="text-green-600" />;
    case "order_packed":     return <PackageCheck size={size} className="text-blue-500" />;
    case "out_for_delivery": return <MapPin size={size} className="text-blue-500" />;
    case "price_drop":       return <TrendingDown size={size} className="text-rose-500" />;
    case "flash_sale":       return <Zap size={size} className="text-amber-500" />;
    default:                 return <Bell size={size} className="text-gray-400" />;
  }
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "order_confirmed,new_order_placed,payment_successful,order_packed,order_shipped,out_for_delivery,order_delivered,order_cancelled,return_requested,return_approved,return_rejected,refund_requested,refund_approved,refund_rejected", label: "Orders" },
  { key: "coupon_expiry,price_drop,flash_sale", label: "Offers" },
  { key: "wishlist_restock", label: "Stock" },
];

function SkeletonRow() {
  return (
    <div className="flex gap-3 p-4 animate-pulse">
      <div className="w-9 h-9 rounded-full bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 bg-gray-100 rounded w-1/2" />
        <div className="h-3 bg-gray-100 rounded w-3/4" />
      </div>
    </div>
  );
}

export function AccountNotificationsPage() {
  const [activeTab, setActiveTab] = useState("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const qc = useQueryClient();

  const filterType = activeTab === "all" ? undefined : activeTab;

  const { data, isLoading } = useQuery({
    queryKey: ["notif-list", activeTab, page, search, dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterType) {
        const types = filterType.split(",");
        for (const t of types) params.append("type", t);
      }
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(`${apiBase}/api/notifications?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ notifications: Notification[]; total: number; page: number; limit: number }>;
    },
    staleTime: 10000,
    refetchInterval: 8000,
  });

  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ["notif-prefs"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/notifications/preferences`, { credentials: "include" });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<Preferences>;
    },
  });

  const updatePrefs = useMutation({
    mutationFn: async (updates: Partial<Preferences>) => {
      const r = await fetch(`${apiBase}/api/notifications/preferences`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-prefs"] }),
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${apiBase}/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
    },
  });

  const markUnread = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${apiBase}/api/notifications/${id}/unread`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch(`${apiBase}/api/notifications/read-all`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${apiBase}/api/notifications/${id}`, { method: "DELETE", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
    },
  });

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / (data?.limit ?? 20));
  const hasUnread = notifications.some((n) => !n.read);

  // Group by date
  const grouped = notifications.reduce<Record<string, Notification[]>>((acc, n) => {
    const key = formatDate(n.createdAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  function handleTabChange(key: string) {
    setActiveTab(key);
    setPage(1);
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1E6B5A] mb-0.5">Notifications</h2>
          <p className="text-sm text-gray-500">Stay up to date with your orders, offers, and stock alerts.</p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-[#E6F0EA] rounded-xl w-fit">
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => handleTabChange(key)}
              className={cn(
                "px-4 py-1.5 rounded-lg text-sm font-semibold transition-all",
                activeTab === key
                  ? "bg-white text-[#1E6B5A] shadow-sm"
                  : "text-gray-500 hover:text-[#1E6B5A]"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search + date range */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search notifications..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#C9A84C]/20 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1E6B5A]/30"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-[#C9A84C]/20 rounded-lg text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1E6B5A]/30"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-[#C9A84C]/20 rounded-lg text-gray-600 focus:outline-none focus:ring-1 focus:ring-[#1E6B5A]/30"
          />
          {(search || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setPage(1); }}
              className="text-xs font-semibold text-[#1E6B5A] hover:text-[#C9A84C]"
            >
              Clear
            </button>
          )}
        </div>

        {/* Mark all read banner */}
        {hasUnread && !isLoading && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between bg-[#1E6B5A]/5 border border-[#1E6B5A]/10 rounded-xl px-4 py-3"
          >
            <p className="text-sm text-[#1E6B5A]">You have unread notifications</p>
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 text-sm font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors disabled:opacity-50"
            >
              <CheckCheck size={15} />
              Mark all as read
            </button>
          </motion.div>
        )}

        {/* Notifications list */}
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden shadow-sm">
          {isLoading ? (
            <>
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center px-4">
              <Bell size={36} className="text-gray-200 mb-3" />
              <p className="text-sm font-medium text-gray-400">No notifications</p>
              <p className="text-xs text-gray-300 mt-1">
                {activeTab === "all"
                  ? "You're all caught up! Notifications will appear here."
                  : "No notifications of this type yet."}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="px-4 py-2 bg-[#F3F8F5] border-b border-[#C9A84C]/10">
                  <p className="text-[10px] font-bold text-[#7a5f4e] uppercase tracking-widest">{dateLabel}</p>
                </div>
                {items.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-3 px-4 py-4 border-b border-gray-50 last:border-0 group transition-colors",
                      !n.read && "bg-[#F3F8F5]/50",
                      n.read ? "hover:bg-gray-50/60" : "hover:bg-[#F3F8F5]/80"
                    )}
                  >
                    <div className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      n.read ? "bg-gray-100" : "bg-white border border-[#C9A84C]/20"
                    )}>
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm", n.read ? "text-gray-600" : "text-[#3D1A1A] font-semibold")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <p className="text-[10px] text-gray-300">{relativeTime(n.createdAt)}</p>
                        {deepLinkFor(n) && (
                          <Link
                            href={deepLinkFor(n)!}
                            className="flex items-center gap-0.5 text-[10px] font-semibold text-[#1E6B5A] hover:text-[#C9A84C]"
                          >
                            View details <ExternalLink size={10} />
                          </Link>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!n.read ? (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          title="Mark as read"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-[#1E6B5A] hover:bg-[#1E6B5A]/5 transition-colors"
                        >
                          <CheckCircle size={14} />
                        </button>
                      ) : (
                        <button
                          onClick={() => markUnread.mutate(n.id)}
                          title="Mark as unread"
                          className="w-7 h-7 rounded-md flex items-center justify-center text-gray-300 hover:text-[#1E6B5A] hover:bg-[#1E6B5A]/5 transition-colors"
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
                    {!n.read && (
                      <span className="mt-2 w-2 h-2 rounded-full bg-[#1E6B5A] shrink-0" />
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 text-sm font-medium text-[#1E6B5A] border border-[#C9A84C]/30 rounded-lg hover:bg-[#F3F8F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-[#1E6B5A] border border-[#C9A84C]/30 rounded-lg hover:bg-[#F3F8F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* Notification Preferences */}
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#C9A84C]/10 bg-[#F3F8F5]">
            <h3 className="text-sm font-bold text-[#1E6B5A]">In-App Notification Preferences</h3>
            <p className="text-xs text-gray-400 mt-0.5">Choose which notifications you'd like to receive in-app.</p>
          </div>
          {prefsLoading ? (
            <div className="p-4 space-y-4 animate-pulse">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="h-3.5 bg-gray-100 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-48" />
                  </div>
                  <div className="w-10 h-6 bg-gray-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {[
                { key: "orderUpdates" as const, label: "Order updates", desc: "Confirmations, shipping, and delivery status" },
                { key: "offerAlerts" as const, label: "Offers & coupons", desc: "When coupons are about to expire" },
                { key: "stockAlerts" as const, label: "Stock alerts", desc: "When wishlisted items come back in stock" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between px-4 py-4">
                  <div>
                    <p className="text-sm font-medium text-[#3D1A1A]">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={prefs?.[key] ?? true}
                    onClick={() =>
                      updatePrefs.mutate({ [key]: !(prefs?.[key] ?? true) })
                    }
                    disabled={updatePrefs.isPending}
                    className={cn(
                      "relative w-10 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-50",
                      (prefs?.[key] ?? true) ? "bg-[#1E6B5A]" : "bg-gray-200"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                        (prefs?.[key] ?? true) ? "translate-x-4" : "translate-x-0"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Notification Preferences */}
        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-[#C9A84C]/10 bg-[#F3F8F5]">
            <h3 className="text-sm font-bold text-[#1E6B5A]">Email Notification Preferences</h3>
            <p className="text-xs text-gray-400 mt-0.5">Control which transactional emails you receive from us.</p>
          </div>
          {prefsLoading ? (
            <div className="p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="space-y-1.5">
                  <div className="h-3.5 bg-gray-100 rounded w-32" />
                  <div className="h-3 bg-gray-100 rounded w-48" />
                </div>
                <div className="w-10 h-6 bg-gray-100 rounded-full" />
              </div>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              <div className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-[#3D1A1A]">Order email updates</p>
                  <p className="text-xs text-gray-400 mt-0.5">Emails for shipping, delivery, returns, and refund status</p>
                </div>
                <button
                  role="switch"
                  aria-checked={prefs?.emailOrderUpdates ?? true}
                  onClick={() =>
                    updatePrefs.mutate({ emailOrderUpdates: !(prefs?.emailOrderUpdates ?? true) })
                  }
                  disabled={updatePrefs.isPending}
                  className={cn(
                    "relative w-10 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-50",
                    (prefs?.emailOrderUpdates ?? true) ? "bg-[#1E6B5A]" : "bg-gray-200"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      (prefs?.emailOrderUpdates ?? true) ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
