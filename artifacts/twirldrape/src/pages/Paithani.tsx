import React from "react";
import { Layout } from "@/components/Layout";
import { HeroSlider } from "@/components/HeroSlider";
import { StatsBar } from "@/components/StatsBar";
import { SectionHeading } from "@/components/SectionHeading";
import { ProductCard } from "@/components/ProductCard";
import { FlashSaleTimer } from "@/components/FlashSaleTimer";
import { mockProducts, artisanStories, vendors, lookbooks } from "@/lib/mock-data";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

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

export default function Paithani() {
  return (
    <Layout>
      <HeroSlider slides={slides} />
      <StatsBar />

      <div className="bg-[#FAF6EE] texture-overlay py-16 md:py-24">
        <div className="container mx-auto px-4 space-y-24">
          
          {/* 1. Royal Festival Collections */}
          <section className="relative z-10">
            <SectionHeading title="Royal Festival Collections" subtitle="Curated for Celebrations" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mockProducts.slice(0, 4).map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 2. Bridal Paithani Collections */}
          <section className="relative z-10">
            <SectionHeading title="Bridal Paithani Collections" subtitle="The Ultimate Trousseau" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {mockProducts.slice(4, 10).map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 3. Heritage Weaving Collections */}
          <section className="relative z-10">
            <SectionHeading title="Heritage Weaving Collections" subtitle="Passed Down Through Generations" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mockProducts.slice(2, 6).map((product, i) => (
                <ProductCard key={`heritage-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 4. Featured Vendors */}
          <section className="relative z-10">
            <SectionHeading title="Featured Vendors" subtitle="Trusted Artisans" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {vendors.map((vendor, i) => (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  key={vendor.id} 
                  className="bg-white p-6 rounded-lg text-center shadow-sm border border-[#C9A84C]/10 hover:shadow-[0_0_15px_rgba(201,168,76,0.2)] hover:border-[#C9A84C] transition-all duration-300"
                >
                  <img src={vendor.avatar} alt={vendor.name} className="w-24 h-24 rounded-full mx-auto mb-4 object-cover border-[3px] border-[#C9A84C]" />
                  <h3 className="font-serif text-xl text-[#7B1C2C] font-bold">{vendor.name}</h3>
                  <p className="text-sm text-gray-500 mb-3">{vendor.location}</p>
                  <div className="flex justify-center items-center gap-1 text-[#C9A84C] mb-4">
                    <Star size={16} className="fill-current" />
                    <span className="text-sm font-bold text-gray-700">{vendor.rating}</span>
                  </div>
                  <p className="text-xs font-semibold text-[#7B1C2C] uppercase tracking-wider">{vendor.sareesCount} Authentic Sarees</p>
                </motion.div>
              ))}
            </div>
          </section>

          {/* 5. Artisan Stories */}
          <section className="relative z-10 bg-[#F5EDE0] py-16 px-4 md:px-8 rounded-xl border border-[#C9A84C]/20">
            <SectionHeading title="Voices of the Loom" subtitle="Artisan Stories" />
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

          {/* 6. Handcrafted Collections */}
          <section className="relative z-10">
            <SectionHeading title="Handcrafted Collections" subtitle="Pure Silk Perfection" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mockProducts.slice(6, 10).map((product, i) => (
                <ProductCard key={`handcraft-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 7. Trending Paithani Sarees */}
          <section className="relative z-10">
            <SectionHeading title="Trending Paithani Sarees" subtitle="Most Loved Designs" />
            <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory hide-scrollbar">
              {mockProducts.slice(0, 6).map((product, i) => (
                <div key={`trend-${product.id}`} className="min-w-[280px] md:min-w-[320px] snap-start">
                  <ProductCard product={product} index={i} />
                </div>
              ))}
            </div>
          </section>

          {/* 8. Best Sellers */}
          <section className="relative z-10">
            <SectionHeading title="Best Sellers" subtitle="Our Signature Pieces" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mockProducts.filter(p => p.isBestSeller).map((product, i) => (
                <ProductCard key={`best-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 9. Flash Sales */}
          <section className="relative z-10">
            <div className="flex flex-col md:flex-row justify-between items-end md:items-center mb-8 gap-4">
              <SectionHeading title="Flash Sales" subtitle="Limited Time Offers" centered={false} />
              <FlashSaleTimer />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mockProducts.slice(3, 7).map((product, i) => (
                <ProductCard key={`flash-${product.id}`} product={{...product, originalPrice: product.price + 5000}} index={i} />
              ))}
            </div>
          </section>

          {/* 10. New Arrivals */}
          <section className="relative z-10">
            <SectionHeading title="New Arrivals" subtitle="Fresh Off The Loom" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {mockProducts.slice(6, 12).map((product, i) => (
                <ProductCard key={`new-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 11. Luxury Silk Collections */}
          <section className="relative z-10">
            <div className="relative rounded-2xl overflow-hidden h-[400px] mb-12 flex items-center group">
              <img src="/images/hero-paithani-2.png" alt="Luxury Silk" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#7B1C2C]/90 to-[#7B1C2C]/40"></div>
              <div className="relative z-10 px-8 md:px-16 max-w-2xl">
                <p className="text-[#C9A84C] uppercase tracking-[0.2em] font-bold text-sm mb-4">Premium Selection</p>
                <h2 className="font-serif text-4xl md:text-5xl text-[#FAF6EE] font-bold mb-6 leading-tight">Luxury Silk Collections</h2>
                <p className="text-[#E8D5B7] mb-8 leading-relaxed text-lg">Experience the epitome of luxury with our handpicked selection of premium silk sarees, featuring intricate zari work and exclusive designs.</p>
                <button className="bg-[#C9A84C] text-[#7B1C2C] px-8 py-4 font-bold uppercase tracking-wider text-sm hover:bg-white transition-colors rounded-sm shadow-xl shadow-black/20">
                  Explore Collection
                </button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {mockProducts.slice(1, 5).map((product, i) => (
                <ProductCard key={`luxury-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 12. Celebrity Inspired Looks */}
          <section className="relative z-10">
            <SectionHeading title="Celebrity Inspired Looks" subtitle="Iconic Drapes" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {lookbooks.map((look, i) => (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  key={`look-${look.id}`} 
                  className="relative group aspect-[3/4] overflow-hidden rounded-lg cursor-pointer border border-[#C9A84C]/20 shadow-sm"
                >
                  <img src={look.image} alt={look.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1.5s]" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#7B1C2C]/90 via-[#7B1C2C]/20 to-transparent"></div>
                  <div className="absolute bottom-0 left-0 w-full p-6 text-center">
                    <h3 className="font-serif text-xl md:text-2xl text-[#FAF6EE] font-bold tracking-wide drop-shadow-md">{look.name}</h3>
                    <span className="inline-block mt-3 text-[#C9A84C] text-xs font-bold uppercase tracking-[0.2em] border-b border-[#C9A84C] pb-1 opacity-0 group-hover:opacity-100 transition-all translate-y-4 group-hover:translate-y-0 duration-500">Shop Look →</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </Layout>
  );
}
