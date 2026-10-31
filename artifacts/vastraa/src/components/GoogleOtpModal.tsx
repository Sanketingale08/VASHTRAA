import React, { useState, useEffect, useRef } from "react";
import { X, ShieldCheck, RefreshCw, AlertCircle, Loader2, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLocation } from "wouter";
import { apiFetch } from "@/lib/api";

interface GoogleOtpModalProps {
  isOpen: boolean;
  challengeId: string;
  email: string;
  devCode?: string;
  targetRole: "customer" | "seller";
  onClose: () => void;
  onVerified?: (data: { token: string; user: any; redirectUrl: string }) => void;
}

export function GoogleOtpModal({
  isOpen,
  challengeId,
  email,
  devCode,
  targetRole,
  onClose,
  onVerified,
}: GoogleOtpModalProps) {
  const [, setLocation] = useLocation();
  const { refreshUser } = useAuth();

  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [activeDevCode, setActiveDevCode] = useState<string | undefined>(devCode);

  // 60-second resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(60);
  const [isResending, setIsResending] = useState(false);

  // 10-minute expiry timer countdown (600s)
  const [expiryTimeLeft, setExpiryTimeLeft] = useState(600);

  const inputRef = useRef<HTMLInputElement>(null);

  // Update activeDevCode when prop changes
  useEffect(() => {
    setActiveDevCode(devCode);
  }, [devCode]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setOtp("");
      setErrorMessage(null);
      setSuccessMessage(null);
      setResendCooldown(60);
      setExpiryTimeLeft(600);
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  // Resend cooldown timer
  useEffect(() => {
    if (!isOpen || resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, resendCooldown]);

  // Expiry countdown timer
  useEffect(() => {
    if (!isOpen || expiryTimeLeft <= 0) return;
    const interval = setInterval(() => {
      setExpiryTimeLeft((prev) => {
        if (prev <= 1) {
          setErrorMessage("OTP has expired. Please click 'Resend OTP' to receive a new code.");
        }
        return Math.max(0, prev - 1);
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, expiryTimeLeft]);

  if (!isOpen) return null;

  const handleOtpChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, "").slice(0, 6);
    setOtp(val);
    if (errorMessage) setErrorMessage(null);
  };

  const handleVerify = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    if (otp.length < 6) {
      setErrorMessage("Please enter the complete 6-digit OTP code.");
      return;
    }

    if (expiryTimeLeft <= 0) {
      setErrorMessage("OTP has expired. Please request a new code.");
      return;
    }

    setIsVerifying(true);
    setErrorMessage(null);

    try {
      const res = await apiFetch("/api/auth/google/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId,
          otp: otp.trim(),
          targetRole,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Invalid OTP code. Please try again.");
        setIsVerifying(false);
        return;
      }

      // Successful OTP Verification!
      // Store session token in localStorage for User auth context
      localStorage.setItem("vastraa_auth_token", data.token);

      if (data.user?.role === "seller") {
        localStorage.setItem("vastraa_seller_authenticated", "true");
        localStorage.setItem("vastraa_seller_email", data.user.email);
      } else {
        localStorage.removeItem("vastraa_seller_authenticated");
        localStorage.removeItem("vastraa_seller_email");
      }

      await refreshUser();

      if (onVerified) {
        onVerified(data);
      } else {
        onClose();
        setLocation(
          data.redirectUrl ||
            (data.user?.role === "seller" ? "/seller/dashboard" : "/account/overview")
        );
      }
    } catch {
      setErrorMessage("Network error verifying OTP. Please check your connection.");
      setIsVerifying(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || isResending) return;

    setIsResending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch("/api/auth/google/resend-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeId }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMessage(data.error || "Failed to resend OTP.");
      } else {
        setResendCooldown(60);
        setExpiryTimeLeft(600);
        setOtp("");
        if (data.devCode) setActiveDevCode(data.devCode);
        setSuccessMessage(data.message || `A new OTP was sent to ${email}`);
      }
    } catch {
      setErrorMessage("Failed to resend OTP. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pt-safe pb-safe bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md max-h-[92vh] max-h-screen-dynamic overflow-y-auto scroll-touch bg-white rounded-2xl shadow-2xl border border-[#C7CCD1] p-6 sm:p-8 animate-scaleUp">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isVerifying}
          className="absolute right-4 top-4 text-gray-400 hover:text-[#0A1F44] transition-colors p-1 rounded-lg hover:bg-gray-100 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Close modal"
        >
          <X size={20} />
        </button>

        {/* Header Icon & Title */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-full bg-[#0A1F44]/10 text-[#0A1F44] mx-auto flex items-center justify-center mb-3">
            <ShieldCheck size={28} />
          </div>
          <h2 className="font-serif text-2xl font-bold text-[#0A1F44]">
            Verify Email OTP
          </h2>
          <p className="text-xs sm:text-sm text-gray-600 mt-1">
            We sent a 6-digit code to your verified Google email:
          </p>
          <p className="font-mono text-xs font-bold text-[#0A1F44] mt-0.5 break-all">
            {email}
          </p>
        </div>

        {/* Sandbox / Fallback Dev Code Banner */}
        {activeDevCode && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} className="text-amber-600 shrink-0" />
              <span>
                Verification Code: <span className="font-mono text-sm font-bold text-[#0A1F44]">{activeDevCode}</span>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOtp(activeDevCode)}
              className="px-2.5 py-1 bg-[#0A1F44] text-white text-[11px] font-bold rounded-lg hover:bg-[#2C3E6B] transition-colors cursor-pointer shrink-0"
            >
              Auto-fill
            </button>
          </div>
        )}

        {/* Notification Banners */}
        {errorMessage && (
          <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-start gap-2.5 text-xs text-red-700">
            <AlertCircle size={16} className="shrink-0 text-red-600 mt-0.5" />
            <span className="font-semibold leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {successMessage && !errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-green-50 border border-green-200 text-xs text-green-800 text-center font-medium">
            {successMessage}
          </div>
        )}

        {/* OTP Input Form */}
        <form onSubmit={handleVerify} className="space-y-5">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] text-center mb-2">
              Enter 6-Digit OTP Code
            </label>
            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={handleOtpChange}
              placeholder="• • • • • •"
              className="w-full text-center text-2xl sm:text-3xl font-mono tracking-[0.4em] sm:tracking-[0.5em] py-3 px-4 rounded-xl border border-[#C7CCD1] bg-[#F4F5F7] text-[#0A1F44] outline-none focus:border-[#0A1F44] focus:bg-white transition-all shadow-inner"
              disabled={isVerifying}
              autoComplete="one-time-code"
            />
          </div>

          {/* Timer Info */}
          <div className="flex items-center justify-between text-xs text-gray-500 font-medium px-1">
            <span>Code expires in:</span>
            <span className={`font-mono font-bold ${expiryTimeLeft < 60 ? "text-red-600" : "text-[#0A1F44]"}`}>
              {formatTime(expiryTimeLeft)}
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isVerifying || otp.length < 6 || expiryTimeLeft <= 0}
            className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs sm:text-sm font-bold uppercase tracking-widest rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isVerifying ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Verifying OTP...</span>
              </>
            ) : (
              <>
                <span>Verify OTP & Continue</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Resend OTP Section */}
        <div className="mt-6 pt-4 border-t border-[#E5E8EC] text-center">
          <p className="text-xs text-gray-600 mb-2">Didn&apos;t receive the verification code?</p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendCooldown > 0 || isResending || isVerifying}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A1F44] hover:underline disabled:opacity-50 disabled:no-underline cursor-pointer"
          >
            <RefreshCw size={13} className={isResending ? "animate-spin" : ""} />
            {resendCooldown > 0
              ? `Resend OTP in ${resendCooldown}s`
              : isResending
              ? "Sending OTP..."
              : "Resend OTP"}
          </button>
        </div>
      </div>
    </div>
  );
}
