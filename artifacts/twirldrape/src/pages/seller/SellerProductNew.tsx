import React, { useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, CheckCircle, AlertCircle } from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { useSellerContext } from "@/components/SellerGuard";
import ProductForm, { emptyFormData, ProductFormData } from "./SellerProductForm";
import { getApiUrl } from "@/lib/api";

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

export default function SellerProductNew() {
  const [, setLocation] = useLocation();
  const { vendor } = useSellerContext();
  const [form, setForm] = useState<ProductFormData>(emptyFormData());
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormData, string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);

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
        stock: form.stock.trim() ? parseInt(form.stock) : 10,
        lowStockThreshold: form.lowStockThreshold.trim() ? parseInt(form.lowStockThreshold) : 5,
        images: form.images.filter(Boolean),
        videos: form.videos.filter(Boolean),
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

      const res = await fetch(getApiUrl("/api/products"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create product");
      }

      setSuccess(true);
      setTimeout(() => setLocation("/seller/products"), 1400);
    } catch (err: any) {
      setApiError(err.message || "Failed to create product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SellerLayout title="Add Product">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => setLocation("/seller/products")}
            className="p-2 rounded-lg hover:bg-[#E5E8EC] transition-colors"
          >
            <ArrowLeft size={18} style={{ color: MAROON }} />
          </button>
          <div>
            <h1 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>Add New Product</h1>
            <p className="text-sm mt-0.5" style={{ color: "#7a5f4e" }}>Fill in the details to list your saree on VASTRAA</p>
          </div>
        </div>

        {success && (
          <div className="mb-5 flex items-center gap-2.5 p-4 rounded-xl bg-green-50 border border-green-200 text-green-800 text-sm font-medium">
            <CheckCircle size={16} />
            Product created! Redirecting to your products list…
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
          submitLabel="Create Product"
          onSubmit={handleSubmit}
          onCancel={() => setLocation("/seller/products")}
        />
      </div>
    </SellerLayout>
  );
}
