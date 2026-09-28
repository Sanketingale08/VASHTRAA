import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Send, Clock, CheckCircle2, AlertCircle, XCircle,
  ShieldAlert, Ticket as TicketIcon, MessageSquare, Search,
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const CREAM = "#E5E8EC";

type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed" | "Waiting for Customer";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  escalated: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Message {
  id: string;
  userId: string;
  body: string;
  isStaff: boolean;
  internal: boolean;
  createdAt: string;
}

interface TicketDetail extends Ticket {
  messages: Message[];
}

function statusColor(status: TicketStatus) {
  switch (status) {
    case "Open": return "bg-blue-50 text-blue-700 border-blue-200";
    case "In Progress": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Waiting for Customer": return "bg-amber-50 text-amber-700 border-amber-200";
    case "Resolved": return "bg-green-50 text-green-700 border-green-200";
    case "Closed": return "bg-gray-100 text-gray-500 border-gray-200";
  }
}

function statusIcon(status: TicketStatus) {
  switch (status) {
    case "Open": return <AlertCircle size={11} />;
    case "In Progress": return <Clock size={11} />;
    case "Waiting for Customer": return <Clock size={11} />;
    case "Resolved": return <CheckCircle2 size={11} />;
    case "Closed": return <XCircle size={11} />;
  }
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SellerSupport() {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [form, setForm] = useState({ subject: "", category: "", description: "" });
  const [formError, setFormError] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const limit = 10;

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["seller-support-categories"],
    queryFn: async () => {
      const r = await fetch(getApiUrl("/api/seller/support/categories"), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load categories");
      const data = await r.json();
      return data.categories ?? [];
    },
  });

  const { data, isLoading } = useQuery<{ tickets: Ticket[]; total: number }>({
    queryKey: ["seller-support-tickets", search, statusFilter, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = new URLSearchParams({ scope: "customer", page: String(page), limit: String(limit) });
      if (search.trim()) params.set("search", search.trim());
      if (statusFilter) params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      const r = await fetch(getApiUrl(`/api/seller/support/tickets?${params.toString()}`), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load tickets");
      return r.json();
    },
  });
  const tickets = data?.tickets ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const hasFilters = !!(search || statusFilter || dateFrom || dateTo);

  const { data: detail, isLoading: detailLoading } = useQuery<TicketDetail>({
    queryKey: ["seller-support-ticket", selectedId],
    queryFn: async () => {
      const r = await fetch(getApiUrl(`/api/seller/support/tickets/${selectedId}`), { credentials: "include" });
      if (!r.ok) throw new Error("Failed to load ticket");
      return r.json();
    },
    enabled: !!selectedId,
  });

  const createTicket = useMutation({
    mutationFn: async () => {
      const r = await fetch(getApiUrl("/api/seller/support/tickets"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to create ticket");
      }
      return r.json();
    },
    onSuccess: (t: Ticket) => {
      qc.invalidateQueries({ queryKey: ["seller-support-tickets"] });
      setForm({ subject: "", category: "", description: "" });
      setFormError("");
      setShowNew(false);
      setSelectedId(t.id);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const addReply = useMutation({
    mutationFn: async (body: string) => {
      const r = await fetch(getApiUrl(`/api/seller/support/tickets/${selectedId}/messages`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body }),
      });
      if (!r.ok) throw new Error("Failed to send reply");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["seller-support-tickets"] });
      setReplyBody("");
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(getApiUrl(`/api/seller/support/tickets/${selectedId}/status`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed to update status");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["seller-support-tickets"] });
    },
  });

  const escalate = useMutation({
    mutationFn: async () => {
      const r = await fetch(getApiUrl(`/api/seller/support/tickets/${selectedId}/escalate`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "Escalated by seller" }),
      });
      if (!r.ok) throw new Error("Failed to escalate ticket");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["seller-support-tickets"] });
    },
  });

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    if (!form.subject.trim() || !form.category || !form.description.trim()) {
      setFormError("All fields are required");
      return;
    }
    createTicket.mutate();
  }

  function resetFilters() {
    setSearch("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  return (
    <SellerLayout title="Support">
      <div className="space-y-4">

        {/* Header row */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => { setShowNew(true); setSelectedId(null); }}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg text-white"
            style={{ backgroundColor: MAROON }}
          >
            <Plus size={14} /> Raise Ticket to Admin
          </button>
        </div>

        {/* Combined filter bar */}
        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            {/* Free-text search */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by Ticket ID, subject, or category…"
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/30 focus:border-[#C7CCD1]"
              />
            </div>

            {/* Status dropdown */}
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="px-3 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-[#C7CCD1] shrink-0"
            >
              <option value="">All statuses</option>
              <option value="Open">Open</option>
              <option value="In Progress">In Progress</option>
              <option value="Waiting for Customer">Waiting for Customer</option>
              <option value="Resolved">Resolved</option>
              <option value="Closed">Closed</option>
            </select>
          </div>

          {/* Date range row */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Date range:</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 focus:outline-none focus:border-[#C7CCD1]"
            />
            <span className="text-xs text-gray-400">–</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-xl text-gray-600 focus:outline-none focus:border-[#C7CCD1]"
            />
            {hasFilters && (
              <button
                onClick={resetFilters}
                className="text-xs font-semibold px-2 hover:opacity-70"
                style={{ color: MAROON }}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Two-column layout: ticket list + detail panel */}
        <div className="grid grid-cols-1 md:grid-cols-[320px_1fr] gap-4">

          {/* Ticket list */}
          <div className="space-y-2">
            {isLoading ? (
              [...Array(3)].map((_, i) => <div key={i} className="bg-white border rounded-xl p-4 h-[70px] animate-pulse" />)
            ) : tickets.length === 0 ? (
              <div className="bg-white border border-[#C7CCD1]/20 rounded-xl p-8 text-center">
                <TicketIcon size={28} className="mx-auto mb-2" style={{ color: `${GOLD}66` }} />
                <p className="text-gray-400 text-sm">
                  {hasFilters ? "No tickets match your filters." : "No customer tickets yet."}
                </p>
                {hasFilters && (
                  <button onClick={resetFilters} className="text-xs font-semibold mt-2 hover:opacity-70" style={{ color: MAROON }}>
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              tickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => { setSelectedId(t.id); setShowNew(false); }}
                  className={cn(
                    "w-full text-left rounded-xl p-3.5 border transition-all",
                    t.id === selectedId ? "border-[#0A1F44]/40" : "border-gray-200 hover:border-[#C7CCD1]/50"
                  )}
                  style={t.id === selectedId ? { backgroundColor: `${MAROON}0d` } : { backgroundColor: "white" }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-sm line-clamp-1">{t.subject}</p>
                    <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0", statusColor(t.status))}>
                      {statusIcon(t.status)} {t.status}
                    </span>
                  </div>
                  <p className="text-[11px] mt-0.5" style={{ color: GOLD }}>{t.category}</p>
                  <p className="text-[10px] text-gray-400 mt-1">{formatDate(t.createdAt)}</p>
                </button>
              ))
            )}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1 text-xs text-gray-500">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
                >
                  Prev
                </button>
                <span>Page {page} of {totalPages}</span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          {/* Detail / new ticket panel */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm min-h-[300px]">
            {showNew ? (
              <form onSubmit={handleCreate} className="p-5 space-y-4">
                <h3 className="font-serif font-bold" style={{ color: MAROON }}>New Ticket to Admin</h3>
                <input
                  type="text" placeholder="Subject"
                  value={form.subject}
                  onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#C7CCD1]"
                />
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:border-[#C7CCD1]"
                >
                  <option value="">Select a category</option>
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <textarea
                  placeholder="Describe your issue"
                  rows={5}
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm resize-none focus:outline-none focus:border-[#C7CCD1]"
                />
                {formError && <p className="text-sm text-red-600">{formError}</p>}
                <div className="flex gap-2">
                  <button type="submit" disabled={createTicket.isPending} className="px-4 py-2 text-white text-sm font-semibold rounded-lg" style={{ backgroundColor: MAROON }}>
                    {createTicket.isPending ? "Submitting…" : "Submit"}
                  </button>
                  <button type="button" onClick={() => setShowNew(false)} className="px-4 py-2 border border-gray-200 text-sm font-semibold rounded-lg text-gray-600">Cancel</button>
                </div>
              </form>
            ) : detailLoading ? (
              <div className="p-10 text-center text-gray-400 text-sm animate-pulse">Loading…</div>
            ) : detail ? (
              <>
                <div className="border-b p-4 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-serif font-bold">{detail.subject}</p>
                    <p className="text-xs" style={{ color: GOLD }}>{detail.category}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">#{detail.id.slice(0, 8).toUpperCase()} · {formatDate(detail.createdAt)}</p>
                  </div>
                  <span className={cn("flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border shrink-0", statusColor(detail.status))}>
                    {statusIcon(detail.status)} {detail.status}
                  </span>
                </div>
                <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                  {detail.messages.filter((m) => !m.internal).map((m) => (
                    <div key={m.id} className={cn("flex", m.isStaff ? "justify-end" : "justify-start")}>
                      <div className={cn("max-w-[80%] rounded-2xl px-4 py-2.5 text-sm", m.isStaff ? "text-white rounded-tr-sm" : "bg-gray-50 border rounded-tl-sm")} style={m.isStaff ? { backgroundColor: MAROON } : {}}>
                        <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                        <p className={cn("text-[10px] mt-1.5", m.isStaff ? "text-white/60" : "text-gray-400")}>{formatDateTime(m.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {detail.status !== "Closed" && detail.status !== "Resolved" ? (
                  <div className="border-t p-3 space-y-2">
                    <form onSubmit={(e) => { e.preventDefault(); if (replyBody.trim()) addReply.mutate(replyBody.trim()); }} className="flex gap-2">
                      <textarea
                        value={replyBody}
                        onChange={(e) => setReplyBody(e.target.value)}
                        placeholder="Write a reply…"
                        rows={2}
                        className="flex-1 resize-none text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#C7CCD1]"
                      />
                      <button type="submit" disabled={!replyBody.trim() || addReply.isPending} className="self-end px-3 py-2 text-white rounded-lg disabled:opacity-40" style={{ backgroundColor: MAROON }}>
                        <Send size={15} />
                      </button>
                    </form>
                    <div className="flex items-center justify-between">
                      <button onClick={() => updateStatus.mutate("Resolved")} className="text-xs font-semibold hover:underline" style={{ color: MAROON }}>
                        Mark as Resolved
                      </button>
                      {!detail.escalated && (
                        <button onClick={() => escalate.mutate()} className="flex items-center gap-1 text-xs font-semibold text-amber-600 hover:underline">
                          <ShieldAlert size={12} /> Escalate to Admin
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="border-t p-3 text-center text-xs text-gray-400">
                    This ticket is {detail.status.toLowerCase()}.
                  </div>
                )}
              </>
            ) : (
              <div className="p-12 text-center text-gray-400">
                <MessageSquare size={30} className="mx-auto mb-2" style={{ color: `${GOLD}66` }} />
                <p className="text-sm">Select a ticket to view the conversation.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </SellerLayout>
  );
}
