import React, { useState, useEffect, useRef } from "react";
import { useUser as useClerkUser } from "@clerk/react";
import { useAuth } from "@/context/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Pencil, Save, X, Loader2, CheckCircle,
  User,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { ChangePhoneModal } from "./ChangePhoneModal";
import { ChangeEmailModal } from "./ChangeEmailModal";

const GENDERS = ["Male", "Female", "Other", "Prefer not to say"];

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  alternateMobile: string;
  dateOfBirth: string;
  gender: string;
  language: string;
  location: string;
  profilePicture: string;
  address: string;
};

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

/** Initials or photo avatar disc. */
function AvatarCircle({
  firstName,
  lastName,
  profilePicture,
}: {
  firstName?: string | null;
  lastName?: string | null;
  profilePicture?: string | null;
}) {
  const initials = [firstName?.[0], lastName?.[0]].filter(Boolean).join("").toUpperCase();
  if (profilePicture) {
    return (
      <div className="w-16 h-16 rounded-full border border-gray-200 overflow-hidden shrink-0 shadow-sm bg-gray-100">
        <img
          src={profilePicture}
          alt="Profile Avatar"
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      </div>
    );
  }
  return (
    <div className="w-14 h-14 rounded-full bg-[#0A1F44] flex items-center justify-center shrink-0 select-none">
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
      className="min-h-[44px] px-2 text-xs font-semibold text-[#0A1F44] hover:text-[#C7CCD1] transition-colors flex items-center"
    >
      Edit
    </button>
  );
}

