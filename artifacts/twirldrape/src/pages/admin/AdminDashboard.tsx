import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Shield, Users, CheckCircle, Clock, XCircle, LogOut } from "lucide-react";
import { motion } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const IVORY = "#FAF6EE";

type VendorStatus = "pending" | "approved" | "suspended";

interface Vendor {
  id: string;
  name: string;
  location: string;
  ownerId: string | null;
  status: VendorStatus;
  gstin: string | null;
  contactEmail: string | null;
}

export default function AdminDashboard() {
  const [, setLocation] = useLocation();
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  useEffect(() => {
    if (!adminKey) {
      setLocation("/seller/login");
      return;
    }
    fetch(`${basePath}/api/admin/vendors`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => {
        if (r.status === 403) {
          sessionStorage.removeItem("td_admin_key");
          setLocation("/seller/login");
          return null;
        }
        return r.json();
      })
      .then((data) => {
        if (data) setVendors(data.vendors ?? []);
      })
      .catch(() => setError("Failed to load vendors"))
      .finally(() => setLoading(false));
  }, [adminKey]);

  async function updateStatus(id: string, action: "approve" | "suspend") {
    setActionLoading(id + action);
    try {
      const res = await fetch(`${basePath}/api/admin/vendors/${id}/${action}`, {
        method: "POST",
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setVendors((prev) =>
          prev.map((v) => (v.id === id ? { ...v, status: data.vendor.status } : v))
        );
      }
    } finally {
      setActionLoading(null);
    }
  }

  const statusIcon = (s: VendorStatus) => {
    if (s === "approved") return <CheckCircle size={14} className="text-green-600" />;
    if (s === "pending") return <Clock size={14} className="text-amber-500" />;
    return <XCircle size={14} className="text-red-500" />;
  };

  const statusLabel = (s: VendorStatus) => {
    if (s === "approved") return "text-green-700 bg-green-50";
    if (s === "pending") return "text-amber-700 bg-amber-50";
    return "text-red-700 bg-red-50";
  };

  const pendingCount = vendors.filter((v) => v.status === "pending").length;
  const approvedCount = vendors.filter((v) => v.status === "approved").length;

  return (
    <div className="min-h-screen" style={{ background: IVORY }}>
      <header className="border-b border-[#C9A84C]/20 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: MAROON }}>
              <Shield size={17} className="text-white" />
            </div>
            <div>
              <div className="font-serif font-bold text-base" style={{ color: MAROON }}>Admin Dashboard</div>
              <div className="text-xs text-gray-400">TwirlDrape Operations</div>
            </div>
          </div>
          <button
            onClick={() => { sessionStorage.removeItem("td_admin_key"); setLocation("/admin/login"); }}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-red-600 transition-colors"
          >
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: "Total Vendors", value: vendors.length, icon: Users, color: MAROON },
            { label: "Pending Approval", value: pendingCount, icon: Clock, color: "#d97706" },
            { label: "Approved", value: approvedCount, icon: CheckCircle, color: "#16a34a" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#C9A84C]/20 p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold uppercase tracking-wider text-gray-400">{label}</span>
                <Icon size={16} style={{ color }} />
              </div>
              <div className="text-3xl font-serif font-bold" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-serif font-bold text-base" style={{ color: MAROON }}>Vendor Applications</h2>
            {pendingCount > 0 && (
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                {pendingCount} pending
              </span>
            )}
          </div>

          {loading && (
            <div className="py-16 text-center text-gray-400 text-sm">Loading vendors…</div>
          )}
          {error && (
            <div className="py-10 text-center text-red-500 text-sm">{error}</div>
          )}
          {!loading && vendors.length === 0 && (
            <div className="py-16 text-center text-gray-400 text-sm">No vendor applications yet.</div>
          )}

          {!loading && vendors.length > 0 && (
            <div className="divide-y divide-gray-50">
              {vendors.map((v) => (
                <motion.div
                  key={v.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="px-6 py-4 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-semibold text-sm" style={{ color: "#3D1515" }}>{v.name}</span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${statusLabel(v.status)}`}>
                        {statusIcon(v.status)} {v.status}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {v.location}{v.contactEmail ? ` · ${v.contactEmail}` : ""}{v.gstin ? ` · GSTIN: ${v.gstin}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {v.status !== "approved" && (
                      <button
                        disabled={actionLoading === v.id + "approve"}
                        onClick={() => updateStatus(v.id, "approve")}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        style={{ background: "#16a34a15", color: "#16a34a" }}
                      >
                        Approve
                      </button>
                    )}
                    {v.status !== "suspended" && (
                      <button
                        disabled={actionLoading === v.id + "suspend"}
                        onClick={() => updateStatus(v.id, "suspend")}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                        style={{ background: "#ef444415", color: "#dc2626" }}
                      >
                        Suspend
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
