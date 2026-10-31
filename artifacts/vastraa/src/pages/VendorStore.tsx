import React, { useEffect, useState, useCallback } from "react";
import { useRoute } from "wouter";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { Skeleton, ProductGridSkeleton } from "@/components/skeletons";
import { motion } from "framer-motion";
import { MapPin, Star, Package, Mail, ExternalLink } from "lucide-react";
import { getApiUrl } from "@/lib/api";
const MAROON = "#0A1F44";
const GOLD = "#C7CCD1";
const IVORY = "#F4F5F7";

interface VendorData {
  id: string;
  name: string;
  location: string;
  rating: number;
  sareesCount: number;
  avatar: string;
  bio: string | null;
  tagline: string | null;
  contactEmail: string | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  originalPrice: number | null;
  images: string[];
  vendorName: string;
  vendorId: string | null;
  rating: number;
  reviewCount: number;
  stock: number;
  isBestSeller: boolean;
  isNewArrival: boolean;
  category: string;
  fabric: string;
}

export default function VendorStore() {
  const [, params] = useRoute("/stores/:vendorId");
  const vendorId = params?.vendorId ?? "";

  const [vendor, setVendor] = useState<VendorData | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState("");

  const loadProducts = useCallback(() => {
    if (!vendorId) return;
    fetch(getApiUrl(`/api/products?vendorId=${encodeURIComponent(vendorId)}&limit=60`), { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [vendorId]);

  useEffect(() => {
    if (!vendorId) return;

    setLoadingVendor(true);
    setLoadingProducts(true);

    fetch(getApiUrl(`/api/vendors/${vendorId}`), { credentials: "include" })
      .then((r) => {
        if (r.status === 404) throw new Error("Vendor not found");
        return r.json();
      })
      .then((data) => setVendor(data))
      .catch((err) => setError(err.message ?? "Failed to load store"))
      .finally(() => setLoadingVendor(false));

    loadProducts();
  }, [vendorId, loadProducts]);

  useEffect(() => {
    if (!vendorId) return;
    const handleRealtimeEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      if (
        detail.name.startsWith("product:") ||
        detail.name.startsWith("inventory:") ||
        detail.name === "catalog:updated" ||
        detail.name.startsWith("vendor:")
      ) {
        const eventVendorId =
          detail.data?.vendorId ||
          detail.data?.sellerId ||
          detail.data?.payload?.vendorId ||
          detail.data?.payload?.sellerId ||
          detail.data?.product?.vendorId ||
          detail.data?.product?.sellerId;
        if (!eventVendorId || eventVendorId === vendorId) {
          loadProducts();
        }
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtimeEvent);
    return () => {
      window.removeEventListener("vastraa-realtime-event", handleRealtimeEvent);
    };
  }, [vendorId, loadProducts]);

  if (loadingVendor) {
    return (
      <Layout>
        <div style={{ background: IVORY, minHeight: "100vh" }} role="status" aria-busy="true" aria-label="Loading vendor store">
          {/* Store Hero Banner Skeleton */}
          <div className="relative overflow-hidden bg-gradient-to-r from-[#0A1F44] to-[#2C3E6B]">
            <div className="relative max-w-6xl mx-auto px-6 py-14 flex flex-col sm:flex-row items-center sm:items-end gap-8">
              <Skeleton className="w-28 h-28 rounded-2xl border-4 border-[#C7CCD1]/50 bg-white/20 shrink-0" />
              <div className="text-center sm:text-left flex-1 space-y-3">
                <Skeleton className="h-8 w-64 rounded bg-white/30" />
                <Skeleton className="h-4 w-96 rounded bg-white/20" />
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 pt-1">
                  <Skeleton className="h-5 w-28 rounded-full bg-white/20" />
                  <Skeleton className="h-5 w-20 rounded-full bg-white/20" />
                  <Skeleton className="h-5 w-24 rounded-full bg-white/20" />
                </div>
              </div>
            </div>
          </div>

          {/* Store Products Skeleton */}
          <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
            <div className="flex items-center justify-between">
              <Skeleton className="h-6 w-36 rounded" />
            </div>
            <ProductGridSkeleton count={8} />
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !vendor) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center" style={{ background: IVORY }}>
          <div className="text-center max-w-sm px-4">
            <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
              <Package size={28} className="text-red-400" />
            </div>
            <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: MAROON }}>Store Not Found</h2>
            <p className="text-sm text-gray-500">This vendor store doesn't exist or is no longer available.</p>
          </div>
        </div>
      </Layout>
    );
  }

  const activeProducts = products.filter((p) => p.stock > 0);
  const soldOutProducts = products.filter((p) => p.stock === 0);
  const allVisible = [...activeProducts, ...soldOutProducts];

  return (
    <Layout>
      <div style={{ background: IVORY, minHeight: "100vh" }}>
        {/* Store Hero Banner */}
        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${MAROON} 0%, #2C3E6B 100%)` }}>
          <div className="absolute inset-0 opacity-10">
            <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(45deg, rgba(199,204,209,0.3) 0, rgba(199,204,209,0.3) 1px, transparent 0, transparent 50%)", backgroundSize: "10px 10px" }} />
          </div>

          <div className="relative max-w-6xl mx-auto px-6 py-14 flex flex-col sm:flex-row items-center sm:items-end gap-8">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="w-28 h-28 rounded-2xl border-4 border-[#C7CCD1]/50 overflow-hidden bg-[#F4F5F7]/10 shrink-0 flex items-center justify-center"
            >
              <img
                src={vendor.avatar || "/images/artisan-1.png"}
                alt={vendor.name}
                className="w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).src = "/images/artisan-1.png"; }}
              />
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex-1 text-center sm:text-left"
            >
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-[#C7CCD1] mb-2">Official Store</p>
              <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-2">{vendor.name}</h1>
              {vendor.tagline && (
                <p className="text-[#F4F5F7]/70 text-sm mb-4 max-w-lg">{vendor.tagline}</p>
              )}
              <div className="flex flex-wrap items-center gap-4 justify-center sm:justify-start text-sm text-[#F4F5F7]/60">
                <span className="flex items-center gap-1.5">
                  <MapPin size={13} style={{ color: GOLD }} />
                  {vendor.location}
                </span>
                <span className="flex items-center gap-1.5">
                  <Star size={13} style={{ color: GOLD }} className="fill-current" />
                  {vendor.rating.toFixed(1)} rating
                </span>
                <span className="flex items-center gap-1.5">
                  <Package size={13} style={{ color: GOLD }} />
                  {allVisible.length} product{allVisible.length !== 1 ? "s" : ""}
                </span>
                {vendor.contactEmail && (
                  <a
                    href={`mailto:${vendor.contactEmail}`}
                    className="flex items-center gap-1.5 hover:text-[#F4F5F7] transition-colors"
                  >
                    <Mail size={13} style={{ color: GOLD }} />
                    Contact
                    <ExternalLink size={10} />
                  </a>
                )}
              </div>
            </motion.div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-6 py-10">
          {/* Bio */}
          {vendor.bio && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 mb-10"
            >
              <h2 className="font-serif text-lg font-bold mb-3" style={{ color: MAROON }}>About the Store</h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{vendor.bio}</p>
            </motion.div>
          )}

          {/* Products */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold" style={{ color: MAROON }}>
              {activeProducts.length > 0 ? `${activeProducts.length} Active Listing${activeProducts.length !== 1 ? "s" : ""}` : "All Products"}
            </h2>
          </div>

          {loadingProducts ? (
            <ProductGridSkeleton count={8} />
          ) : allVisible.length === 0 ? (
            <div className="py-20 text-center">
              <Package size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-600 font-semibold text-lg font-serif mb-1">No products available at the moment.</p>
              <p className="text-sm text-gray-400">Please check back soon for authentic handcrafted sarees from this registered artisan.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
              {allVisible.map((product, i) => (
                <div key={product.id} className="h-full flex flex-col">
                  <ProductCard product={product} index={i} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
