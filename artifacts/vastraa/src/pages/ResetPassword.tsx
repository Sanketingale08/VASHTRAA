import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Store, ArrowLeft, ShieldCheck, ArrowRight } from "lucide-react";

interface ResetPasswordProps {
  role?: "customer" | "seller";
}

export default function ResetPasswordPage({ role = "customer" }: ResetPasswordProps) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [, setLocation] = useLocation();

  const isSeller = role === "seller";

  // URL token parsing
  const [token, setToken] = useState<string>("");
  const [isVerifyingToken, setIsVerifyingToken] = useState(true);
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // Form field states
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Submission states
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token") || "";

    if (!urlToken.trim()) {
      setIsVerifyingToken(false);
      setIsTokenValid(false);
      setTokenError("Missing password reset token. Please check your link or request a new one.");
      return;
    }

    setToken(urlToken.trim());

    // Verify token with backend
    const verifyToken = async () => {
      try {
        const endpoint = isSeller
          ? `/api/seller/verify-reset-token?token=${encodeURIComponent(urlToken.trim())}`
          : `/api/auth/verify-reset-token?token=${encodeURIComponent(urlToken.trim())}&role=${role}`;

        const res = await fetch(endpoint);
        const data = await res.json();

        if (res.ok && data.valid) {
          setIsTokenValid(true);
        } else {
          setIsTokenValid(false);
          setTokenError(data.error || "This password reset link is invalid, expired, or has already been used.");
        }
      } catch (err) {
        setIsTokenValid(false);
        setTokenError("Unable to verify reset link. Please check your connection and try again.");
      } finally {
        setIsVerifyingToken(false);
      }
    };

    verifyToken();
  }, [role, isSeller]);

  // Client-side validation checks
  const minLengthValid = newPassword.length >= 6;
  const passwordsMatch = newPassword === confirmPassword && confirmPassword.length > 0;
  const isFormValid = newPassword.length >= 6 && passwordsMatch && !isSubmitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!newPassword) {
      setErrorMessage("Please enter a new password.");
      return;
    }

    if (newPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    if (!confirmPassword) {
      setErrorMessage("Please confirm your new password.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage("New Password and Confirm New Password must match.");
      return;
    }

    setIsSubmitting(true);

    try {
      const endpoint = isSeller ? "/api/seller/reset-password" : "/api/auth/reset-password";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          newPassword,
          confirmPassword,
          role,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsSuccess(true);
      } else {
        setErrorMessage(data.error || "Failed to update password. Please try again.");
      }
    } catch (err: any) {
      setErrorMessage("Network error while updating password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const cardContent = (
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
        {isSeller && (
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Store size={14} className="text-[#0A1F44]" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#0A1F44]">
              Seller Portal
            </span>
          </div>
        )}
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">
          Reset Password
        </h1>
        <p className="text-xs md:text-sm text-gray-500 mt-1">
          {isSeller
            ? "Create a new secure password for your seller account."
            : "Create a new secure password for your VASTRAA account."}
        </p>
      </div>

      {/* State 1: Verifying Token Spinner */}
      {isVerifyingToken && (
        <div className="py-12 text-center space-y-4">
          <Loader2 size={36} className="animate-spin text-[#0A1F44] mx-auto" />
          <p className="text-sm font-medium text-[#0A1F44]">
            Verifying reset link security...
          </p>
        </div>
      )}

      {/* State 2: Invalid / Expired Token */}
      {!isVerifyingToken && !isTokenValid && !isSuccess && (
        <div className="space-y-6 text-center animate-fadeIn">
          <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-600 border border-red-200">
            <AlertCircle size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-xl font-bold text-[#0A1F44]">Invalid or Expired Link</h2>
            <p className="text-xs md:text-sm text-red-700 bg-red-50 border border-red-200 p-4 rounded-xl leading-relaxed">
              {tokenError || "This password reset link is invalid, expired, or has already been used."}
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100 space-y-3">
            <Link
              href={isSeller ? "/seller/forgot-password" : "/forgot-password"}
              className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Request New Reset Link <ArrowRight size={16} />
            </Link>

            <Link
              href={isSeller ? "/seller/login" : "/sign-in"}
              className="inline-flex items-center justify-center gap-1.5 text-xs font-bold text-[#0A1F44] hover:underline uppercase tracking-wider mt-2"
            >
              <ArrowLeft size={14} /> Return to Sign In
            </Link>
          </div>
        </div>
      )}

      {/* State 3: Successful Password Reset */}
      {isSuccess && (
        <div className="space-y-6 text-center animate-fadeIn">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 border border-emerald-200">
            <ShieldCheck size={36} />
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-xl font-bold text-[#0A1F44]">Password Reset Successful</h2>
            <p className="text-xs md:text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 p-4 rounded-xl leading-relaxed font-medium">
              Your password has been updated successfully. You can now sign in with your new password.
            </p>
          </div>

          <div className="pt-4 border-t border-gray-100">
            <Link
              href={isSeller ? "/seller/login" : "/sign-in"}
              className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              Sign In With New Password <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      )}

      {/* State 4: Reset Password Form (Valid Token) */}
      {!isVerifyingToken && isTokenValid && !isSuccess && (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs md:text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* New Password Field */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
              New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Enter new password (min. 6 characters)"
                className="w-full pl-10 pr-10 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                aria-label={showNewPassword ? "Hide password" : "Show password"}
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44] transition-colors"
              >
                {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Confirm New Password Field */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
              Confirm New Password <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="Re-enter your new password"
                className="w-full pl-10 pr-10 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                disabled={isSubmitting}
                required
              />
              <button
                type="button"
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44] transition-colors"
              >
                {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Live Validation Rules */}
          <div className="p-3 bg-[#F4F5F7] rounded-xl border border-[#C7CCD1]/40 space-y-1.5 text-xs">
            <div className={`flex items-center gap-2 ${minLengthValid ? "text-emerald-700 font-semibold" : "text-gray-500"}`}>
              <CheckCircle2 size={14} className={minLengthValid ? "text-emerald-600" : "text-gray-300"} />
              At least 6 characters
            </div>
            <div className={`flex items-center gap-2 ${passwordsMatch ? "text-emerald-700 font-semibold" : "text-gray-500"}`}>
              <CheckCircle2 size={14} className={passwordsMatch ? "text-emerald-600" : "text-gray-300"} />
              Passwords match
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={!isFormValid}
            className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Updating Password...
              </>
            ) : (
              <>
                Update Password <ShieldCheck size={16} />
              </>
            )}
          </button>
        </form>
      )}
    </div>
  );

  if (isSeller) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#F4F5F7]">
        {cardContent}
      </div>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[#F4F5F7] px-4 py-12 md:py-16">
        {cardContent}
      </div>
    </Layout>
  );
}
