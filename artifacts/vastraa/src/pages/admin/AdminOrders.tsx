import React, { useEffect, useMemo, useState } from "react";
import {
  ShoppingBag,
  Search,
  Download,
  RefreshCw,
  FileText,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Truck,
  Package,
  XCircle,
  ChevronRight,
  MapPin,
  Phone,
  Mail,
  User,
  CreditCard,
  Calendar,
  X,
  ExternalLink,
  Copy,
  Check,
  ChevronLeft,
  ChevronDown,
  RotateCcw,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import {
  AdminErrorBoundary,
  AdminErrorState,
  AdminEmptyState,
  getFriendlyErrorMessage,
} from "@/components/admin/AdminErrorHandling";
import { TableRowSkeleton } from "@/components/skeletons";
import { InvoiceDocumentsModal } from "@/components/InvoiceDocumentsModal";
import { adminHeaders } from "@/lib/adminApi";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

const NAVY = "#0D1B36";

export interface OrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  images?: string[];
  vendorId?: string;
  vendorName?: string;
  sellerId?: string;
  basePrice?: number;
  sku?: string;
}

export interface OrderAddress {
  name?: string;
  phone?: string;
  email?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  pincode?: string;
}

export interface OrderStatusHistoryEntry {
  status: string;
  timestamp: string;
  note?: string;
  courierName?: string;
  trackingNumber?: string;
  pickupToken?: string;
}

export interface AdminOrder {
  id: string;
  displayId?: string | null;
  userId: string;
  items: OrderItem[];
  address: OrderAddress | null;
  total: number;
  subtotal?: number;
  shipping?: number;
  tax?: number;
  discount?: number;
  platformFee?: number;
  codFee?: number;
  couponCode?: string | null;
  status: string;
  paymentMethod: string | null;
  paymentStatus?: string | null;
  statusHistory?: OrderStatusHistoryEntry[];
  cancelReason?: string | null;
  returnReason?: string | null;
  refundStatus?: string | null;
  awbNumber?: string | null;
  courierName?: string | null;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  isDemo?: boolean;
  isTest?: boolean;
  createdAt: string;
  updatedAt: string;
}

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "packed", label: "Packed" },
  { value: "ready_to_ship", label: "Ready to Ship" },
  { value: "dispatched", label: "Dispatched / Shipped" },
  { value: "in_transit", label: "In Transit" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "return_requested", label: "Return Requested" },
  { value: "return_approved", label: "Return Approved" },
  { value: "returned", label: "Returned" },
];

