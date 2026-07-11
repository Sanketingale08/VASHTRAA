import React from "react";
import { Link } from "wouter";
import { ArrowRight, Sparkles, Heart, Star } from "lucide-react";
import { Layout } from "@/components/Layout";

const GOLD = "#C9A84C";
const GREEN = "#1E6B5A";

const HIGHLIGHTS = [
  {
    title: "Paithani Bridal Sarees",
    desc: "Hand-woven silk Paithani sarees with intricate peacock and lotus motifs — the quintessential Maharashtrian bridal choice.",
    link: "/paithani/shop",
    badge: "Most Loved",
  },
  {
    title: "Designer Bridal Sarees",
    desc: "Contemporary designer sarees with hand-embroidered borders, zari work, and exclusive prints crafted for the modern bride.",
    link: "/designer/shop",
    badge: "New Season",
  },
  {
    title: "All Collections",
    desc: "Browse our full range of sarees across every style, weave, and price point to find the one made for your day.",
    link: "/collections",
    badge: "Browse All",
  },
];

const FEATURES = [
  { icon: <Star className="w-6 h-6" style={{ color: GOLD }} />, title: "Curated for Brides", desc: "Every piece in our bridal edit is hand-picked by our curation team for richness of weave and elegance of drape." },
  { icon: <Heart className="w-6 h-6" style={{ color: GOLD }} />, title: "Heirloom Quality", desc: "Paithani and Kanjivaram silks woven to last generations — the same saree you wear on your wedding can pass to your daughter." },
  { icon: <Sparkles className="w-6 h-6" style={{ color: GOLD }} />, title: "Styling Assistance", desc: "Not sure which saree suits your skin tone or lehenga palette? Reach out to our styling team for personalised guidance." },
];

export default function BridalCollection() {
  return (
    <Layout>
      <div className="bg-[#F3F8F5] min-h-screen">

        {/* Hero */}
        <section className="relative bg-[#1E6B5A] py-24 md:py-32 overflow-hidden">
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C9A84C' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="relative z-10 container mx-auto px-4 text-center">
            <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-4">TwirlDrape</p>
            <h1 className="font-serif text-4xl md:text-6xl text-[#F3F8F5] font-bold mb-6 leading-tight">
              Bridal Collection
            </h1>
            <p className="text-[#E6F0EA] max-w-2xl mx-auto text-base md:text-lg leading-relaxed mb-8">
              Discover sarees worthy of your most important day. Each piece is chosen for its weave quality,
              richness of colour, and the story it carries from the loom to you.
            </p>
            <Link
              href="/collections"
              className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#1E6B5A] px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white transition-colors"
            >
              Shop Bridal Sarees <ArrowRight size={16} />
            </Link>
          </div>
        </section>

        {/* Category Cards */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="text-center mb-12">
            <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Browse By Style</p>
            <h2 className="font-serif text-2xl md:text-3xl text-[#1E6B5A] font-bold">
              Find Your Perfect Bridal Saree
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {HIGHLIGHTS.map((item) => (
              <Link key={item.title} href={item.link}>
                <div className="group bg-white border border-[#C9A84C]/20 rounded-2xl p-8 hover:shadow-lg hover:border-[#C9A84C]/50 transition-all duration-300 cursor-pointer h-full flex flex-col">
                  <span className="inline-block text-xs font-bold uppercase tracking-wider bg-[#1E6B5A]/10 text-[#1E6B5A] px-3 py-1 rounded-full mb-4 self-start">
                    {item.badge}
                  </span>
                  <h3 className="font-serif text-xl text-[#3D1515] font-bold mb-3">{item.title}</h3>
                  <p className="text-sm text-[#7a5f4e] leading-relaxed flex-1 mb-6">{item.desc}</p>
                  <span className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-[#1E6B5A] group-hover:text-[#C9A84C] transition-colors">
                    Explore <ArrowRight size={12} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="bg-[#E6F0EA] py-16 md:py-24">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="font-serif text-2xl md:text-3xl text-[#1E6B5A] font-bold">
                Why Brides Choose TwirlDrape
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
            Ready to Find Your Saree?
          </h2>
          <p className="text-[#7a5f4e] mb-8 max-w-lg mx-auto text-sm">
            Browse our full collection or reach out to our styling team for personalised recommendations.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/collections"
              className="inline-flex items-center gap-2 bg-[#1E6B5A] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#5e1421] transition-colors"
            >
              Browse All Sarees <ArrowRight size={16} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 border border-[#1E6B5A] text-[#1E6B5A] px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#1E6B5A] hover:text-white transition-colors"
            >
              Contact Styling Team
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
