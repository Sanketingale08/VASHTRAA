import React, { useEffect, useMemo, useState } from "react";
import {
  Plus, X, Pencil, Ban, Loader2, BadgePercent, Search,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
const NAVY = "#0D1B36";
const GOLD = "#C9A84C";

interface Coupon {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string | null;
  active: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  createdAt: string;
}

interface CouponFormState {
  code: string;
  type: "percent" | "flat";
  value: string;
  description: string;
  active: boolean;
  expiresAt: string;
  maxUses: string;
}

const emptyForm: CouponFormState = {
  code: "",
  type: "percent",
  value: "",
  description: "",
  active: true,
  expiresAt: "",
  maxUses: "",
};

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return "No expiry";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "No expiry";
  return d.toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" });
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  return !Number.isNaN(d.getTime()) && d.getTime() < Date.now();
}

function CouponFormModal({
  initial,
  title,
  submitLabel,
  saving,
  error,
  onClose,
  onSubmit,
}: {
  initial: CouponFormState;
  title: string;
  submitLabel: string;
  saving: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (form: CouponFormState) => void;
}) {
  const [form, setForm] = useState<CouponFormState>(initial);

  function update<K extends keyof CouponFormState>(key: K, value: CouponFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-base font-serif font-bold" style={{ color: NAVY }}>{title}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100 transition-colors">
            <X size={16} className="text-gray-500" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit(form);
          }}
          className="px-5 py-4 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Coupon Code
            </label>
            <input
              value={form.code}
              onChange={(e) => update("code", e.target.value.toUpperCase())}
              placeholder="e.g. FESTIVE20"
              required
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C] uppercase"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Discount Type
              </label>
              <select
                value={form.type}
                onChange={(e) => update("type", e.target.value as "percent" | "flat")}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C]"
              >
                <option value="percent">Percent (%)</option>
                <option value="flat">Flat (₹)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Value
              </label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.value}
                onChange={(e) => update("value", e.target.value)}
                placeholder={form.type === "percent" ? "e.g. 20" : "e.g. 500"}
                required
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Description
            </label>
            <input
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Shown to shoppers, optional"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Expiry Date
              </label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Max Uses
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.maxUses}
                onChange={(e) => update("maxUses", e.target.value)}
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C]"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => update("active", e.target.checked)}
              className="w-4 h-4 rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>

          {error && (
            <div className="rounded-lg px-3 py-2 text-xs bg-red-50 text-red-700 border border-red-100">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg font-semibold flex items-center gap-2 disabled:opacity-60"
              style={{ background: NAVY, color: GOLD }}
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CouponsContent() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const adminKey = typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";

  function loadCoupons() {
    setLoading(true);
    setError("");
    fetch(`/api/admin/coupons`, {
      headers: { "x-admin-key": adminKey },
      credentials: "include",
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setCoupons(d.coupons ?? []))
      .catch(() => setError("Failed to load coupons"))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCoupons();
  }, [adminKey]);

  const filtered = useMemo(() => {
    if (!search.trim()) return coupons;
    const q = search.toLowerCase();
    return coupons.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
    );
  }, [coupons, search]);

  function buildPayload(form: CouponFormState) {
    const value = parseFloat(form.value);
    const maxUses = form.maxUses.trim() ? parseInt(form.maxUses, 10) : null;
    return {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      description: form.description.trim(),
      active: form.active,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      maxUses,
    };
  }

  async function handleCreate(form: CouponFormState) {
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/coupons`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Failed to create coupon");
        return;
      }
      setCoupons((prev) => [data.coupon, ...prev]);
      setShowCreate(false);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(form: CouponFormState) {
    if (!editing) return;
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/coupons/${editing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-key": adminKey },
        credentials: "include",
        body: JSON.stringify(buildPayload(form)),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data?.error ?? "Failed to update coupon");
        return;
      }
      setCoupons((prev) => prev.map((c) => (c.id === editing.id ? data.coupon : c)));
      setEditing(null);
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(coupon: Coupon) {
    if (!confirm(`Deactivate coupon "${coupon.code}"?`)) return;
    setActionLoading(coupon.id);
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "DELETE",
        headers: { "x-admin-key": adminKey },
        credentials: "include",
      });
      if (res.ok) {
        setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, active: false } : c)));
      }
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>Coupon Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">{coupons.length} coupons total</p>
        </div>
        <button
          onClick={() => { setFormError(""); setShowCreate(true); }}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
          style={{ background: NAVY, color: GOLD }}
        >
          <Plus size={15} /> New Coupon
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <div className="relative sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or description…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-[#C9A84C]"
            />
          </div>
        </div>

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading coupons…</div>}
        {error && <div className="py-10 text-center text-red-500 text-sm">{error}</div>}

        {!loading && !error && filtered.length === 0 && (
          <div className="py-16 text-center text-gray-400 text-sm flex flex-col items-center gap-2">
            <BadgePercent size={28} className="text-gray-300" />
            No coupons match your search.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-5 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Type</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Value</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider hidden md:table-cell">Uses</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider hidden lg:table-cell">Expires</th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-bold text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((c) => {
                  const expired = isExpired(c.expiresAt);
                  const maxedOut = c.maxUses !== null && c.usedCount >= c.maxUses;
                  return (
                    <tr key={c.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-mono font-semibold text-sm" style={{ color: NAVY }}>{c.code}</div>
                        {c.description && (
                          <div className="text-xs text-gray-400 mt-0.5 max-w-[200px] truncate">{c.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-600 capitalize">{c.type}</td>
                      <td className="px-4 py-3.5 text-right text-xs font-semibold" style={{ color: NAVY }}>
                        {c.type === "percent" ? `${c.value}%` : `₹${c.value}`}
                      </td>
                      <td className="px-4 py-3.5 text-right text-xs text-gray-600 hidden md:table-cell">
                        {c.usedCount}{c.maxUses !== null ? ` / ${c.maxUses}` : ""}
                      </td>
                      <td className="px-4 py-3.5 text-xs text-gray-500 hidden lg:table-cell">
                        {formatDate(c.expiresAt)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className="inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full"
                          style={
                            !c.active
                              ? { background: "#f3f4f6", color: "#6b7280" }
                              : expired || maxedOut
                              ? { background: "#fffbeb", color: "#b45309" }
                              : { background: "#f0fdf4", color: "#15803d" }
                          }
                        >
                          {!c.active ? "Inactive" : expired ? "Expired" : maxedOut ? "Limit reached" : "Active"}
                        </span>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => { setFormError(""); setEditing(c); }}
                            className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1"
                            style={{ background: "#eff6ff", color: "#1d4ed8" }}
                          >
                            <Pencil size={11} /> Edit
                          </button>
                          {c.active && (
                            <button
                              disabled={actionLoading === c.id}
                              onClick={() => handleDeactivate(c)}
                              className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 disabled:opacity-50"
                              style={{ background: "#fef2f2", color: "#b91c1c" }}
                            >
                              <Ban size={11} /> {actionLoading === c.id ? "…" : "Deactivate"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreate && (
        <CouponFormModal
          initial={emptyForm}
          title="New Coupon"
          submitLabel="Create Coupon"
          saving={saving}
          error={formError}
          onClose={() => setShowCreate(false)}
          onSubmit={handleCreate}
        />
      )}

      {editing && (
        <CouponFormModal
          initial={{
            code: editing.code,
            type: editing.type,
            value: String(editing.value),
            description: editing.description ?? "",
            active: editing.active,
            expiresAt: toDateInputValue(editing.expiresAt),
            maxUses: editing.maxUses !== null ? String(editing.maxUses) : "",
          }}
          title={`Edit ${editing.code}`}
          submitLabel="Save Changes"
          saving={saving}
          error={formError}
          onClose={() => setEditing(null)}
          onSubmit={handleEdit}
        />
      )}
    </div>
  );
}

export default function AdminCoupons() {
  return (
    <AdminGuard>
      <AdminLayout>
        <CouponsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
