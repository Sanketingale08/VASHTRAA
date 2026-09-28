import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { Layout } from "@/components/Layout";
import { Eye, EyeOff, Lock, Mail, ArrowRight, AlertCircle, Loader2 } from "lucide-react";
import { GoogleAuthButton } from "@/components/GoogleAuthButton";
import { GoogleOtpModal } from "@/components/GoogleOtpModal";

export default function SignInPage() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [, setLocation] = useLocation();
  const { signIn } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

    if (!email.trim()) {
      setErrorMessage("Please enter your email address.");
      return;
    }

    if (!password) {
      setErrorMessage("Please enter your password.");
      return;
    }

    setIsLoading(true);

    const result = await signIn(email.trim(), password);

    if (result.success) {
      setLocation("/account/overview");
    } else {
      setErrorMessage(result.error || "Invalid email or password.");
      setIsLoading(false);
    }
  };

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[#F4F5F7] px-4 py-12 md:py-16">
        <div className="w-full max-w-md bg-white rounded-2xl p-8 md:p-10 shadow-xl border border-[#C7CCD1]/40">
          {/* Header & Logo Branding */}
          <div className="text-center mb-8">
            <Link href="/" className="inline-block mb-3">
              <img
                src={`${basePath}/logo.svg`}
                alt="VASTRAA"
                className="h-12 w-auto mx-auto object-contain"
              />
            </Link>
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">
              Welcome Back
            </h1>
            <p className="text-xs md:text-sm text-gray-500 mt-1">
              Sign in to access your VASTRAA account & wishlist
            </p>
          </div>

          {/* Error Alert Box */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs md:text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {/* Sign In Form */}
          <form onSubmit={handleSubmit} className="space-y-5" noValidate>
            {/* Email / User ID Field */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
                Email Address / User ID
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email or User ID"
                  className="w-full pl-10 pr-4 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                  disabled={isLoading}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[#0A1F44] hover:underline transition-colors"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-10 pr-10 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                  disabled={isLoading}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-[#0A1F44] transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  Sign In <ArrowRight size={16} />
                </>
              )}
            </button>
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

          {/* Footer Link to Sign Up */}
          <div className="mt-8 pt-6 border-t border-[#E5E8EC] text-center">
            <p className="text-xs md:text-sm text-gray-600">
              Don&apos;t have an account?{" "}
              <Link
                href="/sign-up"
                className="font-bold text-[#0A1F44] hover:underline uppercase tracking-wider"
              >
                Sign Up
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Google OTP Verification Modal */}
      <GoogleOtpModal
        isOpen={otpModalState.isOpen}
        challengeId={otpModalState.challengeId}
        email={otpModalState.email}
        targetRole={otpModalState.targetRole}
        onClose={() => setOtpModalState((prev) => ({ ...prev, isOpen: false }))}
        onVerified={(data) => {
          setOtpModalState((prev) => ({ ...prev, isOpen: false }));
          setLocation(data.redirectUrl || "/account/overview");
        }}
      />
    </Layout>
  );
}
