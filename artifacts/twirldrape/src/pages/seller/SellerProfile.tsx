import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Camera, AlertCircle, CheckCircle, X, Loader2, Pencil, Phone, Mail, MapPin, Building2, FileText, User } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";
const GOLD = "#C9A84C";

interface FormState {
  name: string;
  tagline: string;
  bio: string;
  location: string;
  gstin: string;
  contactEmail: string;
  mobile: string;
  avatar: string;
}

// ── Single-photo avatar uploader ──────────────────────────────────────────────
interface AvatarUploaderProps {
  currentAvatar: string;
  onAvatarChange: (url: string) => void;
  onUploadingChange: (uploading: boolean) => void;
  disabled?: boolean;
}

function SingleAvatarUploader({ currentAvatar, onAvatarChange, onUploadingChange, disabled }: AvatarUploaderProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function setUploadingState(val: boolean) {
    setUploading(val);
    onUploadingChange(val);
  }

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setUploadError("Please upload an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Image must be under 5 MB.");
      return;
    }
    setUploadingState(true);
    setUploadError("");
    try {
      const res = await fetch(getApiUrl("/api/seller/upload/avatar"), {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setUploadError(err.error || "Upload failed. Please try again.");
        return;
      }
      const { publicRelPath } = await res.json();
      onAvatarChange(getApiUrl(publicRelPath));
    } catch {
      setUploadError("Network error. Please try again.");
    } finally {
      setUploadingState(false);
    }
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [disabled]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled) setDragging(true);
  }, [disabled]);

  const onDragLeave = useCallback(() => setDragging(false), []);

  return (
    <div className="flex items-center gap-5">
      {/* Avatar preview */}
      <div className="relative shrink-0">
        <div
          className="w-20 h-20 rounded-full border-2 overflow-hidden flex items-center justify-center"
          style={{ borderColor: `${GOLD}60`, background: CREAM }}
        >
          {currentAvatar ? (
            <img
              src={currentAvatar}
              alt="Profile photo"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
            />
          ) : (
            <Camera size={26} style={{ color: GOLD }} />
          )}
          {uploading && (
            <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
              <Loader2 size={20} className="animate-spin text-white" />
            </div>
          )}
        </div>
        {currentAvatar && !disabled && !uploading && (
          <button
            type="button"
            title="Remove photo"
            onClick={() => { onAvatarChange(""); setUploadError(""); }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow"
          >
            <X size={10} />
          </button>
        )}
      </div>

      {/* Drop zone / upload trigger */}
      <div className="flex-1 min-w-0">
        {!disabled && (
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => !uploading && fileRef.current?.click()}
            className="rounded-xl border-2 border-dashed cursor-pointer transition-all flex items-center gap-3 px-4 py-3 select-none"
            style={{
              borderColor: dragging ? GOLD : `${GOLD}50`,
              background: dragging ? `${GOLD}0D` : CREAM,
              opacity: uploading ? 0.6 : 1,
              pointerEvents: uploading ? "none" : "auto",
            }}
          >
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }}
            />
            <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: `${GOLD}20` }}>
              <Camera size={15} style={{ color: GOLD }} />
            </div>
            <div>
              <p className="text-xs font-semibold" style={{ color: MAROON }}>
                {uploading ? "Uploading…" : dragging ? "Drop image here" : currentAvatar ? "Replace photo" : "Upload profile photo"}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">JPG, PNG, WebP · max 5 MB</p>
            </div>
          </div>
        )}
        {uploadError && (
          <p className="text-xs text-red-500 mt-1.5">{uploadError}</p>
        )}
      </div>
    </div>
  );
}

