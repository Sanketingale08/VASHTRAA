import { useState, useEffect, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  X,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  Tag,
  Heart,
  ArrowRight,
  Clock,
  CreditCard,
  PackageCheck,
  MapPin,
  TrendingDown,
  Zap,
  RotateCcw,
} from "lucide-react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
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

function renderIcon(type: string) {
  const t = (type || "").toLowerCase();
  switch (t) {
    case "order_confirmed":
      return <CheckCircle size={15} className="text-teal-600" />;
    case "order_placed":
    case "new_order_placed":
      return <Package size={15} className="text-emerald-600" />;
    case "order_shipped":
    case "shipped":
    case "dispatched":
      return <Truck size={15} className="text-indigo-600" />;
    case "order_delivered":
    case "delivered":
      return <CheckCircle size={15} className="text-emerald-600" />;
    case "order_cancelled":
    case "cancelled":
      return <XCircle size={15} className="text-rose-500" />;
    case "return_requested":
    case "refund_requested":
      return <RotateCcw size={15} className="text-amber-500" />;
    case "return_approved":
    case "refund_approved":
    case "refund_completed":
      return <CheckCircle size={15} className="text-teal-600" />;
    case "return_rejected":
    case "refund_rejected":
      return <XCircle size={15} className="text-rose-500" />;
    case "coupon_expiry":
    case "coupon_available":
      return <Tag size={15} className="text-purple-600" />;
    case "wishlist_restock":
      return <Heart size={15} className="text-rose-500" />;
    case "payment_successful":
      return <CreditCard size={15} className="text-emerald-600" />;
    case "order_packed":
    case "packed":
      return <PackageCheck size={15} className="text-blue-500" />;
    case "out_for_delivery":
      return <MapPin size={15} className="text-sky-600" />;
    case "price_drop":
      return <TrendingDown size={15} className="text-rose-500" />;
    case "flash_sale":
      return <Zap size={15} className="text-amber-500" />;
    default:
      return <Bell size={15} className="text-[#0A1F44]" />;
  }
}

interface Props {
  isDark: boolean;
}

export function NotificationBell({ isDark }: Props) {
  const { isSignedIn: isClerkSignedIn } = useUser();
  const { isSignedIn: isCustomSignedIn } = useAuth();
  const isSignedIn = !!(isClerkSignedIn || isCustomSignedIn);
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  // Preferences
  const { data: prefs } = useQuery<NotificationPreferences>({
    queryKey: ["notif-prefs"],
    queryFn: async () => {
      const r = await apiFetch(`/api/notifications/preferences`);
      if (!r.ok) return DEFAULT_PREFERENCES;
      return r.json();
    },
    enabled: !!isSignedIn,
    staleTime: 60000,
  });

  // Notifications List
  const { data: listData, isLoading: listLoading } = useQuery<{ notifications: Notification[] }>({
    queryKey: ["notif-drawer"],
    queryFn: async () => {
      const r = await apiFetch(`/api/notifications?limit=25`);
      if (!r.ok) return { notifications: [] };
      return r.json();
    },
    enabled: !!isSignedIn && open,
    staleTime: 10000,
    refetchInterval: 12000,
  });

  // Apply Isolation, Preferences & Deduplication
  const userNotifications = useMemo(() => {
    const raw = listData?.notifications ?? [];
    const isolated = raw.filter(isUserDashboardNotification);
    const prefGated = filterNotificationsByPreferences(isolated, prefs);
    return deduplicateNotifications(prefGated);
  }, [listData, prefs]);

  // Unread Count
  const { data: countData } = useQuery<{ count: number }>({
    queryKey: ["notif-count"],
    queryFn: async () => {
      const r = await apiFetch(`/api/notifications/unread-count`);
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    enabled: !!isSignedIn,
    refetchInterval: 10000,
    staleTime: 15000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/notifications/${id}/read`, { method: "PATCH" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/notifications/read-all`, { method: "PATCH" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!isSignedIn) return null;

  const unreadCount = countData?.count ?? 0;

  return (
    <div ref={drawerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-xl transition-colors",
          isDark ? "hover:bg-white/10 text-white" : "hover:bg-[#0A1F44]/10 text-[#0A1F44]"
        )}
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 bg-[#0A1F44] text-white text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none shadow-xs border-2 border-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-84 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#0A1F44]">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-[#0A1F44] text-white px-1.5 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                    className="text-[11px] font-semibold text-[#0A1F44] hover:underline transition-colors disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                  title="Close"
                >
                  <X size={15} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
              {listLoading ? (
                <div className="flex flex-col gap-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 shrink-0" />
                      <div className="flex-1 space-y-1.5 pt-0.5">
                        <div className="h-3 bg-slate-100 rounded w-3/4" />
                        <div className="h-2.5 bg-slate-100 rounded w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : userNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-300 mb-2">
                    <Bell size={24} />
                  </div>
                  <p className="text-sm font-semibold text-[#0A1F44]">No notifications yet</p>
                  <p className="text-xs text-slate-400 mt-0.5 max-w-[220px]">
                    We'll let you know about your orders, shipments, and exclusive deals here.
                  </p>
                </div>
              ) : (
                userNotifications.slice(0, 8).map((n) => {
                  const details = formatNotificationContent(n, basePath);
                  const timestampStr = formatNotificationTimestamp(n.createdAt);
                  const isUnread = !n.read;

                  return (
                    <button
                      key={n.id}
                      onClick={() => {
                        if (isUnread) markRead.mutate(n.id);
                        if (details.deepLink) {
                          setOpen(false);
                          window.location.href = details.deepLink;
                        }
                      }}
                      className={cn(
                        "w-full flex items-start gap-3 p-3.5 text-left hover:bg-slate-50/80 transition-colors",
                        isUnread && "bg-[#FAFBFD]"
                      )}
                    >
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border mt-0.5",
                          details.iconBg,
                          isUnread ? "border-slate-200" : "border-slate-100"
                        )}
                      >
                        {renderIcon(n.type)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p
                            className={cn(
                              "text-xs leading-snug",
                              isUnread ? "font-bold text-[#0A1F44]" : "font-medium text-slate-700"
                            )}
                          >
                            {details.displayTitle}
                          </p>
                          <span className="text-[10px] text-slate-400 font-medium shrink-0">
                            {timestampStr}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                          {details.statusMessage}
                        </p>
                      </div>

                      {isUnread && (
                        <span className="mt-2 w-2 h-2 rounded-full bg-[#0A1F44] shrink-0" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-slate-100 px-4 py-2.5 bg-slate-50/50">
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#0A1F44] hover:underline transition-colors py-1"
              >
                View all notifications <ArrowRight size={13} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default NotificationBell;
