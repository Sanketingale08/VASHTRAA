import React, { useCallback, useState, useRef, useEffect } from "react";
import { Image, Info, Tag, DollarSign, Package, Sparkles, Video, Layers, ListChecks, Truck, RotateCcw, Plus, X, Upload } from "lucide-react";
import { getApiUrl } from "@/lib/api";

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
    images: [],
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

interface ImageEntry {
  id: string;
  url: string;
  progress: number;
  uploading: boolean;
  error: string;
}

let _imgId = 0;
function makeEntry(url: string): ImageEntry {
  return { id: `img-${++_imgId}`, url, progress: 0, uploading: false, error: "" };
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function uploadWithProgress(file: File, onProgress: (p: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const { publicRelPath } = JSON.parse(xhr.responseText);
          resolve(getApiUrl(publicRelPath));
        } catch {
          reject(new Error("Invalid response"));
        }
      } else {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error("Network error"));
    xhr.open("POST", getApiUrl("/api/seller/upload/product-image"));
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.withCredentials = true;
    xhr.send(file);
  });
}

interface ImageCardProps {
  entry: ImageEntry;
  isMain: boolean;
  isDragSrc: boolean;
  isDragTarget: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onRemove: () => void;
  onReplace: (file: File) => void;
}

function ImageCard({ entry, isMain, isDragSrc, isDragTarget, onDragStart, onDragOver, onDrop, onDragEnd, onRemove, onReplace }: ImageCardProps) {
  const replaceRef = useRef<HTMLInputElement>(null);
  const [hovered, setHovered] = useState(false);
  const circ = 2 * Math.PI * 18;

  return (
    <div
      className="relative overflow-hidden rounded-xl select-none"
      style={{
        aspectRatio: "1 / 1",
        opacity: isDragSrc ? 0.35 : 1,
        outline: isDragTarget ? `2.5px solid ${MAROON}` : "2.5px solid transparent",
        background: "#EDE3D8",
        cursor: entry.url && !entry.uploading && !entry.error ? "grab" : "default",
        transition: "opacity 0.15s, outline-color 0.1s",
      }}
      draggable={Boolean(entry.url) && !entry.uploading && !entry.error}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {entry.url && (
        <img
          src={entry.url} alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).style.opacity = "0.25"; }}
        />
      )}

      {entry.uploading && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5"
          style={{ background: "rgba(237,227,216,0.90)" }}>
          <svg width="48" height="48" viewBox="0 0 44 44">
            <circle cx="22" cy="22" r="18" fill="none" stroke="#D6C9BA" strokeWidth="3.5" />
            <circle
              cx="22" cy="22" r="18"
              fill="none" stroke={MAROON} strokeWidth="3.5" strokeLinecap="round"
              strokeDasharray={circ}
              strokeDashoffset={circ * (1 - entry.progress / 100)}
              transform="rotate(-90 22 22)"
              style={{ transition: "stroke-dashoffset 0.15s linear" }}
            />
          </svg>
          <span className="text-xs font-bold tabular-nums" style={{ color: MAROON }}>{entry.progress}%</span>
        </div>
      )}

      {entry.error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-2.5 text-center"
          style={{ background: "rgba(254,242,242,0.96)" }}>
          <X size={20} className="text-red-400 shrink-0" />
          <p className="text-[10px] text-red-500 leading-tight">{entry.error}</p>
        </div>
      )}

      {isMain && entry.url && !entry.uploading && !entry.error && (
        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider z-10"
          style={{ background: MAROON, color: "#fff" }}>
          Main
        </span>
      )}

      {hovered && entry.url && !entry.uploading && !entry.error && (
        <div
          className="absolute inset-0 flex items-end justify-between p-2"
          style={{ background: "linear-gradient(to top,rgba(0,0,0,0.65) 0%,transparent 55%)" }}
        >
          <button
            type="button"
            title="Replace image"
            className="p-1.5 rounded-lg text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.18)" }}
            onClick={(e) => { e.stopPropagation(); replaceRef.current?.click(); }}
          >
            <RotateCcw size={14} />
          </button>
          <button
            type="button"
            title="Remove image"
            className="p-1.5 rounded-lg text-white transition-colors"
            style={{ background: "rgba(200,30,30,0.50)" }}
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <input
        ref={replaceRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onReplace(f); e.target.value = ""; }}
      />
    </div>
  );
}

interface ImageUploadGalleryProps {
  images: string[];
  onImagesChange: (urls: string[]) => void;
}

