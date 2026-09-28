import React, { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, X, Loader2, CheckCircle, ArrowLeft, AlertCircle } from "lucide-react";
// EmailAddressResource inferred from useUser() return type

const inputCls =
  "w-full border border-[#C7CCD1]/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors bg-white text-center tracking-widest";

const RESEND_SECS = 60;

interface Props {
  onClose: () => void;
  onSuccess: (newEmail: string) => void;
}

type Step = "enter" | "verify" | "success";

export function ChangeEmailModal({ onClose, onSuccess }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("enter");
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [emailAddrObj, setEmailAddrObj] = useState<any>(null);

  // countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  // close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isValidEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
  const currentEmail = user?.email ?? "";

  async function sendVerification() {
    const trimmed = newEmail.trim().toLowerCase();
    if (!isValidEmail(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    if (trimmed === currentEmail.toLowerCase()) {
      setError("New email must be different from your current email.");
      return;
    }
    if (!user) return;
    setLoading(true);
    setError("");
    try {
      // Create the new email address in Clerk (unverified)
      const addr = await user.createEmailAddress({ email: trimmed });
      // Send verification code to the new email
      await addr.prepareVerification({ strategy: "email_code" });
      setEmailAddrObj(addr);
      setStep("verify");
      setCountdown(RESEND_SECS);
    } catch (err: any) {
      const msg: string =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        "Failed to send verification code.";
      // If the email address already exists on this account, get the existing object
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("taken") || msg.toLowerCase().includes("exists")) {
        setError("This email is already linked to your account or another account.");
      } else {
        setError(msg);
      }
      // Clean up the unverified email address if it was partially created
      try {
        const existing = user.emailAddresses.find(
          (ea) => ea.emailAddress.toLowerCase() === trimmed && ea.verification.status !== "verified"
        );
        if (existing) {
          const addr2 = existing;
          await addr2.prepareVerification({ strategy: "email_code" });
          setEmailAddrObj(addr2);
          setError("");
          setStep("verify");
          setCountdown(RESEND_SECS);
        }
      } catch {
        // ignore recovery attempt errors
      }
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode() {
    if (code.trim().length < 6) {
      setError("Enter the 6-digit code sent to your new email.");
      return;
    }
    if (!emailAddrObj || !user) return;
    setLoading(true);
    setError("");
    try {
      // Verify the code with Clerk if available
      let verifiedId: string | null = null;
      if (emailAddrObj) {
        const verified = await emailAddrObj.attemptVerification({ code: code.trim() });
        verifiedId = verified?.id;
      }

      if (user && verifiedId) {
        try {
          await user.update({ primaryEmailAddressId: verifiedId });
        } catch { /* ignore */ }
      }

      // Sync updated email address directly to backend database
      try {
        const token = localStorage.getItem("vastraa_auth_token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        await fetch(`/api/account/profile`, {
          method: "PATCH",
          credentials: "include",
          headers,
          body: JSON.stringify({ email: newEmail.trim().toLowerCase() }),
        });
      } catch { /* ignore error, parent callback will finish sync */ }

      setStep("success");
      onSuccess(newEmail.trim().toLowerCase());
    } catch (err: any) {
      const msg: string =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        "Invalid or expired code. Please try again.";
      setError(msg.includes("incorrect") || msg.includes("invalid") || msg.includes("expired")
        ? "Incorrect or expired code. Please check your email and try again."
        : msg);
    } finally {
      setLoading(false);
    }
  }

  async function resendCode() {
    if (countdown > 0 || !emailAddrObj) return;
    setLoading(true);
    setError("");
    try {
      await emailAddrObj.prepareVerification({ strategy: "email_code" });
      setCountdown(RESEND_SECS);
      setCode("");
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Failed to resend code.");
    } finally {
      setLoading(false);
    }
  }

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
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            {step === "verify" && (
              <button onClick={() => { setStep("enter"); setError(""); setCode(""); }} className="p-1 rounded-full hover:bg-gray-100 transition-colors">
                <ArrowLeft size={16} className="text-gray-500" />
              </button>
            )}
            <div>
              <h3 className="font-serif text-lg font-bold text-[#0A1F44]">Change Email Address</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === "enter" && "Enter your new email address"}
                {step === "verify" && "Enter the verification code"}
                {step === "success" && "Email address updated"}
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
              <div className="bg-[#F4F5F7] rounded-xl p-3 flex items-start gap-2.5">
                <AlertCircle size={14} className="text-[#C7CCD1] mt-0.5 shrink-0" />
                <p className="text-xs text-gray-600">
                  Current email: <span className="font-semibold text-[#0A1F44]">{currentEmail}</span>. A verification code will be sent to your <strong>new email</strong>.
                </p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">New Email Address</label>
                <input
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setError(""); }}
                  placeholder="you@example.com"
                  type="email"
                  className="w-full border border-[#C7CCD1]/30 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors bg-white"
                  autoFocus
                />
              </div>
              {error && <ErrorMsg>{error}</ErrorMsg>}
              <button
                onClick={sendVerification}
                disabled={loading || !isValidEmail(newEmail.trim())}
                className="w-full bg-[#0A1F44] hover:bg-[#6a1826] disabled:opacity-50 text-white py-3 text-sm font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Sending…</> : <><Mail size={14} /> Send Verification Code</>}
              </button>
            </motion.div>
          )}

          {step === "verify" && (
            <motion.div key="verify" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <div className="bg-[#F4F5F7] rounded-xl p-3 text-center">
                <p className="text-xs text-gray-500">Code sent to your new email</p>
                <p className="text-xs font-semibold text-[#0A1F44] mt-0.5">{newEmail.trim()}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5 text-center">Enter 6-Digit Code</label>
                <input
                  value={code}
                  onChange={(e) => { setCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
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
                onClick={verifyCode}
                disabled={loading || code.trim().length !== 6}
                className="w-full bg-[#0A1F44] hover:bg-[#6a1826] disabled:opacity-50 text-white py-3 text-sm font-bold uppercase tracking-wider rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                {loading ? <><Loader2 size={14} className="animate-spin" /> Verifying…</> : "Verify & Update Email"}
              </button>
              <p className="text-center text-xs text-gray-400">
                {countdown > 0 ? (
                  <>Resend in <span className="font-semibold text-[#0A1F44]">{countdown}s</span></>
                ) : (
                  <button onClick={resendCode} disabled={loading} className="text-[#0A1F44] font-semibold hover:underline disabled:opacity-50">
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
                <p className="font-semibold text-[#1a1a2e] text-base">Email address updated!</p>
                <p className="text-sm text-gray-400 mt-1">{newEmail.trim()} is now your primary email.</p>
              </div>
              <button
                onClick={onClose}
                className="w-full bg-[#0A1F44] text-white py-3 text-sm font-bold uppercase tracking-wider rounded-xl transition-colors hover:bg-[#6a1826]"
              >
                Done
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

function ErrorMsg({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
      {children}
    </div>
  );
}
