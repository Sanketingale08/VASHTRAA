import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, CheckCircle, XCircle, Clock, Tag, Layers, Star,
  Search, ChevronDown, ChevronUp, Trash2, Edit2, Plus, X, Eye,
  ToggleLeft, ToggleRight, GripVertical, AlertTriangle, RefreshCw,
  ChevronLeft, ChevronRight, Upload, Image as ImageIcon, User, CheckCircle2,
  Folder, ArrowUpDown, Filter, ShoppingBag, ShieldAlert, AlertCircle
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders, adminKey, adminFetch, adminAuthHeaders } from '@/lib/adminApi';
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { Skeleton } from "@/components/ui/skeleton";
import { TableRowSkeleton } from "@/components/skeletons";
import { CATEGORY_DROPDOWN_OPTIONS, CATALOG_CATEGORIES, findCategoryBySlugOrName, getSubcategoriesForCategory } from "@/constants/categories";
import { isSareeCategory } from "@/constants/categorySpecifications";
import { CategoriesTab as RedesignedCategoriesTab } from "./CategoriesTab";


// ─── constants ───────────────────────────────────────────────────────────────
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";

function apiUrl(path: string) {
  return path;
}

const apiFetch = adminFetch;

// ─── types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; price?: number; originalPrice?: number;
  basePrice?: number;
  category: string; subcategory?: string; subtype?: string;
  categoryId?: string; categoryName?: string;
  subcategoryId?: string; subcategoryName?: string;
  brand?: string; fabric: string;
  color: string; occasion: string; vendorId?: string; vendorName: string;
  images: string[]; videos: string[]; active: boolean;
  isFeatured: boolean; isBestSeller: boolean; isNewArrival: boolean;
  stock: number; rating: number; reviewCount: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string; approvalRemark?: string;
  featuredOrder?: number; featuredUntil?: string;
  description: string;
  blouseIncluded?: boolean;
  blouseImages?: string[];
  blouseDetails?: { fabric?: string; color?: string; length?: string; design?: string };
  specifications?: Array<{ key?: string; value?: string; name?: string }>;
}

// ─── formatting helpers ───────────────────────────────────────────────────────
function formatPrice(val: number | string | null | undefined): string {
  if (val == null || val === "") return "—";
  const num = Number(val);
  return isNaN(num) ? "—" : `₹${num.toLocaleString("en-IN")}`;
}

function getProductDisplayPrice(p?: { price?: number | string | null; basePrice?: number | string | null } | null): string {
  if (!p) return "—";
  const val = p.price != null && p.price !== "" ? p.price : p.basePrice;
  if (val != null && val !== "") {
    const num = Number(val);
    if (!isNaN(num)) return `₹${num.toLocaleString("en-IN")}`;
  }
  return "₹0";
}

interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  type?: string;
  createdBy?: string;
  sellerId?: string | null;
  sellerName?: string | null;
  coverImage?: string | null;
  bannerImage?: string | null;
  description?: string | null;
  displayOrder?: number;
  subcategoriesCount?: number;
  subcategories?: any[];
  subtypesCount?: number;
  status?: "pending" | "approved" | "rejected";
  parentId?: string | null;
  productCount?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ProductBrand {
  id: string; name: string; slug: string; categoryIds: string[];
  active: boolean; createdAt: string;
}

interface Stats {
  total: number; pending: number; approved: number; rejected: number;
  featured: number; activeCategories: number; activeBrands: number;
}

// ─── mini toast ───────────────────────────────────────────────────────────────
interface ToastMsg { id: number; type: "ok" | "err"; text: string }

