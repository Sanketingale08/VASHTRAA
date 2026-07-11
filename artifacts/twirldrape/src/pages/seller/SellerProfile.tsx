import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Save, Camera, AlertCircle, CheckCircle, Upload, X, ImagePlus, Loader2 } from "lucide-react";
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
  avatar: string;
}

interface UploadedImage {
  id: string;
  previewUrl: string;
  publicRelPath: string | null;
  uploading: boolean;
  error: string | null;
}

function AvatarUploader({
  currentAvatar,
  onAvatarChange,
}: {
  currentAvatar: string;
  onAvatarChange: (url: string) => void;
}) {
  const [images, setImages] = useState<UploadedImage[]>(() =>
    currentAvatar
      ? [{ id: "existing", previewUrl: currentAvatar, publicRelPath: currentAvatar, uploading: false, error: null }]
      : [],
  );
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (currentAvatar && images.length === 0) {
      setImages([{ id: "existing", previewUrl: currentAvatar, publicRelPath: currentAvatar, uploading: false, error: null }]);
    }
  }, [currentAvatar]);

  async function uploadFile(file: File) {
    if (!file.type.startsWith("image/")) return;
    const localId = crypto.randomUUID();
    const previewUrl = URL.createObjectURL(file);
    const entry: UploadedImage = { id: localId, previewUrl, publicRelPath: null, uploading: true, error: null };
    setImages((prev) => [...prev, entry]);

    try {
      const res = await fetch(getApiUrl("/api/seller/upload/avatar"), {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setImages((prev) =>
          prev.map((img) => img.id === localId ? { ...img, uploading: false, error: err.error || "Upload failed" } : img),
        );
        return;
      }
      const { publicRelPath } = await res.json();
      const fullUrl = getApiUrl(publicRelPath);
      setImages((prev) =>
        prev.map((img) =>
          img.id === localId ? { ...img, uploading: false, publicRelPath: fullUrl, previewUrl: fullUrl } : img,
        ),
      );
      onAvatarChange(fullUrl);
    } catch {
      setImages((prev) =>
        prev.map((img) => img.id === localId ? { ...img, uploading: false, error: "Network error" } : img),
      );
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    Array.from(files).forEach(uploadFile);
  }

  function removeImage(id: string) {
    setImages((prev) => {
      const remaining = prev.filter((img) => img.id !== id);
      const last = remaining.filter((img) => img.publicRelPath)[remaining.filter((img) => img.publicRelPath).length - 1];
      onAvatarChange(last?.publicRelPath ?? "");
      return remaining;
    });
  }

  function selectAsAvatar(url: string) {
    onAvatarChange(url);
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setDragging(true); }, []);
  const onDragLeave = useCallback(() => setDragging(false), []);

  const activeAvatar = images.filter((img) => img.publicRelPath).slice(-1)[0]?.publicRelPath ?? "";

  return (
    <div className="space-y-4">
      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <div
          className="w-20 h-20 rounded-2xl border-2 overflow-hidden shrink-0 flex items-center justify-center"
          style={{ borderColor: `${GOLD}50`, background: CREAM }}
        >
          {activeAvatar ? (
            <img
              src={activeAvatar}
              alt="Store avatar"
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
            />
          ) : (
            <Camera size={28} style={{ color: GOLD }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: MAROON }}>Store Avatar</p>
          <p className="text-xs text-gray-400 mt-0.5">Square image, min 200×200px recommended.</p>
        </div>
      </div>

      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileRef.current?.click()}
        className="relative rounded-xl border-2 border-dashed cursor-pointer transition-all flex flex-col items-center justify-center gap-2 py-7 px-4 text-center select-none"
        style={{
          borderColor: dragging ? GOLD : `${GOLD}55`,
          background: dragging ? `${GOLD}10` : CREAM,
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center mb-1"
          style={{ background: `${GOLD}20` }}
        >
          <ImagePlus size={20} style={{ color: GOLD }} />
        </div>
        <p className="text-sm font-semibold" style={{ color: MAROON }}>
          {dragging ? "Drop image here" : "Drag & drop or click to browse"}
        </p>
        <p className="text-xs text-gray-400">PNG, JPG, WebP · max 5 MB</p>
      </div>

      {/* Image grid — previews */}
      {images.length > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {images.map((img) => {
            const isActive = img.publicRelPath === activeAvatar;
            return (
              <div
                key={img.id}
                className="relative group rounded-xl overflow-hidden aspect-square"
                style={{
                  background: CREAM,
                  outline: isActive ? `2.5px solid ${GOLD}` : "2.5px solid transparent",
                }}
              >
                <img
                  src={img.previewUrl}
                  alt="Avatar preview"
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
                />

                {/* Uploading overlay */}
                {img.uploading && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                    <Loader2 size={22} className="animate-spin text-white" />
                  </div>
                )}

                {/* Error overlay */}
                {img.error && (
                  <div className="absolute inset-0 bg-red-900/70 flex flex-col items-center justify-center gap-1 p-1">
                    <AlertCircle size={16} className="text-white" />
                    <p className="text-[10px] text-white text-center leading-tight">{img.error}</p>
                  </div>
                )}

                {/* Hover controls */}
                {!img.uploading && !img.error && (
                  <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5">
                    {!isActive && img.publicRelPath && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); selectAsAvatar(img.publicRelPath!); }}
                        className="text-[10px] font-bold text-white bg-green-600 rounded px-2 py-0.5"
                      >
                        Use this
                      </button>
                    )}
                  </div>
                )}

                {/* Active badge */}
                {isActive && !img.uploading && (
                  <div
                    className="absolute bottom-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: GOLD, color: "#1a1a1a" }}
                  >
                    ACTIVE
                  </div>
                )}

                {/* Remove button */}
                {!img.uploading && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeImage(img.id); }}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-white hover:bg-red-600"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Add more tile */}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl aspect-square border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors hover:border-[#C9A84C]"
            style={{ borderColor: `${GOLD}40`, background: CREAM }}
          >
            <Upload size={16} style={{ color: GOLD }} />
            <span className="text-[10px] font-semibold" style={{ color: GOLD }}>Add</span>
          </button>
        </div>
      )}
    </div>
  );
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
            <AvatarUploader
              currentAvatar={form.avatar}
              onAvatarChange={(url) => {
                setForm((prev) => ({ ...prev, avatar: url }));
                setError("");
                setSuccess(false);
              }}
            />
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
