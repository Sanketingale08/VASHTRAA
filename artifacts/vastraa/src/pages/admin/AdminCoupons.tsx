import React, { useEffect, useMemo, useState, useRef } from "react";
import {
  Plus, X, Pencil, Ban, Loader2, BadgePercent, Search, RefreshCw, LayoutGrid, List,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { AdminErrorBoundary, AdminErrorState, AdminEmptyState, getFriendlyErrorMessage } from "@/components/admin/AdminErrorHandling";
import { VastraaCouponCard } from "@/components/VastraaCouponCard";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
import { adminHeaders } from '@/lib/adminApi';
const NAVY = "#0B2044";
const GOLD = "#C7CCD1";

interface Coupon {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string | null;
  offerDisplayText: string | null;
  minimumOrderValue?: number;
  maxDiscountAmount?: number | null;
  eligibleCategories?: string[] | null;
  firstOrderOnly?: boolean;
  perCustomerLimit?: number | null;
  startDate?: string | null;
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
  offerDisplayText: string;
  minimumOrderValue: string;
  maxDiscountAmount: string;
  eligibleCategories: string;
  firstOrderOnly: boolean;
  perCustomerLimit: string;
  startDate: string;
  active: boolean;
  expiresAt: string;
  maxUses: string;
}

const emptyForm: CouponFormState = {
  code: "",
  type: "percent",
  value: "",
  description: "",
  offerDisplayText: "",
  minimumOrderValue: "",
  maxDiscountAmount: "",
  eligibleCategories: "",
  firstOrderOnly: false,
  perCustomerLimit: "",
  startDate: "",
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
      <div className="w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
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
          className="px-5 py-4 space-y-4 overflow-y-auto"
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1] uppercase"
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
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
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
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
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
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Offer Display Text
              </label>
              <span className={`text-[11px] font-mono ${form.offerDisplayText.length > 120 ? "text-red-500 font-bold" : "text-gray-400"}`}>
                {form.offerDisplayText.length}/120
              </span>
            </div>
            <input
              type="text"
              maxLength={120}
              value={form.offerDisplayText}
              onChange={(e) => update("offerDisplayText", e.target.value)}
              placeholder="e.g. Flat ₹200 off on ₹4,000+ shopping"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Write the promotional message customers will see when viewing this coupon.
            </p>
          </div>

          {/* Apparent mismatch advisory warning */}
          {(() => {
            const numVal = parseFloat(form.value);
            if (!Number.isNaN(numVal) && form.offerDisplayText.trim()) {
              const text = form.offerDisplayText.toLowerCase();
              const hasRupee = text.includes("₹") || text.includes("rs") || text.includes("inr");
              const hasPercent = text.includes("%") || text.includes("percent");
              if (form.type === "percent" && hasRupee && !hasPercent) {
                return (
                  <div className="rounded-lg px-3 py-2 text-xs bg-amber-50 text-amber-800 border border-amber-200">
                    ⚠️ <strong>Note:</strong> Configured discount is {form.value}%, but offer text mentions currency. Ensure this promotional message matches your intended discount rules.
                  </div>
                );
              }
              if (form.type === "flat" && hasPercent && !hasRupee) {
                return (
                  <div className="rounded-lg px-3 py-2 text-xs bg-amber-50 text-amber-800 border border-amber-200">
                    ⚠️ <strong>Note:</strong> Configured discount is Flat ₹{form.value}, but offer text mentions percentage. Ensure this promotional message matches your intended discount rules.
                  </div>
                );
              }
            }
            return null;
          })()}

          {/* Coupon Rules Configuration */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Min Order Value (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.minimumOrderValue}
                onChange={(e) => update("minimumOrderValue", e.target.value)}
                placeholder="e.g. 4000 (0 = No min)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Max Discount Cap (₹)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={form.maxDiscountAmount}
                onChange={(e) => update("maxDiscountAmount", e.target.value)}
                placeholder="e.g. 500 (Optional)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Eligible Categories
            </label>
            <input
              type="text"
              value={form.eligibleCategories}
              onChange={(e) => update("eligibleCategories", e.target.value)}
              placeholder="e.g. Sarees, Lehengas (Leave empty for all products)"
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Start Date
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Expiry Date
              </label>
              <input
                type="date"
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Global Max Uses
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.maxUses}
                onChange={(e) => update("maxUses", e.target.value)}
                placeholder="Unlimited"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                Per Customer Limit
              </label>
              <input
                type="number"
                min={1}
                step={1}
                value={form.perCustomerLimit}
                onChange={(e) => update("perCustomerLimit", e.target.value)}
                placeholder="e.g. 1 per user"
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
              />
            </div>
          </div>

          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.firstOrderOnly}
                onChange={(e) => update("firstOrderOnly", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#0B2044]"
              />
              <span className="text-sm font-medium text-gray-700">First-Order Only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => update("active", e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-[#0B2044]"
              />
              <span className="text-sm font-medium text-gray-700">Active</span>
            </label>
          </div>

          {/* Live Card Preview (Shopper View) */}
          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between mb-2">
              <label className="block text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                Live Card Preview (Shopper View)
              </label>
              <span className="text-[10px] text-gray-400">Updates live as you type</span>
            </div>
            <div className="bg-[#F5F6F8] p-3 rounded-xl border border-gray-100">
              <VastraaCouponCard
                coupon={{
                  code: form.code.trim() || "PREVIEW20",
                  type: form.type,
                  value: Number(form.value) || (form.type === "percent" ? 15 : 200),
                  description: form.description.trim() || "Exclusive discount on all sarees",
                  offerDisplayText: form.offerDisplayText.trim() || undefined,
                  minimumOrderValue: Number(form.minimumOrderValue) || 0,
                  maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
                  eligibleCategories: form.eligibleCategories.trim()
                    ? form.eligibleCategories.split(",").map((s) => s.trim()).filter(Boolean)
                    : null,
                  firstOrderOnly: form.firstOrderOnly,
                  expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
                  maxUses: form.maxUses ? Number(form.maxUses) : null,
                  usedCount: 0,
                  active: form.active,
                }}
              />
              <div className="mt-2.5 pt-2 border-t border-gray-200/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-gray-500">
                <div>
                  <span className="text-gray-400">Code:</span>{" "}
                  <strong className="text-gray-800 font-mono">{form.code.trim() || "PREVIEW20"}</strong>
                </div>
                <div>
                  <span className="text-gray-400">Discount:</span>{" "}
                  <strong className="text-gray-800">
                    {form.type === "percent" ? `${form.value || "15"}% OFF` : `₹${form.value || "200"} OFF`}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-400">Min Order:</span>{" "}
                  <strong className="text-gray-800 font-mono">
                    {form.minimumOrderValue ? `₹${Number(form.minimumOrderValue).toLocaleString("en-IN")}` : "None"}
                  </strong>
                </div>
                <div>
                  <span className="text-gray-400">Validity:</span>{" "}
                  <strong className="text-gray-800">
                    {form.expiresAt ? formatDate(form.expiresAt) : "No expiry"}
                  </strong>
                </div>
              </div>
            </div>
          </div>

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
  const [viewMode, setViewMode] = useState<"table" | "cards">("table");
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());


  function loadCoupons() {
    setLoading(true);
    setError("");
    fetch(`/api/admin/coupons`, {
      headers: adminHeaders(),
      credentials: "include",
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          const err: any = new Error(body.error || `HTTP ${r.status}`);
          err.status = r.status;
          throw err;
        }
        return r.json();
      })
      .then((d) => setCoupons(d.coupons ?? []))
      .catch((err) => setError(getFriendlyErrorMessage(err, "Coupons")))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadCoupons();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const filtered = useMemo(() => {
    if (!search.trim()) return coupons;
    const q = search.toLowerCase();
    return coupons.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q) ||
        (c.offerDisplayText ?? "").toLowerCase().includes(q)
    );
  }, [coupons, search]);

  function buildPayload(form: CouponFormState) {
    const value = parseFloat(form.value);
    const maxUses = form.maxUses.trim() ? parseInt(form.maxUses, 10) : null;
    const trimmedOffer = form.offerDisplayText.trim();
    const minimumOrderValue = form.minimumOrderValue.trim() ? Math.max(0, parseFloat(form.minimumOrderValue)) : 0;
    const maxDiscountAmount = form.maxDiscountAmount.trim() ? Math.max(0, parseFloat(form.maxDiscountAmount)) : null;
    const perCustomerLimit = form.perCustomerLimit.trim() ? Math.max(1, parseInt(form.perCustomerLimit, 10)) : null;
    const eligibleCategories = form.eligibleCategories.trim()
      ? form.eligibleCategories.split(",").map((s) => s.trim()).filter(Boolean)
      : null;

    return {
      code: form.code.trim().toUpperCase(),
      type: form.type,
      value,
      description: form.description.trim(),
      offerDisplayText: trimmedOffer.length > 0 ? trimmedOffer : null,
      minimumOrderValue,
      maxDiscountAmount,
      eligibleCategories,
      firstOrderOnly: Boolean(form.firstOrderOnly),
      perCustomerLimit,
      startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
      active: form.active,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      maxUses,
    };
  }

  async function handleCreate(form: CouponFormState) {
    if (inFlight.current.has("createCoupon")) return;
    inFlight.current.add("createCoupon");
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/coupons`, {
        method: "POST",
        headers: adminHeaders(),
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
      inFlight.current.delete("createCoupon");
      setSaving(false);
    }
  }

  async function handleEdit(form: CouponFormState) {
    if (!editing) return;
    const key = "editCoupon:" + editing.id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setSaving(true);
    setFormError("");
    try {
      const res = await fetch(`/api/admin/coupons/${editing.id}`, {
        method: "PUT",
        headers: adminHeaders(),
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
      inFlight.current.delete(key);
      setSaving(false);
    }
  }

  async function handleDeactivate(coupon: Coupon) {
    if (!confirm(`Deactivate coupon "${coupon.code}"?`)) return;
    const key = coupon.id;
    if (inFlight.current.has(key)) return;
    inFlight.current.add(key);
    setActionLoading(key);
    try {
      const res = await fetch(`/api/admin/coupons/${coupon.id}`, {
        method: "DELETE",
        headers: adminHeaders(),
        credentials: "include",
      });
      if (res.ok) {
        setCoupons((prev) => prev.map((c) => (c.id === coupon.id ? { ...c, active: false } : c)));
      }
    } finally {
      inFlight.current.delete(key);
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
        <div className="flex items-center gap-2">
          <button
            onClick={() => loadCoupons()}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh Coupons"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={() => { setFormError(""); setShowCreate(true); }}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold"
            style={{ background: NAVY, color: GOLD }}
          >
            <Plus size={15} /> New Coupon
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search code or description…"
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-gray-200 outline-none focus:border-[#C7CCD1]"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "table" ? "bg-white text-[#0B2044] shadow-xs" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <List size={13} /> Table View
            </button>
            <button
              type="button"
              onClick={() => setViewMode("cards")}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                viewMode === "cards" ? "bg-white text-[#0B2044] shadow-xs" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <LayoutGrid size={13} /> VASTRAA Cards
            </button>
          </div>
        </div>

        {loading && <div className="py-16 text-center text-gray-400 text-sm">Loading coupons…</div>}
        {error && (
          <div className="p-4">
            <AdminErrorState
              title="Unable to load coupons"
              message={error}
              onRetry={loadCoupons}
              compact
            />
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <AdminEmptyState
            title="No coupons found"
            message={search ? "No coupons match your search filter." : "There are currently no active or created coupons."}
          />
        )}

        {!loading && !error && filtered.length > 0 && viewMode === "cards" && (
          <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-5 bg-[#F5F6F8]">
            {filtered.map((c) => {
              const expired = isExpired(c.expiresAt);
              return (
                <div key={c.id} className="space-y-2">
                  <VastraaCouponCard
                    coupon={{
                      id: c.id,
                      code: c.code,
                      type: c.type,
                      value: c.value,
                      description: c.description,
                      offerDisplayText: c.offerDisplayText,
                      minimumOrderValue: c.minimumOrderValue,
                      maxDiscountAmount: c.maxDiscountAmount,
                      eligibleCategories: c.eligibleCategories,
                      firstOrderOnly: c.firstOrderOnly,
                      perCustomerLimit: c.perCustomerLimit,
                      startDate: c.startDate,
                      expiresAt: c.expiresAt,
                      maxUses: c.maxUses,
                      usedCount: c.usedCount,
                      active: c.active,
                    }}
                    isExpired={expired || !c.active}
                  />
                  <div className="flex items-center justify-between px-2 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                        !c.active
                          ? "bg-gray-200 text-gray-600"
                          : expired
                          ? "bg-amber-100 text-amber-800"
                          : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      }`}
                    >
                      {!c.active ? "Inactive" : expired ? "Expired" : "Active"}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setFormError(""); setEditing(c); }}
                        className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors"
                      >
                        <Pencil size={11} /> Edit
                      </button>
                      {c.active && (
                        <button
                          disabled={actionLoading === c.id}
                          onClick={() => handleDeactivate(c)}
                          className="text-xs font-semibold px-2.5 py-1 rounded-md flex items-center gap-1 bg-red-50 text-red-700 hover:bg-red-100 transition-colors disabled:opacity-50"
                        >
                          <Ban size={11} /> {actionLoading === c.id ? "…" : "Deactivate"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {!loading && !error && filtered.length > 0 && viewMode === "table" && (
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
                        {c.offerDisplayText ? (
                          <div className="text-xs text-emerald-800 font-medium mt-0.5 max-w-[260px] truncate" title={c.offerDisplayText}>
                            📣 {c.offerDisplayText}
                          </div>
                        ) : c.description ? (
                          <div className="text-xs text-gray-400 mt-0.5 max-w-[260px] truncate">{c.description}</div>
                        ) : null}
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          {c.minimumOrderValue && c.minimumOrderValue > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-medium">
                              Min ₹{c.minimumOrderValue.toLocaleString("en-IN")}
                            </span>
                          ) : null}
                          {c.maxDiscountAmount && c.maxDiscountAmount > 0 ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                              Cap ₹{c.maxDiscountAmount.toLocaleString("en-IN")}
                            </span>
                          ) : null}
                          {c.firstOrderOnly ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-50 text-purple-800 border border-purple-200 font-medium">
                              1st Order
                            </span>
                          ) : null}
                        </div>
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
            offerDisplayText: editing.offerDisplayText ?? "",
            minimumOrderValue: editing.minimumOrderValue ? String(editing.minimumOrderValue) : "",
            maxDiscountAmount: editing.maxDiscountAmount ? String(editing.maxDiscountAmount) : "",
            eligibleCategories: Array.isArray(editing.eligibleCategories) ? editing.eligibleCategories.join(", ") : (editing.eligibleCategories || ""),
            firstOrderOnly: Boolean(editing.firstOrderOnly),
            perCustomerLimit: editing.perCustomerLimit ? String(editing.perCustomerLimit) : "",
            startDate: toDateInputValue(editing.startDate ?? null),
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
        <AdminErrorBoundary sectionName="Coupons">
          <CouponsContent />
        </AdminErrorBoundary>
      </AdminLayout>
    </AdminGuard>
  );
}
