import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { Eye, EyeOff, Lock, Mail, User, ArrowRight, AlertCircle, Loader2, CheckCircle2, RefreshCw } from "lucide-react";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { GoogleOtpModal } from "@/components/GoogleOtpModal";
import { apiFetch } from "@/lib/api";

export default function SignUpPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [, setLocation] = useLocation();
  const { signUp, user } = useAuth();

  const [step, setStep] = useState<"form" | "pending">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resend state for pending verification
  const [resendLoading, setResendLoading] = useState(false);
  const [resendStatus, setResendStatus] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);

  const searchParams = new URLSearchParams(window.location.search);
  const redirectTarget = searchParams.get("redirect") || searchParams.get("from") || "/account/overview";

  // Google OTP Modal State
  const [otpModalState, setOtpModalState] = useState<{
    isOpen: boolean;
    challengeId: string;
    email: string;
    targetRole: "customer" | "seller";
  }>({
    isOpen: false,
    challengeId: "",
    email: "",
    targetRole: "customer",
  });

  useEffect(() => {
    // If already signed in, redirect to target
    if (user) {
      setLocation(redirectTarget);
    }
  }, [user, redirectTarget, setLocation]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  useEffect(() => {
    // Check if returning from redirect with OTP challenge
    const saved = sessionStorage.getItem("td_google_challenge");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        sessionStorage.removeItem("td_google_challenge");
        if (parsed.challengeId && parsed.email) {
          setOtpModalState({
            isOpen: true,
            challengeId: parsed.challengeId,
            email: parsed.email,
            targetRole: parsed.targetRole || "customer",
          });
        }
      } catch { /* ignore */ }
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Validation 1: Required fields
    if (!name.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    // Validation 2: Email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isEmail = emailRegex.test(email.trim());
    const isUserId = email.trim().length >= 3 && !/\s/.test(email.trim());
    if (!isEmail && !isUserId) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    // Validation 3: Password length
    if (!password) {
      setErrorMessage("Please enter a password.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    // Validation 4: Confirm Password
    if (!confirmPassword) {
      setErrorMessage("Please confirm your password.");
      return;
    }

    // Validation 5: Password match
    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setIsLoading(true);

    try {
      const result = await signUp(name.trim(), email.trim(), password, confirmPassword);

      if (result.success) {
        if (result.requiresVerification || !result.user) {
          setSuccessMessage(
            result.message ||
            "Your account has been created successfully. Please check your email and verify your account before logging in."
          );
          setStep("pending");
          setCountdown(60);
        } else {
          // If already verified
          setLocation(redirectTarget);
        }
      } else {
        setErrorMessage(result.error || "Unable to create account. Please try again.");
      }
    } catch {
      setErrorMessage("Unable to connect to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (!email.trim() || resendLoading || countdown > 0) return;

    setResendLoading(true);
    setResendStatus(null);
    setErrorMessage(null);

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
        setErrorMessage(data.error || "Unable to resend verification email. Please try again.");
      }
    } catch {
      setErrorMessage("Unable to connect to server. Please try again.");
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[#F4F5F7] px-4 py-12 md:py-16">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 md:p-10 shadow-xl border border-[#C7CCD1]/40">
          {/* Header & Branding */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block mb-3">
              <img
                src={`${basePath}/logo.svg`}
                alt="VASTRAA"
                className="h-12 w-auto mx-auto object-contain"
              />
            </Link>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">
              {step === "pending" ? "Check Your Email" : "Create Account"}
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              {step === "pending"
                ? "Verify your account to start shopping authentic handloom sarees"
                : "Join VASTRAA to save wishlists & track orders"}
            </p>
          </div>

          {/* STEP 1: VERIFY EMAIL PENDING CARD */}
          {step === "pending" ? (
            <div className="text-center animate-fadeIn">
              <div className="mx-auto w-16 h-16 rounded-full bg-[#0A1F44]/5 flex items-center justify-center mb-6 border border-[#C5A265]/30 shadow-inner">
                <Mail className="w-8 h-8 text-[#0A1F44]" />
              </div>

              {/* Exact Prompt Required Registration Success Message */}
              <div className="bg-[#F8FAFC] border border-[#C7CCD1]/60 rounded-xl p-4 mb-6 text-left">
                <p className="text-xs md:text-sm text-[#0A1F44] font-medium leading-relaxed">
                  {successMessage || "Your account has been created successfully. Please check your email and verify your account before logging in."}
                </p>
                {email && (
                  <p className="mt-2 text-xs font-semibold text-[#0A1F44] bg-white px-3 py-1.5 rounded-lg border border-[#C7CCD1]/50 inline-block">
                    {email}
                  </p>
                )}
              </div>

              {/* 15-Minute Expiry Notice */}
              <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-3 mb-6 text-xs text-amber-900 flex items-center justify-center gap-2">
                <span className="font-semibold">Note:</span> This verification link will expire in 15 minutes.
              </div>

              {/* Resend Status Notification */}
              {resendStatus && (
                <div className="mb-6 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 text-left">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{resendStatus}</span>
                </div>
              )}

              {/* Error Alert Box */}
              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs md:text-sm text-left">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{errorMessage}</p>
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resendLoading || countdown > 0}
                  className="w-full py-3 px-4 bg-[#F4F5F7] hover:bg-[#E5E8EC] text-[#0A1F44] text-xs font-bold uppercase tracking-wider rounded-lg border border-[#C7CCD1]/60 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {resendLoading ? (
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

              <p className="mt-8 text-xs text-gray-400">
                Didn't receive the email? Check your spam folder or contact support at{" "}
                <a href="mailto:support@vastraasaree.com" className="text-[#0A1F44] underline font-medium">
                  support@vastraasaree.com
                </a>
              </p>
            </div>
          ) : (
            /* STEP 2: REGISTRATION FORM */
            <>
              {/* Error Alert Box */}
              {errorMessage && (
                <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs md:text-sm animate-fadeIn">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="font-medium leading-relaxed">{errorMessage}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                {/* Full Name */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1.5">
                    Full Name
                  </label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Enter your full name"
                      className="w-full pl-10 pr-4 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Enter your email address"
                      className="w-full pl-10 pr-4 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full pl-10 pr-10 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                      disabled={isLoading}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44] transition-colors cursor-pointer"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter your password"
                      className="w-full pl-10 pr-4 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                      disabled={isLoading}
                      required
                    />
                  </div>
                </div>

                {/* Submit Button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Creating Account...
                      </>
                    ) : (
                      <>
                        Create Account <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </form>

              {/* OR Divider */}
              <div className="relative my-6 text-center">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-[#C7CCD1]/60" />
                </div>
                <div className="relative inline-block bg-white px-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                  OR
                </div>
              </div>

              {/* Continue with Google Button */}
              <GoogleAuthButton
                targetRole="customer"
                mode="login"
                onSuccess={async (data) => {
                  localStorage.setItem("vastraa_auth_token", data.token);
                  setLocation(redirectTarget);
                }}
                onSuccessChallenge={(data) => {
                  setOtpModalState({
                    isOpen: true,
                    challengeId: data.challengeId,
                    email: data.email,
                    targetRole: data.targetRole,
                  });
                }}
                onError={(err) => setErrorMessage(err)}
              />

              {/* Footer Link to Sign In */}
              <div className="mt-8 pt-6 border-t border-[#E5E8EC] text-center">
                <p className="text-xs md:text-sm text-gray-600">
                  Already have an account?{" "}
                  <Link
                    href={redirectTarget !== "/account/overview" ? `/sign-in?redirect=${encodeURIComponent(redirectTarget)}` : "/sign-in"}
                    className="font-bold text-[#0A1F44] hover:underline uppercase tracking-wider"
                  >
                    Sign In
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Google OTP Verification Modal */}
      <GoogleOtpModal
        isOpen={otpModalState.isOpen}
        challengeId={otpModalState.challengeId}
        email={otpModalState.email}
        targetRole={otpModalState.targetRole}
        onClose={() => setOtpModalState((prev) => ({ ...prev, isOpen: false }))}
        onVerified={async (data) => {
          setOtpModalState((prev) => ({ ...prev, isOpen: false }));
          setLocation(data.redirectUrl || redirectTarget);
        }}
      />
    </Layout>
  );
}
