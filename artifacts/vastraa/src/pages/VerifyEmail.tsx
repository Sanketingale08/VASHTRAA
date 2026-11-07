import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ArrowRight,
  RefreshCw,
  Mail,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import { apiFetch } from "@/lib/api";

type VerificationStatus = "loading" | "success" | "expired" | "invalid" | "already_verified";

export default function VerifyEmailPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [, setLocation] = useLocation();

  const searchParams = new URLSearchParams(window.location.search);
  const token = searchParams.get("token") || "";
  const initialStatusParam = searchParams.get("status");
  const emailParam = searchParams.get("email") || "";

  const [status, setStatus] = useState<VerificationStatus>(() => {
    if (initialStatusParam === "success") return "success";
    if (initialStatusParam === "expired") return "expired";
    if (initialStatusParam === "invalid") return "invalid";
    if (initialStatusParam === "already_verified") return "already_verified";
    return token ? "loading" : "invalid";
  });

  const [message, setMessage] = useState<string>("");
  const [redirectCountdown, setRedirectCountdown] = useState(5);

  // Resend state for failed/expired cases
  const [resendEmail, setResendEmail] = useState(emailParam);
  const [isResending, setIsResending] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Auto-verify token on mount if provided and in loading state
  useEffect(() => {
    if (!token || status !== "loading") return;

    let isMounted = true;

    async function verify() {
      try {
        const res = await apiFetch(`/api/auth/verify-email?token=${encodeURIComponent(token)}`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
        });
        const data = await res.json().catch(() => ({}));

        if (!isMounted) return;

        if (res.ok && data.success) {
          if (data.code === "ALREADY_VERIFIED") {
            setStatus("already_verified");
            setMessage(data.message || "Your email address is already verified.");
          } else {
            setStatus("success");
            setMessage(data.message || "Email verified successfully!");
          }
        } else {
          if (data.code === "TOKEN_EXPIRED") {
            setStatus("expired");
            setMessage(data.error || "This verification link has expired. Verification links are valid for 15 minutes.");
            if (data.email) setResendEmail(data.email);
          } else {
            setStatus("invalid");
            setMessage(data.error || "This verification link is invalid or has already been used.");
          }
        }
      } catch {
        if (!isMounted) return;
        setStatus("invalid");
        setMessage("Unable to complete verification. Please check your internet connection and try again.");
      }
    }

    verify();

    return () => {
      isMounted = false;
    };
  }, [token, status]);

  // Redirect countdown on successful verification
  useEffect(() => {
    if (status !== "success" && status !== "already_verified") return;

    const timer = setInterval(() => {
      setRedirectCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setLocation("/sign-in?verified=true");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, setLocation]);

  // Resend cooldown timer
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => {
      setResendCooldown((c) => (c > 0 ? c - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const handleResend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail.trim() || isResending || resendCooldown > 0) return;

    setIsResending(true);
    setResendStatus(null);
    setResendError(null);

    try {
      const res = await apiFetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resendEmail.trim() }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        setResendStatus(
          data.message || "If your account requires verification, a verification email has been sent."
        );
        setResendCooldown(60);
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

          {/* 1. LOADING STATE */}
          {status === "loading" && (
            <div className="py-6 animate-fadeIn">
              <div className="mx-auto w-16 h-16 rounded-full bg-[#0A1F44]/5 flex items-center justify-center mb-6">
                <Loader2 className="w-8 h-8 text-[#0A1F44] animate-spin" />
              </div>
              <h1 className="font-serif text-2xl font-bold text-[#0A1F44] mb-2">
                Verifying Your Email
              </h1>
              <p className="text-xs md:text-sm text-gray-500">
                Please wait while we confirm your verification link...
              </p>
            </div>
          )}

          {/* 2. SUCCESS STATE */}
          {(status === "success" || status === "already_verified") && (
            <div className="animate-fadeIn">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-500/20 flex items-center justify-center mb-6 shadow-sm">
                <ShieldCheck className="w-8 h-8 text-emerald-600" />
              </div>
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44] mb-3">
                {status === "already_verified" ? "Already Verified" : "Email Verified!"}
              </h1>
              <p className="text-xs md:text-sm text-gray-600 mb-6 leading-relaxed">
                {status === "already_verified"
                  ? "Your VASTRAA account is already verified. You can log in to start exploring handcrafted sarees."
                  : "Thank you for verifying your email address. Your VASTRAA account is now active and ready to use."}
              </p>

              <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3.5 mb-6 text-xs text-emerald-900 font-medium">
                Redirecting to login in <span className="font-bold text-emerald-700">{redirectCountdown}</span> seconds...
              </div>

              <Link
                href="/sign-in?verified=true"
                className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                Proceed to Sign In <ArrowRight size={16} />
              </Link>
            </div>
          )}

          {/* 3. EXPIRED OR INVALID STATE */}
          {(status === "expired" || status === "invalid") && (
            <div className="animate-fadeIn">
              <div className="mx-auto w-16 h-16 rounded-full bg-amber-50 border-2 border-amber-500/20 flex items-center justify-center mb-6 shadow-sm">
                <AlertTriangle className="w-8 h-8 text-amber-600" />
              </div>
              <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44] mb-3">
                {status === "expired" ? "Link Expired" : "Invalid Link"}
              </h1>
              <p className="text-xs md:text-sm text-gray-600 mb-6 leading-relaxed">
                {status === "expired"
                  ? "This verification link has expired. For your account security, verification links are valid for 15 minutes only."
                  : message || "This email verification link is invalid, expired, or has already been used."}
              </p>

              {/* Resend Status / Error Messages */}
              {resendStatus && (
                <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 text-left">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resendStatus}</span>
                </div>
              )}

              {resendError && (
                <div className="mb-4 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2 text-left">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                  <span>{resendError}</span>
                </div>
              )}

              {/* Resend Form */}
              <form onSubmit={handleResend} className="space-y-4 mb-6 text-left" noValidate>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                    Request a New Verification Link
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="email"
                      value={resendEmail}
                      onChange={(e) => setResendEmail(e.target.value)}
                      placeholder="Enter your registered email"
                      className="w-full pl-10 pr-4 py-3 text-xs md:text-sm bg-[#F4F5F7] border border-[#C7CCD1]/60 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                      disabled={isResending}
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isResending || resendCooldown > 0}
                  className="w-full py-3 px-4 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isResending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      Sending...
                    </>
                  ) : resendCooldown > 0 ? (
                    `Resend in ${resendCooldown}s`
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      Resend Verification Email
                    </>
                  )}
                </button>
              </form>

              <div className="border-t border-[#E5E8EC] pt-4">
                <Link
                  href="/sign-in"
                  className="text-xs font-bold text-[#0A1F44] hover:underline uppercase tracking-wider inline-flex items-center gap-1.5"
                >
                  Back to Sign In <ArrowRight size={13} />
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
