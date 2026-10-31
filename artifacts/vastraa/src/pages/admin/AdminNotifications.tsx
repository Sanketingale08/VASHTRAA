import React, { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, Trash2, CheckCheck, CheckCircle, Search, UserPlus, FileCheck,
  FileClock, IndianRupee, MessageSquareWarning, ServerCrash, Wallet, CreditCard, Circle, ExternalLink, RefreshCw,
  Mail, AlertTriangle, RotateCcw, ChevronLeft, ChevronRight, X,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { cn } from "@/lib/utils";
import { AdminErrorBoundary, AdminErrorState, AdminEmptyState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";
import { adminHeaders } from '@/lib/adminApi';

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";
const CREAM = "#F1F5F9";

interface AdminNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, any> | null;
}

interface DeadEmailEntry {
  id: string;
  orderId: string | null;
  userId: string | null;
  toEmail: string;
  subject: string;
  type: string;
  attempts: number;
  lastAttemptAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

function deepLinkFor(n: AdminNotification): string | null {
  const m = n.metadata || {};
  if (m.vendorId) return `${basePath}/admin/vendors/${m.vendorId}`;
  if (m.ticketId) return `${basePath}/admin/support`;
  if (m.orderId || m.productId) return `${basePath}/admin/dashboard`;
  return null;
}

function typeIcon(type: string, size = 16) {
  switch (type) {
    case "new_seller_registration": return <UserPlus size={size} className="text-blue-500" />;
    case "kyc_submitted": return <FileCheck size={size} className="text-amber-500" />;
    case "product_pending_approval": return <FileClock size={size} className="text-amber-500" />;
    case "high_value_order": return <IndianRupee size={size} className="text-green-600" />;
    case "customer_complaint": return <MessageSquareWarning size={size} className="text-red-500" />;
    case "system_error_alert": return <ServerCrash size={size} className="text-red-500" />;
    case "payout_failed": return <Wallet size={size} className="text-red-500" />;
    case "payment_gateway_issue": return <CreditCard size={size} className="text-red-500" />;
    case "seller_support_request": return <MessageSquareWarning size={size} className="text-amber-500" />;
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
  { key: "new_seller_registration,kyc_submitted", label: "Sellers" },
  { key: "product_pending_approval", label: "Products" },
  { key: "high_value_order", label: "Orders" },
  { key: "customer_complaint", label: "Complaints" },
  { key: "seller_support_request", label: "Support" },
  { key: "system_error_alert,payment_gateway_issue,payout_failed", label: "System" },
];

function EmailOutboxSection() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkState, setBulkState] = useState<"idle" | "pending" | "done" | "error">("idle");
  const [bulkResult, setBulkResult] = useState<{ retried: number; skipped: number } | null>(null);

  const { data, isLoading, isError: isOutboxError, error: outboxError, refetch } = useQuery({
    queryKey: ["admin-email-outbox-dead", page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      const r = await fetch(`/api/admin/email-outbox/dead?${params}`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ entries: DeadEmailEntry[]; total: number; page: number; limit: number }>;
    },
    staleTime: 15000,
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 20)));

  const allPageIds = entries.map((e) => e.id);
  const allSelected = allPageIds.length > 0 && allPageIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  function toggleAll() {
    if (allSelected) {
      setSelected((s) => { const n = new Set(s); allPageIds.forEach((id) => n.delete(id)); return n; });
    } else {
      setSelected((s) => { const n = new Set(s); allPageIds.forEach((id) => n.add(id)); return n; });
    }
  }

  function toggleOne(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function bulkRetry() {
    if (bulkState === "pending" || selected.size === 0) return;
    setBulkState("pending");
    setBulkResult(null);
    const ids = Array.from(selected);
    const results = await Promise.allSettled(
      ids.map((id) =>
        fetch(`/api/admin/email-outbox/${id}/retry`, {
          method: "POST",
          headers: adminHeaders(),
          credentials: "include",
        })
      )
    );
    let retried = 0;
    let skipped = 0;
    for (const r of results) {
      if (r.status === "fulfilled") {
        if (r.value.status === 200) retried++;
        else skipped++;
      } else {
        skipped++;
      }
    }
    setBulkState("done");
    setBulkResult({ retried, skipped });
    setSelected(new Set());
    // Refresh the list
    await refetch();
    qc.invalidateQueries({ queryKey: ["admin-email-outbox-dead"] });
    setTimeout(() => { setBulkState("idle"); setBulkResult(null); }, 5000);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-serif text-xl font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Mail size={18} />
            Email Outbox
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">Dead emails that failed all delivery attempts — select and retry in bulk.</p>
        </div>
        <div className="flex items-center gap-2">
          {bulkResult && (
            <span className="text-xs font-medium px-2 py-1 rounded-lg" style={{ background: bulkResult.skipped === 0 ? "#f0fdf4" : "#fffbeb", color: bulkResult.skipped === 0 ? "#16a34a" : "#d97706" }}>
              {bulkResult.retried} queued{bulkResult.skipped > 0 ? `, ${bulkResult.skipped} skipped` : ""}
            </span>
          )}
          <button
            onClick={bulkRetry}
            disabled={!someSelected || bulkState === "pending" || bulkState === "done"}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all disabled:opacity-40"
            style={{ background: someSelected && bulkState === "idle" ? GOLD : "#e5e7eb", color: someSelected && bulkState === "idle" ? "#fff" : "#9ca3af" }}
            title={someSelected ? `Retry ${selected.size} selected email(s)` : "Select entries to retry"}
          >
            <RotateCcw size={14} className={bulkState === "pending" ? "animate-spin" : ""} />
            {bulkState === "pending" ? "Retrying…" : bulkState === "done" ? "Done!" : `Retry${someSelected ? ` (${selected.size})` : ""}`}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse items-center">
                <div className="w-5 h-5 rounded bg-gray-100 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 bg-gray-100 rounded w-1/3" />
                  <div className="h-2.5 bg-gray-100 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : isOutboxError ? (
          <AdminErrorState
            message={getFriendlyErrorMessage(outboxError, "Email Outbox")}
            onRetry={() => refetch()}
          />
        ) : entries.length === 0 ? (
          <AdminEmptyState
            title="No dead emails"
            description="All emails have been delivered successfully."
          />
        ) : (
          <>
            {/* Header row */}
            <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-100 text-[10px] font-bold uppercase tracking-widest text-gray-400" style={{ background: CREAM }}>
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                className="w-4 h-4 rounded accent-[#0D1B36] shrink-0 cursor-pointer"
                title={allSelected ? "Deselect all" : "Select all"}
              />
              <span className="w-44 shrink-0">Recipient</span>
              <span className="flex-1">Subject</span>
              <span className="w-20 shrink-0 hidden sm:block">Type</span>
              <span className="w-14 shrink-0 text-right hidden md:block">Attempts</span>
              <span className="w-28 shrink-0 text-right hidden lg:block">Last tried</span>
            </div>

            {entries.map((e) => (
              <div
                key={e.id}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 border-b border-gray-50 last:border-0 transition-colors cursor-pointer",
                  selected.has(e.id) ? "bg-amber-50/60" : "hover:bg-gray-50"
                )}
                onClick={() => toggleOne(e.id)}
              >
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggleOne(e.id)}
                  onClick={(ev) => ev.stopPropagation()}
                  className="w-4 h-4 rounded accent-[#0D1B36] shrink-0 mt-0.5 cursor-pointer"
                />
                <div className="w-44 shrink-0 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate" title={e.toEmail}>{e.toEmail}</p>
                  {e.errorMessage && (
                    <p className="text-[10px] text-red-400 truncate mt-0.5 flex items-center gap-0.5" title={e.errorMessage}>
                      <AlertTriangle size={9} className="shrink-0" />
                      {e.errorMessage}
                    </p>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-gray-700 truncate" title={e.subject}>{e.subject}</p>
                  <p className="text-[10px] text-gray-300 mt-0.5">{relativeTime(e.createdAt)}</p>
                </div>
                <span className="w-20 shrink-0 hidden sm:block">
                  <span className="inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-md truncate max-w-full" style={{ background: "#fef3c7", color: "#b45309" }}>{e.type}</span>
                </span>
                <span className="w-14 shrink-0 text-right text-xs text-gray-500 hidden md:block">{e.attempts}×</span>
                <span className="w-28 shrink-0 text-right text-[10px] text-gray-400 hidden lg:block">
                  {e.lastAttemptAt ? relativeTime(e.lastAttemptAt) : "—"}
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => { setPage((p) => Math.max(1, p - 1)); setSelected(new Set()); }}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40"
            style={{ color: NAVY }}
          >
            <ChevronLeft size={13} /> Prev
          </button>
          <span className="text-xs text-gray-500">Page {page} of {totalPages} · {total} dead</span>
          <button
            onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); setSelected(new Set()); }}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg disabled:opacity-40"
            style={{ color: NAVY }}
          >
            Next <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

function AdminNotificationsContent() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [updatingIds, setUpdatingIds] = useState<Set<string>>(new Set());
  const [actionToast, setActionToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const qc = useQueryClient();
  const inFlight = useRef<Set<string>>(new Set());

  const showToast = (message: string, type: "success" | "error" = "success") => {
    setActionToast({ message, type });
    setTimeout(() => setActionToast(null), 3500);
  };

  const filterTypes = activeTab === "all" ? undefined : activeTab.split(",");

  useEffect(() => { setPage(1); }, [activeTab, search, dateFrom, dateTo]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-notif-list", activeTab, search, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "20" });
      if (filterTypes) for (const t of filterTypes) params.append("type", t);
      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(`/api/admin/notifications?${params}`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed");
      return r.json() as Promise<{ notifications: AdminNotification[]; total: number; page: number; limit: number }>;
    },
    staleTime: 10000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/notifications/${id}/read`, {
        method: "PATCH",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark notification as read");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-count"] });
      showToast("Notification marked as read", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to mark notification as read", "error");
    },
  });

  const markUnread = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/notifications/${id}/unread`, {
        method: "PATCH",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark notification as unread");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-count"] });
      showToast("Notification marked as unread", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to mark notification as unread", "error");
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/notifications/read-all`, {
        method: "PATCH",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark all as read");
      }
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-count"] });
      showToast("All admin notifications marked as read", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to mark all notifications as read", "error");
    },
  });

  const clearAll = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/admin/notifications/clear-all`, {
        method: "DELETE",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Failed to clear notifications");
      }
      return r.json();
    },
    onSuccess: () => {
      setConfirmClearAll(false);
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-count"] });
      showToast("All admin notifications cleared successfully", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to clear admin notifications", "error");
    },
  });

  const dismiss = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/admin/notifications/${id}`, {
        method: "DELETE",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || "Failed to delete notification");
      }
      return r.json();
    },
    onSuccess: () => {
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
      qc.invalidateQueries({ queryKey: ["admin-notif-count"] });
      showToast("Notification deleted successfully", "success");
    },
    onError: (err: any) => {
      showToast(err?.message || "Failed to delete notification", "error");
    },
  });

  const [retryState, setRetryState] = useState<Record<string, "idle" | "pending" | "done" | "not_retryable" | "error">>({});

  async function retryDeadEmail(outboxId: string, notifId: string) {
    if (retryState[notifId] === "pending" || retryState[notifId] === "done" || retryState[notifId] === "not_retryable") return;
    setRetryState((s) => ({ ...s, [notifId]: "pending" }));
    try {
      const r = await fetch(`/api/admin/email-outbox/${outboxId}/retry`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (r.status === 409) {
        setRetryState((s) => ({ ...s, [notifId]: "not_retryable" }));
        return;
      }
      if (!r.ok) throw new Error("Failed");
      setRetryState((s) => ({ ...s, [notifId]: "done" }));
      qc.invalidateQueries({ queryKey: ["admin-notif-list"] });
    } catch {
      setRetryState((s) => ({ ...s, [notifId]: "error" }));
      setTimeout(() => setRetryState((s) => ({ ...s, [notifId]: "idle" })), 3000);
    }
  }

  function safeMarkRead(id: string) {
    const key = "markRead:" + id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setUpdatingIds((prev) => new Set(prev).add(id));
    markRead.mutate(id, {
      onSettled: () => {
        inFlight.current.delete(key);
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  }

  function safeMarkUnread(id: string) {
    const key = "markUnread:" + id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setUpdatingIds((prev) => new Set(prev).add(id));
    markUnread.mutate(id, {
      onSettled: () => {
        inFlight.current.delete(key);
        setUpdatingIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      },
    });
  }

  function safeDismiss(id: string) {
    const key = "dismiss:" + id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    dismiss.mutate(id, { onSettled: () => inFlight.current.delete(key) });
  }

  function safeMarkAllRead() {
    if (inFlight.current.has("markAllRead")) return;
    inFlight.current.add("markAllRead");
    markAllRead.mutate(undefined, { onSettled: () => inFlight.current.delete("markAllRead") });
  }

  const notifications = data?.notifications ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / (data?.limit ?? 20)));
  const hasUnread = notifications.some((n) => !n.read);

  const grouped = notifications.reduce<Record<string, AdminNotification[]>>((acc, n) => {
    const key = formatDate(n.createdAt);
    if (!acc[key]) acc[key] = [];
    acc[key].push(n);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header with Title and Actions */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-2 border-b border-gray-200">
        <div>
          <h2 className="font-serif text-xl sm:text-2xl font-bold" style={{ color: NAVY }}>Notifications</h2>
          <p className="text-xs text-gray-500 mt-0.5">Admin alerts, operational events, and system notifications.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {hasUnread && (
            <button
              onClick={() => safeMarkAllRead()}
              disabled={markAllRead.isPending}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold text-[#0D1B36] bg-[#0D1B36]/10 hover:bg-[#0D1B36]/15 transition-all disabled:opacity-50"
              title="Mark all notifications as read"
            >
              <CheckCheck size={14} className={markAllRead.isPending ? "animate-spin" : ""} />
              {markAllRead.isPending ? "Marking..." : "Mark all as read"}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              onClick={() => setConfirmClearAll(true)}
              disabled={clearAll.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-all disabled:opacity-50"
              title="Clear all admin notifications"
            >
              <Trash2 size={13} className={clearAll.isPending ? "animate-spin" : ""} />
              Clear all
            </button>
          )}
          <button
            onClick={() => refetch()}
            disabled={isLoading || isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh Notifications"
          >
            <RefreshCw size={13} className={isLoading || isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
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
              className="bg-white rounded-2xl border border-gray-200 p-6 max-w-md w-full shadow-xl space-y-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600">
                <Trash2 size={24} />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold" style={{ color: NAVY }}>Clear All Admin Notifications?</h3>
                <p className="text-xs sm:text-sm text-gray-500 mt-1 leading-relaxed">
                  This action will clear all notifications from your Admin Dashboard. Underlying order records, seller approvals, and support tickets will remain unaffected.
                </p>
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setConfirmClearAll(false)}
                  disabled={clearAll.isPending}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors"
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

      {/* Filters and Search */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex gap-1 p-1 rounded-xl w-fit flex-wrap" style={{ background: CREAM }}>
          {TYPE_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
              style={{
                background: activeTab === key ? "#fff" : "transparent",
                color: activeTab === key ? NAVY : "#6b7280",
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
            className="w-full pl-8 pr-3 py-2 rounded-lg border border-gray-200 text-xs focus:outline-none focus:border-[#C7CCD1]"
          />
        </div>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-[#C7CCD1]"
        />
        <span className="text-xs text-gray-400">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2 text-xs border border-gray-200 rounded-lg text-gray-600 focus:outline-none focus:border-[#C7CCD1]"
        />
        {(search || dateFrom || dateTo) && (
          <button
            onClick={() => { setSearch(""); setDateFrom(""); setDateTo(""); }}
            className="text-xs font-semibold hover:opacity-70"
            style={{ color: NAVY }}
          >
            Clear
          </button>
        )}
      </div>

      {hasUnread && !isLoading && (
        <div
          className="flex items-center justify-between rounded-xl px-4 py-3 border"
          style={{ background: `${NAVY}08`, borderColor: `${NAVY}22` }}
        >
          <p className="text-sm" style={{ color: NAVY }}>You have unread notifications</p>
          <button
            onClick={() => safeMarkAllRead()}
            disabled={markAllRead.isPending}
            className="flex items-center gap-1.5 text-sm font-semibold hover:opacity-70 transition-opacity disabled:opacity-50"
            style={{ color: NAVY }}
          >
            <CheckCheck size={15} /> Mark all as read
          </button>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
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
        ) : isError ? (
          <AdminErrorState
            message={getFriendlyErrorMessage(error, "Notifications")}
            onRetry={() => refetch()}
          />
        ) : notifications.length === 0 ? (
          <AdminEmptyState
            title="No notifications"
            description="You're all caught up. No notifications match your filter."
          />
        ) : (
          Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel}>
              <div className="px-4 py-2 border-b" style={{ background: CREAM, borderColor: "#e5e7eb" }}>
                <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{dateLabel}</p>
              </div>
              {items.map((n) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-start gap-3 px-4 py-4 border-b border-gray-50 last:border-0 group transition-colors",
                    !n.read ? "hover:bg-gray-50" : "hover:bg-gray-50/60"
                  )}
                  style={!n.read ? { background: `${NAVY}05` } : {}}
                >
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: n.read ? "#f3f4f6" : "#fff", border: n.read ? "none" : "1px solid #C7CCD133" }}>
                    {typeIcon(n.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm", n.read ? "text-gray-600" : "font-semibold")} style={!n.read ? { color: NAVY } : {}}>{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.body}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <p className="text-[10px] text-gray-300">{relativeTime(n.createdAt)}</p>
                      {deepLinkFor(n) && (
                        <Link
                          href={deepLinkFor(n)!}
                          className="flex items-center gap-0.5 text-[10px] font-semibold hover:opacity-70"
                          style={{ color: NAVY }}
                        >
                          View details <ExternalLink size={10} />
                        </Link>
                      )}
                      {n.type === "email_delivery_failed" && n.metadata?.outboxId && (() => {
                        const rs = retryState[n.id] ?? "idle";
                        const isDisabled = rs === "pending" || rs === "done" || rs === "not_retryable";
                        const label = rs === "done" ? "Queued!" : rs === "error" ? "Failed" : rs === "not_retryable" ? "Already queued" : "Retry";
                        const color = rs === "done" ? "#16a34a" : rs === "error" ? "#dc2626" : rs === "not_retryable" ? "#6b7280" : GOLD;
                        const bg = rs === "done" ? "#f0fdf4" : rs === "error" ? "#fef2f2" : rs === "not_retryable" ? "#f3f4f6" : `${GOLD}15`;
                        const title = rs === "not_retryable" ? "This email has already been re-queued or delivered" : "Re-queue this email for delivery";
                        return (
                          <button
                            onClick={() => retryDeadEmail(n.metadata!.outboxId, n.id)}
                            disabled={isDisabled}
                            className="flex items-center gap-0.5 text-[10px] font-semibold rounded px-1.5 py-0.5 transition-colors disabled:opacity-60"
                            style={{ color, background: bg }}
                            title={title}
                          >
                            <RefreshCw size={9} className={rs === "pending" ? "animate-spin" : ""} />
                            {label}
                          </button>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {!n.read ? (
                      <button
                        onClick={() => safeMarkRead(n.id)}
                        disabled={updatingIds.has(n.id) || markRead.isPending}
                        title="Mark as read"
                        aria-label="Mark as read"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-[#0D1B36] transition-colors disabled:opacity-50"
                      >
                        {updatingIds.has(n.id) ? (
                          <RotateCcw size={12} className="animate-spin text-[#0D1B36]" />
                        ) : (
                          <CheckCircle size={14} />
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => safeMarkUnread(n.id)}
                        disabled={updatingIds.has(n.id) || markUnread.isPending}
                        title="Mark as unread"
                        aria-label="Mark as unread"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:bg-gray-100 hover:text-[#0D1B36] transition-colors disabled:opacity-50"
                      >
                        {updatingIds.has(n.id) ? (
                          <RotateCcw size={12} className="animate-spin text-[#0D1B36]" />
                        ) : (
                          <Circle size={14} />
                        )}
                      </button>
                    )}
                    {confirmDeleteId === n.id ? (
                      <div className="flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-md px-1.5 py-0.5">
                        <span className="text-[10px] text-rose-700 font-bold">Delete?</span>
                        <button
                          onClick={() => safeDismiss(n.id)}
                          disabled={dismiss.isPending}
                          className="text-[10px] font-bold text-rose-700 hover:text-rose-900 bg-rose-100 px-1 rounded"
                        >
                          Yes
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[10px] text-gray-500 hover:text-gray-700 px-0.5"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(n.id)}
                        title="Dismiss"
                        aria-label="Dismiss notification"
                        className="w-7 h-7 rounded-md flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                  {!n.read && <span className="mt-2 w-2 h-2 rounded-full shrink-0" style={{ background: NAVY }} />}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      {totalPages > 1 && !isError && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg disabled:opacity-40"
            style={{ color: NAVY }}
          >
            Previous
          </button>
          <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 text-sm font-medium border border-gray-200 rounded-lg disabled:opacity-40"
            style={{ color: NAVY }}
          >
            Next
          </button>
        </div>
      )}

      <div className="pt-4 border-t border-gray-100">
        <EmailOutboxSection />
      </div>
    </div>
  );
}

export default function AdminNotifications() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Notifications">
          <AdminNotificationsContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
