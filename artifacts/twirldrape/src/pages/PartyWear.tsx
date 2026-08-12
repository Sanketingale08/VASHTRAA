import React, { useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Sparkles, Zap, Star } from "lucide-react";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";
import { ProductCard } from "@/components/ProductCard";
import { QuickViewModal } from "@/components/QuickViewModal";
import { useListProducts } from "@workspace/api-client-react";
import type { ProductSummary } from "@workspace/api-client-react";
import { CategoryCard } from "@/components/CategoryCard";

const GOLD = "#C9A84C";
const GREEN = "#1E6B5A";
const MAROON = "#3D1515";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.1, ease: "easeOut" as const },
  }),
};

const FEATURES = [
  {
    icon: <Sparkles className="w-6 h-6" style={{ color: GOLD }} />,
    title: "Statement Pieces",
    desc: "From bold zari borders to intricate hand-embroidery, each party-wear saree is designed to turn heads.",
  },
  {
    icon: <Star className="w-6 h-6" style={{ color: GOLD }} />,
    title: "Festive-Ready Colours",
    desc: "Our party edit spans jewel tones, deep reds, electric blues, and gold — chosen to look stunning under event lighting.",
  },
  {
    icon: <Zap className="w-6 h-6" style={{ color: GOLD }} />,
    title: "Fast Delivery",
    desc: "Event coming up soon? Most sarees ship within 48 hours with express delivery available across India.",
  },
];

const PARTY_CARDS = [
  {
    label: "Cocktail Sarees",
    tagline: "Evening Chic",
    description:
      "Sequin, net, and embellished masterpieces crafted for your most glamorous evening occasions.",
    image: "/images/hero-designer-2.png",
    fallback: "/images/product-1.png",
    bg: "#1A1A2E",
    chipLabel: "Cocktail Edit",
    href: "/designer/shop",
  },
  {
    label: "Festive Party Wear",
    tagline: "Celebrate in Style",
    description:
      "Rich zari borders, bold jewel tones, and vibrant drapes made for every celebration on the calendar.",
    image: "/images/hero-paithani-3.png",
    fallback: "/images/product-2.png",
    bg: "#3D1515",
    chipLabel: "Festival Picks",
    href: "/festival",
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

export default function PartyWear() {
  const [quickViewProduct, setQuickViewProduct] = useState<ProductSummary | null>(null);

  const { data, isLoading } = useListProducts({
    occasion: "party",
    sort: "rating_desc",
    limit: 12,
  });

  const products = data?.products ?? [];
  const totalCount = data?.total ?? 0;

  return (
    <Layout>
      <div className="bg-[#F3F8F5] min-h-screen">

        {/* Category Cards */}
        <section className="py-10 md:py-14" style={{ background: "#F3F8F5" }}>
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-7">
              {PARTY_CARDS.map((item, i) => (
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
                Party &amp; Festive Sarees
              </p>
              <div className="flex items-center gap-4">
                <span className="flex-none h-px w-12" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
                <h2 className="font-serif text-3xl md:text-4xl font-bold" style={{ color: GREEN }}>
                  Shop Party Wear
                </h2>
              </div>
              {!isLoading && totalCount > 0 && (
                <p className="mt-2 text-sm text-gray-500">
                  Showing {products.length} of {totalCount} party-wear sarees
                </p>
              )}
            </div>
            <Link
              href="/collections?occasion=party"
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
                  <p className="font-serif text-xl text-[#1E6B5A] font-semibold mb-3">No party-wear sarees yet</p>
                  <p className="text-sm text-[#7a5f4e] mb-6 max-w-sm mx-auto">
                    Our party edit is being curated. In the meantime, explore our full collection to find a saree for your next celebration.
                  </p>
                  <Link
                    href="/collections"
                    className="inline-flex items-center gap-2 bg-[#3D1515] text-white px-8 py-3 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#2e0f0f] transition-colors"
                  >
                    Browse All Sarees <ArrowRight size={16} />
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
                href="/collections?occasion=party"
                className="inline-flex items-center gap-2 font-bold text-sm uppercase tracking-widest px-10 py-4 rounded-sm border-2 transition-all hover:bg-[#3D1515]/5"
                style={{ borderColor: MAROON, color: MAROON }}
              >
                View All Party Wear <ArrowRight size={14} />
              </Link>
            </motion.div>
          )}
        </section>

        {/* Features */}
        <section className="bg-[#E6F0EA] py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="font-serif text-2xl md:text-3xl text-[#1E6B5A] font-bold">
                Dressed for Every Occasion
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-white rounded-2xl p-6 border border-[#C9A84C]/20 shadow-sm text-center">
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#1E6B5A]/8 flex items-center justify-center">
                    {f.icon}
                  </div>
                  <h3 className="font-semibold text-[#3D1515] text-base mb-2">{f.title}</h3>
                  <p className="text-sm text-[#7a5f4e] leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="container mx-auto px-4 py-16 text-center">
          <h2 className="font-serif text-2xl md:text-3xl text-[#1E6B5A] font-bold mb-4">
            Your Event Deserves the Perfect Saree
          </h2>
          <p className="text-[#7a5f4e] mb-8 max-w-lg mx-auto text-sm">
            From intimate dinners to grand receptions — browse the full range and order with fast delivery.
          </p>
          <Link
            href="/collections"
            className="inline-flex items-center gap-2 bg-[#1E6B5A] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#155248] transition-colors"
          >
            Browse All Sarees <ArrowRight size={16} />
          </Link>
        </section>
      </div>

      {quickViewProduct && (
        <QuickViewModal product={quickViewProduct} onClose={() => setQuickViewProduct(null)} />
      )}
    </Layout>
  );
}