function fmtMoney(paise: number) {
  return `₹${(paise / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function statusTone(status: string): "orange" | "blue" | "indigo" | "purple" | "green" | "red" | "gray" {
  switch (status) {
    case "pending":
      return "orange";
    case "confirmed":
      return "blue";
    case "processing":
      return "orange";
    case "packed":
      return "indigo";
    case "ready_to_ship":
    case "dispatched":
    case "shipped":
    case "in_transit":
    case "out_for_delivery":
      return "purple";
    case "delivered":
    case "return_approved":
      return "green";
    case "cancelled":
    case "return_rejected":
      return "red";
    case "return_requested":
    case "returned":
      return "orange";
    default:
      return "gray";
  }
}

function StatusPill({ label }: { label: string }) {
  const tone = statusTone(label);
  const map = {
    orange: { bg: "#fffbeb", color: "#b45309", border: "#fde68a", dot: "#d97706" },
    blue: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", dot: "#2563eb" },
    indigo: { bg: "#eef2ff", color: "#4338ca", border: "#c7d2fe", dot: "#4f46e5" },
    purple: { bg: "#f5f3ff", color: "#6d28d9", border: "#ddd6fe", dot: "#7c3aed" },
    green: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", dot: "#16a34a" },
    red: { bg: "#fef2f2", color: "#b91c1c", border: "#fecaca", dot: "#dc2626" },
    gray: { bg: "#f3f4f6", color: "#4b5563", border: "#e5e7eb", dot: "#6b7280" },
  } as const;
  const s = map[tone];
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full capitalize whitespace-nowrap border"
      style={{ background: s.bg, color: s.color, borderColor: s.border }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: s.dot }} />
      {label.replace(/_/g, " ")}
    </span>
  );
}

const TABS = [
  { key: "all", label: "All Orders" },
  { key: "pending", label: "Pending & Confirmed" },
  { key: "processing", label: "Processing & Packed" },
  { key: "shipped", label: "Ready & Dispatched" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "returns", label: "Returns" },
] as const;

function OrdersContent() {
  const [orders, setOrders] = useState<AdminOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [showTestOrders, setShowTestOrders] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 10;

  const [exportLoading, setExportLoading] = useState(false);
  const [pdfExportLoading, setPdfExportLoading] = useState(false);
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);
  const [selectedOrderForInvoice, setSelectedOrderForInvoice] = useState<{ id: string; displayId?: string | null } | null>(null);

  // Order Details Modal State
  const [selectedOrder, setSelectedOrder] = useState<AdminOrder | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Status Update State
  const [newStatus, setNewStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState<string>("");
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusUpdateMessage, setStatusUpdateMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Tracking Update State
  const [isEditingTracking, setIsEditingTracking] = useState(false);
  const [trackingCourier, setTrackingCourier] = useState("");
  const [trackingAwb, setTrackingAwb] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [updatingTracking, setUpdatingTracking] = useState(false);

  // Cancel Order State
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelReasonInput, setCancelReasonInput] = useState("");
  const [submittingCancel, setSubmittingCancel] = useState(false);

  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadOrders(status?: string, includeDemoFlag = showTestOrders) {
    setLoading(true);
    setError("");
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (includeDemoFlag) params.set("includeDemo", "true");
    const qs = params.toString() ? `?${params.toString()}` : "";

    fetch(`/api/admin/orders${qs}`, {
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
        const raw: AdminOrder[] = d.orders ?? [];
        setOrders(raw);
        setPage(1);
      })
      .catch((err) => setError(getFriendlyErrorMessage(err, "Orders")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadOrders(statusFilter || undefined, showTestOrders);
  }, [adminKey, statusFilter, showTestOrders]);

  // Open detail modal with synchronized fresh order details
  async function openOrderDetail(o: AdminOrder) {
    setSelectedOrder(o);
    setIsDetailOpen(true);
    setNewStatus(o.status);
    setStatusNote("");
    setStatusUpdateMessage(null);
    setIsEditingTracking(false);
    setTrackingCourier(o.courierName || "");
    setTrackingAwb(o.trackingNumber || o.awbNumber || "");
    setTrackingUrl(o.trackingUrl || "");
    setIsCancelling(false);
    setCancelReasonInput("");

    // Fetch fresh order details from backend to ensure latest shipments & statusHistory
    try {
      const res = await fetch(`/api/admin/orders/${o.id}`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.order) {
          setSelectedOrder(data.order);
          setTrackingCourier(data.order.courierName || "");
          setTrackingAwb(data.order.trackingNumber || data.order.awbNumber || "");
          setTrackingUrl(data.order.trackingUrl || "");
        }
      }
    } catch {}
  }

  // Update order status handler
  async function handleStatusUpdate() {
    if (!selectedOrder || !newStatus) return;
    setUpdatingStatus(true);
    setStatusUpdateMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/status`, {
        method: "PATCH",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          status: newStatus,
          note: statusNote.trim() || undefined,
          courierName: trackingCourier.trim() || undefined,
          trackingNumber: trackingAwb.trim() || undefined,
          awbNumber: trackingAwb.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Failed to update status (${res.status})`);
      }

      setStatusUpdateMessage({ type: "success", text: `Order status successfully updated to ${newStatus.replace(/_/g, " ")}` });
      // Update in local state
      const updatedOrder = {
        ...selectedOrder,
        status: newStatus,
        statusHistory: [
          ...(selectedOrder.statusHistory || []),
          {
            status: newStatus,
            timestamp: new Date().toISOString(),
            note: statusNote.trim() || undefined,
            courierName: trackingCourier.trim() || undefined,
            trackingNumber: trackingAwb.trim() || undefined,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      setSelectedOrder(updatedOrder);
      setOrders((prev) => prev.map((ord) => (ord.id === selectedOrder.id ? { ...ord, ...updatedOrder } : ord)));
      setStatusNote("");
    } catch (err: any) {
      setStatusUpdateMessage({ type: "error", text: err.message || "Failed to update order status" });
    } finally {
      setUpdatingStatus(false);
    }
  }

  // Save tracking details
  async function handleSaveTracking() {
    if (!selectedOrder) return;
    setUpdatingTracking(true);
    setStatusUpdateMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/tracking`, {
        method: "PATCH",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          courierName: trackingCourier.trim() || undefined,
          trackingNumber: trackingAwb.trim() || undefined,
          awbNumber: trackingAwb.trim() || undefined,
          trackingUrl: trackingUrl.trim() || undefined,
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Failed to save tracking (${res.status})`);
      }

      setStatusUpdateMessage({ type: "success", text: "Tracking details updated successfully" });
      setIsEditingTracking(false);

      const updated = {
        ...selectedOrder,
        courierName: trackingCourier.trim() || selectedOrder.courierName,
        trackingNumber: trackingAwb.trim() || selectedOrder.trackingNumber,
        awbNumber: trackingAwb.trim() || selectedOrder.awbNumber,
        trackingUrl: trackingUrl.trim() || selectedOrder.trackingUrl,
      };
      setSelectedOrder(updated);
      setOrders((prev) => prev.map((ord) => (ord.id === selectedOrder.id ? { ...ord, ...updated } : ord)));
    } catch (err: any) {
      setStatusUpdateMessage({ type: "error", text: err.message || "Failed to update tracking info" });
    } finally {
      setUpdatingTracking(false);
    }
  }

  // Cancel order handler
  async function handleCancelOrder() {
    if (!selectedOrder) return;
    setSubmittingCancel(true);
    setStatusUpdateMessage(null);
    try {
      const res = await fetch(`/api/admin/orders/${selectedOrder.id}/cancel`, {
        method: "POST",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          reason: cancelReasonInput.trim() || "Cancelled by admin",
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(body.error || `Failed to cancel order (${res.status})`);
      }

      setStatusUpdateMessage({ type: "success", text: "Order cancelled successfully and inventory restored." });
      setIsCancelling(false);
      setCancelReasonInput("");

      const updated = {
        ...selectedOrder,
        status: "cancelled",
        cancelReason: cancelReasonInput.trim() || "Cancelled by admin",
        statusHistory: [
          ...(selectedOrder.statusHistory || []),
          {
            status: "cancelled",
            timestamp: new Date().toISOString(),
            note: cancelReasonInput.trim() || "Cancelled by admin",
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      setSelectedOrder(updated);
      setOrders((prev) => prev.map((ord) => (ord.id === selectedOrder.id ? { ...ord, ...updated } : ord)));
    } catch (err: any) {
      setStatusUpdateMessage({ type: "error", text: err.message || "Failed to cancel order" });
    } finally {
      setSubmittingCancel(false);
    }
  }

  function copyToClipboard(text: string, id: string) {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  }

  async function downloadAdminInvoice(orderId: string, displayId?: string | null) {
    setDownloadingInvoiceId(orderId);
    try {
      const r = await fetch(`/api/orders/${orderId}/invoice`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Failed to download invoice (${r.status})`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Invoice-INV-${displayId || orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Failed to download invoice");
    } finally {
      setDownloadingInvoiceId(null);
    }
  }

  // Calculate Metrics
  const metrics = useMemo(() => {
    const totalCount = orders.length;
    const activeOrders = orders.filter((o) => o.status !== "cancelled");
    const totalVolume = activeOrders.reduce((sum, o) => sum + (o.total || 0), 0);
    const pendingCount = orders.filter((o) => ["pending", "confirmed", "processing", "packed"].includes(o.status)).length;
    const shippedCount = orders.filter((o) =>
      ["ready_to_ship", "dispatched", "shipped", "in_transit", "out_for_delivery"].includes(o.status)
    ).length;
    const deliveredCount = orders.filter((o) => o.status === "delivered").length;
    const returnsCount = orders.filter((o) => o.status.startsWith("return") || o.status === "returned").length;

    return {
      totalCount,
      totalVolume,
      pendingCount,
      shippedCount,
      deliveredCount,
      returnsCount,
    };
  }, [orders]);

  // Tab filtering logic
  const tabFiltered = useMemo(() => {
    if (activeTab === "all") return orders;
    if (activeTab === "pending") {
      return orders.filter((o) => o.status === "pending" || o.status === "confirmed");
    }
    if (activeTab === "processing") {
      return orders.filter((o) => o.status === "processing" || o.status === "packed");
    }
    if (activeTab === "shipped") {
      return orders.filter((o) =>
        ["ready_to_ship", "dispatched", "shipped", "in_transit", "out_for_delivery"].includes(o.status)
      );
    }
    if (activeTab === "delivered") {
      return orders.filter((o) => o.status === "delivered");
    }
    if (activeTab === "cancelled") {
      return orders.filter((o) => o.status === "cancelled");
    }
    if (activeTab === "returns") {
      return orders.filter((o) => o.status.startsWith("return") || o.status === "returned");
    }
    return orders;
  }, [orders, activeTab]);

  // Search filtering
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabFiltered;
    return tabFiltered.filter((o) => {
      if (o.id.toLowerCase().includes(q)) return true;
      if (o.displayId && o.displayId.toLowerCase().includes(q)) return true;
      const customerName = o.address?.name ?? "";
      if (customerName.toLowerCase().includes(q)) return true;
      const customerEmail = o.address?.email ?? (o as any).customerEmail ?? "";
      if (customerEmail.toLowerCase().includes(q)) return true;
      const customerPhone = o.address?.phone ?? "";
      if (customerPhone.toLowerCase().includes(q)) return true;
      if (o.status.replace(/_/g, " ").includes(q)) return true;
      if (o.paymentMethod && o.paymentMethod.toLowerCase().includes(q)) return true;
      if (o.awbNumber && o.awbNumber.toLowerCase().includes(q)) return true;
      if (o.trackingNumber && o.trackingNumber.toLowerCase().includes(q)) return true;
      if (o.courierName && o.courierName.toLowerCase().includes(q)) return true;
      if (o.items && o.items.some((item) => item.name?.toLowerCase().includes(q))) return true;
      return false;
    });
  }, [tabFiltered, search]);

  // Paginated records
  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const paginatedOrders = useMemo(() => {
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page]);

  async function exportPDF() {
    setPdfExportLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      if (showTestOrders) params.set("includeDemo", "true");
      const qs = params.toString() ? `?${params.toString()}` : "";
      const r = await fetch(`/api/admin/orders/export.pdf${qs}`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${r.status})`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = statusFilter || activeTab || "all";
      a.download = `orders-${suffix}-${new Date().toISOString().slice(0, 10)}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "PDF export failed");
    } finally {
      setPdfExportLoading(false);
    }
  }

  async function exportCSV() {
    setExportLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      if (showTestOrders) params.set("includeDemo", "true");
      const qs = params.toString() ? `?${params.toString()}` : "";
      const r = await fetch(`/api/admin/orders/export.csv${qs}`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error || `Export failed (${r.status})`);
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const suffix = statusFilter || activeTab || "all";
      a.download = `orders-${suffix}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Export failed");
    } finally {
      setExportLoading(false);
    }
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-serif font-bold flex items-center gap-2" style={{ color: NAVY }}>
              <ShoppingBag size={22} className="text-[#0D1B36]" /> Orders
            </h1>
            <span className="text-[11px] font-sans font-medium px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Realtime
            </span>
            {showTestOrders && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                Demo & Test Orders Included
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-1">
            Manage customer orders, track multi-seller shipments, update fulfillment statuses, and generate tax invoices.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <label className="inline-flex items-center gap-2 text-xs text-gray-600 bg-white border border-gray-200 px-3 py-2 rounded-xl shadow-sm cursor-pointer select-none hover:bg-gray-50">
            <input
              type="checkbox"
              checked={showTestOrders}
              onChange={(e) => setShowTestOrders(e.target.checked)}
              className="rounded border-gray-300 text-[#0D1B36] focus:ring-0"
            />
            <span>Include Test Orders</span>
          </label>
          <button
            onClick={() => loadOrders(statusFilter || undefined, showTestOrders)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50 min-h-[38px]"
            style={{ color: NAVY }}
            title="Refresh Orders"
            aria-label="Refresh orders"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-[#0D1B36]" : "text-gray-500"} /> Refresh
          </button>
          <button
            onClick={exportCSV}
            disabled={exportLoading || pdfExportLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
            style={{ color: NAVY }}
            title="Export all matching orders to CSV"
          >
            <Download size={13} /> {exportLoading ? "Exporting…" : "Export CSV"}
          </button>
          <button
            onClick={exportPDF}
            disabled={pdfExportLoading || exportLoading}
            className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed min-h-[38px]"
            style={{ color: NAVY }}
            title="Export all matching orders to PDF"
          >
            <FileText size={13} /> {pdfExportLoading ? "Exporting…" : "Export PDF"}
          </button>
        </div>
      </div>

      {/* KPI Metrics Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm hover:border-[#0D1B36]/30 transition-all">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Total Orders</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-serif" style={{ color: NAVY }}>
            {metrics.totalCount}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            Volume: <span className="font-semibold text-gray-700">{fmtMoney(metrics.totalVolume)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm hover:border-amber-300 transition-all">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Pending & Processing</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Clock size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-serif text-amber-700">{metrics.pendingCount}</div>
          <div className="text-xs text-amber-600 mt-1">Requires seller fulfillment</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm hover:border-purple-300 transition-all">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Ready & Dispatched</span>
            <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
              <Truck size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-serif text-purple-700">{metrics.shippedCount}</div>
          <div className="text-xs text-purple-600 mt-1">In transit with courier</div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200/80 p-4 shadow-sm hover:border-emerald-300 transition-all">
          <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
            <span>Delivered Orders</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold font-serif text-emerald-700">{metrics.deliveredCount}</div>
          <div className="text-xs text-emerald-600 mt-1">Completed successfully</div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3 flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")} className="text-red-500 hover:text-red-700 text-xs font-bold">
            Dismiss
          </button>
        </div>
      )}

      {/* Tabs & Search Filter Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-4">
        {/* Horizontal Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none border-b border-gray-100">
          {TABS.map((tab) => {
            const isSelected = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg whitespace-nowrap transition-all ${
                  isSelected
                    ? "bg-[#0D1B36] text-white shadow-sm"
                    : "text-gray-600 hover:text-[#0D1B36] hover:bg-gray-100"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search and Secondary Filter Row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by order ID, customer name, phone, email, product, or AWB tracking…"
              className="w-full pl-10 pr-4 py-2 text-sm rounded-xl border border-gray-200 outline-none focus:border-[#0D1B36] focus:ring-1 focus:ring-[#0D1B36] bg-gray-50/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="text-sm rounded-xl border border-gray-200 outline-none focus:border-[#0D1B36] bg-white px-3 py-2 min-w-[170px]"
              style={{ color: NAVY }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results summary */}
        {!loading && (
          <div className="flex items-center justify-between text-xs text-gray-500 pt-1">
            <div>
              Showing <span className="font-semibold text-gray-800">{filtered.length}</span>{" "}
              {filtered.length === 1 ? "order" : "orders"}
              {search.trim() || statusFilter || activeTab !== "all" ? " matching current filters" : ""}
            </div>
            {filtered.length > perPage && (
              <div>
                Page {page} of {totalPages}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Orders Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {error && (
          <div className="p-6">
            <AdminErrorState
              title="Unable to load orders"
              message={error}
              onRetry={() => loadOrders(statusFilter || undefined, showTestOrders)}
              compact
            />
          </div>
        )}

        {!loading && !error && filtered.length === 0 ? (
          <div className="p-8">
            <AdminEmptyState
              title="No orders found"
              message={
                search.trim() || statusFilter || activeTab !== "all"
                  ? "No customer orders match your active search filters."
                  : "No customer orders have been placed yet."
              }
            />
          </div>
        ) : (
          <div className="overflow-x-auto scroll-touch scrollbar-thin">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="px-5 py-3.5 text-left whitespace-nowrap">Order ID</th>
                  <th className="px-5 py-3.5 text-left whitespace-nowrap">Customer</th>
                  <th className="px-5 py-3.5 text-left">Items</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap">Total</th>
                  <th className="px-5 py-3.5 text-left whitespace-nowrap">Status</th>
                  <th className="px-5 py-3.5 text-left whitespace-nowrap">Payment</th>
                  <th className="px-5 py-3.5 text-left whitespace-nowrap">Date</th>
                  <th className="px-5 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <TableRowSkeleton columns={8} rows={8} />
                ) : (
                  paginatedOrders.map((o) => {
                    const firstItem = o.items?.[0];
                    const firstImage = firstItem?.images?.[0] ? getProductImageSrc(firstItem.images[0]) : null;
                    const totalQty = (o.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

                    return (
                      <tr
                        key={o.id}
                        className="hover:bg-blue-50/30 transition-colors cursor-pointer group"
                        onClick={() => openOrderDetail(o)}
                      >
                        {/* Order ID */}
                        <td className="px-5 py-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-gray-700">
                            <span>#{o.displayId ?? o.id}</span>
                            <button
                              type="button"
                              onClick={() => copyToClipboard(o.displayId ?? o.id, o.id)}
                              className="text-gray-400 hover:text-gray-700 p-0.5 rounded transition-colors"
                              title="Copy Order ID"
                            >
                              {copiedId === o.id ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                            </button>
                          </div>
                          {(o.isDemo || o.isTest) && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.2 text-[9px] font-semibold rounded bg-amber-100 text-amber-800">
                              TEST
                            </span>
                          )}
                        </td>

                        {/* Customer */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <div className="text-sm font-semibold" style={{ color: NAVY }}>
                            {o.address?.name ?? <span className="text-gray-400 italic">Guest Customer</span>}
                          </div>
                          {o.address?.phone && <div className="text-xs text-gray-500">{o.address.phone}</div>}
                          {o.address?.city && (
                            <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-0.5">
                              <MapPin size={10} /> {o.address.city}, {o.address.state || ""}
                            </div>
                          )}
                        </td>

                        {/* Items */}
                        <td className="px-5 py-3.5 max-w-[260px]">
                          <div className="flex items-center gap-2.5">
                            {firstImage ? (
                              <img
                                src={firstImage}
                                alt={firstItem?.name || "Product"}
                                onError={replaceProductImageWithFallback}
                                className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200 shrink-0">
                                <Package size={16} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate" style={{ color: NAVY }}>
                                {firstItem?.name ?? "No items"}
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                                <span>
                                  {totalQty} {totalQty === 1 ? "item" : "items"}
                                </span>
                                {o.items && o.items.length > 1 && (
                                  <span className="text-[11px] bg-gray-100 px-1.5 py-0.2 rounded font-medium text-gray-600">
                                    +{o.items.length - 1} more
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Total */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="font-semibold text-sm" style={{ color: NAVY }}>
                            {fmtMoney(o.total)}
                          </div>
                          {o.paymentStatus && (
                            <span
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0.2 rounded inline-block mt-0.5 ${
                                o.paymentStatus === "paid"
                                  ? "bg-emerald-50 text-emerald-700"
                                  : o.paymentStatus === "unpaid"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {o.paymentStatus}
                            </span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <StatusPill label={o.status} />
                        </td>

                        {/* Payment Method */}
                        <td className="px-5 py-3.5 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs text-gray-600 bg-gray-50 border border-gray-200/80 px-2 py-0.5 rounded-lg capitalize">
                            <CreditCard size={11} className="text-gray-400" />
                            {o.paymentMethod ? o.paymentMethod.replace(/_/g, " ") : "—"}
                          </span>
                        </td>

                        {/* Date */}
                        <td className="px-5 py-3.5 whitespace-nowrap text-xs text-gray-500">
                          {formatDate(o.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="inline-flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => openOrderDetail(o)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-[#0D1B36] hover:text-white transition-colors"
                              title="View & manage complete order details"
                            >
                              <Eye size={12} /> View
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadAdminInvoice(o.id, o.displayId)}
                              disabled={downloadingInvoiceId === o.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                              title="Download official Tax Invoice"
                            >
                              <Download size={11} className={downloadingInvoiceId === o.id ? "animate-bounce" : ""} />
                              {downloadingInvoiceId === o.id ? "…" : "Invoice"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination controls */}
        {!loading && filtered.length > perPage && (
          <div className="flex items-center justify-between px-6 py-3.5 border-t border-gray-100 bg-gray-50/50">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={13} /> Previous
            </button>
            <span className="text-xs text-gray-500 font-medium">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next <ChevronRight size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Comprehensive Order Details Modal / Drawer */}
      {isDetailOpen && selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200 overflow-y-auto">
          <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-gray-200 overflow-hidden my-auto max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-[#0D1B36] text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center text-white">
                  <ShoppingBag size={18} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold font-serif">Order #{selectedOrder.displayId ?? selectedOrder.id}</h2>
                    <StatusPill label={selectedOrder.status} />
                    {selectedOrder.paymentStatus && (
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-white/20 text-white">
                        {selectedOrder.paymentStatus}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-300 mt-0.5">Placed on {formatDate(selectedOrder.createdAt)}</p>
                </div>
              </div>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="text-gray-300 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
                title="Close"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {statusUpdateMessage && (
                <div
                  className={`p-3.5 rounded-xl text-sm flex items-center justify-between border ${
                    statusUpdateMessage.type === "success"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                      : "bg-red-50 text-red-800 border-red-200"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {statusUpdateMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                    <span>{statusUpdateMessage.text}</span>
                  </div>
                  <button
                    onClick={() => setStatusUpdateMessage(null)}
                    className="text-xs font-bold text-gray-500 hover:text-gray-700"
                  >
                    ×
                  </button>
                </div>
              )}

              {/* Status Update Quick Bar */}
              <div className="bg-blue-50/50 border border-blue-200/80 rounded-xl p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                      <Clock size={14} className="text-blue-700" /> Advance Order Status
                    </h3>
                    <p className="text-xs text-blue-700/80 mt-0.5">
                      Current: <strong className="capitalize">{selectedOrder.status.replace(/_/g, " ")}</strong>
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <select
                      value={newStatus}
                      onChange={(e) => setNewStatus(e.target.value)}
                      className="text-xs font-semibold px-3 py-2 rounded-lg border border-blue-200 bg-white shadow-xs outline-none focus:border-[#0D1B36]"
                    >
                      <option value="confirmed">Confirmed</option>
                      <option value="processing">Processing</option>
                      <option value="packed">Packed</option>
                      <option value="ready_to_ship">Ready to Ship</option>
                      <option value="dispatched">Dispatched / Shipped</option>
                      <option value="in_transit">In Transit</option>
                      <option value="out_for_delivery">Out for Delivery</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>

                    <button
                      onClick={handleStatusUpdate}
                      disabled={updatingStatus || newStatus === selectedOrder.status}
                      className="px-4 py-2 bg-[#0D1B36] text-white text-xs font-semibold rounded-lg shadow-sm hover:bg-[#0A1F44] transition-colors disabled:opacity-40"
                    >
                      {updatingStatus ? "Updating…" : "Apply Status"}
                    </button>

                    {selectedOrder.status !== "cancelled" && (
                      <button
                        onClick={() => setIsCancelling(!isCancelling)}
                        className="px-3 py-2 border border-red-200 text-red-700 bg-white hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors"
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>
                </div>

                {/* Optional Status Update Note Input */}
                {newStatus !== selectedOrder.status && (
                  <div className="mt-3 pt-3 border-t border-blue-100 flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={statusNote}
                      onChange={(e) => setStatusNote(e.target.value)}
                      placeholder="Optional update note (e.g. Courier assigned, packed by warehouse team)"
                      className="flex-1 text-xs px-3 py-1.5 rounded-lg border border-blue-200 bg-white outline-none"
                    />
                  </div>
                )}

                {/* Cancel Confirmation Drawer */}
                {isCancelling && (
                  <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
                    <p className="text-xs font-semibold text-red-800">
                      Are you sure you want to cancel this order? Product inventory will automatically be restored.
                    </p>
                    <input
                      type="text"
                      value={cancelReasonInput}
                      onChange={(e) => setCancelReasonInput(e.target.value)}
                      placeholder="Reason for cancellation (e.g. Customer requested, Out of stock)"
                      className="w-full text-xs px-3 py-2 rounded-lg border border-red-300 bg-white outline-none"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={handleCancelOrder}
                        disabled={submittingCancel}
                        className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {submittingCancel ? "Cancelling…" : "Confirm Cancellation"}
                      </button>
                      <button
                        onClick={() => setIsCancelling(false)}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Customer & Shipping Details Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Customer Details */}
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <User size={13} className="text-gray-400" /> Customer Information
                  </h4>
                  <div className="text-sm font-semibold text-gray-800">{selectedOrder.address?.name || "Guest Customer"}</div>
                  {selectedOrder.address?.phone && (
                    <div className="text-xs text-gray-600 flex items-center gap-1.5">
                      <Phone size={12} className="text-gray-400" /> {selectedOrder.address.phone}
                    </div>
                  )}
                  {(selectedOrder.address?.email || (selectedOrder as any).customerEmail) && (
                    <div className="text-xs text-gray-600 flex items-center gap-1.5">
                      <Mail size={12} className="text-gray-400" />{" "}
                      {selectedOrder.address?.email || (selectedOrder as any).customerEmail}
                    </div>
                  )}
                  <div className="text-[11px] text-gray-400 font-mono mt-1">User ID: {selectedOrder.userId}</div>
                </div>

                {/* Delivery Address */}
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <MapPin size={13} className="text-gray-400" /> Delivery Address
                  </h4>
                  {selectedOrder.address ? (
                    <div className="text-xs text-gray-700 leading-relaxed">
                      <div>{selectedOrder.address.line1}</div>
                      {selectedOrder.address.line2 && <div>{selectedOrder.address.line2}</div>}
                      <div className="font-medium">
                        {selectedOrder.address.city}, {selectedOrder.address.state} - {selectedOrder.address.pincode}
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400 italic">No delivery address provided</div>
                  )}
                </div>

                {/* Payment & Financials */}
                <div className="bg-gray-50/70 border border-gray-200 rounded-xl p-4 space-y-1.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                    <CreditCard size={13} className="text-gray-400" /> Payment & Billing
                  </h4>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Method:</span>
                    <span className="font-semibold text-gray-800 uppercase">{selectedOrder.paymentMethod || "COD"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-500">Status:</span>
                    <span className="font-semibold text-gray-800 capitalize">{selectedOrder.paymentStatus || "Unpaid"}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-200">
                    <span className="font-semibold text-gray-700">Grand Total:</span>
                    <span className="font-bold text-sm" style={{ color: NAVY }}>
                      {fmtMoney(selectedOrder.total)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Shipping & Logistics Tracking Card */}
              <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                    <Truck size={14} className="text-gray-500" /> Logistics & Shipping Information
                  </h4>
                  <button
                    onClick={() => setIsEditingTracking(!isEditingTracking)}
                    className="text-xs text-[#0D1B36] font-semibold hover:underline"
                  >
                    {isEditingTracking ? "Cancel" : selectedOrder.trackingNumber ? "Edit Tracking" : "+ Add Tracking Info"}
                  </button>
                </div>

                {!isEditingTracking ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-gray-50 p-2.5 rounded-lg">
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Courier Partner</span>
                      <span className="font-medium text-gray-800 mt-0.5 block">{selectedOrder.courierName || "Not assigned"}</span>
                    </div>
                    <div className="bg-gray-50 p-2.5 rounded-lg">
                      <span className="text-gray-400 block text-[10px] uppercase font-semibold">Tracking / AWB Number</span>
                      <span className="font-mono font-medium text-gray-800 mt-0.5 block">
                        {selectedOrder.trackingNumber || selectedOrder.awbNumber || "Not available"}
                      </span>
                    </div>
                    <div className="bg-gray-50 p-2.5 rounded-lg flex items-center justify-between">
                      <div>
                        <span className="text-gray-400 block text-[10px] uppercase font-semibold">Tracking URL</span>
                        <span className="text-gray-600 truncate block max-w-[150px]">
                          {selectedOrder.trackingUrl ? "Active link" : "Not configured"}
                        </span>
                      </div>
                      {selectedOrder.trackingUrl && (
                        <a
                          href={selectedOrder.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-blue-600 hover:text-blue-800"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-gray-50 rounded-xl space-y-3 border border-gray-200">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-semibold text-gray-600 block mb-1">Courier Partner</label>
                        <input
                          type="text"
                          value={trackingCourier}
                          onChange={(e) => setTrackingCourier(e.target.value)}
                          placeholder="e.g. Delhivery, BlueDart, DTDC"
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-600 block mb-1">AWB / Tracking Number</label>
                        <input
                          type="text"
                          value={trackingAwb}
                          onChange={(e) => setTrackingAwb(e.target.value)}
                          placeholder="e.g. SR-DEL-10293848"
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-semibold text-gray-600 block mb-1">Tracking Link URL</label>
                        <input
                          type="text"
                          value={trackingUrl}
                          onChange={(e) => setTrackingUrl(e.target.value)}
                          placeholder="https://track.courier.com/..."
                          className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-300 bg-white outline-none"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => setIsEditingTracking(false)}
                        className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-800"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveTracking}
                        disabled={updatingTracking}
                        className="px-3.5 py-1.5 bg-[#0D1B36] text-white text-xs font-semibold rounded-lg hover:bg-[#0A1F44] disabled:opacity-50"
                      >
                        {updatingTracking ? "Saving…" : "Save Tracking Info"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Ordered Items Table */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                  <Package size={14} className="text-gray-500" /> Items in Order ({selectedOrder.items?.length || 0})
                </h4>
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-gray-50 border-b border-gray-200 text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-4 py-2.5">Product</th>
                        <th className="px-4 py-2.5">Seller / Vendor</th>
                        <th className="px-4 py-2.5 text-center">Qty</th>
                        <th className="px-4 py-2.5 text-right">Price</th>
                        <th className="px-4 py-2.5 text-right">Subtotal</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(selectedOrder.items || []).map((item, idx) => {
                        const img = item.images?.[0] ? getProductImageSrc(item.images[0]) : null;
                        return (
                          <tr key={idx} className="hover:bg-gray-50/50">
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                {img ? (
                                  <img
                                    src={img}
                                    alt={item.name}
                                    onError={replaceProductImageWithFallback}
                                    className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400 border border-gray-200 shrink-0">
                                    <Package size={16} />
                                  </div>
                                )}
                                <div>
                                  <div className="font-semibold text-gray-800 text-xs">{item.name}</div>
                                  <div className="text-[10px] text-gray-400 font-mono">ID: {item.productId}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {item.vendorName || item.vendorId || item.sellerId || "Direct Platform"}
                            </td>
                            <td className="px-4 py-3 text-center font-semibold text-gray-700">{item.quantity}</td>
                            <td className="px-4 py-3 text-right text-gray-600">{fmtMoney(item.price)}</td>
                            <td className="px-4 py-3 text-right font-bold text-gray-800">
                              {fmtMoney((item.price || 0) * (item.quantity || 1))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Order Status History Timeline */}
              {selectedOrder.statusHistory && selectedOrder.statusHistory.length > 0 && (
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600 flex items-center gap-1.5">
                    <Calendar size={14} className="text-gray-500" /> Fulfillment Timeline & Status History
                  </h4>
                  <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/40 space-y-3">
                    {selectedOrder.statusHistory.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#0D1B36] mt-1 shrink-0 ring-4 ring-blue-50" />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-800 capitalize">{step.status.replace(/_/g, " ")}</span>
                            <span className="text-[11px] text-gray-400">{formatDate(step.timestamp)}</span>
                          </div>
                          {step.note && <p className="text-xs text-gray-600 mt-0.5">{step.note}</p>}
                          {step.courierName && (
                            <div className="text-[11px] text-gray-500 font-medium mt-0.5">
                              Courier: {step.courierName} {step.trackingNumber ? `(AWB: ${step.trackingNumber})` : ""}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-gray-50 border-t border-gray-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadAdminInvoice(selectedOrder.id, selectedOrder.displayId)}
                  disabled={downloadingInvoiceId === selectedOrder.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-50"
                >
                  <Download size={13} className={downloadingInvoiceId === selectedOrder.id ? "animate-bounce" : ""} />
                  {downloadingInvoiceId === selectedOrder.id ? "Downloading…" : "Download Tax Invoice"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrderForInvoice({ id: selectedOrder.id, displayId: selectedOrder.displayId });
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Eye size={13} /> View All Invoices & Credit Notes
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsDetailOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 text-xs font-semibold rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice Documents Modal */}
      <InvoiceDocumentsModal
        orderId={selectedOrderForInvoice?.id || null}
        displayId={selectedOrderForInvoice?.displayId}
        isOpen={Boolean(selectedOrderForInvoice)}
        onClose={() => setSelectedOrderForInvoice(null)}
        isAdmin={true}
      />
    </div>
  );
}

export default function AdminOrders() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminErrorBoundary sectionName="Orders">
          <OrdersContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
