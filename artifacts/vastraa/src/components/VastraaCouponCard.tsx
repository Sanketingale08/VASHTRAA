import React, { useState, useRef, useCallback } from "react";
import { Copy, Check, Clock, Tag, CheckCircle, XCircle } from "lucide-react";
import { motion } from "framer-motion";

export interface VastraaCoupon {
  id?: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description?: string | null;
  offerDisplayText?: string | null;
  minimumOrderValue?: number;
  maxDiscountAmount?: number | null;
  eligibleCategories?: string[] | null;
  firstOrderOnly?: boolean;
  perCustomerLimit?: number | null;
  startDate?: string | Date | null;
  expiresAt?: string | Date | null;
  maxUses?: number | null;
  usedCount?: number;
  active?: boolean;
  offerType?: string;
  tagline?: string;
}

export interface VastraaCouponCardProps {
  coupon: VastraaCoupon;
  cartSubtotal?: number;
  delay?: number;
  onApply?: (code: string) => void;
  isApplied?: boolean;
  isExpired?: boolean;
  isUsed?: boolean;
  orderId?: string;
  redeemedAt?: string | Date;
  className?: string;
  compact?: boolean;
}

/**
 * Ornamental Lotus Motif Component (— 🪷 —)
 * Pixel-matched to the VASTRAA reference ticket motif.
 */
export function LotusOrnament({
  color = "#D4AF5A",
  className = "",
  size = 22,
}: {
  color?: string;
  className?: string;
  size?: number;
}) {
  return (
    <div className={`inline-flex items-center justify-center gap-2 ${className}`} aria-hidden="true">
      <span className="w-5 sm:w-7 h-[1px]" style={{ backgroundColor: color, opacity: 0.55 }} />
      <svg
        width={size}
        height={Math.round((size * 14) / 22)}
        viewBox="0 0 24 16"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ color }}
        className="shrink-0"
      >
        {/* Center pointed petal */}
        <path
          d="M12 1.5C10.7 4.8 10.7 9.5 12 12C13.3 9.5 13.3 4.8 12 1.5Z"
          stroke="currentColor"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Left inner petal */}
        <path
          d="M11 5C8.8 6.5 7.5 9 8.5 11.5C9.8 11.2 11 10 11.5 8"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Right inner petal */}
        <path
          d="M13 5C15.2 6.5 16.5 9 15.5 11.5C14.2 11.2 13 10 12.5 8"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Left outer petal */}
        <path
          d="M7.5 9C5 9.5 3.5 11.2 4.5 13C6.2 13 8 12.2 9 11"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Right outer petal */}
        <path
          d="M16.5 9C19 9.5 20.5 11.2 19.5 13C17.8 13 16 12.2 15 11"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Bottom base curve */}
        <path
          d="M8.5 13.5C10.5 14.5 13.5 14.5 15.5 13.5"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
      <span className="w-5 sm:w-7 h-[1px]" style={{ backgroundColor: color, opacity: 0.55 }} />
    </div>
  );
}

/**
 * Calculates human-readable expiry information and status
 */
export function getExpiryInfo(expiresAt: string | Date | null | undefined): {
  text: string;
  isUrgent: boolean;
  isExpired: boolean;
} {
  if (!expiresAt) {
    return { text: "No expiry", isUrgent: false, isExpired: false };
  }

  const expiryDate = new Date(expiresAt);
  if (Number.isNaN(expiryDate.getTime())) {
    return { text: "No expiry", isUrgent: false, isExpired: false };
  }

  const now = Date.now();
  const diffMs = expiryDate.getTime() - now;
  const diffHours = diffMs / 3600000;
  const diffDays = Math.ceil(diffMs / 86400000);

  if (diffMs <= 0) {
    return { text: "Expired", isUrgent: true, isExpired: true };
  }

  if (diffHours <= 24) {
    return { text: "Expires today", isUrgent: true, isExpired: false };
  }

  if (diffDays === 1) {
    return { text: "Expires in 1 day", isUrgent: true, isExpired: false };
  }

  if (diffDays <= 3) {
    return { text: `Expires in ${diffDays} days`, isUrgent: true, isExpired: false };
  }

  const formatted = expiryDate.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: expiryDate.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });

  return { text: `Expires on ${formatted}`, isUrgent: false, isExpired: false };
}

/**
 * Calculates remaining usage count
 */
