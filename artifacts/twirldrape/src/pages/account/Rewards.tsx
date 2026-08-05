import React, { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Gift, Copy, CheckCheck, Star, Zap, Crown, ChevronLeft, ChevronRight } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type RewardsSummary = {
  balance: number;
  tier: "silver" | "gold" | "platinum";
  lifetimeEarned: number;
  referralCode: string;
  referralCount: number;
};

type HistoryEntry = {
  id: string;
  points: number;
  type: "earned" | "bonus" | "redeemed";
  description: string;
  orderId: string | null;
  createdAt: string;
};

type HistoryResponse = {
  history: HistoryEntry[];
  page: number;
  total: number;
  pages: number;
};

const TIER_CONFIG = {
  silver: {
    label: "Silver",
    color: "#94a3b8",
    bg: "bg-slate-100",
    text: "text-slate-600",
    border: "border-slate-200",
    icon: Star,
    next: "gold" as const,
    nextThreshold: 1000,
    benefits: [
      "Earn 1 point per ₹10 spent",
      "Birthday bonus points",
      "Early sale access",
    ],
  },
  gold: {
    label: "Gold",
    color: "#C9A84C",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    icon: Zap,
    next: "platinum" as const,
    nextThreshold: 5000,
    benefits: [
      "Earn 1 point per ₹10 spent",
      "Free standard shipping",
      "Priority customer support",
      "Exclusive Gold member offers",
    ],
  },
  platinum: {
    label: "Platinum",
    color: "#1E6B5A",
    bg: "bg-emerald-50",
    text: "text-[#1E6B5A]",
    border: "border-[#C9A84C]/40",
    icon: Crown,
    next: null,
    nextThreshold: null,
    benefits: [
      "Earn 1 point per ₹10 spent",
      "Free express shipping",
      "Dedicated concierge support",
      "Exclusive Platinum collections access",
      "Double points during festivals",
    ],
  },
};

const TIER_ORDER = ["silver", "gold", "platinum"] as const;

function TierRingProgress({ tier, balance }: { tier: "silver" | "gold" | "platinum"; balance: number }) {
  const cfg = TIER_CONFIG[tier];
  const tierIdx = TIER_ORDER.indexOf(tier);

  const lowerThreshold = tierIdx === 0 ? 0 : tier === "gold" ? 1000 : 5000;
  const upperThreshold = cfg.nextThreshold;
  const progress = upperThreshold
    ? Math.min(1, (balance - lowerThreshold) / (upperThreshold - lowerThreshold))
    : 1;

  const radius = 52;
  const stroke = 7;
  const normalizedRadius = radius - stroke / 2;
  const circumference = 2 * Math.PI * normalizedRadius;
  const dashOffset = circumference * (1 - progress);

  const Icon = cfg.icon;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 120, height: 120 }}>
      <svg width={120} height={120} className="rotate-[-90deg]">
        <circle
          cx={60} cy={60} r={normalizedRadius}
          stroke="#e5e7eb" strokeWidth={stroke} fill="none"
        />
        <circle
          cx={60} cy={60} r={normalizedRadius}
          stroke={cfg.color} strokeWidth={stroke} fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Icon size={20} style={{ color: cfg.color }} />
        <span className="text-xs font-semibold mt-0.5" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
      </div>
    </div>
  );
}

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={`bg-gray-100 animate-pulse rounded ${className}`} />;
}

