import React, { useState, useCallback, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import {
  X, Upload, Download, Check, AlertCircle,
  FileSpreadsheet, FileImage, FolderOpen, Archive, Loader2,
  Search, ArrowLeft, Layers, Hash, CheckCircle2, AlertTriangle, Image as ImageIcon
} from "lucide-react";
import { getApiUrl, apiFetch } from "@/lib/api";

// ── Idempotency key generation ──────────────────────────────────────────────
// One UUID per uploaded file, sent as the Idempotency-Key header so the server
// can dedupe retries of the same batch. Falls back to a manual UUID v4 when
// crypto.randomUUID is unavailable.
export function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const CREAM = "#E5E8EC";

// ── Supported product fields ──────────────────────────────────────────────────
export const PRODUCT_FIELDS = [
  { key: "name",          label: "Name",             required: true  },
  { key: "price",         label: "Price (₹)",        required: true  },
  { key: "category",      label: "Category",         required: true  },
  { key: "sku",           label: "SKU",              required: false },
  { key: "description",   label: "Description",      required: false },
  { key: "fabric",        label: "Fabric",           required: false },
  { key: "color",         label: "Color",            required: false },
  { key: "occasion",      label: "Occasion",         required: false },
  { key: "stock",         label: "Stock",            required: false },
  { key: "originalPrice", label: "Original Price",   required: false },
  { key: "subcategory",   label: "Subcategory",      required: false },
  { key: "brand",         label: "Brand",            required: false },
  { key: "designPattern", label: "Design Pattern",   required: false },
  { key: "images",        label: "Images (pipe-separated URLs)", required: false },
  { key: "imageFiles",    label: "Image Files (pipe-separated names)", required: false },
] as const;

type FieldKey = typeof PRODUCT_FIELDS[number]["key"];

const CATEGORIES = [
  "paithani", "designer", "bridal", "party",
  "paithani-sarees", "paithani sarees", "Paithani Sarees", "paithani saree", "Paithani Saree",
  "designer-sarees", "designer sarees", "Designer Sarees", "designer saree", "Designer Saree",
  "indian-wear", "fashion-wear", "western-wear",
  "Indian Wear", "Fashion Wear", "Western Wear",
  "saree", "sarees", "Saree", "Sarees",
  "lehenga", "lehengas", "Lehenga", "Lehengas",
  "salwar", "salwars", "Salwar", "Salwars", "salwar suit", "Salwar Suit", "salwar suits", "Salwar Suits",
  "kurti", "kurtis", "Kurti", "Kurtis", "kurta", "kurtas", "Kurta", "Kurtas",
  "fabric", "fabrics", "Fabric", "Fabrics",
  "dresses", "tops", "Dresses", "Tops", "dress", "Dress", "top", "Top", "anarkali", "Anarkali", "gown", "gowns", "Gown", "Gowns",
] as const;

const FABRICS    = ["silk", "cotton", "georgette", "net", "chiffon", "tissue", "pure silk", "art silk", "cotton blend", "crepe", "organza", "rayon", "satin", "linen", "velvet"] as const;
const OCCASIONS  = ["bridal", "festival", "casual", "party", "formal", "wedding", "festive", "traditional", "party wear", "daily wear"] as const;
const COLORS     = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint", "white", "beige", "grey", "gray", "peach", "navy", "silver", "brown", "teal", "wine", "rust", "mustard"] as const;

// ── Column-header aliases — maps friendly template labels → field keys ─────────
// Includes both legacy (exact key) and template (friendly label) variants.
const HEADER_ALIASES: Record<string, FieldKey> = {
  // Template friendly labels (exact)
  "product name *":       "name",
  "price (₹) *":         "price",
  "category *":          "category",
  "sku *":               "sku",
  "sku":                 "sku",
  "product sku":         "sku",
  "item sku":            "sku",
  "sku code":            "sku",
  "sku / id":            "sku",
  "product code":        "sku",
  "barcode":             "sku",
  "original price (₹)":  "originalPrice",
  "images (url)":        "images",
  "image files":         "imageFiles",
  "image file":          "imageFiles",
  "image filenames":     "imageFiles",
  "image filename":      "imageFiles",
  "images (files)":      "imageFiles",
  "image files (names)": "imageFiles",
  // Without asterisks / alternate capitalisation
  "product name":        "name",
  "title":               "name",
  "product title":       "name",
  "product":             "name",
  "price (₹)":           "price",
  "price":               "price",
  "selling price":       "price",
  "selling price (₹)":   "price",
  "selling price(₹)":   "price",
  "selling price (inr)": "price",
  "price (inr)":         "price",
  "base price":          "price",
  "base price (n)":      "price",
  "base price (₹)":      "price",
  "base_price":          "price",
  "sale price":          "price",
  "selling_price":       "price",
  "category":            "category",
  "category name":       "category",
  "product category":    "category",
  "description":         "description",
  "desc":                "description",
  "details":             "description",
  "fabric":              "fabric",
  "material":            "fabric",
  "color":               "color",
  "colour":              "color",
  "occasion":            "occasion",
  "stock":               "stock",
  "qty":                 "stock",
  "quantity":            "stock",
  "inventory":           "stock",
  "units":               "stock",
  "available stock":     "stock",
  "stock quantity":      "stock",
  "quantity (stock)":    "stock",
  "original price":      "originalPrice",
  "original_price":      "originalPrice",
  "originalprice":       "originalPrice",
  "mrp":                 "originalPrice",
  "mrp (₹)":             "originalPrice",
  "mrp(₹)":             "originalPrice",
  "original price (inr)": "originalPrice",
  "subcategory":         "subcategory",
  "sub category":        "subcategory",
  "sub-category":        "subcategory",
  "sub category name":   "subcategory",
  "sub-category name":   "subcategory",
  "brand":               "brand",
  "design pattern":      "designPattern",
  "design_pattern":      "designPattern",
  "designpattern":       "designPattern",
  "pattern":             "designPattern",
  "image":               "images",
  "images":              "images",
  "photo":               "images",
  "photos":              "images",
  "picture":             "images",
  "pictures":            "images",
  "product image":       "images",
  "product images":      "images",
  "img":                 "images",
  "imgs":                "images",
  "image urls":          "images",
  "image_urls":          "images",
  "image url":           "images",
  "imageurl":            "images",
  "imageurls":           "images",
  "image_files":         "imageFiles",
  "imagefiles":          "imageFiles",
  "attached images":     "imageFiles",
};

// Columns that should always be ignored (e.g. template-only columns)
const IGNORED_COLUMNS = new Set(["varients", "variants", "variation", "variations"]);

// The canonical workbook supplied by the business contains two filled example
// rows. The download must remain byte-for-byte unchanged, so recognize those
// examples only when the workbook structure and complete source row (including
// the intentionally ignored "Varients" cell) match exactly.
const CANONICAL_TEMPLATE_HEADERS = [
  "Product Name *",
  "Price (₹) *",
  "Category *",
  "Description",
  "Fabric",
  "Color",
  "Occasion",
  "Stock",
  "Original Price (₹)",
  "Varients",
  "Subcategory",
  "Brand",
  "Design Pattern",
  "Images (URL)",
] as const;

const CANONICAL_TEMPLATE_SAMPLE_ROWS = [
  [
    "Peacock Paithani ABC", "15000", "paithani",
    "Handwoven pure silk saree with peacock motifs", "silk", "red",
    "festival", "10", "1000", "6 Var", "paithan festivali", "ss",
    "Peacock", "https://in.pinterest.com/pin/1086352741404761172/",
  ],
  [
    "Peacock Paithani xyz", "15000", "paithani",
    "Handwoven pure silk saree with peacock motifs", "silk", "red",
    "festival", "10", "1000", "6 Var", "paithan festivali", "ss",
    "Peacock", "https://in.pinterest.com/pin/1086352741404761172/",
  ],
] as const;

function isCanonicalTemplateLayout(
  wb: XLSX.WorkBook,
  headerRowIndex: number,
  headers: string[],
): boolean {
  return (
    wb.SheetNames.length === 2
    && wb.SheetNames[0] === "Product Catalog"
    && wb.SheetNames[1] === "Instructions"
    && headerRowIndex === 6
    && headers.length === CANONICAL_TEMPLATE_HEADERS.length
    && headers.every((header, index) => header === CANONICAL_TEMPLATE_HEADERS[index])
  );
}

function isCanonicalTemplateSampleSourceRow(sourceValues: string[]): boolean {
  return CANONICAL_TEMPLATE_SAMPLE_ROWS.some(
    sample => sample.length === sourceValues.length
      && sample.every((value, index) => value === sourceValues[index]),
  );
}

function autoMap(header: string): FieldKey | "" {
  const n = header.toLowerCase().trim();
  // Exact match on field key
  if (PRODUCT_FIELDS.find(f => f.key === n)) return n as FieldKey;
  // Alias match
  return HEADER_ALIASES[n] ?? "";
}

// ── Template XLSX detection ────────────────────────────────────────────────────
/**
 * Scans the first sheet for the canonical product-catalog template header row.
 * The template has:
 *   - Decorative rows 1-6 (title, branding, instructions)
 *   - Row 7 (0-indexed row 6): the actual header row with friendly labels
 *
 * Returns { headerRowIndex, headers, dataStartRow } if found, or null.
 * We scan up to row 10 to handle slight variation in template versions.
 */
function detectTemplateCatalog(wb: XLSX.WorkBook): {
  ws: XLSX.WorkSheet;
  headerRowIndex: number;
  headers: string[];
} | null {
  // Prefer a sheet named "Product Catalog"
  const sheetName = wb.SheetNames.find(
    n => n.toLowerCase().includes("product catalog") || n.toLowerCase().includes("products")
  ) ?? wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws || !ws["!ref"]) return null;

  const range = XLSX.utils.decode_range(ws["!ref"]);

  for (let r = 0; r <= Math.min(10, range.e.r); r++) {
    const rowCells: string[] = [];
    for (let c = 0; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      rowCells.push(cell ? String(cell.v ?? "").trim() : "");
    }

    const normalized = rowCells.map(h => h.toLowerCase().trim());
    const hasName  = rowCells.some(h => autoMap(h) === "name" || h.toLowerCase() === "product name *" || h.toLowerCase() === "product name" || h.toLowerCase() === "name");
    const hasPrice = rowCells.some(h => autoMap(h) === "price" || h.toLowerCase().startsWith("price") || h.toLowerCase() === "price (₹) *");
    const hasCat   = rowCells.some(h => autoMap(h) === "category" || h.toLowerCase() === "category *" || h.toLowerCase() === "category");

    if (hasName && hasPrice && hasCat) {
      const lastNonEmpty = rowCells.reduce((acc, v, i) => v !== "" ? i : acc, -1);
      const finalHeaders = rowCells.slice(0, lastNonEmpty + 1);
      return { ws, headerRowIndex: r, headers: finalHeaders };
    }
  }

  return null;
}