export function getUsageInfo(maxUses: number | null | undefined, usedCount: number = 0): {
  text: string;
  isExhausted: boolean;
  remaining: number | null;
} {
  if (maxUses === null || maxUses === undefined) {
    return { text: "Unlimited uses", isExhausted: false, remaining: null };
  }

  const remaining = Math.max(0, maxUses - (usedCount || 0));
  const isExhausted = remaining === 0;

  return {
    text: `${remaining.toLocaleString("en-IN")} use${remaining !== 1 ? "s" : ""} remaining`,
    isExhausted,
    remaining,
  };
}

/**
 * Formats coupon title, subtitle, and badges based on coupon properties
 */
export function formatCouponDisplay(coupon: VastraaCoupon) {
  const discountLabel = coupon.type === "percent" ? `${coupon.value}% OFF` : `₹${coupon.value} OFF`;
  const discountText = coupon.type === "percent" ? `${coupon.value}% discount` : `₹${coupon.value} discount`;

  // Offer pill badge on top of navy stub
  let offerBadge = (coupon.offerType || "").trim();
  if (!offerBadge) {
    const codeUpper = coupon.code.toUpperCase();
    if (codeUpper.includes("FESTIVE")) {
      offerBadge = "FESTIVE OFFER";
    } else if (codeUpper.includes("FIRST") || codeUpper.includes("WELCOME")) {
      offerBadge = "WELCOME OFFER";
    } else if (codeUpper.includes("SPECIAL")) {
      offerBadge = "SPECIAL OFFER";
    } else if (codeUpper.includes("SAREE")) {
      offerBadge = "SAREE SPECIAL";
    } else {
      offerBadge = "FESTIVE OFFER";
    }
  }

  // Derive elegant title and description matching the reference design
  const customOfferText = (coupon.offerDisplayText || "").trim();
  const rawDesc = (coupon.description || "").trim();
  let title = "";
  let subtitle = "";

  if (customOfferText) {
    // Admin configured promotional offer text takes priority as the primary heading!
    title = customOfferText;
    subtitle = rawDesc && rawDesc !== customOfferText
      ? rawDesc
      : `Use this exclusive coupon and enjoy ${discountText} on all sarees.`;
  } else if (rawDesc.includes("\n")) {
    const parts = rawDesc.split("\n").map((p) => p.trim()).filter(Boolean);
    title = parts[0];
    subtitle = parts.slice(1).join(" ");
  } else if (rawDesc.toLowerCase().startsWith("get ") || rawDesc.toLowerCase().startsWith("enjoy ")) {
    title = rawDesc;
    subtitle = `Use this exclusive coupon and enjoy ${discountText} on all sarees.`;
  } else if (rawDesc.length > 35) {
    title = `Get ${discountLabel} on Your Purchase`;
    subtitle = rawDesc;
  } else if (rawDesc.length > 0) {
    const codeUpper = coupon.code.toUpperCase();
    const descLower = rawDesc.toLowerCase();

    if (codeUpper.includes("FIRST") || descLower.includes("first")) {
      title = `Get ${discountLabel} on Your First Purchase`;
      subtitle = `Use this exclusive coupon and enjoy ${discountText} on all sarees.`;
    } else if (codeUpper.includes("SAREE") || descLower.includes("saree") || descLower.includes("designer")) {
      title = `Enjoy ${discountLabel} on Designer Sarees`;
      subtitle = `Grab the best collection of designer sarees with ${discountText}.`;
    } else {
      const capDesc = rawDesc.charAt(0).toUpperCase() + rawDesc.slice(1);
      title = `Get ${discountLabel} — ${capDesc}`;
      subtitle = `Use this exclusive coupon and enjoy ${discountText} on all sarees.`;
    }
  } else {
    title = `Get ${discountLabel} on Your Purchase`;
    subtitle = `Use this exclusive coupon and enjoy ${discountText} on all sarees.`;
  }

  return {
    discountLabel,
    discountText,
    offerBadge,
    title,
    subtitle,
    offerDisplayText: customOfferText || null,
    tagline: coupon.tagline || "SAVE MORE, WEAR MORE",
  };
}

/**
 * Default VASTRAA Coupon Card Component
 * Strictly matching the reference image layout:
 * - Left ticket stub: Deep navy blue (#0B2044) with ornamental bracket cutout,
 *   champagne gold pill badge, white monospace coupon code, gold lotus ornament, and tagline.
 * - Right section: Elegant serif title, slate subtitle, minimal copy button,
 *   subtle divider line, and aligned footer with expiry and remaining uses + slate lotus motif.
 */
