import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IndianRupee, Clock, CheckCircle2, TrendingUp, Package, ChevronDown, ChevronUp, X } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";

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
  const gross = settlement.productAmount ?? settlement.amount;
  const commission = settlement.commission ?? 0;
  const shipping = settlement.shippingCharge ?? 0;
  const tax = settlement.settlementTax ?? 0;
  const net = settlement.netPayout ?? settlement.amount;
  const rate = settlement.commissionRate != null ? `${(settlement.commissionRate * 100).toFixed(1)}%` : "—";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.4)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Settlement Breakdown</h3>
            {settlement.orderId && (
              <p className="text-xs text-gray-400 mt-0.5 font-mono">Order #{settlement.orderId.slice(0, 8).toUpperCase()}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">Product Sale Amount</span>
            <span className="font-semibold text-sm" style={{ color: MAROON }}>{fmt(gross)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <div>
              <span className="text-sm text-gray-600">Marketplace Commission</span>
              {settlement.commissionRate != null && (
                <span className="ml-1.5 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{rate}</span>
              )}
            </div>
            <span className="text-sm font-medium text-red-500">−{fmt(commission)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">Shipping Charge (Prorated)</span>
            <span className="text-sm font-medium text-red-500">−{fmt(shipping)}</span>
          </div>
          <div className="flex justify-between items-center py-2 border-b border-gray-50">
            <span className="text-sm text-gray-600">GST on Commission (18%)</span>
            <span className="text-sm font-medium text-red-500">−{fmt(tax)}</span>
          </div>
          <div className="flex justify-between items-center py-2.5 rounded-xl px-3 mt-1" style={{ background: CREAM }}>
            <span className="font-bold text-sm" style={{ color: MAROON }}>Net Payout to You</span>
            <span className="font-bold text-base" style={{ color: MAROON }}>{fmt(net)}</span>
          </div>
        </div>

        <div className="px-5 pb-4 space-y-1">
          <div className="flex justify-between text-xs text-gray-400">
            <span>Status</span>
            <StatusBadge status={settlement.status} />
          </div>
          {settlement.utrNumber && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>UTR Number</span>
              <span className="font-mono text-gray-600">{settlement.utrNumber}</span>
            </div>
          )}
          {settlement.paidAt && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Paid On</span>
              <span>{formatDate(settlement.paidAt)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs text-gray-400">
            <span>Settlement Date</span>
            <span>{formatDate(settlement.createdAt)}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

const STATUS_FILTERS = [
  { value: "all", label: "All" },
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

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter !== "all") params.set("status", statusFilter);
    params.set("page", String(page));
    setLoading(true);
    fetch(getApiUrl(`/api/seller/settlements?${params}`), { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError("Could not load settlements. Please try again."))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const summary = data?.summary;
  const summaryCards = [
    {
      label: "Earned This Month",
      value: summary ? fmt(summary.totalEarnedThisMonth) : "—",
      sub: "from delivered orders",
      icon: TrendingUp,
      iconBg: MAROON,
    },
    {
      label: "Pending Payout",
      value: summary ? fmt(summary.totalPending) : "—",
      sub: "being processed",
      icon: Clock,
      iconBg: GOLD,
    },
    {
      label: "Total Paid Out",
      value: summary ? fmt(summary.totalPaid) : "—",
      sub: "transferred to bank",
      icon: CheckCircle2,
      iconBg: "#22A06B",
    },
  ];

  const settlements = data?.settlements ?? [];

  return (
    <SellerLayout title="Settlements">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>Settlements</h2>
          <p className="text-sm text-gray-500 mt-0.5">Full fee breakdown and payout status for your delivered orders</p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="bg-white rounded-2xl border border-[#C9A84C]/20 p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: card.iconBg }}>
                  <card.icon size={16} className="text-white" />
                </div>
              </div>
              {loading ? (
                <div className="h-8 w-24 rounded-lg bg-gray-200 animate-pulse mb-1" />
              ) : (
                <p className="text-2xl font-bold" style={{ color: MAROON }}>{card.value}</p>
              )}
              <p className="text-xs font-semibold text-gray-500 mt-0.5">{card.label}</p>
              <p className="text-[10px] text-gray-400">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Settlement History</h3>
              <p className="text-xs text-gray-400 mt-0.5">Click any row to see the full fee breakdown</p>
            </div>
            <div className="flex gap-1.5">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => { setStatusFilter(f.value); setPage(1); }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                  style={statusFilter === f.value ? { background: MAROON, color: "#fff" } : { background: "#F3F8F5", color: "#6B7280" }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : settlements.length === 0 ? (
            <div className="text-center py-16">
              <Package size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No settlements yet</p>
              <p className="text-xs text-gray-400 mt-1">Settlements are created automatically when orders are delivered</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C9A84C22", background: CREAM }}>
                    {["Order", "Date", "Gross Sale", "Commission", "Net Payout", "Status"].map((h) => (
                      <th key={h} className={`px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500 ${h === "Gross Sale" || h === "Commission" || h === "Net Payout" ? "text-right" : "text-left"}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {settlements.map((s, i) => (
                    <motion.tr
                      key={s.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: i * 0.02 }}
                      className="border-b last:border-b-0 hover:bg-[#F3F8F5]/60 transition-colors cursor-pointer"
                      style={{ borderColor: "#F3F4F6" }}
                      onClick={() => setSelectedSettlement(s)}
                    >
                      <td className="px-5 py-3.5">
                        {s.orderId ? (
                          <span className="font-mono text-xs text-gray-500">#{s.orderId.slice(0, 8).toUpperCase()}</span>
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
