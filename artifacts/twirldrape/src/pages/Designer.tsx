import React from "react";
import { Layout } from "@/components/Layout";
import { HeroSlider } from "@/components/HeroSlider";
import { StatsBar } from "@/components/StatsBar";
import { SectionHeading } from "@/components/SectionHeading";
import { ProductCard } from "@/components/ProductCard";
import { vendors, lookbooks } from "@/lib/mock-data";
import { useListProducts } from "@workspace/api-client-react";
import { motion } from "framer-motion";
import { Star } from "lucide-react";
import { Link } from "wouter";

const slides = [
  {
    id: "d1",
    image: "/images/hero-designer-1.png",
    title: "Contemporary Elegance",
    subtitle: "Modern Designer Sarees",
    cta: "Shop The Look"
  },
  {
    id: "d2",
    image: "/images/hero-designer-2.png",
    title: "Bollywood Inspired",
    subtitle: "Glamour Redefined",
    cta: "Explore Collection"
  },
  {
    id: "d3",
    image: "/images/hero-designer-1.png",
    title: "Cocktail Nights",
    subtitle: "Sequin & Net Masterpieces",
    cta: "View Party Wear"
  }
];

function BrowseAllLink({ href }: { href: string }) {
  return (
    <Link href={href} className="hidden md:inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#C9A84C] hover:opacity-80 transition-opacity mb-8">
      Browse All →
    </Link>
  );
}

