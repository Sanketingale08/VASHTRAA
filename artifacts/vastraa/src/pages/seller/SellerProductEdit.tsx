import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, CheckCircle2, AlertCircle, Loader2, ChevronRight, Package, Eye, X } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { useSellerContext } from "@/components/SellerGuard";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import ProductForm, { emptyFormData, ProductFormData } from "./SellerProductForm";
import { findCategoryBySlugOrName, resolveCanonicalSubcategoryName } from "@/constants/categories";
import { apiFetch } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";

const MAROON = "#0A1F44";

function validate(data: ProductFormData): Partial<Record<keyof ProductFormData, string>> {
  const errs: Partial<Record<keyof ProductFormData, string>> = {};
  if (!data.name.trim()) errs.name = "Product name is required";
  if (!data.price.trim() || isNaN(Number(data.price)) || Number(data.price) <= 0) errs.price = "Enter a valid price";
  if (data.originalPrice.trim() && (isNaN(Number(data.originalPrice)) || Number(data.originalPrice) <= 0)) errs.originalPrice = "Enter a valid original price";
  if (data.stock.trim() && (isNaN(Number(data.stock)) || Number(data.stock) < 0)) errs.stock = "Enter a valid stock quantity";
  if (data.lowStockThreshold.trim() && (isNaN(Number(data.lowStockThreshold)) || Number(data.lowStockThreshold) < 0)) errs.lowStockThreshold = "Enter a valid threshold";
  return errs;
}

