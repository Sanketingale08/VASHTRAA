import React, { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Save, Loader2, CheckCircle, ExternalLink,
  User, Phone, Mail, Calendar, Users, KeyRound, Settings,
  ChevronRight, Camera,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { ChangeEmailModal } from "./ChangeEmailModal";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const LANGUAGES = ["English", "Hindi", "Marathi"];
const GENDERS = ["Female", "Male", "Non-binary", "Prefer not to say"];

type ProfileForm = {
  firstName: string;
  lastName: string;
  phone: string;
  alternateMobile: string;
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
  "w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors bg-white";

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="w-8 h-8 rounded-xl bg-[#1E6B5A]/8 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-0.5">{label}</p>
        <p className="text-sm font-medium text-[#1a1a2e] truncate">
          {value || <span className="text-gray-300 font-normal">Not provided</span>}
        </p>
      </div>
    </div>
  );
}

/** Reusable avatar circle — photo if available, otherwise initials, otherwise icon. */
function AvatarCircle({
  imageUrl,
  firstName,
  lastName,
  size = "sm",
}: {
  imageUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "w-20 h-20" : "w-10 h-10";
  const textCls = size === "lg" ? "text-xl font-bold" : "text-sm font-bold";
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase();

  if (imageUrl) {
    return (
      <img
        src={imageUrl}
        alt="Profile photo"
        className={`${dim} rounded-full object-cover shrink-0`}
      />
    );
  }

  return (
    <div className={`${dim} rounded-full bg-[#1E6B5A] flex items-center justify-center shrink-0`}>
      {initials ? (
        <span className={`${textCls} text-white`}>{initials}</span>
      ) : (
        <User size={size === "lg" ? 28 : 18} className="text-white" />
      )}
    </div>
  );
}

/** Hydrate a ProfileForm from a Clerk user object (used after every reload). */
function hydrateForm(user: NonNullable<ReturnType<typeof useUser>["user"]>): ProfileForm {
  const meta = (user.publicMetadata ?? {}) as Record<string, string>;
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    phone: meta.phone ?? "",
    alternateMobile: meta.alternateMobile ?? "",
    dateOfBirth: meta.dateOfBirth ?? "",
    gender: meta.gender ?? "",
    language: meta.language ?? "English",
  };
}

