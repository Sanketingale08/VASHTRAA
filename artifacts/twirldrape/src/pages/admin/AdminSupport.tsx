import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  HelpCircle, Send, Clock, CheckCircle2, AlertCircle, XCircle,
  Ticket as TicketIcon, MessageSquare, Search,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

type TicketStatus = "Open" | "In Progress" | "Resolved" | "Closed" | "Waiting for Customer";

interface Ticket {
  id: string;
  subject: string;
  category: string;
  status: TicketStatus;
  assignedTo: string;
  escalated: boolean;
  createdBy: string;
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

const STATUS_TABS = ["all", "Open", "In Progress", "Waiting for Customer", "Resolved", "Closed"] as const;

function AdminSupportContent() {
  const qc = useQueryClient();
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusTab, setStatusTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [replyBody, setReplyBody] = useState("");
  const [internal, setInternal] = useState(false);

  const { data, isLoading } = useQuery<{ tickets: Ticket[] }>({
    queryKey: ["admin-support-tickets", statusTab, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusTab !== "all") params.set("status", statusTab);
      if (search.trim()) params.set("search", search.trim());
      const r = await fetch(`${basePath}/api/admin/support/tickets?${params}`, {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load tickets");
      return r.json();
    },
  });
  const tickets = data?.tickets ?? [];

  const { data: detail, isLoading: detailLoading } = useQuery<TicketDetail>({
    queryKey: ["admin-support-ticket", selectedId],
    queryFn: async () => {
      const r = await fetch(`${basePath}/api/admin/support/tickets/${selectedId}`, {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (!r.ok) throw new Error("Failed to load ticket");
      return r.json();
    },
    enabled: !!selectedId,
  });

  const addReply = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${basePath}/api/admin/support/tickets/${selectedId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({ body: replyBody, internal }),
      });
      if (!r.ok) throw new Error("Failed to send reply");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
      setReplyBody("");
    },
  });

  const updateStatus = useMutation({
    mutationFn: async (status: string) => {
      const r = await fetch(`${basePath}/api/admin/support/tickets/${selectedId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Failed to update status");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-support-ticket", selectedId] });
      qc.invalidateQueries({ queryKey: ["admin-support-tickets"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <HelpCircle size={20} style={{ color: NAVY }} />
          <h2 className="font-serif text-xl font-bold" style={{ color: NAVY }}>Support Tickets</h2>
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tickets…"
            className="pl-8 pr-3 py-1.5 border rounded-lg text-sm w-56"
          />
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {STATUS_TABS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusTab(s)}
            className={cn(
              "px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors",
              statusTab === s ? "text-white" : "bg-white text-gray-600 border-gray-200"
            )}
            style={statusTab === s ? { backgroundColor: NAVY, borderColor: NAVY } : {}}
          >
            {s === "all" ? "All" : s}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[360px_1fr] gap-4">
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {isLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="bg-white border rounded-xl p-4 h-[74px] animate-pulse" />)
          ) : tickets.length === 0 ? (
            <div className="bg-white border rounded-xl p-8 text-center">
              <TicketIcon size={28} className="mx-auto mb-2" style={{ color: `${GOLD}66` }} />
              <p className="text-gray-400 text-sm">No tickets found.</p>
            </div>
          ) : (
            tickets.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn(
                  "w-full text-left rounded-xl p-3.5 border transition-all bg-white",
                  t.id === selectedId ? "border-[#0D1B36]/40 ring-1 ring-[#0D1B36]/10" : "border-gray-200 hover:border-[#C9A84C]/50"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-semibold text-sm line-clamp-1">{t.subject}</p>
                  <span className={cn("flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0", statusColor(t.status))}>
                    {statusIcon(t.status)} {t.status}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-[11px]" style={{ color: GOLD }}>{t.category}</p>
                  {t.escalated && <span className="text-[10px] font-semibold text-red-500 uppercase">Escalated</span>}
                </div>
              </button>
            ))
          )}
        </div>

        <div className="bg-white border rounded-xl overflow-hidden shadow-sm min-h-[300px]">
          {detailLoading ? (
            <div className="p-10 text-center text-gray-400 text-sm animate-pulse">Loading…</div>
          ) : detail ? (
            <>
              <div className="border-b p-4 flex items-start justify-between gap-2">
                <div>
                  <p className="font-serif font-bold">{detail.subject}</p>
                  <p className="text-xs" style={{ color: GOLD }}>{detail.category} · assigned: {detail.assignedTo}</p>
                </div>
                <select
                  value={detail.status}
                  onChange={(e) => updateStatus.mutate(e.target.value)}
                  className="text-xs border rounded-lg px-2 py-1"
                >
                  {STATUS_TABS.filter((s) => s !== "all").map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="p-4 space-y-3 max-h-[360px] overflow-y-auto">
                {detail.messages.map((m) => (
                  <div key={m.id} className={cn("flex", m.isStaff ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm",
                        m.internal ? "bg-amber-50 border border-amber-200" : m.isStaff ? "text-white rounded-tr-sm" : "bg-gray-50 border rounded-tl-sm"
                      )}
                      style={m.isStaff && !m.internal ? { backgroundColor: NAVY } : {}}
                    >
                      {m.internal && <p className="text-[10px] font-bold text-amber-600 uppercase mb-1">Internal note</p>}
                      <p className="leading-relaxed whitespace-pre-wrap">{m.body}</p>
                      <p className={cn("text-[10px] mt-1.5", m.isStaff && !m.internal ? "text-white/60" : "text-gray-400")}>{formatDateTime(m.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-3 space-y-2">
                <form onSubmit={(e) => { e.preventDefault(); if (replyBody.trim()) addReply.mutate(); }} className="flex gap-2">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder="Write a reply…"
                    rows={2}
                    className="flex-1 resize-none text-sm border rounded-lg px-3 py-2"
                  />
                  <button type="submit" disabled={!replyBody.trim() || addReply.isPending} className="self-end px-3 py-2 text-white rounded-lg disabled:opacity-40" style={{ backgroundColor: NAVY }}>
                    <Send size={15} />
                  </button>
                </form>
                <label className="flex items-center gap-1.5 text-xs text-gray-500">
                  <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                  Internal note (not visible to customer/seller)
                </label>
              </div>
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
  );
}

export default function AdminSupport() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminSupportContent />
      </AdminLayout>
    </AdminGuard>
  );
}
