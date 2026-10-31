import React, { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Truck, Check, X, AlertCircle, ThumbsUp, ThumbsDown, Clock,
  Package, FileText, Printer, ShieldCheck, RefreshCw, Calendar, CheckSquare,
  Sparkles, Gift, MapPin, DollarSign, ExternalLink, Download
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { OrderTrackingTimeline } from "@/components/OrderTrackingTimeline";
import { getApiUrl, apiFetch } from "@/lib/api";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const IVORY = "#F4F5F7";

function statusColors(status: string) {
  switch (status) {
    case "confirmed": return { bg: "#EFF6FF", text: "#1D4ED8" };
    case "processing": return { bg: "#FFF7ED", text: "#C2410C" };
    case "packed": return { bg: "#F0FDF4", text: "#15803D" };
    case "ready_to_ship": return { bg: "#ECFDF5", text: "#047857" };
    case "shipped": return { bg: "#F3E8FF", text: "#7E22CE" };
    case "in_transit": return { bg: "#F5F3FF", text: "#6D28D9" };
    case "out_for_delivery": return { bg: "#FFFBEB", text: "#B45309" };
    case "delivered": return { bg: "#DCFCE7", text: "#166534" };
    case "return_requested": return { bg: "#FEF3C7", text: "#B45309" };
    case "return_approved": return { bg: "#E0E7FF", text: "#3730A3" };
    case "returned": return { bg: "#E0F2FE", text: "#0369A1" };
    case "cancelled": return { bg: "#FEE2E2", text: "#991B1B" };
    default: return { bg: "#F3F4F6", text: "#374151" };
  }
}

function statusLabel(s: string) {
  return {
    confirmed: "Confirmed",
    processing: "Processing",
    packed: "Packed",
    ready_to_ship: "Ready to Ship",
    shipped: "Shipped",
    in_transit: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    return_requested: "Return Requested",
    return_approved: "Return Approved",
    return_rejected: "Return Rejected",
    returned: "Returned & Refunded",
    cancelled: "Cancelled",
  }[s] ?? s;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface OrderDetail {
  id: string;
  displayId?: string | null;
  createdAt: string;
  updatedAt?: string;
  status: string;
  statusHistory: any[];
  shippingCity: string;
  shippingState: string;
  deliveryMethod: string;
  paymentMethod: string;
  vendorItems: { productId: string; name: string; price: number; basePrice?: number; quantity: number; images: string[] }[];
  vendorTotal: number;
  vendorAcceptanceStatus: "accepted" | "rejected" | "pending";
  vendorPackagingChecklist?: Record<string, any>;
  vendorReturnResponses?: Record<string, any>;
  vendorReturnVerifications?: Record<string, any>;
  returnReason?: any;
}

export default function SellerOrderDetail() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [courierName, setCourierName] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState("");
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  const [accepting, setAccepting] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [acceptRejectError, setAcceptRejectError] = useState("");

  // Packaging Checklist state
  const [qualityInspected, setQualityInspected] = useState(true);
  const [fabricInspected, setFabricInspected] = useState(true);
  const [damageChecked, setDamageChecked] = useState(true);
  const [foldedAndPacked, setFoldedAndPacked] = useState(true);
  const [authenticityVerified, setAuthenticityVerified] = useState(true);
  const [brandedBoxUsed, setBrandedBoxUsed] = useState(true);
  const [wrappingPaperUsed, setWrappingPaperUsed] = useState(true);
  const [careInstructionsIncluded, setCareInstructionsIncluded] = useState(true);
  const [thankYouCardIncluded, setThankYouCardIncluded] = useState(true);
  const [authenticityCardIncluded, setAuthenticityCardIncluded] = useState(true);
  const [savingChecklist, setSavingChecklist] = useState(false);
  const [checklistSaved, setChecklistSaved] = useState(false);

  // Documents & Pickup state
  const [showDocModal, setShowDocModal] = useState(false);
  const [docData, setDocData] = useState<any>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [docType, setDocType] = useState<"label" | "awb" | "invoice" | "slip">("label");

  const [showPickupModal, setShowPickupModal] = useState(false);
  const [pickupDate, setPickupDate] = useState(new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [pickupSlot, setPickupSlot] = useState("Morning (10 AM - 1 PM)");
  const [selectedCourier, setSelectedCourier] = useState("Shiprocket Express (BlueDart)");
  const [schedulingPickup, setSchedulingPickup] = useState(false);

  // Shiprocket integration state
  const [shipmentData, setShipmentData] = useState<any>(null);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [loadingCouriers, setLoadingCouriers] = useState(false);
  const [selectedCourierId, setSelectedCourierId] = useState<number | string>("");
  const [couriersError, setCouriersError] = useState("");
  const [dispatchMethod, setDispatchMethod] = useState<"shiprocket" | "manual">("shiprocket");

  // Returns management state
  const [approvingReturn, setApprovingReturn] = useState(false);
  const [rejectingReturn, setRejectingReturn] = useState(false);
  const [returnRejectReason, setReturnRejectReason] = useState("");
  const [showReturnRejectForm, setShowReturnRejectForm] = useState(false);
  const [showVerifyReturnModal, setShowVerifyReturnModal] = useState(false);
  const [verifyCondition, setVerifyCondition] = useState(true);
  const [verifyNoDamage, setVerifyNoDamage] = useState(true);
  const [verifyPackaging, setVerifyPackaging] = useState(true);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [verifyingReturn, setVerifyingReturn] = useState(false);

  async function fetchShipment() {
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/shipment`);
      if (res.ok) {
        const data = await res.json();
        if (data.shipment) {
          setShipmentData(data.shipment);
        }
      }
    } catch {
      // ignore
    }
  }

  async function fetchCouriers() {
    setLoadingCouriers(true);
    setCouriersError("");
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/couriers`);
      const data = await res.json();
      if (res.ok && data.success) {
        setCouriers(data.couriers || []);
        if (data.couriers && data.couriers.length > 0) {
          setSelectedCourierId(data.couriers[0].courierCompanyId);
        }
      } else {
        setCouriersError(data.error || "Unable to fetch Shiprocket courier serviceability");
      }
    } catch {
      setCouriersError("Failed to fetch available couriers");
    } finally {
      setLoadingCouriers(false);
    }
  }

  async function fetchOrder() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}`);
      if (res.status === 404 || res.status === 403) {
        setError("Order not found or you don't have permission to view it.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOrder(data);
      fetchShipment();
      if (data.vendorAcceptanceStatus === "accepted" && !["dispatched", "out_for_delivery", "delivered", "cancelled"].includes(data.status)) {
        fetchCouriers();
      }
    } catch {
      setError("Failed to load order. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchOrder(); }, [orderId]);

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if (["order:status_changed", "order:cancelled", "order:tracking_updated"].includes(detail.name)) {
        fetchOrder();
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
  }, [orderId]);

  async function handleAccept() {
    setAccepting(true);
    setAcceptRejectError("");
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) { setAcceptRejectError(data.error ?? "Failed to accept order"); return; }
      await fetchOrder();
    } catch {
      setAcceptRejectError("Failed to accept order. Please try again.");
    } finally {
      setAccepting(false);
    }
  }

  async function handleReject(e: React.FormEvent) {
    e.preventDefault();
    if (!rejectionReason.trim()) { setAcceptRejectError("Please provide a reason for rejection"); return; }
    setRejecting(true);
    setAcceptRejectError("");
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAcceptRejectError(data.error ?? "Failed to reject order"); return; }
      setShowRejectForm(false);
      setRejectionReason("");
      await fetchOrder();
    } catch {
      setAcceptRejectError("Failed to reject order. Please try again.");
    } finally {
      setRejecting(false);
    }
  }

  async function handleSaveChecklist() {
    setSavingChecklist(true);
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/packaging-checklist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          qualityInspected,
          fabricInspected,
          damageChecked,
          foldedAndPacked,
          authenticityVerified,
          brandedBoxUsed,
          wrappingPaperUsed,
          careInstructionsIncluded,
          thankYouCardIncluded,
          authenticityCardIncluded,
        }),
      });
      if (res.ok) {
        setChecklistSaved(true);
        setTimeout(() => setChecklistSaved(false), 4000);
        await fetchOrder();
      }
    } catch {
      // ignore
    } finally {
      setSavingChecklist(false);
    }
  }

  async function fetchDocuments(type: "label" | "awb" | "invoice" | "slip") {
    if (type === "label" && shipmentData?.labelUrl) {
      window.open(shipmentData.labelUrl, "_blank");
      return;
    }
    setDocType(type);
    setLoadingDocs(true);
    setShowDocModal(true);
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/documents`);
      if (res.ok) {
        const data = await res.json();
        setDocData(data.documents);
      }
    } catch {
      // ignore
    } finally {
      setLoadingDocs(false);
    }
  }

  async function handleShiprocketDispatch() {
    if (!selectedCourierId && couriers.length > 0) {
      setDispatchError("Please select a courier partner");
      return;
    }
    setDispatching(true);
    setDispatchError("");
    try {
      const selectedCourierObj = couriers.find(c => String(c.courierCompanyId) === String(selectedCourierId));
      const res = await apiFetch(`/api/seller/orders/${orderId}/dispatch-shiprocket`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          courierPartnerId: selectedCourierId || undefined,
          courierName: selectedCourierObj?.courierName || "Shiprocket Express",
          weightKg: 0.5,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDispatchError(data.error ?? "Failed to dispatch via Shiprocket");
        return;
      }
      setDispatchSuccess(true);
      if (data.shipment) {
        setShipmentData(data.shipment);
      }
      await fetchOrder();
    } catch {
      setDispatchError("Network error while dispatching via Shiprocket. Please try again.");
    } finally {
      setDispatching(false);
    }
  }

  async function handleSchedulePickup(e: React.FormEvent) {
    e.preventDefault();
    setSchedulingPickup(true);
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/schedule-pickup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pickupDate, pickupTimeSlot: pickupSlot, courierPartner: selectedCourier }),
      });
      if (res.ok) {
        setShowPickupModal(false);
        await fetchOrder();
      }
    } catch {
      // ignore
    } finally {
      setSchedulingPickup(false);
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault();
    if (!courierName.trim()) { setDispatchError("Courier name is required"); return; }
    if (!trackingNumber.trim()) { setDispatchError("Tracking number is required (Rule 3)"); return; }
    setDispatching(true);
    setDispatchError("");
    try {
      const res = await apiFetch(`/api/orders/${orderId}/dispatch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courierName: courierName.trim(), trackingNumber: trackingNumber.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setDispatchError(data.error ?? "Failed to dispatch order"); return; }
      setDispatchSuccess(true);
      setCourierName("");
      setTrackingNumber("");
      await fetchOrder();
    } catch {
      setDispatchError("Failed to dispatch order. Please try again.");
    } finally {
      setDispatching(false);
    }
  }

  async function handleApproveReturn() {
    setApprovingReturn(true);
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/returns/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (res.ok) await fetchOrder();
    } catch {
      // ignore
    } finally {
      setApprovingReturn(false);
    }
  }

  async function handleRejectReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!returnRejectReason.trim()) return;
    setRejectingReturn(true);
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/returns/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: returnRejectReason.trim() }),
      });
      if (res.ok) {
        setShowReturnRejectForm(false);
        await fetchOrder();
      }
    } catch {
      // ignore
    } finally {
      setRejectingReturn(false);
    }
  }

  async function handleVerifyReturn(e: React.FormEvent) {
    e.preventDefault();
    setVerifyingReturn(true);
    try {
      const res = await apiFetch(`/api/seller/orders/${orderId}/returns/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditionPass: verifyCondition,
          noDamagePass: verifyNoDamage,
          originalPackagingIntact: verifyPackaging,
          verificationNotes: verifyNotes,
        }),
      });
      if (res.ok) {
        setShowVerifyReturnModal(false);
        await fetchOrder();
      }
    } catch {
      // ignore
    } finally {
      setVerifyingReturn(false);
    }
  }

  const isLate = order && order.status === "confirmed" && (Date.now() - new Date(order.createdAt).getTime()) > 24 * 60 * 60 * 1000;
  const canDispatch = order && !["dispatched", "out_for_delivery", "delivered", "cancelled"].includes(order.status) && order.vendorAcceptanceStatus === "accepted";

  // Product Main Price (Taxable Amount + GST) total and Base Price total calculation
  const productMainAmount = order?.vendorItems ? order.vendorItems.reduce((sum, item) => {
    const bp = item.basePrice ?? (item.price > 0 ? Math.round(item.price / 1.155) : 0);
    const mp = (item.price && item.price >= bp * 1.05) ? item.price : Math.round((bp + 100) * 1.05);
    return sum + mp * (item.quantity ?? 1);
  }, 0) : (order?.vendorTotal ?? 0);

  const productBaseAmount = order?.vendorItems ? order.vendorItems.reduce((sum, item) => {
    const bp = item.basePrice ?? (item.price > 0 ? Math.round(item.price / 1.155) : 0);
    return sum + bp * (item.quantity ?? 1);
  }, 0) : (productMainAmount > 0 ? Math.round(productMainAmount / 1.155) : 0);

  const commission = Math.round(productBaseAmount * 0.18);
  const estPayout = Math.max(0, productBaseAmount - commission);

  return (
    <SellerLayout title="Vendor Direct Order Detail">
      <div className="max-w-5xl pb-16">
        <Link href="/seller/orders" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to Vendor Orders
        </Link>

        {loading ? (
          <div className="flex justify-center py-24">
            <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: MAROON }} />
          </div>
        ) : error ? (
          <div className="text-center py-20 text-red-500 text-sm">{error}</div>
        ) : order ? (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="space-y-6">

            {/* Header Banner */}
            <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                      Vendor Direct Fulfillment Model
                    </span>
                    <span className="text-xs text-gray-400 font-mono">Shiprocket Integrated</span>
                  </div>
                  <h2 className="font-mono text-xl font-bold" style={{ color: MAROON }}>
                    #{order.displayId ?? order.id}
                  </h2>
                  <p className="text-sm text-gray-500 mt-1">{formatDate(order.createdAt)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <span className="px-3.5 py-1.5 rounded-full text-sm font-semibold"
                    style={{ background: statusColors(order.status).bg, color: statusColors(order.status).text }}>
                    {statusLabel(order.status)}
                  </span>
                  <div className="text-xs text-gray-500 flex gap-3">
                    <span className="capitalize font-medium">{order.deliveryMethod} delivery</span>
                    <span>•</span>
                    <span className="capitalize font-medium">{order.paymentMethod.replace("_", " ")}</span>
                  </div>
                </div>
              </div>

              {/* Quick Actions Bar */}
              {order.vendorAcceptanceStatus === "accepted" && (
                <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-2.5 items-center">
                  <button onClick={() => fetchDocuments("label")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                    <Printer size={13} /> Print Shipping Label
                  </button>
                  <button onClick={() => fetchDocuments("awb")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                    <FileText size={13} /> Courier AWB
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        const res = await apiFetch(`/api/orders/${orderId}/invoice`);
                        if (res.ok) {
                          const blob = await res.blob();
                          const url = window.URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `Invoice-INV-${order?.displayId || orderId}.pdf`;
                          document.body.appendChild(a);
                          a.click();
                          a.remove();
                          window.URL.revokeObjectURL(url);
                          return;
                        }
                      } catch {}
                      fetchDocuments("invoice");
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                    title="Download official Tax Invoice & Bill of Supply (PDF)"
                  >
                    <FileText size={13} /> Tax Invoice
                  </button>
                  <button onClick={() => fetchDocuments("slip")}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition">
                    <Package size={13} /> Packing Slip
                  </button>
                  {["confirmed", "processing", "packed"].includes(order.status) && (
                    <button onClick={() => setShowPickupModal(true)}
                      className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm transition"
                      style={{ background: "#166534" }}>
                      <Calendar size={13} /> Schedule Courier Pickup
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* STEP 3 — Accept / Reject Panel */}
            {order.status === "confirmed" && order.vendorAcceptanceStatus === "pending" && (
              <div className="bg-white rounded-xl border-2 border-amber-300 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={18} className="text-amber-500" />
                  <h3 className="font-serif text-base font-bold text-amber-800">STEP 3 — Vendor Order Acceptance Required</h3>
                  {isLate && (
                    <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                      Overdue (24h+)
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                  Review product availability, customer delivery address, and dispatch timeline. If rejected, the customer will be notified instantly and a refund initiated automatically.
                </p>

                {acceptRejectError && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs mb-3">
                    <AlertCircle size={12} /> {acceptRejectError}
                  </div>
                )}

                <AnimatePresence mode="wait">
                  {!showRejectForm ? (
                    <div className="flex gap-3">
                      <button onClick={handleAccept} disabled={accepting}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 shadow-sm"
                        style={{ background: MAROON, color: IVORY }}>
                        <ThumbsUp size={15} />
                        {accepting ? "Accepting Order…" : "Accept Order & Prepare"}
                      </button>
                      <button onClick={() => { setShowRejectForm(true); setAcceptRejectError(""); }}
                        className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-lg border-2 transition-colors"
                        style={{ borderColor: "#EF4444", color: "#EF4444" }}>
                        <ThumbsDown size={15} />
                        Reject Order
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={handleReject} className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider mb-1.5 text-red-700">
                          Reason for rejection *
                        </label>
                        <textarea
                          value={rejectionReason}
                          onChange={(e) => { setRejectionReason(e.target.value); setAcceptRejectError(""); }}
                          placeholder="e.g. Item out of stock, fabric damage discovered during stock audit..."
                          rows={3}
                          className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none transition resize-none"
                          style={{ borderColor: "#fca5a5", background: "#fff5f5" }}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button type="submit" disabled={rejecting}
                          className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 text-white"
                          style={{ background: "#EF4444" }}>
                          {rejecting ? "Rejecting…" : "Confirm Rejection"}
                        </button>
                        <button type="button" onClick={() => { setShowRejectForm(false); setAcceptRejectError(""); setRejectionReason(""); }}
                          className="px-4 py-2.5 text-sm rounded-lg border" style={{ borderColor: "#e5e7eb" }}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Accepted Banner */}
            {order.status !== "cancelled" && order.vendorAcceptanceStatus === "accepted" && (
              <div className="flex items-center gap-2.5 bg-green-50 border border-green-200 rounded-xl px-5 py-3.5 shadow-sm">
                <Check size={16} className="text-green-600 shrink-0" />
                <span className="text-sm text-green-800 font-medium">
                  Order Accepted — You are fully responsible for quality inspection, premium packaging, and direct courier dispatch.
                </span>
              </div>
            )}

            {/* STEP 9 — Return Request Banner & Controls */}
            {order.status === "return_requested" && (
              <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <RefreshCw size={18} className="text-amber-700" />
                    <h3 className="font-serif text-base font-bold text-amber-900">STEP 9 — Customer Return Request Received</h3>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                    Action Needed
                  </span>
                </div>
                <p className="text-sm text-amber-800 mb-3">
                  Reason: <strong className="font-semibold">{order.returnReason?.reason || "Customer requested return"}</strong>
                  {order.returnReason?.comments && ` — "${order.returnReason.comments}"`}
                </p>

                <div className="flex flex-wrap gap-3">
                  <button onClick={handleApproveReturn} disabled={approvingReturn}
                    className="px-4 py-2 text-sm font-bold rounded-lg text-white transition disabled:opacity-60"
                    style={{ background: "#15803D" }}>
                    {approvingReturn ? "Approving…" : "Approve Return & Schedule Pickup"}
                  </button>
                  <button onClick={() => setShowReturnRejectForm(!showReturnRejectForm)}
                    className="px-4 py-2 text-sm font-bold rounded-lg border border-red-300 text-red-700 hover:bg-red-50 transition">
                    Reject Return
                  </button>
                </div>

                {showReturnRejectForm && (
                  <form onSubmit={handleRejectReturn} className="mt-4 pt-3 border-t border-amber-200 space-y-3">
                    <input
                      type="text"
                      value={returnRejectReason}
                      onChange={(e) => setReturnRejectReason(e.target.value)}
                      placeholder="Specify reason for rejecting return request..."
                      className="w-full px-3 py-2 text-sm rounded-lg border border-amber-300 outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="submit" disabled={rejectingReturn}
                        className="px-3 py-1.5 text-xs font-bold text-white bg-red-600 rounded">
                        {rejectingReturn ? "Rejecting…" : "Confirm Rejection"}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            )}

            {/* STEP 9 — Verify Returned Product Upon Arrival */}
            {order.status === "return_approved" && (
              <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck size={18} className="text-indigo-700" />
                    <h3 className="font-serif text-base font-bold text-indigo-900">STEP 9 — Return Condition Verification</h3>
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-indigo-200 text-indigo-900">
                    Package Arrived
                  </span>
                </div>
                <p className="text-sm text-indigo-800 mb-4">
                  Courier pickup delivered returned product to vendor address. Verify saree condition, damage status, and original packaging before releasing customer refund.
                </p>

                <button onClick={() => setShowVerifyReturnModal(true)}
                  className="px-4 py-2.5 text-sm font-bold text-white rounded-lg transition"
                  style={{ background: "#3730A3" }}>
                  Verify Product Condition & Process Refund
                </button>
              </div>
            )}

            {/* Main Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Left Column: Items + STEP 4 Packaging Checklist */}
              <div className="space-y-6">
                {/* Items */}
                <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 shadow-sm">
                  <h3 className="font-serif text-base font-bold mb-4" style={{ color: MAROON }}>Order Items</h3>
                  <div className="space-y-3">
                    {order.vendorItems.map((item) => {
                      const img = item.images?.[0];
                      const itemBasePrice = item.basePrice ?? (item.price > 0 ? Math.round(item.price / 1.155) : 0);
                      return (
                        <div key={item.productId} className="flex items-center gap-3">
                          <img
                            src={getProductImageSrc(img)}
                            alt={item.name}
                            className="w-14 h-14 object-cover rounded-lg shrink-0 border border-gray-100"
                            onError={replaceProductImageWithFallback}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{item.name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">Qty: {item.quantity} × ₹{itemBasePrice.toLocaleString("en-IN")}</p>
                          </div>
                          <p className="text-sm font-semibold shrink-0" style={{ color: MAROON }}>
                            ₹{(itemBasePrice * item.quantity).toLocaleString("en-IN")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between">
                    <span className="text-sm font-semibold text-gray-700">Vendor Item Total (Base Price)</span>
                    <span className="text-base font-bold" style={{ color: MAROON }}>
                      ₹{productBaseAmount.toLocaleString("en-IN")}
                    </span>
                  </div>
                </div>

                {/* STEP 4 — Premium Packaging & Quality Inspection Checklist */}
                {order.vendorAcceptanceStatus === "accepted" && (
                  <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles size={16} className="text-amber-600" />
                        <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>
                          STEP 4 — Premium Packaging & Quality Inspection
                        </h3>
                      </div>
                      {checklistSaved && (
                        <span className="text-xs font-semibold text-green-600 flex items-center gap-1">
                          <Check size={12} /> Saved
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mb-4">
                      Rule 2: Vendor must maintain premium packaging standards prior to generating shipping label.
                    </p>

                    <div className="space-y-2.5 text-xs">
                      <p className="font-bold uppercase tracking-wider text-gray-400 text-[10px]">1. Inspection</p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={qualityInspected} onChange={(e) => setQualityInspected(e.target.checked)} className="rounded text-blue-600" />
                        <span>Saree Quality & Weave Inspection</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={fabricInspected} onChange={(e) => setFabricInspected(e.target.checked)} className="rounded text-blue-600" />
                        <span>Fabric & Thread Count Verification</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={damageChecked} onChange={(e) => setDamageChecked(e.target.checked)} className="rounded text-blue-600" />
                        <span>Stain & Damage Inspection</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={authenticityVerified} onChange={(e) => setAuthenticityVerified(e.target.checked)} className="rounded text-blue-600" />
                        <span>Authenticity Guarantee Verification</span>
                      </label>

                      <p className="font-bold uppercase tracking-wider text-gray-400 text-[10px] pt-2">2. Premium Packaging Checklist</p>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={brandedBoxUsed} onChange={(e) => setBrandedBoxUsed(e.target.checked)} className="rounded text-blue-600" />
                        <span className="font-medium text-gray-700">Branded Saree Rigid Box</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={wrappingPaperUsed} onChange={(e) => setWrappingPaperUsed(e.target.checked)} className="rounded text-blue-600" />
                        <span>Tissue Wrapping Paper & Poly Shield</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={careInstructionsIncluded} onChange={(e) => setCareInstructionsIncluded(e.target.checked)} className="rounded text-blue-600" />
                        <span>Silk Saree Care Instructions Card</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={thankYouCardIncluded} onChange={(e) => setThankYouCardIncluded(e.target.checked)} className="rounded text-blue-600" />
                        <span>Personalized Thank-You Card</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={authenticityCardIncluded} onChange={(e) => setAuthenticityCardIncluded(e.target.checked)} className="rounded text-blue-600" />
                        <span>Weaver Authenticity Card</span>
                      </label>
                    </div>

                    <button onClick={handleSaveChecklist} disabled={savingChecklist}
                      className="w-full mt-4 py-2 rounded-lg text-xs font-bold text-white transition"
                      style={{ background: MAROON }}>
                      {savingChecklist ? "Saving Inspection..." : "Verify & Complete Packaging"}
                    </button>
                  </div>
                )}
              </div>

              {/* Right Column: Customer Details, STEP 5-7 Dispatch & Tracking, STEP 10 Settlement */}
              <div className="space-y-6">

                {/* Customer Shipping Address (STEP 2) */}
                <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <MapPin size={16} style={{ color: MAROON }} />
                    <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>Customer Shipping Address</h3>
                  </div>
                  <p className="text-sm font-semibold text-gray-800">
                    {order.shippingCity || order.shippingState ? `${order.shippingCity}, ${order.shippingState}` : "Address Available"}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    Direct shipping destination provided upon order assignment (Rule 1).
                  </p>
                </div>

                {/* Active Shiprocket Shipment Card (Shown whenever shipment exists) */}
                {shipmentData && (
                  <div className="bg-white rounded-xl border border-blue-200 p-5 shadow-sm bg-gradient-to-br from-white to-blue-50/20">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                          <Truck size={16} />
                        </div>
                        <div>
                          <h3 className="font-serif text-base font-bold text-[#0A1F44]">Shiprocket Live Shipment</h3>
                          <p className="text-xs text-gray-500">Auto-assigned courier & pickup manifest</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 border border-blue-200">
                        {shipmentData.status ? shipmentData.status.replace(/_/g, " ") : "Pickup Scheduled"}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs mt-3 pt-3 border-t border-gray-100">
                      <div>
                        <span className="text-gray-400 font-semibold uppercase text-[10px] block">Courier Partner</span>
                        <span className="font-bold text-gray-800 text-sm">{shipmentData.courierName || "Shiprocket Courier"}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold uppercase text-[10px] block">AWB / Tracking ID</span>
                        <span className="font-mono font-bold text-blue-900 text-sm">{shipmentData.awbNumber || "Pending"}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold uppercase text-[10px] block">Pickup Location</span>
                        <span className="font-mono text-xs text-gray-700">{shipmentData.pickupLocationName || "Registered Shop"}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 font-semibold uppercase text-[10px] block">Scheduled Pickup Date</span>
                        <span className="font-medium text-gray-700">{shipmentData.pickupScheduledDate || "Immediate"}</span>
                      </div>
                    </div>

                    {shipmentData.pickupToken && (
                      <div className="mt-3 text-xs bg-white p-2.5 rounded-lg border border-blue-100 flex items-center justify-between">
                        <span className="text-gray-500">Pickup Manifest Token:</span>
                        <span className="font-mono font-semibold text-gray-800">{shipmentData.pickupToken}</span>
                      </div>
                    )}

                    <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-2">
                      {shipmentData.labelUrl && (
                        <a
                          href={shipmentData.labelUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold text-white bg-[#0A1F44] hover:bg-[#152e5a] transition shadow-sm"
                        >
                          <Printer size={13} /> Print Shipping Label (PDF)
                        </a>
                      )}
                      {shipmentData.trackingUrl && (
                        <a
                          href={shipmentData.trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
                        >
                          <ExternalLink size={13} /> Track Live
                        </a>
                      )}
                    </div>
                  </div>
                )}

                {/* STEP 5 & 7 — Real-Time Tracking & Dispatch (Rule 3 & 4) */}
                {canDispatch && !shipmentData && (
                  <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <Truck size={16} style={{ color: MAROON }} />
                        <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>STEP 7 — Dispatch Order</h3>
                      </div>
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                        Shiprocket Integrated
                      </span>
                    </div>

                    {/* Dispatch Method Tabs */}
                    <div className="flex rounded-lg bg-gray-100 p-1 mb-4 text-xs font-medium">
                      <button
                        type="button"
                        onClick={() => setDispatchMethod("shiprocket")}
                        className={`flex-1 py-1.5 rounded-md transition ${dispatchMethod === "shiprocket" ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                      >
                        Automated Courier Dispatch
                      </button>
                      <button
                        type="button"
                        onClick={() => setDispatchMethod("manual")}
                        className={`flex-1 py-1.5 rounded-md transition ${dispatchMethod === "manual" ? "bg-white text-gray-900 shadow-sm font-semibold" : "text-gray-500 hover:text-gray-900"}`}
                      >
                        Manual Tracking Entry
                      </button>
                    </div>

                    <AnimatePresence>
                      {dispatchSuccess && (
                        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                          className="flex items-center gap-2 text-green-700 text-sm bg-green-50 rounded-lg px-3 py-2.5 mb-4 border border-green-200">
                          <Check size={14} /> Tracking uploaded & synced across portals in real time
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {dispatchMethod === "shiprocket" ? (
                      <div className="space-y-3">
                        <p className="text-xs text-gray-500">
                          Shiprocket automatically checks serviceability from your registered shop address to customer PIN code ({order.shippingCity || "destination"}).
                        </p>

                        {loadingCouriers ? (
                          <div className="py-6 flex flex-col items-center justify-center gap-2 text-gray-400 text-xs">
                            <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: MAROON }} />
                            <span>Checking courier rates and serviceability...</span>
                          </div>
                        ) : couriersError ? (
                          <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-2">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <AlertCircle size={14} /> {couriersError}
                            </div>
                            {couriersError.toLowerCase().includes("pickup") && (
                              <p className="text-[11px] text-amber-700">
                                Make sure your shop pickup address is registered.{" "}
                                <Link href="/seller/profile" className="underline font-bold">
                                  Go to Seller Profile →
                                </Link>
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={fetchCouriers}
                              className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-amber-300 rounded shadow-sm hover:bg-amber-100/50"
                            >
                              Retry Fetching Couriers
                            </button>
                          </div>
                        ) : couriers.length > 0 ? (
                          <div className="space-y-2">
                            <label className="block text-xs font-semibold uppercase tracking-wider text-[#0A1F44]">
                              Select Available Courier Partner
                            </label>
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {couriers.map((c) => (
                                <label
                                  key={c.courierCompanyId}
                                  className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer text-xs transition ${
                                    String(selectedCourierId) === String(c.courierCompanyId)
                                      ? "border-blue-600 bg-blue-50/50 ring-1 ring-blue-600"
                                      : "border-gray-200 hover:bg-gray-50"
                                  }`}
                                >
                                  <div className="flex items-center gap-2.5">
                                    <input
                                      type="radio"
                                      name="courierSelection"
                                      checked={String(selectedCourierId) === String(c.courierCompanyId)}
                                      onChange={() => setSelectedCourierId(c.courierCompanyId)}
                                      className="text-blue-600"
                                    />
                                    <div>
                                      <p className="font-semibold text-gray-800">{c.courierName}</p>
                                      <p className="text-[11px] text-gray-500">
                                        {c.estimatedDeliveryDays ? `Est. ${c.estimatedDeliveryDays} days delivery` : "Standard delivery"}
                                        {c.rating ? ` • ★ ${c.rating}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <span className="font-bold text-gray-900 text-sm">₹{c.rate || 0}</span>
                                    <span className="block text-[10px] text-gray-400">Shipping</span>
                                  </div>
                                </label>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500 py-2">No direct couriers returned. You can use manual entry or retry.</p>
                        )}

                        {dispatchError && (
                          <div className="flex items-center gap-1.5 text-red-500 text-xs">
                            <AlertCircle size={12} /> {dispatchError}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={handleShiprocketDispatch}
                          disabled={dispatching || loadingCouriers}
                          className="w-full py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-60 text-white shadow-sm flex items-center justify-center gap-2"
                          style={{ background: MAROON }}
                        >
                          <Truck size={14} />
                          {dispatching ? "Scheduling Shiprocket Pickup..." : "Dispatch & Auto-Schedule Pickup"}
                        </button>
                      </div>
                    ) : (
                      <form onSubmit={handleDispatch} className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#0A1F44" }}>
                            Integrated Courier Partner
                          </label>
                          <select
                            value={courierName}
                            onChange={(e) => { setCourierName(e.target.value); setDispatchError(""); }}
                            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none bg-gray-50"
                          >
                            <option value="">Select Partner</option>
                            <option value="Shiprocket (BlueDart)">Shiprocket (BlueDart)</option>
                            <option value="Shiprocket (Delhivery)">Shiprocket (Delhivery)</option>
                            <option value="Shiprocket (DTDC)">Shiprocket (DTDC)</option>
                            <option value="Shiprocket (Ekart)">Shiprocket (Ekart)</option>
                            <option value="Direct Express">Direct Express</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "#0A1F44" }}>
                            Courier AWB / Tracking ID *
                          </label>
                          <input
                            type="text"
                            value={trackingNumber}
                            onChange={(e) => { setTrackingNumber(e.target.value); setDispatchError(""); }}
                            placeholder="e.g. SR1009847291"
                            className="w-full px-3 py-2.5 text-sm rounded-lg border outline-none font-mono"
                            style={{ borderColor: "#C7CCD144", background: IVORY }}
                          />
                        </div>

                        {dispatchError && (
                          <div className="flex items-center gap-1.5 text-red-500 text-xs">
                            <AlertCircle size={12} /> {dispatchError}
                          </div>
                        )}

                        <button type="submit" disabled={dispatching}
                          className="w-full py-2.5 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors disabled:opacity-60 text-white shadow-sm"
                          style={{ background: MAROON }}>
                          {dispatching ? "Syncing Tracking…" : "Upload Tracking & Dispatch"}
                        </button>
                      </form>
                    )}
                  </div>
                )}

                {/* STEP 10 — Vendor Settlement Calculation (Rule 6) */}
                <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <DollarSign size={16} className="text-green-700" />
                      <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>STEP 10 — Vendor Settlement Breakup</h3>
                    </div>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Product Amount</span>
                      <span className="font-medium text-gray-800">₹{productBaseAmount.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Platform Commission (18%)</span>
                      <span className="font-medium text-red-600">-₹{commission.toLocaleString("en-IN")}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Direct Shipping Charges</span>
                      <span className="font-medium text-gray-800">₹0 (Vendor direct)</span>
                    </div>
                    <div className="pt-2 border-t border-gray-100 flex justify-between font-bold text-sm">
                      <span className="text-gray-800">Estimated Vendor Payout</span>
                      <span className="text-green-700">₹{estPayout.toLocaleString("en-IN")}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-3 italic">
                    Rule 6: Vendor settlement is released only after successful customer delivery confirmation.
                  </p>
                </div>

              </div>
            </div>

            {/* Real-time Order Timeline */}
            <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-6 shadow-sm">
              <h3 className="font-serif text-base font-bold mb-4" style={{ color: MAROON }}>Real-Time Shipment Progress</h3>
              <OrderTrackingTimeline
                statusHistory={order.statusHistory}
                currentStatus={order.status}
                createdAt={order.createdAt}
              />
            </div>

          </motion.div>
        ) : null}
      </div>

      {/* STEP 5 — Document Printing Modal */}
      {showDocModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4 pb-3 border-b">
              <h3 className="font-bold text-lg text-gray-800 capitalize">
                Vendor Direct {docType === "label" ? "Shipping Label" : docType === "awb" ? "Shiprocket Courier AWB" : docType === "invoice" ? "Tax Invoice" : "Packing Slip"}
              </h3>
              <button onClick={() => setShowDocModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {loadingDocs ? (
              <div className="py-12 text-center text-sm text-gray-500">Generating Document...</div>
            ) : docData ? (
              <div className="space-y-4 border p-6 rounded-xl bg-gray-50 text-xs">
                <div className="flex justify-between items-start border-b pb-4">
                  <div>
                    <h4 className="font-bold text-sm text-blue-900">VASTRAA MARKETPLACE</h4>
                    <p className="text-gray-500">Vendor Direct Fulfillment Network</p>
                    <p className="mt-2 font-semibold text-gray-700">Order ID: #{docData.displayId}</p>
                  </div>
                  <div className="text-right">
                    <span className="inline-block px-2.5 py-1 bg-green-100 text-green-800 font-bold rounded">
                      {docData.courierPartner}
                    </span>
                    <p className="font-mono mt-1 font-bold">AWB: {docData.awbNumber}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 border-b pb-4">
                  <div>
                    <p className="font-bold uppercase text-gray-400 text-[10px]">Shipped By (Vendor):</p>
                    <p className="font-bold text-gray-800">{docData.sellerAddress.storeName}</p>
                    <p>{docData.sellerAddress.city}, {docData.sellerAddress.state} - {docData.sellerAddress.pincode}</p>
                    <p>Phone: {docData.sellerAddress.phone}</p>
                  </div>
                  <div>
                    <p className="font-bold uppercase text-gray-400 text-[10px]">Deliver To (Customer):</p>
                    <p className="font-bold text-gray-800">{docData.customerAddress.name}</p>
                    <p>{docData.customerAddress.line1}</p>
                    <p>{docData.customerAddress.city}, {docData.customerAddress.state} - {docData.customerAddress.pincode}</p>
                  </div>
                </div>

                <div>
                  <p className="font-bold uppercase text-gray-400 text-[10px] mb-2">Item Manifest:</p>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b text-gray-500">
                        <th className="py-1">Product</th>
                        <th className="py-1">Qty</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docData.items.map((item: any, idx: number) => (
                        <tr key={idx} className="border-b">
                          <td className="py-1.5 font-medium">{item.name}</td>
                          <td className="py-1.5">{item.quantity}</td>
                          <td className="py-1.5 text-right font-semibold">₹{item.total.toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="flex justify-end gap-3 pt-4">
                  {docType === "invoice" && (
                    <button
                      onClick={async () => {
                        try {
                          const res = await apiFetch(`/api/orders/${orderId}/invoice`);
                          if (res.ok) {
                            const blob = await res.blob();
                            const url = window.URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = `Invoice-INV-${order?.displayId || orderId}.pdf`;
                            document.body.appendChild(a);
                            a.click();
                            a.remove();
                            window.URL.revokeObjectURL(url);
                          } else {
                            alert("Failed to download PDF. Please try again.");
                          }
                        } catch {
                          alert("Download error. Please check your network connection.");
                        }
                      }}
                      className="px-4 py-2 text-xs font-bold text-white bg-[#0A1F44] hover:bg-[#1E2E4A] rounded-lg flex items-center gap-1.5 transition shadow-2xs"
                    >
                      <Download size={14} /> Download Official PDF
                    </button>
                  )}
                  <button onClick={() => window.print()} className="px-4 py-2 text-xs font-bold text-white bg-blue-900 rounded-lg flex items-center gap-1.5">
                    <Printer size={14} /> Print Document
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* STEP 6 — Courier Pickup Schedule Modal */}
      {showPickupModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <h3 className="font-bold text-base text-gray-900">STEP 6 — Schedule Courier Pickup</h3>
              <button onClick={() => setShowPickupModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSchedulePickup} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">Pick-up Date</label>
                <input
                  type="date"
                  value={pickupDate}
                  onChange={(e) => setPickupDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">Time Slot</label>
                <select
                  value={pickupSlot}
                  onChange={(e) => setPickupSlot(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none bg-gray-50"
                >
                  <option value="Morning (10 AM - 1 PM)">Morning (10 AM - 1 PM)</option>
                  <option value="Afternoon (1 PM - 4 PM)">Afternoon (1 PM - 4 PM)</option>
                  <option value="Evening (4 PM - 7 PM)">Evening (4 PM - 7 PM)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">Courier Partner (Shiprocket)</label>
                <select
                  value={selectedCourier}
                  onChange={(e) => setSelectedCourier(e.target.value)}
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none bg-gray-50"
                >
                  <option value="Shiprocket Express (BlueDart)">Shiprocket Express (BlueDart)</option>
                  <option value="Shiprocket Air (Delhivery)">Shiprocket Air (Delhivery)</option>
                  <option value="Shiprocket Ground (DTDC)">Shiprocket Ground (DTDC)</option>
                </select>
              </div>

              <button type="submit" disabled={schedulingPickup}
                className="w-full py-2.5 text-xs font-bold text-white bg-green-700 rounded-lg hover:bg-green-800 transition">
                {schedulingPickup ? "Scheduling Pickup..." : "Confirm Pickup Location & Schedule"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* STEP 9 — Return Condition Verification Modal */}
      {showVerifyReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6">
            <div className="flex justify-between items-center mb-4 pb-2 border-b">
              <h3 className="font-bold text-base text-gray-900">STEP 9 — Vendor Return Verification</h3>
              <button onClick={() => setShowVerifyReturnModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleVerifyReturn} className="space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Rule 5: Vendor handles return verification upon arrival. Please inspect returned saree condition:
              </p>

              <div className="space-y-2 text-xs border p-3 rounded-lg bg-gray-50">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={verifyCondition} onChange={(e) => setVerifyCondition(e.target.checked)} className="rounded text-indigo-600" />
                  <span className="font-medium text-gray-800">Unused condition (No wear, scent, or alteration)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={verifyNoDamage} onChange={(e) => setVerifyNoDamage(e.target.checked)} className="rounded text-indigo-600" />
                  <span className="font-medium text-gray-800">No fabric tear, stain, or thread damage</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={verifyPackaging} onChange={(e) => setVerifyPackaging(e.target.checked)} className="rounded text-indigo-600" />
                  <span className="font-medium text-gray-800">Original box & authenticity tags intact</span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-gray-600 mb-1">Verification Notes</label>
                <textarea
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  placeholder="e.g. Saree verified in perfect condition with original packaging..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm rounded-lg border outline-none"
                />
              </div>

              <button type="submit" disabled={verifyingReturn}
                className="w-full py-2.5 text-xs font-bold text-white bg-indigo-800 rounded-lg hover:bg-indigo-900 transition">
                {verifyingReturn ? "Verifying..." : "Approve Verification & Issue Refund"}
              </button>
            </form>
          </div>
        </div>
      )}
    </SellerLayout>
  );
}
