import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Shield, Clock, Monitor, Users, Bell, Globe, CreditCard,
  Truck, Mail, Settings, BookOpen, Eye, EyeOff, Loader2, CheckCircle,
  XCircle, ChevronRight, LogOut, AlertTriangle, Lock, Smartphone,
  MapPin, Chrome, X, Save, Activity, Power, Database, Server,
  Building2, RefreshCw,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { useToast } from "@/hooks/use-toast";

// ─── constants ────────────────────────────────────────────────────────────────
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

function adminKey() {
  return typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";
}
function sessionToken() {
  return typeof window !== "undefined" ? sessionStorage.getItem("td_admin_session_token") ?? "" : "";
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const headers: Record<string, string> = {
    "x-admin-key": adminKey(),
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> ?? {}),
  };
  const token = sessionToken();
  if (token) headers["x-admin-session-token"] = token;

  const r = await fetch(path, { ...opts, credentials: "include", headers });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const err: any = new Error(body.error ?? `HTTP ${r.status}`);
    err.code = body.code;         // preserve structured error code from API
    err.status = r.status;
    throw err;
  }
  return r.json();
}

// ─── Section definitions ──────────────────────────────────────────────────────
const SECTIONS = [
  { id: "profile",       label: "Admin Profile",         icon: User,        desc: "Name, email and contact details",            phase: 1 },
  { id: "security",      label: "Security & Access",      icon: Shield,      desc: "Access key, 2FA and session controls",       phase: 1 },
  { id: "login-activity",label: "Login Activity",         icon: Clock,       desc: "History of admin sign-ins",                  phase: 1 },
  { id: "sessions",      label: "Active Sessions",        icon: Monitor,     desc: "Manage devices currently signed in",         phase: 1 },
  { id: "permissions",   label: "Admin Permissions",      icon: Users,       desc: "Module access and role management",          phase: 2 },
  { id: "notifications", label: "Notifications",          icon: Bell,        desc: "Admin alert preferences by channel",         phase: 2 },
  { id: "platform",      label: "Platform Settings",      icon: Globe,       desc: "Name, currency, timezone and support info",  phase: 3 },
  { id: "payment",       label: "Payment Settings",       icon: CreditCard,  desc: "Cashfree integration and payment methods",   phase: 4 },
  { id: "shipping",      label: "Shipping Settings",      icon: Truck,       desc: "Shiprocket and delivery configuration",      phase: 4 },
  { id: "email-sms",     label: "Email & SMS Settings",   icon: Mail,        desc: "Providers, OTP and sender configuration",    phase: 4 },
  { id: "system",        label: "System & Maintenance",   icon: Settings,    desc: "Maintenance mode and system health",         phase: 3 },
  { id: "audit-logs",    label: "Audit Logs",             icon: BookOpen,    desc: "Append-only record of admin actions",        phase: 2 },
];

