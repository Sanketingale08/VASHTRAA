import React, { useState, useEffect } from "react";
import { Link, useSearch } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw,
  CheckCircle2,
  Clock,
  XCircle,
  Package,
  IndianRupee,
  Truck,
  ShieldCheck,
  AlertCircle,
  Plus,
  X,
  Loader2,
  Upload,
  Calendar,
  Layers,
  ArrowRight,
  Info,
  Check,
  Ban,
  Camera,
  RefreshCw,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

interface ReturnItemRecord {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  vendorId: string;
  vendorName?: string;
  isCustomized?: boolean;
  customBlouse?: boolean;
  isReturnable?: boolean;
  exchangePreference?: {
    size?: string;
    note?: string;
    replacementProductId?: string;
  };
}

interface ReturnDoc {
  id: string;
  returnNumber: string;
  orderId: string;
  orderDisplayId?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  vendorId: string;
  vendorName?: string;
  requestType: "return" | "exchange";
  items: ReturnItemRecord[];
  issueCategory: string;
  customerNotes: string;
  evidenceUrls: string[];
  status: string;
  reviewDecision?: {
    decision: "approved" | "rejected";
    reviewedBy: string;
    reviewedAt: string;
    reviewNotes?: string;
    rejectionReason?: string;
  };
  pickupDetails?: {
    pickupScheduledDate?: string;
    courierName?: string;
    awbNumber?: string;
    pickupStatus?: string;
    lastTrackingEvent?: string;
  };
  qcDetails?: {
    result: "pass" | "fail";
    qcNotes?: string;
    inspectedAt?: string;
  };
  refundDetails?: {
    refundAmount: number;
    refundMethod: string;
    refundStatus?: string;
    processedAt?: string;
  };
  exchangeDetails?: {
    replacementProductName?: string;
    replacementAwb?: string;
    replacementCourier?: string;
    stockAvailable?: boolean;
    fallbackToRefund?: boolean;
  };
  statusHistory: Array<{
    status: string;
    timestamp: string;
    actor: string;
    note?: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

interface EligibleOrder {
  orderId: string;
  displayId: string;
  createdAt: string;
  deliveredAt?: string;
  daysSinceDelivery?: number;
  daysRemaining?: number;
  eligible: boolean;
  ineligibleReason?: string;
  items: Array<{
    productId: string;
    name: string;
    eligible: boolean;
    isStandard?: boolean;
    reason?: string;
    existingReturnId?: string;
    existingStatus?: string;
  }>;
  total: number;
  orderData: {
    items: Array<{
      productId: string;
      name: string;
      price: number;
      quantity: number;
      image?: string;
      images?: string[];
      vendorId?: string;
      vendorName?: string;
      customBlouse?: boolean;
      isCustomized?: boolean;
    }>;
    address?: any;
  };
}

const REASONS = [
  { id: "damaged_item", label: "Item Received Damaged or Defective", requiresPhotos: true },
  { id: "wrong_item", label: "Wrong Item Delivered (different colour, style, or saree)", requiresPhotos: true },
  { id: "manufacturing_defect", label: "Manufacturing or Weaving Defect", requiresPhotos: true },
  { id: "materially_different", label: "Item Significantly Different from Description or Images", requiresPhotos: true },
  { id: "change_of_mind", label: "Unused Standard Product (Change of Mind within 7 days)", requiresPhotos: false },
];

const LIFECYCLE_STEPS = [
  { key: "PENDING", label: "Pending" },
  { key: "UNDER_REVIEW", label: "Under Review" },
  { key: "APPROVED", label: "Approved" },
  { key: "PICKUP_SCHEDULED", label: "Pickup Scheduled" },
  { key: "PICKED_UP", label: "Picked Up" },
  { key: "RECEIVED", label: "Received at Warehouse" },
  { key: "QUALITY_CHECK", label: "Quality Check" },
  { key: "REFUND_INITIATED", label: "Refund Initiated", exchangeKey: "EXCHANGE_PROCESSING", exchangeLabel: "Exchange Processing" },
  { key: "REFUND_COMPLETED", label: "Refund Completed", exchangeKey: "EXCHANGE_SHIPPED", exchangeLabel: "Exchange Shipped" },
  { key: "EXCHANGE_DELIVERED", label: "Exchange Delivered", exchangeOnly: true },
];

export function AccountReturnsRefundsPage() {
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const searchParams = new URLSearchParams(useSearch());
  const initialOrderId = searchParams.get("orderId") || "";
  const initialAction = searchParams.get("action") === "exchange" ? "exchange" : "return";

  const [returnsList, setReturnsList] = useState<ReturnDoc[]>([]);
  const [eligibleOrders, setEligibleOrders] = useState<EligibleOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "active" | "completed" | "rejected">("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId);
  const [requestType, setRequestType] = useState<"return" | "exchange">(initialAction);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [selectedReason, setSelectedReason] = useState<string>(REASONS[0].id);
  const [customerNotes, setCustomerNotes] = useState("");
  const [exchangeNote, setExchangeNote] = useState("");
  const [exchangeSize, setExchangeSize] = useState("");
  const [evidenceUrls, setEvidenceUrls] = useState<string[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [refundMethod, setRefundMethod] = useState<"original_payment" | "bank_transfer" | "store_credit">("original_payment");
  const [bankAccount, setBankAccount] = useState("");
  const [bankIfsc, setBankIfsc] = useState("");
  const [bankHolder, setBankHolder] = useState("");
  const [bankName, setBankName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");

  const loadData = async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const [retRes, eligRes] = await Promise.all([
        apiFetch("/api/returns"),
        apiFetch("/api/returns/eligible-orders"),
      ]);

      if (retRes.ok) {
        const d = await retRes.json();
        setReturnsList(d.returns || []);
      }
      if (eligRes.ok) {
        const d = await eligRes.json();
        setEligibleOrders(d.eligibleOrders || []);
      }
    } catch (e) {
      console.error("Error loading return data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isSignedIn) {
      loadData();
    } else {
      setLoading(false);
    }
  }, [authLoading, isSignedIn]);

  useEffect(() => {
    if (initialOrderId && eligibleOrders.length > 0) {
      const found = eligibleOrders.find(
        (o) => o.orderId === initialOrderId || o.displayId === initialOrderId
      );
      if (found) {
        setSelectedOrderId(found.orderId);
        setIsModalOpen(true);
      }
    }
  }, [initialOrderId, eligibleOrders]);

  // Real-time synchronization
  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (
        [
          "return:created",
          "return:updated",
          "refund:processed",
          "order:status_changed",
        ].includes(detail.name)
      ) {
        if (isSignedIn) loadData();
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [isSignedIn]);

  // Handle selected order change in modal
  const currentOrder = eligibleOrders.find((o) => o.orderId === selectedOrderId);

  // Set default selected product when order is chosen
  useEffect(() => {
    if (currentOrder && currentOrder.items) {
      const eligibleItem = currentOrder.items.find((i) => i.eligible);
      if (eligibleItem && !selectedProductIds.includes(eligibleItem.productId)) {
        setSelectedProductIds([eligibleItem.productId]);
      }
    }
  }, [selectedOrderId, currentOrder]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingImage(true);
    setSubmitError("");
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await apiFetch("/api/returns/upload-evidence", {
          method: "POST",
          headers: {
            "Content-Type": file.type || "image/jpeg",
          },
          body: file,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.url) {
            setEvidenceUrls((prev) => [...prev, data.url]);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "Failed to upload photograph");
        }
      }
    } catch (err: any) {
      setSubmitError(err.message || "Failed to upload photograph");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleCancelReturn = async (returnId: string) => {
    if (!confirm("Are you sure you want to cancel this return request?")) return;
    try {
      const res = await apiFetch(`/api/returns/${returnId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Cancelled by customer" }),
      });
      if (res.ok) {
        loadData();
      } else {
        const err = await res.json();
        alert(err.error || "Failed to cancel return request");
      }
    } catch {
      alert("Network error cancelling return request");
    }
  };

  const handleSubmitReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) {
      setSubmitError("Please select an eligible order.");
      return;
    }
    if (selectedProductIds.length === 0) {
      setSubmitError("Please select at least one eligible product to return or exchange.");
      return;
    }

    const currentReasonObj = REASONS.find((r) => r.id === selectedReason);
    if (currentReasonObj?.requiresPhotos && evidenceUrls.length === 0) {
      setSubmitError("Photographs showing the defect, damage, or discrepancy are required for this return reason.");
      return;
    }

    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const payload: any = {
        orderId: selectedOrderId,
        requestType,
        issueCategory: selectedReason,
        customerNotes: customerNotes.trim(),
        evidenceUrls,
        selectedItems: selectedProductIds.map((id) => ({
          productId: id,
          quantity: 1,
          exchangePreference:
            requestType === "exchange"
              ? {
                  size: exchangeSize || undefined,
                  note: exchangeNote.trim() || undefined,
                }
              : undefined,
        })),
        preferredRefundMethod: refundMethod,
      };

      if (refundMethod === "bank_transfer") {
        payload.bankDetails = {
          accountNumber: bankAccount,
          ifsc: bankIfsc,
          accountHolderName: bankHolder,
          bankName: bankName,
        };
      }

      const res = await apiFetch("/api/returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit request.");
      }

      setSubmitSuccess(
        requestType === "return"
          ? "Return request submitted successfully! Pickup will be scheduled once our care team reviews your request."
          : "Exchange request submitted successfully! We will arrange pickup and reserve your replacement item."
      );

      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitSuccess("");
        setSelectedProductIds([]);
        setEvidenceUrls([]);
        setCustomerNotes("");
        setExchangeNote("");
        loadData();
      }, 1800);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter returns by tab
  let filteredReturns = returnsList;
  if (activeTab === "active") {
    filteredReturns = returnsList.filter(
      (r) => !["REFUND_COMPLETED", "EXCHANGE_DELIVERED", "REJECTED", "QC_FAILED", "CANCELLED"].includes(r.status)
    );
  } else if (activeTab === "completed") {
    filteredReturns = returnsList.filter((r) =>
      ["REFUND_COMPLETED", "EXCHANGE_DELIVERED"].includes(r.status)
    );
  } else if (activeTab === "rejected") {
    filteredReturns = returnsList.filter((r) =>
      ["REJECTED", "QC_FAILED", "CANCELLED"].includes(r.status)
    );
  }

  // Summary counts
  const totalClaims = returnsList.length;
  const activeClaims = returnsList.filter(
    (r) => !["REFUND_COMPLETED", "EXCHANGE_DELIVERED", "REJECTED", "QC_FAILED", "CANCELLED"].includes(r.status)
  ).length;
  const completedClaims = returnsList.filter((r) =>
    ["REFUND_COMPLETED", "EXCHANGE_DELIVERED"].includes(r.status)
  ).length;
  const totalRefundsValue = returnsList
    .filter((r) => r.status === "REFUND_COMPLETED" || (r.status as any) === "REFUNDED")
    .reduce((sum, r) => sum + (r.refundDetails?.refundAmount || 0), 0);

  if (loading || authLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-[50vh] flex flex-col items-center justify-center gap-3">
          <Loader2 className="animate-spin text-[#0A1F44]" size={36} />
          <p className="text-xs text-gray-500 font-medium tracking-wide">Loading returns and order eligibility...</p>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-5xl">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[#C7CCD1]/20">
          <div>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">
              Returns &amp; Exchanges
            </h1>
            <p className="text-xs lg:text-sm text-gray-500 mt-1">
              Real-time returns management, exchange fulfillment, and refund tracking.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/returns"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#0A1F44]/20 text-[#0A1F44] hover:bg-[#0A1F44]/5 text-xs font-semibold transition-colors"
            >
              <Info size={14} /> View 7-Day Policy
            </Link>
            <button
              onClick={() => {
                setIsModalOpen(true);
                setSubmitError("");
                setSubmitSuccess("");
              }}
              className="inline-flex items-center gap-1.5 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white px-4 py-2 rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0"
            >
              <Plus size={15} /> Raise Return / Exchange
            </button>
          </div>
        </div>

        {/* Policy Reminder Banner */}
        <div className="bg-gradient-to-r from-[#0A1F44]/5 to-transparent border border-[#0A1F44]/15 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 text-[#0A1F44] shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-[#0A1F44]">Important Product Eligibility Notice</p>
              <p className="text-gray-600 mt-0.5">
                Only standard, non-customized sarees are eligible for return or exchange within 7 calendar days of delivery. Custom-stitched blouses and personalized items are non-returnable.
              </p>
            </div>
          </div>
          <Link
            href="/returns"
            className="text-[#0A1F44] font-bold underline hover:text-[#2C3E6B] whitespace-nowrap self-end sm:self-center"
          >
            Learn More →
          </Link>
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 shadow-sm">
            <p className="text-xs text-gray-500 font-medium">Total Claims</p>
            <p className="text-xl sm:text-2xl font-bold text-[#0A1F44] mt-1">{totalClaims}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 shadow-sm">
            <p className="text-xs text-orange-600 font-medium">Active Requests</p>
            <p className="text-xl sm:text-2xl font-bold text-[#0A1F44] mt-1">{activeClaims}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 shadow-sm">
            <p className="text-xs text-emerald-600 font-medium">Completed</p>
            <p className="text-xl sm:text-2xl font-bold text-[#0A1F44] mt-1">{completedClaims}</p>
          </div>
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 shadow-sm">
            <p className="text-xs text-blue-600 font-medium">Total Refunded</p>
            <p className="text-xl sm:text-2xl font-bold text-[#0A1F44] mt-1">
              ₹{totalRefundsValue.toLocaleString("en-IN")}
            </p>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[#C7CCD1]/20 no-scrollbar">
          {[
            { key: "all", label: "All Requests", count: returnsList.length },
            { key: "active", label: "In Progress / Active", count: activeClaims },
            { key: "completed", label: "Completed", count: completedClaims },
            { key: "rejected", label: "Rejected / Cancelled", count: returnsList.filter((r) => ["REJECTED", "QC_FAILED", "CANCELLED"].includes(r.status)).length },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  active
                    ? "bg-[#0A1F44] text-white shadow-sm"
                    : "bg-white text-gray-600 hover:bg-gray-100 hover:text-[#0A1F44] border border-[#C7CCD1]/20"
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 text-[10px] rounded-full font-bold ${active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Return Requests List */}
        {filteredReturns.length === 0 ? (
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-12 text-center shadow-sm">
            <div className="w-14 h-14 rounded-2xl bg-[#0A1F44]/5 text-[#0A1F44] flex items-center justify-center mx-auto mb-4">
              <RotateCcw className="w-7 h-7" />
            </div>
            <h3 className="font-serif text-lg font-bold text-[#0A1F44]">No return or exchange claims found</h3>
            <p className="text-xs text-gray-500 max-w-md mx-auto mt-1 mb-6">
              You do not have any {activeTab !== "all" ? activeTab : ""} return or exchange requests at this moment.
            </p>
            {eligibleOrders.some((o) => o.eligible) && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs font-semibold px-6 py-2.5 rounded-lg transition-colors inline-flex items-center gap-2"
              >
                <Plus size={14} /> Submit Return for Delivered Order
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReturns.map((ret) => {
              const item = ret.items[0];
              const isExchange = ret.requestType === "exchange";

              return (
                <div
                  key={ret.id}
                  className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-5 sm:p-6 shadow-sm hover:border-[#0A1F44]/30 transition-all"
                >
                  {/* Top Claim Meta */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#0A1F44]">
                          #{ret.returnNumber}
                        </span>
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-md uppercase tracking-wider ${
                            isExchange
                              ? "bg-purple-50 text-purple-700 border border-purple-200"
                              : "bg-blue-50 text-blue-700 border border-blue-200"
                          }`}
                        >
                          {isExchange ? "Exchange Claim" : "Return & Refund"}
                        </span>
                        <span className="text-xs text-gray-400">·</span>
                        <span className="text-xs text-gray-500">
                          Order #{ret.orderDisplayId || ret.orderId}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        Submitted on {new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full ${
                          ret.status === "REFUND_COMPLETED" || ret.status === "EXCHANGE_DELIVERED"
                            ? "bg-emerald-100 text-emerald-800"
                            : ret.status === "REJECTED" || ret.status === "QC_FAILED"
                            ? "bg-red-100 text-red-800"
                            : ret.status === "CANCELLED"
                            ? "bg-gray-100 text-gray-700"
                            : "bg-amber-100 text-amber-800 animate-pulse"
                        }`}
                      >
                        {ret.status.replace(/_/g, " ")}
                      </span>

                      {["PENDING", "UNDER_REVIEW", "APPROVED"].includes(ret.status) && (
                        <button
                          onClick={() => handleCancelReturn(ret.id)}
                          className="text-[11px] text-gray-500 hover:text-red-600 font-semibold px-2 py-1 border border-gray-200 rounded-md hover:border-red-200 transition-colors"
                        >
                          Cancel Claim
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Items Display */}
                  <div className="py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={getProductImageSrc(item?.image)}
                        alt={item?.name || "Saree"}
                        onError={replaceProductImageWithFallback}
                        className="w-16 h-16 rounded-xl object-cover border border-gray-100 shrink-0"
                      />
                      <div>
                        <h4 className="font-serif font-bold text-[#0A1F44] text-sm sm:text-base">
                          {item?.name}
                        </h4>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Sold by: <span className="font-semibold text-gray-700">{ret.vendorName || "Artisan Shop"}</span>
                        </p>
                        <p className="text-xs font-bold text-[#0A1F44] mt-1">
                          ₹{item?.price?.toLocaleString("en-IN")} × {item?.quantity || 1}
                        </p>
                      </div>
                    </div>

                    <div className="text-right sm:text-right w-full sm:w-auto bg-[#F8F9FA] sm:bg-transparent p-3 sm:p-0 rounded-xl">
                      <p className="text-xs text-gray-500">
                        {isExchange ? "Exchange Value" : "Refund Amount"}
                      </p>
                      <p className="font-bold text-[#0A1F44] text-base sm:text-lg">
                        ₹{(ret.refundDetails?.refundAmount || item?.price || 0).toLocaleString("en-IN")}
                      </p>
                      <span className="text-[11px] text-gray-500 capitalize">
                        Method: {ret.refundDetails?.refundMethod?.replace(/_/g, " ") || "Original Payment"}
                      </span>
                    </div>
                  </div>

                  {/* Visual Real-Time Lifecycle Tracker */}
                  <div className="mt-2 pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold text-[#0A1F44] mb-3 flex items-center gap-1.5">
                      <Clock size={14} className="text-[#0A1F44]" />
                      Real-Time Lifecycle Tracker (14-Stage Progress)
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 text-center text-[10px]">
                      {[
                        { key: "PENDING", label: "01. Pending" },
                        { key: "APPROVED", label: "02. Approved" },
                        { key: "PICKUP_SCHEDULED", label: "03. Reverse Pickup" },
                        { key: "RECEIVED", label: "04. Warehouse QC" },
                        { key: isExchange ? "EXCHANGE_PROCESSING" : "REFUND_INITIATED", label: isExchange ? "05. Replacement" : "05. Refund Queued" },
                        { key: isExchange ? "EXCHANGE_SHIPPED" : "REFUND_COMPLETED", label: isExchange ? "06. Dispatched" : "06. Refund Paid" },
                        { key: isExchange ? "EXCHANGE_DELIVERED" : "REFUND_COMPLETED", label: isExchange ? "07. Delivered" : "07. Closed" },
                      ].map((step, idx) => {
                        const isCurrent = ret.status === step.key || (ret.status === "UNDER_REVIEW" && step.key === "PENDING");
                        const isPast = ret.statusHistory.some((h) => h.status === step.key) ||
                          (["APPROVED", "PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "QUALITY_CHECK", "REFUND_INITIATED", "REFUND_COMPLETED", "EXCHANGE_PROCESSING", "EXCHANGE_SHIPPED", "EXCHANGE_DELIVERED"].includes(ret.status) && idx === 0) ||
                          (["PICKUP_SCHEDULED", "PICKED_UP", "RECEIVED", "QUALITY_CHECK", "REFUND_INITIATED", "REFUND_COMPLETED", "EXCHANGE_PROCESSING", "EXCHANGE_SHIPPED", "EXCHANGE_DELIVERED"].includes(ret.status) && idx <= 1) ||
                          (["RECEIVED", "QUALITY_CHECK", "REFUND_INITIATED", "REFUND_COMPLETED", "EXCHANGE_PROCESSING", "EXCHANGE_SHIPPED", "EXCHANGE_DELIVERED"].includes(ret.status) && idx <= 2) ||
                          (["QUALITY_CHECK", "REFUND_INITIATED", "REFUND_COMPLETED", "EXCHANGE_PROCESSING", "EXCHANGE_SHIPPED", "EXCHANGE_DELIVERED"].includes(ret.status) && idx <= 3);

                        return (
                          <div
                            key={step.key + idx}
                            className={`p-2 rounded-lg border transition-all ${
                              isCurrent
                                ? "bg-[#0A1F44] text-white font-bold border-[#0A1F44] shadow-sm"
                                : isPast
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200 font-medium"
                                : "bg-gray-50 text-gray-400 border-gray-100"
                            }`}
                          >
                            <span>{step.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Customer Reason & Photo Evidence */}
                  <div className="mt-4 bg-[#F8F9FA] rounded-xl p-3.5 text-xs border border-gray-100">
                    <p className="text-gray-700">
                      <strong className="text-[#0A1F44]">Customer Reason:</strong>{" "}
                      {REASONS.find((r) => r.id === ret.issueCategory)?.label || ret.issueCategory}
                    </p>
                    {ret.customerNotes && (
                      <p className="text-gray-600 mt-1 italic">"{ret.customerNotes}"</p>
                    )}

                    {/* Exchange Preference Details */}
                    {isExchange && item?.exchangePreference && (
                      <div className="mt-2 p-2.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-900">
                        <p className="font-bold">Customer Replacement Request:</p>
                        <p className="mt-0.5">
                          {item.exchangePreference.note || "Same product replacement"}
                          {item.exchangePreference.size ? ` (Size: ${item.exchangePreference.size})` : ""}
                        </p>
                        {ret.exchangeDetails?.replacementAwb && (
                          <p className="mt-1 font-semibold text-purple-800">
                            Replacement Shipment AWB: {ret.exchangeDetails.replacementAwb} ({ret.exchangeDetails.replacementCourier})
                          </p>
                        )}
                      </div>
                    )}

                    {/* Reverse Pickup details */}
                    {ret.pickupDetails?.awbNumber && (
                      <div className="mt-2 p-2.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-900">
                        <p className="font-bold">Reverse Pickup Details:</p>
                        <p className="mt-0.5">
                          Courier: {ret.pickupDetails.courierName} · AWB: {ret.pickupDetails.awbNumber}
                        </p>
                        {ret.pickupDetails.pickupScheduledDate && (
                          <p className="mt-0.5">
                            Scheduled Date: {new Date(ret.pickupDetails.pickupScheduledDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        )}
                        {ret.pickupDetails.lastTrackingEvent && (
                          <p className="mt-1 text-blue-800 italic">
                            Last Tracking: {ret.pickupDetails.lastTrackingEvent}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Rejection / QC failure reason */}
                    {(ret.reviewDecision?.rejectionReason || ret.qcDetails?.qcNotes) && (
                      <div className="mt-2 p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-900">
                        <p className="font-bold">Notice from Quality &amp; Verification Team:</p>
                        <p className="mt-0.5">
                          {ret.reviewDecision?.rejectionReason || ret.qcDetails?.qcNotes}
                        </p>
                      </div>
                    )}

                    {/* Photo attachments */}
                    {ret.evidenceUrls && ret.evidenceUrls.length > 0 && (
                      <div className="mt-3">
                        <p className="font-semibold text-gray-700 mb-1.5 flex items-center gap-1">
                          <Camera size={13} /> Uploaded Photographs ({ret.evidenceUrls.length}):
                        </p>
                        <div className="flex gap-2 overflow-x-auto pb-1">
                          {ret.evidenceUrls.map((url, i) => (
                            <a
                              key={i}
                              href={url}
                              target="_blank"
                              rel="noreferrer"
                              className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shrink-0 block hover:opacity-80 transition-opacity"
                            >
                              <img src={url} alt={`Evidence ${i + 1}`} className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal: Raise Return / Exchange */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl relative my-8 border border-gray-100 max-h-[90vh] overflow-y-auto"
              >
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 p-1 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} />
                </button>

                <div className="mb-6">
                  <h2 className="font-serif text-2xl font-bold text-[#0A1F44]">
                    Raise Return or Exchange Request
                  </h2>
                  <p className="text-xs text-gray-500 mt-1">
                    Standard non-customized sarees delivered within 7 calendar days are eligible.
                  </p>
                </div>

                {submitError && (
                  <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-800 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{submitError}</span>
                  </div>
                )}

                {submitSuccess && (
                  <div className="mb-5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{submitSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleSubmitReturn} className="space-y-5">
                  {/* Step 1: Select Delivered Order */}
                  <div>
                    <label className="block text-xs font-bold text-[#0A1F44] uppercase tracking-wider mb-1.5">
                      1. Select Delivered Order
                    </label>
                    <select
                      value={selectedOrderId}
                      onChange={(e) => {
                        setSelectedOrderId(e.target.value);
                        setSelectedProductIds([]);
                      }}
                      required
                      className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0A1F44] bg-white"
                    >
                      <option value="">-- Choose Delivered Order --</option>
                      {eligibleOrders.map((ord) => (
                        <option key={ord.orderId} value={ord.orderId}>
                          Order #{ord.displayId} (Delivered:{" "}
                          {ord.deliveredAt
                            ? new Date(ord.deliveredAt).toLocaleDateString("en-IN")
                            : "Delivered"}
                          {ord.daysRemaining !== undefined ? ` · ${ord.daysRemaining} days left` : ""})
                          {ord.eligible ? " - Eligible" : " - Policy Restrictions Apply"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Step 2: Request Type (Return vs Exchange) */}
                  <div>
                    <label className="block text-xs font-bold text-[#0A1F44] uppercase tracking-wider mb-1.5">
                      2. Choose Request Type
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setRequestType("return")}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-start gap-3 ${
                          requestType === "return"
                            ? "border-[#0A1F44] bg-[#0A1F44]/5 text-[#0A1F44] shadow-sm"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <RotateCcw className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <p>Return &amp; Refund</p>
                          <p className="text-[10px] text-gray-500 font-normal">
                            Return item for 100% refund after QC pass.
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRequestType("exchange")}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all text-left flex items-start gap-3 ${
                          requestType === "exchange"
                            ? "border-purple-600 bg-purple-50 text-purple-950 shadow-sm"
                            : "border-gray-200 text-gray-600 hover:border-gray-300"
                        }`}
                      >
                        <RefreshCw className="w-5 h-5 shrink-0 mt-0.5" />
                        <div>
                          <p>Exchange Replacement</p>
                          <p className="text-[10px] text-gray-500 font-normal">
                            Swap for another size or design variation.
                          </p>
                        </div>
                      </button>
                    </div>
                  </div>

                  {/* Step 3: Select Individual Products & Verify Eligibility */}
                  {currentOrder && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-[#0A1F44] uppercase tracking-wider">
                          3. Select Item(s) to {requestType === "exchange" ? "Exchange" : "Return"}
                        </label>
                        <span className="text-[11px] text-gray-500">
                          Order delivery: {currentOrder.daysRemaining} days remaining in return window
                        </span>
                      </div>

                      <div className="space-y-2 border border-gray-200 rounded-xl p-3 bg-[#F8F9FA]">
                        {currentOrder.orderData.items.map((prod) => {
                          const itemElig = currentOrder.items?.find((i) => i.productId === prod.productId);
                          const isEligible = itemElig?.eligible ?? true;
                          const isChecked = selectedProductIds.includes(prod.productId);

                          return (
                            <div
                              key={prod.productId}
                              className={`p-3 rounded-xl border flex items-center justify-between gap-3 transition-all ${
                                isChecked
                                  ? "border-[#0A1F44] bg-white shadow-sm"
                                  : isEligible
                                  ? "border-gray-200 bg-white/60 hover:bg-white"
                                  : "border-red-200 bg-red-50/50 opacity-75"
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                <input
                                  type="checkbox"
                                  disabled={!isEligible}
                                  checked={isChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedProductIds((prev) => [...prev, prod.productId]);
                                    } else {
                                      setSelectedProductIds((prev) =>
                                        prev.filter((id) => id !== prod.productId)
                                      );
                                    }
                                  }}
                                  className="w-4 h-4 text-[#0A1F44] rounded border-gray-300 focus:ring-[#0A1F44]"
                                />
                                <img
                                  src={getProductImageSrc(prod.image || prod.images?.[0])}
                                  alt={prod.name}
                                  onError={replaceProductImageWithFallback}
                                  className="w-12 h-12 rounded-lg object-cover border border-gray-100 shrink-0"
                                />
                                <div>
                                  <p className="font-semibold text-xs text-[#0A1F44]">{prod.name}</p>
                                  <p className="text-[11px] text-gray-500 font-mono">
                                    ₹{prod.price?.toLocaleString("en-IN")} × {prod.quantity || 1}
                                  </p>
                                </div>
                              </div>

                              <div className="text-right">
                                {isEligible ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-0.5 rounded-full">
                                    <CheckCircle2 size={11} /> Eligible Standard Saree
                                  </span>
                                ) : (
                                  <div>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-700 bg-red-100 px-2.5 py-0.5 rounded-full">
                                      <Ban size={11} /> Not Eligible
                                    </span>
                                    <p className="text-[10px] text-red-600 mt-0.5 max-w-[180px]">
                                      {itemElig?.reason || "Non-returnable product"}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Step 4: Reason Selection */}
                  <div>
                    <label className="block text-xs font-bold text-[#0A1F44] uppercase tracking-wider mb-1.5">
                      4. Reason for {requestType === "exchange" ? "Exchange" : "Return"}
                    </label>
                    <select
                      value={selectedReason}
                      onChange={(e) => setSelectedReason(e.target.value)}
                      required
                      className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0A1F44] bg-white"
                    >
                      {REASONS.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.label} {r.requiresPhotos ? "(Photos Required)" : "(Unused Standard Product)"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Step 5: Exchange Replacement Preference (if exchange) */}
                  {requestType === "exchange" && (
                    <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-purple-900 uppercase tracking-wider">
                        Exchange Preferences
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] text-gray-700 font-semibold mb-1">
                            Replacement Size / Variation
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. 5.5m with unstitched blouse / Color variation"
                            value={exchangeSize}
                            onChange={(e) => setExchangeSize(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-lg border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-gray-700 font-semibold mb-1">
                            Exchange Notes
                          </label>
                          <input
                            type="text"
                            placeholder="Details on replacement saree preference"
                            value={exchangeNote}
                            onChange={(e) => setExchangeNote(e.target.value)}
                            className="w-full text-xs p-2.5 rounded-lg border border-purple-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-600"
                          />
                        </div>
                      </div>
                      <p className="text-[11px] text-purple-800">
                        * Note: If the replacement product price differs, payment difference or refund will be adjusted.
                      </p>
                    </div>
                  )}

                  {/* Step 6: Photo Upload */}
                  <div>
                    <label className="block text-xs font-bold text-[#0A1F44] uppercase tracking-wider mb-1.5">
                      5. Supporting Photographs
                      {REASONS.find((r) => r.id === selectedReason)?.requiresPhotos ? (
                        <span className="text-red-500 font-normal"> (Required for defect/damage)</span>
                      ) : (
                        <span className="text-gray-400 font-normal"> (Optional for change of mind)</span>
                      )}
                    </label>

                    <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center hover:border-[#0A1F44] transition-colors bg-gray-50/50">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleImageUpload}
                        id="evidence-file-input"
                        className="hidden"
                      />
                      <label
                        htmlFor="evidence-file-input"
                        className="cursor-pointer flex flex-col items-center gap-1.5"
                      >
                        {uploadingImage ? (
                          <Loader2 className="w-6 h-6 animate-spin text-[#0A1F44]" />
                        ) : (
                          <Upload className="w-6 h-6 text-gray-400" />
                        )}
                        <span className="text-xs font-semibold text-[#0A1F44]">
                          {uploadingImage ? "Uploading photos..." : "Click to upload product condition photos"}
                        </span>
                        <span className="text-[10px] text-gray-500">
                          PNG, JPG up to 10MB each showing defects, tags, and packaging
                        </span>
                      </label>
                    </div>

                    {evidenceUrls.length > 0 && (
                      <div className="flex gap-2 overflow-x-auto mt-2.5 pb-1">
                        {evidenceUrls.map((url, i) => (
                          <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                            <img src={url} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                            <button
                              type="button"
                              onClick={() => setEvidenceUrls((prev) => prev.filter((_, idx) => idx !== i))}
                              className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5 hover:bg-black"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Step 7: Additional Notes */}
                  <div>
                    <label className="block text-xs font-bold text-[#0A1F44] uppercase tracking-wider mb-1.5">
                      6. Additional Comments / Details
                    </label>
                    <textarea
                      rows={2}
                      value={customerNotes}
                      onChange={(e) => setCustomerNotes(e.target.value)}
                      placeholder="Describe the condition, packaging, or special instructions..."
                      className="w-full text-xs p-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#0A1F44]"
                    />
                  </div>

                  {/* Step 8: Refund Method (if return) */}
                  {requestType === "return" && (
                    <div className="space-y-3 pt-2 border-t border-gray-100">
                      <label className="block text-xs font-bold text-[#0A1F44] uppercase tracking-wider mb-1.5">
                        7. Preferred Refund Destination
                      </label>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                        <label
                          className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2 ${
                            refundMethod === "original_payment"
                              ? "border-[#0A1F44] bg-[#0A1F44]/5 font-bold"
                              : "border-gray-200"
                          }`}
                        >
                          <input
                            type="radio"
                            name="refundMethod"
                            checked={refundMethod === "original_payment"}
                            onChange={() => setRefundMethod("original_payment")}
                            className="text-[#0A1F44]"
                          />
                          <span>Original Payment</span>
                        </label>

                        <label
                          className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2 ${
                            refundMethod === "bank_transfer"
                              ? "border-[#0A1F44] bg-[#0A1F44]/5 font-bold"
                              : "border-gray-200"
                          }`}
                        >
                          <input
                            type="radio"
                            name="refundMethod"
                            checked={refundMethod === "bank_transfer"}
                            onChange={() => setRefundMethod("bank_transfer")}
                            className="text-[#0A1F44]"
                          />
                          <span>Bank Account (NEFT)</span>
                        </label>

                        <label
                          className={`p-3 rounded-xl border cursor-pointer flex items-center gap-2 ${
                            refundMethod === "store_credit"
                              ? "border-[#0A1F44] bg-[#0A1F44]/5 font-bold"
                              : "border-gray-200"
                          }`}
                        >
                          <input
                            type="radio"
                            name="refundMethod"
                            checked={refundMethod === "store_credit"}
                            onChange={() => setRefundMethod("store_credit")}
                            className="text-[#0A1F44]"
                          />
                          <span>VASTRAA Store Credit</span>
                        </label>
                      </div>

                      {refundMethod === "bank_transfer" && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 rounded-xl bg-gray-50 border border-gray-200 mt-2">
                          <input
                            type="text"
                            placeholder="Account Holder Name"
                            value={bankHolder}
                            onChange={(e) => setBankHolder(e.target.value)}
                            className="text-xs p-2.5 rounded-lg border border-gray-300 bg-white"
                          />
                          <input
                            type="text"
                            placeholder="Bank Name"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            className="text-xs p-2.5 rounded-lg border border-gray-300 bg-white"
                          />
                          <input
                            type="text"
                            placeholder="Account Number"
                            value={bankAccount}
                            onChange={(e) => setBankAccount(e.target.value)}
                            className="text-xs p-2.5 rounded-lg border border-gray-300 bg-white"
                          />
                          <input
                            type="text"
                            placeholder="IFSC Code"
                            value={bankIfsc}
                            onChange={(e) => setBankIfsc(e.target.value)}
                            className="text-xs p-2.5 rounded-lg border border-gray-300 bg-white"
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2.5 text-xs font-semibold text-gray-600 hover:text-gray-800 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs font-bold px-6 py-2.5 rounded-xl transition-all shadow-md disabled:opacity-50 flex items-center gap-2"
                    >
                      {submitting ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Submitting...
                        </>
                      ) : (
                        `Confirm & Submit ${requestType === "exchange" ? "Exchange" : "Return"}`
                      )}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

export default AccountReturnsRefundsPage;
