import React, { useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { CategoryCard, fadeUp } from "@/components/CategoryCard";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { QuickViewModal } from "@/components/QuickViewModal";
import { useListProducts } from "@workspace/api-client-react";
import type { ProductSummary } from "@workspace/api-client-react";

const GOLD = "#C9A84C";
const MAROON = "#1E6B5A";
const IVORY = "#F3F8F5";
const CREAM = "#E6F0EA";

type CategoryId = "paithani" | "designer";

const CATEGORY_CARDS: Array<{
  id: CategoryId;
  label: string;
  tagline: string;
  description: string;
  image: string;
  fallback: string;
  bg: string;
  chipLabel: string;
}> = [
  {
    id: "paithani",
    label: "Paithani Sarees",
    tagline: "Heritage Woven in Silk",
    description:
      "Discover the latest arrivals from Yeola's master weavers — vibrant zari borders, peacock motifs, and timeless craftsmanship for every celebration.",
    image: "/images/hero-paithani-1.png",
    fallback: "/images/product-1.png",
    bg: MAROON,
    chipLabel: "New Paithani",
  },
  {
    id: "designer",
    label: "Designer Sarees",
    tagline: "Contemporary Elegance",
    description:
      "Fresh contemporary styles and modern silhouettes — just landed this season. Bold prints, luxurious fabrics, and designs made for the modern woman.",
    image: "/images/hero-designer-1.png",
    fallback: "/images/product-2.png",
    bg: "#1E2329",
    chipLabel: "New Designer",
  },
];


function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-[#E6F0EA] animate-pulse">
      <div className="aspect-[3/4] bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function NewArrivals() {
  const [quickViewProduct, setQuickViewProduct] = useState<ProductSummary | null>(null);
  const [activeCategory, setActiveCategory] = useState<CategoryId | null>(null);

  const { data, isLoading } = useListProducts({
    newArrival: true,
    sort: "newest",
    limit: 12,
    ...(activeCategory ? { category: activeCategory } : {}),
  });

  const allProducts = data?.products ?? [];
  const totalCount = data?.total ?? 0;

  const activeCard = CATEGORY_CARDS.find((c) => c.id === activeCategory);

  function handleSelect(id: CategoryId) {
    setActiveCategory((prev) => (prev === id ? null : id));
  }

  const shopAllHref = activeCategory === "paithani"
    ? "/paithani/shop?newArrival=true"
    : activeCategory === "designer"
    ? "/designer/shop?newArrival=true"
    : null;

  return (
    <Layout>
      {/* ── Category Cards ─────────────────────────────────────────── */}
      <section className="py-10 md:py-14" style={{ background: IVORY }}>
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7">
            {CATEGORY_CARDS.map((card, i) => (
              <CategoryCard
                key={card.id}
                card={card}
                index={i}
                isActive={activeCategory === card.id}
                onSelect={() => handleSelect(card.id)}
              />
            ))}
          </div>
          {activeCategory && (
            <motion.p
              key={activeCategory}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 text-center text-xs text-gray-400"
            >
              Showing new arrivals for{" "}
              <span className="font-semibold" style={{ color: MAROON }}>
                {activeCard?.label}
              </span>
              {" "}·{" "}
              <button
                type="button"
                onClick={() => setActiveCategory(null)}
                className="underline hover:no-underline"
                style={{ color: GOLD }}
              >
                Show all
              </button>
            </motion.p>
          )}
        </div>
      </section>

      {/* ── Product Grid ─────────────────────────────────────────────── */}
      <section className="py-16 md:py-20" style={{ background: CREAM }}>
        <div className="container mx-auto px-4">
          <motion.div
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeUp}
            className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10"
          >
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] mb-2" style={{ color: GOLD }}>
                {activeCategory ? activeCard?.label : "All New Arrivals"}
              </p>
              <div className="flex items-center gap-4">
                <span className="flex-none h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
                <h2 className="font-serif text-3xl md:text-4xl font-bold" style={{ color: MAROON }}>
                  Latest Collection
                </h2>
              </div>
              {!isLoading && totalCount > 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  Showing {allProducts.length} of {totalCount} new arrivals
                </p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => handleSelect("paithani")}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-80"
                style={{ color: activeCategory === "paithani" ? GOLD : MAROON }}
              >
                All Paithani <ArrowRight size={12} />
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => handleSelect("designer")}
                className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-80"
                style={{ color: activeCategory === "designer" ? GOLD : MAROON }}
              >
                All Designer <ArrowRight size={12} />
              </button>
            </div>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : allProducts.length === 0
              ? (
                <div className="col-span-full py-16 text-center text-gray-400">
                  <p className="text-sm">No new arrivals found at the moment. Check back soon!</p>
                </div>
              )
              : allProducts.map((product, i) => (
                <motion.div
                  key={product.id}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <ProductCard product={product} index={i} onQuickView={setQuickViewProduct} />
                </motion.div>
              ))
            }
          </div>

          {!isLoading && allProducts.length > 0 && (
            <motion.div
              custom={5}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4"
            >
              {shopAllHref ? (
                <Link
                  href={shopAllHref}
                  className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-4 rounded-sm border-2 transition-all hover:bg-[#1E6B5A]/5"
                  style={{ borderColor: MAROON, color: MAROON }}
                >
                  View All New {activeCard?.label} →
                </Link>
              ) : (
                <>
                  <Link
                    href="/paithani/shop?newArrival=true"
                    className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-4 rounded-sm border-2 transition-all hover:bg-[#1E6B5A]/5"
                    style={{ borderColor: MAROON, color: MAROON }}
                  >
                    View All New Paithani →
                  </Link>
                  <Link
                    href="/designer/shop?newArrival=true"
                    className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-4 rounded-sm border-2 transition-all hover:bg-[#1E6B5A]/5"
                    style={{ borderColor: MAROON, color: MAROON }}
                  >
                    View All New Designer →
                  </Link>
                </>
              )}
            </motion.div>
          )}
        </div>
      </section>

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
      )}
    </Layout>
  );
}
