import React, { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Folder, Layers, Package, CheckCircle2, Clock, Search,
  ChevronDown, ChevronRight, Trash2, Edit2, Plus, X,
  ToggleLeft, ToggleRight, RotateCcw, RefreshCw, AlertTriangle,
  ShoppingBag, Image as ImageIcon, ChevronLeft, ArrowUpDown,
  Filter, Tag, ExternalLink, ShieldAlert, Upload, Loader2, Sparkles
} from "lucide-react";
import { adminFetch, adminAuthHeaders } from "@/lib/adminApi";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { TableRowSkeleton } from "@/components/skeletons";
import { findCategoryBySlugOrName } from "@/constants/categories";
import { getCategoryOrSubcategoryImage } from "@/constants/categoryImages";

// Helper to upload image files to Cloudflare R2 / Object Storage
async function uploadCategoryOrSubcategoryImageFile(
  file: File,
  categoryIdentifier?: string
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please select a valid image file (JPG, PNG, WebP).");
  }
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("Image size must be 10MB or less.");
  }
  const res = await fetch("/api/admin/upload/category-image", {
    method: "POST",
    headers: adminAuthHeaders({
      "Content-Type": file.type || "image/jpeg",
      "x-category-id": categoryIdentifier || "category",
    }),
    credentials: "include",
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || "Failed to upload image.");
  }
  return data.url || data.publicUrl || data.publicRelPath;
}

// Reusable Circular Image Uploader & Preview Component
interface CategoryImageUploaderFieldProps {
  label: string;
  sublabel?: string;
  currentImage: string;
  categoryIdentifier?: string;
  onChange: (url: string) => void;
  toast: ToastNotifier;
}

