import React, { createContext, useContext, useEffect, useState } from "react";
import { useUser } from "@clerk/react";
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
  status: "pending" | "approved" | "suspended";
  ownerId: string | null;
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
  const [, setLocation] = useLocation();
  const [vendor, setVendor] = useState<VendorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"loading" | "approved" | "pending" | "suspended" | "none" | "unauthenticated">("loading");

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
      setLocation("/admin/login");
    }
  }, [status, loading]);

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FAF6EE" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3" style={{ borderColor: "#7B1C2C" }} />
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
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#FAF6EE" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#FEF3C7" }}>
            <svg width="32" height="32" fill="none" viewBox="0 0 24 24"><path fill="#D97706" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5m0 4h.01" strokeWidth="2" stroke="#D97706" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: "#7B1C2C" }}>Application Pending</h2>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Your vendor application is under review. Our team will approve it within 2–3 business days. You'll be able to access your Seller Panel once approved.
          </p>
          <a
            href={basePath || "/"}
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-widest rounded-sm"
            style={{ background: "#7B1C2C", color: "#FAF6EE" }}
          >
            Back to Shopping
          </a>
        </div>
      </div>
    );
  }

  if (status === "suspended") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#FAF6EE" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-red-200 shadow-sm p-10 text-center">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5 bg-red-50">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#ef4444" strokeWidth="2"/><path d="M15 9l-6 6M9 9l6 6" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/></svg>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3 text-red-700">Account Suspended</h2>
          <p className="text-sm text-gray-500 mb-6">
            Your vendor account has been suspended. Please contact <a href="/contact" className="text-[#7B1C2C] underline">TwirlDrape support</a> for assistance.
          </p>
        </div>
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#FAF6EE" }}>
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-10 text-center">
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: "#7B1C2C" }}>No Vendor Account</h2>
          <p className="text-sm text-gray-500 mb-6">
            You don't have a vendor account yet. Apply to become a TwirlDrape seller.
          </p>
          <a
            href={`${basePath}/seller/register`}
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-widest rounded-sm"
            style={{ background: "#7B1C2C", color: "#FAF6EE" }}
          >
            Register as a Vendor
          </a>
        </div>
      </div>
    );
  }

  return (
    <SellerContext.Provider value={{ vendor, loading, refresh: fetchVendor }}>
      {children}
    </SellerContext.Provider>
  );
}
