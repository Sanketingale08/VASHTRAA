import React, { useState, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import ProductForm, { emptyFormData, ProductFormData } from "./SellerProductForm";
import { getApiUrl } from "@/lib/api";

const MAROON = "#1E6B5A";

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

  const [form, setForm] = useState<ProductFormData>(emptyFormData());
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      try {
        const res = await fetch(getApiUrl(`/api/products/${id}`), { credentials: "include" });
        if (!res.ok) throw new Error("Product not found");
        const p = await res.json();
        const images = Array.isArray(p.images) ? p.images : [];
        const videos = Array.isArray(p.videos) && p.videos.length > 0 ? p.videos : [""];
        const variants = Array.isArray(p.variants)
          ? p.variants.map((v: any) => ({
              size: v.size ?? "",
              color: v.color ?? "",
              stock: v.stock != null ? String(v.stock) : "",
              price: v.price != null ? String(v.price) : "",
              sku: v.sku ?? "",
            }))
          : [];
        const specifications = Array.isArray(p.specifications)
          ? p.specifications.map((s: any) => ({ key: s.key ?? "", value: s.value ?? "" }))
          : [];
        setForm({
          name: p.name ?? "",
          description: p.description ?? "",
          category: p.category ?? "paithani",
          subcategory: p.subcategory ?? "",
          brand: p.brand ?? "",
          designPattern: p.designPattern ?? "",
          fabric: p.fabric ?? "silk",
          color: p.color ?? "red",
          occasion: p.occasion ?? "festival",
          price: p.price != null ? String(p.price) : "",
          originalPrice: p.originalPrice != null ? String(p.originalPrice) : "",
          stock: p.stock != null ? String(p.stock) : "0",
          lowStockThreshold: p.lowStockThreshold != null ? String(p.lowStockThreshold) : "5",
          images: images,
          videos,
          variants,
          specifications,
          deliveryInfo: p.deliveryInfo ?? "",
          returnPolicy: p.returnPolicy ?? "",
          isBestSeller: p.isBestSeller ?? false,
          isNewArrival: p.isNewArrival ?? false,
        });
      } catch {
        setLoadError("Could not load product details.");
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  function handleChange(field: keyof ProductFormData, value: any) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
    setApiError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(form);
    if (Object.keys(errs).length > 0) { setErrors(errs); return; }

    setSubmitting(true);
    setApiError("");

    try {
      const body = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        subcategory: form.subcategory.trim() || null,
        brand: form.brand.trim() || null,
        designPattern: form.designPattern.trim() || null,
        fabric: form.fabric,
        color: form.color,
        occasion: form.occasion,
        price: parseInt(form.price),
        originalPrice: form.originalPrice.trim() ? parseInt(form.originalPrice) : null,
        stock: form.stock.trim() ? parseInt(form.stock) : 0,
        lowStockThreshold: form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold) : 5,
        images: form.images.filter(Boolean),
        videos: form.videos.filter(Boolean),
        variants: form.variants
          .filter((v) => v.size.trim() || v.color.trim())
          .map((v) => ({
            size: v.size.trim(),
            color: v.color.trim(),
            stock: v.stock.trim() ? parseInt(v.stock) : 0,
            price: v.price.trim() ? parseInt(v.price) : null,
            sku: v.sku.trim() || null,
          })),
        specifications: form.specifications
          .filter((s) => s.key.trim() && s.value.trim())
          .map((s) => ({ key: s.key.trim(), value: s.value.trim() })),
        deliveryInfo: form.deliveryInfo.trim(),
        returnPolicy: form.returnPolicy.trim(),
        isBestSeller: form.isBestSeller,
        isNewArrival: form.isNewArrival,
      };

      const res = await fetch(getApiUrl(`/api/products/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save product");
      }

      setSuccess(true);
      setTimeout(() => setLocation("/seller/products"), 1400);
    } catch (err: any) {
      setApiError(err.message || "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <SellerLayout title="Edit Product">
        <div className="flex items-center justify-center h-64">
          <Loader2 size={28} className="animate-spin" style={{ color: MAROON }} />
        </div>
      </SellerLayout>
    );
  }

  if (loadError) {
    return (
      <SellerLayout title="Edit Product">
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <p className="text-red-600 text-sm">{loadError}</p>
          <button onClick={() => setLocation("/seller/products")} className="mt-4 text-sm underline" style={{ color: MAROON }}>Back to products</button>
        </div>
      </SellerLayout>
    );
  }

  return (
    <SellerLayout title="Edit Product">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/seller/products")}
            className="p-2 rounded-lg hover:bg-[#E6F0EA] transition-colors"
          >
            <ArrowLeft size={18} style={{ color: MAROON }} />
          </button>
          <div>
            <h1 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>Edit Product</h1>
            <p className="text-sm mt-0.5" style={{ color: "#7a5f4e" }}>Update your listing details</p>
          </div>
        </div>

        {success && (
          <div className="mb-5 flex items-center gap-2.5 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
            <CheckCircle size={16} />
            Product updated! Redirecting to your products list…
          </div>
        )}

        {apiError && (
          <div className="mb-5 flex items-center gap-2.5 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            <AlertCircle size={16} />
            {apiError}
          </div>
        )}

        <ProductForm
          data={form}
          errors={errors}
          onChange={handleChange}
          submitting={submitting}
          submitLabel="Save Changes"
          onSubmit={handleSubmit}
          onCancel={() => setLocation("/seller/products")}
        />
      </div>
    </SellerLayout>
  );
}
