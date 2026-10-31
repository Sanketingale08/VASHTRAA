import React, { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, PackageX, ToggleLeft, ToggleRight, Check, X, Copy, Search, Upload, Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { useSellerContext } from "@/components/SellerGuard";
import { SellerLayout } from "./SellerDashboard";
import { CATEGORIES } from "./SellerProductForm";
import { apiFetch } from "@/lib/api";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import SellerBulkUpload, { PRODUCT_FIELDS } from "./SellerBulkUpload";
import { useQuery } from "@tanstack/react-query";
import { TableRowSkeleton } from "@/components/skeletons";

const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const IVORY = "#F4F5F7";
const CREAM = "#E5E8EC";

interface Product {
  id: string;
  _id?: string;
  name: string;
  category: string;
  fabric: string;
  color: string;
  price: number;
  basePrice?: number | null;
  originalPrice: number | null;
  stock: number;
  lowStockThreshold: number;
  images: string[];
  isBestSeller: boolean;
  isNewArrival: boolean;
  rating: number;
  reviewCount: number;
  active: boolean;
  status: "pending" | "approved" | "rejected";
}

type SortKey = "name" | "price" | "stock";

function Toast({ message, type, onClose }: { message: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl shadow-xl text-sm font-medium"
      style={{ background: type === "success" ? "#166534" : "#991b1b", color: "#fff" }}
    >
      {type === "success" ? <Check size={16} /> : <X size={16} />}
      {message}
    </motion.div>
  );
}


interface StockCellProps {
  product: Product;
  onUpdate: (id: string, stock: number) => void;
  onError: (msg: string) => void;
}

function StockCell({ product, onUpdate, onError }: StockCellProps) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(product.stock));
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = parseInt(value, 10);
    if (isNaN(num) || num < 0) {
      setValue(String(product.stock));
      setEditing(false);
      onError("Please enter a valid non-negative stock quantity.");
      return;
    }
    if (num === product.stock) {
      setEditing(false);
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch(`/api/products/${product.id}/stock`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock: num }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to update stock in database.");
      }
      const data = await res.json();
      const updatedStock = typeof data.stock === "number" ? data.stock : num;
      onUpdate(product.id, updatedStock);
    } catch (err: any) {
      setValue(String(product.stock));
      onError(err.message || "Failed to save updated stock. Keeping previous value.");
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1 justify-center">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") {
              setValue(String(product.stock));
              setEditing(false);
            }
          }}
          className="w-20 border rounded px-2 py-1 text-sm text-center font-medium outline-none focus:ring-2 focus:ring-[#0A1F44]"
          style={{ borderColor: GOLD }}
          autoFocus
        />
      </div>
    );
  }

  const isLow = product.stock > 0 && product.stock <= product.lowStockThreshold;

  return (
    <button
      onClick={() => {
        setValue(String(product.stock));
        setEditing(true);
      }}
      className="text-sm font-medium hover:underline text-center px-2 py-1 rounded transition-colors"
      style={{ color: product.stock === 0 ? "#dc2626" : isLow ? "#b45309" : "#374151" }}
      title="Click to edit stock"
    >
      {saving ? "…" : product.stock === 0 ? "0 (out of stock)" : isLow ? `${product.stock} (low)` : product.stock}
    </button>
  );
}

import { CATEGORY_DROPDOWN_OPTIONS } from "@/constants/categories";

