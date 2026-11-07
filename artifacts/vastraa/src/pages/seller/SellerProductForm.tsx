import React, { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { Image, Info, Tag, DollarSign, Package, Sparkles, Video, Layers, ListChecks, Truck, RotateCcw, Plus, X, Upload, Loader2, AlertCircle } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getApiUrl, apiFetch } from "@/lib/api";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import {
  CATEGORY_DROPDOWN_OPTIONS,
  getSubcategoriesForCategory,
  getSubtypesForSubcategory,
  isValidSubcategoryForCategory,
  resolveCanonicalSubcategoryName,
  registerClientDynamicSubcategory,
  FABRICS_OPTIONS,
  WEAVING_TECHNIQUES_OPTIONS,
  WORK_TYPES_OPTIONS,
  BORDER_TYPES_OPTIONS,
  PALLU_DESIGNS_OPTIONS,
  OCCASIONS_OPTIONS,
  ORIGINS_OPTIONS,
  SAREE_LENGTHS_OPTIONS,
  COLORS_OPTIONS,
  KURTI_LENGTHS_OPTIONS,
  KURTI_FITS_OPTIONS,
  SLEEVE_LENGTHS_OPTIONS,
  NECK_TYPES_OPTIONS,
  KURTA_SET_PIECES_OPTIONS,
  BOTTOM_TYPES_OPTIONS,
  DUPATTA_TYPES_OPTIONS,
  DRESS_LENGTHS_OPTIONS,
  WESTERN_DRESS_FITS_OPTIONS,
  WINTER_GARMENT_TYPES_OPTIONS,
  WINTER_WARMTH_LEVELS_OPTIONS,
  WOMENS_TOPS_SIZES,
  GIRLS_TOPS_SIZES,
  ALL_TOPS_SIZES,
  TOPS_NECK_TYPES,
  TOPS_SLEEVE_LENGTHS,
  TOPS_FITS,
  TOPS_PATTERNS,
} from "@/constants/categories";
import {
  getCategorySpecifications,
  isSareeCategory,
  BLOUSE_FABRICS_OPTIONS,
  BLOUSE_LENGTHS_OPTIONS,
  BLOUSE_DESIGNS_OPTIONS,
} from "@/constants/categorySpecifications";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const CREAM = "#E5E8EC";
const IVORY = "#F4F5F7";

export const CATEGORIES = [
  "sarees",
  "kurtis",
  "kurta-sets",
  "ethnic-dresses",
  "western-dresses",
  "winter-wear",
  "tops",
  "paithani",
  "designer",
  "gadwal",
  "banarasi",
  "kanjivaram",
  "chanderi",
  "bandhani",
  "mysore-silk",
  "ikat",
  "cotton",
  "silk",
  "other-traditional",
] as const;
export const FABRICS = FABRICS_OPTIONS;
export const OCCASIONS = OCCASIONS_OPTIONS;
export const COLORS = COLORS_OPTIONS;

export interface ProductAttributeGroup {
  name: string;
  values: string[];
}

export interface ProductVariantForm {
  attributes: Array<{ name: string; value: string }>;
  stock: string;
  price: string;
  sku: string;
  image: string;
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
  subtype: string;
  collection: string;
  gender: string;
  sareeType: string;
  sareeStyle: string;
  packOf: string;
  countryOfOrigin: string;
  blouseIncluded: boolean;
  brand: string;
  designPattern: string;
  fabric: string;
  weavingTechnique: string;
  workType: string;
  borderType: string;
  palluDesign: string;
  sareeLength: string;
  origin: string;
  color: string;
  occasion: string;
  price: string;
  originalPrice: string;
  stock: string;
  lowStockThreshold: string;
  images: string[];
  videos: string[];
  attributeGroups: ProductAttributeGroup[];
  variants: ProductVariantForm[];
  specifications: ProductSpecForm[];
  deliveryInfo: string;
  returnPolicy: string;
  isBestSeller: boolean;
  isNewArrival: boolean;
  kurtiLength?: string;
  kurtiFit?: string;
  sleeveLength?: string;
  neckType?: string;
  bottomType?: string;
  dupattaType?: string;
  piecesInSet?: string;
  dressLength?: string;
  westernDressFit?: string;
  winterGarmentType?: string;
  winterWarmthLevel?: string;
  // Matching Blouse Piece fields (Sarees only)
  blouseFabric?: string;
  blouseColor?: string;
  blouseLength?: string;
  blouseDesign?: string;
  blouseImages: string[];
  // Dynamic category specification fields
  kurtiType?: string;
  fit?: string;
  pattern?: string;
  closureType?: string;
  setType?: string;
  kurtaLength?: string;
  bottomLength?: string;
  dupattaIncluded?: string;
  dupattaFabric?: string;
  dressType?: string;
  silhouette?: string;
  embellishment?: string;
  neckline?: string;
  waistline?: string;
  winterWearType?: string;
  warmthLevel?: string;
  winterWearLength?: string;
  topType?: string;
  sleeveType?: string;
  topLength?: string;
  neckStyle?: string;
}

