import React, { useState, useEffect, useMemo, useRef } from "react";
import { useLocation } from "wouter";
import {
  Search, CheckCircle, Clock, XCircle, Star, ChevronLeft, ChevronRight, RefreshCw,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { AdminErrorBoundary, AdminErrorState, AdminEmptyState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";
import { TableRowSkeleton } from "@/components/skeletons";

import { adminHeaders } from '@/lib/adminApi';
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";
const PAGE_SIZE = 15;

interface Vendor {
  id: string;
  name: string;
  shopName?: string;
  location: string;
  status: string;
  statusReason?: string | null;
  gstin: string | null;
  contactEmail: string | null;
  email?: string | null;
  rating: number;
  sareesCount: number;
  revenue: number;
  totalOrders: number;
  kycVerified: boolean;
  featured: boolean;
  vendorId: string | null;
  createdAt?: string | null;
  termsAcceptedAt?: string | null;
  bankVerified?: boolean;
  bankVerificationStatus?: string | null;
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
    active: { bg: "#f0fdf4", color: "#15803d", icon: <CheckCircle size={11} /> },
    pending: { bg: "#fffbeb", color: "#b45309", icon: <Clock size={11} /> },
    rejected: { bg: "#fef2f2", color: "#b91c1c", icon: <XCircle size={11} /> },
    declined: { bg: "#fef2f2", color: "#b91c1c", icon: <XCircle size={11} /> },
    suspended: { bg: "#fef2f2", color: "#b91c1c", icon: <XCircle size={11} /> },
    deactivated: { bg: "#f3f4f6", color: "#4b5563", icon: <XCircle size={11} /> },
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

const STATUS_TABS = ["all", "pending", "approved", "rejected", "suspended", "deactivated"] as const;

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

  function loadVendors() {
    setLoading(true);
    fetch(`/api/admin/vendors`, {
      headers: adminHeaders(),
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const err: any = new Error(body.error || `HTTP ${r.status}`);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then((d) => {
        setVendors(d.vendors ?? []);
        setError("");
      })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Sellers")))
      .finally(() => setLoading(false));
  }

  // Initial load on mount
  useEffect(() => {
    loadVendors();
  }, []);

  const filtered = useMemo(() => {
    let v = vendors;
    if (statusTab !== "all") {
      if (statusTab === "rejected") {
        v = v.filter((x) => x.status === "rejected" || x.status === "declined");
      } else if (statusTab === "approved") {
        v = v.filter((x) => x.status === "approved" || x.status === "active");
      } else {
        v = v.filter((x) => x.status === statusTab);
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      v = v.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (x.shopName ?? "").toLowerCase().includes(q) ||
          (x.contactEmail ?? "").toLowerCase().includes(q) ||
          (x.gstin ?? "").toLowerCase().includes(q) ||
          x.location.toLowerCase().includes(q) ||
          (x.vendorId ?? "").toLowerCase().includes(q)
      );
    }
    return v;
  }, [vendors, statusTab, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageVendors = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function doAction(id: string, action: string, bodyObj?: Record<string, any>) {
    const key = id + action;
    if (inFlight.current.has(key)) return;

    let payload = bodyObj;
    if (action === "reject" && !payload) {
      const reason = window.prompt("Optional reason for rejecting this seller application:");
      if (reason === null) return; // User cancelled prompt
      payload = { reason: reason.trim() };
    }

    inFlight.current.add(key);
    setActionLoading(key);
    setError("");
    try {
      const res = await fetch(`/api/admin/vendors/${id}/${action}`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: payload ? JSON.stringify(payload) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? `Failed to ${action} seller`);
        return;
      }
      // Optimistic local update for instant feedback, including the generated Seller ID.
      setVendors((prev) =>
        prev.map((v) => (v.id === id ? {
          ...v,
          status: data.vendor.status ?? v.status,
          vendorId: data.vendor.vendorId ?? v.vendorId,
          featured: data.vendor.featured ?? v.featured,
        } : v))
      );
      // Full reload to pick up any server-side changes (e.g. kycVerified, audit events)
      loadVendors();
    } finally {
      inFlight.current.delete(key);
      setActionLoading(null);
    }
  }

  const tabCounts = useMemo(() => {
    const c: Record<string, number> = { all: vendors.length };
    for (const v of vendors) {
      const s = v.status === "declined" ? "rejected" : (v.status === "active" ? "approved" : v.status);
      c[s] = (c[s] ?? 0) + 1;
    }
    return c;
  }, [vendors]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>Seller Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">{vendors.length} sellers on the platform</p>
        </div>
        <button
          onClick={loadVendors}
          disabled={loading}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white text-gray-700 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50 shadow-xs"
        >
          <RefreshCw size={13} className={loading ? "animate-spin text-[#0D1B36]" : "text-gray-500"} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
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

        {error && (
          <div className="p-4">
            <AdminErrorState
              title="Unable to load sellers"
              message={error}
              onRetry={loadVendors}
              compact
            />
          </div>
        )}

        {!loading && !error && pageVendors.length === 0 ? (
          <AdminEmptyState
            title="No sellers found"
            message={search || statusTab !== "all" ? "No sellers match your search filter." : "There are currently no registered sellers in the system."}
          />
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider w-8">#</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Seller & Shop</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Seller ID</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Account Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Reg. Date</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Bank Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Location</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">GSTIN</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Product Count</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Total Orders</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Seller Earnings</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Rating</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {loading ? (
                  <TableRowSkeleton columns={13} rows={8} />
                ) :
                  pageVendors.map((v, idx) => {
                  const regDate = v.createdAt || v.termsAcceptedAt;
                  const dateStr = regDate ? new Date(regDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

                  return (
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
                            {v.shopName || v.name}
                          </button>
                          {v.featured && (
                            <span className="inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#fef9ec", color: "#b45309" }}>⭐</span>
                          )}
                        </div>
                        {v.name && v.shopName && v.name !== v.shopName && (
                          <div className="text-xs text-gray-600 font-medium">{v.name}</div>
                        )}
                        {v.contactEmail && (
                          <div className="text-xs text-gray-400 mt-0.5">{v.contactEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 hidden md:table-cell">
                        {v.vendorId
                          ? <span className="text-xs font-mono font-semibold" style={{ color: NAVY }}>{v.vendorId}</span>
                          : <span className="text-xs italic text-gray-400">
                            {v.status === "approved" ? "Not Generated (legacy)" : "Not Generated"}
                          </span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusBadge status={v.status} />
                        {v.statusReason && (
                          <div className="text-[10px] text-gray-400 max-w-[120px] truncate" title={v.statusReason}>{v.statusReason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 hidden md:table-cell">{dateStr}</td>
                      <td className="px-4 py-3.5 hidden lg:table-cell">
                        {v.bankVerified ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                            <CheckCircle size={10} /> Verified
                          </span>
                        ) : v.bankVerificationStatus === "pending" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700">
                            <Clock size={10} /> Pending
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            Unverified
                          </span>
                        )}
                      </td>
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
                          {(v.status === "approved" || v.status === "active") && (
                            <>
                              <ActionBtn
                                label="Suspend"
                                color="#b91c1c"
                                bg="#fef2f2"
                                loading={actionLoading === v.id + "suspend"}
                                onClick={() => doAction(v.id, "suspend")}
                              />
                              <ActionBtn
                                label="Deactivate"
                                color="#4b5563"
                                bg="#f3f4f6"
                                loading={actionLoading === v.id + "deactivate"}
                                onClick={() => doAction(v.id, "deactivate")}
                              />
                            </>
                          )}
                          {(v.status === "suspended" || v.status === "deactivated" || v.status === "rejected" || v.status === "declined") && (
                            <ActionBtn
                              label={(v.status === "rejected" || v.status === "declined") ? "Approve" : "Reactivate"}
                              color="#15803d"
                              bg="#f0fdf4"
                              loading={actionLoading === v.id + ((v.status === "rejected" || v.status === "declined") ? "approve" : "reactivate")}
                              onClick={() => doAction(v.id, (v.status === "rejected" || v.status === "declined") ? "approve" : "reactivate")}
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
                  );
                })}
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
        <AdminErrorBoundary sectionName="Sellers">
          <VendorsContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
