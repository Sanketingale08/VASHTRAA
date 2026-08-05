import React, { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/react";
import { motion } from "framer-motion";
import {
  Save, Loader2, CheckCircle, ExternalLink,
  User, Phone, Mail, Calendar, Users, KeyRound, Settings,
  ChevronRight,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";

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

export function AccountProfilePage() {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();
  const editFormRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (user) {
      const meta = (user.publicMetadata ?? {}) as Record<string, string>;
      setForm({
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        phone: meta.phone ?? "",
        alternateMobile: meta.alternateMobile ?? "",
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

      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
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
          {/* Card header */}
          <div className="px-5 py-4 bg-gradient-to-r from-[#1E6B5A]/5 to-[#C9A84C]/5 border-b border-[#C9A84C]/10 flex items-center justify-between">
            <div>
              <p className="font-serif text-base font-bold text-[#1E6B5A]">
                {fullName || "Your Account"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{email}</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-[#1E6B5A] flex items-center justify-center shrink-0">
              <User size={18} className="text-white" />
            </div>
          </div>

          {/* Summary rows */}
          <div className="px-5 py-1">
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
              className={`w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-[#F3F8F5] transition-colors ${i > 0 ? "border-t border-gray-50" : ""}`}
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

        {/* ── Edit Form ─────────────────────────────────────────── */}
        <div ref={editFormRef}>
          <motion.form
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            onSubmit={handleSave}
            className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-5 space-y-4"
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
              <Field label="Mobile Number">
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
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm p-5"
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
    </DashboardLayout>
  );
}
