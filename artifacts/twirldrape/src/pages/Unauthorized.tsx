import { Link } from "wouter";
import { ShieldX } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Unauthorized() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "#F3F8F5" }}
    >
      <div className="max-w-md w-full bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-10 text-center">
        {/* Icon */}
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
          style={{ background: "#FEF3C7" }}
        >
          <ShieldX size={32} style={{ color: "#D97706" }} />
        </div>

        {/* Heading */}
        <h1
          className="font-serif text-2xl font-bold mb-2"
          style={{ color: "#1E6B5A" }}
        >
          Access Denied
        </h1>
        <p className="text-sm text-gray-500 mb-8 leading-relaxed">
          You don't have permission to view this page. Please use the correct
          portal for your account type.
        </p>

        {/* Primary CTA */}
        <a
          href={basePath || "/"}
          className="inline-flex items-center justify-center w-full py-3 px-8 mb-3 font-bold text-sm uppercase tracking-widest rounded-sm transition-opacity hover:opacity-90"
          style={{ background: "#1E6B5A", color: "#F3F8F5" }}
        >
          Back to Shopping
        </a>

        {/* Portal links */}
        <div className="flex flex-col gap-2 mt-2">
          <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">
            Or sign in to a different portal
          </p>
          <Link
            href="/seller/login"
            className="inline-flex items-center justify-center py-2.5 px-6 text-sm font-semibold rounded-sm border transition-colors hover:bg-[#E6F0EA]"
            style={{ borderColor: "#C9A84C60", color: "#1E6B5A" }}
          >
            Seller Portal
          </Link>
          <Link
            href="/admin/login"
            className="inline-flex items-center justify-center py-2.5 px-6 text-sm font-semibold rounded-sm border transition-colors hover:bg-gray-50"
            style={{ borderColor: "#d1d5db", color: "#6b7280" }}
          >
            Admin Portal
          </Link>
        </div>
      </div>
    </div>
  );
}
