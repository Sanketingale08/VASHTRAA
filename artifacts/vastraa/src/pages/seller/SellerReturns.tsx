import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  RefreshCw,
  Search,
  Package,
  Calendar,
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
  ArrowRight
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { apiFetch } from "@/lib/api";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

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
  status: string;
  pickupDetails?: {
    pickupScheduledDate?: string;
    courierName?: string;
    awbNumber?: string;
    pickupStatus?: string;
    lastTrackingEvent?: string;
  };
  qcDetails?: {
    inspectedAt?: string;
    inspectedBy?: string;
    inspectorName?: string;
    result?: "pass" | "fail";
    approvedForResale?: boolean;
    restocked?: boolean;
    qcNotes?: string;
    qcPhotos?: string[];
  };
  refundDetails?: {
    refundAmount?: number;
    refundStatus?: string;
    paymentGatewayRefundId?: string;
  };
  exchangeDetails?: {
    replacementProductId?: string;
    replacementProductName?: string;
    replacementAwb?: string;
    replacementCourier?: string;
    stockAvailable?: boolean;
  };
  createdAt: string;
  updatedAt: string;
}

const STATUS_LABELS: Record<string, { label: string; bg: string; text: string }> = {
  PENDING: { label: "Pending Admin Review", bg: "bg-amber-50", text: "text-amber-800" },
  UNDER_REVIEW: { label: "Under Review", bg: "bg-blue-50", text: "text-blue-800" },
  APPROVED: { label: "Approved by Admin", bg: "bg-indigo-50", text: "text-indigo-800" },
  REJECTED: { label: "Rejected", bg: "bg-red-50", text: "text-red-800" },
  PICKUP_SCHEDULED: { label: "Pickup Scheduled", bg: "bg-purple-50", text: "text-purple-800" },
  PICKED_UP: { label: "Picked Up by Courier", bg: "bg-purple-100", text: "text-purple-900" },
  RECEIVED: { label: "Received at Facility", bg: "bg-cyan-50", text: "text-cyan-800" },
  QUALITY_CHECK: { label: "QC Inspection In-Progress", bg: "bg-yellow-50", text: "text-yellow-800" },
  QC_FAILED: { label: "Quality Check Failed", bg: "bg-rose-50", text: "text-rose-800" },
  REFUND_INITIATED: { label: "Refund Initiated", bg: "bg-teal-50", text: "text-teal-800" },
  REFUND_COMPLETED: { label: "Refund Paid Out", bg: "bg-emerald-50", text: "text-emerald-800" },
  EXCHANGE_PROCESSING: { label: "Exchange Processing", bg: "bg-sky-50", text: "text-sky-800" },
  EXCHANGE_SHIPPED: { label: "Replacement Dispatched", bg: "bg-blue-100", text: "text-blue-900" },
  EXCHANGE_DELIVERED: { label: "Exchange Completed", bg: "bg-emerald-100", text: "text-emerald-900" },
  CANCELLED: { label: "Cancelled", bg: "bg-gray-100", text: "text-gray-700" },
};