function ImageUploadGallery({ images, onImagesChange }: ImageUploadGalleryProps) {
  const entriesRef = useRef<ImageEntry[]>(images.filter(Boolean).map(makeEntry));
  const [, rerender] = useState(0);
  const [zoneDragOver, setZoneDragOver] = useState(false);
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const browseRef = useRef<HTMLInputElement>(null);
  const onChangeRef = useRef(onImagesChange);
  useEffect(() => { onChangeRef.current = onImagesChange; });

  const lastSyncSig = useRef(JSON.stringify(images.filter(Boolean)));
  useEffect(() => {
    const incoming = images.filter(Boolean);
    const sig = JSON.stringify(incoming);
    if (sig === lastSyncSig.current) return;
    const currentUrls = entriesRef.current.filter(e => e.url && !e.uploading).map(e => e.url);
    if (JSON.stringify(currentUrls) !== sig) {
      lastSyncSig.current = sig;
      entriesRef.current = incoming.map(makeEntry);
      rerender(n => n + 1);
    }
  }, [images]);

  function refresh(next: ImageEntry[]) {
    entriesRef.current = next;
    rerender(n => n + 1);
  }

  function refreshEmit(next: ImageEntry[]) {
    const urls = next.filter(e => e.url && !e.uploading).map(e => e.url);
    lastSyncSig.current = JSON.stringify(urls);
    entriesRef.current = next;
    rerender(n => n + 1);
    onChangeRef.current(urls);
  }

  function processFiles(files: File[]) {
    const accepted: Array<{ file: File; id: string }> = [];
    const rejected: ImageEntry[] = [];
    for (const file of files) {
      const id = `img-${++_imgId}`;
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        rejected.push({ id, url: "", progress: 0, uploading: false, error: `${file.name}: use JPG, PNG, or WEBP` });
      } else if (file.size > MAX_IMAGE_BYTES) {
        rejected.push({ id, url: "", progress: 0, uploading: false, error: `${file.name}: max 10 MB` });
      } else {
        accepted.push({ file, id });
      }
    }
    const pending: ImageEntry[] = accepted.map(({ id }) => ({ id, url: "", progress: 0, uploading: true, error: "" }));
    refresh([...entriesRef.current, ...pending, ...rejected]);

    if (rejected.length > 0) {
      const ids = new Set(rejected.map(r => r.id));
      setTimeout(() => refresh(entriesRef.current.filter(e => !ids.has(e.id))), 3500);
    }

    for (const { file, id } of accepted) {
      uploadWithProgress(file, (p) => refresh(entriesRef.current.map(e => e.id === id ? { ...e, progress: p } : e)))
        .then((url) => refreshEmit(entriesRef.current.map(e => e.id === id ? { ...e, url, uploading: false, progress: 100 } : e)))
        .catch(() => {
          refresh(entriesRef.current.map(e => e.id === id ? { id, url: "", progress: 0, uploading: false, error: `${file.name}: upload failed` } : e));
          setTimeout(() => refresh(entriesRef.current.filter(e => e.id !== id)), 3500);
        });
    }
  }

  function removeEntry(id: string) {
    refreshEmit(entriesRef.current.filter(e => e.id !== id));
  }

  function replaceEntry(id: string, file: File) {
    refresh(entriesRef.current.map(e => e.id === id ? { ...e, url: "", progress: 0, uploading: true, error: "" } : e));
    uploadWithProgress(file, (p) => refresh(entriesRef.current.map(e => e.id === id ? { ...e, progress: p } : e)))
      .then((url) => refreshEmit(entriesRef.current.map(e => e.id === id ? { ...e, url, uploading: false, progress: 100 } : e)))
      .catch(() => {
        refresh(entriesRef.current.map(e => e.id === id ? { ...e, uploading: false, error: "Replace failed. Try again." } : e));
        setTimeout(() => refresh(entriesRef.current.map(e => e.id === id ? { ...e, error: "" } : e)), 3500);
      });
  }

  const entries = entriesRef.current;

  return (
    <div className="space-y-4">
      <div
        role="button"
        tabIndex={0}
        className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all cursor-pointer py-10 px-6 text-center"
        style={{
          borderColor: zoneDragOver ? MAROON : "#D6C9BA",
          background: zoneDragOver ? `${MAROON}0A` : CREAM,
        }}
        onDrop={(e) => { e.preventDefault(); setZoneDragOver(false); processFiles(Array.from(e.dataTransfer.files)); }}
        onDragOver={(e) => { e.preventDefault(); setZoneDragOver(true); }}
        onDragEnter={(e) => { e.preventDefault(); setZoneDragOver(true); }}
        onDragLeave={() => setZoneDragOver(false)}
        onClick={() => browseRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && browseRef.current?.click()}
      >
        <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: `${MAROON}14` }}>
          <Upload size={24} style={{ color: MAROON }} />
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: "#2d1f14" }}>Drag & Drop Images Here</p>
          <p className="text-xs mt-0.5" style={{ color: "#9a8070" }}>
            or <span className="font-semibold" style={{ color: MAROON }}>Click to Browse</span>
          </p>
        </div>
        <p className="text-[11px]" style={{ color: "#B8A898" }}>
          JPG &nbsp;·&nbsp; PNG &nbsp;·&nbsp; WEBP &nbsp;&nbsp;|&nbsp;&nbsp; Max 10 MB per image &nbsp;&nbsp;|&nbsp;&nbsp; Multiple at once
        </p>
        <input
          ref={browseRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(e) => { processFiles(Array.from(e.target.files || [])); e.target.value = ""; }}
        />
      </div>

      {entries.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {entries.map((entry, idx) => (
            <ImageCard
              key={entry.id}
              entry={entry}
              isMain={idx === 0}
              isDragSrc={dragSrcIdx === idx}
              isDragTarget={dragOverIdx === idx}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragSrcIdx(idx); }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                if (dragSrcIdx !== null && dragSrcIdx !== idx) setDragOverIdx(idx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragSrcIdx !== null && dragSrcIdx !== idx) {
                  const next = [...entriesRef.current];
                  const [moved] = next.splice(dragSrcIdx, 1);
                  next.splice(idx, 0, moved);
                  refreshEmit(next);
                }
                setDragSrcIdx(null);
                setDragOverIdx(null);
              }}
              onDragEnd={() => { setDragSrcIdx(null); setDragOverIdx(null); }}
              onRemove={() => removeEntry(entry.id)}
              onReplace={(file) => replaceEntry(entry.id, file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ProductFormProps {
  data: ProductFormData;
  errors: Partial<Record<keyof ProductFormData, string>>;
  onChange: (field: keyof ProductFormData, value: any) => void;
  submitting: boolean;
  submitLabel: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export default function ProductForm({
  data,
  errors,
  onChange,
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
        <ImageUploadGallery
          images={data.images}
          onImagesChange={(urls) => onChange("images", urls)}
        />
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
