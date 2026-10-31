import React, { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, CheckCircle, XCircle, Clock, Tag, Layers, Star,
  Search, ChevronDown, ChevronUp, Trash2, Edit2, Plus, X, Eye,
  ToggleLeft, ToggleRight, GripVertical, AlertTriangle, RefreshCw,
  ChevronLeft, ChevronRight, Upload, Image as ImageIcon, User, CheckCircle2,
  Folder, ArrowUpDown, Filter, ShoppingBag, ShieldAlert, AlertCircle
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders, adminKey, adminFetch } from '@/lib/adminApi';
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { Skeleton } from "@/components/ui/skeleton";
import { TableRowSkeleton } from "@/components/skeletons";
import { CATEGORY_DROPDOWN_OPTIONS } from "@/constants/categories";

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
  category: string; subcategory?: string;
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
}: { open: boolean; title: string; body: string; danger?: boolean; onConfirm: () => void; onCancel: () => void }) {
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
          <button onClick={onCancel} className="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button onClick={onConfirm}
            className={`px-4 py-2 text-sm rounded-lg font-semibold text-white ${danger ? "bg-red-500 hover:bg-red-600" : "bg-amber-500 hover:bg-amber-600"}`}>
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
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Vendor", product.vendorName || "—"],
                  ["Category", product.categoryName || product.category || "—"],
                  ["Subcategory", product.subcategoryName || product.subcategory || "—"],
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
  statusFilter, toast,
}: { statusFilter?: "pending" | "approved" | "rejected"; toast: ReturnType<typeof useToastMsg> }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);

  const qKey = ["admin-products", statusFilter ?? "all", search, categoryFilter, sort, page];
  const { data, isFetching, refetch } = useQuery({
    queryKey: qKey,
    queryFn: () => {
      const p = new URLSearchParams({
        sort, page: String(page), limit: "20",
        ...(search ? { search } : {}),
        ...(categoryFilter && categoryFilter !== "all" ? { category: categoryFilter } : {}),
        ...(statusFilter ? { status: statusFilter } : {}),
      });
      return apiFetch(`/api/admin/products?${p}`) as Promise<{
        products: Product[]; total: number; totalPages: number; page: number;
      }>;
    },
    staleTime: 30000,
  });

  const products = data?.products ?? [];
  const totalPages = data?.totalPages ?? 1;

  const bulkMut = useMutation({
    mutationFn: ({ ids, action }: { ids: string[]; action: string }) =>
      apiFetch("/api/admin/products/bulk", { method: "POST", body: JSON.stringify({ ids, action }) }),
    onSuccess: (_, { action }) => {
      toast.ok(`Bulk ${action} applied`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    },
    onError: (e: any) => toast.err(e.message),
  });

  const patchMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, any> }) =>
      apiFetch(`/api/admin/products/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    },
    onError: (e: any) => toast.err(e.message),
  });

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
      body: `This will ${action} all selected products.`,
      action: () => { bulkMut.mutate({ ids: [...selected], action }); setConfirm(null); },
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
      </div>

      {/* bulk action bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap gap-2 items-center bg-[#0D1B36]/5 border border-[#0D1B36]/10 rounded-xl px-4 py-2.5">
          <span className="text-xs font-semibold text-gray-700 mr-2">{selected.size} selected</span>
          {!statusFilter || statusFilter === "pending" ? (
            <button onClick={() => quickAction("approve", "Approve")}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200">
              ✓ Approve
            </button>
          ) : null}
          {!statusFilter || statusFilter === "pending" || statusFilter === "approved" ? (
            <button onClick={() => quickAction("reject", "Reject")}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200">
              ✕ Reject
            </button>
          ) : null}
          <button onClick={() => quickAction("activate", "Activate")}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200">
            Activate
          </button>
          <button onClick={() => quickAction("deactivate", "Deactivate")}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
            Deactivate
          </button>
          <button onClick={() => quickAction("delete", "Delete")}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-red-100 text-red-700 hover:bg-red-200">
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
                        <button onClick={() => setViewProduct(p)} title="View"
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
                          className={`p-1.5 rounded-lg hover:bg-gray-100 ${p.isFeatured ? "text-amber-500" : "text-gray-400"}`}>
                          <Star size={14} />
                        </button>
                        <button onClick={() => {
                          setConfirm({
                            title: `${p.active ? "Deactivate" : "Activate"} product?`,
                            body: p.active ? "Product will be hidden from customers." : "Product will be visible to customers.",
                            danger: p.active,
                            action: async () => {
                              await patchMut.mutateAsync({ id: p.id, body: { active: !p.active } });
                              toast.ok(p.active ? "Deactivated" : "Activated");
                              setConfirm(null);
                            },
                          } as any);
                        }} title={p.active ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 ${p.active ? "text-emerald-500" : "text-gray-400"}`}>
                          {p.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                        </button>
                        <button onClick={() => setConfirm({
                          title: "Delete product?",
                          body: "This is permanent and cannot be undone.",
                          action: async () => {
                            await apiFetch(`/api/admin/products/${p.id}`, { method: "DELETE" });
                            toast.ok("Product deleted");
                            qc.invalidateQueries({ queryKey: ["admin-products"] });
                            qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
                            setConfirm(null);
                          },
                        })} title="Delete"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500">
                          <Trash2 size={14} />
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
          onRefresh={() => qc.invalidateQueries({ queryKey: ["admin-products"] })} toast={toast} />
      )}
      {confirm && (
        <ConfirmDialog open title={confirm.title} body={confirm.body}
          onConfirm={confirm.action} onCancel={() => setConfirm(null)} />
      )}
    </div>
  );
}