export default function SellerProductEdit() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { vendor } = useSellerContext();

  const [form, setForm] = useState<ProductFormData>(emptyFormData());
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  const priceNum = Number(form.price) || 0;
  const origPriceNum = Number(form.originalPrice) || 0;
  const discountPercent =
    origPriceNum > priceNum && priceNum > 0
      ? Math.round(((origPriceNum - priceNum) / origPriceNum) * 100)
      : 0;

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        let res = await apiFetch(`/api/products/${id}`);
        if (!res.ok) {
          // Fall back to seller-scoped endpoint if main endpoint returned non-200
          const sellerRes = await apiFetch(`/api/seller/products/${id}`);
          if (sellerRes.ok) {
            res = sellerRes;
          }
        }

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          const serverMsg = errorData?.error || errorData?.message;
          console.error(`[SellerProductEdit] Failed to load product #${id}:`, {
            status: res.status,
            statusText: res.statusText,
            serverMsg,
          });
          if (res.status === 401) {
            throw new Error("Your session has expired. Please sign in again.");
          } else if (res.status === 403) {
            throw new Error("You are not authorized to edit this product. It belongs to another seller.");
          } else if (res.status === 404) {
            throw new Error(`Product not found (ID: ${id}).`);
          } else {
            throw new Error(serverMsg || "Could not load product details.");
          }
        }

        const resData = await res.json();
        const p = resData?.product || resData;
        if (!p || (!p.id && !p._id && !p.name)) {
          throw new Error("Invalid product details received from server.");
        }

        let rawImages: string[] = [];
        if (Array.isArray(p.images)) {
          rawImages = p.images;
        } else if (typeof p.images === "string") {
          rawImages = p.images.split("|").map((s: string) => s.trim());
        } else if (p.image) {
          rawImages = [p.image];
        }
        const images = rawImages.filter(Boolean);

        const variants = Array.isArray(p.variants)
          ? p.variants.map((v: any) => {
              if (Array.isArray(v.attributes) && v.attributes.length > 0) {
                return {
                  attributes: v.attributes.map((a: any) => ({
                    name: String(a.name || ""),
                    value: String(a.value || ""),
                  })),
                  stock: v.stock != null ? String(v.stock) : "",
                  price: v.price != null ? String(v.price) : "",
                  sku: v.sku ?? "",
                  image: v.image ?? "",
                };
              }
              const attrs: Array<{ name: string; value: string }> = [];
              if (v.color) attrs.push({ name: "Colour", value: String(v.color) });
              if (v.size) attrs.push({ name: "Size", value: String(v.size) });
              return {
                attributes: attrs,
                stock: v.stock != null ? String(v.stock) : "",
                price: v.price != null ? String(v.price) : "",
                sku: v.sku ?? "",
                image: v.image ?? "",
              };
            })
          : [];

        let attributeGroups = Array.isArray(p.attributeGroups) && p.attributeGroups.length > 0
          ? p.attributeGroups.map((g: any) => ({
              name: String(g.name || ""),
              values: Array.isArray(g.values) ? g.values.map(String) : [],
            }))
          : [];

        if (attributeGroups.length === 0 && variants.length > 0) {
          const groupMap = new Map<string, Set<string>>();
          for (const v of variants) {
            for (const a of v.attributes) {
              if (!a.name || !a.value) continue;
              if (!groupMap.has(a.name)) groupMap.set(a.name, new Set());
              groupMap.get(a.name)!.add(a.value);
            }
          }
          attributeGroups = Array.from(groupMap.entries()).map(([name, vals]) => ({
            name,
            values: Array.from(vals),
          }));
        }

        let specifications: Array<{ key: string; value: string }> = [];
        if (Array.isArray(p.specifications)) {
          specifications = p.specifications.map((s: any) => ({
            key: String(s.key ?? s.name ?? ""),
            value: String(s.value ?? ""),
          }));
        } else if (p.specifications && typeof p.specifications === "object") {
          specifications = Object.entries(p.specifications).map(([key, value]) => ({
            key,
            value: String(value ?? ""),
          }));
        }

        const matchedCategory = findCategoryBySlugOrName(p.category || (p as any).categoryId);
        const resolvedCategory = matchedCategory?.slug || p.category || "paithani";
        const rawSubcategory = p.subcategory ?? (p as any).subcategoryName ?? "";
        const resolvedSubcategory = resolveCanonicalSubcategoryName(resolvedCategory, rawSubcategory) || rawSubcategory;

        setForm({
          name: p.name ?? "",
          description: p.description ?? "",
          category: resolvedCategory,
          subcategory: resolvedSubcategory,
          collection: p.collection ?? "",
          gender: p.gender ?? "Women",
          sareeType: p.sareeType ?? "",
          sareeStyle: p.sareeStyle ?? "",
          packOf: p.packOf ?? "Pack of 1",
          countryOfOrigin: p.countryOfOrigin ?? "India",
          blouseIncluded: p.blouseIncluded ?? true,
          brand: p.brand ?? "",
          designPattern: p.designPattern ?? "",
          fabric: p.fabric ?? "silk",
          color: p.color ?? "red",
          occasion: p.occasion ?? "festival",
          price: p.basePrice != null ? String(p.basePrice) : (p.price != null ? String(p.price) : ""),
          originalPrice: p.originalPrice != null ? String(p.originalPrice) : "",
          stock: p.stock != null ? String(p.stock) : "0",
          lowStockThreshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : "5",
          images,
          videos: [],
          attributeGroups,
          variants,
          specifications,
          deliveryInfo: p.deliveryInfo ?? "",
          returnPolicy: p.returnPolicy ?? "",
          isBestSeller: Boolean(p.isBestSeller),
          isNewArrival: Boolean(p.isNewArrival),
        });
      } catch (err: any) {
        console.error(`[SellerProductEdit] Error loading product details for ID ${id}:`, err);
        setLoadError(err.message || "Could not load product details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id, reloadKey]);

  const handleChange = React.useCallback((field: keyof ProductFormData, value: any) => {
    setForm((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setApiError((prev) => (prev ? "" : prev));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const errs = validate(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    setSubmitting(true);
    setApiError("");

    try {
      const canonicalSubcategory = form.subcategory.trim()
        ? resolveCanonicalSubcategoryName(form.category, form.subcategory)
        : null;

      if (form.subcategory.trim() && !canonicalSubcategory) {
        setErrors((prev) => ({
          ...prev,
          subcategory: `Invalid subcategory for ${form.category}`,
        }));
        setApiError(`Invalid subcategory "${form.subcategory}" for category "${form.category}".`);
        return;
      }

      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        subcategory: canonicalSubcategory,
        collection: form.collection?.trim() || null,
        gender: form.gender?.trim() || "Women",
        sareeType: form.sareeType?.trim() || null,
        sareeStyle: form.sareeStyle?.trim() || null,
        packOf: form.packOf?.trim() || "Pack of 1",
        countryOfOrigin: form.countryOfOrigin?.trim() || "India",
        blouseIncluded: form.blouseIncluded,
        brand: form.brand.trim() || null,
        designPattern: form.designPattern.trim() || null,
        fabric: form.fabric,
        color: form.color,
        occasion: form.occasion,
        basePrice: parseInt(form.price),
        price: parseInt(form.price),
        originalPrice: form.originalPrice.trim() ? parseInt(form.originalPrice) : null,
        stock: form.stock.trim() ? parseInt(form.stock) : 0,
        lowStockThreshold: form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold) : 5,
        images: form.images.filter(Boolean),
        videos: [],
        variants: form.variants
          .filter((v) => v.attributes.length > 0)
          .map((v) => ({
            attributes: v.attributes,
            stock: v.stock.trim() ? parseInt(v.stock) : 0,
            price: v.price.trim() ? parseInt(v.price) : null,
            sku: v.sku.trim() || null,
            image: v.image.trim() || null,
          })),
        specifications: form.specifications
          .filter((s) => s.key.trim() && s.value.trim())
          .map((s) => ({ key: s.key.trim(), value: s.value.trim() })),
        deliveryInfo: form.deliveryInfo.trim(),
        returnPolicy: form.returnPolicy.trim(),
        isBestSeller: form.isBestSeller,
        isNewArrival: form.isNewArrival,
      };

      const res = await apiFetch(`/api/products/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const resData = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resData.error || "Failed to save product");
      }

      const updatedProduct = resData.product || resData;
      if (updatedProduct) {
        queryClient.setQueryData([`/api/products/${id}`], updatedProduct);
        if (updatedProduct.id && updatedProduct.id !== id) {
          queryClient.setQueryData([`/api/products/${updatedProduct.id}`], updatedProduct);
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
      queryClient.invalidateQueries({ queryKey: [`/api/products/${id}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/facets"] });

      // Dispatch local event for instant zero-latency cross-component update
      window.dispatchEvent(
        new CustomEvent("vastraa-realtime-event", {
          detail: {
            name: "product:updated",
            data: {
              id,
              productId: id,
              product: updatedProduct,
              ...(updatedProduct || {}),
            },
          },
        })
      );

      setSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setLocation("/seller/products"), 1400);
    } catch (err: any) {
      setApiError(err.message || "Failed to save product");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SellerLayout title="Edit Product">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <Loader2 size={32} className="animate-spin" style={{ color: MAROON }} />
          <p className="text-xs text-gray-500 font-medium">Loading product details...</p>
        </div>
      </SellerLayout>
    );
  }

  if (loadError) {
    return (
      <SellerLayout title="Edit Product">
        <div className="max-w-2xl mx-auto px-4 py-16 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
            <AlertCircle size={24} />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Could not load product details</h2>
          <p className="text-red-600 text-sm font-medium">{loadError}</p>
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              onClick={() => {
                setLoading(true);
                setLoadError("");
                setReloadKey((k) => k + 1);
              }}
              className="px-4 py-2 rounded-lg bg-[#0A1F44] text-white text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer shadow-sm"
            >
              Retry
            </button>
            <button
              onClick={() => setLocation("/seller/products")}
              className="text-xs font-semibold underline text-[#0A1F44] hover:opacity-80 cursor-pointer"
            >
              Back to My Products
            </button>
          </div>
        </div>
      </SellerLayout>
    );
  }

  return (
    <SellerLayout title="Edit Product">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb & Page Header */}
        <div className="space-y-3 border-b border-[#E5E8EC] pb-6">
          <nav className="flex items-center gap-1.5 text-xs text-[#7a5f4e]">
            <button
              onClick={() => setLocation("/seller/dashboard")}
              className="hover:text-[#0A1F44] transition-colors cursor-pointer"
            >
              Dashboard
            </button>
            <ChevronRight size={12} />
            <button
              onClick={() => setLocation("/seller/products")}
              className="hover:text-[#0A1F44] transition-colors cursor-pointer"
            >
              My Products
            </button>
            <ChevronRight size={12} />
            <span className="font-semibold text-[#0A1F44]">Edit Product</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocation("/seller/products")}
                className="p-2.5 rounded-xl border border-[#E5E8EC] bg-white hover:bg-[#F4F5F7] text-[#0A1F44] transition-all shadow-2xs group cursor-pointer"
                title="Back to products"
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0A1F44]">
                  Edit Product
                </h1>
                <p className="text-xs sm:text-sm text-[#7a5f4e] mt-0.5">
                  Update your listing details, stock, pricing, and media
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#0A1F44]/20 bg-[#0A1F44]/5 hover:bg-[#0A1F44]/10 text-xs font-semibold text-[#0A1F44] transition-all cursor-pointer shadow-2xs"
                title="Preview customer storefront appearance"
              >
                <Eye size={13} />
                <span>Preview Storefront</span>
              </button>

              {id && (
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-gray-100 border border-gray-200 text-xs font-semibold text-gray-700">
                  <Package size={14} className="text-[#0A1F44]" />
                  <span>Product #{id}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Notifications */}
        {success && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold shadow-xs animate-in fade-in slide-in-from-top-2">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <span>Product updated successfully! Redirecting to your products list…</span>
          </div>
        )}

        {apiError && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium shadow-xs animate-in fade-in slide-in-from-top-2">
            <AlertCircle size={20} className="text-red-500 shrink-0" />
            <span>{apiError}</span>
          </div>
        )}

        {/* Form Component */}
        <ProductForm
          data={form}
          errors={errors}
          onChange={handleChange}
          submitting={submitting}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onCancel={() => setLocation("/seller/products")}
        />

        {/* ── Product Preview Modal ────────────────────────────────────────── */}
        {showPreviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full my-8 p-6 space-y-5 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">
                    Customer Storefront Preview
                  </span>
                  <span className="text-xs text-gray-400">Live preview of current edits</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Images */}
                <div className="space-y-3">
                  <div className="aspect-[3/4] rounded-xl bg-gray-100 overflow-hidden border">
                    {form.images[0] ? (
                      <img
                        src={getProductImageSrc(form.images[0])}
                        alt={form.name || "Product"}
                        className="w-full h-full object-cover"
                        onError={replaceProductImageWithFallback}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
                        No product image
                      </div>
                    )}
                  </div>
                  {form.images.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {form.images.slice(1, 5).map((img, i) => (
                        <div key={i} className="aspect-square rounded-lg bg-gray-100 overflow-hidden border">
                          <img
                            src={getProductImageSrc(img)}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={replaceProductImageWithFallback}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-4">
                  <div>
                    <span className="text-xs text-[#996515] font-serif uppercase tracking-widest font-bold">
                      {form.brand || (vendor as any)?.shopName || "VASTRAA Artisan"}
                    </span>
                    <h3 className="font-serif text-xl font-bold text-[#0A1F44] mt-0.5">
                      {form.name || "Untitled Saree"}
                    </h3>
                  </div>

                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#0A1F44]">
                      ₹{Number(form.price || 0).toLocaleString("en-IN")}
                    </span>
                    {form.originalPrice && Number(form.originalPrice) > Number(form.price) && (
                      <>
                        <span className="text-sm text-gray-400 line-through">
                          ₹{Number(form.originalPrice).toLocaleString("en-IN")}
                        </span>
                        <span className="text-xs font-bold text-emerald-600">
                          ({discountPercent}% OFF)
                        </span>
                      </>
                    )}
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed">
                    {form.description || "Authentic saree listing created on VASTRAA marketplace."}
                  </p>

                  <div className="p-3 rounded-xl bg-gray-50 border text-xs space-y-1">
                    <div className="text-gray-500">Fabric: <strong className="text-gray-800">{form.fabric}</strong></div>
                    <div className="text-gray-500">Primary Color: <strong className="text-gray-800">{form.color}</strong></div>
                    <div className="text-gray-500">Blouse: <strong className="text-gray-800">{form.blouseIncluded ? "Included (Unstitched 0.8m)" : "Not Included"}</strong></div>
                    <div className="text-gray-500">Sold by: <strong className="text-[#0A1F44]">{(vendor as any)?.shopName || "Verified Artisan"}</strong></div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 rounded-xl bg-[#0A1F44]/50 text-white text-xs font-bold cursor-not-allowed"
                    >
                      Add to Cart (Preview Disabled)
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-3 border-t">
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="px-5 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 cursor-pointer"
                >
                  Close Preview
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </SellerLayout>
  );
}
