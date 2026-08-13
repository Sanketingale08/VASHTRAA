import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import * as XLSX from "xlsx";
import {
  X, Upload, Download, Check, AlertCircle, ChevronRight, ChevronLeft,
  FileSpreadsheet, AlertTriangle, Loader2, CheckCircle2,
} from "lucide-react";
import { getApiUrl } from "@/lib/api";

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
] as const;

type FieldKey = typeof PRODUCT_FIELDS[number]["key"];

const CATEGORIES = ["paithani", "designer", "bridal", "party"] as const;
const FABRICS    = ["silk", "cotton", "georgette", "net", "chiffon", "tissue"] as const;
const OCCASIONS  = ["bridal", "festival", "casual", "party", "formal"] as const;
const COLORS     = ["red", "maroon", "blue", "green", "yellow", "pink", "purple", "cream", "gold", "black", "orange", "mint"] as const;

// ── Column-header aliases for auto-mapping ────────────────────────────────────
const HEADER_ALIASES: Record<string, FieldKey> = {
  "product name":   "name",   "title": "name",     "product title": "name", "product": "name",
  "selling price":  "price",  "sale price": "price",
  "material":       "fabric",
  "colour":         "color",
  "qty":            "stock",  "quantity": "stock",  "inventory": "stock",
  "original price": "originalPrice", "original_price": "originalPrice",
  "originalprice":  "originalPrice", "mrp": "originalPrice",
  "sub category":   "subcategory",   "sub-category": "subcategory",
  "design pattern": "designPattern", "design_pattern": "designPattern",
  "designpattern":  "designPattern", "pattern": "designPattern",
  "image urls":     "images",  "image_urls": "images", "image url": "images",
  "imageurl":       "images",  "imageurls": "images",
  "desc":           "description",   "details": "description",
};