const inputCls =
  "w-full border border-[#C7CCD1]/30 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-colors bg-white";

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
  const { user: clerkUser, isLoaded: clerkLoaded } = useClerkUser();
  const { user: authUser, refreshUser, updateUserLocally } = useAuth();

  const [form, setForm] = useState<ProfileForm>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    alternateMobile: "",
    dateOfBirth: "",
    gender: "",
    language: "English",
    location: "",
    profilePicture: "",
    address: "",
  });

  const [editForm, setEditForm] = useState<ProfileForm>(form);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [displayEmail, setDisplayEmail] = useState("");

  const skipNextHydrateRef = useRef(false);

  // Fetch full profile from database on mount & sync when user context changes
  const fetchProfile = async () => {
    try {
      const token = localStorage.getItem("vastraa_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/account/profile", { headers, credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        if (data?.user) {
          const u = data.user;
          const fetchedForm: ProfileForm = {
            firstName: u.firstName || authUser?.firstName || clerkUser?.firstName || "",
            lastName: u.lastName || authUser?.lastName || clerkUser?.lastName || "",
            email: u.email || authUser?.email || clerkUser?.primaryEmailAddress?.emailAddress || "",
            phone: u.phone || authUser?.phone || "",
            alternateMobile: u.alternateMobile || authUser?.alternateMobile || "",
            dateOfBirth: u.dateOfBirth || authUser?.dateOfBirth || "",
            gender: u.gender || authUser?.gender || "",
            language: u.language || authUser?.language || "English",
            location: u.location || authUser?.location || "",
            profilePicture: u.profilePicture || u.avatar || authUser?.profilePicture || authUser?.imageUrl || clerkUser?.imageUrl || "",
            address: u.address || authUser?.address || "",
          };
          setForm(fetchedForm);
          setDisplayEmail(fetchedForm.email);
          return;
        }
      }
    } catch { /* ignore and fallback below */ }

    // Fallback hydration from authUser / clerkUser
    if (authUser || clerkUser) {
      const meta = (clerkUser?.publicMetadata ?? {}) as Record<string, string>;
      const fallbackForm: ProfileForm = {
        firstName: authUser?.firstName || clerkUser?.firstName || "",
        lastName: authUser?.lastName || clerkUser?.lastName || "",
        email: authUser?.email || clerkUser?.primaryEmailAddress?.emailAddress || "",
        phone: authUser?.phone || meta.phone || "",
        alternateMobile: authUser?.alternateMobile || meta.alternateMobile || "",
        dateOfBirth: authUser?.dateOfBirth || meta.dateOfBirth || "",
        gender: authUser?.gender || meta.gender || "",
        language: authUser?.language || meta.language || "English",
        location: authUser?.location || meta.location || "",
        profilePicture: authUser?.profilePicture || authUser?.imageUrl || clerkUser?.imageUrl || meta.profilePicture || "",
        address: authUser?.address || meta.address || "",
      };
      setForm(fallbackForm);
      setDisplayEmail(fallbackForm.email);
    }
  };

  useEffect(() => {
    if (skipNextHydrateRef.current) {
      skipNextHydrateRef.current = false;
      return;
    }
    fetchProfile();
  }, [authUser, clerkUser]);

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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError("Image size should be less than 5MB");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Url = reader.result as string;
        setField("profilePicture", base64Url);
      };
      reader.readAsDataURL(file);
    }
  };

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;

    if (editForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editForm.email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }

    if (editForm.phone && !/^\d{10}$/.test(editForm.phone.replace(/\D/g, ""))) {
      setError("Mobile number must be a valid 10-digit number.");
      return;
    }

    if (editForm.alternateMobile && !/^\d{10}$/.test(editForm.alternateMobile.replace(/\D/g, ""))) {
      setError("Alternate mobile must be exactly 10 digits.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const token = localStorage.getItem("vastraa_auth_token");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch(`/api/account/profile`, {
        method: "PATCH",
        credentials: "include",
        headers,
        body: JSON.stringify({
          firstName: editForm.firstName.trim(),
          lastName: editForm.lastName.trim(),
          email: editForm.email.trim(),
          phone: editForm.phone.replace(/\D/g, ""),
          alternateMobile: editForm.alternateMobile.trim(),
          dateOfBirth: editForm.dateOfBirth,
          gender: editForm.gender,
          language: editForm.language,
          location: editForm.location.trim(),
          profilePicture: editForm.profilePicture.trim(),
          avatar: editForm.profilePicture.trim(),
          address: editForm.address.trim(),
        }),
      });

      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Failed to save profile");
      }

      skipNextHydrateRef.current = true;
      if (clerkUser) {
        try { await clerkUser.reload(); } catch { /* ignore */ }
      }

      const updatedUser = body.user || {};
      const newForm: ProfileForm = {
        firstName: editForm.firstName.trim() || updatedUser.firstName || "",
        lastName: editForm.lastName.trim() || updatedUser.lastName || "",
        email: editForm.email.trim() || updatedUser.email || form.email,
        phone: editForm.phone.replace(/\D/g, "") || updatedUser.phone || form.phone,
        alternateMobile: editForm.alternateMobile.trim(),
        dateOfBirth: editForm.dateOfBirth,
        gender: editForm.gender,
        language: editForm.language,
        location: editForm.location.trim(),
        profilePicture: editForm.profilePicture.trim() || updatedUser.profilePicture || updatedUser.avatar || "",
        address: editForm.address.trim() || updatedUser.address || "",
      };

      setForm(newForm);
      setDisplayEmail(newForm.email);
      updateUserLocally(newForm);
      await refreshUser();

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
  const email = displayEmail || form.email || authUser?.email || clerkUser?.primaryEmailAddress?.emailAddress || "";
  const isOAuthAccount = (clerkUser?.externalAccounts?.length ?? 0) > 0;

  return (
    <DashboardLayout>
      <div className="space-y-4 max-w-xl">
        {saved && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 text-xs font-semibold text-green-600 bg-green-50 px-3 py-1 rounded-full self-start"
          >
            <CheckCircle size={12} /> Saved successfully!
          </motion.div>
        )}

        {/* ── Profile Details Card ──────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-[#C7CCD1]/20 shadow-sm overflow-hidden"
        >
          {/* Card header: avatar + name + email */}
          <div className="px-4 sm:px-6 py-4 bg-gradient-to-r from-[#0A1F44]/5 to-[#C7CCD1]/5 border-b border-[#C7CCD1]/10 flex items-center gap-4">
            <AvatarCircle firstName={form.firstName} lastName={form.lastName} profilePicture={form.profilePicture} />
            <div className="min-w-0 flex-1">
              <p className="font-serif text-base font-bold text-[#0A1F44] truncate">
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

                <ProfileRow label="Address" value={form.address} />
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
                    className="flex items-center gap-2 bg-[#0A1F44] hover:bg-[#6a1826] text-white text-sm font-bold uppercase tracking-wider px-8 py-2.5 rounded-xl transition-colors min-h-[44px]"
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
                  {isOAuthAccount && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                      Your name is managed by your connected account (
                      {clerkUser?.externalAccounts[0]?.provider ?? "OAuth provider"}) and cannot be
                      changed here.
                    </div>
                  )}
                  
                  {/* Profile Picture Upload Field */}
                  <EditField label="Profile Picture">
                    <div className="flex items-center gap-4">
                      {editForm.profilePicture ? (
                        <div className="w-14 h-14 rounded-full overflow-hidden border border-gray-200 shrink-0">
                          <img src={editForm.profilePicture} alt="Profile" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center shrink-0 border border-dashed border-gray-300">
                          <User size={20} className="text-gray-400" />
                        </div>
                      )}
                      <div className="flex-1 space-y-2">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handlePhotoUpload}
                          className="text-xs text-gray-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#0A1F44] file:text-white hover:file:bg-[#6a1826] cursor-pointer"
                        />
                        <input
                          type="text"
                          value={editForm.profilePicture}
                          onChange={(e) => setField("profilePicture", e.target.value)}
                          placeholder="Or enter Image URL (https://...)"
                          className={inputCls}
                        />
                      </div>
                    </div>
                  </EditField>

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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <EditField label="Mobile Number">
                      <input
                        value={editForm.phone}
                        onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
                        placeholder="9876543210"
                        type="tel"
                        className={inputCls}
                      />
                    </EditField>
                    <EditField label="Email ID">
                      <input
                        value={editForm.email}
                        onChange={(e) => setField("email", e.target.value)}
                        placeholder="you@example.com"
                        type="email"
                        className={inputCls}
                      />
                    </EditField>
                  </div>

                  <EditField label="Address">
                    <textarea
                      rows={2}
                      value={editForm.address}
                      onChange={(e) => setField("address", e.target.value)}
                      placeholder="Enter your full street address, landmark, pin code..."
                      className={inputCls}
                    />
                  </EditField>

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

                  <div className="bg-[#F4F5F7] rounded-xl px-3 py-2.5 text-xs text-gray-500">
                    You can also update your{" "}
                    <button
                      type="button"
                      onClick={() => { cancelEdit(); setShowPhoneModal(true); }}
                      className="font-semibold text-[#0A1F44] hover:underline"
                    >
                      mobile number via OTP
                    </button>{" "}
                    or{" "}
                    <button
                      type="button"
                      onClick={() => { cancelEdit(); setShowEmailModal(true); }}
                      className="font-semibold text-[#0A1F44] hover:underline"
                    >
                      email address via verification code
                    </button>
                    .
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
                      className="flex-1 border border-[#C7CCD1]/30 text-gray-600 hover:bg-gray-50 disabled:opacity-50 py-2.5 text-sm font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 min-h-[44px]"
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="flex-1 bg-[#0A1F44] hover:bg-[#6a1826] disabled:opacity-60 text-white py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-2 transition-colors min-h-[44px]"
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

      </div>

      {/* ── Modals ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {showPhoneModal && (
          <ChangePhoneModal
            onClose={() => setShowPhoneModal(false)}
            onSuccess={async (newPhone) => {
              setForm((f) => ({ ...f, phone: newPhone }));
              updateUserLocally({ phone: newPhone });
              await refreshUser();
              setShowPhoneModal(false);
            }}
          />
        )}
        {showEmailModal && (
          <ChangeEmailModal
            onClose={() => setShowEmailModal(false)}
            onSuccess={async (newEmail) => {
              setDisplayEmail(newEmail);
              setForm((f) => ({ ...f, email: newEmail }));
              updateUserLocally({ email: newEmail });
              await refreshUser();
              setShowEmailModal(false);
            }}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