export function emptyFormData(): ProductFormData {
  return {
    name: "",
    description: "",
    category: "sarees",
    subcategory: "",
    subtype: "",
    collection: "",
    gender: "Women",
    sareeType: "",
    sareeStyle: "",
    packOf: "Pack of 1",
    countryOfOrigin: "India",
    blouseIncluded: true,
    brand: "",
    designPattern: "",
    fabric: "silk",
    weavingTechnique: "",
    workType: "",
    borderType: "",
    palluDesign: "",
    sareeLength: "5.5 meters",
    origin: "India",
    color: "red",
    occasion: "festival",
    price: "",
    originalPrice: "",
    stock: "10",
    lowStockThreshold: "5",
    images: [],
    videos: [""],
    attributeGroups: [],
    variants: [],
    specifications: [],
    deliveryInfo: "",
    returnPolicy: "",
    isBestSeller: false,
    isNewArrival: false,
    blouseImages: [],
    blouseFabric: "Pure Silk",
    blouseColor: "red",
    blouseLength: "0.80 Metre (Standard Unstitched)",
    blouseDesign: "Matching Running Blouse Piece",
    kurtiType: "Straight Kurti",
    kurtiLength: "Knee Length",
    fit: "Regular Fit",
    pattern: "Solid / Plain",
    closureType: "Slip-On / Pull Over",
    setType: "3-Piece Set (Kurta + Bottom + Dupatta)",
    kurtaLength: "Calf Length",
    bottomType: "Palazzo Pants",
    bottomLength: "Ankle Length (Standard)",
    dupattaIncluded: "Yes (Included in Set)",
    dupattaFabric: "Chiffon",
    dressType: "Anarkali Gown",
    dressLength: "Maxi (Ankle Length)",
    sleeveLength: "Three-Quarter Sleeve (3/4th)",
    neckStyle: "Round Neck",
    silhouette: "Fit & Flare",
    embellishment: "Minimal / Plain",
    neckline: "V-Neck",
    waistline: "Natural Waist",
    winterWearType: "Winter Dress",
    warmthLevel: "Moderate Winter / Medium Warmth",
    winterWearLength: "Midi (Calf Length)",
    topType: "Western Top",
    sleeveType: "Short Sleeve",
    topLength: "Hip Length (Regular)",
  };
}

interface FieldProps {
  label: React.ReactNode;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}
const Field = React.memo(function Field({ label, required, error, children, hint }: FieldProps) {
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
});

const inputClass = "w-full px-3 py-2.5 rounded-lg border text-sm outline-none transition-colors focus:ring-2 focus:ring-[#0A1F44]/20";
const inputStyle = { borderColor: "#D6C9BA", background: IVORY };

const selectClass = inputClass + " appearance-none cursor-pointer";

interface FormInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> {
  field: keyof ProductFormData;
  value: string;
  onChangeField: (field: keyof ProductFormData, value: any) => void;
}

export const FormInput = React.memo(function FormInput({
  field,
  value,
  onChangeField,
  className = "",
  style,
  ...props
}: FormInputProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChangeField(field, e.target.value);
    },
    [field, onChangeField]
  );

  return (
    <input
      value={value ?? ""}
      onChange={handleChange}
      className={`${inputClass} ${className}`.trim()}
      style={{ ...inputStyle, ...style }}
      {...props}
    />
  );
});

interface FormTextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  field: keyof ProductFormData;
  value: string;
  onChangeField: (field: keyof ProductFormData, value: any) => void;
}

export const FormTextarea = React.memo(function FormTextarea({
  field,
  value,
  onChangeField,
  className = "",
  style,
  ...props
}: FormTextareaProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChangeField(field, e.target.value);
    },
    [field, onChangeField]
  );

  return (
    <textarea
      value={value ?? ""}
      onChange={handleChange}
      className={`${inputClass} resize-none ${className}`.trim()}
      style={{ ...inputStyle, ...style }}
      {...props}
    />
  );
});

interface FormSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "onChange" | "value"> {
  field: keyof ProductFormData;
  value: string;
  options: readonly string[];
  onChangeField: (field: keyof ProductFormData, value: any) => void;
}

export const FormSelect = React.memo(function FormSelect({
  field,
  value,
  options,
  onChangeField,
  className = "",
  style,
  ...props
}: FormSelectProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      onChangeField(field, e.target.value);
    },
    [field, onChangeField]
  );

  return (
    <select
      value={value ?? ""}
      onChange={handleChange}
      className={`${selectClass} ${className}`.trim()}
      style={{ ...inputStyle, ...style }}
      {...props}
    >
      {options.map((opt) => {
        let label = opt.charAt(0).toUpperCase() + opt.slice(1);
        if (opt === "paithani") label = "Paithani Sarees";
        else if (opt === "designer") label = "Designer Sarees";
        else if (opt === "bridal") label = "Bridal Sarees";
        else if (opt === "party") label = "Party Wear Sarees";
        return (
          <option key={opt} value={opt}>
            {label}
          </option>
        );
      })}
    </select>
  );
});

interface VideoRowProps {
  index: number;
  url: string;
  onUpdate: (index: number, url: string) => void;
  onRemove: (index: number) => void;
}
const VideoRow = React.memo(function VideoRow({ index, url, onUpdate, onRemove }: VideoRowProps) {
  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, e.target.value);
    },
    [index, onUpdate]
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className="flex items-center gap-2">
      <input
        className={inputClass + " flex-1"}
        style={inputStyle}
        value={url}
        onChange={handleChange}
        placeholder="Video URL"
      />
      <button type="button" onClick={handleRemove} className="p-2 rounded-lg hover:bg-red-50 shrink-0">
        <X size={14} className="text-red-400" />
      </button>
    </div>
  );
});

