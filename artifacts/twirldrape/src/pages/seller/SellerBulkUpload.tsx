import React, { useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import * as XLSX from "xlsx";
import {
  X, Upload, Download, Check, AlertCircle,
  FileSpreadsheet, FileImage, FolderOpen, Archive, Loader2,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

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

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const CREAM = "#E6F0EA";

// ── Supported product fields ──────────────────────────────────────────────────
export const PRODUCT_FIELDS = [
  { key: "name",          label: "Name",             required: true  },
  { key: "price",         label: "Price (₹)",        required: true  },
  { key: "category",      label: "Category",         required: true  },
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

const CATEGORIES = ["paithani", "designer", "bridal", "party"] as const;
const FABRICS    = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
const OCCASIONS  = ["bridal", "festival", "casual", "party", "formal"] as const;
const COLORS     = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"] as const;

// ── Column-header aliases — maps friendly template labels → field keys ─────────
// Includes both legacy (exact key) and template (friendly label) variants.
const HEADER_ALIASES: Record<string, FieldKey> = {
  // Template friendly labels (exact)
  "product name *":       "name",
  "price (₹) *":         "price",
  "category *":          "category",
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
  "selling price":       "price",
  "sale price":          "price",
  "price":               "price",
  "category":            "category",
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
  "original price":      "originalPrice",
  "original_price":      "originalPrice",
  "originalprice":       "originalPrice",
  "mrp":                 "originalPrice",
  "subcategory":         "subcategory",
  "sub category":        "subcategory",
  "sub-category":        "subcategory",
  "brand":               "brand",
  "design pattern":      "designPattern",
  "design_pattern":      "designPattern",
  "designpattern":       "designPattern",
  "pattern":             "designPattern",
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
    // Check if this row has the 3 required-like columns
    const hasName  = normalized.some(h => h === "product name *" || h === "product name" || h === "name");
    const hasPrice = normalized.some(h => h.startsWith("price") || h === "price (₹) *");
    const hasCat   = normalized.some(h => h === "category *" || h === "category");

    if (hasName && hasPrice && hasCat) {
      const lastNonEmpty = rowCells.reduce((acc, v, i) => v !== "" ? i : acc, -1);
      const finalHeaders = rowCells.slice(0, lastNonEmpty + 1);
      return { ws, headerRowIndex: r, headers: finalHeaders };
    }
  }

  return null;
}

// ── Parse an uploaded file → mapped rows ─────────────────────────────────────
/**
 * Parses the file. Supports:
 *   1. Canonical template (Product Catalog sheet with friendly labels on row 7)
 *   2. Legacy simple format (first row = field keys, e.g. "name", "price", …)
 *   3. Simple CSV with field keys as first row
 *
 * Returns { rows, originalHeaderRow } where originalHeaderRow is the
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

        rowData[fieldKey] = val;
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
      if (fieldKey) values[fieldKey] = String(val ?? "").trim();
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
  const price = Number(row.price);
  if (!row.price || isNaN(price) || price <= 0 || !Number.isInteger(price)) e.price = "Positive whole number";
  const cat = row.category?.toLowerCase().trim();
  if (!cat || !(CATEGORIES as readonly string[]).includes(cat)) e.category = CATEGORIES.join(", ");
  if (row.fabric && !(FABRICS as readonly string[]).includes(row.fabric.toLowerCase().trim())) e.fabric = FABRICS.join(", ");
  if (row.color  && !(COLORS  as readonly string[]).includes(row.color.toLowerCase().trim()))  e.color  = COLORS.join(", ");
  if (row.occasion && !(OCCASIONS as readonly string[]).includes(row.occasion.toLowerCase().trim())) e.occasion = OCCASIONS.join(", ");
  if (row.stock) { const s = parseInt(row.stock); if (isNaN(s) || s < 0) e.stock = "Must be ≥ 0"; }
  if (row.originalPrice) { const op = parseInt(row.originalPrice); if (isNaN(op) || op <= 0) e.originalPrice = "Positive number"; }
  return e;
}

// ── Attached image bundle mapping ────────────────────────────────────────────
// Image files are mapped by an explicit "Image Files" cell. A filename may
// also start with its Excel row number (for example, 8-front.jpg), so sellers
// can use a folder/archive without adding a new column to an older sheet.
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
 * dependency. Stored and deflated entries are supported. Unsupported,
 * encrypted, damaged, or oversized entries become visible invalid files.
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

type ImageMappingResult = {
  reviewRows: ReviewRow[];
  validRows: ReviewRow[];
  fileIssues: string[];
  filesByRow: Map<number, AttachedImage[]>;
};

/**
 * Resolve explicit Image Files cells first, then row-number filenames. A
 * basename that appears more than once is intentionally ambiguous and cannot
 * be uploaded to either row.
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
        .filter(image => rowNumberFromFilename(image.displayName) === row.index + 1)
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
  XLSX.writeFile(wb, "twirldrape_upload_errors.xlsx");
}

// ── Module-level types ────────────────────────────────────────────────────────
type Step = "upload" | "processing" | "results";

type ReviewRow  = { index: number; values: Record<string, string>; errors: RowErrors };
type ApiResult  = { row: number; success: boolean; error?: string; productId?: string; name?: string };
type FailedRow  = { rowIndex: number; row: Record<string, string>; reason: string; source: "client" | "server" };
type ImportResult = {
  succeeded: number;
  failed: number;
  apiResults: ApiResult[];
  validRows: ReviewRow[];
  allFailed: FailedRow[];
  fileIssues: string[];
};

async function uploadAttachedImage(file: File): Promise<string> {
  const response = await fetch(getApiUrl("/api/seller/upload/product-image"), {
    method: "POST",
    headers: { "Content-Type": file.type || mimeTypeForImage(file.name) },
    credentials: "include",
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
  const response = await fetch(getApiUrl("/api/seller/upload/product-image/delete"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
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
/**
 * Merges client-side invalid rows and server-rejected rows into a single
 * deduplicated list sorted by original row index.
 *
 * A row can only appear in ONE of the two lists because:
 *   - clientInvalid rows are those that FAILED validation and were NOT sent to
 *     the API.
 *   - serverFailed rows are those that PASSED validation, WERE sent, but the
 *     server rejected them.
 * The two sets are therefore disjoint by construction.
 */
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

  // Processing / results state
  const [processingStatus, setProcessingStatus] = useState("");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError,  setImportError]  = useState("");
  // Store reviewRows used by last run — needed for retry
  const [lastReviewRows, setLastReviewRows] = useState<ReviewRow[]>([]);
  const [lastValidRows,  setLastValidRows]  = useState<ReviewRow[]>([]);
  const [lastFileIssues, setLastFileIssues] = useState<string[]>([]);
  const lastUploadedPathsByRowRef = useRef<Map<number, string[]>>(new Map());
  // One idempotency key per uploaded file, retained across retries so a retry
  // after a lost response returns the original batch result instead of
  // duplicating products. Regenerated only when a new file is uploaded.
  const idempotencyKeyRef = useRef<string>("");
  // Guards against concurrent retry submissions (double-clicking Retry).
  const isSubmittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    // Fresh idempotency key for this file. Retries reuse it (see runImport).
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

      // Build ReviewRow objects with their original Excel row numbers
      // sheetRow is the original 0-based row index in the uploaded sheet.
      const reviewRows: ReviewRow[] = parsedRows.map(({ values, sheetRow }) => ({
        index: sheetRow,
        values,
        errors: validateRow(values),
      }));

      setProcessingStatus("Matching attached images…");
      const imageBundle = await collectImageBundle(imageBundleFilesRef.current);
      if (imageBundle.blocked) {
        setFileError(imageBundle.issues.join(" "));
        setStep("upload");
        return;
      }
      const mappedImages = mapAttachedImages(reviewRows, imageBundle);

      setProcessingStatus("Uploading matched images…");
      const preparedRows = await uploadMappedImages(mappedImages);

      // Save for potential retry
      setLastReviewRows(preparedRows.reviewRows);
      setLastValidRows(preparedRows.validRows);
      setLastFileIssues(mappedImages.fileIssues);
      lastUploadedPathsByRowRef.current = preparedRows.uploadedPathsByRow;

      await runImport(preparedRows.reviewRows, preparedRows.validRows, mappedImages.fileIssues, preparedRows.uploadedPathsByRow);
    } catch (err: any) {
      setFileError("Could not parse the file. Please check it is a valid Excel or CSV file.");
      setStep("upload");
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Core import logic (separated so retry can call it) ─────────────────────
  async function runImport(
    reviewRows: ReviewRow[],
    validRows: ReviewRow[],
    fileIssues: string[] = [],
    uploadedPathsByRow: Map<number, string[]> = lastUploadedPathsByRowRef.current,
  ) {
    // Prevent concurrent submissions (e.g. rapid double-clicks on Retry) so we
    // never fire two requests for the same batch at once.
    if (isSubmittingRef.current) return;

    setImportError("");

    // When every row fails client validation — no API call needed
    if (validRows.length === 0) {
      const allFailed = buildAllFailed(reviewRows, [], []);
      setImportResult({
        succeeded: 0, failed: allFailed.length, apiResults: [], validRows: [], allFailed, fileIssues,
      });
      setStep("results");
      return;
    }

    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setProcessingStatus(`Importing ${validRows.length} valid row${validRows.length !== 1 ? "s" : ""}…`);

    try {
      const res = await fetch(getApiUrl("/api/seller/products/bulk-import"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Same key across retries → server replays the original batch result.
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        credentials: "include",
        body: JSON.stringify({ rows: validRows.map(r => r.values) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const apiResults: ApiResult[] = data.results ?? [];
      const allFailed = buildAllFailed(reviewRows, validRows, apiResults);
      const rejectedPaths = validRows.flatMap((row, index) =>
        apiResults[index]?.success ? [] : (uploadedPathsByRow.get(row.index) ?? []),
      );
      const resultFileIssues = [...fileIssues];
      try {
        await deleteUploadedProductImages(rejectedPaths);
      } catch {
        resultFileIssues.push("Some rejected-row image uploads could not be cleaned up automatically. Please contact support with the import details.");
      }

      const result: ImportResult = {
        succeeded: data.summary?.succeeded ?? 0,
        failed: allFailed.length,
        apiResults,
        validRows,
        allFailed,
        fileIssues: resultFileIssues,
      };
      setImportResult(result);
      if (result.succeeded > 0) onDone(`${result.succeeded} product(s) imported`);
      setStep("results");
    } catch (err: any) {
      setImportError(err.message || "Import failed");
      // Stay on "processing" step so user can retry
      setProcessingStatus("");
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  }

  // ── Retry after top-level failure ──────────────────────────────────────────
  async function handleRetry() {
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

  // ── Render ──────────────────────────────────────────────────────────────────
  const stepLabel = step === "upload" ? "Upload" : step === "processing" ? "Processing" : "Results";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: "rgba(0,0,0,0.5)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col"
        style={{ maxWidth: 620, maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Bulk Upload Products</h3>
            <div className="flex items-center gap-1.5 mt-1">
              {(["upload", "processing", "results"] as Step[]).map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`text-[10px] font-semibold ${step === s ? "text-[#1E6B5A]" : "text-gray-300"}`}>
                    {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {i < 2 && <span className="text-gray-200 text-[10px]">›</span>}
                </React.Fragment>
              ))}
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
                className="border-2 border-dashed rounded-2xl p-10 text-center transition-colors"
                style={{ borderColor: isDragging ? MAROON : "#D6C9BA", background: isDragging ? `${MAROON}08` : "#FAFAF8" }}
              >
                <FileSpreadsheet size={36} className="mx-auto mb-3" style={{ color: isDragging ? MAROON : "#C9A84C" }} />
                <p className="font-semibold text-gray-700 mb-1">Drop your Excel file here</p>
                <p className="text-xs text-gray-400 mb-4">.xlsx, .xls, or .csv — up to 500 rows</p>
                <label className="cursor-pointer">
                  <span className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white" style={{ background: MAROON }}>
                    Choose File
                  </span>
                  <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={handleFileInput} />
                </label>
              </div>

              {/* Attached image bundle — chosen before the spreadsheet so images
                  can be matched and uploaded as the sheet is processed. */}
              <div className="rounded-2xl border border-dashed p-4" style={{ borderColor: "#C9A84C66", background: "#FFFDF6" }}>
                <div className="flex gap-3">
                  <div className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: `${GOLD}1F`, color: MAROON }}>
                    <FolderOpen size={18} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-700">Optional product-image folder or ZIP</p>
                    <p className="text-[11px] leading-relaxed text-gray-500 mt-0.5">
                      Choose this first, then your spreadsheet. In the sheet, add an <strong>Image Files</strong> column with
                      filenames separated by <code>|</code> (for example <code>peacock-front.jpg|peacock-back.jpg</code>).
                      Or name files <code>8-front.jpg</code>, <code>8-back.jpg</code> to attach them to Excel row 8.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                      <label className="cursor-pointer">
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C9A84C]/50 text-xs font-semibold hover:bg-[#C9A84C]/10" style={{ color: MAROON }}>
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
                        <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#C9A84C]/50 text-xs font-semibold hover:bg-[#C9A84C]/10" style={{ color: MAROON }}>
                          <Archive size={13} /> Choose ZIP
                        </span>
                        <input type="file" accept=".zip,application/zip" className="sr-only" onChange={handleImageBundleInput} />
                      </label>
                      {imageBundleLabel && (
                        <span className="inline-flex items-center gap-1 text-xs text-[#1E6B5A] font-medium truncate max-w-56">
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

              {/* Template download — serves the canonical static workbook */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ borderColor: "#C9A84C33", background: CREAM }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: MAROON }}>Download template</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Use direct image URLs, public product-image paths, or attached image filenames; page and share links will be rejected</p>
                </div>
                <button
                  onClick={downloadTemplate}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-[#C9A84C]/40 hover:bg-[#C9A84C]/10 transition-colors"
                  style={{ color: MAROON }}
                >
                  <Download size={13} /> Template
                </button>
              </div>

              {/* Field reference */}
              <details className="rounded-xl border border-gray-200 overflow-hidden">
                <summary className="px-4 py-3 cursor-pointer text-xs font-semibold text-gray-500 bg-gray-50 hover:bg-gray-100">
                  View expected column names & allowed values
                </summary>
                <div className="p-4 space-y-2 text-xs text-gray-600">
                  {PRODUCT_FIELDS.map(f => (
                    <div key={f.key} className="flex gap-2">
                      <code className="font-mono text-[#1E6B5A] w-32 shrink-0">{f.key}</code>
                      <span className="text-gray-400">{f.required ? "required" : "optional"}</span>
                      {f.key === "category" && <span className="text-gray-500">{CATEGORIES.join(", ")}</span>}
                      {f.key === "fabric"   && <span className="text-gray-500">{FABRICS.join(", ")}</span>}
                      {f.key === "color"    && <span className="text-gray-500">{COLORS.join(", ")}</span>}
                      {f.key === "occasion" && <span className="text-gray-500">{OCCASIONS.join(", ")}</span>}
                       {f.key === "images"   && <span className="text-gray-500">optional; direct http(s) image URLs or /api/storage/public-objects/product-images/... paths, separated with |</span>}
                       {f.key === "imageFiles" && <span className="text-gray-500">optional; attached filenames separated with |, matched from the chosen folder or ZIP</span>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ─── STEP 2: Processing ─── */}
          {step === "processing" && (
            <div className="space-y-5">
              {importError ? (
                /* Top-level server failure — stay here so seller can retry */
                <div className="space-y-4">
                  <div className="flex flex-col items-center text-center py-8">
                    <AlertCircle size={40} className="mb-3 text-red-500" />
                    <p className="text-lg font-bold font-serif text-red-700">Import failed</p>
                    <p className="text-sm text-gray-500 mt-1">{importError}</p>
                  </div>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => { setImportError(""); setStep("upload"); }}
                      className="px-5 py-2.5 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      Upload Different File
                    </button>
                    <button
                      onClick={handleRetry}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60 disabled:cursor-not-allowed"
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

          {/* ─── STEP 3: Results ─── */}
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
              </div>

              {/* Per-row server results */}
              {importResult.apiResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-gray-100 p-3">
                  {importResult.apiResults.map((r, i) => {
                    const originalRow = importResult.validRows[i];
                    const label = r.success
                      ? (r.name ?? originalRow?.values?.name ?? "Imported")
                      : `Row ${toExcelRowNumber(originalRow?.index ?? i)}: ${r.error ?? "Failed"}`;
                    return (
                      <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg"
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
                <button onClick={onClose} className="px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: MAROON }}>
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
