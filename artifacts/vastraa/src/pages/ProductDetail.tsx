import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import {
  useGetProduct,
  useListProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Star,
  ChevronRight,
  ChevronLeft,
  ShoppingBag,
  Package,
  ArrowLeft,
  ZoomIn,
  X,
  Truck,
  RotateCcw,
  Shield,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { ProductCard } from "@/components/ProductCard";
import { ProductDetailsSkeleton } from "@/components/skeletons";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { isPaithaniProduct, isDesignerProduct } from "@/constants/categories";

const RECENTLY_VIEWED_KEY = "twirl_recently_viewed";
function trackRecentlyViewed(productId: string) {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
    const updated = [productId, ...prev.filter((id) => id !== productId)].slice(0, 20);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch {}
}



function ZoomLightbox({
  images,
  activeIndex,
  onClose,
  onNav,
}: {
  images: string[];
  activeIndex: number;
  onClose: () => void;
  onNav: (dir: 1 | -1) => void;
}) {
  const [imgScale, setImgScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  const pinchStartDist = useRef<number | null>(null);
  const pinchStartScale = useRef(1);
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const swipeStartX = useRef<number | null>(null);
  const lastTap = useRef(0);

  useEffect(() => {
    setImgScale(1);
    setPan({ x: 0, y: 0 });
  }, [activeIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && imgScale === 1) onNav(-1);
      if (e.key === "ArrowRight" && imgScale === 1) onNav(1);
    };
    window.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose, onNav, imgScale]);

  function dist(t: React.Touch, t2: React.Touch) {
    return Math.hypot(t2.clientX - t.clientX, t2.clientY - t.clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchStartDist.current = dist(e.touches[0], e.touches[1]);
      pinchStartScale.current = imgScale;
      dragStart.current = null;
      swipeStartX.current = null;
    } else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        setImgScale(1);
        setPan({ x: 0, y: 0 });
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
      swipeStartX.current = e.touches[0].clientX;
      dragStart.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        panX: pan.x,
        panY: pan.y,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    e.stopPropagation();
    if (e.touches.length === 2 && pinchStartDist.current !== null) {
      const newDist = dist(e.touches[0], e.touches[1]);
      const ratio = newDist / pinchStartDist.current;
      const newScale = Math.min(5, Math.max(1, pinchStartScale.current * ratio));
      setImgScale(newScale);
      if (newScale === 1) setPan({ x: 0, y: 0 });
    } else if (e.touches.length === 1 && dragStart.current && imgScale > 1) {
      const dx = e.touches[0].clientX - dragStart.current.x;
      const dy = e.touches[0].clientY - dragStart.current.y;
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
      swipeStartX.current = null;
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (imgScale <= 1 && swipeStartX.current !== null) {
      const deltaX = (e.changedTouches[0]?.clientX ?? 0) - swipeStartX.current;
      if (Math.abs(deltaX) > 50) onNav(deltaX < 0 ? 1 : -1);
    }
    if (e.touches.length < 2) pinchStartDist.current = null;
    if (e.touches.length === 0) dragStart.current = null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[999] bg-black/95 flex items-center justify-center select-none"
      onClick={imgScale === 1 ? onClose : undefined}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: "none" }}
    >
      <button
        aria-label="Close zoom lightbox"
        className="absolute top-[max(1rem,env(safe-area-inset-top,0px))] right-[max(1rem,env(safe-area-inset-right,0px))] p-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/80 hover:text-white transition-colors z-10 rounded-full hover:bg-white/10"
        onClick={onClose}
      >
        <X size={28} />
      </button>

      {images.length > 1 && imgScale === 1 && (
        <>
          <button
            aria-label="Previous image"
            className="absolute left-[max(1rem,env(safe-area-inset-left,0px))] p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
            onClick={(e) => { e.stopPropagation(); onNav(-1); }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            aria-label="Next image"
            className="absolute right-[max(1rem,env(safe-area-inset-right,0px))] p-3 min-w-[44px] min-h-[44px] flex items-center justify-center text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
            onClick={(e) => { e.stopPropagation(); onNav(1); }}
          >
            <ChevronRight size={24} />
          </button>
        </>
      )}

      <AnimatePresence mode="wait">
        <motion.img
          key={activeIndex}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.2 }}
          src={images[activeIndex]}
          alt="Product zoom"
          className="max-w-[90vw] max-h-[90vh] object-contain rounded"
          style={{
            transform: `scale(${imgScale}) translate(${pan.x / imgScale}px, ${pan.y / imgScale}px)`,
            cursor: imgScale > 1 ? "grab" : "zoom-in",
            transition: imgScale === 1 ? "transform 0.25s ease" : "none",
          }}
          onClick={(e) => e.stopPropagation()}
           onError={replaceProductImageWithFallback}
          draggable={false}
        />
      </AnimatePresence>

      {imgScale > 1 && (
        <button
          className="absolute bottom-4 right-4 text-[10px] text-white/60 bg-white/10 px-3 py-1 rounded-full"
          onClick={(e) => { e.stopPropagation(); setImgScale(1); setPan({ x: 0, y: 0 }); }}
        >
          Reset zoom
        </button>
      )}

      {images.length > 1 && imgScale === 1 && (
        <div className="absolute bottom-4 flex gap-2">
          {images.map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                i === activeIndex ? "bg-[#C7CCD1] scale-125" : "bg-white/40"
              )}
            />
          ))}
        </div>
      )}

      {imgScale === 1 && (
        <p className="absolute bottom-10 left-1/2 -translate-x-1/2 text-[10px] text-white/30 pointer-events-none">
          Pinch to zoom · Swipe to navigate
        </p>
      )}
    </motion.div>
  );
}

