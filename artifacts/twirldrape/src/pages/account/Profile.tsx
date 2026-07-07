import React, { useState, useRef, useEffect } from "react";
import { useUser, useClerk } from "@clerk/react";
import { motion } from "framer-motion";
import { Camera, Save, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const LANGUAGES = ["English", "Hindi", "Marathi"];
const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];

type ProfileForm = {
  firstName: string;
  lastName: string;
  phone: string;
  dateOfBirth: string;
  gender: string;
  language: string;
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7B1C2C]/20 focus:border-[#7B1C2C] transition-colors bg-white";

export function AccountProfilePage() {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    phone: "",
    dateOfBirth: "",
    gender: "",
    language: "English",
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    if (user) {
      const meta = (user.publicMetadata ?? {}) as Record<string, string>;
      setForm({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: meta.phone ?? "",
        dateOfBirth: meta.dateOfBirth ?? "",
        gender: meta.gender ?? "",
        language: meta.language ?? "English",
      });
    }
  }, [user]);

  function set(field: keyof ProfileForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (saved) setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await user.update({
        firstName: form.firstName.trim() || undefined,
        lastName: form.lastName.trim() || undefined,
      });

      const res = await fetch(`${BASE}/api/account/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: form.phone.trim(),
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          language: form.language,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save profile");
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarUploading(true);
    try {
      await user.setProfileImage({ file });
    } catch {
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const initials =
    [form.firstName?.[0], form.lastName?.[0]].filter(Boolean).join("").toUpperCase() || "?";

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-xl">
        <div>
          <h2 className="font-serif text-xl font-bold text-[#7B1C2C]">Profile</h2>
          <p className="text-sm text-gray-500 mt-0.5">Manage your personal information</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl border border-[#C9A84C]/15 p-5 shadow-sm flex items-center gap-5"
        >
          <div className="relative shrink-0">
            {user?.imageUrl ? (
              <img
                src={user.imageUrl}
                alt={initials}
                className="w-[72px] h-[72px] rounded-full object-cover border-2 border-[#C9A84C]/30"
              />
            ) : (
              <div className="w-[72px] h-[72px] rounded-full bg-[#7B1C2C] flex items-center justify-center text-[#FAF6EE] text-xl font-bold font-serif border-2 border-[#C9A84C]/30">
                {initials}
              </div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="absolute -bottom-1 -right-1 bg-white border border-[#C9A84C]/40 rounded-full w-7 h-7 flex items-center justify-center shadow hover:border-[#C9A84C] transition-colors disabled:opacity-60"
              title="Change profile photo"
            >
              {avatarUploading ? (
                <Loader2 size={13} className="animate-spin text-[#7B1C2C]" />
              ) : (
                <Camera size={13} className="text-[#7B1C2C]" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div>
            <p className="font-semibold text-[#3D1A1A] text-sm">
              {[form.firstName, form.lastName].filter(Boolean).join(" ") || "Your Name"}
            </p>
            <p className="text-xs text-gray-400 mt-0.5">
              {user?.primaryEmailAddress?.emailAddress}
            </p>
            <p className="text-[11px] text-gray-400 mt-2">JPG, PNG or GIF · Max 5 MB</p>
          </div>
        </motion.div>

        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          onSubmit={handleSave}
          className="bg-white rounded-xl border border-[#C9A84C]/15 p-5 shadow-sm space-y-4"
        >
          <h3 className="text-sm font-bold text-[#7B1C2C] uppercase tracking-wider">
            Personal Details
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="First Name">
              <input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="Priya"
                className={inputCls}
              />
            </Field>
            <Field label="Last Name">
              <input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Sharma"
                className={inputCls}
              />
            </Field>
          </div>

          <Field label="Phone Number">
            <input
              value={form.phone}
              onChange={(e) =>
                set("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
              }
              placeholder="9876543210"
              type="tel"
              className={inputCls}
            />
          </Field>

          <Field label="Date of Birth">
            <input
              value={form.dateOfBirth}
              onChange={(e) => set("dateOfBirth", e.target.value)}
              type="date"
              className={inputCls}
            />
          </Field>

          <Field label="Gender">
            <select
              value={form.gender}
              onChange={(e) => set("gender", e.target.value)}
              className={inputCls}
            >
              <option value="">Select gender</option>
              {GENDERS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Preferred Language">
            <select
              value={form.language}
              onChange={(e) => set("language", e.target.value)}
              className={inputCls}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </Field>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">
              {error}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-sm text-green-700">
              <CheckCircle size={14} className="shrink-0" /> Profile saved successfully!
            </div>
          )}

          <button
            type="submit"
            disabled={saving || !isLoaded}
            className="w-full bg-[#7B1C2C] hover:bg-[#6a1826] disabled:opacity-60 text-[#FAF6EE] py-3 font-bold uppercase tracking-wider text-sm rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? (
              <>
                <Loader2 size={14} className="animate-spin" /> Saving…
              </>
            ) : (
              <>
                <Save size={14} /> Save Changes
              </>
            )}
          </button>
        </motion.form>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white rounded-xl border border-[#C9A84C]/15 p-5 shadow-sm"
        >
          <h3 className="text-sm font-bold text-[#7B1C2C] uppercase tracking-wider mb-2">
            Account Security
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Manage your password, connected accounts, and two-factor authentication.
          </p>
          <button
            onClick={() => openUserProfile()}
            className="flex items-center gap-2 text-sm font-semibold text-[#7B1C2C] hover:text-[#C9A84C] transition-colors"
          >
            <ExternalLink size={14} /> Manage account security
          </button>
        </motion.div>
      </div>
    </DashboardLayout>
  );
}