function autoMap(header: string): FieldKey | "" {
  const n = header.toLowerCase().trim();
  if (PRODUCT_FIELDS.find(f => f.key === n)) return n as FieldKey;
  return HEADER_ALIASES[n] ?? "";
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

// ── Template download ─────────────────────────────────────────────────────────
function downloadTemplate() {
  const keys  = PRODUCT_FIELDS.map(f => f.key);
  const sample = ["Peacock Paithani", "15000", "paithani", "Handwoven pure silk saree with peacock motifs",
                   "silk", "red", "festival", "10", "", "", "", "", ""];
  const ws = XLSX.utils.aoa_to_sheet([keys, sample]);
  ws["!cols"] = keys.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Products");
  XLSX.writeFile(wb, "twirldrape_product_template.xlsx");
}

// ── Error report download ─────────────────────────────────────────────────────
function downloadErrorReport(
  failed: Array<{ rowIndex: number; row: Record<string, string>; reason: string }>
) {
  const headers = ["Excel Row", ...PRODUCT_FIELDS.map(f => f.key), "Error Reasons"];
  const data = failed.map(({ rowIndex, row, reason }) => [
    String(rowIndex + 2), // +2: 1-based + header row
    ...PRODUCT_FIELDS.map(f => row[f.key] ?? ""),
    reason,
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Failed Rows");
  XLSX.writeFile(wb, "twirldrape_upload_errors.xlsx");
}

// ── Pill / badge helpers ──────────────────────────────────────────────────────
function RequiredBadge() {
  return <span className="text-[9px] font-bold text-red-500 ml-1">*</span>;
}

// ── Module-level types (used both inside and outside the component) ───────────
type Step = "upload" | "map" | "review" | "done";
type ReviewRow  = { index: number; values: Record<string, string>; errors: RowErrors };
type ApiResult  = { row: number; success: boolean; error?: string; productId?: string; name?: string };
type FailedRow  = { rowIndex: number; row: Record<string, string>; reason: string; source: "client" | "server" };
type ImportResult = {
  succeeded: number;
  failed: number;
  apiResults: ApiResult[];
  validRows: ReviewRow[];
  allFailed: FailedRow[];
};

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
    if (!result || result.success) return [];
    return [
      {
        rowIndex: r.index,
        row: r.values,
        reason: result.error ?? "Import failed",
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

  // Step 1 – file / raw rows
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [rawRows,        setRawRows]       = useState<Record<string, string>[]>([]);
  const [fileError,      setFileError]     = useState("");
  const [isDragging,     setIsDragging]    = useState(false);

  // Step 2 – column mapping: detectedHeader → productFieldKey | ""
  const [mapping, setMapping] = useState<Record<string, FieldKey | "">>({});

  // Step 3 – editable review rows
  const [reviewRows, setReviewRows] = useState<ReviewRow[]>([]);

  // Step 4 – import results
  const [importing,    setImporting]    = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError,  setImportError]  = useState("");

  // ── File parsing ────────────────────────────────────────────────────────────
  const parseFile = useCallback((file: File) => {
    setFileError("");
    const allowed = [".xlsx", ".xls", ".csv"];
    const ext = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) { setFileError("Please upload an .xlsx, .xls, or .csv file."); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb   = XLSX.read(data, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: "", raw: false });
        if (rows.length === 0) { setFileError("The file has no data rows."); return; }
        if (rows.length > 500) { setFileError("Maximum 500 rows per upload. Please split the file."); return; }

        const headers = Object.keys(rows[0]);
        setParsedHeaders(headers);
        setRawRows(rows);

        // Build initial auto-mapping
        const initialMapping: Record<string, FieldKey | ""> = {};
        for (const h of headers) initialMapping[h] = autoMap(h);
        setMapping(initialMapping);

        setStep("map");
      } catch {
        setFileError("Could not parse the file. Please check it is a valid Excel or CSV file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = "";
  }

  // drag-and-drop
  function onDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragging(true); }
  function onDragLeave() { setIsDragging(false); }
  function onDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  // ── Advance to review ───────────────────────────────────────────────────────
  function buildReview() {
    const usedFields = new Set(Object.values(mapping).filter(Boolean));
    // Apply mapping to raw rows
    const rows: ReviewRow[] = rawRows.map((raw, idx) => {
      const values: Record<string, string> = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (field) values[field] = raw[header] ?? "";
      }
      return { index: idx, values, errors: validateRow(values) };
    });
    setReviewRows(rows);
    setStep("review");
  }

  // ── Cell edit in review table ───────────────────────────────────────────────
  function handleCellEdit(rowIndex: number, field: string, value: string) {
    setReviewRows(prev => prev.map((r, i) => {
      if (i !== rowIndex) return r;
      const updated = { ...r.values, [field]: value };
      return { ...r, values: updated, errors: validateRow(updated) };
    }));
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function handleImport() {
    const validRows = reviewRows.filter(r => Object.keys(r.errors).length === 0);

    // When every row fails client validation there is nothing to send to the
    // server, but the seller still needs to see the error report.  Build the
    // failed list from the review rows alone and jump to the done screen.
    if (validRows.length === 0) {
      const allFailed = buildAllFailed(reviewRows, [], []);
      setImportResult({ succeeded: 0, failed: allFailed.length, apiResults: [], validRows: [], allFailed });
      setStep("done");
      return;
    }

    setImporting(true);
    setImportError("");
    try {
      const res = await fetch(getApiUrl("/api/seller/products/bulk-import"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ rows: validRows.map(r => r.values) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Import failed");

      const apiResults: ApiResult[] = data.results ?? [];

      // Rows that failed client-side validation (skipped, not sent to API)
      // combined with rows the server rejected — deduplicated and sorted.
      // apiResults[originalIdx] corresponds to validRows[originalIdx] — preserve originalIdx
      // across the map so we never confuse it with a post-filter reset index.
      const allFailed = buildAllFailed(reviewRows, validRows, apiResults);

      setImportResult({
        succeeded: data.summary?.succeeded ?? 0,
        // allFailed already contains every client-invalid and server-rejected
        // row exactly once, so its length is the authoritative failed count.
        failed: allFailed.length,
        apiResults,
        validRows,
        allFailed,
      });
      if (data.summary?.succeeded > 0) onDone(`${data.summary.succeeded} product(s) imported`);
      setStep("done");
    } catch (err: any) {
      setImportError(err.message || "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const validCount   = reviewRows.filter(r => Object.keys(r.errors).length === 0).length;
  const invalidCount = reviewRows.length - validCount;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" style={{ background: "rgba(0,0,0,0.5)" }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="bg-white rounded-2xl shadow-2xl w-full flex flex-col"
        style={{ maxWidth: step === "review" ? 1000 : 620, maxHeight: "92vh" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div>
            <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Bulk Upload Products</h3>
            <div className="flex items-center gap-1.5 mt-1">
              {(["upload", "map", "review", "done"] as Step[]).map((s, i) => (
                <React.Fragment key={s}>
                  <span className={`text-[10px] font-semibold ${step === s ? "text-[#1E6B5A]" : "text-gray-300"}`}>
                    {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                  </span>
                  {i < 3 && <span className="text-gray-200 text-[10px]">›</span>}
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

              {fileError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle size={15} /> {fileError}
                </div>
              )}

              {/* Template download */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl border" style={{ borderColor: "#C9A84C33", background: CREAM }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: MAROON }}>Download template</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Pre-formatted .xlsx with all column headers and a sample row</p>
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
                      {f.key === "images"   && <span className="text-gray-500">pipe-separated URLs e.g. url1|url2</span>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* ─── STEP 2: Field mapping ─── */}
          {step === "map" && (
            <div className="space-y-4">
              <p className="text-sm text-gray-500">
                {parsedHeaders.length} column{parsedHeaders.length !== 1 ? "s" : ""} detected from your file.
                Confirm or adjust the mapping for each column.
              </p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ background: CREAM }}>
                      <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Your Column</th>
                      <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Sample Value</th>
                      <th className="text-left px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-gray-500">Maps To</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedHeaders.map((h) => (
                      <tr key={h} className="border-t border-gray-100">
                        <td className="px-4 py-2.5">
                          <code className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-700">{h}</code>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-400 max-w-[160px] truncate">
                          {String(rawRows[0]?.[h] ?? "").slice(0, 40) || "—"}
                        </td>
                        <td className="px-4 py-2.5">
                          <select
                            value={mapping[h] ?? ""}
                            onChange={e => setMapping(m => ({ ...m, [h]: e.target.value as FieldKey | "" }))}
                            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:border-[#C9A84C]"
                          >
                            <option value="">— Ignore —</option>
                            {PRODUCT_FIELDS.map(f => (
                              <option key={f.key} value={f.key}>
                                {f.label}{f.required ? " *" : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Check that required fields are mapped */}
              {(() => {
                const mappedFields = new Set(Object.values(mapping).filter(Boolean));
                const missing = PRODUCT_FIELDS.filter(f => f.required && !mappedFields.has(f.key));
                return missing.length > 0 ? (
                  <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                    <AlertTriangle size={14} />
                    Required fields not yet mapped: <strong>{missing.map(f => f.label).join(", ")}</strong>
                  </div>
                ) : null;
              })()}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setStep("upload")} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                  <ChevronLeft size={15} /> Back
                </button>
                <button
                  onClick={buildReview}
                  disabled={(() => {
                    const mapped = new Set(Object.values(mapping).filter(Boolean));
                    return PRODUCT_FIELDS.some(f => f.required && !mapped.has(f.key));
                  })()}
                  className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-xl text-white disabled:opacity-40"
                  style={{ background: MAROON }}
                >
                  Review {rawRows.length} Rows <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}

          {/* ─── STEP 3: Review ─── */}
          {step === "review" && (
            <div className="space-y-4">
              {/* Summary bar */}
              <div className="flex items-center gap-4 px-4 py-3 rounded-xl border" style={{ borderColor: "#C9A84C33", background: CREAM }}>
                <span className="flex items-center gap-1.5 text-sm font-semibold text-green-700">
                  <CheckCircle2 size={15} /> {validCount} valid
                </span>
                {invalidCount > 0 && (
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-red-600">
                    <AlertCircle size={15} /> {invalidCount} with errors
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">Edit cells to fix errors, then import valid rows</span>
              </div>

              {/* Scrollable editable table */}
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto" style={{ maxHeight: 420 }}>
                  <table className="text-xs w-max min-w-full">
                    <thead className="sticky top-0 z-10" style={{ background: CREAM }}>
                      <tr>
                        <th className="px-3 py-2.5 text-left text-gray-400 font-bold uppercase tracking-wide w-10">#</th>
                        {PRODUCT_FIELDS.map(f => (
                          <th key={f.key} className="px-3 py-2.5 text-left font-bold uppercase tracking-wide text-gray-500 whitespace-nowrap">
                            {f.label}{f.required && <RequiredBadge />}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {reviewRows.map((row, rowIdx) => {
                        const hasError = Object.keys(row.errors).length > 0;
                        return (
                          <tr
                            key={row.index}
                            className="border-t border-gray-100 hover:bg-gray-50/60 transition-colors"
                            style={hasError ? { background: "#FFF5F5" } : {}}
                          >
                            <td className="px-3 py-2 text-gray-400 font-mono">{row.index + 2}</td>
                            {PRODUCT_FIELDS.map(f => {
                              const err = row.errors[f.key as FieldKey];
                              return (
                                <td key={f.key} className="px-1.5 py-1" style={{ minWidth: 120 }}>
                                  <div className="relative">
                                    <input
                                      value={row.values[f.key] ?? ""}
                                      onChange={e => handleCellEdit(rowIdx, f.key, e.target.value)}
                                      className="w-full px-2 py-1.5 text-xs rounded-lg border focus:outline-none focus:ring-1"
                                      style={{
                                        borderColor: err ? "#FCA5A5" : "#E5E7EB",
                                        background:  err ? "#FFF0F0" : "#fff",
                                      }}
                                      placeholder={f.required ? "Required" : ""}
                                    />
                                    {err && (
                                      <div className="absolute left-0 top-full mt-0.5 z-20 bg-red-600 text-white text-[9px] px-1.5 py-0.5 rounded shadow-md whitespace-nowrap pointer-events-none">
                                        {err}
                                      </div>
                                    )}
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {importError && (
                <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                  <AlertCircle size={14} /> {importError}
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={() => setStep("map")} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50">
                  <ChevronLeft size={15} /> Back
                </button>
                {/* When every row is invalid, show a dedicated error-report action instead
                    of a disabled import button so sellers can still download the report. */}
                {validCount === 0 ? (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl text-white disabled:opacity-40"
                    style={{ background: MAROON }}
                  >
                    <Download size={15} />
                    {`View Error Report (${invalidCount} failed row${invalidCount !== 1 ? "s" : ""})`}
                  </button>
                ) : (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl text-white disabled:opacity-40"
                    style={{ background: MAROON }}
                  >
                    {importing ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    {importing ? "Importing…" : `Import ${validCount} Valid Row${validCount !== 1 ? "s" : ""}`}
                  </button>
                )}
                {validCount > 0 && invalidCount > 0 && (
                  <p className="text-xs text-amber-600 self-center">
                    {invalidCount} row{invalidCount !== 1 ? "s" : ""} with errors will be skipped
                  </p>
                )}
              </div>
            </div>
          )}

          {/* ─── STEP 4: Done ─── */}
          {step === "done" && importResult && (
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

              {/* Per-row server results — apiResults[i] maps to validRows[i] */}
              {importResult.apiResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-gray-100 p-3">
                  {importResult.apiResults.map((r, i) => {
                    const originalRow = importResult.validRows[i];
                    const label = r.success
                      ? (r.name ?? originalRow?.values?.name ?? "Imported")
                      : `Row ${(originalRow?.index ?? i) + 2}: ${r.error ?? "Failed"}`;
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
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
