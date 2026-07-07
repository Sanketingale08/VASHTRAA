import React, { useState } from "react";
import { useUser } from "@clerk/react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, Copy, CheckCircle, Clock, Ticket, History, XCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AvailableCoupon = {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
};

type Redemption = {
  redemptionId: string;
  couponCode: string;
  description: string;
  type: "percent" | "flat";
  value: number;
  orderId: string;
  redeemedAt: string;
};

type ExpiredCoupon = {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string;
  expiresAt: string | null;
};

function useAvailableCoupons(enabled: boolean) {
  return useQuery<{ coupons: AvailableCoupon[] }>({
    queryKey: ["coupons-available"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/coupons/available`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function useUsedCoupons(enabled: boolean) {
  return useQuery<{ redemptions: Redemption[] }>({
    queryKey: ["coupons-used"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/coupons/used`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function useExpiredCoupons() {
  return useQuery<{ coupons: ExpiredCoupon[] }>({
    queryKey: ["coupons-expired"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/coupons/expired`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs font-bold text-[#7B1C2C] hover:text-[#C9A84C] transition-colors"
      title="Copy code"
    >
      {copied ? (
        <>
          <CheckCircle size={13} className="text-green-500" />
          <span className="text-green-600">Copied!</span>
        </>
      ) : (
        <>
          <Copy size={13} />
          Copy
        </>
      )}
    </button>
  );
}

function discountLabel(type: "percent" | "flat", value: number) {
  return type === "percent" ? `${value}% off` : `₹${value} off`;
}

function AvailableCouponCard({ coupon, delay }: { coupon: AvailableCoupon; delay: number }) {
  const expiresAt = coupon.expiresAt ? new Date(coupon.expiresAt) : null;
  const daysLeft = expiresAt
    ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
    : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl border border-[#C9A84C]/25 p-4 relative overflow-hidden group hover:border-[#C9A84C]/50 hover:shadow-md transition-all"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#7B1C2C] rounded-l-xl" />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block font-mono font-bold text-base text-[#7B1C2C] tracking-wider bg-[#7B1C2C]/5 px-2.5 py-1 rounded-md border border-[#7B1C2C]/10">
                {coupon.code}
              </span>
              <span className="text-xs font-bold text-[#C9A84C] bg-[#C9A84C]/10 px-2 py-0.5 rounded-full">
                {discountLabel(coupon.type, coupon.value)}
              </span>
            </div>
            <p className="text-sm text-gray-600 leading-snug">{coupon.description}</p>
          </div>
          <CopyButton code={coupon.code} />
        </div>

        <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-gray-50">
          {daysLeft !== null && (
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock size={11} />
              {daysLeft <= 3 ? (
                <span className="text-red-500 font-semibold">Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""}</span>
              ) : (
                <span>
                  Expires{" "}
                  {expiresAt!.toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              )}
            </div>
          )}
          {!expiresAt && (
            <div className="flex items-center gap-1 text-[11px] text-gray-400">
              <Clock size={11} /> No expiry
            </div>
          )}
          {coupon.maxUses !== null && (
            <div className="text-[11px] text-gray-400">
              {coupon.maxUses - coupon.usedCount} use{coupon.maxUses - coupon.usedCount !== 1 ? "s" : ""} remaining
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function RedemptionCard({ r, delay }: { r: Redemption; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl border border-gray-100 p-4 flex items-center gap-4"
    >
      <div className="w-10 h-10 rounded-lg bg-[#7B1C2C]/5 flex items-center justify-center shrink-0">
        <History size={16} className="text-[#7B1C2C]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-mono font-bold text-sm text-[#7B1C2C]">{r.couponCode}</span>
          <span className="text-xs text-gray-500">· {discountLabel(r.type, r.value)}</span>
        </div>
        <p className="text-xs text-gray-500 line-clamp-1">{r.description}</p>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Order #{r.orderId.slice(0, 8).toUpperCase()} ·{" "}
          {new Date(r.redeemedAt).toLocaleDateString("en-IN", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
      </div>
      <CheckCircle size={16} className="text-green-500 shrink-0" />
    </motion.div>
  );
}

function ExpiredCouponCard({ coupon, delay }: { coupon: ExpiredCoupon; delay: number }) {
  const expiresAt = coupon.expiresAt ? new Date(coupon.expiresAt) : null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white rounded-xl border border-gray-100 p-4 relative overflow-hidden opacity-70"
    >
      <div className="absolute left-0 top-0 bottom-0 w-1 bg-gray-300 rounded-l-xl" />
      <div className="pl-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-block font-mono font-bold text-base text-gray-400 tracking-wider bg-gray-50 px-2.5 py-1 rounded-md border border-gray-100 line-through">
                {coupon.code}
              </span>
              <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                {discountLabel(coupon.type, coupon.value)}
              </span>
            </div>
            <p className="text-sm text-gray-400 leading-snug">{coupon.description}</p>
          </div>
          <XCircle size={16} className="text-gray-300 shrink-0 mt-1" />
        </div>
        {expiresAt && (
          <div className="mt-2 flex items-center gap-1 text-[11px] text-gray-400">
            <Clock size={11} />
            Expired{" "}
            {expiresAt.toLocaleDateString("en-IN", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

const TABS = ["Available", "Used", "Expired"] as const;
type Tab = (typeof TABS)[number];

export function AccountCouponsPage() {
  const { isSignedIn } = useUser();
  const [activeTab, setActiveTab] = useState<Tab>("Available");

  const { data: availableData, isLoading: availLoading } = useAvailableCoupons(!!isSignedIn);
  const { data: usedData, isLoading: usedLoading } = useUsedCoupons(!!isSignedIn);
  const { data: expiredData, isLoading: expiredLoading } = useExpiredCoupons();

  const coupons = availableData?.coupons ?? [];
  const redemptions = usedData?.redemptions ?? [];
  const expired = expiredData?.coupons ?? [];

  function renderContent() {
    if (activeTab === "Available") {
      if (availLoading) {
        return (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 h-24 animate-pulse" />
            ))}
          </div>
        );
      }
      if (coupons.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#7B1C2C]/5 flex items-center justify-center">
              <Ticket size={28} className="text-[#7B1C2C]/30" />
            </div>
            <p className="text-gray-400 text-sm">No coupons available right now.</p>
            <p className="text-gray-400 text-xs max-w-xs">
              Check back later for exclusive deals and offers!
            </p>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          {coupons.map((c, i) => (
            <AvailableCouponCard key={c.id} coupon={c} delay={i * 0.05} />
          ))}
        </div>
      );
    }

    if (activeTab === "Used") {
      if (usedLoading) {
        return (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 h-20 animate-pulse" />
            ))}
          </div>
        );
      }
      if (redemptions.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
              <History size={28} className="text-gray-200" />
            </div>
            <p className="text-gray-400 text-sm">You haven't used any coupons yet.</p>
          </div>
        );
      }
      return (
        <div className="space-y-3">
          {redemptions.map((r, i) => (
            <RedemptionCard key={r.redemptionId} r={r} delay={i * 0.05} />
          ))}
        </div>
      );
    }

    if (expiredLoading) {
      return (
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-100 h-20 animate-pulse" />
          ))}
        </div>
      );
    }
    if (expired.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
          <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center">
            <XCircle size={28} className="text-gray-200" />
          </div>
          <p className="text-gray-400 text-sm">No expired coupons to show.</p>
        </div>
      );
    }
    return (
      <div className="space-y-3">
        {expired.map((c, i) => (
          <ExpiredCouponCard key={c.id} coupon={c} delay={i * 0.05} />
        ))}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#7B1C2C]">Coupons & Offers</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            Your exclusive discounts and coupon history
          </p>
        </div>

        <div className="flex gap-1 bg-white rounded-xl border border-[#C9A84C]/15 p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
                activeTab === tab
                  ? "bg-[#7B1C2C] text-[#FAF6EE] shadow-sm"
                  : "text-gray-500 hover:text-[#7B1C2C]"
              }`}
            >
              {tab}
              {tab === "Available" && coupons.length > 0 && !availLoading && (
                <span
                  className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                    activeTab === tab
                      ? "bg-[#FAF6EE]/20 text-[#FAF6EE]"
                      : "bg-[#7B1C2C]/10 text-[#7B1C2C]"
                  }`}
                >
                  {coupons.length}
                </span>
              )}
              {tab === "Used" && redemptions.length > 0 && !usedLoading && (
                <span
                  className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                    activeTab === tab
                      ? "bg-[#FAF6EE]/20 text-[#FAF6EE]"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {redemptions.length}
                </span>
              )}
              {tab === "Expired" && expired.length > 0 && !expiredLoading && (
                <span
                  className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                    activeTab === tab
                      ? "bg-[#FAF6EE]/20 text-[#FAF6EE]"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {expired.length}
                </span>
              )}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {renderContent()}
          </motion.div>
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}