interface SpecRowProps {
  index: number;
  specKey: string;
  specValue: string;
  onUpdate: (index: number, field: keyof ProductSpecForm, value: string) => void;
  onRemove: (index: number) => void;
}
const SpecRow = React.memo(function SpecRow({ index, specKey, specValue, onUpdate, onRemove }: SpecRowProps) {
  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, "key", e.target.value);
    },
    [index, onUpdate]
  );
  const handleValueChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, "value", e.target.value);
    },
    [index, onUpdate]
  );
  const handleRemove = useCallback(() => {
    onRemove(index);
  }, [index, onRemove]);

  return (
    <div className="flex items-center gap-2">
      <input
        className={inputClass + " flex-1"}
        style={inputStyle}
        value={specKey}
        onChange={handleKeyChange}
        placeholder="Attribute (e.g. Weave)"
      />
      <input
        className={inputClass + " flex-1"}
        style={inputStyle}
        value={specValue}
        onChange={handleValueChange}
        placeholder="Value (e.g. Handwoven)"
      />
      <button type="button" onClick={handleRemove} className="p-2 rounded-lg hover:bg-red-50 shrink-0">
        <X size={14} className="text-red-400" />
      </button>
    </div>
  );
});

interface VariantRowProps {
  index: number;
  variant: ProductVariantForm;
  onUpdate: (index: number, field: "stock" | "price" | "sku", value: string) => void;
}
const VariantRow = React.memo(function VariantRow({ index, variant, onUpdate }: VariantRowProps) {
  const handleStockChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, "stock", e.target.value);
    },
    [index, onUpdate]
  );
  const handlePriceChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate(index, "price", e.target.value);
    },
    [index, onUpdate]
  );

  return (
    <div
      className="grid items-center px-3 py-2 border-t gap-2"
      style={{ borderColor: "#E2D9CC", gridTemplateColumns: "1fr 90px 90px" }}
    >
      <div className="flex flex-wrap gap-x-1.5">
        {variant.attributes.map((a, ai) => (
          <span key={ai} className="text-xs font-semibold" style={{ color: MAROON }}>
            {ai > 0 && <span className="mx-0.5 opacity-30">·</span>}
            {a.value}
          </span>
        ))}
      </div>
      <input
        className="w-full px-2 py-1 rounded border text-xs outline-none focus:ring-1 focus:ring-[#0A1F44]/30"
        style={{ borderColor: "#D6C9BA", background: IVORY }}
        type="number"
        min="0"
        value={variant.stock}
        onChange={handleStockChange}
        placeholder="0"
      />
      <input
        className="w-full px-2 py-1 rounded border text-xs outline-none focus:ring-1 focus:ring-[#0A1F44]/30"
        style={{ borderColor: "#D6C9BA", background: IVORY }}
        type="number"
        min="0"
        value={variant.price}
        onChange={handlePriceChange}
        placeholder="—"
      />
    </div>
  );
});

interface SectionProps { icon: React.ElementType; title: string; children: React.ReactNode; }
const Section = React.memo(function Section({ icon: Icon, title, children }: SectionProps) {
  return (
    <div className="rounded-xl border p-5 space-y-4" style={{ borderColor: "#E2D9CC", background: "#FDFBF8" }}>
      <div className="flex items-center gap-2 mb-1">
        <Icon size={15} style={{ color: GOLD }} />
        <h3 className="text-xs font-bold uppercase tracking-widest" style={{ color: "#7a5f4e" }}>{title}</h3>
      </div>
      {children}
    </div>
  );
});

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
      } else if (xhr.status === 401 || xhr.status === 403) {
        reject(new Error("AUTH_EXPIRED"));
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
          src={getProductImageSrc(entry.url)} alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={replaceProductImageWithFallback}
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

export const ImageUploadGallery = React.memo(function ImageUploadGallery({ images, onImagesChange }: ImageUploadGalleryProps) {
  const entriesRef = useRef<ImageEntry[]>(images.filter(Boolean).map(makeEntry));
  const [, rerender] = useState(0);
  const [zoneDragOver, setZoneDragOver] = useState(false);
  const [dragSrcId, setDragSrcId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
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
        .catch((err: Error) => {
          const isAuthError = err.message === "AUTH_EXPIRED";
          const errorMsg = isAuthError
            ? "Session expired — please refresh the page to continue"
            : `${file.name}: upload failed`;
          refresh(entriesRef.current.map(e => e.id === id ? { id, url: "", progress: 0, uploading: false, error: errorMsg } : e));
          if (!isAuthError) {
            setTimeout(() => refresh(entriesRef.current.filter(e => e.id !== id)), 3500);
          }
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
      .catch((err: Error) => {
        const isAuthError = err.message === "AUTH_EXPIRED";
        const errorMsg = isAuthError
          ? "Session expired — please refresh the page to continue"
          : "Replace failed. Try again.";
        refresh(entriesRef.current.map(e => e.id === id ? { ...e, uploading: false, error: errorMsg } : e));
        if (!isAuthError) {
          setTimeout(() => refresh(entriesRef.current.map(e => e.id === id ? { ...e, error: "" } : e)), 3500);
        }
      });
  }

  const entries = entriesRef.current;

  // Compute preview order for drag-over visual feedback
  const displayEntries = (() => {
    if (dragSrcId && dragOverId && dragSrcId !== dragOverId) {
      const preview = [...entries];
      const srcIdx = preview.findIndex(e => e.id === dragSrcId);
      const tgtIdx = preview.findIndex(e => e.id === dragOverId);
      if (srcIdx >= 0 && tgtIdx >= 0) {
        const [moved] = preview.splice(srcIdx, 1);
        preview.splice(tgtIdx, 0, moved);
      }
      return preview;
    }
    return entries;
  })();

  function clearDrag() { setDragSrcId(null); setDragOverId(null); }

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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {displayEntries.map((entry, idx) => (
          <ImageCard
            key={entry.id}
            entry={entry}
            isMain={idx === 0}
            isDragSrc={entry.id === dragSrcId}
            isDragTarget={entry.id === dragOverId}
            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragSrcId(entry.id); }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              if (dragSrcId && entry.id !== dragSrcId) setDragOverId(entry.id);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragSrcId && dragOverId && dragSrcId !== dragOverId) {
                refreshEmit([...displayEntries]);
              }
              clearDrag();
            }}
            onDragEnd={clearDrag}
            onRemove={() => removeEntry(entry.id)}
            onReplace={(file) => replaceEntry(entry.id, file)}
          />
        ))}

        {/* "Add more" tile — always visible as the last grid cell */}
        <button
          type="button"
          className="relative overflow-hidden rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 transition-all hover:border-[#0A1F44] hover:bg-[#0A1F4408]"
          style={{ aspectRatio: "1 / 1", borderColor: "#D6C9BA", background: CREAM, cursor: "pointer" }}
          onClick={() => browseRef.current?.click()}
          title="Add more images"
        >
          <Plus size={20} style={{ color: "#B0A090" }} />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#B0A090" }}>Add more</span>
        </button>
      </div>
    </div>
  );
});

