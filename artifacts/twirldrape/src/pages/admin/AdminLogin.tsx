import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

export default function AdminLogin() {
  const [, setLocation] = useLocation();
  const [key, setKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!key.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/admin/stats`, {
        headers: { "x-admin-key": key.trim() },
        credentials: "include",
      });
      if (res.ok) {
        sessionStorage.setItem("td_admin_key", key.trim());
        setLocation("/admin/dashboard");
      } else if (res.status === 401 || res.status === 403) {
        setError("Invalid admin key. Please try again.");
      } else {
        setError("Server error. Please check the API server is running.");
      }
    } catch {
      setError("Network error. Could not reach the API server.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #1a2f5c 100%)` }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "rgba(201,168,76,0.15)", border: `1px solid rgba(201,168,76,0.3)` }}
          >
            <Shield size={32} style={{ color: GOLD }} />
          </div>
          <h1 className="text-2xl font-serif font-bold text-white tracking-tight">
            Super Admin
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            TwirlDrape Platform Control
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-8 shadow-2xl"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)" }}
        >
          <div className="mb-6">
            <label className="block text-xs font-semibold mb-2 tracking-wider uppercase" style={{ color: GOLD }}>
              Admin Access Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Enter admin key"
                autoComplete="off"
                className="w-full rounded-xl px-4 py-3 pr-11 text-sm outline-none transition-all"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#fff",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.border = `1px solid ${GOLD}`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.border = "1px solid rgba(255,255,255,0.15)";
                }}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80 transition-opacity"
                style={{ color: "#fff" }}
              >
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-lg px-4 py-2.5 text-sm" style={{ background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
            style={{
              background: loading || !key.trim() ? "rgba(201,168,76,0.4)" : GOLD,
              color: NAVY,
              cursor: loading || !key.trim() ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Verifying…
              </>
            ) : (
              "Access Admin Panel"
            )}
          </button>
        </form>

        <p className="text-center mt-6 text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
          Restricted access — authorised personnel only
        </p>
      </div>
    </div>
  );
}