function cleanNumericString(val: string | undefined): string {
  if (!val) return "";
  const cleaned = String(val).replace(/[₹$,\s]|Rs\.?|INR/gi, "").trim();
  const num = Number(cleaned);
  if (!isNaN(num) && num > 0) {
    return String(Math.round(num));
  }
  return cleaned;
}

// ── Parse an uploaded file → mapped rows ─────────────────────────────────────
/**
 * Parses the file. Supports:
 *   1. Canonical template (Product Catalog sheet with friendly labels on row 7)
 *   2. Legacy simple format (first row = field keys, e.g. "name", "price", …)
 *   3. Simple CSV with field keys as first row
 *
 * Returns { rows, headerRow } where headerRow is the
 * 0-based index of the header row in the sheet (used to compute Excel row numbers).
 */
export function parseWorkbook(wb: XLSX.WorkBook): {
  rows: Array<{ values: Record<string, string>; sheetRow: number }>;
  headerRow: number;
} {
  // Try template detection first
  const detected = detectTemplateCatalog(wb);

  if (detected) {
    const { ws, headerRowIndex, headers } = detected;
    const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1:A1");
    const rows: Array<{ values: Record<string, string>; sheetRow: number }> = [];
    const canonicalLayout = isCanonicalTemplateLayout(wb, headerRowIndex, headers);

    for (let r = headerRowIndex + 1; r <= range.e.r; r++) {
      const rowData: Record<string, string> = {};
      const sourceValues: string[] = [];
      let hasAnyValue = false;

      for (let c = 0; c < headers.length; c++) {
        const header = headers[c];
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const val = cell ? String(cell.v ?? "").trim() : "";
        sourceValues.push(val);

        if (!header) continue;

        const normalizedHeader = header.toLowerCase().trim();

        // Skip ignored columns (e.g. Varients)
        if (IGNORED_COLUMNS.has(normalizedHeader)) continue;

        const fieldKey = autoMap(header);
        if (!fieldKey) continue; // unmapped column — skip

        if (fieldKey === "price" || fieldKey === "stock" || fieldKey === "originalPrice") {
          rowData[fieldKey] = cleanNumericString(val);
        } else {
          rowData[fieldKey] = val;
        }
        if (val !== "") hasAnyValue = true;
      }

      // Skip completely empty rows (decorative rows below sample data)
      if (!hasAnyValue) continue;

      // The supplied canonical workbook has two pre-filled examples. Since this
      // flow imports immediately, unchanged examples must never become listings.
      if (canonicalLayout && isCanonicalTemplateSampleSourceRow(sourceValues)) continue;

      rows.push({ values: rowData, sheetRow: r });
    }

    return { rows, headerRow: headerRowIndex };
  }

  // Fallback: legacy first-row-is-headers format
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
  const rows = rawRows.map((raw, idx) => {
    const values: Record<string, string> = {};
    for (const [header, val] of Object.entries(raw)) {
      const fieldKey = autoMap(header);
      if (fieldKey) {
        const strVal = String(val ?? "").trim();
        if (fieldKey === "price" || fieldKey === "stock" || fieldKey === "originalPrice") {
          values[fieldKey] = cleanNumericString(strVal);
        } else {
          values[fieldKey] = strVal;
        }
      }
    }
    return { values, sheetRow: idx + 1 }; // +1 because header is row 0
  });
  return { rows, headerRow: 0 };
}

// ── Validation ────────────────────────────────────────────────────────────────
type RowErrors = Partial<Record<FieldKey, string>>;

function validateRow(row: Record<string, string>): RowErrors {
  const e: RowErrors = {};
  if (!row.name?.trim()) e.name = "Required";
  const cleanedPrice = cleanNumericString(row.price);
  const price = Number(cleanedPrice);
  if (!cleanedPrice || isNaN(price) || price <= 0 || !Number.isInteger(price)) e.price = "Positive whole number";
  const cat = row.category?.toLowerCase().trim();
  if (!cat) {
    e.category = "Category is required";
  } else {
    const isAllowedCat = (CATEGORIES as readonly string[]).some(
      c => c.toLowerCase() === cat || c.toLowerCase().replace(/[-_ ]/g, "") === cat.replace(/[-_ ]/g, "")
    );
    if (!isAllowedCat) {
      e.category = "paithani, designer, bridal, party";
    }
  }
  if (row.fabric && !(FABRICS as readonly string[]).includes(row.fabric.toLowerCase().trim())) e.fabric = FABRICS.join(", ");
  if (row.color  && !(COLORS  as readonly string[]).includes(row.color.toLowerCase().trim()))  e.color  = COLORS.join(", ");
  if (row.occasion && !(OCCASIONS as readonly string[]).includes(row.occasion.toLowerCase().trim())) e.occasion = OCCASIONS.join(", ");
  if (row.stock) { const s = parseInt(cleanNumericString(row.stock), 10); if (isNaN(s) || s < 0) e.stock = "Must be ≥ 0"; }
  if (row.originalPrice) { const op = parseInt(cleanNumericString(row.originalPrice), 10); if (isNaN(op) || op <= 0) e.originalPrice = "Positive number"; }
  return e;
}

