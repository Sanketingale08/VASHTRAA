import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Mail, ArrowRight, Loader2, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";
import { apiFetch } from "@/lib/api";

export default function VerifyEmailPendingPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const searchParams = new URLSearchParams(window.location.search);
  const initialEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState(initialEmail);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleResend = async () => {
    if (!email.trim() || isResending || countdown > 0) return;

    setIsResending(true);
    setResendStatus(null);
    setResendError(null);

    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setResendStatus(
          data.message || "If your account requires verification, a verification email has been sent."
        );
        setCountdown(60);
      } else {
        setResendError(data.error || "Unable to resend verification email. Please try again.");
      }
    } catch {
      setResendError("Unable to connect to server. Please try again.");
    } finally {
      setIsResending(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[#F4F5F7] px-4 py-12 md:py-16">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 md:p-10 shadow-xl border border-[#C7CCD1]/40 text-center">
          {/* VASTRAA Branding */}
          <Link href="/" className="inline-block mb-4">
            <img
              src={`${basePath}/logo.svg`}
              alt="VASTRAA"
              className="h-12 w-auto mx-auto object-contain"
            />
          </Link>

          {/* Animated Mail Icon */}
          <div className="mx-auto w-16 h-16 rounded-full bg-[#0A1F44]/5 flex items-center justify-center mb-6 border border-[#C5A265]/30 shadow-inner">
            <Mail className="w-8 h-8 text-[#0A1F44]" />
          </div>

          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44] mb-3">
            Verify Your Email
          </h1>

          {/* Prompt Required Text */}
          <div className="bg-[#F8FAFC] border border-[#C7CCD1]/60 rounded-xl p-4 mb-6 text-left">
            <p className="text-xs md:text-sm text-[#0A1F44] font-medium leading-relaxed">
              Your account has been created successfully. Please check your email and verify your account before logging in.
            </p>
            {email && (
              <p className="mt-2 text-xs font-semibold text-[#0A1F44] bg-white px-3 py-1.5 rounded-lg border border-[#C7CCD1]/50 inline-block">
                {email}
              </p>
            )}
          </div>

          {/* Expiration Notice */}
          <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3 mb-6 text-xs text-amber-900 flex items-center justify-center gap-2">
            <span className="font-semibold">Note:</span> This verification link will expire in 15 minutes.
          </div>

          {/* Resend Status Message */}
          {resendStatus && (
            <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 text-left">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{resendStatus}</span>
            </div>
          )}

          {/* Resend Error Message */}
          {resendError && (
            <div className="mb-6 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2 text-left">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{resendError}</span>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || countdown > 0}
              className="w-full py-3 px-4 bg-[#F4F5F7] hover:bg-[#E5E8EC] text-[#0A1F44] text-xs font-bold uppercase tracking-wider rounded-lg border border-[#C7CCD1]/60 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
            >
              {isResending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-[#0A1F44]" />
                  Sending email...
                </>
              ) : countdown > 0 ? (
                `Resend in ${countdown}s`
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Resend Verification Email
                </>
              )}
            </button>

            <Link
              href="/sign-in"
              className="w-full py-3 px-4 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              Go to Sign In <ArrowRight size={14} />
            </Link>
          </div>

          {/* Footer Assistance */}
          <p className="mt-8 text-xs text-gray-400">
            Didn't receive the email? Check your spam or promotions folder, or contact support at{" "}
            <a href="mailto:support@vastraasaree.com" className="text-[#0A1F44] underline font-medium">
              support@vastraasaree.com
            </a>
          </p>
        </div>
      </div>
    </Layout>
  );
}
