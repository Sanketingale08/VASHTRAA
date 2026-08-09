import React, { useState, useEffect, useRef } from "react";
import { useUser, useClerk } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pencil, Save, X, Loader2, CheckCircle, ExternalLink,
  User, KeyRound,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { ChangeEmailModal } from "./ChangeEmailModal";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

type ProfileForm = {
  firstName: string;
  lastName: string;
  phone: string;
  alternateMobile: string;
  dateOfBirth: string;
  gender: string;
  language: string;
  location: string;
};

/** Hydrate a ProfileForm from a Clerk user object. */
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
    location: meta.location ?? "",
  };
}

function formatDob(dob: string): string {
  if (!dob) return "";
  try {
    return new Date(dob).toLocaleDateString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return dob;
  }
}

/** Initials avatar disc. */
function AvatarCircle({
  firstName,
  lastName,
}: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase();
  return (
    <div className="w-14 h-14 rounded-full bg-[#1E6B5A] flex items-center justify-center shrink-0 select-none">
      {initials ? (
        <span className="text-xl font-bold text-white leading-none">{initials}</span>
      ) : (
        <User size={22} className="text-white" />
      )}
    </div>
  );
}

/**
 * A single row in the two-column profile table.
 * Desktop: label (fixed width) | value + optional action (flex).
 * Mobile: label above value, action button below value.
 */
function ProfileRow({
  label,
  value,
  action,
}: {
  label: string;
  value: string | null | undefined;
  action?: React.ReactNode;
}) {
  const display = value?.trim() || null;
  return (
    <div className="py-3.5 border-b border-gray-50 last:border-0 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
      <span className="sm:w-36 lg:w-44 text-xs font-semibold text-gray-400 uppercase tracking-wider shrink-0">
        {label}
      </span>
      <div className="flex-1 flex items-center justify-between gap-3 min-w-0">
        <span
          className={`text-sm font-medium truncate ${
            display ? "text-[#1a1a2e]" : "text-gray-300 italic font-normal"
          }`}
        >
          {display ?? "Not added"}
        </span>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}

/** Inline [Edit] button for phone / email rows. */
function InlineEditBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-[44px] px-2 text-xs font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors flex items-center"
    >
      Edit
    </button>
  );
}

const inputCls =
  "w-full border border-[#C9A84C]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors bg-white";