// ── Read-only display row ─────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-3 border-b last:border-0" style={{ borderColor: `${GOLD}20` }}>
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${MAROON}12` }}>
        <Icon size={13} style={{ color: MAROON }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#9a8070" }}>{label}</p>
        <p className="text-sm font-medium break-words" style={{ color: "#2d1f14" }}>{value}</p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SellerProfile() {
  const { vendor, refresh } = useSellerContext();
  const [form, setForm] = useState<FormState>({
    name: "", tagline: "", bio: "", location: "",
    gstin: "", contactEmail: "", mobile: "", avatar: "",
  });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Snapshot to restore on cancel
  const [snapshot, setSnapshot] = useState<FormState | null>(null);

  useEffect(() => {
    if (vendor) {
      const loaded: FormState = {
        name: vendor.name ?? "",
        tagline: vendor.tagline ?? "",
        bio: vendor.bio ?? "",
        location: vendor.location ?? "",
        gstin: vendor.gstin ?? "",
        contactEmail: vendor.contactEmail ?? "",
        mobile: vendor.mobile ?? "",
        avatar: vendor.avatar ?? "",
      };
      setForm(loaded);
    }
  }, [vendor]);

  function startEdit() {
    setSnapshot({ ...form });
    setError("");
    setSuccess(false);
    setEditing(true);
  }

  function cancelEdit() {
    if (avatarUploading) return; // wait for upload to finish before discarding
    if (snapshot) setForm(snapshot);
    setError("");
    setEditing(false);
  }

  // True when any async operation is in progress
  const busy = saving || avatarUploading;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
    setSuccess(false);
  }

  function validateMobile(mobile: string) {
    if (!mobile.trim()) return true; // optional
    return /^[6-9]\d{9}$/.test(mobile.trim());
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vendor) return;

    if (!form.name.trim()) { setError("Business name is required."); return; }
    if (!form.location.trim()) { setError("Address is required."); return; }
    if (form.mobile.trim() && !validateMobile(form.mobile)) {
      setError("Enter a valid mobile number (10 digits, starting with 6–9).");
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
          mobile: form.mobile.trim() || null,
          avatar: form.avatar.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Failed to save changes.");
        return;
      }

      setSuccess(true);
      setEditing(false);
      setSnapshot(null);
      refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-[#1E6B5A]/20";
  const inputStyle = { background: CREAM, borderColor: "#C9A84C44", color: "#3D1515" };
  const labelClass = "block text-xs font-bold uppercase tracking-wider mb-1.5";
  const labelStyle = { color: "#5a3e3e" };

  return (
    <SellerLayout title="Seller Profile">
      <div className="max-w-2xl mx-auto space-y-5">

        {success && !editing && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm"
          >
            <CheckCircle size={15} /> Seller profile updated successfully.
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          {!editing ? (
            /* ── View mode ─────────────────────────────────────────────────── */
            <motion.div
              key="view"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              className="space-y-5"
            >
              {/* Profile header card */}
              <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6">
                <div className="flex items-start gap-5">
                  {/* Avatar */}
                  <div className="w-20 h-20 rounded-full border-2 overflow-hidden shrink-0" style={{ borderColor: `${GOLD}60`, background: CREAM }}>
                    {form.avatar ? (
                      <img src={form.avatar} alt="Profile photo" className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User size={28} style={{ color: GOLD }} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 pt-1">
                    <h2 className="font-serif text-xl font-bold leading-tight" style={{ color: MAROON }}>
                      {form.name || "—"}
                    </h2>
                    {form.tagline && (
                      <p className="text-sm text-gray-500 mt-0.5">{form.tagline}</p>
                    )}
                    {form.location && (
                      <p className="flex items-center gap-1 text-xs text-gray-400 mt-1.5">
                        <MapPin size={11} /> {form.location}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={startEdit}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all hover:border-[#1E6B5A] hover:text-[#1E6B5A]"
                    style={{ borderColor: "#D6C9BA", color: "#7a5f4e" }}
                  >
                    <Pencil size={12} /> Edit Profile
                  </button>
                </div>

                {form.bio && (
                  <p className="text-sm text-gray-600 leading-relaxed mt-4 pt-4 border-t" style={{ borderColor: `${GOLD}20` }}>
                    {form.bio}
                  </p>
                )}
              </div>

              {/* Contact & Business details */}
              <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6">
                <h3 className="font-serif font-bold text-sm mb-3" style={{ color: MAROON }}>Contact & Business</h3>
                <InfoRow icon={Mail} label="Email" value={form.contactEmail} />
                <InfoRow icon={Phone} label="Mobile Number" value={form.mobile} />
                <InfoRow icon={MapPin} label="Address" value={form.location} />
                <InfoRow icon={Building2} label="Goods and Services Tax Identification Number (GSTIN)" value={form.gstin} />
                {!form.contactEmail && !form.mobile && !form.gstin && (
                  <p className="text-xs text-gray-400 py-2">No contact or business details added yet.</p>
                )}
              </div>
            </motion.div>
          ) : (
            /* ── Edit mode ─────────────────────────────────────────────────── */
            <motion.form
              key="edit"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              {/* Profile photo */}
              <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6">
                <h3 className="font-serif font-bold text-sm mb-4" style={{ color: MAROON }}>Profile Photo</h3>
                <SingleAvatarUploader
                  currentAvatar={form.avatar}
                  disabled={saving}
                  onAvatarChange={(url) => { setForm((prev) => ({ ...prev, avatar: url })); setError(""); setSuccess(false); }}
                  onUploadingChange={setAvatarUploading}
                />
              </div>

              {/* Basic info */}
              <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6 space-y-4">
                <h3 className="font-serif font-bold text-sm" style={{ color: MAROON }}>Profile Details</h3>

                <div>
                  <label className={labelClass} style={labelStyle}>Business Name *</label>
                  <input type="text" name="name" value={form.name} onChange={handleChange}
                    placeholder="Your store name" required disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Tagline</label>
                  <input type="text" name="tagline" value={form.tagline} onChange={handleChange}
                    placeholder="A short description of your store" maxLength={120} disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Description</label>
                  <textarea name="bio" value={form.bio} onChange={handleChange as React.ChangeEventHandler<HTMLTextAreaElement>}
                    placeholder="Tell shoppers about your craft and heritage…"
                    rows={4} maxLength={800} disabled={busy}
                    className={`${inputClass} resize-none`} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Address *</label>
                  <input type="text" name="location" value={form.location} onChange={handleChange}
                    placeholder="e.g. Nashik, Maharashtra" required disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                </div>
              </div>

              {/* Business & contact */}
              <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-6 space-y-4">
                <h3 className="font-serif font-bold text-sm" style={{ color: MAROON }}>Business & Contact</h3>

                <div>
                  <label className={labelClass} style={labelStyle}>Email</label>
                  <input type="email" name="contactEmail" value={form.contactEmail} onChange={handleChange}
                    placeholder="orders@yourstore.com" disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>Mobile Number</label>
                  <input type="tel" name="mobile" value={form.mobile} onChange={handleChange}
                    placeholder="e.g. 9876543210" maxLength={10} disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                  <p className="text-[11px] text-gray-400 mt-1">10-digit Indian mobile number starting with 6, 7, 8, or 9</p>
                </div>

                <div>
                  <label className={labelClass} style={labelStyle}>
                    Goods and Services Tax Identification Number (GSTIN)
                  </label>
                  <input type="text" name="gstin" value={form.gstin} onChange={handleChange}
                    placeholder="22AAAAA0000A1Z5" maxLength={15} disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1, fontFamily: "monospace", letterSpacing: "0.04em" }} />
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle size={15} /> {error}
                </div>
              )}

              {avatarUploading && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-sm">
                  <Loader2 size={14} className="animate-spin" /> Uploading photo — please wait before saving…
                </div>
              )}

              <div className="flex items-center gap-3 pb-4">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 flex items-center justify-center gap-2 py-3 font-bold text-sm uppercase tracking-widest rounded-lg transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
                  style={{ background: MAROON, color: IVORY }}
                >
                  <Save size={15} />
                  {avatarUploading ? "Uploading photo…" : saving ? "Saving…" : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={busy}
                  title={avatarUploading ? "Wait for photo upload to finish" : undefined}
                  className="px-6 py-3 rounded-lg border text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderColor: "#D6C9BA", color: "#6b5b4e" }}
                >
                  Cancel
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </SellerLayout>
  );
}
