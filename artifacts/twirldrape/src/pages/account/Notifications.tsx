import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Bell, Package, Truck, CheckCircle, XCircle, Tag,
  Trash2, CheckCheck, Clock, CreditCard, PackageCheck, MapPin, TrendingDown, Zap,
  Search, Circle, ExternalLink, AlertTriangle,
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
  emailOrderUpdates: boolean;
  emailMarketingUpdates: boolean;
  emailOfferUpdates: boolean;
  emailStockAlerts: boolean;
}

function typeIcon(type: string, size = 18) {
  switch (type) {
    case "order_confirmed":
    case "new_order_placed":   return <Package size={size} className="text-emerald-600" />;
    case "order_processing":   return <Clock size={size} className="text-amber-500" />;
    case "order_shipped":      return <Truck size={size} className="text-blue-500" />;
    case "order_packed":       return <PackageCheck size={size} className="text-blue-500" />;
    case "out_for_delivery":   return <MapPin size={size} className="text-indigo-500" />;
    case "order_delivered":    return <CheckCircle size={size} className="text-emerald-600" />;
    case "order_cancelled":    return <XCircle size={size} className="text-red-500" />;
    case "return_requested":
    case "refund_requested":   return <Clock size={size} className="text-amber-500" />;
    case "return_approved":
    case "refund_approved":    return <CheckCircle size={size} className="text-emerald-600" />;
    case "return_rejected":
    case "refund_rejected":    return <XCircle size={size} className="text-red-500" />;
    case "refund_completed":   return <CheckCircle size={size} className="text-emerald-600" />;
    case "payment_successful": return <CreditCard size={size} className="text-emerald-600" />;
    case "coupon_expiry":      return <Tag size={size} className="text-amber-600" />;
    case "price_drop":         return <TrendingDown size={size} className="text-rose-500" />;
    case "flash_sale":         return <Zap size={size} className="text-amber-500" />;
    default:                   return <Bell size={size} className="text-gray-400" />;
  }
}

