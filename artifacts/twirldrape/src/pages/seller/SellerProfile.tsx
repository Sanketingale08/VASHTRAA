import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Camera, AlertCircle, CheckCircle, X, Loader2, Pencil, Phone, Mail, MapPin, Building2, FileText, User, Home, Package } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#0A1F44";
const IVORY = "#F4F5F7";
const CREAM = "#E5E8EC";
const GOLD = "#C7CCD1";

interface AddressFields {
  addressLine1: string; // maps to shopStreet (backward compat)
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface PickupFields {
  locationName: string;
  addressLine1: string;
  addressLine2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
}

interface FormState {
  name: string;
  tagline: string;
  bio: string;
  location: string;
  gstin: string;
  contactEmail: string;
  mobile: string;
  avatar: string;
  // Shop address
  shopAddress: AddressFields;
  // Pickup address
  pickupSameAsShop: boolean;
  pickupAddress: PickupFields;
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

// ── Address card for view mode ─────────────────────────────────────────────────
interface AddressCardProps {
  title: string;
  icon: React.ElementType;
  lines: string[];
  badge?: string;
}

function AddressCard({ title, icon: Icon, lines, badge }: AddressCardProps) {
  const nonEmpty = lines.filter(Boolean);
  if (nonEmpty.length === 0) return null;
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: `${GOLD}20`, background: `${CREAM}80` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: `${MAROON}15` }}>
          <Icon size={12} style={{ color: MAROON }} />
        </div>
        <p className="text-xs font-bold uppercase tracking-wider" style={{ color: MAROON }}>{title}</p>
        {badge && (
          <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ background: `${GOLD}25`, color: "#7a5c1e" }}>
            {badge}
          </span>
        )}
      </div>
      <div className="space-y-0.5 pl-8">
        {nonEmpty.map((line, i) => (
          <p key={i} className="text-sm leading-snug" style={{ color: "#3d2b1f" }}>{line}</p>
        ))}
      </div>
    </div>
  );
}

// ── Address input group (reusable for shop + pickup) ──────────────────────────
interface AddressInputGroupProps {
  prefix: string;
  label: string;
  values: { addressLine1: string; addressLine2: string; landmark: string; city: string; state: string; pincode: string; country: string };
  onChange: (field: string, value: string) => void;
  disabled: boolean;
  requireLine1?: boolean;
  requireCity?: boolean;
  requireState?: boolean;
  requirePincode?: boolean;
}

