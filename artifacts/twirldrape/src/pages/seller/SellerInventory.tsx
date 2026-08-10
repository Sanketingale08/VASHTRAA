import React, { useEffect, useState, useCallback } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, PackageX, Check, X, ClipboardList, Save } from "lucide-react";
import { useSellerContext } from "@/components/SellerGuard";
import { SellerLayout } from "./SellerDashboard";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";

interface InventoryItem {
  id: string;
  name: string;
  images: string[];
  stock: number;
  lowStockThreshold: number;
  price: number;
  active: boolean;
  isLowStock: boolean;
  isOutOfStock: boolean;
}

interface Summary {
  totalProducts: number;
  lowStockCount: number;
  outOfStockCount: number;
  stockValue: number;
  totalStock: number;
  availableStock: number;
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


export default function SellerInventory() {
  const { vendor } = useSellerContext();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "low" | "out">("all");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const showToast = useCallback((message: string, type: "success" | "error") => setToast({ message, type }), []);

  async function fetchInventory() {
    if (!vendor) return;
    setLoading(true);
    try {
      const res = await fetch(getApiUrl("/api/seller/inventory"), { credentials: "include" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items ?? []);
      setSummary(data.summary ?? null);
    } catch {
      showToast("Failed to load inventory", "error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchInventory(); }, [vendor]);

  const filtered = items.filter((i) => filter === "all" ? true : filter === "low" ? i.isLowStock : i.isOutOfStock);
  const dirtyIds = Object.keys(edits).filter((id) => edits[id] !== "" && parseInt(edits[id]) !== items.find((i) => i.id === id)?.stock);

  async function saveBulk() {
    if (dirtyIds.length === 0) return;
    setSaving(true);
    try {
      const updates = dirtyIds.map((id) => ({ productId: id, stock: parseInt(edits[id]) }));
      const res = await fetch(getApiUrl("/api/seller/inventory/bulk-stock"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ updates }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      const failed = (data.results ?? []).filter((r: any) => !r.success);
      if (failed.length > 0) {
        showToast(`${failed.length} update(s) failed`, "error");
      } else {
        showToast("Stock updated", "success");
      }
      setEdits({});
      fetchInventory();
    } catch {
      showToast("Failed to save changes", "error");
    } finally {
      setSaving(false);
    }
  }

  const skeletonRows = Array.from({ length: 5 });

  return (
    <SellerLayout title="Inventory">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>Inventory Management</h1>
            <p className="text-sm mt-0.5" style={{ color: "#7a5f4e" }}>Monitor stock levels and update quantities in bulk</p>
          </div>
          <Link href="/seller/products">
            <button className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border" style={{ borderColor: "#D6C9BA", color: MAROON }}>
              <ClipboardList size={15} /> Manage Products
            </button>
          </Link>
        </div>

        {/* Total / Available stock hero */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl p-5 flex items-center gap-4" style={{ background: MAROON }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-white/60 mb-1">Total Stock</p>
              <p className="text-3xl font-bold font-serif text-white">{summary?.totalStock ?? "—"}</p>
              <p className="text-xs text-white/50 mt-1">Units across all products</p>
            </div>
          </div>
          <div className="rounded-2xl p-5 flex items-center gap-4 border" style={{ background: "#fff", borderColor: `${GOLD}44` }}>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest mb-1" style={{ color: GOLD }}>Available Stock</p>
              <p className="text-3xl font-bold font-serif" style={{ color: MAROON }}>{summary?.availableStock ?? "—"}</p>
              <p className="text-xs text-gray-400 mt-1">Units from active (Available) products</p>
            </div>
          </div>
        </div>

        {/* Secondary summary stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: "Total Products", value: summary?.totalProducts ?? "—" },
            { label: "Low Stock", value: summary?.lowStockCount ?? "—", danger: (summary?.lowStockCount ?? 0) > 0 },
            { label: "Out of Stock", value: summary?.outOfStockCount ?? "—", danger: (summary?.outOfStockCount ?? 0) > 0 },
            { label: "Stock Value", value: summary ? `₹${summary.stockValue.toLocaleString("en-IN")}` : "—" },
          ].map((c) => (
            <div key={c.label} className="bg-white rounded-xl border p-4" style={{ borderColor: "#E2D9CC" }}>
              <p className="text-2xl font-bold" style={{ color: c.danger ? "#991b1b" : MAROON }}>{c.value}</p>
              <p className="text-xs text-gray-400 mt-0.5">{c.label}</p>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-4">
          {(["all", "low", "out"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: filter === f ? MAROON : CREAM,
                color: filter === f ? IVORY : "#5a4a3a",
              }}
            >
              {f === "all" ? "All Products" : f === "low" ? "Low Stock" : "Out of Stock"}
            </button>
          ))}
          {dirtyIds.length > 0 && (
            <button
              onClick={saveBulk}
              disabled={saving}
              className="ml-auto flex items-center gap-2 px-4 py-1.5 rounded-lg text-xs font-bold disabled:opacity-60"
              style={{ background: MAROON, color: IVORY }}
            >
              <Save size={13} /> {saving ? "Saving…" : `Save ${dirtyIds.length} change${dirtyIds.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border overflow-hidden" style={{ borderColor: "#E2D9CC" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: CREAM, borderBottom: "1px solid #E2D9CC" }}>
                  <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Product</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Threshold</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Stock</th>
                  <th className="text-center px-4 py-3 font-semibold text-xs uppercase tracking-wide" style={{ color: "#7a5f4e" }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? skeletonRows.map((_, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #F3EDE4" }}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-4">
                          <div className="h-4 rounded animate-pulse" style={{ background: "#F3EDE4", width: j === 0 ? "70%" : "50%" }} />
                        </td>
                      ))}
                    </tr>
                  ))
                  : filtered.length === 0
                    ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-16 text-center">
                          <PackageX size={36} className="mx-auto mb-3 opacity-30" />
                          <p className="text-sm text-gray-400">No products in this view.</p>
                        </td>
                      </tr>
                    )
                    : filtered.map((item) => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #F3EDE4" }} className="hover:bg-[#FAFAF8] transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0" style={{ background: CREAM }}>
                              {item.images?.[0] ? (
                                <img src={item.images[0]} alt="" className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">—</div>
                              )}
                            </div>
                            <p className="font-medium text-gray-800 truncate max-w-[220px]">{item.name}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center text-gray-500">{item.lowStockThreshold}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            min="0"
                            value={edits[item.id] ?? String(item.stock)}
                            onChange={(e) => setEdits((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-20 border rounded px-2 py-1 text-sm text-center"
                            style={{ borderColor: edits[item.id] !== undefined && edits[item.id] !== String(item.stock) ? GOLD : "#D6C9BA" }}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          {item.isOutOfStock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#FEE2E2", color: "#991B1B" }}>
                              <AlertTriangle size={11} /> Out of Stock
                            </span>
                          ) : item.isLowStock ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#FEF3C7", color: "#92400E" }}>
                              <AlertTriangle size={11} /> Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: "#DCFCE7", color: "#166534" }}>
                              In Stock
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {toast && (
          <Toast key={toast.message} message={toast.message} type={toast.type} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>
    </SellerLayout>
  );
}