function iconBg(type: string, read: boolean): string {
  if (read) return "bg-gray-50 border border-gray-100";
  switch (type) {
    case "order_confirmed":
    case "new_order_placed":
    case "order_delivered":
    case "payment_successful":
    case "return_approved":
    case "refund_approved":
    case "refund_completed":   return "bg-emerald-50 border border-emerald-100";
    case "order_shipped":
    case "order_packed":       return "bg-blue-50 border border-blue-100";
    case "out_for_delivery":   return "bg-indigo-50 border border-indigo-100";
    case "order_cancelled":
    case "return_rejected":
    case "refund_rejected":    return "bg-red-50 border border-red-100";
    case "coupon_expiry":
    case "order_processing":   return "bg-amber-50 border border-amber-100";
    case "price_drop":         return "bg-rose-50 border border-rose-100";
    default:                   return "bg-gray-50 border border-gray-100";
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

function formatTimestamp(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs} hour${diffHrs === 1 ? "" : "s"} ago`;

  const timeStr = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return `Today, ${timeStr}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${timeStr}`;

  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays < 7) return `${diffDays} days ago`;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) + ", " + timeStr;
}

const TYPE_FILTERS = [
  { key: "all", label: "All" },
  { key: "order_confirmed,new_order_placed,payment_successful,order_processing,order_packed,order_shipped,out_for_delivery,order_delivered,order_cancelled,return_requested,return_approved,return_rejected,refund_requested,refund_approved,refund_rejected,refund_completed", label: "Orders" },
  { key: "coupon_expiry,price_drop,flash_sale", label: "Offers" },
];

function SkeletonRow() {
  return (
    <div className="flex gap-4 px-5 py-4 animate-pulse">
      <div className="w-10 h-10 rounded-2xl bg-gray-100 shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <div className="h-3.5 bg-gray-100 rounded-full w-2/5" />
        <div className="h-3 bg-gray-100 rounded-full w-3/4" />
        <div className="h-2.5 bg-gray-100 rounded-full w-1/4" />
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
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
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
      setConfirmDeleteId(null);
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
      <div className="space-y-5">
        {/* Heading — no subtitle */}
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1E6B5A]">Notifications</h2>
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
          <div className="relative flex-1 min-w-[220px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search notifications…"
              className="w-full pl-9 pr-3 py-2.5 text-sm bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A]/50 placeholder:text-gray-400 text-gray-700 shadow-sm"
            />
          </div>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
            className="px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-xl text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A]/50 shadow-sm"
          />
          <span className="text-xs text-gray-400">to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-2.5 text-sm bg-white border border-gray-300 rounded-xl text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A]/50 shadow-sm"
          />
          {(search || dateFrom || dateTo) && (
            <button
              onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); setPage(1); }}
              className="text-xs font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
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
            className="flex items-center justify-between bg-[#1E6B5A]/5 border border-[#1E6B5A]/15 rounded-2xl px-5 py-3"
          >
            <p className="text-sm text-[#1E6B5A] font-medium">You have unread notifications</p>
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
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {isLoading ? (
            <div className="divide-y divide-gray-50">
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
              <SkeletonRow />
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
              <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
                <Bell size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-400">No notifications</p>
              <p className="text-xs text-gray-300 mt-1">
                {activeTab === "all"
                  ? "You're all caught up! Notifications will appear here."
                  : "No notifications of this type yet."}
              </p>
            </div>
          ) : (
            Object.entries(grouped).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                {/* Date group header */}
                <div className="px-5 py-2 bg-gray-50 border-b border-gray-100">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{dateLabel}</p>
                </div>

                {items.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      "flex items-start gap-4 px-5 py-4 border-b border-gray-50 last:border-0 transition-colors",
                      !n.read ? "bg-[#F7FBFA]" : "bg-white hover:bg-gray-50/70"
                    )}
                  >
                    {/* Icon */}
                    <div className={cn(
                      "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 mt-0.5",
                      iconBg(n.type, n.read)
                    )}>
                      {typeIcon(n.type)}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-sm leading-snug",
                        n.read ? "text-gray-600 font-normal" : "text-[#1a1a2e] font-semibold"
                      )}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[11px] font-medium text-gray-400">{formatTimestamp(n.createdAt)}</span>
                        {deepLinkFor(n) && (
                          <Link
                            href={deepLinkFor(n)!}
                            className="flex items-center gap-0.5 text-[11px] font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
                          >
                            View details <ExternalLink size={10} className="ml-0.5" />
                          </Link>
                        )}
                      </div>
                    </div>

                    {/* Actions — always visible */}
                    <div className="flex items-center gap-1 shrink-0 mt-0.5">
                      {!n.read ? (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          title="Mark as read"
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-[#1E6B5A] hover:bg-[#1E6B5A]/8 transition-colors"
                        >
                          <CheckCircle size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => markUnread.mutate(n.id)}
                          title="Mark as unread"
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-[#1E6B5A] hover:bg-[#1E6B5A]/8 transition-colors"
                        >
                          <Circle size={15} />
                        </button>
                      )}

                      {/* Delete with inline confirmation */}
                      {confirmDeleteId === n.id ? (
                        <div className="flex items-center gap-1 bg-red-50 border border-red-100 rounded-xl px-2 py-1">
                          <AlertTriangle size={12} className="text-red-400 shrink-0" />
                          <span className="text-[11px] text-red-500 font-medium whitespace-nowrap">Delete?</span>
                          <button
                            onClick={() => dismiss.mutate(n.id)}
                            disabled={dismiss.isPending}
                            className="text-[11px] font-bold text-red-600 hover:text-red-700 disabled:opacity-50 ml-1"
                          >
                            Yes
                          </button>
                          <span className="text-red-200 text-xs">/</span>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-[11px] font-medium text-gray-400 hover:text-gray-600"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(n.id)}
                          title="Delete notification"
                          className="w-8 h-8 rounded-xl flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>

                    {/* Unread dot */}
                    {!n.read && (
                      <span className="mt-2.5 w-2 h-2 rounded-full bg-[#1E6B5A] shrink-0" />
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
              className="px-4 py-2 text-sm font-medium text-[#1E6B5A] border border-[#C9A84C]/30 rounded-xl hover:bg-[#F3F8F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-400">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-4 py-2 text-sm font-medium text-[#1E6B5A] border border-[#C9A84C]/30 rounded-xl hover:bg-[#F3F8F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}

        {/* In-App Notification Preferences */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-bold text-[#1E6B5A]">In-App Notifications</h3>
          </div>
          {prefsLoading ? (
            <div className="p-5 space-y-5 animate-pulse">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="h-3.5 bg-gray-100 rounded-full w-32" />
                    <div className="h-3 bg-gray-100 rounded-full w-48" />
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
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={prefs?.[key] ?? true}
                    onClick={() => updatePrefs.mutate({ [key]: !(prefs?.[key] ?? true) })}
                    disabled={updatePrefs.isPending}
                    className={cn(
                      "relative w-10 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-50",
                      (prefs?.[key] ?? true) ? "bg-[#1E6B5A]" : "bg-gray-200"
                    )}
                  >
                    <span className={cn(
                      "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      (prefs?.[key] ?? true) ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email Notification Preferences */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-bold text-[#1E6B5A]">Email Notifications</h3>
          </div>
          {prefsLoading ? (
            <div className="p-5 space-y-5 animate-pulse">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="space-y-1.5">
                    <div className="h-3.5 bg-gray-100 rounded-full w-32" />
                    <div className="h-3 bg-gray-100 rounded-full w-48" />
                  </div>
                  <div className="w-10 h-6 bg-gray-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {[
                { key: "emailOrderUpdates" as const, label: "Order email updates", desc: "Emails for shipping, delivery, returns, and refund status" },
                { key: "emailMarketingUpdates" as const, label: "Promotional emails", desc: "Flash sales, new arrivals, coupons, and special offers" },
                { key: "emailOfferUpdates" as const, label: "Offer & coupon emails", desc: "Emails when your coupons are expiring soon" },
                { key: "emailStockAlerts" as const, label: "Stock alert emails", desc: "Emails when wishlisted items come back in stock" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={prefs?.[key] ?? true}
                    onClick={() => updatePrefs.mutate({ [key]: !(prefs?.[key] ?? true) })}
                    disabled={updatePrefs.isPending}
                    className={cn(
                      "relative w-10 h-6 rounded-full transition-colors focus:outline-none disabled:opacity-50",
                      (prefs?.[key] ?? true) ? "bg-[#1E6B5A]" : "bg-gray-200"
                    )}
                  >
                    <span className={cn(
                      "absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform",
                      (prefs?.[key] ?? true) ? "translate-x-4" : "translate-x-0"
                    )} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
