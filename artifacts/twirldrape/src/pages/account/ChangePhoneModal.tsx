import React, { useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, X, Loader2, CheckCircle, ArrowLeft, Mail } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const inputCls =
  "w-full border border-[#C9A84C]/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors bg-white text-center tracking-widest";

const RESEND_SECS = 60;

interface Props {
  onClose: () => void;
  onSuccess: (newPhone: string) => void;
}

type Step = "enter" | "verify" | "success";

export function ChangePhoneModal({ onClose, onSuccess }: Props) {
  const { user } = useUser();
  const [step, setStep] = useState<Step>("enter");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);

  // countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const currentEmail = user?.primaryEmailAddress?.emailAddress ?? "";

  async function requestOtp() {
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) {
      setError("Enter a valid 10-digit mobile number.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/account/phone-otp/request`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to send OTP");
      setStep("verify");
      setCountdown(RESEND_SECS);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function verifyOtp() {
    const code = otp.trim();
    if (code.length !== 6) {
      setError("Enter the 6-digit code sent to your email.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${BASE}/api/account/phone-otp/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.replace(/\D/g, ""), code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Invalid or expired code");
      // reload user so publicMetadata syncs
      await user?.reload();
      setStep("success");
      onSuccess(phone.replace(/\D/g, ""));
    } catch (err: any) {
      setError(err.message ?? "Verification failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function resendOtp() {
    if (countdown > 0) return;
    setOtp("");
    setError("");
    await requestOtp();
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {step === "verify" && (
              <button onClick={() => { setStep("enter"); setError(""); }} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                <ArrowLeft size={16} className="text-gray-500" />
              </button>
            )}
            <div>
              <h3 className="font-serif text-lg font-bold text-[#1E6B5A]">Change Mobile Number</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === "enter" && "Enter your new mobile number"}
                {step === "verify" && "Enter the verification code"}
                {step === "success" && "Mobile number updated"}
              </p>
            </div>
          </div>
          {step !== "success" && (
            <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 transition-colors">
              <X size={16} className="text-gray-400" />
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {step === "enter" && (
            <motion.div key="enter" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <div className="bg-[#F3F8F5] rounded-xl p-3 flex items-start gap-2.5">
                <Mail size={14} className="text-[#1E6B5A] mt-0.5 shrink-0" />
                <p className="text-xs text-[#1E6B5A]">
                  A 6-digit verification code will be sent to <span className="font-semibold">{currentEmail}</span> to confirm this change.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New Mobile Number</label>
                <div className="flex items-center border border-[#C9A84C]/30 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#1E6B5A]/20 focus-within:border-[#1E6B5A] transition-colors bg-white">
                  <span className="px-3 py-3 text-sm text-gray-500 border-r border-[#C9A84C]/20 bg-[#F3F8F5] font-medium">+91</span>
                  <input
                    value={phone}
                    onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "").slice(0, 10)); setError(""); }}
                    placeholder="9876543210"
                    type="tel"
                    maxLength={10}
                    className="flex-1 px-3 py-3 text-sm focus:outline-none bg-white"
                    autoFocus
                  />
                </div>
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <button
                onClick={requestOtp}
                disabled={loading || phone.replace(/\D/g, "").length !== 10}
                className="w-full bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-50 text-white py-3 text-sm font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Phone size={14} /> Send Verification Code</>}
              </button>
            </motion.div>
          )}

          {step === "verify" && (
            <motion.div key="verify" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <div className="bg-[#F3F8F5] rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Code sent to <span className="font-semibold text-[#1E6B5A]">{currentEmail}</span></p>
                <p className="text-xs text-gray-400 mt-0.5">Updating mobile to +91 {phone}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 text-center">Enter 6-Digit Code</label>
                <input
                  value={otp}
                  onChange={(e) => { setOtp(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  placeholder="• • • • • •"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  className={inputCls}
                  autoFocus
                />
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <button
                onClick={verifyOtp}
                disabled={loading || otp.trim().length !== 6}
                className="w-full bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-50 text-white py-3 text-sm font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : "Verify & Update"}
              </button>
              <p className="text-center text-xs text-gray-400">
                {countdown > 0 ? (
                  <>Resend in <span className="font-semibold text-[#1E6B5A]">{countdown}s</span></>
                ) : (
                  <button onClick={resendOtp} disabled={loading} className="text-[#1E6B5A] font-semibold hover:underline disabled:opacity-50">
                    Resend Code
                  </button>
                )}
              </p>
            </motion.div>
          )}

          {step === "success" && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="text-center space-y-4 py-4">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto">
                <CheckCircle size={28} className="text-green-500" />
              </div>
              <div>
                <p className="font-semibold text-[#1a1a2e] text-base">Mobile number updated!</p>
                <p className="text-sm text-gray-400 mt-1">+91 {phone} is now your registered number.</p>
              </div>
              <button
                onClick={onClose}
                className="w-full bg-[#1E6B5A] text-white py-3 text-sm font-bold uppercase tracking-wider rounded-xl transition-colors hover:bg-[#6a1826]"
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ModalOverlay>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
      {children}
    </div>
  );
}

function ModalOverlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  // close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className="relative z-10 bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </div>
  );
}
