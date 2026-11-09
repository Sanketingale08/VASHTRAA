import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser, useClerk } from "@clerk/react";
import { useLocation } from "wouter";
import { getApiUrl, apiFetch } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface VendorProfile {
  id: string;
  name: string;
  shopName: string;
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
  statusReason: string | null;
  ownerId: string | null;
  vendorId: string | null;
  reactivationWelcomePending?: boolean;
  reactivationPending?: boolean;
  // Shop address
  shopStreet: string | null;
  shopAddressLine2: string | null;
  shopLandmark: string | null;
  shopCity: string | null;
  shopState: string | null;
  shopPincode: string | null;
  shopCountry: string | null;
  // Pickup address
  pickupSameAsShop: boolean;
  pickupLocationName: string | null;
  pickupAddressLine1: string | null;
  pickupAddressLine2: string | null;
  pickupLandmark: string | null;
  pickupCity: string | null;
  pickupState: string | null;
  pickupPincode: string | null;
  pickupCountry: string | null;
  shiprocketPickupLocationName?: string | null;
  shiprocketPickupId?: number | null;
  shiprocketPickupStatus?: "registered" | "pending" | "failed" | null;
  shiprocketPickupError?: string | null;
  shippingActivated?: boolean;
  bankHolder?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankIfsc?: string | null;
  bankVerified?: boolean;
  bankVerificationStatus?: "unverified" | "verification_pending" | "verified" | "verification_failed";
  bankVerificationDetails?: any;
  bankVerifiedAt?: string | null;
  cashfreeBeneficiaryId?: string | null;
  beneficiaryStatus?: "unregistered" | "beneficiary_registration_pending" | "beneficiary_active" | "beneficiary_registration_failed";
  beneficiaryRegisteredAt?: string | null;
  beneficiaryError?: string | null;
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
  const [status, setStatus] = useState<"loading" | "approved" | "pending" | "rejected" | "suspended" | "deactivated" | "none" | "unauthenticated">("loading");
  const [statusReason, setStatusReason] = useState<string | null>(null);
  const [showWelcomeBack, setShowWelcomeBack] = useState(false);

  const dismissedVendorIdsRef = React.useRef<Set<string>>(new Set());

  const performSellerSignOut = async () => {
    try {
      localStorage.removeItem("vastraa_seller_authenticated");
      localStorage.removeItem("vastraa_seller_email");
      localStorage.removeItem("vastraa_seller_token");
      localStorage.removeItem("vastraa_auth_token");
      localStorage.removeItem("clerk_user_id");
      sessionStorage.clear();
    } catch {
      // Storage fallback
    }

    try {
      await apiFetch("/api/seller/sign-out", { method: "POST" });
    } catch {
      // Ignore API logout error
    }

    try {
      await signOut();
    } catch {
      // Ignore Clerk signOut error
    }

    window.location.href = `${basePath}/seller/login`;
  };

  async function fetchVendor() {
    const token = typeof window !== "undefined" ? localStorage.getItem("vastraa_auth_token") : null;
    const isLocalSeller = typeof window !== "undefined" && (
      localStorage.getItem("vastraa_seller_authenticated") === "true" ||
      !!token
    );

    if (!isSignedIn && !isLocalSeller) {
      setStatus("unauthenticated");
      setLoading(false);
      return;
    }

    try {
      const res = await apiFetch("/api/seller/profile");

      if (res.status === 401) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("vastraa_seller_authenticated");
          localStorage.removeItem("vastraa_seller_email");
          localStorage.removeItem("vastraa_auth_token");
        }
        setStatus("unauthenticated");
        setLoading(false);
        return;
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        if (typeof window !== "undefined") {
          localStorage.removeItem("vastraa_seller_authenticated");
          localStorage.removeItem("vastraa_seller_email");
        }
        if (data.code === "VENDOR_PENDING") {
          setStatus("pending");
          setStatusReason(data.statusReason ?? null);
        } else if (data.code === "VENDOR_REJECTED") {
          setStatus("rejected");
          setStatusReason(data.statusReason ?? data.error ?? null);
        } else if (data.code === "VENDOR_DEACTIVATED") {
          if (typeof window !== "undefined") {
            localStorage.removeItem("vastraa_auth_token");
          }
          setStatus("deactivated");
          setStatusReason(data.statusReason ?? data.error ?? "Your account has been deactivated.");
        } else if (data.code === "VENDOR_NOT_FOUND") {
          setStatus("none");
          setStatusReason(data.error || "Vendor profile not found for this account. Please register your shop.");
        } else if (data.code === "VENDOR_PROFILE_INCOMPLETE") {
          setStatus("none");
          setStatusReason(data.error || "Your vendor profile is incomplete. Please complete your registration.");
        } else {
          if (typeof window !== "undefined") {
            localStorage.removeItem("vastraa_auth_token");
          }
          setStatus("suspended");
          setStatusReason(data.statusReason ?? data.error ?? "Your account has been suspended.");
        }
        setLoading(false);
        return;
      }

      if (res.status === 404) {
        if (typeof window !== "undefined") {
          localStorage.removeItem("vastraa_seller_authenticated");
          localStorage.removeItem("vastraa_seller_email");
        }
        setStatus("none");
        setLoading(false);
        return;
      }

      if (!res.ok) {
        // Transient server error (500/502/503) — preserve local authentication state
        setLoading(false);
        return;
      }

      const data = await res.json();
      if (data.status === "suspended") {
        if (typeof window !== "undefined") {
          localStorage.removeItem("vastraa_seller_authenticated");
          localStorage.removeItem("vastraa_seller_email");
          localStorage.removeItem("vastraa_auth_token");
        }
        setStatus("suspended");
        setStatusReason(data.statusReason || "Your account has been suspended.");
        setLoading(false);
        return;
      }

      setVendor(data);
      setStatus(data.status || "approved");
      setStatusReason(data.statusReason || null);
      const vId = data.id || data.vendorId;
      const isReactivationPending = Boolean(data.reactivationWelcomePending || data.reactivationPending);
      if (isReactivationPending && (!vId || !dismissedVendorIdsRef.current.has(vId))) {
        setShowWelcomeBack(true);
      } else {
        setShowWelcomeBack(false);
      }
      setLoading(false);
    } catch {
      // Network exception — preserve session, do NOT auto-logout
      setLoading(false);
    }
  }

  const [currentLocation] = useLocation();

  useEffect(() => {
    fetchVendor();
  }, [currentLocation, isLoaded, isSignedIn]);

  useEffect(() => {
    if (loading) return;
    if (status === "unauthenticated") {
      setLocation("/seller/login");
    }
  }, [status, loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F4F5F7" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "#0A1F44" }} />
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F7" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C7CCD1]/30 shadow-md p-8 sm:p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#FEF3C7" }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><path fill="#D97706" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5m0 4h.01" strokeWidth="2" stroke="#D97706" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 tracking-wide" style={{ color: "#0A1F44" }}>Application Pending Approval</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Your vendor application is under review by Super Admin. You'll be able to access your Seller Panel once approved.
          </p>
          <a
            href={basePath || "/"}
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-wider rounded-xl transition-all hover:bg-[#2C3E6B] shadow-sm"
            style={{ background: "#0A1F44", color: "#F4F5F7" }}
          >
            Back to Shopping
          </a>
        </div>
      </div>
    );
  }

  if (status === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F7" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-md p-8 sm:p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 text-red-700 tracking-wide">Application Rejected</h2>
          <p className="text-sm text-gray-500 mb-4">
            Your vendor registration application has been rejected by Super Admin.
          </p>
          {statusReason && (
            <div className="mt-2 mb-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1">Reason</p>
              <p className="text-sm text-red-800 leading-relaxed">{statusReason}</p>
            </div>
          )}
          <a
            href={basePath || "/"}
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-wider rounded-xl transition-all hover:bg-[#2C3E6B] shadow-sm"
            style={{ background: "#0A1F44", color: "#F4F5F7" }}
          >
            Back to Shopping
          </a>
        </div>
      </div>
    );
  }

  if (status === "deactivated") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(10, 31, 68, 0.65)", backdropFilter: "blur(4px)" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-2xl p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50 text-red-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 text-red-700 tracking-wide">
            Your account has been deactivated.
          </h2>
          <p className="text-sm text-gray-600 mb-5 leading-relaxed">
            Your seller account has been deactivated. Please contact support if you believe this is an error.
          </p>
          {(statusReason || vendor?.statusReason) && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50/80 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-red-500 mb-1">Reason</p>
              <p className="text-sm text-red-900 leading-relaxed">{statusReason || vendor?.statusReason}</p>
            </div>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <a
              href="/contact"
              className="w-full py-3 px-6 font-bold text-sm uppercase tracking-wider rounded-xl transition-all text-white flex items-center justify-center gap-2 shadow-sm"
              style={{ background: "#0A1F44" }}
            >
              Contact Support
            </a>
            <button
              onClick={performSellerSignOut}
              className="w-full py-2.5 px-6 font-semibold text-xs text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Sign out of account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ background: "rgba(10, 31, 68, 0.65)", backdropFilter: "blur(4px)" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-2xl p-8 sm:p-10 text-center relative overflow-hidden">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50 text-red-600">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
              <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 text-red-700 tracking-wide">
            Your account has been suspended.
          </h2>
          <p className="text-sm text-gray-600 mb-5 leading-relaxed">
            Your vendor account has been suspended by the administration. You currently cannot access the Seller Dashboard or manage your store.
          </p>
          {(statusReason || vendor?.statusReason) && (
            <div className="mb-6 rounded-xl border border-red-100 bg-red-50/80 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-red-500 mb-1">Reason</p>
              <p className="text-sm text-red-900 leading-relaxed">{statusReason || vendor?.statusReason}</p>
            </div>
          )}
          <div className="flex flex-col gap-3 pt-2">
            <a
              href="/contact"
              className="w-full py-3 px-6 font-bold text-sm uppercase tracking-wider rounded-xl transition-all text-white flex items-center justify-center gap-2 shadow-sm"
              style={{ background: "#0A1F44" }}
            >
              Contact Support
            </a>
            <button
              onClick={performSellerSignOut}
              className="w-full py-2.5 px-6 font-semibold text-xs text-gray-500 hover:text-gray-800 transition-colors cursor-pointer"
            >
              Sign out of account
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F7" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C7CCD1]/30 shadow-md p-8 sm:p-10 text-center">
          <h2 className="font-serif text-2xl font-bold mb-3 tracking-wide" style={{ color: "#0A1F44" }}>No Vendor Account</h2>
          <p className="text-sm text-gray-500 mb-6">
            This account doesn't have a seller store yet. Register a new store, or sign in with your seller account.
          </p>
          <div className="flex flex-col gap-3">
            <a
              href={`${basePath}/seller/register`}
              className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-wider rounded-xl transition-all hover:bg-[#2C3E6B] shadow-sm"
              style={{ background: "#0A1F44", color: "#F4F5F7" }}
            >
              Register New Store
            </a>
            <button
              onClick={performSellerSignOut}
              className="inline-flex items-center justify-center gap-2 py-3 px-8 font-semibold text-sm rounded-xl border border-[#C7CCD1]/50 hover:bg-[#E5E8EC] transition-colors w-full cursor-pointer"
              style={{ color: "#0A1F44" }}
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
    const currentVendorId = vendor?.id || vendor?.vendorId;
    if (currentVendorId) {
      dismissedVendorIdsRef.current.add(currentVendorId);
    }
    setVendor((v) => v ? { ...v, reactivationWelcomePending: false, reactivationPending: false } : null);
    try {
      await apiFetch("/api/seller/reactivation-welcome/dismiss", {
        method: "POST",
      });
    } catch {
      // Best-effort — local state & session ref prevent repeated popups
    }
  }

  const MAROON = "#0A1F44";
  const GOLD = "#C7CCD1";

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

            <p className="text-sm text-gray-700 font-medium mb-2 leading-relaxed">
              Your account has been successfully reactivated.
            </p>
            <p className="text-sm text-gray-500 mb-7 leading-relaxed">
              You can now access your VASTRAA Seller Dashboard and continue managing your shop.
            </p>

            <button
              onClick={dismissWelcomeBack}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-opacity hover:opacity-90"
              style={{ background: MAROON, color: "#F4F5F7" }}
            >
              Continue to Dashboard
            </button>
          </div>
        </div>
      )}
    </SellerContext.Provider>
  );
}
