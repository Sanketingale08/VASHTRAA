import { useState, useMemo, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Tag,
  Trash2,
  CheckCheck,
  Clock,
  CreditCard,
  PackageCheck,
  MapPin,
  TrendingDown,
  Zap,
  Search,
  Circle,
  ExternalLink,
  AlertTriangle,
  RotateCcw,
  Calendar,
  X,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import {
  type Notification,
  type NotificationPreferences,
  DEFAULT_PREFERENCES,
  isUserDashboardNotification,
  filterNotificationsByPreferences,
  formatNotificationContent,
  formatNotificationTimestamp,
  deduplicateNotifications,
} from "@/lib/notifications";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function renderCategoryIcon(type: string, size = 18) {
  const t = (type || "").toLowerCase();
  switch (t) {
    case "order_confirmed":
      return <CheckCircle size={size} className="text-teal-600" />;
    case "order_placed":
    case "new_order_placed":
      return <Package size={size} className="text-emerald-600" />;
    case "order_processing":
    case "processing":
      return <Clock size={size} className="text-amber-500" />;
    case "order_packed":
    case "packed":
      return <PackageCheck size={size} className="text-blue-500" />;
    case "order_shipped":
    case "shipped":
    case "dispatched":
      return <Truck size={size} className="text-indigo-600" />;
    case "out_for_delivery":
      return <MapPin size={size} className="text-sky-600" />;
    case "order_delivered":
    case "delivered":
      return <CheckCircle size={size} className="text-emerald-600" />;
    case "order_cancelled":
    case "cancelled":
      return <XCircle size={size} className="text-rose-500" />;
    case "return_requested":
    case "refund_requested":
      return <RotateCcw size={size} className="text-amber-500" />;
    case "return_approved":
    case "refund_approved":
      return <CheckCircle size={size} className="text-teal-600" />;
    case "refund_completed":
      return <CheckCircle size={size} className="text-emerald-600" />;
    case "return_rejected":
    case "refund_rejected":
      return <XCircle size={size} className="text-rose-500" />;
    case "payment_successful":
      return <CreditCard size={size} className="text-emerald-600" />;
    case "coupon_expiry":
    case "coupon_available":
      return <Tag size={size} className="text-purple-600" />;
    case "price_drop":
      return <TrendingDown size={size} className="text-rose-500" />;
    case "flash_sale":
      return <Zap size={size} className="text-amber-500" />;
    default:
      return <Bell size={size} className="text-[#0A1F44]" />;
  }
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/70 p-5 sm:p-6 shadow-sm animate-pulse flex items-start gap-4">
      <div className="w-12 h-12 rounded-2xl bg-slate-100 shrink-0" />
      <div className="flex-1 space-y-3 pt-0.5">
        <div className="flex items-center justify-between">
          <div className="h-4 bg-slate-100 rounded-full w-28" />
          <div className="h-3 bg-slate-100 rounded-full w-20" />
        </div>
        <div className="h-4 bg-slate-100 rounded-full w-2/5" />
        <div className="h-3.5 bg-slate-100 rounded-full w-4/5" />
      </div>
    </div>
  );
}

