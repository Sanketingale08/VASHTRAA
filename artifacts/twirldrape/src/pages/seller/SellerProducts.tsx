import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Pencil, Trash2, AlertTriangle, PackageX, ToggleLeft, ToggleRight, Check, X } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";

interface Product {
  id: string;
  name: string;
  category: string;
  fabric: string;
  color: string;
  price: number;
  originalPrice: number | null;
  stock: number;
  images: string[];
  isBestSeller: boolean;
  isNewArrival: boolean;
  rating: number;
  reviewCount: number;
  active: boolean;
}

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

function DeleteModal({ product, onConfirm, onCancel, loading }: {
  product: Product; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.45)" }}>
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-7"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <AlertTriangle size={20} className="text-red-600" />
          </div>
          <h3 className="font-serif text-lg font-bold" style={{ color: MAROON }}>Deactivate Product?</h3>
        </div>
        <p className="text-sm text-gray-600 mb-6 leading-relaxed">
          "<strong>{product.name}</strong>" will be hidden from the shop immediately. You can reactivate it later from this panel.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-lg border text-sm font-medium"
            style={{ borderColor: "#E2D9CC", color: "#6b5b4e" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="flex-1 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-60"
            style={{ background: "#991b1b" }}
          >
            {loading ? "Deactivating…" : "Deactivate"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function StockCell({ product, onUpdate }: { product: Product; onUpdate: (id: string, stock: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(product.stock));
  const [saving, setSaving] = useState(false);

  async function save() {
    const num = parseInt(value);
    if (isNaN(num) || num < 0 || num === product.stock) {
      setValue(String(product.stock));
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(getApiUrl(`/api/products/${product.id}/stock`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stock: num }),
      });
      if (res.ok) {
        onUpdate(product.id, num);
      }
    } finally {
      setSaving(false);
      setEditing(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setValue(String(product.stock)); setEditing(false); } }}
          className="w-16 border rounded px-2 py-1 text-sm text-center"
          style={{ borderColor: GOLD }}
          autoFocus
        />
      </div>
    );
  }

  return (
    <button
      onClick={() => { setValue(String(product.stock)); setEditing(true); }}
      className="text-sm font-medium hover:underline text-left min-w-[3rem]"
      style={{ color: product.stock === 0 ? "#dc2626" : "#374151" }}
      title="Click to edit stock"
    >
      {saving ? "…" : product.stock === 0 ? "0 (out)" : product.stock}
    </button>
  );
}

export default function SellerProducts() {
  const { vendor } = useSellerContext();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Product | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error") => {
    setToast({ message, type });
  }, []);

  async function fetchProducts() {
    if (!vendor) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch(getApiUrl("/api/seller/products"), { credentials: "include" });
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

  function updateStock(id: string, stock: number) {
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, stock } : p));
    showToast("Stock updated", "success");
  }

  async function handleToggleActive(product: Product) {
    try {
      const res = await fetch(getApiUrl(`/api/products/${product.id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ active: !product.active }),
      });
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.map((p) => p.id === product.id ? { ...p, active: !p.active } : p));
      showToast(product.active ? "Product hidden from shop" : "Product is now live", "success");
    } catch {
      showToast("Failed to update status", "error");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      const res = await fetch(getApiUrl(`/api/products/${deleteTarget.id}`), {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setProducts((prev) => prev.map((p) => p.id === deleteTarget.id ? { ...p, active: false } : p));
      showToast("Product deactivated", "success");
    } catch {
      showToast("Failed to deactivate product", "error");
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  }

  const skeletonRows = Array.from({ length: 5 });

  return (
    <SellerLayout title="My Products">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>My Products</h1>
            <p className="text-sm mt-0.5" style={{ color: "#7a5f4e" }}>
              {loading ? "Loading…" : `${products.length} product${products.length !== 1 ? "s" : ""}`}
            </p>
          </div>
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

        {error && (
          <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm">{error}</div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: "#E2D9CC" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: CREAM, borderBottom: "1px solid #E2D9CC" }}>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Product</th>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Category</th>
                  <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Price</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Stock</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Status</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? skeletonRows.map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F3EDE4" }}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 rounded animate-pulse" style={{ background: "#F3EDE4", width: j === 0 ? "70%" : "50%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                  : products.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-16 text-center">
                          <PackageX size={36} className="mx-auto mb-3 opacity-30" />
                          <p className="text-sm text-gray-400">No products yet.</p>
                          <Link href="/seller/products/new">
                            <button className="mt-3 text-xs font-semibold underline" style={{ color: MAROON }}>Add your first product</button>
                          </Link>
                        </td>
                      </tr>
                    )
                    : products.map((product) => (
                      <motion.tr
                        key={product.id}
                        layout
                        style={{ borderBottom: "1px solid #F3EDE4", opacity: product.active ? 1 : 0.55 }}
                        className="hover:bg-[#FAFAF8] transition-colors"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: CREAM }}>
                              {product.images?.[0] ? (
                                <img src={product.images[0]} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">—</div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <p className="font-medium text-gray-800 truncate max-w-[200px]">{product.name}</p>
                              <p className="text-xs text-gray-400">{product.fabric} · {product.color}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium capitalize" style={{ background: product.category === "paithani" ? "#FEF3C7" : "#EDE9FE", color: product.category === "paithani" ? "#92400E" : "#5B21B6" }}>
                            {product.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold" style={{ color: MAROON }}>₹{product.price.toLocaleString("en-IN")}</span>
                          {product.originalPrice && (
                            <span className="block text-xs text-gray-400 line-through">₹{product.originalPrice.toLocaleString("en-IN")}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <StockCell product={product} onUpdate={updateStock} />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleToggleActive(product)}
                            title={product.active ? "Click to hide from shop" : "Click to make live"}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all hover:opacity-80"
                            style={{
                              background: product.active ? "#DCFCE7" : "#F3F4F6",
                              color: product.active ? "#166534" : "#6B7280",
                            }}
                          >
                            {product.active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                            {product.active ? "Active" : "Hidden"}
                          </button>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-2">
                            <Link href={`/seller/products/${product.id}/edit`}>
                              <button
                                className="p-1.5 rounded-lg hover:bg-[#E6F0EA] transition-colors"
                                title="Edit"
                              >
                                <Pencil size={14} style={{ color: MAROON }} />
                              </button>
                            </Link>
                            <button
                              onClick={() => setDeleteTarget(product)}
                              className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                              title="Deactivate"
                            >
                              <Trash2 size={14} className="text-red-500" />
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
      </div>

      <AnimatePresence>
        {deleteTarget && (
          <DeleteModal
            product={deleteTarget}
            onConfirm={handleDelete}
            onCancel={() => setDeleteTarget(null)}
            loading={deleteLoading}
          />
        )}
        {toast && (
          <Toast key={toast.message} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </SellerLayout>
  );
}
