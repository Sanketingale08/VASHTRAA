import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Store,
  Eye,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Info,
  DollarSign,
  Package,
  Layers,
  Truck,
  Check,
  AlertTriangle,
  X,
  Plus,
  Loader2,
  ExternalLink,
  ShieldCheck,
  HelpCircle,
  IndianRupee,
} from "lucide-react";
import { SellerLayout } from "./SellerDashboard";
import { useSellerContext } from "@/components/SellerGuard";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import {
  emptyFormData,
  ProductFormData,
  CATEGORIES,
  FABRICS,
  OCCASIONS,
  COLORS,
  ProductAttributeGroup,
  ProductVariantForm,
  ProductSpecForm,
  ImageUploadGallery,
  AttributeVariantBuilder,
  LiveEarningsEstimator,
} from "./SellerProductForm";
import { apiFetch, getApiUrl } from "@/lib/api";
import {
  CATALOG_CATEGORIES,
  CATEGORY_DROPDOWN_OPTIONS,
  getSubcategoriesForCategory,
  isValidSubcategoryForCategory,
  resolveCanonicalSubcategoryName,
} from "@/constants/categories";

const MAROON = "#0A1F44";
const GOLD = "#D4AF37";

const STEPS = [
  { id: 1, title: "Product Information", shortTitle: "Info", desc: "Identity & saree details" },
  { id: 2, title: "Images & Variants", shortTitle: "Images", desc: "Photos & combinations" },
  { id: 3, title: "Pricing & Inventory", shortTitle: "Pricing", desc: "Price, MRP & stock" },
  { id: 4, title: "Shipping & Review", shortTitle: "Review", desc: "Pickup & final checks" },
] as const;

type StepNumber = (typeof STEPS)[number]["id"];

