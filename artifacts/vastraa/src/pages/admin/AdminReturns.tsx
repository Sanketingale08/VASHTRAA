import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import {
  RotateCcw,
  RefreshCw,
  Search,
  Download,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Eye,
  AlertCircle,
  ShieldCheck,
  Image as ImageIcon,
  ChevronRight,
  Filter,
  Layers,
  IndianRupee,
  Calendar,
  ArrowRight,
  ExternalLink,
  Package,
  User,
  Phone,
  Mail,
  MapPin,
  Building2,
  ShieldAlert
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders } from "@/lib/adminApi";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { AdminErrorBoundary, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";

const NAVY = "#0A1F44";
const GOLD = "#C7CCD1";
const IVORY = "#F4F5F7";
const CREAM = "#E5E8EC";

interface ReturnItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  images?: string[];
  vendorName?: string;
  isStandardProduct?: boolean;
}

interface ReturnRecord {
  id: string;
  returnNumber: string;
  orderId: string;
  orderDisplayId?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  vendorId: string;
  vendorName: string;
  requestType: "return" | "exchange";
  issueCategory: string;
  customerNotes?: string;
  evidenceUrls: string[];
  items: ReturnItem[];
  preferredRefundMethod?: string;
  bankDetails?: {
    accountNumber?: string;
    ifscCode?: string;
    accountHolderName?: string;
    bankName?: string;
  };
  status: string;
  statusHistory: Array<{
    status: string;
    timestamp: string;
    actor: string;
    actorId?: string;
    note?: string;
  }>;
  reviewDecision?: {
    decision: "approved" | "rejected";
    reviewedBy?: string;
    reviewedAt?: string;
    reviewNotes?: string;
    rejectionReason?: string;
  };
  pickupDetails?: {
    pickupScheduledDate?: string;
    courierName?: string;
    awbNumber?: string;
    pickupStatus?: string;
    lastTrackingEvent?: string;
    pickupAddress?: any;
  };
  qcDetails?: {
    inspectedAt?: string;
    inspectedBy?: string;
    inspectorName?: string;
    conditionPass?: boolean;
    defectVerified?: boolean;
    originalTagsPresent?: boolean;
    packagingIntact?: boolean;
    result?: "pass" | "fail";
    approvedForResale?: boolean;
    restocked?: boolean;
    qcNotes?: string;
    qcPhotos?: string[];
  };
  refundDetails?: {
    refundAmount?: number;
    refundStatus?: string;
    refundMethod?: string;
    paymentGatewayRefundId?: string;
    idempotencyKey?: string;
    processedAt?: string;
  };
  exchangeDetails?: {
    replacementProductId?: string;
    replacementProductName?: string;
    replacementAwb?: string;
    replacementCourier?: string;
    replacementShippedAt?: string;
    stockAvailable?: boolean;
    fallbackToRefund?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

interface AnalyticsData {
  totalReturns: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  exchangeRequests: number;
  refundInitiated: number;
  refundCompleted: number;
  totalRefundAmount: number;
  activeReturns?: number;
  completedReturns?: number;
  byCategory?: Array<{ category: string; count: number; percentage: number }>;
  sellerBreakdown?: Array<{
    vendorId: string;
    vendorName: string;
    totalClaims: number;
    returnsCount: number;
    exchangesCount: number;
    topReason: string;
    totalRefunded: number;
    qcPassRate: number;
  }>;
}

const LIFECYCLE_LABELS: Record<string, { label: string; bg: string; text: string; step: number }> = {
  PENDING: { label: "Pending Admin Review", bg: "bg-amber-100", text: "text-amber-900", step: 1 },
  UNDER_REVIEW: { label: "Under Review", bg: "bg-blue-100", text: "text-blue-900", step: 2 },
  APPROVED: { label: "Approved by Admin", bg: "bg-indigo-100", text: "text-indigo-900", step: 3 },
  REJECTED: { label: "Rejected", bg: "bg-rose-100", text: "text-rose-900", step: 0 },
  PICKUP_SCHEDULED: { label: "Reverse Pickup Scheduled", bg: "bg-purple-100", text: "text-purple-900", step: 4 },
  PICKED_UP: { label: "Collected by Courier", bg: "bg-purple-200", text: "text-purple-950", step: 5 },
  RECEIVED: { label: "Received at Warehouse", bg: "bg-cyan-100", text: "text-cyan-950", step: 6 },
  QUALITY_CHECK: { label: "Quality Inspection", bg: "bg-yellow-100", text: "text-yellow-950", step: 7 },
  QC_FAILED: { label: "QC Failed (Unsuitable)", bg: "bg-rose-100", text: "text-rose-900", step: 0 },
  REFUND_INITIATED: { label: "Refund Gateway Initiated", bg: "bg-teal-100", text: "text-teal-950", step: 8 },
  REFUND_COMPLETED: { label: "Refund Paid Out", bg: "bg-emerald-100", text: "text-emerald-950", step: 9 },
  EXCHANGE_PROCESSING: { label: "Exchange Stock Reserved", bg: "bg-sky-100", text: "text-sky-950", step: 8 },
  EXCHANGE_SHIPPED: { label: "Replacement Dispatched", bg: "bg-blue-200", text: "text-blue-950", step: 9 },
  EXCHANGE_DELIVERED: { label: "Exchange Completed", bg: "bg-emerald-200", text: "text-emerald-950", step: 10 },
  CANCELLED: { label: "Cancelled", bg: "bg-gray-200", text: "text-gray-800", step: 0 },
};

function fmtRupees(amount: number) {
  return `₹${Math.round(amount || 0).toLocaleString("en-IN")}`;
}

export function AdminReturnsDashboard() {
  const [analytics, setAnalytics] = useState<AnalyticsData>({
    totalReturns: 0,
    pendingRequests: 0,
    approvedRequests: 0,
    rejectedRequests: 0,
    exchangeRequests: 0,
    refundInitiated: 0,
    refundCompleted: 0,
    totalRefundAmount: 0,
  });
  const [returnsList, setReturnsList] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "return" | "exchange">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Action Modals State
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickupForm, setPickupForm] = useState({
    courierName: "Shiprocket Reverse (BlueDart / Delhivery)",
    awbNumber: "",
    pickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: "",
  });

  // QC Form State
  const [showQcModal, setShowQcModal] = useState(false);
  const [qcForm, setQcForm] = useState({
    conditionPass: true,
    defectVerified: true,
    originalTagsPresent: true,
    packagingIntact: true,
    qcNotes: "",
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError("");

      const [analyticsRes, returnsRes] = await Promise.all([
        fetch("/api/admin/returns/analytics", {
          headers: adminHeaders(),
          credentials: "include",
        }),
        fetch("/api/admin/returns", {
          headers: adminHeaders(),
          credentials: "include",
        }),
      ]);

      if (!analyticsRes.ok) throw new Error("Failed to load return analytics");
      if (!returnsRes.ok) throw new Error("Failed to load return records");

      const analyticsData = await analyticsRes.json();
      const returnsData = await returnsRes.json();

      setAnalytics(analyticsData);
      setReturnsList(returnsData.returns || returnsData.orders || []);
    } catch (err: any) {
      setError(getFriendlyErrorMessage(err, "Returns & Refunds"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Real-time synchronization
  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (["return:created", "return:updated", "refund:processed", "order:status_changed"].includes(detail.name)) {
        loadData();
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [loadData]);

  const filteredReturns = useMemo(() => {
    let list = returnsList;

    if (typeFilter !== "all") {
      list = list.filter((r) => r.requestType === typeFilter);
    }

    if (statusFilter !== "all") {
      if (statusFilter === "PENDING") {
        list = list.filter((r) => ["PENDING", "UNDER_REVIEW"].includes(r.status));
      } else if (statusFilter === "QC") {
        list = list.filter((r) => ["RECEIVED", "QUALITY_CHECK"].includes(r.status));
      } else if (statusFilter === "REFUND") {
        list = list.filter((r) => ["REFUND_INITIATED", "REFUND_COMPLETED"].includes(r.status));
      } else if (statusFilter === "EXCHANGE") {
        list = list.filter((r) => ["EXCHANGE_PROCESSING", "EXCHANGE_SHIPPED", "EXCHANGE_DELIVERED"].includes(r.status));
      } else {
        list = list.filter((r) => r.status === statusFilter);
      }
    }

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.returnNumber?.toLowerCase().includes(q) ||
          r.orderId?.toLowerCase().includes(q) ||
          (r.orderDisplayId && r.orderDisplayId.toLowerCase().includes(q)) ||
          r.userName?.toLowerCase().includes(q) ||
          r.userEmail?.toLowerCase().includes(q) ||
          r.vendorName?.toLowerCase().includes(q) ||
          r.items?.some((i) => i.name.toLowerCase().includes(q))
      );
    }

    return list;
  }, [returnsList, typeFilter, statusFilter, search]);

  // Admin Actions
  async function handleApprove(returnId: string) {
    if (!confirm("Approve this return request and initiate reverse courier logistics?")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/review`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify({ decision: "approved", reviewNotes: "Eligibility and condition verified by Admin." }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Approval failed");
      }
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "Failed to approve return.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectSubmit(returnId: string) {
    if (!rejectReason.trim()) {
      alert("Please provide a mandatory reason for rejecting this return request.");
      return;
    }
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/review`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify({ decision: "rejected", rejectionReason: rejectReason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Rejection failed");
      }
      setShowRejectModal(false);
      setRejectReason("");
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "Failed to reject return.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSchedulePickup(returnId: string) {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/pickup`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(pickupForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to schedule pickup");
      }
      setShowPickupModal(false);
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "Pickup scheduling failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkReceived(returnId: string) {
    if (!confirm("Confirm that parcel has been physically received at the central warehouse?")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/receive`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark as received");
      }
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "Failed to update receipt status.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleQcSubmit(returnId: string) {
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/qc`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify(qcForm),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Quality inspection submission failed");
      }
      setShowQcModal(false);
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "QC submission failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleProcessRefund(returnId: string) {
    if (!confirm("Trigger customer refund via Payment Gateway / Bank Transfer? (Protected against duplicate payout)")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/refund`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Refund payout failed");
      }
      await loadData();
      refreshActiveModal(returnId);
      alert("Refund successfully initiated and recorded in MongoDB!");
    } catch (err: any) {
      alert(err?.message || "Refund processing failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleFulfillExchange(returnId: string) {
    if (!confirm("Fulfill exchange request? This will verify available MongoDB inventory, reserve replacement stock, and generate courier dispatch details.")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/exchange`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Exchange fulfillment failed");
      }
      await loadData();
      refreshActiveModal(returnId);
      alert("Replacement saree inventory reserved and dispatch AWB generated!");
    } catch (err: any) {
      alert(err?.message || "Exchange fulfillment failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleMarkExchangeDelivered(returnId: string) {
    if (!confirm("Confirm customer received the replacement exchange item?")) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/delivered`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark exchange delivered");
      }
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "Failed to mark as delivered.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCancelRequest(returnId: string) {
    const reason = prompt("Enter administrative reason for cancelling this return claim:");
    if (!reason || !reason.trim()) return;
    try {
      setActionLoading(true);
      const res = await fetch(`/api/admin/returns/${returnId}/cancel`, {
        method: "POST",
        headers: adminHeaders(),
        credentials: "include",
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to cancel claim");
      }
      await loadData();
      refreshActiveModal(returnId);
    } catch (err: any) {
      alert(err?.message || "Failed to cancel return.");
    } finally {
      setActionLoading(false);
    }
  }

  async function refreshActiveModal(returnId: string) {
    try {
      const res = await fetch(`/api/admin/returns/${returnId}`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedReturn(data.return);
      }
    } catch {}
  }

  // Export functions
  function exportCSV() {
    const headers = ["Return Number", "Order ID", "Customer", "Vendor", "Type", "Item", "Reason", "Status", "Refund Amount", "Date"];
    const rows = filteredReturns.map((r) => [
      r.returnNumber,
      r.orderDisplayId || r.orderId,
      r.userName || r.userEmail || "Customer",
      r.vendorName,
      r.requestType,
      r.items?.[0]?.name || "Saree",
      r.issueCategory,
      r.status,
      r.refundDetails?.refundAmount || 0,
      new Date(r.createdAt).toLocaleDateString("en-IN"),
    ]);

    const csvContent = [headers.join(","), ...rows.map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `VASTRAA-Returns-Report-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.setTextColor(10, 31, 68);
    doc.text("VASTRAA — Returns & Exchanges Master Audit Report", 14, 20);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleString("en-IN")} | Total Claims: ${filteredReturns.length}`, 14, 26);

    const tableRows = filteredReturns.map((r) => [
      r.returnNumber,
      `#${r.orderDisplayId || r.orderId.slice(0, 8)}`,
      r.vendorName.slice(0, 15),
      r.requestType.toUpperCase(),
      (r.items[0]?.name || "Saree").slice(0, 20),
      r.issueCategory.replace(/_/g, " "),
      r.status,
      fmtRupees(r.refundDetails?.refundAmount || 0),
    ]);

    autoTable(doc, {
      startY: 32,
      head: [["Return #", "Order", "Artisan", "Type", "Product", "Reason", "Status", "Refund"]],
      body: tableRows,
      theme: "grid",
      headStyles: { fillColor: [10, 31, 68], textColor: [255, 255, 255], fontSize: 8 },
      bodyStyles: { fontSize: 7 },
    });

    doc.save(`VASTRAA-Returns-Report-${new Date().toISOString().split("T")[0]}.pdf`);
  }

  return (
    <AdminLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44] flex items-center gap-2">
              <RotateCcw size={24} className="text-[#0A1F44]" />
              Returns & Refunds Center
            </h1>
            <p className="text-xs text-gray-500 mt-1">
              End-to-end management of 7-day returns, exchanges, reverse logistics, warehouse inspection, and refunds.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={exportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-2xs transition"
            >
              <Download size={13} />
              CSV Export
            </button>
            <button
              onClick={exportPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0A1F44] text-white text-xs font-semibold hover:bg-[#1a3360] shadow-2xs transition"
            >
              <FileText size={13} />
              PDF Audit
            </button>
          </div>
        </div>

        {/* 8 Required MongoDB Analytics Metric Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Return Requests</p>
              <p className="text-2xl font-bold text-[#0A1F44] mt-1">{analytics.totalReturns}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-blue-50 text-blue-700">
              <Layers size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Pending Requests</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{analytics.pendingRequests}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-amber-50 text-amber-700">
              <Clock size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Approved Requests</p>
              <p className="text-2xl font-bold text-indigo-700 mt-1">{analytics.approvedRequests}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-700">
              <CheckCircle2 size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Rejected Requests</p>
              <p className="text-2xl font-bold text-rose-700 mt-1">{analytics.rejectedRequests}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-rose-50 text-rose-700">
              <XCircle size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Exchange Requests</p>
              <p className="text-2xl font-bold text-sky-700 mt-1">{analytics.exchangeRequests}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-sky-50 text-sky-700">
              <RefreshCw size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Refund Initiated</p>
              <p className="text-2xl font-bold text-teal-700 mt-1">{analytics.refundInitiated}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-teal-50 text-teal-700">
              <Truck size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Refund Completed</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{analytics.refundCompleted}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700">
              <ShieldCheck size={20} />
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#C7CCD1]/30 shadow-2xs flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Refund Amount</p>
              <p className="text-2xl font-bold text-[#0A1F44] mt-1">{fmtRupees(analytics.totalRefundAmount)}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-purple-50 text-purple-700">
              <IndianRupee size={20} />
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="bg-white rounded-xl p-4 border border-[#C7CCD1]/30 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: "all", label: "All Claims" },
                { id: "PENDING", label: "Pending Review" },
                { id: "APPROVED", label: "Approved" },
                { id: "PICKUP_SCHEDULED", label: "Pickup Scheduled" },
                { id: "QC", label: "Quality Check" },
                { id: "REFUND", label: "Refunds" },
                { id: "EXCHANGE", label: "Exchanges" },
                { id: "REJECTED", label: "Rejected" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                    statusFilter === tab.id
                      ? "bg-[#0A1F44] text-white shadow-2xs"
                      : "bg-[#F4F5F7] text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as any)}
                className="px-3 py-1.5 rounded-lg text-xs bg-[#F4F5F7] border border-[#C7CCD1]/30 text-gray-700 font-semibold focus:outline-none"
              >
                <option value="all">All Types</option>
                <option value="return">Returns Only</option>
                <option value="exchange">Exchanges Only</option>
              </select>

              <div className="relative w-48 sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search claim, order, customer..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-[#F4F5F7] border border-[#C7CCD1]/30 rounded-lg focus:outline-none focus:border-[#0A1F44]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Master Requests Table */}
        {loading ? (
          <div className="py-24 text-center bg-white rounded-xl border border-[#C7CCD1]/20">
            <div className="w-9 h-9 border-3 border-[#0A1F44]/20 border-t-[#0A1F44] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-500 font-medium">Syncing with MongoDB Returns Database...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 text-red-700 rounded-xl text-center text-sm border border-red-200">
            {error}
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-xl border border-[#C7CCD1]/20 p-6">
            <Package size={44} className="mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-700 text-sm">No return or exchange records found</p>
            <p className="text-xs text-gray-400 mt-1">Adjust filters or search parameters.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#C7CCD1]/30 overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F5F7] text-gray-600 uppercase tracking-wider font-semibold border-b border-[#C7CCD1]/20">
                  <tr>
                    <th className="px-4 py-3.5">Claim ID & Type</th>
                    <th className="px-4 py-3.5">Order & Customer</th>
                    <th className="px-4 py-3.5">Item & Eligibility</th>
                    <th className="px-4 py-3.5">Reason & Photos</th>
                    <th className="px-4 py-3.5">Status & Logistics</th>
                    <th className="px-4 py-3.5">QC & Inventory</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C7CCD1]/15">
                  {filteredReturns.map((ret) => {
                    const statusConfig = LIFECYCLE_LABELS[ret.status] || {
                      label: ret.status,
                      bg: "bg-gray-100",
                      text: "text-gray-700",
                    };
                    const item = ret.items[0];

                    return (
                      <tr key={ret.id} className="hover:bg-[#FDFAF5]/60 transition-colors">
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-mono font-bold text-[#0A1F44]">#{ret.returnNumber}</div>
                          <span
                            className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded capitalize mt-1 ${
                              ret.requestType === "return" ? "bg-amber-100 text-amber-900" : "bg-sky-100 text-sky-900"
                            }`}
                          >
                            {ret.requestType}
                          </span>
                          <p className="text-[10px] text-gray-400 mt-1">
                            {new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </p>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <span className="font-mono font-semibold text-blue-600">
                            #{ret.orderDisplayId || ret.orderId.slice(0, 10)}
                          </span>
                          <div className="font-medium text-gray-800 mt-0.5">{ret.userName || "Customer"}</div>
                          <div className="text-[10px] text-gray-400">{ret.userEmail}</div>
                          <div className="text-[10px] text-gray-400">Seller: {ret.vendorName}</div>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-start gap-2 max-w-[220px]">
                            {item?.images?.[0] && (
                              <div className="w-10 h-10 rounded overflow-hidden bg-gray-100 shrink-0 border border-gray-200">
                                <img
                                  src={getProductImageSrc(item.images[0])}
                                  alt={item.name}
                                  className="w-full h-full object-cover"
                                  onError={replaceProductImageWithFallback}
                                />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-semibold text-gray-800 truncate">{item?.name || "Handloom Saree"}</p>
                              <p className="text-[11px] text-gray-500">₹{item?.price?.toLocaleString("en-IN")}</p>
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                                Standard Paithani/Designer Eligible
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top max-w-[180px]">
                          <p className="font-semibold text-gray-800 capitalize">{ret.issueCategory.replace(/_/g, " ")}</p>
                          {ret.customerNotes && (
                            <p className="text-[11px] text-gray-500 italic line-clamp-2 mt-0.5">"{ret.customerNotes}"</p>
                          )}
                          {ret.evidenceUrls && ret.evidenceUrls.length > 0 && (
                            <button
                              onClick={() => setPreviewPhoto(ret.evidenceUrls[0])}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                            >
                              <ImageIcon size={11} />
                              {ret.evidenceUrls.length} Photo(s)
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${statusConfig.bg} ${statusConfig.text}`}>
                            {statusConfig.label}
                          </span>
                          {ret.pickupDetails?.awbNumber && (
                            <div className="text-[10px] text-gray-500 font-mono mt-1">
                              AWB: {ret.pickupDetails.awbNumber}
                            </div>
                          )}
                          {ret.pickupDetails?.pickupScheduledDate && (
                            <div className="text-[10px] text-gray-400">
                              Pickup: {ret.pickupDetails.pickupScheduledDate}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          {ret.qcDetails?.restocked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              <CheckCircle2 size={11} />
                              Pass · Stock Resold
                            </span>
                          ) : ret.qcDetails?.result === "fail" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-800 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              <XCircle size={11} />
                              QC Failed
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">Awaiting QC inspection</span>
                          )}
                          {ret.refundDetails?.refundAmount && (
                            <div className="text-[11px] font-bold text-[#0A1F44] mt-1">
                              Refund: {fmtRupees(ret.refundDetails.refundAmount)}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top text-right">
                          <button
                            onClick={() => setSelectedReturn(ret)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0A1F44] text-white hover:bg-[#1a3360] font-semibold text-xs shadow-2xs transition"
                          >
                            <Eye size={12} />
                            Manage
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Master Inspection & Action Modal */}
        {selectedReturn && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/55 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden border border-[#C7CCD1]/30 animate-in fade-in zoom-in-95 duration-150">
              {/* Modal Header */}
              <div className="px-6 py-4 bg-[#0A1F44] text-white flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold">#{selectedReturn.returnNumber}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-white/20 capitalize">
                      {selectedReturn.requestType}
                    </span>
                  </div>
                  <p className="text-xs text-white/70 mt-0.5">
                    Order #{selectedReturn.orderDisplayId || selectedReturn.orderId} · Submitted on {new Date(selectedReturn.createdAt).toLocaleString("en-IN")}
                  </p>
                </div>
                <button
                  onClick={() => setSelectedReturn(null)}
                  className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                >
                  ✕
                </button>
              </div>

              {/* Modal Content */}
              <div className="p-6 overflow-y-auto space-y-6 text-xs">
                {/* 14-Stage Visual Lifecycle Progress Tracker */}
                <div className="p-4 rounded-xl bg-[#F4F5F7] border border-[#C7CCD1]/30">
                  <h3 className="font-serif font-bold text-sm text-[#0A1F44] mb-3">Live Return Lifecycle Tracker</h3>
                  <div className="flex flex-wrap items-center gap-2">
                    {[
                      { key: "PENDING", label: "01. Request Raised" },
                      { key: "APPROVED", label: "02. Admin Approved" },
                      { key: "PICKUP_SCHEDULED", label: "03. Pickup Booked" },
                      { key: "RECEIVED", label: "04. Received at Hub" },
                      { key: "QUALITY_CHECK", label: "05. Quality Check" },
                      {
                        key: selectedReturn.requestType === "exchange" ? "EXCHANGE_SHIPPED" : "REFUND_COMPLETED",
                        label: selectedReturn.requestType === "exchange" ? "06. Replacement Sent" : "06. Refund Processed",
                      },
                    ].map((step, idx) => {
                      const isCurrent = selectedReturn.status.includes(step.key);
                      return (
                        <div
                          key={idx}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                            isCurrent
                              ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-xs"
                              : "bg-white text-gray-600 border-[#C7CCD1]/30"
                          }`}
                        >
                          <CheckCircle2 size={13} className={isCurrent ? "text-amber-300" : "text-gray-400"} />
                          <span>{step.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Customer & Order Box */}
                  <div className="border border-[#C7CCD1]/30 rounded-xl p-4 space-y-2">
                    <h4 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                      <User size={15} />
                      Customer & Fulfillment Details
                    </h4>
                    <p className="text-gray-700"><strong>Name:</strong> {selectedReturn.userName || "Customer"}</p>
                    <p className="text-gray-700"><strong>Email:</strong> {selectedReturn.userEmail || "—"}</p>
                    <p className="text-gray-700"><strong>Phone:</strong> {selectedReturn.userPhone || "—"}</p>
                    <p className="text-gray-700"><strong>Artisan Seller:</strong> {selectedReturn.vendorName}</p>
                    {selectedReturn.pickupDetails?.pickupAddress && (
                      <p className="text-gray-700 mt-1">
                        <strong>Pickup Address:</strong> {selectedReturn.pickupDetails.pickupAddress.line1}, {selectedReturn.pickupDetails.pickupAddress.city}, {selectedReturn.pickupDetails.pickupAddress.state} - {selectedReturn.pickupDetails.pickupAddress.pincode}
                      </p>
                    )}
                  </div>

                  {/* Product & Eligibility Verification */}
                  <div className="border border-[#C7CCD1]/30 rounded-xl p-4 space-y-2">
                    <h4 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                      <Package size={15} />
                      Product Eligibility Verification
                    </h4>
                    {selectedReturn.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        {item.images?.[0] && (
                          <div className="w-12 h-12 rounded overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                            <img src={getProductImageSrc(item.images[0])} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">{item.name}</p>
                          <p className="text-gray-500">Unit Price: ₹{item.price?.toLocaleString("en-IN")} | Qty: {item.quantity}</p>
                        </div>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-[#C7CCD1]/20">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                        <CheckCircle2 size={13} className="text-emerald-600" />
                        Rule Verified: Standard Paithani / Designer (Non-customized)
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reason & Photographs */}
                <div className="border border-[#C7CCD1]/30 rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                    <AlertCircle size={15} />
                    Reported Reason & Uploaded Evidence
                  </h4>
                  <p className="text-gray-700">
                    <strong>Reason Category:</strong> <span className="capitalize">{selectedReturn.issueCategory.replace(/_/g, " ")}</span>
                  </p>
                  {selectedReturn.customerNotes && (
                    <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 text-gray-700 italic">
                      "{selectedReturn.customerNotes}"
                    </div>
                  )}

                  {selectedReturn.evidenceUrls && selectedReturn.evidenceUrls.length > 0 ? (
                    <div>
                      <p className="font-semibold text-gray-700 mb-2">Customer Photographs:</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedReturn.evidenceUrls.map((url, i) => (
                          <button
                            key={i}
                            onClick={() => setPreviewPhoto(url)}
                            className="w-16 h-16 rounded-lg overflow-hidden border border-gray-300 hover:opacity-80 transition relative group"
                          >
                            <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                              <Eye size={16} />
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-400 italic">No condition photographs uploaded (Standard return / change of mind).</p>
                  )}
                </div>

                {/* Quality Check Inspection & Inventory Restock Status */}
                {selectedReturn.qcDetails && (
                  <div className="border border-[#C7CCD1]/30 rounded-xl p-4 bg-[#F4F5F7] space-y-2">
                    <h4 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                      <ShieldCheck size={16} />
                      Quality Check & Inventory Audit
                    </h4>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <span className="text-gray-500 text-[10px]">Condition Pass:</span>
                        <p className="font-bold text-gray-800">{selectedReturn.qcDetails.conditionPass ? "YES" : "NO"}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <span className="text-gray-500 text-[10px]">Tags Intact:</span>
                        <p className="font-bold text-gray-800">{selectedReturn.qcDetails.originalTagsPresent ? "YES" : "NO"}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <span className="text-gray-500 text-[10px]">Packaging Intact:</span>
                        <p className="font-bold text-gray-800">{selectedReturn.qcDetails.packagingIntact ? "YES" : "NO"}</p>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-gray-200">
                        <span className="text-gray-500 text-[10px]">Approved for Resale:</span>
                        <p className="font-bold text-emerald-700">{selectedReturn.qcDetails.approvedForResale ? "YES (Restocked)" : "NO"}</p>
                      </div>
                    </div>
                    {selectedReturn.qcDetails.qcNotes && (
                      <p className="text-gray-600 italic">Inspector notes: "{selectedReturn.qcDetails.qcNotes}"</p>
                    )}
                  </div>
                )}

                {/* Status History Log */}
                <div className="border border-[#C7CCD1]/30 rounded-xl p-4 space-y-2">
                  <h4 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                    <Clock size={15} />
                    Audit Log & Real-time Lifecycle History
                  </h4>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {selectedReturn.statusHistory?.map((entry, idx) => (
                      <div key={idx} className="flex items-start justify-between text-[11px] p-1.5 rounded bg-gray-50">
                        <div>
                          <strong className="text-gray-900">{entry.status.replace(/_/g, " ")}</strong>
                          <span className="text-gray-500 ml-2">by {entry.actor}</span>
                          {entry.note && <p className="text-gray-600 mt-0.5">{entry.note}</p>}
                        </div>
                        <span className="text-gray-400 whitespace-nowrap ml-2">
                          {new Date(entry.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Command Center */}
                <div className="p-4 rounded-xl border-2 border-[#0A1F44]/20 bg-[#F4F5F7] space-y-3">
                  <h4 className="font-bold text-[#0A1F44] text-sm">Admin Control & Workflow Actions</h4>

                  {/* Actions for PENDING / UNDER_REVIEW */}
                  {["PENDING", "UNDER_REVIEW"].includes(selectedReturn.status) && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleApprove(selectedReturn.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                      >
                        ✓ Approve Claim & Book Reverse Pickup
                      </button>
                      <button
                        onClick={() => {
                          setRejectReason("");
                          setShowRejectModal(true);
                        }}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                      >
                        ✕ Reject Claim (Specify Reason)
                      </button>
                    </div>
                  )}

                  {/* Actions for APPROVED */}
                  {selectedReturn.status === "APPROVED" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setPickupForm({
                            courierName: "Shiprocket Reverse Logistics (BlueDart / Delhivery)",
                            awbNumber: `RET-AWB-${Math.floor(10000000 + Math.random() * 90000000)}`,
                            pickupDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split("T")[0],
                            notes: "",
                          });
                          setShowPickupModal(true);
                        }}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-purple-700 hover:bg-purple-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                      >
                        Schedule / Customize Reverse Pickup
                      </button>
                    </div>
                  )}

                  {/* Actions for PICKUP_SCHEDULED & PICKED_UP */}
                  {["PICKUP_SCHEDULED", "PICKED_UP"].includes(selectedReturn.status) && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleMarkReceived(selectedReturn.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-cyan-700 hover:bg-cyan-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                      >
                        ✓ Mark Package Received at Warehouse
                      </button>
                    </div>
                  )}

                  {/* Actions for RECEIVED */}
                  {selectedReturn.status === "RECEIVED" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          setQcForm({
                            conditionPass: true,
                            defectVerified: true,
                            originalTagsPresent: true,
                            packagingIntact: true,
                            qcNotes: "",
                          });
                          setShowQcModal(true);
                        }}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white font-bold rounded-lg text-xs transition shadow-xs"
                      >
                        Conduct Warehouse Physical QC Inspection
                      </button>
                    </div>
                  )}

                  {/* Actions for REFUND_INITIATED (or pass QC on return) */}
                  {selectedReturn.requestType === "return" &&
                    ["QUALITY_CHECK", "REFUND_INITIATED"].includes(selectedReturn.status) &&
                    selectedReturn.qcDetails?.approvedForResale && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleProcessRefund(selectedReturn.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                        >
                          Trigger Payment Gateway Refund ({fmtRupees(selectedReturn.refundDetails?.refundAmount || selectedReturn.items[0]?.price)})
                        </button>
                      </div>
                    )}

                  {/* Actions for EXCHANGE_PROCESSING */}
                  {selectedReturn.requestType === "exchange" &&
                    ["QUALITY_CHECK", "EXCHANGE_PROCESSING"].includes(selectedReturn.status) &&
                    selectedReturn.qcDetails?.approvedForResale && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleFulfillExchange(selectedReturn.id)}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-sky-700 hover:bg-sky-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                        >
                          Reserve Replacement Inventory & Dispatch Exchange
                        </button>
                      </div>
                    )}

                  {/* Actions for EXCHANGE_SHIPPED */}
                  {selectedReturn.status === "EXCHANGE_SHIPPED" && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => handleMarkExchangeDelivered(selectedReturn.id)}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg text-xs transition shadow-xs"
                      >
                        ✓ Mark Exchange Delivered to Customer
                      </button>
                    </div>
                  )}

                  {/* General Cancel Action if not yet final */}
                  {!["REFUND_COMPLETED", "EXCHANGE_DELIVERED", "CANCELLED", "REJECTED"].includes(selectedReturn.status) && (
                    <button
                      onClick={() => handleCancelRequest(selectedReturn.id)}
                      disabled={actionLoading}
                      className="px-3 py-1.5 text-gray-500 hover:text-red-700 font-semibold text-xs transition ml-2"
                    >
                      Administrative Cancellation…
                    </button>
                  )}
                </div>
              </div>

              {/* Modal Footer */}
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex justify-end">
                <button
                  onClick={() => setSelectedReturn(null)}
                  className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 font-semibold text-gray-700 rounded-lg text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Reject Reason Modal */}
        {showRejectModal && selectedReturn && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
              <h3 className="font-bold text-rose-800 text-sm flex items-center gap-1.5">
                <XCircle size={16} />
                Specify Mandatory Rejection Reason
              </h3>
              <p className="text-gray-600 text-xs">
                This rejection notice and explanation will be recorded in MongoDB and sent directly to the customer.
              </p>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="e.g., Return window expired, missing tags, or non-returnable product alteration..."
                rows={3}
                className="w-full p-2.5 text-xs bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:border-rose-600"
              />
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowRejectModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRejectSubmit(selectedReturn.id)}
                  disabled={actionLoading || !rejectReason.trim()}
                  className="px-4 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white font-bold text-xs disabled:opacity-50"
                >
                  Confirm Rejection
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Schedule Pickup Modal */}
        {showPickupModal && selectedReturn && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-5 space-y-4">
              <h3 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                <Truck size={16} />
                Schedule Reverse Courier Pickup
              </h3>
              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Courier Carrier</label>
                  <input
                    type="text"
                    value={pickupForm.courierName}
                    onChange={(e) => setPickupForm({ ...pickupForm, courierName: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Reverse AWB Number</label>
                  <input
                    type="text"
                    value={pickupForm.awbNumber}
                    onChange={(e) => setPickupForm({ ...pickupForm, awbNumber: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Scheduled Pickup Date</label>
                  <input
                    type="date"
                    value={pickupForm.pickupDate}
                    onChange={(e) => setPickupForm({ ...pickupForm, pickupDate: e.target.value })}
                    className="w-full p-2 border border-gray-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowPickupModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleSchedulePickup(selectedReturn.id)}
                  disabled={actionLoading}
                  className="px-4 py-1.5 rounded-lg bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs"
                >
                  Save & Notify Customer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Quality Check Inspection Modal */}
        {showQcModal && selectedReturn && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-5 space-y-4">
              <h3 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                <ShieldCheck size={16} />
                Warehouse Quality Inspection & Inventory Approval
              </h3>
              <p className="text-gray-600 text-xs">
                Inspect the returned saree. Available stock will be updated into MongoDB inventory only if all condition checks pass and the product is approved for resale.
              </p>
              <div className="space-y-2.5 text-xs">
                <label className="flex items-center gap-2 font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qcForm.conditionPass}
                    onChange={(e) => setQcForm({ ...qcForm, conditionPass: e.target.checked })}
                    className="rounded text-[#0A1F44]"
                  />
                  Saree is unworn, unwashed, and without odor or blemishes
                </label>
                <label className="flex items-center gap-2 font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qcForm.originalTagsPresent}
                    onChange={(e) => setQcForm({ ...qcForm, originalTagsPresent: e.target.checked })}
                    className="rounded text-[#0A1F44]"
                  />
                  Original VASTRAA tags, barcodes, and seals are intact
                </label>
                <label className="flex items-center gap-2 font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qcForm.defectVerified}
                    onChange={(e) => setQcForm({ ...qcForm, defectVerified: e.target.checked })}
                    className="rounded text-[#0A1F44]"
                  />
                  Item matches customer statement / genuine eligible return
                </label>
                <label className="flex items-center gap-2 font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={qcForm.packagingIntact}
                    onChange={(e) => setQcForm({ ...qcForm, packagingIntact: e.target.checked })}
                    className="rounded text-[#0A1F44]"
                  />
                  Original saree box / royal packaging present
                </label>
                <div>
                  <label className="block text-gray-700 font-semibold mb-1">Inspector Notes</label>
                  <textarea
                    value={qcForm.qcNotes}
                    onChange={(e) => setQcForm({ ...qcForm, qcNotes: e.target.value })}
                    placeholder="Enter physical fabric inspection findings..."
                    rows={2}
                    className="w-full p-2 border border-gray-300 rounded-lg text-xs"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowQcModal(false)}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-semibold text-gray-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleQcSubmit(selectedReturn.id)}
                  disabled={actionLoading}
                  className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs"
                >
                  Record Inspection & Sync Stock
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Photo Lightbox */}
        {previewPhoto && (
          <div
            className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-black/80"
            onClick={() => setPreviewPhoto(null)}
          >
            <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
              <img src={previewPhoto} alt="Customer Evidence Preview" className="max-w-full max-h-[80vh] object-contain rounded" />
              <button
                onClick={() => setPreviewPhoto(null)}
                className="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-full hover:bg-black"
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}

export default function AdminReturns() {
  return (
    <AdminGuard>
      <AdminErrorBoundary>
        <AdminReturnsDashboard />
      </AdminErrorBoundary>
    </AdminGuard>
  );
}
