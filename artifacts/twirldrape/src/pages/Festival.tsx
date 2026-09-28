import React, { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Sparkles, Star, Sun } from "lucide-react";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { QuickViewModal } from "@/components/QuickViewModal";
import { useListProducts } from "@workspace/api-client-react";
import type { ProductSummary } from "@workspace/api-client-react";
import { CategoryCard } from "@/components/CategoryCard";

const GOLD = "#C7CCD1";
const GREEN = "#0A1F44";
const MAROON = "#0A1F44";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const FESTIVAL_CARDS = [
  {
    label: "Diwali & Navratri",
    tagline: "Light Up the Night",
    description:
      "Radiant silks and vibrant Paithani sarees to celebrate India's most beloved festivals in full splendour.",
    image: "/images/hero-paithani-3.png",
    fallback: "/images/product-1.png",
    bg: "#0A1F44",
    chipLabel: "Diwali Special",
    href: "/paithani/shop?occasion=festival",
  },
  {
    label: "Festive Silk",
    tagline: "Handwoven for Celebrations",
    description:
      "Authentic Paithani silks with rich zari borders — the most treasured choice for every festive occasion across India.",
    image: "/images/hero-paithani-1.png",
    fallback: "/images/product-2.png",
    bg: "#12342A",
    chipLabel: "Heritage Silk",
    href: "/paithani/shop?occasion=festival",
  },
];

const FEATURES = [
  {
    icon: <Sun className="w-6 h-6" style={{ color: GOLD }} />,
    title: "Made for Festivities",
    desc: "Handpicked for their colour, zari density, and festive energy — every saree in this edit is chosen to shine at India's grandest celebrations.",
  },
  {
    icon: <Sparkles className="w-6 h-6" style={{ color: GOLD }} />,
    title: "Rich Zari & Silk",
    desc: "Pure silk weaves with intricate gold zari borders from Yeola's master craftsmen — designed to last through generations of celebrations.",
  },
  {
    icon: <Star className="w-6 h-6" style={{ color: GOLD }} />,
    title: "Fast Delivery",
    desc: "Festival coming up? Most sarees ship within 48 hours with express delivery available across India.",
  },
];

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-[#E5E8EC] animate-pulse">
      <div className="aspect-[3/4] bg-gray-200" />
      <div className="p-4 space-y-2">
        <div className="h-3 bg-gray-200 rounded w-3/4" />
        <div className="h-4 bg-gray-200 rounded" />
        <div className="h-3 bg-gray-200 rounded w-1/2" />
      </div>
    </div>
  );
}

export default function Festival() {
  const [quickViewProduct, setQuickViewProduct] = useState<ProductSummary | null>(null);

  const { data, isLoading } = useListProducts({
    occasion: "festival",
    sort: "rating_desc",
    limit: 12,
  });

  const products = data?.products ?? [];
  const totalCount = data?.total ?? 0;

  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* Category Cards */}
        <section className="py-10 md:py-14" style={{ background: "#F4F5F7" }}>
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7">
              {FESTIVAL_CARDS.map((item, i) => (
                <CategoryCard
                  key={item.label}
                  card={item}
                  index={i}
                  href={item.href}
                />
              ))}
            </div>
          </div>
        </section>

        {/* Product Grid */}
        <section className="container mx-auto px-4 py-16 md:py-24">
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
                Festival Sarees
              </p>
              <div className="flex items-center gap-4">
                <span className="flex-none h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
                <h2 className="font-serif text-3xl md:text-4xl font-bold" style={{ color: GREEN }}>
                  Shop Festival Collection
                </h2>
              </div>
              {!isLoading && totalCount > 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  Showing {products.length} of {totalCount} festival sarees
                </p>
              )}
            </div>
            <Link
              href="/paithani/shop?occasion=festival"
              className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider transition-colors hover:opacity-80"
              style={{ color: GREEN }}
            >
              View All <ArrowRight size={12} />
            </Link>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)
              : products.length === 0
              ? (
                <div className="col-span-full py-20 text-center">
                  <p className="font-serif text-xl text-[#0A1F44] font-semibold mb-3">No festival sarees yet</p>
                  <p className="text-sm text-[#7a5f4e] mb-6 max-w-sm mx-auto">
                    Our festival edit is being curated. In the meantime, explore our full Paithani collection.
                  </p>
                  <Link
                    href="/paithani"
                    className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-8 py-3 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#155248] transition-colors"
                  >
                    Browse Paithani Sarees <ArrowRight size={16} />
                  </Link>
                </div>
              )
              : products.map((product, i) => (
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

          {!isLoading && products.length > 0 && (
            <motion.div
              custom={5}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="mt-12 flex justify-center"
            >
              <Link
                href="/paithani/shop?occasion=festival"
                className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-4 rounded-sm border-2 transition-all hover:bg-[#0A1F44]/5"
                style={{ borderColor: MAROON, color: MAROON }}
              >
                View All Festival Sarees <ArrowRight size={14} />
              </Link>
            </motion.div>
          )}
        </section>

        {/* Features */}
        <section className="bg-[#E5E8EC] py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="font-serif text-2xl md:text-3xl text-[#0A1F44] font-bold">
                Dressed for Every Festival
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-white rounded-2xl p-6 border border-[#C7CCD1]/20 shadow-sm text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#0A1F44]/8 flex items-center justify-center">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold text-[#0A1F44] text-base mb-2">{f.title}</h3>
                  <p className="text-sm text-[#7a5f4e] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16 text-center">
          <h2 className="font-serif text-2xl md:text-3xl text-[#0A1F44] font-bold mb-4">
            Celebrate in the Finest Silk
          </h2>
          <p className="text-[#7a5f4e] mb-8 max-w-lg mx-auto text-sm">
            Explore our full Paithani collection for the widest range of handwoven festival sarees.
          </p>
          <Link
            href="/paithani"
            className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#155248] transition-colors"
          >
            Browse All Paithani Sarees <ArrowRight size={16} />
          </Link>
        </section>
      </div>

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
      )}
    </Layout>
  );
}