export function VastraaCouponCard({
  coupon,
  cartSubtotal,
  delay = 0,
  onApply,
  isApplied = false,
  isExpired: forceExpired = false,
  isUsed = false,
  orderId,
  redeemedAt,
  className = "",
  compact = false,
}: VastraaCouponCardProps) {
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const expiryInfo = getExpiryInfo(coupon.expiresAt);
  const usageInfo = getUsageInfo(coupon.maxUses, coupon.usedCount);
  const display = formatCouponDisplay(coupon);

  const effectiveExpired = forceExpired || expiryInfo.isExpired;

  const mov = Math.max(0, Number(coupon.minimumOrderValue || 0));
  const hasSubtotal = typeof cartSubtotal === "number" && !isNaN(cartSubtotal);
  const isMovMet = !hasSubtotal || mov === 0 || cartSubtotal >= mov;
  const shortfall = hasSubtotal && mov > 0 && cartSubtotal < mov ? mov - cartSubtotal : 0;

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      if (copied) return;

      try {
        if (navigator?.clipboard?.writeText) {
          await navigator.clipboard.writeText(coupon.code);
        } else {
          const textArea = document.createElement("textarea");
          textArea.value = coupon.code;
          textArea.style.position = "fixed";
          textArea.style.opacity = "0";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          document.execCommand("copy");
          document.body.removeChild(textArea);
        }

        setCopied(true);
        if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch (err) {
        console.error("Failed to copy coupon code:", err);
      }
    },
    [copied, coupon.code]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay }}
      className={`group relative bg-white rounded-[16px] sm:rounded-[18px] border border-[#E2E8F0] shadow-[0_2px_12px_rgba(11,32,68,0.06)] hover:shadow-[0_6px_20px_rgba(11,32,68,0.1)] transition-all overflow-hidden flex flex-col sm:flex-row items-stretch ${
        effectiveExpired ? "opacity-70 grayscale-[25%]" : ""
      } ${className}`}
    >
      {/* SVG ClipPath Definition for the ticket bracket contour */}
      <svg className="absolute w-0 h-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <defs>
          <clipPath id="vastraa-ticket-cut-path" clipPathUnits="objectBoundingBox">
            <path d="M 0 0 L 0.92 0 C 0.90 0.1, 0.86 0.2, 0.86 0.28 C 0.86 0.38, 0.94 0.45, 1.0 0.5 C 0.94 0.55, 0.86 0.62, 0.86 0.72 C 0.86 0.8, 0.90 0.9, 0.92 1.0 L 0 1.0 Z" />
          </clipPath>
        </defs>
      </svg>

      {/* ─── LEFT: Navy Ticket Stub (#0B2044) ─────────────────────────────────── */}
      <div
        className="relative bg-[#0B2044] text-white shrink-0 flex flex-col justify-between items-center text-center px-4 py-3.5 sm:py-4 w-full sm:w-[240px] md:w-[260px] select-none"
        style={{
          // On sm+ screens, clip with the ornate Indian ticket arch bracket path
          clipPath: "url(#vastraa-ticket-cut-path)",
        }}
      >
        {/* Subtle royal background glow */}
        <div className="absolute inset-0 bg-radial from-[#153466]/40 via-transparent to-transparent pointer-events-none" />

        {/* Top: Champagne Gold Offer Pill */}
        <div className="relative z-10 w-full flex justify-center mb-1.5">
          <span className="inline-flex items-center justify-center px-3 py-0.5 rounded-full bg-[#F5E5C9] text-[#0B2044] text-[10px] sm:text-[11px] font-bold tracking-wider uppercase shadow-2xs">
            {display.offerBadge}
          </span>
        </div>

        {/* Center: Coupon Code (Uppercase Monospace) */}
        <div className="relative z-10 my-1 w-full px-2">
          <div
            className="font-mono font-bold tracking-wider text-white text-sm sm:text-base md:text-[17px] leading-tight break-all select-all"
            title={coupon.code}
          >
            {coupon.code}
          </div>
        </div>

        {/* Bottom Motif & Tagline */}
        <div className="relative z-10 w-full flex flex-col items-center mt-1.5">
          {/* Lotus Ornament in Gold */}
          <LotusOrnament color="#D4AF5A" size={19} className="mb-1" />

          {/* Slogan in Gold */}
          <span className="text-[#D4AF5A] text-[9px] sm:text-[9.5px] font-semibold tracking-[0.24em] uppercase">
            {display.tagline}
          </span>
        </div>
      </div>

      {/* ─── RIGHT: Main Card Details (White Background) ────────────────────────── */}
      <div className="flex-1 bg-white px-5 py-3.5 sm:px-6 sm:py-4 flex flex-col justify-between min-w-0">
        {/* Header: Title, Description & Action */}
        <div>
          <div className="flex items-start justify-between gap-3 sm:gap-4">
            <div className="flex-1 min-w-0 pr-1">
              <h3 className="font-serif font-bold text-base sm:text-[18px] md:text-[19px] text-[#0B2044] leading-snug tracking-tight break-words">
                {display.title}
              </h3>
              <p className="text-xs sm:text-[13.5px] text-[#64748B] mt-1 leading-relaxed break-words">
                {display.subtitle}
              </p>

              {/* Dynamic rule badges: Min Order, Max Cap, First Order, Categories */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {mov > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-50 text-amber-900 border border-amber-200">
                    Min Order: ₹{mov.toLocaleString("en-IN")}
                  </span>
                )}
                {coupon.maxDiscountAmount && coupon.maxDiscountAmount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-900 border border-blue-200">
                    Max Cap: ₹{coupon.maxDiscountAmount.toLocaleString("en-IN")}
                  </span>
                )}
                {coupon.firstOrderOnly && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold bg-purple-50 text-purple-900 border border-purple-200">
                    1st Order Only
                  </span>
                )}
                {coupon.eligibleCategories && coupon.eligibleCategories.length > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-100 text-slate-700">
                    {coupon.eligibleCategories.join(", ")}
                  </span>
                )}
              </div>

              {/* Unlock shortfall notice when cart subtotal is below minimum requirement */}
              {shortfall > 0 && !effectiveExpired && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200">
                  <span>Add ₹{shortfall.toLocaleString("en-IN")} more to unlock this coupon</span>
                </div>
              )}
            </div>

            {/* Action: Copy Button or Applied/Apply */}
            <div className="shrink-0 flex items-center gap-2">
              {onApply && !isApplied && !effectiveExpired && (
                isMovMet ? (
                  <button
                    type="button"
                    onClick={() => onApply(coupon.code)}
                    className="px-3.5 py-1.5 rounded-lg bg-[#0B2044] hover:bg-[#133060] active:scale-95 text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
                  >
                    Apply
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled
                    title={`Requires min cart subtotal of ₹${mov.toLocaleString("en-IN")}`}
                    className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-400 text-xs font-semibold cursor-not-allowed border border-gray-200"
                  >
                    Min ₹{mov.toLocaleString("en-IN")}
                  </button>
                )
              )}

              {isApplied && (
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold flex items-center gap-1">
                  <Check size={13} /> Applied
                </span>
              )}

              <button
                type="button"
                onClick={handleCopy}
                disabled={copied}
                className="flex items-center gap-1.5 px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-[#EEF2F6] hover:bg-[#E2E8F0] active:scale-95 text-[#0B2044] text-xs sm:text-[13px] font-semibold transition-all cursor-pointer shadow-2xs select-none"
                title="Copy coupon code"
                aria-label={`Copy coupon code ${coupon.code}`}
              >
                {copied ? (
                  <>
                    <Check size={14} className="text-emerald-600" />
                    <span className="text-emerald-600 font-bold">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-[#0B2044]" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Subtle Horizontal Divider */}
        <div className="border-t border-[#EDF1F7] my-3" />

        {/* Footer: Expiry, Usage Remaining, and Ornamental Lotus */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          {/* Left Footer: Clock + Expiry | Tag + Usage */}
          <div className="flex items-center flex-wrap gap-2 text-[#64748B]">
            {/* Expiry with small Clock */}
            <div className="flex items-center gap-1.5">
              <Clock size={14} className={expiryInfo.isUrgent ? "text-[#FF3B45]" : "text-[#0B2044]"} />
              <span
                className={
                  expiryInfo.isUrgent
                    ? "text-[#FF3B45] font-semibold"
                    : "text-[#64748B]"
                }
              >
                {effectiveExpired ? "Expired" : expiryInfo.text}
              </span>
            </div>

            {/* Vertical Separator */}
            <span className="text-[#CBD5E1]" aria-hidden="true">|</span>

            {/* Usage Remaining with small Tag */}
            <div className="flex items-center gap-1.5">
              <Tag size={14} className="text-[#64748B]" />
              <span>{usageInfo.text}</span>
            </div>

            {/* If used coupon with order reference */}
            {isUsed && orderId && (
              <>
                <span className="text-[#CBD5E1]" aria-hidden="true">|</span>
                <span className="text-emerald-600 font-medium">
                  Redeemed on {orderId}
                </span>
              </>
            )}
          </div>

          {/* Right Footer: Decorative Lotus Ornament in Muted Slate */}
          <div className="hidden sm:flex items-center">
            <LotusOrnament color="#A0AEC0" size={18} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default VastraaCouponCard;
