import React, { useState, useCallback, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Package, CheckCircle, XCircle, Clock, Tag, Layers, Star,
  Search, ChevronDown, ChevronUp, Trash2, Edit2, Plus, X, Eye,
  ToggleLeft, ToggleRight, GripVertical, AlertTriangle, RefreshCw,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders } from '@/lib/adminApi';
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

// ─── constants ───────────────────────────────────────────────────────────────
const NAVY = "#0D1B36";
const GOLD = "#C7CCD1";

function adminKey() {
  return typeof window !== "undefined" ? sessionStorage.getItem("td_admin_key") ?? "" : "";
}

function apiUrl(path: string) {
  return path;
}

async function apiFetch(path: string, opts: RequestInit = {}) {
  const r = await fetch(apiUrl(path), {
    ...opts,
    credentials: "include",
    headers: { "x-admin-key": adminKey(), "Content-Type": "application/json", ...(opts.headers ?? {}) },
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(body.error ?? `HTTP ${r.status}`);
  }
  return r.json();
}

// ─── types ────────────────────────────────────────────────────────────────────
interface Product {
  id: string; name: string; price: number; originalPrice?: number;
  category: string; subcategory?: string; brand?: string; fabric: string;
  color: string; occasion: string; vendorId?: string; vendorName: string;
  images: string[]; videos: string[]; active: boolean;
  isFeatured: boolean; isBestSeller: boolean; isNewArrival: boolean;
  stock: number; rating: number; reviewCount: number;
  status: "pending" | "approved" | "rejected";
  rejectionReason?: string; approvalRemark?: string;
  featuredOrder?: number; featuredUntil?: string;
  description: string;
}

interface ProductCategory {
  id: string; name: string; slug: string; parentId?: string;
  active: boolean; createdAt: string;
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
function KpiCard({ label, value, icon: Icon, iconBg, iconColor, active, onClick }: {
  label: string; value: number | string; icon: React.ElementType;
  iconBg: string; iconColor: string; active?: boolean; onClick?: () => void;
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
      <div className="text-2xl font-serif font-bold" style={{ color: NAVY }}>{value}</div>
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
                  ["Vendor", product.vendorName], ["Category", product.category],
                  ["Brand", product.brand || "—"], ["Fabric", product.fabric],
                  ["Color", product.color], ["Occasion", product.occasion],
                  ["Price", `₹${product.price.toLocaleString("en-IN")}`],
                  ["Original Price", product.originalPrice ? `₹${product.originalPrice.toLocaleString("en-IN")}` : "—"],
                  ["Stock", product.stock], ["Rating", `${product.rating} (${product.reviewCount})`],
                  ["Active", product.active ? "Yes" : "No"], ["Featured", product.isFeatured ? "Yes" : "No"],
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
              {/* video previews */}
              {(product.videos ?? []).length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-400 uppercase tracking-wide">Videos</p>
                  {product.videos.slice(0, 2).map((v, i) => (
                    <video key={i} src={v} controls className="w-full rounded-xl max-h-40 bg-black" />
                  ))}
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
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [viewProduct, setViewProduct] = useState<Product | null>(null);
  const [confirm, setConfirm] = useState<{ title: string; body: string; action: () => void } | null>(null);

  const qKey = ["admin-products", statusFilter ?? "all", search, sort, page];
  const { data, isFetching, refetch } = useQuery({
    queryKey: qKey,
    queryFn: () => {
      const p = new URLSearchParams({
        sort, page: String(page), limit: "20",
        ...(search ? { search } : {}),
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
        {isFetching && !products.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : products.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">No products found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
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
                {products.map(p => (
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
                          <p className="text-xs text-gray-400 capitalize">{p.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-gray-600">{p.vendorName || "—"}</span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-800">
                      ₹{p.price.toLocaleString("en-IN")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={p.status} />
                        {!p.active && <StatusBadge status="inactive" />}
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
        )}
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

// ─── categories tab ───────────────────────────────────────────────────────────
function CategoriesTab({ toast }: { toast: ReturnType<typeof useToastMsg> }) {
  const qc = useQueryClient();
  const [modal, setModal] = useState<Partial<ProductCategory> | null>(null);
  const [formName, setFormName] = useState("");
  const [formParent, setFormParent] = useState("");
  const [confirm, setConfirm] = useState<{ id: string; name: string } | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => apiFetch("/api/admin/categories") as Promise<{ categories: ProductCategory[] }>,
    staleTime: 30000,
  });
  const cats = data?.categories ?? [];

  function openCreate() { setModal({}); setFormName(""); setFormParent(""); }
  function openEdit(c: ProductCategory) { setModal(c); setFormName(c.name); setFormParent(c.parentId ?? ""); }

  async function save() {
    if (!formName.trim()) { toast.err("Name is required"); return; }
    try {
      if (modal?.id) {
        await apiFetch(`/api/admin/categories/${modal.id}`, {
          method: "PATCH", body: JSON.stringify({ name: formName.trim(), parentId: formParent || null }),
        });
        toast.ok("Category updated");
      } else {
        await apiFetch("/api/admin/categories", {
          method: "POST", body: JSON.stringify({ name: formName.trim(), parentId: formParent || null }),
        });
        toast.ok("Category created");
      }
      setModal(null);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    } catch (e: any) { toast.err(e.message); }
  }

  async function toggleActive(c: ProductCategory) {
    try {
      await apiFetch(`/api/admin/categories/${c.id}`, {
        method: "PATCH", body: JSON.stringify({ active: !c.active }),
      });
      toast.ok(c.active ? "Category deactivated" : "Category activated");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    } catch (e: any) { toast.err(e.message); }
  }

  async function deleteCat(id: string) {
    try {
      await apiFetch(`/api/admin/categories/${id}`, { method: "DELETE" });
      toast.ok("Category deleted");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
    } catch (e: any) { toast.err(e.message); }
    setConfirm(null);
  }

  const parentCats = cats.filter(c => !c.parentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{cats.length} categories · changes sync to seller and customer portal</p>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: NAVY }}>
          <Plus size={14} /> Add Category
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {isFetching && !cats.length ? (
          <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
        ) : cats.length === 0 ? (
          <div className="p-12 text-center">
            <Layers size={32} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 text-sm">No categories yet. Add your first one.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Name</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Slug</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide hidden md:table-cell">Parent</th>
                <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 text-right text-xs font-bold text-gray-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {cats.map(c => (
                <tr key={c.id} className="hover:bg-gray-50/60">
                  <td className="px-4 py-3 font-semibold text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden md:table-cell">{c.slug}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell">
                    {c.parentId ? cats.find(x => x.id === c.parentId)?.name ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => toggleActive(c)}
                        className={`p-1.5 rounded-lg hover:bg-gray-100 ${c.active ? "text-emerald-500" : "text-gray-400"}`}>
                        {c.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                      </button>
                      <button onClick={() => setConfirm({ id: c.id, name: c.name })}
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

      {/* create/edit modal */}
      {modal !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
            <h3 className="font-bold text-gray-900">{modal.id ? "Edit Category" : "New Category"}</h3>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Name</label>
              <input value={formName} onChange={e => setFormName(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Parent Category (optional)</label>
              <select value={formParent} onChange={e => setFormParent(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#C7CCD1]/40">
                <option value="">None (top-level)</option>
                {parentCats.filter(c => c.id !== modal.id).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
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
          body="This will permanently remove the category."
          onConfirm={() => deleteCat(confirm.id)} onCancel={() => setConfirm(null)} />
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
        <div className="p-8 text-center text-gray-400 text-sm">Loading…</div>
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
                <p className="text-xs text-gray-400">{p.vendorName} · ₹{p.price.toLocaleString("en-IN")}</p>
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

  const { data: stats } = useQuery({
    queryKey: ["admin-products-stats"],
    queryFn: () => apiFetch("/api/admin/products/stats") as Promise<Stats>,
    staleTime: 60000,
    refetchInterval: 120000,
  });

  const kpis = [
    { key: "all",        label: "Total Products",    value: stats?.total ?? "—",            icon: Package,       iconBg: "rgba(13,27,54,0.08)", iconColor: NAVY },
    { key: "pending",    label: "Pending Approvals", value: stats?.pending ?? "—",          icon: Clock,         iconBg: "rgba(245,158,11,0.1)", iconColor: "#D97706" },
    { key: "approved",   label: "Approved",          value: stats?.approved ?? "—",         icon: CheckCircle,   iconBg: "rgba(16,185,129,0.1)", iconColor: "#10B981" },
    { key: "rejected",   label: "Rejected",          value: stats?.rejected ?? "—",         icon: XCircle,       iconBg: "rgba(239,68,68,0.1)",  iconColor: "#EF4444" },
    { key: "categories", label: "Active Categories", value: stats?.activeCategories ?? "—", icon: Layers,        iconBg: "rgba(59,130,246,0.1)", iconColor: "#3B82F6" },
    { key: "brands",     label: "Active Brands",     value: stats?.activeBrands ?? "—",     icon: Tag,           iconBg: "rgba(139,92,246,0.1)", iconColor: "#8B5CF6" },
    { key: "featured",   label: "Featured Products", value: stats?.featured ?? "—",         icon: Star,          iconBg: "rgba(199,204,209,0.12)", iconColor: GOLD },
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
      <div>
        <h1 className="text-xl font-serif font-bold" style={{ color: NAVY }}>Products</h1>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
        {kpis.map(k => (
          <KpiCard key={k.key} label={k.label} value={k.value}
            icon={k.icon} iconBg={k.iconBg} iconColor={k.iconColor}
            active={activeTab === k.key}
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
