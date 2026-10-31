import React, { useEffect } from "react";
import { Link } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Package,
  Clock,
  CheckCircle,
  XCircle,
  IndianRupee,
  Tag,
  Heart,
  ShoppingCart,
  MapPin,
  User,
  CreditCard,
  RotateCcw,
  Bell,
  HelpCircle,
  ArrowRight,
  ChevronRight,
  FileText,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { isUserDashboardNotification, type Notification } from "@/lib/notifications";
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
  status: string;
  total: number;
  createdAt: string;
  items?: OrderItem[];
  refundStatus?: string | null;
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

function useUnreadNotifications(enabled: boolean) {
  return useQuery<{ notifications: Notification[] }>({
    queryKey: ["dashboard-notifications-unread"],
    queryFn: async () => {
      const res = await apiFetch(`/api/notifications`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled,
  });
}

function useSupportOpenCount(enabled: boolean) {
  return useQuery<{ count: number }>({
    queryKey: ["dashboard-support-open-count"],
    queryFn: async () => {
      const res = await apiFetch(`/api/support/tickets/open-count`);
      if (!res.ok) return { count: 0 };
      return res.json();
    },
    enabled,
  });
}

function useAddressesCount(enabled: boolean) {
  return useQuery<{ addresses: unknown[] }>({
    queryKey: ["dashboard-addresses"],
    queryFn: async () => {
      const res = await apiFetch(`/api/addresses`);
      if (!res.ok) return { addresses: [] };
      return res.json();
    },
    enabled,
  });
}

function usePaymentMethodsCount(enabled: boolean) {
  return useQuery<{ paymentMethods: unknown[] }>({
    queryKey: ["dashboard-payment-methods"],
    queryFn: async () => {
      const res = await apiFetch(`/api/payment-methods`);
      if (!res.ok) return { paymentMethods: [] };
      return res.json();
    },
    enabled,
  });
}

function AccountFeatureCard({
  title,
  subtitle,
  description,
  icon: Icon,
  href,
  badge,
  badgeColor = "bg-[#0A1F44] text-white",
  delay = 0,
}: {
  title: string;
  subtitle: string;
  description: string;
  icon: React.ElementType;
  href: string;
  badge?: string | number;
  badgeColor?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, delay }}
    >
      <Link href={href}>
        <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5 hover:border-[#0A1F44]/40 hover:shadow-md transition-all duration-200 cursor-pointer group flex flex-col justify-between h-full relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-lg bg-[#0A1F44]/5 flex items-center justify-center text-[#0A1F44] group-hover:bg-[#0A1F44] group-hover:text-white transition-colors">
                <Icon size={20} />
              </div>
              <div className="flex items-center gap-2">
                {badge !== undefined && badge !== null && (
                  <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${badgeColor}`}>
                    {badge}
                  </span>
                )}
                <ChevronRight size={16} className="text-gray-300 group-hover:text-[#0A1F44] group-hover:translate-x-0.5 transition-all" />
              </div>
            </div>
            <h3 className="font-bold text-base text-[#3D1A1A] group-hover:text-[#0A1F44] transition-colors mb-0.5">
              {title}
            </h3>
            <p className="text-xs font-semibold text-[#0A1F44]/70 mb-2">{subtitle}</p>
            <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center text-xs font-semibold text-[#0A1F44] group-hover:underline">
            Manage {title} &rarr;
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

export function AccountOverviewPage() {
  const qc = useQueryClient();
  const { isSignedIn, user } = useAuth();
  const { items: cartItems } = useCart();
  const { data: ordersData, isLoading: ordersLoading } = useOrders(!!isSignedIn);
  const { data: wishlistData, isLoading: wishlistLoading } = useWishlistCount(!!isSignedIn);
  const { data: couponsData, isLoading: couponsLoading } = useCouponCount(!!isSignedIn);
  const { data: notifData } = useUnreadNotifications(!!isSignedIn);
  const { data: supportData } = useSupportOpenCount(!!isSignedIn);
  const { data: addressesData } = useAddressesCount(!!isSignedIn);
  const { data: paymentMethodsData } = usePaymentMethodsCount(!!isSignedIn);

  // Real-time synchronization for instant data updates across all dashboard sections
  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (
        [
          "order:created",
          "order:status_changed",
          "order:cancelled",
          "payment:status_updated",
          "return:created",
          "return:updated",
          "refund:processed",
          "notification:new",
          "coupon:created",
          "coupon:updated",
          "coupon:changed",
          "coupon:expired",
          "wishlist:updated",
          "cart:updated",
          "cart:cleared",
          "address:created",
          "address:updated",
          "address:deleted",
          "payment_method:created",
          "payment_method:updated",
          "payment_method:deleted",
          "profile:updated",
          "support:ticket_created",
          "support:message_added",
          "support:status_changed",
        ].includes(detail.name)
      ) {
        qc.invalidateQueries({ queryKey: ["dashboard-orders"] });
        qc.invalidateQueries({ queryKey: ["dashboard-wishlist-ids"] });
        qc.invalidateQueries({ queryKey: ["dashboard-coupons-available"] });
        qc.invalidateQueries({ queryKey: ["dashboard-notifications-unread"] });
        qc.invalidateQueries({ queryKey: ["dashboard-support-open-count"] });
        qc.invalidateQueries({ queryKey: ["dashboard-addresses"] });
        qc.invalidateQueries({ queryKey: ["dashboard-payment-methods"] });
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [qc]);

  const orders = ordersData?.orders ?? [];
  const totalOrders = orders.length;
  const inProgress = orders.filter((o) =>
    ["confirmed", "processing", "shipped", "out_for_delivery"].includes(o.status),
  ).length;
  const delivered = orders.filter((o) => o.status === "delivered").length;
  const cancelled = orders.filter((o) => o.status === "cancelled").length;
  const returnedOrRefunded = orders.filter((o) =>
    ["returned", "return_requested"].includes(o.status) || !!o.refundStatus
  ).length;

  const wishlistCount = wishlistData?.productIds?.length ?? 0;
  const couponCount = couponsData?.coupons?.length ?? 0;
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const unreadNotifs = (notifData?.notifications ?? [])
    .filter(isUserDashboardNotification)
    .filter((n) => !n.read).length;
  const openTickets = supportData?.count ?? 0;
  const addressCount = addressesData?.addresses?.length ?? 0;
  const paymentMethodsCount = paymentMethodsData?.paymentMethods?.length ?? 0;

  const recentOrders = orders.slice(0, 3);

  return (
    <DashboardLayout>
      <div className="space-y-8">
        {/* Quick Stat Pill Header */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white p-3.5 rounded-xl border border-[#C7CCD1]/20 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Package size={18} />
            </div>
            <div>
              <p className="text-lg font-bold text-[#3D1A1A] leading-tight">{ordersLoading ? "—" : totalOrders}</p>
              <p className="text-[11px] text-gray-500 font-medium">Total Orders</p>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-[#C7CCD1]/20 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <Clock size={18} />
            </div>
            <div>
              <p className="text-lg font-bold text-[#3D1A1A] leading-tight">{ordersLoading ? "—" : inProgress}</p>
              <p className="text-[11px] text-gray-500 font-medium">In Progress</p>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-[#C7CCD1]/20 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <CheckCircle size={18} />
            </div>
            <div>
              <p className="text-lg font-bold text-[#3D1A1A] leading-tight">{ordersLoading ? "—" : delivered}</p>
              <p className="text-[11px] text-gray-500 font-medium">Delivered</p>
            </div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-[#C7CCD1]/20 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
              <RotateCcw size={18} />
            </div>
            <div>
              <p className="text-lg font-bold text-[#3D1A1A] leading-tight">{ordersLoading ? "—" : returnedOrRefunded}</p>
              <p className="text-[11px] text-gray-500 font-medium">Returns &amp; Refunds</p>
            </div>
          </div>
        </div>

        {/* Section 4.A: Recent Orders (Real DB Orders or Genuine Empty State) */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="font-serif text-xl font-bold text-[#0A1F44]">Recent Orders</h2>
              <p className="text-xs text-gray-500">Real-time status of your latest purchases</p>
            </div>
            {totalOrders > 0 && (
              <Link href="/account/orders">
                <span className="text-xs font-semibold text-[#0A1F44] hover:text-[#2C3E6B] flex items-center gap-1 cursor-pointer">
                  View All Orders ({totalOrders}) <ArrowRight size={13} />
                </span>
              </Link>
            )}
          </div>

          {ordersLoading ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-white rounded-xl border border-gray-100 animate-pulse" />
              ))}
            </div>
          ) : recentOrders.length === 0 ? (
            <div className="bg-white rounded-xl border border-[#C7CCD1]/20 p-8 text-center space-y-3 shadow-sm">
              <div className="w-12 h-12 rounded-full bg-[#0A1F44]/5 flex items-center justify-center text-[#0A1F44] mx-auto">
                <Package size={22} />
              </div>
              <div>
                <h3 className="font-bold text-[#0A1F44] text-sm">No Orders Placed Yet</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mt-0.5">
                  Browse our handcrafted collection of authentic Paithani and designer sarees.
                </p>
              </div>
              <Link href="/paithani/shop">
                <button className="bg-[#0A1F44] text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-[#2C3E6B] transition-colors mt-2">
                  Start Shopping
                </button>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentOrders.map((order) => {
                const firstItem = order.items?.[0];
                const extraItems = (order.items?.length ?? 1) - 1;
                const dateStr = new Date(order.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-xl border border-[#C7CCD1]/20 p-4 shadow-sm hover:border-[#0A1F44]/30 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden shrink-0 border border-gray-200">
                        {firstItem?.images?.[0] ? (
                          <img
                            src={getProductImageSrc(firstItem.images[0])}
                            alt={firstItem.name || "Item"}
                            className="w-full h-full object-cover"
                            onError={replaceProductImageWithFallback}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <Package size={18} />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-bold text-[#0A1F44]">
                            #{order.displayId ?? order.id}
                          </span>
                          <span className="text-[11px] text-gray-400">• {dateStr}</span>
                        </div>
                        <p className="text-xs font-medium text-gray-800 truncate mt-0.5">
                          {firstItem?.name ?? "Order Item"}
                          {extraItems > 0 && <span className="text-gray-500 font-normal"> + {extraItems} more</span>}
                        </p>
                        <p className="text-xs font-bold text-[#3D1A1A] mt-0.5">
                          ₹{order.total.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0 self-end sm:self-auto">
                      <span
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-full capitalize ${
                          order.status === "delivered"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : order.status === "cancelled"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : ["returned", "return_requested"].includes(order.status)
                            ? "bg-orange-50 text-orange-700 border border-orange-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {order.status.replace(/_/g, " ")}
                      </span>
                      <Link href={`/orders/${order.id}`}>
                        <button className="text-xs font-semibold text-[#0A1F44] hover:underline px-2 py-1">
                          Details &rarr;
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Core Sections */}
        <div>
          <div className="mb-4">
            <h2 className="font-serif text-xl font-bold text-[#0A1F44]">Account Sections</h2>
            <p className="text-xs text-gray-500">Access and manage all your VASTRAA account services</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* 1. Orders */}
            <AccountFeatureCard
              title="Orders"
              subtitle="Track and manage your orders"
              description="View your current, delivered, cancelled, and returned orders with real-time tracking."
              icon={Package}
              href="/account/orders"
              badge={totalOrders > 0 ? `${totalOrders} Orders` : undefined}
              delay={0}
            />

            {/* 2. Wishlist */}
            <AccountFeatureCard
              title="Wishlist"
              subtitle="Your saved products"
              description="View and manage products you've saved for later and move them to your cart."
              icon={Heart}
              href="/account/wishlist"
              badge={wishlistCount > 0 ? `${wishlistCount} Saved` : undefined}
              badgeColor="bg-rose-600 text-white"
              delay={0.03}
            />

            {/* 3. Shopping Cart */}
            <AccountFeatureCard
              title="Shopping Cart"
              subtitle="Products added to your cart"
              description="Review your selected products, adjust quantities, and proceed to secure checkout."
              icon={ShoppingCart}
              href="/account/cart"
              badge={cartCount > 0 ? `${cartCount} Items` : undefined}
              badgeColor="bg-[#0A1F44] text-white"
              delay={0.06}
            />

            {/* 4. Addresses */}
            <AccountFeatureCard
              title="Addresses"
              subtitle="Manage your delivery addresses"
              description="Add, edit, or remove addresses for a faster and smoother checkout experience."
              icon={MapPin}
              href="/account/addresses"
              badge={addressCount > 0 ? `${addressCount} Saved` : undefined}
              delay={0.09}
            />

            {/* 5. Coupons */}
            <AccountFeatureCard
              title="Coupons"
              subtitle="Manage your coupons"
              description="View available discount coupons, copy promo codes, and apply eligible savings."
              icon={Tag}
              href="/account/coupons"
              badge={couponCount > 0 ? `${couponCount} Active` : undefined}
              badgeColor="bg-emerald-600 text-white"
              delay={0.12}
            />

            {/* 6. Profile Details */}
            <AccountFeatureCard
              title="Profile Details"
              subtitle="Manage your profile information"
              description="Update your full name, email address, phone number, and security details."
              icon={User}
              href="/account/profile"
              delay={0.15}
            />

            {/* 7. Payments */}
            <AccountFeatureCard
              title="Payments"
              subtitle="Manage your payment information"
              description="View your saved payment methods, UPI handles, cards, and refund payout details."
              icon={CreditCard}
              href="/account/payment-methods"
              badge={paymentMethodsCount > 0 ? `${paymentMethodsCount} Saved` : undefined}
              delay={0.18}
            />

            {/* 8. Returns & Refunds */}
            <AccountFeatureCard
              title="Returns & Refunds"
              subtitle="Track your returns and refunds"
              description="View return requests, inspect refund status timelines, and initiate new returns."
              icon={RotateCcw}
              href="/account/returns"
              badge={returnedOrRefunded > 0 ? `${returnedOrRefunded}` : undefined}
              badgeColor="bg-orange-600 text-white"
              delay={0.21}
            />

            {/* 9. Notifications */}
            <AccountFeatureCard
              title="Notifications"
              subtitle="Stay updated with your orders"
              description="Receive updates about orders, payments, shipping, delivery, returns, and refunds."
              icon={Bell}
              href="/account/notifications"
              badge={unreadNotifs > 0 ? `${unreadNotifs} New` : undefined}
              badgeColor="bg-blue-600 text-white"
              delay={0.24}
            />

            {/* 10. Support */}
            <AccountFeatureCard
              title="Support"
              subtitle="Helpdesk & customer care tickets"
              description="Raise support tickets, chat with customer care, and browse FAQs."
              icon={HelpCircle}
              href="/account/support"
              badge={openTickets > 0 ? `${openTickets} Open` : undefined}
              badgeColor="bg-purple-600 text-white"
              delay={0.27}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