function CategoryImageUploaderField({
  label,
  sublabel,
  currentImage,
  categoryIdentifier,
  onChange,
  toast,
}: CategoryImageUploaderFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploadedUrl = await uploadCategoryOrSubcategoryImageFile(file, categoryIdentifier);
      onChange(uploadedUrl);
      toast.ok("Image uploaded successfully!");
    } catch (err: any) {
      toast.err(err.message || "Failed to upload image");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = () => {
    onChange("");
    toast.ok("Image removed.");
  };

  return (
    <div className="space-y-2 p-3.5 rounded-xl border border-purple-100 bg-purple-50/20">
      <div className="flex items-center justify-between">
        <div>
          <label className="block font-semibold text-gray-800 text-xs">{label}</label>
          {sublabel && <p className="text-[11px] text-gray-500">{sublabel}</p>}
        </div>
        {currentImage ? (
          <button
            type="button"
            onClick={handleRemove}
            className="text-[11px] text-red-600 hover:text-red-700 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <Trash2 size={12} /> Remove Image
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-4 pt-1">
        {/* Circular Preview Container */}
        <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-full border-2 border-purple-200 overflow-hidden bg-white shadow-xs shrink-0 flex items-center justify-center relative group">
          {currentImage ? (
            <img
              src={getProductImageSrc(currentImage)}
              alt="Category Preview"
              className="w-full h-full object-cover object-center"
              onError={replaceProductImageWithFallback}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-purple-300 bg-purple-50">
              <ImageIcon size={20} />
              <span className="text-[9px] text-gray-400 mt-0.5">No image</span>
            </div>
          )}
          {isUploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center backdrop-blur-2xs text-white">
              <Loader2 size={18} className="animate-spin text-purple-300" />
            </div>
          )}
        </div>

        {/* Action Buttons Column */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all disabled:opacity-50 cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 size={13} className="animate-spin" /> Uploading…
                </>
              ) : (
                <>
                  <Upload size={13} /> {currentImage ? "Replace Image" : "Upload Image"}
                </>
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => setShowUrlInput((prev) => !prev)}
              className="text-[11px] text-purple-700 hover:underline font-medium cursor-pointer"
            >
              {showUrlInput ? "Hide URL input" : "Or enter URL"}
            </button>
          </div>

          <p className="text-[10px] text-gray-400">
            JPG, PNG, or WebP up to 10MB. Stored in Cloudflare R2 / storage and displayed in user-side circle.
          </p>

          {showUrlInput && (
            <div className="pt-1">
              <input
                type="text"
                value={currentImage}
                onChange={(e) => onChange(e.target.value)}
                placeholder="/images/hero-paithani-1.png or https://..."
                className="w-full border border-purple-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-purple-400"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Constants & Theme ────────────────────────────────────────────────────────
const PURPLE_PRIMARY = "#6D28D9"; // Purple 700
const PURPLE_DARK = "#581C87";    // Purple 900
const PURPLE_ACCENT = "#7C3AED";  // Purple 600

export interface ProductSubcategory {
  id: string;
  name: string;
  slug: string;
  type?: string;
  group?: string | null;
  parentId?: string | null;
  parentCategory?: string | null;
  coverImage?: string | null;
  description?: string | null;
  subtypes?: string[];
  productCount?: number;
  active: boolean;
  status?: "pending" | "approved" | "rejected";
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductCategory {
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
  subcategories?: ProductSubcategory[];
  subtypesCount?: number;
  status?: "pending" | "approved" | "rejected";
  parentId?: string | null;
  parentCategory?: string | null;
  productCount?: number;
  active: boolean;
  createdAt?: string;
  updatedAt?: string;
}

interface ToastNotifier {
  ok: (msg: string) => void;
  err: (msg: string) => void;
}

interface CategoriesTabProps {
  toast: ToastNotifier;
  onNavigateProducts?: (categorySlug: string, subcategorySlug?: string) => void;
  onOpenMediaModal?: (category: ProductCategory, tab: "cover" | "subcategories" | "products" | "assign" | "status") => void;
}

export function CategoriesTab({
  toast,
  onNavigateProducts,
  onOpenMediaModal,
}: CategoriesTabProps) {
  const qc = useQueryClient();

  // Search, Filter, Sort, Pagination State
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sort, setSort] = useState<string>("displayOrder");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const pageSize = 10;

  // Accordion Expand State: exactly one main category can be expanded at a time
  const [expandedCategoryId, setExpandedCategoryId] = useState<string | null>(null);

  // Modals & Forms
  const [isCreateMainOpen, setIsCreateMainOpen] = useState(false);
  const [addSubcategoryParent, setAddSubcategoryParent] = useState<ProductCategory | null>(null);
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null);
  const [editingSubcategory, setEditingSubcategory] = useState<{
    sub: ProductSubcategory;
    parent: ProductCategory;
  } | null>(null);
  const [manageSubImage, setManageSubImage] = useState<{
    sub: ProductSubcategory;
    parent: ProductCategory;
    currentCover: string;
  } | null>(null);
  const [isUpdatingSubImage, setIsUpdatingSubImage] = useState(false);

  // Form Fields State
  const [formName, setFormName] = useState("");
  const [formOrder, setFormOrder] = useState<number>(1);
  const [formDescription, setFormDescription] = useState("");
  const [formCover, setFormCover] = useState("");
  const [formBanner, setFormBanner] = useState("");
  const [formActive, setFormActive] = useState(true);
  const [formSubtypes, setFormSubtypes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Confirm Delete Dialog State
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
    isSubcategory: boolean;
    productCount: number;
    parentCategoryName?: string;
  } | null>(null);

  // Fetch list of categories
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["admin-categories", statusFilter, typeFilter, search, sort],
    queryFn: () => {
      const p = new URLSearchParams({
        ...(search ? { search } : {}),
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...(typeFilter !== "all" ? { type: typeFilter } : {}),
        ...(sort ? { sort } : {}),
      });
      return adminFetch(`/api/admin/categories?${p}`) as Promise<{
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

  const allCategories = data?.categories ?? [];
  const stats = data?.stats;

  // By default, display ONLY the main categories in the main table
  const mainCategories = useMemo(() => {
    return allCategories.filter((c) => !c.parentId || c.type === "main");
  }, [allCategories]);

  // Overall Catalog Statistics
  const totalSubcategoriesCount = useMemo(() => {
    return mainCategories.reduce((acc, cat) => acc + (cat.subcategories?.length || cat.subcategoriesCount || 0), 0);
  }, [mainCategories]);

  const totalProductsCount = useMemo(() => {
    return mainCategories.reduce((acc, cat) => acc + (cat.productCount || 0), 0);
  }, [mainCategories]);

  const activeMainCount = useMemo(() => {
    return mainCategories.filter((c) => c.active).length;
  }, [mainCategories]);

  // Auto-expand parent category if search query matches a subcategory
  useEffect(() => {
    if (!search.trim()) return;
    const q = search.trim().toLowerCase();
    const matchingParent = mainCategories.find((c) => {
      const subMatch = (c.subcategories || []).some(
        (sub) => sub.name.toLowerCase().includes(q) || sub.slug.toLowerCase().includes(q)
      );
      return subMatch;
    });
    if (matchingParent) {
      setExpandedCategoryId(matchingParent.id);
    }
  }, [search, mainCategories]);

  // Pagination calculation
  const totalPages = Math.max(1, Math.ceil(mainCategories.length / pageSize));
  const paginatedCategories = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return mainCategories.slice(startIndex, startIndex + pageSize);
  }, [mainCategories, currentPage, pageSize]);

  // Reset all filters and collapsed state
  function handleReset() {
    setSearch("");
    setStatusFilter("all");
    setTypeFilter("all");
    setSort("displayOrder");
    setCurrentPage(1);
    setExpandedCategoryId(null);
    toast.ok("Categories view reset to default.");
  }

  // Toggle Category Expand/Collapse (Accordion)
  function handleToggleExpand(categoryId: string) {
    setExpandedCategoryId((prev) => (prev === categoryId ? null : categoryId));
  }

  // Toggle Active/Inactive Status for Main Category
  async function toggleActiveMain(c: ProductCategory) {
    try {
      await adminFetch(`/api/admin/categories/${c.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !c.active }),
      });
      toast.ok(c.active ? `"${c.name}" deactivated` : `"${c.name}" activated`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to update category status");
    }
  }

  // Toggle Active/Inactive Status for Subcategory
  async function toggleActiveSub(sub: ProductSubcategory) {
    try {
      await adminFetch(`/api/admin/categories/${sub.id}`, {
        method: "PATCH",
        body: JSON.stringify({ active: !sub.active }),
      });
      toast.ok(sub.active ? `Subcategory "${sub.name}" deactivated` : `Subcategory "${sub.name}" activated`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to update subcategory status");
    }
  }

  // Open Create Main Category Modal
  function openCreateMain() {
    setFormName("");
    setFormOrder(mainCategories.length + 1);
    setFormDescription("");
    setFormCover("");
    setFormBanner("");
    setFormActive(true);
    setIsCreateMainOpen(true);
  }

  // Open Edit Main Category Modal
  function openEditMain(c: ProductCategory) {
    setEditingCategory(c);
    setFormName(c.name);
    setFormOrder(c.displayOrder ?? 99);
    setFormDescription(c.description ?? "");
    setFormCover(c.coverImage ?? "");
    setFormBanner(c.bannerImage ?? "");
    setFormActive(c.active ?? true);
  }

  // Open Add Subcategory Modal
  function openAddSubcategory(parent: ProductCategory) {
    setAddSubcategoryParent(parent);
    setFormName("");
    setFormDescription("");
    setFormSubtypes("");
    setFormCover("");
    setFormActive(true);
  }

  // Open Edit Subcategory Modal
  function openEditSubcategory(sub: ProductSubcategory, parent: ProductCategory) {
    setEditingSubcategory({ sub, parent });
    setFormName(sub.name);
    setFormDescription(sub.description ?? "");
    setFormSubtypes(sub.subtypes ? sub.subtypes.join(", ") : "");
    setFormCover(sub.coverImage || (sub as any).image || "");
    setFormActive(sub.active ?? true);
  }

  // Save Main Category (Create or Edit)
  async function handleSaveMainCategory() {
    if (!formName.trim()) {
      toast.err("Category name is required");
      return;
    }
    setIsSubmitting(true);
    try {
      if (editingCategory) {
        await adminFetch(`/api/admin/categories/${editingCategory.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: formName.trim(),
            displayOrder: Number(formOrder) || 99,
            description: formDescription.trim(),
            coverImage: formCover.trim() || null,
            bannerImage: formBanner.trim() || null,
            active: formActive,
          }),
        });
        toast.ok(`Category "${formName.trim()}" updated successfully`);
      } else {
        await adminFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({
            name: formName.trim(),
            type: "main",
            displayOrder: Number(formOrder) || 99,
            description: formDescription.trim(),
            coverImage: formCover.trim() || null,
            bannerImage: formBanner.trim() || null,
            active: formActive,
          }),
        });
        toast.ok(`Category "${formName.trim()}" created successfully`);
      }
      setIsCreateMainOpen(false);
      setEditingCategory(null);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to save category");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Save Subcategory (Create or Edit)
  async function handleSaveSubcategory() {
    if (!formName.trim()) {
      toast.err("Subcategory name is required");
      return;
    }
    setIsSubmitting(true);
    const subtypesArray = formSubtypes
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    try {
      if (editingSubcategory) {
        await adminFetch(`/api/admin/categories/${editingSubcategory.sub.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            name: formName.trim(),
            description: formDescription.trim() || null,
            coverImage: formCover.trim() || null,
            active: formActive,
            subtypes: subtypesArray,
          }),
        });
        toast.ok(`Subcategory "${formName.trim()}" updated successfully`);
      } else if (addSubcategoryParent) {
        await adminFetch("/api/admin/categories", {
          method: "POST",
          body: JSON.stringify({
            name: formName.trim(),
            type: "subcategory",
            parentId: addSubcategoryParent.id,
            description: formDescription.trim() || null,
            coverImage: formCover.trim() || null,
            active: formActive,
          }),
        });
        toast.ok(`Subcategory "${formName.trim()}" added to ${addSubcategoryParent.name}`);
      }
      setAddSubcategoryParent(null);
      setEditingSubcategory(null);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to save subcategory");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Quick Subcategory Image Save or Remove
  async function handleQuickSubcategoryImageSave(newUrl: string | null) {
    if (!manageSubImage) return;
    const subId = manageSubImage.sub.id;
    setIsUpdatingSubImage(true);
    try {
      if (newUrl && newUrl.trim()) {
        await adminFetch(`/api/admin/categories/${subId}/cover-image`, {
          method: "POST",
          body: JSON.stringify({ coverImage: newUrl.trim() }),
        });
        toast.ok(`Image updated for subcategory "${manageSubImage.sub.name}"`);
      } else {
        await adminFetch(`/api/admin/categories/${subId}/cover-image`, {
          method: "DELETE",
        });
        toast.ok(`Image removed for subcategory "${manageSubImage.sub.name}"`);
      }
      setManageSubImage(null);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to update subcategory image");
    } finally {
      setIsUpdatingSubImage(false);
    }
  }

  // Delete Category or Subcategory
  async function handleDeleteConfirmed() {
    if (!confirmDelete) return;
    try {
      await adminFetch(`/api/admin/categories/${confirmDelete.id}`, {
        method: "DELETE",
      });
      toast.ok(`${confirmDelete.isSubcategory ? "Subcategory" : "Category"} "${confirmDelete.name}" deleted`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["admin-products-stats"] });
      qc.invalidateQueries({ queryKey: ["/api/categories"] });
    } catch (e: any) {
      toast.err(e.message || "Failed to delete category");
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* ── 1. Header Banner & Actions ───────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-purple-900 via-indigo-900 to-purple-950 p-6 rounded-2xl text-white shadow-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-purple-500/20 text-purple-200 border border-purple-400/30">
              Taxonomy & Hierarchy
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight mt-1 text-white">
            Category & Subcategory Management
          </h2>
          <p className="text-xs text-purple-200/80 mt-1 max-w-xl">
            View main categories, expand rows to inspect authoritative subcategories, and review live product counts across the VASTRAA catalog.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border border-white/15 transition-all disabled:opacity-50"
            title="Refresh Categories"
          >
            <RefreshCw size={13} className={isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
          <button
            onClick={openCreateMain}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-purple-950 bg-white hover:bg-purple-50 shadow-sm transition-all hover:scale-[1.02] active:scale-95"
          >
            <Plus size={15} /> Add Main Category
          </button>
        </div>
      </div>

      {/* ── 2. KPI Summary Cards (Purple & Clean) ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
        <div
          onClick={() => setStatusFilter("all")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "all"
              ? "bg-purple-50/70 border-purple-300 ring-2 ring-purple-500/20 shadow-xs"
              : "bg-white border-purple-100/80 hover:border-purple-200 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Main Categories</span>
            <div className="w-8 h-8 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <Folder size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{mainCategories.length}</p>
          <span className="text-[11px] text-purple-600 font-medium mt-0.5 block">Official Top-Level Categories</span>
        </div>

        <div className="p-4 rounded-2xl border bg-white border-purple-100/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Total Subcategories</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Layers size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalSubcategoriesCount}</p>
          <span className="text-[11px] text-indigo-600 font-medium mt-0.5 block">Nested Weave Subtypes</span>
        </div>

        <div className="p-4 rounded-2xl border bg-white border-purple-100/80 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Catalog Products</span>
            <div className="w-8 h-8 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
              <Package size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{totalProductsCount}</p>
          <span className="text-[11px] text-violet-600 font-medium mt-0.5 block">Live in Active Catalog</span>
        </div>

        <div
          onClick={() => setStatusFilter("active")}
          className={`p-4 rounded-2xl border transition-all cursor-pointer ${
            statusFilter === "active"
              ? "bg-emerald-50/70 border-emerald-300 ring-2 ring-emerald-500/20 shadow-xs"
              : "bg-white border-purple-100/80 hover:border-purple-200 shadow-2xs"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500">Active Categories</span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 size={16} />
            </div>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{activeMainCount}</p>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">Visible to Customers</span>
        </div>
      </div>

      {/* ── 3. Toolbar (Search, Filter, Sort, Reset) ─────────────────────── */}
      <div className="flex flex-wrap gap-3 items-center justify-between bg-white p-3.5 rounded-2xl border border-purple-100/90 shadow-2xs">
        <div className="flex flex-wrap gap-2.5 items-center flex-1 min-w-[300px]">
          {/* Real-time Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-purple-400" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Search category or subcategory..."
              className="w-full pl-9 pr-8 py-2 text-xs border border-purple-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-400/40 bg-purple-50/20 transition-all placeholder:text-gray-400"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-0.5"
                title="Clear Search"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1);
            }}
            className="text-xs border border-purple-200/80 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400/40 bg-white text-gray-700 font-medium cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Storefront</option>
            <option value="inactive">Inactive Storefront</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
          </select>

          {/* Sort Dropdown */}
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="text-xs border border-purple-200/80 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400/40 bg-white text-gray-700 font-medium cursor-pointer"
          >
            <option value="displayOrder">Display Order (1–12)</option>
            <option value="productCount">Most Products</option>
            <option value="name">Name (A–Z)</option>
            <option value="newest">Newest First</option>
          </select>

          {/* Reset Filters */}
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 text-xs font-semibold transition-colors"
            title="Reset Filters"
          >
            <RotateCcw size={13} />
            Reset
          </button>
        </div>

        {/* Total Count Badge */}
        <div className="text-xs text-gray-500 font-medium">
          Showing <span className="font-bold text-purple-900">{mainCategories.length}</span> main categories
        </div>
      </div>

      {/* ── 4. Main Category Table with Expandable Subcategories ──────────── */}
      <div className="bg-white rounded-2xl border border-purple-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs" aria-label="Category Management Table">
            <thead>
              <tr className="border-b border-purple-100 bg-purple-50/50 text-gray-600 uppercase tracking-wider font-bold text-[11px]">
                <th className="px-5 py-3.5 text-left w-2/5">Category</th>
                <th className="px-4 py-3.5 text-center">Total Products</th>
                <th className="px-4 py-3.5 text-center">Total Subcategories</th>
                <th className="px-4 py-3.5 text-center">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isFetching && !mainCategories.length ? (
                <TableRowSkeleton columns={5} rows={6} />
              ) : mainCategories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-16 text-center">
                    <Folder size={40} className="mx-auto mb-3 text-purple-200" />
                    <p className="text-gray-800 font-bold text-sm">No categories matching criteria</p>
                    <p className="text-gray-400 text-xs mt-1">
                      Try clearing search filters or click "+ Add Main Category" to create one.
                    </p>
                  </td>
                </tr>
              ) : (
                paginatedCategories.map((c) => {
                  const isExpanded = expandedCategoryId === c.id;
                  const subcategories = c.subcategories || [];
                  const subCount = subcategories.length || c.subcategoriesCount || 0;

                  return (
                    <React.Fragment key={c.id}>
                      {/* ── Main Category Row ────────────────────────────── */}
                      <tr
                        className={`transition-colors group ${
                          isExpanded
                            ? "bg-purple-50/50 border-l-4 border-l-purple-600 font-medium"
                            : "hover:bg-purple-50/20"
                        }`}
                      >
                        {/* Column 1: Category Thumbnail, Name, and Dropdown Arrow */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-3">
                            {/* Expand / Collapse Chevron Button */}
                            <button
                              onClick={() => handleToggleExpand(c.id)}
                              aria-expanded={isExpanded}
                              aria-controls={`subcat-panel-${c.id}`}
                              aria-label={`Toggle subcategories for ${c.name}`}
                              className={`p-1.5 rounded-lg border transition-all ${
                                isExpanded
                                  ? "bg-purple-600 text-white border-purple-600 shadow-2xs rotate-0"
                                  : "bg-purple-50 text-purple-700 border-purple-200/80 hover:bg-purple-100"
                              }`}
                            >
                              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>

                            {/* Thumbnail Image */}
                            <div
                              onClick={() => onOpenMediaModal?.(c, "cover")}
                              className="w-10 h-10 rounded-xl bg-gray-100 border border-purple-100 overflow-hidden cursor-pointer relative shrink-0 shadow-2xs group/img"
                              title="Click to manage images"
                            >
                              {c.coverImage ? (
                                <img
                                  src={getProductImageSrc(c.coverImage)}
                                  alt={c.name}
                                  className="w-full h-full object-cover group-hover/img:scale-105 transition-transform"
                                  onError={replaceProductImageWithFallback}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-purple-300 bg-purple-50">
                                  <ImageIcon size={16} />
                                </div>
                              )}
                            </div>

                            {/* Name and Slug */}
                            <div className="cursor-pointer" onClick={() => handleToggleExpand(c.id)}>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-gray-900 text-sm group-hover:text-purple-900 transition-colors">
                                  {c.name}
                                </span>
                                {c.displayOrder !== undefined && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-100/80 text-purple-800">
                                    #{c.displayOrder}
                                  </span>
                                )}
                              </div>
                              <code className="text-[10px] text-gray-400 font-mono">
                                /{c.slug}
                              </code>
                            </div>
                          </div>
                        </td>

                        {/* Column 2: Total Products (Clickable badge) */}
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => onNavigateProducts?.(c.slug)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-50 text-purple-700 border border-purple-200/90 hover:bg-purple-100 transition-colors shadow-2xs"
                            title={`Click to view all products in ${c.name}`}
                          >
                            <Package size={12} className="text-purple-600" />
                            <span>{c.productCount ?? 0} Products</span>
                          </button>
                        </td>

                        {/* Column 3: Total Subcategories */}
                        <td className="px-4 py-3.5 text-center">
                          <button
                            onClick={() => handleToggleExpand(c.id)}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 hover:bg-indigo-100 transition-colors"
                            title="Click to expand subcategories"
                          >
                            <Layers size={12} className="text-indigo-600" />
                            <span>{subCount} Subcategories</span>
                          </button>
                        </td>

                        {/* Column 4: Status (Active / Inactive toggle) */}
                        <td className="px-4 py-3.5 text-center">
                          <div className="inline-flex items-center gap-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                c.active
                                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                  : "bg-gray-100 text-gray-600 border border-gray-200"
                              }`}
                            >
                              {c.active ? "Active" : "Inactive"}
                            </span>
                            <button
                              onClick={() => toggleActiveMain(c)}
                              title={c.active ? "Deactivate (Hide from Storefront)" : "Activate (Show on Storefront)"}
                              className={`p-1 rounded-lg hover:bg-gray-100 transition-colors ${
                                c.active ? "text-emerald-600" : "text-gray-400"
                              }`}
                            >
                              {c.active ? <ToggleRight size={18} /> : <ToggleLeft size={18} />}
                            </button>
                          </div>
                        </td>

                        {/* Column 5: Actions */}
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Manage Subcategories shortcut */}
                            <button
                              onClick={() => handleToggleExpand(c.id)}
                              title="Manage Subcategories"
                              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200/70 flex items-center gap-1 transition-colors"
                            >
                              <Layers size={13} />
                              <span className="hidden sm:inline">Manage</span>
                            </button>

                            {/* Edit Main Category */}
                            <button
                              onClick={() => openEditMain(c)}
                              title="Edit Category Details"
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                            >
                              <Edit2 size={14} />
                            </button>

                            {/* Media & Banners */}
                            <button
                              onClick={() => onOpenMediaModal?.(c, "cover")}
                              title="Manage Images & Banner"
                              className="p-1.5 rounded-lg text-gray-500 hover:bg-purple-50 hover:text-purple-700 transition-colors"
                            >
                              <ImageIcon size={14} />
                            </button>

                            {/* Delete Main Category */}
                            <button
                              onClick={() =>
                                setConfirmDelete({
                                  id: c.id,
                                  name: c.name,
                                  isSubcategory: false,
                                  productCount: c.productCount ?? 0,
                                })
                              }
                              title="Delete Category"
                              className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* ── Expanded Subcategories Dropdown Section ────────── */}
                      {isExpanded && (
                        <tr id={`subcat-panel-${c.id}`} className="bg-purple-50/40">
                          <td colSpan={5} className="p-0">
                            <div className="p-4 sm:p-5 border-l-4 border-l-purple-600 border-b border-purple-200/60 animate-in fade-in slide-in-from-top-2 duration-200">
                              <div className="bg-white rounded-xl border border-purple-100 p-4 shadow-2xs space-y-3">
                                {/* Subcategory Section Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-purple-100 gap-2">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center font-bold">
                                      <Layers size={14} />
                                    </div>
                                    <div>
                                      <h3 className="font-bold text-gray-900 text-xs">
                                        Subcategories of <span className="text-purple-700">{c.name}</span>
                                      </h3>
                                      <p className="text-[11px] text-gray-500">
                                        Showing {subcategories.length} subcategories with live product assignments.
                                      </p>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => openAddSubcategory(c)}
                                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-700 text-white hover:bg-purple-800 transition-all shadow-2xs"
                                    >
                                      <Plus size={13} /> Add Subcategory
                                    </button>
                                  </div>
                                </div>

                                {/* Subcategories List Table */}
                                {subcategories.length === 0 ? (
                                  <div className="py-8 text-center text-gray-400 text-xs">
                                    <Layers size={28} className="mx-auto mb-2 text-purple-200" />
                                    <p className="font-semibold text-gray-700">No subcategories registered under this category yet.</p>
                                    <p className="text-gray-400 text-[11px] mt-0.5">Click "+ Add Subcategory" above to register one.</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider font-semibold text-[10px]">
                                          <th className="py-2 px-3 text-left w-12">Image</th>
                                          <th className="py-2 px-3 text-left">Subcategory</th>
                                          <th className="py-2 px-3 text-left">Subtypes</th>
                                          <th className="py-2 px-3 text-center">Products</th>
                                          <th className="py-2 px-3 text-center">Status</th>
                                          <th className="py-2 px-3 text-right">Actions</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-50">
                                        {subcategories.map((sub, sIdx) => (
                                          <tr key={sub.id || sIdx} className="hover:bg-purple-50/30 transition-colors">
                                            {/* Subcategory Image Thumbnail (Clickable to manage) */}
                                            <td className="py-2.5 px-3">
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  setManageSubImage({
                                                    sub,
                                                    parent: c,
                                                    currentCover: sub.coverImage || (sub as any).image || "",
                                                  })
                                                }
                                                className="w-9 h-9 rounded-full border border-purple-200 overflow-hidden bg-purple-50 flex items-center justify-center hover:ring-2 hover:ring-purple-400 transition-all cursor-pointer shadow-2xs group relative"
                                                title={`Manage image for ${sub.name}`}
                                              >
                                                {sub.coverImage || (sub as any).image ? (
                                                  <img
                                                    src={getProductImageSrc(sub.coverImage || (sub as any).image)}
                                                    alt={sub.name}
                                                    className="w-full h-full object-cover object-center"
                                                    onError={replaceProductImageWithFallback}
                                                  />
                                                ) : (
                                                  <ImageIcon size={14} className="text-purple-300 group-hover:text-purple-600 transition-colors" />
                                                )}
                                              </button>
                                            </td>

                                            {/* Subcategory Name & Slug */}
                                            <td className="py-2.5 px-3">
                                              <div className="flex items-center gap-2">
                                                <span className="w-5 h-5 rounded-full bg-purple-100 text-purple-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                                  {sIdx + 1}
                                                </span>
                                                <div>
                                                  <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-semibold text-gray-800 text-xs">
                                                      {sub.name}
                                                    </span>
                                                    {(sub as any).group && (
                                                      <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                                                        {(sub as any).group}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <code className="text-[10px] text-gray-400 font-mono">
                                                    {sub.slug}
                                                  </code>
                                                </div>
                                              </div>
                                            </td>

                                            {/* Subtypes Tags */}
                                            <td className="py-2.5 px-3 max-w-xs">
                                              {sub.subtypes && sub.subtypes.length > 0 ? (
                                                <div className="flex flex-wrap gap-1">
                                                  {sub.subtypes.slice(0, 4).map((st, stIdx) => (
                                                    <span
                                                      key={stIdx}
                                                      className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 border border-purple-100 font-medium"
                                                    >
                                                      {st}
                                                    </span>
                                                  ))}
                                                  {sub.subtypes.length > 4 && (
                                                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-gray-100 text-gray-600 font-medium">
                                                      +{sub.subtypes.length - 4} more
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <span className="text-gray-400 text-[11px] italic">—</span>
                                              )}
                                            </td>

                                            {/* Subcategory Product Count (Clickable) */}
                                            <td className="py-2.5 px-3 text-center">
                                              <button
                                                onClick={() => onNavigateProducts?.(c.slug, sub.slug)}
                                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 hover:bg-purple-100 transition-colors"
                                                title={`Click to filter products by ${c.name} > ${sub.name}`}
                                              >
                                                <Package size={11} className="text-purple-600" />
                                                <span>{sub.productCount ?? 0} Products</span>
                                              </button>
                                            </td>

                                            {/* Subcategory Status Toggle */}
                                            <td className="py-2.5 px-3 text-center">
                                              <div className="inline-flex items-center gap-1.5">
                                                <span
                                                  className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                                    sub.active
                                                      ? "bg-emerald-50 text-emerald-700"
                                                      : "bg-gray-100 text-gray-500"
                                                  }`}
                                                >
                                                  {sub.active ? "Active" : "Inactive"}
                                                </span>
                                                <button
                                                  onClick={() => toggleActiveSub(sub)}
                                                  className={`p-0.5 rounded hover:bg-gray-100 ${
                                                    sub.active ? "text-emerald-600" : "text-gray-400"
                                                  }`}
                                                  title={sub.active ? "Deactivate" : "Activate"}
                                                >
                                                  {sub.active ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                                                </button>
                                              </div>
                                            </td>

                                            {/* Subcategory Actions */}
                                            <td className="py-2.5 px-3 text-right">
                                              <div className="flex items-center justify-end gap-1">
                                                {/* Manage Subcategory Image */}
                                                <button
                                                  onClick={() =>
                                                    setManageSubImage({
                                                      sub,
                                                      parent: c,
                                                      currentCover: sub.coverImage || (sub as any).image || "",
                                                    })
                                                  }
                                                  title="Upload or Change Image"
                                                  className="p-1 rounded text-gray-400 hover:text-purple-700 hover:bg-purple-50"
                                                >
                                                  <ImageIcon size={13} />
                                                </button>

                                                {/* Edit Subcategory */}
                                                <button
                                                  onClick={() => openEditSubcategory(sub, c)}
                                                  title="Edit Subcategory"
                                                  className="p-1 rounded text-gray-400 hover:text-purple-700 hover:bg-purple-50"
                                                >
                                                  <Edit2 size={13} />
                                                </button>

                                                {/* View Filtered Products */}
                                                <button
                                                  onClick={() => onNavigateProducts?.(c.slug, sub.slug)}
                                                  title="View Products in Catalog"
                                                  className="p-1 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50"
                                                >
                                                  <ExternalLink size={13} />
                                                </button>

                                                {/* Delete Subcategory */}
                                                <button
                                                  onClick={() =>
                                                    setConfirmDelete({
                                                      id: sub.id,
                                                      name: sub.name,
                                                      isSubcategory: true,
                                                      productCount: sub.productCount ?? 0,
                                                      parentCategoryName: c.name,
                                                    })
                                                  }
                                                  title="Delete Subcategory"
                                                  className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50"
                                                >
                                                  <Trash2 size={13} />
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
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── 5. Pagination Bar ────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="px-5 py-3.5 border-t border-purple-100 flex items-center justify-between text-xs text-gray-600 bg-purple-50/20">
            <div>
              Showing Page <span className="font-bold text-purple-900">{currentPage}</span> of{" "}
              <span className="font-bold">{totalPages}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-gray-700 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronLeft size={14} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
                <button
                  key={pNum}
                  onClick={() => setCurrentPage(pNum)}
                  className={`px-3 py-1 rounded-lg font-semibold transition-all ${
                    currentPage === pNum
                      ? "bg-purple-700 text-white shadow-2xs"
                      : "border border-purple-100 hover:bg-purple-50 text-gray-700"
                  }`}
                >
                  {pNum}
                </button>
              ))}
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                className="px-2.5 py-1.5 rounded-lg border border-purple-200 text-gray-700 hover:bg-white disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── 6. Create / Edit Main Category Modal ─────────────────────────── */}
      {(isCreateMainOpen || editingCategory) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => {
            setIsCreateMainOpen(false);
            setEditingCategory(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 border border-purple-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  {editingCategory ? `Edit Category: ${editingCategory.name}` : "New Main Category"}
                </h3>
                <p className="text-xs text-gray-500">Configure top-level weave category details.</p>
              </div>
              <button
                onClick={() => {
                  setIsCreateMainOpen(false);
                  setEditingCategory(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-gray-700 mb-1">Category Name *</label>
                  <input
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Paithani Sarees"
                    className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-gray-700 mb-1">Display Order</label>
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={formOrder}
                    onChange={(e) => setFormOrder(parseInt(e.target.value) || 1)}
                    className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Royal heritage weave description for customer storefront..."
                  className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
              </div>

              <CategoryImageUploaderField
                label="Category Cover Image"
                sublabel="Displayed in user-side category circle on homepage and listing filters"
                currentImage={formCover}
                categoryIdentifier={editingCategory?.slug || formName || "main-category"}
                onChange={setFormCover}
                toast={toast}
              />

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Banner Image URL (Optional)</label>
                <input
                  value={formBanner}
                  onChange={(e) => setFormBanner(e.target.value)}
                  placeholder="/images/hero-paithani-banner.png"
                  className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-purple-100">
                <input
                  type="checkbox"
                  id="mainActiveCheck"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded text-purple-700 focus:ring-purple-500"
                />
                <label htmlFor="mainActiveCheck" className="font-semibold text-gray-700 cursor-pointer">
                  Active & Visible in Storefront Navigation
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-purple-100">
              <button
                onClick={() => {
                  setIsCreateMainOpen(false);
                  setEditingCategory(null);
                }}
                className="px-4 py-2 text-xs rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveMainCategory}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs rounded-xl font-semibold text-white bg-purple-700 hover:bg-purple-800 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : editingCategory ? "Save Changes" : "Create Category"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 7. Create / Edit Subcategory Modal ────────────────────────────── */}
      {(addSubcategoryParent || editingSubcategory) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => {
            setAddSubcategoryParent(null);
            setEditingSubcategory(null);
          }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 border border-purple-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  {editingSubcategory
                    ? `Edit Subcategory: ${editingSubcategory.sub.name}`
                    : `Add Subcategory to ${addSubcategoryParent?.name}`}
                </h3>
                <p className="text-xs text-gray-500">Configure child subcategory and weave subtypes.</p>
              </div>
              <button
                onClick={() => {
                  setAddSubcategoryParent(null);
                  setEditingSubcategory(null);
                }}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Subcategory Name *</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Traditional, Pure Silk, Kadiyal"
                  className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">
                  Subtypes / Varieties (comma-separated)
                </label>
                <input
                  value={formSubtypes}
                  onChange={(e) => setFormSubtypes(e.target.value)}
                  placeholder="e.g. Royal Peshwai, Muniya Border, Lagna Special"
                  className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  Separate subtype names with commas. Sellers choose these when listing products.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Description (Optional)</label>
                <textarea
                  rows={2}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Subcategory weave notes..."
                  className="w-full border border-purple-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400/50"
                />
              </div>

              <CategoryImageUploaderField
                label="Subcategory Circle Image"
                sublabel="Displayed in user-side subcategory circular navigation"
                currentImage={formCover}
                categoryIdentifier={editingSubcategory?.sub.slug || formName || "subcategory"}
                onChange={setFormCover}
                toast={toast}
              />

              <div className="flex items-center gap-2 pt-2 border-t border-purple-100">
                <input
                  type="checkbox"
                  id="subActiveCheck"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  className="rounded text-purple-700 focus:ring-purple-500"
                />
                <label htmlFor="subActiveCheck" className="font-semibold text-gray-700 cursor-pointer">
                  Active & Available for Products
                </label>
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-purple-100">
              <button
                onClick={() => {
                  setAddSubcategoryParent(null);
                  setEditingSubcategory(null);
                }}
                className="px-4 py-2 text-xs rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveSubcategory}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs rounded-xl font-semibold text-white bg-purple-700 hover:bg-purple-800 shadow-sm transition-all disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : editingSubcategory ? "Save Changes" : "Add Subcategory"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Subcategory Image Management Modal ───────────────────────── */}
      {manageSubImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setManageSubImage(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 border border-purple-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-purple-100 pb-3">
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  Subcategory Image: {manageSubImage.sub.name}
                </h3>
                <p className="text-xs text-gray-500">
                  Parent: {manageSubImage.parent.name} • Displayed in user-side circle navigation
                </p>
              </div>
              <button
                onClick={() => setManageSubImage(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <CategoryImageUploaderField
                label="Subcategory Circle Image"
                sublabel="Select an image file or enter URL. Uploads directly to Cloudflare R2 / storage."
                currentImage={manageSubImage.currentCover}
                categoryIdentifier={manageSubImage.sub.slug || manageSubImage.sub.name}
                onChange={(newUrl) =>
                  setManageSubImage((prev) => (prev ? { ...prev, currentCover: newUrl } : null))
                }
                toast={toast}
              />
            </div>

            <div className="flex gap-2 justify-end pt-3 border-t border-purple-100">
              <button
                type="button"
                onClick={() => setManageSubImage(null)}
                className="px-4 py-2 text-xs rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isUpdatingSubImage}
                onClick={() => handleQuickSubcategoryImageSave(manageSubImage.currentCover)}
                className="px-4 py-2 text-xs rounded-xl font-semibold text-white bg-purple-700 hover:bg-purple-800 shadow-sm transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
              >
                {isUpdatingSubImage ? (
                  <>
                    <Loader2 size={13} className="animate-spin" /> Saving...
                  </>
                ) : (
                  "Save Image"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 8. Confirm Delete Dialog (with Product Safety Warning) ───────── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 space-y-4 border border-red-100 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-sm">
                  Delete {confirmDelete.isSubcategory ? "Subcategory" : "Category"} "{confirmDelete.name}"?
                </h3>
                <p className="text-xs text-gray-500 mt-1">
                  This action is permanent and removes the category from the database.
                </p>
              </div>
            </div>

            {/* Product Count Safety Warning */}
            {confirmDelete.productCount > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2 text-amber-900 text-xs">
                <ShieldAlert size={16} className="shrink-0 text-amber-600 mt-0.5" />
                <div>
                  <span className="font-bold">Active Products Warning:</span> This {confirmDelete.isSubcategory ? "subcategory" : "category"} currently has{" "}
                  <strong>{confirmDelete.productCount} products</strong> assigned. Deleting it will leave products uncategorized in search.
                </div>
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
              <button
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-xs rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirmed}
                className="px-4 py-2 text-xs rounded-xl font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default CategoriesTab;