// ── Attribute-based variant builder ──────────────────────────────────────────

const ATTRIBUTE_SUGGESTIONS = ["Size", "Colour", "Fabric", "Sleeve Length", "Neck Style", "Border Style", "Work Type", "Occasion", "Pattern"];

const PRESET_TEMPLATES: Record<string, ProductAttributeGroup[]> = {
  "Women's Tops Sizes": [
    { name: "Size", values: ["XS", "S", "M", "L", "XL", "XXL", "3XL"] },
  ],
  "Girls' Tops Sizes": [
    { name: "Size", values: ["2-3Y", "3-4Y", "4-5Y", "5-6Y", "7-8Y", "9-10Y", "11-12Y", "13-14Y"] },
  ],
  "Tops (Color & Size)": [
    { name: "Colour", values: ["White", "Black", "Navy Blue"] },
    { name: "Size", values: ["S", "M", "L", "XL"] },
  ],
  "6-Variant": [
    { name: "Colour", values: ["Red", "Blue", "Green"] },
    { name: "Border Style", values: ["Gold Zari", "Silver Zari"] },
  ],
  "9-Variant": [
    { name: "Colour", values: ["Red", "Blue", "Green"] },
    { name: "Work Type", values: ["Handwoven", "Machine", "Embroidered"] },
  ],
};

function cartesian(groups: ProductAttributeGroup[]): Array<Array<{ name: string; value: string }>> {
  // All configured groups must have at least one value before any combinations are generated
  if (groups.length === 0 || groups.some((g) => g.values.length === 0)) return [];
  return groups.reduce<Array<Array<{ name: string; value: string }>>>(
    (acc, group) => {
      const next: Array<Array<{ name: string; value: string }>> = [];
      for (const existing of acc) {
        for (const val of group.values) {
          next.push([...existing, { name: group.name, value: val }]);
        }
      }
      return next;
    },
    [[]]
  );
}

function variantKey(attrs: Array<{ name: string; value: string }>): string {
  return attrs.map((a) => `${a.name}:${a.value}`).join("|");
}

function recomputeVariants(
  groups: ProductAttributeGroup[],
  prevVariants: ProductVariantForm[]
): ProductVariantForm[] {
  const combos = cartesian(groups);
  const prevMap = new Map<string, ProductVariantForm>();
  for (const v of prevVariants) {
    prevMap.set(variantKey(v.attributes), v);
  }
  return combos.map((attrs) => {
    const key = variantKey(attrs);
    const prev = prevMap.get(key);
    return prev
      ? { ...prev, attributes: attrs }
      : { attributes: attrs, stock: "", price: "", sku: "", image: "" };
  });
}

interface AttributeVariantBuilderProps {
  attributeGroups: ProductAttributeGroup[];
  variants: ProductVariantForm[];
  onAttributeGroupsChange: (groups: ProductAttributeGroup[]) => void;
  onVariantsChange: (variants: ProductVariantForm[]) => void;
}