// ─── category detail & cover upload modal ──────────────────────────────────────
function CategoryDetailModal({
  category, onClose, onRefresh, toast,
}: {
  category: ProductCategory;
  onClose: () => void;
  onRefresh: () => void;
  toast: ReturnType<typeof useToastMsg>;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"cover" | "products" | "status">("cover");
  const [isUploading, setIsUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState(category.coverImage ?? "");
  const [currentCover, setCurrentCover] = useState<string | null>(category.coverImage ?? null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Associated products query
  const { data: catProductsData, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["admin-category-products", category.id],
    queryFn: () => apiFetch(`/api/admin/categories/${category.id}/products`) as Promise<{
      category: ProductCategory;
      products: Product[];
      total: number;
    }>,
    enabled: tab === "products",
  });

  async function uploadCoverImage(imageDataUrlOrUrl: string) {
    setIsUploading(true);
    try {
      await apiFetch(`/api/admin/categories/${category.id}/cover-image`, {
        method: "POST",
        body: JSON.stringify({ coverImage: imageDataUrlOrUrl }),
      });
      setCurrentCover(imageDataUrlOrUrl);
      toast.ok("Cover image updated successfully!");
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

  function handleFileSelect(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.err("Please upload an image file (JPG, PNG, WebP, GIF).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.err("Image size should be under 5MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      const result = e.target?.result as string;
      if (result) uploadCoverImage(result);
    };
    reader.readAsDataURL(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  }

  async function removeCover() {
    setIsUploading(true);
    try {
      await apiFetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({ coverImage: null }),
      });
      setCurrentCover(null);
      setUrlInput("");
      toast.ok("Cover image removed.");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-categories-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
      onRefresh();
    } catch (e: any) {
      toast.err(e.message);
    } finally {
      setIsUploading(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#0D1B36]/10 text-[#0D1B36] flex items-center justify-center font-bold">
              <Folder size={20} />
            </div>
            <div>
              <h2 className="font-bold text-gray-900 text-base">{category.name}</h2>
              <p className="text-xs text-gray-500">
                Slug: <code className="bg-gray-100 px-1 py-0.5 rounded">{category.slug}</code> · Type:{" "}
                <span className="capitalize font-semibold text-gray-700">{category.type || "custom"}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        {/* Sub Navigation */}
        <div className="border-b border-gray-100 px-6 flex gap-2 pt-2 bg-white">
          <button
            onClick={() => setTab("cover")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              tab === "cover"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            🖼️ Cover Image & Media
          </button>
          <button
            onClick={() => setTab("products")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              tab === "products"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            🛍️ Associated Products ({category.productCount ?? 0})
          </button>
          <button
            onClick={() => setTab("status")}
            className={`px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-b-2 ${
              tab === "status"
                ? "text-[#0D1B36] border-[#0D1B36] bg-gray-50/80"
                : "text-gray-500 border-transparent hover:text-gray-700"
            }`}
          >
            ⚙️ Verification & Status
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {tab === "cover" && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Upload or change the high-resolution banner image displayed for this category on the public shop & seller dashboard.
              </p>

              {/* Current Preview */}
              {currentCover ? (
                <div className="relative rounded-2xl border border-gray-200 overflow-hidden bg-gray-50 group">
                  <img
                    src={getProductImageSrc(currentCover)}
                    alt={category.name}
                    className="w-full h-48 object-cover"
                    onError={replaceProductImageWithFallback}
                  />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-xs">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 rounded-xl bg-white text-gray-900 text-xs font-semibold shadow hover:bg-gray-100 flex items-center gap-1.5"
                    >
                      <Upload size={14} /> Replace
                    </button>
                    <button
                      onClick={removeCover}
                      className="px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold shadow hover:bg-red-700 flex items-center gap-1.5"
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                  <span className="absolute bottom-2 left-2 bg-black/60 text-white text-[10px] font-semibold px-2 py-0.5 rounded-md backdrop-blur-xs">
                    Active Cover Image
                  </span>
                </div>
              ) : (
                <div
                  onDragOver={e => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-2 ${
                    dragOver
                      ? "border-[#0D1B36] bg-[#0D1B36]/5 scale-[0.99]"
                      : "border-gray-200 hover:border-gray-400 bg-gray-50/50"
                  }`}
                >
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-sm border border-gray-100 flex items-center justify-center text-gray-400">
                    <Upload size={22} className="text-[#0D1B36]" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      Drag & drop cover image here, or <span className="text-[#0D1B36] underline">browse</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Supports PNG, JPG, WebP up to 5MB</p>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                }}
              />

              {/* URL Direct Upload Input */}
              <div className="pt-2 border-t border-gray-100 space-y-2">
                <label className="block text-xs font-semibold text-gray-600">Or paste image URL:</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={e => setUrlInput(e.target.value)}
                    placeholder="https://images.unsplash.com/..."
                    className="flex-1 text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/50"
                  />
                  <button
                    onClick={() => {
                      if (urlInput.trim()) uploadCoverImage(urlInput.trim());
                    }}
                    disabled={isUploading || !urlInput.trim()}
                    className="px-4 py-2 rounded-xl bg-[#0D1B36] text-white text-xs font-semibold hover:bg-[#0D1B36]/90 disabled:opacity-50"
                  >
                    Save URL
                  </button>
                </div>
              </div>
            </div>
          )}

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
                <div className="grid grid-cols-2 gap-3 max-h-[340px] overflow-y-auto pr-1">
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
                        <p className="text-[11px] text-gray-500 truncate">{p.vendorName || "System"}</p>
                        <p className="text-xs font-semibold text-emerald-600 mt-0.5">{getProductDisplayPrice(p)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "status" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800 flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Seller Custom Category Governance</p>
                  <p className="mt-0.5">
                    Unverified or rejected custom categories created by sellers remain hidden from public customer navigation until approved by an admin.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Category Origin</span>
                  <p className="text-sm font-semibold text-gray-800 capitalize mt-0.5">{category.createdBy || "System"}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Seller / Shop Name</span>
                  <p className="text-sm font-semibold text-gray-800 truncate mt-0.5">{category.sellerName || "System Admin"}</p>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 flex gap-3">
                <button
                  onClick={() => updateStatus("approved")}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <CheckCircle2 size={15} /> Approve Category
                </button>
                <button
                  onClick={() => updateStatus("rejected")}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow-sm"
                >
                  <XCircle size={15} /> Reject Category
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
function CategoriesTab({ toast }: { toast: ReturnType<typeof useToastMsg> }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("newest");

  // Modals
  const [viewDetailModal, setViewDetailModal] = useState<ProductCategory | null>(null);
  const [formModal, setFormModal] = useState<Partial<ProductCategory> | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<string>("system");
  const [formParent, setFormParent] = useState("");
  const [formCover, setFormCover] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  // Fetch list of categories with query params
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-categories", statusFilter, typeFilter, search, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        ...(search ? { search } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(typeFilter !== "all" ? { type: typeFilter } : {}),
        ...(sort ? { sort } : {}),
      });
      return apiFetch(`/api/admin/categories?${p}`) as Promise<{
        categories: ProductCategory[];
        stats?: {
          total: number;
          pending: number;
          approved: number;
          rejected: number;
          activePublic: number;
          noCover: number;
        };
      }>;
    },
    staleTime: 15000,
  });

  const categories = data?.categories ?? [];
  const stats = data?.stats;

  function openCreate() {
    setFormModal({});
    setFormName("");
    setFormType("system");
    setFormParent("");
    setFormCover("");
    setFormActive(true);
  }

  function openEdit(c: ProductCategory) {
    setFormModal(c);
    setFormName(c.name);
    setFormType(c.type || "system");
    setFormParent(c.parentId ?? "");
    setFormCover(c.coverImage ?? "");
    setFormActive(c.active ?? true);
  }

  async function saveCategory() {
    if (!formName.trim()) {
      toast.err("Category name is required");
      return;
    }
    try {
      if (formModal?.id) {
        await apiFetch(`/api/admin/categories/${formModal.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: formName.trim(),
            type: formType,
            parentId: formParent || null,
            coverImage: formCover.trim() || null,
            active: formActive,
          }),
        });
        toast.ok("Category updated successfully");
      } else {
        await apiFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({
            name: formName.trim(),
            type: formType,
            parentId: formParent || null,
            coverImage: formCover.trim() || null,
          }),
        });
        toast.ok("Category created successfully");
      }
      setFormModal(null);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to save category");
    }
  }

  async function updateStatus(c: ProductCategory, newStatus: "approved" | "rejected") {
    try {
      await apiFetch(`/api/admin/categories/${c.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      toast.ok(`Category "${c.name}" ${newStatus}`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message);
    }
  }

  async function toggleActive(c: ProductCategory) {
    try {
      await apiFetch(`/api/admin/categories/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      toast.ok(c.active ? `"${c.name}" deactivated` : `"${c.name}" activated`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message);
    }
  }

  async function deleteCat(id: string) {
    try {
      await apiFetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      toast.ok("Category deleted");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message);
    }
    setConfirm(null);
  }

  const parentCats = categories.filter(c => !c.parentId);

  return (
    <div className="space-y-6">
      {/* ── 1. Category Overview & Real-Time Statistics ───────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="Total Categories"
          value={stats?.total ?? categories.length}
          icon={Folder}
          iconBg="rgba(13,27,54,0.08)"
          iconColor={NAVY}
          active={statusFilter === "all"}
          onClick={() => setStatusFilter("all")}
        />
        <KpiCard
          label="Pending Verification"
          value={stats?.pending ?? 0}
          icon={Clock}
          iconBg="rgba(245,158,11,0.1)"
          iconColor="#D97706"
          active={statusFilter === "pending"}
          onClick={() => setStatusFilter("pending")}
        />
        <KpiCard
          label="Approved"
          value={stats?.approved ?? 0}
          icon={CheckCircle}
          iconBg="rgba(16,185,129,0.1)"
          iconColor="#10B981"
          active={statusFilter === "approved"}
          onClick={() => setStatusFilter("approved")}
        />
        <KpiCard
          label="Rejected"
          value={stats?.rejected ?? 0}
          icon={XCircle}
          iconBg="rgba(239,68,68,0.1)"
          iconColor="#EF4444"
          active={statusFilter === "rejected"}
          onClick={() => setStatusFilter("rejected")}
        />
        <KpiCard
          label="Active Public"
          value={stats?.activePublic ?? 0}
          icon={Layers}
          iconBg="rgba(59,130,246,0.1)"
          iconColor="#3B82F6"
        />
        <KpiCard
          label="No Cover Image"
          value={stats?.noCover ?? 0}
          icon={ImageIcon}
          iconBg="rgba(139,92,246,0.1)"
          iconColor="#8B5CF6"
        />
      </div>

      {/* ── 2. Toolbar (Search, Filter, Sort, Add) ────────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 items-center flex-1 min-w-[280px]">
          {/* Search */}
          <div className="relative flex-1 min-w-[180px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search category or seller shop..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40 bg-white"
          >
            <option value="all">All Verification Statuses</option>
            <option value="pending">⏳ Pending Approval</option>
            <option value="approved">✓ Approved</option>
            <option value="rejected">✕ Rejected</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40 bg-white"
          >
            <option value="all">All Category Types</option>
            <option value="system">🏢 System Categories</option>
            <option value="seller_custom">🛍️ Seller Custom Categories</option>
          </select>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40 bg-white"
          >
            <option value="newest">Newest First</option>
            <option value="name_asc">Name (A–Z)</option>
            <option value="products_desc">Most Products</option>
          </select>

          <button onClick={() => refetch()} className="p-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-500">
            <RefreshCw size={14} className={isFetching ? "animate-spin" : ""} />
          </button>
        </div>

        {/* Add Category Button */}
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-all shadow-sm hover:opacity-90"
          style={{ background: NAVY }}
        >
          <Plus size={15} /> Add Category
        </button>
      </div>

      {/* ── 3. Category Management Table ─────────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/80 text-gray-500 uppercase tracking-wider font-bold">
                <th className="px-4 py-3 text-left w-16">Cover</th>
                <th className="px-4 py-3 text-left">Category Name / Slug</th>
                <th className="px-4 py-3 text-left">Type</th>
                <th className="px-4 py-3 text-center">Products</th>
                <th className="px-4 py-3 text-left">Created By / Seller</th>
                <th className="px-4 py-3 text-left">Verification Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isFetching && !categories.length ? (
                <TableRowSkeleton columns={7} rows={6} />
              ) : categories.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-16 text-center">
                    <Folder size={40} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-gray-700 font-bold text-sm">No categories matching criteria</p>
                    <p className="text-gray-400 text-xs mt-1">Try clearing filters or click "+ Add Category" to create one.</p>
                  </td>
                </tr>
              ) :
                categories.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                    {/* Cover Thumbnail */}
                    <td className="px-4 py-3">
                      <div
                        onClick={() => setViewDetailModal(c)}
                        className="w-12 h-12 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden cursor-pointer relative group shrink-0"
                      >
                        {c.coverImage ? (
                          <img
                            src={getProductImageSrc(c.coverImage)}
                            alt={c.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            onError={replaceProductImageWithFallback}
                          />
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50 hover:bg-gray-100">
                            <ImageIcon size={16} />
                            <span className="text-[9px] text-gray-400 font-semibold mt-0.5">+ Cover</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Category Name & Slug */}
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{c.name}</p>
                        <p className="text-[11px] text-gray-400 font-mono">/{c.slug}</p>
                      </div>
                    </td>

                    {/* Type Badge */}
                    <td className="px-4 py-3">
                      {c.type === "seller_custom" || c.type === "custom" || c.createdBy === "seller" ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                          <User size={12} /> Seller Custom
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                          <Folder size={12} /> System
                        </span>
                      )}
                    </td>

                    {/* Product Count Badge */}
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold bg-gray-100 text-gray-700">
                        {c.productCount ?? 0} items
                      </span>
                    </td>

                    {/* Seller / Admin Creator */}
                    <td className="px-4 py-3">
                      <span className="text-gray-700 font-medium">
                        {c.sellerName ? (
                          <span className="font-semibold text-gray-800">{c.sellerName}</span>
                        ) : c.createdBy === "seller" ? (
                          <span className="text-gray-600">Seller</span>
                        ) : (
                          <span className="text-gray-500 font-semibold">Admin / System</span>
                        )}
                      </span>
                    </td>

                    {/* Status Badge & Active Switch */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={c.status || (c.active ? "approved" : "pending")} />
                        {!c.active && (
                          <span className="text-[10px] font-semibold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                            Inactive
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Action Buttons */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {/* Quick Approve / Reject for Pending */}
                        {(c.status === "pending" || (!c.status && c.createdBy === "seller")) && (
                          <>
                            <button
                              onClick={() => updateStatus(c, "approved")}
                              title="Approve Category"
                              className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-bold"
                            >
                              <CheckCircle2 size={15} />
                            </button>
                            <button
                              onClick={() => updateStatus(c, "rejected")}
                              title="Reject Category"
                              className="p-1.5 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-bold"
                            >
                              <XCircle size={15} />
                            </button>
                          </>
                        )}

                        {/* Cover upload & Detail modal */}
                        <button
                          onClick={() => setViewDetailModal(c)}
                          title="Manage Cover & Details"
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        >
                          <ImageIcon size={15} />
                        </button>

                        {/* Edit */}
                        <button
                          onClick={() => openEdit(c)}
                          title="Edit Category"
                          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                        >
                          <Edit2 size={14} />
                        </button>

                        {/* Toggle Active */}
                        <button
                          onClick={() => toggleActive(c)}
                          title={c.active ? "Deactivate" : "Activate"}
                          className={`p-1.5 rounded-lg hover:bg-gray-100 ${c.active ? "text-emerald-500" : "text-gray-400"}`}
                        >
                          {c.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setConfirm({ id: c.id, name: c.name })}
                          title="Delete Category"
                          className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      {/* ── 4. Create / Edit Category Modal ─────────────────────────────── */}
      {formModal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="font-bold text-gray-900 text-sm">{formModal.id ? "Edit Category" : "New Category"}</h3>
              <button onClick={() => setFormModal(null)} className="text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-gray-600 mb-1">Category Name *</label>
                <input
                  value={formName}
                  onChange={e => setFormName(e.target.value)}
                  placeholder="e.g. Designer Sarees"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Category Type</label>
                <select
                  value={formType}
                  onChange={e => setFormType(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40 bg-white"
                >
                  <option value="system">🏢 System Category</option>
                  <option value="seller_custom">🛍️ Seller Custom Category</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Parent Category (optional)</label>
                <select
                  value={formParent}
                  onChange={e => setFormParent(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40 bg-white"
                >
                  <option value="">None (top-level)</option>
                  {parentCats
                    .filter(c => c.id !== formModal.id)
                    .map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-gray-600 mb-1">Cover Image URL (optional)</label>
                <input
                  value={formCover}
                  onChange={e => setFormCover(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="activeCheck"
                  checked={formActive}
                  onChange={e => setFormActive(e.target.checked)}
                  className="rounded text-[#0D1B36]"
                />
                <label htmlFor="activeCheck" className="font-semibold text-gray-700 cursor-pointer">
                  Active & Visible in Portal
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
              <button onClick={() => setFormModal(null)} className="px-4 py-2 text-xs rounded-xl border border-gray-200 text-gray-600">
                Cancel
              </button>
              <button onClick={saveCategory} className="px-4 py-2 text-xs rounded-xl font-semibold text-white shadow-sm" style={{ background: NAVY }}>
                {formModal.id ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Detail & Cover Upload Modal ─────────────────────────────── */}
      {viewDetailModal && (
        <CategoryDetailModal
          category={viewDetailModal}
          onClose={() => setViewDetailModal(null)}
          onRefresh={() => qc.invalidateQueries({ queryKey: ["admin-categories"] })}
          toast={toast}
        />
      )}

      {/* ── 6. Confirm Delete Dialog ───────────────────────────────────── */}
      {confirm && (
        <ConfirmDialog
          open
          title={`Delete "${confirm.name}"?`}
          body="This action is permanent and will remove the category from the database."
          onConfirm={() => deleteCat(confirm.id)}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
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
  const toast = useToastMsg();

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
        {activeTab === "all"        && <ProductsTable toast={toast} />}
        {activeTab === "pending"    && <ProductsTable statusFilter="pending"  toast={toast} />}
        {activeTab === "approved"   && <ProductsTable statusFilter="approved" toast={toast} />}
        {activeTab === "rejected"   && <ProductsTable statusFilter="rejected" toast={toast} />}
        {activeTab === "categories" && <CategoriesTab toast={toast} />}
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
