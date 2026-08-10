import React, { useEffect } from "react";
import { SignIn, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

export default function SellerLogin() {
  const { isSignedIn } = useUser();
  const [, setLocation] = useLocation();

  // Silently redirect already-authenticated users to the dashboard;
  // SellerGuard will handle approval / no-vendor states from there.
  useEffect(() => {
    if (isSignedIn) {
      setLocation("/seller/dashboard");
    }
  }, [isSignedIn]);

  // Render nothing while the redirect is in flight
  if (isSignedIn) return null;

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2f5c 100%)` }}
    >
      <div className="w-full max-w-md">
        {/* Logo + portal label */}
        <div className="text-center mb-8">
          <img
            src={`${basePath}/images/logo.png`}
            alt="TwirlDrape"
            className="h-10 w-auto object-contain brightness-0 invert mx-auto mb-3"
          />
          <p
            className="text-xs font-bold uppercase tracking-[0.3em]"
            style={{ color: GOLD }}
          >
            Seller Portal
          </p>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
            Sign in to manage your store
          </p>
        </div>

        {/* ── Sign-in card ── */}
        <div
          className="rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.1)",
            backdropFilter: "blur(12px)",
          }}
        >
          {/* Label hint above Clerk component */}
          <div className="px-6 pt-5 pb-0">
            <p
              className="text-[11px] font-bold uppercase tracking-widest mb-0.5"
              style={{ color: GOLD }}
            >
              Sign In
            </p>
            <p
              className="text-xs"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Enter your email or mobile number
            </p>
          </div>

          <SignIn
            routing="path"
            path={`${basePath}/seller/login`}
            signUpUrl={`${basePath}/seller/register`}
            forceRedirectUrl={`${basePath}/seller/dashboard`}
            appearance={{
              elements: {
                rootBox: "w-full",
                cardBox:
                  "!w-full !rounded-none !shadow-none !border-none !bg-transparent",
                card: "!shadow-none !border-none !bg-transparent !rounded-none",
                footer:
                  "!shadow-none !border-none !bg-transparent !rounded-none",
                // Hide social/OAuth provider buttons and the "or" divider
                socialButtonsBlock: { display: "none" },
                socialButtonsBlockButton: { display: "none" },
                dividerRow: { display: "none" },
              },
            }}
          />
        </div>

        {/* ── Register New Shop CTA ── */}
        <div
          className="mt-4 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
          }}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white">
              New to TwirlDrape?
            </p>
            <p
              className="text-xs mt-0.5"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              Register your store and start selling
            </p>
          </div>
          <a
            href={`${basePath}/seller/register`}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs transition-all hover:opacity-90"
            style={{ background: GOLD, color: NAVY }}
          >
            Register New Shop <ArrowRight size={13} />
          </a>
        </div>

        {/* ── Trust badges ── */}
        <div
          className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-1.5 justify-center text-xs"
          style={{ color: "rgba(255,255,255,0.35)" }}
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} style={{ color: GOLD }} /> Free to join
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} style={{ color: GOLD }} /> No setup fees
          </span>
          <span className="flex items-center gap-1.5">
            <Zap size={12} style={{ color: GOLD }} /> Go live in minutes
          </span>
        </div>
      </div>
    </div>
  );
}