export const AttributeVariantBuilder = React.memo(function AttributeVariantBuilder({
  attributeGroups,
  variants,
  onAttributeGroupsChange,
  onVariantsChange,
}: AttributeVariantBuilderProps) {
  const [newGroupName, setNewGroupName] = useState("");
  const [newValues, setNewValues] = useState<Record<number, string>>({});

  function setGroups(groups: ProductAttributeGroup[]) {
    onAttributeGroupsChange(groups);
    onVariantsChange(recomputeVariants(groups, variants));
  }

  function addGroup() {
    const name = newGroupName.trim();
    if (!name || attributeGroups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return;
    setGroups([...attributeGroups, { name, values: [] }]);
    setNewGroupName("");
  }

  function addSuggestion(name: string) {
    if (attributeGroups.some((g) => g.name.toLowerCase() === name.toLowerCase())) return;
    setGroups([...attributeGroups, { name, values: [] }]);
  }

  function removeGroup(idx: number) {
    setGroups(attributeGroups.filter((_, i) => i !== idx));
  }

  function addValue(groupIdx: number) {
    const val = (newValues[groupIdx] ?? "").trim();
    if (!val) return;
    const g = attributeGroups[groupIdx];
    if (g.values.some((v) => v.toLowerCase() === val.toLowerCase())) return;
    const groups = attributeGroups.map((gr, i) =>
      i === groupIdx ? { ...gr, values: [...gr.values, val] } : gr
    );
    setGroups(groups);
    setNewValues((prev) => ({ ...prev, [groupIdx]: "" }));
  }

  function removeValue(groupIdx: number, valIdx: number) {
    const groups = attributeGroups.map((gr, i) =>
      i === groupIdx ? { ...gr, values: gr.values.filter((_, vi) => vi !== valIdx) } : gr
    );
    setGroups(groups);
  }

  const updateVariant = useCallback(
    (varIdx: number, field: "stock" | "price" | "sku", val: string) => {
      onVariantsChange(variants.map((v, i) => (i === varIdx ? { ...v, [field]: val } : v)));
    },
    [variants, onVariantsChange]
  );

  const unusedSuggestions = ATTRIBUTE_SUGGESTIONS.filter(
    (s) => !attributeGroups.some((g) => g.name.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Quick preset chips */}
      <div className="flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-400 font-medium">Quick templates:</span>
        {Object.entries(PRESET_TEMPLATES).map(([label, tmpl]) => (
          <button
            key={label}
            type="button"
            onClick={() => setGroups(tmpl.map((g) => ({ ...g, values: [...g.values] })))}
            className="px-3 py-1 rounded-full text-xs font-bold border transition-all hover:border-[#0A1F44] hover:text-[#0A1F44]"
            style={{ borderColor: "#D6C9BA", color: "#7a5f4e" }}
          >
            {label}
          </button>
        ))}
        {attributeGroups.length > 0 && (
          <button
            type="button"
            onClick={() => setGroups([])}
            className="px-3 py-1 rounded-full text-xs font-bold border border-red-200 text-red-400 hover:bg-red-50 transition-all"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Attribute group cards */}
      {attributeGroups.length > 0 && (
        <div className="space-y-2.5">
          {attributeGroups.map((group, gIdx) => (
            <div
              key={gIdx}
              className="rounded-lg border p-3 space-y-2.5"
              style={{ borderColor: "#E2D9CC", background: "#FDFBF8" }}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wide" style={{ color: MAROON }}>
                  {group.name}
                </span>
                <button type="button" onClick={() => removeGroup(gIdx)} className="p-1 rounded hover:bg-red-50">
                  <X size={13} className="text-red-400" />
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {group.values.map((val, vIdx) => (
                  <span
                    key={vIdx}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold"
                    style={{ background: `${MAROON}18`, color: MAROON }}
                  >
                    {val}
                    <button type="button" onClick={() => removeValue(gIdx, vIdx)}>
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  className={inputClass + " flex-1"}
                  style={{ ...inputStyle, padding: "6px 10px", fontSize: "12px" }}
                  placeholder={`Add ${group.name} value (press Enter)`}
                  value={newValues[gIdx] ?? ""}
                  onChange={(e) => setNewValues((prev) => ({ ...prev, [gIdx]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); addValue(gIdx); }
                  }}
                />
                <button
                  type="button"
                  onClick={() => addValue(gIdx)}
                  className="px-3 py-1.5 rounded-lg text-xs font-bold"
                  style={{ background: `${MAROON}14`, color: MAROON }}
                >
                  Add
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add attribute — suggestions + custom */}
      <div className="space-y-2">
        {unusedSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-gray-400">Add attribute:</span>
            {unusedSuggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSuggestion(s)}
                className="px-2.5 py-0.5 rounded-full text-xs font-semibold border transition-all hover:bg-[#0A1F44] hover:text-white hover:border-[#0A1F44]"
                style={{ borderColor: "#D6C9BA", color: "#6b5b4e" }}
              >
                + {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1.5">
          <input
            className={inputClass + " flex-1"}
            style={{ ...inputStyle, padding: "6px 10px", fontSize: "12px" }}
            placeholder="Custom attribute name (e.g. Blouse Size) — press Enter"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addGroup(); } }}
          />
          <button
            type="button"
            onClick={addGroup}
            className="px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"
            style={{ background: `${MAROON}14`, color: MAROON }}
          >
            <Plus size={12} /> Add
          </button>
        </div>
      </div>

      {/* Variant combination grid */}
      {variants.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#9a8070" }}>
            {variants.length} combination{variants.length !== 1 ? "s" : ""} — set stock &amp; price per variant
          </p>
          <div className="rounded-lg border overflow-hidden" style={{ borderColor: "#E2D9CC" }}>
            <div
              className="grid text-[10px] font-bold uppercase tracking-wider px-3 py-2"
              style={{
                background: `${MAROON}0D`,
                color: "#7a5f4e",
                gridTemplateColumns: "1fr 90px 90px",
              }}
            >
              <span>Combination</span>
              <span>Stock</span>
              <span>Price (₹)</span>
            </div>
            {variants.map((v, vIdx) => (
              <VariantRow key={vIdx} index={vIdx} variant={v} onUpdate={updateVariant} />
            ))}
          </div>
        </div>
      )}

      {attributeGroups.length > 0 && variants.length === 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
          Add at least one value to each attribute group to generate combinations.
        </p>
      )}
    </div>
  );
});

// ── ProductForm ───────────────────────────────────────────────────────────────

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
  const queryClient = useQueryClient();
  const { data: dbCategoriesData } = useQuery<{ categories: any[] }>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      try {
        const res = await apiFetch("/api/categories");
        if (!res.ok) return { categories: [] };
        return res.json();
      } catch {
        return { categories: [] };
      }
    },
    staleTime: 60_000,
  });

  const [showAddSubModal, setShowAddSubModal] = useState(false);
  const [newSubName, setNewSubName] = useState("");
  const [addingSub, setAddingSub] = useState(false);
  const [addSubError, setAddSubError] = useState("");

  const subcategories = useMemo(
    () => getSubcategoriesForCategory(data.category, dbCategoriesData?.categories),
    [data.category, dbCategoriesData?.categories]
  );

  const handleCreateSubcategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newSubName.trim();
    if (!trimmed) {
      setAddSubError("Please enter a subcategory name.");
      return;
    }
    if (!data.category) {
      setAddSubError("Please select a main category first.");
      return;
    }

    setAddingSub(true);
    setAddSubError("");
    try {
      const res = await apiFetch("/api/seller/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          parentId: data.category,
          type: "subcategory",
        }),
      });

      const resJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resJson.error || "Failed to create subcategory.");
      }

      const createdDoc = resJson.category || {
        id: resJson.id || trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        name: trimmed,
        slug: trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        parentId: data.category,
      };

      registerClientDynamicSubcategory(data.category, {
        id: createdDoc.id,
        name: createdDoc.name,
        slug: createdDoc.slug,
        route: `/${data.category}?subcategory=${createdDoc.slug}`,
        subtypes: [],
      });

      await queryClient.invalidateQueries({ queryKey: ["/api/categories"] });

      // Automatically select newly created subcategory
      onChange("subcategory", createdDoc.name);
      onChange("subtype", "");

      window.dispatchEvent(
        new CustomEvent("vastraa-realtime-event", {
          detail: {
            name: "category:created",
            data: { category: createdDoc, parentId: data.category },
          },
        })
      );

      setNewSubName("");
      setShowAddSubModal(false);
    } catch (err: any) {
      setAddSubError(err.message || "Failed to create subcategory.");
    } finally {
      setAddingSub(false);
    }
  };

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
          <FormInput
            field="name"
            value={data.name}
            onChangeField={onChange}
            placeholder="e.g. Peacock Paithani Silk Saree"
            maxLength={120}
          />
        </Field>
        <Field label="Description" error={errors.description}>
          <FormTextarea
            field="description"
            value={data.description}
            onChangeField={onChange}
            rows={3}
            placeholder="Describe the saree — weave, design, drape quality…"
            maxLength={1000}
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Brand" error={errors.brand} hint="Optional">
            <FormInput field="brand" value={data.brand} onChangeField={onChange} placeholder="e.g. VASTRAA Signature" />
          </Field>
          <Field label="Design Pattern" error={errors.designPattern} hint="Optional">
            <FormInput field="designPattern" value={data.designPattern} onChangeField={onChange} placeholder="e.g. Peacock motif, zari border" />
          </Field>
        </div>
      </Section>

      <Section icon={Tag} title="Classification & Product Attributes (Official VASTRAA Categories)">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-3.5 rounded-xl bg-[#0A1F44]/5 border border-[#0A1F44]/15 mb-2">
          {/* Tier 1: Main Category */}
          <Field label="1. Main Category" required error={errors.category} hint="1 of 7 VASTRAA categories">
            <select
              value={data.category}
              onChange={(e) => {
                const newCat = e.target.value;
                onChange("category", newCat);
                onChange("subcategory", "");
                onChange("subtype", "");
                if (!isSareeCategory(newCat)) {
                  onChange("blouseIncluded", false);
                }
              }}
              className={selectClass + " font-semibold text-[#0A1F44]"}
              style={inputStyle}
            >
              {CATEGORY_DROPDOWN_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>

          {/* Tier 2: Subcategory */}
          <Field
            label="2. Subcategory"
            error={errors.subcategory}
            hint={`Approved subcategories for ${CATEGORY_DROPDOWN_OPTIONS.find((c) => c.value === data.category)?.label || data.category}`}
          >
            <select
              value={resolveCanonicalSubcategoryName(data.category, data.subcategory) || data.subcategory}
              onChange={(e) => {
                onChange("subcategory", e.target.value);
                onChange("subtype", "");
              }}
              className={selectClass}
              style={inputStyle}
            >
              <option value="">Select subcategory...</option>
              {(() => {
                const hasGroups = subcategories.some((s) => Boolean(s.group));
                if (!hasGroups) {
                  return subcategories.map((s) => (
                    <option key={s.id} value={s.name}>
                      {s.name}
                    </option>
                  ));
                }
                const groups: Record<string, typeof subcategories> = {};
                for (const s of subcategories) {
                  const grp = s.group || "Other";
                  if (!groups[grp]) groups[grp] = [];
                  groups[grp].push(s);
                }
                return Object.entries(groups).map(([grpName, subs]) => (
                  <optgroup key={grpName} label={grpName}>
                    {subs.map((s) => (
                      <option key={s.id} value={s.name}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                ));
              })()}
            </select>
          </Field>

          {/* Tier 3: Subtype */}
          <Field label="3. Subtype / Variety" error={errors.subtype} hint="Dynamic by subcategory">
            {(() => {
              const subtypes = getSubtypesForSubcategory(data.category, data.subcategory);
              if (subtypes.length > 0) {
                return (
                  <select
                    value={data.subtype || ""}
                    onChange={(e) => onChange("subtype", e.target.value)}
                    className={selectClass}
                    style={inputStyle}
                  >
                    <option value="">Select subtype...</option>
                    {subtypes.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </select>
                );
              }
              return (
                <FormInput
                  field="subtype"
                  value={data.subtype}
                  onChangeField={onChange}
                  placeholder="e.g. Traditional Motif / Handloom"
                />
              );
            })()}
          </Field>
        </div>

        {(() => {
          const isSaree = isSareeCategory(data.category);
          const specFields = getCategorySpecifications(data.category);

          return (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-2">
              {specFields.map((field) => {
                const val = (data as any)[field.key] ?? "";
                const isRequired = field.required;
                const err = (errors as any)[field.key];

                if (field.type === "select" && field.options) {
                  return (
                    <Field key={field.key} label={field.label} required={isRequired} error={err} hint={field.hint}>
                      <FormSelect
                        field={field.key as keyof ProductFormData}
                        value={val}
                        options={field.options}
                        onChangeField={onChange}
                      />
                    </Field>
                  );
                }

                return (
                  <Field key={field.key} label={field.label} required={isRequired} error={err} hint={field.hint}>
                    <FormInput
                      field={field.key as keyof ProductFormData}
                      value={val}
                      onChangeField={onChange}
                      placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}`}
                    />
                  </Field>
                );
              })}

              {/* Universal: Collection Filter */}
              <Field label="Collection Filter" hint="Curated storefront tag">
                <FormInput
                  field="collection"
                  value={data.collection}
                  onChangeField={onChange}
                  placeholder="e.g. royal-festival, festive-glam"
                />
              </Field>

              {/* Universal: Target Gender */}
              <Field label="Target Gender">
                <FormInput field="gender" value={data.gender} onChangeField={onChange} placeholder="Women" />
              </Field>

              {/* Universal: Pack Of */}
              <Field label="Pack Of">
                <FormInput field="packOf" value={data.packOf} onChangeField={onChange} placeholder="Pack of 1" />
              </Field>

              {/* Universal: Country of Origin */}
              <Field label="Country of Origin">
                <FormInput field="countryOfOrigin" value={data.countryOfOrigin} onChangeField={onChange} placeholder="India" />
              </Field>

              {/* Saree-Only: Blouse Piece Availability & Details */}
              {isSaree && (
                <div className="col-span-full border-t border-[#0A1F44]/10 pt-4 mt-2">
                  <div className="flex items-center gap-2.5 pb-3">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded cursor-pointer"
                        checked={data.blouseIncluded}
                        onChange={(e) => onChange("blouseIncluded", e.target.checked)}
                        style={{ accentColor: MAROON }}
                      />
                      <span className="text-sm font-bold text-gray-800">Includes Matching Unstitched Blouse Piece</span>
                    </label>
                  </div>

                  {data.blouseIncluded && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 rounded-xl bg-[#0A1F44]/5 border border-[#0A1F44]/15 animate-in fade-in">
                      <Field label="Blouse Piece Fabric">
                        <FormSelect
                          field="blouseFabric"
                          value={data.blouseFabric || "Pure Silk"}
                          options={BLOUSE_FABRICS_OPTIONS}
                          onChangeField={onChange}
                        />
                      </Field>
                      <Field label="Blouse Piece Colour">
                        <FormSelect
                          field="blouseColor"
                          value={data.blouseColor || data.color}
                          options={COLORS_OPTIONS}
                          onChangeField={onChange}
                        />
                      </Field>
                      <Field label="Blouse Piece Length">
                        <FormSelect
                          field="blouseLength"
                          value={data.blouseLength || "0.80 Metre (Standard Unstitched)"}
                          options={BLOUSE_LENGTHS_OPTIONS}
                          onChangeField={onChange}
                        />
                      </Field>
                      <Field label="Blouse Piece Design (Optional)">
                        <FormSelect
                          field="blouseDesign"
                          value={data.blouseDesign || "Matching Running Blouse Piece"}
                          options={BLOUSE_DESIGNS_OPTIONS}
                          onChangeField={onChange}
                        />
                      </Field>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </Section>

      <Section icon={DollarSign} title="Pricing">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Selling Price (₹)" required error={errors.price}>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <FormInput
                field="price"
                value={data.price}
                onChangeField={onChange}
                className="pl-7"
                type="number"
                min="1"
                placeholder="15000"
              />
            </div>
          </Field>
          <Field label="Original Price (₹)" error={errors.originalPrice} hint="Leave blank if no discount">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">₹</span>
              <FormInput
                field="originalPrice"
                value={data.originalPrice}
                onChangeField={onChange}
                className="pl-7"
                type="number"
                min="1"
                placeholder="Optional"
              />
            </div>
          </Field>
        </div>
      </Section>

      <Section icon={Package} title="Inventory">
        <div className="grid grid-cols-2 gap-4 max-w-md">
          <Field label="Stock Quantity" required error={errors.stock}>
            <FormInput
              field="stock"
              value={data.stock}
              onChangeField={onChange}
              type="number"
              min="0"
              placeholder="10"
            />
          </Field>
          <Field label="Low Stock Threshold" error={errors.lowStockThreshold} hint="Alert below this level">
            <FormInput
              field="lowStockThreshold"
              value={data.lowStockThreshold}
              onChangeField={onChange}
              type="number"
              min="0"
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
            <VideoRow key={idx} index={idx} url={url} onUpdate={updateVideo} onRemove={removeVideo} />
          ))}
          <button type="button" onClick={addVideo} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MAROON }}>
            <Plus size={13} /> Add video
          </button>
        </div>
      </Section>

      <Section icon={Layers} title="Variants">
        <p className="text-xs text-gray-400 -mt-2">
          Optional. Build attribute groups (e.g. Colour, Fabric) — combinations are auto-generated with individual stock and pricing.
        </p>
        <AttributeVariantBuilder
          attributeGroups={data.attributeGroups}
          variants={data.variants}
          onAttributeGroupsChange={(groups) => onChange("attributeGroups", groups)}
          onVariantsChange={(variants) => onChange("variants", variants)}
        />
      </Section>

      <Section icon={ListChecks} title="Specifications">
        <p className="text-xs text-gray-400 -mt-2">Optional. Key-value details like weave, blouse included, wash care.</p>
        <div className="space-y-2.5">
          {data.specifications.map((s, idx) => (
            <SpecRow key={idx} index={idx} specKey={s.key} specValue={s.value} onUpdate={updateSpec} onRemove={removeSpec} />
          ))}
          <button type="button" onClick={addSpec} className="text-xs font-semibold flex items-center gap-1.5" style={{ color: MAROON }}>
            <Plus size={13} /> Add specification
          </button>
        </div>
      </Section>

      <Section icon={Truck} title="Delivery & Returns">
        <Field label="Delivery Information" error={errors.deliveryInfo}>
          <FormTextarea
            field="deliveryInfo"
            value={data.deliveryInfo}
            onChangeField={onChange}
            rows={2}
            placeholder="e.g. Ships within 2-3 business days"
            maxLength={500}
          />
        </Field>
        <Field label="Return Policy" error={errors.returnPolicy}>
          <FormTextarea
            field="returnPolicy"
            value={data.returnPolicy}
            onChangeField={onChange}
            rows={2}
            placeholder="e.g. 7-day easy returns"
            maxLength={500}
          />
        </Field>
      </Section>

      <Section icon={Sparkles} title="Badges & Highlights">
        <div className="flex flex-wrap gap-6">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              id="product-is-bestseller"
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
              id="mark-as-new-arrival"
              className="w-4 h-4 rounded cursor-pointer"
              checked={data.isNewArrival}
              onChange={(e) => onChange("isNewArrival", e.target.checked)}
              style={{ accentColor: MAROON }}
            />
            <span className="text-sm font-medium text-gray-700">Mark as New Arrival</span>
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

      {/* Modal: Add New Subcategory */}
      {showAddSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-gray-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0A1F44]/10 text-[#0A1F44] flex items-center justify-center font-bold">
                  <Plus size={16} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-[#0A1F44]">Add New Subcategory</h3>
                  <p className="text-[11px] text-gray-500">
                    Under {CATEGORY_DROPDOWN_OPTIONS.find((c) => c.value === data.category)?.label || data.category}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddSubModal(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {addSubError && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{addSubError}</span>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label htmlFor="new-sub-name-input" className="block text-xs font-semibold text-gray-700 mb-1.5">
                  Subcategory Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="new-sub-name-input"
                  type="text"
                  value={newSubName}
                  onChange={(e) => {
                    setNewSubName(e.target.value);
                    if (addSubError) setAddSubError("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleCreateSubcategory();
                    }
                  }}
                  placeholder="e.g. Festival Special, Embroidered Velvet, Tissue Pure"
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44] transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  This subcategory will appear dynamically only within{" "}
                  <strong>{CATEGORY_DROPDOWN_OPTIONS.find((c) => c.value === data.category)?.label || data.category}</strong>.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddSubModal(false)}
                  disabled={addingSub}
                  className="px-4 py-2 rounded-xl text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateSubcategory}
                  disabled={addingSub || !newSubName.trim()}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-[#0A1F44] hover:bg-[#0A1F44]/90 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                >
                  {addingSub ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <Plus size={13} />
                      <span>Add Subcategory</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

export function LiveEarningsEstimator({ priceInput }: { priceInput: string }) {
  const [data, setData] = useState<any>(null);

  const numVal = parseFloat(priceInput);
  const isValid = !isNaN(numVal) && numVal > 0;

  useEffect(() => {
    if (!isValid) {
      setData(null);
      return;
    }

    let isMounted = true;
    apiFetch(getApiUrl(`/pricing/quote?sellerBasePrice=${numVal}`))
      .then(async (res) => {
        if (res.ok) {
          const json = await res.json();
          if (isMounted && json.success && json.rupees) {
            setData(json.rupees);
          }
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [priceInput, isValid, numVal]);

  if (!isValid) {
    return (
      <div data-testid="earnings-empty-state" className="p-4 bg-muted/40 rounded-lg text-sm text-muted-foreground">
        Enter a valid price above ₹0 to calculate estimated earnings breakdown.
      </div>
    );
  }

  const formatRupee = (val: number | undefined) =>
    typeof val === "number" ? `₹${val.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

  return (
    <div className="space-y-2 text-sm p-4 bg-slate-50 border rounded-lg">
      <div className="font-semibold text-slate-900 border-b pb-2">Estimated Earnings Breakdown</div>
      <div className="flex justify-between">
        <span className="text-slate-600">Seller Base Price:</span>
        <span data-testid="est-base-price" className="font-mono">{formatRupee(data?.sellerBasePrice ?? numVal)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-600">Platform Commission:</span>
        <span data-testid="est-commission" className="font-mono">{formatRupee(data?.platformCommission)}</span>
      </div>
      <div className="flex justify-between">
        <span className="text-slate-600">Shipping Fee:</span>
        <span data-testid="est-shipping" className="font-mono">{formatRupee(data?.shippingFee)}</span>
      </div>
      <div className="flex justify-between font-medium">
        <span className="text-slate-700">Taxable Amount:</span>
        <span data-testid="est-taxable" className="font-mono">{formatRupee(data?.taxableAmount)}</span>
      </div>
      <div className="flex justify-between font-medium text-slate-900">
        <span>Customer Pays (incl. GST):</span>
        <span data-testid="est-customer-pays" className="font-mono">{formatRupee(data?.customerPays)}</span>
      </div>
      <div className="flex justify-between font-semibold text-emerald-700 pt-2 border-t">
        <span>Est. Net Settlement:</span>
        <span data-testid="est-net-settlement" className="font-mono">{formatRupee(data?.sellerSettlement)}</span>
      </div>
    </div>
  );
}

