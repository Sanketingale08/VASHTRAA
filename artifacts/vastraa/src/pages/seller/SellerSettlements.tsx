import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IndianRupee, Clock, CheckCircle2, TrendingUp, Package, X, ArrowDownToLine } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { TableRowSkeleton } from "@/components/skeletons";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const CREAM = "#E5E8EC";

interface Settlement {
  id: string;
  orderId: string | null;
  type: string;
  status: string;
  amount: number;
  productAmount: number | null;
  commission: number | null;
  commissionRate: number | null;
  shippingCharge: number | null;
  settlementTax: number | null;
  netPayout: number | null;
  utrNumber: string | null;
  paidAt: string | null;
  createdAt: string;

  // Pricing Engine Snapshot fields
  pricingVersion?: string | null;
  sellerBasePrice?: number | null;
  platformCommission?: number | null;
  shippingFee?: number | null;
  taxableAmount?: number | null;
  gstRateBps?: number | null;
  gstAmount?: number | null;
  cgst?: number | null;
  sgst?: number | null;
  igst?: number | null;
  customerPays?: number | null;
  gstOnCommission?: number | null;
  tcsDeduction?: number | null;
  sellerSettlement?: number | null;
  platformKeeps?: number | null;
  payoutReference?: string | null;
}

interface SettlementsData {
  settlements: Settlement[];
  total: number;
  page: number;
  totalPages: number;
  summary: {
    totalEarnedThisMonth: number;
    totalPending: number;
    totalPaid: number;
  };
  hasPendingPayoutRequest: boolean;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN")}`;
}

const STATUS_META: Record<string, { label: string; bg: string; color: string }> = {
  processing: { label: "Processing", bg: "#E0F2FE", color: "#0369A1" },
  pending: { label: "Pending", bg: "#FEF9C3", color: "#A16207" },
  eligible: { label: "Eligible", bg: "#DCFCE7", color: "#15803D" },
  on_hold: { label: "On Hold", bg: "#FEE2E2", color: "#B91C1C" },
  approved: { label: "Approved", bg: "#DBEAFE", color: "#1D4ED8" },
  paid: { label: "Paid", bg: "#D1FAE5", color: "#065F46" },
  completed: { label: "Paid", bg: "#D1FAE5", color: "#065F46" },
  rejected: { label: "Rejected", bg: "#FEE2E2", color: "#B91C1C" },
  failed: { label: "Failed", bg: "#FEE2E2", color: "#B91C1C" },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, bg: "#F3F4F6", color: "#6B7280" };
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}

