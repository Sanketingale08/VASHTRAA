import React from "react";
import { Layout } from "@/components/Layout";
import { motion } from "framer-motion";
import { Link } from "wouter";

export default function Collections() {
  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">
        {/* Two Banner Cards */}
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12">

            {/* Paithani Card */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: "easeOut" }}
              className="group relative overflow-hidden rounded-2xl shadow-2xl border border-[#C7CCD1]/20 min-h-[520px] flex flex-col justify-end cursor-pointer"
            >
              {/* Background image with maroon silk texture */}
              <div className="absolute inset-0">
                <img
                  src="/images/hero-paithani-1.png"
                  alt="Authentic Paithani Sarees"
                  className="w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#4A0E18]/95 via-[#0A1F44]/60 to-[#0A1F44]/20 group-hover:from-[#4A0E18]/98 group-hover:via-[#0A1F44]/70 transition-all duration-700" />
              </div>

              {/* Gold border glow on hover */}
              <div className="absolute inset-0 rounded-2xl ring-0 group-hover:ring-2 ring-[#C7CCD1]/50 transition-all duration-500" />

              {/* Top badge */}
              <div className="absolute top-6 left-6 z-10">
                <span className="bg-[#C7CCD1] text-[#0A1F44] text-xs font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-sm shadow-lg">
                  Heritage Collection
                </span>
              </div>

              {/* Content */}
              <div className="relative z-10 p-8 md:p-10">
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px w-8 bg-[#C7CCD1]" />
                    <p className="text-[#C7CCD1] text-xs font-bold uppercase tracking-[0.25em]">Paithani</p>
                  </div>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#F4F5F7] font-bold leading-tight mb-3">
                    Authentic Paithani<br />Sarees
                  </h2>
                  <p className="text-[#C7CCD1] text-base md:text-lg leading-relaxed mb-8">
                    Handwoven Heritage. Timeless Artistry.
                  </p>
                </div>
                <Link href="/paithani">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-3 bg-[#C7CCD1] text-[#0A1F44] px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] rounded-sm shadow-xl hover:bg-[#F4F5F7] transition-colors duration-300"
                  >
                    Explore Now
                    <span className="text-lg leading-none">→</span>
                  </motion.button>
                </Link>
              </div>
            </motion.div>

            {/* Designer Card */}
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.15, ease: "easeOut" }}
              className="group relative overflow-hidden rounded-2xl shadow-2xl border border-[#C7CCD1]/20 min-h-[520px] flex flex-col justify-end cursor-pointer"
            >
              {/* Background image with blush designer fabric */}
              <div className="absolute inset-0">
                <img
                  src="/images/hero-designer-1.png"
                  alt="Premium Designer Sarees"
                  className="w-full h-full object-cover transition-transform duration-[1.2s] group-hover:scale-110"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A2E]/95 via-[#2D1B4E]/60 to-[#3B1A3F]/20 group-hover:from-[#1A1A2E]/98 group-hover:via-[#2D1B4E]/70 transition-all duration-700" />
              </div>

              {/* Gold border glow on hover */}
              <div className="absolute inset-0 rounded-2xl ring-0 group-hover:ring-2 ring-[#C7CCD1]/50 transition-all duration-500" />

              {/* Top badge */}
              <div className="absolute top-6 left-6 z-10">
                <span className="bg-[#C7CCD1] text-[#1A1A2E] text-xs font-bold uppercase tracking-[0.2em] px-3 py-1.5 rounded-sm shadow-lg">
                  Premium Collection
                </span>
              </div>

              {/* Content */}
              <div className="relative z-10 p-8 md:p-10">
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="h-px w-8 bg-[#C7CCD1]" />
                    <p className="text-[#C7CCD1] text-xs font-bold uppercase tracking-[0.25em]">Designer</p>
                  </div>
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#F4F5F7] font-bold leading-tight mb-3">
                    Premium Designer<br />Sarees
                  </h2>
                  <p className="text-[#C7CCD1] text-base md:text-lg leading-relaxed mb-8">
                    Contemporary Designs for Every Occasion.
                  </p>
                </div>
                <Link href="/designer">
                  <motion.button
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.97 }}
                    className="inline-flex items-center gap-3 bg-[#C7CCD1] text-[#1A1A2E] px-8 py-4 text-sm font-bold uppercase tracking-[0.2em] rounded-sm shadow-xl hover:bg-[#F4F5F7] transition-colors duration-300"
                  >
                    Explore Now
                    <span className="text-lg leading-none">→</span>
                  </motion.button>
                </Link>
              </div>
            </motion.div>

          </div>

          {/* Decorative bottom text */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="text-center mt-16"
          >
            <p className="text-[#7a5f4e] text-sm tracking-[0.15em] uppercase">
              Each piece is a masterpiece — woven with love, worn with pride
            </p>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