// ── Attached image bundle mapping ────────────────────────────────────────────
// Image files are mapped by an explicit "Image Files" cell, by SKU filename convention,
// or by Excel row number (for example, 8-front.jpg).
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const MAX_ATTACHED_IMAGE_FILES = 500;
const MAX_ATTACHED_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_ATTACHED_BUNDLE_BYTES = 100 * 1024 * 1024;

type AttachedImage = {
  file: File;
  relativePath: string;
  displayName: string;
  valid: boolean;
  issue?: string;
};

type ImageBundleResult = {
  images: AttachedImage[];
  issues: string[];
  blocked?: boolean;
};

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function cleanRelativePath(rawPath: string): string {
  return rawPath.replace(/\\/g, "/").replace(/^\/+/, "").trim();
}

function isIgnoredArchivePath(path: string): boolean {
  return path.startsWith("__MACOSX/") || path.split("/").some(part => part.startsWith("."));
}

function mimeTypeForImage(name: string): string {
  switch (fileExtension(name)) {
    case ".jpg":
    case ".jpeg": return "image/jpeg";
    case ".png": return "image/png";
    case ".webp": return "image/webp";
    case ".gif": return "image/gif";
    default: return "application/octet-stream";
  }
}

function makeAttachedImage(file: File, relativePath = file.name): AttachedImage {
  const cleanedPath = cleanRelativePath(relativePath);
  const displayName = cleanedPath.split("/").pop() || file.name;
  const ext = fileExtension(displayName);
  if (!IMAGE_EXTENSIONS.has(ext)) {
    return {
      file, relativePath: cleanedPath, displayName, valid: false,
      issue: `"${displayName}" is not a supported image (use JPG, PNG, WEBP, or GIF)`,
    };
  }
  if (file.size <= 0) {
    return { file, relativePath: cleanedPath, displayName, valid: false, issue: `"${displayName}" is empty` };
  }
  if (file.size > MAX_ATTACHED_IMAGE_BYTES) {
    return {
      file, relativePath: cleanedPath, displayName, valid: false,
      issue: `"${displayName}" exceeds the 10 MB image limit`,
    };
  }
  return { file, relativePath: cleanedPath, displayName, valid: true };
}

function readUint32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/**
 * Extract image entries from a standard ZIP archive without adding a client
 * dependency. Stored and deflated entries are supported.
 */
async function extractZipImages(zipFile: File): Promise<AttachedImage[]> {
  if (zipFile.size > MAX_ATTACHED_BUNDLE_BYTES) {
    throw new Error("The ZIP archive is too large (maximum 100 MB)");
  }
  const bytes = new Uint8Array(await zipFile.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let endOfCentralDirectory = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (offset >= 0 && readUint32(view, offset) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) throw new Error("The ZIP archive is invalid or incomplete");

  const entryCount = view.getUint16(endOfCentralDirectory + 10, true);
  const centralDirectoryOffset = readUint32(view, endOfCentralDirectory + 16);
  if (entryCount > MAX_ATTACHED_IMAGE_FILES || centralDirectoryOffset >= bytes.length) {
    throw new Error(`Archive contains too many files (maximum ${MAX_ATTACHED_IMAGE_FILES})`);
  }

  const images: AttachedImage[] = [];
  let offset = centralDirectoryOffset;
  let totalBytes = 0;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > bytes.length || readUint32(view, offset) !== 0x02014b50) {
      throw new Error("The ZIP archive has a damaged file directory");
    }
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const relativePath = cleanRelativePath(new TextDecoder().decode(bytes.slice(nameStart, nameStart + nameLength)));
    offset = nameStart + nameLength + extraLength + commentLength;

    if (!relativePath || relativePath.endsWith("/") || isIgnoredArchivePath(relativePath)) continue;
    if (flags & 0x1) {
      images.push({
        file: new File([], relativePath), relativePath,
        displayName: relativePath.split("/").pop() || relativePath, valid: false,
        issue: `"${relativePath}" is encrypted; encrypted archives are not supported`,
      });
      continue;
    }
    if (uncompressedSize > MAX_ATTACHED_IMAGE_BYTES || compressedSize > bytes.length) {
      images.push({
        file: new File([], relativePath), relativePath,
        displayName: relativePath.split("/").pop() || relativePath, valid: false,
        issue: `"${relativePath}" exceeds the 10 MB image limit`,
      });
      continue;
    }
    totalBytes += uncompressedSize;
    if (totalBytes > MAX_ATTACHED_BUNDLE_BYTES) {
      throw new Error("The archive is too large (maximum 100 MB of extracted images)");
    }
    if (localHeaderOffset + 30 > bytes.length || readUint32(view, localHeaderOffset) !== 0x04034b50) {
      throw new Error(`The ZIP entry "${relativePath}" is damaged`);
    }
    const localNameLength = view.getUint16(localHeaderOffset + 26, true);
    const localExtraLength = view.getUint16(localHeaderOffset + 28, true);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);
    if (compressed.length !== compressedSize) throw new Error(`The ZIP entry "${relativePath}" is truncated`);

    let content: Uint8Array;
    if (method === 0) {
      content = compressed;
    } else if (method === 8) {
      const DecompressionStreamCtor = (globalThis as any).DecompressionStream;
      if (!DecompressionStreamCtor) throw new Error("This browser cannot extract deflated ZIP archives");
      const reader = new Blob([compressed as BlobPart]).stream()
        .pipeThrough(new DecompressionStreamCtor("deflate-raw"))
        .getReader();
      const chunks: Uint8Array[] = [];
      let inflatedBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = value as Uint8Array;
        inflatedBytes += chunk.byteLength;
        if (inflatedBytes > MAX_ATTACHED_IMAGE_BYTES || totalBytes - uncompressedSize + inflatedBytes > MAX_ATTACHED_BUNDLE_BYTES) {
          await reader.cancel();
          throw new Error(`"${relativePath}" exceeds the allowed extracted image or bundle size`);
        }
        chunks.push(chunk);
      }
      if (inflatedBytes !== uncompressedSize) throw new Error(`The ZIP entry "${relativePath}" has an invalid extracted size`);
      content = new Uint8Array(inflatedBytes);
      let cursor = 0;
      for (const chunk of chunks) {
        content.set(chunk, cursor);
        cursor += chunk.byteLength;
      }
    } else {
      images.push({
        file: new File([], relativePath), relativePath,
        displayName: relativePath.split("/").pop() || relativePath, valid: false,
        issue: `"${relativePath}" uses unsupported ZIP compression`,
      });
      continue;
    }
    const extractedFile = new File([content as BlobPart], relativePath, { type: mimeTypeForImage(relativePath) });
    images.push(makeAttachedImage(extractedFile, relativePath));
  }
  return images;
}

async function collectImageBundle(files: FileList | File[]): Promise<ImageBundleResult> {
  const rawFiles = Array.from(files);
  if (rawFiles.length === 0) return { images: [], issues: [] };
  if (rawFiles.length === 1 && fileExtension(rawFiles[0].name) === ".zip") {
    try {
      return { images: await extractZipImages(rawFiles[0]), issues: [] };
    } catch (error) {
      return { images: [], issues: [error instanceof Error ? error.message : "Could not read the ZIP archive"], blocked: true };
    }
  }

  const issues: string[] = [];
  if (rawFiles.some(file => fileExtension(file.name) === ".zip")) {
    issues.push("Choose one ZIP archive, or a folder of images — not a ZIP mixed with loose files");
  }
  if (rawFiles.length > MAX_ATTACHED_IMAGE_FILES) {
    issues.push(`The image bundle contains too many files (maximum ${MAX_ATTACHED_IMAGE_FILES})`);
  }
  if (rawFiles.reduce((sum, file) => sum + file.size, 0) > MAX_ATTACHED_BUNDLE_BYTES) {
    issues.push("The image bundle is too large (maximum 100 MB)");
  }
  const images = rawFiles.map(file => makeAttachedImage(
    file,
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  ));
  return { images, issues, blocked: issues.length > 0 };
}

function normalizedFileKey(name: string): string {
  return cleanRelativePath(name).toLowerCase();
}

function baseName(name: string): string {
  return cleanRelativePath(name).split("/").pop()?.toLowerCase() ?? "";
}