function FeeBreakdownModal({ settlement, onClose }: { settlement: Settlement; onClose: () => void }) {
  const version = settlement.pricingVersion ?? "v1";
  const isV1 = version === "v1";

  const basePrice = settlement.sellerBasePrice ?? (settlement.productAmount ? settlement.productAmount * 100 : settlement.amount * 100);
  const commission = settlement.platformCommission ?? (settlement.commission ? settlement.commission * 100 : Math.round(basePrice * 0.18));
  const shipping = settlement.shippingFee ?? (settlement.shippingCharge ? settlement.shippingCharge * 100 : 10000);
  const taxable = settlement.taxableAmount ?? (isV1 ? basePrice + commission + shipping : basePrice + shipping);
  const gst = settlement.gstAmount ?? Math.round(taxable * 0.05);
  const cgst = settlement.cgst ?? Math.floor(gst / 2);
  const sgst = settlement.sgst ?? (gst - cgst);
  const igst = settlement.igst ?? 0;
  const customerPays = settlement.customerPays ?? (taxable + gst);
  const gstOnComm = settlement.gstOnCommission ?? (settlement.settlementTax ? settlement.settlementTax * 100 : Math.round(commission * 0.05));
  const tcs = settlement.tcsDeduction ?? Math.round(basePrice * 0.01);
  const net = settlement.sellerSettlement ?? (settlement.netPayout ? settlement.netPayout * 100 : basePrice - commission - gstOnComm - tcs);
  const platformKeeps = settlement.platformKeeps ?? (commission + gstOnComm);

  const fmtR = (paise: number) =>
    `₹${(paise / 100).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden border border-[#E5E8EC]"
        data-testid="settlement-breakdown-modal"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 bg-[#F4F5F7]/50">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-serif font-bold text-base text-[#0A1F44]">Settlement Breakdown</h3>
              {isV1 ? (
                <span className="px-2 py-0.5 rounded text-[10px] bg-amber-100 text-amber-800 font-semibold" data-testid="legacy-pricing-badge">
                  legacy pricing
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-100 text-emerald-800 font-semibold">
                  v2 pricing
                </span>
              )}
            </div>
            {settlement.orderId && (
              <p className="text-xs text-gray-400 mt-0.5 font-mono">Order #{settlement.orderId}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-lg hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {isV1 ? (
          /* Render stored v1 breakdown unchanged */
          <div className="px-5 py-4 space-y-2 text-xs">
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
              <span className="text-gray-600">Base Price (Seller Price)</span>
              <span className="font-semibold text-gray-900" data-testid="modal-base-price">{fmtR(basePrice)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
              <span className="text-gray-600">Platform Commission (18%)</span>
              <span className="font-medium text-red-600" data-testid="modal-commission">+ {fmtR(commission)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
              <span className="text-gray-600">Shipping Fee</span>
              <span className="font-medium text-gray-900" data-testid="modal-shipping">+ {fmtR(shipping)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100 bg-gray-50/50 px-2 rounded">
              <span className="font-semibold text-gray-800">Taxable Amount</span>
              <span className="font-bold text-gray-900" data-testid="modal-taxable">{fmtR(taxable)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
              <div>
                <span className="text-gray-600">GST on Product (5%)</span>
                <span className="text-[10px] text-gray-400 ml-1">
                  {igst > 0 ? `(IGST: ${fmtR(igst)})` : `(CGST: ${fmtR(cgst)} | SGST: ${fmtR(sgst)})`}
                </span>
              </div>
              <span className="font-medium text-gray-900" data-testid="modal-gst">{fmtR(gst)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100 font-semibold bg-emerald-50/50 px-2 rounded">
              <span className="text-emerald-900">Customer Paid (Total)</span>
              <span className="font-bold text-emerald-900" data-testid="modal-customer-paid">{fmtR(customerPays)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
              <span className="text-gray-600">GST on Commission (5%)</span>
              <span className="font-medium text-red-600" data-testid="modal-gst-on-comm">- {fmtR(gstOnComm)}</span>
            </div>
            <div className="flex justify-between items-center py-1.5 border-b border-gray-100">
              <span className="text-gray-600">TCS Deduction (1%)</span>
              <span className="font-medium text-red-600" data-testid="modal-tcs">- {fmtR(tcs)}</span>
            </div>

            <div className="flex justify-between items-center py-3 rounded-xl px-3.5 mt-2 bg-[#0A1F44] text-white">
              <span className="font-bold text-sm">Your Net Settlement</span>
              <span className="font-bold text-base text-amber-300" data-testid="modal-net-settlement">{fmtR(net)}</span>
            </div>
          </div>
        ) : (
          /* Render new v2 breakdown (Customer-side and Seller-side separated) */
          <div className="px-5 py-4 space-y-4 text-xs">

            {/* Seller-side payout */}
            <div className="bg-blue-50/40 rounded-xl p-3 border border-blue-100 space-y-2">
              <p className="font-semibold text-[#0A1F44] uppercase tracking-wider text-[10px]">Your Settlement & Deductions</p>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Seller Base Price</span>
                <span className="font-medium text-gray-900">{fmtR(basePrice)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">Platform Commission (18%)</span>
                <span className="font-medium text-red-600" data-testid="modal-commission">- {fmtR(commission)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">GST on Commission (5%)</span>
                <span className="font-medium text-red-600" data-testid="modal-gst-on-comm">- {fmtR(gstOnComm)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-600">TCS Deduction (1%)</span>
                <span className="font-medium text-red-600" data-testid="modal-tcs">- {fmtR(tcs)}</span>
              </div>
              <div className="flex justify-between items-center text-[11px] text-gray-500 pt-1 border-t border-blue-100">
                <span>Platform Keeps (Commission + GST)</span>
                <span className="font-medium text-gray-700" data-testid="modal-platform-keeps">{fmtR(platformKeeps)}</span>
              </div>
            </div>

            <div className="flex justify-between items-center py-3 rounded-xl px-3.5 bg-[#0A1F44] text-white">
              <span className="font-bold text-sm">Your Net Settlement</span>
              <span className="font-bold text-base text-amber-300" data-testid="modal-net-settlement">{fmtR(net)}</span>
            </div>
          </div>
        )}

        <div className="px-5 pb-4 space-y-1.5 border-t border-gray-100 pt-3">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Status</span>
            <StatusBadge status={settlement.status} />
          </div>
          {settlement.payoutReference && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>Payout Reference</span>
              <span className="font-mono text-gray-700">{settlement.payoutReference}</span>
            </div>
          )}
          {settlement.utrNumber && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>UTR Number</span>
              <span className="font-mono text-gray-700">{settlement.utrNumber}</span>
            </div>
          )}
          {settlement.paidAt && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>Payout Date</span>
              <span>{formatDate(settlement.paidAt)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-gray-500">
            <span>Created At</span>
            <span>{formatDate(settlement.createdAt)}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "paid", label: "Paid" },
];

export default function SellerSettlements() {
  const [data, setData] = useState<SettlementsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [payoutRequesting, setPayoutRequesting] = useState(false);
  const [payoutMessage, setPayoutMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<Settlement[]>([]);
  const [payoutRequestsLoading, setPayoutRequestsLoading] = useState(true);

  const fetchPayoutRequests = () => {
    setPayoutRequestsLoading(true);
    apiFetch("/api/seller/settlements/payout-requests")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load payout requests");
        return r.json();
      })
      .then((d) => setPayoutRequests(d.payouts ?? []))
      .catch(() => {/* silently handled — settlements error covers this */})
      .finally(() => setPayoutRequestsLoading(false));
  };

  const fetchSettlements = () => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(page));
    setLoading(true);
    apiFetch(`/api/seller/settlements?${params}`)
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => { setData(d); setError(""); })
      .catch(() => setError("Could not load settlements. Please try again."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPayoutRequests();
  }, []);

  useEffect(() => {
    fetchSettlements();
  }, [statusFilter, page]);

  const handlePayoutRequest = async () => {
    setPayoutRequesting(true);
    setPayoutMessage(null);
    try {
      const r = await apiFetch("/api/seller/settlements/payout-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = await r.json();
      if (r.status === 409) {
        setPayoutMessage({ kind: "error", text: body.error ?? "A payout request is already pending." });
      } else if (!r.ok) {
        setPayoutMessage({ kind: "error", text: body.error ?? "Failed to submit payout request." });
      } else {
        setPayoutMessage({ kind: "success", text: "Payout request submitted successfully. Our team will review it shortly." });
        fetchSettlements();
        fetchPayoutRequests();
      }
    } catch {
      setPayoutMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setPayoutRequesting(false);
    }
  };

  const summary = data?.summary;
  const summaryCards = [
    {
      label: "Earned This Month",
      value: summary ? fmt(summary.totalEarnedThisMonth) : "—",
      icon: TrendingUp,
      iconBg: MAROON,
    },
    {
      label: "Pending Payout",
      value: summary ? fmt(summary.totalPending) : "—",
      icon: Clock,
      iconBg: GOLD,
    },
    {
      label: "Total Paid Out",
      value: summary ? fmt(summary.totalPaid) : "—",
      icon: CheckCircle2,
      iconBg: "#22A06B",
    },
  ];

  const orderSettlements = data?.settlements ?? [];
  const hasPendingPayoutRequest = data?.hasPendingPayoutRequest ?? false;

  return (
    <SellerLayout title="Settlements">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-start justify-end gap-4 flex-wrap">
          <div className="flex flex-col items-end gap-1.5">
            <button
              onClick={handlePayoutRequest}
              disabled={payoutRequesting || hasPendingPayoutRequest || loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: hasPendingPayoutRequest ? "#E5E7EB" : MAROON, color: hasPendingPayoutRequest ? "#6B7280" : "#fff" }}
              title={hasPendingPayoutRequest ? "A payout request is already pending review" : undefined}
            >
              <ArrowDownToLine size={15} />
              {payoutRequesting ? "Submitting…" : hasPendingPayoutRequest ? "Payout Pending Review" : "Request Payout"}
            </button>
            {hasPendingPayoutRequest && (
              <p className="text-[11px] text-amber-600">A payout request is already under review</p>
            )}
          </div>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        {payoutMessage && (
          <div className={`px-4 py-3 rounded-xl text-sm flex items-start justify-between gap-3 ${payoutMessage.kind === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
            <span>{payoutMessage.text}</span>
            <button onClick={() => setPayoutMessage(null)} className="shrink-0 opacity-60 hover:opacity-100">
              <X size={14} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.iconBg }}>
                  <card.icon size={16} className="text-white" />
                </div>
              </div>
              {loading ? (
                <Skeleton className="h-8 w-24 rounded-lg mb-1" />
              ) : (
                <p className="text-2xl font-bold" style={{ color: MAROON }}>{card.value}</p>
              )}
              <p className="text-xs font-semibold text-gray-500 mt-0.5">{card.label}</p>
            </motion.div>
          ))}
        </div>

        {/* Payout Requests section */}
        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Payout Requests</h3>
          </div>

          {payoutRequestsLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C7CCD122", background: CREAM }}>
                    {["Amount", "Date Requested", "Status", "UTR Number"].map((h) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 ${h === "Amount" ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <TableRowSkeleton columns={4} rows={3} />
                </tbody>
              </table>
            </div>
          ) : payoutRequests.length === 0 ? (
            <div className="text-center py-10">
              <ArrowDownToLine size={32} className="mx-auto mb-2 text-gray-300" />
              <p className="font-medium text-gray-500 text-sm">No payout requests yet</p>
              <p className="text-xs text-gray-400 mt-1">Use "Request Payout" above to transfer your balance to your bank</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C7CCD122", background: CREAM }}>
                    {["Amount", "Date Requested", "Status", "UTR Number"].map((h) => (
                      <th
                        key={h}
                        className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 ${h === "Amount" ? "text-right" : "text-left"}`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payoutRequests.map((s, i) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b last:border-b-0"
                      style={{ borderColor: "#F3F4F6" }}
                    >
                      <td className="px-5 py-3.5 text-right font-semibold text-sm" style={{ color: MAROON }}>
                        {fmt(s.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">{formatDate(s.createdAt)}</td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={s.status} />
                      </td>
                      <td className="px-5 py-3.5">
                        {s.utrNumber ? (
                          <span className="font-mono text-xs text-gray-700 bg-gray-100 px-2 py-0.5 rounded">{s.utrNumber}</span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                        {s.paidAt && (
                          <div className="text-[10px] text-gray-400 mt-0.5">Paid {formatDate(s.paidAt)}</div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Settlement History</h3>
            </div>
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setStatusFilter(f.value); setPage(1); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={statusFilter === f.value ? { background: MAROON, color: "#fff" } : { background: "#F4F5F7", color: "#6B7280" }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C7CCD122", background: CREAM }}>
                    {["Order", "Date", "Gross Sale", "Commission", "Net Payout", "Status"].map((h) => (
                      <th key={h} className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 ${h === "Gross Sale" || h === "Commission" || h === "Net Payout" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <TableRowSkeleton columns={6} rows={5} />
                </tbody>
              </table>
            </div>
          ) : orderSettlements.length === 0 ? (
            <div className="text-center py-16">
              <Package size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No settlements yet</p>
              <p className="text-xs text-gray-400 mt-1">Settlements are created automatically when orders are delivered</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C7CCD122", background: CREAM }}>
                    {["Order", "Date", "Gross Sale", "Commission", "Net Payout", "Status"].map((h) => (
                      <th key={h} className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 ${h === "Gross Sale" || h === "Commission" || h === "Net Payout" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orderSettlements.map((s, i) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b last:border-b-0 hover:bg-[#F4F5F7]/60 transition-colors cursor-pointer"
                      style={{ borderColor: "#F3F4F6" }}
                      onClick={() => setSelectedSettlement(s)}
                    >
                      <td className="px-5 py-3.5">
                        {s.orderId ? (
                          <span className="font-mono text-xs text-gray-500">#{s.orderId?.startsWith("V") || s.orderId?.startsWith("TD") ? s.orderId : s.orderId ? `V-${s.orderId.replace(/-/g,"").slice(0,8).toUpperCase()}` : "—"}</span>
                        ) : (
                          <span className="text-xs text-gray-400 capitalize">{s.type}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-xs text-gray-500">{formatDate(s.createdAt)}</td>
                      <td className="px-5 py-3.5 text-right text-xs text-gray-600">
                        {fmt(s.productAmount ?? s.amount)}
                      </td>
                      <td className="px-5 py-3.5 text-right text-xs text-red-500">
                        {s.commission != null ? `−${fmt(s.commission)}` : "—"}
                      </td>
                      <td className="px-5 py-3.5 text-right font-semibold text-sm" style={{ color: MAROON }}>
                        {fmt(s.netPayout ?? s.amount)}
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusBadge status={s.status} />
                        {s.utrNumber && (
                          <div className="text-[10px] text-gray-400 mt-0.5 font-mono">UTR: {s.utrNumber}</div>
                        )}
                      </td>
                    </motion.tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => p - 1)}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              ← Previous
            </button>
            <span className="text-xs text-gray-400">Page {data.page} of {data.totalPages}</span>
            <button
              disabled={page >= data.totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
              className="text-xs font-semibold px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedSettlement && (
          <FeeBreakdownModal
            settlement={selectedSettlement}
            onClose={() => setSelectedSettlement(null)}
          />
        )}
      </AnimatePresence>
    </SellerLayout>
  );
}
