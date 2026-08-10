import React, { useEffect, useState, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  Search, CheckCircle, Clock, XCircle, Star, ChevronLeft, ChevronRight,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";
const PAGE_SIZE = 15;

interface Vendor {
  id: string;
  name: string;
  location: string;
  status: string;
  gstin: string | null;
  contactEmail: string | null;
  rating: number;
  sareesCount: number;
  revenue: number;
  totalOrders: number;
  kycVerified: boolean;
  featured: boolean;
  vendorId: string | null;
}

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string; icon: React.ReactNode }> = {
    approved: { bg: "#f0fdf4", color: "#15803d", icon: <CheckCircle size={11} /> },
    pending: { bg: "#fffbeb", color: "#b45309", icon: <Clock size={11} /> },
    suspended: { bg: "#fef2f2", color: "#b91c1c", icon: <XCircle size={11} /> },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280", icon: null };
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {s.icon} {status}
    </span>
  );
}

const STATUS_TABS = ["all", "pending", "approved", "suspended"] as const;

function VendorsContent() {
  const [, setLocation] = useLocation();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [statusTab, setStatusTab] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadVendors() {
    setLoading(true);
    fetch(`/api/admin/vendors`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => r.json())
      .then((d) => setVendors(d.vendors ?? []))
      .catch(() => setError("Failed to load vendors"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadVendors(); }, [adminKey]);

  const filtered = useMemo(() => {
    let v = vendors;
    if (statusTab !== "all") v = v.filter((x) => x.status === statusTab);
    if (search.trim()) {
      const q = search.toLowerCase();
      v = v.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (x.contactEmail ?? "").toLowerCase().includes(q) ||
          (x.gstin ?? "").toLowerCase().includes(q) ||
          x.location.toLowerCase().includes(q)
      );
    }
    return v;
  }, [vendors, statusTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageVendors = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function doAction(id: string, action: string) {
    const key = id + action;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setActionLoading(key);
    try {
      const res = await fetch(`/api/admin/vendors/${id}/${action}`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setVendors((prev) =>
          prev.map((v) => (v.id === id ? {
            ...v,
            status: data.vendor.status ?? v.status,
            featured: data.vendor.featured ?? v.featured,
          } : v))
        );
      }
    } finally {
      inFlight.current.delete(key);
      setActionLoading(null);
    }
  }

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: vendors.length };
    for (const v of vendors) c[v.status] = (c[v.status] ?? 0) + 1;
    return c;
  }, [vendors]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>Vendor Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">{vendors.length} vendors on the platform</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex gap-1 overflow-x-auto">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => { setStatusTab(tab); setPage(1); }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap"
                style={{
                  background: statusTab === tab ? NAVY : "transparent",
                  color: statusTab === tab ? "white" : "#6b7280",
                }}
              >
                {tab} {tabCounts[tab] !== undefined ? `(${tabCounts[tab]})` : ""}
              </button>
            ))}
          </div>
          <div className="relative sm:ml-auto sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search name, email, GSTIN…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-300"
            />
          </div>
        </div>

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading vendors…</div>}
        {error && <div className="py-10 text-center text-red-500 text-sm">{error}</div>}

        {!loading && pageVendors.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm">No vendors match your filter.</div>
        )}

        {!loading && pageVendors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Shop</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Vendor ID</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">GSTIN</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Products</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Orders</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Rating</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {pageVendors.map((v, idx) => (
                  <tr key={v.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-5 py-3.5 text-xs text-gray-400">
                      {(page - 1) * PAGE_SIZE + idx + 1}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          className="text-left hover:underline font-semibold text-sm"
                          style={{ color: NAVY }}
                          onClick={() => setLocation(`/admin/vendors/${v.id}`)}
                        >
                          {v.name}
                        </button>
                        {v.featured && (
                          <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fef9ec", color: "#b45309" }}>⭐</span>
                        )}
                      </div>
                      {v.contactEmail && (
                        <div className="text-xs text-gray-400 mt-0.5">{v.contactEmail}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 hidden md:table-cell">
                      {v.vendorId
                        ? <span className="text-xs font-mono font-semibold" style={{ color: NAVY }}>{v.vendorId}</span>
                        : <span className="text-xs italic text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3.5 text-xs text-gray-500 hidden md:table-cell">{v.location}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400 font-mono hidden lg:table-cell">
                      {v.gstin ?? "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs text-gray-600 hidden md:table-cell">
                      {v.sareesCount}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs text-gray-600 hidden lg:table-cell">
                      {v.totalOrders > 0 ? v.totalOrders.toLocaleString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold hidden lg:table-cell" style={{ color: NAVY }}>
                      {v.revenue > 0 ? fmt(v.revenue) : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <Star size={11} fill="currentColor" /> {v.rating.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {v.status === "pending" && (
                          <>
                            <ActionBtn
                              label="Approve"
                              color="#15803d"
                              bg="#f0fdf4"
                              loading={actionLoading === v.id + "approve"}
                              onClick={() => doAction(v.id, "approve")}
                            />
                            <ActionBtn
                              label="Reject"
                              color="#b91c1c"
                              bg="#fef2f2"
                              loading={actionLoading === v.id + "reject"}
                              onClick={() => doAction(v.id, "reject")}
                            />
                          </>
                        )}
                        {v.status === "approved" && (
                          <ActionBtn
                            label="Suspend"
                            color="#b91c1c"
                            bg="#fef2f2"
                            loading={actionLoading === v.id + "suspend"}
                            onClick={() => doAction(v.id, "suspend")}
                          />
                        )}
                        {v.status === "suspended" && (
                          <ActionBtn
                            label="Activate"
                            color="#15803d"
                            bg="#f0fdf4"
                            loading={actionLoading === v.id + "activate"}
                            onClick={() => doAction(v.id, "activate")}
                          />
                        )}
                        {v.featured ? (
                          <ActionBtn
                            label="Unfeature"
                            color="#6b7280"
                            bg="#f3f4f6"
                            loading={actionLoading === v.id + "unfeature"}
                            onClick={() => doAction(v.id, "unfeature")}
                          />
                        ) : (
                          <ActionBtn
                            label="⭐ Feature"
                            color="#b45309"
                            bg="#fef9ec"
                            loading={actionLoading === v.id + "feature"}
                            onClick={() => doAction(v.id, "feature")}
                          />
                        )}
                        <ActionBtn
                          label="View"
                          color="#1d4ed8"
                          bg="#eff6ff"
                          loading={false}
                          onClick={() => setLocation(`/admin/vendors/${v.id}`)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="text-xs text-gray-600 px-2">{page} / {totalPages}</span>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionBtn({ label, color, bg, loading, onClick }: {
  label: string; color: string; bg: string; loading: boolean; onClick: () => void;
}) {
  return (
    <button
      disabled={loading}
      onClick={onClick}
      className="text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 whitespace-nowrap"
      style={{ background: bg, color }}
    >
      {loading ? "…" : label}
    </button>
  );
}

export default function AdminVendors() {
  return (
    <AdminGuard>
      <AdminLayout>
        <VendorsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