export default function SellerProducts() {
  const { vendor } = useSellerContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "hidden">("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const PAGE_SIZE = 10;

  const categoryOptions = CATEGORY_DROPDOWN_OPTIONS.map((c) => ({
    name: c.label,
    slug: c.value,
  }));

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  async function fetchProducts() {
    if (!vendor) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/seller/products");
      if (!res.ok) throw new Error("Failed to load products");
      const data = await res.json();
      setProducts(data.products ?? data);
    } catch {
      setError("Failed to load your products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchProducts(); }, [vendor]);

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (["inventory:updated", "product:updated", "product:created", "catalog:updated"].includes(detail.name)) {
        fetchProducts();
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [vendor]);

  function updateStock(id: string, stock: number) {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, stock } : p));
    showToast(`Stock updated to ${stock} successfully.`, "success");
  }

  async function handleToggleActive(product: Product) {
    const endpoint = product.active ? "deactivate" : "activate";
    try {
      const res = await apiFetch(`/api/products/${product.id}/${endpoint}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
      showToast(product.active ? "Product set to Out of Stock" : "Product is now Available", "success");
    } catch {
      showToast("Failed to update status", "error");
    }
  }

  async function handleDuplicate(product: Product) {
    setDuplicatingId(product.id);
    try {
      const res = await apiFetch(`/api/products/${product.id}/duplicate`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
      showToast("Product duplicated as draft", "success");
      fetchProducts();
    } catch {
      showToast("Failed to duplicate product", "error");
    } finally {
      setDuplicatingId(null);
    }
  }


  const filtered = useMemo(() => {
    let list = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (categoryFilter !== "all") {
      const norm = categoryFilter.toLowerCase().trim();
      list = list.filter((p) => {
        const pCat = String(p.category || "").toLowerCase().trim();
        const pName = String((p as any).categoryName || "").toLowerCase().trim();
        const pId = String((p as any).categoryId || "").toLowerCase().trim();
        return pCat === norm || pName === norm || pId === norm;
      });
    }
    if (statusFilter !== "all") list = list.filter((p) => statusFilter === "active" ? p.active : !p.active);
    list = [...list].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "price") {
        const aVal = a.basePrice != null ? a.basePrice : a.price;
        const bVal = b.basePrice != null ? b.basePrice : b.price;
        cmp = aVal - bVal;
      }
      else if (sortKey === "stock") cmp = a.stock - b.stock;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [products, search, categoryFilter, statusFilter, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Count ignoring status filter — used in the "All Statuses" label
  const allStatusCount = useMemo(() => {
    let list = products.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()));
    if (categoryFilter !== "all") {
      const norm = categoryFilter.toLowerCase().trim();
      list = list.filter((p) => {
        const pCat = String(p.category || "").toLowerCase().trim();
        const pName = String((p as any).categoryName || "").toLowerCase().trim();
        const pId = String((p as any).categoryId || "").toLowerCase().trim();
        return pCat === norm || pName === norm || pId === norm;
      });
    }
    return list.length;
  }, [products, search, categoryFilter]);

  useEffect(() => { setPage(1); }, [search, categoryFilter, statusFilter]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function downloadCatalogue() {
    const headers = PRODUCT_FIELDS.map((f) => f.key);
    const rows = products.map((p) => {
      const record = p as Record<string, any>;
      return PRODUCT_FIELDS.map((f) => {
        const val = f.key === "price" && record.basePrice != null ? record.basePrice : record[f.key];
        if (f.key === "images") {
          return Array.isArray(val) ? val.join("|") : (val ?? "");
        }
        return val != null ? String(val) : "";
      });
    });
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    XLSX.writeFile(wb, "vastraa_catalogue.xlsx");
  }

  const skeletonRows = Array.from({ length: 5 });

  return (
    <SellerLayout title="My Products">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-end mb-6 flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCatalogue}
              disabled={products.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors disabled:opacity-40"
              style={{ borderColor: "#D6C9BA", color: MAROON }}
              title={products.length === 0 ? "No products to export" : `Download ${products.length} product(s) as Excel`}
            >
              <Download size={15} /> Download Catalogue
            </button>
            <button
              onClick={() => setShowBulkUpload(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors"
              style={{ borderColor: "#D6C9BA", color: MAROON }}
            >
              <Upload size={15} /> Bulk Upload
            </button>
            <Link href="/seller/products/new">
              <button
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-bold transition-all hover:opacity-90"
                style={{ background: MAROON, color: IVORY }}
              >
                <Plus size={16} />
                Add Product
              </button>
            </Link>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <div className="relative flex-1 min-w-[220px] max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search products…"
              className="w-full pl-9 pr-3 py-2 rounded-lg border text-sm outline-none"
              style={{ borderColor: "#D6C9BA" }}
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border text-sm outline-none cursor-pointer"
            style={{ borderColor: "#D6C9BA" }}
          >
            <option value="all">All Categories</option>
            {categoryOptions.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="px-3 py-2 rounded-lg border text-sm outline-none cursor-pointer"
              style={{ borderColor: "#D6C9BA" }}
            >
              <option value="all">All Status</option>
              <option value="active">Available</option>
              <option value="hidden">Out of Stock</option>
            </select>
            {!loading && (
              <span className="text-xs whitespace-nowrap" style={{ color: "#7a5f4e" }}>
                {allStatusCount} of {products.length} product{products.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: "#E2D9CC" }}>
          <div className="overflow-x-auto scroll-touch scrollbar-thin">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ background: CREAM, borderBottom: "1px solid #E2D9CC" }}>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide cursor-pointer" style={{ color: "#7a5f4e" }} onClick={() => toggleSort("name")}>
                    Product {sortKey === "name" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide cursor-pointer" style={{ color: "#7a5f4e" }} onClick={() => toggleSort("price")}>
                    Base Price {sortKey === "price" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide cursor-pointer" style={{ color: "#7a5f4e" }} onClick={() => toggleSort("stock")}>
                    Stock {sortKey === "stock" && (sortDir === "asc" ? "↑" : "↓")}
                  </th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <TableRowSkeleton columns={6} rows={6} />
                ) : pageItems.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <PackageX size={36} className="mx-auto mb-3 opacity-30" />
                          <p className="text-sm text-gray-400">{products.length === 0 ? "No products yet." : "No products match your filters."}</p>
                          {products.length === 0 && (
                            <Link href="/seller/products/new">
                              <button className="mt-3 text-xs font-semibold underline" style={{ color: MAROON }}>Add your first product</button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    )
                    : pageItems.map((product) => (
                      <motion.tr
                        key={product._id || product.id}
                        layout
                        style={{ borderBottom: "1px solid #F3EDE4", opacity: product.active ? 1 : 0.55 }}
                        className="hover:bg-[#FAFAF8] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: CREAM }}>
                              <img
                                src={getProductImageSrc(product.images?.[0])}
                                alt=""
                                className="w-full h-full object-cover"
                                onError={replaceProductImageWithFallback}
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate max-w-[200px]">{product.name}</p>
                              <p className="text-xs text-gray-400">{product.fabric} · {product.color}</p>
                              {product.status === "pending" && (
                                <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#FEF9C3", color: "#854D0E" }}>
                                  Pending Approval
                                </span>
                              )}
                              {product.status === "rejected" && (
                                <div>
                                  <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                                    Rejected
                                  </span>
                                  {(product as any).rejectionReason && (
                                    <p className="text-[10px] text-red-600 mt-0.5 max-w-[180px] truncate" title={(product as any).rejectionReason}>
                                      Reason: {(product as any).rejectionReason}
                                    </p>
                                  )}
                                </div>
                              )}
                              {product.status === "approved" && (
                                <span className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold" style={{ background: "#DCFCE7", color: "#166534" }}>
                                  Approved
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize" style={{ background: product.category === "paithani" ? "#FEF3C7" : "#EDE9FE", color: product.category === "paithani" ? "#92400E" : "#5B21B6" }}>
                            {(product as any).categoryName || product.category}
                          </span>
                          {((product as any).subcategory || (product as any).subcategoryName) && (
                            <p className="text-[11px] text-gray-500 mt-0.5 truncate max-w-[140px]" title={(product as any).subcategory || (product as any).subcategoryName}>
                              {(product as any).subcategory || (product as any).subcategoryName}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold" style={{ color: MAROON }}>
                            ₹{Number(product.basePrice != null ? product.basePrice : (product.price ?? 0)).toLocaleString("en-IN")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StockCell
                            product={product}
                            onUpdate={(id, newStock) => updateStock(id, newStock)}
                            onError={(msg) => showToast(msg, "error")}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {product.status === "approved" ? (
                            <button
                              onClick={() => handleToggleActive(product)}
                              title={product.active ? "Click to set Out of Stock" : "Click to set Available"}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                              style={{
                                background: product.active ? "#DCFCE7" : "#FEF3C7",
                                color: product.active ? "#166534" : "#92400E",
                              }}
                            >
                              {product.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                              {product.active ? "Available" : "Out of Stock"}
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{ background: "#F3F4F6", color: "#6B7280" }}
                              title={product.status === "pending" ? "Awaiting admin approval" : "Listing was rejected"}
                            >
                              <ToggleLeft size={14} />
                              {product.status === "rejected" ? "Rejected" : "Pending"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Link href={`/seller/products/${product._id || product.id}/edit`}>
                              <button
                                className="p-1.5 rounded-lg hover:bg-[#E5E8EC] transition-colors"
                                title="Edit"
                              >
                                <Pencil size={14} style={{ color: MAROON }} />
                              </button>
                            </Link>
                            <button
                              onClick={() => handleDuplicate(product)}
                              disabled={duplicatingId === product.id}
                              className="p-1.5 rounded-lg hover:bg-[#E5E8EC] transition-colors"
                              title="Duplicate"
                            >
                              {duplicatingId === product.id ? (
                                <Loader2 size={14} className="animate-spin" style={{ color: MAROON }} />
                              ) : (
                                <Copy size={14} style={{ color: MAROON }} />
                              )}
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>

        {!loading && filtered.length > PAGE_SIZE && (
          <div className="flex items-center justify-center gap-2 mt-5">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40"
              style={{ borderColor: "#D6C9BA", color: MAROON }}
            >
              Previous
            </button>
            <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 rounded-lg border text-xs font-semibold disabled:opacity-40"
              style={{ borderColor: "#D6C9BA", color: MAROON }}
            >
              Next
            </button>
          </div>
        )}
      </div>

      <AnimatePresence>
        {showBulkUpload && (
          <SellerBulkUpload
            onClose={() => setShowBulkUpload(false)}
            onDone={(msg) => { showToast(msg, "success"); fetchProducts(); }}
          />
        )}
        {toast && (
          <Toast key={toast.message} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </SellerLayout>
  );
}
