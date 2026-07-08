import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { LayoutDashboard, Package, ShoppingBag, User, TrendingUp, Store, ArrowRight } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const IVORY = "#FAF6EE";
const CREAM = "#F5EDE0";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" },
  }),
};

const NAV_LINKS = [
  { href: "/seller/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/seller/products", label: "My Products", icon: Package },
  { href: "/seller/orders", label: "Orders", icon: ShoppingBag },
  { href: "/seller/profile", label: "Store Profile", icon: User },
  { href: "/seller/analytics", label: "Analytics", icon: TrendingUp },
];

export function SellerLayout({ children, title }: { children: React.ReactNode; title?: string }) {
  const { vendor } = useSellerContext();

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
            <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: GOLD }}>
              {vendor.name[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">{vendor.name}</p>
              <p className="text-[10px] text-white/50 truncate">{vendor.location}</p>
            </div>
          </div>
        )}

        <nav className="flex-1 px-3 py-4 space-y-0.5">
          {NAV_LINKS.map(({ href, label, icon: Icon }) => {
            const isActive = typeof window !== "undefined" && window.location.pathname.startsWith(basePath + href);
            return (
              <Link
                key={href}
                href={href}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all"
                style={{
                  color: isActive ? MAROON : "rgba(255,255,255,0.7)",
                  background: isActive ? IVORY : "transparent",
                }}
              >
                <Icon size={16} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="px-5 py-4 border-t border-white/10">
          <Link href="/" className="flex items-center gap-2 text-xs text-white/50 hover:text-white/80 transition-colors">
            <Store size={13} /> Back to Shop
          </Link>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
          <h1 className="font-serif text-xl font-bold" style={{ color: MAROON }}>
            {title ?? "Seller Panel"}
          </h1>
          {vendor && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ background: "#dcfce7", color: "#166534" }}>
                ● Approved
              </span>
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

const STAT_CARDS = [
  { label: "Total Revenue", value: "—", sub: "this month", icon: TrendingUp, color: "from-[#7B1C2C]/10 to-[#7B1C2C]/5", border: "border-[#7B1C2C]/20", iconBg: "#7B1C2C" },
  { label: "Total Orders", value: "—", sub: "all time", icon: ShoppingBag, color: "from-[#C9A84C]/10 to-[#C9A84C]/5", border: "border-[#C9A84C]/30", iconBg: "#C9A84C" },
  { label: "Active Listings", value: "—", sub: "products", icon: Package, color: "from-[#7B1C2C]/10 to-[#C9A84C]/5", border: "border-[#C9A84C]/20", iconBg: "#7B1C2C" },
  { label: "Store Rating", value: "—", sub: "avg. rating", icon: Store, color: "from-[#C9A84C]/10 to-[#7B1C2C]/5", border: "border-[#C9A84C]/20", iconBg: "#C9A84C" },
];

const QUICK_ACTIONS = [
  { href: "/seller/products", label: "Add New Product", icon: Package, desc: "List a new saree in your store" },
  { href: "/seller/orders", label: "View Orders", icon: ShoppingBag, desc: "Process and dispatch orders" },
  { href: "/seller/profile", label: "Edit Store Profile", icon: User, desc: "Update your shop details" },
  { href: "/seller/analytics", label: "View Analytics", icon: TrendingUp, desc: "Track your business performance" },
];

export default function SellerDashboard() {
  const { vendor } = useSellerContext();

  return (
    <SellerLayout title="Dashboard">
      <div className="max-w-5xl mx-auto space-y-8">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4"
        >
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-bold text-white shrink-0" style={{ background: MAROON }}>
            {vendor?.name[0]?.toUpperCase()}
          </div>
          <div>
            <h2 className="font-serif text-xl font-bold" style={{ color: MAROON }}>
              Welcome back, {vendor?.name}!
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {vendor?.tagline ?? vendor?.location ?? "Manage your store from here."}
            </p>
          </div>
        </motion.div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STAT_CARDS.map((card, i) => (
            <motion.div
              key={card.label}
              custom={i}
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              className={`bg-gradient-to-br rounded-2xl border p-5 ${card.color} ${card.border}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: card.iconBg }}>
                  <card.icon size={16} className="text-white" />
                </div>
              </div>
              <p className="text-2xl font-bold" style={{ color: MAROON }}>{card.value}</p>
              <p className="text-xs font-semibold text-gray-500 mt-0.5">{card.label}</p>
              <p className="text-[10px] text-gray-400">{card.sub}</p>
            </motion.div>
          ))}
        </div>

        <div>
          <h3 className="font-serif text-lg font-bold mb-4" style={{ color: MAROON }}>Quick Actions</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {QUICK_ACTIONS.map((action, i) => (
              <motion.div
                key={action.href}
                custom={i}
                initial="hidden"
                animate="visible"
                variants={fadeUp}
              >
                <Link
                  href={action.href}
                  className="group flex items-center gap-4 p-5 bg-white rounded-2xl border border-[#C9A84C]/20 hover:border-[#C9A84C]/60 hover:shadow-md transition-all"
                >
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors"
                    style={{ background: "#7B1C2C15" }}>
                    <action.icon size={20} style={{ color: MAROON }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold" style={{ color: MAROON }}>{action.label}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{action.desc}</p>
                  </div>
                  <ArrowRight size={16} className="text-gray-300 group-hover:text-[#C9A84C] transition-colors" />
                </Link>
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          custom={4}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Getting Started</h3>
          </div>
          <div className="space-y-3">
            {[
              { label: "Complete your store profile", href: "/seller/profile", done: !!(vendor?.bio && vendor?.contactEmail) },
              { label: "Add your first product", href: "/seller/products", done: (vendor?.sareesCount ?? 0) > 0 },
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
                <span className="text-sm" style={{ color: step.done ? "#6b7280" : "#3D1515", textDecoration: step.done ? "line-through" : "none" }}>
                  {step.label}
                </span>
                {!step.done && <ArrowRight size={14} className="ml-auto text-gray-300" />}
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </SellerLayout>
  );
}
