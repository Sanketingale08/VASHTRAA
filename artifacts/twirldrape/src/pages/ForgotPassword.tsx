import React, { useState } from "react";
import { Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { Mail, ArrowRight, AlertCircle, CheckCircle2, Loader2, Store, ArrowLeft } from "lucide-react";

interface ForgotPasswordProps {
  role?: "customer" | "seller";
}

export default function ForgotPasswordPage({ role = "customer" }: ForgotPasswordProps) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const [, setLocation] = useLocation();

  const isSeller = role === "seller";
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [debugUrl, setDebugUrl] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!email.trim()) {
      setErrorMessage(isSeller ? "Please enter your registered seller email address." : "Please enter your registered email address.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setErrorMessage("Please enter a valid email address.");
      return;
    }

    setIsLoading(true);

    try {
      const endpoint = isSeller ? "/api/seller/forgot-password" : "/api/auth/forgot-password";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsSubmitted(true);
        setSuccessMessage(data.message || "If an account with that email address exists, a password reset link has been sent to your email.");
        if (data.debugResetUrl) {
          setDebugUrl(data.debugResetUrl);
        }
      } else {
        setErrorMessage(data.error || "Unable to send password reset email. Please try again later.");
      }
    } catch (err: any) {
      setErrorMessage("Network error while connecting to server. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const content = (
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
        {isSeller && (
          <div className="flex items-center justify-center gap-1.5 mb-2">
            <Store size={14} className="text-[#0A1F44]" />
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#0A1F44]">
              Seller Portal
            </span>
          </div>
        )}
        <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">
          {isSeller ? "Seller Forgot Password" : "Forgot Password?"}
        </h1>
        <p className="text-xs md:text-sm text-gray-500 mt-1">
          {isSeller
            ? "Enter the registered email address for your seller account to receive a password reset link."
            : "Enter the registered email address associated with your account to receive a password reset link."}
        </p>
      </div>

      {isSubmitted ? (
        <div className="space-y-6 text-center animate-fadeIn">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 border border-emerald-200">
            <CheckCircle2 size={32} />
          </div>

          <div className="space-y-2">
            <h2 className="font-serif text-xl font-bold text-[#0A1F44]">Reset Link Sent</h2>
            <p className="text-xs md:text-sm text-gray-600 leading-relaxed">
              {successMessage}
            </p>
          </div>

          {/* Direct / Sandbox Reset Link Helper */}
          {debugUrl && (
            <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl text-left text-xs text-amber-900 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-950 text-sm">Direct Reset Link:</span>
                <span className="px-2 py-0.5 bg-amber-200/60 text-amber-900 font-semibold rounded text-[10px]">
                  Sandbox Mode / Direct Link
                </span>
              </div>
              <p className="text-amber-800 text-[11px]">
                Click below to reset your password immediately:
              </p>
              <a
                href={debugUrl}
                className="w-full py-2.5 px-4 bg-amber-700 hover:bg-amber-800 text-white font-bold text-xs rounded-lg text-center transition-colors flex items-center justify-center gap-1.5 shadow-xs"
              >
                Reset Password Now <ArrowRight size={14} />
              </a>
              <div className="pt-1 text-[10px] font-mono text-amber-800/80 break-all border-t border-amber-200/80">
                {debugUrl}
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-gray-100 flex flex-col gap-3">
            <Link
              href={isSeller ? "/seller/login" : "/sign-in"}
              className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <ArrowLeft size={16} /> Back to Sign In
            </Link>

            <button
              type="button"
              onClick={() => {
                setIsSubmitted(false);
                setDebugUrl(null);
              }}
              className="text-xs text-gray-500 hover:text-[#0A1F44] underline font-medium cursor-pointer"
            >
              Didn&apos;t receive email? Try again
            </button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          {errorMessage && (
            <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-red-800 text-xs md:text-sm animate-fadeIn">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <p className="font-medium leading-relaxed">{errorMessage}</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-2">
              {isSeller ? "Seller Email Address" : "Registered Email Address"}
            </label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder={isSeller ? "seller@example.com" : "you@example.com"}
                className="w-full pl-10 pr-4 py-3 text-sm bg-[#F4F5F7] border border-[#C7CCD1]/50 rounded-lg outline-none text-[#0A1F44] focus:border-[#0A1F44] focus:bg-white transition-all"
                disabled={isLoading}
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3.5 px-6 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs md:text-sm font-bold uppercase tracking-widest rounded-lg shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-70 cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Sending Link...
              </>
            ) : (
              <>
                Send Reset Link <ArrowRight size={16} />
              </>
            )}
          </button>

          <div className="pt-4 border-t border-[#E5E8EC] text-center">
            <Link
              href={isSeller ? "/seller/login" : "/sign-in"}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-[#0A1F44] hover:underline uppercase tracking-wider"
            >
              <ArrowLeft size={14} /> Back to Sign In
            </Link>
          </div>
        </form>
      )}
    </div>
  );

  if (isSeller) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-[#F4F5F7]">
        {content}
      </div>
    );
  }

  return (
    <Layout>
      <div className="flex min-h-[calc(100vh-180px)] items-center justify-center bg-[#F4F5F7] px-4 py-12 md:py-16">
        {content}
      </div>
    </Layout>
  );
}