function DeliveryAccordion({
  isDesigner,
  deliveryInfo,
  returnPolicy,
}: {
  isDesigner?: boolean;
  deliveryInfo?: string | null;
  returnPolicy?: string | null;
}) {
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const panels = [
    {
      id: "delivery",
      icon: <Truck size={16} />,
      title: "Delivery Information",
      content: (
        <div className="space-y-3 text-sm leading-relaxed">
          {deliveryInfo && (
            <div className="flex gap-3 bg-[#0A1F44]/5 p-2.5 rounded border border-[#0A1F44]/10">
              <Truck size={14} className="text-[#0A1F44] mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-xs uppercase tracking-wider mb-0.5 text-[#0A1F44]">Seller Delivery Note</p>
                <p className="opacity-90 font-medium">{deliveryInfo}</p>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <Truck size={14} className="text-[#C7CCD1] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Standard Delivery (5–7 Business Days)</p>
              <p className="opacity-70">Orders are dispatched within 2 business days of confirmation. Delivery in 5–7 business days nationwide. Free shipping on all orders above ₹3,000; a flat ₹149 fee applies below that.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Package size={14} className="text-[#C7CCD1] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Express Delivery (2–3 Business Days)</p>
              <p className="opacity-70">Available at ₹299 additional charge. Dispatched same day if ordered before 2 PM. Select at checkout. Not available for remote PIN codes.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Shield size={14} className="text-[#C7CCD1] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Secure Packaging</p>
              <p className="opacity-70">Each saree is wrapped in acid-free tissue paper and a branded dust bag before dispatch.</p>
            </div>
          </div>
          <div className="pt-1 text-right">
            <Link href="/faqs#shipping-delivery" className="text-xs font-semibold text-[#0A1F44] hover:text-[#C7CCD1] transition-colors">
              More shipping FAQs →
            </Link>
          </div>
        </div>
      ),
    },
    {
      id: "returns",
      icon: <RotateCcw size={16} />,
      title: "Return & Exchange Policy",
      content: (
        <div className="space-y-3 text-sm leading-relaxed">
          {returnPolicy && (
            <div className="flex gap-3 bg-[#0A1F44]/5 p-2.5 rounded border border-[#0A1F44]/10">
              <RotateCcw size={14} className="text-[#0A1F44] mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-xs uppercase tracking-wider mb-0.5 text-[#0A1F44]">Seller Return Policy</p>
                <p className="opacity-90 font-medium">{returnPolicy}</p>
              </div>
            </div>
          )}
          <div className="flex gap-3">
            <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">7-Day Hassle-Free Returns</p>
              <p className="opacity-70">Return any unworn saree within 7 days of delivery. Original tags must be intact.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <RotateCcw size={14} className="text-[#C7CCD1] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Easy Exchange</p>
              <p className="opacity-70">Exchange for a different colour or size within 14 days. Shipping for exchanges is free of charge.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Shield size={14} className="text-[#C7CCD1] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Quality Guarantee</p>
              <p className="opacity-70">All products undergo a quality check before dispatch. If you receive a defective item, we'll replace it or issue a full refund.</p>
            </div>
          </div>
          <div className="pt-1 text-right">
            <Link href="/faqs#returns-exchanges" className="text-xs font-semibold text-[#0A1F44] hover:text-[#C7CCD1] transition-colors">
              Read our full return policy →
            </Link>
          </div>
        </div>
      ),
    },
  ];

  const borderColor = "border-[#C7CCD1]/20";
  const bg = "bg-white";

  return (
    <div className={cn("rounded-lg border overflow-hidden", borderColor, bg)}>
      {panels.map((panel, idx) => (
        <div key={panel.id} className={cn(idx > 0 && `border-t ${borderColor}`)}>
          <button
            className="w-full flex items-center justify-between p-4 text-left group"
            onClick={() => setOpenPanel(openPanel === panel.id ? null : panel.id)}
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span className="text-[#C7CCD1]">{panel.icon}</span>
              {panel.title}
            </div>
            <ChevronDown
              size={16}
              className={cn(
                "opacity-50 transition-transform duration-200",
                openPanel === panel.id && "rotate-180"
              )}
            />
          </button>
          <AnimatePresence>
            {openPanel === panel.id && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div className="px-4 pb-4">{panel.content}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ))}
    </div>
  );
}

function StarBar({
  stars,
  count,
  total,
  isDesigner,
}: {
  stars: number;
  count: number;
  total: number;
  isDesigner?: boolean;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-5 text-right opacity-70 font-semibold">{stars}★</span>
      <div className="flex-1 h-2 rounded-full overflow-hidden bg-[#C7CCD1]/40">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.1 * (5 - stars) }}
          className="h-full bg-[#0A1F44] rounded-full"
        />
      </div>
      <span className="w-6 opacity-60 text-right font-medium">{count}</span>
    </div>
  );
}

function ReviewsSection({
  productId,
  isDesigner,
}: {
  productId: string;
  isDesigner?: boolean;
}) {
  const queryClient = useQueryClient();
  const { user, isSignedIn } = useAuth();

  const [showReviewForm, setShowReviewForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitRating, setSubmitRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [submitName, setSubmitName] = useState(user?.name || "");
  const [submitComment, setSubmitComment] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const [showQueryForm, setShowQueryForm] = useState(false);
  const [queryName, setQueryName] = useState(user?.name || "");
  const [queryEmail, setQueryEmail] = useState(user?.email || "");
  const [querySubject, setQuerySubject] = useState("");
  const [queryMessage, setQueryMessage] = useState("");
  const [querySubmitting, setQuerySubmitting] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [querySuccess, setQuerySuccess] = useState(false);

  useEffect(() => {
    if (user?.name && !submitName) {
      setSubmitName(user.name);
    }
    if (user?.name && !queryName) {
      setQueryName(user.name);
    }
    if (user?.email && !queryEmail) {
      setQueryEmail(user.email);
    }
  }, [user, submitName, queryName, queryEmail]);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["/api/products", productId, "reviews"],
    queryFn: async () => {
      const res = await apiFetch(`/api/products/${productId}/reviews`);
      if (!res.ok) throw new Error("Failed to load reviews");
      return res.json() as Promise<{
        reviews: Array<{
          id: string;
          productId: string;
          customerName: string;
          rating: number;
          comment: string;
          orderId?: string | null;
          sellerReply?: string | null;
          sellerRepliedAt?: string | null;
          createdAt: string;
        }>;
        averageRating: number;
        reviewCount: number;
        ratingBreakdown: Record<string, number>;
      }>;
    },
    enabled: !!productId,
  });

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if (
        detail.name === "product:updated" ||
        detail.name === "product:review_added" ||
        detail.name === "catalog:updated"
      ) {
        if (!detail.data || detail.data.id === productId || detail.data.productId === productId || !detail.data.id) {
          queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "reviews"] });
          queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
          refetch();
        }
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [productId, queryClient, refetch]);

  const reviews = data?.reviews ?? [];
  const reviewCount = data?.reviewCount ?? 0;
  const averageRating = data?.averageRating ?? 0;
  const ratingBreakdown = data?.ratingBreakdown ?? { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };

  const sectionBg = "bg-white";
  const borderColor = "border-[#C7CCD1]/20";
  const cardBg = "bg-[#F4F5F7]";

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!submitComment.trim()) {
      setSubmitError("Please write a short review before submitting.");
      return;
    }
    setSubmitting(true);
    setSubmitError("");

    try {
      const res = await apiFetch(`/api/products/${productId}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: submitRating,
          comment: submitComment.trim(),
          customerName: submitName.trim() || user?.name || "Customer",
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to submit review");
      }

      setSubmitSuccess(true);
      setSubmitComment("");
      setShowReviewForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products", productId] });
      refetch();
      setTimeout(() => setSubmitSuccess(false), 4000);
    } catch (err: any) {
      setSubmitError(err.message || "Failed to submit review. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!queryMessage.trim()) {
      setQueryError("Please enter your question before submitting.");
      return;
    }
    setQuerySubmitting(true);
    setQueryError("");

    try {
      const res = await apiFetch(`/api/products/${productId}/queries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: querySubject.trim() || undefined,
          message: queryMessage.trim(),
          customerName: queryName.trim() || user?.name || "Customer",
          customerEmail: queryEmail.trim() || user?.email || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to submit question");
      }

      setQuerySuccess(true);
      setQuerySubject("");
      setQueryMessage("");
      setShowQueryForm(false);
      setTimeout(() => setQuerySuccess(false), 5000);
    } catch (err: any) {
      setQueryError(err.message || "Failed to submit question. Please try again.");
    } finally {
      setQuerySubmitting(false);
    }
  };

  return (
    <section className="mb-16">
      {/* Section Header & Action Triggers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[#C7CCD1] font-bold mb-1">
            Customer Experiences & Inquiries
          </p>
          <h2
            className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]"
          >
            Ratings, Reviews & Queries
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setShowQueryForm(!showQueryForm);
              setShowReviewForm(false);
              setQueryError("");
            }}
            className="px-4 py-2.5 border-2 border-[#0A1F44] text-[#0A1F44] text-xs font-bold uppercase tracking-wider rounded-md hover:bg-[#0A1F44]/5 transition-colors shadow-xs flex items-center gap-2"
          >
            <MessageSquare size={14} />
            {showQueryForm ? "Cancel Query" : "Ask a Question"}
          </button>

          {isSignedIn ? (
            <button
              onClick={() => {
                setShowReviewForm(!showReviewForm);
                setShowQueryForm(false);
                setSubmitError("");
              }}
              className="px-5 py-2.5 bg-[#0A1F44] text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-[#2C3E6B] transition-colors shadow-sm flex items-center gap-2"
            >
              <Star size={14} className="fill-current text-[#C7CCD1]" />
              {showReviewForm ? "Cancel Review" : "Write a Review"}
            </button>
          ) : (
            <Link
              href="/sign-in"
              className="px-5 py-2.5 border-2 border-[#0A1F44] text-[#0A1F44] text-xs font-bold uppercase tracking-wider rounded-md hover:bg-[#0A1F44]/5 transition-colors inline-block"
            >
              Sign In to Write a Review
            </Link>
          )}
        </div>
      </div>

      {querySuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-blue-50 text-blue-900 border border-blue-300 rounded-xl flex items-center gap-3 text-sm font-medium shadow-xs"
        >
          <CheckCircle2 size={18} className="text-blue-600 shrink-0" />
          Thank you! Your question has been delivered directly to both the Seller and Admin. You will receive updates shortly.
        </motion.div>
      )}

      {/* Query Submission Form */}
      <AnimatePresence>
        {showQueryForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmitQuery}
            className={cn(
              "rounded-xl border p-6 mb-8 space-y-4 overflow-hidden shadow-sm",
              sectionBg,
              borderColor
            )}
          >
            <div className="flex items-center justify-between border-b pb-3 border-[#C7CCD1]/30">
              <h3 className="font-serif text-lg font-bold text-[#0A1F44] flex items-center gap-2">
                <MessageSquare size={18} className="text-[#0A1F44]" />
                Ask a Question About This Saree
              </h3>
              <span className="text-xs text-gray-500">Delivered directly to Seller & Support</span>
            </div>

            {queryError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-lg border border-red-200">
                {queryError}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={queryName}
                  onChange={(e) => setQueryName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full px-4 py-2.5 rounded-lg border border-[#C7CCD1]/40 bg-white text-sm text-[#0A1F44] focus:outline-none focus:border-[#0A1F44]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Your Email
                </label>
                <input
                  type="email"
                  value={queryEmail}
                  onChange={(e) => setQueryEmail(e.target.value)}
                  placeholder="Enter your email for response notifications"
                  className="w-full px-4 py-2.5 rounded-lg border border-[#C7CCD1]/40 bg-white text-sm text-[#0A1F44] focus:outline-none focus:border-[#0A1F44]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Subject (Optional)
              </label>
              <input
                type="text"
                value={querySubject}
                onChange={(e) => setQuerySubject(e.target.value)}
                placeholder="e.g., Fabric details, blouse customization, blouse piece length..."
                className="w-full px-4 py-2.5 rounded-lg border border-[#C7CCD1]/40 bg-white text-sm text-[#0A1F44] focus:outline-none focus:border-[#0A1F44]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Your Question / Message <span className="text-red-500">*</span>
              </label>
              <textarea
                required
                rows={3}
                value={queryMessage}
                onChange={(e) => setQueryMessage(e.target.value)}
                placeholder="Ask any question about this saree, sizing, dispatch timeline, or care instructions..."
                className="w-full px-4 py-2.5 rounded-lg border border-[#C7CCD1]/40 bg-white text-sm text-[#0A1F44] focus:outline-none focus:border-[#0A1F44]"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowQueryForm(false)}
                className="px-4 py-2 border rounded-md text-xs font-bold uppercase tracking-wider hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={querySubmitting}
                className="px-6 py-2 bg-[#0A1F44] text-white rounded-md text-xs font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {querySubmitting ? "Sending..." : "Submit Question"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {submitSuccess && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-emerald-50 text-emerald-800 border border-emerald-300 rounded-xl flex items-center gap-3 text-sm font-medium shadow-xs"
        >
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          Thank you! Your rating and customer review have been published.
        </motion.div>
      )}

      {/* Review Submission Form */}
      <AnimatePresence>
        {showReviewForm && (
          <motion.form
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            onSubmit={handleSubmitReview}
            className={cn(
              "rounded-xl border p-6 mb-8 space-y-5 overflow-hidden shadow-sm",
              sectionBg,
              borderColor
            )}
          >
            <h3 className="font-serif text-lg font-bold text-[#0A1F44]">
              Submit Your Product Review & Rating
            </h3>

            {submitError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs font-semibold rounded-lg border border-red-200">
                {submitError}
              </div>
            )}

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                Your Rating
              </label>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const activeStar = hoverRating ? star <= hoverRating : star <= submitRating;
                  return (
                    <button
                      key={star}
                      type="button"
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setSubmitRating(star)}
                      className="p-1 text-2xl transition-transform hover:scale-110 focus:outline-none"
                    >
                      <Star
                        size={24}
                        className={cn(
                          "transition-colors",
                          activeStar
                            ? "fill-[#0A1F44] text-[#0A1F44]"
                            : "text-gray-300"
                        )}
                      />
                    </button>
                  );
                })}
                <span className="ml-2 text-sm font-bold text-[#0A1F44]">
                  {submitRating} Star{submitRating !== 1 ? "s" : ""}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                  Your Name
                </label>
                <input
                  type="text"
                  required
                  value={submitName}
                  onChange={(e) => setSubmitName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full text-sm px-3.5 py-2.5 rounded-md border border-[#C7CCD1]/40 bg-white text-[#0A1F44] focus:outline-none focus:border-[#0A1F44]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 mb-1.5">
                Your Customer Review
              </label>
              <textarea
                required
                rows={4}
                value={submitComment}
                onChange={(e) => setSubmitComment(e.target.value)}
                placeholder="Share details about fabric quality, zari work, drape, color accuracy, or overall experience..."
                className="w-full text-sm p-3.5 rounded-md border border-[#C7CCD1]/40 bg-white text-[#0A1F44] focus:outline-none focus:border-[#0A1F44] leading-relaxed"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewForm(false)}
                className="px-4 py-2 border border-[#C7CCD1]/40 text-xs font-bold uppercase tracking-wider rounded-md hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-[#0A1F44] text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-[#2C3E6B] transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? "Submitting..." : "Post Review"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Actual Average Rating Summary Card */}
      <div
        className={cn(
          "rounded-xl border p-6 mb-8",
          sectionBg,
          borderColor
        )}
      >
        <div className="flex flex-col sm:flex-row gap-8 items-start">
          <div className="text-center shrink-0">
            <p
              className="text-6xl font-bold font-serif mb-2 text-[#0A1F44]"
            >
              {reviewCount > 0 ? averageRating.toFixed(1) : "0.0"}
            </p>
            <div className="flex justify-center mb-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={18}
                  className={cn(
                    reviewCount > 0 && s <= Math.round(averageRating)
                      ? "fill-[#0A1F44] text-[#0A1F44]"
                      : "text-gray-300"
                  )}
                />
              ))}
            </div>
            <p className="text-xs opacity-50 font-medium">
              {reviewCount.toLocaleString("en-IN")} customer review{reviewCount !== 1 ? "s" : ""}
            </p>
          </div>

          <div className="flex-1 space-y-2 w-full">
            {[5, 4, 3, 2, 1].map((s) => (
              <StarBar
                key={s}
                stars={s}
                count={ratingBreakdown[s] ?? 0}
                total={reviewCount}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Customer Reviews List & Realtime Empty State */}
      {isLoading ? (
        <div className="py-12 text-center text-xs opacity-60">
          Loading customer reviews...
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-[#C7CCD1]/40 rounded-xl bg-white/50">
          <div className="w-12 h-12 rounded-full bg-[#0A1F44]/5 flex items-center justify-center mx-auto mb-3">
            <MessageSquare size={24} className="text-[#0A1F44] opacity-60" />
          </div>
          <h3 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">
            No reviews yet
          </h3>
          <p className="text-xs text-gray-500 max-w-sm mx-auto mb-4">
            Be the first customer to share your experience with this saree!
          </p>
          {isSignedIn && !showReviewForm && (
            <button
              onClick={() => setShowReviewForm(true)}
              className="px-5 py-2.5 bg-[#0A1F44] text-white text-xs font-bold uppercase tracking-wider rounded-md hover:bg-[#2C3E6B] transition-colors"
            >
              Write the First Review
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {reviews.map((review) => {
            const initials = review.customerName
              ? review.customerName.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)
              : "C";
            const formattedDate = review.createdAt
              ? new Date(review.createdAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "";
            return (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4 }}
                className={cn(
                  "rounded-xl border p-5 flex flex-col justify-between shadow-xs",
                  cardBg,
                  borderColor
                )}
              >
                <div>
                  <div className="flex items-start gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-[#0A1F44] text-[#F4F5F7] flex items-center justify-center font-bold text-xs shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{review.customerName || "Customer"}</p>
                        {review.orderId && (
                          <span className="flex items-center gap-1 text-[10px] text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                            <CheckCircle2 size={10} />
                            Verified Purchase
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <div className="flex">
                          {[1, 2, 3, 4, 5].map((s) => (
                            <Star
                              key={s}
                              size={12}
                              className={cn(
                                s <= review.rating
                                  ? "fill-[#0A1F44] text-[#0A1F44]"
                                  : "text-gray-300"
                              )}
                            />
                          ))}
                        </div>
                        {formattedDate && <span className="text-[10px] opacity-40">{formattedDate}</span>}
                      </div>
                    </div>
                  </div>
                  {review.comment && (
                    <p className="text-sm leading-relaxed opacity-80 whitespace-pre-line">{review.comment}</p>
                  )}
                </div>

                {review.sellerReply && (
                  <div className="mt-3 p-3 bg-amber-50/80 rounded-lg border border-amber-200/50 text-xs">
                    <p className="font-bold text-amber-900 mb-0.5">Seller Response:</p>
                    <p className="opacity-90 text-amber-950">{review.sellerReply}</p>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}

const BUY_NOW_KEY = "twirl_buy_now";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { wishlistedIds, toggle } = useWishlist();
  const { addItem } = useCart();
  const isWishlisted = wishlistedIds.has(id ?? "");

  const [activeImage, setActiveImage] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedAttributes, setSelectedAttributes] = useState<Record<string, string>>({});

  const queryClient = useQueryClient();
  const { data: product, isLoading, isError, refetch } = useGetProduct(id ?? "");

  useEffect(() => {
    if (id) trackRecentlyViewed(id);
  }, [id]);

  useEffect(() => {
    const handleRealtimeEvent = (e: Event) => {
      const customEvent = e as CustomEvent;
      const detail = customEvent.detail;
      if (!detail) return;
      if (["inventory:updated", "product:updated", "product:created", "catalog:updated"].includes(detail.name)) {
        const payload = detail.data?.payload || detail.data;
        const targetId = payload?.id || payload?.productId || detail.data?.id || detail.data?.productId;
        if (!targetId || targetId === id) {
          if (payload && (payload.id === id || payload.productId === id)) {
            queryClient.setQueryData([`/api/products/${id}`], (old: any) => {
              if (!old) return old;
              return { ...old, ...payload };
            });
          }
          queryClient.invalidateQueries({ queryKey: [`/api/products/${id}`] });
          queryClient.invalidateQueries({ queryKey: ["/api/products"] });
          refetch();
        }
      }
    };

    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [id, queryClient, refetch]);

  const isDesigner = product?.category === "designer";

  const relatedParams = { category: product?.category, limit: 6 };
  const { data: relatedData } = useListProducts(relatedParams, {
    query: {
      enabled: !!product,
      queryKey: getListProductsQueryKey(relatedParams),
    },
  });
  const related = relatedData?.products.filter((p) => p.id !== id).slice(0, 4) ?? [];

  const similarParams = { occasion: product?.occasion, limit: 6 };
  const { data: similarData } = useListProducts(
    similarParams as Parameters<typeof useListProducts>[0],
    {
      query: {
        enabled: !!product,
        queryKey: getListProductsQueryKey(
          similarParams as Parameters<typeof useListProducts>[0]
        ),
      },
    }
  );
  const similar = similarData?.products.filter((p) => p.id !== id).slice(0, 4) ?? [];

  const themeClasses = "bg-[#F4F5F7] text-[#3D1A1A]";

  const images = Array.isArray(product?.images) && product.images.length > 0
    ? product.images.map(getProductImageSrc)
    : [getProductImageSrc()];

  useEffect(() => {
    setActiveImage(0);
    setAddedToCart(false);
    setSelectedAttributes({});
  }, [id]);

  useEffect(() => {
    if (activeImage >= images.length) {
      setActiveImage(0);
    }
  }, [images.length, activeImage]);

  const handleLightboxNav = useCallback(
    (dir: 1 | -1) => {
      if (images.length === 0) return;
      setActiveImage((prev) => (prev + dir + images.length) % images.length);
    },
    [images.length]
  );

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  if (isLoading) {
    return (
      <Layout>
        <ProductDetailsSkeleton />
      </Layout>
    );
  }

  if (isError || !product) {
    return (
      <Layout>
        <div
          className={cn(
            "min-h-screen flex items-center justify-center",
            themeClasses
          )}
        >
          <div className="text-center max-w-md px-4">
            <h2 className="font-serif text-3xl mb-4">Product Not Found</h2>
            <p className="opacity-60 mb-8">
              This product may have been removed or sold out.
            </p>
            <Link
              href="/"
              className="bg-[#C7CCD1] text-[#0A1F44] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const discount = product.originalPrice
    ? Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      )
    : null;

  const categoryPath =
    isPaithaniProduct(product)
      ? "/paithani/shop"
      : isDesignerProduct(product)
      ? "/designer/shop"
      : `/category/${encodeURIComponent(product.category)}`;
  const categoryLabel = product.category
    ? product.category.charAt(0).toUpperCase() + product.category.slice(1).replace(/-/g, " ")
    : "Products";

  const pattern =
    isPaithaniProduct(product)
      ? product.fabric === "silk"
        ? "Pure Silk Zari"
        : "Traditional Zari"
      : product.fabric === "georgette"
      ? "Georgette Embroidery"
      : "Contemporary Embroidery";

  const specRows = (() => {
    const rows: Array<{ label: string; value: string }> = [];
    const addedKeys = new Set<string>();

    const getCanonicalKey = (k: string) => {
      const norm = k.trim().toLowerCase();
      if (norm === "fabric" || norm === "fabric / material" || norm === "material") return "fabric";
      if (norm === "color" || norm === "colour") return "color";
      if (norm === "pattern" || norm === "design" || norm === "pattern / design" || norm === "design pattern") return "pattern";
      if (norm === "category" || norm === "product category") return "category";
      if (norm === "subcategory") return "subcategory";
      if (norm === "occasion") return "occasion";
      if (norm === "brand" || norm === "brand name") return "brand";
      if (norm === "sku" || norm === "product sku / id" || norm === "product id") return "sku";
      if (norm === "inventory status" || norm === "status") return "status";
      return norm;
    };

    const addRow = (label: string, value: string | null | undefined) => {
      if (!value || typeof value !== "string" || !value.trim()) return;
      const canonical = getCanonicalKey(label);
      if (addedKeys.has(canonical)) return;
      addedKeys.add(canonical);
      rows.push({ label: label.trim(), value: value.trim() });
    };

    // 1. Seller-defined custom specifications (exact key & value preserved as saved by seller)
    if (Array.isArray((product as any).specifications)) {
      for (const s of (product as any).specifications) {
        if (s && typeof s.key === "string" && typeof s.value === "string" && s.key.trim() && s.value.trim()) {
          addRow(s.key, s.value);
        }
      }
    }

    // 2. Standard product attributes
    if (product.category) {
      const catLabel = product.category.charAt(0).toUpperCase() + product.category.slice(1);
      addRow("Category", catLabel);
    }
    if ((product as any).subcategory) {
      addRow("Subcategory", (product as any).subcategory);
    }
    if (product.fabric) {
      const fabLabel = product.fabric.charAt(0).toUpperCase() + product.fabric.slice(1);
      addRow("Fabric / Material", fabLabel);
    }
    if (product.color) {
      const colLabel = product.color.charAt(0).toUpperCase() + product.color.slice(1);
      addRow("Color", colLabel);
    }
    if ((product as any).designPattern) {
      addRow("Pattern / Design", (product as any).designPattern);
    }
    if (product.occasion) {
      const occLabel = product.occasion.charAt(0).toUpperCase() + product.occasion.slice(1);
      addRow("Occasion", occLabel);
    }
    if ((product as any).brand) {
      addRow("Brand Name", (product as any).brand);
    }
    if (product.vendorName) {
      addRow("Seller / Shop Information", `${product.vendorName} – VASTRAA`);
    }
    if (product.id) {
      addRow("Product SKU / ID", product.id);
    }
    if ((product as any).collection) {
      addRow("Collection", (product as any).collection);
    }
    if ((product as any).gender) {
      addRow("Gender / Target", (product as any).gender);
    }
    if ((product as any).sareeType) {
      addRow("Saree Type", (product as any).sareeType);
    }
    if ((product as any).sareeStyle) {
      addRow("Saree Style", (product as any).sareeStyle);
    }
    if ((product as any).blouseIncluded !== undefined && (product as any).blouseIncluded !== null) {
      addRow("Blouse Piece", (product as any).blouseIncluded ? "Included / Unstitched" : "Not Included");
    }
    if ((product as any).packOf) {
      addRow("Pack Of", (product as any).packOf);
    }
    if ((product as any).countryOfOrigin) {
      addRow("Country of Origin", (product as any).countryOfOrigin);
    }
    if (product.stock !== undefined && product.stock !== null) {
      addRow("Inventory Status", product.stock > 0 ? `${product.stock} units available` : "Out of stock");
    }

    return rows;
  })();
  const isDeactivated = (product as any).active === false;

  // Variant picker logic
  const productVariants: Array<any> = (product as any).variants ?? [];
  const variantAttrGroups = (() => {
    const groupMap = new Map<string, Set<string>>();
    for (const v of productVariants) {
      if (!Array.isArray(v.attributes)) continue;
      for (const a of v.attributes) {
        if (!groupMap.has(a.name)) groupMap.set(a.name, new Set());
        groupMap.get(a.name)!.add(a.value);
      }
    }
    return Array.from(groupMap.entries()).map(([name, vals]) => ({ name, values: Array.from(vals) }));
  })();
  const selectedVariant = productVariants.find((v: any) =>
    Array.isArray(v.attributes) &&
    v.attributes.length > 0 &&
    v.attributes.every((a: any) => selectedAttributes[a.name] === a.value)
  ) ?? null;
  const allGroupsSelected =
    variantAttrGroups.length === 0 ||
    variantAttrGroups.every((g) => selectedAttributes[g.name] !== undefined);
  const variantRequired = variantAttrGroups.length > 0 && !allGroupsSelected;
  const variantOutOfStock =
    selectedVariant != null &&
    (selectedVariant.stock === 0 || selectedVariant.stock === "0" || Number(selectedVariant.stock) <= 0);
  const isOutOfStock = product.stock <= 0 || isDeactivated || variantOutOfStock;
  const canPurchase = !isOutOfStock && !variantRequired;
  // Use the selected variant's price/stock when a full combination is chosen
  const effectivePrice =
    selectedVariant?.price != null ? Number(selectedVariant.price) : product.price;
  const effectiveStock =
    selectedVariant?.stock != null ? Number(selectedVariant.stock) : product.stock;

  return (
    <div>
      <Layout>
        <div className={cn("min-h-screen", themeClasses)}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-10 pb-28 md:pb-10">

            {/* Breadcrumb Navigation */}
            <nav className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] opacity-75 mb-6 md:mb-8 flex-wrap font-sans font-semibold text-[#0A1F44]">
              <Link href="/" className="hover:text-[#2C3E6B] transition-colors">Home</Link>
              <ChevronRight size={12} className="text-[#C7CCD1]" />
              <Link href={categoryPath} className="hover:text-[#2C3E6B] transition-colors">{categoryLabel}</Link>
              <ChevronRight size={12} className="text-[#C7CCD1]" />
              <span className="font-semibold truncate max-w-[200px] sm:max-w-xs">{product.name}</span>
            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start mb-16">

              {/* Left Column: Image & Media Gallery (Sticky on Desktop) */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="lg:col-span-6 flex flex-col lg:sticky lg:top-24"
              >
                {/* Main Display Image Canvas */}
                <div
                  className="relative aspect-square overflow-hidden rounded-2xl border border-[#C7CCD1]/40 mb-3 bg-[#F8F7F4] shadow-md group cursor-zoom-in flex items-center justify-center"
                  onClick={() => setLightboxOpen(true)}
                >
                  <img
                    src={images[activeImage]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out"
                    onError={replaceProductImageWithFallback}
                  />
                  
                  {/* Editorial Overlay Badges */}
                  <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 pointer-events-none">
                    {product.isBestSeller && (
                      <span className="bg-[#0A1F44] text-[#F4F5F7] text-xs font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-sm shadow-md border border-[#C7CCD1]/40 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#C7CCD1] animate-pulse" />
                        Best Seller
                      </span>
                    )}
                    {!product.isBestSeller && product.isNewArrival && (
                      <span className="bg-[#2C3E6B] text-white text-xs font-bold uppercase tracking-widest px-3.5 py-1.5 rounded-sm shadow-md border border-[#C7CCD1]/30">
                        New Arrival
                      </span>
                    )}
                  </div>

                  {discount && (
                    <span className="absolute top-4 right-4 bg-rose-800 text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-sm shadow-md">
                      {discount}% OFF
                    </span>
                  )}

                  <div className="absolute bottom-4 right-4 p-2.5 bg-white/90 backdrop-blur-md rounded-full shadow-md opacity-80 group-hover:opacity-100 transition-opacity">
                    <ZoomIn size={18} className="text-[#0A1F44]" />
                  </div>
                  <p className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 text-[11px] font-semibold text-white bg-[#0A1F44]/80 backdrop-blur-sm px-3 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-all">
                    Click image to zoom full screen
                  </p>

                  {/* Mobile Chevrons & Counter */}
                  {images.length > 1 && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImage((prev) => (prev - 1 + images.length) % images.length);
                        }}
                        className="md:hidden absolute left-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-[#0A1F44] active:scale-95 z-20 cursor-pointer"
                        aria-label="Previous image"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveImage((prev) => (prev + 1) % images.length);
                        }}
                        className="md:hidden absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow-md flex items-center justify-center text-[#0A1F44] active:scale-95 z-20 cursor-pointer"
                        aria-label="Next image"
                      >
                        <ChevronRight size={16} />
                      </button>
                      <div className="md:hidden absolute bottom-3 left-3 bg-[#0A1F44]/80 text-white text-[11px] font-semibold px-2.5 py-0.5 rounded-full backdrop-blur-xs z-10 pointer-events-none">
                        {activeImage + 1} / {images.length}
                      </div>
                    </>
                  )}
                </div>

                {/* Image Thumbnails Strip */}
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                  {images.map((img, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveImage(i)}
                      className={cn(
                        "w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all shadow-sm",
                        activeImage === i
                          ? "border-[#0A1F44] ring-2 ring-[#0A1F44]/20 scale-105 shadow-md"
                          : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <img src={img} alt={`Thumbnail ${i + 1}`} className="w-full h-full object-cover" onError={replaceProductImageWithFallback} />
                    </button>
                  ))}
                </div>
              </motion.div>

              {/* Right Column: Product Information & Purchase Actions */}
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="lg:col-span-6 flex flex-col space-y-5 md:space-y-6"
              >
                {/* Title & Header Info */}
                <div>
                  <div className="inline-flex items-center gap-2 mb-1">
                    <span className="h-px w-6" style={{ background: "#C7CCD1" }} />
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C3E6B]">
                      {categoryLabel} Collection
                    </span>
                  </div>

                  <h1
                    className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold leading-tight text-[#0A1F44]"
                  >
                    {product.name}
                  </h1>

                  {/* Star Rating & Review Count */}
                  <div className="flex items-center gap-2.5 mt-2.5 text-sm">
                    <div className="flex items-center">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          size={16}
                          className={cn(
                            "transition-colors",
                            product.reviewCount > 0 && star <= Math.round(product.rating)
                              ? "fill-[#0A1F44] text-[#0A1F44]"
                              : "text-gray-300"
                          )}
                        />
                      ))}
                    </div>
                    <span className="text-sm font-bold text-[#0A1F44]">{product.reviewCount > 0 ? product.rating.toFixed(1) : "0.0"}</span>
                    <span className="text-xs text-gray-500 font-medium">({product.reviewCount} customer review{product.reviewCount !== 1 ? "s" : ""})</span>
                  </div>
                </div>

                {/* Price Block */}
                <div className="py-4 border-y border-[#C7CCD1]/25 flex items-baseline flex-wrap gap-3">
                  <span
                    className="font-serif text-3xl sm:text-4xl font-bold text-[#0A1F44]"
                  >
                    ₹{product.price.toLocaleString("en-IN")}
                  </span>
                  {product.originalPrice && (
                    <div className="flex items-center gap-2.5">
                      <span className="text-lg text-gray-400 line-through">
                        ₹{product.originalPrice.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200">
                        Save ₹{(product.originalPrice - product.price).toLocaleString("en-IN")} ({discount}% OFF)
                      </span>
                    </div>
                  )}
                </div>

                {/* Description */}
                <p className="leading-relaxed opacity-90 text-sm sm:text-base font-sans text-gray-700 whitespace-pre-line">
                  {product.description}
                </p>

                {/* Specifications Card */}
                <div className="rounded-xl border overflow-hidden shadow-sm border-[#C7CCD1]/30 bg-white">
                  <div className="bg-[#0A1F44] px-4 py-2.5 text-white flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-[#C7CCD1]">
                      Product Specifications
                    </span>
                    <span className="h-px flex-1 max-w-[60px] ml-3" style={{ background: "linear-gradient(to right, #C7CCD1, transparent)" }} />
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {specRows.map((row, i) => (
                          <tr
                            key={row.label}
                            className={cn(
                              "border-b last:border-0 transition-colors",
                              i % 2 === 0 ? "bg-white" : "bg-[#F4F5F7]/70"
                            )}
                          >
                            <td className="px-4 py-2.5 text-gray-500 font-medium w-44 whitespace-nowrap text-xs uppercase tracking-wider">{row.label}</td>
                            <td className="px-4 py-2.5 font-semibold text-[#0A1F44]">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Variant Selector */}
                {variantAttrGroups.length > 0 && (
                  <div className="space-y-3 bg-white p-4 rounded-xl border border-[#C7CCD1]/30">
                    {variantAttrGroups.map((group) => (
                      <div key={group.name}>
                        <p className="text-xs font-bold uppercase tracking-widest mb-2 text-[#0A1F44]">
                          Select {group.name}:
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {group.values.map((val) => {
                            const isSelected = selectedAttributes[group.name] === val;
                            const comboOos = productVariants.some((v: any) => {
                              if (!Array.isArray(v.attributes)) return false;
                              const matchesThis = v.attributes.some(
                                (a: any) => a.name === group.name && a.value === val
                              );
                              return matchesThis && (v.stock === 0 || v.stock === "0");
                            });
                            return (
                              <button
                                key={val}
                                type="button"
                                onClick={() => {
                                  setSelectedAttributes((prev) => {
                                    if (prev[group.name] === val) {
                                      const next = { ...prev };
                                      delete next[group.name];
                                      return next;
                                    }
                                    return { ...prev, [group.name]: val };
                                  });
                                }}
                                className={cn(
                                  "px-4 py-2 rounded-md border text-xs font-bold uppercase tracking-wider transition-all relative shadow-sm",
                                  isSelected
                                    ? "bg-[#0A1F44] text-white border-[#0A1F44] shadow-md"
                                    : "border-[#C7CCD1]/40 hover:border-[#0A1F44] text-[#0A1F44] bg-white"
                                )}
                              >
                                {val}
                                {comboOos && !isSelected && (
                                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-white" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {selectedVariant && (
                      <div className="flex items-center gap-3 text-sm pt-2 border-t border-[#C7CCD1]/20">
                        {selectedVariant.stock != null && (
                          <span className={cn(
                            "font-semibold text-xs uppercase tracking-wider",
                            selectedVariant.stock > 0 ? "text-green-600" : "text-red-500"
                          )}>
                            {selectedVariant.stock > 0
                              ? `${selectedVariant.stock} units available`
                              : "Out of stock for this combination"}
                          </span>
                        )}
                        {selectedVariant.price != null && selectedVariant.price !== product.price && (
                          <span className="font-bold text-[#0A1F44]">
                            ₹{Number(selectedVariant.price).toLocaleString("en-IN")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Stock Availability Notifications */}
                {product.stock > 0 && product.stock <= 5 && (
                  <div className="flex items-center gap-2 text-amber-800 bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <Package size={18} className="shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      Only {product.stock} saree(s) remaining in stock — order soon!
                    </span>
                  </div>
                )}
                {isOutOfStock && (
                  <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg border border-red-200">
                    <Package size={18} className="shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {isDeactivated ? "This product is currently Out of Stock" : "Currently out of stock"}
                    </span>
                  </div>
                )}

                {/* Primary Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  <button
                    onClick={() => {
                      if (!canPurchase) return;
                      addItem({
                        id: product.id,
                        productId: product.id,
                        name: product.name,
                        price: effectivePrice,
                        originalPrice: product.originalPrice ?? null,
                        images: product.images ?? [],
                        vendorName: product.vendorName ?? "",
                        stock: effectiveStock,
                        category: product.category ?? "",
                      });
                      setAddedToCart(true);
                      setTimeout(() => setAddedToCart(false), 2000);
                    }}
                    disabled={!canPurchase}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3.5 px-6 font-bold uppercase tracking-widest text-xs sm:text-sm transition-all rounded-md shadow-md disabled:cursor-not-allowed",
                      !canPurchase
                        ? "bg-gray-300 text-gray-500"
                        : addedToCart
                        ? "bg-emerald-700 text-white"
                        : "bg-[#0A1F44] text-[#EDEEF0] hover:bg-[#2C3E6B] shadow-lg hover:shadow-xl"
                    )}
                  >
                    <ShoppingBag size={18} />
                    {variantRequired
                      ? "Select Options"
                      : isOutOfStock
                      ? "Out of Stock"
                      : addedToCart
                      ? "Added to Cart!"
                      : "Add to Cart"}
                  </button>
                  
                  <button
                    onClick={() => toggle(id ?? "")}
                    className={cn(
                      "flex items-center justify-center gap-2 px-6 py-3.5 border-2 font-bold uppercase tracking-widest text-xs sm:text-sm rounded-md transition-all shadow-sm",
                      isWishlisted
                        ? "bg-[#0A1F44] border-[#0A1F44] text-white"
                        : "border-[#0A1F44] text-[#0A1F44] hover:bg-[#0A1F44]/5"
                    )}
                  >
                    <Heart size={18} className={isWishlisted ? "fill-current" : ""} />
                    Wishlist
                  </button>
                </div>

                {/* Buy Now Button */}
                <button
                  onClick={() => {
                    if (!canPurchase) return;
                    try {
                      sessionStorage.setItem(
                        BUY_NOW_KEY,
                        JSON.stringify({
                          productId: product.id,
                          quantity: 1,
                          product: {
                            id: product.id,
                            productId: product.id,
                            name: product.name,
                            price: effectivePrice,
                            originalPrice: product.originalPrice ?? null,
                            images: product.images ?? [],
                            vendorName: product.vendorName ?? "",
                            stock: effectiveStock,
                            category: product.category ?? "",
                          },
                        })
                      );
                    } catch {}
                    setLocation("/checkout");
                  }}
                  disabled={!canPurchase}
                  className="w-full flex items-center justify-center gap-2 py-3.5 border-2 font-bold uppercase tracking-widest text-xs sm:text-sm rounded-md transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed border-[#0A1F44] text-[#0A1F44] hover:bg-[#0A1F44] hover:text-white"
                >
                  <Package size={18} />
                  Buy Now
                </button>

                {/* Provenance & Trust Assurance Strip */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-white/60 rounded-xl border border-[#C7CCD1]/30">
                  <div className="flex items-center gap-2.5">
                    <Shield size={18} className="text-[#0A1F44] shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Weave Guarantee</p>
                      <p className="text-[11px] text-gray-500">100% Genuine Silk & Zari</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Truck size={18} className="text-[#0A1F44] shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Free Shipping</p>
                      <p className="text-[11px] text-gray-500">On orders above ₹3,000</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <RotateCcw size={18} className="text-[#0A1F44] shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">7-Day Returns</p>
                      <p className="text-[11px] text-gray-500">Hassle-free exchange</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Package size={18} className="text-[#0A1F44] shrink-0" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]">Luxury Packaging</p>
                      <p className="text-[11px] text-gray-500">Dust bag & tissue wrapped</p>
                    </div>
                  </div>
                </div>

                {/* Delivery & Returns Accordion */}
                <DeliveryAccordion
                  deliveryInfo={(product as any).deliveryInfo}
                  returnPolicy={(product as any).returnPolicy}
                />
              </motion.div>
            </div>

            {/* Customer Reviews Section */}
            <div className="mt-16 pt-12 border-t border-[#C7CCD1]/30">
              <div className="text-center mb-10">
                <div className="flex items-center justify-center gap-4 mb-3">
                  <span className="flex-1 max-w-[80px] h-px" style={{ background: "linear-gradient(to right, transparent, #C7CCD1)" }} />
                  <h2 className="font-serif text-3xl md:text-4xl font-bold tracking-wide text-[#0A1F44]">
                    Ratings & Customer Reviews
                  </h2>
                  <span className="flex-1 max-w-[80px] h-px" style={{ background: "linear-gradient(to left, transparent, #C7CCD1)" }} />
                </div>
                <p className="text-sm text-gray-500">Read authentic experiences from saree connoisseurs across India</p>
              </div>

              <ReviewsSection
                productId={product.id}
              />
            </div>

            {/* Similar Products (by occasion) */}
            {similar.length > 0 && (
              <section className="mt-16 pt-12 border-t border-[#C7CCD1]/30">
                <div className="text-center mb-10">
                  <div className="flex items-center justify-center gap-4 mb-3">
                    <span className="flex-1 max-w-[80px] h-px" style={{ background: "linear-gradient(to right, transparent, #C7CCD1)" }} />
                    <h2 className="font-serif text-3xl md:text-4xl font-bold tracking-wide text-[#0A1F44]">
                      Similar Sarees You May Love
                    </h2>
                    <span className="flex-1 max-w-[80px] h-px" style={{ background: "linear-gradient(to left, transparent, #C7CCD1)" }} />
                  </div>
                  <p className="text-sm text-gray-500">Handpicked items curated for similar occasions and styles</p>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {similar.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Related Products (by category) */}
            {related.length > 0 && (
              <section className="mt-16 pt-12 border-t border-[#C7CCD1]/30">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#2C3E6B]">
                      From the Same Collection
                    </span>
                    <h2 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44]">
                      More {categoryLabel} Masterpieces
                    </h2>
                  </div>
                  <Link
                    href={categoryPath}
                    className="hidden md:flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#0A1F44] hover:underline"
                  >
                    View All {categoryLabel} Sarees →
                  </Link>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                  {related.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>

        {/* Sticky Mobile Purchase Action Bar */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#C7CCD1]/30 px-4 py-2.5 pb-safe shadow-[0_-4px_16px_rgba(0,0,0,0.08)] flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] uppercase tracking-wider text-gray-500 font-medium">Total Price</span>
            <span className="font-serif text-lg font-bold text-[#0A1F44] truncate">
              ₹{effectivePrice.toLocaleString("en-IN")}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => toggle(id ?? "")}
              aria-label={isWishlisted ? "Remove from saved items" : "Save for later"}
              className={cn(
                "p-2.5 rounded-lg border transition-all flex items-center justify-center min-w-[44px] min-h-[44px]",
                isWishlisted
                  ? "bg-[#0A1F44] border-[#0A1F44] text-white"
                  : "border-[#C7CCD1] text-[#0A1F44] hover:bg-[#0A1F44]/5"
              )}
            >
              <Heart size={20} className={isWishlisted ? "fill-current" : ""} />
            </button>
            <button
              onClick={() => {
                if (!canPurchase) return;
                addItem({
                  id: product.id,
                  productId: product.id,
                  name: product.name,
                  price: effectivePrice,
                  originalPrice: product.originalPrice ?? null,
                  images: product.images ?? [],
                  vendorName: product.vendorName ?? "",
                  stock: effectiveStock,
                  category: product.category ?? "",
                });
                setAddedToCart(true);
                setTimeout(() => setAddedToCart(false), 2000);
              }}
              disabled={!canPurchase}
              className={cn(
                "flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold uppercase tracking-wider text-xs transition-all shadow-md min-h-[44px]",
                !canPurchase
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : addedToCart
                  ? "bg-emerald-700 text-white"
                  : "bg-[#0A1F44] text-white hover:bg-[#2C3E6B] active:scale-95"
              )}
            >
              <ShoppingBag size={16} />
              {variantRequired
                ? "Select Options"
                : isOutOfStock
                ? "Out of Stock"
                : addedToCart
                ? "Added!"
                : "Add to Bag"}
            </button>
          </div>
        </div>
      </Layout>

      {/* Zoom Lightbox Modal */}
      <AnimatePresence>
        {lightboxOpen && (
          <ZoomLightbox
            images={images}
            activeIndex={activeImage}
            onClose={closeLightbox}
            onNav={handleLightboxNav}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

