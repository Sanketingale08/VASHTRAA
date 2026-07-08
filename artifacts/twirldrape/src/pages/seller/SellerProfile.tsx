import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Save, Camera, AlertCircle, CheckCircle } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";
const MAROON = "#7B1C2C";
const IVORY = "#FAF6EE";
const CREAM = "#F5EDE0";

interface FormState {
  name: string;
  tagline: string;
  bio: string;
  location: string;
  gstin: string;
  contactEmail: string;
  avatar: string;
}

export default function SellerProfile() {
  const { vendor, refresh } = useSellerContext();
  const [form, setForm] = useState<FormState>({
    name: "", tagline: "", bio: "", location: "", gstin: "", contactEmail: "", avatar: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (vendor) {
      setForm({
        name: vendor.name ?? "",
        tagline: vendor.tagline ?? "",
        bio: vendor.bio ?? "",
        location: vendor.location ?? "",
        gstin: vendor.gstin ?? "",
        contactEmail: vendor.contactEmail ?? "",
        avatar: vendor.avatar ?? "",
      });
    }
  }, [vendor]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
    setSuccess(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;

    if (!form.name.trim()) {
      setError("Shop name is required.");
      return;
    }
    if (!form.location.trim()) {
      setError("Location is required.");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess(false);

    try {
      const res = await fetch(getApiUrl(`/api/vendors/${vendor.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: form.name.trim(),
          tagline: form.tagline.trim() || null,
          bio: form.bio.trim() || null,
          location: form.location.trim(),
          gstin: form.gstin.trim() || null,
          contactEmail: form.contactEmail.trim() || null,
          avatar: form.avatar.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save changes.");
        return;
      }

      setSuccess(true);
      refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-[#C9A84C]/40";
  const inputStyle = { background: CREAM, borderColor: "#C9A84C44", color: "#3D1515" };
  const labelClass = "block text-xs font-bold uppercase tracking-wider mb-1.5";
  const labelStyle = { color: "#5a3e3e" };

  return (
    <SellerLayout title="Store Profile">
      <div className="max-w-2xl mx-auto">
        <motion.form
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          onSubmit={handleSubmit}
          className="space-y-6"
        >
          {/* Avatar */}
          <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6">
            <h3 className="font-serif font-bold text-base mb-4" style={{ color: MAROON }}>Shop Avatar</h3>
            <div className="flex items-center gap-5">
              <div className="w-20 h-20 rounded-2xl border-2 border-[#C9A84C]/30 overflow-hidden bg-[#F5EDE0] shrink-0 flex items-center justify-center">
                {form.avatar ? (
                  <img
                    src={form.avatar}
                    alt="Store avatar"
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
                  />
                ) : (
                  <Camera size={28} style={{ color: "#C9A84C" }} />
                )}
              </div>
              <div className="flex-1">
                <label className={labelClass} style={labelStyle}>Avatar URL</label>
                <input
                  type="url"
                  name="avatar"
                  value={form.avatar}
                  onChange={handleChange}
                  placeholder="https://example.com/your-shop-logo.jpg"
                  className={inputClass}
                  style={inputStyle}
                />
                <p className="text-xs text-gray-400 mt-1.5">Paste a publicly accessible image URL for your store avatar.</p>
              </div>
            </div>
          </div>

          {/* Basic Info */}
          <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6 space-y-4">
            <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Store Details</h3>

            <div>
              <label className={labelClass} style={labelStyle}>Shop Name *</label>
              <input
                type="text"
                name="name"
                value={form.name}
                onChange={handleChange}
                placeholder="Your store name"
                required
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>Tagline</label>
              <input
                type="text"
                name="tagline"
                value={form.tagline}
                onChange={handleChange}
                placeholder="A short description of your store"
                maxLength={120}
                className={inputClass}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>Bio</label>
              <textarea
                name="bio"
                value={form.bio}
                onChange={handleChange as any}
                placeholder="Tell shoppers about your craft and heritage…"
                rows={4}
                maxLength={800}
                className={`${inputClass} resize-none`}
                style={inputStyle}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>Location *</label>
              <input
                type="text"
                name="location"
                value={form.location}
                onChange={handleChange}
                placeholder="e.g. Nashik, Maharashtra"
                required
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {/* Business Info */}
          <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6 space-y-4">
            <h3 className="font-serif font-bold text-base" style={{ color: MAROON }}>Business Information</h3>

            <div>
              <label className={labelClass} style={labelStyle}>GSTIN</label>
              <input
                type="text"
                name="gstin"
                value={form.gstin}
                onChange={handleChange}
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
                className={inputClass}
                style={{ ...inputStyle, fontFamily: "monospace" }}
              />
            </div>

            <div>
              <label className={labelClass} style={labelStyle}>Contact Email</label>
              <input
                type="email"
                name="contactEmail"
                value={form.contactEmail}
                onChange={handleChange}
                placeholder="orders@yourstore.com"
                className={inputClass}
                style={inputStyle}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
              <CheckCircle size={15} /> Store profile updated successfully.
            </div>
          )}

          <button
            type="submit"
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 py-3.5 font-bold text-sm uppercase tracking-widest rounded-lg transition-opacity disabled:opacity-60"
            style={{ background: MAROON, color: IVORY }}
          >
            <Save size={15} />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </motion.form>
      </div>
    </SellerLayout>
  );
}
