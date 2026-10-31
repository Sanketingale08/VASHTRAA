import React, { useEffect, useState, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { LayoutDashboard, Package, PackageCheck, ShoppingBag, User, TrendingUp, Store, ArrowRight, Star, IndianRupee, AlertCircle, HelpCircle, CreditCard, Users, Bell, Landmark, LogOut, ChevronDown, Menu, X } from "lucide-react";
import { useClerk } from "@clerk/react";
import { useSellerContext } from "@/components/SellerGuard";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { apiFetch } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStatsSkeleton } from "@/components/skeletons";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const IVORY = "#F4F5F7";
const CREAM = "#E5E8EC";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: "easeOut" as const },
  }),
};

const NAV_LINKS = [
  { href: "/seller/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/seller/products", label: "My Products", icon: Package, group: "/seller/products" },
  { href: "/seller/inventory", label: "Inventory", icon: PackageCheck, group: "/seller/inventory" },
  { href: "/seller/orders", label: "Orders", icon: ShoppingBag, group: "/seller/orders" },
  { href: "/seller/customers", label: "Customers", icon: Users, group: "/seller/customers" },
  { href: "/seller/notifications", label: "Notifications", icon: Bell, group: "/seller/notifications" },
  { href: "/seller/analytics", label: "Analytics", icon: TrendingUp },
  { href: "/seller/profile", label: "Seller Profile", icon: User },
  { href: "/seller/payouts", label: "Payouts", icon: CreditCard, group: "/seller/payouts" },
  { href: "/seller/settlements", label: "Settlements", icon: Landmark, group: "/seller/settlements" },
  { href: "/seller/support", label: "Support", icon: HelpCircle, group: "/seller/support" },
];

const UNREAD_KEY = "td_seller_orders_last_viewed";