function EditField({
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

export function AccountProfilePage() {
  const { user, isLoaded } = useUser();
  const { openUserProfile } = useClerk();

  /** Displayed (view-mode) form values. */
  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    phone: "",
    alternateMobile: "",
    dateOfBirth: "",
    gender: "",
    language: "English",
    location: "",
  });

  /** Separate copy used only while editing — avoids live-updating the view card. */
  const [editForm, setEditForm] = useState<ProfileForm>(form);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // When true, the next user-dependency fire of the hydration effect is
  // skipped. We set this before calling user.reload() after a save so that
  // a new Clerk user-object reference (emitted by the SDK after the reload)
  // doesn't overwrite the form with potentially-stale publicMetadata and
  // cause the card to revert to old values.
  const skipNextHydrateRef = useRef(false);

  // Hydrate on initial mount and genuine user-reference changes
  // (e.g. sign-out / sign-in with a different account).
  useEffect(() => {
    if (!user) return;
    if (skipNextHydrateRef.current) {
      skipNextHydrateRef.current = false;
      return;
    }
    setForm(hydrateForm(user));
  }, [user]);

  /** Open edit mode — snapshot the current displayed values into editForm. */
  function openEdit() {
    setEditForm({ ...form });
    setError("");
    setSaved(false);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setError("");
  }

  function setField(field: keyof ProfileForm, value: string) {
    setEditForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    if (editForm.alternateMobile && !/^\d{10}$/.test(editForm.alternateMobile)) {
      setError("Alternate mobile must be exactly 10 digits.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      // All six fields — including firstName and lastName — go through the
      // backend PATCH so they are persisted via Clerk's admin API.
      // This replaces the old client-side user.update() best-effort call
      // which silently failed for OAuth accounts and caused the card to
      // revert to stale values.
      const res = await fetch(`/api/account/profile`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          alternateMobile: editForm.alternateMobile.trim(),
          dateOfBirth: editForm.dateOfBirth,
          gender: editForm.gender,
          language: editForm.language,
          location: editForm.location.trim(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to save profile");
      }

      // Prevent the useEffect from re-hydrating with potentially-stale
      // publicMetadata after user.reload() emits a new user reference.
      skipNextHydrateRef.current = true;
      await user.reload();

      // Commit the successfully-saved edit values directly to the view form.
      // editForm values are authoritative — do not fall back to the Clerk
      // session value which may lag behind the just-completed server write.
      setForm((prev) => ({
        ...editForm,
        firstName: editForm.firstName || user.firstName || "",
        lastName: editForm.lastName || user.lastName || "",
        phone: prev.phone, // phone is managed by OTP flow — never overwrite here
      }));

      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 3500);
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

  const fullName = [form.firstName, form.lastName].filter(Boolean).join(" ");
  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  // OAuth-linked accounts (Google, etc.) lock the display name at the provider level.
  const isOAuthAccount = (user?.externalAccounts?.length ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-xl">
        {/* Page heading */}
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-bold text-[#1E6B5A]">Profile Details</h2>
          {saved && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full"
            >
              <CheckCircle size={12} /> Saved
            </motion.div>
          )}
        </div>

        {/* ── Profile Details Card ──────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm overflow-hidden"
        >
          {/* Card header: avatar + name + email */}
          <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-[#1E6B5A]/5 to-[#C9A84C]/5 border-b border-[#C9A84C]/10 flex items-center gap-4">
            <AvatarCircle firstName={form.firstName} lastName={form.lastName} />
            <div className="min-w-0">
              <p className="font-serif text-base font-bold text-[#1E6B5A] truncate">
                {fullName || "Your Profile"}
              </p>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{email || "—"}</p>
            </div>
          </div>

          {/* Body — view mode or edit mode */}
          <AnimatePresence mode="wait">
            {!editing ? (
              /* ── View mode ──────────────────────────────────────── */
              <motion.div
                key="view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="px-4 sm:px-6 py-1"
              >
                <ProfileRow label="Full Name" value={fullName} />

                <ProfileRow
                  label="Mobile Number"
                  value={form.phone ? `+91 ${form.phone}` : null}
                  action={<InlineEditBtn onClick={() => setShowPhoneModal(true)} />}
                />

                <ProfileRow
                  label="Email ID"
                  value={email}
                  action={<InlineEditBtn onClick={() => setShowEmailModal(true)} />}
                />

                <ProfileRow label="Gender" value={form.gender} />
                <ProfileRow label="Date of Birth" value={formatDob(form.dateOfBirth)} />
                <ProfileRow label="Location" value={form.location} />
                <ProfileRow
                  label="Alternate Mobile"
                  value={form.alternateMobile ? `+91 ${form.alternateMobile}` : null}
                />

                {/* Edit Profile CTA */}
                <div className="py-5 flex justify-center">
                  <button
                    onClick={openEdit}
                    className="flex items-center gap-2 bg-[#1E6B5A] hover:bg-[#6a1826] text-white text-sm font-bold uppercase tracking-wider px-8 py-2.5 rounded-xl transition-colors min-h-[44px]"
                  >
                    <Pencil size={14} />
                    Edit Profile
                  </button>
                </div>
              </motion.div>
            ) : (
              /* ── Edit mode ──────────────────────────────────────── */
              <motion.div
                key="edit"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <form onSubmit={handleSave} className="px-4 sm:px-6 py-5 space-y-4">
                  {/* OAuth accounts (Google, etc.) lock the display name — show a notice */}
                  {isOAuthAccount && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                      Your name is managed by your connected account (
                      {user?.externalAccounts[0]?.provider ?? "OAuth provider"}) and cannot be
                      changed here.
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <EditField label="First Name">
                      <input
                        value={editForm.firstName}
                        onChange={(e) => setField("firstName", e.target.value)}
                        placeholder="Priya"
                        disabled={isOAuthAccount}
                        className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
                      />
                    </EditField>
                    <EditField label="Last Name">
                      <input
                        value={editForm.lastName}
                        onChange={(e) => setField("lastName", e.target.value)}
                        placeholder="Sharma"
                        disabled={isOAuthAccount}
                        className={`${inputCls} disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed`}
                      />
                    </EditField>
                  </div>

                  <EditField label="Gender">
                    <select
                      value={editForm.gender}
                      onChange={(e) => setField("gender", e.target.value)}
                      className={inputCls}
                    >
                      <option value="">Select gender</option>
                      {GENDERS.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </EditField>

                  <EditField label="Date of Birth">
                    <input
                      type="date"
                      value={editForm.dateOfBirth}
                      onChange={(e) => setField("dateOfBirth", e.target.value)}
                      className={inputCls}
                    />
                  </EditField>

                  <EditField label="Location">
                    <input
                      value={editForm.location}
                      onChange={(e) => setField("location", e.target.value)}
                      placeholder="Mumbai, Maharashtra"
                      className={inputCls}
                    />
                  </EditField>

                  <EditField label="Alternate Mobile (Optional)">
                    <input
                      value={editForm.alternateMobile}
                      onChange={(e) =>
                        setField(
                          "alternateMobile",
                          e.target.value.replace(/\D/g, "").slice(0, 10),
                        )
                      }
                      placeholder="9876543210"
                      type="tel"
                      className={inputCls}
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      10-digit Indian mobile number without country code.
                    </p>
                  </EditField>

                  {/* Note: phone and email changes use their own OTP flow */}
                  <div className="bg-[#F3F8F5] rounded-xl px-3 py-2.5 text-xs text-gray-500">
                    To change your{" "}
                    <button
                      type="button"
                      onClick={() => { cancelEdit(); setShowPhoneModal(true); }}
                      className="font-semibold text-[#1E6B5A] hover:underline"
                    >
                      mobile number
                    </button>{" "}
                    or{" "}
                    <button
                      type="button"
                      onClick={() => { cancelEdit(); setShowEmailModal(true); }}
                      className="font-semibold text-[#1E6B5A] hover:underline"
                    >
                      email address
                    </button>
                    , use the Edit buttons on the profile view.
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-sm text-red-600">
                      {error}
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      disabled={saving}
                      className="flex-1 border border-[#C9A84C]/30 text-gray-600 hover:bg-gray-50 disabled:opacity-50 py-2.5 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving || !isLoaded}
                      className="flex-1 bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-60 text-white py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[44px]"
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
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* ── Account Security (compact) ────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06 }}
          className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm px-4 sm:px-6 py-4"
        >
          <p className="text-xs text-gray-400 mb-3">
            Manage your password, two-factor authentication, and connected accounts.
          </p>
          <button
            onClick={() => openUserProfile()}
            className="flex items-center gap-2 text-sm font-semibold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
          >
            <KeyRound size={14} />
            Manage account security
            <ExternalLink size={12} className="text-gray-300" />
          </button>
        </motion.div>
      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
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
