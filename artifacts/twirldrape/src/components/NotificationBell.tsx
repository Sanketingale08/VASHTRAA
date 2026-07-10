import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, X, Package, Truck, CheckCircle, XCircle, Tag, Heart, ArrowRight, Clock, CreditCard, PackageCheck, MapPin, TrendingDown, Zap } from "lucide-react";
import { Link } from "wouter";
import { useUser } from "@clerk/react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const apiBase = basePath;

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function typeIcon(type: string) {
  switch (type) {
    case "order_confirmed":  return <Package size={14} className="text-green-600" />;
    case "order_shipped":    return <Truck size={14} className="text-blue-500" />;
    case "order_delivered":  return <CheckCircle size={14} className="text-green-600" />;
    case "order_cancelled":  return <XCircle size={14} className="text-red-500" />;
    case "return_requested":
    case "refund_requested": return <Clock size={14} className="text-amber-500" />;
    case "return_approved":
    case "refund_approved":  return <CheckCircle size={14} className="text-green-600" />;
    case "return_rejected":
    case "refund_rejected":  return <XCircle size={14} className="text-red-500" />;
    case "coupon_expiry":    return <Tag size={14} className="text-emerald-600" />;
    case "wishlist_restock": return <Heart size={14} className="text-rose-500" />;
    case "payment_successful": return <CreditCard size={14} className="text-green-600" />;
    case "order_packed":     return <PackageCheck size={14} className="text-blue-500" />;
    case "out_for_delivery": return <MapPin size={14} className="text-blue-500" />;
    case "price_drop":       return <TrendingDown size={14} className="text-rose-500" />;
    case "flash_sale":       return <Zap size={14} className="text-amber-500" />;
    default:                 return <Bell size={14} className="text-gray-400" />;
  }
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

interface Props {
  isDark: boolean;
}

export function NotificationBell({ isDark }: Props) {
  const { isSignedIn } = useUser();
  const [open, setOpen] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const { data: countData } = useQuery({
    queryKey: ["notif-count"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/notifications/unread-count`, { credentials: "include" });
      if (!r.ok) return { count: 0 };
      return r.json() as Promise<{ count: number }>;
    },
    enabled: !!isSignedIn,
    refetchInterval: 60000,
    staleTime: 30000,
  });

  const { data: listData, isLoading: listLoading } = useQuery({
    queryKey: ["notif-drawer"],
    queryFn: async () => {
      const r = await fetch(`${apiBase}/api/notifications?limit=10`, { credentials: "include" });
      if (!r.ok) return { notifications: [] };
      return r.json() as Promise<{ notifications: Notification[] }>;
    },
    enabled: !!isSignedIn && open,
    staleTime: 10000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${apiBase}/api/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-count"] });
      qc.invalidateQueries({ queryKey: ["notif-drawer"] });
      qc.invalidateQueries({ queryKey: ["notif-list"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await fetch(`${apiBase}/api/notifications/read-all`, { method: "PATCH", credentials: "include" });
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

  const unread = countData?.count ?? 0;
  const notifications = listData?.notifications ?? [];

  return (
    <div ref={drawerRef} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex items-center justify-center w-9 h-9 rounded-md transition-colors",
          isDark ? "hover:bg-white/10" : "hover:bg-[#1E6B5A]/10"
        )}
        aria-label="Notifications"
      >
        <Bell size={19} />
        {unread > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 z-50 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-bold text-[#1E6B5A]">Notifications</h3>
              <div className="flex items-center gap-2">
                {unread > 0 && (
                  <button
                    onClick={() => markAllRead.mutate()}
                    disabled={markAllRead.isPending}
                    className="text-[10px] font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="max-h-[360px] overflow-y-auto">
              {listLoading ? (
                <div className="flex flex-col gap-3 p-4">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex gap-3 animate-pulse">
                      <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 bg-gray-100 rounded w-3/4" />
                        <div className="h-2.5 bg-gray-100 rounded w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center px-4">
                  <Bell size={28} className="text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No notifications yet</p>
                  <p className="text-xs text-gray-300 mt-0.5">We'll let you know when something comes up</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => {
                      if (!n.read) markRead.mutate(n.id);
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0",
                      !n.read && "bg-[#F3F8F5]/60"
                    )}
                  >
                    <div className={cn(
                      "w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                      n.read ? "bg-gray-100" : "bg-[#F3F8F5]"
                    )}>
                      {typeIcon(n.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={cn("text-sm leading-snug", n.read ? "text-gray-600" : "text-[#3D1A1A] font-medium")}>
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{n.body}</p>
                      <p className="text-[10px] text-gray-300 mt-1">{relativeTime(n.createdAt)}</p>
                    </div>
                    {!n.read && (
                      <span className="mt-2 w-2 h-2 rounded-full bg-[#1E6B5A] shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-gray-100 px-4 py-2.5">
              <Link
                href="/account/notifications"
                onClick={() => setOpen(false)}
                className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
              >
                View all notifications <ArrowRight size={12} />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
