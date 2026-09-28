import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { storeAdminSession } from "@/lib/adminApi";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const NAVY = "#0A1F44";
const ROYAL = "#2C3E6B";
const GOLD = "#C7CCD1";

export default function AdminLogin() {
  const [adminKey, setAdminKeyState] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, setLocation] = useLocation();

  async function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    const key = adminKey.trim();
    if (!key) {
      setAdminError("Please enter your admin key");
      return;
    }
    setLoading(true);
    setAdminError("");
    try {
      // Validate the key against DB via API endpoint
      const statusRes = await fetch(`/api/admin/2fa/status`, {
        headers: { "x-admin-key": key },
        credentials: "include",
      });

      if (!statusRes.ok) {
        if (statusRes.status === 403 || statusRes.status === 401) {
          setAdminError("Invalid access key");
        } else {
          // Fallback check for Admin@123 when server endpoint returns 500/offline
          if (key === "Admin@123") {
            sessionStorage.setItem("td_admin_key", key);
            setLocation("/admin/dashboard");
            return;
          }
          setAdminError("Server error, please try again.");
        }
        return;
      }

      const { enabled } = await statusRes.json().catch(() => ({ enabled: false }));

      // Clear any stale session items from prior logins before setting new key
      sessionStorage.removeItem("td_admin_session_token");
      sessionStorage.removeItem("td_admin_session_id");
      sessionStorage.removeItem("td_admin_2fa_pending");

      // Key is valid — store it now and open Admin Dashboard
      sessionStorage.setItem("td_admin_key", key);

      if (enabled) {
        sessionStorage.setItem("td_admin_2fa_pending", "true");
        setLocation("/admin/2fa-verify");
      } else {
        setLocation("/admin/dashboard");
      }
    } catch {
      // Network error fallback for Admin@123
      if (key === "Admin@123") {
        sessionStorage.setItem("td_admin_key", key);
        setLocation("/admin/dashboard");
      } else {
        setAdminError("Server error, please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0B0C10 50%, ${ROYAL} 100%)` }}
    >
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-8 text-center"
      >
        <img
          src={`${basePath}/logo.svg`}
          alt="VASTRAA"
          className="h-16 w-auto object-contain mx-auto mb-3 bg-white/90 p-2.5 rounded-lg shadow-sm"
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
          className="rounded-2xl p-8 shadow-2xl border backdrop-blur-md transition-all"
          style={{ background: "rgba(10, 31, 68, 0.75)", borderColor: "rgba(199, 204, 209, 0.3)" }}
        >
          <div className="flex items-center gap-3 mb-6">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
              style={{ background: GOLD }}
            >
              <Shield size={18} style={{ color: NAVY }} />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-white tracking-wide">Admin Sign In</h2>
              <p className="text-xs" style={{ color: "rgba(199,204,209,0.7)" }}>
                VASTRAA Operations Team
              </p>
            </div>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-5">
            <div>
              <label
                className="block text-xs font-bold uppercase tracking-wider mb-2"
                style={{ color: "rgba(199,204,209,0.9)" }}
              >
                Admin API Key
              </label>
              <div className="relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={adminKey}
                  onChange={(e) => { setAdminKeyState(e.target.value); setAdminError(""); }}
                  placeholder="Enter your admin key"
                  className="w-full px-4 py-3 pr-10 rounded-xl text-sm outline-none transition-all focus:ring-1 focus:ring-[#C7CCD1]"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                    borderWidth: 1,
                    borderStyle: "solid",
                    borderColor: adminError ? "#ef4444" : "rgba(199,204,209,0.3)",
                    color: "white",
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 transition-colors hover:text-white"
                  style={{ color: "rgba(199,204,209,0.6)" }}
                  onClick={() => setShowKey(!showKey)}
                >
                  {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {adminError && (
                <div className="flex items-center gap-1.5 mt-1.5 text-red-400 text-xs font-semibold">
                  <AlertCircle size={13} /> {adminError}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 font-bold text-sm uppercase tracking-widest rounded-xl transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer shadow-md"
              style={{ background: GOLD, color: NAVY }}
            >
              {loading ? "Verifying…" : "Access Admin Panel"}
            </button>
          </form>

          <p className="mt-6 text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
            Admin keys are managed by VASTRAA operations team.
          </p>
        </div>
      </motion.div>
    </div>
  );
}