export function AccountProfilePage() {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const editFormRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    phone: "",
    alternateMobile: "",
    dateOfBirth: "",
    gender: "",
    language: "English",
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");

  // Initial hydration when Clerk user first loads.
  // On subsequent reloads we explicitly call setForm — Clerk mutates the
  // user object in-place so the reference doesn't change, meaning this
  // effect wouldn't re-fire. Do NOT rely on it for post-save refreshes.
  useEffect(() => {
    if (user) {
      setForm(hydrateForm(user));
    }
  }, [user]);

  function set(field: keyof ProfileForm, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    if (saved) setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    // Client-side validation (phone is read-only here; changes go through OTP modal)
    if (form.alternateMobile && !/^\d{10}$/.test(form.alternateMobile)) {
      setError("Alternate mobile must be exactly 10 digits.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      // Update name fields via Clerk client SDK.
      // OAuth providers (e.g. Google) may control these — swallow provider
      // restriction errors rather than aborting the whole save.
      try {
        await user.update({
          firstName: form.firstName.trim() || undefined,
          lastName: form.lastName.trim() || undefined,
        });
      } catch (nameErr: any) {
        const code: string =
          nameErr?.errors?.[0]?.code ??
          nameErr?.errors?.[0]?.message ??
          nameErr?.message ??
          "";
        // Only re-throw genuinely unexpected errors
        if (
          !code.includes("external") &&
          !code.includes("provider") &&
          !code.includes("form_param") &&
          !code.includes("unverified") &&
          !code.includes("managed")
        ) {
          throw nameErr;
        }
        // Provider-controlled name — skip silently and continue saving metadata
      }

      const res = await fetch(`${BASE}/api/account/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          alternateMobile: form.alternateMobile.trim(),
          dateOfBirth: form.dateOfBirth,
          gender: form.gender,
          language: form.language,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save profile");
      }

      // Reload Clerk's user object so publicMetadata changes propagate
      // immediately to all useUser() consumers (Navbar, DashboardLayout, etc.)
      await user.reload();

      // Explicitly re-hydrate the form from the freshly-reloaded user.
      // We cannot rely on the useEffect([user]) re-firing because Clerk
      // mutates the user object in-place — the reference stays the same.
      setForm(hydrateForm(user));

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(
        err?.errors?.[0]?.message ??
          err?.message ??
          "Failed to save profile. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setPhotoUploading(true);
    setPhotoError("");
    try {
      await user.setProfileImage({ file });
      await user.reload();
      // Re-hydrate so name/metadata stay in sync too
      setForm(hydrateForm(user));
    } catch (err: any) {
      setPhotoError(
        err?.errors?.[0]?.message ??
          err?.message ??
          "Failed to upload photo. Please try again.",
      );
    } finally {
      setPhotoUploading(false);
      // Reset file input so the same file can be re-selected if needed
      if (photoInputRef.current) photoInputRef.current.value = "";
    }
  }

  const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ");
  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  function formatDob(dob: string): string {
    if (!dob) return "";
    try {
      return new Date(dob).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    } catch {
      return dob;
    }
  }

  function scrollToEditForm() {
    editFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // focus first input after scroll
    setTimeout(() => {
      const first = editFormRef.current?.querySelector<HTMLInputElement>("input, select");
      first?.focus();
    }, 400);
  }

  return (
    <DashboardLayout>
      <div className="space-y-5 max-w-xl">
        {/* Page heading */}
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1E6B5A]">My Profile</h2>
        </div>

        {/* ── Account Summary Card ───────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm overflow-hidden"
        >
          {/* Card header — shows real avatar/initials, not a static icon */}
          <div className="px-4 sm:px-5 py-4 bg-gradient-to-r from-[#1E6B5A]/5 to-[#C9A84C]/5 border-b border-[#C9A84C]/10 flex items-center justify-between">
            <div>
              <p className="font-serif text-base font-bold text-[#1E6B5A]">
                {fullName || "Your Account"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{email}</p>
            </div>
            <AvatarCircle
              imageUrl={user?.imageUrl}
              firstName={form.firstName}
              lastName={form.lastName}
              size="sm"
            />
          </div>

          {/* Summary rows */}
          <div className="px-4 sm:px-5 py-1">
            <SummaryRow
              icon={<User size={14} className="text-[#1E6B5A]" />}
              label="Full Name"
              value={fullName}
            />
            <SummaryRow
              icon={<Phone size={14} className="text-[#1E6B5A]" />}
              label="Mobile Number"
              value={form.phone}
            />
            <SummaryRow
              icon={<Mail size={14} className="text-[#1E6B5A]" />}
              label="Email Address"
              value={email}
            />
            <SummaryRow
              icon={<Users size={14} className="text-[#1E6B5A]" />}
              label="Gender"
              value={form.gender}
            />
            <SummaryRow
              icon={<Calendar size={14} className="text-[#1E6B5A]" />}
              label="Date of Birth"
              value={formatDob(form.dateOfBirth)}
            />
            <SummaryRow
              icon={<Phone size={14} className="text-[#C9A84C]" />}
              label="Alternate Mobile"
              value={form.alternateMobile}
            />
          </div>
        </motion.div>

        {/* ── Quick Actions ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm overflow-hidden"
        >
          {[
            {
              icon: <User size={16} className="text-[#1E6B5A]" />,
              label: "Edit Profile",
              desc: "Update your name, phone, gender, and date of birth",
              action: scrollToEditForm,
            },
            {
              icon: <Phone size={16} className="text-[#1E6B5A]" />,
              label: "Change Mobile Number",
              desc: "Verify a new number via code sent to your email",
              action: () => setShowPhoneModal(true),
            },
            {
              icon: <Mail size={16} className="text-[#1E6B5A]" />,
              label: "Change Email Address",
              desc: "Receive a verification code on your new email",
              action: () => setShowEmailModal(true),
            },
            {
              icon: <KeyRound size={16} className="text-[#1E6B5A]" />,
              label: "Change Password",
              desc: "Update your account password",
              action: () => openUserProfile(),
            },
            {
              icon: <Settings size={16} className="text-[#1E6B5A]" />,
              label: "Profile Management",
              desc: "Connected accounts, two-factor authentication, and more",
              action: () => openUserProfile(),
            },
          ].map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              className={`w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 text-left hover:bg-[#F3F8F5] transition-colors ${i > 0 ? "border-t border-gray-50" : ""}`}
            >
              <div className="w-9 h-9 rounded-xl bg-[#1E6B5A]/8 flex items-center justify-center shrink-0">
                {item.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#1a1a2e]">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.desc}</p>
              </div>
              <ChevronRight size={16} className="text-gray-300 shrink-0" />
            </button>
          ))}
        </motion.div>

        {/* ── Profile Photo ──────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-4 sm:p-5"
        >
          <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider mb-4">
            Profile Photo
          </h3>

          <div className="flex items-center gap-5">
            {/* Large avatar preview */}
            <div className="relative shrink-0">
              <AvatarCircle
                imageUrl={user?.imageUrl}
                firstName={form.firstName}
                lastName={form.lastName}
                size="lg"
              />
              {photoUploading && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <Loader2 size={20} className="text-white animate-spin" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-600 mb-3">
                Upload a clear photo so other people can recognise you.
              </p>

              {/* Hidden file input */}
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={handlePhotoChange}
                disabled={photoUploading}
              />

              <button
                type="button"
                disabled={photoUploading}
                onClick={() => photoInputRef.current?.click()}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-[#1E6B5A] text-[#1E6B5A] text-sm font-semibold hover:bg-[#1E6B5A] hover:text-white transition-colors disabled:opacity-50"
              >
                {photoUploading ? (
                  <><Loader2 size={14} className="animate-spin" /> Uploading…</>
                ) : (
                  <><Camera size={14} /> {user?.imageUrl ? "Change Photo" : "Upload Photo"}</>
                )}
              </button>

              {photoError && (
                <p className="mt-2 text-xs text-red-600">{photoError}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Edit Form ─────────────────────────────────────────── */}
        <div ref={editFormRef}>
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            onSubmit={handleSave}
            className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-4 sm:p-5 space-y-4"
          >
            <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider">
              Edit Personal Details
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Phone is read-only here — changes require OTP verification */}
              <Field label="Mobile Number">
                <div className="flex items-center border border-[#C9A84C]/20 rounded-lg bg-[#F9F9F9] px-3 py-2.5 gap-2">
                  <span className="flex-1 text-sm text-gray-500 truncate">
                    {form.phone ? `+91 ${form.phone}` : <span className="text-gray-300">Not set</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowPhoneModal(true)}
                    className="text-xs font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors whitespace-nowrap"
                  >
                    Change
                  </button>
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Mobile changes require OTP verification.</p>
              </Field>
              <Field label="Alternate Mobile (Optional)">
                <input
                  value={form.alternateMobile}
                  onChange={(e) =>
                    set("alternateMobile", e.target.value.replace(/\D/g, "").slice(0, 10))
                  }
                  placeholder="9876543210"
                  type="tel"
                  className={inputCls}
                />
              </Field>
            </div>

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
              <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}

            {saved && (
              <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-3 py-2 text-sm text-green-700">
                <CheckCircle size={14} className="shrink-0" /> Profile saved successfully!
              </div>
            )}

            <button
              type="submit"
              disabled={saving || !isLoaded}
              className="w-full bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-60 text-[#F3F8F5] py-3 font-bold uppercase tracking-wider text-sm rounded-xl flex items-center justify-center gap-2 transition-colors"
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
        </div>

        {/* ── Account Security ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-4 sm:p-5"
        >
          <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider mb-2">
            Account Security
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Manage your password, connected accounts, and two-factor authentication.
          </p>
          <button
            onClick={() => openUserProfile()}
            className="flex items-center gap-2 text-sm font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
          >
            <ExternalLink size={14} /> Manage account security
          </button>
        </motion.div>
      </div>

      {/* ── Modals ────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPhoneModal && (
          <ChangePhoneModal
            onClose={() => setShowPhoneModal(false)}
            onSuccess={(newPhone) => {
              setForm((f) => ({ ...f, phone: newPhone }));
              setShowPhoneModal(false);
            }}
          />
        )}
        {showEmailModal && (
          <ChangeEmailModal
            onClose={() => setShowEmailModal(false)}
            onSuccess={(_newEmail) => {
              setShowEmailModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
