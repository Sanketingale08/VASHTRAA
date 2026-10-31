import React, { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import {
  Search, Star, ChevronLeft, ChevronRight, Download, Printer, FileSpreadsheet,
  BarChart3, ArrowUpDown, SlidersHorizontal, CheckCircle, Clock, XCircle, RefreshCw,
  TrendingUp, Wallet, Package, Users, Landmark, ShoppingBag, Truck, RotateCcw, Store
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { AdminErrorBoundary, AdminErrorState, AdminEmptyState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";
import { adminKey, adminHeaders } from "@/lib/adminApi";
import { useSocket } from "@/context/SocketContext";

const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";

export interface VendorAnalyticsItem {
  id: string;
  name: string;
  shopName?: string;
  vendorId?: string;
  status: string;
  location: string;
  contactEmail?: string;
  mobile?: string;
  grossRevenue: number;
  netRevenue?: number;
  sellerEarnings?: number;
  commissionEarned?: number;
  totalOrders: number;
  ordersReceived?: number;
  ordersDelivered?: number;
  ordersCancelled?: number;
  ordersReturned?: number;
  rating: number;
  activeProducts?: number;
  totalProducts?: number;
  kycVerified?: boolean;
  kycResubmissionRequested?: boolean;
  panVerified?: boolean;
  gstVerified?: boolean;
  bankVerified?: boolean;
  performanceScore?: number;
  performanceBadge?: string;
}

export interface AnalyticsSummary {
  grossRevenue: number;
  totalGrossRevenue?: number;
  platformCommission: number;
  totalPlatformCommission?: number;
  totalSellerEarnings?: number;
  sellerEarnings?: number;
  totalProducts: number;
  totalCustomers: number;
  totalVendors: number;
  totalSellers?: number;
  activeSellers?: number;
  inactiveSellers?: number;
  totalOrders?: number;
  activeVendors?: number;
  inactiveVendors?: number;
  orderStatusBreakdown: {
    received: number;
    confirmed: number;
    dispatched: number;
    delivered: number;
    cancelled: number;
    returned: number;
  };
  settlements: {
    pending: number;
    completed: number;
  };
}

export interface ListResponse {
  summary?: AnalyticsSummary;
  vendors: VendorAnalyticsItem[];
  total?: number;
  page?: number;
  pageSize?: number;
  totalPages?: number;
  pagination?: {
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  };
}

const SORT_OPTIONS = [
  { value: "grossRevenue", label: "Gross Revenue" },
  { value: "commissionEarned", label: "Commission (18%)" },
  { value: "sellerEarnings", label: "Seller Earnings" },
  { value: "performanceScore", label: "Performance" },
  { value: "totalOrders", label: "Orders" },
  { value: "rating", label: "Rating" },
  { value: "name", label: "Name" },
];

function fmt(n: number) {
  if (n == null || isNaN(n)) return "₹0.00";
  return `₹${Number(n).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function StatusBadge({ status }: { status: string }) {
  const s = (status || "approved").toLowerCase();
  const colors: Record<string, string> = {
    approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
    active: "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending: "bg-amber-50 text-amber-700 border-amber-200",
    under_review: "bg-amber-50 text-amber-700 border-amber-200",
    suspended: "bg-red-50 text-red-700 border-red-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-bold uppercase border ${colors[s] || "bg-gray-100 text-gray-700 border-gray-200"}`}>
      {s.replace(/_/g, " ")}
    </span>
  );
}

function PerformanceBadge({ score, badge }: { score?: number; badge?: string }) {
  const label = badge || (score != null ? (score >= 85 ? "Excellent" : score >= 70 ? "Good" : score >= 50 ? "Average" : "Needs Improvement") : "Standard");
  
  let colorClass = "bg-gray-100 text-gray-700 border-gray-200";
  if (label === "Excellent") colorClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
  else if (label === "Good") colorClass = "bg-blue-50 text-blue-700 border-blue-200";
  else if (label === "Average") colorClass = "bg-amber-50 text-amber-700 border-amber-200";
  else if (label === "Needs Improvement") colorClass = "bg-red-50 text-red-700 border-red-200";

  return (
    <span className={`px-2 py-0.5 rounded text-[11px] font-bold border ${colorClass}`}>
      {label} {score != null ? `(${score}%)` : ""}
    </span>
  );
}

function AnalyticsContent() {
  const [, setLocation] = useLocation();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

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

  const { isConnected, socket } = useSocket();
  const debounceTimer = useRef<any>(null);
  const inFlightRef = useRef(false);

  const load = useCallback((showFullLoader = true) => {
    if (!adminKey()) return;
    if (inFlightRef.current && !showFullLoader) return;
    inFlightRef.current = true;

    if (showFullLoader && !data) setLoading(true);
    else setIsRefreshing(true);

    fetch(`/api/admin/vendor-analytics?${query}`, {
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
        setData(d);
        setError("");
        setLastUpdated(new Date());
      })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Vendor analytics")))
      .finally(() => {
        inFlightRef.current = false;
        setLoading(false);
        setIsRefreshing(false);
      });
  }, [query, data]);

  // Immediate fetch when query changes.
  useEffect(() => {
    load(true);
  }, [query]);

  // Real-time event listener + direct socket subscription + background polling for continuous auto-sync
  const handleRealtime = useCallback(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      load(false);
    }, 250);
  }, [load]);

  useEffect(() => {
    window.addEventListener("vastraa-realtime-event", handleRealtime);

    if (socket) {
      socket.on("vendor:analytics_updated", handleRealtime);
      socket.on("order:created", handleRealtime);
      socket.on("order:status_changed", handleRealtime);
      socket.on("order:cancelled", handleRealtime);
      socket.on("payment:status_updated", handleRealtime);
      socket.on("refund:processed", handleRealtime);
      socket.on("settlement:processed", handleRealtime);
      socket.on("vendor:updated", handleRealtime);
      socket.on("vendor:approved", handleRealtime);
    }

    const pollInterval = setInterval(() => {
      load(false);
    }, 8000);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      window.removeEventListener("vastraa-realtime-event", handleRealtime);
      if (socket) {
        socket.off("vendor:analytics_updated", handleRealtime);
        socket.off("order:created", handleRealtime);
        socket.off("order:status_changed", handleRealtime);
        socket.off("order:cancelled", handleRealtime);
        socket.off("payment:status_updated", handleRealtime);
        socket.off("refund:processed", handleRealtime);
        socket.off("settlement:processed", handleRealtime);
        socket.off("vendor:updated", handleRealtime);
        socket.off("vendor:approved", handleRealtime);
      }
      clearInterval(pollInterval);
    };
  }, [socket, handleRealtime, load]);

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
      doc.setTextColor(13, 27, 54);
      doc.text("Vendor Analytics Report", 14, 14);
      doc.setFontSize(9);
      doc.setTextColor(120, 120, 120);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")} — ${data.pagination?.total ?? data.total ?? 0} vendors matched`, 14, 20);

      autoTable(doc, {
        startY: 26,
        head: [["Shop", "Status", "Verification", "Products", "Orders", "Gross Revenue", "Commission (18%)", "Seller Earnings", "Rating", "Performance"]],
        body: data.vendors.map((v) => [
          v.name || v.shopName || "Vendor",
          v.status,
          v.kycVerified ? "KYC Verified" : v.kycResubmissionRequested ? "Resubmission" : "Pending",
          `${v.activeProducts ?? 0}/${v.totalProducts ?? 0}`,
          String(v.ordersReceived ?? v.totalOrders ?? 0),
          fmt(v.grossRevenue ?? 0),
          fmt(v.commissionEarned ?? 0),
          fmt(v.sellerEarnings ?? v.netRevenue ?? ((v.grossRevenue ?? 0) - (v.commissionEarned ?? 0))),
          v.rating > 0 ? v.rating.toFixed(1) : "No rating",
          `${v.performanceScore ?? 0}% (${v.performanceBadge || "Standard"})`,
        ]),
        styles: { fontSize: 8 },
        headStyles: { fillColor: [13, 27, 54], textColor: [255, 255, 255] },
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
        Shop: v.name || v.shopName || "Vendor",
        Status: v.status,
        Location: v.location,
        Email: v.contactEmail ?? "",
        Mobile: v.mobile ?? "",
        "KYC Status": v.kycVerified ? "Verified" : v.kycResubmissionRequested ? "Resubmission requested" : "Pending",
        "PAN Verified": v.panVerified ? "Yes" : "No",
        "GST Verified": v.gstVerified ? "Yes" : "No",
        "Bank Verified": v.bankVerified ? "Yes" : "No",
        "Total Products": v.totalProducts ?? 0,
        "Active Products": v.activeProducts ?? 0,
        "Orders Received": v.ordersReceived ?? v.totalOrders ?? 0,
        "Orders Delivered": v.ordersDelivered ?? 0,
        "Orders Cancelled": v.ordersCancelled ?? 0,
        "Orders Returned": v.ordersReturned ?? 0,
        "Gross Revenue": v.grossRevenue ?? 0,
        "Platform Commission (18%)": v.commissionEarned ?? 0,
        "Seller Earnings": v.sellerEarnings ?? v.netRevenue ?? ((v.grossRevenue ?? 0) - (v.commissionEarned ?? 0)),
        Rating: v.rating > 0 ? v.rating : "No rating",
        "Performance Score": `${v.performanceScore ?? 0}%`,
        "Performance Badge": v.performanceBadge || "Standard",
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
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
              <BarChart3 size={20} style={{ color: GOLD }} /> Vendor Analytics
            </h1>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 shadow-xs transition-colors ${
              isConnected
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
            }`}>
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-500 animate-pulse" : "bg-amber-500"}`} />
              {isConnected ? "Real-Time Sync" : "Syncing…"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>{pagination ? `${pagination.total} vendors matched` : "Loading…"}</span>
            {lastUpdated && (
              <>
                <span>·</span>
                <span className="text-xs text-gray-400">
                  Last updated: {lastUpdated.toLocaleTimeString("en-IN")}
                </span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => load(false)}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={13} className={isRefreshing ? "animate-spin text-[#0D1B36]" : "text-gray-500"} /> Refresh
          </button>
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

      {/* Real-time KPI Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {/* 1. Total Gross Revenue */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Gross Revenue</span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600 border border-emerald-100">
              <TrendingUp size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif" style={{ color: NAVY }}>
              {fmt(summary?.totalGrossRevenue ?? summary?.grossRevenue ?? 0)}
            </div>
            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" /> Product Base Price Sales
            </p>
          </div>
        </div>

        {/* 2. Total Platform Commission (18%) */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Platform Commission (18%)</span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600 border border-blue-100">
              <Wallet size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif" style={{ color: NAVY }}>
              {fmt(summary?.totalPlatformCommission ?? summary?.platformCommission ?? 0)}
            </div>
            <p className="text-xs text-gray-400 mt-1">18% of Product Base Price</p>
          </div>
        </div>

        {/* 3. Total Seller Earnings */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Seller Earnings</span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Landmark size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif text-emerald-700">
              {fmt(summary?.totalSellerEarnings ?? summary?.sellerEarnings ?? 0)}
            </div>
            <p className="text-xs text-gray-400 mt-1">Gross Revenue − Commission</p>
          </div>
        </div>

        {/* 4. Total Orders */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Orders</span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600 border border-amber-100">
              <ShoppingBag size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif" style={{ color: NAVY }}>
              {(summary?.totalOrders ?? summary?.orderStatusBreakdown?.received ?? 0).toLocaleString("en-IN")}
            </div>
            <p className="text-xs text-gray-400 mt-1">Eligible realtime orders</p>
          </div>
        </div>

        {/* 5. Total Sellers */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Total Sellers</span>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-purple-50 text-purple-600 border border-purple-100">
              <Store size={18} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold font-serif" style={{ color: NAVY }}>
              {(summary?.totalSellers ?? summary?.totalVendors ?? 0).toLocaleString("en-IN")}
            </div>
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                {summary?.activeSellers ?? summary?.totalVendors ?? 0} Active
              </span>
              {(summary?.inactiveSellers ?? 0) > 0 && (
                <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                  {summary?.inactiveSellers ?? 0} Inactive
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Auxiliary Stats Bar */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-600 flex-wrap gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1.5">
            <Package size={14} className="text-slate-400" />
            <strong className="text-slate-900 font-semibold">{(summary?.totalProducts ?? 0).toLocaleString("en-IN")}</strong> Total Products Listed
          </span>
          <span className="text-slate-300 hidden sm:inline">•</span>
          <span className="flex items-center gap-1.5">
            <Users size={14} className="text-slate-400" />
            <strong className="text-slate-900 font-semibold">{(summary?.totalCustomers ?? 0).toLocaleString("en-IN")}</strong> Unique Customers
          </span>
        </div>
        <span className="text-[11px] text-slate-400">
          MongoDB Atlas Real-Time Aggregates
        </span>
      </div>

      {/* Real-time Settlements & Order Status Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Vendor Settlements */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <Landmark size={14} className="text-gray-400" /> Vendor Settlements
            </h3>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Auto-synced
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
              <div className="flex items-center gap-1.5 text-xs text-amber-700 font-medium">
                <Clock size={13} /> Pending Payouts
              </div>
              <div className="text-lg font-bold font-serif mt-1 text-amber-900">
                {fmt(summary?.settlements?.pending ?? 0)}
              </div>
              <div className="text-[10px] text-amber-600 mt-0.5">Awaiting disbursement</div>
            </div>

            <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
                <CheckCircle size={13} /> Completed
              </div>
              <div className="text-lg font-bold font-serif mt-1 text-emerald-900">
                {fmt(summary?.settlements?.completed ?? 0)}
              </div>
              <div className="text-[10px] text-emerald-600 mt-0.5">Paid settlements</div>
            </div>
          </div>
        </div>

        {/* Order Status Breakdown */}
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShoppingBag size={14} className="text-gray-400" /> Order Status Breakdown
            </h3>
            <span className="text-xs text-gray-400 font-medium">
              Total: {(summary?.orderStatusBreakdown?.received ?? 0).toLocaleString("en-IN")} orders
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-1">
            {[
              { label: "Received", count: summary?.orderStatusBreakdown?.received ?? 0, color: "bg-slate-50 text-slate-700 border-slate-200", icon: <ShoppingBag size={12} /> },
              { label: "Confirmed", count: summary?.orderStatusBreakdown?.confirmed ?? 0, color: "bg-blue-50 text-blue-700 border-blue-200", icon: <Clock size={12} /> },
              { label: "Dispatched", count: summary?.orderStatusBreakdown?.dispatched ?? 0, color: "bg-indigo-50 text-indigo-700 border-indigo-200", icon: <Truck size={12} /> },
              { label: "Delivered", count: summary?.orderStatusBreakdown?.delivered ?? 0, color: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle size={12} /> },
              { label: "Cancelled", count: summary?.orderStatusBreakdown?.cancelled ?? 0, color: "bg-red-50 text-red-700 border-red-200", icon: <XCircle size={12} /> },
              { label: "Returned", count: summary?.orderStatusBreakdown?.returned ?? 0, color: "bg-purple-50 text-purple-700 border-purple-200", icon: <RotateCcw size={12} /> },
            ].map((st) => (
              <div key={st.label} className={`p-2.5 rounded-xl border flex flex-col justify-between ${st.color}`}>
                <div className="flex items-center justify-between text-[11px] font-semibold opacity-90">
                  <span>{st.label}</span>
                  {st.icon}
                </div>
                <div className="text-lg font-bold font-serif mt-1">{st.count.toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
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
          <button onClick={() => setShowFilters((s) => !s)} className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${showFilters ? "border-[#0D1B36] bg-[#0D1B36] text-white" : "border-gray-200 hover:bg-gray-50"}`}>
            <SlidersHorizontal size={13} /> Filters
          </button>
          <div className="flex gap-1.5 sm:ml-auto items-center flex-wrap">
            <span className="text-xs text-gray-400 font-medium">Sort by:</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleSort(opt.value)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors"
                style={{ background: sortBy === opt.value ? NAVY : "#F3F4F6", color: sortBy === opt.value ? "white" : "#4B5563" }}
              >
                {opt.label} {sortBy === opt.value && <ArrowUpDown size={10} />}
              </button>
            ))}
          </div>
        </div>

        {showFilters && (
          <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/50 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="suspended">Suspended</option>
            </select>
            <select value={verification} onChange={(e) => { setVerification(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white">
              <option value="all">All verification</option>
              <option value="verified">KYC verified</option>
              <option value="pending">KYC pending</option>
              <option value="resubmission">Resubmission requested</option>
            </select>
            <select value={orderStatus} onChange={(e) => { setOrderStatus(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white">
              <option value="all">All order activity</option>
              <option value="hasCancelled">Has cancellations</option>
              <option value="hasReturned">Has returns</option>
            </select>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white" placeholder="Registered from" />
            <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} className="text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white" placeholder="Registered to" />
            <div className="flex gap-1.5">
              <input type="number" value={revenueMin} onChange={(e) => { setRevenueMin(e.target.value); setPage(1); }} placeholder="Min ₹" className="w-1/2 text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white" />
              <input type="number" value={revenueMax} onChange={(e) => { setRevenueMax(e.target.value); setPage(1); }} placeholder="Max ₹" className="w-1/2 text-xs px-2 py-2 rounded-lg border border-gray-200 bg-white" />
            </div>
          </div>
        )}

        {loading && <div className="py-16 text-center text-gray-400 text-sm animate-pulse">Loading real-time vendor analytics…</div>}

        {error && (
          <div className="p-4">
            <AdminErrorState
              title="Unable to load vendor analytics"
              message={error}
              onRetry={() => load(true)}
              compact
            />
          </div>
        )}

        {!loading && !error && vendors.length === 0 && (
          <AdminEmptyState
            title="No vendor analytics available"
            message={search || status !== "all" || verification !== "all" ? "No vendors match your search or filters." : "No vendor records found."}
          />
        )}

        {!loading && vendors.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/50">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Shop</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Verification</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider hidden md:table-cell">Products</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Orders</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Gross Revenue</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Commission (18%)</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Seller Earnings</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden sm:table-cell">Rating</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Performance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {vendors.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50/80 transition-colors cursor-pointer" onClick={() => setLocation(`/admin/vendor-analytics/${v.id}`)}>
                    <td className="px-4 py-3.5">
                      <div className="font-bold text-sm" style={{ color: NAVY }}>{v.name || v.shopName || "Vendor"}</div>
                      {v.contactEmail && <div className="text-xs text-gray-400 mt-0.5">{v.contactEmail}</div>}
                    </td>
                    <td className="px-4 py-3.5"><StatusBadge status={v.status} /></td>
                    <td className="px-4 py-3.5 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {[["KYC", v.kycVerified], ["PAN", v.panVerified], ["GST", v.gstVerified], ["Bank", v.bankVerified]].map(([label, ok]) => (
                          <span key={label as string} className="text-[10px] font-bold px-1.5 py-0.5 rounded border"
                            style={{
                              background: ok ? "#f0fdf4" : "#f9fafb",
                              color: ok ? "#15803d" : "#9ca3af",
                              borderColor: ok ? "#bbf7d0" : "#e5e7eb"
                            }}>
                            {label as string}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold text-gray-700 hidden md:table-cell">
                      {v.activeProducts ?? 0}/{v.totalProducts ?? 0}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold text-gray-700 hidden lg:table-cell">
                      {v.ordersReceived ?? v.totalOrders ?? 0}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-bold" style={{ color: NAVY }}>
                      {fmt(v.grossRevenue ?? 0)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-semibold text-blue-700">
                      {fmt(v.commissionEarned ?? 0)}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs font-bold text-emerald-700">
                      {fmt(v.sellerEarnings ?? v.netRevenue ?? ((v.grossRevenue ?? 0) - (v.commissionEarned ?? 0)))}
                    </td>
                    <td className="px-4 py-3.5 text-right hidden sm:table-cell">
                      {v.rating > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                          <Star size={11} fill="currentColor" className="text-emerald-500" /> {v.rating.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No rating</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <PerformanceBadge score={v.performanceScore} badge={v.performanceBadge} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <span className="text-xs text-gray-500">
              Page <span className="font-bold text-gray-800">{pagination.page}</span> of <span className="font-bold text-gray-800">{pagination.totalPages}</span> · <span className="font-bold text-gray-800">{pagination.total}</span> total vendors
            </span>
            <div className="flex items-center gap-1">
              <button disabled={page === 1} onClick={() => setPage((p) => p - 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 border border-gray-200 bg-white transition-colors">
                <ChevronLeft size={14} />
              </button>
              <button disabled={page === pagination.totalPages} onClick={() => setPage((p) => p + 1)} className="p-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-100 border border-gray-200 bg-white transition-colors">
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
        <AdminErrorBoundary sectionName="Vendor Analytics">
          <AnalyticsContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
