import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { MapPin, Star, Package, ArrowRight, Users } from "lucide-react";
import { Layout } from "@/components/Layout";
import { getApiUrl } from "@/lib/api";

const GOLD = "#C9A84C";
const MAROON = "#1E6B5A";
const IVORY = "#F3F8F5";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
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
}

const ARTISAN_IMAGES = [
  "/images/artisan-1.png",
  "/images/hero-paithani-2.png",
  "/images/hero-paithani.png",
];

function getFallbackAvatar(index: number) {
  return ARTISAN_IMAGES[index % ARTISAN_IMAGES.length];
}

export default function Weavers() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(getApiUrl("/api/vendors"), { credentials: "include" })
      .then((r) => r.json())
      .then((data: Vendor[]) => setVendors(Array.isArray(data) ? data : []))
      .catch(() => setError("Failed to load weaver profiles"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div style={{ background: IVORY, minHeight: "100vh" }}>

        {/* Hero */}
        <section className="relative overflow-hidden py-24 md:py-32" style={{ background: `linear-gradient(135deg, ${MAROON} 0%, #5e1421 100%)` }}>
          <div
            className="absolute inset-0 opacity-10"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23C9A84C' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
            }}
          />
          <div className="relative z-10 container mx-auto px-4 text-center">
            <motion.p
              initial="hidden"
              animate="visible"
              custom={0}
              variants={fadeUp}
              className="uppercase tracking-[0.3em] text-xs font-bold mb-4"
              style={{ color: GOLD }}
            >
              Artisan Partners
            </motion.p>
            <motion.h1
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
              className="font-serif text-4xl md:text-6xl font-bold mb-6 leading-tight text-[#F3F8F5]"
            >
              Meet Our Weavers
            </motion.h1>
            <motion.p
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
              className="text-[#E6F0EA] max-w-2xl mx-auto text-base md:text-lg leading-relaxed"
            >
              Every saree on TwirlDrape is handwoven by a master craftsperson. These are the families,
              collectives, and studios behind every thread — admitted by hand, paid fairly, and supported directly.
            </motion.p>
          </div>
        </section>

        {/* Weaver Grid */}
        <section className="container mx-auto px-4 py-16 md:py-20">

          {loading && (
            <div className="flex flex-col items-center justify-center py-24 gap-4">
              <div
                className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin"
                style={{ borderColor: MAROON }}
              />
              <p className="text-sm text-gray-400">Loading weaver profiles…</p>
            </div>
          )}

          {!loading && error && (
            <div className="text-center py-20">
              <Users size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">{error}</p>
            </div>
          )}

          {!loading && !error && vendors.length === 0 && (
            <div className="text-center py-20">
              <Users size={40} className="mx-auto mb-4 text-gray-300" />
              <p className="text-gray-500 font-medium">No weaver profiles available yet.</p>
              <p className="text-sm text-gray-400 mt-1">Check back soon — we're constantly onboarding new artisan partners.</p>
            </div>
          )}

          {!loading && !error && vendors.length > 0 && (
            <>
              <div className="text-center mb-12">
                <p className="text-sm text-gray-500">{vendors.length} artisan partner{vendors.length !== 1 ? "s" : ""} and growing</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {vendors.map((vendor, i) => (
                  <motion.div
                    key={vendor.id}
                    custom={i}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                    variants={fadeUp}
                  >
                    <Link href={`/weavers/${vendor.id}`}>
                      <div className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm hover:shadow-lg transition-all duration-300 group overflow-hidden cursor-pointer">
                        {/* Avatar / header */}
                        <div
                          className="relative h-44 overflow-hidden"
                          style={{ background: `linear-gradient(135deg, ${MAROON}cc, #5e1421cc)` }}
                        >
                          <img
                            src={vendor.avatar || getFallbackAvatar(i)}
                            alt={vendor.name}
                            className="w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-500"
                            onError={(e) => {
                              (e.target as HTMLImageElement).src = getFallbackAvatar(i);
                            }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-4 left-4">
                            <span
                              className="text-[10px] font-bold uppercase tracking-[0.2em] px-2 py-0.5 rounded"
                              style={{ background: GOLD, color: MAROON }}
                            >
                              Verified Partner
                            </span>
                          </div>
                        </div>

                        <div className="p-5">
                          <h2 className="font-serif text-lg font-bold mb-1 group-hover:text-[#1E6B5A] transition-colors" style={{ color: "#3D1A1A" }}>
                            {vendor.name}
                          </h2>

                          {vendor.tagline && (
                            <p className="text-xs text-gray-500 italic mb-3 line-clamp-1">{vendor.tagline}</p>
                          )}

                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-4">
                            <span className="flex items-center gap-1">
                              <MapPin size={11} style={{ color: GOLD }} />
                              {vendor.location}
                            </span>
                            <span className="flex items-center gap-1">
                              <Star size={11} style={{ color: GOLD }} className="fill-current" />
                              {vendor.rating.toFixed(1)}
                            </span>
                            <span className="flex items-center gap-1">
                              <Package size={11} style={{ color: GOLD }} />
                              {vendor.sareesCount} sarees
                            </span>
                          </div>

                          {vendor.bio && (
                            <p className="text-sm text-gray-600 leading-relaxed line-clamp-2 mb-4">{vendor.bio}</p>
                          )}

                          <div
                            className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider group-hover:gap-2 transition-all"
                            style={{ color: MAROON }}
                          >
                            View Profile <ArrowRight size={12} />
                          </div>
                        </div>
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </section>

        {/* CTA */}
        <section className="bg-[#E6F0EA] py-14 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <p className="uppercase tracking-[0.3em] text-xs font-bold mb-3" style={{ color: GOLD }}>
                Join the Community
              </p>
              <h2 className="font-serif text-2xl md:text-3xl font-bold mb-4" style={{ color: MAROON }}>
                Are You a Weaver or Collective?
              </h2>
              <p className="text-[#7a5f4e] mb-8 max-w-lg mx-auto text-sm md:text-base">
                We personally vet every artisan partner. If you weave with tradition and care, we'd love to hear from you.
              </p>
              <Link
                href="/seller/register"
                className="inline-flex items-center gap-2 px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider text-[#F3F8F5] hover:opacity-90 transition-opacity"
                style={{ background: MAROON }}
              >
                Apply as a Partner <ArrowRight size={16} />
              </Link>
            </motion.div>
          </div>
        </section>

      </div>
    </Layout>
  );
}
