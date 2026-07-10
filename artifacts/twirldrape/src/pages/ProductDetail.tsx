import React, { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link, useLocation } from "wouter";
import { Layout } from "@/components/Layout";
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
  Play,
  Truck,
  RotateCcw,
  Shield,
  Store,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/ProductCard";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";

const RECENTLY_VIEWED_KEY = "twirl_recently_viewed";
function trackRecentlyViewed(productId: string) {
  try {
    const prev: string[] = JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
    const updated = [productId, ...prev.filter((id) => id !== productId)].slice(0, 20);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch {}
}

const SAMPLE_REVIEWS = [
  {
    id: 1,
    name: "Priya Sharma",
    initials: "PS",
    rating: 5,
    date: "March 12, 2025",
    text: "Absolutely breathtaking saree! The zari work is incredibly intricate and the silk quality is top-notch. Received so many compliments at my cousin's wedding. Worth every rupee.",
    verified: true,
    location: "Mumbai",
  },
  {
    id: 2,
    name: "Ananya Krishnan",
    initials: "AK",
    rating: 5,
    date: "February 28, 2025",
    text: "The colour is even more vibrant in person than in the photos. Packaging was luxurious and it arrived well before the expected delivery date. My mother was in tears — it reminded her of her own wedding saree.",
    verified: true,
    location: "Bangalore",
  },
  {
    id: 3,
    name: "Sunita Mehta",
    initials: "SM",
    rating: 4,
    date: "January 15, 2025",
    text: "Gorgeous piece with excellent craftsmanship. Took off one star because the blouse piece colour was slightly different from the saree. Otherwise a perfect purchase and the seller was very responsive.",
    verified: true,
    location: "Delhi",
  },
  {
    id: 4,
    name: "Deepa Nair",
    initials: "DN",
    rating: 5,
    date: "December 20, 2024",
    text: "I've been collecting Paithani sarees for years and this one stands out even in my collection. The border work is flawless and the weight of the silk feels genuine. Highly recommend TwirlDrape.",
    verified: false,
    location: "Pune",
  },
  {
    id: 5,
    name: "Kavita Joshi",
    initials: "KJ",
    rating: 4,
    date: "November 8, 2024",
    text: "Beautiful saree at a fair price. The drape is perfect and the colour fastness is good — I've washed it once following the dry-clean instructions and it came out perfect. Very happy with this purchase.",
    verified: true,
    location: "Jaipur",
  },
];

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
        className="absolute top-4 right-4 p-2 text-white/80 hover:text-white transition-colors z-10"
        onClick={onClose}
      >
        <X size={28} />
      </button>

      {images.length > 1 && imgScale === 1 && (
        <>
          <button
            className="absolute left-4 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
            onClick={(e) => { e.stopPropagation(); onNav(-1); }}
          >
            <ChevronLeft size={24} />
          </button>
          <button
            className="absolute right-4 p-3 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-full transition-all z-10"
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
                i === activeIndex ? "bg-[#C9A84C] scale-125" : "bg-white/40"
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

function DeliveryAccordion({ isDesigner }: { isDesigner: boolean }) {
  const [openPanel, setOpenPanel] = useState<string | null>(null);

  const panels = [
    {
      id: "delivery",
      icon: <Truck size={16} />,
      title: "Delivery Information",
      content: (
        <div className="space-y-3 text-sm leading-relaxed">
          <div className="flex gap-3">
            <Truck size={14} className="text-[#C9A84C] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Standard Delivery (5–7 Business Days)</p>
              <p className="opacity-70">Orders are dispatched within 2 business days of confirmation. Delivery in 5–7 business days nationwide. Free shipping on all orders above ₹3,000; a flat ₹149 fee applies below that.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Package size={14} className="text-[#C9A84C] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Express Delivery (2–3 Business Days)</p>
              <p className="opacity-70">Available at ₹299 additional charge. Dispatched same day if ordered before 2 PM. Select at checkout. Not available for remote PIN codes.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Shield size={14} className="text-[#C9A84C] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Secure Packaging</p>
              <p className="opacity-70">Each saree is wrapped in acid-free tissue paper and a branded dust bag before dispatch.</p>
            </div>
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
          <div className="flex gap-3">
            <CheckCircle2 size={14} className="text-green-500 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">7-Day Hassle-Free Returns</p>
              <p className="opacity-70">Return any unworn saree within 7 days of delivery. Original tags must be intact.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <RotateCcw size={14} className="text-[#C9A84C] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Easy Exchange</p>
              <p className="opacity-70">Exchange for a different colour or size within 14 days. Shipping for exchanges is free of charge.</p>
            </div>
          </div>
          <div className="flex gap-3">
            <Shield size={14} className="text-[#C9A84C] mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold mb-1">Quality Guarantee</p>
              <p className="opacity-70">All products undergo a quality check before dispatch. If you receive a defective item, we'll replace it or issue a full refund.</p>
            </div>
          </div>
        </div>
      ),
    },
  ];

  const borderColor = "border-[#C9A84C]/20";
  const bg = isDesigner ? "bg-[#2A2E35]" : "bg-white";

  return (
    <div className={cn("rounded-lg border overflow-hidden", borderColor, bg)}>
      {panels.map((panel, idx) => (
        <div key={panel.id} className={cn(idx > 0 && `border-t ${borderColor}`)}>
          <button
            className="w-full flex items-center justify-between p-4 text-left group"
            onClick={() => setOpenPanel(openPanel === panel.id ? null : panel.id)}
          >
            <div className="flex items-center gap-2 font-semibold text-sm">
              <span className="text-[#C9A84C]">{panel.icon}</span>
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
  isDesigner: boolean;
}) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-5 text-right opacity-70">{stars}★</span>
      <div
        className={cn(
          "flex-1 h-2 rounded-full overflow-hidden",
          isDesigner ? "bg-[#3A3E45]" : "bg-[#C8D8D0]"
        )}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, delay: 0.1 * (5 - stars) }}
          className="h-full bg-[#C9A84C] rounded-full"
        />
      </div>
      <span className="w-6 opacity-50">{count}</span>
    </div>
  );
}

function ReviewsSection({
  rating,
  reviewCount,
  isDesigner,
}: {
  rating: number;
  reviewCount: number;
  isDesigner: boolean;
}) {
  const totalReviews = reviewCount > 0 ? reviewCount : SAMPLE_REVIEWS.length;
  const roundedRating = Math.round(rating * 10) / 10;

  const starCounts = [5, 4, 3, 2, 1].map((s) => {
    if (s === Math.round(rating)) return Math.round(totalReviews * 0.55);
    if (s === Math.round(rating) - 1) return Math.round(totalReviews * 0.27);
    if (s === Math.round(rating) + 1) return Math.round(totalReviews * 0.1);
    if (s === 2) return Math.round(totalReviews * 0.05);
    return Math.round(totalReviews * 0.03);
  });

  const sectionBg = isDesigner ? "bg-[#2A2E35]" : "bg-white";
  const borderColor = "border-[#C9A84C]/20";
  const cardBg = isDesigner ? "bg-[#1E2329]" : "bg-[#F3F8F5]";

  return (
    <section className="mb-16">
      <div className="mb-8">
        <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-1">
          Customer Experiences
        </p>
        <h2
          className={cn(
            "font-serif text-2xl md:text-3xl font-bold",
            isDesigner ? "text-[#E6F0EA]" : "text-[#1E6B5A]"
          )}
        >
          Ratings & Reviews
        </h2>
      </div>

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
              className={cn(
                "text-6xl font-bold font-serif mb-2",
                isDesigner ? "text-[#C9A84C]" : "text-[#1E6B5A]"
              )}
            >
              {roundedRating}
            </p>
            <div className="flex justify-center mb-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  size={18}
                  className={cn(
                    s <= Math.round(rating)
                      ? "fill-[#C9A84C] text-[#C9A84C]"
                      : "text-gray-300"
                  )}
                />
              ))}
            </div>
            <p className="text-xs opacity-50">{totalReviews.toLocaleString("en-IN")} reviews</p>
          </div>

          <div className="flex-1 space-y-2 w-full">
            {[5, 4, 3, 2, 1].map((s, i) => (
              <StarBar
                key={s}
                stars={s}
                count={starCounts[i]}
                total={totalReviews}
                isDesigner={isDesigner}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SAMPLE_REVIEWS.map((review) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className={cn(
              "rounded-xl border p-5",
              cardBg,
              borderColor
            )}
          >
            <div className="flex items-start gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-[#1E6B5A] text-white flex items-center justify-center font-bold text-sm shrink-0">
                {review.initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{review.name}</p>
                  {review.verified && (
                    <span className="flex items-center gap-1 text-[10px] text-green-500 font-medium">
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
                        size={11}
                        className={cn(
                          s <= review.rating
                            ? "fill-[#C9A84C] text-[#C9A84C]"
                            : "text-gray-300"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] opacity-40">{review.date}</span>
                </div>
              </div>
            </div>
            <p className="text-sm leading-relaxed opacity-80">{review.text}</p>
            <p className="text-[10px] opacity-40 mt-2">{review.location}</p>
          </motion.div>
        ))}
      </div>
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
  const [galleryTab, setGalleryTab] = useState<"photos" | "video">("photos");

  const { data: product, isLoading, isError } = useGetProduct(id ?? "");

  useEffect(() => {
    if (id) trackRecentlyViewed(id);
  }, [id]);

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

  const themeClasses = isDesigner
    ? "bg-[#1E2329] text-[#E6F0EA]"
    : "bg-[#F3F8F5] text-[#3D1A1A]";

  const handleLightboxNav = useCallback(
    (dir: 1 | -1) => {
      if (!product) return;
      const images =
        product.images.length > 0
          ? product.images
          : ["/images/product-1.png"];
      setActiveImage((prev) => (prev + dir + images.length) % images.length);
    },
    [product]
  );

  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  if (isLoading) {
    return (
      <Layout>
        <div
          className={cn(
            "min-h-screen flex items-center justify-center",
            themeClasses
          )}
        >
          <div className="text-center">
            <div className="animate-spin w-10 h-10 border-2 border-[#C9A84C] border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-sm opacity-60">Loading product…</p>
          </div>
        </div>
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
              className="bg-[#C9A84C] text-[#1E6B5A] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm"
            >
              Back to Home
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const images =
    product.images.length > 0 ? product.images : ["/images/product-1.png"];
  const discount = product.originalPrice
    ? Math.round(
        ((product.originalPrice - product.price) / product.originalPrice) * 100
      )
    : null;

  const categoryPath =
    product.category === "paithani" ? "/paithani/shop" : "/designer/shop";
  const categoryLabel = product.category === "paithani" ? "Paithani" : "Designer";

  const pattern =
    product.category === "paithani"
      ? product.fabric === "silk"
        ? "Pure Silk Zari"
        : "Traditional Zari"
      : product.fabric === "georgette"
      ? "Georgette Embroidery"
      : "Contemporary Embroidery";

  const DEMO_VIDEO_URL = "https://www.youtube.com/embed/MuUSVu2UBvg?si=hS5E8jLZ3JlzOoXE";
  const videoUrl: string | null = product.category === "paithani" ? DEMO_VIDEO_URL : null;

  const specRows = [
    { label: "Category", value: categoryLabel },
    { label: "Subcategory / Occasion", value: product.occasion.charAt(0).toUpperCase() + product.occasion.slice(1) },
    { label: "Fabric", value: product.fabric.charAt(0).toUpperCase() + product.fabric.slice(1) },
    { label: "Color", value: product.color.charAt(0).toUpperCase() + product.color.slice(1) },
    { label: "Pattern", value: pattern },
    { label: "Brand Name", value: product.vendorName },
    { label: "Shop Name", value: `${product.vendorName} – TwirlDrape` },
    { label: "In Stock", value: product.stock > 0 ? `${product.stock} units available` : "Out of stock" },
  ];
  const isOutOfStock = product.stock <= 0;

  const shopPath = product.vendorId
    ? `/stores/${product.vendorId}`
    : categoryPath;

  return (
    <div className={isDesigner ? "dark" : ""}>
      <Layout>
        <div className={cn("min-h-screen", themeClasses)}>
          <div className="container mx-auto px-4 py-8 max-w-7xl">

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-60 mb-8 flex-wrap">
              <Link href="/" className="hover:text-[#C9A84C] transition-colors">Home</Link>
              <ChevronRight size={12} />
              <Link href={categoryPath} className="hover:text-[#C9A84C] transition-colors">{categoryLabel}</Link>
              <ChevronRight size={12} />
              <span className="line-clamp-1">{product.name}</span>
            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-16">

              {/* Image Gallery */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Tab switcher — Video tab hidden when no videoUrl */}
                <div className="flex gap-1 mb-3">
                  <button
                    onClick={() => setGalleryTab("photos")}
                    className={cn(
                      "px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all",
                      galleryTab === "photos"
                        ? "bg-[#C9A84C] text-[#1E6B5A]"
                        : "opacity-50 hover:opacity-80"
                    )}
                  >
                    Photos
                  </button>
                  {videoUrl && (
                    <button
                      onClick={() => setGalleryTab("video")}
                      className={cn(
                        "flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded transition-all",
                        galleryTab === "video"
                          ? "bg-[#C9A84C] text-[#1E6B5A]"
                          : "opacity-50 hover:opacity-80"
                      )}
                    >
                      <Play size={11} />
                      Video
                    </button>
                  )}
                </div>

                {galleryTab === "photos" ? (
                  <>
                    {/* Main Image */}
                    <div
                      className="relative aspect-square overflow-hidden rounded-lg border border-[#C9A84C]/20 mb-3 bg-gray-100 group cursor-zoom-in"
                      onClick={() => setLightboxOpen(true)}
                    >
                      <img
                        src={images[activeImage]}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      {product.isBestSeller && (
                        <span className="absolute top-4 left-4 bg-[#C9A84C] text-[#1E6B5A] text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
                          Best Seller
                        </span>
                      )}
                      {!product.isBestSeller && product.isNewArrival && (
                        <span className="absolute top-4 left-4 bg-[#1E6B5A] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
                          New Arrival
                        </span>
                      )}
                      {discount && (
                        <span className="absolute top-4 right-4 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded">
                          {discount}% OFF
                        </span>
                      )}
                      <div className="absolute bottom-4 right-4 p-2 bg-white/80 backdrop-blur rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                        <ZoomIn size={16} className="text-gray-700" />
                      </div>
                      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white bg-black/40 px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                        Click to zoom
                      </p>
                    </div>

                    {/* Thumbnails */}
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {images.map((img, i) => (
                        <button
                          key={i}
                          onClick={() => setActiveImage(i)}
                          className={cn(
                            "w-16 h-16 shrink-0 rounded-md overflow-hidden border-2 transition-all",
                            activeImage === i
                              ? "border-[#C9A84C] shadow-md"
                              : "border-transparent opacity-50 hover:opacity-100"
                          )}
                        >
                          <img src={img} alt="" className="w-full h-full object-cover" />
                        </button>
                      ))}
                    </div>
                  </>
                ) : videoUrl ? (
                  <div className="aspect-video rounded-lg overflow-hidden border border-[#C9A84C]/20 bg-black">
                    <iframe
                      src={videoUrl}
                      title="Saree video showcase"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full"
                    />
                  </div>
                ) : null}
              </motion.div>

              {/* Product Info */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col"
              >
                <h1
                  className={cn(
                    "font-serif text-3xl md:text-4xl font-bold leading-tight mb-3",
                    isDesigner ? "text-[#E6F0EA]" : "text-[#1E6B5A]"
                  )}
                >
                  {product.name}
                </h1>

                {/* Brand & Shop callout — below product title */}
                <div className={cn(
                  "flex items-center gap-4 rounded-lg border p-3 mb-4",
                  isDesigner ? "bg-[#2A2E35] border-[#C9A84C]/20" : "bg-white border-[#C9A84C]/15"
                )}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Store size={14} className="text-[#C9A84C] shrink-0" />
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider opacity-50">Brand / Weaver</p>
                      <p className="font-bold text-sm truncate">{product.vendorName}</p>
                    </div>
                  </div>
                  <Link
                    href={shopPath}
                    className="flex items-center gap-1 text-xs font-bold text-[#C9A84C] hover:opacity-80 transition-opacity whitespace-nowrap"
                  >
                    Visit Shop <ExternalLink size={11} />
                  </Link>
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-5">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        size={16}
                        className={cn(
                          "transition-colors",
                          star <= Math.round(product.rating)
                            ? "fill-[#C9A84C] text-[#C9A84C]"
                            : "text-gray-300"
                        )}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-semibold">{product.rating.toFixed(1)}</span>
                  <span className="text-sm opacity-60">({product.reviewCount} reviews)</span>
                </div>

                {/* Price */}
                <div className="flex items-end gap-4 mb-6">
                  <span
                    className={cn(
                      "text-4xl font-bold",
                      isDesigner ? "text-[#C9A84C]" : "text-[#1E6B5A]"
                    )}
                  >
                    ₹{product.price.toLocaleString("en-IN")}
                  </span>
                  {product.originalPrice && (
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xl opacity-50 line-through">
                        ₹{product.originalPrice.toLocaleString("en-IN")}
                      </span>
                      <span className="text-sm font-bold text-green-500">{discount}% off</span>
                    </div>
                  )}
                </div>

                {/* Full Spec Table */}
                <div className={cn(
                  "rounded-lg border mb-6 overflow-hidden",
                  isDesigner ? "border-[#C9A84C]/20" : "border-[#C9A84C]/15"
                )}>
                  <div className={cn(
                    "px-4 py-2 border-b text-[10px] uppercase tracking-widest font-bold text-[#C9A84C]",
                    isDesigner ? "bg-[#2A2E35] border-[#C9A84C]/20" : "bg-[#C9A84C]/5 border-[#C9A84C]/15"
                  )}>
                    Product Specifications
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <tbody>
                        {specRows.map((row, i) => (
                          <tr
                            key={row.label}
                            className={cn(
                              "border-b last:border-0",
                              isDesigner
                                ? i % 2 === 0 ? "bg-[#1E2329] border-[#C9A84C]/10" : "bg-[#2A2E35] border-[#C9A84C]/10"
                                : i % 2 === 0 ? "bg-white border-[#C9A84C]/10" : "bg-[#F3F8F5] border-[#C9A84C]/10"
                            )}
                          >
                            <td className="px-4 py-2.5 opacity-50 font-medium w-40 whitespace-nowrap">{row.label}</td>
                            <td className="px-4 py-2.5 font-semibold">{row.value}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Description */}
                <p className="leading-relaxed opacity-80 mb-6 text-sm md:text-base">
                  {product.description}
                </p>

                {/* Stock Status */}
                {product.stock > 0 && product.stock <= 5 && (
                  <div className="flex items-center gap-2 mb-4 text-orange-500">
                    <Package size={16} />
                    <span className="text-sm font-semibold">
                      Only {product.stock} left in stock — order soon!
                    </span>
                  </div>
                )}
                {isOutOfStock && (
                  <div className="flex items-center gap-2 mb-4 text-red-500">
                    <Package size={16} />
                    <span className="text-sm font-semibold">Currently out of stock</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <button
                    onClick={() => {
                      if (isOutOfStock) return;
                      addItem({
                        id: product.id,
                        productId: product.id,
                        name: product.name,
                        price: product.price,
                        originalPrice: product.originalPrice ?? null,
                        images: product.images ?? [],
                        vendorName: product.vendorName ?? "",
                        stock: product.stock ?? 99,
                        category: product.category ?? "",
                      });
                      setAddedToCart(true);
                      setTimeout(() => setAddedToCart(false), 2000);
                    }}
                    disabled={isOutOfStock}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-4 font-bold uppercase tracking-wider text-sm transition-all rounded-sm disabled:cursor-not-allowed",
                      isOutOfStock
                        ? "bg-gray-300 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        : addedToCart
                        ? "bg-green-600 text-white"
                        : "bg-[#C9A84C] text-[#1E6B5A] hover:bg-[#b59539]"
                    )}
                  >
                    <ShoppingBag size={18} />
                    {isOutOfStock ? "Out of Stock" : addedToCart ? "Added to Cart!" : "Add to Cart"}
                  </button>
                  <button
                    onClick={() => toggle(id ?? "")}
                    className={cn(
                      "flex items-center justify-center gap-2 px-6 py-4 border font-bold uppercase tracking-wider text-sm rounded-sm transition-all",
                      isWishlisted
                        ? "bg-[#1E6B5A] border-[#1E6B5A] text-white"
                        : "border-[#C9A84C]/40 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                    )}
                  >
                    <Heart size={18} className={isWishlisted ? "fill-current" : ""} />
                    Wishlist
                  </button>
                </div>
                <button
                  onClick={() => {
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
                            price: product.price,
                            originalPrice: product.originalPrice ?? null,
                            images: product.images ?? [],
                            vendorName: product.vendorName ?? "",
                            stock: product.stock ?? 99,
                            category: product.category ?? "",
                          },
                        })
                      );
                    } catch {}
                    setLocation("/checkout");
                  }}
                  disabled={isOutOfStock}
                  className={cn(
                    "w-full flex items-center justify-center gap-2 py-4 border-2 font-bold uppercase tracking-wider text-sm rounded-sm transition-all mb-6 disabled:opacity-50 disabled:cursor-not-allowed",
                    isDesigner
                      ? "border-[#C9A84C] text-[#C9A84C] hover:bg-[#C9A84C]/10"
                      : "border-[#1E6B5A] text-[#1E6B5A] hover:bg-[#1E6B5A]/5"
                  )}
                >
                  <Package size={18} />
                  Buy Now
                </button>

                {/* Delivery & Returns Accordion */}
                <DeliveryAccordion isDesigner={isDesigner} />
              </motion.div>
            </div>

            {/* Reviews Section */}
            <ReviewsSection
              rating={product.rating}
              reviewCount={product.reviewCount}
              isDesigner={isDesigner}
            />

            {/* Similar Products (by occasion) */}
            {similar.length > 0 && (
              <section className="mb-16">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-1">
                      Curated For You
                    </p>
                    <h2
                      className={cn(
                        "font-serif text-2xl md:text-3xl font-bold",
                        isDesigner ? "text-[#E6F0EA]" : "text-[#1E6B5A]"
                      )}
                    >
                      Similar Products
                    </h2>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {similar.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
                </div>
              </section>
            )}

            {/* Related Products (by category) */}
            {related.length > 0 && (
              <section className="mb-12">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-1">
                      From the same collection
                    </p>
                    <h2
                      className={cn(
                        "font-serif text-2xl md:text-3xl font-bold",
                        isDesigner ? "text-[#E6F0EA]" : "text-[#1E6B5A]"
                      )}
                    >
                      You May Also Like
                    </h2>
                  </div>
                  <Link
                    href={categoryPath}
                    className="hidden md:flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#C9A84C] hover:opacity-80 transition-opacity"
                  >
                    View All <ArrowLeft size={16} className="rotate-180" />
                  </Link>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {related.map((p, i) => (
                    <ProductCard key={p.id} product={p} index={i} />
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </Layout>

      {/* Zoom Lightbox */}
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
