import React from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  IndianRupee,
  Gift,
  Tag,
  Heart,
  Star,
  ArrowRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Order = {
  id: string;
  status: string;
  total: number;
  createdAt: string;
};

function useOrders(enabled: boolean) {
  return useQuery<{ orders: Order[] }>({
    queryKey: ["dashboard-orders"],
    queryFn: async () => {
      const res = await apiFetch(`/api/orders`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function useWishlistCount(enabled: boolean) {
  return useQuery<{ productIds: string[] }>({
    queryKey: ["dashboard-wishlist-ids"],
    queryFn: async () => {
      const res = await apiFetch(`/api/wishlists/ids`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function useCouponCount(enabled: boolean) {
  return useQuery<{ coupons: unknown[] }>({
    queryKey: ["dashboard-coupons-available"],
    queryFn: async () => {
      const res = await apiFetch(`/api/coupons/available`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function useRewardsSummary(enabled: boolean) {
  return useQuery<{ balance: number; tier: string }>({
    queryKey: ["rewards-summary"],
    queryFn: async () => {
      const res = await apiFetch(`/api/rewards/summary`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  href,
  loading,
  accent,
  delay,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  href?: string;
  loading?: boolean;
  accent?: string;
  delay?: number;
}) {
  const content = (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay: delay ?? 0 }}
      className={`bg-white rounded-xl border border-[#C7CCD1]/15 p-4 flex flex-col gap-2 shadow-sm ${
        href ? "hover:border-[#C7CCD1]/40 hover:shadow-md transition-all cursor-pointer group" : ""
      }`}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: accent ? `${accent}15` : "#0A1F4415" }}
        >
          <Icon size={17} style={{ color: accent ?? "#0A1F44" }} />
        </div>
        {href && (
          <ArrowRight
            size={14}
            className="text-gray-200 group-hover:text-[#C7CCD1] transition-colors"
          />
        )}
      </div>
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-7 w-14 bg-gray-100 animate-pulse rounded" />
          <div className="h-3 w-20 bg-gray-100 animate-pulse rounded" />
        </div>
      ) : (
        <>
          <p className="text-2xl font-bold text-[#3D1A1A] leading-none">{value}</p>
          <p className="text-xs text-gray-500 leading-tight">{label}</p>
          {sub && <p className="text-[10px] text-gray-400">{sub}</p>}
        </>
      )}
    </motion.div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

export function AccountOverviewPage() {
  const { isSignedIn, user } = useAuth();
  const { data: ordersData, isLoading: ordersLoading } = useOrders(!!isSignedIn);
  const { data: wishlistData, isLoading: wishlistLoading } = useWishlistCount(!!isSignedIn);
  const { data: couponsData, isLoading: couponsLoading } = useCouponCount(!!isSignedIn);
  const { data: rewardsData, isLoading: rewardsLoading } = useRewardsSummary(!!isSignedIn);

  const orders = ordersData?.orders ?? [];
  const totalOrders = orders.length;
  const inProgress = orders.filter((o) =>
    ["confirmed", "processing", "shipped"].includes(o.status),
  ).length;
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const cancelled = orders.filter((o) =>
    ["cancelled", "returned"].includes(o.status),
  ).length;
  const totalSpent = orders
    .filter((o) => !["cancelled", "returned"].includes(o.status))
    .reduce((s, o) => s + o.total, 0);

  const wishlistCount = wishlistData?.productIds?.length ?? 0;
  const couponCount = couponsData?.coupons?.length ?? 0;

  const loading = ordersLoading || wishlistLoading || couponsLoading;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 lg:gap-4">
          <StatCard
            icon={Package}
            label="Total Orders"
            value={loading ? "—" : totalOrders}
            href="/orders"
            loading={ordersLoading}
            delay={0}
          />
          <StatCard
            icon={Clock}
            label="In Progress"
            value={loading ? "—" : inProgress}
            href="/orders"
            loading={ordersLoading}
            accent="#C7CCD1"
            delay={0.04}
          />
          <StatCard
            icon={CheckCircle}
            label="Delivered"
            value={loading ? "—" : delivered}
            href="/orders"
            loading={ordersLoading}
            accent="#16a34a"
            delay={0.08}
          />
          <StatCard
            icon={XCircle}
            label="Cancelled / Returned"
            value={loading ? "—" : cancelled}
            loading={ordersLoading}
            accent="#dc2626"
            delay={0.12}
          />
          <StatCard
            icon={IndianRupee}
            label="Total Spent"
            value={loading ? "—" : `₹${totalSpent.toLocaleString("en-IN")}`}
            loading={ordersLoading}
            accent="#0A1F44"
            delay={0.16}
          />
          <StatCard
            icon={Gift}
            label="Reward Points"
            value={rewardsLoading ? "—" : (rewardsData?.balance ?? 0).toLocaleString("en-IN")}
            sub={rewardsData?.tier ? `${rewardsData.tier.charAt(0).toUpperCase() + rewardsData.tier.slice(1)} tier` : undefined}
            href="/account/rewards"
            loading={rewardsLoading}
            accent="#C7CCD1"
            delay={0.2}
          />
          <StatCard
            icon={Tag}
            label="Active Coupons"
            value={loading ? "—" : couponCount}
            href="/account/coupons"
            loading={couponsLoading}
            accent="#0A1F44"
            delay={0.24}
          />
          <StatCard
            icon={Heart}
            label="Wishlist Items"
            value={loading ? "—" : wishlistCount}
            href="/wishlist"
            loading={wishlistLoading}
            accent="#be185d"
            delay={0.28}
          />
          <StatCard
            icon={Star}
            label="Pending Reviews"
            value={0}
            sub="Coming soon"
            accent="#C7CCD1"
            delay={0.32}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
