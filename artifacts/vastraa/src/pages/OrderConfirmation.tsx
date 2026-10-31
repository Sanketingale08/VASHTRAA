import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Truck, Zap, MapPin, CreditCard, Smartphone,
  HandCoins, Package, XCircle, RotateCcw, RefreshCw, AlertCircle,
  ChevronDown, ChevronUp, Download, ExternalLink, Clock, Layers, Eye,
} from "lucide-react";
import { Layout } from "@/components/Layout";
import { useOrdersContext } from "@/context/OrdersContext";
import { OrderTrackingTimeline, type StatusHistoryEntry } from "@/components/OrderTrackingTimeline";
import { generateInvoice } from "@/utils/generateInvoice";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { OrderPaymentModal } from "@/components/OrderPaymentModal";
import { InvoiceDocumentsModal } from "@/components/InvoiceDocumentsModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type OrderItem = {
  productId: string;
  name: string;
  price: number;
  basePrice?: number | null;
  quantity: number;
  images: string[];
  vendorName: string;
};

type OrderAddress = {
  name: string; phone: string; line1: string; line2?: string;
  city: string; state: string; pincode: string;
};

type Order = {
  id: string;
  displayId?: string | null;
  userId: string;
  items: OrderItem[];
  address: OrderAddress;
  deliveryMethod: "standard" | "express";
  paymentMethod: string;
  couponCode: string | null;
  subtotal: number;
  discount: number;
  platformFee?: number;
  codFee?: number;
  shipping: number;
  tax: number;
  total: number;
  paymentStatus?: string;
  cashfreePaymentId?: string | null;
  status: string;
  statusHistory: StatusHistoryEntry[];
  cancelReason: string | null;
  returnReason: string | null;
  refundStatus: string | null;
  refundMethod: string | null;
  refundProcessedAt: string | null;
  refundReference: string | null;
  deliveredAt: string | null;
  createdAt: string;
  updatedAt: string;
  shipments?: Array<{
    id: string;
    orderId: string;
    vendorId: string;
    courierName: string;
    awbNumber?: string;
    shiprocketStatus?: string;
    status: string;
    trackingUrl?: string;
    pickupLocationName?: string;
    pickupScheduledDate?: string;
    etd?: string;
    items?: Array<{ productId: string; name: string; quantity: number }>;
  }>;
};

