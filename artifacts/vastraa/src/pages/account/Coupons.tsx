import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Tag, Copy, CheckCircle, Clock, Ticket, History, XCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { VastraaCouponCard } from "@/components/VastraaCouponCard";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type AvailableCoupon = {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string;
  offerDisplayText?: string | null;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
};

type Redemption = {
  redemptionId: string;
  couponCode: string;
  description: string;
  offerDisplayText?: string | null;
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
  offerDisplayText?: string | null;
  expiresAt: string | null;
};

function useAvailableCoupons(enabled: boolean) {
  return useQuery<{ coupons: AvailableCoupon[] }>({
    queryKey: ["coupons-available"],
    queryFn: async () => {
      const res = await apiFetch(`/api/coupons/available`);
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
      const res = await apiFetch(`/api/coupons/used`);
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
      const res = await apiFetch(`/api/coupons/expired`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });
}

const TABS = ["Available", "Used", "Expired"] as const;
type Tab = (typeof TABS)[number];


export function AccountCouponsPage() {
  const qc = useQueryClient();
  const { isSignedIn } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("Available");

  const { data: availableData, isLoading: availLoading } = useAvailableCoupons(!!isSignedIn);
  const { data: usedData, isLoading: usedLoading } = useUsedCoupons(!!isSignedIn);
  const { data: expiredData, isLoading: expiredLoading } = useExpiredCoupons();

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (["coupon:created", "coupon:updated", "coupon:changed", "coupon:expired", "coupon:redeemed", "order:created"].includes(detail.name)) {
        qc.invalidateQueries({ queryKey: ["coupons-available"] });
        qc.invalidateQueries({ queryKey: ["coupons-used"] });
        qc.invalidateQueries({ queryKey: ["coupons-expired"] });
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [qc]);

  const coupons = availableData?.coupons ?? [];
  const redemptions = usedData?.redemptions ?? [];
  const expired = expiredData?.coupons ?? [];

  function renderContent() {
    if (activeTab === "Available") {
      if (availLoading) {
        return (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-[18px] border border-gray-100 h-36 animate-pulse" />
            ))}
          </div>
        );
      }
      if (coupons.length === 0) {
        return (
          <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-[#0B2044]/5 flex items-center justify-center">
              <Ticket size={28} className="text-[#0B2044]/30" />
            </div>
            <p className="text-gray-400 text-sm">No coupons available right now.</p>
            <p className="text-gray-400 text-xs max-w-xs">
              Check back later for exclusive deals and offers!
            </p>
          </div>
        );
      }
      return (
        <div className="space-y-4">
          {coupons.map((c, i) => (
            <VastraaCouponCard key={c.id} coupon={c} delay={i * 0.05} />
          ))}
        </div>
      );
    }

    if (activeTab === "Used") {
      if (usedLoading) {
        return (
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white rounded-[18px] border border-gray-100 h-32 animate-pulse" />
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
        <div className="space-y-4">
          {redemptions.map((r, i) => (
            <VastraaCouponCard
              key={r.redemptionId}
              coupon={{
                id: r.redemptionId,
                code: r.couponCode,
                type: r.type,
                value: r.value,
                description: r.description,
                offerDisplayText: r.offerDisplayText,
              }}
              isUsed
              orderId={r.orderId?.startsWith("V") || r.orderId?.startsWith("TD") ? r.orderId : r.orderId ? `V-${r.orderId.replace(/-/g, "").slice(0, 8).toUpperCase()}` : undefined}
              redeemedAt={r.redeemedAt}
              delay={i * 0.05}
            />
          ))}
        </div>
      );
    }

    if (expiredLoading) {
      return (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="bg-white rounded-[18px] border border-gray-100 h-36 animate-pulse" />
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
      <div className="space-y-4">
        {expired.map((c, i) => (
          <VastraaCouponCard key={c.id} coupon={c} isExpired delay={i * 0.05} />
        ))}
      </div>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-5">
        <p className="text-sm text-gray-500">Your exclusive discounts and coupon history</p>

        <div className="flex gap-1 bg-white rounded-xl border border-[#C7CCD1]/15 p-1 shadow-sm">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 text-sm font-semibold py-2 rounded-lg transition-all ${
                activeTab === tab
                  ? "bg-[#0B2044] text-[#F4F5F7] shadow-sm"
                  : "text-gray-500 hover:text-[#0B2044]"
              }`}
            >
              {tab}
              {tab === "Available" && coupons.length > 0 && !availLoading && (
                <span
                  className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                    activeTab === tab
                      ? "bg-[#F4F5F7]/20 text-[#F4F5F7]"
                      : "bg-[#0B2044]/10 text-[#0B2044]"
                  }`}
                >
                  {coupons.length}
                </span>
              )}
              {tab === "Used" && redemptions.length > 0 && !usedLoading && (
                <span
                  className={`ml-1.5 text-[10px] rounded-full px-1.5 py-0.5 font-bold ${
                    activeTab === tab
                      ? "bg-[#F4F5F7]/20 text-[#F4F5F7]"
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
                      ? "bg-[#F4F5F7]/20 text-[#F4F5F7]"
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
