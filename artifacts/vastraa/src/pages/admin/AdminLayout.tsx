import React, { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Users, Package, UserCircle, Settings,
  LogOut, Shield, Menu, X, RotateCcw, ShieldAlert, BadgePercent, HelpCircle, Bell, BarChart3,
  LineChart, Receipt, FileText, Image, ShoppingBag, BarChart2, Clock, Calendar,
} from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
import { adminHeaders, adminKey, initAdmin2FAInterceptor } from '@/lib/adminApi';

const NAVY = "#0A1F44";
const NAVY2 = "#0B0C10";
const GOLD = "#C7CCD1";
const GOLD_DIM = "rgba(199,204,209,0.6)";

function RealtimeDateClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => {
      setTime(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formattedDate = time.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const formattedTime = time.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return (
    <div className="flex items-center gap-2.5 px-3.5 py-1.5 bg-gray-50/90 border border-gray-200/90 rounded-xl text-xs font-medium shadow-2xs">
      <div className="flex items-center gap-1.5 text-gray-700">
        <Calendar size={13} className="text-[#0A1F44]" />
        <span className="font-semibold text-gray-800">{formattedDate}</span>
      </div>
      <span className="text-gray-300">|</span>
      <div className="flex items-center gap-1.5 text-gray-700">
        <Clock size={13} className="text-emerald-600 animate-pulse" />
        <span className="font-mono text-[#0A1F44] font-bold tracking-tight">{formattedTime}</span>
      </div>
    </div>
  );
}

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
  { label: "Advertisements", href: "/admin/advertisements", icon: Image },
  { label: "Products", href: "/admin/products", icon: Package },
  { label: "Reports", href: "/admin/reports", icon: BarChart2 },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

function clearAdminSession() {
  sessionStorage.removeItem("td_admin_key");
  sessionStorage.removeItem("td_admin_session_token");
  sessionStorage.removeItem("td_admin_session_id");
}

export function AdminGuard({ children }: { children: React.ReactNode }) {
  const [, setLocation] = useLocation();
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    // Install the global 2FA intercept so every fetch() on any admin page
    // is covered, not just calls routed through adminFetch().
    initAdmin2FAInterceptor();

    const key = sessionStorage.getItem("td_admin_key");
    if (!key) {
      setLocation("/admin/login");
      return;
    }
    const sessionToken = sessionStorage.getItem("td_admin_session_token") ?? "";
    const headers: Record<string, string> = { "x-admin-key": key };
    if (sessionToken) headers["x-admin-session-token"] = sessionToken;

    fetch(`/api/admin/vendors`, {
      headers,
      credentials: "include",
    }).then(async (r) => {
      if (r.status === 403 || r.status === 401) {
        const body = await r.json().catch(() => ({}));
        if (body.code === "2FA_REQUIRED") {
          // Session exists but 2FA verification is required — send to verify screen
          const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
          setLocation(`/admin/2fa-verify?returnTo=${returnTo}`);
        } else if (body.code === "SESSION_REVOKED" || sessionToken) {
          // Stale/revoked session token attached to valid key — clear stale session token & retry with key only
          sessionStorage.removeItem("td_admin_session_token");
          sessionStorage.removeItem("td_admin_session_id");
          fetch(`/api/admin/vendors`, {
            headers: { "x-admin-key": key },
            credentials: "include",
          }).then((r2) => {
            if (r2.ok) setVerified(true);
            else { clearAdminSession(); setLocation("/admin/login"); }
          }).catch(() => setVerified(true));
        } else {
          // Key invalid — clear all auth and redirect to login
          clearAdminSession();
          setLocation("/admin/login");
        }
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

  const { data: countData } = useQuery({
    queryKey: ["admin-notif-count"],
    queryFn: async () => {
      const r = await fetch(`/api/admin/notifications/unread-count`, {
        headers: adminHeaders(),
        credentials: "include",
      });
      if (!r.ok) return { count: 0 };
      return r.json() as Promise<{ count: number }>;
    },
    enabled: !!adminKey(),
    staleTime: 30000,
  });
  const unread = countData?.count ?? 0;

  function signOut() {
    clearAdminSession();
    setLocation("/admin/login");
  }

  const isActive = (href: string) => location === href || location.startsWith(href + "/");

  const sidebar = (
    <div
      className="flex flex-col h-full"
      style={{ background: NAVY2 }}
    >
      <div className="px-5 py-6 border-b" style={{ borderColor: "rgba(199,204,209,0.15)" }}>
        <div className="flex items-center gap-3">
          <img
            src={`${basePath}/logo.svg`}
            alt="VASTRAA"
            className="h-10 w-auto object-contain bg-white/90 p-1.5 rounded-lg shadow-sm"
          />
          <div>
            <div className="font-serif text-sm font-bold text-white leading-tight">Super Admin</div>
            <div className="text-xs" style={{ color: GOLD_DIM }}>VASTRAA Portal</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-5 space-y-0.5 overflow-y-auto scroll-touch scrollbar-thin">
        {NAV_ITEMS.map(({ label, href, icon: Icon }) => {
          const active = isActive(href);
          return (
            <button
              key={href}
              onClick={() => { setLocation(href); setSidebarOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left min-h-[40px]"
              style={{
                background: active ? "rgba(199,204,209,0.12)" : "transparent",
                color: active ? GOLD : "rgba(255,255,255,0.65)",
                cursor: "pointer",
              }}
            >
              <Icon size={16} style={{ color: active ? GOLD : "rgba(255,255,255,0.5)" }} />
              <span>{label}</span>
            </button>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t" style={{ borderColor: "rgba(199,204,209,0.1)" }}>
        <button
          onClick={signOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors min-h-[40px]"
          style={{ color: "rgba(255,255,255,0.45)" }}
        >
          <LogOut size={15} />
          <span>Sign out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex" style={{ background: "#F4F5F7" }}>
      <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 fixed inset-y-0 left-0 z-20">
        {sidebar}
      </aside>

      {sidebarOpen && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-64 max-w-[85vw] h-full min-h-screen-dynamic z-40 flex flex-col lg:hidden pt-safe pb-safe">
            {sidebar}
          </aside>
        </>
      )}

      <div className="flex-1 flex flex-col lg:ml-56 min-w-0">
        <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-3.5 sm:px-6 py-3 flex items-center gap-2 sm:gap-4">
          <button
            className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open admin menu"
          >
            <Menu size={20} className="text-gray-600" />
          </button>
          <div className="flex-1" />
          <RealtimeDateClock />
          <button
            onClick={() => setLocation("/admin/notifications")}
            className="relative flex items-center justify-center w-10 h-10 min-h-[44px] min-w-[44px] rounded-md hover:bg-gray-100 transition-colors"
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

        <main className="flex-1 p-3.5 sm:p-6 overflow-x-hidden min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
}
