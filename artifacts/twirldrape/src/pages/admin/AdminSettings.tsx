import React, { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  User, Shield, Clock, Monitor, Users, Bell, Globe, CreditCard,
  Truck, Mail, Settings, BookOpen, Eye, EyeOff, Loader2, CheckCircle,
  XCircle, ChevronRight, LogOut, AlertTriangle, Lock, Smartphone,
  MapPin, Chrome, X,
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
    throw new Error(body.error ?? `HTTP ${r.status}`);
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

// ─── Security & Access ────────────────────────────────────────────────────────
function SecuritySection() {
  const [showKeyModal, setShowKeyModal] = useState(false);
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
              <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "rgba(201,168,76,0.12)", color: "#9a7a30" }}>Coming Soon</span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">Add an extra layer of security to admin login.</p>
          </div>
          <div className="w-10 h-5 rounded-full bg-gray-200 relative shrink-0 opacity-40 cursor-not-allowed">
            <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 left-0.5 shadow-sm" />
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
            <p className="text-xs text-gray-500 mt-0.5">Key-based authentication is active.</p>
          </div>
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle size={15} />
            <span className="text-xs font-medium">Active</span>
          </div>
        </div>
      </div>
      {showKeyModal && <ChangeKeyModal onClose={() => setShowKeyModal(false)} />}
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

// ─── Settings overview grid ───────────────────────────────────────────────────
function OverviewGrid({ onNavigate }: { onNavigate: (id: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mb-8">
      {SECTIONS.map(({ id, label, icon: Icon, desc, phase }) => {
        const active = phase === 1;
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

          {/* Phase 2–4: coming-soon stubs */}
          {[
            { id: "permissions",   label: "Admin Permissions",    icon: Users,       desc: "Module access and role management",        phase: 2 },
            { id: "notifications", label: "Notifications",         icon: Bell,        desc: "Admin alert preferences by channel",       phase: 2 },
            { id: "audit-logs",    label: "Audit Logs",            icon: BookOpen,    desc: "Append-only record of admin actions",      phase: 2 },
            { id: "platform",      label: "Platform Settings",     icon: Globe,       desc: "Name, currency, timezone and support info", phase: 3 },
            { id: "system",        label: "System & Maintenance",  icon: Settings,    desc: "Maintenance mode and system health",       phase: 3 },
            { id: "payment",       label: "Payment Settings",      icon: CreditCard,  desc: "Cashfree integration and payment methods", phase: 4 },
            { id: "shipping",      label: "Shipping Settings",     icon: Truck,       desc: "Shiprocket and delivery configuration",    phase: 4 },
            { id: "email-sms",     label: "Email & SMS Settings",  icon: Mail,        desc: "Providers, OTP and sender configuration",  phase: 4 },
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
