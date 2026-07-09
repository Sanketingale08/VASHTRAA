import React, { useState } from "react";
import { useLocation } from "wouter";
import { Shield, Eye, EyeOff, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const IVORY = "#FAF6EE";

export default function AdminLogin() {
  const [adminKey, setAdminKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [, setLocation] = useLocation();

  function handleAdminLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!adminKey.trim()) {
      setAdminError("Please enter your admin key");
      return;
    }
    sessionStorage.setItem("td_admin_key", adminKey.trim());
    setAdminError("");
    setLocation("/admin/dashboard");
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: IVORY }}>
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <motion.div
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10 text-center"
        >
          <img
            src={`${basePath}/images/logo.png`}
            alt="TwirlDrape"
            className="h-14 w-auto object-contain mx-auto mb-4"
          />
          <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: GOLD }}>
            Admin Access
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: MAROON }}>
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Admin Access</h2>
                <p className="text-xs text-gray-500">For TwirlDrape staff only</p>
              </div>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                  Admin API Key
                </label>
                <div className="relative">
                  <input
                    type={showKey ? "text" : "password"}
                    value={adminKey}
                    onChange={(e) => { setAdminKey(e.target.value); setAdminError(""); }}
                    placeholder="Enter your admin key"
                    className="w-full px-4 py-3 pr-10 rounded-lg border text-sm outline-none transition"
                    style={{
                      background: IVORY,
                      borderColor: adminError ? "#ef4444" : "#C9A84C44",
                      color: "#3D1515",
                    }}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowKey(!showKey)}
                  >
                    {showKey ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {adminError && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-red-500 text-xs">
                    <AlertCircle size={12} /> {adminError}
                  </div>
                )}
              </div>

              <button
                type="submit"
                className="w-full py-3.5 font-bold text-sm uppercase tracking-widest rounded-sm transition-colors"
                style={{ background: MAROON, color: IVORY }}
              >
                Access Admin Dashboard
              </button>
            </form>

            <p className="mt-5 text-xs text-center text-gray-400">
              Admin keys are managed by TwirlDrape operations team.
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-gray-500">
            Are you a seller?{" "}
            <a href={`${basePath}/seller/login`} className="font-semibold hover:underline" style={{ color: MAROON }}>
              Go to Seller Portal →
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
