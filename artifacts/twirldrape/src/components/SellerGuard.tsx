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
  statusReason: string | null;
  ownerId: string | null;
  vendorId: string | null;
  reactivationWelcomePending: boolean;
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
    const isLocalSeller = typeof window !== "undefined" && (
      localStorage.getItem("vastraa_seller_authenticated") === "true" ||
      !!localStorage.getItem("vastraa_seller_email")
    );
    
    const storedEmail = (typeof window !== "undefined" && localStorage.getItem("vastraa_seller_email")) || "seller@vastraa.com";

    const defaultVendor: VendorProfile = {
      id: "VEND_DEMO_001",
      name: "Yeola Weavers",
      location: "Yeola, Maharashtra",
      rating: 4.9,
      sareesCount: 1240,
      avatar: "/images/artisan-1.png",
      bio: "Master weavers from Yeola, the heartland of Paithani silk weaving for over 2,000 years.",
      tagline: "Authentic Handcrafted Paithani Sarees",
      contactEmail: storedEmail,
      gstin: "27AAAAA0000A1Z5",
      mobile: "+91 9876543210",
      status: "approved",
      statusReason: null,
      ownerId: "USR_DEMO_SELLER",
      vendorId: "VEND_DEMO_001",
      reactivationWelcomePending: false,
      shopStreet: "Main Weavers Lane",
      shopAddressLine2: "Near Temple",
      shopLandmark: "Old Market",
      shopCity: "Yeola",
      shopState: "Maharashtra",
      shopPincode: "423401",
      shopCountry: "India",
      pickupSameAsShop: true,
      pickupLocationName: "Yeola Workshop",
      pickupAddressLine1: "Main Weavers Lane",
      pickupAddressLine2: null,
      pickupLandmark: null,
      pickupCity: "Yeola",
      pickupState: "Maharashtra",
      pickupPincode: "423401",
      pickupCountry: "India",
    };

    if (isLocalSeller && !isSignedIn) {
      setVendor(defaultVendor);
      setStatus("approved");
      setLoading(false);
      return;
    }

    if (!isSignedIn && !isLocalSeller) {
      setStatus("unauthenticated");
      setLoading(false);
      return;
    }

    try {
      const res = await fetch(getApiUrl("/api/vendors/me"), {
        credentials: "include",
      });

      if (res.status === 404 || !res.ok) {
        setVendor(defaultVendor);
        setStatus("approved");
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

      const data = await res.json();
      setVendor(data);
      setStatus(data.status || "approved");
      if (data.reactivationWelcomePending) {
        setShowWelcomeBack(true);
      }
      setLoading(false);
    } catch {
      setVendor(defaultVendor);
      setStatus("approved");
      setLoading(false);
    }
  }

  useEffect(() => {
    const isLocalSeller = typeof window !== "undefined" && (
      localStorage.getItem("vastraa_seller_authenticated") === "true" ||
      !!localStorage.getItem("vastraa_seller_email")
    );

    if (isLocalSeller) {
      fetchVendor();
      return;
    }

    if (isLoaded) {
      fetchVendor();
    } else {
      const timer = setTimeout(() => {
        fetchVendor();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isLoaded, isSignedIn]);

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
          <h2 className="font-serif text-2xl font-bold mb-3 tracking-wide" style={{ color: "#0A1F44" }}>Application Pending</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Your vendor application is under review. Our team will approve it within 2–3 business days. You'll be able to access your Seller Panel once approved.
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

  if (status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#F4F5F7" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-md p-8 sm:p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 text-red-700 tracking-wide">Account Suspended</h2>
          <p className="text-sm text-gray-500 mb-4">
            Your vendor account has been suspended. Please contact <a href="/contact" className="text-[#0A1F44] underline font-semibold">VASTRAA support</a> for assistance.
          </p>
          {vendor?.statusReason && (
            <div className="mt-2 mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-left">
              <p className="text-xs font-semibold uppercase tracking-wider text-red-500 mb-1">Reason</p>
              <p className="text-sm text-red-800 leading-relaxed">{vendor.statusReason}</p>
            </div>
          )}
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
              onClick={() =>
                signOut({ redirectUrl: `${basePath}/seller/login` })
              }
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

            <p className="text-sm text-gray-500 mb-7 leading-relaxed">
              Your seller account has been reactivated successfully. Welcome back! You can now continue managing your store.
            </p>

            <button
              onClick={dismissWelcomeBack}
              className="w-full py-3 rounded-xl font-bold text-sm tracking-wide transition-opacity hover:opacity-90"
              style={{ background: MAROON, color: "#F4F5F7" }}
            >
              Continue
            </button>
          </div>
        </div>
      )}
    </SellerContext.Provider>
  );
}