function getDeliveryDate(method: "standard" | "express", from: string) {
  const date = new Date(from);
  const days = method === "express" ? 3 : 7;
  let count = 0;
  while (count < days) {
    date.setDate(date.getDate() + 1);
    const d = date.getDay();
    if (d !== 0 && d !== 6) count++;
  }
  return date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

const paymentLabels: Record<string, { label: string; Icon: React.ElementType }> = {
  upi: { label: "UPI", Icon: Smartphone },
  card: { label: "Credit / Debit Card", Icon: CreditCard },
  credit_card: { label: "Credit Card", Icon: CreditCard },
  debit_card: { label: "Debit Card", Icon: CreditCard },
  net_banking: { label: "Net Banking", Icon: CreditCard },
  wallet: { label: "Wallet", Icon: Smartphone },
  cod: { label: "Cash on Delivery", Icon: HandCoins },
};

const statusColors: Record<string, string> = {
  confirmed: "bg-green-100 text-green-700",
  processing: "bg-blue-100 text-blue-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-teal-100 text-teal-700",
  cancelled: "bg-red-100 text-red-700",
  return_requested: "bg-orange-100 text-orange-700",
  return_approved: "bg-green-100 text-green-700",
  return_rejected: "bg-red-100 text-red-700",
};

const CANCEL_REASONS = [
  "Changed my mind",
  "Found a better price elsewhere",
  "Ordered by mistake",
  "Delivery time too long",
  "Other",
];

const RETURN_REASONS = [
  "Product is damaged or defective",
  "Wrong item received",
  "Product does not match description",
  "Size or fit issue",
  "Quality not as expected",
  "Other",
];

// ── Action panel sub-components ──────────────────────────────────────────────

function ActionForm({
  title,
  description,
  reasons,
  onSubmit,
  onClose,
  submitLabel,
  submitColor,
  children,
}: {
  title: string;
  description?: string;
  reasons?: string[];
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
  submitLabel: string;
  submitColor: string;
  children?: React.ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const effectiveReason = reason === "Other" ? custom.trim() : reason;

  async function handle() {
    if (!effectiveReason) { setErr("Please provide a reason."); return; }
    setErr("");
    setSubmitting(true);
    try {
      await onSubmit(effectiveReason);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="mt-3 p-4 bg-gray-50 dark:bg-[#1E2329] rounded-xl border border-[#C7CCD1]/20 space-y-3">
        <div>
          <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">{title}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>

        {reasons && (
          <div className="space-y-1.5">
            {reasons.map(r => (
              <label key={r} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="reason"
                  value={r}
                  checked={reason === r}
                  onChange={() => setReason(r)}
                  className="accent-[#0A1F44]"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
              </label>
            ))}
            {reason === "Other" && (
              <textarea
                className="w-full mt-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 bg-white dark:bg-[#2A2E35] resize-none focus:outline-none focus:ring-1 focus:ring-[#C7CCD1]"
                rows={2}
                placeholder="Please describe your reason…"
                value={custom}
                onChange={e => setCustom(e.target.value)}
              />
            )}
          </div>
        )}

        {children}

        {err && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {err}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handle}
            disabled={submitting}
            className={`flex-1 py-2 text-sm font-bold text-white rounded-lg transition-opacity ${submitColor} disabled:opacity-50`}
          >
            {submitting ? "Please wait…" : submitLabel}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2E35] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

function RefundForm({
  onSubmit,
  onClose,
}: {
  onSubmit: (method: string) => Promise<void>;
  onClose: () => void;
}) {
  const [method, setMethod] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  async function handle() {
    if (!method) { setErr("Please select a refund method."); return; }
    setErr("");
    setSubmitting(true);
    try {
      await onSubmit(method);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="mt-3 p-4 bg-gray-50 dark:bg-[#1E2329] rounded-xl border border-[#C7CCD1]/20 space-y-3">
        <div>
          <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">Request a Refund</p>
          <p className="text-xs text-gray-500 mt-0.5">Choose how you'd like to receive your refund.</p>
        </div>

        <div className="space-y-2">
          {[
            { value: "original_payment", label: "Original Payment Method", sub: "Refunded to your UPI / card / bank account (5–7 business days)" },
            { value: "store_credit", label: "Store Credit", sub: "Added to your VASTRAA wallet instantly" },
          ].map(opt => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${method === opt.value ? "border-[#C7CCD1] bg-[#C7CCD1]/5" : "border-gray-200 dark:border-gray-600 hover:border-[#C7CCD1]/40"}`}
            >
              <input
                type="radio"
                name="refund_method"
                value={opt.value}
                checked={method === opt.value}
                onChange={() => setMethod(opt.value)}
                className="mt-0.5 accent-[#0A1F44]"
              />
              <div>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{opt.label}</p>
                <p className="text-xs text-gray-500 mt-0.5">{opt.sub}</p>
              </div>
            </label>
          ))}
        </div>

        {err && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {err}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handle}
            disabled={submitting}
            className="flex-1 py-2 text-sm font-bold text-white bg-[#0A1F44] hover:bg-[#2C3E6B] rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? "Please wait…" : "Submit Refund Request"}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2E35] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Return Form (with item-level notes) ─────────────────────────────────────

function ReturnForm({
  items,
  onSubmit,
  onClose,
}: {
  items: OrderItem[];
  onSubmit: (reason: string, itemNotes?: Record<string, string>) => Promise<void>;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [custom, setCustom] = useState("");
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");

  const effectiveReason = reason === "Other" ? custom.trim() : reason;

  async function handle() {
    if (!effectiveReason) { setErr("Please select a return reason."); return; }
    setErr("");
    setSubmitting(true);
    try {
      const notes: Record<string, string> = {};
      for (const [k, v] of Object.entries(itemNotes)) {
        if (v.trim()) notes[k] = v.trim();
      }
      await onSubmit(effectiveReason, Object.keys(notes).length > 0 ? notes : undefined);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.25 }}
      className="overflow-hidden"
    >
      <div className="mt-3 p-4 bg-gray-50 dark:bg-[#1E2329] rounded-xl border border-[#C7CCD1]/20 space-y-4">
        <div>
          <p className="font-semibold text-sm text-gray-800 dark:text-gray-200">Why do you want to return?</p>
          <p className="text-xs text-gray-500 mt-0.5">Returns accepted within 7 days of delivery. Our team will arrange a pickup.</p>
        </div>

        <div className="space-y-1.5">
          {RETURN_REASONS.map(r => (
            <label key={r} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="return_reason"
                value={r}
                checked={reason === r}
                onChange={() => setReason(r)}
                className="accent-[#0A1F44]"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{r}</span>
            </label>
          ))}
          {reason === "Other" && (
            <textarea
              className="w-full mt-1 text-sm border border-gray-200 dark:border-gray-600 rounded-lg p-2.5 bg-white dark:bg-[#2A2E35] resize-none focus:outline-none focus:ring-1 focus:ring-[#C7CCD1]"
              rows={2}
              placeholder="Please describe your reason…"
              value={custom}
              onChange={e => setCustom(e.target.value)}
            />
          )}
        </div>

        {items.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
              Item notes <span className="font-normal text-gray-400">(optional)</span>
            </p>
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.productId} className="flex gap-2 items-start">
                  <div className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 border border-[#C7CCD1]/10 shrink-0 mt-0.5">
                    <img src={getProductImageSrc(item.images?.[0])} alt={item.name} className="w-full h-full object-cover"
                      onError={replaceProductImageWithFallback} />
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{item.name}</p>
                    <input
                      type="text"
                      className="w-full mt-1 text-xs border border-gray-200 dark:border-gray-600 rounded-md px-2.5 py-1.5 bg-white dark:bg-[#2A2E35] focus:outline-none focus:ring-1 focus:ring-[#C7CCD1]"
                      placeholder="Any specific issue with this item?"
                      value={itemNotes[item.productId] ?? ""}
                      onChange={e => setItemNotes(prev => ({ ...prev, [item.productId]: e.target.value }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {err && (
          <p className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} /> {err}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            onClick={handle}
            disabled={submitting}
            className="flex-1 py-2 text-sm font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {submitting ? "Please wait…" : "Submit Return Request"}
          </button>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm font-semibold text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-[#2A2E35] transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ── Order Actions Section ────────────────────────────────────────────────────

function OrderActions({
  order,
  onOrderUpdate,
  onOpenPaymentModal,
}: {
  order: Order;
  onOrderUpdate: (updated: Partial<Order>) => void;
  onOpenPaymentModal?: () => void;
}) {
  const { patchOrder } = useOrdersContext();
  const [activeForm, setActiveForm] = useState<"cancel" | "return" | "refund" | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const canCancel = ["confirmed", "processing"].includes(order.status);
  // Use deliveredAt if available; fall back to updatedAt (mirrors server-side logic)
  const deliveryTimestamp = order.deliveredAt
    ? new Date(order.deliveredAt)
    : new Date(order.updatedAt);
  const canReturn = order.status === "delivered" &&
    (Date.now() - deliveryTimestamp.getTime()) / (1000 * 60 * 60 * 24) <= 7;
  const canRefund = ["cancelled", "return_requested"].includes(order.status) && !order.refundStatus;
  const isUnpaidPrepaid = order.paymentMethod !== "cod" && order.paymentStatus !== "paid" && order.status !== "cancelled";

  if (!canCancel && !canReturn && !canRefund && !successMessage && !order.refundStatus && !isUnpaidPrepaid) return null;

  async function doCancel(reason: string) {
    const r = await apiFetch(`/api/orders/${order.id}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to cancel order");
    const patch = { status: "cancelled", cancelReason: reason };
    onOrderUpdate(patch);
    patchOrder(order.id, patch);
    setActiveForm(null);
    setSuccessMessage("Your order has been cancelled. Stock has been restored.");
  }

  async function doReturn(reason: string, itemNotes?: Record<string, string>) {
    const r = await apiFetch(`/api/orders/${order.id}/return`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, itemNotes }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to request return");
    const patch = { status: "return_requested", returnReason: JSON.stringify({ reason, itemNotes }) };
    onOrderUpdate(patch);
    patchOrder(order.id, patch);
    setActiveForm(null);
    setSuccessMessage("Your return request has been submitted. Our team will reach out within 2 business days with pickup details.");
  }

  async function doRefund(method: string) {
    const r = await apiFetch(`/api/orders/${order.id}/refund`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Failed to request refund");
    const patch = { refundStatus: "pending", refundMethod: method };
    onOrderUpdate(patch);
    patchOrder(order.id, patch);
    setActiveForm(null);
    setSuccessMessage(
      method === "store_credit"
        ? "Refund requested — store credit will be added to your account."
        : "Refund requested — processing in 5–7 business days to your original payment method."
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.28 }}
      className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5"
    >
      <h2 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">Order Actions</h2>

      {/* Refund status banner */}
      {order.refundStatus && (
        <div className={`mt-3 flex items-start gap-3 p-3 rounded-lg border ${
          order.refundStatus === "processed"
            ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700"
            : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700"
        }`}>
          {order.refundStatus === "processed"
            ? <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
            : <RefreshCw size={16} className="text-blue-500 mt-0.5 shrink-0" />}
          <div>
            <p className={`text-sm font-semibold ${order.refundStatus === "processed" ? "text-green-700 dark:text-green-300" : "text-blue-700 dark:text-blue-300"}`}>
              {order.refundStatus === "processed"
                ? "Refund Paid Out"
                : order.refundStatus === "pending"
                  ? "Refund Requested — processing in 5–7 business days"
                  : order.refundStatus === "approved"
                    ? "Refund Approved — payout in progress"
                    : `Refund ${order.refundStatus}`}
            </p>
            {order.refundMethod && (
              <p className={`text-xs mt-0.5 ${order.refundStatus === "processed" ? "text-green-600 dark:text-green-400" : "text-blue-500"}`}>
                Method: {order.refundMethod === "store_credit" ? "Store Credit" : "Original Payment Method"}
              </p>
            )}
            {order.refundStatus === "processed" && order.refundProcessedAt && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                Paid out on {new Date(order.refundProcessedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
              </p>
            )}
            {order.refundStatus === "processed" && order.refundReference && (
              <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                Reference: {order.refundReference}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Success message */}
      {successMessage && (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          className="mt-3 flex items-start gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700"
        >
          <CheckCircle2 size={16} className="text-green-500 mt-0.5 shrink-0" />
          <p className="text-sm text-green-700 dark:text-green-300">{successMessage}</p>
        </motion.div>
      )}

      {/* Action buttons */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {isUnpaidPrepaid && onOpenPaymentModal && (
          <button
            onClick={onOpenPaymentModal}
            className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-bold bg-[#0A1F44] hover:bg-[#2C3E6B] text-white rounded-lg shadow-sm transition-colors"
          >
            <CreditCard size={15} />
            Pay ₹{order.total.toLocaleString("en-IN")}
          </button>
        )}

        {canCancel && (
          <button
            onClick={() => setActiveForm(activeForm === "cancel" ? null : "cancel")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <XCircle size={15} />
            Cancel Order
            {activeForm === "cancel" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}

        {canReturn && (
          <button
            onClick={() => setActiveForm(activeForm === "return" ? null : "return")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-orange-200 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
          >
            <RotateCcw size={15} />
            Request Return
            {activeForm === "return" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}

        {canRefund && (
          <button
            onClick={() => setActiveForm(activeForm === "refund" ? null : "refund")}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold border border-blue-200 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            <RefreshCw size={15} />
            Request Refund
            {activeForm === "refund" ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {/* Inline forms */}
      <AnimatePresence>
        {activeForm === "cancel" && (
          <ActionForm
            key="cancel"
            title="Why do you want to cancel?"
            reasons={CANCEL_REASONS}
            onSubmit={doCancel}
            onClose={() => setActiveForm(null)}
            submitLabel="Confirm Cancellation"
            submitColor="bg-red-600 hover:bg-red-700"
          />
        )}
        {activeForm === "return" && (
          <ReturnForm
            key="return"
            items={order.items}
            onSubmit={doReturn}
            onClose={() => setActiveForm(null)}
          />
        )}
        {activeForm === "refund" && (
          <RefundForm
            key="refund"
            onSubmit={doRefund}
            onClose={() => setActiveForm(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export function OrderConfirmationPage() {
  const { id: orderId } = useParams<{ id: string }>();
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);

  async function handleDownloadInvoice() {
    if (!order) return;
    const uniqueVendors = Array.from(new Set(((order?.items as OrderItem[]) || []).map((i) => i.vendorName).filter(Boolean)));
    if (uniqueVendors.length > 1) {
      setShowInvoiceModal(true);
      return;
    }
    setDownloadingInvoice(true);
    try {
      const res = await apiFetch(`/api/orders/${order.id}/invoice`);
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `Invoice-INV-${order.displayId || order.id}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        return;
      }
    } catch (err) {
      console.warn("Backend invoice download error, falling back to client-side generator", err);
    } finally {
      setDownloadingInvoice(false);
    }

    generateInvoice({
      id: order.id,
      displayId: order.displayId,
      createdAt: order.createdAt,
      items: order.items as OrderItem[],
      address: order.address as OrderAddress,
      paymentMethod: order.paymentMethod,
      deliveryMethod: order.deliveryMethod,
      subtotal: order.subtotal,
      discount: order.discount,
      shipping: order.shipping,
      tax: order.tax,
      total: order.total,
      couponCode: order.couponCode,
      status: order.status,
    });
  }

  useEffect(() => {
    if (authLoading) return;
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    if (!orderId) {
      setError("Order not found");
      setLoading(false);
      return;
    }
    apiFetch(`/api/orders/${orderId}`)
      .then(async r => {
        if (!r.ok) throw new Error("Order not found");
        const data = await r.json();
        setOrder(data.order);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [authLoading, isSignedIn, orderId]);

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if (["order:created", "order:status_changed", "order:cancelled", "payment:status_updated"].includes(detail.name)) {
        if (!orderId) return;
        apiFetch(`/api/orders/${orderId}`)
          .then(async r => {
            if (!r.ok) return;
            const data = await r.json();
            if (data.order) setOrder(data.order);
          })
          .catch(() => {});
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [orderId]);

  const [paymentModalOpen, setPaymentModalOpen] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("pay") === "1" || params.get("pay") === "true") {
      setPaymentModalOpen(true);
    }
  }, []);

  const handleOrderUpdate = useCallback((updated: Partial<Order>) => {
    setOrder(prev => prev ? { ...prev, ...updated } : prev);
  }, []);

  const handlePaymentSuccess = useCallback((updatedData: any) => {
    setOrder(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        ...updatedData,
        paymentStatus: updatedData.paymentStatus || "paid",
        status: updatedData.status || (updatedData.paymentMethod === "cod" ? prev.status : "confirmed"),
      };
    });
    if (orderId) {
      apiFetch(`/api/orders/${orderId}`)
        .then(async r => {
          if (!r.ok) return;
          const data = await r.json();
          if (data.order) setOrder(data.order);
        })
        .catch(() => {});
    }
  }, [orderId]);

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin w-10 h-10 border-2 border-[#C7CCD1] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm opacity-60">Loading your order…</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !order) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
          <Package size={48} className="text-gray-300" />
          <h2 className="font-serif text-2xl text-[#0A1F44]">Order Not Found</h2>
          <p className="text-gray-500 text-sm">{error || "This order doesn't exist or belongs to another account."}</p>
          <Link href="/" className="bg-[#0A1F44] text-[#F4F5F7] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm">
            Continue Shopping
          </Link>
        </div>
      </Layout>
    );
  }

  const { label: payLabel, Icon: PayIcon } = paymentLabels[order.paymentMethod] ?? { label: order.paymentMethod, Icon: CreditCard };
  const placedAt = new Date(order.createdAt);
  const deliveryEst = getDeliveryDate(order.deliveryMethod, order.createdAt);
  const statusClass = statusColors[order.status] ?? "bg-gray-100 text-gray-600";

  const isNewOrder = order.status === "confirmed" && !order.cancelReason;

  return (
    <Layout>
      <div className="min-h-screen bg-[#F4F5F7] dark:bg-[#1E2329]">
        <div className="container mx-auto px-4 py-8 max-w-3xl">

          {/* Success / status header */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4 }}
            className="text-center mb-8"
          >
            <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 ${
              order.status === "cancelled" || order.status === "rejected" || order.status === "return_rejected"
                ? "bg-red-100"
                : order.status === "return_requested"
                ? "bg-orange-100"
                : "bg-green-100"
            }`}>
              {order.status === "cancelled" || order.status === "rejected" || order.status === "return_rejected"
                ? <XCircle size={40} className="text-red-500" />
                : order.status === "return_requested"
                ? <RotateCcw size={40} className="text-orange-500" />
                : <CheckCircle2 size={40} className="text-green-500" />
              }
            </div>
            <h1 className="font-serif text-3xl font-bold text-[#0A1F44] mb-2">
              {order.status === "cancelled"
                ? "Order Cancelled"
                : order.status === "rejected"
                ? "Order Rejected"
                : order.status === "return_requested"
                ? "Return Requested"
                : order.status === "return_rejected"
                ? "Return Rejected"
                : isNewOrder
                ? "Order Confirmed!"
                : "Order Details"
              }
            </h1>
            <p className="text-gray-500 text-sm">
              {order.status === "cancelled"
                ? "Your order has been cancelled and stock has been restored."
                : order.status === "rejected"
                ? "Your order was rejected by the seller. A refund will be processed automatically."
                : order.status === "return_requested"
                ? "We've received your return request. Our team will reach out soon."
                : order.status === "return_rejected"
                ? "We're sorry — your return request was not approved."
                : isNewOrder
                ? "Thank you for shopping with VASTRAA. Your order has been placed successfully."
                : "Here are the details for your order."
              }
            </p>
          </motion.div>

          <div className="space-y-5">
            {/* Return Rejected notice */}
            {order.status === "return_rejected" && (() => {
              const rejectedEntry = (order.statusHistory ?? []).slice().reverse().find((e: StatusHistoryEntry) => e.status === "return_rejected");
              const rejectionNote = rejectedEntry?.note;
              return (
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="flex items-start gap-4 p-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl"
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-red-100 dark:bg-red-800/40 flex items-center justify-center mt-0.5">
                    <XCircle size={22} className="text-red-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-red-700 dark:text-red-300 text-base leading-snug">
                      Return Request Rejected
                    </p>
                    {rejectionNote ? (
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        <span className="font-medium">Reason: </span>{rejectionNote}
                      </p>
                    ) : (
                      <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
                        Unfortunately your return request could not be approved. Please contact our support team if you have questions.
                      </p>
                    )}
                    <a
                      href="mailto:support@vastraa.com"
                      className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                    >
                      Contact Support
                    </a>
                  </div>
                </motion.div>
              );
            })()}

            {/* Order meta */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5"
            >
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Order ID</p>
                  <p className="font-mono font-bold text-xs text-[#0A1F44] break-all">#{order.displayId ?? order.id}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Placed On</p>
                  <p className="font-semibold text-sm">
                    {placedAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {placedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Order Status</p>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full capitalize ${statusClass}`}>
                    <CheckCircle2 size={11} /> {order.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-gray-400 mb-1">Payment Status</p>
                  {order.paymentMethod === "cod" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                      <Clock size={11} /> Pay on Delivery
                    </span>
                  ) : order.paymentStatus === "paid" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                      <CheckCircle2 size={11} /> PAID
                    </span>
                  ) : order.paymentStatus === "failed" ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 capitalize">
                      <XCircle size={11} /> Payment Failed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 capitalize">
                      <Clock size={11} /> Payment Pending
                    </span>
                  )}
                </div>
              </div>

              {/* Cancel / return reason */}
              {order.cancelReason && (
                <div className="mt-3 pt-3 border-t border-[#C7CCD1]/10">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Cancellation Reason</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{order.cancelReason}</p>
                </div>
              )}
              {order.returnReason && (
                <div className="mt-3 pt-3 border-t border-[#C7CCD1]/10">
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Return Reason</p>
                  <p className="text-sm text-gray-600 dark:text-gray-300">{order.returnReason}</p>
                </div>
              )}
              {order.refundStatus === "processed" && (
                <div className="mt-3 pt-3 border-t border-[#C7CCD1]/10 flex items-start gap-2.5">
                  <CheckCircle2 size={15} className="text-green-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 uppercase tracking-wider mb-0.5">Refund Payout</p>
                    <p className="text-sm font-semibold text-green-700 dark:text-green-400">
                      Refund paid out
                      {order.refundProcessedAt && (
                        <> on {new Date(order.refundProcessedAt).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}</>
                      )}
                    </p>
                    {order.refundMethod && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Via: {order.refundMethod === "store_credit" ? "Store Credit" : "Original Payment Method"}
                      </p>
                    )}
                    {order.refundReference && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        Reference: <span className="font-mono font-semibold text-gray-700 dark:text-gray-300">{order.refundReference}</span>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </motion.div>

            {/* Tracking Timeline */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14 }}
            >
              <OrderTrackingTimeline
                statusHistory={order.statusHistory ?? []}
                currentStatus={order.status}
                createdAt={order.createdAt}
              />
            </motion.div>

            {/* Multi-Seller Shiprocket Parcels Tracker */}
            {order.shipments && order.shipments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.145 }}
                className="bg-white dark:bg-[#2A2E35] rounded-xl border border-blue-200 dark:border-blue-900/40 p-5 shadow-sm space-y-4"
              >
                <div className="flex items-center justify-between border-b pb-3 border-gray-100 dark:border-gray-800">
                  <div className="flex items-center gap-2">
                    <Truck className="text-blue-600 dark:text-blue-400" size={18} />
                    <div>
                      <h2 className="font-serif text-base font-bold text-[#0A1F44] dark:text-gray-100">
                        {order.shipments.length > 1 ? "Multi-Seller Parcel Dispatches" : "Shiprocket Courier Tracking"}
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {order.shipments.length > 1
                          ? `Items dispatched independently from ${order.shipments.length} artisan workshops`
                          : "Direct pickup from weaver shop via Shiprocket"}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200">
                    Live Tracking
                  </span>
                </div>

                <div className="space-y-3">
                  {order.shipments.map((shipment, sIdx) => {
                    const statusText = (shipment.status || shipment.shiprocketStatus || "dispatched").replace(/_/g, " ");
                    return (
                      <div
                        key={shipment.id || sIdx}
                        className="p-3.5 rounded-lg border border-gray-100 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-800/50 space-y-2 text-xs"
                      >
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div>
                            <span className="font-bold text-gray-800 dark:text-gray-200">
                              Parcel {order.shipments!.length > 1 ? `#${sIdx + 1}` : ""} — {shipment.courierName}
                            </span>
                            {shipment.awbNumber && (
                              <p className="font-mono text-blue-700 dark:text-blue-400 font-semibold mt-0.5">
                                AWB: {shipment.awbNumber}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200">
                              {statusText}
                            </span>
                            {shipment.trackingUrl && (
                              <a
                                href={shipment.trackingUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                              >
                                Track <ExternalLink size={11} />
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-gray-500 dark:text-gray-400 pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
                          {shipment.pickupLocationName && (
                            <span>Origin: <strong className="text-gray-700 dark:text-gray-300 font-medium">{shipment.pickupLocationName}</strong></span>
                          )}
                          {shipment.etd && (
                            <span>Estimated Delivery: <strong className="text-gray-700 dark:text-gray-300 font-medium">{shipment.etd}</strong></span>
                          )}
                          {shipment.pickupScheduledDate && !shipment.etd && (
                            <span>Pickup Date: <strong className="text-gray-700 dark:text-gray-300 font-medium">{shipment.pickupScheduledDate}</strong></span>
                          )}
                        </div>

                        {shipment.items && shipment.items.length > 0 && (
                          <p className="text-[11px] text-gray-400 italic">
                            Includes: {shipment.items.map((it) => `${it.name} (x${it.quantity})`).join(", ")}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}

            {/* Items */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5"
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-serif text-lg font-bold text-[#0A1F44]">
                  Items Ordered ({(order.items as OrderItem[]).reduce((s, i) => s + i.quantity, 0)})
                </h2>
                {(() => {
                  const uniqueVendors = Array.from(new Set(((order.items as OrderItem[]) || []).map((i) => i.vendorName).filter(Boolean)));
                  const isMultiVendorOrder = uniqueVendors.length > 1;

                  return isMultiVendorOrder ? (
                    <button
                      onClick={() => setShowInvoiceModal(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#0A1F44] hover:bg-[#1E2E4A] text-white rounded-lg transition-colors shadow-2xs"
                      title="View Master Order Summary and Seller Tax Invoices"
                    >
                      <Layers size={13} />
                      Invoices ({uniqueVendors.length} Sellers)
                    </button>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={handleDownloadInvoice}
                        disabled={downloadingInvoice}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-[#C7CCD1]/40 text-[#0A1F44] hover:bg-[#C7CCD1]/10 rounded-lg transition-colors disabled:opacity-50"
                        title="Download official Tax Invoice & Bill of Supply (PDF)"
                      >
                        <Download size={13} className={downloadingInvoice ? "animate-bounce" : ""} />
                        {downloadingInvoice ? "Downloading…" : "Download Invoice"}
                      </button>
                      <button
                        onClick={() => setShowInvoiceModal(true)}
                        className="p-1.5 text-xs font-semibold border border-[#C7CCD1]/40 text-gray-600 hover:text-[#0A1F44] hover:bg-[#C7CCD1]/10 rounded-lg transition-colors"
                        title="View invoice details and preview"
                        aria-label="View invoice documents"
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  );
                })()}
              </div>
              <div className="space-y-4">
                {(order.items as OrderItem[]).map((item, idx) => (
                  <div key={`${item.productId}-${idx}`} className="flex gap-3 items-start">
                    <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-[#C7CCD1]/10">
                      <img
                        src={getProductImageSrc(item.images?.[0])}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={replaceProductImageWithFallback}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm leading-snug">{item.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{item.vendorName}</p>
                      <p className="text-xs text-gray-500">Qty: {item.quantity} × ₹{item.price.toLocaleString("en-IN")}</p>
                    </div>
                    <p className="font-bold text-sm shrink-0">₹{(item.price * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Pricing summary */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5"
            >
              <h2 className="font-serif text-lg font-bold text-[#0A1F44] mb-4">Price Breakdown</h2>
              <div className="space-y-2.5 text-sm">
                {(() => {
                  const orderSubtotal = order.subtotal ?? (order.items && order.items.length > 0
                    ? order.items.reduce((s, i: any) => s + (i.price ?? 0) * i.quantity, 0)
                    : 0);
                  return (
                    <div className="flex justify-between"><span className="opacity-60">Subtotal</span><span>₹{orderSubtotal.toLocaleString("en-IN")}</span></div>
                  );
                })()}
                {order.discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Discount{order.couponCode ? ` (${order.couponCode})` : ""}</span>
                    <span>− ₹{order.discount.toLocaleString("en-IN")}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="opacity-60">Platform Fee</span>
                  <span>₹{order.platformFee ?? 20}</span>
                </div>
                {order.paymentMethod === "cod" && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Cash/Pay on Delivery Fee</span>
                    <span>₹{order.codFee ?? 10}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="opacity-60">Shipping</span>
                  <span className="text-green-600 font-semibold">FREE</span>
                </div>
                <div className="border-t border-[#C7CCD1]/20 pt-2.5 flex justify-between font-bold text-[#0A1F44] text-base">
                  <span>
                    {order.paymentMethod === "cod"
                      ? "Total Payable on Delivery"
                      : order.paymentStatus === "paid"
                      ? order.paymentMethod === "upi"
                        ? "Paid via UPI"
                        : "Total Paid"
                      : "Total Payable"}
                  </span>
                  <span>₹{order.total.toLocaleString("en-IN")}</span>
                </div>
                {order.paymentMethod === "cod" ? (
                  <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-200/50 mt-2">
                    Payment will be collected by the delivery agent in cash or via QR on delivery.
                  </p>
                ) : order.paymentStatus !== "paid" && order.status !== "cancelled" ? (
                  <div className="mt-3 pt-1">
                    <button
                      onClick={() => setPaymentModalOpen(true)}
                      className="w-full bg-[#0A1F44] hover:bg-[#2C3E6B] text-white py-2.5 px-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-colors"
                    >
                      <CreditCard size={15} /> Pay ₹{order.total.toLocaleString("en-IN")}
                    </button>
                    <p className="text-[11px] text-gray-500 mt-1.5 text-center">
                      Choose UPI, Google Pay, PhonePe, Cards, Net Banking, or Wallets
                    </p>
                  </div>
                ) : null}
              </div>
            </motion.div>

            {/* Delivery & Payment */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-5"
            >
              <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin size={14} className="text-[#C7CCD1]" />
                  <h3 className="font-semibold text-sm">Shipping Address</h3>
                </div>
                <p className="text-sm font-bold">{(order.address as OrderAddress).name}</p>
                <p className="text-xs text-gray-500 mt-0.5">{(order.address as OrderAddress).phone}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {[(order.address as OrderAddress).line1, (order.address as OrderAddress).line2, (order.address as OrderAddress).city, (order.address as OrderAddress).state, (order.address as OrderAddress).pincode].filter(Boolean).join(", ")}
                </p>
              </div>
              <div className="bg-white dark:bg-[#2A2E35] rounded-xl border border-[#C7CCD1]/20 p-5">
                <div className="flex items-center gap-2 mb-3">
                  {order.deliveryMethod === "express" ? <Zap size={14} className="text-[#C7CCD1]" /> : <Truck size={14} className="text-[#C7CCD1]" />}
                  <h3 className="font-semibold text-sm">Delivery Method</h3>
                </div>
                <p className="text-sm font-bold capitalize">{order.deliveryMethod === "express" ? "⚡ Express (3 days)" : "🚚 Standard (7 days)"}</p>
                <p className="text-xs text-gray-500 mt-1">Est. delivery by</p>
                <p className="text-xs font-semibold text-[#0A1F44] mt-0.5">{deliveryEst}</p>
                <div className="mt-3 pt-3 border-t border-[#C7CCD1]/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <PayIcon size={14} className="text-[#C7CCD1]" />
                      <div>
                        <p className="text-xs text-gray-400">Payment Method</p>
                        <p className="text-xs font-semibold">
                          {order.paymentMethod === "cod" ? "Cash on Delivery" : payLabel}
                        </p>
                      </div>
                    </div>
                    {order.paymentMethod === "cod" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                        Pay on Delivery
                      </span>
                    ) : order.paymentStatus === "paid" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                        Paid
                      </span>
                    ) : order.paymentStatus === "failed" ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
                        Payment Failed
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
                        Payment Pending
                      </span>
                    )}
                  </div>
                  {order.paymentMethod === "cod" ? (
                    <div className="text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-200/50">
                      Amount due on delivery: <span className="font-bold">₹{order.total.toLocaleString("en-IN")}</span>. Payment will be collected when the order is delivered.
                    </div>
                  ) : order.cashfreePaymentId ? (
                    <div className="text-[11px] text-gray-500 bg-gray-50 dark:bg-gray-800/40 p-2 rounded border border-gray-100 dark:border-gray-700/50">
                      <span className="text-gray-400">Payment Ref ID: </span>
                      <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{order.cashfreePaymentId}</span>
                    </div>
                  ) : null}
                  {order.paymentMethod !== "cod" && order.paymentStatus !== "paid" && order.status !== "cancelled" && (
                    <button
                      onClick={() => setPaymentModalOpen(true)}
                      className="w-full mt-2 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white py-2 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <CreditCard size={13} /> Pay Now
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Order Actions */}
            <OrderActions
              order={order}
              onOrderUpdate={handleOrderUpdate}
              onOpenPaymentModal={() => setPaymentModalOpen(true)}
            />

            {/* CTA */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-center pt-2 pb-8 flex flex-col items-center gap-3"
            >
              <Link
                href="/"
                className="inline-block bg-[#0A1F44] hover:bg-[#2C3E6B] text-[#F4F5F7] px-10 py-3.5 font-bold uppercase tracking-wider text-sm rounded-sm transition-colors"
              >
                Continue Shopping
              </Link>
              <Link
                href="/orders"
                className="text-sm text-[#0A1F44] hover:underline font-medium"
              >
                View all orders
              </Link>
              <p className="mt-1 text-xs text-gray-400">
                Questions? <a href="mailto:support@vastraa.com" className="text-[#0A1F44] hover:underline">Contact support</a>
              </p>
            </motion.div>
            {/* Payment Modal */}
            <OrderPaymentModal
              order={order}
              isOpen={paymentModalOpen}
              onClose={() => setPaymentModalOpen(false)}
              onPaymentSuccess={handlePaymentSuccess}
            />

            {/* Invoice Documents Modal */}
            <InvoiceDocumentsModal
              orderId={order.id}
              displayId={order.displayId}
              isOpen={showInvoiceModal}
              onClose={() => setShowInvoiceModal(false)}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
