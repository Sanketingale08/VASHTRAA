import React, { useState } from "react";
import { useParams, Link } from "wouter";
import { Layout } from "@/components/Layout";
import { useGetProduct, useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Heart, Star, ChevronRight, ShoppingBag, Package, ArrowLeft, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProductCard } from "@/components/ProductCard";
import type { ProductSummary } from "@workspace/api-client-react";
import { useWishlist } from "@/context/WishlistContext";

export default function ProductDetail() {
  const { id } = useParams<{ id: string }>();
  const { wishlistedIds, toggle } = useWishlist();
  const isWishlisted = wishlistedIds.has(id ?? "");
  const [activeImage, setActiveImage] = useState(0);
  const [addedToCart, setAddedToCart] = useState(false);

  const { data: product, isLoading, isError } = useGetProduct(id ?? "");

  const isDesigner = product?.category === "designer";
  const isPaithani = product?.category === "paithani";

  const relatedParams = { category: product?.category, limit: 4 };
  const { data: relatedData } = useListProducts(
    relatedParams,
    { query: { enabled: !!product, queryKey: getListProductsQueryKey(relatedParams) } }
  );
  const related = relatedData?.products.filter((p) => p.id !== id).slice(0, 4) ?? [];

  const themeClasses = isDesigner
    ? "bg-[#1E2329] text-[#F5EDE0]"
    : "bg-[#FAF6EE] text-[#3D1A1A]";

  const accentColor = "#C9A84C";
  const primaryColor = isDesigner ? "#C9A84C" : "#7B1C2C";

  if (isLoading) {
    return (
      <Layout>
        <div className={cn("min-h-screen flex items-center justify-center", themeClasses)}>
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
        <div className={cn("min-h-screen flex items-center justify-center", themeClasses)}>
          <div className="text-center max-w-md px-4">
            <h2 className="font-serif text-3xl mb-4">Product Not Found</h2>
            <p className="opacity-60 mb-8">This product may have been removed or sold out.</p>
            <Link href="/" className="bg-[#C9A84C] text-[#7B1C2C] px-8 py-3 font-bold uppercase tracking-wider text-sm rounded-sm">
              Back to Home
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const images = product.images.length > 0 ? product.images : ["/images/product-1.png"];
  const discount = product.originalPrice
    ? Math.round(((product.originalPrice - product.price) / product.originalPrice) * 100)
    : null;

  const categoryPath = product.category === "paithani" ? "/paithani/shop" : "/designer/shop";
  const categoryLabel = product.category === "paithani" ? "Paithani" : "Designer";

  return (
    <div className={isDesigner ? "dark" : ""}>
      <Layout>
        <div className={cn("min-h-screen", themeClasses)}>
          <div className="container mx-auto px-4 py-8 max-w-7xl">

            {/* Breadcrumbs */}
            <nav className="flex items-center gap-2 text-xs uppercase tracking-wider opacity-60 mb-8">
              <Link href="/" className="hover:text-[#C9A84C] transition-colors">Home</Link>
              <ChevronRight size={12} />
              <Link href={categoryPath} className="hover:text-[#C9A84C] transition-colors">{categoryLabel}</Link>
              <ChevronRight size={12} />
              <span className="line-clamp-1">{product.name}</span>
            </nav>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 mb-24">

              {/* Image Gallery */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5 }}
              >
                {/* Main Image */}
                <div className="relative aspect-square overflow-hidden rounded-lg border border-[#C9A84C]/20 mb-4 bg-gray-100 group">
                  <img
                    src={images[activeImage]}
                    alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  {product.isBestSeller && (
                    <span className="absolute top-4 left-4 bg-[#C9A84C] text-[#7B1C2C] text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
                      Best Seller
                    </span>
                  )}
                  {product.isNewArrival && (
                    <span className="absolute top-4 left-4 bg-[#7B1C2C] text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded">
                      New Arrival
                    </span>
                  )}
                  {discount && (
                    <span className="absolute top-4 right-4 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded">
                      {discount}% OFF
                    </span>
                  )}
                  <button className="absolute bottom-4 right-4 p-2 bg-white/80 backdrop-blur rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
                    <ZoomIn size={16} className="text-gray-700" />
                  </button>
                </div>

                {/* Thumbnails */}
                {images.length > 1 && (
                  <div className="flex gap-3">
                    {images.map((img, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveImage(i)}
                        className={cn(
                          "w-20 h-20 rounded-md overflow-hidden border-2 transition-all",
                          activeImage === i
                            ? "border-[#C9A84C] shadow-md"
                            : "border-transparent opacity-60 hover:opacity-100"
                        )}
                      >
                        <img src={img} alt="" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Product Info */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex flex-col"
              >
                <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-2">
                  {product.vendorName}
                </p>

                <h1 className={cn("font-serif text-3xl md:text-4xl font-bold leading-tight mb-4", isDesigner ? "text-[#F5EDE0]" : "text-[#7B1C2C]")}>
                  {product.name}
                </h1>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-6">
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
                <div className="flex items-end gap-4 mb-8">
                  <span className={cn("text-4xl font-bold", isDesigner ? "text-[#C9A84C]" : "text-[#7B1C2C]")}>
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

                {/* Product Details Grid */}
                <div className="grid grid-cols-2 gap-4 mb-8 p-5 rounded-lg border border-[#C9A84C]/20 bg-[#C9A84C]/5">
                  {[
                    { label: "Category", value: product.category.charAt(0).toUpperCase() + product.category.slice(1) },
                    { label: "Fabric", value: product.fabric.charAt(0).toUpperCase() + product.fabric.slice(1) },
                    { label: "Color", value: product.color.charAt(0).toUpperCase() + product.color.slice(1) },
                    { label: "Occasion", value: product.occasion.charAt(0).toUpperCase() + product.occasion.slice(1) },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p className="text-xs uppercase tracking-wider opacity-50 mb-1">{label}</p>
                      <p className="font-semibold text-sm">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Description */}
                <p className="leading-relaxed opacity-80 mb-8 text-sm md:text-base">
                  {product.description}
                </p>

                {/* Stock Status */}
                {product.stock <= 5 && (
                  <div className="flex items-center gap-2 mb-6 text-orange-500">
                    <Package size={16} />
                    <span className="text-sm font-semibold">Only {product.stock} left in stock!</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-4 mt-auto">
                  <button
                    onClick={() => {
                      setAddedToCart(true);
                      setTimeout(() => setAddedToCart(false), 2000);
                    }}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-4 font-bold uppercase tracking-wider text-sm transition-all rounded-sm",
                      addedToCart
                        ? "bg-green-600 text-white"
                        : "bg-[#C9A84C] text-[#7B1C2C] hover:bg-[#b59539]"
                    )}
                  >
                    <ShoppingBag size={18} />
                    {addedToCart ? "Added!" : "Add to Cart"}
                  </button>
                  <button
                    onClick={() => toggle(id ?? "")}
                    className={cn(
                      "flex items-center justify-center gap-2 px-6 py-4 border font-bold uppercase tracking-wider text-sm rounded-sm transition-all",
                      isWishlisted
                        ? "bg-[#7B1C2C] border-[#7B1C2C] text-white"
                        : "border-[#C9A84C]/40 hover:border-[#C9A84C] hover:text-[#C9A84C]"
                    )}
                  >
                    <Heart size={18} className={isWishlisted ? "fill-current" : ""} />
                    Wishlist
                  </button>
                </div>
              </motion.div>
            </div>

            {/* Related Products */}
            {related.length > 0 && (
              <section>
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <p className="text-xs uppercase tracking-[0.25em] text-[#C9A84C] font-bold mb-1">You may also like</p>
                    <h2 className={cn("font-serif text-2xl md:text-3xl font-bold", isDesigner ? "text-[#F5EDE0]" : "text-[#7B1C2C]")}>
                      Similar Products
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
    </div>
  );
}
