import React from "react";
import { Layout } from "@/components/Layout";
import { HeroSlider } from "@/components/HeroSlider";
import { StatsBar } from "@/components/StatsBar";
import { SectionHeading } from "@/components/SectionHeading";
import { ProductCard } from "@/components/ProductCard";
import { artisanStories, lookbooks } from "@/lib/mock-data";
import { useListProducts } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Link } from "wouter";

const slides = [
  {
    id: "s1",
    image: "/images/hero-paithani-1.png",
    title: "The Royal Paithani Collection",
    subtitle: "Heritage Woven in Silk",
    cta: "Explore Collection"
  },
  {
    id: "s2",
    image: "/images/hero-paithani-2.png",
    title: "Masterpieces of Yeola",
    subtitle: "Authentic Zari Work",
    cta: "Shop Authentic"
  },
  {
    id: "s3",
    image: "/images/hero-paithani-3.png",
    title: "Bridal Elegance",
    subtitle: "For Your Most Important Day",
    cta: "View Bridal"
  }
];

function BrowseAllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="hidden md:inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#C9A84C] hover:opacity-80 transition-opacity mb-8">
      Browse All →
    </Link>
  );
}

export default function Paithani() {
  const { data } = useListProducts({ category: "paithani", limit: 16 });
  const products = data?.products ?? [];

  return (
    <Layout>
      <HeroSlider slides={slides} />
      <StatsBar />

      <div className="bg-[#FAF6EE] texture-overlay py-16 md:py-24">
        <div className="container mx-auto px-4 space-y-24">

          {/* 1. Royal Festival Collections */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Royal Festival Collections" subtitle="Curated for Celebrations" centered={false} />
              <BrowseAllLink href="/paithani/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 4).map((product, i) => (
                <ProductCard key={`royal-${product.id}`} product={product} index={i} />
              ))}
            </div>
            <div className="mt-8 text-center md:hidden">
              <Link href="/paithani/shop" className="inline-block bg-[#7B1C2C] text-[#FAF6EE] border border-[#C9A84C]/50 px-8 py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#C9A84C] hover:text-[#7B1C2C] transition-colors">
                Browse All Paithani Sarees
              </Link>
            </div>
          </section>

          {/* 2. Bridal Paithani Collections */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Bridal Paithani Collections" subtitle="The Ultimate Trousseau" centered={false} />
              <BrowseAllLink href="/paithani/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {products.slice(0, 6).map((product, i) => (
                <ProductCard key={`bridal-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 3. Heritage Weaving Collections */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Heritage Weaving Collections" subtitle="Passed Down Through Generations" centered={false} />
              <BrowseAllLink href="/paithani/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 4).map((product, i) => (
                <ProductCard key={`heritage-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 4. Artisan Stories */}
          <section className="relative z-10 bg-[#F5EDE0] py-16 px-4 md:px-8 rounded-xl border border-[#C9A84C]/20">
            <SectionHeading title="Artisan Stories" subtitle="Voices of the Loom" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {artisanStories.map((story, i) => (
                <motion.div
                  key={story.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="bg-white p-8 rounded-lg shadow-sm border border-[#C9A84C]/10 text-center relative hover:shadow-md transition-shadow"
                >
                  <img src={story.image} alt={story.name} className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-2 border-[#C9A84C]" />
                  <h3 className="font-serif text-2xl text-[#7B1C2C] font-bold mb-1">{story.name}</h3>
                  <p className="text-xs text-[#C9A84C] font-bold uppercase tracking-[0.2em] mb-6">{story.region}</p>
                  <p className="text-gray-600 italic text-sm md:text-base leading-relaxed mb-8">"{story.quote}"</p>
                  <a href="#" className="text-[#7B1C2C] text-sm font-bold uppercase tracking-wider hover:text-[#C9A84C] transition-colors inline-flex items-center gap-2">
                    Read Story <span className="text-lg">→</span>
                  </a>
                </motion.div>
              ))}
            </div>
          </section>

          {/* 5. Handcrafted Collections */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Handcrafted Collections" subtitle="Pure Silk Perfection" centered={false} />
              <BrowseAllLink href="/paithani/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(4, 8).map((product, i) => (
                <ProductCard key={`handcraft-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 6. Luxury Silk Collections */}
          <section className="relative z-10">
            <div className="relative rounded-2xl overflow-hidden h-[400px] mb-12 flex items-center group">
              <img src="/images/hero-paithani-2.png" alt="Luxury Silk" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#7B1C2C]/90 to-[#7B1C2C]/40" />
              <div className="relative z-10 px-8 md:px-16 max-w-2xl">
                <p className="text-[#C9A84C] uppercase tracking-[0.2em] font-bold text-sm mb-4">Premium Selection</p>
                <h2 className="font-serif text-4xl md:text-5xl text-[#FAF6EE] font-bold mb-6 leading-tight">Luxury Silk Collections</h2>
                <p className="text-[#E8D5B7] mb-8 leading-relaxed text-lg">Experience the epitome of luxury with our handpicked selection of premium silk sarees, featuring intricate zari work and exclusive designs.</p>
                <Link href="/paithani/shop">
                  <button className="bg-[#C9A84C] text-[#7B1C2C] px-8 py-4 font-bold uppercase tracking-wider text-sm hover:bg-white transition-colors rounded-sm shadow-xl shadow-black/20">
                    Explore Collection
                  </button>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 4).map((product, i) => (
                <ProductCard key={`luxury-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 7. Celebrity Inspired Looks */}
          <section className="relative z-10">
            <SectionHeading title="Celebrity Inspired Looks" subtitle="Iconic Drapes" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {lookbooks.map((look, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  key={`celeb-look-${look.id}`}
                  className="relative group aspect-[3/4] overflow-hidden rounded-lg cursor-pointer border border-[#C9A84C]/20 shadow-sm"
                >
                  <img src={look.image} alt={look.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1.5s]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#7B1C2C]/90 via-[#7B1C2C]/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 w-full p-6 text-center">
                    <h3 className="font-serif text-xl md:text-2xl text-[#FAF6EE] font-bold tracking-wide drop-shadow-md">{look.name}</h3>
                    <span className="inline-block mt-3 text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] border-b border-[#C9A84C] pb-1 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0 duration-500">Shop Look →</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

          {/* 8. Premium Recommendations */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Premium Recommendations" subtitle="Handpicked for You" centered={false} />
              <BrowseAllLink href="/paithani/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.filter(p => p.isBestSeller).slice(0, 4).map((product, i) => (
                <ProductCard key={`premium-${product.id}`} product={product} index={i} />
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link href="/paithani/shop">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-3 bg-[#7B1C2C] text-[#FAF6EE] border border-[#C9A84C]/50 px-10 py-4 text-sm font-bold uppercase tracking-widest hover:bg-[#C9A84C] hover:text-[#7B1C2C] transition-colors duration-300 rounded-sm shadow-lg"
                >
                  Shop All Paithani Sarees
                  <span className="text-base">→</span>
                </motion.button>
              </Link>
            </div>
          </section>

        </div>
      </div>
    </Layout>
  );
}