function useToastMsg() {
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const next = useRef(0);
  const show = useCallback((type: "ok" | "err", text: string) => {
    const id = next.current++;
    setToasts(t => [...t, { id, type, text }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, ok: (t: string) => show("ok", t), err: (t: string) => show("err", t) };
}

function ToastStack({ toasts }: { toasts: ToastMsg[] }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map(t => (
        <div key={t.id} className={`flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white
          ${t.type === "ok" ? "bg-emerald-600" : "bg-red-600"}`}>
          {t.type === "ok" ? <CheckCircle size={15} /> : <AlertTriangle size={15} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ─── confirm dialog ───────────────────────────────────────────────────────────
function ConfirmDialog({
  open, title, body, danger = true, onConfirm, onCancel,
}: { open: boolean; title: string; body: string; danger?: boolean; onConfirm: () => void | Promise<void>; onCancel: () => void }) {
  const [loading, setLoading] = useState(false);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${danger ? "bg-red-50" : "bg-amber-50"}`}>
            <AlertTriangle size={16} className={danger ? "text-red-500" : "text-amber-500"} />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 text-sm">{title}</h3>
            <p className="text-xs text-gray-500 mt-1">{body}</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button disabled={loading} onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              try {
                await onConfirm();
              } finally {
                setLoading(false);
              }
            }}
            className={`px-4 py-2 text-sm rounded-lg font-semibold text-white flex items-center gap-1.5 ${danger ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"} disabled:opacity-50`}
          >
            {loading && <RefreshCw size={13} className="animate-spin" />}
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── KPI card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, icon: Icon, iconBg, iconColor, active, onClick, isLoading, isError }: {
  label: string; value?: number | string; icon: React.ElementType;
  iconBg: string; iconColor: string; active?: boolean; onClick?: () => void;
  isLoading?: boolean; isError?: boolean;
}) {
  return (
    <button onClick={onClick}
      className={`bg-white rounded-2xl border p-4 shadow-sm text-left transition-all w-full
        ${active ? "border-[#C7CCD1] ring-1 ring-[#C7CCD1]/30" : "border-gray-200 hover:border-gray-300"}`}>
      <div className="flex items-start justify-between mb-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{label}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg }}>
          <Icon size={14} style={{ color: iconColor }} />
        </div>
      </div>
      <div className="text-2xl font-serif font-bold" style={{ color: NAVY }}>
        {isLoading ? (
          <Skeleton className="h-7 w-16 rounded my-0.5" />
        ) : isError ? (
          <span className="text-xs font-semibold text-red-500">Error</span>
        ) : (
          value ?? 0
        )}
      </div>
    </button>
  );
}

// ─── status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    pending:  { cls: "bg-amber-50 text-amber-700 border-amber-200",       label: "Pending" },
    approved: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Approved" },
    rejected: { cls: "bg-red-50 text-red-700 border-red-200",             label: "Rejected" },
    active:   { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: "Available" },
    inactive: { cls: "bg-amber-50 text-amber-700 border-amber-200",       label: "Out of Stock" },
  };
  const { cls, label } = map[status] ?? { cls: "bg-gray-100 text-gray-500 border-gray-200", label: status };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ─── product detail modal ─────────────────────────────────────────────────────
function ProductModal({ product, onClose, onRefresh, toast }: {
  product: Product; onClose: () => void;
  onRefresh: () => void; toast: { ok: (t: string) => void; err: (t: string) => void };
}) {
  const [tab, setTab] = useState<"detail" | "approve" | "reject" | "edit">("detail");
  const [remark, setRemark] = useState(product.approvalRemark ?? "");
  const [reason, setReason] = useState(product.rejectionReason ?? "");
  const [editNote, setEditNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function doApprove() {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/products/${product.id}/approve`, {
        method: "POST", body: JSON.stringify({ remark }),
      });
      toast.ok(`"${product.name}" approved`);
      onRefresh(); onClose();
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  }

  async function doReject() {
    setBusy(true);
    try {
      await apiFetch(`/api/admin/products/${product.id}/reject`, {
        method: "POST", body: JSON.stringify({ reason }),
      });
      toast.ok(`"${product.name}" rejected`);
      onRefresh(); onClose();
    } catch (e: any) { toast.err(e.message); }
    finally { setBusy(false); }
  }

  const img = getProductImageSrc(product.images?.[0]);

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40" onClick={onClose}>
      <div className="ml-auto w-full max-w-xl bg-white h-full overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}>
        {/* header */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-5 py-4 flex items-center gap-3">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100"><X size={16} /></button>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-sm truncate">{product.name}</h2>
            <p className="text-xs text-gray-400">ID: {product.id}</p>
          </div>
          <StatusBadge status={product.status} />
        </div>

        {/* image */}
        <div className="aspect-video bg-gray-50 overflow-hidden">
          <img src={img} alt={product.name} className="w-full h-full object-cover" onError={replaceProductImageWithFallback} />
        </div>

        {/* sub-tabs */}
        <div className="border-b border-gray-100 px-5 flex gap-1 pt-3">
          {(["detail", "approve", "reject"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-2 text-xs font-semibold rounded-t-lg capitalize transition-colors
                ${tab === t ? "text-[#C7CCD1] border-b-2 border-[#C7CCD1]" : "text-gray-500 hover:text-gray-700"}`}>
              {t === "approve" ? "✓ Approve" : t === "reject" ? "✕ Reject" : "Details"}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {tab === "detail" && (
            <>
              {/* Category Hierarchy Banner */}
              <div className="bg-[#0D1B36]/5 border border-[#0D1B36]/10 rounded-xl p-3 text-xs">
                <span className="text-[10px] text-gray-500 uppercase font-bold tracking-wider block mb-1">
                  Category Hierarchy
                </span>
                <div className="flex items-center gap-1.5 font-semibold text-[#0D1B36]">
                  <span>{product.categoryName || product.category || "Main Category"}</span>
                  <span className="text-gray-400">→</span>
                  <span>{product.subcategoryName || product.subcategory || "General"}</span>
                  {product.subtype && (
                    <>
                      <span className="text-gray-400">→</span>
                      <span>{product.subtype}</span>
                    </>
                  )}
                </div>
              </div>

              {/* Main Product Image Thumbnails */}
              {Array.isArray(product.images) && product.images.length > 1 && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5 font-bold">
                    Main Product Gallery ({product.images.length} photos)
                  </p>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {product.images.map((imgUrl, idx) => (
                      <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden border border-gray-200 shrink-0">
                        <img
                          src={getProductImageSrc(imgUrl)}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={replaceProductImageWithFallback}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Vendor", product.vendorName || "—"],
                  ["Category", product.categoryName || product.category || "—"],
                  ["Subcategory", product.subcategoryName || product.subcategory || "—"],
                  ["Subtype", product.subtype || "—"],
                  ["Brand", product.brand || "—"], ["Fabric", product.fabric || "—"],
                  ["Color", product.color || "—"], ["Occasion", product.occasion || "—"],
                  ["Price", getProductDisplayPrice(product)],
                  ["Original Price", formatPrice(product.originalPrice)],
                  ["Stock", product.stock ?? 0], ["Rating", `${product.rating ?? 0} (${product.reviewCount ?? 0})`],
                  ["Active", product.active ? "Yes" : "No"], ["Featured", product.isFeatured ? "Yes" : "No"],
                  ["Marked New Arrival", product.isNewArrival ? "Yes" : "No"],
                ].map(([k, v]) => (
                  <div key={String(k)} className="bg-gray-50 rounded-xl p-3">
                    <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{k}</p>
                    <p className="font-semibold text-gray-800 text-xs">{String(v)}</p>
                  </div>
                ))}
              </div>

              {/* Saree Matching Blouse Details & Dedicated Gallery */}
              {isSareeCategory(product.category) && product.blouseIncluded && (
                <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                      Matching Blouse Piece (Included)
                    </span>
                    <span className="text-[10px] bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                      Saree Exclusive
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-amber-950">
                    <div>Fabric: <strong>{product.blouseDetails?.fabric || "Pure Silk"}</strong></div>
                    <div>Colour: <strong>{product.blouseDetails?.color || product.color || "Matching"}</strong></div>
                    <div>Length: <strong>{product.blouseDetails?.length || "0.80 Metre (Unstitched)"}</strong></div>
                    {product.blouseDetails?.design && (
                      <div>Design: <strong>{product.blouseDetails.design}</strong></div>
                    )}
                  </div>
                  {Array.isArray(product.blouseImages) && product.blouseImages.length > 0 && (
                    <div className="pt-2 border-t border-amber-200/60">
                      <p className="text-[10px] text-amber-800 uppercase tracking-wide mb-1.5 font-bold">
                        Blouse Piece Photos ({product.blouseImages.length})
                      </p>
                      <div className="flex gap-2 overflow-x-auto pb-1">
                        {product.blouseImages.map((bImg, idx) => (
                          <div key={idx} className="w-16 h-16 rounded-lg overflow-hidden border border-amber-300 shrink-0 shadow-2xs">
                            <img
                              src={getProductImageSrc(bImg)}
                              alt="Blouse"
                              className="w-full h-full object-cover"
                              onError={replaceProductImageWithFallback}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Product Specifications */}
              {Array.isArray(product.specifications) && product.specifications.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-3.5 space-y-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide font-bold">
                    Product Specifications ({product.specifications.length})
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {product.specifications.map((s, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-white border border-gray-100">
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider block font-medium">
                          {s.key || (s as any).name}
                        </span>
                        <span className="font-semibold text-gray-800">{s.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {product.description && (
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">Description</p>
                  <p className="text-xs text-gray-700 leading-relaxed">{product.description}</p>
                </div>
              )}
              {product.rejectionReason && (
                <div className="bg-red-50 border border-red-100 rounded-xl p-3">
                  <p className="text-[10px] text-red-400 uppercase tracking-wide mb-1">Rejection Reason</p>
                  <p className="text-xs text-red-700">{product.rejectionReason}</p>
                </div>
              )}
              {product.approvalRemark && (
                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                  <p className="text-[10px] text-emerald-500 uppercase tracking-wide mb-1">Approval Remark</p>
                  <p className="text-xs text-emerald-700">{product.approvalRemark}</p>
                </div>
              )}
            </>
          )}

          {tab === "approve" && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 text-sm text-emerald-700">
                Approving this product will make it visible to customers immediately.
              </div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Approval Remark <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea value={remark} onChange={e => setRemark(e.target.value)} rows={3}
                placeholder="e.g. Looks great! Approved for listing."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 resize-none" />
              <button onClick={doApprove} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm disabled:opacity-50">
                {busy ? "Approving…" : "Approve Product"}
              </button>
            </div>
          )}

          {tab === "reject" && (
            <div className="space-y-4">
              <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-sm text-red-700">
                Rejecting will hide this product and notify the seller.
              </div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Rejection Reason <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
                placeholder="e.g. Images are low quality. Please re-upload clear product photos."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none" />
              <button onClick={doReject} disabled={busy}
                className="w-full py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-sm disabled:opacity-50">
                {busy ? "Rejecting…" : "Reject Product"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── products table (shared by Total / Pending / Approved / Rejected tabs) ────
function ProductsTable({
  statusFilter, toast, initialCategory, initialSubcategory, onClearFilters,
}: {
  statusFilter?: "pending" | "approved" | "rejected";
  toast: ReturnType<typeof useToastMsg>;
  initialCategory?: string;
  initialSubcategory?: string;
  onClearFilters?: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState(initialCategory || "all");
  const [subcategoryFilter, setSubcategoryFilter] = useState(initialSubcategory || "all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; danger?: boolean; action: () => void | Promise<void> } | null>(null);
  const [busyMap, setBusyMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialCategory !== undefined) setCategoryFilter(initialCategory);
    if (initialSubcategory !== undefined) setSubcategoryFilter(initialSubcategory);
  }, [initialCategory, initialSubcategory]);

  const isBusy = (id: string) => Boolean(busyMap[id] || busyMap[`${id}-approve`] || busyMap[`${id}-reject`] || busyMap[`${id}-toggle`] || busyMap[`${id}-delete`] || busyMap[`${id}-feature`]);
  const setActionBusy = (actionKey: string, busy: boolean) => setBusyMap(prev => ({ ...prev, [actionKey]: busy }));

  const qKey = ["admin-products", statusFilter ?? "all", search, categoryFilter, subcategoryFilter, sort, page];
  const { data, isFetching, refetch } = useQuery({
    queryKey: qKey,
    queryFn: () => {
      const p = new URLSearchParams({
        sort, page: String(page), limit: "20",
        ...(search ? { search } : {}),
        ...(categoryFilter && categoryFilter !== "all" ? { category: categoryFilter } : {}),
        ...(subcategoryFilter && subcategoryFilter !== "all" ? { subcategory: subcategoryFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      return apiFetch(`/api/admin/products?${p}`) as Promise<{
        products: Product[]; total: number; totalPages: number; page: number;
      }>;
    },
    staleTime: 30000,
  });

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (
        detail.name?.startsWith("product:") ||
        detail.name?.startsWith("category:") ||
        detail.name?.startsWith("inventory:") ||
        detail.name === "catalog:updated"
      ) {
        qc.invalidateQueries({ queryKey: ["admin-products"] });
        qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
        qc.invalidateQueries({ queryKey: ["admin-categories"] });
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [qc]);

  const products = data?.products ?? [];
  const totalPages = data?.totalPages ?? 1;

  const updateProductInCache = useCallback((id: string, patch: Partial<Product>) => {
    qc.setQueriesData({ queryKey: ["admin-products"] }, (old: any) => {
      if (!old || !Array.isArray(old.products)) return old;
      return {
        ...old,
        products: old.products.map((item: Product) => (item.id === id ? { ...item, ...patch } : item)),
      };
    });
  }, [qc]);

  const removeProductFromCache = useCallback((id: string) => {
    qc.setQueriesData({ queryKey: ["admin-products"] }, (old: any) => {
      if (!old || !Array.isArray(old.products)) return old;
      return {
        ...old,
        products: old.products.filter((item: Product) => item.id !== id),
        total: Math.max(0, (old.total ?? old.products.length) - 1),
      };
    });
  }, [qc]);

  const bulkMut = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
      apiFetch("/api/admin/products/bulk", { method: "POST", body: JSON.stringify({ ids, action }) }),
    onSuccess: (_, { action, ids }) => {
      toast.ok(`Bulk ${action} applied to ${ids.length} product${ids.length > 1 ? "s" : ""}`);
      setSelected(new Set());
      if (action === "delete") {
        ids.forEach(id => removeProductFromCache(id));
      } else if (action === "approve") {
        ids.forEach(id => updateProductInCache(id, { status: "approved", active: true }));
      } else if (action === "reject") {
        ids.forEach(id => updateProductInCache(id, { status: "rejected", active: false }));
      } else if (action === "activate") {
        ids.forEach(id => updateProductInCache(id, { active: true }));
      } else if (action === "deactivate") {
        ids.forEach(id => updateProductInCache(id, { active: false }));
      }
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/seller/products"] });
    },
    onError: (e: any) => toast.err(e.message || "Bulk action failed"),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiFetch(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (_, { id, body }) => {
      updateProductInCache(id, body);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/seller/products"] });
    },
    onError: (e: any) => toast.err(e.message || "Update failed"),
  });

  async function handleApprove(p: Product) {
    if (isBusy(p.id)) return;
    const actionKey = `${p.id}-approve`;
    setActionBusy(actionKey, true);
    try {
      await apiFetch(`/api/admin/products/${p.id}/approve`, {
        method: "POST",
        body: JSON.stringify({ remark: "Approved by administrator" }),
      });
      updateProductInCache(p.id, { status: "approved", active: true });
      toast.ok(`"${p.name}" approved successfully`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/seller/products"] });
    } catch (err: any) {
      toast.err(err.message || "Failed to approve product");
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  function handleReject(p: Product) {
    if (isBusy(p.id)) return;
    setConfirm({
      title: `Reject "${p.name}"?`,
      body: "This product will be marked as rejected and hidden from customer listings.",
      danger: true,
      action: async () => {
        const actionKey = `${p.id}-reject`;
        setActionBusy(actionKey, true);
        try {
          await apiFetch(`/api/admin/products/${p.id}/reject`, {
            method: "POST",
            body: JSON.stringify({ reason: "Does not meet catalog guidelines" }),
          });
          updateProductInCache(p.id, { status: "rejected", active: false });
          toast.ok(`"${p.name}" rejected`);
          qc.invalidateQueries({ queryKey: ["admin-products"] });
          qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
          qc.invalidateQueries({ queryKey: ["/api/products"] });
          qc.invalidateQueries({ queryKey: ["/api/seller/products"] });
          setConfirm(null);
        } catch (err: any) {
          toast.err(err.message || "Failed to reject product");
        } finally {
          setActionBusy(actionKey, false);
        }
      },
    });
  }

  async function handleToggleActive(p: Product) {
    if (isBusy(p.id)) return;
    const actionKey = `${p.id}-toggle`;
    const targetActive = !p.active;
    setActionBusy(actionKey, true);
    try {
      const endpoint = targetActive
        ? `/api/admin/products/${p.id}/activate`
        : `/api/admin/products/${p.id}/deactivate`;
      await apiFetch(endpoint, { method: "POST" });
      updateProductInCache(p.id, { active: targetActive });
      toast.ok(targetActive ? `"${p.name}" activated` : `"${p.name}" deactivated`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/products"] });
      qc.invalidateQueries({ queryKey: ["/api/seller/products"] });
    } catch (err: any) {
      toast.err(err.message || "Failed to update product visibility");
    } finally {
      setActionBusy(actionKey, false);
    }
  }

  function handleDelete(p: Product) {
    if (isBusy(p.id)) return;
    setConfirm({
      title: `Delete "${p.name}"?`,
      body: "This product will be permanently deleted from MongoDB and removed from all portals. This action cannot be undone.",
      danger: true,
      action: async () => {
        const actionKey = `${p.id}-delete`;
        setActionBusy(actionKey, true);
        try {
          await apiFetch(`/api/admin/products/${p.id}`, { method: "DELETE" });
          removeProductFromCache(p.id);
          toast.ok(`"${p.name}" deleted successfully`);
          setSelected(s => { const n = new Set(s); n.delete(p.id); return n; });
          qc.invalidateQueries({ queryKey: ["admin-products"] });
          qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
          qc.invalidateQueries({ queryKey: ["/api/products"] });
          qc.invalidateQueries({ queryKey: ["/api/seller/products"] });
          setConfirm(null);
        } catch (err: any) {
          toast.err(err.message || "Failed to delete product");
        } finally {
          setActionBusy(actionKey, false);
        }
      },
    });
  }

  function toggleSelect(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(s => s.size === products.length ? new Set() : new Set(products.map(p => p.id)));
  }

  function quickAction(action: string, label: string) {
    if (!selected.size) return;
    setConfirm({
      title: `${label} ${selected.size} product${selected.size > 1 ? "s" : ""}?`,
      body: action === "delete"
        ? "This will permanently delete all selected products from MongoDB. This cannot be undone."
        : `This will ${action} all selected products across portals.`,
      danger: action === "delete" || action === "reject",
      action: async () => {
        await bulkMut.mutateAsync({ ids: [...selected], action });
        setConfirm(null);
      },
    });
  }

  return (
    <div className="space-y-4">
      {/* controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[180px] relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search products or vendors…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40" />
        </div>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(1); }}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40">
          <option value="all">All Categories</option>
          {CATEGORY_DROPDOWN_OPTIONS.map(c => (
            <option key={c.id || c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40">
          <option value="newest">Newest first</option>
          <option value="name_asc">Name A–Z</option>
          <option value="name_desc">Name Z–A</option>
          <option value="price_asc">Price low–high</option>
          <option value="price_desc">Price high–low</option>
        </select>
        <button onClick={() => refetch()} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={14} className={`text-gray-500 ${isFetching ? "animate-spin" : ""}`} />
        </button>
        {(categoryFilter !== "all" || subcategoryFilter !== "all") && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 text-purple-800 border border-purple-200 rounded-xl text-xs font-semibold">
            <span>Filter: <strong>{categoryFilter}</strong>{subcategoryFilter !== "all" ? ` > ${subcategoryFilter}` : ""}</span>
            <button
              onClick={() => {
                setCategoryFilter("all");
                setSubcategoryFilter("all");
                onClearFilters?.();
              }}
              className="p-0.5 hover:bg-purple-200 rounded-full text-purple-700"
              title="Clear Filter"
            >
              <X size={12} />
            </button>
          </div>
        )}
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center bg-[#0D1B36]/5 border border-[#0D1B36]/10 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-gray-700 mr-2">{selected.size} selected</span>
          <button
            onClick={() => quickAction("approve", "Approve")}
            disabled={bulkMut.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            {bulkMut.isPending ? <RefreshCw size={11} className="animate-spin" /> : <CheckCircle size={12} />}
            Approve
          </button>
          <button
            onClick={() => quickAction("reject", "Reject")}
            disabled={bulkMut.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            {bulkMut.isPending ? <RefreshCw size={11} className="animate-spin" /> : <XCircle size={12} />}
            Reject
          </button>
          <button
            onClick={() => quickAction("activate", "Activate")}
            disabled={bulkMut.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            {bulkMut.isPending ? <RefreshCw size={11} className="animate-spin" /> : <ToggleRight size={13} />}
            Activate
          </button>
          <button
            onClick={() => quickAction("deactivate", "Deactivate")}
            disabled={bulkMut.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1.5 disabled:opacity-50"
          >
            {bulkMut.isPending ? <RefreshCw size={11} className="animate-spin" /> : <ToggleLeft size={13} />}
            Deactivate
          </button>
          <button
            onClick={() => quickAction("delete", "Delete")}
            disabled={bulkMut.isPending}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 flex items-center gap-1.5 disabled:opacity-50"
          >
            {bulkMut.isPending ? <RefreshCw size={11} className="animate-spin" /> : <Trash2 size={12} />}
            Delete
          </button>
        </div>
      )}

      {/* table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="pl-4 py-3 w-8">
                  <input type="checkbox" checked={selected.size === products.length && products.length > 0}
                    onChange={toggleAll} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Product</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Vendor</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Price</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide hidden lg:table-cell">Stock</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isFetching && !products.length ? (
                <TableRowSkeleton columns={7} rows={8} />
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center">
                    <Package size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-400 text-sm">No products found</p>
                  </td>
                </tr>
              ) :
                products.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="pl-4 py-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} className="rounded" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                          <img
                            src={getProductImageSrc(p.images?.[0])}
                            alt={p.name}
                            className="w-full h-full object-cover"
                            onError={replaceProductImageWithFallback}
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate max-w-[160px]">{p.name}</p>
                          <p className="text-xs text-gray-400 capitalize">
                            {p.categoryName || p.category}
                            {(p.subcategoryName || p.subcategory) ? ` • ${p.subcategoryName || p.subcategory}` : ""}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-600">{p.vendorName || "—"}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      {getProductDisplayPrice(p)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <StatusBadge status={p.status} />
                        {!p.active && <StatusBadge status="inactive" />}
                        {p.isNewArrival && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-[#2C3E6B]/10 text-[#2C3E6B] border border-[#2C3E6B]/20">
                            New Arrival
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600">{p.stock}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setViewProduct(p)} title="View Details"
                          className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                          <Eye size={14} />
                        </button>
                        <button onClick={() => {
                          setConfirm({
                            title: p.isFeatured ? "Remove from Featured?" : "Mark as Featured?",
                            body: p.isFeatured ? "This product will be removed from the featured section." : "This product will appear in the featured section.",
                            action: async () => {
                              await patchMut.mutateAsync({ id: p.id, body: { isFeatured: !p.isFeatured } });
                              toast.ok(p.isFeatured ? "Removed from featured" : "Marked as featured");
                              setConfirm(null);
                            },
                          });
                        }} title={p.isFeatured ? "Unfeature" : "Feature"}
                          disabled={isBusy(p.id)}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 ${p.isFeatured ? "text-amber-500" : "text-gray-400"}`}>
                          <Star size={14} />
                        </button>

                        {/* 1. ✓ Approve Action */}
                        {p.status !== "approved" && (
                          <button
                            onClick={() => handleApprove(p)}
                            disabled={isBusy(p.id)}
                            title="✓ Approve Product"
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600 hover:text-emerald-700 disabled:opacity-40 transition-colors"
                          >
                            {busyMap[`${p.id}-approve`] ? (
                              <RefreshCw size={14} className="animate-spin text-emerald-600" />
                            ) : (
                              <CheckCircle size={14} />
                            )}
                          </button>
                        )}

                        {/* 2. ✕ Reject Action */}
                        {p.status !== "rejected" && (
                          <button
                            onClick={() => handleReject(p)}
                            disabled={isBusy(p.id)}
                            title="✕ Reject Product"
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 hover:text-red-600 disabled:opacity-40 transition-colors"
                          >
                            {busyMap[`${p.id}-reject`] ? (
                              <RefreshCw size={14} className="animate-spin text-red-500" />
                            ) : (
                              <XCircle size={14} />
                            )}
                          </button>
                        )}

                        {/* 3 & 4. Activate / Deactivate Toggle Action */}
                        <button
                          onClick={() => handleToggleActive(p)}
                          disabled={isBusy(p.id)}
                          title={p.active ? "Deactivate (Hide from storefront)" : "Activate (Show on storefront)"}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 disabled:opacity-40 transition-colors ${
                            p.active ? "text-emerald-500 hover:text-emerald-600" : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          {busyMap[`${p.id}-toggle`] ? (
                            <RefreshCw size={14} className="animate-spin text-gray-500" />
                          ) : p.active ? (
                            <ToggleRight size={15} />
                          ) : (
                            <ToggleLeft size={15} />
                          )}
                        </button>

                        {/* 5. Delete Action */}
                        <button
                          onClick={() => handleDelete(p)}
                          disabled={isBusy(p.id)}
                          title="Delete Product"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 disabled:opacity-40 transition-colors"
                        >
                          {busyMap[`${p.id}-delete`] ? (
                            <RefreshCw size={14} className="animate-spin text-red-500" />
                          ) : (
                            <Trash2 size={14} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-500 text-xs">{data?.total ?? 0} products</span>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs text-gray-600">Page {page} of {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {viewProduct && (
        <ProductModal product={viewProduct} onClose={() => setViewProduct(null)}
          onRefresh={() => {
            qc.invalidateQueries({ queryKey: ["admin-products"] });
            qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
          }} toast={toast} />
      )}
      {confirm && (
        <ConfirmDialog open title={confirm.title} body={confirm.body} danger={confirm.danger ?? true}
          onConfirm={confirm.action} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ─── category detail & media modal ───────────────────────────────────────────
function CategoryDetailModal({
  category, onClose, onRefresh, toast, initialTab = "cover",
}: {
  category: ProductCategory;
  onClose: () => void;

  onRefresh: () => void;
  toast: ReturnType<typeof useToastMsg>;
  initialTab?: "cover" | "subcategories" | "products" | "assign" | "status";
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"cover" | "subcategories" | "products" | "assign" | "status">(initialTab);
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState(category.coverImage ?? "");
  const [bannerUrlInput, setBannerUrlInput] = useState(category.bannerImage ?? "");
  const [currentCover, setCurrentCover] = useState<string | null>(category.coverImage ?? null);
  const [currentBanner, setCurrentBanner] = useState<string | null>(category.bannerImage ?? null);
  const [displayOrder, setDisplayOrder] = useState<number>(category.displayOrder ?? 99);
  const [description, setDescription] = useState<string>(category.description ?? "");
  const [assignSearch, setAssignSearch] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);

  // Associated products query
  const { data: catProductsData, isLoading: isLoadingProducts, refetch: refetchCatProducts } = useQuery({
    queryKey: ["admin-category-products", category.id],
    queryFn: () => apiFetch(`/api/admin/categories/${category.id}/products`) as Promise<{
      category: ProductCategory;
      products: Product[];
      total: number;
    }>,
    enabled: tab === "products" || tab === "assign",
  });

  // All products query for assignment
  const { data: allProductsData, isLoading: isLoadingAllProducts } = useQuery({
    queryKey: ["admin-all-products-for-assign"],
    queryFn: () => apiFetch(`/api/products?limit=200`) as Promise<{
      products: Product[];
    }>,
    enabled: tab === "assign",
  });

  // Find authoritative subcategories from catalog and dynamically registered subcategories
  const catalogDef = findCategoryBySlugOrName(category.slug);
  const subcategoriesList = useMemo(() => {
    const staticSubs = catalogDef?.subcategories || [];
    const dbSubs = category.subcategories || [];
    const merged = [...staticSubs];
    for (const sub of dbSubs) {
      if (!merged.some((s: any) => s.id === sub.id || s.slug === sub.slug || s.name.toLowerCase() === sub.name.toLowerCase())) {
        merged.push(sub);
      }
    }
    return merged;
  }, [catalogDef, category.subcategories]);

  async function uploadCoverImage(imageDataUrlOrUrl: string) {
    setIsUploading(true);
    try {
      await apiFetch(`/api/admin/categories/${category.id}/cover-image`, {
        method: "POST",
        body: JSON.stringify({ coverImage: imageDataUrlOrUrl }),
      });
      setCurrentCover(imageDataUrlOrUrl);
      toast.ok("Thumbnail cover image updated successfully!");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-categories-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message || "Failed to upload cover image");
    } finally {
      setIsUploading(false);
    }
  }

  async function uploadBannerImage(imageDataUrlOrUrl: string) {
    setIsUploading(true);
    try {
      await apiFetch(`/api/admin/categories/${category.id}/banner-image`, {
        method: "POST",
        body: JSON.stringify({ bannerImage: imageDataUrlOrUrl }),
      });
      setCurrentBanner(imageDataUrlOrUrl);
      toast.ok("Category banner image updated successfully!");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-categories-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message || "Failed to upload banner image");
    } finally {
      setIsUploading(false);
    }
  }

  const [subUploadingId, setSubUploadingId] = useState<string | null>(null);

  async function handleFileSelect(file: File, isBanner = false) {
    if (!file.type.startsWith("image/")) {
      toast.err("Please upload an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.err("Image size should be under 10MB.");
      return;
    }
    setIsUploading(true);
    try {
      const buffer = await file.arrayBuffer();
      const catParam = encodeURIComponent(category.slug || category.name || "category");
      const res = await fetch(`/api/admin/upload/category-image?category=${catParam}`, {
        method: "POST",
        headers: adminAuthHeaders({
          "Content-Type": file.type || "image/jpeg",
          "x-category-id": String(category.id || category.slug || "category"),
        }),
        credentials: "include",
        body: buffer,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to upload image");
      }
      const data = await res.json();
      const uploadedUrl = data.url || data.publicUrl;
      if (!uploadedUrl) {
        throw new Error("No URL returned from upload");
      }
      if (isBanner) {
        await uploadBannerImage(uploadedUrl);
      } else {
        await uploadCoverImage(uploadedUrl);
      }
    } catch (e: any) {
      toast.err(e.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSubcategoryFileSelect(sub: any, file: File) {
    if (!file.type.startsWith("image/")) {
      toast.err("Please upload an image file (JPG, PNG, WebP).");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.err("Image size should be under 10MB.");
      return;
    }
    setSubUploadingId(sub.id);
    try {
      const buffer = await file.arrayBuffer();
      const catParam = encodeURIComponent(sub.slug || sub.name || "subcategory");
      const res = await fetch(`/api/admin/upload/category-image?category=${catParam}`, {
        method: "POST",
        headers: adminAuthHeaders({
          "Content-Type": file.type || "image/jpeg",
          "x-category-id": String(sub.id || sub.slug || "subcategory"),
          "x-subcategory-id": String(sub.id || sub.slug || "subcategory"),
        }),
        credentials: "include",
        body: buffer,
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || "Failed to upload image");
      }
      const data = await res.json();
      const uploadedUrl = data.url || data.publicUrl;
      if (!uploadedUrl) {
        throw new Error("No URL returned from upload");
      }

      await apiFetch(`/api/admin/categories/${sub.id}/cover-image`, {
        method: "POST",
        body: JSON.stringify({ coverImage: uploadedUrl }),
      });

      toast.ok(`Image updated for subcategory "${sub.name}"!`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-categories-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message || "Failed to upload subcategory image");
    } finally {
      setSubUploadingId(null);
    }
  }

  async function handleRemoveSubcategoryImage(sub: any) {
    setSubUploadingId(sub.id);
    try {
      await apiFetch(`/api/admin/categories/${sub.id}/cover-image`, {
        method: "DELETE",
      });
      toast.ok(`Image removed for subcategory "${sub.name}"!`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-categories-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message || "Failed to remove subcategory image");
    } finally {
      setSubUploadingId(null);
    }
  }

  async function handleAssignProducts() {
    if (!selectedProductIds.length) {
      toast.err("Select at least one product to assign.");
      return;
    }
    try {
      await apiFetch(`/api/admin/categories/${category.id}/assign-products`, {
        method: "POST",
        body: JSON.stringify({ productIds: selectedProductIds }),
      });
      toast.ok(`Assigned ${selectedProductIds.length} products to ${category.name}!`);
      setSelectedProductIds([]);
      refetchCatProducts();
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message || "Failed to assign products");
    }
  }

  async function saveDetails() {
    try {
      await apiFetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          displayOrder: Number(displayOrder) || 99,
          description: description.trim(),
        }),
      });
      toast.ok("Category settings updated successfully!");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message || "Failed to save category details");
    }
  }

  async function updateStatus(newStatus: "approved" | "rejected") {
    try {
      await apiFetch(`/api/admin/categories/${category.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.ok(`Category status set to ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-categories-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
      onClose();
    } catch (e: any) {
      toast.err(e.message);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D1B36]/10 text-[#0D1B36] flex items-center justify-center font-bold">
              <Folder size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-bold text-gray-900 text-base">{category.name}</h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                  Order #{category.displayOrder ?? 99}
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${category.active ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-600"}`}>
                  {category.active ? "Storefront Visible" : "Hidden"}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Slug: <code className="bg-gray-100 px-1 py-0.5 rounded font-mono text-gray-700">/{category.slug}</code> · {category.productCount ?? 0} active products
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="border-b border-gray-100 px-6 flex gap-2 pt-2 bg-white overflow-x-auto">
          <button
            onClick={() => setTab("cover")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              tab === "cover"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            🖼️ Images & Banner
          </button>
          <button
            onClick={() => setTab("subcategories")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              tab === "subcategories"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            🌿 Subcategories & Subtypes ({subcategoriesList.length})
          </button>
          <button
            onClick={() => setTab("products")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              tab === "products"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            🛍️ Associated Products ({category.productCount ?? 0})
          </button>
          <button
            onClick={() => setTab("assign")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              tab === "assign"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            🎯 Assign Products
          </button>
          <button
            onClick={() => setTab("status")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 whitespace-nowrap ${
              tab === "status"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            ⚙️ Display Order & Status
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: COVER & BANNER IMAGES */}
          {tab === "cover" && (
            <div className="space-y-6">
              {/* Category Thumbnail / Cover */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wide">Category Thumbnail / Card Image</h3>
                    <p className="text-xs text-gray-500">Displayed in storefront category cards, homepage showcase, and search dropdowns.</p>
                  </div>
                  {currentCover && (
                    <button
                      onClick={() => {
                        apiFetch(`/api/admin/categories/${category.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ coverImage: null }),
                        }).then(() => {
                          setCurrentCover(null);
                          setUrlInput("");
                          toast.ok("Cover image removed.");
                          onRefresh();
                        });
                      }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Remove Cover
                    </button>
                  )}
                </div>

                <div className="flex gap-4 items-center">
                  <div className="w-24 h-24 rounded-full border-2 border-purple-200 overflow-hidden shrink-0 relative group bg-white shadow-xs flex items-center justify-center">
                    {currentCover ? (
                      <img
                        src={getProductImageSrc(currentCover)}
                        alt={category.name}
                        className="w-full h-full object-cover object-center"
                        onError={replaceProductImageWithFallback}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-purple-300 bg-purple-50">
                        <ImageIcon size={24} />
                        <span className="text-[10px] text-gray-400 mt-1">No cover</span>
                      </div>
                    )}
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={urlInput}
                        onChange={e => setUrlInput(e.target.value)}
                        placeholder="Paste image URL (e.g. /images/hero-paithani-1.png)"
                        className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/50"
                      />
                      <button
                        onClick={() => { if (urlInput.trim()) uploadCoverImage(urlInput.trim()); }}
                        disabled={isUploading || !urlInput.trim()}
                        className="px-4 py-2 rounded-xl bg-[#0D1B36] text-white text-xs font-semibold hover:bg-[#0D1B36]/90 disabled:opacity-50"
                      >
                        Save
                      </button>
                    </div>
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                    >
                      <Upload size={13} /> Upload File (PNG/JPG/WebP)
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0], false); }}
                    />
                  </div>
                </div>
              </div>

              {/* Category Landing Banner */}
              <div className="space-y-3 pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-gray-900 text-xs uppercase tracking-wide">Category Landing Page Banner</h3>
                    <p className="text-xs text-gray-500">Displayed at the top of the dedicated category landing page ({`/${category.slug}`}).</p>
                  </div>
                  {currentBanner && (
                    <button
                      onClick={() => {
                        apiFetch(`/api/admin/categories/${category.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ bannerImage: null }),
                        }).then(() => {
                          setCurrentBanner(null);
                          setBannerUrlInput("");
                          toast.ok("Banner image removed.");
                          onRefresh();
                        });
                      }}
                      className="text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      Remove Banner
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  <div className="w-full h-32 rounded-2xl bg-gray-100 border border-gray-200 overflow-hidden relative">
                    {currentBanner ? (
                      <img src={getProductImageSrc(currentBanner)} alt="Banner" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                        <ImageIcon size={24} />
                        <span className="text-xs mt-1">No banner image set (uses default luxury gradient)</span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={bannerUrlInput}
                      onChange={e => setBannerUrlInput(e.target.value)}
                      placeholder="Paste banner image URL (e.g. /images/hero-paithani-banner.png)"
                      className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/50"
                    />
                    <button
                      onClick={() => { if (bannerUrlInput.trim()) uploadBannerImage(bannerUrlInput.trim()); }}
                      disabled={isUploading || !bannerUrlInput.trim()}
                      className="px-4 py-2 rounded-xl bg-[#0D1B36] text-white text-xs font-semibold hover:bg-[#0D1B36]/90 disabled:opacity-50"
                    >
                      Save Banner
                    </button>
                    <button
                      onClick={() => bannerInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
                    >
                      <Upload size={13} /> Browse
                    </button>
                  </div>
                  <input
                    ref={bannerInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0], true); }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SUBCATEGORIES & SUBTYPES */}
          {tab === "subcategories" && (
            <div className="space-y-4">
              <div className="bg-purple-50/60 border border-purple-100 rounded-xl p-3 text-xs text-purple-900">
                <span className="font-bold">Authoritative Saree Taxonomy</span>: Sellers select subcategories and subtypes via dependent dropdowns when listing products under <strong>{category.name}</strong>.
              </div>

              {subcategoriesList.length === 0 ? (
                <div className="py-10 text-center text-gray-400 text-xs">
                  No subcategories registered for this category yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {subcategoriesList.map((sub, idx) => (
                    <div key={sub.id || idx} className="bg-gray-50 border border-gray-200/80 rounded-xl p-3.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {/* Circular Subcategory Image */}
                          <div className="w-10 h-10 rounded-full border border-purple-200 overflow-hidden bg-white shrink-0 flex items-center justify-center shadow-2xs">
                            {sub.coverImage || (sub as any).image ? (
                              <img
                                src={getProductImageSrc(sub.coverImage || (sub as any).image)}
                                alt={sub.name}
                                className="w-full h-full object-cover object-center"
                                onError={replaceProductImageWithFallback}
                              />
                            ) : (
                              <ImageIcon size={16} className="text-purple-300" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full bg-[#0D1B36] text-white text-[10px] flex items-center justify-center font-bold">
                                {idx + 1}
                              </span>
                              <span className="font-bold text-gray-900 text-xs">{sub.name}</span>
                              <code className="text-[10px] text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-200">
                                {sub.slug}
                              </code>
                            </div>
                            <span className="text-[11px] font-semibold text-gray-500">
                              {sub.subtypes?.length || 0} Subtypes
                            </span>
                          </div>
                        </div>

                        {/* Image Actions */}
                        <div className="flex items-center gap-2">
                          <label className="cursor-pointer px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-gray-200 hover:bg-purple-50 hover:text-purple-700 text-gray-700 flex items-center gap-1 shadow-2xs transition-colors">
                            <Upload size={12} />
                            <span>{sub.coverImage || (sub as any).image ? "Change Image" : "Upload Image"}</span>
                            <input
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              disabled={subUploadingId === sub.id}
                              onChange={(e) => {
                                if (e.target.files?.[0]) {
                                  handleSubcategoryFileSelect(sub, e.target.files[0]);
                                  e.target.value = "";
                                }
                              }}
                            />
                          </label>
                          {(sub.coverImage || (sub as any).image) && (
                            <button
                              type="button"
                              onClick={() => handleRemoveSubcategoryImage(sub)}
                              disabled={subUploadingId === sub.id}
                              className="p-1 rounded-lg text-red-500 hover:bg-red-50 hover:text-red-700 transition-colors"
                              title="Remove Subcategory Image"
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Subtypes Chips */}
                      {sub.subtypes && sub.subtypes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1 pl-13">
                          {sub.subtypes.map((st: string, sIdx: number) => (
                            <span
                              key={sIdx}
                              className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-white text-gray-700 border border-gray-200/90 shadow-2xs"
                            >
                              {st}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: ASSOCIATED PRODUCTS */}
          {tab === "products" && (
            <div className="space-y-3">
              {isLoadingProducts ? (
                <div className="py-12 text-center text-xs text-gray-400">Loading associated products...</div>
              ) : !catProductsData?.products?.length ? (
                <div className="py-12 text-center text-gray-400">
                  <ShoppingBag size={32} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-sm font-semibold text-gray-600">No products found in this category</p>
                  <p className="text-xs text-gray-400 mt-1">Sellers have not listed any items under "{category.name}" yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {catProductsData.products.map(p => (
                    <div key={p.id} className="flex gap-3 bg-gray-50 border border-gray-200/60 rounded-xl p-2.5 items-center">
                      <div className="w-12 h-12 rounded-lg bg-gray-200 overflow-hidden shrink-0">
                        <img
                          src={getProductImageSrc(p.images?.[0])}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          onError={replaceProductImageWithFallback}
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-gray-900 truncate">{p.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{p.vendorName || "Artisan / Seller"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs font-semibold text-emerald-600">{getProductDisplayPrice(p)}</span>
                          <span className="text-[10px] font-medium text-gray-400">Stock: {p.stock ?? 0}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 4: ASSIGN PRODUCTS */}
          {tab === "assign" && (
            <div className="space-y-4">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={assignSearch}
                    onChange={e => setAssignSearch(e.target.value)}
                    placeholder="Search catalog products to reassign to this category..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40"
                  />
                </div>
                <button
                  onClick={handleAssignProducts}
                  disabled={!selectedProductIds.length}
                  className="px-4 py-2 rounded-xl bg-purple-700 text-white text-xs font-semibold hover:bg-purple-800 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <CheckCircle size={14} /> Assign Selected ({selectedProductIds.length})
                </button>
              </div>

              {isLoadingAllProducts ? (
                <div className="py-10 text-center text-xs text-gray-400">Loading catalog products...</div>
              ) : (
                <div className="max-h-[320px] overflow-y-auto space-y-1.5 border border-gray-100 rounded-xl p-2 bg-gray-50/50">
                  {(allProductsData?.products || [])
                    .filter(p => !assignSearch || p.name.toLowerCase().includes(assignSearch.toLowerCase()) || (p.category && p.category.toLowerCase().includes(assignSearch.toLowerCase())))
                    .map(p => {
                      const isSelected = selectedProductIds.includes(p.id);
                      const isCurrentCat = p.category === category.slug || p.categoryId === category.id;
                      return (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedProductIds(prev =>
                              prev.includes(p.id) ? prev.filter(x => x !== p.id) : [...prev, p.id]
                            );
                          }}
                          className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors border ${
                            isSelected ? "bg-purple-50 border-purple-200" : isCurrentCat ? "bg-emerald-50/50 border-emerald-100" : "bg-white border-gray-100 hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="rounded text-purple-700"
                          />
                          <div className="w-9 h-9 rounded-md bg-gray-200 overflow-hidden shrink-0">
                            <img src={getProductImageSrc(p.images?.[0])} alt="" className="w-full h-full object-cover" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-gray-900 truncate">{p.name}</p>
                            <p className="text-[10px] text-gray-400">
                              Current: <span className="font-medium text-gray-600 capitalize">{p.category || "Unassigned"}</span> · {getProductDisplayPrice(p)}
                            </p>
                          </div>
                          {isCurrentCat && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                              Already in this category
                            </span>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: DISPLAY ORDER & STATUS */}
          {tab === "status" && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Display Order (1–12)</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={displayOrder}
                    onChange={e => setDisplayOrder(parseInt(e.target.value) || 1)}
                    className="w-full text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Controls the sequence across navigation, storefront showcase, and seller forms.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Approval & Storefront Visibility</label>
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => updateStatus("approved")}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1 ${category.status === "approved" || !category.status ? "bg-emerald-600 text-white border-emerald-600" : "bg-white text-emerald-700 border-emerald-200 hover:bg-emerald-50"}`}
                    >
                      <CheckCircle2 size={14} /> Approved
                    </button>
                    <button
                      onClick={() => updateStatus("rejected")}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1 ${category.status === "rejected" ? "bg-red-600 text-white border-red-600" : "bg-white text-red-700 border-red-200 hover:bg-red-50"}`}
                    >
                      <XCircle size={14} /> Rejected
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">SEO & Storefront Description</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Heritage overview displayed on category landing page..."
                  className="w-full text-xs border border-gray-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40"
                />
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={saveDetails}
                  className="px-5 py-2.5 rounded-xl bg-[#0D1B36] text-white text-xs font-semibold hover:bg-[#0D1B36]/90 transition-all shadow-sm"
                >
                  Save Settings & Order
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── categories tab main component ───────────────────────────────────────────
function CategoriesTab({
  toast,
  onNavigateProducts,
}: {
  toast: ReturnType<typeof useToastMsg>;
  onNavigateProducts?: (categorySlug: string, subcategorySlug?: string) => void;
}) {
  const qc = useQueryClient();
  const [detailModal, setDetailModal] = useState<ProductCategory | null>(null);
  const [modalTab, setModalTab] = useState<"cover" | "subcategories" | "products" | "assign" | "status">("cover");

  return (
    <>
      <RedesignedCategoriesTab
        toast={toast}
        onNavigateProducts={onNavigateProducts}
        onOpenMediaModal={(cat, tab) => {
          setDetailModal(cat as any);
          setModalTab(tab);
        }}
      />
      {detailModal && (
        <CategoryDetailModal
          category={detailModal}
          initialTab={modalTab}
          onClose={() => setDetailModal(null)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["admin-categories"] })}
          toast={toast}
        />
      )}
    </>
  );
}

// ─── brands tab ───────────────────────────────────────────────────────────────
function BrandsTab({ toast }: { toast: ReturnType<typeof useToastMsg> }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<Partial<ProductBrand> | null>(null);
  const [formName, setFormName] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => apiFetch("/api/admin/brands") as Promise<{ brands: ProductBrand[] }>,
    staleTime: 30000,
  });
  const brands = data?.brands ?? [];

  function openCreate() { setModal({}); setFormName(""); }
  function openEdit(b: ProductBrand) { setModal(b); setFormName(b.name); }

  async function save() {
    if (!formName.trim()) { toast.err("Name is required"); return; }
    try {
      if (modal?.id) {
        await apiFetch(`/api/admin/brands/${modal.id}`, {
          method: "PATCH", body: JSON.stringify({ name: formName.trim() }),
        });
        toast.ok("Brand updated");
      } else {
        await apiFetch("/api/admin/brands", {
          method: "POST", body: JSON.stringify({ name: formName.trim() }),
        });
        toast.ok("Brand created");
      }
      setModal(null);
      qc.invalidateQueries({ queryKey: ["admin-brands"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    } catch (e: any) { toast.err(e.message); }
  }

  async function toggleActive(b: ProductBrand) {
    try {
      await apiFetch(`/api/admin/brands/${b.id}`, {
        method: "PATCH", body: JSON.stringify({ active: !b.active }),
      });
      toast.ok(b.active ? "Brand deactivated" : "Brand activated");
      qc.invalidateQueries({ queryKey: ["admin-brands"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    } catch (e: any) { toast.err(e.message); }
  }

  async function deleteBrand(id: string) {
    try {
      await apiFetch(`/api/admin/brands/${id}`, { method: "DELETE" });
      toast.ok("Brand deleted");
      qc.invalidateQueries({ queryKey: ["admin-brands"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    } catch (e: any) { toast.err(e.message); }
    setConfirm(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{brands.length} brands · changes sync to seller portal</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: NAVY }}>
          <Plus size={14} /> Add Brand
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isFetching && !brands.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : brands.length === 0 ? (
          <div className="p-12 text-center">
            <Tag size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">No brands yet. Add your first one.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {brands.map(b => (
                <tr key={b.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900">{b.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{b.slug}</td>
                  <td className="px-4 py-3"><StatusBadge status={b.active ? "active" : "inactive"} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(b)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><Edit2 size={13} /></button>
                      <button onClick={() => toggleActive(b)}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 ${b.active ? "text-emerald-500" : "text-gray-400"}`}>
                        {b.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button onClick={() => setConfirm({ id: b.id, name: b.name })}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">{modal.id ? "Edit Brand" : "New Brand"}</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40" />
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600">Cancel</button>
              <button onClick={save} className="px-4 py-2 text-sm rounded-xl font-semibold text-white" style={{ background: NAVY }}>
                {modal.id ? "Save" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog open title={`Delete "${confirm.name}"?`}
          body="This will permanently remove the brand."
          onConfirm={() => deleteBrand(confirm.id)} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ─── featured tab ─────────────────────────────────────────────────────────────
function FeaturedTab({ toast }: { toast: ReturnType<typeof useToastMsg> }) {
  const qc = useQueryClient();
  const [dragId, setDragId] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<Product[] | null>(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-products-featured"],
    queryFn: () => apiFetch("/api/admin/products?status=approved&limit=100&sort=newest") as Promise<{ products: Product[] }>,
    staleTime: 30000,
    select: d => ({
      featured: [...d.products]
        .filter(p => p.isFeatured)
        .sort((a, b) => (a.featuredOrder ?? 999) - (b.featuredOrder ?? 999)),
      all: d.products,
    }),
  });

  const featured = localOrder ?? data?.featured ?? [];

  async function saveOrder(items: Product[]) {
    const order: Record<string, number> = {};
    items.forEach((p, i) => { order[p.id] = i + 1; });
    try {
      await apiFetch("/api/admin/products/featured-order", {
        method: "PATCH", body: JSON.stringify({ order }),
      });
      toast.ok("Order saved");
      setLocalOrder(null);
      qc.invalidateQueries({ queryKey: ["admin-products-featured"] });
    } catch (e: any) { toast.err(e.message); }
  }

  async function removeFromFeatured(id: string) {
    try {
      await apiFetch(`/api/admin/products/${id}`, {
        method: "PATCH", body: JSON.stringify({ isFeatured: false, featuredOrder: null }),
      });
      toast.ok("Removed from featured");
      qc.invalidateQueries({ queryKey: ["admin-products-featured"] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) { toast.err(e.message); }
  }

  function move(idx: number, dir: -1 | 1) {
    const arr = [...featured];
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= arr.length) return;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    setLocalOrder(arr);
    saveOrder(arr);
  }

  function onDragStart(id: string) { setDragId(id); }
  function onDragOver(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    if (!dragId || dragId === targetId) return;
    const arr = [...featured];
    const fromIdx = arr.findIndex(p => p.id === dragId);
    const toIdx = arr.findIndex(p => p.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    const [item] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, item);
    setLocalOrder(arr);
  }
  function onDrop() { if (localOrder) saveOrder(localOrder); setDragId(null); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{featured.length} featured products · drag or use arrows to reorder</p>
        <button onClick={() => refetch()} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={14} className={`text-gray-500 ${isFetching ? "animate-spin" : ""}`} />
        </button>
      </div>

      {isFetching && !featured.length ? (
        <div className="space-y-2" role="status" aria-busy="true" aria-label="Loading featured products">
          {[1, 2, 3, 4].map((idx) => (
            <div key={idx} className="flex items-center gap-3 bg-white border border-gray-200 rounded-2xl p-3 shadow-xs">
              <Skeleton className="w-4 h-4 rounded" />
              <Skeleton className="w-6 h-4 rounded" />
              <Skeleton className="w-10 h-10 rounded-xl shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-3 w-32 rounded" />
              </div>
              <Skeleton className="w-16 h-8 rounded-lg" />
            </div>
          ))}
        </div>
      ) : featured.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <Star size={32} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-400 text-sm">No featured products yet.</p>
          <p className="text-gray-400 text-xs mt-1">Mark products as featured from the Approved tab.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {featured.map((p, idx) => (
            <div key={p.id}
              draggable
              onDragStart={() => onDragStart(p.id)}
              onDragOver={e => onDragOver(e, p.id)}
              onDrop={onDrop}
              className={`flex items-center gap-3 bg-white border rounded-2xl p-3 shadow-sm transition-opacity
                ${dragId === p.id ? "opacity-40" : "opacity-100"} border-gray-200`}>
              <GripVertical size={16} className="text-gray-300 shrink-0 cursor-grab" />
              <span className="w-6 text-center text-xs font-bold text-gray-400 shrink-0">{idx + 1}</span>
              <div className="w-10 h-10 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                <img
                  src={getProductImageSrc(p.images?.[0])}
                  alt={p.name}
                  className="w-full h-full object-cover"
                  onError={replaceProductImageWithFallback}
                />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900 text-sm truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.vendorName || "—"} · {getProductDisplayPrice(p)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => move(idx, -1)} disabled={idx === 0}
                  className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                  <ChevronUp size={13} />
                </button>
                <button onClick={() => move(idx, 1)} disabled={idx === featured.length - 1}
                  className="p-1 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-400">
                  <ChevronDown size={13} />
                </button>
                <button onClick={() => removeFromFeatured(p.id)}
                  className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 ml-1">
                  <X size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────
type TabKey = "all" | "pending" | "approved" | "rejected" | "categories" | "brands" | "featured";

function AdminProductsContent() {
  const [activeTab, setActiveTab] = useState<TabKey>("all");
  const [navCategory, setNavCategory] = useState<string>("all");
  const [navSubcategory, setNavSubcategory] = useState<string>("all");
  const toast = useToastMsg();

  const handleNavigateProducts = useCallback((catSlug: string, subSlug?: string) => {
    setNavCategory(catSlug);
    setNavSubcategory(subSlug || "all");
    setActiveTab("all");
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("category", catSlug);
      if (subSlug) {
        url.searchParams.set("subcategory", subSlug);
      } else {
        url.searchParams.delete("subcategory");
      }
      window.history.pushState({}, "", url.toString());
    } catch {}
  }, []);

  const { data: stats, isLoading: isStatsLoading, isError: isStatsError, refetch: refetchStats, isFetching: isStatsFetching } = useQuery({
    queryKey: ["admin-products-stats"],
    queryFn: () => apiFetch("/api/admin/products/stats") as Promise<Stats>,
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const kpis = [
    { key: "all",        label: "Total Products",    value: stats?.total,            icon: Package,       iconBg: "rgba(13,27,54,0.08)", iconColor: NAVY },
    { key: "pending",    label: "Pending Approvals", value: stats?.pending,          icon: Clock,         iconBg: "rgba(245,158,11,0.1)", iconColor: "#D97706" },
    { key: "approved",   label: "Approved",          value: stats?.approved,         icon: CheckCircle,   iconBg: "rgba(16,185,129,0.1)", iconColor: "#10B981" },
    { key: "rejected",   label: "Rejected",          value: stats?.rejected,         icon: XCircle,       iconBg: "rgba(239,68,68,0.1)",  iconColor: "#EF4444" },
    { key: "categories", label: "Active Categories", value: stats?.activeCategories, icon: Layers,        iconBg: "rgba(59,130,246,0.1)", iconColor: "#3B82F6" },
    { key: "brands",     label: "Active Brands",     value: stats?.activeBrands,     icon: Tag,           iconBg: "rgba(139,92,246,0.1)", iconColor: "#8B5CF6" },
    { key: "featured",   label: "Featured Products", value: stats?.featured,         icon: Star,          iconBg: "rgba(199,204,209,0.12)", iconColor: GOLD },
  ] as const;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all",        label: "All Products" },
    { key: "pending",    label: "Pending" },
    { key: "approved",   label: "Approved" },
    { key: "rejected",   label: "Rejected" },
    { key: "categories", label: "Categories" },
    { key: "brands",     label: "Brands" },
    { key: "featured",   label: "Featured" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>Products</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetchStats()}
            disabled={isStatsLoading || isStatsFetching}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-sm font-semibold text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50"
            title="Refresh Products Stats"
          >
            <RefreshCw size={14} className={isStatsLoading || isStatsFetching ? "animate-spin" : ""} />
            Refresh
          </button>
          {isStatsError && (
            <button
              onClick={() => refetchStats()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-semibold hover:bg-red-100"
            >
              <RefreshCw size={12} /> Retry Loading Stats
            </button>
          )}
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {kpis.map(k => (
          <KpiCard key={k.key} label={k.label} value={k.value}
            icon={k.icon} iconBg={k.iconBg} iconColor={k.iconColor}
            active={activeTab === k.key}
            isLoading={isStatsLoading}
            isError={isStatsError}
            onClick={() => setActiveTab(k.key as TabKey)} />
        ))}
      </div>

      {/* tab bar */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200 pb-0">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors rounded-t-lg
              ${activeTab === t.key
                ? "text-[#C7CCD1] border-b-2 border-[#C7CCD1]"
                : "text-gray-500 hover:text-gray-700"}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* tab content */}
      <div>
        {activeTab === "all"        && (
          <ProductsTable
            toast={toast}
            initialCategory={navCategory}
            initialSubcategory={navSubcategory}
            onClearFilters={() => {
              setNavCategory("all");
              setNavSubcategory("all");
            }}
          />
        )}
        {activeTab === "pending"    && <ProductsTable statusFilter="pending"  toast={toast} />}
        {activeTab === "approved"   && <ProductsTable statusFilter="approved" toast={toast} />}
        {activeTab === "rejected"   && <ProductsTable statusFilter="rejected" toast={toast} />}
        {activeTab === "categories" && <CategoriesTab toast={toast} onNavigateProducts={handleNavigateProducts} />}
        {activeTab === "brands"     && <BrandsTab toast={toast} />}
        {activeTab === "featured"   && <FeaturedTab toast={toast} />}
      </div>

      <ToastStack toasts={toast.toasts} />
    </div>
  );
}

export default function AdminProducts() {
  return (
    <AdminGuard>
      <AdminLayout>
        <AdminProductsContent />
      </AdminLayout>
    </AdminGuard>
  );
}
