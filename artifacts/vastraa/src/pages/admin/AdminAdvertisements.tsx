import React, { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, X, Pencil, Trash2, Loader2, Image as ImageIcon, Eye,
  ExternalLink, Calendar, CheckCircle2, Clock, AlertTriangle,
  ArrowUpDown, RefreshCw, Upload, Monitor, Tablet, Smartphone,
} from "lucide-react";
import AdminLayout, { AdminGuard } from "./AdminLayout";
import { adminHeaders, adminAuthHeaders, adminKey, adminSessionToken } from "@/lib/adminApi";
import { getApiUrl } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AdvertisementCarousel,
  getAdvertisementImageSrc,
  type AdvertisementItem,
} from "@/components/AdvertisementCarousel";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export interface AdminAdvertisement extends AdvertisementItem {
  id: string;
  title?: string;
  description?: string | null;
  imageUrl: string;
  imageSource?: "upload" | "url";
  objectKey?: string | null;
  linkUrl?: string | null;
  displayOrder: number;
  isActive: boolean;
  startDate?: string | null;
  endDate?: string | null;
  status?: "active" | "scheduled" | "expired" | "inactive";
  createdAt?: string;
  updatedAt?: string;
}

interface FormState {
  title: string;
  description: string;
  uploadedImageUrl: string;
  uploadedObjectKey: string;
  externalImageUrl: string;
  linkUrl: string;
  displayOrder: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

const emptyForm: FormState = {
  title: "",
  description: "",
  uploadedImageUrl: "",
  uploadedObjectKey: "",
  externalImageUrl: "",
  linkUrl: "",
  displayOrder: 1,
  isActive: true,
  startDate: "",
  endDate: "",
};

function toDateTimeInputValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 16);
}

/**
 * Validates that an external image URL can actually load in the browser.
 */
function verifyImageLoads(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(url);
      if (!/^https?:/i.test(parsed.protocol)) {
        return resolve(false);
      }
    } catch {
      return resolve(false);
    }
    const img = new Image();
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(false);
      }
    }, 7000);
    img.onload = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(true);
      }
    };
    img.onerror = () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(false);
      }
    };
    img.src = url;
  });
}

