import React, { useState, useEffect } from "react";
import { Link } from "wouter";
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
  ArrowRight,
  ShieldCheck,
  CreditCard,
  AlertCircle,
  Plus,
  X,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  images?: string[];
  vendorName?: string;
};

type Order = {
  id: string;
  displayId?: string | null;
  items: OrderItem[];
  total: number;
  status: string;
  createdAt: string;
  returnReason?: string | null;
  refundStatus?: string | null;
  refundProcessedAt?: string | null;
  refundReference?: string | null;
};

const RETURN_REASONS = [
  "Item received in damaged / defective condition",
  "Wrong item or wrong color delivered",
  "Product significantly different from description",
  "Quality / fabric not as expected",
  "Size or fit issue",
  "Other (Change of mind)",
];

export function AccountReturnsRefundsPage() {
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"all" | "requested" | "approved" | "processed" | "rejected">("all");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>("");
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnNotes, setReturnNotes] = useState("");
  const [refundMethod, setRefundMethod] = useState<"original_payment" | "store_credit" | "bank_transfer">("original_payment");
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitError, setSubmitError] = useState("");

  const loadOrders = async () => {
    if (!isSignedIn) return;
    setLoading(true);
    try {
      const res = await apiFetch(`/api/orders`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isSignedIn) {
      loadOrders();
    } else {
      setLoading(false);
    }
  }, [authLoading, isSignedIn]);

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (["return:created", "return:updated", "return:approved", "refund:processed", "refund:approved", "order:status_changed"].includes(detail.name)) {
        if (isSignedIn) {
          loadOrders();
        }
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [isSignedIn]);

  // Filter return/refund orders
  const returnOrders = orders.filter((o) =>
    ["return_requested", "returned"].includes(o.status) || !!o.refundStatus
  );

  const activeReturnRequests = returnOrders.filter(
    (o) => o.status === "return_requested" || o.refundStatus === "approved" || o.refundStatus === "requested"
  );
  const completedRefunds = returnOrders.filter(
    (o) => o.refundStatus === "processed" || o.status === "returned"
  );
  const totalRefundedAmount = completedRefunds.reduce((sum, o) => sum + o.total, 0);

  const eligibleForReturn = orders.filter(
    (o) => o.status === "delivered" && !o.refundStatus
  );

  let filteredReturns = returnOrders;
  if (activeTab === "requested") {
    filteredReturns = returnOrders.filter(
      (o) => o.status === "return_requested" || o.refundStatus === "requested"
    );
  } else if (activeTab === "approved") {
    filteredReturns = returnOrders.filter((o) => o.refundStatus === "approved");
  } else if (activeTab === "processed") {
    filteredReturns = returnOrders.filter((o) => o.refundStatus === "processed");
  } else if (activeTab === "rejected") {
    filteredReturns = returnOrders.filter((o) => o.refundStatus === "rejected");
  }

  const handleCreateReturn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrderId) {
      setSubmitError("Please select an order to return");
      return;
    }
    setSubmitting(true);
    setSubmitError("");
    setSubmitSuccess("");

    try {
      const res = await apiFetch(`/api/orders/${selectedOrderId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: returnReason,
          notes: returnNotes,
          preferredRefundMethod: refundMethod,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit return request");
      }

      setSubmitSuccess("Return request submitted successfully! Our care team will process pickup within 24 hours.");
      setTimeout(() => {
        setIsModalOpen(false);
        setSubmitSuccess("");
        loadOrders();
      }, 1800);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit request.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || authLoading) {
    return (
      <DashboardLayout>
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-[#0A1F44]" size={32} />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">
              Returns &amp; Refunds
            </h1>
            <p className="text-xs lg:text-sm text-gray-500 mt-1">
              Track return requests, inspect refund statuses, and raise new returns.
            </p>
          </div>
          {eligibleForReturn.length > 0 && (
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white px-4 py-2.5 rounded-lg text-xs font-semibold shadow-sm transition-colors shrink-0"
            >
              <Plus size={15} /> Request Return
            </button>
          )}
        </div>

        {/* Stats summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-orange-50 text-orange-600 flex items-center justify-center shrink-0">
              <RotateCcw size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#3D1A1A]">{activeReturnRequests.length}</p>
              <p className="text-xs text-gray-500 font-medium">Active Requests</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#3D1A1A]">{completedRefunds.length}</p>
              <p className="text-xs text-gray-500 font-medium">Completed Refunds</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 flex items-center gap-4 shadow-sm">
            <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <IndianRupee size={20} />
            </div>
            <div>
              <p className="text-xl font-bold text-[#3D1A1A]">₹{totalRefundedAmount.toLocaleString("en-IN")}</p>
              <p className="text-xs text-gray-500 font-medium">Total Amount Refunded</p>
            </div>
          </div>
        </div>

        {/* Status Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-[#C7CCD1]/20 no-scrollbar">
          {[
            { key: "all", label: "All Returns", count: returnOrders.length },
            { key: "requested", label: "In Progress / Requested", count: activeReturnRequests.length },
            { key: "approved", label: "Approved", count: returnOrders.filter((o) => o.refundStatus === "approved").length },
            { key: "processed", label: "Refund Paid Out", count: completedRefunds.length },
            { key: "rejected", label: "Rejected", count: returnOrders.filter((o) => o.refundStatus === "rejected").length },
          ].map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex items-center gap-1.5 ${
                  active
                    ? "bg-[#0A1F44] text-white shadow-sm font-semibold"
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

        {/* Return list */}
        {filteredReturns.length === 0 ? (
          <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-10 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-[#F4F5F7] text-gray-400 flex items-center justify-center mx-auto">
              <RotateCcw size={28} />
            </div>
            <div>
              <h3 className="font-serif text-lg font-bold text-[#0A1F44]">No Returns or Refunds Found</h3>
              <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                {activeTab === "all"
                  ? "You don't have any active or past returns. All delivered purchases carry a 7-day hassle-free return window."
                  : `There are no returns matching the '${activeTab}' filter.`}
              </p>
            </div>
            {eligibleForReturn.length > 0 && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="inline-flex items-center gap-2 bg-[#0A1F44] text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:bg-[#2C3E6B] transition-colors"
              >
                <Plus size={15} /> Raise a Return Request
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {filteredReturns.map((order) => {
              const placedAt = new Date(order.createdAt);
              let returnReasonObj: any = null;
              try {
                if (order.returnReason) returnReasonObj = JSON.parse(order.returnReason);
              } catch {
                returnReasonObj = { reason: order.returnReason };
              }

              const isProcessed = order.refundStatus === "processed";
              const isApproved = order.refundStatus === "approved";
              const isRejected = order.refundStatus === "rejected";

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 shadow-sm space-y-4 hover:border-[#C7CCD1]/40 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#C7CCD1]/15 pb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#0A1F44]/5 flex items-center justify-center text-[#0A1F44]">
                        <RotateCcw size={18} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#0A1F44]">
                            #{order.displayId ?? order.id}
                          </span>
                          <span className="text-xs text-gray-400">
                            • {placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Total Amount: <span className="font-semibold text-gray-800">₹{order.total.toLocaleString("en-IN")}</span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {isProcessed ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                          <CheckCircle2 size={13} /> Refund Paid Out
                        </span>
                      ) : isApproved ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                          <CheckCircle2 size={13} /> Approved for Refund
                        </span>
                      ) : isRejected ? (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">
                          <XCircle size={13} /> Return Request Rejected
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          <Clock size={13} /> Under Review / In Progress
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Return details & items */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="md:col-span-2 space-y-2">
                      <p className="font-semibold text-gray-700 uppercase tracking-wider text-[10px]">
                        Returned Items ({order.items.length})
                      </p>
                      <div className="space-y-2">
                        {order.items.map((item, idx) => (
                          <div key={`${item.productId}-${idx}`} className="flex items-center gap-3 bg-[#F4F5F7] p-2.5 rounded-lg border border-[#C7CCD1]/10">
                            <div className="w-10 h-10 rounded overflow-hidden bg-gray-200 shrink-0">
                              <img
                                src={getProductImageSrc(item.images?.[0])}
                                alt={item.name}
                                className="w-full h-full object-cover"
                                onError={replaceProductImageWithFallback}
                              />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-[#3D1A1A] truncate">{item.name}</p>
                              <p className="text-gray-400 text-[11px]">Qty: {item.quantity} × ₹{item.price.toLocaleString("en-IN")}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-[#F4F5F7] p-3.5 rounded-lg border border-[#C7CCD1]/15 space-y-2">
                      <p className="font-semibold text-gray-700 uppercase tracking-wider text-[10px]">
                        Return Information
                      </p>
                      <div>
                        <p className="text-gray-400 text-[10px]">Reason</p>
                        <p className="font-medium text-[#3D1A1A]">{returnReasonObj?.reason || "Product Return Requested"}</p>
                      </div>
                      {returnReasonObj?.notes && (
                        <div>
                          <p className="text-gray-400 text-[10px]">Comments</p>
                          <p className="text-gray-600 italic text-[11px]">"{returnReasonObj.notes}"</p>
                        </div>
                      )}
                      {order.refundReference && (
                        <div>
                          <p className="text-gray-400 text-[10px]">Refund Reference / UTR</p>
                          <p className="font-mono font-bold text-[#0A1F44]">{order.refundReference}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Status Progress steps */}
                  <div className="pt-2 border-t border-[#C7CCD1]/15">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
                      Status Timeline
                    </p>
                    <div className="grid grid-cols-4 gap-2 text-center text-[10px]">
                      <div className="space-y-1">
                        <div className="h-1 rounded-full bg-emerald-500" />
                        <p className="font-semibold text-emerald-700">1. Requested</p>
                      </div>
                      <div className="space-y-1">
                        <div className={`h-1 rounded-full ${isApproved || isProcessed ? "bg-emerald-500" : isRejected ? "bg-red-400" : "bg-amber-400 animate-pulse"}`} />
                        <p className={`font-semibold ${isApproved || isProcessed ? "text-emerald-700" : isRejected ? "text-red-600" : "text-amber-700"}`}>
                          2. {isRejected ? "Rejected" : "Pickup & Check"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className={`h-1 rounded-full ${isApproved || isProcessed ? "bg-emerald-500" : "bg-gray-200"}`} />
                        <p className={`font-semibold ${isApproved || isProcessed ? "text-emerald-700" : "text-gray-400"}`}>
                          3. Approved
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className={`h-1 rounded-full ${isProcessed ? "bg-blue-600" : "bg-gray-200"}`} />
                        <p className={`font-semibold ${isProcessed ? "text-blue-700" : "text-gray-400"}`}>
                          4. Refund Issued
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal for initiating a return */}
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="bg-white rounded-xl shadow-xl border border-[#C7CCD1]/30 max-w-lg w-full overflow-hidden"
              >
                <div className="flex items-center justify-between px-5 py-4 border-b border-[#C7CCD1]/20 bg-[#F4F5F7]">
                  <div className="flex items-center gap-2">
                    <RotateCcw size={18} className="text-[#0A1F44]" />
                    <h2 className="font-serif text-lg font-bold text-[#0A1F44]">Raise a Return Request</h2>
                  </div>
                  <button
                    onClick={() => setIsModalOpen(false)}
                    className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-200 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                <form onSubmit={handleCreateReturn} className="p-5 space-y-4 text-xs">
                  {submitSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
                      <span>{submitSuccess}</span>
                    </div>
                  )}
                  {submitError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-xs flex items-center gap-2">
                      <AlertCircle size={16} className="shrink-0 text-red-600" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Select Delivered Order</label>
                    <select
                      value={selectedOrderId}
                      onChange={(e) => setSelectedOrderId(e.target.value)}
                      required
                      className="w-full bg-[#F4F5F7] border border-[#C7CCD1]/30 rounded-lg p-2.5 font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0A1F44]"
                    >
                      <option value="">-- Choose an eligible order --</option>
                      {eligibleForReturn.map((o) => (
                        <option key={o.id} value={o.id}>
                          Order #{o.displayId ?? o.id} — ₹{o.total.toLocaleString("en-IN")} ({new Date(o.createdAt).toLocaleDateString("en-IN")})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Reason for Return</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      className="w-full bg-[#F4F5F7] border border-[#C7CCD1]/30 rounded-lg p-2.5 font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0A1F44]"
                    >
                      {RETURN_REASONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Additional Notes / Comments</label>
                    <textarea
                      value={returnNotes}
                      onChange={(e) => setReturnNotes(e.target.value)}
                      rows={3}
                      placeholder="Please describe any defects, size issues, or packaging comments..."
                      className="w-full bg-[#F4F5F7] border border-[#C7CCD1]/30 rounded-lg p-2.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#0A1F44]"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-gray-700 mb-1">Preferred Refund Method</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: "original_payment", label: "Original Method", sub: "Card / UPI" },
                        { id: "store_credit", label: "Store Credit", sub: "Instant Code" },
                        { id: "bank_transfer", label: "Bank Account", sub: "NEFT / IMPS" },
                      ].map((mode) => (
                        <button
                          key={mode.id}
                          type="button"
                          onClick={() => setRefundMethod(mode.id as any)}
                          className={`p-2.5 rounded-lg border text-left transition-all ${
                            refundMethod === mode.id
                              ? "border-[#0A1F44] bg-[#0A1F44]/5 font-semibold text-[#0A1F44]"
                              : "border-[#C7CCD1]/30 bg-white text-gray-600 hover:bg-gray-50"
                          }`}
                        >
                          <p className="text-xs">{mode.label}</p>
                          <p className="text-[10px] text-gray-400">{mode.sub}</p>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#C7CCD1]/20 flex items-center justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex items-center gap-2 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white px-5 py-2 rounded-lg font-semibold shadow-sm text-xs transition-colors disabled:opacity-50"
                    >
                      {submitting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                      Submit Request
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
