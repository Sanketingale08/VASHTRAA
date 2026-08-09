import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { IndianRupee, Clock, Wallet, Package } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";

interface Payout {
  orderId: string;
  deliveredAt: string;
  itemCount: number;
  amount: number;
  status: string;
}

interface PayoutsData {
  lifetimeEarnings: number;
  pendingBalance: number;
  payouts: Payout[];
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function SellerPayouts() {
  const [data, setData] = useState<PayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(getApiUrl("/api/seller/payouts"), { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError("Could not load payout data. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const summaryCards = [
    {
      label: "Lifetime Earnings",
      value: data ? `₹${data.lifetimeEarnings.toLocaleString("en-IN")}` : "—",
      sub: "from delivered orders",
      icon: IndianRupee,
      iconBg: MAROON,
    },
    {
      label: "Pending Balance",
      value: data ? `₹${data.pendingBalance.toLocaleString("en-IN")}` : "—",
      sub: "awaiting payout",
      icon: Clock,
      iconBg: GOLD,
    },
  ];

  return (
    <SellerLayout title="Payouts">
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h2 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>Payouts</h2>
          <p className="text-sm text-gray-500 mt-0.5">Track your earnings and payout history</p>
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Payout History</h3>
            <p className="text-xs text-gray-400 mt-0.5">Amounts earned from delivered orders, awaiting settlement</p>
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
              <p className="text-xs text-gray-400 mt-1">Earnings from delivered orders will appear here</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "#C9A84C22", background: CREAM }}>
                  {["Order ID", "Delivered On", "Items", "Amount", "Status"].map((h) => (
                    <th key={h} className="text-left px-5 py-3 text-xs font-bold uppercase tracking-wider text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.payouts.map((payout, i) => (
                  <motion.tr
                    key={payout.orderId}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b last:border-b-0 hover:bg-[#F3F8F5]/60 transition-colors"
                    style={{ borderColor: "#F3F4F6" }}
                  >
                    <td className="px-5 py-3.5 font-mono text-xs text-gray-500">
                      #{payout.orderId?.startsWith("TD") ? payout.orderId : payout.orderId ? `TD-${payout.orderId.replace(/-/g,"").slice(0,8).toUpperCase()}` : "—"}
                    </td>
                    <td className="px-5 py-3.5 text-gray-500 text-xs">{formatDate(payout.deliveredAt)}</td>
                    <td className="px-5 py-3.5 text-gray-600">{payout.itemCount} item{payout.itemCount !== 1 ? "s" : ""}</td>
                    <td className="px-5 py-3.5 font-semibold" style={{ color: MAROON }}>
                      ₹{payout.amount.toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#FFFBEB", color: "#B45309" }}>
                        <Wallet size={10} className="inline mr-1 -mt-0.5" />
                        Pending
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </SellerLayout>
  );
}
