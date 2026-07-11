import React, { useEffect, useState } from "react";
import { useRoute, Link } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Star, Package, ArrowLeft, ArrowRight, Users } from "lucide-react";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { getApiUrl } from "@/lib/api";

const GOLD = "#C9A84C";
const MAROON = "#1E6B5A";
const IVORY = "#F3F8F5";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.07, ease: "easeOut" as const },
  }),
};

interface Vendor {
  id: string;
  name: string;
  location: string;
  rating: number;
  sareesCount: number;
  avatar: string | null;
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

const ARTISAN_FALLBACKS = [
  "/images/artisan-1.png",
  "/images/hero-paithani-2.png",
  "/images/hero-paithani.png",
];

function deriveTechniqueLabel(vendor: Vendor): string | null {
  const text = [vendor.name, vendor.bio, vendor.tagline, vendor.location]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const techniques: [string, string][] = [
    ["paithani", "Paithani Silk Weaving"],
    ["kanjivaram", "Kanjivaram Silk"],
    ["kanjeevaram", "Kanjivaram Silk"],
    ["chanderi", "Chanderi Weaving"],
    ["tant", "Tant Cotton Weaving"],
    ["banarasi", "Banarasi Silk"],
    ["pochampally", "Pochampally Ikat"],
    ["ikat", "Ikat Weaving"],
    ["jamdani", "Jamdani Weaving"],
    ["patola", "Patola Weaving"],
    ["bandhani", "Bandhani Tie-dye"],
    ["kalamkari", "Kalamkari"],
    ["zari", "Zari Brocade"],
    ["silk", "Silk Weaving"],
    ["cotton", "Cotton Weaving"],
  ];

  for (const [keyword, label] of techniques) {
    if (text.includes(keyword)) return label;
  }
  return null;
}

export default function WeaverProfile() {
  const [, params] = useRoute("/weavers/:id");
  const vendorId = params?.id ?? "";

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingVendor, setLoadingVendor] = useState(true);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!vendorId) return;

    setLoadingVendor(true);
    setLoadingProducts(true);

    fetch(getApiUrl(`/api/vendors/${vendorId}`), { credentials: "include" })
      .then((r) => {
        if (r.status === 404) throw new Error("Weaver profile not found");
        return r.json();
      })
      .then((data) => setVendor(data))
      .catch((err) => setError(err.message ?? "Failed to load weaver profile"))
      .finally(() => setLoadingVendor(false));

    fetch(getApiUrl(`/api/products?vendorId=${encodeURIComponent(vendorId)}&limit=60`), { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setProducts(data.products ?? []))
      .catch(() => setProducts([]))
      .finally(() => setLoadingProducts(false));
  }, [vendorId]);

  if (loadingVendor) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center" style={{ background: IVORY }}>
          <div className="text-center">
            <div
              className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin mx-auto mb-3"
              style={{ borderColor: MAROON }}
            />
            <p className="text-sm text-gray-400">Loading weaver profile…</p>
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
              <Users size={28} className="text-red-400" />
            </div>
            <h2 className="font-serif text-2xl font-bold mb-2" style={{ color: MAROON }}>
              Weaver Not Found
            </h2>
            <p className="text-sm text-gray-500 mb-6">
              This weaver profile doesn't exist or is no longer available.
            </p>
            <Link
              href="/weavers"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider hover:opacity-80 transition-opacity"
              style={{ color: MAROON }}
            >
              <ArrowLeft size={13} /> Back to Weavers
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  const activeProducts = products.filter((p) => p.stock > 0);
  const soldOutProducts = products.filter((p) => p.stock === 0);
  const allVisible = [...activeProducts, ...soldOutProducts];
  const techniqueLabel = deriveTechniqueLabel(vendor);

  return (
    <Layout>
      <div style={{ background: IVORY, minHeight: "100vh" }}>

        {/* Hero Banner */}
        <div
          className="relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${MAROON} 0%, #5e1421 100%)` }}
        >
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: "repeating-linear-gradient(45deg, rgba(201,168,76,0.4) 0, rgba(201,168,76,0.4) 1px, transparent 0, transparent 50%)",
              backgroundSize: "10px 10px",
            }}
          />

          <div className="relative max-w-6xl mx-auto px-6 py-14">
            {/* Back nav */}
            <Link
              href="/weavers"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#F3F8F5]/60 hover:text-[#F3F8F5] transition-colors mb-8"
            >
              <ArrowLeft size={12} /> All Weavers
            </Link>

            <div className="flex flex-col sm:flex-row items-center sm:items-end gap-8">
              {/* Avatar */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5 }}
                className="w-32 h-32 rounded-2xl border-4 overflow-hidden bg-[#F3F8F5]/10 shrink-0"
                style={{ borderColor: `${GOLD}80` }}
              >
                <img
                  src={vendor.avatar || ARTISAN_FALLBACKS[0]}
                  alt={vendor.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = ARTISAN_FALLBACKS[0];
                  }}
                />
              </motion.div>

              {/* Info */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="flex-1 text-center sm:text-left"
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.3em] mb-2"
                  style={{ color: GOLD }}
                >
                  Verified Artisan Partner
                </p>
                <h1 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-2">
                  {vendor.name}
                </h1>
                {vendor.tagline && (
                  <p className="text-[#F3F8F5]/70 text-sm mb-4 max-w-lg">{vendor.tagline}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 justify-center sm:justify-start text-sm text-[#F3F8F5]/60">
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
                    {allVisible.length} saree{allVisible.length !== 1 ? "s" : ""}
                  </span>
                  {techniqueLabel && (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded"
                      style={{ background: `${GOLD}30`, color: GOLD }}
                    >
                      {techniqueLabel}
                    </span>
                  )}
                </div>
              </motion.div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-6xl mx-auto px-6 py-12">

          {/* Bio */}
          {vendor.bio && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              className="bg-white rounded-2xl border border-[#C9A84C]/20 p-7 mb-10 max-w-3xl"
            >
              <h2 className="font-serif text-lg font-bold mb-4" style={{ color: MAROON }}>
                About the Collective
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">{vendor.bio}</p>
            </motion.div>
          )}

          {/* Craft Details */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-12"
          >
            {[
              { label: "Region", value: vendor.location },
              { label: "Technique", value: techniqueLabel ?? "Handloom Weaving" },
              { label: "Rating", value: `${vendor.rating.toFixed(1)} / 5.0` },
              { label: "Active Listings", value: `${activeProducts.length}` },
            ].map((item) => (
              <div
                key={item.label}
                className="bg-white rounded-xl border border-[#C9A84C]/15 p-4 text-center"
              >
                <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{item.label}</p>
                <p className="font-semibold text-sm" style={{ color: MAROON }}>{item.value}</p>
              </div>
            ))}
          </motion.div>

          {/* Products */}
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-serif text-xl font-bold" style={{ color: MAROON }}>
              {activeProducts.length > 0
                ? `${activeProducts.length} Available Saree${activeProducts.length !== 1 ? "s" : ""}`
                : "Sarees by This Weaver"}
            </h2>
            {allVisible.length > 0 && (
              <Link
                href={`/stores/${vendor.id}`}
                className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider hover:opacity-70 transition-opacity"
                style={{ color: MAROON }}
              >
                Visit Full Store <ArrowRight size={12} />
              </Link>
            )}
          </div>

          {loadingProducts ? (
            <div className="py-16 text-center text-gray-400 text-sm">Loading sarees…</div>
          ) : allVisible.length === 0 ? (
            <div className="py-20 text-center">
              <Package size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-400 font-medium">No sarees listed yet.</p>
              <p className="text-sm text-gray-400 mt-1">
                Check back soon for new pieces from this weaver.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {allVisible.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          )}

          {/* Back link */}
          <div className="mt-16 pt-8 border-t border-[#C9A84C]/20">
            <Link
              href="/weavers"
              className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider hover:opacity-70 transition-opacity"
              style={{ color: MAROON }}
            >
              <ArrowLeft size={14} /> Back to All Weavers
            </Link>
          </div>
        </div>

      </div>
    </Layout>
  );
}
