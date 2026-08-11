import React, { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { Shield, AlertCircle, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { adminKey, storeAdminSession } from "@/lib/adminApi";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

export default function Admin2FAVerify() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [digits, setDigits] = useState<string[]>(["", "", "", "", "", ""]);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [locked, setLocked] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Guard: redirect to login if we're not in the 2FA pending state
  useEffect(() => {
    const pending = sessionStorage.getItem("td_admin_2fa_pending");
    const key = adminKey();
    if (!pending || !key) {
      setLocation("/admin/login");
    }
  }, [setLocation]);

  // Auto-focus first TOTP cell on mount
  useEffect(() => {
    if (mode === "totp") {
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
    }
  }, [mode]);

  const totpCode = digits.join("");

  const handleDigitChange = useCallback((idx: number, value: string) => {
    // Handle paste into any cell
    if (value.length > 1) {
      const cleaned = value.replace(/\D/g, "").slice(0, 6);
      if (cleaned.length > 0) {
        const next = ["", "", "", "", "", ""];
        for (let i = 0; i < cleaned.length && i < 6; i++) next[i] = cleaned[i];
        setDigits(next);
        const focusIdx = Math.min(cleaned.length, 5);
        setTimeout(() => inputRefs.current[focusIdx]?.focus(), 10);
      }
      return;
    }
    const digit = value.replace(/\D/g, "");
    const next = [...digits];
    next[idx] = digit;
    setDigits(next);
    if (digit && idx < 5) {
      setTimeout(() => inputRefs.current[idx + 1]?.focus(), 10);
    }
    setError("");
  }, [digits]);

  const handleDigitKeyDown = useCallback((idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      const next = [...digits];
      next[idx - 1] = "";
      setDigits(next);
      setTimeout(() => inputRefs.current[idx - 1]?.focus(), 10);
    }
  }, [digits]);

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "totp" && totpCode.length < 6) {
      setError("Please enter the full 6-digit code.");
      return;
    }
    if (mode === "recovery" && !recoveryCode.trim()) {
      setError("Please enter your recovery code.");
      return;
    }

    setLoading(true);
    const key = adminKey();
    try {
      const endpoint = mode === "totp"
        ? "/api/admin/2fa/login/verify"
        : "/api/admin/2fa/login/recovery";

      const body = mode === "totp"
        ? { code: totpCode }
        : { code: recoveryCode.trim().toUpperCase() };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "x-admin-key": key, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 429) {
        setLocked(true);
        setError("Too many attempts. Please wait 15 minutes before trying again.");
        return;
      }

      if (!res.ok) {
        setError(data.error ?? "Verification failed. Please try again.");
        if (mode === "totp") setDigits(["", "", "", "", "", ""]);
        setTimeout(() => inputRefs.current[0]?.focus(), 10);
        return;
      }

      // Success — store the verified session
      storeAdminSession(data.tokenHash, data.sessionId);
      sessionStorage.removeItem("td_admin_2fa_pending");
      setLocation("/admin/dashboard");
    } catch {
      setError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: "totp" | "recovery") {
    setMode(next);
    setError("");
    setDigits(["", "", "", "", "", ""]);
    setRecoveryCode("");
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2d50 100%)` }}
    >
      {/* Logo */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-center"
      >
        <img
          src={`${basePath}/images/logo.png`}
          alt="TwirlDrape"
          className="h-12 w-auto object-contain mx-auto mb-3 brightness-0 invert"
        />
        <p className="text-xs font-bold uppercase tracking-[0.35em]" style={{ color: GOLD }}>
          Super Admin Portal
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="w-full max-w-sm"
      >
        <div
          className="rounded-2xl p-8 shadow-2xl border"
          style={{ background: "rgba(255,255,255,0.05)", borderColor: "rgba(201,168,76,0.3)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-7">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: GOLD }}
            >
              <Shield size={18} style={{ color: NAVY }} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-white">Verify Your Identity</h2>
              <p className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>
                {mode === "totp"
                  ? "Enter the 6-digit code from your authenticator app"
                  : "Enter one of your saved recovery codes"}
              </p>
            </div>
          </div>

          <form onSubmit={handleVerify} className="space-y-5">
            {mode === "totp" ? (
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-3"
                  style={{ color: "rgba(201,168,76,0.8)" }}
                >
                  Authenticator Code
                </label>
                <div className="flex gap-2 justify-center">
                  {digits.map((d, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      pattern="\d*"
                      maxLength={6}
                      value={d}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(i, e)}
                      onPaste={(e) => {
                        e.preventDefault();
                        handleDigitChange(i, e.clipboardData.getData("text"));
                      }}
                      className="w-10 h-12 text-center text-lg font-bold rounded-lg outline-none transition"
                      style={{
                        background: "rgba(255,255,255,0.1)",
                        borderWidth: 1,
                        borderStyle: "solid",
                        borderColor: error ? "#ef4444" : (d ? GOLD : "rgba(201,168,76,0.3)"),
                        color: "white",
                      }}
                      disabled={locked}
                      autoComplete="one-time-code"
                    />
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-2"
                  style={{ color: "rgba(201,168,76,0.8)" }}
                >
                  Recovery Code
                </label>
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={(e) => { setRecoveryCode(e.target.value); setError(""); }}
                  placeholder="XXXXX-XXXXX"
                  className="w-full px-4 py-3 rounded-lg text-sm outline-none transition font-mono"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: error ? "#ef4444" : "rgba(201,168,76,0.3)",
                    color: "white",
                  }}
                  disabled={locked}
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div className="flex items-start gap-1.5 text-red-400 text-xs">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || locked}
              className="w-full py-3.5 font-bold text-sm uppercase tracking-widest rounded-lg transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: GOLD, color: NAVY }}
            >
              {loading && <RefreshCw size={14} className="animate-spin" />}
              {loading ? "Verifying…" : (mode === "totp" ? "Verify Code" : "Use Recovery Code")}
            </button>
          </form>

          {/* Mode toggle */}
          <div className="mt-5 text-center">
            {mode === "totp" ? (
              <button
                type="button"
                onClick={() => switchMode("recovery")}
                className="text-xs hover:underline transition-colors"
                style={{ color: "rgba(201,168,76,0.7)" }}
              >
                Lost access to your authenticator? Use a recovery code →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => switchMode("totp")}
                className="text-xs hover:underline transition-colors"
                style={{ color: "rgba(201,168,76,0.7)" }}
              >
                ← Back to authenticator code
              </button>
            )}
          </div>

          <p className="mt-5 text-xs text-center" style={{ color: "rgba(255,255,255,0.3)" }}>
            Admin keys are managed by TwirlDrape operations team.
          </p>
        </div>

        <p className="mt-6 text-center text-sm" style={{ color: "rgba(255,255,255,0.45)" }}>
          Are you a seller?{" "}
          <a
            href={`${basePath}/seller/login`}
            className="font-semibold hover:underline"
            style={{ color: GOLD }}
          >
            Go to Seller Portal →
          </a>
        </p>
      </motion.div>
    </div>
  );
}