export default function Designer() {
  const { data } = useListProducts({ category: "designer", limit: 16 });
  const products = data?.products ?? [];

  return (
    <Layout>
      <HeroSlider slides={slides} />
      <StatsBar />

      <div className="bg-[#FAF6EE] texture-overlay py-16 md:py-24">
        <div className="container mx-auto px-4 space-y-24">

          {/* 1. Bollywood Fashion Sarees */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Bollywood Fashion Sarees" subtitle="Star-Studded Ensembles" centered={false} />
              <BrowseAllLink href="/designer/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 4).map((product, i) => (
                <ProductCard key={`bollywood-${product.id}`} product={product} index={i} />
              ))}
            </div>
            <div className="mt-8 text-center md:hidden">
              <Link href="/designer/shop" className="inline-block bg-[#7B1C2C] text-[#FAF6EE] border border-[#C9A84C]/50 px-8 py-3 text-sm font-bold uppercase tracking-wider hover:bg-[#C9A84C] hover:text-[#7B1C2C] transition-colors">
                Browse All Designer Sarees
              </Link>
            </div>
          </section>

          {/* 2. Party Wear Sarees */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Party Wear Sarees" subtitle="Dance the Night Away" centered={false} />
              <BrowseAllLink href="/designer/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(4, 8).map((product, i) => (
                <ProductCard key={`party-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 3. Reception Collections */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Reception Collections" subtitle="Evening Glamour" centered={false} />
              <BrowseAllLink href="/designer/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 4).map((product, i) => (
                <ProductCard key={`reception-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 4. Cocktail Sarees — editorial banner */}
          <section className="relative z-10">
            <div className="relative rounded-2xl overflow-hidden h-[400px] mb-12 flex items-center group">
              <img src="/images/hero-designer-2.png" alt="Cocktail Sarees" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#7B1C2C]/90 to-[#7B1C2C]/40" />
              <div className="relative z-10 px-8 md:px-16 max-w-2xl">
                <p className="text-[#C9A84C] uppercase tracking-[0.2em] font-bold text-sm mb-4">Evening Chic</p>
                <h2 className="font-serif text-4xl md:text-5xl text-[#FAF6EE] font-bold mb-4 leading-tight">Cocktail Sarees</h2>
                <p className="text-[#E8D5B7] mb-8 leading-relaxed text-lg">Sequin, net, and embellished masterpieces crafted for your most glamorous evenings.</p>
                <Link href="/designer/shop">
                  <button className="bg-[#C9A84C] text-[#7B1C2C] px-8 py-4 font-bold uppercase tracking-wider text-sm hover:bg-white transition-colors rounded-sm shadow-xl shadow-black/20">
                    View Cocktail Edit
                  </button>
                </Link>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {products.slice(0, 4).map((product, i) => (
                <ProductCard key={`cocktail-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 5. Wedding Designer Collections */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Wedding Designer Collections" subtitle="For the Modern Bride" centered={false} />
              <BrowseAllLink href="/designer/shop" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
              {products.slice(0, 6).map((product, i) => (
                <ProductCard key={`wedding-${product.id}`} product={product} index={i} />
              ))}
            </div>
          </section>

          {/* 6. Contemporary Fashion Sarees — horizontal scroll */}
          <section className="relative z-10">
            <div className="flex items-end justify-between mb-0">
              <SectionHeading title="Contemporary Fashion Sarees" subtitle="What's Trending Right Now" centered={false} />
              <BrowseAllLink href="/designer/shop" />
            </div>
            <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory hide-scrollbar">
              {products.slice(0, 6).map((product, i) => (
                <div key={`contemporary-${product.id}`} className="min-w-[280px] md:min-w-[320px] snap-start">
                  <ProductCard product={product} index={i} />
                </div>
              ))}
            </div>
          </section>

          {/* 7. Designer Spotlight — styled like Paithani Artisan Stories */}
          <section className="relative z-10 bg-[#F5EDE0] py-16 px-4 md:px-8 rounded-xl border border-[#C9A84C]/20">
            <SectionHeading title="Designer Spotlight" subtitle="Masters of Modern Drape" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[1, 2, 3].map((item, i) => (
                <motion.div
                  key={`spotlight-${item}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.2 }}
                  className="bg-white p-8 rounded-lg shadow-sm border border-[#C9A84C]/10 text-center relative hover:shadow-md transition-shadow group cursor-pointer"
                >
                  <div className="overflow-hidden rounded-full w-24 h-24 mx-auto mb-4 border-2 border-[#C9A84C]">
                    <img
                      src={`/images/hero-designer-${i === 1 ? 2 : 1}.png`}
                      alt="Designer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                    />
                  </div>
                  <h3 className="font-serif text-2xl text-[#7B1C2C] font-bold mb-1 tracking-wide">Manish Creations</h3>
                  <p className="text-xs text-[#C9A84C] font-bold uppercase tracking-[0.2em] mb-6">Mumbai, Maharashtra</p>
                  <p className="text-gray-600 italic text-sm leading-relaxed mb-8">Known for intricate sequin work, modern silhouettes, and unparalleled craftsmanship.</p>
                  <a href="#" className="text-[#7B1C2C] text-sm font-bold uppercase tracking-wider hover:text-[#C9A84C] transition-colors inline-flex items-center gap-2">
                    View Collection <span className="text-lg">→</span>
                  </a>
                </motion.div>
              ))}
            </div>
          </section>

          {/* 8. Influencer Looks — styled like Paithani Celebrity Inspired Looks */}
          <section className="relative z-10">
            <SectionHeading title="Influencer Looks" subtitle="Spotted on Instagram" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {lookbooks.map((look, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  key={`influencer-${look.id}`}
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

          {/* 9. Featured Designer Stores */}
          <section className="relative z-10">
            <SectionHeading title="Featured Designer Stores" subtitle="Top Boutiques" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {vendors.map((vendor, i) => (
                <motion.div
                  key={`store-${vendor.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 }}
                  className="bg-white p-6 rounded-xl text-center border border-[#C9A84C]/20 hover:border-[#C9A84C]/60 hover:shadow-lg transition-all duration-300"
                >
                  <img
                    src={vendor.avatar}
                    alt={vendor.name}
                    className="w-20 h-20 rounded-full mx-auto mb-5 object-cover ring-2 ring-[#C9A84C]/50 ring-offset-4 ring-offset-white"
                  />
                  <h3 className="font-serif text-xl text-[#7B1C2C] font-bold tracking-wide">{vendor.name}</h3>
                  <p className="text-sm text-[#C9A84C] mb-3">{vendor.location}</p>
                  <div className="flex justify-center items-center gap-1 text-[#C9A84C] mb-5">
                    <Star size={14} className="fill-current" />
                    <span className="text-xs font-medium text-[#3D1515]">{vendor.rating}</span>
                  </div>
                  <button className="text-xs font-bold text-[#FAF6EE] bg-[#7B1C2C] hover:bg-[#C9A84C] hover:text-[#7B1C2C] px-4 py-2 rounded uppercase tracking-widest w-full transition-colors">
                    Visit Store
                  </button>
                </motion.div>
              ))}
            </div>
          </section>

          {/* 10. Limited Edition Collections */}
          <section className="relative z-10">
            <SectionHeading title="Limited Edition Collections" subtitle="Exclusive Drops — Only a Few Left" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {[1, 2].map((item, i) => (
                <div key={`limited-${item}`} className="relative h-[500px] rounded-2xl overflow-hidden group border border-[#C9A84C]/30">
                  <img
                    src={`/images/hero-designer-${i === 0 ? 1 : 2}.png`}
                    alt="Limited Edition"
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#7B1C2C]/95 via-[#7B1C2C]/40 to-transparent" />
                  <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
                    <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.3em] mb-3">Only 10 Pieces Left</p>
                    <h3 className="font-serif text-3xl md:text-4xl text-[#FAF6EE] font-bold mb-4 drop-shadow-lg">
                      The Met Gala Collection {item}
                    </h3>
                    <p className="text-[#E8D5B7] text-sm md:text-base max-w-md mb-8">
                      An exclusive collaboration piece featuring hand-embroidered crystals and premium silk organza.
                    </p>
                    <button className="self-start bg-[#C9A84C] text-[#7B1C2C] px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] hover:bg-white transition-colors rounded-sm shadow-xl">
                      Shop Exclusive
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-12 text-center">
              <Link href="/designer/shop">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.98 }}
                  className="inline-flex items-center gap-3 bg-[#7B1C2C] text-[#FAF6EE] border border-[#C9A84C]/50 px-10 py-4 text-sm font-bold uppercase tracking-widest hover:bg-[#C9A84C] hover:text-[#7B1C2C] transition-colors duration-300 rounded-sm shadow-lg"
                >
                  Shop All Designer Sarees
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