export function SellerLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const { vendor } = useSellerContext();
  const { signOut } = useClerk();
  const [location] = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  const handleSellerLogout = useCallback(async () => {
    try {
      localStorage.removeItem("vastraa_seller_authenticated");
      localStorage.removeItem("vastraa_seller_email");
      localStorage.removeItem("vastraa_auth_token");
      localStorage.removeItem("clerk_user_id");
      localStorage.removeItem(UNREAD_KEY);
      sessionStorage.clear();
    } catch {
      // Storage fallback
    }

    try {
      await apiFetch("/api/seller/sign-out", { method: "POST" });
    } catch {
      // Ignore API logout failure
    }

    try {
      await signOut();
    } catch {
      // Ignore Clerk signOut error
    }

    window.location.href = `${basePath}/seller/login`;
  }, [signOut]);

  const fetchUnreadCount = useCallback(async () => {
    const lastViewed = localStorage.getItem(UNREAD_KEY);
    if (!lastViewed) {
      localStorage.setItem(UNREAD_KEY, new Date().toISOString());
      return;
    }
    try {
      const res = await apiFetch("/api/seller/orders");
      if (!res.ok) return;
      const data = await res.json();
      const lastTs = new Date(lastViewed).getTime();
      const newOrders = (data.orders ?? []).filter(
        (o: any) => new Date(o.createdAt).getTime() > lastTs
      );
      setUnreadCount(newOrders.length);
    } catch {
    }
  }, []);

  const fetchUnreadNotifCount = useCallback(async () => {
    try {
      const res = await apiFetch("/api/seller/notifications/unread-count");
      if (!res.ok) return;
      const data = await res.json();
      setUnreadNotifCount(data.count ?? 0);
    } catch {
    }
  }, []);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    function handleClick(e: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [profileOpen]);

  useEffect(() => {
    fetchUnreadCount();
    fetchUnreadNotifCount();
    const interval = setInterval(fetchUnreadNotifCount, 8000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount, fetchUnreadNotifCount]);

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if (["order:created", "order:status_changed", "notification:new"].includes(detail.name)) {
        fetchUnreadCount();
        fetchUnreadNotifCount();
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [fetchUnreadCount, fetchUnreadNotifCount]);

  useEffect(() => {
    if (location.startsWith("/seller/orders")) {
      localStorage.setItem(UNREAD_KEY, new Date().toISOString());
      setUnreadCount(0);
    }
    if (location.startsWith("/seller/notifications")) {
      fetchUnreadNotifCount();
    }
  }, [location, fetchUnreadNotifCount]);

  return (
    <div className="min-h-screen flex" style={{ background: CREAM }}>
      <aside className="w-64 shrink-0 hidden md:flex flex-col" style={{ background: MAROON }}>
        <div className="px-6 py-5 border-b border-white/10">
          <Link href="/">
            <img
              src={`${basePath}/logo.svg`}
              alt="VASTRAA — Paithani & Designer Sarees"
              className="block w-full max-w-[220px] h-auto object-contain object-left bg-white/90 p-2.5 rounded-lg shadow-sm"
              style={{ maxHeight: "96px" }}
            />
          </Link>
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-white/40 mt-1">Seller Panel</p>
        </div>

        {vendor && (
          <div className="px-5 py-4 border-b border-white/10 flex items-center gap-3">
            <div className="w-9 h-9 rounded-full overflow-hidden shrink-0" style={{ background: GOLD }}>
              {vendor.avatar ? (
                <img src={vendor.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-sm font-bold text-white">
                  {vendor.name[0]?.toUpperCase()}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{vendor.shopName || vendor.name}</p>
              <p className="text-[10px] text-white/50 truncate">{vendor.location}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_LINKS.map(({ href, label, icon: Icon, stub, group }: any) => {
            const fullPath = basePath + href;
            const fullGroup = group ? basePath + group : null;
            const isActive = location === href ||
              (fullGroup ? location.startsWith(group) : false);
            const showBadge =
              (href === "/seller/orders" && unreadCount > 0) ||
              (href === "/seller/notifications" && unreadNotifCount > 0);
            const badgeCount = href === "/seller/notifications" ? unreadNotifCount : unreadCount;
            return (
              <Link
                key={href}
                href={stub ? "#" : href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  color: isActive ? MAROON : stub ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.7)",
                  background: isActive ? IVORY : "transparent",
                  cursor: stub ? "default" : "pointer",
                }}
              >
                <Icon size={16} />
                {label}
                {showBadge && (
                  <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center"
                    style={{ background: GOLD, color: MAROON }}>
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
                {stub && !showBadge && (
                  <span className="ml-auto text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.4)" }}>
                    Soon
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/10 space-y-2">
          {vendor && (
            <Link href={`/stores/${vendor.id}`} className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors">
              <Store size={13} /> View Public Store
            </Link>
          )}
          <Link href="/" className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors">
            <ArrowRight size={13} /> Back to Shop
          </Link>
          <button
            onClick={() => setShowLogoutDialog(true)}
            className="flex items-center gap-2 text-xs text-red-300/80 hover:text-red-200 transition-colors w-full text-left pt-1 border-t border-white/5 mt-1 cursor-pointer"
          >
            <LogOut size={13} /> Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-lg border border-gray-200 text-[#0A1F44] hover:bg-gray-50 transition-colors"
              aria-label="Open seller menu"
            >
              <Menu size={20} />
            </button>
            <h1 className="font-serif text-lg sm:text-xl font-bold truncate" style={{ color: MAROON }}>
              {title ?? "Seller Panel"}
            </h1>
          </div>
          {vendor && (
            <div className="flex items-center gap-3">
              {/* Approved badge + My Store — only on the dashboard page */}
              {location === "/seller/dashboard" && (
                <>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#dcfce7", color: "#166534" }}>
                    ● Approved
                  </span>
                  <Link
                    href={`/stores/${vendor.id}`}
                    className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:border-[#C7CCD1]"
                    style={{ borderColor: "#C7CCD144", color: MAROON }}
                  >
                    <Store size={12} /> My Store
                  </Link>
                </>
              )}

              {/* Profile menu */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => setProfileOpen((v) => !v)}
                  className="flex items-center gap-1 rounded-full transition-all hover:ring-2 hover:ring-[#C7CCD1]/40 focus:outline-none"
                  aria-label="Profile menu"
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white overflow-hidden shrink-0"
                    style={{ background: MAROON }}
                  >
                    {vendor.avatar ? (
                      <img
                        src={vendor.avatar}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                      />
                    ) : (
                      vendor.name[0]?.toUpperCase()
                    )}
                  </div>
                  <ChevronDown
                    size={12}
                    className={`transition-transform ${profileOpen ? "rotate-180" : ""}`}
                    style={{ color: MAROON }}
                  />
                </button>

                {profileOpen && (
                  <div
                    className="absolute right-0 top-full mt-2 w-44 bg-white rounded-xl shadow-lg border py-1 z-50"
                    style={{ borderColor: "#E5E7EB" }}
                  >
                    <Link
                      href="/seller/profile"
                      onClick={() => setProfileOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-gray-50"
                      style={{ color: MAROON }}
                    >
                      <User size={14} /> Profile
                    </Link>
                    <div className="my-1 border-t" style={{ borderColor: "#F3F4F6" }} />
                    <button
                      onClick={() => { setProfileOpen(false); setShowLogoutDialog(true); }}
                      className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-red-50 text-red-600"
                    >
                      <LogOut size={14} /> Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-50 md:hidden flex">
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative w-72 max-w-[85vw] h-full min-h-screen-dynamic flex flex-col shadow-2xl z-10 text-white pt-safe pb-safe" style={{ background: MAROON }}>
              <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
                <Link href="/" onClick={() => setMobileMenuOpen(false)}>
                  <img
                    src={`${basePath}/logo.svg`}
                    alt="VASTRAA"
                    className="h-9 w-auto object-contain bg-white/95 p-1 rounded-md"
                  />
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close seller menu"
                  className="p-2 text-white/70 hover:text-white rounded-md min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <X size={20} />
                </button>
              </div>

              {vendor && (
                <div className="px-5 py-3 border-b border-white/10 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full overflow-hidden shrink-0" style={{ background: GOLD }}>
                    {vendor.avatar ? (
                      <img src={vendor.avatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xs font-bold text-white">
                        {vendor.name[0]?.toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{vendor.shopName || vendor.name}</p>
                    <p className="text-[10px] text-white/50 truncate">{vendor.location}</p>
                  </div>
                </div>
              )}

              <nav className="flex-1 overflow-y-auto scroll-touch scrollbar-thin px-3 py-3 space-y-1">
                {NAV_LINKS.map(({ href, label, icon: Icon, stub, group }: any) => {
                  const isActive = location === href || (group ? location.startsWith(group) : false);
                  const showBadge = (href === "/seller/orders" && unreadCount > 0) || (href === "/seller/notifications" && unreadNotifCount > 0);
                  const badgeCount = href === "/seller/notifications" ? unreadNotifCount : unreadCount;
                  return (
                    <Link
                      key={href}
                      href={stub ? "#" : href}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-semibold transition-all"
                      style={{
                        color: isActive ? MAROON : "rgba(255,255,255,0.75)",
                        background: isActive ? IVORY : "transparent",
                      }}
                    >
                      <Icon size={16} />
                      {label}
                      {showBadge && (
                        <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: GOLD, color: MAROON }}>
                          {badgeCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </nav>

              <div className="p-4 border-t border-white/10 space-y-2">
                <button
                  onClick={() => { setMobileMenuOpen(false); setShowLogoutDialog(true); }}
                  className="flex items-center gap-2 text-xs text-red-300 w-full"
                >
                  <LogOut size={14} /> Logout
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Logout confirmation dialog */}
        {showLogoutDialog && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-4"
            style={{ background: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowLogoutDialog(false)}
          >
            <div
              className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-serif text-lg font-bold mb-2" style={{ color: MAROON }}>
                Logout
              </h3>
              <p className="text-sm text-gray-500 mb-6">
                Are you sure you want to log out of your seller account?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutDialog(false)}
                  className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors hover:bg-gray-50"
                  style={{ borderColor: "#E5E7EB", color: "#374151" }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSellerLogout}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition-all hover:opacity-90 cursor-pointer"
                  style={{ background: "#DC2626" }}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        )}

        <main className="flex-1 p-3.5 sm:p-6 overflow-x-hidden overflow-y-auto scroll-touch">
          {children}
        </main>
      </div>
    </div>
  );
}

interface DashboardData {
  monthlyRevenue: number;
  orderCount: number;
  activeListings: number;
  avgRating: number;
  recentOrders: {
    id: string;
    createdAt: string;
    status: string;
    vendorTotal: number;
    vendorItems: { name: string; quantity: number; price: number }[];
  }[];
  topProducts: {
    id: string;
    name: string;
    qtySold: number;
    rating: number;
    price: number;
    image: string | null;
  }[];
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  confirmed: { bg: "#dbeafe", text: "#1d4ed8" },
  processing: { bg: "#fef3c7", text: "#b45309" },
  shipped: { bg: "#e0f2fe", text: "#0369a1" },
  delivered: { bg: "#dcfce7", text: "#166534" },
  cancelled: { bg: "#fee2e2", text: "#b91c1c" },
};

function statusStyle(status: string) {
  return STATUS_COLORS[status] ?? { bg: "#f3f4f6", text: "#374151" };
}

export default function SellerDashboard() {
  const { vendor } = useSellerContext();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/seller/dashboard")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch(() => {
        setData({
          monthlyRevenue: 0,
          orderCount: 0,
          activeListings: vendor?.sareesCount ?? 0,
          avgRating: vendor?.rating ?? 4.8,
          recentOrders: [],
          topProducts: [],
        });
        setError("");
      })
      .finally(() => setLoading(false));
  }, [vendor]);

  const metricCards = [
    {
      label: "Revenue This Month",
      value: data ? `₹${data.monthlyRevenue.toLocaleString("en-IN")}` : "—",
      sub: "current month",
      icon: IndianRupee,
      color: "from-[#0A1F44]/10 to-[#0A1F44]/5",
      border: "border-[#0A1F44]/20",
      iconBg: MAROON,
    },
    {
      label: "Total Orders",
      value: data ? String(data.orderCount) : "—",
      sub: "all time",
      icon: ShoppingBag,
      color: "from-[#C7CCD1]/10 to-[#C7CCD1]/5",
      border: "border-[#C7CCD1]/30",
      iconBg: GOLD,
    },
    {
      label: "Active Listings",
      value: data ? String(data.activeListings) : "—",
      sub: "in stock",
      icon: Package,
      color: "from-[#0A1F44]/10 to-[#C7CCD1]/5",
      border: "border-[#C7CCD1]/20",
      iconBg: MAROON,
    },
    {
      label: "Store Rating",
      value: data ? data.avgRating.toFixed(1) : "—",
      sub: "average",
      icon: Star,
      color: "from-[#C7CCD1]/10 to-[#0A1F44]/5",
      border: "border-[#C7CCD1]/20",
      iconBg: GOLD,
    },
  ];

  return (
    <SellerLayout title="Dashboard">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Welcome */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl overflow-hidden shrink-0 flex items-center justify-center text-xl font-bold text-white" style={{ background: MAROON }}>
            {vendor?.avatar ? (
              <img src={vendor.avatar} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
            ) : (
              <span>{vendor?.name[0]?.toUpperCase()}</span>
            )}
          </div>
          <div className="flex-1">
            <h2 className="font-serif text-xl font-bold" style={{ color: MAROON }}>
              Welcome back, {vendor?.shopName || vendor?.name}!
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {vendor?.tagline ?? vendor?.location ?? "Manage your store from here."}
            </p>
          </div>
          <Link
            href={`/stores/${vendor?.id ?? ""}`}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-colors hover:border-[#C7CCD1]"
            style={{ borderColor: "#C7CCD144", color: MAROON }}
          >
            <Store size={13} /> View Public Store
          </Link>
        </motion.div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={15} /> {error}
          </div>
        )}

        {/* Metric Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((card, i) => (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className={`bg-gradient-to-br rounded-2xl border p-5 ${card.color} ${card.border}`}
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
              <p className="text-[10px] text-gray-400">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Orders */}
          <motion.div
            custom={4}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="bg-white rounded-2xl border border-[#C7CCD1]/20 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Recent Orders</h3>
              <Link href="/seller/orders" className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: GOLD }}>
                View All
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3" role="status" aria-busy="true">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="p-3 rounded-xl border border-gray-100 flex items-center justify-between">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-28 rounded" />
                      <Skeleton className="h-3 w-40 rounded" />
                    </div>
                    <div className="text-right space-y-1">
                      <Skeleton className="h-4 w-16 rounded ml-auto" />
                      <Skeleton className="h-4 w-20 rounded-full ml-auto" />
                    </div>
                  </div>
                ))}
              </div>
            ) : !data?.recentOrders.length ? (
              <div className="py-12 text-center text-gray-400 text-sm">No orders yet.</div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.recentOrders.map((order) => {
                  const sc = statusStyle(order.status);
                  return (
                    <div key={order.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-gray-700 truncate">
                          {order.vendorItems.slice(0, 2).map((i) => i.name).join(", ")}
                          {order.vendorItems.length > 2 && ` +${order.vendorItems.length - 2}`}
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          {new Date(order.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                      <span className="text-xs font-bold" style={{ color: MAROON }}>
                        ₹{order.vendorTotal.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: sc.bg, color: sc.text }}>
                        {order.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Top Products */}
          <motion.div
            custom={5}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="bg-white rounded-2xl border border-[#C7CCD1]/20 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Top Sellers</h3>
              <Link href="/seller/products" className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: GOLD }}>
                All Products
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3" role="status" aria-busy="true">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="flex items-center gap-3">
                    <Skeleton className="w-6 h-6 rounded" />
                    <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-44 rounded" />
                      <Skeleton className="h-3 w-28 rounded" />
                    </div>
                    <Skeleton className="h-4 w-12 rounded" />
                  </div>
                ))}
              </div>
            ) : !data?.topProducts.length ? (
              <div className="py-12 text-center text-gray-400 text-sm">
                <Package size={32} className="mx-auto mb-3 opacity-30" />
                No sales data yet.
                <br />
                <Link href="/seller/products" className="text-xs font-semibold mt-2 inline-block" style={{ color: MAROON }}>
                  Add your first product →
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {data.topProducts.map((product, i) => (
                  <div key={product.id} className="px-5 py-3 flex items-center gap-3">
                    <span className="text-lg font-bold w-6 text-center shrink-0" style={{ color: i === 0 ? GOLD : "#d1d5db" }}>
                      {i + 1}
                    </span>
                    <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      <img
                        src={getProductImageSrc(product.image)}
                        alt={product.name}
                        className="w-full h-full object-cover"
                        onError={replaceProductImageWithFallback}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 line-clamp-1">{product.name}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Star size={9} className="fill-[#C7CCD1] text-[#C7CCD1]" /> {product.rating.toFixed(1)}
                        <span className="mx-1">·</span>
                        ₹{product.price.toLocaleString("en-IN")}
                      </p>
                    </div>
                    <span className="text-xs font-bold shrink-0" style={{ color: MAROON }}>
                      {product.qtySold} sold
                    </span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        </div>

        {/* Getting Started Checklist */}
        <motion.div
          custom={6}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-base font-bold" style={{ color: MAROON }}>Getting Started</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Complete your store profile", href: "/seller/profile", done: !!(vendor?.bio && vendor?.contactEmail) },
              { label: "Add your first product", href: "/seller/products", done: (vendor?.sareesCount ?? 0) > 0 || (data?.activeListings ?? 0) > 0 },
              { label: "Set up your GSTIN", href: "/seller/profile", done: !!vendor?.gstin },
            ].map((step, i) => (
              <Link
                key={i}
                href={step.href}
                className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:border-[#C7CCD1]/40"
                style={{ borderColor: step.done ? "#C7CCD144" : "#e5e7eb" }}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${step.done ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                  {step.done && <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                </div>
                <span className="text-sm flex-1" style={{ color: step.done ? "#6b7280" : "#0A1F44", textDecoration: step.done ? "line-through" : "none" }}>
                  {step.label}
                </span>
                {!step.done && <ArrowRight size={14} className="text-gray-300" />}
              </Link>
            ))}
          </div>
        </motion.div>

      </div>
    </SellerLayout>
  );
}