function rowNumberFromFilename(name: string): number | null {
  const stem = baseName(name).replace(/\.[^.]+$/, "");
  const match = stem.match(/^(?:row[-_ ]?)?(\d+)(?:[-_ ]|$)/i);
  return match ? Number(match[1]) : null;
}

function skuMatchesFilename(sku: string | undefined, name: string): boolean {
  if (!sku || !sku.trim()) return false;
  const cleanSku = sku.trim().toLowerCase();
  const stem = baseName(name).replace(/\.[^.]+$/, "").toLowerCase();
  return (
    stem === cleanSku ||
    stem.startsWith(`${cleanSku}-`) ||
    stem.startsWith(`${cleanSku}_`) ||
    stem.startsWith(`${cleanSku} `)
  );
}

type ImageMappingResult = {
  reviewRows: ReviewRow[];
  validRows: ReviewRow[];
  fileIssues: string[];
  filesByRow: Map<number, AttachedImage[]>;
};

/**
 * Resolve explicit Image Files cells first, then row-number and SKU filenames.
 * A basename that appears more than once is ambiguous and cannot be assigned.
 */
export function mapAttachedImages(reviewRows: ReviewRow[], bundle: ImageBundleResult): ImageMappingResult {
  const reviewWithErrors = reviewRows.map(row => ({
    ...row,
    values: { ...row.values },
    errors: { ...row.errors },
  }));
  const fileIssues = [...bundle.issues];
  const byExactPath = new Map<string, AttachedImage[]>();
  const byBaseName = new Map<string, AttachedImage[]>();
  for (const image of bundle.images) {
    const exactKey = normalizedFileKey(image.relativePath);
    const nameKey = baseName(image.displayName);
    byExactPath.set(exactKey, [...(byExactPath.get(exactKey) ?? []), image]);
    byBaseName.set(nameKey, [...(byBaseName.get(nameKey) ?? []), image]);
    if (!image.valid && image.issue) fileIssues.push(image.issue);
  }

  const assignments = new Map<AttachedImage, number[]>();
  const filesByRow = new Map<number, AttachedImage[]>();
  for (const row of reviewWithErrors) {
    const rawNames = row.values.imageFiles?.split("|") ?? [];
    const requestedNames = rawNames.map(value => value.trim()).filter(Boolean);
    const conventionMatches = requestedNames.length === 0
      ? bundle.images
        .filter(image => {
          if (rowNumberFromFilename(image.displayName) === row.index + 1) return true;
          if (skuMatchesFilename(row.values.sku, image.displayName)) return true;
          return false;
        })
        .sort((a, b) => normalizedFileKey(a.relativePath).localeCompare(normalizedFileKey(b.relativePath)))
      : [];
    const names = requestedNames.length > 0 ? requestedNames : conventionMatches.map(image => image.relativePath);

    if (rawNames.length > 0 && rawNames.some(value => !value.trim())) {
      row.errors.imageFiles = "Image file names cannot contain blank entries";
    }

    const resolved: AttachedImage[] = [];
    for (const requestedName of names) {
      const exact = byExactPath.get(normalizedFileKey(requestedName)) ?? [];
      const matches = exact.length > 0 ? exact : (byBaseName.get(baseName(requestedName)) ?? []);
      if (matches.length === 0) {
        row.errors.imageFiles = `Missing attached image "${requestedName}"`;
        continue;
      }
      if (matches.length > 1) {
        row.errors.imageFiles = `Attached image "${requestedName}" is duplicated or ambiguous`;
        continue;
      }
      const image = matches[0];
      if (!image.valid) {
        row.errors.imageFiles = image.issue ?? `Invalid attached image "${requestedName}"`;
        continue;
      }
      resolved.push(image);
      assignments.set(image, [...(assignments.get(image) ?? []), row.index]);
    }
    if (resolved.length > 0) filesByRow.set(row.index, resolved);
  }

  for (const image of bundle.images) {
    const assignedRows = assignments.get(image) ?? [];
    if (assignedRows.length === 0 && image.valid) {
      fileIssues.push(`Unassigned image "${image.relativePath}" — name it in Image Files or prefix it with its Excel row number`);
    } else if (assignedRows.length > 1) {
      for (const rowIndex of assignedRows) {
        const row = reviewWithErrors.find(candidate => candidate.index === rowIndex);
        if (row) row.errors.imageFiles = `Attached image "${image.displayName}" is assigned to more than one row`;
      }
    }
  }

  return {
    reviewRows: reviewWithErrors,
    validRows: reviewWithErrors.filter(row => Object.keys(row.errors).length === 0),
    fileIssues,
    filesByRow,
  };
}

// ── Template download (static file) ──────────────────────────────────────────
function downloadTemplate() {
  const a = document.createElement("a");
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  a.href = `${basePath}/twirldrape_product_template.xlsx`;
  a.download = "twirldrape_product_template.xlsx";
  a.click();
}

export function toExcelRowNumber(zeroBasedSheetRow: number) {
  return zeroBasedSheetRow + 1;
}

