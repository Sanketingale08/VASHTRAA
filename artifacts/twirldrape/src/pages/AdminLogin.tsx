import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

export default function AdminLogin() {
  const [adminKey, setAdminKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey.trim()) {
      setAdminError("Please enter your admin key");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/vendors`, {
        headers: { "x-admin-key": adminKey.trim() },
        credentials: "include",
      });
      if (res.status === 403) {
        setAdminError("Invalid admin key. Please try again.");
        return;
      }
      sessionStorage.setItem("td_admin_key", adminKey.trim());
      setAdminError("");
      setLocation("/admin/dashboard");
    } catch {
      setAdminError("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2d50 100%)` }}
    >
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
          <div className="flex items-center gap-3 mb-7">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{ background: GOLD }}
            >
              <Shield size={18} style={{ color: NAVY }} />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-white">Admin Sign In</h2>
              <p className="text-xs" style={{ color: "rgba(201,168,76,0.7)" }}>
                TwirlDrape Operations Team
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-2"
                style={{ color: "rgba(201,168,76,0.8)" }}
              >
                Admin API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={adminKey}
                  onChange={(e) => { setAdminKey(e.target.value); setAdminError(""); }}
                  placeholder="Enter your admin key"
                  className="w-full px-4 py-3 pr-10 rounded-lg text-sm outline-none transition"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: adminError ? "#ef4444" : "rgba(201,168,76,0.3)",
                    color: "white",
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: "rgba(201,168,76,0.6)" }}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {adminError && (
                <div className="flex items-center gap-1.5 mt-1.5 text-red-400 text-xs">
                  <AlertCircle size={12} /> {adminError}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 font-bold text-sm uppercase tracking-widest rounded-lg transition-all disabled:opacity-60"
              style={{ background: GOLD, color: NAVY }}
            >
              {loading ? "Verifying…" : "Access Admin Panel"}
            </button>
          </form>

          <p className="mt-6 text-xs text-center" style={{ color: "rgba(255,255,255,0.35)" }}>
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
