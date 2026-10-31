import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { IndianRupee, Clock, Wallet, Package, CheckCircle2, AlertCircle, RefreshCw, ArrowUpRight } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { apiFetch } from "@/lib/api";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const CREAM = "#E5E8EC";

interface Payout {
  id?: string;
  orderId: string;
  deliveredAt: string;
  itemCount: number;
  amount: number;
  status: string;
  utrNumber?: string | null;
  payoutReference?: string | null;
  paidAt?: string | null;
}

interface PayoutsData {
  lifetimeEarnings: number;
  pendingBalance: number;
  payouts: Payout[];
}

function formatDate(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  paid: { label: "Paid", bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
  completed: { label: "Completed", bg: "#ECFDF5", color: "#065F46", border: "#A7F3D0" },
  eligible: { label: "Eligible for Payout", bg: "#F0FDF4", color: "#166534", border: "#BBF7D0" },
  processing: { label: "Processing Transfer", bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  approved: { label: "Approved", bg: "#EFF6FF", color: "#1E40AF", border: "#BFDBFE" },
  pending: { label: "Pending (Return Hold)", bg: "#FFFBEB", color: "#B45309", border: "#FDE68A" },
  on_hold: { label: "On Hold", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  failed: { label: "Transfer Failed", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
  rejected: { label: "Rejected", bg: "#FEF2F2", color: "#991B1B", border: "#FECACA" },
};

export default function SellerPayouts() {
  const [data, setData] = useState<PayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    setLoading(true);
    setError("");
    apiFetch("/api/seller/payouts")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError("Could not load payout data. Please try again."))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  const totalPaidOut = (data?.payouts ?? [])
    .filter((p) => p.status === "paid" || p.status === "completed")
    .reduce((sum, p) => sum + p.amount, 0);

  const totalEligible = (data?.payouts ?? [])
    .filter((p) => p.status === "eligible" || p.status === "approved")
    .reduce((sum, p) => sum + p.amount, 0);

  const summaryCards = [
    {
      label: "Lifetime Settled",
      value: data ? `₹${(data.lifetimeEarnings || totalPaidOut).toLocaleString("en-IN")}` : "—",
      sub: "Total paid to your bank",
      icon: CheckCircle2,
      iconBg: "#059669",
    },
    {
      label: "Pending Settlements",
      value: data ? `₹${(data.pendingBalance).toLocaleString("en-IN")}` : "—",
      sub: "In return hold or processing",
      icon: Clock,
      iconBg: "#D97706",
    },
    {
      label: "Eligible for Transfer",
      value: `₹${totalEligible.toLocaleString("en-IN")}`,
      sub: "Hold completed, ready for payout",
      icon: IndianRupee,
      iconBg: MAROON,
    },
  ];

  return (
    <SellerLayout title="Payouts">
      <div className="max-w-5xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-serif font-bold text-gray-900">Seller Payouts &amp; Transfers</h2>
            <p className="text-xs text-gray-500 mt-0.5">Automated bank transfers via Cashfree Payouts gateway</p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex items-center gap-2">
            <AlertCircle size={15} />
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {summaryCards.map((card, i) => (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white" style={{ background: card.iconBg }}>
                  <card.icon size={16} />
                </div>
              </div>
              {loading ? (
                <div className="h-8 w-24 rounded-lg bg-gray-200 animate-pulse mb-1" />
              ) : (
                <p className="text-2xl font-bold" style={{ color: MAROON }}>{card.value}</p>
              )}
              <p className="text-xs font-semibold text-gray-800 mt-0.5">{card.label}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Payout &amp; Transfer History</h3>
            <span className="text-xs text-gray-400">All disbursements</span>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
              ))}
            </div>
          ) : !data?.payouts.length ? (
            <div className="text-center py-16">
              <Package size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-500">No payouts yet</p>
              <p className="text-xs text-gray-400 mt-1">Settlement disbursements from delivered orders will appear here</p>
            </div>
          ) : (
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="border-b" style={{ borderColor: "#C7CCD122", background: CREAM }}>
                    {["Order / Payout ID", "Date", "Net Amount", "Status", "UTR / Reference"].map((h) => (
                      <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.payouts.map((payout, i) => {
                    const statusCfg = STATUS_CONFIG[payout.status] || {
                      label: payout.status,
                      bg: "#F3F4F6",
                      color: "#4B5563",
                      border: "#E5E7EB",
                    };

                    return (
                      <motion.tr
                        key={payout.id || payout.orderId || i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className="hover:bg-gray-50/60 transition-colors"
                      >
                        <td className="px-5 py-3.5 font-mono text-xs font-semibold text-gray-800">
                          #{payout.orderId}
                        </td>
                        <td className="px-5 py-3.5 text-gray-500 text-xs">
                          {formatDate(payout.paidAt || payout.deliveredAt)}
                        </td>
                        <td className="px-5 py-3.5 font-semibold font-serif text-sm" style={{ color: MAROON }}>
                          ₹{payout.amount.toLocaleString("en-IN")}
                        </td>
                        <td className="px-5 py-3.5">
                          <span
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border"
                            style={{ background: statusCfg.bg, color: statusCfg.color, borderColor: statusCfg.border }}
                          >
                            {statusCfg.label}
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          {payout.utrNumber ? (
                            <div className="space-y-0.5">
                              <span className="font-mono text-xs font-semibold text-emerald-800 block">
                                UTR: {payout.utrNumber}
                              </span>
                              {payout.payoutReference && (
                                <span className="font-mono text-[10px] text-gray-400 block">
                                  Ref: {payout.payoutReference}
                                </span>
                              )}
                            </div>
                          ) : payout.payoutReference ? (
                            <span className="font-mono text-xs text-gray-600 block">
                              Ref: {payout.payoutReference}
                            </span>
                          ) : (
                            <span className="text-gray-400 text-xs">—</span>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </SellerLayout>
  );
}
