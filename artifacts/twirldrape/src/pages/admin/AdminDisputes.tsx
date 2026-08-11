import React, { useEffect, useMemo, useState } from "react";
import { ShieldAlert, ExternalLink, Store } from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";

interface AdminTicket {
  id: string;
  vendorId: string;
  vendorName: string | null;
  subject: string;
  category: string;
  status: string;
  priority: string;
  isDispute: boolean;
  disputeStatus: string;
  evidenceUrls: string[] | null;
  createdAt: string;
  updatedAt: string;
}

function StatusPill({ label, tone }: { label: string; tone: "orange" | "green" | "red" | "gray" }) {
  const map = {
    orange: { bg: "#fffbeb", color: "#b45309" },
    green: { bg: "#f0fdf4", color: "#15803d" },
    red: { bg: "#fef2f2", color: "#b91c1c" },
    gray: { bg: "#f3f4f6", color: "#6b7280" },
  } as const;
  const s = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize whitespace-nowrap"
      style={{ background: s.bg, color: s.color }}
    >
      {label.replace(/_/g, " ")}
    </span>
  );
}

function disputeTone(status: string): "orange" | "green" | "red" | "gray" {
  if (status === "needs_admin") return "red";
  if (status === "open") return "orange";
  if (status === "resolved") return "green";
  return "gray";
}

const FILTERS = [
  { key: "needs_admin", label: "Needs Admin" },
  { key: "all", label: "All Disputes" },
] as const;

function DisputesContent() {
  const [tickets, setTickets] = useState<AdminTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("needs_admin");
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadTickets(f: string) {
    setLoading(true);
    const qs = f === "needs_admin" ? "?disputeStatus=needs_admin" : "";
    fetch(`/api/admin/tickets${qs}`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setTickets(d.tickets ?? []))
      .catch(() => setError("Failed to load disputes"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadTickets(filter); }, [adminKey, filter]);

  const needsAdminCount = useMemo(
    () => tickets.filter((t) => t.disputeStatus === "needs_admin").length,
    [tickets]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
          <ShieldAlert size={18} /> Seller Disputes
        </h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-2">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex gap-1 overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap"
              style={{
                background: filter === f.key ? NAVY : "transparent",
                color: filter === f.key ? "white" : "#6b7280",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading disputes…</div>}
        {!loading && tickets.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No disputes found</div>
        )}

        {!loading && tickets.length > 0 && (
          <div className="divide-y divide-gray-100">
            {tickets.map((t) => (
              <div key={t.id} className="px-5 py-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm" style={{ color: NAVY }}>{t.subject}</span>
                      <StatusPill label={t.disputeStatus} tone={disputeTone(t.disputeStatus)} />
                      <StatusPill label={t.status} tone="gray" />
                      <StatusPill label={t.priority} tone={t.priority === "Urgent" ? "red" : "gray"} />
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400 mt-1">
                      <Store size={12} />
                      {t.vendorName || t.vendorId}
                      <span className="mx-1">•</span>
                      {t.category}
                      <span className="mx-1">•</span>
                      Updated {new Date(t.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                {t.evidenceUrls && t.evidenceUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {t.evidenceUrls.map((url, i) => (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md bg-gray-50 border border-gray-200 text-gray-600 hover:border-gray-300"
                      >
                        <ExternalLink size={11} /> Evidence {i + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminDisputes() {
  return (
    <AdminGuard>
      <AdminLayout>
        <DisputesContent />
      </AdminLayout>
    </AdminGuard>
  );
}
