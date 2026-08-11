import React, { useState, useCallback, useEffect } from "react";
import { useUser } from "@clerk/react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CreditCard,
  Smartphone,
  Plus,
  Trash2,
  Star,
  Loader2,
  CheckCircle,
  X,
  AlertTriangle,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { useToast } from "@/hooks/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type PaymentMethod = {
  id: string;
  type: "card" | "upi";
  // card fields
  cardBrand?: string | null;
  last4?: string | null;
  cardholderName?: string | null;
  expiryMonth?: number | null;
  expiryYear?: number | null;
  // upi fields
  upiId?: string | null;
  upiHandle?: string | null;
  isDefault: boolean;
  createdAt: string;
};

// ─── Validation helpers (mirrors server) ──────────────────────────────────────

function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (alt) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function detectBrand(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n) || /^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)\d/.test(n)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^(508[5-9]|6069[0-9]{2}|607[0-9]{3}|608[0-9]{3})/.test(n) || /^(6521|6522)/.test(n)) return "RuPay";
  if (/^6011|^65|^64[4-9]/.test(n)) return "Discover";
  return "Card";
}

function isExpiryValid(month: number, year: number): boolean {
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const cy = now.getFullYear();
  const cm = now.getMonth() + 1;
  if (year < cy) return false;
  if (year === cy && month < cm) return false;
  return true;
}

function isCvvValid(cvv: string, brand: string): boolean {
  const len = brand === "Amex" ? 4 : 3;
  return new RegExp(`^\\d{${len}}$`).test(cvv);
}

const UPI_RE = /^[\w.\-]+@[\w.\-]+$/;

// ─── Brand icon ───────────────────────────────────────────────────────────────

