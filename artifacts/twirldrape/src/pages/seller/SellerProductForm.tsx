import React from "react";
import { Image, Info, Tag, DollarSign, Package, Sparkles } from "lucide-react";

const MAROON = "#7B1C2C";
const GOLD = "#C9A84C";
const CREAM = "#F5EDE0";
const IVORY = "#FAF6EE";

export const CATEGORIES = ["paithani", "designer"] as const;
export const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
export const OCCASIONS = ["bridal", "festival", "casual", "party", "formal"] as const;
export const COLORS = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"] as const;

export interface ProductFormData {
  name: string;
  description: string;
  category: string;
  fabric: string;
  color: string;
  occasion: string;
  price: string;
  originalPrice: string;
  stock: string;
  images: string[];
  isBestSeller: boolean;
  isNewArrival: boolean;
}

export function emptyFormData(): ProductFormData {
  return {
    name: "",
    description: "",
    category: "paithani",
    fabric: "silk",
    color: "red",
    occasion: "festival",
    price: "",
    originalPrice: "",
    stock: "10",
    images: ["", "", "", ""],
    isBestSeller: false,
    isNewArrival: false,
  };
}

interface FieldProps {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}
function Field({ label, required, error, children, hint }: FieldProps) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: "#5a4a3a" }}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
    </div>
  );
}

const inputClass = "w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors focus:ring-2 focus:ring-[#7B1C2C]/20";
const inputStyle = { borderColor: "#D6C9BA", background: IVORY };

const selectClass = inputClass + " appearance-none cursor-pointer";

interface ProductFormProps {
  data: ProductFormData;
  errors: Partial<Record<keyof ProductFormData, string>>;
  onChange: (field: keyof ProductFormData, value: any) => void;
  onImageChange: (idx: number, value: string) => void;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export default function ProductForm({
  data,
  errors,
  onChange,
  onImageChange,
  submitting,
  submitLabel,
  onSubmit,
  onCancel,
}: ProductFormProps) {
  function input(field: keyof ProductFormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      onChange(field, e.target.value);
    };
  }

  function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
    return (
      <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: "#E2D9CC", background: "#FDFBF8" }}>
        <div className="flex items-center gap-2 mb-1">
          <Icon size={15} style={{ color: GOLD }} />
          <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#7a5f4e" }}>{title}</h3>
        </div>
        {children}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <Section icon={Info} title="Basic Information">
        <Field label="Product Name" required error={errors.name}>
          <input
            className={inputClass}
            style={inputStyle}
            value={data.name}
            onChange={input("name")}
            placeholder="e.g. Peacock Paithani Silk Saree"
            maxLength={120}
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <textarea
            className={inputClass + " resize-none"}
            style={inputStyle}
            rows={3}
            value={data.description}
            onChange={input("description")}
            placeholder="Describe the saree — weave, design, drape quality…"
            maxLength={1000}
          />
        </Field>
      </Section>

      <Section icon={Tag} title="Classification">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Category" required error={errors.category}>
            <select className={selectClass} style={inputStyle} value={data.category} onChange={input("category")}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Fabric" required error={errors.fabric}>
            <select className={selectClass} style={inputStyle} value={data.fabric} onChange={input("fabric")}>
              {FABRICS.map((f) => (
                <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Color" required error={errors.color}>
            <select className={selectClass} style={inputStyle} value={data.color} onChange={input("color")}>
              {COLORS.map((c) => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </Field>
          <Field label="Occasion" required error={errors.occasion}>
            <select className={selectClass} style={inputStyle} value={data.occasion} onChange={input("occasion")}>
              {OCCASIONS.map((o) => (
                <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
              ))}
            </select>
          </Field>
        </div>
      </Section>

      <Section icon={DollarSign} title="Pricing">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Selling Price (₹)" required error={errors.price}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <input
                className={inputClass + " pl-7"}
                style={inputStyle}
                type="number"
                min="1"
                value={data.price}
                onChange={input("price")}
                placeholder="15000"
              />
            </div>
          </Field>
          <Field label="Original Price (₹)" error={errors.originalPrice} hint="Leave blank if no discount">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <input
                className={inputClass + " pl-7"}
                style={inputStyle}
                type="number"
                min="1"
                value={data.originalPrice}
                onChange={input("originalPrice")}
                placeholder="Optional"
              />
            </div>
          </Field>
        </div>
      </Section>

      <Section icon={Package} title="Inventory">
        <div className="max-w-[180px]">
          <Field label="Stock Quantity" required error={errors.stock}>
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="0"
              value={data.stock}
              onChange={input("stock")}
              placeholder="10"
            />
          </Field>
        </div>
      </Section>

      <Section icon={Image} title="Images">
        <p className="text-xs text-gray-400 -mt-2">Enter image URLs (at least one recommended). Use direct .jpg/.webp/.png links.</p>
        <div className="space-y-2.5">
          {data.images.map((url, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: CREAM }}>
                {url ? (
                  <img src={url} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0"; }} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-gray-300">{idx + 1}</div>
                )}
              </div>
              <input
                className={inputClass + " flex-1"}
                style={inputStyle}
                value={url}
                onChange={(e) => onImageChange(idx, e.target.value)}
                placeholder={`Image ${idx + 1} URL${idx === 0 ? " (main photo)" : " (optional)"}`}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section icon={Sparkles} title="Badges">
        <div className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded cursor-pointer"
              checked={data.isBestSeller}
              onChange={(e) => onChange("isBestSeller", e.target.checked)}
              style={{ accentColor: MAROON }}
            />
            <span className="text-sm font-medium text-gray-700">Best Seller</span>
          </label>
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              className="w-4 h-4 rounded cursor-pointer"
              checked={data.isNewArrival}
              onChange={(e) => onChange("isNewArrival", e.target.checked)}
              style={{ accentColor: MAROON }}
            />
            <span className="text-sm font-medium text-gray-700">New Arrival</span>
          </label>
        </div>
      </Section>

      <div className="flex items-center gap-3 pt-2 pb-4">
        <button
          type="submit"
          disabled={submitting}
          className="px-8 py-3 rounded-lg text-sm font-bold transition-all hover:opacity-90 disabled:opacity-60"
          style={{ background: MAROON, color: IVORY }}
        >
          {submitting ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-6 py-3 rounded-lg text-sm font-medium border"
          style={{ borderColor: "#D6C9BA", color: "#6b5b4e" }}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
