import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  Search, Star, ChevronLeft, ChevronRight, Download, Printer, FileSpreadsheet,
  BarChart3, ArrowUpDown, Filter,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

interface VendorRow {
  id: string;
  name: string;
  ownerId: string | null;
  location: string;
  contactEmail: string | null;
  mobile: string | null;
  category: string;
  status: string;
  registeredAt: string | null;
  kycVerified: boolean;
  kycResubmissionRequested: boolean;
  panVerified: boolean;
  gstVerified: boolean;
  bankVerified: boolean;
  totalProducts: number;
  activeProducts: number;
  ordersReceived: number;
  ordersDelivered: number;
  ordersDispatched: number;
  ordersCancelled: number;
  ordersReturned: number;
  grossRevenue: number;
  netRevenue: number;
  commissionEarned: number;
  rating: number;
  reviewCount: number;
  performanceScore: number;
  performanceBadge: "Excellent" | "Good" | "Average" | "Needs Improvement";
}

interface ListResponse {
  vendors: VendorRow[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

const BADGE_META: Record<string, { bg: string; color: string }> = {
  Excellent: { bg: "#f0fdf4", color: "#15803d" },
  Good: { bg: "#eff6ff", color: "#1d4ed8" },
  Average: { bg: "#fffbeb", color: "#b45309" },
  "Needs Improvement": { bg: "#fef2f2", color: "#b91c1c" },
};

function PerformanceBadge({ score, badge }: { score: number; badge: string }) {
  const m = BADGE_META[badge] ?? BADGE_META.Average;
  return (
    <div className="flex flex-col items-end gap-1 w-24">
      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ background: m.bg, color: m.color }}>
        {badge}
      </span>
      <div className="w-full h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: m.color }} />
      </div>
      <span className="text-[10px] text-gray-400">{score}%</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    approved: { bg: "#f0fdf4", color: "#15803d" },
    pending: { bg: "#fffbeb", color: "#b45309" },
    suspended: { bg: "#fef2f2", color: "#b91c1c" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

const SORT_OPTIONS = [
  { value: "grossRevenue", label: "Revenue" },
  { value: "performanceScore", label: "Performance" },
  { value: "ordersReceived", label: "Orders" },
  { value: "rating", label: "Rating" },
  { value: "name", label: "Name" },
];

function AnalyticsContent() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [verification, setVerification] = useState("all");
  const [orderStatus, setOrderStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [revenueMin, setRevenueMin] = useState("");
  const [revenueMax, setRevenueMax] = useState("");
  const [sortBy, setSortBy] = useState("grossRevenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (search.trim()) p.set("search", search.trim());
    if (status !== "all") p.set("status", status);
    if (verification !== "all") p.set("verification", verification);
    if (orderStatus !== "all") p.set("orderStatus", orderStatus);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    if (revenueMin) p.set("revenueMin", revenueMin);
    if (revenueMax) p.set("revenueMax", revenueMax);
    p.set("sortBy", sortBy);
    p.set("sortDir", sortDir);
    p.set("page", String(page));
    p.set("pageSize", "15");
    return p.toString();
  }, [search, status, verification, orderStatus, dateFrom, dateTo, revenueMin, revenueMax, sortBy, sortDir, page]);

  function load() {
    if (!adminKey) return;
    setLoading(true);
    fetch(`${basePath}/api/admin/vendor-analytics?${query}`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => { setData(d); setError(""); })
      .catch(() => setError("Failed to load vendor analytics"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, [query, adminKey]);
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [query, adminKey]);

  function toggleSort(field: string) {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("desc"); }
    setPage(1);
  }

  async function exportPdf() {
    if (!data) return;
    setExporting("pdf");
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
      doc.setFontSize(16);
      doc.setTextColor(30, 30, 30);
      doc.text("Vendor Analytics Report", 14, 14);
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")} — ${data.pagination.total} vendors matched`, 14, 20);

      autoTable(doc, {
        startY: 26,
        head: [["Shop", "Status", "Verification", "Products", "Orders", "Revenue", "Rating", "Score"]],
        body: data.vendors.map((v) => [
          v.name,
          v.status,
          v.kycVerified ? "Verified" : v.kycResubmissionRequested ? "Resubmission" : "Pending",
          `${v.activeProducts}/${v.totalProducts}`,
          String(v.ordersReceived),
          `₹${v.grossRevenue.toLocaleString("en-IN")}`,
          v.rating.toFixed(1),
          `${v.performanceScore}% (${v.performanceBadge})`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
      });
      doc.save(`vendor-analytics-${Date.now()}.pdf`);
    } finally {
      setExporting(null);
    }
  }

  async function exportExcel() {
    if (!data) return;
    setExporting("excel");
    try {
      const rows = data.vendors.map((v) => ({
        Shop: v.name,
        Status: v.status,
        Location: v.location,
        Email: v.contactEmail ?? "",
        Mobile: v.mobile ?? "",
        "KYC Status": v.kycVerified ? "Verified" : v.kycResubmissionRequested ? "Resubmission requested" : "Pending",
        "PAN Verified": v.panVerified ? "Yes" : "No",
        "GST Verified": v.gstVerified ? "Yes" : "No",
        "Bank Verified": v.bankVerified ? "Yes" : "No",
        "Total Products": v.totalProducts,
        "Active Products": v.activeProducts,
        "Orders Received": v.ordersReceived,
        "Orders Delivered": v.ordersDelivered,
        "Orders Cancelled": v.ordersCancelled,
        "Orders Returned": v.ordersReturned,
        "Gross Revenue": v.grossRevenue,
        "Net Revenue": v.netRevenue,
        "Commission Earned": v.commissionEarned,
        Rating: v.rating,
        "Performance Score": v.performanceScore,
        "Performance Badge": v.performanceBadge,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Vendor Analytics");
      XLSX.writeFile(wb, `vendor-analytics-${Date.now()}.xlsx`);
    } finally {
      setExporting(null);
    }
  }

  const vendors = data?.vendors ?? [];
  const pagination = data?.pagination;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <BarChart3 size={20} style={{ color: GOLD }} /> Vendor Analytics
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {pagination ? `${pagination.total} vendors matched` : "Loading…"} · auto-refreshes every 15s
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportPdf} disabled={exporting !== null} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <Download size={13} /> {exporting === "pdf" ? "Exporting…" : "PDF"}
          </button>
          <button onClick={exportExcel} disabled={exporting !== null} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={13} /> {exporting === "excel" ? "Exporting…" : "Excel"}
          </button>
          <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <Printer size={13} /> Print
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="relative flex-1 sm:max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search shop, email, ID…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-blue-300"
            />
          </div>
          <button onClick={() => setShowFilters((s) => !s)} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
            <Filter size={13} /> Filters
          </button>
          <div className="flex gap-1.5 sm:ml-auto items-center">
            <span className="text-xs text-gray-400">Sort:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleSort(opt.value)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{ background: sortBy === opt.value ? NAVY : "transparent", color: sortBy === opt.value ? "white" : "#6b7280" }}
              >
                {opt.label} {sortBy === opt.value && <ArrowUpDown size={10} />}
              </button>
            ))}
          </div>
        </div>

        {showFilters && (
          <div className="px-5 py-4 border-b border-gray-100 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="suspended">Suspended</option>
            </select>
            <select value={verification} onChange={(e) => { setVerification(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
              <option value="all">All verification</option>
              <option value="verified">KYC verified</option>
              <option value="pending">KYC pending</option>
              <option value="resubmission">Resubmission requested</option>
            </select>
            <select value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
              <option value="all">All order activity</option>
              <option value="hasCancelled">Has cancellations</option>
              <option value="hasReturned">Has returns</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200" placeholder="Registered from" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200" placeholder="Registered to" />
            <div className="flex gap-1.5">
              <input type="number" value={revenueMin} onChange={(e) => { setRevenueMin(e.target.value); setPage(1); }} placeholder="Min ₹" className="w-1/2 text-xs px-2 py-2 rounded-lg border border-gray-200" />
              <input type="number" value={revenueMax} onChange={(e) => { setRevenueMax(e.target.value); setPage(1); }} placeholder="Max ₹" className="w-1/2 text-xs px-2 py-2 rounded-lg border border-gray-200" />
            </div>
          </div>
        )}

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading vendor analytics…</div>}
        {error && <div className="py-10 text-center text-red-500 text-sm">{error}</div>}
        {!loading && vendors.length === 0 && !error && (
          <div className="py-16 text-center text-gray-400 text-sm">No vendors match your filters.</div>
        )}

        {!loading && vendors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Shop</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Verification</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Products</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Orders</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Rating</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/60 transition-colors cursor-pointer" onClick={() => setLocation(`/admin/vendor-analytics/${v.id}`)}>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-sm" style={{ color: NAVY }}>{v.name}</div>
                      {v.contactEmail && <div className="text-xs text-gray-400 mt-0.5">{v.contactEmail}</div>}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {[["KYC", v.kycVerified], ["PAN", v.panVerified], ["GST", v.gstVerified], ["Bank", v.bankVerified]].map(([label, ok]) => (
                          <span key={label as string} className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: ok ? "#f0fdf4" : "#f3f4f6", color: ok ? "#15803d" : "#9ca3af" }}>
                            {label as string}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs text-gray-600 hidden md:table-cell">{v.activeProducts}/{v.totalProducts}</td>
                    <td className="px-4 py-3.5 text-right text-xs text-gray-600 hidden lg:table-cell">{v.ordersReceived}</td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold" style={{ color: NAVY }}>{fmt(v.grossRevenue)}</td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                        <Star size={11} fill="currentColor" /> {v.rating.toFixed(1)}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <PerformanceBadge score={v.performanceScore} badge={v.performanceBadge} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} total
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 transition-colors">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminVendorAnalytics() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AnalyticsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