export default function SellerReturns() {
  const [returnsList, setReturnsList] = useState<ReturnRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"all" | "returns" | "exchanges" | "pending" | "qc">("all");
  const [search, setSearch] = useState("");
  const [selectedReturn, setSelectedReturn] = useState<ReturnRecord | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null);

  // Seller QC action states
  const [submittingQc, setSubmittingQc] = useState(false);
  const [qcNotes, setQcNotes] = useState("");
  const [conditionPass, setConditionPass] = useState(true);
  const [defectVerified, setDefectVerified] = useState(true);
  const [tagsPresent, setTagsPresent] = useState(true);
  const [packagingIntact, setPackagingIntact] = useState(true);
  const [markingReceived, setMarkingReceived] = useState(false);

  const fetchSellerReturns = useCallback(async () => {
    try {
      setLoading(true);
      setError("");
      const res = await apiFetch("/api/seller/returns");
      if (!res.ok) {
        throw new Error("Failed to load seller returns");
      }
      const data = await res.json();
      setReturnsList(data.returns || []);
    } catch (err: any) {
      setError(err?.message || "Failed to load return requests.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSellerReturns();
  }, [fetchSellerReturns]);

  // Realtime updates
  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (["return:created", "return:updated", "refund:processed"].includes(detail.name)) {
        fetchSellerReturns();
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [fetchSellerReturns]);

  const filteredReturns = useMemo(() => {
    let list = returnsList;
    if (activeTab === "returns") list = list.filter((r) => r.requestType === "return");
    else if (activeTab === "exchanges") list = list.filter((r) => r.requestType === "exchange");
    else if (activeTab === "pending") list = list.filter((r) => ["PENDING", "UNDER_REVIEW"].includes(r.status));
    else if (activeTab === "qc") list = list.filter((r) => ["RECEIVED", "QUALITY_CHECK"].includes(r.status));

    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.returnNumber.toLowerCase().includes(q) ||
          r.orderId.toLowerCase().includes(q) ||
          (r.orderDisplayId && r.orderDisplayId.toLowerCase().includes(q)) ||
          r.items.some((i) => i.name.toLowerCase().includes(q))
      );
    }
    return list;
  }, [returnsList, activeTab, search]);

  async function handleMarkReceived(returnId: string) {
    if (!confirm("Confirm that this returned parcel has been physically received at your workshop/hub?")) return;
    try {
      setMarkingReceived(true);
      const res = await apiFetch(`/api/seller/returns/${returnId}/receive`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to mark as received");
      }
      await fetchSellerReturns();
      if (selectedReturn?.id === returnId) {
        const updated = await apiFetch(`/api/seller/returns/${returnId}`);
        if (updated.ok) {
          const d = await updated.json();
          setSelectedReturn(d.return);
        }
      }
    } catch (err: any) {
      alert(err?.message || "Failed to mark as received.");
    } finally {
      setMarkingReceived(false);
    }
  }

  async function handleSellerQcSubmit(returnId: string) {
    try {
      setSubmittingQc(true);
      const res = await apiFetch(`/api/seller/returns/${returnId}/qc`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conditionPass,
          defectVerified,
          originalTagsPresent: tagsPresent,
          packagingIntact,
          qcNotes,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to submit quality check");
      }
      await fetchSellerReturns();
      setSelectedReturn(null);
      alert("Quality Inspection recorded! If approved, inventory stock has been synchronized automatically.");
    } catch (err: any) {
      alert(err?.message || "QC submission failed.");
    } finally {
      setSubmittingQc(false);
    }
  }

  return (
    <SellerLayout title="Returns & Exchanges">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header & Policy Context */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white rounded-xl p-5 border border-[#C7CCD1]/30 shadow-xs">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="p-2 rounded-lg bg-[#0A1F44]/5 text-[#0A1F44]">
                <RotateCcw size={20} />
              </span>
              <h1 className="font-serif text-2xl font-bold text-[#0A1F44]">Returns & Exchanges Management</h1>
            </div>
            <p className="text-xs text-gray-500 max-w-2xl">
              Real-time synchronization of returns and exchanges for your artisan products. Products are strictly eligible only if standard and non-customized. Stock is automatically restored to your inventory only after Quality Check approval for resale.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              <ShieldCheck size={14} className="text-emerald-600" />
              7-Day Policy Active
            </span>
          </div>
        </div>

        {/* Important Seller Business Rules Notice */}
        <div className="bg-[#FDFAF5] border border-amber-200 rounded-xl p-4 text-xs text-amber-900 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-700 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-950">Important Seller Guidelines:</p>
            <p>
              • <strong>Eligibility Enforcement:</strong> Custom-designed sarees, altered sarees, and custom-stitched blouses are non-returnable.
            </p>
            <p>
              • <strong>Inventory Restock:</strong> Stock is updated into your active inventory <em>only after</em> the returned saree passes physical quality inspection with intact tags.
            </p>
            <p>
              • <strong>Refund Authority:</strong> Sellers cannot independently trigger refunds. All customer payouts and gateway transactions are audited and executed by Admin.
            </p>
          </div>
        </div>

        {/* Tab Filters & Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {[
              { id: "all", label: "All Claims", count: returnsList.length },
              { id: "returns", label: "Returns", count: returnsList.filter((r) => r.requestType === "return").length },
              { id: "exchanges", label: "Exchanges", count: returnsList.filter((r) => r.requestType === "exchange").length },
              { id: "pending", label: "Pending Admin", count: returnsList.filter((r) => ["PENDING", "UNDER_REVIEW"].includes(r.status)).length },
              { id: "qc", label: "Awaiting QC", count: returnsList.filter((r) => ["RECEIVED", "QUALITY_CHECK"].includes(r.status)).length },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition flex items-center gap-1.5 ${
                  activeTab === t.id
                    ? "bg-[#0A1F44] text-white shadow-xs"
                    : "bg-white text-gray-600 hover:bg-gray-100 border border-[#C7CCD1]/30"
                }`}
              >
                <span>{t.label}</span>
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${activeTab === t.id ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                  {t.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search claim, order, saree..."
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-[#C7CCD1]/30 rounded-lg focus:outline-none focus:border-[#0A1F44]"
            />
          </div>
        </div>

        {/* Returns Table / Cards */}
        {loading ? (
          <div className="py-20 text-center bg-white rounded-xl border border-[#C7CCD1]/20">
            <div className="w-8 h-8 border-3 border-[#0A1F44]/20 border-t-[#0A1F44] rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-gray-500 font-medium">Loading claims for your artisan products...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-red-50 text-red-700 rounded-xl text-center text-sm border border-red-200">
            {error}
          </div>
        ) : filteredReturns.length === 0 ? (
          <div className="py-20 text-center bg-white rounded-xl border border-[#C7CCD1]/20 p-6">
            <Package size={40} className="mx-auto text-gray-300 mb-2" />
            <p className="font-semibold text-gray-700 text-sm">No return or exchange claims found</p>
            <p className="text-xs text-gray-400 mt-1">
              {search ? "No claims matching your search term." : "Your products currently have zero active returns or exchanges."}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-[#C7CCD1]/30 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F4F5F7] text-gray-600 uppercase tracking-wider font-semibold border-b border-[#C7CCD1]/20">
                  <tr>
                    <th className="px-4 py-3.5">Claim & Type</th>
                    <th className="px-4 py-3.5">Order</th>
                    <th className="px-4 py-3.5">Product</th>
                    <th className="px-4 py-3.5">Customer Reason</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">QC / Inventory</th>
                    <th className="px-4 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#C7CCD1]/15">
                  {filteredReturns.map((ret) => {
                    const statusInfo = STATUS_LABELS[ret.status] || {
                      label: ret.status,
                      bg: "bg-gray-100",
                      text: "text-gray-700",
                    };
                    const item = ret.items[0];

                    return (
                      <tr key={ret.id} className="hover:bg-[#FDFAF5]/60 transition-colors">
                        <td className="px-4 py-3.5 align-top">
                          <div className="font-mono font-bold text-[#0A1F44]">#{ret.returnNumber}</div>
                          <div className="flex items-center gap-1 mt-1">
                            <span
                              className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded capitalize ${
                                ret.requestType === "return" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {ret.requestType}
                            </span>
                          </div>
                          <div className="text-[10px] text-gray-400 mt-1">
                            {new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <Link href={`/seller/orders/${ret.orderId}`} className="font-mono font-medium text-blue-600 hover:underline">
                            #{ret.orderDisplayId || ret.orderId.slice(0, 10)}
                          </Link>
                          {ret.userName && <div className="text-[11px] text-gray-600 mt-0.5">{ret.userName}</div>}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <div className="flex items-start gap-2.5 max-w-[240px]">
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
                              <p className="text-[11px] text-gray-500">₹{item?.price?.toLocaleString("en-IN")} × {item?.quantity || 1}</p>
                              <span className="inline-block mt-0.5 text-[9px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700">
                                Standard Eligible
                              </span>
                            </div>
                          </div>
                        </td>

                        <td className="px-4 py-3.5 align-top max-w-[200px]">
                          <p className="font-semibold text-gray-800 capitalize">{ret.issueCategory.replace(/_/g, " ")}</p>
                          {ret.customerNotes && (
                            <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5 italic">"{ret.customerNotes}"</p>
                          )}
                          {ret.evidenceUrls && ret.evidenceUrls.length > 0 && (
                            <button
                              onClick={() => setPreviewPhoto(ret.evidenceUrls[0])}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:underline"
                            >
                              <ImageIcon size={11} />
                              View Photos ({ret.evidenceUrls.length})
                            </button>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full ${statusInfo.bg} ${statusInfo.text}`}>
                            {statusInfo.label}
                          </span>
                          {ret.pickupDetails?.awbNumber && (
                            <div className="text-[10px] text-gray-400 mt-1 font-mono">
                              AWB: {ret.pickupDetails.awbNumber}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top">
                          {ret.qcDetails?.restocked ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
                              <CheckCircle2 size={11} />
                              QC Passed & Restocked
                            </span>
                          ) : ret.qcDetails?.result === "fail" ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded">
                              <XCircle size={11} />
                              QC Failed — No Restock
                            </span>
                          ) : ["RECEIVED", "QUALITY_CHECK"].includes(ret.status) ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
                              <Clock size={11} />
                              Pending Inspection
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-400">Awaiting return delivery</span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 align-top text-right">
                          <button
                            onClick={() => setSelectedReturn(ret)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded border border-[#0A1F44]/20 hover:bg-[#0A1F44] hover:text-white transition-colors"
                          >
                            <Eye size={12} />
                            Inspect
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

        {/* Claim Detail & QC Modal */}
        <AnimatePresence>
          {selectedReturn && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
              <motion.div
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-[#C7CCD1]/30"
              >
                {/* Modal Header */}
                <div className="px-6 py-4 bg-[#0A1F44] text-white flex items-center justify-between">
                  <div>
                    <h2 className="font-serif text-lg font-bold">
                      {selectedReturn.requestType === "return" ? "Return Claim" : "Exchange Request"} #{selectedReturn.returnNumber}
                    </h2>
                    <p className="text-xs text-white/70">
                      Order #{selectedReturn.orderDisplayId || selectedReturn.orderId} · Submitted {new Date(selectedReturn.createdAt).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedReturn(null)}
                    className="p-1 rounded-full text-white/70 hover:text-white hover:bg-white/10"
                  >
                    ✕
                  </button>
                </div>

                {/* Modal Body */}
                <div className="p-6 overflow-y-auto space-y-5 text-xs">
                  {/* Status Banner */}
                  <div className="p-3.5 rounded-xl bg-[#F4F5F7] border border-[#C7CCD1]/30 flex items-center justify-between">
                    <div>
                      <span className="text-gray-500 font-medium">Lifecycle Status:</span>
                      <p className="font-bold text-[#0A1F44] text-sm mt-0.5">
                        {STATUS_LABELS[selectedReturn.status]?.label || selectedReturn.status}
                      </p>
                    </div>
                    {selectedReturn.pickupDetails?.awbNumber && (
                      <div className="text-right">
                        <span className="text-gray-500 font-medium">Courier AWB:</span>
                        <p className="font-mono font-bold text-gray-800">{selectedReturn.pickupDetails.awbNumber}</p>
                        <p className="text-[10px] text-gray-400">{selectedReturn.pickupDetails.courierName}</p>
                      </div>
                    )}
                  </div>

                  {/* Product Details & Verification */}
                  <div className="border border-[#C7CCD1]/25 rounded-xl p-4">
                    <h3 className="font-bold text-[#0A1F44] text-sm mb-2 flex items-center gap-1.5">
                      <Package size={15} />
                      Artisan Item Claimed
                    </h3>
                    {selectedReturn.items.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-3">
                        {item.images?.[0] && (
                          <div className="w-14 h-14 rounded-lg overflow-hidden bg-gray-100 border border-gray-200 shrink-0">
                            <img
                              src={getProductImageSrc(item.images[0])}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onError={replaceProductImageWithFallback}
                            />
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                          <p className="text-gray-500">Unit Price: ₹{item.price?.toLocaleString("en-IN")} | Quantity: {item.quantity}</p>
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded mt-1">
                            <CheckCircle2 size={11} />
                            Verified Standard Product (Non-Customized)
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Customer Reason & Uploaded Evidence */}
                  <div className="border border-[#C7CCD1]/25 rounded-xl p-4 space-y-2">
                    <h3 className="font-bold text-[#0A1F44] text-sm flex items-center gap-1.5">
                      <AlertCircle size={15} />
                      Customer Reason & Uploaded Photographs
                    </h3>
                    <p className="text-gray-700">
                      <strong>Issue Reported:</strong> <span className="capitalize">{selectedReturn.issueCategory.replace(/_/g, " ")}</span>
                    </p>
                    {selectedReturn.customerNotes && (
                      <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-200 italic text-gray-700">
                        "{selectedReturn.customerNotes}"
                      </div>
                    )}

                    {selectedReturn.evidenceUrls && selectedReturn.evidenceUrls.length > 0 ? (
                      <div>
                        <p className="font-medium text-gray-600 mb-2">Customer Evidence Photographs:</p>
                        <div className="flex flex-wrap gap-2">
                          {selectedReturn.evidenceUrls.map((url, i) => (
                            <button
                              key={i}
                              onClick={() => setPreviewPhoto(url)}
                              className="w-16 h-16 rounded-lg overflow-hidden border border-gray-300 hover:opacity-80 transition relative group"
                            >
                              <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white">
                                <Eye size={14} />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-400 italic">No condition photographs uploaded (Standard return / change of mind).</p>
                    )}
                  </div>

                  {/* Seller Quality Inspection Form (Enabled when parcel received) */}
                  {["PICKED_UP", "RECEIVED", "QUALITY_CHECK"].includes(selectedReturn.status) && (
                    <div className="border-2 border-indigo-200 rounded-xl p-4 bg-indigo-50/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="font-bold text-indigo-950 text-sm flex items-center gap-1.5">
                          <ShieldCheck size={16} className="text-indigo-700" />
                          Physical Quality Check & Inventory Restock
                        </h3>
                        {selectedReturn.status === "PICKED_UP" && (
                          <button
                            onClick={() => handleMarkReceived(selectedReturn.id)}
                            disabled={markingReceived}
                            className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded text-xs transition"
                          >
                            {markingReceived ? "Marking…" : "Mark Package Arrived at Workshop"}
                          </button>
                        )}
                      </div>

                      <p className="text-gray-600 text-[11px]">
                        Inspect the returned item upon arrival. Upon approval, inventory will be automatically restored to your available stock.
                      </p>

                      <div className="space-y-2 pt-2 border-t border-indigo-100">
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={conditionPass}
                            onChange={(e) => setConditionPass(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-0"
                          />
                          Saree is unworn, unwashed, and in original condition
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={tagsPresent}
                            onChange={(e) => setTagsPresent(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-0"
                          />
                          Original VASTRAA tags are attached intact
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={defectVerified}
                            onChange={(e) => setDefectVerified(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-0"
                          />
                          Condition matches customer return statement
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={packagingIntact}
                            onChange={(e) => setPackagingIntact(e.target.checked)}
                            className="rounded text-indigo-600 focus:ring-0"
                          />
                          Original saree box / royal packaging returned
                        </label>

                        <div className="mt-3">
                          <label className="block text-gray-700 font-medium mb-1">Inspection Notes / Comments:</label>
                          <textarea
                            value={qcNotes}
                            onChange={(e) => setQcNotes(e.target.value)}
                            placeholder="Enter physical inspection findings (weft, zari, border, folds)..."
                            rows={2}
                            className="w-full p-2 bg-white border border-gray-300 rounded-lg focus:outline-none focus:border-indigo-600 text-xs"
                          />
                        </div>

                        <div className="pt-2 flex justify-end gap-2">
                          <button
                            onClick={() => handleSellerQcSubmit(selectedReturn.id)}
                            disabled={submittingQc}
                            className="px-4 py-2 bg-indigo-700 hover:bg-indigo-800 text-white font-bold rounded-lg transition text-xs shadow-xs"
                          >
                            {submittingQc ? "Submitting QC…" : "Complete Quality Check & Update Inventory"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* QC Result Display if already inspected */}
                  {selectedReturn.qcDetails && (
                    <div className="p-3.5 rounded-xl border border-gray-200 bg-gray-50">
                      <p className="font-bold text-gray-900 mb-1">Quality Inspection Record:</p>
                      <p className="text-gray-700">
                        Result:{" "}
                        <strong className={selectedReturn.qcDetails.result === "pass" ? "text-emerald-700" : "text-rose-700"}>
                          {selectedReturn.qcDetails.result?.toUpperCase()}
                        </strong>
                        {" · "}
                        Restocked for resale:{" "}
                        <strong>{selectedReturn.qcDetails.approvedForResale ? "YES (Stock Synced)" : "NO"}</strong>
                      </p>
                      {selectedReturn.qcDetails.qcNotes && (
                        <p className="text-gray-600 italic mt-1">"{selectedReturn.qcDetails.qcNotes}"</p>
                      )}
                    </div>
                  )}
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
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Photo Lightbox */}
        <AnimatePresence>
          {previewPhoto && (
            <div
              className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80"
              onClick={() => setPreviewPhoto(null)}
            >
              <div className="relative max-w-3xl max-h-[85vh] overflow-hidden rounded-xl bg-white p-2" onClick={(e) => e.stopPropagation()}>
                <img src={previewPhoto} alt="Evidence Full Preview" className="max-w-full max-h-[80vh] object-contain rounded" />
                <button
                  onClick={() => setPreviewPhoto(null)}
                  className="absolute top-4 right-4 bg-black/60 text-white p-2 rounded-full hover:bg-black"
                >
                  ✕
                </button>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </SellerLayout>
  );
}
