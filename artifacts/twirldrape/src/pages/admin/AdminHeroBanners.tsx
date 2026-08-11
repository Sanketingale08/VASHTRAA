import React, { useEffect, useRef, useState } from "react";
import {
  Loader2, Upload, Trash2, Image, GripVertical, Eye, EyeOff, Plus, Star, X,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { HeroBannerSlider } from "@/components/HeroBannerSlider";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

interface HeroBanner {
  id: string;
  imageUrl: string;
  title: string | null;
  displayOrder: number;
  isActive: boolean;
  isDefault: boolean;
  slideIntervalMs: number;
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg text-sm font-medium shadow-lg ${
        ok ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
      }`}
    >
      {msg}
    </div>
  );
}

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4">
        <p className="text-sm text-gray-700 mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700">
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ banners, onClose }: { banners: HeroBanner[]; onClose: () => void }) {
  const active = banners.filter((b) => b.isActive);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
      <div className="relative rounded-xl overflow-hidden shadow-2xl" style={{ width: 640, height: 420 }}>
        <HeroBannerSlider
          banners={active.map((b) => ({
            id: b.id,
            imageUrl: `${basePath}${b.imageUrl}`,
            slideIntervalMs: b.slideIntervalMs,
          }))}
          fallbackSrc="/images/home-paithani.png"
          style={{ width: "100%", height: "100%" }}
        />
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-black/50 text-white hover:bg-black/70"
        >
          <X size={14} />
        </button>
        {active.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
            No active banners — showing fallback image
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminHeroBanners() {
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  const [banners, setBanners] = useState<HeroBanner[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [globalIntervalSec, setGlobalIntervalSec] = useState(6);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const pendingReorder = useRef<string[] | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  }

  async function fetchBanners() {
    try {
      const r = await fetch(`/api/admin/hero-banners`, {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (r.ok) setBanners(await r.json());
    } finally {
      setLoading(false);
    }
  }

  async function fetchSettings() {
    try {
      const r = await fetch(`/api/admin/hero-settings`, {
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (r.ok) {
        const { globalIntervalMs } = await r.json();
        setGlobalIntervalSec(Math.round(globalIntervalMs / 1000));
      }
    } catch {}
  }

  useEffect(() => {
    fetchBanners();
    fetchSettings();
  }, []);

  async function saveGlobalInterval() {
    if (inFlight.current.has("saveGlobal")) return;
    inFlight.current.add("saveGlobal");
    setSavingGlobal(true);
    try {
      const ms = Math.max(2, Math.min(30, globalIntervalSec)) * 1000;
      const r = await fetch(`/api/admin/hero-settings`, {
        method: "PUT",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify({ globalIntervalMs: ms }),
        credentials: "include",
      });
      if (r.ok) showToast("Default slide duration saved.", true);
      else showToast("Failed to save settings.", false);
    } catch {
      showToast("Network error.", false);
    } finally {
      inFlight.current.delete("saveGlobal");
      setSavingGlobal(false);
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (inFlight.current.has("upload")) return;
    inFlight.current.add("upload");
    setUploading(true);
    try {
      const uploadRes = await fetch(`/api/admin/upload/hero-image`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": file.type },
        body: file,
        credentials: "include",
      });
      if (!uploadRes.ok) {
        const err = await uploadRes.json().catch(() => ({}));
        showToast(err.error || "Upload failed.", false);
        return;
      }
      const { publicUrl } = await uploadRes.json();
      const globalMs = Math.max(2, Math.min(30, globalIntervalSec)) * 1000;
      const createRes = await fetch(`/api/admin/hero-banners`, {
        method: "POST",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify({ imageUrl: publicUrl, slideIntervalMs: globalMs }),
        credentials: "include",
      });
      if (!createRes.ok) {
        showToast("Image uploaded but failed to save banner.", false);
        return;
      }
      const newBanner = await createRes.json();
      setBanners((prev) => [...prev, newBanner]);
      showToast("Banner added successfully.", true);
    } catch {
      showToast("Network error.", false);
    } finally {
      inFlight.current.delete("upload");
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function toggleActive(id: string, current: boolean) {
    const key = id + "toggleActive";
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const r = await fetch(`/api/admin/hero-banners/${id}`, {
        method: "PATCH",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !current }),
        credentials: "include",
      });
      if (r.ok) {
        const updated = await r.json();
        setBanners((prev) => prev.map((b) => (b.id === id ? updated : b)));
      }
    } catch {
      showToast("Failed to update banner.", false);
    } finally {
      inFlight.current.delete(key);
    }
  }

  async function setAsDefault(id: string, currentIsDefault: boolean) {
    const key = id + "setDefault";
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const r = await fetch(`/api/admin/hero-banners/${id}`, {
        method: "PATCH",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify({ isDefault: !currentIsDefault }),
        credentials: "include",
      });
      if (r.ok) {
        const updated = await r.json();
        setBanners((prev) =>
          prev.map((b) => {
            if (b.id === id) return updated;
            if (!currentIsDefault) return { ...b, isDefault: false };
            return b;
          }),
        );
        showToast(currentIsDefault ? "Default cleared." : "Set as default banner.", true);
      }
    } catch {
      showToast("Failed to update.", false);
    } finally {
      inFlight.current.delete(key);
    }
  }

  async function updateField(id: string, field: "title" | "slideIntervalMs", value: string | number) {
    const key = id + field;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const r = await fetch(`/api/admin/hero-banners/${id}`, {
        method: "PATCH",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
        credentials: "include",
      });
      if (r.ok) {
        const updated = await r.json();
        setBanners((prev) => prev.map((b) => (b.id === id ? updated : b)));
        showToast("Saved.", true);
      }
    } catch {
      showToast("Failed to update.", false);
    } finally {
      inFlight.current.delete(key);
    }
  }

  async function handleDelete(id: string) {
    const key = id + "delete";
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    try {
      const r = await fetch(`/api/admin/hero-banners/${id}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (r.ok) {
        setBanners((prev) => prev.filter((b) => b.id !== id));
        showToast("Banner deleted.", true);
      }
    } catch {
      showToast("Failed to delete.", false);
    } finally {
      inFlight.current.delete(key);
      setConfirmDelete(null);
    }
  }

  function handleDragStart(id: string) {
    setDragId(id);
  }

  function handleDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const fromIdx = banners.findIndex((b) => b.id === dragId);
    const toIdx = banners.findIndex((b) => b.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const reordered = [...banners];
    const [moved] = reordered.splice(fromIdx, 1);
    reordered.splice(toIdx, 0, moved);
    setBanners(reordered);
  }

  async function submitReorder(ids: string[]): Promise<void> {
    inFlight.current.add("reorder");
    try {
      await fetch(`/api/admin/hero-banners/reorder`, {
        method: "PUT",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
    } catch {
      showToast("Failed to save order.", false);
    } finally {
      inFlight.current.delete("reorder");
      const pending = pendingReorder.current;
      if (pending) {
        pendingReorder.current = null;
        await submitReorder(pending);
      }
    }
  }

  function handleDragEnd() {
    setDragId(null);
    const ids = banners.map((b) => b.id);
    if (inFlight.current.has("reorder")) {
      // Queue the latest ordering; will be submitted after current request finishes
      pendingReorder.current = ids;
      return;
    }
    submitReorder(ids);
  }

  if (loading) {
    return (
      <AdminGuard>
        <AdminLayout>
          <div className="flex items-center justify-center py-24">
            <Loader2 className="animate-spin w-6 h-6 text-gray-400" />
          </div>
        </AdminLayout>
      </AdminGuard>
    );
  }

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="max-w-3xl mx-auto space-y-6">
          {toast && <Toast msg={toast.msg} ok={toast.ok} />}
          {confirmDelete && (
            <ConfirmDialog
              message="Are you sure you want to delete this banner? This cannot be undone."
              onConfirm={() => handleDelete(confirmDelete)}
              onCancel={() => setConfirmDelete(null)}
            />
          )}
          {previewOpen && (
            <PreviewModal banners={banners} onClose={() => setPreviewOpen(false)} />
          )}

          {/* ── Header ── */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Hero Banner Slider</h1>
            </div>
            <div className="flex items-center gap-2">
              {banners.length > 0 && (
                <button
                  onClick={() => setPreviewOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
                >
                  <Eye size={14} />
                  Preview
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-60"
                style={{ background: NAVY }}
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                {uploading ? "Uploading…" : "Add Banner"}
              </button>
            </div>
          </div>

          {/* ── Global default slide duration ── */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="text-sm font-bold text-gray-700 border-b border-gray-100 pb-3 mb-4">
              Default Slide Duration
            </h2>
            <p className="text-xs text-gray-400 mb-3">
              New banners are created with this duration. You can also override it per-banner below.
            </p>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={2}
                max={30}
                value={globalIntervalSec}
                onChange={(e) => setGlobalIntervalSec(Number(e.target.value))}
                className="w-20 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
              />
              <span className="text-sm text-gray-500">seconds</span>
              <button
                onClick={saveGlobalInterval}
                disabled={savingGlobal}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: NAVY }}
              >
                {savingGlobal ? <Loader2 size={13} className="animate-spin" /> : null}
                Save
              </button>
            </div>
          </div>

          {/* ── Banner list or empty state ── */}
          {banners.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <div className="flex items-center justify-center mb-4">
                <div
                  className="w-14 h-14 rounded-full flex items-center justify-center"
                  style={{ background: GOLD + "18" }}
                >
                  <Image size={24} style={{ color: GOLD }} />
                </div>
              </div>
              <p className="text-sm font-semibold text-gray-700 mb-1">No banners yet</p>
              <p className="text-xs text-gray-400 mb-4">
                The homepage will show the default saree image until at least one active banner is added.
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: NAVY }}
              >
                <Upload size={14} />
                Upload Image
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 px-1">
                Drag rows to reorder.{" "}
                <span style={{ color: GOLD }}>★</span> marks the default banner shown first on each page load.
              </p>
              {banners.map((banner) => (
                <div
                  key={banner.id}
                  draggable
                  onDragStart={() => handleDragStart(banner.id)}
                  onDragOver={(e) => handleDragOver(e, banner.id)}
                  onDragEnd={handleDragEnd}
                  className="bg-white rounded-xl border border-gray-200 p-4 flex gap-4 items-start"
                  style={{ opacity: dragId === banner.id ? 0.5 : 1, cursor: "grab" }}
                >
                  <div className="flex items-center justify-center mt-1 text-gray-300 shrink-0">
                    <GripVertical size={16} />
                  </div>
                  <div
                    className="rounded-lg overflow-hidden shrink-0 bg-gray-100 relative"
                    style={{ width: 100, height: 70 }}
                  >
                    <img
                      src={`${basePath}${banner.imageUrl}`}
                      alt={banner.title ?? "Banner"}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = "/images/home-paithani.png";
                      }}
                    />
                    {banner.isDefault && (
                      <span
                        className="absolute bottom-1 left-1 text-[10px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: GOLD, color: "#1a1a1a" }}
                      >
                        DEFAULT
                      </span>
                    )}
                  </div>
                  <div className="flex-1 space-y-2 min-w-0">
                    <BannerTextField
                      label="Title (optional)"
                      value={banner.title ?? ""}
                      onSave={(v) => updateField(banner.id, "title", v)}
                    />
                    <IntervalField
                      value={banner.slideIntervalMs}
                      onSave={(v) => updateField(banner.id, "slideIntervalMs", v)}
                    />
                  </div>
                  <div className="flex flex-col items-center gap-2 shrink-0">
                    <button
                      title={banner.isDefault ? "Remove default" : "Set as default (shown first)"}
                      onClick={() => setAsDefault(banner.id, banner.isDefault)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{
                        background: banner.isDefault ? "#FEF9C3" : "#F3F4F6",
                        color: banner.isDefault ? "#CA8A04" : "#9CA3AF",
                      }}
                    >
                      <Star size={14} fill={banner.isDefault ? "#CA8A04" : "none"} />
                    </button>
                    <button
                      title={banner.isActive ? "Deactivate" : "Activate"}
                      onClick={() => toggleActive(banner.id, banner.isActive)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{
                        background: banner.isActive ? "#D1FAE5" : "#F3F4F6",
                        color: banner.isActive ? "#059669" : "#9CA3AF",
                      }}
                    >
                      {banner.isActive ? <Eye size={14} /> : <EyeOff size={14} />}
                    </button>
                    <button
                      title="Delete"
                      onClick={() => setConfirmDelete(banner.id)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-400 hover:bg-red-100 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
            <p className="text-xs text-amber-700 font-medium mb-1">How it works</p>
            <ul className="text-xs text-amber-600 space-y-1 list-disc list-inside">
              <li>Active banners are shown in the hero section with crossfade + Ken Burns zoom.</li>
              <li>The <strong>default</strong> banner (★) is shown first on every page load.</li>
              <li>Slide duration is configurable per banner; new banners use the default above.</li>
              <li>If no active banners exist, the classic saree model photo is shown as fallback.</li>
            </ul>
          </div>
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}

function BannerTextField({
  label,
  value,
  onSave,
}: {
  label: string;
  value: string;
  onSave: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  useEffect(() => setLocal(value), [value]);
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
        {label}
      </label>
      <input
        className="w-full border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => local !== value && onSave(local)}
        onKeyDown={(e) => e.key === "Enter" && onSave(local)}
        placeholder="Optional label for this banner"
      />
    </div>
  );
}

function IntervalField({ value, onSave }: { value: number; onSave: (v: number) => void }) {
  const [local, setLocal] = useState(String(Math.round(value / 1000)));
  useEffect(() => setLocal(String(Math.round(value / 1000))), [value]);
  return (
    <div>
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">
        Slide duration (seconds)
      </label>
      <input
        type="number"
        min={2}
        max={30}
        className="w-24 border border-gray-200 rounded-md px-2.5 py-1.5 text-xs text-gray-800 focus:outline-none focus:ring-1 focus:ring-amber-400"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const n = Math.max(2, Math.min(30, Number(local) || 6));
          setLocal(String(n));
          if (n * 1000 !== value) onSave(n * 1000);
        }}
      />
    </div>
  );
}
