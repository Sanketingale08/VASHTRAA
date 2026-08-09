import React, { useEffect, useState, useRef } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft, MapPin, Mail, FileText, Star, Package, ShoppingBag,
  CheckCircle, Clock, XCircle, Truck, RotateCcw, IndianRupee, BadgeCheck,
  Phone, Landmark, Home,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

interface VendorDetail {
  id: string;
  name: string;
  location: string;
  rating: number;
  sareesCount: number;
  avatar: string;
  bio: string | null;
  tagline: string | null;
  contactEmail: string | null;
  gstin: string | null;
  status: string;
  ownerId: string | null;
  kycVerified: boolean;
  kycResubmissionRequested: boolean;
  mobile: string | null;
  panNumber: string | null;
  panCardUrl: string | null;
  gstCertUrl: string | null;
  bankHolder: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankIfsc: string | null;
  shopStreet: string | null;
  shopCity: string | null;
  shopState: string | null;
  shopPincode: string | null;
  termsAcceptedAt: string | null;
  featured: boolean;
  totalProducts: number;
  activeProducts: number;
  totalRevenue: number;
  commissionEarned: number;
  statusBreakdown: Record<string, number>;
  monthlyRevenue: { month: string; revenue: number }[];
}

function fmt(n: number) {
  if (n >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${n}`;
}

function fmtMonth(m: string) {
  const [year, month] = m.split("-");
  return new Date(parseInt(year), parseInt(month) - 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    approved: { bg: "#f0fdf4", color: "#15803d" },
    pending: { bg: "#fffbeb", color: "#b45309" },
    suspended: { bg: "#fef2f2", color: "#b91c1c" },
  };
  const s = map[status] ?? { bg: "#f3f4f6", color: "#6b7280" };
  return (
    <span
      className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
      style={{ background: s.bg, color: s.color }}
    >
      {status}
    </span>
  );
}

function KycBadge({ kycVerified, kycResubmissionRequested }: { kycVerified: boolean; kycResubmissionRequested: boolean }) {
  const s = kycVerified
    ? { bg: "#f0fdf4", color: "#15803d", label: "Verified" }
    : kycResubmissionRequested
      ? { bg: "#fffbeb", color: "#b45309", label: "Re-submission requested" }
      : { bg: "#f3f4f6", color: "#6b7280", label: "Pending" };
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

const ORDER_STATUS_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  confirmed: { label: "Confirmed", color: "#3B82F6", icon: <Clock size={14} /> },
  dispatched: { label: "Dispatched", color: GOLD, icon: <Truck size={14} /> },
  delivered: { label: "Delivered", color: "#10B981", icon: <CheckCircle size={14} /> },
  cancelled: { label: "Cancelled", color: "#EF4444", icon: <XCircle size={14} /> },
  returned: { label: "Returned", color: "#8B5CF6", icon: <RotateCcw size={14} /> },
};

function KycDocButton({ label, objectPath, adminKey, className }: {
  label: string; objectPath: string; adminKey: string; className: string;
}) {
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/storage/signed-url?path=${encodeURIComponent(objectPath)}`,
        { headers: { "x-admin-key": adminKey } }
      );
      if (!res.ok) { alert("Could not load document — access denied or file missing."); return; }
      const { signedUrl } = await res.json();
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch { alert("Network error loading document."); }
    finally { setLoading(false); }
  }
  return (
    <button onClick={open} disabled={loading}
      className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-60 ${className}`}>
      {loading ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" /> : <FileText size={12} />}
      {label}
    </button>
  );
}

function VendorDetailContent() {
  const [, setLocation] = useLocation();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [vendor, setVendor] = useState<VendorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`/api/admin/vendors/${id}`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setVendor(d);
      })
      .catch(() => setError("Failed to load vendor details"))
      .finally(() => setLoading(false));
  }, [id, adminKey]);

  async function doAction(action: string) {
    if (!vendor) return;
    if (inFlight.current.has(action)) return;
    inFlight.current.add(action);
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}/${action}`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setVendor((prev) => prev ? {
          ...prev,
          status: data.vendor.status ?? prev.status,
          featured: data.vendor.featured ?? prev.featured,
        } : prev);
      }
    } finally {
      inFlight.current.delete(action);
      setActionLoading(null);
    }
  }

  async function doKycAction(action: "verify" | "request_resubmission") {
    if (!vendor) return;
    if (inFlight.current.has(action)) return;
    inFlight.current.add(action);
    setActionLoading(action);
    try {
      const res = await fetch(`/api/admin/vendors/${vendor.id}/kyc`, {
        method: "PATCH",
        headers: { "x-admin-key": adminKey, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        const data = await res.json();
        setVendor((prev) => prev
          ? { ...prev, kycVerified: data.vendor.kycVerified, kycResubmissionRequested: data.vendor.kycResubmissionRequested }
          : prev);
      }
    } finally {
      inFlight.current.delete(action);
      setActionLoading(null);
    }
  }

  const totalOrders = vendor
    ? Object.values(vendor.statusBreakdown).reduce((s, v) => s + v, 0)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setLocation("/admin/vendors")}
          className="p-2 rounded-xl hover:bg-white border border-transparent hover:border-gray-200 transition-all"
        >
          <ArrowLeft size={16} className="text-gray-500" />
        </button>
        <div>
          <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>
            {vendor?.name ?? "Vendor Detail"}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Vendor profile & performance</p>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-2xl border border-gray-200 p-16 text-center text-gray-400 text-sm animate-pulse">
          Loading vendor details…
        </div>
      )}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">{error}</div>
      )}

      {vendor && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <div className="flex items-start gap-4 mb-5">
                <img
                  src={vendor.avatar}
                  alt={vendor.name}
                  className="w-14 h-14 rounded-xl object-cover border border-gray-100"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-serif font-bold text-base" style={{ color: NAVY }}>{vendor.name}</h2>
                    <StatusBadge status={vendor.status} />
                  </div>
                  {vendor.tagline && (
                    <p className="text-xs text-gray-500 mt-0.5 italic">{vendor.tagline}</p>
                  )}
                </div>
              </div>

              <div className="space-y-2.5 text-sm">
                <div className="flex items-center gap-2.5 text-gray-600">
                  <MapPin size={13} className="shrink-0 text-gray-400" />
                  <span className="text-xs">{vendor.location}</span>
                </div>
                {vendor.contactEmail && (
                  <div className="flex items-center gap-2.5 text-gray-600">
                    <Mail size={13} className="shrink-0 text-gray-400" />
                    <span className="text-xs truncate">{vendor.contactEmail}</span>
                  </div>
                )}
                {vendor.gstin && (
                  <div className="flex items-center gap-2.5 text-gray-600">
                    <FileText size={13} className="shrink-0 text-gray-400" />
                    <span className="text-xs font-mono">{vendor.gstin}</span>
                  </div>
                )}
                <div className="flex items-center gap-2.5">
                  <Star size={13} className="shrink-0 text-emerald-600" fill="currentColor" />
                  <span className="text-xs text-gray-600">{vendor.rating.toFixed(1)} rating</span>
                </div>
              </div>

              {vendor.bio && (
                <p className="text-xs text-gray-500 mt-4 leading-relaxed border-t border-gray-100 pt-4">
                  {vendor.bio}
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Admin Actions</h3>
              {vendor.status === "pending" && (
                <>
                  <ActionBtn label="✓ Approve Vendor" action="approve" color="#15803d" bg="#f0fdf4" loading={actionLoading} onClick={doAction} />
                  <ActionBtn label="✗ Reject Vendor" action="reject" color="#b91c1c" bg="#fef2f2" loading={actionLoading} onClick={doAction} />
                </>
              )}
              {vendor.status === "approved" && (
                <>
                  <ActionBtn label="Suspend Vendor" action="suspend" color="#b91c1c" bg="#fef2f2" loading={actionLoading} onClick={doAction} />
                  <ActionBtn label="Deactivate Vendor" action="deactivate" color="#7c3aed" bg="#f5f3ff" loading={actionLoading} onClick={doAction} />
                </>
              )}
              {vendor.status === "suspended" && (
                <ActionBtn label="✓ Activate Vendor" action="activate" color="#15803d" bg="#f0fdf4" loading={actionLoading} onClick={doAction} />
              )}
              <div className="pt-1 mt-1 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-gray-400">Featured on homepage</span>
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={vendor.featured ? { background: "#fef9ec", color: "#b45309" } : { background: "#f3f4f6", color: "#6b7280" }}
                  >
                    {vendor.featured ? "⭐ Featured" : "Not featured"}
                  </span>
                </div>
                {vendor.featured ? (
                  <ActionBtn label="Remove from Featured" action="unfeature" color="#6b7280" bg="#f3f4f6" loading={actionLoading} onClick={doAction} />
                ) : (
                  <ActionBtn label="⭐ Mark as Featured" action="feature" color="#b45309" bg="#fef9ec" loading={actionLoading} onClick={doAction} />
                )}
              </div>
              <div className="pt-1 mt-1 border-t border-gray-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] text-gray-400">KYC status</span>
                  <KycBadge kycVerified={vendor.kycVerified} kycResubmissionRequested={vendor.kycResubmissionRequested} />
                </div>
                <div className="space-y-2.5">
                  <ActionBtn
                    label="✓ Mark KYC Verified"
                    action="verify"
                    color="#15803d"
                    bg="#f0fdf4"
                    loading={actionLoading}
                    onClick={() => doKycAction("verify")}
                    disabled={vendor.kycVerified}
                  />
                  <ActionBtn
                    label="Request Re-submission"
                    action="request_resubmission"
                    color="#b45309"
                    bg="#fffbeb"
                    loading={actionLoading}
                    onClick={() => doKycAction("request_resubmission")}
                    disabled={vendor.kycResubmissionRequested && !vendor.kycVerified}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Total Revenue", value: fmt(vendor.totalRevenue), icon: IndianRupee, color: GOLD, bg: "rgba(201,168,76,0.1)" },
                { label: "Commission", value: fmt(vendor.commissionEarned), icon: BadgeCheck, color: "#8B5CF6", bg: "rgba(139,92,246,0.1)" },
                { label: "Products", value: `${vendor.activeProducts}/${vendor.totalProducts}`, icon: Package, color: "#10B981", bg: "rgba(16,185,129,0.1)" },
                { label: "Total Orders", value: totalOrders, icon: ShoppingBag, color: "#3B82F6", bg: "rgba(59,130,246,0.1)" },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: bg }}>
                      <Icon size={14} style={{ color }} />
                    </div>
                  </div>
                  <div className="text-xl font-serif font-bold" style={{ color: NAVY }}>{value}</div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-serif font-bold text-base mb-5" style={{ color: NAVY }}>Order Status Breakdown</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {Object.entries(ORDER_STATUS_META).map(([key, meta]) => {
                  const count = vendor.statusBreakdown[key] ?? 0;
                  return (
                    <div key={key} className="text-center rounded-xl p-3 border border-gray-100">
                      <div className="flex justify-center mb-1.5" style={{ color: meta.color }}>{meta.icon}</div>
                      <div className="text-xl font-serif font-bold" style={{ color: NAVY }}>{count}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{meta.label}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
              <h3 className="font-serif font-bold text-base mb-4" style={{ color: NAVY }}>Registration Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {[
                  { icon: Phone, label: "Mobile", value: vendor.mobile ? `+91 ${vendor.mobile}` : null },
                  { icon: FileText, label: "PAN Number", value: vendor.panNumber },
                  { icon: Landmark, label: "Bank", value: vendor.bankName ? `${vendor.bankName}` : null },
                  { icon: Landmark, label: "Account", value: vendor.bankAccount ? `••••${vendor.bankAccount.slice(-4)} (${vendor.bankIfsc ?? ""})` : null },
                  { icon: Landmark, label: "Account Holder", value: vendor.bankHolder },
                  { icon: Home, label: "Shop Address", value: [vendor.shopStreet, vendor.shopCity, vendor.shopState, vendor.shopPincode].filter(Boolean).join(", ") || null },
                  { icon: CheckCircle, label: "Terms Accepted", value: vendor.termsAcceptedAt ? new Date(vendor.termsAcceptedAt).toLocaleDateString("en-IN") : "Not accepted" },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-start gap-2.5 p-2.5 rounded-xl bg-gray-50">
                    <Icon size={13} className="mt-0.5 shrink-0 text-gray-400" />
                    <div className="min-w-0">
                      <p className="text-xs text-gray-400">{label}</p>
                      <p className={`text-xs font-semibold truncate ${value ? "text-gray-700" : "text-gray-300 italic"}`}>
                        {value ?? "Not provided"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              {(vendor.panCardUrl || vendor.gstCertUrl) && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">KYC Documents</p>
                  <div className="flex flex-wrap gap-2">
                    {vendor.panCardUrl && (
                      <KycDocButton label="View PAN Card" objectPath={vendor.panCardUrl} adminKey={adminKey}
                        className="text-[#1d4ed8] border-[#bfdbfe] hover:bg-blue-50" />
                    )}
                    {vendor.gstCertUrl && (
                      <KycDocButton label="View GST Certificate" objectPath={vendor.gstCertUrl} adminKey={adminKey}
                        className="text-[#166534] border-[#bbf7d0] hover:bg-green-50" />
                    )}
                  </div>
                </div>
              )}
            </div>

            {vendor.monthlyRevenue.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <h3 className="font-serif font-bold text-base mb-5" style={{ color: NAVY }}>Monthly Revenue</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={vendor.monthlyRevenue} margin={{ top: 5, right: 5, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="month" tickFormatter={fmtMonth} tick={{ fontSize: 10, fill: "#9CA3AF" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#9CA3AF" }} tickFormatter={fmt} width={50} />
                    <Tooltip
                      formatter={(v: number) => [fmt(v), "Revenue"]}
                      labelFormatter={fmtMonth}
                      contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e5e7eb" }}
                    />
                    <Bar dataKey="revenue" fill={GOLD} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  label, action, color, bg, loading, onClick, disabled,
}: {
  label: string; action: string; color: string; bg: string;
  loading: string | null; onClick: (action: string) => void; disabled?: boolean;
}) {
  const isLoading = loading === action;
  return (
    <button
      disabled={isLoading || disabled}
      onClick={() => onClick(action)}
      className="w-full py-2.5 text-xs font-semibold rounded-xl transition-all disabled:opacity-50 text-left px-4"
      style={{ background: bg, color }}
    >
      {isLoading ? "Processing…" : label}
    </button>
  );
}

export default function AdminVendorDetail() {
  return (
    <AdminGuard>
      <AdminLayout>
        <VendorDetailContent />
      </AdminLayout>
    </AdminGuard>
  );
}
