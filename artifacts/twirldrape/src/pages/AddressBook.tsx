import React, { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Plus, Edit2, Trash2, Check, Star, X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand",
  "Karnataka", "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur",
  "Meghalaya", "Mizoram", "Nagaland", "Odisha", "Punjab", "Rajasthan",
  "Sikkim", "Tamil Nadu", "Telangana", "Tripura", "Uttar Pradesh",
  "Uttarakhand", "West Bengal", "Delhi", "Jammu and Kashmir", "Ladakh",
  "Chandigarh", "Puducherry",
];

type SavedAddress = {
  id: string;
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
  createdAt: string;
};

type FormData = {
  name: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  pincode: string;
  isDefault: boolean;
};

const emptyForm: FormData = {
  name: "", phone: "", line1: "", line2: "",
  city: "", state: "", pincode: "", isDefault: false,
};

type PincodeStatus = { loading: boolean; available?: boolean; message?: string; zone?: string } | null;

function usePincodeCheck(pincode: string, base: string) {
  const [status, setStatus] = useState<PincodeStatus>(null);

  useEffect(() => {
    if (!/^\d{6}$/.test(pincode)) {
      setStatus(null);
      return;
    }
    setStatus({ loading: true });
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${base}/api/shipping/check?pincode=${pincode}`);
        const data = await res.json();
        setStatus({ loading: false, available: data.available, message: data.message, zone: data.zone });
      } catch {
        setStatus(null);
      }
    }, 500);
    return () => clearTimeout(t);
  }, [pincode, base]);

  return status;
}

function useGoogleAutocomplete(
  inputRef: React.RefObject<HTMLInputElement | null>,
  enabled: boolean,
  onSelect: (data: { city?: string; state?: string; pincode?: string }) => void
) {
  useEffect(() => {
    if (!enabled || !GMAPS_KEY) return;

    const scriptId = "google-maps-api";
    if (!document.getElementById(scriptId)) {
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GMAPS_KEY}&libraries=places&loading=async`;
      script.async = true;
      document.head.appendChild(script);
    }

    let autocomplete: any = null;

    const init = () => {
      const win = window as any;
      if (!inputRef.current || !win.google?.maps?.places) return;
      autocomplete = new win.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: "in" },
        fields: ["address_components"],
        types: ["address"],
      });
      autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (!place?.address_components) return;
        let city = "", state = "", pincode = "";
        for (const comp of place.address_components) {
          if (comp.types.includes("locality")) city = comp.long_name;
          if (comp.types.includes("administrative_area_level_1")) state = comp.long_name;
          if (comp.types.includes("postal_code")) pincode = comp.long_name;
        }
        onSelect({ city: city || undefined, state: state || undefined, pincode: pincode || undefined });
      });
    };

    const win = window as any;
    if (win.google?.maps?.places) {
      init();
    } else {
      const interval = setInterval(() => {
        if ((window as any).google?.maps?.places) {
          clearInterval(interval);
          init();
        }
      }, 300);
      return () => clearInterval(interval);
    }

    return () => {
      if (autocomplete && (window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(autocomplete);
      }
    };
  }, [enabled, inputRef, onSelect]);
}

function AddressForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: FormData;
  onSave: (data: FormData) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<FormData>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const line1Ref = useRef<HTMLInputElement>(null);

  const pincodeStatus = usePincodeCheck(form.pincode, BASE);

  const handlePlaceSelect = useCallback((data: { city?: string; state?: string; pincode?: string }) => {
    setForm(f => ({
      ...f,
      ...(data.city && { city: data.city }),
      ...(data.state && { state: data.state }),
      ...(data.pincode && { pincode: data.pincode }),
    }));
  }, []);

  useGoogleAutocomplete(line1Ref, true, handlePlaceSelect);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (form.name.trim().length < 2) e.name = "Name must be at least 2 characters";
    if (!/^\d{10}$/.test(form.phone.trim())) e.phone = "Enter a valid 10-digit phone number";
    if (form.line1.trim().length < 3) e.line1 = "Address line 1 is required";
    if (form.city.trim().length < 2) e.city = "City is required";
    if (!form.state) e.state = "Please select a state";
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = "Enter a valid 6-digit pincode";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function set(field: keyof FormData, value: string | boolean) {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => { const n = { ...e }; delete n[field]; return n; });
  }

  async function handleSubmit() {
    if (!validate()) return;
    await onSave(form);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="bg-white rounded-xl border border-[#C7CCD1]/20 p-6"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Full Name *</label>
          <input
            value={form.name}
            onChange={e => set("name", e.target.value)}
            placeholder="Priya Sharma"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors ${errors.name ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
          />
          {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Phone Number *</label>
          <input
            value={form.phone}
            onChange={e => set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            placeholder="9876543210"
            type="tel"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors ${errors.phone ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
          />
          {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Address Line 1 *
            {GMAPS_KEY && <span className="text-[10px] text-[#C7CCD1] ml-1 font-normal">(type to search)</span>}
          </label>
          <input
            ref={line1Ref}
            value={form.line1}
            onChange={e => set("line1", e.target.value)}
            placeholder="House / Flat / Block No., Street"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors ${errors.line1 ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
          />
          {errors.line1 && <p className="text-red-500 text-xs mt-1">{errors.line1}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Address Line 2</label>
          <input
            value={form.line2}
            onChange={e => set("line2", e.target.value)}
            placeholder="Area, Landmark (optional)"
            className="w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">City *</label>
          <input
            value={form.city}
            onChange={e => set("city", e.target.value)}
            placeholder="Mumbai"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors ${errors.city ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
          />
          {errors.city && <p className="text-red-500 text-xs mt-1">{errors.city}</p>}
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">State *</label>
          <select
            value={form.state}
            onChange={e => set("state", e.target.value)}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors ${errors.state ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
          >
            <option value="">Select State</option>
            {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {errors.state && <p className="text-red-500 text-xs mt-1">{errors.state}</p>}
        </div>

        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Pincode *</label>
          <input
            value={form.pincode}
            onChange={e => set("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="400001"
            maxLength={6}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors ${errors.pincode ? "border-red-400 bg-red-50" : "border-[#C7CCD1]/30"}`}
          />
          {errors.pincode && <p className="text-red-500 text-xs mt-1">{errors.pincode}</p>}
          {!errors.pincode && pincodeStatus && (
            <div className="flex items-center gap-1.5 mt-1.5">
              {pincodeStatus.loading ? (
                <><Loader2 size={12} className="animate-spin text-gray-400" /><span className="text-xs text-gray-400">Checking availability…</span></>
              ) : pincodeStatus.available ? (
                <><CheckCircle size={12} className="text-green-500" /><span className="text-xs text-green-600 font-medium">{pincodeStatus.message}</span></>
              ) : (
                <><XCircle size={12} className="text-red-400" /><span className="text-xs text-red-500">{pincodeStatus.message}</span></>
              )}
            </div>
          )}
        </div>

        <div className="sm:col-span-2">
          <label className="flex items-center gap-2.5 cursor-pointer group">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={e => set("isDefault", e.target.checked)}
              className="w-4 h-4 accent-[#0A1F44] cursor-pointer"
            />
            <span className="text-sm text-gray-600 group-hover:text-[#0A1F44] transition-colors">
              Set as default address
            </span>
          </label>
        </div>
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onCancel}
          className="flex-1 py-3 border border-[#C7CCD1]/40 text-[#0A1F44] font-bold uppercase tracking-wider text-sm rounded-sm hover:border-[#C7CCD1] transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-[2] bg-[#0A1F44] hover:bg-[#6a1826] disabled:opacity-60 text-[#F4F5F7] py-3 font-bold uppercase tracking-wider text-sm rounded-sm flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? (
            <><Loader2 size={14} className="animate-spin" /> Saving…</>
          ) : (
            <><Check size={14} /> Save Address</>
          )}
        </button>
      </div>
    </motion.div>
  );
}

export function AddressBookPage() {
  const [, setLocation] = useLocation();
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"list" | "add" | "edit">("list");
  const [editingAddress, setEditingAddress] = useState<SavedAddress | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [settingDefault, setSettingDefault] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isSignedIn) setLocation("/sign-in");
  }, [authLoading, isSignedIn, setLocation]);

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/addresses`);
      const data = await res.json();
      setAddresses(data.addresses ?? []);
    } catch {
      setError("Could not load your addresses. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && isSignedIn) fetchAddresses();
  }, [authLoading, isSignedIn, fetchAddresses]);

  async function handleSave(formData: FormData) {
    setSaving(true);
    setSaveError("");
    try {
      const isEdit = mode === "edit" && editingAddress;
      const url = isEdit ? `/api/addresses/${editingAddress.id}` : `/api/addresses`;
      const method = isEdit ? "PUT" : "POST";
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || "Failed to save address");
      }
      await fetchAddresses();
      setMode("list");
      setEditingAddress(null);
    } catch (err: any) {
      setSaveError(err.message || "Failed to save address");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await apiFetch(`/api/addresses/${id}`, { method: "DELETE" });
      setAddresses(prev => prev.filter(a => a.id !== id));
      setConfirmDeleteId(null);
    } catch {
    } finally {
      setDeleting(null);
    }
  }

  async function handleSetDefault(id: string) {
    setSettingDefault(id);
    try {
      const res = await apiFetch(`/api/addresses/${id}/default`, {
        method: "PATCH",
      });
      if (res.ok) {
        setAddresses(prev => prev.map(a => ({ ...a, isDefault: a.id === id })));
      }
    } catch {
    } finally {
      setSettingDefault(null);
    }
  }

  if (authLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin w-10 h-10 border-2 border-[#C7CCD1] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm opacity-60">Loading your addresses…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!isSignedIn) return null;

  const formInitial: FormData = mode === "edit" && editingAddress
    ? {
        name: editingAddress.name,
        phone: editingAddress.phone,
        line1: editingAddress.line1,
        line2: editingAddress.line2 ?? "",
        city: editingAddress.city,
        state: editingAddress.state,
        pincode: editingAddress.pincode,
        isDefault: editingAddress.isDefault,
      }
    : emptyForm;

  return (
    <DashboardLayout>
      <div>
        <div className="mb-6">
          <p className="text-sm text-gray-500">{addresses.length} saved address{addresses.length !== 1 ? "es" : ""}</p>
        </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-sm text-red-600">
              {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {(mode === "add" || mode === "edit") ? (
              <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="mb-4">
                  <h2 className="font-serif text-xl font-bold text-[#0A1F44]">
                    {mode === "edit" ? "Edit Address" : "Add New Address"}
                  </h2>
                </div>
                {saveError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-600">
                    {saveError}
                  </div>
                )}
                <AddressForm
                  initial={formInitial}
                  onSave={handleSave}
                  onCancel={() => { setMode("list"); setEditingAddress(null); setSaveError(""); }}
                  saving={saving}
                />
              </motion.div>
            ) : (
              <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="space-y-4 mb-6">
                  {addresses.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-4 py-16 bg-white rounded-xl border border-[#C7CCD1]/20">
                      <MapPin size={40} className="text-gray-200" />
                      <p className="text-gray-400 text-sm">No saved addresses yet.</p>
                    </div>
                  ) : (
                    addresses.map((addr, idx) => (
                      <motion.div
                        key={addr.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        className="bg-white rounded-xl border border-[#C7CCD1]/20 p-5"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2 mb-1">
                              <p className="font-bold text-[#3D1A1A] text-sm">{addr.name}</p>
                              {addr.isDefault && (
                                <span className="inline-flex items-center gap-1 text-[10px] bg-[#0A1F44] text-[#F4F5F7] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                                  <Star size={8} className="fill-current" /> Default
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mb-1">{addr.phone}</p>
                            <p className="text-sm text-gray-700 leading-relaxed">
                              {[addr.line1, addr.line2, addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}
                            </p>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-gray-100">
                          {!addr.isDefault && (
                            <button
                              onClick={() => handleSetDefault(addr.id)}
                              disabled={!!settingDefault}
                              className="flex items-center gap-1.5 text-xs font-semibold text-[#0A1F44] hover:text-[#C7CCD1] transition-colors disabled:opacity-50"
                            >
                              {settingDefault === addr.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Star size={12} />
                              )}
                              Set Default
                            </button>
                          )}
                          <button
                            onClick={() => { setEditingAddress(addr); setMode("edit"); setSaveError(""); }}
                            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-[#0A1F44] transition-colors ml-auto"
                          >
                            <Edit2 size={12} /> Edit
                          </button>
                          {confirmDeleteId === addr.id ? (
                            <div className="flex items-center gap-2 ml-2">
                              <span className="text-xs text-gray-500">Delete this address?</span>
                              <button
                                onClick={() => handleDelete(addr.id)}
                                disabled={deleting === addr.id}
                                className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors disabled:opacity-50"
                              >
                                {deleting === addr.id ? <Loader2 size={12} className="animate-spin inline" /> : "Yes, delete"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteId(addr.id)}
                              className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-red-500 transition-colors ml-2"
                            >
                              <Trash2 size={12} /> Delete
                            </button>
                          )}
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                <button
                  onClick={() => { setMode("add"); setSaveError(""); }}
                  className="w-full py-4 border-2 border-dashed border-[#C7CCD1]/40 rounded-xl text-sm font-bold text-[#0A1F44] hover:border-[#C7CCD1] hover:bg-[#C7CCD1]/5 transition-all flex items-center justify-center gap-2"
                >
                  <Plus size={16} /> Add New Address
                </button>

                <div className="mt-6 text-center">
                  <Link
                    href="/checkout"
                    className="text-sm text-[#0A1F44] font-semibold hover:text-[#C7CCD1] transition-colors"
                  >
                    ← Back to Checkout
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DashboardLayout>
  );
}
