import React from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import {
  LayoutDashboard,
  User,
  Package,
  MapPin,
  Heart,
  Tag,
  Gift,
  Bell,
  HelpCircle,
  CreditCard,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const navItems: { href: string; icon: React.ComponentType<{ size?: number; className?: string; strokeWidth?: number }>; label: string; exact?: boolean }[] = [
  { href: "/account/overview", icon: LayoutDashboard, label: "Overview" },
  { href: "/account/profile", icon: User, label: "Profile" },
  { href: "/account/orders", icon: Package, label: "My Orders" },
  { href: "/account/addresses", icon: MapPin, label: "Addresses" },
  { href: "/account/payment-methods", icon: CreditCard, label: "Payment Methods" },
  { href: "/account/wishlist", icon: Heart, label: "Wishlist" },
  { href: "/account/coupons", icon: Tag, label: "Coupons & Offers" },
  { href: "/account/rewards", icon: Gift, label: "Rewards" },
  { href: "/account/notifications", icon: Bell, label: "Notifications" },
  { href: "/account/support", icon: HelpCircle, label: "Support" },
];

// All 9 items shown in the scrollable mobile tab bar — none hidden.

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  const [location] = useLocation();
  const { isSignedIn, isLoading, user } = useAuth();

  const { data: openCountData } = useQuery<{ count: number }>({
    queryKey: ["support-open-count"],
    queryFn: async () => {
      const r = await apiFetch(`/api/support/tickets/open-count`);
      if (!r.ok) return { count: 0 };
      return r.json();
    },
    enabled: isSignedIn === true,
    staleTime: 60_000,
  });
  const openTicketCount = openCountData?.count ?? 0;

  if (!isLoading && !isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  function isActive(href: string, exact?: boolean) {
    if (exact) return location === href;
    return location.startsWith(href);
  }

  const displayName = user?.name || [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "Customer";

  return (
    <Layout>
      <div className="min-h-screen bg-[#F4F5F7]">
        <div className="max-w-7xl mx-auto px-4 lg:px-8 py-6 lg:py-8">
          <div className="mb-5 lg:mb-7">
            <h1 className="font-serif text-2xl lg:text-3xl font-bold text-[#0A1F44]">
              Welcome, {displayName}
            </h1>
          </div>

          <div className="flex gap-6 lg:gap-8 items-start">
            {/* Desktop sidebar */}
            <aside className="hidden lg:block w-60 xl:w-64 shrink-0 sticky top-[104px] self-start">
              <nav className="bg-white rounded-xl border border-[#C7CCD1]/20 overflow-hidden shadow-sm">
                {navItems.map(({ href, icon: Icon, label, exact }) => {
                  const active = isActive(href, exact);
                  const isSupport = href === "/account/support";
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-4 py-3 text-sm transition-colors relative group",
                        active
                          ? "bg-[#0A1F44]/5 text-[#0A1F44] font-semibold"
                          : "text-gray-600 hover:bg-[#F4F5F7] hover:text-[#0A1F44]",
                        active &&
                          "before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[3px] before:bg-[#0A1F44] before:rounded-r-full",
                      )}
                    >
                      <Icon
                        size={15}
                        className={
                          active
                            ? "text-[#0A1F44]"
                            : "text-[#C7CCD1] group-hover:text-[#0A1F44] transition-colors"
                        }
                      />
                      <span className="flex-1 truncate">{label}</span>
                      {isSupport && openTicketCount > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 text-[9px] rounded-full bg-[#0A1F44] text-white font-bold shrink-0">
                          {openTicketCount > 9 ? "9+" : openTicketCount}
                        </span>
                      )}
                      {active && (
                        <ChevronRight size={13} className="text-[#0A1F44]/40 shrink-0" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* Tablet icon strip */}
            <aside className="hidden md:block lg:hidden w-14 shrink-0 sticky top-[104px] self-start">
              <nav className="bg-white rounded-xl border border-[#C7CCD1]/20 overflow-hidden shadow-sm py-1">
                {navItems.map(({ href, icon: Icon, label, exact }) => {
                  const active = isActive(href, exact);
                  const isSupport = href === "/account/support";
                  return (
                    <Link
                      key={href}
                      href={href}
                      title={label}
                      className={cn(
                        "flex items-center justify-center w-full py-3.5 transition-colors relative",
                        active
                          ? "text-[#0A1F44] bg-[#0A1F44]/5"
                          : "text-gray-400 hover:text-[#0A1F44] hover:bg-[#F4F5F7]",
                      )}
                    >
                      <Icon size={18} />
                      {isSupport && openTicketCount > 0 && (
                        <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-[#0A1F44]" />
                      )}
                    </Link>
                  );
                })}
              </nav>
            </aside>

            {/* Main content area */}
            <main className="flex-1 min-w-0 pb-20 md:pb-4">
              <motion.div
                key={location}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                {children}
              </motion.div>
            </main>
          </div>
        </div>

        {/* Mobile bottom tab bar — all 9 nav items, horizontally scrollable */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 z-30 shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {navItems.map(({ href, icon: Icon, label, exact }) => {
              const active = isActive(href, exact);
              const isSupport = href === "/account/support";
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "shrink-0 flex flex-col items-center justify-center py-2.5 gap-0.5 transition-colors",
                    "w-[20vw] min-w-[64px] max-w-[88px]",
                    active ? "text-[#0A1F44]" : "text-gray-400",
                  )}
                >
                  {/* Icon wrapper — badge positioned relative to icon */}
                  <div className="relative inline-flex">
                    <Icon size={20} strokeWidth={active ? 2.2 : 1.8} />
                    {isSupport && openTicketCount > 0 && (
                      <span className="absolute -top-0.5 -right-1.5 w-2 h-2 rounded-full bg-[#0A1F44]" />
                    )}
                  </div>
                  <span className="text-[9px] font-semibold leading-tight uppercase tracking-wide">
                    {label.split(" ")[0]}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </Layout>
  );
}