export default function SellerProductNew() {
  const [, setLocation] = useLocation();
  const { vendor } = useSellerContext();
  const queryClient = useQueryClient();

  // Read initial step from query param if available
  const [currentStep, setCurrentStep] = useState<StepNumber>(() => {
    try {
      const sp = new URLSearchParams(window.location.search);
      const s = parseInt(sp.get("step") || "1", 10);
      if (s >= 1 && s <= 4) return s as StepNumber;
    } catch {}
    return 1;
  });

  const [form, setForm] = useState<ProductFormData>(emptyFormData());
  const [errors, setErrors] = useState<Partial<Record<keyof ProductFormData | "step1" | "step2" | "step3", string>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState("");
  const [success, setSuccess] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Progressive disclosure toggles
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [hasVariants, setHasVariants] = useState(false);

  // Modals & confirmation dialogs
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [hasDraftNotice, setHasDraftNotice] = useState(false);
  const [draftTime, setDraftTime] = useState<string | null>(null);

  const sellerEmail = (typeof window !== "undefined" && localStorage.getItem("vastraa_seller_email")) || "";
  const vendorStorageId = vendor?.id || (vendor as any)?.vendorId || sellerEmail || "default";
  const draftStorageKey = `vastraa_seller_draft_${vendorStorageId}`;

  // Check for saved local draft on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.form && (parsed.form.name || parsed.form.price || parsed.form.images?.length > 0)) {
          setHasDraftNotice(true);
          if (parsed.timestamp) {
            setDraftTime(new Date(parsed.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
          }
        }
      }
    } catch {}
  }, [draftStorageKey]);

  // Authoritative category options and dynamic subcategories for current category
  const categoryOptions = CATEGORY_DROPDOWN_OPTIONS;
  const subcategories = useMemo(() => getSubcategoriesForCategory(form.category), [form.category]);

  // Check if form has any unsaved user input
  const isDirty = useMemo(() => {
    return (
      Boolean(form.name.trim()) ||
      Boolean(form.description.trim()) ||
      Boolean(form.price.trim()) ||
      form.images.length > 0 ||
      form.variants.length > 0 ||
      form.isNewArrival
    );
  }, [form]);

  const handleChange = useCallback((field: keyof ProductFormData | "sku", value: any) => {
    setForm((prev) => {
      if (field === "category") {
        // When parent category changes, reset selected subcategory if it is no longer valid
        const nextSub = resolveCanonicalSubcategoryName(value, prev.subcategory);
        return {
          ...prev,
          category: value,
          subcategory: nextSub,
        };
      }
      return prev[field as keyof ProductFormData] === value ? prev : { ...prev, [field]: value };
    });
    setErrors((prev) => {
      if (!prev[field as keyof ProductFormData]) return prev;
      const next = { ...prev };
      delete next[field as keyof ProductFormData];
      return next;
    });
    setApiError("");
  }, []);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  }, []);

  // Save current progress to local storage and optionally sync server draft
  const handleSaveDraft = useCallback(async () => {
    try {
      const draftPayload = {
        form,
        timestamp: new Date().toISOString(),
      };
      localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
      const formattedTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      setDraftTime(formattedTime);
      setHasDraftNotice(false);

      if (form.name.trim() && form.category && form.price.trim() && !isNaN(Number(form.price)) && Number(form.price) > 0) {
        try {
          const body = {
            name: form.name.trim(),
            description: form.description.trim() || `${form.name.trim()} (Draft)`,
            category: form.category,
            price: parseInt(form.price, 10),
            fabric: form.fabric.trim() || "Silk",
            status: "draft",
            images: form.images.filter(Boolean),
            stock: form.stock.trim() ? parseInt(form.stock, 10) : 10,
          };
          await apiFetch("/api/products", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
          queryClient.invalidateQueries({ queryKey: ["/seller/products"] });
        } catch {}
      }

      showToast("Draft saved successfully. You can safely exit and resume anytime.");
    } catch {
      showToast("Could not save draft to local storage.");
    }
  }, [form, draftStorageKey, showToast, queryClient]);

  const handleRestoreDraft = useCallback(() => {
    try {
      const raw = localStorage.getItem(draftStorageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.form) {
          setForm(parsed.form);
          if (parsed.form.variants && parsed.form.variants.length > 0) {
            setHasVariants(true);
          }
          setHasDraftNotice(false);
          showToast("Draft restored.");
        }
      }
    } catch {
      showToast("Failed to restore draft.");
    }
  }, [draftStorageKey, showToast]);

  const handleDismissDraft = useCallback(() => {
    try {
      localStorage.removeItem(draftStorageKey);
      setHasDraftNotice(false);
      setDraftTime(null);
      showToast("Draft discarded.");
    } catch {}
  }, [draftStorageKey, showToast]);

  // Step-level validation
  const validateStep = useCallback((step: StepNumber): boolean => {
    const nextErrs: Partial<Record<keyof ProductFormData, string>> = {};

    if (step === 1) {
      if (!form.name.trim()) nextErrs.name = "Product title is required";
      if (!form.category) nextErrs.category = "Please select a product category";
      if (!form.fabric) nextErrs.fabric = "Fabric / material is required";
    }

    if (step === 2) {
      if (form.images.filter(Boolean).length === 0) {
        // Warning error for missing image
        nextErrs.images = "At least 1 product image is required";
      }
    }

    if (step === 3) {
      if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) <= 0) {
        nextErrs.price = "Enter a valid selling price greater than ₹0";
      }
      if (
        form.originalPrice.trim() &&
        (isNaN(Number(form.originalPrice)) || Number(form.originalPrice) <= 0)
      ) {
        nextErrs.originalPrice = "Enter a valid original price (MRP)";
      } else if (
        form.originalPrice.trim() &&
        form.price.trim() &&
        Number(form.originalPrice) < Number(form.price)
      ) {
        nextErrs.originalPrice = "Original price (MRP) must be equal to or higher than selling price";
      }
      if (form.stock.trim() && (isNaN(Number(form.stock)) || Number(form.stock) < 0)) {
        nextErrs.stock = "Enter a valid stock quantity (0 or more)";
      }
      if (
        form.lowStockThreshold?.trim() &&
        (isNaN(Number(form.lowStockThreshold)) || Number(form.lowStockThreshold) < 0)
      ) {
        nextErrs.lowStockThreshold = "Enter a valid threshold (0 or more)";
      }
    }

    setErrors((prev) => ({ ...prev, ...nextErrs }));
    return Object.keys(nextErrs).length === 0;
  }, [form]);

  // Overall check across all steps
  const validateAll = useCallback((): boolean => {
    const errs1: Partial<Record<keyof ProductFormData, string>> = {};
    if (!form.name.trim()) errs1.name = "Product title is required";
    if (!form.category) errs1.category = "Category is required";
    if (!form.fabric) errs1.fabric = "Fabric is required";

    if (!form.price.trim() || isNaN(Number(form.price)) || Number(form.price) <= 0) {
      errs1.price = "Enter a valid selling price";
    }
    if (
      form.originalPrice.trim() &&
      (isNaN(Number(form.originalPrice)) || Number(form.originalPrice) <= 0)
    ) {
      errs1.originalPrice = "Enter a valid original price";
    }
    if (form.stock.trim() && (isNaN(Number(form.stock)) || Number(form.stock) < 0)) {
      errs1.stock = "Enter a valid stock quantity";
    }

    setErrors(errs1);
    return Object.keys(errs1).length === 0;
  }, [form]);

  const handleNextStep = useCallback(() => {
    if (currentStep === 1) {
      if (!validateStep(1)) return;
      setCurrentStep(2);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (currentStep === 2) {
      // Allow proceeding to step 3 even if images are being finalized, but validate
      validateStep(2);
      setCurrentStep(3);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (currentStep === 3) {
      if (!validateStep(3)) return;
      setCurrentStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [currentStep, validateStep]);

  const handleStepClick = useCallback((step: StepNumber) => {
    // If moving forward from Step 1, validate step 1
    if (currentStep === 1 && step > 1) {
      if (!validateStep(1)) return;
    }
    setCurrentStep(step);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep, validateStep]);

  // Handle final submission to POST /api/products
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateAll()) {
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
        basePrice: parseInt(form.price, 10),
        price: parseInt(form.price, 10),
        originalPrice: form.originalPrice.trim() ? parseInt(form.originalPrice, 10) : null,
        stock: form.stock.trim() ? parseInt(form.stock, 10) : 10,
        lowStockThreshold: form.lowStockThreshold?.trim() ? parseInt(form.lowStockThreshold, 10) : 5,
        images: form.images.filter(Boolean),
        videos: (form.videos || []).filter(Boolean),
        variants: form.variants
          .filter((v) => v.attributes && v.attributes.length > 0)
          .map((v) => ({
            attributes: v.attributes,
            stock: v.stock.trim() ? parseInt(v.stock, 10) : 0,
            price: v.price.trim() ? parseInt(v.price, 10) : null,
            sku: v.sku.trim() || null,
            image: v.image.trim() || null,
          })),
        specifications: form.specifications
          .filter((s) => s.key.trim() && s.value.trim())
          .map((s) => ({ key: s.key.trim(), value: s.value.trim() })),
        deliveryInfo: form.deliveryInfo.trim() || "Ships within 2-3 business days",
        returnPolicy: form.returnPolicy.trim() || "7-day return and replacement policy",
        isBestSeller: form.isBestSeller,
        isNewArrival: form.isNewArrival,
        status: "pending",
      };

      const res = await apiFetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (data.code === "VENDOR_NOT_FOUND") {
          throw new Error("Vendor profile not found for this account. If you just registered as a seller, please complete your onboarding or contact support.");
        } else if (data.code === "VENDOR_PENDING") {
          throw new Error("Your seller registration is currently pending admin approval. You can submit products once approved.");
        } else if (data.code === "VENDOR_SUSPENDED") {
          throw new Error("Your seller account has been suspended. You cannot submit products at this time.");
        } else if (data.code === "VENDOR_DEACTIVATED") {
          throw new Error("Your seller account has been deactivated. Please contact seller support.");
        } else if (data.code === "VENDOR_REJECTED") {
          throw new Error(data.error || "Your seller registration was rejected. Please contact seller support.");
        } else if (data.code === "VENDOR_PROFILE_INCOMPLETE") {
          throw new Error("Your seller profile is incomplete. Please complete all required business details before submitting products.");
        }
        throw new Error(data.error || "Failed to submit product for approval");
      }
      const createdProduct = await res.json().catch(() => ({}));

      // Cleanup local draft on successful creation
      try {
        localStorage.removeItem(draftStorageKey);
      } catch {}

      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products/facets"] });
      queryClient.invalidateQueries({ queryKey: ["/api/seller/products"] });
      queryClient.invalidateQueries({ queryKey: ["/seller/products"] });

      if (createdProduct?.id) {
        queryClient.setQueryData([`/api/products/${createdProduct.id}`], createdProduct);
        queryClient.invalidateQueries({ queryKey: [`/api/products/${createdProduct.id}`] });
      }

      window.dispatchEvent(
        new CustomEvent("vastraa-realtime-event", {
          detail: {
            name: "product:created",
            data: {
              id: createdProduct?.id,
              productId: createdProduct?.id,
              product: createdProduct,
              ...(createdProduct || {}),
            },
          },
        })
      );

      setSuccess(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => setLocation("/seller/products"), 1500);
    } catch (err: any) {
      setApiError(err.message || "Failed to submit product for approval");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSubmitting(false);
    }
  }

  // Specifications management
  const addSpec = () => {
    setForm((prev) => ({
      ...prev,
      specifications: [...prev.specifications, { key: "", value: "" }],
    }));
  };

  const updateSpec = (idx: number, field: "key" | "value", val: string) => {
    setForm((prev) => {
      const specs = prev.specifications.map((s, i) => (i === idx ? { ...s, [field]: val } : s));
      return { ...prev, specifications: specs };
    });
  };

  const removeSpec = (idx: number) => {
    setForm((prev) => ({
      ...prev,
      specifications: prev.specifications.filter((_, i) => i !== idx),
    }));
  };

  // Completion statuses
  const step1Complete = Boolean(form.name.trim() && form.category && form.fabric);
  const step2Complete = form.images.filter(Boolean).length > 0;
  const step3Complete = Boolean(form.price.trim() && !isNaN(Number(form.price)) && Number(form.price) > 0);

  // Discount percentage calculator
  const discountPercent = useMemo(() => {
    const sp = parseFloat(form.price);
    const op = parseFloat(form.originalPrice);
    if (!isNaN(sp) && !isNaN(op) && op > sp && sp > 0) {
      return Math.round(((op - sp) / op) * 100);
    }
    return null;
  }, [form.price, form.originalPrice]);

  return (
    <SellerLayout title="Add Product">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        
        {/* Toast alert */}
        {toastMessage && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 bg-[#0A1F44] text-white px-4 py-3 rounded-xl shadow-xl text-sm border border-white/10 animate-in fade-in slide-in-from-bottom-3">
            <CheckCircle2 size={18} className="text-[#D4AF37] shrink-0" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* ── Page Header ────────────────────────────────────────────────── */}
        <div className="space-y-4 border-b border-[#E5E8EC] pb-6">
          <nav className="flex items-center gap-1.5 text-xs text-[#7a5f4e]">
            <button
              onClick={() => {
                if (isDirty) setShowDiscardDialog(true);
                else setLocation("/seller/dashboard");
              }}
              className="hover:text-[#0A1F44] transition-colors"
            >
              Seller Dashboard
            </button>
            <ChevronRight size={12} className="opacity-60" />
            <button
              onClick={() => {
                if (isDirty) setShowDiscardDialog(true);
                else setLocation("/seller/products");
              }}
              className="hover:text-[#0A1F44] transition-colors"
            >
              Products
            </button>
            <ChevronRight size={12} className="opacity-60" />
            <span className="font-semibold text-[#0A1F44]">Add Product</span>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isDirty) setShowDiscardDialog(true);
                  else setLocation("/seller/products");
                }}
                className="p-2.5 rounded-xl border border-[#E5E8EC] bg-white hover:bg-[#F4F5F7] text-[#0A1F44] transition-all shadow-2xs group"
                title="Back to products"
              >
                <ArrowLeft size={18} className="group-hover:-translate-x-0.5 transition-transform" />
              </button>
              <div>
                <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#0A1F44]">
                  Add a Product
                  <span className="sr-only"> - Add New Product</span>
                </h1>
                <p className="text-xs sm:text-sm text-[#7a5f4e] mt-0.5">
                  List your product on VASTRAA in a few simple steps.
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              {(vendor as any)?.shopName && (
                <div className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#0A1F44]/5 border border-[#0A1F44]/10 text-xs font-medium text-[#0A1F44]">
                  <Store size={13} className="text-[#0A1F44]" />
                  <span>Listing as: <strong>{(vendor as any).shopName}</strong></span>
                </div>
              )}

              <button
                type="button"
                onClick={handleSaveDraft}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#D6C9BA] bg-white hover:bg-[#FDFBF8] text-xs font-semibold text-[#5a4a3a] transition-all shadow-2xs"
                title="Save product as local draft"
              >
                <Bookmark size={13} />
                <span>Save as Draft</span>
              </button>

              <button
                type="button"
                onClick={() => setShowPreviewModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0A1F44]/20 bg-[#0A1F44]/5 hover:bg-[#0A1F44]/10 text-xs font-semibold text-[#0A1F44] transition-all"
                title="Preview customer storefront appearance"
              >
                <Eye size={13} />
                <span>Preview</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── Draft Recovery Banner ────────────────────────────────────────── */}
        {hasDraftNotice && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs shadow-2xs">
            <div className="flex items-center gap-2">
              <Info size={16} className="text-amber-600 shrink-0" />
              <span>
                You have a saved draft from <strong>{draftTime || "recently"}</strong>. Would you like to resume?
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleRestoreDraft}
                className="px-3 py-1 rounded-md bg-amber-600 text-white font-semibold hover:bg-amber-700 transition-colors"
              >
                Resume Draft
              </button>
              <button
                type="button"
                onClick={handleDismissDraft}
                className="px-2.5 py-1 rounded-md border border-amber-300 bg-white text-amber-800 hover:bg-amber-50 transition-colors"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* ── Status Notifications ─────────────────────────────────────────── */}
        {success && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold shadow-xs animate-in fade-in">
            <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
            <span>Product submitted for approval successfully! Redirecting to your inventory…</span>
          </div>
        )}

        {apiError && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm font-medium shadow-xs animate-in fade-in">
            <AlertCircle size={20} className="text-red-500 shrink-0" />
            <span>{apiError}</span>
          </div>
        )}

        {/* ── Amazon Seller Central Step Stepper ───────────────────────────── */}
        <div className="bg-white rounded-2xl border border-[#E5E8EC] p-3 sm:p-4 shadow-2xs">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
            {STEPS.map((step) => {
              const isCurrent = currentStep === step.id;
              const isPassed =
                (step.id === 1 && step1Complete) ||
                (step.id === 2 && step2Complete) ||
                (step.id === 3 && step3Complete);

              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => handleStepClick(step.id)}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all relative ${
                    isCurrent
                      ? "border-[#0A1F44] bg-[#0A1F44]/5 shadow-xs ring-1 ring-[#0A1F44]"
                      : isPassed
                      ? "border-emerald-200 bg-emerald-50/40 hover:border-emerald-300"
                      : "border-gray-200 bg-[#FBFBFC] hover:bg-white hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-colors ${
                      isCurrent
                        ? "bg-[#0A1F44] text-white"
                        : isPassed
                        ? "bg-emerald-600 text-white"
                        : "bg-gray-200 text-gray-600"
                    }`}
                  >
                    {isPassed && !isCurrent ? <Check size={13} strokeWidth={3} /> : step.id}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs font-bold truncate ${isCurrent ? "text-[#0A1F44]" : "text-gray-800"}`}>
                        {step.title}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-500 truncate hidden sm:block mt-0.5">
                      {step.desc}
                    </p>
                  </div>
                  {isCurrent && (
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0A1F44] absolute top-2 right-2" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Form Container ──────────────────────────────────────────────── */}
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {/* ================================================================= */}
          {/* STEP 1: Product Information                                       */}
          {/* ================================================================= */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Section 1A: Basic Identification */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F0F2F5] pb-3">
                  <div className="flex items-center gap-2">
                    <Info size={16} className="text-[#0A1F44]" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                      Basic Product Identity
                    </h2>
                  </div>
                  <span className="text-[11px] text-gray-400">Step 1 of 4</span>
                </div>

                {/* Product Title */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[#333]">
                      Product Title <span className="text-red-500">*</span>
                    </label>
                    <span className="text-[11px] text-gray-400">
                      {form.name.length} / 120 characters
                    </span>
                  </div>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    maxLength={120}
                    placeholder="e.g. Peacock Paithani Silk Saree"
                    className={`w-full px-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                      errors.name
                        ? "border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-400/20"
                        : "border-[#D6C9BA] bg-[#FDFBF8] focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    }`}
                  />
                  {errors.name ? (
                    <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                      <AlertCircle size={12} /> {errors.name}
                    </p>
                  ) : (
                    <p className="text-[11px] text-gray-400 mt-1">
                      Include saree style, fabric, and defining motif (e.g. Royal Blue Pure Silk Paithani Saree with Peacock Zari Border).
                    </p>
                  )}
                </div>

                {/* Category & Subcategory Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="seller-product-category" className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Product Category <span className="text-red-500">*</span>
                    </label>
                    <select
                      id="seller-product-category"
                      value={form.category}
                      onChange={(e) => handleChange("category", e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm text-[#111] font-medium outline-none cursor-pointer focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    >
                      {categoryOptions.map((cat) => (
                        <option key={cat.value} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                    {errors.category && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {errors.category}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="seller-product-subcategory" className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Subcategory <span className="text-gray-400 font-normal">(Dynamic by Category)</span>
                    </label>
                    <select
                      id="seller-product-subcategory"
                      value={form.subcategory}
                      onChange={(e) => handleChange("subcategory", e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm text-[#111] outline-none cursor-pointer focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    >
                      <option value="">Select subcategory...</option>
                      {subcategories.map((sub) => (
                        <option key={sub.id} value={sub.name}>
                          {sub.name}
                        </option>
                      ))}
                    </select>
                    {errors.subcategory && (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {errors.subcategory}
                      </p>
                    )}
                    <p className="text-[11px] text-gray-500 mt-1">
                      {subcategories.length > 0
                        ? `Available subcategories for ${categoryOptions.find((c) => c.value === form.category)?.label || form.category}`
                        : "Select a parent category to load matching subcategories"}
                    </p>
                  </div>
                </div>

                {/* Brand & Fabric */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Brand
                    </label>
                    <input
                      type="text"
                      value={form.brand}
                      onChange={(e) => handleChange("brand", e.target.value)}
                      placeholder="e.g. VASTRAA Signature or your label"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">
                      Leave blank to list under your seller shop name.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Fabric / Material <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={form.fabric}
                      onChange={(e) => handleChange("fabric", e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none cursor-pointer focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15 capitalize"
                    >
                      {FABRICS.map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                    {errors.fabric && (
                      <p className="text-xs text-red-500 mt-1">{errors.fabric}</p>
                    )}
                  </div>
                </div>

                {/* Saree Type & Style */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Saree Type
                    </label>
                    <input
                      type="text"
                      value={form.sareeType}
                      onChange={(e) => handleChange("sareeType", e.target.value)}
                      placeholder={form.category === "paithani" ? "e.g. Yeola Paithani" : "e.g. Bollywood Designer Saree"}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Saree Style
                    </label>
                    <input
                      type="text"
                      value={form.sareeStyle}
                      onChange={(e) => handleChange("sareeStyle", e.target.value)}
                      placeholder="e.g. Traditional, Royal Bridal, Party Drape"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                  </div>
                </div>

                {/* Product Description */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold uppercase tracking-wide text-[#333]">
                      Product Description
                    </label>
                    <span className="text-[11px] text-gray-400">
                      {form.description.length} / 1000 characters
                    </span>
                  </div>
                  <textarea
                    rows={4}
                    value={form.description}
                    onChange={(e) => handleChange("description", e.target.value)}
                    maxLength={1000}
                    placeholder="Describe the saree — weave heritage, zari purity, pallu artwork, texture, and drape feel..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none resize-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                  />
                  <div className="mt-2 p-2.5 rounded-lg bg-[#0A1F44]/5 border border-[#0A1F44]/10 text-[11px] text-[#4a3b2c] flex items-center gap-2">
                    <Sparkles size={14} className="text-[#D4AF37] shrink-0" />
                    <span>
                      <strong>Listing Tip:</strong> Highlighting authentic handloom details (e.g. &apos;Handwoven on traditional pit looms in Yeola&apos;) enhances customer trust.
                    </span>
                  </div>
                </div>
              </div>

              {/* Section 1B: Progressive Disclosure — Advanced Attributes */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 shadow-2xs">
                <button
                  type="button"
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="w-full flex items-center justify-between text-left group"
                >
                  <div className="flex items-center gap-2">
                    <Layers size={16} className="text-[#0A1F44]" />
                    <span className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                      Advanced Saree Attributes
                    </span>
                    <span className="text-xs text-gray-400 font-normal">
                      (Color, Design Pattern, Blouse, Specifications)
                    </span>
                  </div>
                  <div className="p-1 rounded-lg bg-gray-100 group-hover:bg-gray-200 text-gray-600 transition-colors">
                    {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </div>
                </button>

                {showAdvanced && (
                  <div className="mt-5 pt-5 border-t border-[#F0F2F5] space-y-4 animate-in fade-in duration-150">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      {/* Color */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#555] mb-1">
                          Primary Color
                        </label>
                        <select
                          value={form.color}
                          onChange={(e) => handleChange("color", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none cursor-pointer capitalize"
                        >
                          {COLORS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Occasion */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#555] mb-1">
                          Occasion
                        </label>
                        <select
                          value={form.occasion}
                          onChange={(e) => handleChange("occasion", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none cursor-pointer capitalize"
                        >
                          {OCCASIONS.map((o) => (
                            <option key={o} value={o}>
                              {o}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Design Pattern */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#555] mb-1">
                          Design Pattern
                        </label>
                        <input
                          type="text"
                          value={form.designPattern}
                          onChange={(e) => handleChange("designPattern", e.target.value)}
                          placeholder="e.g. Peacock motif, zari border"
                          className="w-full px-3 py-2 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Collection filter */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#555] mb-1">
                          Collection Filter
                        </label>
                        <input
                          type="text"
                          value={form.collection}
                          onChange={(e) => handleChange("collection", e.target.value)}
                          placeholder="e.g. royal-festival, bridal-paithani"
                          className="w-full px-3 py-2 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none"
                        />
                      </div>

                      {/* Subcategory */}
                      <div>
                        <label className="block text-xs font-semibold uppercase tracking-wide text-[#555] mb-1">
                          Subcategory
                        </label>
                        <select
                          value={form.subcategory}
                          onChange={(e) => handleChange("subcategory", e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none cursor-pointer"
                        >
                          <option value="">Select subcategory...</option>
                          {subcategories.map((sub) => (
                            <option key={sub.id} value={sub.name}>
                              {sub.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Blouse Included checkbox */}
                    <div className="pt-2">
                      <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={form.blouseIncluded}
                          onChange={(e) => handleChange("blouseIncluded", e.target.checked)}
                          className="w-4 h-4 rounded text-[#0A1F44] focus:ring-0 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-[#333]">
                          Includes Unstitched Matching Blouse Piece (0.8m)
                        </span>
                      </label>
                    </div>

                    {/* Specifications table */}
                    <div className="pt-3 border-t border-[#F0F2F5] space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#555]">
                          Custom Saree Specifications
                        </span>
                        <button
                          type="button"
                          onClick={addSpec}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#0A1F44] hover:underline"
                        >
                          <Plus size={13} /> Add Attribute
                        </button>
                      </div>

                      {form.specifications.map((s, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={s.key}
                            onChange={(e) => updateSpec(idx, "key", e.target.value)}
                            placeholder="Attribute (e.g. Weave)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none"
                          />
                          <input
                            type="text"
                            value={s.value}
                            onChange={(e) => updateSpec(idx, "value", e.target.value)}
                            placeholder="Value (e.g. Handwoven Pure Silk)"
                            className="flex-1 px-3 py-1.5 rounded-lg border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => removeSpec(idx)}
                            className="p-1.5 text-red-400 hover:text-red-600 rounded"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 2: Images & Variants                                         */}
          {/* ================================================================= */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Product Images Card */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F0F2F5] pb-3">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-[#0A1F44]" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                      Product Photography &amp; Media
                    </h2>
                  </div>
                  <span className="text-[11px] text-gray-400">Step 2 of 4</span>
                </div>

                {/* Amazon Image Standard Box */}
                <div className="p-3.5 rounded-xl bg-[#0A1F44]/5 border border-[#0A1F44]/10 text-xs text-[#3a2c1f] space-y-1">
                  <p className="font-semibold text-[#0A1F44] flex items-center gap-1.5">
                    <ShieldCheck size={14} className="text-[#0A1F44]" />
                    Photo Standards for VASTRAA Artisans
                  </p>
                  <ul className="list-disc list-inside text-[11px] text-gray-600 space-y-0.5">
                    <li>First image becomes the <strong>Main Storefront Cover</strong> (tagged with the &apos;Main&apos; badge).</li>
                    <li>Drag and drop cards to reorder your photos at any time.</li>
                    <li>Include clear close-ups of the zari border, pallu motif, and fabric texture.</li>
                  </ul>
                </div>

                {/* Live R2 Upload Gallery */}
                <ImageUploadGallery
                  images={form.images}
                  onImagesChange={(urls) => handleChange("images", urls)}
                />

                {errors.images && form.images.length === 0 && (
                  <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-200 flex items-center gap-1.5">
                    <AlertTriangle size={14} /> {errors.images}
                  </p>
                )}
              </div>

              {/* Variants Section */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                      Saree Variants
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Does this saree design come in multiple colours or borders?
                    </p>
                  </div>

                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-xs font-semibold text-gray-700">
                      {hasVariants ? "Variants Enabled" : "No Variants (Single Piece)"}
                    </span>
                    <input
                      type="checkbox"
                      checked={hasVariants}
                      onChange={(e) => {
                        setHasVariants(e.target.checked);
                        if (!e.target.checked) {
                          handleChange("variants", []);
                          handleChange("attributeGroups", []);
                        }
                      }}
                      className="w-4 h-4 rounded text-[#0A1F44] cursor-pointer"
                    />
                  </label>
                </div>

                {hasVariants ? (
                  <div className="pt-3 border-t border-[#F0F2F5]">
                    <AttributeVariantBuilder
                      attributeGroups={form.attributeGroups}
                      variants={form.variants}
                      onAttributeGroupsChange={(groups) => handleChange("attributeGroups", groups)}
                      onVariantsChange={(variants) => handleChange("variants", variants)}
                    />
                  </div>
                ) : (
                  <div className="p-3.5 rounded-xl bg-gray-50 text-xs text-gray-500 border border-gray-100 flex items-center gap-2">
                    <Info size={14} className="text-gray-400 shrink-0" />
                    <span>
                      Listing this item as a standalone product. Pricing and stock will be managed in Step 3.
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 3: Pricing & Inventory                                       */}
          {/* ================================================================= */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 space-y-6 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F0F2F5] pb-3">
                  <div className="flex items-center gap-2">
                    <DollarSign size={16} className="text-[#0A1F44]" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                      Pricing &amp; Inventory Management
                    </h2>
                  </div>
                  <span className="text-[11px] text-gray-400">Step 3 of 4</span>
                </div>

                {/* Selling Price & MRP */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Selling Price (₹) <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={form.price}
                        onChange={(e) => handleChange("price", e.target.value)}
                        placeholder="15000"
                        className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                          errors.price
                            ? "border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-400/20"
                            : "border-[#D6C9BA] bg-[#FDFBF8] focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                        }`}
                      />
                    </div>
                    {errors.price ? (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {errors.price}
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Customer price displayed across VASTRAA product pages and checkout.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Original Price / MRP (₹)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-semibold">
                        ₹
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={form.originalPrice}
                        onChange={(e) => handleChange("originalPrice", e.target.value)}
                        placeholder="Optional (e.g. 18000)"
                        className={`w-full pl-8 pr-3.5 py-2.5 rounded-xl border text-sm outline-none transition-all ${
                          errors.originalPrice
                            ? "border-red-400 bg-red-50/20 focus:ring-2 focus:ring-red-400/20"
                            : "border-[#D6C9BA] bg-[#FDFBF8] focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                        }`}
                      />
                    </div>
                    {errors.originalPrice ? (
                      <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                        <AlertCircle size={12} /> {errors.originalPrice}
                      </p>
                    ) : discountPercent !== null ? (
                      <p className="text-xs text-emerald-600 font-semibold mt-1">
                        ✓ Shows as {discountPercent}% OFF discount badge on storefront
                      </p>
                    ) : (
                      <p className="text-[11px] text-gray-400 mt-1">
                        Leave blank if product does not have a marked-down discount.
                      </p>
                    )}
                  </div>
                </div>

                {/* Stock, Low Stock & SKU */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-[#F0F2F5]">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Available Stock <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.stock}
                      onChange={(e) => handleChange("stock", e.target.value)}
                      placeholder="10"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                    {errors.stock && (
                      <p className="text-xs text-red-500 mt-1">{errors.stock}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Low Stock Alert
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.lowStockThreshold}
                      onChange={(e) => handleChange("lowStockThreshold", e.target.value)}
                      placeholder="5"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Notifies when stock drops below this.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Seller SKU / Code
                    </label>
                    <input
                      type="text"
                      value={(form as any).sku || ""}
                      onChange={(e) => handleChange("sku" as any, e.target.value)}
                      placeholder="e.g. PAI-ROYAL-001"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-sm outline-none focus:border-[#0A1F44] focus:ring-2 focus:ring-[#0A1F44]/15"
                    />
                    <p className="text-[11px] text-gray-400 mt-1">Optional internal stock reference.</p>
                  </div>
                </div>

                {/* Amazon-style Earnings Breakdown */}
                <div className="pt-3 border-t border-[#F0F2F5]">
                  <LiveEarningsEstimator priceInput={form.price} />
                </div>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 4: Shipping & Review                                         */}
          {/* ================================================================= */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              
              {/* Shipping & Pickup Details */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F0F2F5] pb-3">
                  <div className="flex items-center gap-2">
                    <Truck size={16} className="text-[#0A1F44]" />
                    <h2 className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                      Dispatch &amp; Pickup Logistics
                    </h2>
                  </div>
                  <span className="text-[11px] text-gray-400">Step 4 of 4</span>
                </div>

                {/* Saved Business Profile Pickup Hub */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0">
                    <ShieldCheck size={18} />
                  </div>
                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">
                        Dispatched from: {(vendor as any)?.shopName || vendor?.name || "Yeola Weavers Hub"}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        Verified Pickup Address
                      </span>
                    </div>
                    <p className="text-gray-500">
                      Location: {(vendor as any)?.pickupCity || (vendor as any)?.shopCity || vendor?.location || "Yeola, Nashik"} 
                      {((vendor as any)?.pickupPincode || (vendor as any)?.shopPincode) && ` (Pincode: ${(vendor as any)?.pickupPincode || (vendor as any)?.shopPincode})`}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Courier pickups are arranged automatically from this address upon order confirmation.
                    </p>
                  </div>
                </div>

                {/* Delivery & Return Policies */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Estimated Delivery Timeline
                    </label>
                    <input
                      type="text"
                      value={form.deliveryInfo || "Ships within 2-3 business days"}
                      onChange={(e) => handleChange("deliveryInfo", e.target.value)}
                      placeholder="e.g. Ships within 2-3 business days"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wide text-[#333] mb-1.5">
                      Customer Return Policy
                    </label>
                    <input
                      type="text"
                      value={form.returnPolicy || "7-day easy returns & replacement"}
                      onChange={(e) => handleChange("returnPolicy", e.target.value)}
                      placeholder="e.g. 7-day easy returns & replacement"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#D6C9BA] bg-[#FDFBF8] text-xs outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Comprehensive Product Review Summary Card */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 sm:p-6 space-y-5 shadow-2xs">
                <div className="flex items-center justify-between border-b border-[#F0F2F5] pb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#0A1F44]">
                    Listing Summary Review
                  </h3>
                  <button
                    type="button"
                    onClick={() => setShowPreviewModal(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0A1F44] hover:underline"
                  >
                    <Eye size={13} /> Full Customer Preview
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                  {/* Image Thumbnail Column */}
                  <div className="md:col-span-3">
                    <div className="aspect-square rounded-xl bg-gray-100 border border-gray-200 overflow-hidden relative">
                      {form.images[0] ? (
                        <img
                          src={form.images[0]}
                          alt={form.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-1 p-3 text-center">
                          <Package size={28} />
                          <span className="text-[11px]">No image uploaded</span>
                        </div>
                      )}
                      {form.images.length > 1 && (
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/70 text-white text-[10px] font-semibold">
                          +{form.images.length - 1} photos
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Summary Details */}
                  <div className="md:col-span-6 space-y-2">
                    <div className="inline-flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded-md bg-[#0A1F44]/10 text-[#0A1F44] text-[10px] font-bold uppercase">
                        {form.category}
                      </span>
                      {form.brand && (
                        <span className="text-xs font-semibold text-gray-500">
                          {form.brand}
                        </span>
                      )}
                    </div>
                    <h4 className="font-serif text-lg font-bold text-[#0A1F44]">
                      {form.name || "Untitled Saree"}
                    </h4>
                    <p className="text-xs text-gray-500 line-clamp-2">
                      {form.description || "No description provided."}
                    </p>

                    <div className="flex flex-wrap gap-2 pt-1 text-[11px] text-gray-600">
                      <span className="px-2 py-0.5 rounded bg-gray-100 font-medium">
                        Fabric: <strong>{form.fabric}</strong>
                      </span>
                      <span className="px-2 py-0.5 rounded bg-gray-100 font-medium">
                        Color: <strong>{form.color}</strong>
                      </span>
                      {form.blouseIncluded && (
                        <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 font-medium">
                          ✓ Blouse piece included
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pricing & Stock Card */}
                  <div className="md:col-span-3 p-4 rounded-xl bg-[#FAFAFB] border border-[#E5E8EC] space-y-2 text-right md:text-left">
                    <div>
                      <span className="text-[11px] text-gray-400 uppercase font-semibold">Customer Price</span>
                      <div className="text-xl font-bold text-[#0A1F44]">
                        ₹{Number(form.price || 0).toLocaleString("en-IN")}
                      </div>
                      {form.originalPrice && Number(form.originalPrice) > Number(form.price) && (
                        <div className="text-xs text-gray-400 line-through">
                          MRP: ₹{Number(form.originalPrice).toLocaleString("en-IN")}
                        </div>
                      )}
                    </div>

                    <div className="pt-2 border-t border-gray-200/60 text-xs text-gray-600 space-y-0.5">
                      <div>Stock: <strong>{form.stock || "0"} units</strong></div>
                      {form.variants.length > 0 && (
                        <div>Variants: <strong>{form.variants.length} combinations</strong></div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Validation & Quality Checklist */}
              <div className="bg-white rounded-2xl border border-[#E5E8EC] p-5 shadow-2xs space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-600">
                  Listing Completeness Checklist
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      step1Complete ? "border-emerald-200 bg-emerald-50/40 text-emerald-900" : "border-red-200 bg-red-50/40 text-red-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {step1Complete ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-red-500" />}
                      <span className="font-semibold">Step 1: Information</span>
                    </div>
                    {!step1Complete && (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(1)}
                        className="text-[11px] font-bold text-red-700 underline"
                      >
                        Fix
                      </button>
                    )}
                  </div>

                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      step2Complete ? "border-emerald-200 bg-emerald-50/40 text-emerald-900" : "border-amber-200 bg-amber-50/40 text-amber-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {step2Complete ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertTriangle size={16} className="text-amber-500" />}
                      <span className="font-semibold">Step 2: Media ({form.images.length} photos)</span>
                    </div>
                    {!step2Complete && (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(2)}
                        className="text-[11px] font-bold text-amber-700 underline"
                      >
                        Add Photo
                      </button>
                    )}
                  </div>

                  <div
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs ${
                      step3Complete ? "border-emerald-200 bg-emerald-50/40 text-emerald-900" : "border-red-200 bg-red-50/40 text-red-900"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {step3Complete ? <CheckCircle2 size={16} className="text-emerald-600" /> : <AlertCircle size={16} className="text-red-500" />}
                      <span className="font-semibold">Step 3: Pricing</span>
                    </div>
                    {!step3Complete && (
                      <button
                        type="button"
                        onClick={() => setCurrentStep(3)}
                        className="text-[11px] font-bold text-red-700 underline"
                      >
                        Fix
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Persistent Bottom Action Bar ───────────────────────────────── */}
          <div className="sticky bottom-0 z-20 bg-white/95 backdrop-blur-md border-t border-[#E5E8EC] -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3.5 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  if (isDirty) setShowDiscardDialog(true);
                  else setLocation("/seller/products");
                }}
                className="px-4 py-2.5 rounded-xl border border-[#D6C9BA] text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveDraft}
                className="px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-50 transition-colors hidden sm:inline-block"
              >
                Save as Draft
              </button>
            </div>

            <div className="flex items-center gap-3">
              {currentStep > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    setCurrentStep((prev) => (Math.max(1, prev - 1) as StepNumber));
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="px-5 py-2.5 rounded-xl border border-[#0A1F44]/30 bg-white hover:bg-gray-50 text-xs font-bold text-[#0A1F44] transition-colors"
                >
                  Previous
                </button>
              )}

              {currentStep < 4 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="px-6 py-2.5 rounded-xl bg-[#0A1F44] hover:bg-[#1B365D] text-white text-xs font-bold shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>Continue: {(STEPS as readonly { title: string }[])[currentStep]?.title || "Next"}</span>
                  <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={submitting}
                  aria-label="Create Product - Submit for Approval"
                  className="px-7 py-2.5 rounded-xl bg-[#0A1F44] hover:bg-[#1B365D] text-white text-xs font-bold shadow-md transition-all disabled:opacity-60 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 size={15} className="animate-spin" />
                      <span>Submitting Listing…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={15} className="text-[#D4AF37]" />
                      <span>Submit for Approval</span>
                      <span className="sr-only">Create Product</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>

        {/* ── Discard Changes Confirmation Modal ──────────────────────────── */}
        {showDiscardDialog && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-2xs animate-in fade-in">
            <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl border border-gray-100">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center">
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 className="font-serif text-lg font-bold text-[#0A1F44]">
                  Discard unsaved listing?
                </h3>
                <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                  You have entered details for this product. You can save your work as a draft to finish later, or discard your changes.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    handleSaveDraft();
                    setShowDiscardDialog(false);
                    setLocation("/seller/products");
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-[#0A1F44] text-white text-xs font-bold hover:bg-[#1B365D] transition-colors"
                >
                  Save Draft &amp; Exit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDiscardDialog(false);
                    setLocation("/seller/products");
                  }}
                  className="px-4 py-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
                >
                  Discard
                </button>
                <button
                  type="button"
                  onClick={() => setShowDiscardDialog(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs font-semibold transition-colors"
                >
                  Keep Editing
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Product Preview Modal ────────────────────────────────────────── */}
        {showPreviewModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs overflow-y-auto">
            <div className="bg-white rounded-2xl max-w-3xl w-full my-8 p-6 space-y-5 shadow-2xl border border-gray-200 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between border-b pb-3">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold uppercase">
                    Customer Storefront Preview
                  </span>
                  <span className="text-xs text-gray-400">Not live yet</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowPreviewModal(false)}
                  className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
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
                        alt={form.name}
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
                  className="px-5 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
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