// ── Error report download ─────────────────────────────────────────────────────
function downloadErrorReport(
  failed: Array<{ rowIndex: number; row: Record<string, string>; reason: string }>
) {
  const headers = ["Excel Row", ...PRODUCT_FIELDS.map(f => f.key), "Error Reasons"];
  const data = failed.map(({ rowIndex, row, reason }) => [
    String(toExcelRowNumber(rowIndex)),
    ...PRODUCT_FIELDS.map(f => row[f.key] ?? ""),
    reason,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Failed Rows");
  XLSX.writeFile(wb, "vastraa_upload_errors.xlsx");
}

// ── Module-level types ────────────────────────────────────────────────────────
type Step = "upload" | "preview" | "processing" | "results";

type ReviewRow  = { index: number; values: Record<string, string>; errors: RowErrors };
type ApiResult  = { row: number; success: boolean; error?: string; productId?: string; name?: string };
type FailedRow  = { rowIndex: number; row: Record<string, string>; reason: string; source: "client" | "server" };
type ImportResult = {
  succeeded: number;
  failed: number;
  skippedDuplicates?: number;
  totalProcessed?: number;
  apiResults: ApiResult[];
  validRows: ReviewRow[];
  allFailed: FailedRow[];
  fileIssues: string[];
};

async function uploadAttachedImage(file: File): Promise<string> {
  const response = await apiFetch("/api/seller/upload/product-image", {
    method: "POST",
    headers: { "Content-Type": file.type || mimeTypeForImage(file.name) },
    body: file,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.publicRelPath !== "string") {
    throw new Error(body.error || `Upload failed (${response.status})`);
  }
  return getApiUrl(body.publicRelPath);
}

async function deleteUploadedProductImages(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const response = await apiFetch("/api/seller/upload/product-image/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  });
  if (!response.ok) throw new Error("Could not clean up rejected image uploads");
}

async function uploadMappedImages(mapping: ImageMappingResult): Promise<{
  reviewRows: ReviewRow[];
  validRows: ReviewRow[];
  uploadedPathsByRow: Map<number, string[]>;
}> {
  const reviewRows = mapping.reviewRows.map(row => ({
    ...row,
    values: { ...row.values },
    errors: { ...row.errors },
  }));
  const uploadedPathsByRow = new Map<number, string[]>();

  for (const row of reviewRows) {
    if (Object.keys(row.errors).length > 0) continue;
    const files = mapping.filesByRow.get(row.index) ?? [];
    const uploadedPaths: string[] = [];
    try {
      for (const image of files) uploadedPaths.push(await uploadAttachedImage(image.file));
      const existingPaths = row.values.images?.trim() ? row.values.images.trim().split("|") : [];
      if (uploadedPaths.length > 0) row.values.images = [...existingPaths, ...uploadedPaths].join("|");
      if (uploadedPaths.length > 0) uploadedPathsByRow.set(row.index, uploadedPaths);
      delete row.values.imageFiles;
    } catch (error) {
      try {
        await deleteUploadedProductImages(uploadedPaths);
      } catch {
        // The row remains blocked; a retry still cannot create a mismatched product.
      }
      row.errors.imageFiles = error instanceof Error
        ? `Could not upload attached images: ${error.message}`
        : "Could not upload attached images";
    }
  }

  return {
    reviewRows,
    validRows: reviewRows.filter(row => Object.keys(row.errors).length === 0),
    uploadedPathsByRow,
  };
}

// ── Pure merge helper (exported for unit tests) ───────────────────────────────
export function buildAllFailed(
  reviewRows: ReviewRow[],
  validRows: ReviewRow[],
  apiResults: ApiResult[],
): FailedRow[] {
  const clientInvalid: FailedRow[] = reviewRows
    .filter(r => Object.keys(r.errors).length > 0)
    .map(r => ({
      rowIndex: r.index,
      row: r.values,
      reason: Object.entries(r.errors)
        .map(([k, v]) => `${k}: ${v}`)
        .join("; "),
      source: "client" as const,
    }));

  const serverFailed: FailedRow[] = validRows.flatMap((r, originalIdx) => {
    const result = apiResults[originalIdx];
    if (result?.success) return [];
    return [
      {
        rowIndex: r.index,
        row: r.values,
        reason: result?.error ?? "Import failed",
        source: "server" as const,
      },
    ];
  });

  return [...clientInvalid, ...serverFailed].sort(
    (a, b) => a.rowIndex - b.rowIndex,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface Props { onClose: () => void; onDone: (msg: string) => void; }

export default function SellerBulkUpload({ onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>("upload");
  const dropRef = useRef<HTMLDivElement>(null);

  // Upload step state
  const [fileError,   setFileError]  = useState("");
  const [isDragging,  setIsDragging] = useState(false);
  const imageBundleFilesRef = useRef<File[]>([]);
  const [imageBundleLabel, setImageBundleLabel] = useState("");

  // Preview & Validate state
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);
  const [validRows,  setValidRows]  = useState<ReviewRow[]>([]);
  const [fileIssues, setFileIssues] = useState<string[]>([]);
  const [filesByRow, setFilesByRow] = useState<Map<number, AttachedImage[]>>(new Map());
  const [previewFilter, setPreviewFilter] = useState<"all" | "valid" | "invalid">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewBlobUrls, setPreviewBlobUrls] = useState<Map<number, string>>(new Map());

  // Processing / results state
  const [processingStatus, setProcessingStatus] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError,  setImportError]  = useState("");
  const [lastReviewRows, setLastReviewRows] = useState<ReviewRow[]>([]);
  const [lastValidRows,  setLastValidRows]  = useState<ReviewRow[]>([]);
  const [lastFileIssues, setLastFileIssues] = useState<string[]>([]);
  const lastUploadedPathsByRowRef = useRef<Map<number, string[]>>(new Map());
  const idempotencyKeyRef = useRef<string>("");
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      previewBlobUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previewBlobUrls]);

  // ── File parsing ────────────────────────────────────────────────────────────
  const processFile = useCallback(async (file: File) => {
    setFileError("");
    const allowed = [".xlsx", ".xls", ".csv"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setFileError("Please upload an .xlsx, .xls, or .csv file.");
      return;
    }

    setStep("processing");
    setProcessingStatus("Reading file…");
    setImportError("");
    setImportResult(null);
    idempotencyKeyRef.current = generateIdempotencyKey();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const data = new Uint8Array(arrayBuffer);
      const wb = XLSX.read(data, { type: "array" });

      setProcessingStatus("Detecting columns…");
      const { rows: parsedRows } = parseWorkbook(wb);

      if (parsedRows.length === 0) {
        setFileError("The file has no product rows to import. Add your own rows; unchanged template examples are ignored.");
        setStep("upload");
        return;
      }
      if (parsedRows.length > 500) {
        setFileError("Maximum 500 rows per upload. Please split the file.");
        setStep("upload");
        return;
      }

      setProcessingStatus(`Validating ${parsedRows.length} rows…`);

      // Track duplicate product names and SKUs within the sheet
      const nameCounts = new Map<string, number>();
      const skuCounts = new Map<string, number>();
      for (const { values } of parsedRows) {
        const n = values.name?.trim().toLowerCase();
        if (n) nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
        const s = values.sku?.trim().toLowerCase();
        if (s) skuCounts.set(s, (skuCounts.get(s) || 0) + 1);
      }

      const initialReviewRows: ReviewRow[] = parsedRows.map(({ values, sheetRow }) => {
        const errors = validateRow(values);
        const n = values.name?.trim().toLowerCase();
        if (n && (nameCounts.get(n) || 0) > 1) {
          errors.name = errors.name ? `${errors.name}; Duplicate product name in file` : "Duplicate product name in file";
        }
        const s = values.sku?.trim().toLowerCase();
        if (s && (skuCounts.get(s) || 0) > 1) {
          errors.sku = "Duplicate SKU in file";
        }
        return {
          index: sheetRow,
          values,
          errors,
        };
      });

      setProcessingStatus("Matching attached images…");
      const imageBundle = await collectImageBundle(imageBundleFilesRef.current);
      if (imageBundle.blocked) {
        setFileError(imageBundle.issues.join(" "));
        setStep("upload");
        return;
      }
      const mappedImages = mapAttachedImages(initialReviewRows, imageBundle);

      // Generate object URLs for attached images for live thumbnail display
      const blobUrls = new Map<number, string>();
      mappedImages.filesByRow.forEach((files, rowIndex) => {
        if (files.length > 0 && files[0].file) {
          blobUrls.set(rowIndex, URL.createObjectURL(files[0].file));
        }
      });
      setPreviewBlobUrls(blobUrls);

      setReviewRows(mappedImages.reviewRows);
      setValidRows(mappedImages.validRows);
      setFileIssues(mappedImages.fileIssues);
      setFilesByRow(mappedImages.filesByRow);

      // Advance directly to Step 4: Preview and Validate Products
      setStep("preview");
    } catch (err: any) {
      setFileError("Could not parse the file. Please check it is a valid Excel or CSV file.");
      setStep("upload");
    }
  }, []);

  // ── Core import logic (triggered when seller confirms import in Preview) ────
  async function runImport(
    reviewRowsToUse: ReviewRow[],
    validRowsToUse: ReviewRow[],
    fileIssuesToUse: string[] = [],
    uploadedPathsByRow: Map<number, string[]> = lastUploadedPathsByRowRef.current,
  ) {
    if (isSubmittingRef.current) return;

    setImportError("");

    if (validRowsToUse.length === 0) {
      const allFailed = buildAllFailed(reviewRowsToUse, [], []);
      setImportResult({
        succeeded: 0,
        failed: allFailed.length,
        skippedDuplicates: 0,
        totalProcessed: reviewRowsToUse.length,
        apiResults: [],
        validRows: [],
        allFailed,
        fileIssues: fileIssuesToUse,
      });
      setStep("results");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setProcessingStatus(`Importing ${validRowsToUse.length} valid row${validRowsToUse.length !== 1 ? "s" : ""}…`);

    try {
      const res = await apiFetch("/api/seller/products/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({ rows: validRowsToUse.map(r => r.values) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        let msg = data?.error || data?.message;
        if (!msg) {
          if (res.status === 401) {
            msg = "Your seller session has expired. Please log in again.";
          } else if (res.status === 403) {
            msg = "Your seller account is not authorized or pending approval.";
          } else if (res.status === 409) {
            msg = "This upload is currently being processed. Please wait a moment and retry.";
          } else if (res.status >= 500) {
            msg = "Server error while importing products. Please check the file and try again.";
          } else {
            msg = `Import failed (${res.status}: ${res.statusText || "Bad Request"})`;
          }
        } else if (res.status === 401 && !msg.toLowerCase().includes("session") && !msg.toLowerCase().includes("log in")) {
          msg = `Your seller session has expired. Please log in again (${msg}).`;
        }
        throw new Error(msg);
      }

      if (!data || !Array.isArray(data.results)) {
        throw new Error("Server returned an invalid response structure.");
      }

      const apiResults: ApiResult[] = data.results ?? [];
      const allFailed = buildAllFailed(reviewRowsToUse, validRowsToUse, apiResults);
      const rejectedPaths = validRowsToUse.flatMap((row, index) =>
        apiResults[index]?.success ? [] : (uploadedPathsByRow.get(row.index) ?? []),
      );
      const resultFileIssues = [...fileIssuesToUse];
      try {
        await deleteUploadedProductImages(rejectedPaths);
      } catch {
        resultFileIssues.push("Some rejected-row image uploads could not be cleaned up automatically.");
      }

      const skippedDuplicates = (data.summary?.skippedDuplicates) ??
        allFailed.filter(f => f.reason?.toLowerCase().includes("duplicate") || f.reason?.toLowerCase().includes("already exists")).length;

      const result: ImportResult = {
        succeeded: data.summary?.succeeded ?? 0,
        failed: allFailed.length,
        skippedDuplicates,
        totalProcessed: reviewRowsToUse.length,
        apiResults,
        validRows: validRowsToUse,
        allFailed,
        fileIssues: resultFileIssues,
      };
      setImportResult(result);
      if (result.succeeded > 0) onDone(`${result.succeeded} product(s) imported`);
      setStep("results");
    } catch (err: any) {
      setImportError(err.message || "Import failed");
      setProcessingStatus("");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // ── Handler for seller confirming import from the Preview screen ───────────
  async function handleConfirmImport() {
    setLastReviewRows(reviewRows);
    setLastValidRows(validRows);
    setLastFileIssues(fileIssues);

    setStep("processing");
    setProcessingStatus("Uploading matched images to storage…");

    try {
      const preparedRows = await uploadMappedImages({
        reviewRows,
        validRows,
        fileIssues,
        filesByRow,
      });

      setLastReviewRows(preparedRows.reviewRows);
      setLastValidRows(preparedRows.validRows);
      lastUploadedPathsByRowRef.current = preparedRows.uploadedPathsByRow;

      await runImport(
        preparedRows.reviewRows,
        preparedRows.validRows,
        fileIssues,
        preparedRows.uploadedPathsByRow,
      );
    } catch (err: any) {
      setImportError(err.message || "Failed to process attached images");
      setStep("processing");
    }
  }

  // ── Retry after top-level failure ──────────────────────────────────────────
  async function handleRetry() {
    idempotencyKeyRef.current = generateIdempotencyKey();
    await runImport(lastReviewRows, lastValidRows, lastFileIssues);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
    e.target.value = "";
  }

  function handleImageBundleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    imageBundleFilesRef.current = files;
    if (files.length === 0) {
      setImageBundleLabel("");
    } else if (files.length === 1 && fileExtension(files[0].name) === ".zip") {
      setImageBundleLabel(`Archive selected: ${files[0].name}`);
    } else {
      setImageBundleLabel(`${files.length} image file${files.length === 1 ? "" : "s"} selected`);
    }
    e.target.value = "";
  }

  // drag-and-drop
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function onDragLeave() { setIsDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }

  // ── Preview Metrics ────────────────────────────────────────────────────────
  const totalCount = reviewRows.length;
  const validCount = validRows.length;
  const invalidRowsList = reviewRows.filter(r => Object.keys(r.errors).length > 0);
  const invalidCount = invalidRowsList.length;
  const duplicateCount = reviewRows.filter(r =>
    (r.errors.name && r.errors.name.includes("Duplicate")) ||
    (r.errors.sku && r.errors.sku.includes("Duplicate"))
  ).length;
  const missingImagesCount = reviewRows.filter(r => {
    const hasUrls = Boolean(r.values.images?.trim());
    const hasFiles = (filesByRow.get(r.index) ?? []).length > 0;
    return !hasUrls && !hasFiles;
  }).length;

  const filteredRows = reviewRows.filter(r => {
    const hasErrors = Object.keys(r.errors).length > 0;
    if (previewFilter === "valid" && hasErrors) return false;
    if (previewFilter === "invalid" && !hasErrors) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const name = (r.values.name || "").toLowerCase();
      const sku = (r.values.sku || "").toLowerCase();
      const cat = (r.values.category || "").toLowerCase();
      return name.includes(q) || sku.includes(q) || cat.includes(q);
    }
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden transition-all duration-300"
        style={{
          width: "100%",
          maxWidth: step === "preview" ? 1080 : 640,
          maxHeight: "94vh",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0 bg-white">
          <div>
            <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Bulk Upload Products</h3>
            <div className="flex items-center gap-1.5 mt-1">
              {(["upload", "preview", "processing", "results"] as Step[]).map((s, i) => {
                const label = s === "upload" ? "Upload" : s === "preview" ? "Preview & Validate" : s === "processing" ? "Import" : "Results";
                const isActive = step === s;
                return (
                  <React.Fragment key={s}>
                    <span className={`text-[10px] font-semibold tracking-wide ${isActive ? "text-[#0A1F44] font-bold" : "text-gray-400"}`}>
                      {i + 1}. {label}
                    </span>
                    {i < 3 && <span className="text-gray-300 text-[10px]">›</span>}
                  </React.Fragment>
                );
              })}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ─── STEP 1: Upload ─── */}
          {step === "upload" && (
            <div className="space-y-5">
              {/* Drop zone */}
              <div
                ref={dropRef}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                className="border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer"
                style={{ borderColor: isDragging ? MAROON : "#D6C9BA", background: isDragging ? `${MAROON}08` : "#FAFAF8" }}
              >
                <FileSpreadsheet size={36} className="mx-auto mb-3" style={{ color: isDragging ? MAROON : "#C7CCD1" }} />
                <p className="font-semibold text-gray-700 mb-1">Drop your Excel file here</p>
                <p className="text-xs text-gray-400 mb-4">.xlsx, .xls, or .csv — up to 500 rows</p>
                <label className="cursor-pointer">
                  <span className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm inline-block" style={{ background: MAROON }}>
                    Choose File
                  </span>
                  <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleFileInput} />
                </label>
              </div>

              {/* Attached image bundle */}
              <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: "#C7CCD166", background: "#FFFDF6" }}>
                <div className="flex gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${GOLD}1F`, color: MAROON }}>
                    <FolderOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-700">Optional product-image folder or ZIP</p>
                    <p className="text-[11px] leading-relaxed text-gray-500 mt-0.5">
                      Select images first, then your spreadsheet. In the sheet, add an <strong>Image Files</strong> column with
                      filenames separated by <code>|</code>, or name files by SKU (e.g. <code>SKU101.jpg</code>) or row number (<code>8-front.jpg</code>).
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C7CCD1]/50 text-xs font-semibold hover:bg-[#C7CCD1]/10" style={{ color: MAROON }}>
                          <FolderOpen size={13} /> Choose Folder
                        </span>
                        <input
                          type="file"
                          accept=".jpg,.jpeg,.png,.webp,.gif,image/jpeg,image/png,image/webp,image/gif"
                          multiple
                          className="sr-only"
                          onChange={handleImageBundleInput}
                          {...({ webkitdirectory: "", directory: "" } as any)}
                        />
                      </label>
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C7CCD1]/50 text-xs font-semibold hover:bg-[#C7CCD1]/10" style={{ color: MAROON }}>
                          <Archive size={13} /> Choose ZIP
                        </span>
                        <input type="file" accept=".zip,application/zip" className="sr-only" onChange={handleImageBundleInput} />
                      </label>
                      {imageBundleLabel && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#0A1F44] font-medium truncate max-w-56">
                          <FileImage size={13} /> {imageBundleLabel}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {fileError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle size={15} /> {fileError}
                </div>
              )}

              {/* Template download */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ borderColor: "#C7CCD133", background: CREAM }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: MAROON }}>Download template</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">Ready-to-use template with columns for name, SKU, price, category, attributes and images</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#C7CCD1]/60 hover:bg-[#C7CCD1]/20 transition-colors bg-white shadow-xs"
                  style={{ color: MAROON }}
                >
                  <Download size={13} /> Template
                </button>
              </div>

              {/* Field reference */}
              <details className="rounded-xl border border-gray-200 overflow-hidden">
                <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-gray-600 bg-gray-50 hover:bg-gray-100 transition-colors">
                  View expected column names & allowed values
                </summary>
                <div className="p-4 space-y-2 text-xs text-gray-600">
                  {PRODUCT_FIELDS.map(f => (
                    <div key={f.key} className="flex gap-2">
                      <code className="font-mono text-[#0A1F44] w-32 shrink-0">{f.key}</code>
                      <span className="text-gray-400">{f.required ? "required" : "optional"}</span>
                      {f.key === "sku"      && <span className="text-gray-500">optional unique identifier</span>}
                      {f.key === "category" && <span className="text-gray-500">{CATEGORIES.join(", ")}</span>}
                      {f.key === "fabric"   && <span className="text-gray-500">{FABRICS.join(", ")}</span>}
                      {f.key === "color"    && <span className="text-gray-500">{COLORS.join(", ")}</span>}
                      {f.key === "occasion" && <span className="text-gray-500">{OCCASIONS.join(", ")}</span>}
                      {f.key === "images"   && <span className="text-gray-500">direct http(s) image URLs or Cloudflare R2 paths separated by |</span>}
                      {f.key === "imageFiles" && <span className="text-gray-500">attached filenames separated with |, matched from folder or ZIP</span>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ─── STEP 2/4: Preview and Validate Products ─── */}
          {step === "preview" && (
            <div className="space-y-5">
              {/* Metric Counters Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3.5 rounded-xl border border-blue-100 bg-blue-50/60 text-center">
                  <div className="text-xs font-medium text-blue-700">Total Rows</div>
                  <div className="text-xl font-bold text-blue-900 mt-0.5">{totalCount}</div>
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-100 bg-emerald-50/60 text-center">
                  <div className="text-xs font-medium text-emerald-700">Valid Products</div>
                  <div className="text-xl font-bold text-emerald-900 mt-0.5">{validCount}</div>
                </div>
                <div className="p-3.5 rounded-xl border border-rose-100 bg-rose-50/60 text-center">
                  <div className="text-xs font-medium text-rose-700">Invalid Rows</div>
                  <div className="text-xl font-bold text-rose-900 mt-0.5">{invalidCount}</div>
                </div>
                <div className="p-3.5 rounded-xl border border-amber-100 bg-amber-50/60 text-center">
                  <div className="text-xs font-medium text-amber-700">Duplicates</div>
                  <div className="text-xl font-bold text-amber-900 mt-0.5">{duplicateCount}</div>
                </div>
                <div className="p-3.5 rounded-xl border border-purple-100 bg-purple-50/60 text-center">
                  <div className="text-xs font-medium text-purple-700">Missing Images</div>
                  <div className="text-xl font-bold text-purple-900 mt-0.5">{missingImagesCount}</div>
                </div>
              </div>

              {/* Filter Tabs and Search Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-1.5 bg-gray-100/80 p-1 rounded-xl w-full sm:w-auto">
                  <button
                    onClick={() => setPreviewFilter("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      previewFilter === "all" ? "bg-white text-gray-900 shadow-xs" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    All ({totalCount})
                  </button>
                  <button
                    onClick={() => setPreviewFilter("valid")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      previewFilter === "valid" ? "bg-emerald-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Valid ({validCount})
                  </button>
                  <button
                    onClick={() => setPreviewFilter("invalid")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      previewFilter === "invalid" ? "bg-rose-600 text-white shadow-xs" : "text-gray-500 hover:text-gray-900"
                    }`}
                  >
                    Invalid / Issues ({invalidCount})
                  </button>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search name, SKU, category…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#0A1F44]/20 focus:border-[#0A1F44]"
                  />
                </div>
              </div>

              {/* Attached file issues notice */}
              {fileIssues.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                    <AlertTriangle size={13} /> Attached Image Warnings ({fileIssues.length})
                  </p>
                  <ul className="mt-1 max-h-20 overflow-y-auto space-y-0.5 text-[11px] leading-relaxed text-amber-700">
                    {fileIssues.slice(0, 5).map((issue, idx) => <li key={idx}>• {issue}</li>)}
                    {fileIssues.length > 5 && <li className="italic">…and {fileIssues.length - 5} more issues</li>}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              <div className="border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                <div className="max-h-84 overflow-y-auto overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-gray-50/90 text-gray-600 font-semibold border-b border-gray-200 sticky top-0 z-10 backdrop-blur-xs">
                        <th className="py-2.5 px-3 w-12 text-center">Row</th>
                        <th className="py-2.5 px-3 w-20">Status</th>
                        <th className="py-2.5 px-3 w-16">Image</th>
                        <th className="py-2.5 px-3 min-w-40">Product Name</th>
                        <th className="py-2.5 px-3 w-24">SKU</th>
                        <th className="py-2.5 px-3 w-28">Category</th>
                        <th className="py-2.5 px-3 w-24 text-right">Price</th>
                        <th className="py-2.5 px-3 w-16 text-center">Stock</th>
                        <th className="py-2.5 px-3 min-w-32">Attributes</th>
                        <th className="py-2.5 px-3 min-w-44">Validation Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="py-8 text-center text-gray-400">
                            No products match the selected filter.
                          </td>
                        </tr>
                      ) : (
                        filteredRows.map((r) => {
                          const hasErrors = Object.keys(r.errors).length > 0;
                          const attachedImages = filesByRow.get(r.index) ?? [];
                          const directImageUrl = r.values.images?.split("|")[0]?.trim();
                          const blobPreview = previewBlobUrls.get(r.index);
                          const imageSrc = blobPreview || directImageUrl;
                          const totalImages = (r.values.images ? r.values.images.split("|").filter(Boolean).length : 0) + attachedImages.length;

                          return (
                            <tr key={r.index} className={`hover:bg-gray-50/80 transition-colors ${hasErrors ? "bg-rose-50/20" : ""}`}>
                              <td className="py-2.5 px-3 text-center text-gray-400 font-mono text-[11px]">
                                {toExcelRowNumber(r.index)}
                              </td>
                              <td className="py-2.5 px-3">
                                {hasErrors ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700">
                                    <AlertCircle size={10} /> Invalid
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                    <Check size={10} /> Valid
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                {imageSrc ? (
                                  <div className="relative w-10 h-10 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex items-center justify-center">
                                    <img
                                      src={imageSrc}
                                      alt=""
                                      className="w-full h-full object-cover"
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = "none";
                                      }}
                                    />
                                    {totalImages > 1 && (
                                      <span className="absolute bottom-0 right-0 px-1 py-0.2 bg-black/70 text-white text-[8px] font-bold rounded-tl">
                                        +{totalImages - 1}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-10 h-10 rounded-lg border border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center text-gray-400" title="No image provided">
                                    <ImageIcon size={14} />
                                    <span className="text-[8px] mt-0.5">None</span>
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-gray-800 line-clamp-1">
                                  {r.values.name || <span className="text-rose-500 italic">Missing name</span>}
                                </div>
                                {r.values.description && (
                                  <div className="text-[10px] text-gray-400 line-clamp-1 mt-0.5">
                                    {r.values.description}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono text-[11px] text-gray-600">
                                {r.values.sku || <span className="text-gray-300 font-sans">—</span>}
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-700">
                                  {r.values.category || "—"}
                                </span>
                                {r.values.subcategory && (
                                  <div className="text-[10px] text-gray-400 mt-0.5">{r.values.subcategory}</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right">
                                <span className="font-semibold text-gray-800">
                                  {r.values.price ? `₹${Number(r.values.price).toLocaleString("en-IN")}` : <span className="text-rose-500">—</span>}
                                </span>
                                {r.values.originalPrice && (
                                  <div className="text-[10px] text-gray-400 line-through">
                                    ₹{Number(r.values.originalPrice).toLocaleString("en-IN")}
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center text-gray-700 font-medium">
                                {r.values.stock || "10"}
                              </td>
                              <td className="py-2.5 px-3 text-gray-500 text-[11px]">
                                {[r.values.fabric, r.values.color, r.values.occasion].filter(Boolean).join(" • ") || "—"}
                              </td>
                              <td className="py-2.5 px-3">
                                {hasErrors ? (
                                  <div className="space-y-0.5">
                                    {Object.entries(r.errors).map(([k, msg]) => (
                                      <div key={k} className="text-[11px] text-rose-600 font-medium">
                                        <span className="font-semibold capitalize">{k}:</span> {msg}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-emerald-600 text-[11px] font-medium flex items-center gap-1">
                                    <CheckCircle2 size={11} /> Ready
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Action Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-gray-100">
                <button
                  onClick={() => setStep("upload")}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                >
                  <ArrowLeft size={14} /> Back to Upload
                </button>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-end">
                  {invalidCount > 0 && (
                    <button
                      onClick={() => {
                        const clientFailed = invalidRowsList.map(r => ({
                          rowIndex: r.index,
                          row: r.values,
                          reason: Object.entries(r.errors).map(([k, v]) => `${k}: ${v}`).join("; "),
                          source: "client" as const,
                        }));
                        downloadErrorReport(clientFailed);
                      }}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-200 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors"
                    >
                      <Download size={14} /> Error Report ({invalidCount})
                    </button>
                  )}

                  <button
                    onClick={handleConfirmImport}
                    disabled={validCount === 0 || isSubmitting}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-95 shadow-sm"
                    style={{ background: MAROON }}
                  >
                    <Upload size={15} /> Confirm & Import Valid Products ({validCount})
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Processing ─── */}
          {step === "processing" && (
            <div className="space-y-5">
              {importError ? (
                /* Top-level failure with actionable instructions */
                <div className="space-y-4">
                  <div className="flex flex-col items-center text-center py-6 px-4 bg-rose-50/60 rounded-2xl border border-rose-100">
                    <AlertCircle size={40} className="mb-3 text-rose-600" />
                    <p className="text-lg font-bold font-serif text-rose-800">
                      {importError.toLowerCase().includes("session") || importError.toLowerCase().includes("log in")
                        ? "Session Expired"
                        : importError.toLowerCase().includes("already being processed")
                        ? "Upload In Progress"
                        : importError.toLowerCase().includes("authorized") || importError.toLowerCase().includes("approval")
                        ? "Authorization Required"
                        : "Import Encountered An Issue"}
                    </p>
                    <p className="text-sm text-gray-700 mt-2 max-w-md font-medium bg-white/90 p-3 rounded-xl border border-rose-100 shadow-2xs">
                      {importError}
                    </p>
                    <p className="text-xs text-gray-500 mt-2">
                      {importError.toLowerCase().includes("session")
                        ? "Please log in again through the seller portal and retry your import."
                        : "Review your spreadsheet rows in Preview or click Retry Import below."}
                    </p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => { setImportError(""); setStep("preview"); }}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors shadow-2xs"
                    >
                      Back to Preview
                    </button>
                    <button
                      onClick={handleRetry}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed shadow-xs hover:opacity-95 transition-opacity"
                      style={{ background: MAROON }}
                    >
                      {isSubmitting ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                      {isSubmitting ? "Retrying…" : "Retry Import"}
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal processing spinner */
                <div className="flex flex-col items-center text-center py-12">
                  <Loader2 size={40} className="mb-4 animate-spin" style={{ color: MAROON }} />
                  <p className="text-base font-semibold text-gray-700">{processingStatus || "Processing…"}</p>
                  <p className="text-xs text-gray-400 mt-1">This will only take a moment</p>
                </div>
              )}
            </div>
          )}

          {/* ─── STEP 4: Results ─── */}
          {step === "results" && importResult && (
            <div className="space-y-5">
              <div className="flex flex-col items-center text-center py-6 rounded-2xl"
                   style={{ background: importResult.succeeded > 0 ? `${MAROON}0d` : "#FFF5F5" }}>
                {importResult.succeeded > 0 ? (
                  <Check size={40} className="mb-3 p-2 rounded-full text-white" style={{ background: MAROON }} />
                ) : (
                  <AlertCircle size={40} className="mb-3 text-red-500" />
                )}
                <p className="text-xl font-bold font-serif" style={{ color: importResult.succeeded > 0 ? MAROON : "#991b1b" }}>
                  {importResult.succeeded > 0
                    ? `${importResult.succeeded} product${importResult.succeeded !== 1 ? "s" : ""} imported!`
                    : "No products were imported"}
                </p>
                {importResult.failed > 0 && (
                  <p className="text-sm text-gray-500 mt-1">
                    {importResult.failed} row{importResult.failed !== 1 ? "s" : ""} could not be imported
                  </p>
                )}

                {/* Breakdown metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-lg mt-4 px-4 text-center">
                  <div className="p-2.5 rounded-xl bg-white border border-gray-100 shadow-2xs">
                    <div className="text-[11px] font-semibold text-gray-500">Processed</div>
                    <div className="text-base font-bold text-gray-800">{importResult.totalProcessed ?? (importResult.succeeded + importResult.failed)}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-100 shadow-2xs">
                    <div className="text-[11px] font-semibold text-emerald-700">Succeeded</div>
                    <div className="text-base font-bold text-emerald-700">{importResult.succeeded}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-100 shadow-2xs">
                    <div className="text-[11px] font-semibold text-rose-700">Failed</div>
                    <div className="text-base font-bold text-rose-700">{importResult.failed}</div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 shadow-2xs">
                    <div className="text-[11px] font-semibold text-amber-700">Duplicates</div>
                    <div className="text-base font-bold text-amber-700">{importResult.skippedDuplicates ?? 0}</div>
                  </div>
                </div>
              </div>

              {/* Failed rows breakdown */}
              {importResult.allFailed.length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-rose-800">
                      <AlertCircle size={14} className="text-rose-600" />
                      Failed Rows Breakdown ({importResult.allFailed.length})
                    </p>
                    <span className="text-[11px] text-rose-700 font-medium">Review errors below or download report</span>
                  </div>
                  <div className="max-h-44 overflow-y-auto space-y-1.5 pr-1">
                    {importResult.allFailed.map((f, idx) => (
                      <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-white border border-rose-100 text-xs">
                        <span className="font-mono font-bold text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded text-[10px] shrink-0">
                          Row {toExcelRowNumber(f.rowIndex)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <span className="font-semibold text-gray-800">{f.row.name || "Unnamed Product"}</span>
                          {f.row.sku && <span className="text-gray-400 font-mono text-[11px] ml-1.5">({f.row.sku})</span>}
                          <p className="text-rose-600 text-[11px] mt-0.5 font-medium">{f.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-row server results */}
              {importResult.apiResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-gray-100 p-3">
                  {importResult.apiResults.map((r, i) => {
                    const originalRow = importResult.validRows[i];
                    const label = r.success
                      ? (r.name ?? originalRow?.values?.name ?? "Imported")
                      : `Row ${toExcelRowNumber(originalRow?.index ?? i)}: ${r.error ?? "Failed"}`;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg"
                           style={{ background: r.success ? "#DCFCE7" : "#FEE2E2" }}>
                        {r.success
                          ? <Check size={11} className="text-green-600 shrink-0" />
                          : <X size={11} className="text-red-600 shrink-0" />}
                        <span className="font-medium truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>
              )}


              {importResult.fileIssues.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                    <AlertCircle size={13} /> Attached image notes
                  </p>
                  <ul className="mt-1.5 max-h-24 overflow-y-auto space-y-1 text-[11px] leading-relaxed text-amber-700">
                    {importResult.fileIssues.map((issue, index) => <li key={`${issue}-${index}`}>• {issue}</li>)}
                  </ul>
                </div>
              )}

              <div className="flex gap-3 flex-wrap">
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-xs" style={{ background: MAROON }}>
                  Done
                </button>
                {importResult.allFailed.length > 0 && (
                  <button
                    onClick={() => downloadErrorReport(importResult.allFailed)}
                    className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50"
                  >
                    <Download size={14} /> Download Error Report ({importResult.allFailed.length} rows)
                  </button>
                )}
                <button
                  onClick={() => { setStep("upload"); setImportResult(null); setImportError(""); }}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-500 hover:bg-gray-50"
                >
                  Upload Another File
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