function BrandBadge({ brand }: { brand?: string | null }) {
  const COLORS: Record<string, string> = {
    Visa: "bg-blue-600",
    Mastercard: "bg-orange-500",
    Amex: "bg-green-600",
    RuPay: "bg-[#1E6B5A]",
    Discover: "bg-amber-500",
    Card: "bg-gray-500",
  };
  const b = brand ?? "Card";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold text-white ${COLORS[b] ?? "bg-gray-500"}`}>
      {b}
    </span>
  );
}

// ─── Card form ────────────────────────────────────────────────────────────────

type CardForm = {
  cardholderName: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  isDefault: boolean;
};

const emptyCardForm: CardForm = {
  cardholderName: "",
  cardNumber: "",
  expiryMonth: "",
  expiryYear: "",
  cvv: "",
  isDefault: false,
};

function AddCardForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<CardForm>(emptyCardForm);
  const [errors, setErrors] = useState<Partial<Record<keyof CardForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const brand = detectBrand(form.cardNumber);
  const cvvLen = brand === "Amex" ? 4 : 3;

  function set<K extends keyof CardForm>(key: K, value: CardForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => { const n = { ...e }; delete n[key]; return n; });
  }

  function validate(): boolean {
    const e: Partial<Record<keyof CardForm, string>> = {};
    if (!form.cardholderName.trim()) e.cardholderName = "Cardholder name is required";
    if (!luhn(form.cardNumber)) e.cardNumber = "Invalid card number";
    const month = parseInt(form.expiryMonth, 10);
    const year = parseInt(form.expiryYear, 10);
    if (!form.expiryMonth || !form.expiryYear || !isExpiryValid(month, year))
      e.expiryMonth = "Card is expired or expiry is invalid";
    if (!isCvvValid(form.cvv, brand))
      e.cvv = `CVV must be ${cvvLen} digits`;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "card",
          cardNumber: form.cardNumber,
          cardholderName: form.cardholderName,
          expiryMonth: parseInt(form.expiryMonth, 10),
          expiryYear: parseInt(form.expiryYear, 10),
          cvv: form.cvv,
          isDefault: form.isDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          toast({ title: "Already saved", description: data.error, variant: "destructive" });
        } else {
          toast({ title: "Couldn't save card", description: data.error ?? "Please try again", variant: "destructive" });
        }
        return;
      }
      toast({ title: "Card saved", description: `${brand} ending in ${form.cardNumber.replace(/\D/g, "").slice(-4)} was added` });
      onSuccess();
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 15 }, (_, i) => currentYear + i);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="bg-white rounded-xl border border-[#C9A84C]/20 p-5 mb-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#1E6B5A] text-sm flex items-center gap-2">
          <CreditCard size={15} />
          Add New Card
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Cardholder name */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Cardholder Name *
          </label>
          <input
            value={form.cardholderName}
            onChange={(e) => set("cardholderName", e.target.value)}
            placeholder="Priya Sharma"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors ${errors.cardholderName ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
          />
          {errors.cardholderName && <p className="text-red-500 text-xs mt-1">{errors.cardholderName}</p>}
        </div>

        {/* Card number */}
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            Card Number *
          </label>
          <div className="relative">
            <input
              value={form.cardNumber}
              onChange={(e) => set("cardNumber", e.target.value.replace(/\D/g, "").slice(0, 19))}
              placeholder="4242 4242 4242 4242"
              maxLength={19}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors pr-20 ${errors.cardNumber ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
            />
            {form.cardNumber.length >= 1 && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                <BrandBadge brand={brand} />
              </div>
            )}
          </div>
          {errors.cardNumber && <p className="text-red-500 text-xs mt-1">{errors.cardNumber}</p>}
        </div>

        {/* Expiry + CVV */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Month *
            </label>
            <select
              value={form.expiryMonth}
              onChange={(e) => set("expiryMonth", e.target.value)}
              className={`w-full border rounded-lg px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors ${errors.expiryMonth ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
            >
              <option value="">MM</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              Year *
            </label>
            <select
              value={form.expiryYear}
              onChange={(e) => set("expiryYear", e.target.value)}
              className={`w-full border rounded-lg px-2 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors ${errors.expiryMonth ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
            >
              <option value="">YYYY</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
              CVV *
            </label>
            <input
              value={form.cvv}
              onChange={(e) => set("cvv", e.target.value.replace(/\D/g, "").slice(0, cvvLen))}
              placeholder={"•".repeat(cvvLen)}
              maxLength={cvvLen}
              type="password"
              className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors ${errors.cvv ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
            />
          </div>
          {(errors.expiryMonth || errors.cvv) && (
            <p className="col-span-3 text-red-500 text-xs -mt-2">
              {errors.expiryMonth || errors.cvv}
            </p>
          )}
        </div>

        {/* Default checkbox */}
        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={form.isDefault}
            onChange={(e) => set("isDefault", e.target.checked)}
            className="w-4 h-4 accent-[#1E6B5A] cursor-pointer"
          />
          <span className="text-sm text-gray-600 group-hover:text-[#1E6B5A] transition-colors">
            Set as default payment method
          </span>
        </label>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 border border-[#C9A84C]/40 text-[#1E6B5A] font-bold uppercase tracking-wider text-xs rounded-sm hover:border-[#C9A84C] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-[2] bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-60 text-[#F3F8F5] py-2.5 font-bold uppercase tracking-wider text-xs rounded-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save Card"}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─── UPI form ─────────────────────────────────────────────────────────────────

function AddUpiForm({
  onSuccess,
  onCancel,
}: {
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const { toast } = useToast();
  const [upiId, setUpiId] = useState("");
  const [isDefault, setIsDefault] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const val = upiId.trim().toLowerCase();
    if (!UPI_RE.test(val)) {
      setError("Invalid UPI ID. Expected format: username@handle (e.g. name@oksbi)");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/payment-methods", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "upi", upiId: val, isDefault }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          toast({ title: "Already saved", description: data.error, variant: "destructive" });
        } else {
          toast({ title: "Couldn't save UPI ID", description: data.error ?? "Please try again", variant: "destructive" });
        }
        return;
      }
      toast({ title: "UPI ID saved", description: `${val} was added to your account` });
      onSuccess();
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      className="bg-white rounded-xl border border-[#C9A84C]/20 p-5 mb-4"
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-[#1E6B5A] text-sm flex items-center gap-2">
          <Smartphone size={15} />
          Add UPI ID
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X size={16} />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
            UPI ID *
          </label>
          <input
            value={upiId}
            onChange={(e) => { setUpiId(e.target.value); setError(""); }}
            placeholder="name@oksbi"
            className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#1E6B5A]/20 focus:border-[#1E6B5A] transition-colors ${error ? "border-red-400 bg-red-50" : "border-[#C9A84C]/30"}`}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            Examples: name@paytm · name@oksbi · name@ybl · name@upi
          </p>
          {error && (
            <p className="text-red-500 text-xs mt-1 flex items-center gap-1">
              <AlertTriangle size={11} />{error}
            </p>
          )}
        </div>

        <label className="flex items-center gap-2.5 cursor-pointer group">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
            className="w-4 h-4 accent-[#1E6B5A] cursor-pointer"
          />
          <span className="text-sm text-gray-600 group-hover:text-[#1E6B5A] transition-colors">
            Set as default payment method
          </span>
        </label>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 border border-[#C9A84C]/40 text-[#1E6B5A] font-bold uppercase tracking-wider text-xs rounded-sm hover:border-[#C9A84C] transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="flex-[2] bg-[#1E6B5A] hover:bg-[#6a1826] disabled:opacity-60 text-[#F3F8F5] py-2.5 font-bold uppercase tracking-wider text-xs rounded-sm flex items-center justify-center gap-2 transition-colors"
          >
            {saving ? <><Loader2 size={13} className="animate-spin" /> Saving…</> : "Save UPI ID"}
          </button>
        </div>
      </form>
    </motion.div>
  );
}

// ─── Delete confirmation dialog ───────────────────────────────────────────────

function DeleteDialog({
  method,
  onConfirm,
  onCancel,
  deleting,
}: {
  method: PaymentMethod;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}) {
  const label =
    method.type === "card"
      ? `${method.cardBrand} ending in ${method.last4}`
      : method.upiId ?? "this UPI ID";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white rounded-2xl shadow-xl border border-[#C9A84C]/20 p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <Trash2 size={20} className="text-red-500" />
        </div>
        <h3 className="font-serif text-lg font-bold text-[#1E6B5A] text-center mb-2">
          Remove Payment Method?
        </h3>
        <p className="text-sm text-gray-500 text-center mb-5">
          Are you sure you want to remove{" "}
          <span className="font-semibold text-[#3D1A1A]">{label}</span>?
          This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-[#C9A84C]/40 text-[#1E6B5A] font-bold uppercase tracking-wider text-xs rounded-sm hover:border-[#C9A84C] transition-colors"
          >
            Keep It
          </button>
          <button
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-500 hover:bg-red-600 disabled:opacity-60 text-white py-2.5 font-bold uppercase tracking-wider text-xs rounded-sm flex items-center justify-center gap-2 transition-colors"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
            {deleting ? "Removing…" : "Remove"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Card row ─────────────────────────────────────────────────────────────────

function CardRow({
  method,
  onSetDefault,
  onDelete,
  settingDefault,
}: {
  method: PaymentMethod;
  onSetDefault: (id: string) => void;
  onDelete: (method: PaymentMethod) => void;
  settingDefault: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={`bg-white rounded-xl border p-4 transition-all ${method.isDefault ? "border-[#1E6B5A]/40 shadow-sm" : "border-[#C9A84C]/20"}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1E6B5A]/5 flex items-center justify-center shrink-0">
          <CreditCard size={18} className="text-[#1E6B5A]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <BrandBadge brand={method.cardBrand} />
            <span className="font-mono text-sm text-[#3D1A1A] font-semibold tracking-wider">
              •••• •••• •••• {method.last4}
            </span>
            {method.isDefault && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1E6B5A] bg-[#1E6B5A]/8 px-2 py-0.5 rounded-full border border-[#1E6B5A]/20">
                <CheckCircle size={10} />
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{method.cardholderName}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            Expires {String(method.expiryMonth).padStart(2, "0")}/{String(method.expiryYear).slice(-2)}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!method.isDefault && (
            <button
              onClick={() => onSetDefault(method.id)}
              disabled={settingDefault === method.id}
              title="Set as default"
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#C9A84C] hover:bg-[#C9A84C]/5 transition-colors disabled:opacity-50"
            >
              {settingDefault === method.id
                ? <Loader2 size={15} className="animate-spin" />
                : <Star size={15} />
              }
            </button>
          )}
          <button
            onClick={() => onDelete(method)}
            title="Remove"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── UPI row ─────────────────────────────────────────────────────────────────

function UpiRow({
  method,
  onSetDefault,
  onDelete,
  settingDefault,
}: {
  method: PaymentMethod;
  onSetDefault: (id: string) => void;
  onDelete: (method: PaymentMethod) => void;
  settingDefault: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className={`bg-white rounded-xl border p-4 transition-all ${method.isDefault ? "border-[#1E6B5A]/40 shadow-sm" : "border-[#C9A84C]/20"}`}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-[#1E6B5A]/5 flex items-center justify-center shrink-0">
          <Smartphone size={18} className="text-[#1E6B5A]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-[#3D1A1A] font-mono">{method.upiId}</span>
            {method.isDefault && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1E6B5A] bg-[#1E6B5A]/8 px-2 py-0.5 rounded-full border border-[#1E6B5A]/20">
                <CheckCircle size={10} />
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400">UPI · @{method.upiHandle}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {!method.isDefault && (
            <button
              onClick={() => onSetDefault(method.id)}
              disabled={settingDefault === method.id}
              title="Set as default"
              className="p-1.5 rounded-lg text-gray-400 hover:text-[#C9A84C] hover:bg-[#C9A84C]/5 transition-colors disabled:opacity-50"
            >
              {settingDefault === method.id
                ? <Loader2 size={15} className="animate-spin" />
                : <Star size={15} />
              }
            </button>
          )}
          <button
            onClick={() => onDelete(method)}
            title="Remove"
            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function AccountPaymentMethodsPage() {
  const { isSignedIn, isLoaded } = useUser();
  const { toast } = useToast();

  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [showCardForm, setShowCardForm] = useState(false);
  const [showUpiForm, setShowUpiForm] = useState(false);

  const [settingDefault, setSettingDefault] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentMethod | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchMethods = useCallback(async () => {
    try {
      const res = await fetch("/api/payment-methods", { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setMethods(data.paymentMethods ?? []);
      setLoadError("");
    } catch {
      setLoadError("Could not load your payment methods. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isLoaded && isSignedIn) fetchMethods();
    else if (isLoaded) setLoading(false);
  }, [isLoaded, isSignedIn, fetchMethods]);

  async function handleSetDefault(id: string) {
    setSettingDefault(id);
    try {
      const res = await fetch(`/api/payment-methods/${id}/set-default`, {
        method: "PATCH",
        credentials: "include",
      });
      if (res.ok) {
        setMethods((prev) => prev.map((m) => ({ ...m, isDefault: m.id === id })));
        toast({ title: "Default updated" });
      } else {
        toast({ title: "Could not update default", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setSettingDefault(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/payment-methods/${deleteTarget.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setMethods((prev) => {
          const remaining = prev.filter((m) => m.id !== deleteTarget.id);
          // If deleted was default, mark the oldest remaining as default (mirrors server)
          if (deleteTarget.isDefault && remaining.length > 0) {
            const oldest = [...remaining].sort(
              (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            )[0];
            return remaining.map((m) => ({ ...m, isDefault: m.id === oldest.id }));
          }
          return remaining;
        });
        toast({ title: "Payment method removed" });
      } else {
        toast({ title: "Could not remove method", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setDeleting(false);
      setDeleteTarget(null);
    }
  }

  function handleAddSuccess() {
    setShowCardForm(false);
    setShowUpiForm(false);
    fetchMethods();
  }

  const cards = methods.filter((m) => m.type === "card");
  const upis = methods.filter((m) => m.type === "upi");

  if (!isLoaded || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-24">
          <div className="text-center">
            <div className="animate-spin w-10 h-10 border-2 border-[#C9A84C] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm text-gray-400">Loading your payment methods…</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="font-serif text-xl font-bold text-[#1E6B5A]">Payment Methods</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {methods.length > 0
              ? `${methods.length} saved method${methods.length !== 1 ? "s" : ""}`
              : "Save cards and UPI IDs for faster checkout"}
          </p>
        </div>

        {loadError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-600 flex items-center gap-2">
            <AlertTriangle size={14} />
            {loadError}
          </div>
        )}

        {/* Empty state */}
        {methods.length === 0 && !loadError && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="bg-white rounded-xl border border-[#C9A84C]/20 flex flex-col items-center justify-center py-16 gap-4 text-center"
          >
            <div className="w-14 h-14 rounded-full bg-[#1E6B5A]/5 flex items-center justify-center">
              <CreditCard size={28} className="text-[#1E6B5A]/30" />
            </div>
            <div>
              <p className="text-gray-600 text-sm font-medium">No saved payment methods yet</p>
              <p className="text-gray-400 text-xs mt-1 max-w-xs">
                Add a card or UPI ID to check out faster next time
              </p>
            </div>
          </motion.div>
        )}

        {/* ── Saved Cards ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider flex items-center gap-2">
              <CreditCard size={13} />
              Saved Cards
              {cards.length > 0 && (
                <span className="text-[10px] bg-[#1E6B5A]/10 text-[#1E6B5A] px-1.5 py-0.5 rounded-full font-bold">
                  {cards.length}
                </span>
              )}
            </h3>
            {!showCardForm && (
              <button
                onClick={() => { setShowCardForm(true); setShowUpiForm(false); }}
                className="flex items-center gap-1.5 text-xs font-bold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
              >
                <Plus size={13} />
                Add Card
              </button>
            )}
          </div>

          <AnimatePresence>
            {showCardForm && (
              <AddCardForm
                key="card-form"
                onSuccess={handleAddSuccess}
                onCancel={() => setShowCardForm(false)}
              />
            )}
          </AnimatePresence>

          {cards.length > 0 ? (
            <div className="space-y-3">
              <AnimatePresence>
                {cards.map((m) => (
                  <CardRow
                    key={m.id}
                    method={m}
                    onSetDefault={handleSetDefault}
                    onDelete={setDeleteTarget}
                    settingDefault={settingDefault}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : !showCardForm ? (
            <div className="bg-white rounded-xl border border-[#C9A84C]/15 p-5 text-center text-sm text-gray-400">
              No saved cards yet
            </div>
          ) : null}
        </section>

        {/* ── Saved UPI IDs ── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-[#1E6B5A] uppercase tracking-wider flex items-center gap-2">
              <Smartphone size={13} />
              Saved UPI IDs
              {upis.length > 0 && (
                <span className="text-[10px] bg-[#1E6B5A]/10 text-[#1E6B5A] px-1.5 py-0.5 rounded-full font-bold">
                  {upis.length}
                </span>
              )}
            </h3>
            {!showUpiForm && (
              <button
                onClick={() => { setShowUpiForm(true); setShowCardForm(false); }}
                className="flex items-center gap-1.5 text-xs font-bold text-[#1E6B5A] hover:text-[#C9A84C] transition-colors"
              >
                <Plus size={13} />
                Add UPI ID
              </button>
            )}
          </div>

          <AnimatePresence>
            {showUpiForm && (
              <AddUpiForm
                key="upi-form"
                onSuccess={handleAddSuccess}
                onCancel={() => setShowUpiForm(false)}
              />
            )}
          </AnimatePresence>

          {upis.length > 0 ? (
            <div className="space-y-3">
              <AnimatePresence>
                {upis.map((m) => (
                  <UpiRow
                    key={m.id}
                    method={m}
                    onSetDefault={handleSetDefault}
                    onDelete={setDeleteTarget}
                    settingDefault={settingDefault}
                  />
                ))}
              </AnimatePresence>
            </div>
          ) : !showUpiForm ? (
            <div className="bg-white rounded-xl border border-[#C9A84C]/15 p-5 text-center text-sm text-gray-400">
              No saved UPI IDs yet
            </div>
          ) : null}
        </section>
      </div>

      {/* Delete confirmation portal */}
      <AnimatePresence>
        {deleteTarget && (
          <DeleteDialog
            method={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => { if (!deleting) setDeleteTarget(null); }}
            deleting={deleting}
          />
        )}
      </AnimatePresence>
    </DashboardLayout>
  );
}
