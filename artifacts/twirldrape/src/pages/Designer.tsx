import React from "react";
import { Layout } from "@/components/Layout";
import { HeroSlider } from "@/components/HeroSlider";
import { StatsBar } from "@/components/StatsBar";
import { SectionHeading } from "@/components/SectionHeading";
import { ProductCard } from "@/components/ProductCard";
import { mockProducts, vendors, lookbooks } from "@/lib/mock-data";
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
  return (
    <div className="dark">
      <Layout>
        <HeroSlider slides={slides} />
        <StatsBar />

        <div className="bg-[#1E2329] text-[#F5EDE0] texture-overlay py-16 md:py-24">
          <div className="container mx-auto px-4 space-y-24">

            {/* 1. Bollywood Fashion Sarees */}
            <section className="relative z-10">
              <div className="flex items-end justify-between mb-0">
                <SectionHeading title="Bollywood Fashion Sarees" subtitle="Star-Studded Ensembles" centered={false} />
                <BrowseAllLink href="/designer/shop" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {mockProducts.slice(0, 4).map((product, i) => (
                  <ProductCard key={`bollywood-${product.id}`} product={product} index={i} />
                ))}
              </div>
              <div className="mt-8 text-center md:hidden">
                <Link href="/designer/shop" className="inline-block bg-[#C9A84C] text-[#1E2329] px-8 py-3 text-sm font-bold uppercase tracking-wider hover:bg-white transition-colors">
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
                {mockProducts.slice(8, 12).map((product, i) => (
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
                {mockProducts.slice(6, 10).map((product, i) => (
                  <ProductCard key={`reception-${product.id}`} product={product} index={i} />
                ))}
              </div>
            </section>

            {/* 4. Cocktail Sarees */}
            <section className="relative z-10">
              <div className="relative rounded-2xl overflow-hidden h-[380px] mb-12 flex items-center group">
                <img src="/images/hero-designer-2.png" alt="Cocktail Sarees" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                <div className="absolute inset-0 bg-gradient-to-r from-[#1E2329]/95 via-[#1E2329]/70 to-transparent" />
                <div className="relative z-10 px-8 md:px-16 max-w-2xl">
                  <p className="text-[#C9A84C] uppercase tracking-[0.2em] font-bold text-sm mb-4">Evening Chic</p>
                  <h2 className="font-serif text-4xl md:text-5xl text-[#FAF6EE] font-bold mb-4 leading-tight">Cocktail Sarees</h2>
                  <p className="text-[#E8D5B7] mb-8 leading-relaxed text-lg">Sequin, net, and embellished masterpieces crafted for your most glamorous evenings.</p>
                  <Link href="/designer/shop">
                    <button className="bg-[#C9A84C] text-[#1E2329] px-8 py-4 font-bold uppercase tracking-wider text-sm hover:bg-white transition-colors rounded-sm shadow-xl shadow-black/30">
                      View Cocktail Edit
                    </button>
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {mockProducts.slice(3, 7).map((product, i) => (
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
                {mockProducts.slice(4, 10).map((product, i) => (
                  <ProductCard key={`wedding-${product.id}`} product={product} index={i} />
                ))}
              </div>
            </section>

            {/* 6. Contemporary Fashion Sarees */}
            <section className="relative z-10">
              <div className="flex items-end justify-between mb-0">
                <SectionHeading title="Contemporary Fashion Sarees" subtitle="What's Trending Right Now" centered={false} />
                <BrowseAllLink href="/designer/shop" />
              </div>
              <div className="flex overflow-x-auto gap-6 pb-8 snap-x snap-mandatory hide-scrollbar">
                {mockProducts.slice(0, 6).map((product, i) => (
                  <div key={`contemporary-${product.id}`} className="min-w-[280px] md:min-w-[320px] snap-start">
                    <ProductCard product={product} index={i} />
                  </div>
                ))}
              </div>
            </section>

            {/* 7. Designer Spotlight */}
            <section className="relative z-10 bg-[#2A2E35] py-16 px-4 md:px-8 rounded-xl border border-[#C9A84C]/20 shadow-2xl">
              <SectionHeading title="Designer Spotlight" subtitle="Masters of Modern Drape" />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {[1, 2, 3].map((item, i) => (
                  <div key={`spotlight-${item}`} className="text-center group cursor-pointer">
                    <div className="overflow-hidden rounded-lg mb-6 aspect-[3/4] border border-[#C9A84C]/30 shadow-lg relative">
                      <img src={`/images/hero-designer-${i === 1 ? 2 : 1}.png`} alt="Designer" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                      <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-500" />
                    </div>
                    <h3 className="font-serif text-2xl text-[#C9A84C] font-bold mb-3 tracking-wide">Manish Creations</h3>
                    <p className="text-gray-400 text-sm mb-5 leading-relaxed">Known for intricate sequin work, modern silhouettes, and unparalleled craftsmanship.</p>
                    <span className="text-[#F5EDE0] text-xs font-bold uppercase tracking-[0.2em] group-hover:text-[#C9A84C] transition-colors border-b border-[#C9A84C]/50 group-hover:border-[#C9A84C] pb-1">View Collection →</span>
                  </div>
                ))}
              </div>
            </section>

            {/* 8. Influencer Looks */}
            <section className="relative z-10">
              <SectionHeading title="Influencer Looks" subtitle="Spotted on Instagram" />
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {lookbooks.map((look, i) => (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15 }}
                    key={`influencer-${look.id}`}
                    className="relative group aspect-[3/4] overflow-hidden rounded-xl cursor-pointer border border-[#C9A84C]/20 shadow-lg"
                  >
                    <img src={look.image} alt={look.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-black/10" />
                    <div className="absolute top-4 left-4 flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full border border-[#C9A84C] overflow-hidden">
                        <img src="/images/artisan-1.png" alt="avatar" className="w-full h-full object-cover" />
                      </div>
                      <span className="text-white text-xs font-medium">@influencer_{i + 1}</span>
                    </div>
                    <div className="absolute bottom-0 left-0 w-full p-6">
                      <h3 className="font-sans text-lg text-white font-medium tracking-wide leading-snug mb-3">"{look.name} was an absolute dream to wear! ✨"</h3>
                      <button className="bg-white/10 hover:bg-[#C9A84C] text-white hover:text-black backdrop-blur-sm border border-white/20 px-6 py-2 text-xs font-bold uppercase tracking-wider rounded-sm transition-all w-full">Shop This Look</button>
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
                    className="bg-[#2A2E35] p-6 rounded-xl text-center border border-[#C9A84C]/20 hover:border-[#C9A84C]/60 hover:shadow-[0_0_20px_rgba(201,168,76,0.15)] transition-all duration-300"
                  >
                    <img src={vendor.avatar} alt={vendor.name} className="w-20 h-20 rounded-full mx-auto mb-5 object-cover ring-2 ring-[#C9A84C]/50 ring-offset-4 ring-offset-[#2A2E35]" />
                    <h3 className="font-serif text-xl text-[#F5EDE0] font-bold tracking-wide">{vendor.name}</h3>
                    <p className="text-sm text-[#C9A84C] mb-3">{vendor.location}</p>
                    <div className="flex justify-center items-center gap-1 text-[#C9A84C] mb-5">
                      <Star size={14} className="fill-current" />
                      <span className="text-xs font-medium text-white">{vendor.rating}</span>
                    </div>
                    <button className="text-xs font-bold text-black bg-[#C9A84C] hover:bg-[#F5EDE0] px-4 py-2 rounded uppercase tracking-widest w-full transition-colors">Visit Store</button>
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
                    <img src={`/images/hero-designer-${i === 0 ? 1 : 2}.png`} alt="Limited Edition" className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#1E2329] via-black/40 to-transparent" />
                    <div className="absolute inset-0 flex flex-col justify-end p-8 md:p-12">
                      <p className="text-[#C9A84C] text-xs font-bold uppercase tracking-[0.3em] mb-3">Only 10 Pieces Left</p>
                      <h3 className="font-serif text-3xl md:text-4xl text-white font-bold mb-4 drop-shadow-lg">The Met Gala Collection {item}</h3>
                      <p className="text-gray-300 text-sm md:text-base max-w-md mb-8">An exclusive collaboration piece featuring hand-embroidered crystals and premium silk organza.</p>
                      <button className="self-start bg-white text-black px-8 py-3 text-xs font-bold uppercase tracking-[0.2em] hover:bg-[#C9A84C] transition-colors rounded-sm shadow-xl">
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
                    className="inline-flex items-center gap-3 bg-[#C9A84C] text-[#1E2329] px-10 py-4 text-sm font-bold uppercase tracking-widest hover:bg-white transition-colors duration-300 rounded-sm shadow-lg"
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
    </div>
  );
}