// ─── Shared UI helpers ────────────────────────────────────────────────────────
function SectionCard({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <div id={`section-${id}`} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      {children}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="px-6 py-5 border-b border-gray-100 flex items-start gap-4">
      <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(13,27,54,0.06)" }}>
        <Icon size={18} style={{ color: NAVY }} />
      </div>
      <div>
        <h2 className="font-semibold text-gray-900 text-base">{title}</h2>
        <p className="text-sm text-gray-500 mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function ComingSoonBody({ phase }: { phase: number }) {
  return (
    <div className="px-6 py-10 flex flex-col items-center text-center gap-3">
      <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
        <Clock size={22} className="text-amber-500" />
      </div>
      <p className="text-sm font-medium text-gray-700">Coming in Phase {phase}</p>
      <p className="text-xs text-gray-400 max-w-xs">This section is planned for an upcoming release. Other settings are fully functional now.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white ${props.className ?? ""}`}
    />
  );
}

function Btn({ variant = "primary", loading = false, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "danger"; loading?: boolean }) {
  const base = "px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed";
  const variants = {
    primary: "text-white",
    secondary: "bg-gray-100 text-gray-700 hover:bg-gray-200",
    danger: "bg-red-50 text-red-600 hover:bg-red-100 border border-red-200",
  };
  return (
    <button
      {...props}
      disabled={props.disabled || loading}
      className={`${base} ${variants[variant]} ${props.className ?? ""}`}
      style={variant === "primary" ? { background: NAVY, ...(props.style ?? {}) } : props.style}
    >
      {loading && <Loader2 size={14} className="animate-spin" />}
      {children}
    </button>
  );
}

// ─── Admin Profile ─────────────────────────────────────────────────────────────
function ProfileSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", mobile: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-profile"],
    queryFn: () => apiFetch("/api/admin/settings/profile"),
  });

  useEffect(() => {
    if (data) setForm({ name: data.name ?? "", email: data.email ?? "", mobile: data.mobile ?? "" });
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/admin/settings/profile", { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => {
      toast({ title: "Profile updated", description: "Admin profile saved successfully." });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-profile"] });
    },
    onError: (e: Error) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  return (
    <SectionCard id="profile">
      <SectionHeader icon={User} title="Admin Profile" desc="Your administrator identity and contact details" />
      <div className="px-6 py-5">
        {isLoading ? (
          <div className="flex gap-2 items-center text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Loading…</div>
        ) : editing ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Name">
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Super Admin" />
            </Field>
            <Field label="Email">
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="admin@example.com" />
            </Field>
            <Field label="Mobile">
              <Input value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} placeholder="+91 98765 43210" />
            </Field>
            <div className="sm:col-span-2 flex gap-3 pt-2">
              <Btn onClick={() => save.mutate()} loading={save.isPending}>Save Changes</Btn>
              <Btn variant="secondary" onClick={() => { setEditing(false); setForm({ name: data?.name ?? "", email: data?.email ?? "", mobile: data?.mobile ?? "" }); }}>Cancel</Btn>
            </div>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0" style={{ background: NAVY, color: GOLD }}>
              {(form.name || "A").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Name</p>
                <p className="text-sm font-semibold text-gray-900">{form.name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Email</p>
                <p className="text-sm text-gray-700">{form.email || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 font-medium mb-0.5">Mobile</p>
                <p className="text-sm text-gray-700">{form.mobile || "—"}</p>
              </div>
            </div>
            <Btn variant="secondary" onClick={() => setEditing(true)}>Edit Profile</Btn>
          </div>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Change Access Key Modal ───────────────────────────────────────────────────
function ChangeKeyModal({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({ current: "", newKey: "", confirm: "" });
  const [show, setShow] = useState({ current: false, newKey: false, confirm: false });
  const [error, setError] = useState("");

  const save = useMutation({
    mutationFn: () =>
      apiFetch("/api/admin/settings/change-access-key", {
        method: "POST",
        body: JSON.stringify({ currentKey: form.current, newKey: form.newKey, confirmKey: form.confirm }),
      }),
    onSuccess: () => {
      toast({ title: "Access key updated", description: "Admin access key changed successfully." });
      // Update sessionStorage with new key so subsequent requests work
      sessionStorage.setItem("td_admin_key", form.newKey);
      onClose();
    },
    onError: (e: Error) => setError(e.message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.current || !form.newKey || !form.confirm) { setError("All fields are required"); return; }
    if (form.newKey !== form.confirm) { setError("New key and confirmation do not match"); return; }
    if (form.newKey.length < 16) { setError("New key must be at least 16 characters"); return; }
    if (form.newKey === form.current) { setError("New key must differ from the current key"); return; }
    save.mutate();
  }

  const ToggleEye = ({ field }: { field: keyof typeof show }) => (
    <button type="button" onClick={() => setShow(s => ({ ...s, [field]: !s[field] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
      {show[field] ? <EyeOff size={15} /> : <Eye size={15} />}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-navy flex items-center justify-center" style={{ background: NAVY }}>
              <Lock size={14} style={{ color: GOLD }} />
            </div>
            <h3 className="font-semibold text-gray-900">Change Access Key</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="px-6 py-5 flex flex-col gap-4">
          <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 flex gap-2.5">
            <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">The new key must be at least 16 characters. You will be signed in with the new key immediately.</p>
          </div>
          {[
            { id: "current" as const, label: "Current Access Key", placeholder: "Enter current key" },
            { id: "newKey" as const, label: "New Access Key", placeholder: "Min 16 characters" },
            { id: "confirm" as const, label: "Confirm New Access Key", placeholder: "Re-enter new key" },
          ].map(({ id, label, placeholder }) => (
            <Field key={id} label={label}>
              <div className="relative">
                <Input
                  type={show[id] ? "text" : "password"}
                  value={form[id]}
                  onChange={e => setForm(f => ({ ...f, [id]: e.target.value }))}
                  placeholder={placeholder}
                  autoComplete="off"
                />
                <ToggleEye field={id} />
              </div>
            </Field>
          ))}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700 flex gap-2">
              <XCircle size={14} className="shrink-0 mt-0.5" />{error}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Btn type="submit" loading={save.isPending}>Update Key</Btn>
            <Btn type="button" variant="secondary" onClick={onClose}>Cancel</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── 2FA Setup Modal ─────────────────────────────────────────────────────────
function TwoFASetupModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [accessKeyInput, setAccessKeyInput] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [manualKey, setManualKey] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleConfirmKey(e: React.FormEvent) {
    e.preventDefault();
    if (!accessKeyInput.trim()) { setError("Access key is required"); return; }
    setLoading(true); setError("");
    try {
      const data = await apiFetch("/api/admin/2fa/setup/start", {
        method: "POST",
        body: JSON.stringify({ accessKey: accessKeyInput.trim() }),
      });
      setQrDataUrl(data.qrDataUrl);
      setManualKey(data.manualKey);
      setStep(2);
    } catch (err: any) {
      setError(err.message ?? "Failed to start 2FA setup");
    } finally { setLoading(false); }
  }

  async function handleVerifyTOTP(e: React.FormEvent) {
    e.preventDefault();
    if (totpCode.replace(/\s/g, "").length < 6) { setError("Enter the 6-digit code"); return; }
    setLoading(true); setError("");
    try {
      const data = await apiFetch("/api/admin/2fa/setup/verify", {
        method: "POST",
        body: JSON.stringify({ code: totpCode.replace(/\s/g, "") }),
      });
      // Persist the verified session issued by the server.
      if (data.tokenHash && data.sessionId) {
        sessionStorage.setItem("td_admin_session_token", data.tokenHash);
        sessionStorage.setItem("td_admin_session_id", data.sessionId);
      }
      setStep(4);
    } catch (err: any) {
      setError(err.message ?? "Invalid code. Please try again.");
      setTotpCode("");
    } finally { setLoading(false); }
  }

  const STEP_LABELS = ["Key", "Scan QR", "Verify App"];
  const canClose = step !== 4;
  const titleMap: Record<number, string> = {
    1: "Enable Two-Factor Authentication",
    2: "Enable Two-Factor Authentication",
    3: "Enable Two-Factor Authentication",
    4: "Two-Factor Authentication Enabled",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(13,27,54,0.7)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {step === 4
              ? <CheckCircle size={16} className="text-green-500" />
              : <Shield size={16} style={{ color: GOLD }} />}
            <h3 className="font-serif font-bold text-base" style={{ color: NAVY }}>
              {titleMap[step]}
            </h3>
          </div>
          {canClose && <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>}
        </div>

        {/* Step indicator — shown for setup steps 1–3 */}
        {step >= 1 && step <= 3 && (
          <div className="px-6 pt-4 flex items-center gap-1.5">
            {STEP_LABELS.map((_, i) => {
              const s = i + 1;
              return (
                <React.Fragment key={s}>
                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-colors ${step > s ? "text-white" : step === s ? "text-white" : "text-gray-400 bg-gray-100"}`}
                    style={{ background: step >= s ? NAVY : undefined }}
                  >
                    {step > s ? <CheckCircle size={10} /> : s}
                  </div>
                  {s < 5 && (
                    <div className="flex-1 h-0.5 transition-colors" style={{ background: step > s ? GOLD : "#e5e7eb" }} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div className="px-6 py-5">

          {/* Step 1: Confirm Access Key */}
          {step === 1 && (
            <form onSubmit={handleConfirmKey} className="space-y-4">
              <p className="text-sm text-gray-600">To enable 2FA, first confirm your Admin Access Key as an additional security step.</p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Admin Access Key</label>
                <div className="relative">
                  <input type={showKey ? "text" : "password"} value={accessKeyInput}
                    onChange={(e) => { setAccessKeyInput(e.target.value); setError(""); }}
                    placeholder="Enter your admin key"
                    className="w-full px-3 py-2.5 pr-9 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 transition"
                    style={{ ["--tw-ring-color" as any]: GOLD }} autoFocus />
                  <button type="button" onClick={() => setShowKey(!showKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>
              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={onClose} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                <button type="submit" disabled={loading}
                  className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: NAVY, color: "white" }}>
                  {loading && <RefreshCw size={13} className="animate-spin" />}
                  {loading ? "Confirming…" : "Confirm & Continue"}
                </button>
              </div>
            </form>
          )}

          {/* Step 2: Scan QR code */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">Open your authenticator app (Google Authenticator, Authy, etc.) and scan this QR code.</p>
              {qrDataUrl && (
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="2FA QR Code" className="w-48 h-48 rounded-lg border border-gray-200" />
                </div>
              )}
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Or enter manually:</p>
                <div className="bg-gray-50 rounded-lg px-3 py-2 font-mono text-xs text-gray-700 break-all select-all border border-gray-200">{manualKey}</div>
              </div>
              <button onClick={() => setStep(3)}
                className="w-full py-2.5 text-sm font-bold rounded-lg transition-colors"
                style={{ background: NAVY, color: "white" }}>
                I've Scanned the Code →
              </button>
            </div>
          )}

          {/* Step 3: Verify TOTP */}
          {step === 3 && (
            <form onSubmit={handleVerifyTOTP} className="space-y-4">
              <p className="text-sm text-gray-600">Enter the 6-digit code shown in your authenticator app to verify the setup.</p>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Authenticator Code</label>
                <input type="text" inputMode="numeric" maxLength={6} value={totpCode}
                  onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                  placeholder="000000"
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-center text-lg tracking-[0.5em] outline-none focus:border-amber-400 transition"
                  autoFocus />
              </div>
              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => { setStep(2); setError(""); }}
                  className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">← Back</button>
                <button type="submit" disabled={loading || totpCode.length < 6}
                  className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: NAVY, color: "white" }}>
                  {loading && <RefreshCw size={13} className="animate-spin" />}
                  {loading ? "Verifying…" : "Verify & Continue"}
                </button>
              </div>
            </form>
          )}

          {/* Step 4: Success */}
          {step === 4 && (
            <div className="space-y-5 text-center py-2">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "#f0fdf4" }}>
                  <CheckCircle size={36} className="text-green-500" />
                </div>
              </div>
              <div>
                <h4 className="font-serif font-bold text-base mb-1.5" style={{ color: NAVY }}>
                  Two-Factor Authentication Enabled
                </h4>
                <p className="text-sm text-gray-600">
                  Your account is now protected with your authenticator app.
                </p>
              </div>
              <button onClick={onSuccess}
                className="w-full py-2.5 text-sm font-bold rounded-lg transition-colors"
                style={{ background: NAVY, color: "white" }}>
                Continue to Security Settings
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── 2FA Manage Modal ─────────────────────────────────────────────────────────
function TwoFAManageModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const { toast } = useToast();
  const [view, setView] = useState<"menu" | "disable" | "regen" | "newCodes">("menu");
  const [totpCode, setTotpCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [newCodes, setNewCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  function reset() { setTotpCode(""); setError(""); setConfirmDisable(false); }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    if (!confirmDisable) { setConfirmDisable(true); return; }
    setLoading(true); setError("");
    try {
      await apiFetch("/api/admin/2fa/disable", {
        method: "POST",
        body: JSON.stringify({ code: totpCode.replace(/\s/g, "") }),
      });
      // Clear the verified session (no longer needed without 2FA)
      sessionStorage.removeItem("td_admin_session_token");
      sessionStorage.removeItem("td_admin_session_id");
      toast({ title: "2FA disabled", description: "Two-factor authentication has been turned off." });
      onSuccess();
    } catch (err: any) {
      setError(err.message ?? "Failed to disable 2FA"); setConfirmDisable(false);
    } finally { setLoading(false); }
  }

  async function handleRegen(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const data = await apiFetch("/api/admin/2fa/regenerate-codes", {
        method: "POST",
        body: JSON.stringify({ code: totpCode.replace(/\s/g, "") }),
      });
      setNewCodes(data.codes ?? []);
      setCopied(false);
      setView("newCodes");
    } catch (err: any) {
      setError(err.message ?? "Failed to regenerate recovery codes");
    } finally { setLoading(false); }
  }

  function handleCopyCodes() {
    navigator.clipboard.writeText(newCodes.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleDownloadCodes() {
    const text = [
      "TwirlDrape Admin — Recovery Codes",
      `Generated: ${new Date().toLocaleString("en-IN")}`,
      "",
      ...newCodes,
      "",
      "Each code can only be used once.",
      "Store these in a safe place.",
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "twirldrape-admin-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  const totpInput = (
    <div>
      <label className="block text-xs font-bold uppercase tracking-wider text-gray-500 mb-1.5">Authenticator Code</label>
      <input type="text" inputMode="numeric" maxLength={6} value={totpCode}
        onChange={(e) => { setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
        placeholder="000000"
        className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono text-center text-lg tracking-[0.5em] outline-none focus:border-amber-400 transition"
        autoFocus />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(13,27,54,0.7)" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {view === "newCodes"
              ? <CheckCircle size={16} className="text-green-500" />
              : <Shield size={16} style={{ color: GOLD }} />}
            <h3 className="font-serif font-bold text-base" style={{ color: NAVY }}>
              {view === "newCodes" ? "New Recovery Codes" : "Manage Two-Factor Authentication"}
            </h3>
          </div>
          {view !== "newCodes" && (
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          )}
        </div>

        <div className="px-6 py-5">
          {/* Menu */}
          {view === "menu" && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600 mb-4">Two-factor authentication is currently <strong>enabled</strong>. Choose an action below.</p>

              {/* Regenerate recovery codes */}
              <button onClick={() => { reset(); setView("regen"); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-amber-100 hover:border-amber-200 hover:bg-amber-50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(201,168,76,0.12)" }}>
                  <RefreshCw size={15} style={{ color: GOLD }} />
                </div>
                <div>
                  <p className="text-sm font-semibold" style={{ color: NAVY }}>Regenerate Recovery Codes</p>
                  <p className="text-xs text-gray-500">Lost your codes? Generate a new set — old codes are invalidated</p>
                </div>
              </button>

              {/* Disable 2FA */}
              <button onClick={() => { reset(); setView("disable"); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-red-100 hover:border-red-200 hover:bg-red-50 transition-colors text-left">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50">
                  <Lock size={15} className="text-red-500" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-red-700">Disable Two-Factor Authentication</p>
                  <p className="text-xs text-red-500">This will reduce your account security</p>
                </div>
              </button>
            </div>
          )}

          {/* Regenerate flow */}
          {view === "regen" && (
            <form onSubmit={handleRegen} className="space-y-4">
              <div className="p-3 rounded-lg border flex gap-2.5" style={{ background: "rgba(201,168,76,0.08)", borderColor: "rgba(201,168,76,0.3)" }}>
                <AlertTriangle size={15} className="shrink-0 mt-0.5" style={{ color: "#7a5700" }} />
                <p className="text-xs" style={{ color: "#7a5700" }}>
                  Generating new recovery codes will <strong>permanently invalidate</strong> your existing ones. Store the new codes somewhere safe immediately.
                </p>
              </div>
              {totpInput}
              {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setView("menu")} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">← Back</button>
                <button type="submit" disabled={loading || totpCode.length < 6}
                  className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ background: NAVY, color: "white" }}>
                  {loading && <RefreshCw size={13} className="animate-spin" />}
                  {loading ? "Generating…" : "Generate New Codes"}
                </button>
              </div>
            </form>
          )}

          {/* New codes display */}
          {view === "newCodes" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Your new recovery codes are below. <strong>Copy or download them now</strong> — they won't be shown again.
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 font-mono text-sm grid grid-cols-2 gap-x-6 gap-y-1.5">
                {newCodes.map((c, i) => (
                  <span key={i} className="text-gray-800 tracking-wider">{c}</span>
                ))}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyCodes}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  {copied ? <CheckCircle size={14} className="text-green-500" /> : <RefreshCw size={13} />}
                  {copied ? "Copied!" : "Copy Codes"}
                </button>
                <button
                  onClick={handleDownloadCodes}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg text-white transition-colors"
                  style={{ background: NAVY }}
                >
                  Download .txt
                </button>
              </div>
              <button
                onClick={onClose}
                className="w-full py-2.5 text-sm font-medium text-gray-500 hover:text-gray-700 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Disable flow */}
          {view === "disable" && (
            <form onSubmit={handleDisable} className="space-y-4">
              {!confirmDisable ? (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                    <p className="text-xs font-bold text-red-800 mb-1">⚠ Reducing security</p>
                    <p className="text-xs text-red-700">Disabling two-factor authentication will remove the extra security layer from your admin account.</p>
                  </div>
                  {totpInput}
                  {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setView("menu")} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">← Back</button>
                    <button type="submit" disabled={loading || totpCode.length < 6}
                      className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ background: "#dc2626", color: "white" }}>
                      {loading && <RefreshCw size={13} className="animate-spin" />}
                      Continue
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-gray-700 font-medium">Are you sure you want to disable Two-Factor Authentication?</p>
                  <p className="text-xs text-gray-500">This will make your admin account less secure. You can re-enable it at any time.</p>
                  {error && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} />{error}</p>}
                  <div className="flex gap-2 pt-1">
                    <button type="button" onClick={() => setConfirmDisable(false)} className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
                    <button type="submit" disabled={loading}
                      className="flex-1 py-2.5 text-sm font-bold rounded-lg transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                      style={{ background: "#dc2626", color: "white" }}>
                      {loading && <RefreshCw size={13} className="animate-spin" />}
                      {loading ? "Disabling…" : "Yes, Disable 2FA"}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}

        </div>
      </div>
    </div>
  );
}

// ─── Security & Access ────────────────────────────────────────────────────────
function SecuritySection() {
  const qc = useQueryClient();
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [show2faSetup, setShow2faSetup] = useState(false);
  const [show2faManage, setShow2faManage] = useState(false);

  const { data: twoFaStatus, isLoading: twoFaLoading } = useQuery<{ enabled: boolean; enabledAt: string | null }>({
    queryKey: ["admin-2fa-status"],
    queryFn: () => apiFetch("/api/admin/2fa/status"),
    staleTime: 10_000,
  });
  const twoFaEnabled = twoFaStatus?.enabled ?? false;

  function refresh2fa() { qc.invalidateQueries({ queryKey: ["admin-2fa-status"] }); }

  return (
    <SectionCard id="security">
      <SectionHeader icon={Shield} title="Security & Access" desc="Admin access key, two-factor authentication and session controls" />
      <div className="divide-y divide-gray-50">
        {/* Change Access Key */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Admin Access Key</p>
            <p className="text-xs text-gray-500 mt-0.5">Used to authenticate admin panel access. Never share this key.</p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-mono text-sm text-gray-400 tracking-widest">••••••••••••</span>
            <Btn variant="secondary" onClick={() => setShowKeyModal(true)}>Change Key</Btn>
          </div>
        </div>

        {/* 2FA */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-gray-900">Two-Factor Authentication</p>
              {twoFaLoading ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-400">Checking…</span>
              ) : twoFaEnabled ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(201,168,76,0.15)", color: "#7a5700" }}>Enabled</span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">Disabled</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Add an extra layer of security to admin login.</p>
          </div>
          <div className="shrink-0">
            {twoFaEnabled ? (
              <Btn variant="secondary" onClick={() => setShow2faManage(true)}>Manage 2FA</Btn>
            ) : (
              <Btn onClick={() => setShow2faSetup(true)}>Enable 2FA</Btn>
            )}
          </div>
        </div>

        {/* Session Timeout */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Session Timeout</p>
            <p className="text-xs text-gray-500 mt-0.5">Admin sessions expire after inactivity.</p>
          </div>
          <span className="text-sm text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5">Browser session</span>
        </div>

        {/* Login Protection */}
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Login Protection</p>
            <p className="text-xs text-gray-500 mt-0.5">{twoFaEnabled ? "Key + authenticator app required." : "Key-based authentication is active."}</p>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle size={15} />
            <span className="text-xs font-medium">Active</span>
          </div>
        </div>
      </div>

      {showKeyModal && <ChangeKeyModal onClose={() => setShowKeyModal(false)} />}
      {show2faSetup && (
        <TwoFASetupModal
          onClose={() => setShow2faSetup(false)}
          onSuccess={() => { setShow2faSetup(false); refresh2fa(); }}
        />
      )}
      {show2faManage && (
        <TwoFAManageModal
          onClose={() => setShow2faManage(false)}
          onSuccess={() => { setShow2faManage(false); refresh2fa(); }}
        />
      )}
    </SectionCard>
  );
}

// ─── Login Activity ───────────────────────────────────────────────────────────
interface Session {
  id: string;
  device: string;
  os: string;
  browser: string;
  location: string;
  ipAddress: string;
  createdAt: string;
  lastActive: string;
  revokedAt: string | null;
  sessionTokenHash: string;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function LoginActivitySection() {
  const { toast } = useToast();
  const [page, setPage] = useState(0);
  const PER_PAGE = 10;
  const currentToken = sessionToken();

  const { data, isLoading, error } = useQuery<{ sessions: Session[] }>({
    queryKey: ["admin-login-activity"],
    queryFn: () => apiFetch("/api/admin/settings/login-activity"),
  });

  const sessions = data?.sessions ?? [];
  const pageCount = Math.max(1, Math.ceil(sessions.length / PER_PAGE));
  const pageSessions = sessions.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  return (
    <SectionCard id="login-activity">
      <SectionHeader icon={Clock} title="Login Activity" desc="Recent administrator sign-in history" />
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex gap-2 items-center text-sm text-gray-400 py-4"><Loader2 size={14} className="animate-spin" />Loading…</div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">Unable to load login activity.</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No login history recorded yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    <th className="px-4 py-3 text-left">Date & Time</th>
                    <th className="px-4 py-3 text-left">Device</th>
                    <th className="px-4 py-3 text-left">OS</th>
                    <th className="px-4 py-3 text-left">Browser</th>
                    <th className="px-4 py-3 text-left">Location</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {pageSessions.map((s) => {
                    const isCurrent = currentToken && s.sessionTokenHash === currentToken;
                    const isRevoked = !!s.revokedAt;
                    return (
                      <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDate(s.createdAt)}</td>
                        <td className="px-4 py-3 text-gray-700">{s.device || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{s.os || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{s.browser || "—"}</td>
                        <td className="px-4 py-3 text-gray-700">{s.location || "—"}</td>
                        <td className="px-4 py-3">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />Current
                            </span>
                          ) : isRevoked ? (
                            <span className="text-xs text-gray-400">Revoked</span>
                          ) : (
                            <span className="text-xs text-gray-500">Logged Out</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-xs text-gray-400">Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, sessions.length)} of {sessions.length}</p>
                <div className="flex gap-2">
                  <Btn variant="secondary" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous</Btn>
                  <Btn variant="secondary" disabled={page >= pageCount - 1} onClick={() => setPage(p => p + 1)}>Next</Btn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Active Sessions ──────────────────────────────────────────────────────────
function ActiveSessionsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const currentToken = sessionToken();
  const currentSessionId = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_session_id") ?? "" : "";

  const { data, isLoading, error } = useQuery<{ sessions: Session[] }>({
    queryKey: ["admin-sessions"],
    queryFn: () => apiFetch("/api/admin/settings/sessions"),
    refetchInterval: 30_000,
  });

  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/admin/settings/sessions/${id}/revoke`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Session revoked", description: "Session revoked successfully." });
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
      qc.invalidateQueries({ queryKey: ["admin-login-activity"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const revokeOthers = useMutation({
    mutationFn: () => apiFetch("/api/admin/settings/sessions/revoke-others", { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Sessions revoked", description: "All other devices have been signed out." });
      setConfirmLogout(false);
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
      qc.invalidateQueries({ queryKey: ["admin-login-activity"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const sessions = data?.sessions ?? [];
  const otherSessions = sessions.filter(s => !currentToken || s.sessionTokenHash !== currentToken);

  return (
    <SectionCard id="sessions">
      <SectionHeader icon={Monitor} title="Active Sessions" desc="Devices currently signed in to the admin panel" />
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex gap-2 items-center text-sm text-gray-400 py-4"><Loader2 size={14} className="animate-spin" />Loading…</div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">Unable to load active sessions.</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-gray-400 py-4">No active sessions found.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {sessions.map(s => {
                const isCurrent = currentToken ? s.sessionTokenHash === currentToken : s.id === currentSessionId;
                return (
                  <div key={s.id} className={`flex items-center gap-4 p-4 rounded-xl border ${isCurrent ? "border-emerald-200 bg-emerald-50/40" : "border-gray-100 bg-gray-50/50"}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isCurrent ? "bg-emerald-100" : "bg-gray-100"}`}>
                      {s.device?.includes("Mobile") ? <Smartphone size={18} className={isCurrent ? "text-emerald-600" : "text-gray-500"} /> : <Monitor size={18} className={isCurrent ? "text-emerald-600" : "text-gray-500"} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900">{s.device || "Unknown Device"}</p>
                        {isCurrent && (
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">This device</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {s.os} · {s.browser} · <MapPin size={10} className="inline" /> {s.location || "India"}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">Last active {fmtDate(s.lastActive)}</p>
                    </div>
                    {!isCurrent && (
                      <Btn
                        variant="danger"
                        onClick={() => revoke.mutate(s.id)}
                        loading={revoke.isPending && revoke.variables === s.id}
                      >
                        Revoke
                      </Btn>
                    )}
                  </div>
                );
              })}
            </div>
            {otherSessions.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">Sign out everywhere else</p>
                  <p className="text-xs text-gray-500">Revoke {otherSessions.length} other active session{otherSessions.length > 1 ? "s" : ""}.</p>
                </div>
                <Btn variant="danger" onClick={() => setConfirmLogout(true)}>
                  <LogOut size={14} />Log Out All Other Devices
                </Btn>
              </div>
            )}
          </>
        )}
      </div>

      {/* Confirmation modal */}
      {confirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <LogOut size={18} className="text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">Log out other devices?</p>
                <p className="text-xs text-gray-500 mt-0.5">Your current session will remain active.</p>
              </div>
            </div>
            <p className="text-sm text-gray-600">This will revoke {otherSessions.length} other session{otherSessions.length > 1 ? "s" : ""}. Those devices will be signed out immediately.</p>
            <div className="flex gap-3">
              <Btn variant="danger" onClick={() => revokeOthers.mutate()} loading={revokeOthers.isPending} className="flex-1 justify-center">
                Yes, Sign Out Others
              </Btn>
              <Btn variant="secondary" onClick={() => setConfirmLogout(false)} className="flex-1 justify-center">Cancel</Btn>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

// ─── Admin Permissions ────────────────────────────────────────────────────────
const ADMIN_MODULES_LIST = [
  { name: "Dashboard",         desc: "Platform KPIs, revenue overview, and quick stats" },
  { name: "Vendors",           desc: "Seller registration, KYC approval, and management" },
  { name: "Orders",            desc: "Order lifecycle, status changes, and fulfilment" },
  { name: "Products",          desc: "Listing approval, pricing, and catalogue control" },
  { name: "Coupons",           desc: "Discount codes, flash sales, and usage limits" },
  { name: "Customers",         desc: "Shopper accounts, addresses, and loyalty points" },
  { name: "Returns & Refunds", desc: "Return requests and refund approvals" },
  { name: "Support Tickets",   desc: "Customer support and seller dispute management" },
  { name: "Finances",          desc: "Settlements, commissions, and payouts" },
  { name: "Settings",          desc: "Platform, payment, shipping and system configuration" },
];

function PermissionsSection() {
  return (
    <SectionCard id="permissions">
      <SectionHeader icon={Users} title="Admin Permissions" desc="Module access matrix for the Super Admin role" />
      <div className="px-6 py-4">
        <div className="mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100 flex gap-2.5">
          <Shield size={14} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-800">
            <span className="font-semibold">Super Admin</span> has unrestricted access to all modules.
            Multi-admin role management with granular per-module permissions is planned for a future release.
          </p>
        </div>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                <th className="px-4 py-3 text-left">Module</th>
                <th className="px-4 py-3 text-left">Description</th>
                <th className="px-4 py-3 text-center">Access Level</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {ADMIN_MODULES_LIST.map(({ name, desc }) => (
                <tr key={name} className="hover:bg-gray-50/50">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{name}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{desc}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      <CheckCircle size={12} />Full Access
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Notification Preferences ─────────────────────────────────────────────────
const NOTIF_CATEGORIES = [
  { key: "new_order",                label: "New Order",               desc: "When a customer places an order" },
  { key: "new_vendor_registration",  label: "New Vendor Registration", desc: "Seller submits a new registration" },
  { key: "vendor_approval_required", label: "Vendor Approval Required",desc: "KYC docs submitted and awaiting review" },
  { key: "vendor_dispute",           label: "Vendor Dispute",          desc: "Seller raises a dispute or escalation" },
  { key: "refund_request",           label: "Refund Request",          desc: "Customer submits a refund request" },
  { key: "support_ticket",           label: "Support Ticket",          desc: "New support ticket opened" },
  { key: "payment_failure",          label: "Payment Failure",         desc: "A payment transaction fails" },
  { key: "shipping_issue",           label: "Shipping Issue",          desc: "Delivery or shipment problem detected" },
  { key: "system_error",             label: "System Error",            desc: "Backend or integration error alert" },
  { key: "security_login_alert",     label: "Security / Login Alert",  desc: "Admin login or access-key change" },
];

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`w-9 h-5 rounded-full relative transition-colors focus:outline-none shrink-0 ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}`}
      style={{ background: checked ? NAVY : "#E5E7EB" }}
    >
      <div
        className="w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform"
        style={{ transform: checked ? "translateX(16px)" : "translateX(2px)" }}
      />
    </button>
  );
}

function NotificationPrefsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();

  type NotifPrefs = Record<string, { email: boolean; inApp: boolean; sms: boolean }>;

  const { data, isLoading, error } = useQuery<{ prefs: NotifPrefs }>({
    queryKey: ["admin-notif-prefs"],
    queryFn: () => apiFetch("/api/admin/settings/notification-prefs"),
  });

  const save = useMutation({
    mutationFn: (prefs: NotifPrefs) =>
      apiFetch("/api/admin/settings/notification-prefs", { method: "PATCH", body: JSON.stringify({ prefs }) }),
    onSuccess: () => {
      toast({ title: "Preferences saved" });
      qc.invalidateQueries({ queryKey: ["admin-notif-prefs"] });
    },
    onError: (e: Error) => toast({ title: "Failed to save", description: e.message, variant: "destructive" }),
  });

  function toggle(catKey: string, channel: "email" | "inApp" | "sms", value: boolean) {
    if (!data?.prefs) return;
    const updated: NotifPrefs = { ...data.prefs, [catKey]: { ...data.prefs[catKey], [channel]: value } };
    save.mutate(updated);
  }

  return (
    <SectionCard id="notifications">
      <SectionHeader icon={Bell} title="Admin Notification Preferences" desc="Choose which channels receive alerts for each event category" />
      <div className="px-6 py-4">
        {isLoading ? (
          <div className="flex gap-2 items-center text-sm text-gray-400 py-4"><Loader2 size={14} className="animate-spin" />Loading…</div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">Unable to load notification preferences.</p>
        ) : (
          <>
          <div className="mb-3 p-3 rounded-lg bg-blue-50 border border-blue-100 flex gap-2.5">
            <Bell size={14} className="text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-800">
              <span className="font-semibold">In-App</span> alerts are fully wired — toggling off suppresses the admin notification bell.
              Email and SMS delivery for admin alerts is planned for Phase 3.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                  <th className="px-4 py-3 text-left">Event</th>
                  <th className="px-4 py-3 text-center w-20">Email</th>
                  <th className="px-4 py-3 text-center w-20">In-App</th>
                  <th className="px-4 py-3 text-center w-20">SMS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {NOTIF_CATEGORIES.map(({ key, label, desc }) => {
                  const pref = data?.prefs?.[key] ?? { email: true, inApp: true, sms: false };
                  return (
                    <tr key={key} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 text-sm">{label}</p>
                        <p className="text-xs text-gray-400">{desc}</p>
                      </td>
                      <td className="px-4 py-3"><div className="flex justify-center"><ToggleSwitch checked={pref.email} onChange={v => toggle(key, "email", v)} disabled={save.isPending} /></div></td>
                      <td className="px-4 py-3"><div className="flex justify-center"><ToggleSwitch checked={pref.inApp} onChange={v => toggle(key, "inApp", v)} disabled={save.isPending} /></div></td>
                      <td className="px-4 py-3"><div className="flex justify-center"><ToggleSwitch checked={pref.sms}   onChange={v => toggle(key, "sms",   v)} disabled={save.isPending} /></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
const AUDIT_MODULES = ["all", "Vendors", "Products", "Orders", "Coupons", "Settings", "Security"];

interface AuditLog {
  id: string;
  actor: string;
  action: string;
  module: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  status: string;
  createdAt: string;
}

function formatAction(action: string) {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Server hard-caps limit at 100; we page in 100-row batches when fetching all.
const AUDIT_LOG_PAGE = 10;  // rows shown per page and fetched per paginated request
const AUDIT_API_BATCH = 100; // max the server accepts per request

function AuditLogsSection() {
  const { toast } = useToast();
  const [moduleFilter, setModuleFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [offset, setOffset] = useState(0);
  const [showAll, setShowAll] = useState(false);
  // allLogs is populated by multi-page fetch when showAll is toggled on.
  const [allLogs, setAllLogs] = useState<AuditLog[] | null>(null);
  const [allLogsLoading, setAllLogsLoading] = useState(false);
  // cleared=true means the user hit "Clear view" — show empty table until they interact again.
  const [cleared, setCleared] = useState(false);
  // Monotonically-incrementing generation; loadAllLogs checks it after every await
  // so that filter changes or toggleShowAll(off) cancel in-flight multi-page fetches.
  const fetchGenRef = useRef(0);

  // Paginated query: always fetches AUDIT_LOG_PAGE rows starting at offset.
  const { data, isLoading, error } = useQuery<{ logs: AuditLog[]; total: number }>({
    queryKey: ["admin-audit-logs", moduleFilter, fromDate, toDate, offset],
    queryFn: () => {
      const params = new URLSearchParams({ limit: String(AUDIT_LOG_PAGE), offset: String(offset) });
      if (moduleFilter !== "all") params.set("module", moduleFilter);
      if (fromDate) params.set("from", fromDate);
      if (toDate) params.set("to", toDate);
      return apiFetch(`/api/admin/audit-logs?${params}`);
    },
    enabled: !cleared,
  });

  const pageLogs = data?.logs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_LOG_PAGE));
  const currentPage = Math.floor(offset / AUDIT_LOG_PAGE) + 1;

  // Fetch every record in batches of AUDIT_API_BATCH (server hard-cap per request).
  // Uses fetchGenRef to detect stale fetches: if filters change or the user collapses
  // before all pages arrive, the in-flight loop detects the generation mismatch and
  // abandons without committing partial results to state.
  async function loadAllLogs() {
    const gen = ++fetchGenRef.current;
    setAllLogsLoading(true);
    try {
      const accumulated: AuditLog[] = [];
      let batchOffset = 0;
      while (true) {
        if (fetchGenRef.current !== gen) return; // cancelled by filter change or collapse
        const params = new URLSearchParams({ limit: String(AUDIT_API_BATCH), offset: String(batchOffset) });
        if (moduleFilter !== "all") params.set("module", moduleFilter);
        if (fromDate) params.set("from", fromDate);
        if (toDate) params.set("to", toDate);
        const d: { logs: AuditLog[]; total: number } = await apiFetch(`/api/admin/audit-logs?${params}`);
        if (fetchGenRef.current !== gen) return; // cancelled after await
        accumulated.push(...(d.logs ?? []));
        // Stop when we have every record or the server returned a short page (EOF).
        if (accumulated.length >= (d.total ?? 0) || (d.logs ?? []).length < AUDIT_API_BATCH) break;
        batchOffset += AUDIT_API_BATCH;
      }
      if (fetchGenRef.current !== gen) return; // cancelled just before commit
      setAllLogs(accumulated);
    } catch {
      if (fetchGenRef.current !== gen) return; // ignore errors from cancelled fetches
      toast({ title: "Failed to load all logs", description: "Please try again.", variant: "destructive" });
      setShowAll(false);
    } finally {
      if (fetchGenRef.current === gen) setAllLogsLoading(false);
    }
  }

  async function toggleShowAll() {
    if (showAll) {
      fetchGenRef.current++; // cancel any in-flight fetch
      setShowAll(false);
      setAllLogs(null);
    } else {
      setCleared(false);
      setShowAll(true);
      await loadAllLogs();
    }
  }

  function handleClear() {
    if (window.confirm(
      "Are you sure you want to clear the audit log view?\n\n" +
      "This only clears the display — log records are preserved in the database."
    )) {
      setCleared(true);
      setShowAll(false);
      setAllLogs(null);
      toast({ title: "Audit log view cleared", description: "Records remain in the database." });
    }
  }

  function resetAndReload() {
    fetchGenRef.current++; // cancel any in-flight all-logs fetch
    setModuleFilter("all"); setFromDate(""); setToDate(""); setOffset(0);
    setShowAll(false); setAllLogs(null); setCleared(false);
  }

  function onFilterChange(setter: (v: string) => void) {
    return (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
      fetchGenRef.current++; // cancel any in-flight all-logs fetch
      setter(e.target.value); setOffset(0); setShowAll(false); setAllLogs(null); setCleared(false);
    };
  }

  // Determine what to render: cleared → empty; showAll → allLogs; else → pageLogs.
  const displayLogs: AuditLog[] = cleared ? [] : showAll ? (allLogs ?? []) : pageLogs;
  const tableLoading = showAll ? allLogsLoading : isLoading;
  const isEmpty = !tableLoading && !error && displayLogs.length === 0;

  return (
    <SectionCard id="audit-logs">
      <SectionHeader icon={BookOpen} title="Audit Logs" desc="Append-only record of all significant admin actions. Cannot be deleted." />
      <div className="px-6 py-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <select value={moduleFilter} onChange={onFilterChange(setModuleFilter)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white">
            {AUDIT_MODULES.map(m => <option key={m} value={m}>{m === "all" ? "All Modules" : m}</option>)}
          </select>
          <input type="date" value={fromDate} onChange={onFilterChange(setFromDate)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white" />
          <input type="date" value={toDate} onChange={onFilterChange(setToDate)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-blue-400 bg-white" />
          {(moduleFilter !== "all" || fromDate || toDate) && (
            <Btn variant="secondary" onClick={resetAndReload}>Clear filters</Btn>
          )}
        </div>

        {tableLoading ? (
          <div className="flex gap-2 items-center text-sm text-gray-400 py-6">
            <Loader2 size={14} className="animate-spin" />
            {showAll ? "Loading all records…" : "Loading…"}
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">Unable to load audit logs.</p>
        ) : isEmpty ? (
          <div className="text-center py-10">
            <BookOpen size={28} className="text-gray-200 mx-auto mb-2" />
            <p className="text-sm text-gray-400">
              {cleared
                ? "View cleared. Change a filter or refresh to reload."
                : total === 0
                ? "No audit logs yet. Admin actions will appear here automatically."
                : "No logs match the current filters."}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wider">
                    <th className="px-4 py-3 text-left whitespace-nowrap">Date & Time</th>
                    <th className="px-4 py-3 text-left">Admin</th>
                    <th className="px-4 py-3 text-left">Action</th>
                    <th className="px-4 py-3 text-left">Module</th>
                    <th className="px-4 py-3 text-left">IP Address</th>
                    <th className="px-4 py-3 text-left">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap text-xs">{fmtDate(log.createdAt)}</td>
                      <td className="px-4 py-3 text-gray-900 font-medium text-xs">{log.actor}</td>
                      <td className="px-4 py-3 text-gray-700 text-xs">{formatAction(log.action)}</td>
                      <td className="px-4 py-3">
                        <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">{log.module}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs font-mono">{log.ipAddress?.split(",")[0]?.trim() ?? "—"}</td>
                      <td className="px-4 py-3">
                        {log.status === "success" ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle size={11} />Success</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600"><XCircle size={11} />Failure</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                {/* Only show View All when paginated view has more rows available */}
                {!showAll && total > AUDIT_LOG_PAGE && (
                  <Btn variant="secondary" onClick={toggleShowAll}>
                    View All ({total})
                  </Btn>
                )}
                {showAll && (
                  <Btn variant="secondary" onClick={toggleShowAll}>
                    View Less
                  </Btn>
                )}
                <Btn variant="danger" onClick={handleClear}>Clear view</Btn>
              </div>
              {/* Pagination — only in page mode */}
              {!showAll && total > AUDIT_LOG_PAGE && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400">
                    Showing {offset + 1}–{Math.min(offset + AUDIT_LOG_PAGE, total)} of {total}
                  </p>
                  <Btn variant="secondary" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - AUDIT_LOG_PAGE))}>Previous</Btn>
                  <span className="text-xs text-gray-500 px-1">Page {currentPage} / {totalPages}</span>
                  <Btn variant="secondary" disabled={offset + AUDIT_LOG_PAGE >= total} onClick={() => setOffset(o => o + AUDIT_LOG_PAGE)}>Next</Btn>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

// ─── Platform Settings ────────────────────────────────────────────────────────
const COUNTRY_OPTIONS = ["India","United States","United Kingdom","Singapore","United Arab Emirates","Australia","Canada","Germany","France","Japan","Other"];
const CURRENCY_OPTIONS = ["INR","USD","GBP","EUR","AED","SGD","AUD","CAD"];
const TIMEZONE_OPTIONS = ["Asia/Kolkata","Asia/Singapore","Asia/Dubai","Asia/Tokyo","America/New_York","America/Los_Angeles","America/Chicago","Europe/London","Europe/Paris","Australia/Sydney"];
const DATE_FORMAT_OPTIONS = ["DD/MM/YYYY","MM/DD/YYYY","YYYY-MM-DD","DD-MM-YYYY","D MMM YYYY"];

type PlatformFields = {
  platform_name: string;
  platform_logo_url: string;
  country: string;
  currency: string;
  timezone: string;
  date_format: string;
  support_email: string;
  support_mobile: string;
  business_info: string;
};

const PLATFORM_DEFAULTS: PlatformFields = {
  platform_name: "TwirlDrape",
  platform_logo_url: "",
  country: "India",
  currency: "INR",
  timezone: "Asia/Kolkata",
  date_format: "DD/MM/YYYY",
  support_email: "",
  support_mobile: "",
  business_info: "",
};

function SelectInput({ value, onChange, options, disabled }: { value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white disabled:opacity-60"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

function PlatformSettingsSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<PlatformFields>(PLATFORM_DEFAULTS);
  const [editing, setEditing] = useState(false);

  const { data, isLoading } = useQuery<{ settings: PlatformFields }>({
    queryKey: ["admin-platform-settings"],
    queryFn: () => apiFetch("/api/admin/settings/platform"),
  });

  useEffect(() => {
    if (data?.settings) setForm(data.settings);
  }, [data]);

  const save = useMutation({
    mutationFn: () => apiFetch("/api/admin/settings/platform", { method: "PATCH", body: JSON.stringify(form) }),
    onSuccess: () => {
      toast({ title: "Platform settings saved", description: "Changes have been applied to the marketplace." });
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["admin-platform-settings"] });
    },
    onError: (e: Error) => toast({ title: "Save failed", description: e.message, variant: "destructive" }),
  });

  function set<K extends keyof PlatformFields>(key: K, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  return (
    <SectionCard id="platform">
      <SectionHeader icon={Globe} title="Platform Settings" desc="Marketplace name, currency, timezone and support contact details" />
      <div className="px-6 py-5">
        {isLoading ? (
          <div className="flex gap-2 items-center text-sm text-gray-400"><Loader2 size={14} className="animate-spin" />Loading…</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Platform Name */}
              <Field label="Platform Name">
                <Input value={form.platform_name} onChange={e => set("platform_name", e.target.value)} disabled={!editing} placeholder="TwirlDrape" />
              </Field>

              {/* Country */}
              <Field label="Country">
                {editing ? (
                  <SelectInput value={form.country} onChange={v => set("country", v)} options={COUNTRY_OPTIONS} />
                ) : (
                  <Input value={form.country} readOnly disabled />
                )}
              </Field>

              {/* Currency */}
              <Field label="Currency">
                {editing ? (
                  <SelectInput value={form.currency} onChange={v => set("currency", v)} options={CURRENCY_OPTIONS} />
                ) : (
                  <Input value={form.currency} readOnly disabled />
                )}
              </Field>

              {/* Timezone */}
              <Field label="Timezone">
                {editing ? (
                  <SelectInput value={form.timezone} onChange={v => set("timezone", v)} options={TIMEZONE_OPTIONS} />
                ) : (
                  <Input value={form.timezone} readOnly disabled />
                )}
              </Field>

              {/* Date Format */}
              <Field label="Date Format">
                {editing ? (
                  <SelectInput value={form.date_format} onChange={v => set("date_format", v)} options={DATE_FORMAT_OPTIONS} />
                ) : (
                  <Input value={form.date_format} readOnly disabled />
                )}
              </Field>

              {/* Support Email */}
              <Field label="Support Email">
                <Input type="email" value={form.support_email} onChange={e => set("support_email", e.target.value)} disabled={!editing} placeholder="support@twirldrape.com" />
              </Field>

              {/* Support Mobile */}
              <Field label="Support Mobile">
                <Input type="tel" value={form.support_mobile} onChange={e => set("support_mobile", e.target.value)} disabled={!editing} placeholder="+91 98765 43210" />
              </Field>

              {/* Logo URL */}
              <Field label="Logo URL">
                <Input value={form.platform_logo_url} onChange={e => set("platform_logo_url", e.target.value)} disabled={!editing} placeholder="https://example.com/logo.png" />
                {form.platform_logo_url && (
                  <img
                    src={form.platform_logo_url}
                    alt="Logo preview"
                    className="mt-2 h-10 w-auto object-contain rounded border border-gray-100 p-1 bg-gray-50"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </Field>

              {/* Business Information — full width */}
              <div className="sm:col-span-2">
                <Field label="Business Information">
                  <textarea
                    value={form.business_info}
                    onChange={e => set("business_info", e.target.value)}
                    disabled={!editing}
                    rows={3}
                    placeholder="Registered address, GSTIN, CIN, etc."
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-50 transition-all bg-white disabled:opacity-60 resize-none"
                  />
                </Field>
              </div>
            </div>

            <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
              {editing ? (
                <>
                  <Btn onClick={() => save.mutate()} loading={save.isPending}>
                    <Save size={14} />Save Changes
                  </Btn>
                  <Btn variant="secondary" onClick={() => { setEditing(false); if (data?.settings) setForm(data.settings); }}>
                    Cancel
                  </Btn>
                </>
              ) : (
                <Btn variant="secondary" onClick={() => setEditing(true)}>Edit Settings</Btn>
              )}
            </div>
          </>
        )}
      </div>
    </SectionCard>
  );
}

// ─── System & Maintenance ─────────────────────────────────────────────────────

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${ok ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`} />
  );
}

function SystemMaintenanceSection() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [confirmEnable, setConfirmEnable] = useState(false);

  const { data: health, isLoading: healthLoading, refetch, isFetching } = useQuery<{
    status: "ok" | "degraded";
    db: boolean;
    uptime: number;
    maintenanceMode: boolean;
  }>({
    queryKey: ["admin-system-health"],
    queryFn: () => apiFetch("/api/admin/settings/system-health"),
    refetchInterval: 30_000,
  });

  const toggleMaintenance = useMutation({
    mutationFn: (enabled: boolean) =>
      apiFetch("/api/admin/settings/maintenance-mode", { method: "PATCH", body: JSON.stringify({ enabled }) }),
    onSuccess: (_, enabled) => {
      toast({
        title: enabled ? "Maintenance mode enabled" : "Maintenance mode disabled",
        description: enabled
          ? "Shoppers will see a maintenance page until you disable this."
          : "The storefront is live again.",
      });
      setConfirmEnable(false);
      qc.invalidateQueries({ queryKey: ["admin-system-health"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const maintOn = health?.maintenanceMode ?? false;

  function handleToggle() {
    if (!maintOn) {
      // Enabling is destructive — require confirmation
      setConfirmEnable(true);
    } else {
      toggleMaintenance.mutate(false);
    }
  }

  return (
    <SectionCard id="system">
      <SectionHeader icon={Settings} title="System & Maintenance" desc="Monitor platform health and control storefront availability" />
      <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">

        {/* ── Health Panel ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Activity size={14} style={{ color: NAVY }} />
              <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">System Health</span>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            </button>
          </div>
          <div className="divide-y divide-gray-50">
            {healthLoading ? (
              <div className="px-4 py-6 flex gap-2 items-center text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" />Checking…
              </div>
            ) : (
              <>
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Server size={15} className="text-gray-400" />
                    <span className="text-sm text-gray-700">API Server</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot ok={true} />
                    <span className="text-xs font-medium text-emerald-700">Operational</span>
                  </div>
                </div>
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Database size={15} className="text-gray-400" />
                    <span className="text-sm text-gray-700">Database</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <StatusDot ok={health?.db ?? false} />
                    <span className={`text-xs font-medium ${health?.db ? "text-emerald-700" : "text-red-600"}`}>
                      {health?.db ? "Connected" : "Degraded"}
                    </span>
                  </div>
                </div>
                <div className="px-4 py-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Clock size={15} className="text-gray-400" />
                    <span className="text-sm text-gray-700">Uptime</span>
                  </div>
                  <span className="text-xs font-medium text-gray-600 font-mono">
                    {health ? formatUptime(health.uptime) : "—"}
                  </span>
                </div>
                <div className="px-4 py-3 bg-gray-50/40 flex items-center justify-between">
                  <span className="text-xs text-gray-400">Overall status</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${health?.status === "ok" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
                    {health?.status === "ok" ? "All Systems Go" : "Degraded"}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Maintenance Mode Card ── */}
        <div className="rounded-xl border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
            <Power size={14} style={{ color: NAVY }} />
            <span className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Maintenance Mode</span>
          </div>
          <div className="px-4 py-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-gray-900">Storefront Maintenance</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  When enabled, shoppers see a maintenance page. The admin panel remains fully accessible.
                </p>
              </div>
              <ToggleSwitch
                checked={maintOn}
                onChange={handleToggle}
                disabled={toggleMaintenance.isPending || healthLoading}
              />
            </div>

            {maintOn && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 flex gap-2">
                <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Maintenance is active.</span> Shoppers cannot place orders. Disable when maintenance is complete.
                </p>
              </div>
            )}

            {!maintOn && (
              <p className="text-xs text-gray-400 flex items-center gap-1.5">
                <CheckCircle size={12} className="text-emerald-500" />
                Storefront is live and accepting orders.
              </p>
            )}
          </div>

          {/* Inline confirmation for enabling */}
          {confirmEnable && (
            <div className="mx-4 mb-4 p-4 rounded-lg bg-red-50 border border-red-100 flex flex-col gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle size={15} className="text-red-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-800">Enable maintenance mode?</p>
                  <p className="text-xs text-red-700 mt-0.5">This will immediately block all shoppers from accessing the storefront.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Btn
                  variant="danger"
                  loading={toggleMaintenance.isPending}
                  onClick={() => toggleMaintenance.mutate(true)}
                >
                  Yes, Enable
                </Btn>
                <Btn variant="secondary" onClick={() => setConfirmEnable(false)}>Cancel</Btn>
              </div>
            </div>
          )}
        </div>
      </div>
    </SectionCard>
  );
}

// ─── Settings overview grid ───────────────────────────────────────────────────
function OverviewGrid({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
      {SECTIONS.map(({ id, label, icon: Icon, desc, phase }) => {
        const active = phase <= 3;
        return (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className="group text-left p-4 rounded-2xl border transition-all hover:shadow-md"
            style={{
              background: "white",
              borderColor: active ? "rgba(13,27,54,0.08)" : "rgba(0,0,0,0.04)",
            }}
          >
            <div className="flex items-start gap-3 mb-2">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-colors"
                style={{ background: active ? "rgba(13,27,54,0.07)" : "rgba(0,0,0,0.03)" }}
              >
                <Icon size={16} style={{ color: active ? NAVY : "#9CA3AF" }} />
              </div>
              {!active && (
                <span className="ml-auto text-xs px-1.5 py-0.5 rounded text-gray-400 bg-gray-100 font-medium" style={{ fontSize: "9px", letterSpacing: "0.05em" }}>
                  PHASE {phase}
                </span>
              )}
            </div>
            <p className="text-sm font-semibold" style={{ color: active ? NAVY : "#9CA3AF" }}>{label}</p>
            <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
            {active && (
              <div className="flex items-center gap-1 mt-3 text-xs font-medium" style={{ color: GOLD }}>
                <span>Configure</span>
                <ChevronRight size={12} />
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────
export default function AdminSettings() {
  function scrollToSection(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="max-w-5xl mx-auto">
          {/* Page header */}
          <div className="mb-6">
            <h1 className="text-xl font-bold text-gray-900">Settings</h1>
            <p className="text-sm text-gray-500 mt-0.5">Manage administrator account, security, and platform configuration.</p>
          </div>

          {/* Overview grid */}
          <OverviewGrid onNavigate={scrollToSection} />

          {/* Phase 1: functional sections */}
          <ProfileSection />
          <SecuritySection />
          <LoginActivitySection />
          <ActiveSessionsSection />

          {/* Phase 2: functional sections */}
          <PermissionsSection />
          <NotificationPrefsSection />
          <AuditLogsSection />

          {/* Phase 3: functional sections */}
          <PlatformSettingsSection />
          <SystemMaintenanceSection />

          {/* Phase 4: coming-soon stubs */}
          {[
            { id: "payment",   label: "Payment Settings",   icon: CreditCard, desc: "Cashfree integration and payment methods", phase: 4 },
            { id: "shipping",  label: "Shipping Settings",  icon: Truck,      desc: "Shiprocket and delivery configuration",    phase: 4 },
            { id: "email-sms", label: "Email & SMS Settings",icon: Mail,      desc: "Providers, OTP and sender configuration",  phase: 4 },
          ].map(({ id, label, icon, desc, phase }) => (
            <SectionCard key={id} id={id}>
              <SectionHeader icon={icon} title={label} desc={desc} />
              <ComingSoonBody phase={phase} />
            </SectionCard>
          ))}
        </div>
      </AdminLayout>
    </AdminGuard>
  );
}