export function AccountNotificationsPage() {
  const [activeTab, setActiveTab] = useState<"all" | "orders" | "offers" | "unread">("all");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [actionToast, setActionToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const qc = useQueryClient();

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setActionToast({ message, type });
    setTimeout(() => setActionToast(null), 3500);
  };

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      const eventName = detail.name || detail.type || "";
      if (
        !eventName ||
        eventName.startsWith("notification:") ||
        eventName.startsWith("order:") ||
        eventName.startsWith("return:") ||
        eventName.startsWith("refund:") ||
        eventName.startsWith("ticket:") ||
        eventName.startsWith("support:") ||
        eventName.startsWith("reward:") ||
        eventName.startsWith("coupon:")
      ) {
        qc.invalidateQueries({ queryKey: ["notif-list"] });
        qc.invalidateQueries({ queryKey: ["notif-count"] });
        qc.invalidateQueries({ queryKey: ["notif-drawer"] });
        qc.invalidateQueries({ queryKey: ["notif-prefs"] });
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [qc]);

  // 1. Fetch Notification Preferences (for client-side category filtering)
  const { data: rawPrefs } = useQuery<NotificationPreferences>({
    queryKey: ["notif-prefs"],
    queryFn: async () => {
      const res = await apiFetch(`/api/notifications/preferences`);
      if (!res.ok) return DEFAULT_PREFERENCES;
      const data = await res.json();
      return {
        orderUpdates: data.orderUpdates ?? true,
        offerAlerts: data.offerAlerts ?? true,
        emailOrderUpdates: data.emailOrderUpdates ?? true,
        emailMarketingUpdates: data.emailMarketingUpdates ?? true,
        emailOfferUpdates: data.emailOfferUpdates ?? true,
      };
    },
    staleTime: 60000,
  });

  const activePreferences = useMemo<NotificationPreferences>(() => {
    return {
      ...DEFAULT_PREFERENCES,
      ...(rawPrefs || {}),
    };
  }, [rawPrefs]);

  // 2. Fetch Notifications List
  const { data: rawData, isLoading: notificationsLoading } = useQuery<{
    notifications: Notification[];
    total: number;
    page: number;
    limit: number;
  }>({
    queryKey: ["notif-list", page],
    queryFn: async () => {
      const params = new URLSearchParams({
        page: String(page),
        limit: "50", // Fetch enough to filter accurately client-side
      });
      const res = await apiFetch(`/api/notifications?${params}`);
      if (!res.ok) throw new Error("Failed to load notifications");
      return res.json();
    },
    staleTime: 10000,
    refetchInterval: 12000,
  });

  // 3. Mark Single as Read
  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark notification as read");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      showToast("Notification marked as read", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to mark notification as read", "error");
    },
  });

  // 5. Mark Single as Unread
  const markUnread = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/notifications/${id}/unread`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark notification as unread");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      showToast("Notification marked as unread", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to mark notification as unread", "error");
    },
  });

  // 6. Mark All as Read
  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/notifications/read-all`, { method: "PATCH" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to mark all as read");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      showToast("All notifications marked as read", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to mark all notifications as read", "error");
    },
  });

  // 7. Clear All Notifications
  const clearAll = useMutation({
    mutationFn: async () => {
      const res = await apiFetch(`/api/notifications/clear-all`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to clear notifications");
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmClearAll(false);
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      showToast("All notifications cleared successfully", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to clear notifications. Please try again.", "error");
    },
  });

  // 8. Dismiss / Delete Single Notification
  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiFetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to delete notification");
      }
      return res.json();
    },
    onSuccess: () => {
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ["notif-list"] });
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      showToast("Notification deleted successfully", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to delete notification", "error");
    },
  });

  const safeMarkRead = (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setUpdatingIds((prev) => new Set(prev).add(id));
    markRead.mutate(id, {
      onSettled: () => {
        inFlight.current.delete(id);
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  };

  const safeMarkUnread = (id: string) => {
    if (inFlight.current.has(id)) return;
    inFlight.current.add(id);
    setUpdatingIds((prev) => new Set(prev).add(id));
    markUnread.mutate(id, {
      onSettled: () => {
        inFlight.current.delete(id);
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  };

  const safeDismiss = (id: string) => {
    const key = `del:${id}`;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    dismiss.mutate(id, {
      onSettled: () => inFlight.current.delete(key),
    });
  };

  // DATA PIPELINE:
  // 1. Strict Isolation: Remove any seller/vendor notifications
  // 2. Preferences Enforcement: Suppress disabled categories
  // 3. Deduplication: Remove redundant/duplicate status updates for the same order
  const filteredNotifications = useMemo(() => {
    const rawList = rawData?.notifications ?? [];

    // Step 1: Isolation — User Dashboard only
    const userOnly = rawList.filter(isUserDashboardNotification);

    // Step 2: Preference enforcement
    const preferenceGated = filterNotificationsByPreferences(userOnly, activePreferences);

    // Step 3: Deduplicate identical status messages
    const deduped = deduplicateNotifications(preferenceGated);

    // Step 4: Search filter (search by title, status message, order ID, or keyword)
    const query = search.trim().toLowerCase();
    let searched = deduped;

    if (query) {
      searched = searched.filter((n) => {
        const details = formatNotificationContent(n);
        const titleMatch = details.displayTitle.toLowerCase().includes(query);
        const msgMatch = details.statusMessage.toLowerCase().includes(query);
        const orderMatch = (details.orderId || "").toLowerCase().includes(query);
        const rawTitleMatch = (n.title || "").toLowerCase().includes(query);
        const rawBodyMatch = (n.body || "").toLowerCase().includes(query);
        return titleMatch || msgMatch || orderMatch || rawTitleMatch || rawBodyMatch;
      });
    }

    // Step 5: Date Range filter
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      searched = searched.filter((n) => new Date(n.createdAt).getTime() >= fromTime);
    }
    if (dateTo) {
      const toTime = new Date(dateTo).setHours(23, 59, 59, 999);
      searched = searched.filter((n) => new Date(n.createdAt).getTime() <= toTime);
    }

    // Step 6: Active Tab Filter
    if (activeTab === "orders") {
      searched = searched.filter((n) => {
        const details = formatNotificationContent(n);
        return (
          details.orderId ||
          n.type.startsWith("order_") ||
          n.type.startsWith("return_") ||
          n.type.startsWith("refund_") ||
          n.type === "out_for_delivery" ||
          n.type === "payment_successful"
        );
      });
    } else if (activeTab === "offers") {
      searched = searched.filter((n) => {
        const t = (n.type || "").toLowerCase();
        return (
          t === "coupon_expiry" ||
          t === "coupon_available" ||
          t === "price_drop" ||
          t === "flash_sale" ||
          t === "promotion"
        );
      });
    } else if (activeTab === "unread") {
      searched = searched.filter((n) => !n.read);
    }

    return searched;
  }, [rawData, activePreferences, search, dateFrom, dateTo, activeTab]);

  const unreadCount = useMemo(() => {
    return filteredNotifications.filter((n) => !n.read).length;
  }, [filteredNotifications]);

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl mx-auto">
        {/* Page Title & Overview */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200/60">
          <div>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">
              Notifications
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Stay updated on your orders, payments, shipments, and exclusive offers.
            </p>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0A1F44] bg-[#0A1F44]/5 hover:bg-[#0A1F44]/10 rounded-xl transition-colors disabled:opacity-50"
                title="Mark all notifications as read"
              >
                <CheckCheck size={14} className={markAllRead.isPending ? "animate-spin" : "text-[#0A1F44]"} />
                {markAllRead.isPending ? "Marking..." : "Mark all as read"}
              </button>
            )}
            {filteredNotifications.length > 0 && (
              <button
                onClick={() => setConfirmClearAll(true)}
                disabled={clearAll.isPending}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
                title="Clear all notifications"
              >
                <Trash2 size={13} className={clearAll.isPending ? "animate-spin" : ""} />
                Clear all
              </button>
            )}
            <span className="text-xs font-semibold text-slate-600 bg-white border border-slate-200 px-3 py-2 rounded-xl shadow-xs">
              {filteredNotifications.length} {filteredNotifications.length === 1 ? "Notification" : "Notifications"}
            </span>
          </div>
        </div>

        {/* Clear All Confirmation Modal */}
        <AnimatePresence>
          {confirmClearAll && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl border border-slate-200 p-6 max-w-md w-full shadow-xl space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#0A1F44]">Clear All Notifications?</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
                    This action will clear all notifications from your notification list. Your orders, support tickets, and account history will not be affected.
                  </p>
                </div>
                <div className="flex items-center justify-end gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setConfirmClearAll(false)}
                    disabled={clearAll.isPending}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => clearAll.mutate()}
                    disabled={clearAll.isPending}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors disabled:opacity-50 shadow-xs"
                  >
                    {clearAll.isPending ? (
                      <>
                        <RotateCcw size={13} className="animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      <>
                        <Trash2 size={13} />
                        Yes, Clear All
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Action Notification Toast */}
        <AnimatePresence>
          {actionToast && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn(
                "text-xs sm:text-sm font-medium px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-between border",
                actionToast.type === "error"
                  ? "bg-rose-50 border-rose-200 text-rose-800"
                  : "bg-emerald-50 border-emerald-200 text-emerald-800"
              )}
            >
              <div className="flex items-center gap-2">
                {actionToast.type === "error" ? (
                  <AlertTriangle size={16} className="text-rose-600 shrink-0" />
                ) : (
                  <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                )}
                <span>{actionToast.message}</span>
              </div>
              <button
                onClick={() => setActionToast(null)}
                className={cn(
                  "hover:opacity-75",
                  actionToast.type === "error" ? "text-rose-600" : "text-emerald-600"
                )}
              >
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Search Bar & Filter Controls (Prominently Visible) */}
        <div className="bg-white rounded-2xl border border-slate-200/80 p-4 sm:p-5 shadow-xs space-y-3.5">
          {/* Main Search Input */}
          <div className="relative w-full">
            <Search
              size={18}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0A1F44]/40 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search notifications by order status, item name, order ID, or keyword…"
              className="w-full pl-11 pr-10 py-3 text-sm bg-slate-50/50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] placeholder:text-slate-400 text-slate-800 transition-all font-normal shadow-xs"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                title="Clear search"
              >
                <X size={15} />
              </button>
            )}
          </div>

          {/* Filter Bar: Tabs & Date Range */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            {/* Filter Category Tabs */}
            <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-xl overflow-x-auto">
              {[
                { id: "all" as const, label: "All" },
                { id: "orders" as const, label: "Orders" },
                { id: "offers" as const, label: "Offers & Coupons" },
                { id: "unread" as const, label: `Unread (${unreadCount})` },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all",
                    activeTab === tab.id
                      ? "bg-white text-[#0A1F44] shadow-xs"
                      : "text-slate-500 hover:text-[#0A1F44]"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Date Filters */}
            <div className="flex items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-slate-600">
                <Calendar size={13} className="text-slate-400" />
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 outline-none"
                  title="Filter from date"
                />
              </div>
              <span className="text-slate-400 text-[11px]">to</span>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl text-slate-600">
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="bg-transparent text-xs text-slate-700 outline-none"
                  title="Filter to date"
                />
              </div>

              {(search || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setSearch("");
                    setDateFrom("");
                    setDateTo("");
                  }}
                  className="text-xs font-semibold text-rose-600 hover:text-rose-700 underline ml-1"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Notification Cards List */}
        <div className="space-y-3.5">
          {notificationsLoading ? (
            <div className="space-y-3.5">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : filteredNotifications.length === 0 ? (
            /* Empty State */
            <div className="bg-white rounded-2xl border border-slate-200/80 p-12 text-center shadow-xs">
              <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center mx-auto mb-4 text-slate-300">
                <Bell size={28} />
              </div>
              <h3 className="font-serif text-lg font-semibold text-[#0A1F44]">No notifications found</h3>
              <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto mt-1">
                {search || dateFrom || dateTo || activeTab !== "all"
                  ? "No notifications match your current filters. Try resetting the search or date range."
                  : "You're all caught up! Order updates, shipping alerts, and promotions will appear here."}
              </p>
              {(search || dateFrom || dateTo) && (
                <button
                  onClick={() => {
                    setSearch("");
                    setDateFrom("");
                    setDateTo("");
                    setActiveTab("all");
                  }}
                  className="mt-4 px-4 py-2 text-xs font-semibold text-[#0A1F44] bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors inline-block"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            /* Redesigned Notification Cards */
            filteredNotifications.map((n) => {
              const details = formatNotificationContent(n, basePath);
              const timestampFormatted = formatNotificationTimestamp(n.createdAt);
              const isUnread = !n.read;

              return (
                <div
                  key={n.id}
                  className={cn(
                    "bg-white rounded-2xl border transition-all duration-200 p-5 sm:p-6 shadow-xs relative group",
                    isUnread
                      ? "border-[#0A1F44]/20 bg-[#FAFBFD] shadow-sm hover:border-[#0A1F44]/40"
                      : "border-slate-200/80 hover:border-slate-300 hover:shadow-md"
                  )}
                >
                  <div className="flex items-start gap-4">
                    {/* Category Icon */}
                    <div
                      className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border mt-0.5",
                        details.iconBg,
                        isUnread ? "shadow-xs" : "border-slate-100"
                      )}
                    >
                      {renderCategoryIcon(n.type, 20)}
                    </div>

                    {/* Card Content Stack */}
                    <div className="flex-1 min-w-0">
                      {/* Top Header: Badge, Timestamp, Unread status */}
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span
                          className={cn(
                            "px-2.5 py-0.5 rounded-full text-[11px] font-semibold border",
                            details.badgeStyle
                          )}
                        >
                          {details.badgeLabel}
                        </span>

                        {/* Always Clearly Visible Timestamp */}
                        <div className="flex items-center gap-1 text-slate-400 text-xs font-medium ml-1">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span>{timestampFormatted}</span>
                        </div>

                        {isUnread && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0A1F44] text-white tracking-wide uppercase">
                            New
                          </span>
                        )}
                      </div>

                      {/* Notification Title */}
                      <h4
                        className={cn(
                          "text-base tracking-tight font-serif",
                          isUnread ? "font-bold text-[#0A1F44]" : "font-semibold text-slate-800"
                        )}
                      >
                        {details.displayTitle}
                      </h4>

                      {/* Required Exact Status Message */}
                      <p className="text-sm text-slate-600 mt-1 leading-relaxed font-normal">
                        {details.statusMessage}
                      </p>

                      {/* Additional Details (Order ID or item reference) */}
                      {details.orderId && (
                        <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-100">
                          <span className="text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-0.5 rounded-md">
                            Order #{details.orderId.slice(0, 12)}
                          </span>

                          {details.deepLink && (
                            <Link
                              href={details.deepLink}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A1F44] hover:text-slate-600 transition-colors"
                            >
                              View order details <ExternalLink size={11} className="ml-0.5" />
                            </Link>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Always Visible Actions Bar */}
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      {/* Read / Unread Toggle */}
                      {isUnread ? (
                        <button
                          onClick={() => safeMarkRead(n.id)}
                          disabled={updatingIds.has(n.id) || markRead.isPending}
                          title="Mark as read"
                          aria-label="Mark as read"
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#0A1F44] hover:bg-[#0A1F44]/5 transition-colors border border-transparent hover:border-slate-200 disabled:opacity-50"
                        >
                          {updatingIds.has(n.id) ? (
                            <RotateCcw size={15} className="animate-spin text-[#0A1F44]" />
                          ) : (
                            <CheckCircle size={17} />
                          )}
                        </button>
                      ) : (
                        <button
                          onClick={() => safeMarkUnread(n.id)}
                          disabled={updatingIds.has(n.id) || markUnread.isPending}
                          title="Mark as unread"
                          aria-label="Mark as unread"
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-400 hover:text-[#0A1F44] hover:bg-[#0A1F44]/5 transition-colors border border-transparent hover:border-slate-200 disabled:opacity-50"
                        >
                          {updatingIds.has(n.id) ? (
                            <RotateCcw size={15} className="animate-spin text-[#0A1F44]" />
                          ) : (
                            <Circle size={16} />
                          )}
                        </button>
                      )}

                      {/* ALWAYS VISIBLE DELETE BUTTON */}
                      {confirmDeleteId === n.id ? (
                        <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-xl px-2.5 py-1 shadow-xs">
                          <AlertTriangle size={13} className="text-rose-500 shrink-0" />
                          <span className="text-xs text-rose-700 font-semibold">Delete?</span>
                          <button
                            onClick={() => safeDismiss(n.id)}
                            disabled={dismiss.isPending}
                            className="text-xs font-bold text-rose-700 hover:text-rose-900 bg-rose-100 hover:bg-rose-200 px-2 py-0.5 rounded-md transition-colors disabled:opacity-50"
                          >
                            {dismiss.isPending ? "..." : "Yes"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-xs font-medium text-slate-500 hover:text-slate-700 px-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(n.id)}
                          title="Delete notification"
                          aria-label="Delete notification"
                          className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors border border-rose-100 hover:border-rose-300 shadow-2xs"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}

export default AccountNotificationsPage;
