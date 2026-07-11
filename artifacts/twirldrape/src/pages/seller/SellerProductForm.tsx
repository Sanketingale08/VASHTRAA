import React, { useCallback } from "react";
import { Image, Info, Tag, DollarSign, Package, Sparkles, Video, Layers, ListChecks, Truck, RotateCcw, Plus, X } from "lucide-react";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";
const IVORY = "#F3F8F5";

export const CATEGORIES = ["paithani", "designer"] as const;
export const FABRICS = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
export const OCCASIONS = ["bridal", "festival", "casual", "party", "formal"] as const;
export const COLORS = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"] as const;

export interface ProductVariantForm {
  size: string;
  color: string;
  stock: string;
  price: string;
  sku: string;
}

export interface ProductSpecForm {
  key: string;
  value: string;
}

export interface ProductFormData {
  name: string;
  description: string;
  category: string;
  subcategory: string;
  brand: string;
  designPattern: string;
  fabric: string;
  color: string;
  occasion: string;
  price: string;
  originalPrice: string;
  stock: string;
  lowStockThreshold: string;
  images: string[];
  videos: string[];
  variants: ProductVariantForm[];
  specifications: ProductSpecForm[];
  deliveryInfo: string;
  returnPolicy: string;
  isBestSeller: boolean;
  isNewArrival: boolean;
}

