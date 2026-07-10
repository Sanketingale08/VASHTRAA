import React, { useEffect, useState, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { motion } from "framer-motion";
import { LayoutDashboard, Package, PackageCheck, ShoppingBag, User, TrendingUp, Store, ArrowRight, Star, IndianRupee, AlertCircle, HelpCircle, CreditCard, Users, Bell } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: "easeOut" },
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
  { href: "/seller/profile", label: "Store Profile", icon: User },
  { href: "/seller/payouts", label: "Payouts", icon: CreditCard, group: "/seller/payouts" },
  { href: "/seller/help", label: "Help", icon: HelpCircle, stub: true },
];

const UNREAD_KEY = "td_seller_orders_last_viewed";

export function SellerLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const { vendor } = useSellerContext();
  const [location] = useLocation();
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);

  const fetchUnreadCount = useCallback(async () => {
    const lastViewed = localStorage.getItem(UNREAD_KEY);
    if (!lastViewed) {
      localStorage.setItem(UNREAD_KEY, new Date().toISOString());
      return;
    }
    try {
      const res = await fetch(`${basePath}/api/seller/orders`, { credentials: "include" });
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
      const res = await fetch(`${basePath}/api/seller/notifications/unread-count`, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setUnreadNotifCount(data.count ?? 0);
    } catch {
    }
  }, []);

  useEffect(() => {
    fetchUnreadCount();
    fetchUnreadNotifCount();
    const interval = setInterval(fetchUnreadNotifCount, 60000);
    return () => clearInterval(interval);
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
              src={`${basePath}/images/logo.png`}
              alt="TwirlDrape"
              className="h-10 w-auto object-contain brightness-0 invert mb-1"
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
              <p className="text-sm font-semibold text-white truncate">{vendor.name}</p>
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
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <h1 className="font-serif text-xl font-bold" style={{ color: MAROON }}>
            {title ?? "Seller Panel"}
          </h1>
          {vendor && (
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#dcfce7", color: "#166534" }}>
                ● Approved
              </span>
              <Link
                href={`/stores/${vendor.id}`}
                className="hidden sm:flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors hover:border-[#C9A84C]"
                style={{ borderColor: "#C9A84C44", color: MAROON }}
              >
                <Store size={12} /> My Store
              </Link>
            </div>
          )}
        </header>

        <main className="flex-1 p-6 overflow-auto">
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
    fetch(`${basePath}/api/seller/dashboard`, { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError("Could not load dashboard metrics."))
      .finally(() => setLoading(false));
  }, []);

  const metricCards = [
    {
      label: "Revenue This Month",
      value: data ? `₹${data.monthlyRevenue.toLocaleString("en-IN")}` : "—",
      sub: "current month",
      icon: IndianRupee,
      color: "from-[#1E6B5A]/10 to-[#1E6B5A]/5",
      border: "border-[#1E6B5A]/20",
      iconBg: MAROON,
    },
    {
      label: "Total Orders",
      value: data ? String(data.orderCount) : "—",
      sub: "all time",
      icon: ShoppingBag,
      color: "from-[#C9A84C]/10 to-[#C9A84C]/5",
      border: "border-[#C9A84C]/30",
      iconBg: GOLD,
    },
    {
      label: "Active Listings",
      value: data ? String(data.activeListings) : "—",
      sub: "in stock",
      icon: Package,
      color: "from-[#1E6B5A]/10 to-[#C9A84C]/5",
      border: "border-[#C9A84C]/20",
      iconBg: MAROON,
    },
    {
      label: "Store Rating",
      value: data ? data.avgRating.toFixed(1) : "—",
      sub: "average",
      icon: Star,
      color: "from-[#C9A84C]/10 to-[#1E6B5A]/5",
      border: "border-[#C9A84C]/20",
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
          className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
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
              Welcome back, {vendor?.name}!
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {vendor?.tagline ?? vendor?.location ?? "Manage your store from here."}
            </p>
          </div>
          <Link
            href={`/stores/${vendor?.id ?? ""}`}
            className="shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border text-xs font-bold transition-colors hover:border-[#C9A84C]"
            style={{ borderColor: "#C9A84C44", color: MAROON }}
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
                <div className="h-8 w-16 rounded-lg bg-gray-200 animate-pulse mb-1" />
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
            className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Recent Orders</h3>
              <Link href="/seller/orders" className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: GOLD }}>
                View All
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-12 rounded-xl bg-gray-100 animate-pulse" />
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
            className="bg-white rounded-2xl border border-[#C9A84C]/20 overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Top Sellers</h3>
              <Link href="/seller/products" className="text-xs font-semibold hover:opacity-70 transition-opacity" style={{ color: GOLD }}>
                All Products
              </Link>
            </div>
            {loading ? (
              <div className="p-5 space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
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
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).src = "/images/product-1.png"; }} />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package size={16} className="text-gray-300" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-700 line-clamp-1">{product.name}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        <Star size={9} className="fill-[#C9A84C] text-[#C9A84C]" /> {product.rating.toFixed(1)}
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
          className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6"
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
                className="flex items-center gap-3 p-4 rounded-xl border transition-all hover:border-[#C9A84C]/40"
                style={{ borderColor: step.done ? "#C9A84C44" : "#e5e7eb" }}
              >
                <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${step.done ? "border-green-500 bg-green-500" : "border-gray-300"}`}>
                  {step.done && <svg width="12" height="12" viewBox="0 0 12 12" fill="white"><path d="M2 6l3 3 5-5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg>}
                </div>
                <span className="text-sm flex-1" style={{ color: step.done ? "#6b7280" : "#3D1515", textDecoration: step.done ? "line-through" : "none" }}>
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