export function AccountRewardsPage() {
  const { isSignedIn } = useUser();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);

  const { data: summary, isLoading: summaryLoading } = useQuery<RewardsSummary>({
    queryKey: ["rewards-summary"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/rewards/summary`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isSignedIn,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery<HistoryResponse>({
    queryKey: ["rewards-history", historyPage],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/rewards/history?page=${historyPage}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!isSignedIn,
  });

  async function copyReferralCode() {
    if (!summary?.referralCode) return;
    try {
      await navigator.clipboard.writeText(summary.referralCode);
      setCopied(true);
      toast({ title: "Copied!", description: "Referral code copied to clipboard." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Code: " + summary.referralCode, description: "Copy it manually above." });
    }
  }

  const tier = summary?.tier ?? "silver";
  const tierCfg = TIER_CONFIG[tier];
  const TierIcon = tierCfg.icon;
  const nextTierCfg = tierCfg.next ? TIER_CONFIG[tierCfg.next] : null;
  const balance = summary?.balance ?? 0;
  const lowerThreshold = tier === "silver" ? 0 : tier === "gold" ? 1000 : 5000;
  const progressPct = tierCfg.nextThreshold
    ? Math.min(100, Math.round(((balance - lowerThreshold) / (tierCfg.nextThreshold - lowerThreshold)) * 100))
    : 100;
  const pointsToNext = tierCfg.nextThreshold ? Math.max(0, tierCfg.nextThreshold - balance) : 0;

  const shareText = summary
    ? `Join TwirlDrape — India's finest saree marketplace! Use my referral code ${summary.referralCode} when you sign up and shop. 🎁`
    : "";

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1E6B5A] mb-0.5">Rewards & Loyalty</h2>
          <p className="text-sm text-gray-500">Earn points with every purchase and unlock exclusive benefits.</p>
        </div>

        {/* Balance + tier card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className={`bg-white rounded-2xl border ${tierCfg.border} p-5 shadow-sm`}
        >
          {summaryLoading ? (
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <SkeletonBlock className="w-[120px] h-[120px] rounded-full" />
              <div className="flex-1 space-y-3 w-full">
                <SkeletonBlock className="h-10 w-32" />
                <SkeletonBlock className="h-4 w-48" />
                <SkeletonBlock className="h-3 w-full" />
                <SkeletonBlock className="h-3 w-3/4" />
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
              <TierRingProgress tier={tier} balance={balance} />
              <div className="flex-1 text-center sm:text-left">
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${tierCfg.bg} ${tierCfg.text} border ${tierCfg.border}`}>
                    <TierIcon size={11} />
                    {tierCfg.label} Member
                  </span>
                </div>
                <p className="text-4xl font-bold text-[#3D1A1A] leading-none mt-2">
                  {balance.toLocaleString("en-IN")}
                  <span className="text-base font-normal text-gray-400 ml-2">pts</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {summary?.lifetimeEarned.toLocaleString("en-IN")} pts earned lifetime
                </p>

                {tierCfg.nextThreshold && nextTierCfg ? (
                  <div className="mt-4 max-w-sm mx-auto sm:mx-0">
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>{tierCfg.label}</span>
                      <span>{pointsToNext.toLocaleString("en-IN")} pts to {nextTierCfg.label}</span>
                    </div>
                    <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${progressPct}%`, backgroundColor: tierCfg.color }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[#1E6B5A] font-semibold mt-3">
                    You've reached the highest tier!
                  </p>
                )}

                <div className="mt-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Your Benefits</p>
                  <ul className="space-y-1">
                    {tierCfg.benefits.map((b) => (
                      <li key={b} className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: tierCfg.color }} />
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        {/* Referral widget */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.08 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 p-5 shadow-sm"
        >
          <div className="flex items-center gap-2 mb-3">
            <Gift size={16} className="text-[#C9A84C]" />
            <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider">Refer & Earn</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Share your referral code. When a friend signs up and places their first order, you earn <strong>200 bonus points</strong>.
          </p>

          {summaryLoading ? (
            <SkeletonBlock className="h-12 w-full" />
          ) : (
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
              <div className="flex-1 flex items-center gap-2 bg-[#F3F8F5] border border-[#C9A84C]/30 rounded-xl px-4 py-3">
                <span className="font-mono text-lg font-bold text-[#1E6B5A] tracking-[0.2em] flex-1 text-center sm:text-left">
                  {summary?.referralCode}
                </span>
                <button
                  onClick={copyReferralCode}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-[#C9A84C]/10 transition-colors"
                  title="Copy code"
                >
                  {copied
                    ? <CheckCheck size={16} className="text-green-600" />
                    : <Copy size={16} className="text-[#C9A84C]" />
                  }
                </button>
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#1ebe5d] text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors shrink-0"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.125.558 4.116 1.532 5.836L.057 23.5l5.819-1.527A11.95 11.95 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.791 9.791 0 01-5.002-1.372l-.36-.213-3.45.905.921-3.36-.234-.374A9.817 9.817 0 012.182 12c0-5.42 4.398-9.818 9.818-9.818 5.42 0 9.818 4.398 9.818 9.818 0 5.42-4.398 9.818-9.818 9.818z" />
                </svg>
                Share on WhatsApp
              </a>
            </div>
          )}

          {!summaryLoading && summary && (
            <p className="text-xs text-gray-400 mt-3">
              {summary.referralCount > 0
                ? `🎉 You've successfully referred ${summary.referralCount} friend${summary.referralCount !== 1 ? "s" : ""} so far!`
                : "No successful referrals yet. Share your code and start earning!"}
            </p>
          )}
        </motion.div>

        {/* Transaction history */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.14 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm overflow-hidden"
        >
          <div className="px-5 py-4 border-b border-gray-50">
            <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider">Points History</h3>
          </div>

          {historyLoading ? (
            <div className="divide-y divide-gray-50">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-5 py-3.5 flex items-center gap-3">
                  <SkeletonBlock className="w-8 h-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <SkeletonBlock className="h-3.5 w-40" />
                    <SkeletonBlock className="h-3 w-24" />
                  </div>
                  <SkeletonBlock className="h-5 w-16" />
                </div>
              ))}
            </div>
          ) : !historyData || historyData.history.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <Gift size={36} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No points activity yet.</p>
              <p className="text-xs text-gray-300 mt-1">Place an order to start earning points!</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-50">
                {historyData.history.map((entry) => {
                  const isEarned = entry.type === "earned" || entry.type === "bonus";
                  const sign = entry.type === "redeemed" ? "-" : "+";
                  const color = entry.type === "redeemed" ? "text-red-500" : "text-green-600";
                  return (
                    <div key={entry.id} className="px-5 py-3.5 flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                          isEarned ? "bg-green-50" : "bg-red-50"
                        }`}
                      >
                        <Gift size={14} className={isEarned ? "text-green-500" : "text-red-400"} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[#3D1A1A] truncate">{entry.description}</p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                          <span className="text-xs text-gray-400">
                            {new Date(entry.createdAt).toLocaleDateString("en-IN", {
                              day: "numeric", month: "short", year: "numeric",
                            })}
                          </span>
                          {entry.orderId && (
                            <a
                              href={`/orders/${entry.orderId}`}
                              className="text-[10px] font-medium text-[#1E6B5A] bg-[#1E6B5A]/5 hover:bg-[#1E6B5A]/10 px-1.5 py-0.5 rounded transition-colors"
                            >
                              Order #{entry.orderId?.startsWith("TD") ? entry.orderId : entry.orderId?.replace(/-/g,"").slice(0,8).toUpperCase()}
                            </a>
                          )}
                          {entry.type === "bonus" && (
                            <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded">
                              Bonus
                            </span>
                          )}
                        </div>
                      </div>
                      <span className={`text-sm font-bold shrink-0 ${color}`}>
                        {sign}{Math.abs(entry.points).toLocaleString("en-IN")} pts
                      </span>
                    </div>
                  );
                })}
              </div>

              {historyData.pages > 1 && (
                <div className="px-5 py-3.5 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    Page {historyData.page} of {historyData.pages} · {historyData.total} entries
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      disabled={historyPage <= 1}
                      onClick={() => setHistoryPage(p => p - 1)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-[#1E6B5A] hover:border-[#C9A84C]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    <button
                      disabled={historyPage >= historyData.pages}
                      onClick={() => setHistoryPage(p => p + 1)}
                      className="p-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-[#1E6B5A] hover:border-[#C9A84C]/40 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
