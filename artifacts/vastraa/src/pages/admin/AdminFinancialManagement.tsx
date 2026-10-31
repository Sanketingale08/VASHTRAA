import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Wallet, CheckCircle, XCircle, Clock, IndianRupee, TrendingUp, TrendingDown,
  Download, FileSpreadsheet, Percent, Receipt, RotateCcw, CreditCard, Printer, RefreshCw,
  ExternalLink, Calendar,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { AdminErrorBoundary, AdminErrorState, AdminEmptyState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";
import { Skeleton } from "@/components/ui/skeleton";
import { TableRowSkeleton, DashboardStatsSkeleton } from "@/components/skeletons";
import { useSocket } from "@/context/SocketContext";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
import { adminHeaders, adminKey } from '@/lib/adminApi';
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";

function fmt(n: number | null | undefined) {
  const val = Number(n ?? 0);
  if (isNaN(val)) return "₹0";
  if (Math.abs(val) >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`;
  if (Math.abs(val) >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (Math.abs(val) >= 1000) return `₹${(val / 1000).toFixed(1)}K`;
  return `₹${val.toLocaleString("en-IN")}`;
}

function getNextWednesdayFormatted(): string {
  const d = new Date();
  const day = d.getDay(); // 0 is Sun, 3 is Wed
  let diff = (3 - day + 7) % 7;
  if (diff === 0 && d.getHours() >= 10) {
    diff = 7;
  }
  const nextWed = new Date(d.getTime() + diff * 24 * 60 * 60 * 1000);
  nextWed.setHours(10, 0, 0, 0);
  return nextWed.toLocaleDateString("en-IN", {
    weekday: "long",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PrintButton({ disabled }: { disabled?: boolean }) {
  return (
    <button
      onClick={() => window.print()}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
    >
      <Printer size={13} /> Print
    </button>
  );
}

interface Settlement {
  id: string; vendorId: string; vendorName: string; amount: number; type: string;
  status: string; paymentMethod: string | null; transactionId: string | null;
  utrNumber: string | null; note: string | null; createdAt: string;
  reviewedAt: string | null; paidAt: string | null;
  orderId: string | null; productAmount: number | null; commission: number | null;
  commissionRate: number | null; shippingCharge: number | null;
  settlementTax: number | null; netPayout: number | null;
  pricingVersion?: 'v1' | 'v2' | string | null;
  platformKeeps?: number | null;
  cashfreeTransferId?: string | null;
  failureReason?: string | null;
  settlementEligibilityDate?: string | null;
  nextWednesdayPayoutDate?: string | null;
}

interface CommissionRule {
  id: string; scope: string; category: string | null; vendorId: string | null;
  vendorName: string | null; rate: number; active: boolean; createdAt: string;
  effectiveFrom?: string | null; effectiveTo?: string | null; supersedesId?: string | null;
}

interface RevenueReport {
  summary: { grossRevenue: number; netRevenue: number; platformRevenue: number; vendorRevenue: number; commissionRevenue: number; taxesCollected: number; shippingRevenue: number };
  rows: { orderId: string; date: string; total: number; tax: number; shipping: number; commission: number; vendorRevenue: number; paymentMethod: string }[];
}

interface PaymentReport {
  successfulCount: number; successfulAmount: number; pendingCount: number; pendingAmount: number;
  failedCount: number; failedAmount: number; methodBreakdown: { method: string; count: number; amount: number }[];
  transactions: {
    orderId: string;
    displayId?: string;
    customerName?: string;
    date: string;
    paymentVerifiedAt?: string;
    amount: number;
    method: string;
    paymentStatus: string;
    orderStatus?: string;
    gatewayReference?: string | null;
  }[];
}

interface RefundReport {
  totalRequests: number; approvedCount: number; rejectedCount: number; pendingCount: number;
  totalRefundAmount: number; reasons: { reason: string; count: number }[]; avgProcessingHours: number;
  requests: {
    orderId: string;
    displayId?: string;
    customerName?: string;
    amount: number;
    status: string;
    refundStatus?: string;
    refundMethod?: string;
    reason: string;
    date: string;
    refundProcessedAt?: string | null;
    providerReference?: string | null;
    originalPaymentMethod?: string;
  }[];
}

interface ProfitAnalysis {
  grossProfit: number; netProfit: number; marketplaceExpenses: number; vendorSettlementsPaid: number;
  commissionEarnings: number; operationalCosts: number; monthlyProfit: { month: string; profit: number; revenue: number }[];
  yearlyProfit: { year: string; profit: number }[]; profitGrowthPercent: number;
}

const TABS = [
  { key: "settlements", label: "Settlements", icon: Wallet },
  { key: "commission", label: "Commission Rules", icon: Percent },
  { key: "revenue", label: "Revenue Report", icon: IndianRupee },
  { key: "payments", label: "Payment Report", icon: CreditCard },
  { key: "refunds", label: "Refund Report", icon: RotateCcw },
  { key: "profit", label: "Profit Analysis", icon: TrendingUp },
  { key: "schedules", label: "Automated Reports", icon: Clock },
] as const;

const SCHEDULE_REPORT_TYPES = ["revenue", "payments", "refunds", "profit", "settlements"] as const;
const SCHEDULE_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

interface ReportSchedule {
  id: string; reportType: string; frequency: string; recipientEmail: string | null;
  active: boolean; lastRunAt: string | null; createdAt: string;
}

type TabKey = typeof TABS[number]["key"];

interface PanelProps {
  syncTrigger: number;
  onSynced?: () => void;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    pending: { bg: "#fffbeb", color: "#b45309" },
    eligible: { bg: "#f0fdf4", color: "#166534" },
    approved: { bg: "#eff6ff", color: "#1d4ed8" },
    rejected: { bg: "#fef2f2", color: "#b91c1c" },
    completed: { bg: "#f0fdf4", color: "#15803d" },
    processing: { bg: "#f0f9ff", color: "#0369a1" },
    paid: { bg: "#f0fdf4", color: "#15803d" },
    failed: { bg: "#fef2f2", color: "#b91c1c" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full capitalize" style={{ background: s.bg, color: s.color }}>
      {status}
    </span>
  );
}

function useAdminKey() {
  return adminKey();
}

function SettlementsPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const [data, setData] = useState<{ settlements: Settlement[]; summary: { pendingTotal: number; completedTotal: number; count: number }; dataValidation?: { warning: string | null } } | null>(null);
  const [summaryData, setSummaryData] = useState<{
    gmv: number;
    gstCollected: number;
    platformCommission: number;
    gstOnCommission: number;
    platformKeeps: number;
    tcs: number;
    pendingSettlements: number;
    completedSettlements: number;
  } | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [versionFilter, setVersionFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewMeta, setReviewMeta] = useState<{ paymentMethod: string; transactionId: string; utrNumber: string }>({ paymentMethod: "", transactionId: "", utrNumber: "" });
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [cycleRunning, setCycleRunning] = useState(false);
  const inFlight = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    const q = statusFilter !== "all" ? `?status=${statusFilter}` : "";
    
    Promise.all([
      fetch(`/api/admin/financial/settlements${q}`, { headers: adminHeaders(), credentials: "include" }).then(r => r.ok ? r.json() : null),
      fetch(`/api/admin/financials/summary`, { headers: adminHeaders(), credentials: "include" }).then(r => r.ok ? r.json() : null)
    ])
      .then(([sData, sumRes]) => {
        if (sData) setData(sData);
        if (sumRes?.rupees) {
          setSummaryData(sumRes.rupees);
        }
        setError("");
        onSynced?.();
      })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Settlements")))
      .finally(() => setLoading(false));
  }, [adminKey, statusFilter, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  async function runSettlementCycle() {
    if (!confirm("Run automated Wednesday settlement cycle? This will transition delivered orders older than 7 days to eligible and disburse payouts for eligible sellers.")) return;
    setCycleRunning(true);
    try {
      const res = await fetch(`/api/admin/financial/settlements/run-cycle`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(body.message || `Settlement cycle processed: ${body.eligibleCount} eligible, ${body.paidCount} paid.`);
        load();
      } else {
        alert(`Settlement cycle error: ${body.error || "Failed to execute cycle"}`);
      }
    } catch (err: any) {
      alert(`Settlement cycle request error: ${err?.message}`);
    } finally {
      setCycleRunning(false);
    }
  }

  function exportPdf() {
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Vendor Settlements Ledger", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Vendor", "Version", "Type", "Amount", "Status", "Date"]],
      body: settlements.map((s) => [s.vendorName, s.pricingVersion ?? "v1", s.type, fmt(s.amount), s.status, new Date(s.createdAt).toLocaleDateString("en-IN")]),
      styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`settlements-ledger-${Date.now()}.pdf`);
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(settlements.map((s) => ({ Vendor: s.vendorName, Version: s.pricingVersion ?? "v1", Type: s.type, Amount: s.amount, Status: s.status, Date: s.createdAt })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Ledger");
    XLSX.writeFile(wb, `settlements-ledger-${Date.now()}.xlsx`);
  }

  async function review(id: string, decision: "approve" | "reject" | "complete" | "paid" | "process") {
    const key = id + decision;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setBusyId(id);
    try {
      await fetch(`/api/admin/financial/settlements/${id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({
          decision,
          paymentMethod: reviewMeta.paymentMethod || undefined,
          transactionId: reviewMeta.transactionId || undefined,
          utrNumber: reviewMeta.utrNumber || undefined,
        }),
      });
      setReviewingId(null);
      setReviewMeta({ paymentMethod: "", transactionId: "", utrNumber: "" });
      load();
    } finally {
      inFlight.current.delete(key);
      setBusyId(null);
    }
  }

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutModal, setPayoutModal] = useState<{
    isOpen: boolean;
    settlement?: Settlement | null;
    isBatch?: boolean;
    amount?: number;
    count?: number;
  } | null>(null);

  async function executeSinglePayout(settlement: Settlement) {
    setBusyId(settlement.id);
    setPayoutLoading(true);
    try {
      const res = await fetch(`/api/admin/financial/settlements/${settlement.id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success) {
        alert(`Payout submitted successfully! Status: ${body.status}${body.utrNumber ? ` | UTR: ${body.utrNumber}` : ""}`);
      } else {
        alert(`Payout error: ${body.error || body.status || "Unknown status"}`);
      }
      setPayoutModal(null);
      load();
    } catch (err: any) {
      alert(`Payout error: ${err.message}`);
    } finally {
      setBusyId(null);
      setPayoutLoading(false);
    }
  }

  async function executeBatchPayout() {
    if (selectedIds.size === 0) return;
    setPayoutLoading(true);
    try {
      const res = await fetch(`/api/admin/financial/settlements/batch-payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({ settlementIds: Array.from(selectedIds) }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(`Batch Payout Completed: ${body.successful} successful, ${body.pending} pending, ${body.failed} failed out of ${body.total} total.`);
      } else {
        alert(`Batch payout failed: ${body.error || "Unknown error"}`);
      }
      setSelectedIds(new Set());
      setPayoutModal(null);
      load();
    } catch (err: any) {
      alert(`Batch payout error: ${err.message}`);
    } finally {
      setPayoutLoading(false);
    }
  }

  async function reconcileTransfer(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/financial/settlements/${id}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        alert(`Reconciled: Status is now ${body.status}${body.utrNumber ? ` | UTR: ${body.utrNumber}` : ""}`);
        load();
      } else {
        alert(`Reconciliation error: ${body.error || "Failed to check transfer"}`);
      }
    } catch (err: any) {
      alert(`Reconciliation error: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const rawSettlements = data?.settlements ?? [];
  const settlements = versionFilter === "all"
    ? rawSettlements
    : rawSettlements.filter(s => (s.pricingVersion ?? "v1") === versionFilter);

  if (error) {
    return <AdminErrorState title="Unable to load vendor settlements" message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      {data?.dataValidation?.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ℹ️ {data.dataValidation.warning}
        </div>
      )}

      {/* Automated Wednesday Payout Schedule Banner */}
      <div className="bg-gradient-to-r from-blue-50 via-indigo-50/50 to-amber-50 border border-blue-200/80 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#0D1B36] text-amber-400 flex items-center justify-center shrink-0 shadow-xs">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-2">
              <span>Wednesday Payout Cycle</span>
              <span className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">Automated Weekly</span>
            </div>
            <p className="text-xs text-gray-600 mt-0.5">
              Next scheduled automated payout run: <strong className="text-blue-900 font-semibold">{getNextWednesdayFormatted()}</strong>.
              Delivered orders past the 7-day return hold automatically transition to eligible for disbursement.
            </p>
          </div>
        </div>
        <button
          onClick={runSettlementCycle}
          disabled={cycleRunning || loading}
          className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#0D1B36] text-white hover:bg-[#1a2d54] disabled:opacity-50 transition-all shadow-xs shrink-0 cursor-pointer"
          title="Run settlement eligibility transition & Wednesday payout cycle now"
        >
          <RefreshCw size={13} className={cycleRunning ? "animate-spin text-amber-400" : "text-amber-400"} />
          <span>{cycleRunning ? "Running Cycle…" : "Run Wednesday Cycle"}</span>
        </button>
      </div>

      {/* 8 Financial KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">Gross GMV</span>
          <div className="text-lg font-serif font-bold mt-1 text-[#0D1B36]">{fmt(summaryData?.gmv ?? 0)}</div>
          <span className="text-[10px] text-gray-400">Sum Customer Pays</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">GST Collected</span>
          <div className="text-lg font-serif font-bold mt-1 text-[#0D1B36]">{fmt(summaryData?.gstCollected ?? 0)}</div>
          <span className="text-[10px] text-gray-400">Customer Product GST</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">Platform Commission</span>
          <div className="text-lg font-serif font-bold mt-1 text-[#0D1B36]">{fmt(summaryData?.platformCommission ?? 0)}</div>
          <span className="text-[10px] text-gray-400">18% Seller Base</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">GST on Commission</span>
          <div className="text-lg font-serif font-bold mt-1 text-[#0D1B36]">{fmt(summaryData?.gstOnCommission ?? 0)}</div>
          <span className="text-[10px] text-gray-400">5% Commission GST</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 block">Platform Keeps</span>
          <div className="text-lg font-serif font-bold mt-1 text-emerald-800">{fmt(summaryData?.platformKeeps ?? 0)}</div>
          <span className="text-[10px] text-gray-400">Comm + GST on Comm</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400 block">Total TCS</span>
          <div className="text-lg font-serif font-bold mt-1 text-[#0D1B36]">{fmt(summaryData?.tcs ?? 0)}</div>
          <span className="text-[10px] text-gray-400">1% Tax Deducted</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600 block">Pending Settlements</span>
          <div className="text-lg font-serif font-bold mt-1 text-amber-800">{fmt(summaryData?.pendingSettlements ?? data?.summary?.pendingTotal ?? 0)}</div>
          <span className="text-[10px] text-gray-400">Awaiting Disbursement</span>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-green-600 block">Completed Settlements</span>
          <div className="text-lg font-serif font-bold mt-1 text-green-800">{fmt(summaryData?.completedSettlements ?? data?.summary?.completedTotal ?? 0)}</div>
          <span className="text-[10px] text-gray-400">Paid Out to Sellers</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>Vendor Settlement Audit Ledger</h3>
          <div className="flex items-center gap-2 flex-wrap">
            <select value={versionFilter} onChange={(e) => setVersionFilter(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 font-medium">
              <option value="all">All versions</option>
              <option value="v1">v1 (Legacy)</option>
              <option value="v2">v2 (New model)</option>
            </select>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 font-medium">
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="eligible">Eligible (Ready for Payout)</option>
              <option value="processing">Processing</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="completed">Completed</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed Transfers</option>
            </select>
            <button onClick={exportPdf} disabled={settlements.length === 0} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
              <Download size={13} /> PDF
            </button>
            <button onClick={exportExcel} disabled={settlements.length === 0} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
              <FileSpreadsheet size={13} /> Excel
            </button>
            <PrintButton disabled={settlements.length === 0} />
          </div>
           {/* Batch action banner */}
        {selectedIds.size > 0 && (
          <div className="mx-5 my-3 p-3 rounded-xl bg-slate-900 text-white flex items-center justify-between flex-wrap gap-3 shadow-md">
            <div className="flex items-center gap-3 text-xs">
              <span className="font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-200">{selectedIds.size} selected</span>
              <span className="text-slate-300">
                Total Payout: <strong className="text-emerald-400 font-semibold">{fmt(settlements.filter(s => selectedIds.has(s.id)).reduce((acc, s) => acc + (s.netPayout ?? s.amount), 0))}</strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPayoutModal({
                    isOpen: true,
                    isBatch: true,
                    count: selectedIds.size,
                    amount: settlements.filter(s => selectedIds.has(s.id)).reduce((acc, s) => acc + (s.netPayout ?? s.amount), 0),
                  })
                }
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white transition-all shadow"
              >
                <CreditCard size={13} /> Initiate Batch Payout via Cashfree
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-3 py-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={settlements.length > 0 && settlements.filter(s => ["pending", "approved"].includes(s.status)).every(s => selectedIds.has(s.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        const eligible = settlements.filter(s => ["pending", "approved"].includes(s.status)).map(s => s.id);
                        setSelectedIds(new Set(eligible));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    title="Select all eligible for payout"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Order / Type</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Gross</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Commission</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Net Payout</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Date</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase min-w-[200px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <TableRowSkeleton columns={9} rows={6} />
              ) : settlements.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-sm text-gray-400">No settlements found.</td>
                </tr>
              ) :
                settlements.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-3 py-3.5 text-center">
                      {["pending", "approved"].includes(s.status) ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(s.id)}
                          onChange={(e) => {
                            const next = new Set(selectedIds);
                            if (e.target.checked) next.add(s.id);
                            else next.delete(s.id);
                            setSelectedIds(next);
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 font-semibold" style={{ color: NAVY }}>{s.vendorName}</td>
                    <td className="px-4 py-3.5">
                      {s.orderId ? (
                        <span className="font-mono text-xs text-gray-500">#{s.orderId}</span>
                      ) : (
                        <span className="text-xs capitalize text-gray-400">{s.type}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right text-xs text-gray-600">{s.productAmount != null ? fmt(s.productAmount) : fmt(s.amount)}</td>
                    <td className="px-4 py-3.5 text-right text-xs text-red-500">{s.commission != null ? `-${fmt(s.commission)}` : "—"}</td>
                    <td className="px-4 py-3.5 text-right font-semibold" style={{ color: NAVY }}>{fmt(s.netPayout ?? s.amount)}</td>
                    <td className="px-4 py-3.5">
                      <StatusPill status={s.status} />
                      {s.utrNumber && <div className="text-[10px] text-gray-500 font-mono mt-0.5">UTR: {s.utrNumber}</div>}
                      {s.cashfreeTransferId && !s.utrNumber && <div className="text-[10px] text-gray-400 font-mono mt-0.5">{s.cashfreeTransferId}</div>}
                      {s.failureReason && <div className="text-[10px] text-red-600 max-w-xs mt-0.5">⚠️ {s.failureReason}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">{new Date(s.createdAt).toLocaleDateString("en-IN")}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {/* Instant Cashfree Payout Action */}
                        {["pending", "approved"].includes(s.status) && (
                          <button
                            disabled={busyId === s.id}
                            onClick={() => setPayoutModal({ isOpen: true, settlement: s, amount: s.netPayout ?? s.amount })}
                            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 shadow-sm"
                            title="Direct bank transfer via Cashfree"
                          >
                            <CreditCard size={12} /> Pay Cashfree
                          </button>
                        )}

                        {/* Reconcile Action for Processing or Failed Transfers */}
                        {["processing", "failed"].includes(s.status) && (
                          <button
                            disabled={busyId === s.id}
                            onClick={() => reconcileTransfer(s.id)}
                            className="flex items-center gap-1 text-xs font-semibold px-2 py-1.5 rounded-lg bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 disabled:opacity-50"
                            title="Check transfer status on Cashfree"
                          >
                            <RefreshCw size={11} className={busyId === s.id ? "animate-spin" : ""} /> Reconcile
                          </button>
                        )}

                        {/* Existing manual review actions */}
                        {s.status === "pending" && s.type !== "order_settlement" && (
                          <>
                            <button disabled={busyId === s.id} onClick={() => review(s.id, "approve")} className="text-xs font-semibold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 disabled:opacity-50">Approve</button>
                            <button disabled={busyId === s.id} onClick={() => review(s.id, "reject")} className="text-xs font-semibold px-2 py-1 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50">Reject</button>
                          </>
                        )}
                        {s.status === "approved" && reviewingId !== s.id && (
                          <button onClick={() => setReviewingId(s.id)} className="text-xs font-semibold px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">Manual Paid</button>
                        )}
                        {s.status === "approved" && reviewingId === s.id && (
                          <div className="flex flex-col items-end gap-1">
                            <input placeholder="UTR Number" value={reviewMeta.utrNumber} onChange={(e) => setReviewMeta((m) => ({ ...m, utrNumber: e.target.value }))} className="text-xs px-2 py-1 rounded border border-gray-200 w-28" />
                            <div className="flex gap-1">
                              <button disabled={busyId === s.id} onClick={() => review(s.id, "paid")} className="text-xs font-semibold px-2 py-1 rounded bg-emerald-600 text-white">Save</button>
                              <button onClick={() => setReviewingId(null)} className="text-xs px-2 py-1 rounded border border-gray-200">Cancel</button>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {/* Payout Confirmation Modal */}
        {payoutModal?.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-gray-200 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CreditCard size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-base">
                    {payoutModal.isBatch ? "Confirm Batch Cashfree Payout" : "Confirm Cashfree Bank Payout"}
                  </h3>
                  <p className="text-xs text-gray-500">Real-money transfer authorization</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-sm space-y-2">
                {payoutModal.isBatch ? (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Settlements:</span>
                      <strong className="text-gray-900">{payoutModal.count} vendors</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Total Amount:</span>
                      <strong className="text-emerald-700 text-base">{fmt(payoutModal.amount ?? 0)}</strong>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Vendor:</span>
                      <strong className="text-gray-900">{payoutModal.settlement?.vendorName}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Transfer Amount:</span>
                      <strong className="text-emerald-700 text-base">{fmt(payoutModal.amount ?? 0)}</strong>
                    </div>
                  </>
                )}
                <div className="border-t border-gray-200 pt-2 text-xs text-gray-500">
                  ⚠️ This action will instruct Cashfree to transfer funds directly to the registered seller beneficiary bank accounts.
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={payoutLoading}
                  onClick={() => setPayoutModal(null)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={payoutLoading}
                  onClick={() => {
                    if (payoutModal.isBatch) {
                      executeBatchPayout();
                    } else if (payoutModal.settlement) {
                      executeSinglePayout(payoutModal.settlement);
                    }
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1.5 disabled:opacity-50 shadow"
                >
                  {payoutLoading ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                  Confirm Transfer
                </button>
              </div>
            </div>
          </div>
        )}        </div>
        </div>
      </div>
  );
}

function CommissionRulesPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const [rules, setRules] = useState<CommissionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"global" | "category" | "vendor">("global");
  const [category, setCategory] = useState("paithani");
  const [vendorId, setVendorId] = useState("");
  const [rate, setRate] = useState("10");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const commissionInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/financial/commission-rules`, { headers: adminHeaders(), credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setRules(d.rules ?? []); setFetchError(""); onSynced?.(); })
      .catch((err) => setFetchError(getFriendlyErrorMessage(err, "Commission rules")))
      .finally(() => setLoading(false));
  }, [adminKey, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  function startEdit(r: CommissionRule) {
    setEditingId(r.id);
    setScope(r.scope as any);
    setCategory(r.category ?? "paithani");
    setVendorId(r.vendorId ?? "");
    setRate((r.rate * 100).toString());
    setEffectiveFrom(r.effectiveFrom ? r.effectiveFrom.slice(0, 10) : "");
    setEffectiveTo(r.effectiveTo ? r.effectiveTo.slice(0, 10) : "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEffectiveFrom("");
    setEffectiveTo("");
  }

  async function createRule() {
    if (commissionInFlight.current.has("createRule")) return;
    commissionInFlight.current.add("createRule");
    setCreating(true);
    setError("");
    try {
      const rateNum = parseFloat(rate) / 100;
      const r = await fetch(`/api/admin/financial/commission-rules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({
          scope, category: scope === "category" ? category : undefined, vendorId: scope === "vendor" ? vendorId : undefined, rate: rateNum,
          effectiveFrom: effectiveFrom || undefined, effectiveTo: effectiveTo || undefined,
          supersedesId: editingId || undefined,
        }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      setVendorId("");
      cancelEdit();
      load();
    } catch (e: any) {
      setError(e.message ?? "Failed to create rule");
    } finally {
      commissionInFlight.current.delete("createRule");
      setCreating(false);
    }
  }

  async function deactivate(id: string) {
    const key = id + "deactivate";
    if (commissionInFlight.current.has(key)) return;
    commissionInFlight.current.add(key);
    try {
      await fetch(`/api/admin/financial/commission-rules/${id}/deactivate`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      load();
    } finally {
      commissionInFlight.current.delete(key);
    }
  }

  const visibleRules = showHistory ? rules : rules.filter((r) => r.active);

  if (fetchError) {
    return <AdminErrorState title="Unable to load commission rules" message={fetchError} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Create Commission Rule</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Scope</label>
            <select value={scope} onChange={(e) => setScope(e.target.value as any)} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
              <option value="global">Global (default)</option>
              <option value="category">Category</option>
              <option value="vendor">Vendor</option>
            </select>
          </div>
          {scope === "category" && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Category</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200">
                <option value="paithani">Paithani</option>
                <option value="designer">Designer</option>
              </select>
            </div>
          )}
          {scope === "vendor" && (
            <div>
              <label className="text-xs text-gray-400 block mb-1">Vendor ID</label>
              <input value={vendorId} onChange={(e) => setVendorId(e.target.value)} placeholder="vendor UUID" className="text-xs px-2 py-2 rounded-lg border border-gray-200 w-56" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Rate (%)</label>
            <input type="number" step="0.1" value={rate} onChange={(e) => setRate(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 w-24" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Effective From</label>
            <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Effective To</label>
            <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
          </div>
          <button onClick={createRule} disabled={creating || (scope === "vendor" && !vendorId)} className="text-xs font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: NAVY }}>
            {creating ? "Saving…" : editingId ? "Save Edit" : "Create Rule"}
          </button>
          {editingId && (
            <button onClick={cancelEdit} className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
          )}
        </div>
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
        {editingId && <p className="text-xs text-amber-600 mt-2">Editing rule — saving will deactivate the original and create a new dated version (kept for history).</p>}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>{showHistory ? "All Rules (Active & History)" : "Active Rules"}</h3>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowHistory((v) => !v)} className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
              {showHistory ? "Hide History" : "Show History"}
            </button>
            <PrintButton disabled={rules.length === 0} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Scope</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Target</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Rate</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Effective</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                <TableRowSkeleton columns={6} rows={4} />
              ) : visibleRules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-sm text-gray-400">No custom commission rules yet — flat 10% applies platform-wide.</td>
                </tr>
              ) :
                visibleRules.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3.5 capitalize font-semibold" style={{ color: NAVY }}>{r.scope}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">{r.scope === "category" ? r.category : r.scope === "vendor" ? r.vendorName : "All vendors"}</td>
                    <td className="px-4 py-3.5 text-right font-semibold" style={{ color: NAVY }}>{(r.rate * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">
                      {r.effectiveFrom ? new Date(r.effectiveFrom).toLocaleDateString("en-IN") : "—"}
                      {" → "}
                      {r.effectiveTo ? new Date(r.effectiveTo).toLocaleDateString("en-IN") : "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: r.active ? "#f0fdf4" : "#f3f4f6", color: r.active ? "#15803d" : "#9ca3af" }}>
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      {r.active && (
                        <>
                          <button onClick={() => startEdit(r)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 mr-2">Edit</button>
                          <button onClick={() => deactivate(r.id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">Deactivate</button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </div>
    </div>
  );
}

function useDateFilters() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    return p.toString();
  }, [from, to]);
  const filterBar = (
    <div className="flex gap-2">
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="text-xs px-2 py-2 rounded-lg border border-gray-200" />
    </div>
  );
  return { query, filterBar };
}

function RevenueReportPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const { query, filterBar } = useDateFilters();
  const [data, setData] = useState<(RevenueReport & { dataValidation?: { warning: string | null } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState<"pdf" | "excel" | null>(null);

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/financial/reports/revenue?${query}`, { headers: adminHeaders(), credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setData(d); setError(""); onSynced?.(); })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Revenue report")))
      .finally(() => setLoading(false));
  }, [adminKey, query, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  async function exportPdf() {
    if (!data) return;
    setExporting("pdf");
    try {
      const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
      doc.setFontSize(16); doc.text("Revenue Report", 14, 14);
      doc.setFontSize(9); doc.setTextColor(120);
      doc.text(`Generated ${new Date().toLocaleString("en-IN")}`, 14, 20);
      autoTable(doc, {
        startY: 26,
        head: [["Order", "Date", "Total", "Tax", "Shipping", "Commission", "Vendor Revenue", "Payment"]],
        body: data.rows.map((r) => [r.orderId?.startsWith("V") || r.orderId?.startsWith("TD") ? r.orderId : r.orderId ? `V-${r.orderId.replace(/-/g,"").slice(0,8).toUpperCase()}` : "—", new Date(r.date).toLocaleDateString("en-IN"), fmt(r.total), fmt(r.tax), fmt(r.shipping), fmt(r.commission), fmt(r.vendorRevenue), r.paymentMethod]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
      });
      doc.save(`revenue-report-${Date.now()}.pdf`);
    } finally { setExporting(null); }
  }

  async function exportExcel() {
    if (!data) return;
    setExporting("excel");
    try {
      const ws = XLSX.utils.json_to_sheet(data.rows.map((r) => ({ Order: r.orderId, Date: r.date, Total: r.total, Tax: r.tax, Shipping: r.shipping, Commission: r.commission, "Vendor Revenue": r.vendorRevenue, Payment: r.paymentMethod })));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Revenue Report");
      XLSX.writeFile(wb, `revenue-report-${Date.now()}.xlsx`);
    } finally { setExporting(null); }
  }

  if (error) {
    return <AdminErrorState title="Unable to load revenue report" message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      {data?.dataValidation?.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ℹ️ {data.dataValidation.warning}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {filterBar}
        <div className="flex gap-2">
          <button onClick={exportPdf} disabled={exporting !== null || !data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
          <button onClick={exportExcel} disabled={exporting !== null || !data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <PrintButton disabled={!data} />
        </div>
      </div>
      {loading && (
        <div className="space-y-4" role="status" aria-busy="true" aria-label="Loading revenue report">
          <DashboardStatsSkeleton count={4} />
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white shadow-[0_1px_0_0_#f3f4f6]">
                <tr>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Order</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Commission</th>
                  <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Vendor Rev.</th>
                  <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <TableRowSkeleton columns={6} rows={5} />
              </tbody>
            </table>
          </div>
        </div>
      )}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Gross Revenue</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.summary.grossRevenue)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Net Revenue</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.summary.netRevenue)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Platform Commission</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.summary.platformRevenue)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Vendor Revenue</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.summary.vendorRevenue)}</div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto max-h-[480px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_#f3f4f6]">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Order</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Total</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Commission</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Vendor Rev.</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {data.rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-xs text-gray-400">No orders in this range</td></tr>}
                  {data.rows.map((r) => (
                    <tr key={r.orderId} className="hover:bg-gray-50/60">
                      <td className="px-4 py-3.5 text-xs font-mono text-gray-600">{r.orderId?.startsWith("V") || r.orderId?.startsWith("TD") ? r.orderId : r.orderId ? `V-${r.orderId.replace(/-/g,"").slice(0,8).toUpperCase()}` : "—"}</td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">{new Date(r.date).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-3.5 text-right font-bold text-base" style={{ color: NAVY }}>{fmt(r.total)}</td>
                      <td className="px-4 py-3.5 text-right text-xs font-semibold text-gray-700">{fmt(r.commission)}</td>
                      <td className="px-4 py-3.5 text-right text-xs font-semibold text-gray-700">{fmt(r.vendorRevenue)}</td>
                      <td className="px-4 py-3.5 text-xs capitalize text-gray-500">{r.paymentMethod}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PaymentReportPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const { query, filterBar } = useDateFilters();
  const [data, setData] = useState<(PaymentReport & { dataValidation?: { warning: string | null } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/financial/reports/payments?${query}`, { headers: adminHeaders(), credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setData(d); setError(""); onSynced?.(); })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Payment report")))
      .finally(() => setLoading(false));
  }, [adminKey, query, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  function exportPdf() {
    if (!data) return;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Payment Report & Gateway Ledger", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Metric", "Amount", "Count"]],
      body: [
        ["Successful", fmt(data.successfulAmount ?? 0), String(data.successfulCount ?? 0)],
        ["Pending", fmt(data.pendingAmount ?? 0), String(data.pendingCount ?? 0)],
        ["Failed", fmt(data.failedAmount ?? 0), String(data.failedCount ?? 0)],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Payment Method", "Amount"]],
      body: (data.methodBreakdown ?? []).map((m) => [m.method, fmt(m.amount)]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    if (data.transactions && data.transactions.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [["Order ID", "Customer", "Date", "Amount", "Method", "Status", "Gateway Ref"]],
        body: data.transactions.slice(0, 100).map((t) => [
          t.displayId || t.orderId,
          t.customerName || "Customer",
          new Date(t.date).toLocaleDateString("en-IN"),
          fmt(t.amount),
          t.method,
          t.paymentStatus,
          t.gatewayReference || "—",
        ]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
      });
    }
    doc.save(`payment-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Successful", Amount: data.successfulAmount ?? 0, Count: data.successfulCount ?? 0 },
      { Metric: "Pending", Amount: data.pendingAmount ?? 0, Count: data.pendingCount ?? 0 },
      { Metric: "Failed", Amount: data.failedAmount ?? 0, Count: data.failedCount ?? 0 },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    const methodSheet = XLSX.utils.json_to_sheet((data.methodBreakdown ?? []).map((m) => ({ Method: m.method, Amount: m.amount })));
    XLSX.utils.book_append_sheet(wb, methodSheet, "Methods");
    if (data.transactions && data.transactions.length > 0) {
      const txSheet = XLSX.utils.json_to_sheet(data.transactions.map((t) => ({
        "Order ID": t.displayId || t.orderId,
        Customer: t.customerName,
        Date: t.date,
        Amount: t.amount,
        Method: t.method,
        Status: t.paymentStatus,
        "Order Status": t.orderStatus,
        "Gateway Ref": t.gatewayReference,
      })));
      XLSX.utils.book_append_sheet(wb, txSheet, "Transactions");
    }
    XLSX.writeFile(wb, `payment-report-${Date.now()}.xlsx`);
  }

  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    return data.transactions.filter((t) => {
      if (paymentStatusFilter !== "all" && t.paymentStatus !== paymentStatusFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matchesId = (t.displayId || t.orderId || "").toLowerCase().includes(s);
        const matchesCust = (t.customerName || "").toLowerCase().includes(s);
        const matchesRef = (t.gatewayReference || "").toLowerCase().includes(s);
        const matchesMethod = (t.method || "").toLowerCase().includes(s);
        if (!matchesId && !matchesCust && !matchesRef && !matchesMethod) return false;
      }
      return true;
    });
  }, [data?.transactions, paymentStatusFilter, searchTerm]);

  if (error) {
    return <AdminErrorState title="Unable to load payment report" message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      {data?.dataValidation?.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ℹ️ {data.dataValidation.warning}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {filterBar}
        <div className="flex gap-2">
          <button onClick={exportPdf} disabled={!data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
          <button onClick={exportExcel} disabled={!data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <PrintButton disabled={!data} />
        </div>
      </div>
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5"><CheckCircle size={12} className="text-emerald-500" /> Successful</span>
              <div className="text-lg font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.successfulAmount ?? 0)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.successfulCount ?? 0} transactions</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5"><Clock size={12} className="text-amber-500" /> Pending</span>
              <div className="text-lg font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.pendingAmount ?? 0)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.pendingCount ?? 0} transactions</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1.5"><XCircle size={12} className="text-red-500" /> Failed</span>
              <div className="text-lg font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.failedAmount ?? 0)}</div>
              <div className="text-xs text-gray-400 mt-1">{data.failedCount ?? 0} transactions</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Payment Method Breakdown</h3>
            {(data.methodBreakdown ?? []).length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">No payment method data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={(data.methodBreakdown ?? []).map((m) => ({ method: m.method, amount: m.amount }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="method" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="amount" fill={GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Real-Time Payment Transactions Ledger Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Authoritative Payment Ledger &amp; Gateway References</h3>
                <p className="text-xs text-gray-400 mt-0.5">Verified customer payment records synchronized directly from Cashfree / payment gateway</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Search order or gateway ref…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 w-48"
                />
                <select
                  value={paymentStatusFilter}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  className="text-xs px-2 py-1.5 rounded-lg border border-gray-200 font-medium"
                >
                  <option value="all">All payment statuses</option>
                  <option value="paid">Paid</option>
                  <option value="pending">Pending</option>
                  <option value="failed">Failed</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_#f3f4f6]">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Order</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Gateway Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-xs text-gray-400">
                        No transactions found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredTransactions.map((t) => (
                      <tr key={t.orderId} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 text-xs font-mono font-medium text-gray-800">
                          {t.displayId || t.orderId}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                          {t.customerName || "Customer"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(t.date).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-sm text-[#0D1B36]">
                          {fmt(t.amount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 capitalize">
                          {t.method}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={t.paymentStatus || "pending"} />
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">
                          {t.gatewayReference ? (
                            <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[11px]">
                              {t.gatewayReference}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function RefundReportPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const { query, filterBar } = useDateFilters();
  const [data, setData] = useState<(RefundReport & { dataValidation?: { warning: string | null } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refundStatusFilter, setRefundStatusFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/financial/reports/refunds?${query}`, { headers: adminHeaders(), credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setData(d); setError(""); onSynced?.(); })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Refund report")))
      .finally(() => setLoading(false));
  }, [adminKey, query, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  function exportPdf() {
    if (!data) return;
    const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
    doc.setFontSize(16); doc.text("Refund Report & Provider Audit Ledger", 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Metric", "Value"]],
      body: [
        ["Total Requests", String(data.totalRequests ?? 0)],
        ["Refund Amount", fmt(data.totalRefundAmount ?? 0)],
        ["Approved", String(data.approvedCount ?? 0)],
        ["Rejected", String(data.rejectedCount ?? 0)],
        ["Avg Processing (hrs)", String(data.avgProcessingHours ?? 0)],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Return Reason", "Count"]],
      body: (data.reasons ?? []).map((r) => [r.reason, String(r.count)]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    if (data.requests && data.requests.length > 0) {
      autoTable(doc, {
        startY: (doc as any).lastAutoTable.finalY + 10,
        head: [["Order ID", "Customer", "Date", "Amount", "Status", "Reason", "Method", "Provider Ref"]],
        body: data.requests.slice(0, 100).map((r) => [
          r.displayId || r.orderId,
          r.customerName || "Customer",
          new Date(r.date).toLocaleDateString("en-IN"),
          fmt(r.amount),
          r.status,
          r.reason,
          r.refundMethod || "—",
          r.providerReference || "—",
        ]),
        styles: { fontSize: 8 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
      });
    }
    doc.save(`refund-report-${Date.now()}.pdf`);
  }

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Total Requests", Value: data.totalRequests ?? 0 },
      { Metric: "Refund Amount", Value: data.totalRefundAmount ?? 0 },
      { Metric: "Approved", Value: data.approvedCount ?? 0 },
      { Metric: "Rejected", Value: data.rejectedCount ?? 0 },
      { Metric: "Avg Processing (hrs)", Value: data.avgProcessingHours ?? 0 },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    const reasonSheet = XLSX.utils.json_to_sheet((data.reasons ?? []).map((r) => ({ Reason: r.reason, Count: r.count })));
    XLSX.utils.book_append_sheet(wb, reasonSheet, "Reasons");
    if (data.requests && data.requests.length > 0) {
      const reqSheet = XLSX.utils.json_to_sheet(data.requests.map((r) => ({
        "Order ID": r.displayId || r.orderId,
        Customer: r.customerName,
        Date: r.date,
        Amount: r.amount,
        Status: r.status,
        Reason: r.reason,
        Method: r.refundMethod,
        "Provider Ref": r.providerReference,
      })));
      XLSX.utils.book_append_sheet(wb, reqSheet, "Refund Requests");
    }
    XLSX.writeFile(wb, `refund-report-${Date.now()}.xlsx`);
  }

  const filteredRequests = useMemo(() => {
    if (!data?.requests) return [];
    return data.requests.filter((r) => {
      if (refundStatusFilter !== "all" && r.status !== refundStatusFilter) return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        const matchesId = (r.displayId || r.orderId || "").toLowerCase().includes(s);
        const matchesCust = (r.customerName || "").toLowerCase().includes(s);
        const matchesReason = (r.reason || "").toLowerCase().includes(s);
        const matchesRef = (r.providerReference || "").toLowerCase().includes(s);
        if (!matchesId && !matchesCust && !matchesReason && !matchesRef) return false;
      }
      return true;
    });
  }, [data?.requests, refundStatusFilter, searchTerm]);

  if (error) {
    return <AdminErrorState title="Unable to load refund report" message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      {data?.dataValidation?.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ℹ️ {data.dataValidation.warning}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {filterBar}
        <div className="flex gap-2">
          <button onClick={exportPdf} disabled={!data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
          <button onClick={exportExcel} disabled={!data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <PrintButton disabled={!data} />
        </div>
      </div>
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Total Requests</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{data.totalRequests ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Refund Amount</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{fmt(data.totalRefundAmount ?? 0)}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Approved / Rejected</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{data.approvedCount ?? 0} / {data.rejectedCount ?? 0}</div>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Avg Processing</span>
              <div className="text-lg font-serif font-bold mt-1" style={{ color: NAVY }}>{data.avgProcessingHours ?? 0}h</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold mb-3" style={{ color: NAVY }}>Return Reasons Breakdown</h3>
            <div className="space-y-2">
              {(data.reasons ?? []).length === 0 && <div className="text-xs text-gray-400">No returns in this range</div>}
              {(data.reasons ?? []).map((r) => (
                <div key={r.reason} className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">{r.reason}</span>
                  <span className="font-semibold" style={{ color: NAVY }}>{r.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Real-Time Refund Requests & Auditable Payouts Ledger */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="text-sm font-bold" style={{ color: NAVY }}>Refund Requests &amp; Payment Provider Confirmations</h3>
                <p className="text-xs text-gray-400 mt-0.5">Authoritative refund audit log tracking original orders, status, and Cashfree refund references</p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  placeholder="Search order or reason…"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 w-48"
                />
                <select
                  value={refundStatusFilter}
                  onChange={(e) => setRefundStatusFilter(e.target.value)}
                  className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 font-medium"
                >
                  <option value="all">All refund statuses</option>
                  <option value="completed">Completed / Processed</option>
                  <option value="approved">Approved</option>
                  <option value="pending">Pending Review</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto max-h-[500px]">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-white shadow-[0_1px_0_0_#f3f4f6]">
                  <tr>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Order</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-4 py-3.5 text-right text-xs font-bold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Reason</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Method</th>
                    <th className="px-4 py-3.5 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">Provider Reference</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRequests.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-xs text-gray-400">
                        No refund records found matching criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredRequests.map((r) => (
                      <tr key={r.orderId} className="hover:bg-gray-50/60">
                        <td className="px-4 py-3 text-xs font-mono font-medium text-gray-800">
                          {r.displayId || r.orderId}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 font-medium">
                          {r.customerName || "Customer"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {new Date(r.date).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-sm text-[#0D1B36]">
                          {fmt(r.amount)}
                        </td>
                        <td className="px-4 py-3">
                          <StatusPill status={r.status || "pending"} />
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-600 max-w-xs truncate" title={r.reason}>
                          {r.reason}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 capitalize">
                          {r.refundMethod?.replace(/_/g, " ") || "original payment"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-gray-500">
                          {r.providerReference ? (
                            <span className="bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-[11px]">
                              {r.providerReference}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ProfitAnalysisPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "yearly">("monthly");
  const [data, setData] = useState<(ProfitAnalysis & { dataValidation?: { warning: string | null } }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/financial/profit-analysis?period=${period}`, { headers: adminHeaders(), credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setData(d); setError(""); onSynced?.(); })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Profit analysis")))
      .finally(() => setLoading(false));
  }, [adminKey, period, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  function exportPdf() {
    if (!data) return;
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFontSize(16); doc.text(`Profit Analysis (${period})`, 14, 14);
    autoTable(doc, {
      startY: 20,
      head: [["Metric", "Value"]],
      body: [
        ["Gross Profit (Platform Fee)", fmt(data.grossProfit ?? 0)],
        ["Net Profit", fmt(data.netProfit ?? 0)],
        ["Profit Growth", `${(data.profitGrowthPercent ?? 0).toFixed(1)}%`],
        ["Commission Earnings", fmt(data.commissionEarnings ?? 0)],
        ["Vendor Settlements Paid", fmt(data.vendorSettlementsPaid ?? 0)],
        ["Operational / Gateway Fees", fmt(data.operationalCosts ?? 0)],
      ],
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Month", "Profit"]],
      body: (data.monthlyProfit ?? []).map((m) => [m.month, fmt(m.profit)]),
      styles: { fontSize: 9 }, headStyles: { fillColor: [13, 27, 54], textColor: [201, 168, 76] },
    });
    doc.save(`profit-analysis-${Date.now()}.pdf`);
  }

  function exportExcel() {
    if (!data) return;
    const wb = XLSX.utils.book_new();
    const summarySheet = XLSX.utils.json_to_sheet([
      { Metric: "Gross Profit", Value: data.grossProfit ?? 0 },
      { Metric: "Net Profit", Value: data.netProfit ?? 0 },
      { Metric: "Profit Growth %", Value: data.profitGrowthPercent ?? 0 },
      { Metric: "Commission Earnings", Value: data.commissionEarnings ?? 0 },
      { Metric: "Vendor Settlements Paid", Value: data.vendorSettlementsPaid ?? 0 },
      { Metric: "Operational Costs", Value: data.operationalCosts ?? 0 },
    ]);
    XLSX.utils.book_append_sheet(wb, summarySheet, "Summary");
    const monthlySheet = XLSX.utils.json_to_sheet((data.monthlyProfit ?? []).map((m) => ({ Month: m.month, Profit: m.profit })));
    XLSX.utils.book_append_sheet(wb, monthlySheet, "Monthly");
    XLSX.writeFile(wb, `profit-analysis-${Date.now()}.xlsx`);
  }

  if (error) {
    return <AdminErrorState title="Unable to load profit analysis" message={error} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      {data?.dataValidation?.warning && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          ℹ️ {data.dataValidation.warning}
        </div>
      )}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit">
          {(["daily", "weekly", "monthly", "yearly"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className="px-2.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors"
              style={{ background: period === p ? NAVY : "transparent", color: period === p ? "white" : "#6b7280" }}>
              {p}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={exportPdf} disabled={!data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <Download size={13} /> PDF
          </button>
          <button onClick={exportExcel} disabled={!data} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-50">
            <FileSpreadsheet size={13} /> Excel
          </button>
          <PrintButton disabled={!data} />
        </div>
      </div>
      {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Gross Platform Profit</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.grossProfit ?? 0)}</div>
              <span className="text-[10px] text-gray-400">Platform Commission Revenue</span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Net Profit</span>
              <div className="text-xl font-serif font-bold mt-2 flex items-center gap-1.5" style={{ color: NAVY }}>
                {fmt(data.netProfit ?? 0)}
                <span className={`inline-flex items-center text-xs font-semibold ${(data.profitGrowthPercent ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                  {(data.profitGrowthPercent ?? 0) >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {Math.abs(data.profitGrowthPercent ?? 0).toFixed(1)}%
                </span>
              </div>
              <span className="text-[10px] text-gray-400">After Gateway Fees &amp; Deductions</span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Gateway Fees (~1.8%)</span>
              <div className="text-xl font-serif font-bold mt-2 text-rose-700">{fmt(data.operationalCosts ?? 0)}</div>
              <span className="text-[10px] text-gray-400">Cashfree PG Processing</span>
            </div>
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <span className="text-xs font-bold uppercase text-gray-400">Vendor Settlements Paid</span>
              <div className="text-xl font-serif font-bold mt-2" style={{ color: NAVY }}>{fmt(data.vendorSettlementsPaid ?? 0)}</div>
              <span className="text-[10px] text-gray-400">Net Seller Disbursals</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Monthly Profit Trend</h3>
            {(data.monthlyProfit ?? []).length === 0 ? (
              <div className="h-48 flex items-center justify-center text-xs text-gray-400">No data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.monthlyProfit}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#9ca3af" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="profit" fill={GOLD} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Consistent Accounting Methodology Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 shadow-xs">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Accounting Methodology &amp; Ledger Reconciliation Formulas</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
              <div className="p-3 bg-white rounded-xl border border-slate-200/60">
                <strong className="block text-slate-900 mb-1">Gross Merchandise Value (GMV)</strong>
                <code>Customer Pays = Taxable Value + Product GST + Shipping</code>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200/60">
                <strong className="block text-slate-900 mb-1">Platform Margin / Take Rate</strong>
                <code>Gross Profit = Platform Commission + GST on Commission</code>
              </div>
              <div className="p-3 bg-white rounded-xl border border-slate-200/60">
                <strong className="block text-slate-900 mb-1">Seller Payout &amp; Net Profit</strong>
                <code>Seller Payable = Base Price - Platform Keeps - TCS</code>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function ReportSchedulesPanel({ syncTrigger, onSynced }: PanelProps) {
  const adminKey = useAdminKey();
  const [schedules, setSchedules] = useState<ReportSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState<typeof SCHEDULE_REPORT_TYPES[number]>("revenue");
  const [frequency, setFrequency] = useState<typeof SCHEDULE_FREQUENCIES[number]>("weekly");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");
  const scheduleInFlight = useRef<Set<string>>(new Set());

  const load = useCallback(() => {
    if (!adminKey) return;
    setLoading(true);
    fetch(`/api/admin/financial/report-schedules`, { headers: adminHeaders(), credentials: "include" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((d) => { setSchedules(d.schedules ?? []); setFetchError(""); onSynced?.(); })
      .catch((err) => setFetchError(getFriendlyErrorMessage(err, "Report schedules")))
      .finally(() => setLoading(false));
  }, [adminKey, onSynced]);

  useEffect(() => {
    load();
  }, [load, syncTrigger]);

  async function createSchedule() {
    if (scheduleInFlight.current.has("createSchedule")) return;
    scheduleInFlight.current.add("createSchedule");
    setCreating(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/financial/report-schedules`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify({ reportType, frequency, recipientEmail: recipientEmail || undefined }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error ?? "Failed"); }
      setRecipientEmail("");
      load();
    } catch (e: any) {
      setError(e.message ?? "Failed to create schedule");
    } finally {
      scheduleInFlight.current.delete("createSchedule");
      setCreating(false);
    }
  }

  async function toggle(id: string) {
    const key = id + "toggle";
    if (scheduleInFlight.current.has(key)) return;
    scheduleInFlight.current.add(key);
    try {
      await fetch(`/api/admin/financial/report-schedules/${id}/toggle`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      load();
    } finally {
      scheduleInFlight.current.delete(key);
    }
  }

  async function remove(id: string) {
    const key = id + "remove";
    if (scheduleInFlight.current.has(key)) return;
    scheduleInFlight.current.add(key);
    try {
      await fetch(`/api/admin/financial/report-schedules/${id}`, {
        method: "DELETE",
        headers: adminHeaders(),
        credentials: "include",
      });
      load();
    } finally {
      scheduleInFlight.current.delete(key);
    }
  }

  if (fetchError) {
    return <AdminErrorState title="Unable to load report schedules" message={fetchError} onRetry={load} />;
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-bold mb-4" style={{ color: NAVY }}>Schedule Automated Report</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-gray-400 block mb-1">Report</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as any)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 capitalize">
              {SCHEDULE_REPORT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Frequency</label>
            <select value={frequency} onChange={(e) => setFrequency(e.target.value as any)} className="text-xs px-2 py-2 rounded-lg border border-gray-200 capitalize">
              {SCHEDULE_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">Recipient Email (optional)</label>
            <input type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="finance@vastraa.com" className="text-xs px-2 py-2 rounded-lg border border-gray-200 w-56" />
          </div>
          <button onClick={createSchedule} disabled={creating} className="text-xs font-semibold px-4 py-2 rounded-lg text-white disabled:opacity-50" style={{ background: NAVY }}>
            {creating ? "Saving…" : "Schedule Report"}
          </button>
        </div>
        {error && <div className="text-xs text-red-500 mt-2">{error}</div>}
        <p className="text-xs text-gray-400 mt-3">Scheduled reports are generated automatically on the chosen cadence.</p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-sm font-bold" style={{ color: NAVY }}>Active &amp; Past Schedules</h3>
        </div>
        {loading && <div className="py-10 text-center text-sm text-gray-400">Loading…</div>}
        {!loading && schedules.length === 0 && <div className="py-10 text-center text-sm text-gray-400">No automated reports scheduled yet.</div>}
        {!loading && schedules.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Report</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Frequency</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Recipient</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Last Run</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {schedules.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50/60">
                    <td className="px-4 py-3.5 capitalize font-semibold" style={{ color: NAVY }}>{s.reportType}</td>
                    <td className="px-4 py-3.5 text-xs capitalize text-gray-500">{s.frequency}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">{s.recipientEmail ?? "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-gray-400">{s.lastRunAt ? new Date(s.lastRunAt).toLocaleString("en-IN") : "Never"}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: s.active ? "#f0fdf4" : "#f3f4f6", color: s.active ? "#15803d" : "#9ca3af" }}>
                        {s.active ? "Active" : "Paused"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex justify-end gap-1.5">
                        <button onClick={() => toggle(s.id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">
                          {s.active ? "Pause" : "Resume"}
                        </button>
                        <button onClick={() => remove(s.id)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function FinancialManagementContent() {
  const [tab, setTab] = useState<TabKey>("settlements");
  const [syncTrigger, setSyncTrigger] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const { isConnected, socket } = useSocket();
  const debounceTimer = useRef<any>(null);

  const handleSynced = useCallback(() => {
    setIsSyncing(false);
    setLastSyncedAt(new Date());
  }, []);

  const triggerRefresh = useCallback(() => {
    setIsSyncing(true);
    setSyncTrigger((k) => k + 1);
  }, []);

  // Listen to centralized financial real-time events via window dispatch
  useEffect(() => {
    function handleRealtimeEvent(e: Event) {
      const customEvent = e as CustomEvent<{ name: string; data: any; timestamp: number }>;
      const eventName = customEvent.detail?.name;
      const relevantEvents = [
        "financials:updated",
        "settlement:processed",
        "settlement:created",
        "commission_rule:updated",
        "refund:processed",
        "refund:approved",
        "payment:status_updated",
        "payment:updated",
        "order:status_changed",
        "order:created",
        "order:cancelled",
        "return:approved",
      ];
      if (relevantEvents.includes(eventName)) {
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
          triggerRefresh();
        }, 250);
      }
    }

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [triggerRefresh]);

  // Periodic background sync with visibility awareness (pauses when hidden)
  useEffect(() => {
    const pollInterval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        triggerRefresh();
      }
    }, 12000);

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearInterval(pollInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [triggerRefresh]);

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
            <Receipt size={20} style={{ color: GOLD }} /> Financial Management
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Authoritative real-time settlements, commission rules, revenue, payments, refunds &amp; profit analysis</p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Real-time connection badge */}
          {isConnected ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Real-Time Sync</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-xs font-semibold shadow-xs">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              <span>Auto-Syncing (12s Polling)</span>
            </div>
          )}

          {/* Last updated timestamp */}
          <span className="text-xs text-gray-500 font-mono">
            Last synced: {lastSyncedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>

          {/* Refresh button */}
          <button
            onClick={triggerRefresh}
            disabled={isSyncing}
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors shadow-xs disabled:opacity-50 cursor-pointer"
            title="Fetch authoritative financial data from backend"
          >
            <RefreshCw size={13} className={`text-gray-500 ${isSyncing ? "animate-spin text-emerald-600" : ""}`} />
            <span>{isSyncing ? "Syncing…" : "Refresh"}</span>
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 w-fit flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold transition-colors"
            style={{ background: tab === key ? NAVY : "transparent", color: tab === key ? "white" : "#6b7280" }}
          >
            <Icon size={13} /> {label}
          </button>
        ))}
      </div>

      <div>
        {tab === "settlements" && <SettlementsPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
        {tab === "commission" && <CommissionRulesPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
        {tab === "revenue" && <RevenueReportPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
        {tab === "payments" && <PaymentReportPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
        {tab === "refunds" && <RefundReportPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
        {tab === "profit" && <ProfitAnalysisPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
        {tab === "schedules" && <ReportSchedulesPanel syncTrigger={syncTrigger} onSynced={handleSynced} />}
      </div>
    </div>
  );
}

export default function AdminFinancialManagement() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Financial Management">
          <FinancialManagementContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