export function emptyFormData(): ProductFormData {
  return {
    name: "",
    description: "",
    category: "paithani",
    subcategory: "",
    brand: "",
    designPattern: "",
    fabric: "silk",
    color: "red",
    occasion: "festival",
    price: "",
    originalPrice: "",
    stock: "10",
    lowStockThreshold: "5",
    images: ["", "", "", ""],
    videos: [""],
    variants: [],
    specifications: [],
    deliveryInfo: "",
    returnPolicy: "",
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

const inputClass = "w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors focus:ring-2 focus:ring-[#1E6B5A]/20";
const inputStyle = { borderColor: "#D6C9BA", background: IVORY };

const selectClass = inputClass + " appearance-none cursor-pointer";

interface SectionProps { icon: React.ElementType; title: string; children: React.ReactNode; }
function Section({ icon: Icon, title, children }: SectionProps) {
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
  const input = useCallback(
    (field: keyof ProductFormData) =>
      (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
        onChange(field, e.target.value);
      },
    [onChange],
  );

  const updateVideo = useCallback(
    (idx: number, value: string) => {
      const videos = [...data.videos];
      videos[idx] = value;
      onChange("videos", videos);
    },
    [data.videos, onChange],
  );
  const addVideo = useCallback(() => onChange("videos", [...data.videos, ""]), [data.videos, onChange]);
  const removeVideo = useCallback(
    (idx: number) => onChange("videos", data.videos.filter((_, i) => i !== idx)),
    [data.videos, onChange],
  );

  const updateVariant = useCallback(
    (idx: number, field: keyof ProductVariantForm, value: string) => {
      const variants = data.variants.map((v, i) => (i === idx ? { ...v, [field]: value } : v));
      onChange("variants", variants);
    },
    [data.variants, onChange],
  );
  const addVariant = useCallback(
    () => onChange("variants", [...data.variants, { size: "", color: "", stock: "", price: "", sku: "" }]),
    [data.variants, onChange],
  );
  const removeVariant = useCallback(
    (idx: number) => onChange("variants", data.variants.filter((_, i) => i !== idx)),
    [data.variants, onChange],
  );

  const updateSpec = useCallback(
    (idx: number, field: keyof ProductSpecForm, value: string) => {
      const specs = data.specifications.map((s, i) => (i === idx ? { ...s, [field]: value } : s));
      onChange("specifications", specs);
    },
    [data.specifications, onChange],
  );
  const addSpec = useCallback(
    () => onChange("specifications", [...data.specifications, { key: "", value: "" }]),
    [data.specifications, onChange],
  );
  const removeSpec = useCallback(
    (idx: number) => onChange("specifications", data.specifications.filter((_, i) => i !== idx)),
    [data.specifications, onChange],
  );

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
        <div className="grid grid-cols-2 gap-4">
          <Field label="Brand" error={errors.brand} hint="Optional">
            <input className={inputClass} style={inputStyle} value={data.brand} onChange={input("brand")} placeholder="e.g. TwirlDrape Signature" />
          </Field>
          <Field label="Design Pattern" error={errors.designPattern} hint="Optional">
            <input className={inputClass} style={inputStyle} value={data.designPattern} onChange={input("designPattern")} placeholder="e.g. Peacock motif, zari border" />
          </Field>
        </div>
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
          <Field label="Subcategory" error={errors.subcategory} hint="Optional">
            <input className={inputClass} style={inputStyle} value={data.subcategory} onChange={input("subcategory")} placeholder="e.g. Bridal Paithani" />
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
        <div className="grid grid-cols-2 gap-4 max-w-md">
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
          <Field label="Low Stock Threshold" error={errors.lowStockThreshold} hint="Alert below this level">
            <input
              className={inputClass}
              style={inputStyle}
              type="number"
              min="0"
              value={data.lowStockThreshold}
              onChange={input("lowStockThreshold")}
              placeholder="5"
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

      <Section icon={Video} title="Product Videos">
        <p className="text-xs text-gray-400 -mt-2">Optional. Enter direct video URLs (.mp4, YouTube link, etc).</p>
        <div className="space-y-2.5">
          {data.videos.map((url, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                className={inputClass + " flex-1"}
                style={inputStyle}
                value={url}
                onChange={(e) => updateVideo(idx, e.target.value)}
                placeholder="Video URL"
              />
              <button type="button" onClick={() => removeVideo(idx)} className="p-2 rounded-lg hover:bg-red-50 shrink-0">
                <X size={14} className="text-red-400" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addVideo} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MAROON }}>
            <Plus size={13} /> Add video
          </button>
        </div>
      </Section>

      <Section icon={Layers} title="Variants">
        <p className="text-xs text-gray-400 -mt-2">Optional. Add size/color combinations with per-variant stock and price.</p>
        <div className="space-y-3">
          {data.variants.map((v, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-center p-3 rounded-lg" style={{ background: CREAM }}>
              <input className={inputClass + " col-span-3"} style={inputStyle} value={v.size} onChange={(e) => updateVariant(idx, "size", e.target.value)} placeholder="Size" />
              <input className={inputClass + " col-span-3"} style={inputStyle} value={v.color} onChange={(e) => updateVariant(idx, "color", e.target.value)} placeholder="Color" />
              <input className={inputClass + " col-span-2"} style={inputStyle} type="number" value={v.stock} onChange={(e) => updateVariant(idx, "stock", e.target.value)} placeholder="Stock" />
              <input className={inputClass + " col-span-2"} style={inputStyle} type="number" value={v.price} onChange={(e) => updateVariant(idx, "price", e.target.value)} placeholder="Price" />
              <button type="button" onClick={() => removeVariant(idx)} className="col-span-2 p-2 rounded-lg hover:bg-red-50 flex justify-center">
                <X size={14} className="text-red-400" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addVariant} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MAROON }}>
            <Plus size={13} /> Add variant
          </button>
        </div>
      </Section>

      <Section icon={ListChecks} title="Specifications">
        <p className="text-xs text-gray-400 -mt-2">Optional. Key-value details like weave, blouse included, wash care.</p>
        <div className="space-y-2.5">
          {data.specifications.map((s, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input className={inputClass + " flex-1"} style={inputStyle} value={s.key} onChange={(e) => updateSpec(idx, "key", e.target.value)} placeholder="Attribute (e.g. Weave)" />
              <input className={inputClass + " flex-1"} style={inputStyle} value={s.value} onChange={(e) => updateSpec(idx, "value", e.target.value)} placeholder="Value (e.g. Handwoven)" />
              <button type="button" onClick={() => removeSpec(idx)} className="p-2 rounded-lg hover:bg-red-50 shrink-0">
                <X size={14} className="text-red-400" />
              </button>
            </div>
          ))}
          <button type="button" onClick={addSpec} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MAROON }}>
            <Plus size={13} /> Add specification
          </button>
        </div>
      </Section>

      <Section icon={Truck} title="Delivery & Returns">
        <Field label="Delivery Information" error={errors.deliveryInfo}>
          <textarea
            className={inputClass + " resize-none"}
            style={inputStyle}
            rows={2}
            value={data.deliveryInfo}
            onChange={input("deliveryInfo")}
            placeholder="e.g. Ships within 2-3 business days"
            maxLength={500}
          />
        </Field>
        <Field label="Return Policy" error={errors.returnPolicy}>
          <textarea
            className={inputClass + " resize-none"}
            style={inputStyle}
            rows={2}
            value={data.returnPolicy}
            onChange={input("returnPolicy")}
            placeholder="e.g. 7-day easy returns"
            maxLength={500}
          />
        </Field>
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
