import React, { useState } from "react";
import { useUser, SignIn } from "@clerk/react";
import { motion } from "framer-motion";
import { Store, CheckCircle2, AlertCircle, Clock } from "lucide-react";
import { getApiUrl } from "@/lib/api";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";

interface FormData {
  name: string;
  location: string;
  bio: string;
  gstin: string;
  contactEmail: string;
  tagline: string;
}

export default function SellerRegister() {
  const { isSignedIn, isLoaded } = useUser();
  const [form, setForm] = useState<FormData>({
    name: "", location: "", bio: "", gstin: "", contactEmail: "", tagline: "",
  });
  const [errors, setErrors] = useState<Partial<FormData>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [apiError, setApiError] = useState("");

  function validate(): boolean {
    const e: Partial<FormData> = {};
    if (!form.name.trim()) e.name = "Shop name is required";
    if (!form.location.trim()) e.location = "Location is required";
    if (form.contactEmail && !/\S+@\S+\.\S+/.test(form.contactEmail)) {
      e.contactEmail = "Enter a valid email address";
    }
    if (form.gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(form.gstin.toUpperCase())) {
      e.gstin = "Enter a valid 15-character GSTIN";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    setApiError("");

    try {
      const res = await fetch(getApiUrl("/api/vendors"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim(),
          bio: form.bio.trim() || undefined,
          gstin: form.gstin.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          tagline: form.tagline.trim() || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setApiError("You already have a vendor account. Please sign in to your seller panel.");
        } else {
          setApiError(data.error || "Failed to submit application. Please try again.");
        }
        return;
      }

      setSubmitted(true);
    } catch {
      setApiError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function handleChange(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });
  }

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: IVORY }}>
        <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: MAROON }} />
      </div>
    );
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: IVORY }}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-8">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: MAROON }}>
              <Store size={24} className="text-white" />
            </div>
            <h1 className="font-serif text-2xl font-bold mb-2" style={{ color: MAROON }}>Register Your Store</h1>
            <p className="text-sm text-gray-500">Sign in first to apply as a TwirlDrape vendor.</p>
          </div>
          <SignIn
            routing="path"
            path={`${basePath}/seller/register`}
            signUpUrl={`${basePath}/sign-up`}
            forceRedirectUrl={`${basePath}/seller/register`}
          />
        </motion.div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: IVORY }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-10 text-center"
        >
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: "#f0fdf4" }}>
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Clock size={16} style={{ color: GOLD }} />
            <span className="text-xs font-bold uppercase tracking-wider" style={{ color: GOLD }}>Under Review</span>
          </div>
          <h2 className="font-serif text-2xl font-bold mb-3" style={{ color: MAROON }}>
            Application Submitted!
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed mb-6 max-w-sm mx-auto">
            Your vendor application is under review. Our team will verify your details and get back to you within 2–3 business days.
          </p>
          <div className="bg-[#F3F8F5] rounded-xl p-4 mb-6 text-left space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">What happens next</p>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: MAROON }}>1</span>
              Our team reviews your application
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: MAROON }}>2</span>
              You receive an approval notification
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-600">
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: MAROON }}>3</span>
              Access your Seller Panel and start listing
            </div>
          </div>
          <a
            href={basePath || "/"}
            className="inline-flex items-center justify-center gap-2 py-3 px-8 font-bold text-sm uppercase tracking-widest rounded-sm"
            style={{ background: MAROON, color: IVORY }}
          >
            Back to Shopping
          </a>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: IVORY }}>
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-center mb-10">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background: MAROON }}>
              <Store size={24} className="text-white" />
            </div>
            <p className="text-xs font-bold uppercase tracking-[0.3em] mb-2" style={{ color: GOLD }}>
              Become a Vendor
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-bold mb-3" style={{ color: MAROON }}>
              Register Your Store
            </h1>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              Fill in your shop details. Our team will review your application and approve you within 2–3 business days.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-8 md:p-10">
            {apiError && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
                <AlertCircle size={16} className="text-red-500 shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">{apiError}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                    Shop Name <span style={{ color: MAROON }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    placeholder="e.g. Yeola Heritage Silks"
                    className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition focus:ring-2"
                    style={{
                      background: CREAM,
                      borderColor: errors.name ? "#ef4444" : "#C9A84C44",
                      color: "#3D1515",
                    }}
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                    Location <span style={{ color: MAROON }}>*</span>
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => handleChange("location", e.target.value)}
                    placeholder="e.g. Yeola, Maharashtra"
                    className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition"
                    style={{
                      background: CREAM,
                      borderColor: errors.location ? "#ef4444" : "#C9A84C44",
                      color: "#3D1515",
                    }}
                  />
                  {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location}</p>}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                  Tagline
                </label>
                <input
                  type="text"
                  value={form.tagline}
                  onChange={(e) => handleChange("tagline", e.target.value)}
                  placeholder="e.g. Handwoven Paithani from master artisans"
                  className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition"
                  style={{ background: CREAM, borderColor: "#C9A84C44", color: "#3D1515" }}
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                  About Your Store
                </label>
                <textarea
                  value={form.bio}
                  onChange={(e) => handleChange("bio", e.target.value)}
                  rows={4}
                  placeholder="Tell us about your shop, craft, and heritage…"
                  className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition resize-none"
                  style={{ background: CREAM, borderColor: "#C9A84C44", color: "#3D1515" }}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                    Contact Email
                  </label>
                  <input
                    type="email"
                    value={form.contactEmail}
                    onChange={(e) => handleChange("contactEmail", e.target.value)}
                    placeholder="shop@example.com"
                    className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition"
                    style={{
                      background: CREAM,
                      borderColor: errors.contactEmail ? "#ef4444" : "#C9A84C44",
                      color: "#3D1515",
                    }}
                  />
                  {errors.contactEmail && <p className="text-red-500 text-xs mt-1">{errors.contactEmail}</p>}
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "#3D1515" }}>
                    GSTIN
                  </label>
                  <input
                    type="text"
                    value={form.gstin}
                    onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                    placeholder="e.g. 27AABCU9603R1ZX"
                    maxLength={15}
                    className="w-full px-4 py-3 rounded-lg border text-sm outline-none transition font-mono"
                    style={{
                      background: CREAM,
                      borderColor: errors.gstin ? "#ef4444" : "#C9A84C44",
                      color: "#3D1515",
                    }}
                  />
                  {errors.gstin && <p className="text-red-500 text-xs mt-1">{errors.gstin}</p>}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 font-bold text-sm uppercase tracking-widest rounded-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ background: MAROON, color: IVORY }}
              >
                {submitting ? "Submitting Application…" : "Submit Vendor Application"}
              </button>
            </form>
          </div>

          <p className="text-center text-xs text-gray-400 mt-6">
            Already an approved vendor?{" "}
            <a href={`${basePath}/seller/login`} className="font-semibold" style={{ color: MAROON }}>
              Sign in to your seller panel →
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