function AddressInputGroup({ prefix, label, values, onChange, disabled, requireLine1, requireCity, requireState, requirePincode }: AddressInputGroupProps) {
  const inputClass = "w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-[#0A1F44]/20";
  const inputStyle = { background: CREAM, borderColor: "#C7CCD144", color: "#0A1F44" };
  const labelClass = "block text-xs font-bold uppercase tracking-wider mb-1.5";
  const labelStyle = { color: "#5a3e3e" };
  const opacity = { opacity: disabled ? 0.6 : 1 };

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`${prefix}-address-line-1`} className={labelClass} style={labelStyle}>
          Address Line 1{requireLine1 ? " *" : ""}
          <span className="normal-case font-normal tracking-normal ml-1 text-gray-400">(Street / House No.)</span>
        </label>
        <input
          id={`${prefix}-address-line-1`}
          type="text"
          value={values.addressLine1}
          onChange={(e) => onChange("addressLine1", e.target.value)}
          placeholder="e.g. Plot 12, Gandhi Marg"
          disabled={disabled}
          className={inputClass}
          style={{ ...inputStyle, ...opacity }}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-address-line-2`} className={labelClass} style={labelStyle}>Address Line 2</label>
        <input
          id={`${prefix}-address-line-2`}
          type="text"
          value={values.addressLine2}
          onChange={(e) => onChange("addressLine2", e.target.value)}
          placeholder="Apartment, floor, building name (optional)"
          disabled={disabled}
          className={inputClass}
          style={{ ...inputStyle, ...opacity }}
        />
      </div>

      <div>
        <label htmlFor={`${prefix}-landmark`} className={labelClass} style={labelStyle}>Landmark</label>
        <input
          id={`${prefix}-landmark`}
          type="text"
          value={values.landmark}
          onChange={(e) => onChange("landmark", e.target.value)}
          placeholder="e.g. Near City Hospital"
          disabled={disabled}
          className={inputClass}
          style={{ ...inputStyle, ...opacity }}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${prefix}-city`} className={labelClass} style={labelStyle}>City{requireCity ? " *" : ""}</label>
          <input
            id={`${prefix}-city`}
            type="text"
            value={values.city}
            onChange={(e) => onChange("city", e.target.value)}
            placeholder="e.g. Nashik"
            disabled={disabled}
            className={inputClass}
            style={{ ...inputStyle, ...opacity }}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-state`} className={labelClass} style={labelStyle}>State{requireState ? " *" : ""}</label>
          <input
            id={`${prefix}-state`}
            type="text"
            value={values.state}
            onChange={(e) => onChange("state", e.target.value)}
            placeholder="e.g. Maharashtra"
            disabled={disabled}
            className={inputClass}
            style={{ ...inputStyle, ...opacity }}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor={`${prefix}-pincode`} className={labelClass} style={labelStyle}>PIN Code{requirePincode ? " *" : ""}</label>
          <input
            id={`${prefix}-pincode`}
            type="text"
            value={values.pincode}
            onChange={(e) => onChange("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6-digit PIN"
            maxLength={6}
            disabled={disabled}
            className={inputClass}
            style={{ ...inputStyle, ...opacity, fontFamily: "monospace" }}
          />
        </div>
        <div>
          <label htmlFor={`${prefix}-country`} className={labelClass} style={labelStyle}>Country</label>
          <input
            id={`${prefix}-country`}
            type="text"
            value={values.country}
            onChange={(e) => onChange("country", e.target.value)}
            placeholder="India"
            disabled={disabled}
            className={inputClass}
            style={{ ...inputStyle, ...opacity }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatAddressLines(fields: AddressFields): string[] {
  const parts: string[] = [];
  if (fields.addressLine1) parts.push(fields.addressLine1);
  if (fields.addressLine2) parts.push(fields.addressLine2);
  if (fields.landmark) parts.push(fields.landmark);
  const cityStateParts: string[] = [];
  if (fields.city) cityStateParts.push(fields.city);
  if (fields.state) cityStateParts.push(fields.state);
  if (fields.pincode) cityStateParts.push(fields.pincode);
  if (cityStateParts.length > 0) parts.push(cityStateParts.join(", "));
  if (fields.country) parts.push(fields.country);
  return parts;
}

function formatPickupAddressLines(fields: PickupFields): string[] {
  const parts: string[] = [];
  if (fields.addressLine1) parts.push(fields.addressLine1);
  if (fields.addressLine2) parts.push(fields.addressLine2);
  if (fields.landmark) parts.push(fields.landmark);
  const cityStateParts: string[] = [];
  if (fields.city) cityStateParts.push(fields.city);
  if (fields.state) cityStateParts.push(fields.state);
  if (fields.pincode) cityStateParts.push(fields.pincode);
  if (cityStateParts.length > 0) parts.push(cityStateParts.join(", "));
  if (fields.country) parts.push(fields.country);
  return parts;
}

function shopToPickupFields(shop: AddressFields, locationName: string): PickupFields {
  return {
    locationName,
    addressLine1: shop.addressLine1,
    addressLine2: shop.addressLine2,
    landmark: shop.landmark,
    city: shop.city,
    state: shop.state,
    pincode: shop.pincode,
    country: shop.country,
  };
}

const emptyAddress: AddressFields = {
  addressLine1: "", addressLine2: "", landmark: "", city: "", state: "", pincode: "", country: "",
};

const emptyPickup: PickupFields = {
  locationName: "", addressLine1: "", addressLine2: "", landmark: "", city: "", state: "", pincode: "", country: "",
};

// ── Main component ────────────────────────────────────────────────────────────
export default function SellerProfile() {
  const { vendor, refresh } = useSellerContext();
  const [form, setForm] = useState<FormState>({
    name: "", tagline: "", bio: "", location: "",
    gstin: "", contactEmail: "", mobile: "", avatar: "",
    shopAddress: { ...emptyAddress },
    pickupSameAsShop: false,
    pickupAddress: { ...emptyPickup },
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
        shopAddress: {
          addressLine1: vendor.shopStreet ?? "",
          addressLine2: vendor.shopAddressLine2 ?? "",
          landmark: vendor.shopLandmark ?? "",
          city: vendor.shopCity ?? "",
          state: vendor.shopState ?? "",
          pincode: vendor.shopPincode ?? "",
          country: vendor.shopCountry ?? "",
        },
        pickupSameAsShop: vendor.pickupSameAsShop ?? false,
        pickupAddress: {
          locationName: vendor.pickupLocationName ?? "",
          addressLine1: vendor.pickupAddressLine1 ?? "",
          addressLine2: vendor.pickupAddressLine2 ?? "",
          landmark: vendor.pickupLandmark ?? "",
          city: vendor.pickupCity ?? "",
          state: vendor.pickupState ?? "",
          pincode: vendor.pickupPincode ?? "",
          country: vendor.pickupCountry ?? "",
        },
      };
      setForm(loaded);
    }
  }, [vendor]);

  function startEdit() {
    setSnapshot({ ...form, shopAddress: { ...form.shopAddress }, pickupAddress: { ...form.pickupAddress } });
    setError("");
    setSuccess(false);
    setEditing(true);
  }

  function cancelEdit() {
    if (avatarUploading) return;
    if (snapshot) setForm(snapshot);
    setError("");
    setEditing(false);
  }

  const busy = saving || avatarUploading;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
    setSuccess(false);
  }

  function handleShopAddressChange(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      shopAddress: { ...prev.shopAddress, [field]: value },
    }));
    setError("");
    setSuccess(false);
  }

  function handlePickupAddressChange(field: string, value: string) {
    setForm((prev) => ({
      ...prev,
      pickupAddress: { ...prev.pickupAddress, [field]: value },
    }));
    setError("");
    setSuccess(false);
  }

  function handlePickupSameAsShopChange(e: React.ChangeEvent<HTMLInputElement>) {
    setForm((prev) => ({ ...prev, pickupSameAsShop: e.target.checked }));
    setError("");
    setSuccess(false);
  }

  function validateMobile(mobile: string) {
    if (!mobile.trim()) return true;
    return /^[6-9]\d{9}$/.test(mobile.trim());
  }

  function validatePincode(pin: string) {
    if (!pin.trim()) return true;
    return /^\d{6}$/.test(pin.trim());
  }

  // Derive effective pickup address at save/display time
  function getEffectivePickup(): PickupFields {
    if (form.pickupSameAsShop) {
      return shopToPickupFields(form.shopAddress, form.pickupAddress.locationName || form.name);
    }
    return form.pickupAddress;
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
    if (form.shopAddress.pincode && !validatePincode(form.shopAddress.pincode)) {
      setError("Shop PIN code must be exactly 6 digits.");
      return;
    }
    const effectivePickup = getEffectivePickup();
    if (!form.pickupSameAsShop && effectivePickup.pincode && !validatePincode(effectivePickup.pincode)) {
      setError("Pickup PIN code must be exactly 6 digits.");
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
          // Shop address
          shopStreet: form.shopAddress.addressLine1.trim() || null,
          shopAddressLine2: form.shopAddress.addressLine2.trim() || null,
          shopLandmark: form.shopAddress.landmark.trim() || null,
          shopCity: form.shopAddress.city.trim() || null,
          shopState: form.shopAddress.state.trim() || null,
          shopPincode: form.shopAddress.pincode.trim() || null,
          shopCountry: form.shopAddress.country.trim() || null,
          // Pickup
          pickupSameAsShop: form.pickupSameAsShop,
          pickupLocationName: effectivePickup.locationName?.trim() || null,
          pickupAddressLine1: effectivePickup.addressLine1?.trim() || null,
          pickupAddressLine2: effectivePickup.addressLine2?.trim() || null,
          pickupLandmark: effectivePickup.landmark?.trim() || null,
          pickupCity: effectivePickup.city?.trim() || null,
          pickupState: effectivePickup.state?.trim() || null,
          pickupPincode: effectivePickup.pincode?.trim() || null,
          pickupCountry: effectivePickup.country?.trim() || null,
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

  const inputClass = "w-full px-4 py-2.5 rounded-lg border text-sm outline-none transition focus:ring-2 focus:ring-[#0A1F44]/20";
  const inputStyle = { background: CREAM, borderColor: "#C7CCD144", color: "#0A1F44" };
  const labelClass = "block text-xs font-bold uppercase tracking-wider mb-1.5";
  const labelStyle = { color: "#5a3e3e" };

  // Derived for view mode
  const shopAddressLines = formatAddressLines(form.shopAddress);
  const effectivePickupForDisplay = form.pickupSameAsShop
    ? shopToPickupFields(form.shopAddress, form.pickupAddress.locationName || form.name)
    : form.pickupAddress;
  const pickupAddressLines = formatPickupAddressLines(effectivePickupForDisplay);

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
              <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6">
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
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold transition-all hover:border-[#0A1F44] hover:text-[#0A1F44]"
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

              {/* Vendor ID — read-only, always shown */}
              {vendor && (
                <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6">
                  <h3 className="font-serif font-bold text-sm mb-3" style={{ color: MAROON }}>Account</h3>
                  <div className="flex items-start gap-3 py-3" style={{ borderColor: `${GOLD}20` }}>
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${MAROON}12` }}>
                      <FileText size={13} style={{ color: MAROON }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: "#9a8070" }}>Vendor ID</p>
                      {vendor.vendorId ? (
                        <p className="text-sm font-semibold font-mono" style={{ color: "#2d1f14" }}>{vendor.vendorId}</p>
                      ) : (
                        <p className="text-sm italic" style={{ color: "#bfae9e" }}>
                          {vendor.status === "approved" ? "Not Generated (legacy account)" : "Not Generated"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Contact & Business details */}
              <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6">
                <h3 className="font-serif font-bold text-sm mb-3" style={{ color: MAROON }}>Contact & Business</h3>
                <InfoRow icon={Mail} label="Email" value={form.contactEmail} />
                <InfoRow icon={Phone} label="Mobile Number" value={form.mobile} />
                <InfoRow icon={MapPin} label="Address" value={form.location} />
                <InfoRow icon={Building2} label="Goods and Services Tax Identification Number (GSTIN)" value={form.gstin} />
                {!form.contactEmail && !form.mobile && !form.gstin && (
                  <p className="text-xs text-gray-400 py-2">No contact or business details added yet.</p>
                )}
              </div>

              {/* Shop & Pickup address cards */}
              {(shopAddressLines.length > 0 || pickupAddressLines.length > 0) && (
                <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6">
                  <h3 className="font-serif font-bold text-sm mb-4" style={{ color: MAROON }}>Addresses</h3>
                  <div className="space-y-3">
                    {shopAddressLines.length > 0 && (
                      <AddressCard
                        title="Shop Address"
                        icon={Home}
                        lines={[form.name, ...shopAddressLines]}
                      />
                    )}
                    {pickupAddressLines.length > 0 && (
                      <AddressCard
                        title="Pickup Address"
                        icon={Package}
                        lines={[
                          effectivePickupForDisplay.locationName || form.name,
                          ...pickupAddressLines,
                        ]}
                        badge={form.pickupSameAsShop ? "Same as Shop" : undefined}
                      />
                    )}
                  </div>
                </div>
              )}
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
              <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6">
                <h3 className="font-serif font-bold text-sm mb-4" style={{ color: MAROON }}>Profile Photo</h3>
                <SingleAvatarUploader
                  currentAvatar={form.avatar}
                  disabled={saving}
                  onAvatarChange={(url) => { setForm((prev) => ({ ...prev, avatar: url })); setError(""); setSuccess(false); }}
                  onUploadingChange={setAvatarUploading}
                />
              </div>

              {/* Basic info */}
              <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 space-y-4">
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
                  <label className={labelClass} style={labelStyle}>Business Location *</label>
                  <input type="text" name="location" value={form.location} onChange={handleChange}
                    placeholder="e.g. Nashik, Maharashtra" required disabled={busy}
                    className={inputClass} style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }} />
                </div>
              </div>

              {/* Business & contact */}
              <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 space-y-4">
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

              {/* Shop Address */}
              <div data-testid="shop-address-section" className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 space-y-4">
                <div>
                  <h3 className="font-serif font-bold text-sm" style={{ color: MAROON }}>Shop Address</h3>
                  <p className="text-xs text-gray-400 mt-0.5">The registered address of your shop (used for invoices and correspondence)</p>
                </div>
                {/* Shop name = vendor name, displayed read-only */}
                <div>
                  <label className={labelClass} style={labelStyle}>Shop Name</label>
                  <div
                    className="w-full px-4 py-2.5 rounded-lg border text-sm"
                    style={{ background: `${CREAM}80`, borderColor: "#C7CCD144", color: "#0A1F44", opacity: 0.8 }}
                  >
                    {form.name || <span className="text-gray-400">—</span>}
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">Shop name is your Business Name above</p>
                </div>
                <AddressInputGroup
                  prefix="shop"
                  label="Shop"
                  values={form.shopAddress}
                  onChange={handleShopAddressChange}
                  disabled={busy}
                />
              </div>

              {/* Pickup Address */}
              <div data-testid="pickup-address-section" className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 space-y-4">
                <div>
                  <h3 className="font-serif font-bold text-sm" style={{ color: MAROON }}>Pickup Address</h3>
                  <p className="text-xs text-gray-400 mt-0.5">Where orders are picked up by the courier</p>
                </div>

                {/* Same-as-shop toggle */}
                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={form.pickupSameAsShop}
                      onChange={handlePickupSameAsShopChange}
                      disabled={busy}
                      className="sr-only"
                    />
                    <div
                      className="w-10 h-6 rounded-full transition-colors"
                      style={{
                        background: form.pickupSameAsShop ? MAROON : "#d1d5db",
                        opacity: busy ? 0.6 : 1,
                      }}
                    >
                      <div
                        className="absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform"
                        style={{ transform: form.pickupSameAsShop ? "translateX(16px)" : "translateX(0)" }}
                      />
                    </div>
                  </div>
                  <span className="text-sm font-medium" style={{ color: "#3d2b1f" }}>
                    Pickup address is same as shop address
                  </span>
                </label>

                {!form.pickupSameAsShop && (
                  <div className="space-y-4 pt-2">
                    <div>
                      <label htmlFor="pickup-location-name" className={labelClass} style={labelStyle}>Pickup Location Name</label>
                      <input
                        id="pickup-location-name"
                        type="text"
                        value={form.pickupAddress.locationName}
                        onChange={(e) => handlePickupAddressChange("locationName", e.target.value)}
                        placeholder="e.g. Main Warehouse"
                        disabled={busy}
                        className={inputClass}
                        style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }}
                      />
                    </div>
                    <AddressInputGroup
                      prefix="pickup"
                      label="Pickup"
                      values={{
                        addressLine1: form.pickupAddress.addressLine1,
                        addressLine2: form.pickupAddress.addressLine2,
                        landmark: form.pickupAddress.landmark,
                        city: form.pickupAddress.city,
                        state: form.pickupAddress.state,
                        pincode: form.pickupAddress.pincode,
                        country: form.pickupAddress.country,
                      }}
                      onChange={handlePickupAddressChange}
                      disabled={busy}
                    />
                  </div>
                )}

                {form.pickupSameAsShop && (
                  <div className="space-y-1 pt-1">
                    <label htmlFor="pickup-location-name-same" className="text-xs font-semibold" style={{ color: MAROON }}>Pickup location name</label>
                    <input
                      id="pickup-location-name-same"
                      type="text"
                      value={form.pickupAddress.locationName}
                      onChange={(e) => handlePickupAddressChange("locationName", e.target.value)}
                      placeholder={form.name || "Pickup location name"}
                      disabled={busy}
                      className={inputClass}
                      style={{ ...inputStyle, opacity: busy ? 0.6 : 1 }}
                    />
                    <p className="text-[11px] text-gray-400">Address will be derived from your shop address on save</p>
                  </div>
                )}
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
