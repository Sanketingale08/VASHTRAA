import React, { useState } from "react";
import { SignIn, useUser } from "@clerk/react";
import { useLocation } from "wouter";
import { Shield, Store, Eye, EyeOff, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const IVORY = "#FAF6EE";

type Tab = "seller" | "admin";

export default function AdminLogin() {
  const [tab, setTab] = useState<Tab>("seller");
  const [adminKey, setAdminKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [, setLocation] = useLocation();
  const { isSignedIn } = useUser();

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
            Seller &amp; Admin Portal
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="w-full max-w-md"
        >
          <div className="flex rounded-xl overflow-hidden border border-[#C9A84C]/30 mb-6">
            <button
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wider transition-all"
              style={{
                background: tab === "seller" ? MAROON : "transparent",
                color: tab === "seller" ? IVORY : "#7a5f4e",
              }}
              onClick={() => setTab("seller")}
            >
              <Store size={15} /> Seller Sign In
            </button>
            <button
              className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-bold uppercase tracking-wider transition-all"
              style={{
                background: tab === "admin" ? MAROON : "transparent",
                color: tab === "admin" ? IVORY : "#7a5f4e",
              }}
              onClick={() => setTab("admin")}
            >
              <Shield size={15} /> Admin Access
            </button>
          </div>

          {tab === "seller" && (
            <div>
              {isSignedIn ? (
                <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-8 text-center shadow-sm">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: MAROON + "15" }}>
                    <Store size={24} style={{ color: MAROON }} />
                  </div>
                  <h2 className="font-serif text-xl font-bold mb-2" style={{ color: MAROON }}>Already Signed In</h2>
                  <p className="text-sm text-gray-500 mb-6">You're signed in to TwirlDrape. Access your seller panel or register as a vendor.</p>
                  <div className="flex flex-col gap-3">
                    <a
                      href={`${basePath}/seller/dashboard`}
                      className="inline-flex items-center justify-center gap-2 py-3 px-6 font-bold text-sm uppercase tracking-widest rounded-sm transition-colors"
                      style={{ background: MAROON, color: IVORY }}
                    >
                      Go to Seller Dashboard
                    </a>
                    <a
                      href={`${basePath}/seller/register`}
                      className="inline-flex items-center justify-center gap-2 py-3 px-6 font-bold text-sm uppercase tracking-widest rounded-sm border-2 transition-colors"
                      style={{ borderColor: GOLD, color: MAROON }}
                    >
                      Register as Vendor
                    </a>
                  </div>
                </div>
              ) : (
                <div>
                  <SignIn
                    routing="path"
                    path={`${basePath}/admin/login`}
                    signUpUrl={`${basePath}/sign-up`}
                    forceRedirectUrl={`${basePath}/seller/dashboard`}
                  />
                  <p className="mt-5 text-center text-sm text-gray-500">
                    New seller?{" "}
                    <a href={`${basePath}/seller/register`} className="font-semibold" style={{ color: MAROON }}>
                      Register your store →
                    </a>
                  </p>
                </div>
              )}
            </div>
          )}

          {tab === "admin" && (
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
          )}
        </motion.div>
      </div>
    </div>
  );
}