export default function AdminAdvertisements() {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [previewModalAd, setPreviewModalAd] = useState<AdminAdvertisement | null>(null);
  const [previewViewport, setPreviewViewport] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [editingAd, setEditingAd] = useState<AdminAdvertisement | null>(null);
  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [validatingUrl, setValidatingUrl] = useState(false);
  const [uploadSuccessMessage, setUploadSuccessMessage] = useState("");
  const [formError, setFormError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch all advertisements
  const {
    data: advertisements = [],
    isLoading,
    isRefetching,
    refetch,
    error,
  } = useQuery<AdminAdvertisement[]>({
    queryKey: ["admin-advertisements"],
    queryFn: async () => {
      const res = await fetch(getApiUrl("/api/admin/advertisements"), {
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error("Failed to fetch advertisements");
      return res.json();
    },
  });

  // Calculate summary counts
  const totalCount = advertisements.length;
  const activeCount = advertisements.filter((a) => a.status === "active").length;
  const scheduledCount = advertisements.filter((a) => a.status === "scheduled").length;
  const expiredCount = advertisements.filter((a) => a.status === "expired").length;

  function openCreateModal() {
    setEditingAd(null);
    setFormData({
      ...emptyForm,
      displayOrder: advertisements.length + 1,
    });
    setSelectedFile(null);
    setUploadSuccessMessage("");
    setFormError("");
    setModalOpen(true);
  }

  function openEditModal(ad: AdminAdvertisement) {
    setEditingAd(ad);
    const isUpload =
      (ad as any).imageSource === "upload" ||
      Boolean((ad as any).objectKey) ||
      (!ad.imageUrl?.startsWith("http://") && !ad.imageUrl?.startsWith("https://"));

    setFormData({
      title: ad.title || "",
      description: ad.description || "",
      uploadedImageUrl: isUpload ? ad.imageUrl || "" : "",
      uploadedObjectKey: (ad as any).objectKey || "",
      externalImageUrl: !isUpload ? ad.imageUrl || "" : "",
      linkUrl: ad.linkUrl || "",
      displayOrder: ad.displayOrder ?? 1,
      isActive: ad.isActive ?? true,
      startDate: toDateTimeInputValue(ad.startDate),
      endDate: toDateTimeInputValue(ad.endDate),
    });
    setSelectedFile(null);
    setUploadSuccessMessage("");
    setFormError("");
    setModalOpen(true);
  }

  // Handle image file selection
  function handleFileSelect(file: File) {
    if (!file) return;

    const isImage = (file.type && file.type.startsWith("image/")) || /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);
    if (!isImage) {
      setFormError("Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed");
      setSelectedFile(null);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setFormError("Image size must be less than 25MB. Please choose a smaller image.");
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setFormError("");
    setUploadSuccessMessage("");
  }

  // Handle direct file upload to Cloudflare R2 / Object Storage
  async function handleFileUpload(fileToUpload?: File) {
    const file = fileToUpload || selectedFile;
    if (!file) {
      setFormError("Please select a valid image file first");
      return;
    }

    const isImage = (file.type && file.type.startsWith("image/")) || /\.(jpe?g|png|webp|gif|svg)$/i.test(file.name);
    if (!isImage) {
      setFormError("Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      setFormError("Image size must be less than 25MB. Please choose a smaller image.");
      return;
    }

    setUploadingImage(true);
    setFormError("");
    setUploadSuccessMessage("");

    try {
      const formDataUpload = new FormData();
      formDataUpload.append("image", file, file.name);

      const res = await fetch(getApiUrl("/api/admin/upload/advertisement-image"), {
        method: "POST",
        headers: adminAuthHeaders({
          "x-file-name": encodeURIComponent(file.name),
        }),
        body: formDataUpload,
      });

      if (!res.ok) {
        let errorMsg = "";
        try {
          const err = await res.json();
          errorMsg = err.error || err.message;
        } catch {
          if (res.status === 413) {
            errorMsg = "The uploaded image is too large. Please select an image under 25MB.";
          }
        }
        throw new Error(
          errorMsg ||
            (res.status === 413
              ? "The uploaded image is too large (max 25MB). Please select a smaller file."
              : `Upload failed with HTTP ${res.status}`)
        );
      }

      const data = await res.json();
      if (!data.publicUrl) {
        throw new Error("Storage server did not return a valid public image URL");
      }

      setFormData((prev) => ({
        ...prev,
        uploadedImageUrl: data.publicUrl,
        uploadedObjectKey: data.objectKey || prev.uploadedObjectKey || "",
      }));
      setUploadSuccessMessage("Image uploaded successfully");
      setSelectedFile(null);
      setFormError("");
    } catch (err: any) {
      // Preserve selectedFile so the admin can retry with the same file after fixing any network/transient error
      setFormError(err.message || "Failed to upload image to storage");
      setUploadSuccessMessage("");
    } finally {
      setUploadingImage(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  // Create / Update mutation
  const saveMutation = useMutation({
    mutationFn: async (payload: FormState) => {
      const url = editingAd
        ? getApiUrl(`/api/admin/advertisements/${editingAd.id}`)
        : getApiUrl("/api/admin/advertisements");
      const method = editingAd ? "PUT" : "POST";

      const hasUploaded = Boolean(payload.uploadedImageUrl.trim());
      const hasExternal = Boolean(payload.externalImageUrl.trim());

      const body = {
        title: payload.title.trim(),
        description: payload.description.trim() || null,
        imageUrl: hasUploaded ? payload.uploadedImageUrl.trim() : payload.externalImageUrl.trim(),
        uploadedImageUrl: hasUploaded ? payload.uploadedImageUrl.trim() : "",
        externalImageUrl: hasExternal ? payload.externalImageUrl.trim() : "",
        imageSource: hasUploaded ? ("upload" as const) : ("url" as const),
        objectKey: hasUploaded ? payload.uploadedObjectKey : null,
        linkUrl: payload.linkUrl.trim() || null,
        displayOrder: payload.displayOrder,
        isActive: payload.isActive,
        startDate: payload.startDate ? new Date(payload.startDate).toISOString() : null,
        endDate: payload.endDate ? new Date(payload.endDate).toISOString() : null,
      };

      const res = await fetch(url, {
        method,
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to save advertisement");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
      setModalOpen(false);
    },
    onError: (err: any) => {
      setFormError(err.message || "Failed to save advertisement");
    },
  });

  // Toggle active status
  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      const res = await fetch(getApiUrl(`/api/admin/advertisements/${id}/toggle-status`), {
        method: "PATCH",
        headers: {
          ...adminHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ isActive }),
      });
      if (!res.ok) throw new Error("Failed to toggle status");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(getApiUrl(`/api/admin/advertisements/${id}`), {
        method: "DELETE",
        headers: adminHeaders(),
      });
      if (!res.ok) throw new Error("Failed to delete advertisement");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-advertisements"] });
      queryClient.invalidateQueries({ queryKey: ["advertisements"] });
      setDeleteConfirmId(null);
    },
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uploadingImage) {
      setFormError("Please wait for the image upload to complete before saving");
      return;
    }

    const hasUploaded = Boolean(formData.uploadedImageUrl.trim());
    const hasExternal = Boolean(formData.externalImageUrl.trim());

    if (!hasUploaded && !hasExternal) {
      setFormError("Please upload an image or enter an image URL.");
      return;
    }

    if (hasUploaded && hasExternal) {
      setFormError("Please provide either an uploaded image or an image URL, but not both.");
      return;
    }

    if (hasExternal) {
      const rawUrl = formData.externalImageUrl.trim();
      try {
        const parsed = new URL(rawUrl);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          setFormError("Please enter a valid HTTP or HTTPS image URL.");
          return;
        }
      } catch {
        setFormError("Please enter a valid image URL.");
        return;
      }

      setValidatingUrl(true);
      const loads = await verifyImageLoads(rawUrl);
      setValidatingUrl(false);
      if (!loads) {
        setFormError("The provided image URL could not be loaded. Please ensure the URL is publicly accessible and points to a valid image.");
        return;
      }
    }

    setFormError("");
    saveMutation.mutate(formData);
  }

  return (
    <AdminGuard>
      <AdminLayout>
        <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
          {/* ── Page Header ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0A1F44]">
                Advertisements Management
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                Upload and manage dynamic promotional banners displayed in the curved horizontal window on the storefront.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => refetch()}
                className="p-2.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors shadow-2xs"
                title="Refresh"
              >
                <RefreshCw size={16} className={cn(isRefetching && "animate-spin")} />
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="flex items-center gap-2 px-4 py-2.5 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white font-semibold text-sm rounded-xl shadow-sm transition-colors cursor-pointer"
              >
                <Plus size={16} /> New Advertisement
              </button>
            </div>
          </div>

          {/* ── Metric Summary Pills ── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Ads</span>
              <p className="text-2xl font-bold text-[#0A1F44] mt-1">{totalCount}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                <CheckCircle2 size={12} /> Active Now
              </span>
              <p className="text-2xl font-bold text-emerald-600 mt-1">{activeCount}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1">
                <Clock size={12} /> Scheduled
              </span>
              <p className="text-2xl font-bold text-blue-600 mt-1">{scheduledCount}</p>
            </div>
            <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-2xs">
              <span className="text-xs font-semibold text-amber-600 uppercase tracking-wider flex items-center gap-1">
                <AlertTriangle size={12} /> Expired
              </span>
              <p className="text-2xl font-bold text-amber-600 mt-1">{expiredCount}</p>
            </div>
          </div>

          {/* ── Advertisements Table / List ── */}
          <div className="bg-white rounded-2xl border border-gray-200/80 shadow-2xs overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800 text-sm">Configured Advertisements ({totalCount})</h2>
              <span className="text-xs text-gray-400">Order determines storefront sequence</span>
            </div>

            {isLoading ? (
              <div className="py-16 flex flex-col items-center justify-center text-gray-400 gap-2">
                <Loader2 size={24} className="animate-spin text-[#0A1F44]" />
                <span className="text-xs">Loading advertisements...</span>
              </div>
            ) : advertisements.length === 0 ? (
              <div className="py-16 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3 text-gray-400">
                  <ImageIcon size={22} />
                </div>
                <h3 className="text-sm font-semibold text-gray-700">No advertisements uploaded yet</h3>
                <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1 mb-4">
                  Add promotional banners to highlight seasonal sales, new artisan arrivals, or curated saree collections.
                </p>
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0A1F44] text-white text-xs font-semibold rounded-lg hover:bg-[#2C3E6B] transition-colors"
                >
                  <Plus size={14} /> Create First Advertisement
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50/80 text-gray-500 text-[11px] uppercase tracking-wider font-semibold border-b border-gray-100">
                    <tr>
                      <th className="py-3.5 px-4 w-14 text-center">Order</th>
                      <th className="py-3.5 px-4 w-44">Preview</th>
                      <th className="py-3.5 px-4">Title & Description</th>
                      <th className="py-3.5 px-4">Destination Link</th>
                      <th className="py-3.5 px-4">Schedule</th>
                      <th className="py-3.5 px-4 w-28 text-center">Status</th>
                      <th className="py-3.5 px-4 w-32 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-gray-700">
                    {advertisements.map((ad) => {
                      const isDeleting = deleteMutation.isPending && deleteConfirmId === ad.id;

                      return (
                        <tr key={ad.id} className="hover:bg-gray-50/60 transition-colors">
                          {/* Order */}
                          <td className="py-3 px-4 text-center font-bold text-gray-500">
                            #{ad.displayOrder}
                          </td>

                          {/* Image Thumbnail */}
                          <td className="py-3 px-4">
                            <div
                              onClick={() => setPreviewModalAd(ad)}
                              className="relative w-36 aspect-[21/9] rounded-xl border border-gray-200 overflow-hidden bg-gray-100 cursor-pointer group shadow-2xs"
                              title="Click to preview"
                            >
                              <img
                                src={getAdvertisementImageSrc(ad.imageUrl)}
                                alt={ad.title?.trim() || "Advertisement Banner"}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  if (!el.dataset.errored) {
                                    el.dataset.errored = "true";
                                    el.src = "/images/paithani-banner.jpg";
                                  }
                                }}
                              />
                              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white">
                                <Eye size={16} />
                              </div>
                            </div>
                          </td>

                          {/* Title & Description */}
                          <td className="py-3 px-4 max-w-xs">
                            {ad.title?.trim() ? (
                              <p className="font-semibold text-gray-900 truncate">{ad.title}</p>
                            ) : (
                              <p className="font-medium text-gray-400 italic text-xs">(Untitled Advertisement)</p>
                            )}
                            {ad.description ? (
                              <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{ad.description}</p>
                            ) : (
                              <span className="text-[11px] text-gray-300 italic">No description</span>
                            )}
                          </td>

                          {/* Link */}
                          <td className="py-3 px-4 text-xs">
                            {ad.linkUrl ? (
                              <a
                                href={ad.linkUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[#0A1F44] hover:underline font-medium"
                              >
                                {ad.linkUrl} <ExternalLink size={11} className="text-gray-400" />
                              </a>
                            ) : (
                              <span className="text-gray-400">None</span>
                            )}
                          </td>

                          {/* Schedule */}
                          <td className="py-3 px-4 text-xs text-gray-500">
                            {ad.startDate || ad.endDate ? (
                              <div className="space-y-0.5">
                                {ad.startDate && (
                                  <div>
                                    <span className="text-gray-400">From:</span> {new Date(ad.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  </div>
                                )}
                                {ad.endDate && (
                                  <div>
                                    <span className="text-gray-400">To:</span> {new Date(ad.endDate).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-gray-400">Always Visible</span>
                            )}
                          </td>

                          {/* Status Badge & Toggle */}
                          <td className="py-3 px-4 text-center">
                            <div className="flex flex-col items-center gap-1.5">
                              {ad.status === "active" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  ● Active
                                </span>
                              )}
                              {ad.status === "scheduled" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                  ⏳ Scheduled
                                </span>
                              )}
                              {ad.status === "expired" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                  ⚠️ Expired
                                </span>
                              )}
                              {ad.status === "inactive" && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-600 border border-gray-200">
                                  ○ Inactive
                                </span>
                              )}

                              <button
                                type="button"
                                onClick={() => toggleMutation.mutate({ id: ad.id, isActive: !ad.isActive })}
                                className="text-[11px] text-gray-500 hover:text-[#0A1F44] underline transition-colors"
                              >
                                {ad.isActive ? "Deactivate" : "Activate"}
                              </button>
                            </div>
                          </td>

                          {/* Actions */}
                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setPreviewModalAd(ad)}
                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#0A1F44] transition-colors"
                                title="Live Preview"
                              >
                                <Eye size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(ad)}
                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-[#0A1F44] transition-colors"
                                title="Edit Advertisement"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(ad.id)}
                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                                title="Delete Advertisement"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── Create / Edit Advertisement Modal ── */}
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white rounded-3xl max-w-2xl w-full p-6 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto space-y-5 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="font-serif text-xl font-bold text-[#0A1F44]">
                  {editingAd ? "Edit Advertisement" : "Upload New Advertisement"}
                </h3>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                >
                  <X size={18} />
                </button>
              </div>

              {uploadSuccessMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <span className="font-semibold">{uploadSuccessMessage}</span>
                </div>
              )}

              {formError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle size={16} className="text-red-600 shrink-0" />
                  <span className="font-semibold">{formError}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* ── Image Source Selection (Option A or Option B) ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                      Advertisement Banner Image <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-gray-400">Choose Option A or Option B (exactly one required)</span>
                  </div>

                  {formData.uploadedImageUrl && formData.externalImageUrl && (
                    <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl flex items-center gap-2">
                      <AlertTriangle size={15} className="text-amber-600 shrink-0" />
                      <span>Both an uploaded image and an image URL are provided. Please use only one image source before saving.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {/* Option A: Upload Image Banner */}
                    <div className={cn(
                      "p-4 rounded-2xl border transition-all",
                      formData.uploadedImageUrl
                        ? "border-emerald-400 bg-emerald-50/20 shadow-2xs"
                        : formData.externalImageUrl
                        ? "border-gray-200 bg-gray-50/40 opacity-70"
                        : "border-gray-200 bg-white hover:border-[#0A1F44]/40"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                          <span className="w-5 h-5 rounded-full bg-[#0A1F44] text-white flex items-center justify-center text-[10px]">A</span>
                          Option A — Upload Image
                        </span>
                        {formData.uploadedImageUrl && (
                          <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                            <CheckCircle2 size={12} /> Ready
                          </span>
                        )}
                      </div>

                      {formData.uploadedImageUrl ? (
                        <div className="space-y-2">
                          <div className="relative rounded-xl border border-emerald-300 overflow-hidden aspect-[21/9] bg-gray-100 group shadow-2xs">
                            <img
                              src={formData.uploadedImageUrl}
                              alt="Uploaded Banner Preview"
                              className="w-full h-full object-cover"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, uploadedImageUrl: "", uploadedObjectKey: "" }));
                                setUploadSuccessMessage("");
                                setSelectedFile(null);
                              }}
                              disabled={uploadingImage}
                              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                              title="Remove uploaded image"
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span className="truncate max-w-[180px]">Uploaded to storage</span>
                            <button
                              type="button"
                              onClick={() => {
                                setFormData((prev) => ({ ...prev, uploadedImageUrl: "", uploadedObjectKey: "" }));
                                setUploadSuccessMessage("");
                                setSelectedFile(null);
                              }}
                              className="text-red-500 hover:underline font-medium"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : selectedFile ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-gray-200">
                            <div className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100 shrink-0 border border-gray-100">
                              <img
                                src={URL.createObjectURL(selectedFile)}
                                alt="Selected"
                                className="w-full h-full object-cover"
                                onLoad={(e) => URL.revokeObjectURL((e.target as HTMLImageElement).src)}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-semibold text-gray-800 truncate">{selectedFile.name}</p>
                              <p className="text-[10px] text-gray-400">{(selectedFile.size / 1024).toFixed(1)} KB</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedFile(null);
                                setFormError("");
                                setUploadSuccessMessage("");
                              }}
                              disabled={uploadingImage}
                              className="px-2.5 py-1.5 text-xs text-gray-500 hover:bg-gray-100 rounded-lg transition-colors font-medium cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleFileUpload(selectedFile)}
                              disabled={uploadingImage}
                              className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white text-xs font-bold rounded-xl shadow-2xs transition-colors disabled:opacity-50 cursor-pointer"
                            >
                              {uploadingImage ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  <span>Uploading...</span>
                                </>
                              ) : (
                                <>
                                  <Upload size={13} />
                                  <span>Upload</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div
                          onClick={() => !uploadingImage && fileInputRef.current?.click()}
                          className="border-2 border-dashed border-gray-200 hover:border-[#0A1F44] rounded-xl p-4 text-center cursor-pointer transition-colors bg-white hover:bg-gray-50/50 flex flex-col items-center justify-center min-h-[110px]"
                        >
                          <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleFileSelect(file);
                            }}
                          />
                          {uploadingImage ? (
                            <div className="flex flex-col items-center justify-center text-gray-500 py-1">
                              <Loader2 size={20} className="animate-spin text-[#0A1F44] mb-1" />
                              <span className="text-[11px] font-semibold">Uploading to Cloudflare R2...</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-gray-500">
                              <Upload size={20} className="text-[#0A1F44] mb-1" />
                              <span className="text-xs font-semibold text-gray-800">Select Image File</span>
                              <span className="text-[10px] text-gray-400 mt-0.5">JPEG, PNG, WebP up to 25MB</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Option B: Enter Image URL */}
                    <div className={cn(
                      "p-4 rounded-2xl border transition-all flex flex-col justify-between",
                      formData.externalImageUrl
                        ? "border-emerald-400 bg-emerald-50/20 shadow-2xs"
                        : formData.uploadedImageUrl
                        ? "border-gray-200 bg-gray-50/40 opacity-70"
                        : "border-gray-200 bg-white hover:border-[#0A1F44]/40"
                    )}>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-gray-800 flex items-center gap-1.5">
                            <span className="w-5 h-5 rounded-full bg-[#0A1F44] text-white flex items-center justify-center text-[10px]">B</span>
                            Option B — Enter Image URL
                          </span>
                          {formData.externalImageUrl && (
                            <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                              <CheckCircle2 size={12} /> Ready
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mb-2">
                          Paste a publicly accessible direct image link (HTTP or HTTPS).
                        </p>
                        <div className="relative">
                          <input
                            type="url"
                            placeholder="https://images.unsplash.com/... or https://..."
                            value={formData.externalImageUrl}
                            onChange={(e) => {
                              setFormData((prev) => ({ ...prev, externalImageUrl: e.target.value }));
                              setUploadSuccessMessage("");
                            }}
                            className="w-full pr-8 pl-3 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44] bg-white"
                          />
                          {formData.externalImageUrl && (
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, externalImageUrl: "" }))}
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 cursor-pointer"
                              title="Clear URL"
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>

                      {formData.externalImageUrl && (
                        <div className="mt-2.5 pt-2 border-t border-gray-100 space-y-2">
                          <div className="relative rounded-xl border border-emerald-300 overflow-hidden aspect-[21/9] bg-gray-100 group shadow-2xs">
                            <img
                              src={getAdvertisementImageSrc(formData.externalImageUrl)}
                              alt="External Banner Preview"
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const el = e.currentTarget;
                                if (!el.dataset.errored) {
                                  el.dataset.errored = "true";
                                  el.src = "/images/paithani-banner.jpg";
                                }
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, externalImageUrl: "" }))}
                              className="absolute top-1.5 right-1.5 p-1 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors cursor-pointer"
                              title="Remove external image"
                            >
                              <X size={13} />
                            </button>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-gray-500">
                            <span className="text-[10px] text-gray-400 truncate max-w-[180px]">{formData.externalImageUrl}</span>
                            <button
                              type="button"
                              onClick={() => setFormData((prev) => ({ ...prev, externalImageUrl: "" }))}
                              className="text-red-500 hover:underline font-medium cursor-pointer"
                            >
                              Clear URL
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Title (Optional) ── */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Advertisement Title (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Royal Bridal Heritage Collection (Optional)"
                    value={formData.title}
                    onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44]"
                  />
                </div>

                {/* ── Description (Optional) ── */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Subtitle / Marketing Description (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Handcrafted pure silk sarees directly from master weavers"
                    value={formData.description}
                    onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                    className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44]"
                  />
                </div>

                {/* ── Destination Link ── */}
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Target Destination Route (Optional)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="e.g. /category/paithani or /category/designer"
                      value={formData.linkUrl}
                      onChange={(e) => setFormData((prev) => ({ ...prev, linkUrl: e.target.value }))}
                      className="flex-1 px-3.5 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44]"
                    />
                  </div>
                  <div className="flex gap-2 mt-1.5">
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, linkUrl: "/category/paithani" }))}
                      className="text-[11px] text-gray-500 hover:text-[#0A1F44] px-2 py-0.5 bg-gray-100 rounded-md"
                    >
                      + /category/paithani
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, linkUrl: "/category/designer" }))}
                      className="text-[11px] text-gray-500 hover:text-[#0A1F44] px-2 py-0.5 bg-gray-100 rounded-md"
                    >
                      + /category/designer
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, linkUrl: "/new-arrivals" }))}
                      className="text-[11px] text-gray-500 hover:text-[#0A1F44] px-2 py-0.5 bg-gray-100 rounded-md"
                    >
                      + /new-arrivals
                    </button>
                  </div>
                </div>

                {/* ── Display Order & Active Toggle ── */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Display Sequence Order
                    </label>
                    <input
                      type="number"
                      min={1}
                      value={formData.displayOrder}
                      onChange={(e) => setFormData((prev) => ({ ...prev, displayOrder: parseInt(e.target.value) || 1 }))}
                      className="w-full px-3.5 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Publish Status
                    </label>
                    <label className="flex items-center gap-2 mt-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isActive}
                        onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))}
                        className="w-4 h-4 rounded text-[#0A1F44] focus:ring-[#0A1F44]"
                      />
                      <span className="text-sm font-semibold text-gray-800">
                        {formData.isActive ? "Published (Active)" : "Draft (Inactive)"}
                      </span>
                    </label>
                  </div>
                </div>

                {/* ── Scheduling Dates (Optional) ── */}
                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      Start Date (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.startDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, startDate: e.target.value }))}
                      className="w-full px-3.5 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44]"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                      End Date (Optional)
                    </label>
                    <input
                      type="datetime-local"
                      value={formData.endDate}
                      onChange={(e) => setFormData((prev) => ({ ...prev, endDate: e.target.value }))}
                      className="w-full px-3.5 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-[#0A1F44]"
                    />
                  </div>
                </div>

                {/* ── Live Banner Preview in Form ── */}
                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
                      <Eye size={13} className="text-[#0A1F44]" />
                      Live Storefront Banner Preview
                    </span>
                    <span className="text-[11px] text-gray-400">
                      Real-time storefront presentation
                    </span>
                  </div>
                  {Boolean(formData.uploadedImageUrl.trim() || formData.externalImageUrl.trim()) ? (
                    <div className="bg-gray-50/80 rounded-2xl p-3 border border-gray-200 overflow-hidden">
                      <div className="relative w-full rounded-2xl overflow-hidden border-2 border-[#0A1F44] bg-white shadow-xs">
                        <div className="relative w-full aspect-[21/8] bg-gray-100 flex items-center justify-center overflow-hidden">
                          <img
                            src={getAdvertisementImageSrc(formData.uploadedImageUrl.trim() || formData.externalImageUrl.trim())}
                            alt={formData.title.trim() || "Advertisement Preview"}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const el = e.currentTarget;
                              if (!el.dataset.errored) {
                                el.dataset.errored = "true";
                                el.src = "/images/paithani-banner.jpg";
                              }
                            }}
                          />
                          {(Boolean(formData.title.trim()) || Boolean(formData.description.trim())) && (
                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent p-4 flex items-end justify-between pointer-events-none">
                              <div className="text-white max-w-xl">
                                {Boolean(formData.title.trim()) && (
                                  <h4 className="font-serif text-base sm:text-lg font-bold drop-shadow-sm">
                                    {formData.title.trim()}
                                  </h4>
                                )}
                                {Boolean(formData.description.trim()) && (
                                  <p className="mt-0.5 text-xs text-gray-200 line-clamp-1 drop-shadow-sm">
                                    {formData.description.trim()}
                                  </p>
                                )}
                              </div>
                              {Boolean(formData.linkUrl.trim()) && (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-white/20 backdrop-blur-xs px-2.5 py-1 rounded-full shrink-0 ml-2">
                                  Explore <ExternalLink size={10} />
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed border-gray-200 rounded-2xl p-6 text-center bg-gray-50/50">
                      <ImageIcon size={24} className="mx-auto text-gray-300 mb-1.5" />
                      <p className="text-xs font-semibold text-gray-500">Provide an image above to preview storefront banner</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Title, description, and link will overlay in real-time</p>
                    </div>
                  )}
                </div>

                {/* ── Modal Footer Buttons ── */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saveMutation.isPending || uploadingImage || validatingUrl}
                    className="flex items-center gap-2 px-5 py-2 bg-[#0A1F44] hover:bg-[#2C3E6B] text-white font-semibold text-sm rounded-xl shadow-sm transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    {(saveMutation.isPending || validatingUrl) && <Loader2 size={16} className="animate-spin" />}
                    {validatingUrl
                      ? "Verifying Image URL..."
                      : editingAd
                      ? "Save Changes"
                      : "Create Advertisement"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ── Live Carousel Preview Modal ── */}
        {previewModalAd && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
            <div
              className={cn(
                "bg-white rounded-3xl w-full p-6 shadow-2xl border border-gray-100 space-y-4 animate-in fade-in zoom-in-95 duration-150 transition-all",
                previewViewport === "mobile"
                  ? "max-w-sm"
                  : previewViewport === "tablet"
                  ? "max-w-2xl"
                  : "max-w-4xl"
              )}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-serif text-lg font-bold text-[#0A1F44]">
                      Live Storefront Preview
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#0A1F44]/5 text-[#0A1F44] border border-[#0A1F44]/15">
                      {previewViewport.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    Exact representation of the horizontal curved window on the storefront landing page
                  </p>
                </div>

                {/* Device Viewport Toggle Controls */}
                <div className="flex items-center gap-1.5 self-start sm:self-auto">
                  <div className="flex items-center bg-gray-100 p-0.5 rounded-xl border border-gray-200">
                    <button
                      type="button"
                      onClick={() => setPreviewViewport("desktop")}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        previewViewport === "desktop"
                          ? "bg-white text-[#0A1F44] shadow-2xs"
                          : "text-gray-500 hover:text-gray-900"
                      )}
                      title="Desktop preview"
                    >
                      <Monitor size={13} />
                      <span className="hidden sm:inline">Desktop</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport("tablet")}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        previewViewport === "tablet"
                          ? "bg-white text-[#0A1F44] shadow-2xs"
                          : "text-gray-500 hover:text-gray-900"
                      )}
                      title="Tablet preview"
                    >
                      <Tablet size={13} />
                      <span className="hidden sm:inline">Tablet</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewViewport("mobile")}
                      className={cn(
                        "flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer",
                        previewViewport === "mobile"
                          ? "bg-white text-[#0A1F44] shadow-2xs"
                          : "text-gray-500 hover:text-gray-900"
                      )}
                      title="Mobile preview"
                    >
                      <Smartphone size={13} />
                      <span className="hidden sm:inline">Mobile</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setPreviewModalAd(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 ml-2 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-2xl p-2 sm:p-4 overflow-hidden">
                <AdvertisementCarousel
                  advertisements={[previewModalAd]}
                  interactiveLinks={false}
                />
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
                <div className="text-gray-500 flex items-center gap-2">
                  <span className="font-semibold text-gray-700">Destination:</span>
                  {previewModalAd.linkUrl ? (
                    <span className="font-mono text-[#0A1F44] bg-gray-100 px-2 py-0.5 rounded-md">
                      {previewModalAd.linkUrl}
                    </span>
                  ) : (
                    <span className="text-gray-400 italic">None (Display banner only)</span>
                  )}
                  <span className="text-[11px] text-gray-400 italic hidden sm:inline">
                    (Link navigation is disabled during preview)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setPreviewModalAd(null)}
                  className="px-4 py-2 bg-[#0A1F44] text-white text-xs font-semibold rounded-xl hover:bg-[#2C3E6B] transition-colors self-end sm:self-auto cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Delete Confirmation Dialog ── */}
        {deleteConfirmId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
            <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-gray-100 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <Trash2 size={22} />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Delete Advertisement?</h3>
                <p className="text-xs text-gray-500 mt-1">
                  This will permanently remove the advertisement from the storefront scrolling window.
                </p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmId(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => deleteMutation.mutate(deleteConfirmId)}
                  className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-sm"
                >
                  {deleteMutation.isPending ? "Deleting..." : "Yes, Delete"}
                </button>
              </div>
            </div>
          </div>
        )}
      </AdminLayout>
    </AdminGuard>
  );
}
