import React from "react";
import { SignIn } from "@clerk/react";
import { ArrowRight, CheckCircle2, Zap } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Palette drawn from the reference image
const TEAL   = "#1E6B5A";   // headings, buttons, links
const GOLD   = "#C9A84C";   // brand accent (TWIRLDRAPE lettering)
const BG     = "#EFF5F1";   // page mint-cream background
const CARD   = "#FFFFFF";   // login card
const INPUT  = "#EBF3EE";   // input field fill
const BORDER = "#D4E9DC";   // card / input borders

export default function SellerLogin() {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12"
      style={{ background: BG }}
    >
      <div className="w-full max-w-md">

        {/* ── Logo + portal label ── */}
        <div className="text-center mb-6">
          <p
            className="text-[10px] font-semibold uppercase tracking-[0.25em]"
            style={{ color: GOLD }}
          >
            Seller Portal · Authentic Sarees
          </p>
        </div>

        {/* ── Sign-in card ── */}
        <div
          className="rounded-2xl shadow-md overflow-hidden"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          <SignIn
            routing="path"
            path={`${basePath}/seller/login`}
            signUpUrl={`${basePath}/seller/register`}
            forceRedirectUrl={`${basePath}/seller/dashboard`}
            appearance={{
              variables: {
                colorPrimary:        TEAL,
                colorBackground:     CARD,
                colorInputBackground: INPUT,
                colorText:           "#1a1a1a",
                colorTextSecondary:  "#6b7280",
                colorInputText:      "#1a1a1a",
                borderRadius:        "0.625rem",
              },
              elements: {
                rootBox: "w-full",
                cardBox:
                  "!w-full !rounded-none !shadow-none !border-none !bg-transparent",
                card:
                  "!shadow-none !border-none !bg-transparent !rounded-none",
                // Hide Clerk's built-in footer (we show our own CTA below)
                footer: "!hidden",
                // Hide social / OAuth buttons and the "or" divider
                socialButtonsBlock:       { display: "none" },
                socialButtonsBlockButton: { display: "none" },
                dividerRow:               { display: "none" },
              },
            }}
          />
        </div>

        {/* ── Register New Shop CTA ── */}
        <div
          className="mt-3 rounded-xl px-5 py-4 flex items-center justify-between gap-4"
          style={{ background: CARD, border: `1px solid ${BORDER}` }}
        >
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: TEAL }}>
              New to TwirlDrape?
            </p>
            <p className="text-xs mt-0.5 text-gray-500">
              Register your store and start selling
            </p>
          </div>
          <a
            href={`${basePath}/seller/register`}
            className="shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs text-white transition-all hover:opacity-90"
            style={{ background: TEAL }}
          >
            Register New Shop <ArrowRight size={13} />
          </a>
        </div>

        {/* ── Trust badges ── */}
        <div
          className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 justify-center text-xs"
          style={{ color: "#9CA3AF" }}
        >
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} style={{ color: TEAL }} /> Free to join
          </span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 size={12} style={{ color: TEAL }} /> No setup fees
          </span>
          <span className="flex items-center gap-1.5">
            <Zap size={12} style={{ color: GOLD }} /> Go live in minutes
          </span>
        </div>

      </div>
    </div>
  );
}
