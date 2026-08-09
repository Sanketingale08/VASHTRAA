import React, { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Package, UserCircle, Settings,
  LogOut, Shield, Menu, X, RotateCcw, ShieldAlert, BadgePercent, HelpCircle, Bell, BarChart3,
  LineChart, Receipt, FileText, Image, ShoppingBag, BarChart2,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAVY = "#0D1B36";
const NAVY2 = "#091429";
const GOLD = "#C9A84C";
const GOLD_DIM = "rgba(201,168,76,0.6)";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
  { label: "Vendors", href: "/admin/vendors", icon: Users },
  { label: "Vendor Analytics", href: "/admin/vendor-analytics", icon: BarChart3 },
  { label: "Business Intelligence", href: "/admin/business-intelligence", icon: LineChart },
  { label: "Financial Management", href: "/admin/financial", icon: Receipt },
  { label: "Orders", href: "/admin/orders", icon: ShoppingBag },
  { label: "Returns & Refunds", href: "/admin/returns", icon: RotateCcw },
  { label: "Seller Disputes", href: "/admin/disputes", icon: ShieldAlert },
  { label: "Coupons", href: "/admin/coupons", icon: BadgePercent },
  { label: "Support", href: "/admin/support", icon: HelpCircle },
  { label: "Notifications", href: "/admin/notifications", icon: Bell },
  { label: "About Page", href: "/admin/about-content", icon: FileText },
  { label: "Hero Banners", href: "/admin/hero-banners", icon: Image },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Reports", href: "/admin/reports", icon: BarChart2 },
  { label: "Settings", href: "/admin/settings", icon: Settings, stub: true },
];

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    const key = sessionStorage.getItem("td_admin_key");
    if (!key) {
      setLocation("/admin/login");
      return;
    }
    fetch(`/api/admin/vendors`, {
      headers: { "x-admin-key": key },
      credentials: "include",
    }).then((r) => {
      if (r.status === 403) {
        sessionStorage.removeItem("td_admin_key");
        setLocation("/admin/login");
      } else {
        setVerified(true);
      }
    }).catch(() => {
      setVerified(true);
    });
  }, []);

  if (!verified) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: NAVY }}
      >
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: GOLD, borderTopColor: "transparent" }} />
          <span className="text-sm" style={{ color: GOLD_DIM }}>Verifying session…</span>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location, setLocation] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  const { data: countData } = useQuery({
    queryKey: ["admin-notif-count"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/notifications/unread-count`, {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (!r.ok) return { count: 0 };
      return r.json() as Promise<{ count: number }>;
    },
    enabled: !!adminKey,
    refetchInterval: 8000,
    staleTime: 30000,
  });
  const unread = countData?.count ?? 0;

  function signOut() {
    sessionStorage.removeItem("td_admin_key");
    setLocation("/admin/login");
  }

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const sidebar = (
    <div
      className="flex flex-col h-full"
      style={{ background: NAVY2 }}
    >
      <div className="px-5 py-6 border-b" style={{ borderColor: "rgba(201,168,76,0.15)" }}>
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: GOLD }}
          >
            <Shield size={16} style={{ color: NAVY }} />
          </div>
          <div>
            <div className="font-serif text-sm font-bold text-white leading-tight">Super Admin</div>
            <div className="text-xs" style={{ color: GOLD_DIM }}>TwirlDrape Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ label, href, icon: Icon, stub }) => {
          const active = isActive(href);
          return (
            <button
              key={href}
              onClick={() => { if (!stub) { setLocation(href); setSidebarOpen(false); } }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left"
              style={{
                background: active ? "rgba(201,168,76,0.12)" : "transparent",
                color: active ? GOLD : stub ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.65)",
                cursor: stub ? "default" : "pointer",
              }}
            >
              <Icon size={16} style={{ color: active ? GOLD : stub ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.5)" }} />
              <span>{label}</span>
              {stub && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)", fontSize: "9px" }}>
                  SOON
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(201,168,76,0.1)" }}>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "#F1F5F9" }}>
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 fixed inset-y-0 left-0 z-20">
        {sidebar}
      </aside>

      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-56 z-40 flex flex-col lg:hidden">
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col lg:ml-56 min-w-0">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3.5 flex items-center gap-4">
          <button
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu size={18} className="text-gray-600" />
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setLocation("/admin/notifications")}
            className="relative flex items-center justify-center w-9 h-9 rounded-md hover:bg-gray-100 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} className="text-gray-600" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 bg-red-500 text-white text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
          <div className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
              style={{ background: NAVY, color: GOLD }}
            >
              A
            </div>
            <span className="text-sm text-gray-500 hidden sm:block">Super Admin</span>
          </div>
        </header>

        <main className="flex-1 p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
