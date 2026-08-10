import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { getApiUrl } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface VendorProfile {
  id: string;
  name: string;
  location: string;
  rating: number;
  sareesCount: number;
  avatar: string;
  bio: string | null;
  tagline: string | null;
  contactEmail: string | null;
  gstin: string | null;
  mobile: string | null;
  status: "pending" | "approved" | "suspended";
  ownerId: string | null;
  vendorId: string | null;
  reactivationWelcomePending: boolean;
}

interface SellerContextValue {
  vendor: VendorProfile | null;
  loading: boolean;
  refresh: () => void;
}

const SellerContext = createContext<SellerContextValue>({
  vendor: null,
  loading: true,
  refresh: () => {},
});

export function useSellerContext() {
  return useContext(SellerContext);
}

interface SellerGuardProps {
  children: React.ReactNode;
}

export function SellerGuard({ children }: SellerGuardProps) {
  const { isSignedIn, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"loading" | "approved" | "pending" | "suspended" | "none" | "unauthenticated">("loading");
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);

  async function fetchVendor() {
    if (!isSignedIn) {
      setStatus("unauthenticated");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(getApiUrl("/api/vendors/me"), {
        credentials: "include",
      });

      if (res.status === 404) {
        setStatus("none");
        setLoading(false);
        return;
      }

      if (res.status === 403) {
        const data = await res.json();
        if (data.code === "VENDOR_PENDING") {
          setStatus("pending");
        } else if (data.code === "VENDOR_SUSPENDED") {
          setStatus("suspended");
        } else {
          setStatus("none");
        }
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setStatus("none");
        setLoading(false);
        return;
      }

      const data = await res.json();
      setVendor(data);
      setStatus(data.status);
      if (data.reactivationWelcomePending) {
        setShowWelcomeBack(true);
      }
      setLoading(false);
    } catch {
      setStatus("none");
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isLoaded) return;
    fetchVendor();
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    if (loading) return;
    if (status === "unauthenticated") {
      setLocation("/unauthorized");
    }
  }, [status, loading]);

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F3F8F5" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "#1E6B5A" }} />
          <p className="text-sm text-gray-400">Loading seller panel…</p>
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  if (status === "pending") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F3F8F5" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#FEF3C7" }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><path fill="#D97706" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5m0 4h.01" strokeWidth="2" stroke="#D97706" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: "#1E6B5A" }}>Application Pending</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Your vendor application is under review. Our team will approve it within 2–3 business days. You'll be able to access your Seller Panel once approved.
          </p>
          <a
            href={basePath || "/"}
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-widest rounded-sm"
            style={{ background: "#1E6B5A", color: "#F3F8F5" }}
          >
            Back to Shopping
          </a>
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F3F8F5" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 text-red-700">Account Suspended</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your vendor account has been suspended. Please contact <a href="/contact" className="text-[#1E6B5A] underline">TwirlDrape support</a> for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F3F8F5" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-10 text-center">
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: "#1E6B5A" }}>No Vendor Account</h2>
          <p className="text-sm text-gray-500 mb-6">
            This account doesn't have a seller store yet. Register a new store, or sign in with your seller account.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href={`${basePath}/seller/register`}
              className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-widest rounded-sm"
              style={{ background: "#1E6B5A", color: "#F3F8F5" }}
            >
              Register New Store
            </a>
            <button
              onClick={() =>
                signOut({ redirectUrl: `${basePath}/seller/login` })
              }
              className="inline-flex items-center justify-center gap-2 py-3 px-8 font-semibold text-sm rounded-sm border border-[#C9A84C]/40 hover:bg-[#E6F0EA] transition-colors w-full"
              style={{ color: "#1E6B5A" }}
            >
              Sign in with a different account
            </button>
            <a
              href={basePath || "/"}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              Back to shopping
            </a>
          </div>
        </div>
      </div>
    );
  }

  async function dismissWelcomeBack() {
    setShowWelcomeBack(false);
    try {
      await fetch(getApiUrl("/api/seller/reactivation-welcome/dismiss"), {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort — if the network call fails the popup won't reappear
      // until the next page load (flag is still true server-side), which is acceptable.
    }
  }

  const MAROON = "#1E6B5A";
  const GOLD = "#C9A84C";

  return (
    <SellerContext.Provider value={{ vendor, loading, refresh: fetchVendor }}>
      {children}

      {/* One-time "Welcome Back!" popup shown after a seller is reactivated */}
      {showWelcomeBack && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-8 text-center"
            style={{ border: `1px solid ${GOLD}44` }}
          >
            {/* Icon */}
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
              style={{ background: `${MAROON}15` }}
            >
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
                <path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0Z" stroke={MAROON} strokeWidth="1.8"/>
                <path d="M8 12.5l2.5 2.5 5.5-5.5" stroke={MAROON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>

            <h2
              className="font-serif text-2xl font-bold mb-3"
              style={{ color: MAROON }}
            >
              Welcome Back!
            </h2>

            <p className="text-sm text-gray-500 mb-7 leading-relaxed">
              Your seller account has been reactivated successfully. Welcome back! You can now continue managing your store.
            </p>

            <button
              onClick={dismissWelcomeBack}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-opacity hover:opacity-90"
              style={{ background: MAROON, color: "#F3F8F5" }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </SellerContext.Provider>
  );
}
