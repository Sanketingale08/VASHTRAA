import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Layout } from "@/components/Layout";

export default function Home() {
  return (
    <Layout>
    <div className="w-full flex flex-col md:flex-row overflow-hidden bg-black text-white relative" style={{ minHeight: "calc(100vh - 120px)" }}>
      {/* Central Logo Overlay */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none flex flex-col items-center justify-center bg-black/60 md:bg-transparent md:backdrop-blur-none backdrop-blur-sm p-8 md:p-0 rounded-full w-48 h-48 md:w-auto md:h-auto">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="text-center"
        >
          <div className="font-serif text-3xl md:text-5xl font-bold tracking-widest text-[#C9A84C] mb-2 drop-shadow-[0_0_10px_rgba(201,168,76,0.5)]">
            TWIRLDRAPE
          </div>
          <div className="text-[0.6rem] md:text-xs tracking-[0.3em] uppercase text-white/90">
            Choose Your Style
          </div>
        </motion.div>
      </div>

      {/* Paithani Side (Left) */}
      <div className="w-full md:w-1/2 h-[50vh] md:h-screen relative group cursor-pointer overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="/images/home-paithani.png" 
            alt="Paithani Saree" 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1.5s] ease-out"
          />
          <div className="absolute inset-0 bg-[#7B1C2C]/60 group-hover:bg-[#7B1C2C]/40 transition-colors duration-700"></div>
          {/* Gold Decorative Border */}
          <div className="absolute inset-4 md:inset-8 border border-[#C9A84C]/50 opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
        </div>
        
        <Link href="/paithani" className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center">
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="flex flex-col items-center mt-24 md:mt-0"
          >
            <h2 className="font-serif text-4xl md:text-6xl lg:text-7xl font-bold text-[#FAF6EE] mb-4 drop-shadow-lg">
              Paithani
            </h2>
            <p className="text-[#C9A84C] uppercase tracking-[0.2em] text-sm md:text-base font-semibold mb-8">
              Heritage Woven In Silk
            </p>
            <span className="inline-flex items-center gap-2 text-[#FAF6EE] border-b border-[#C9A84C] pb-1 uppercase tracking-wider text-sm font-semibold group-hover:text-[#C9A84C] transition-colors">
              Explore Now <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </span>
          </motion.div>
        </Link>
      </div>

      {/* Designer Side (Right) */}
      <div className="w-full md:w-1/2 h-[50vh] md:h-screen relative group cursor-pointer overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="/images/home-designer.png" 
            alt="Designer Saree" 
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-[1.5s] ease-out"
          />
          <div className="absolute inset-0 bg-[#1A1A1A]/70 group-hover:bg-[#1A1A1A]/50 transition-colors duration-700"></div>
          {/* Silver/Gold Decorative Border */}
          <div className="absolute inset-4 md:inset-8 border border-[#C9A84C]/30 opacity-50 group-hover:opacity-100 transition-opacity duration-700"></div>
        </div>

        <Link href="/designer" className="absolute inset-0 z-10 flex flex-col items-center justify-center p-8 text-center">
          <motion.div 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="flex flex-col items-center mb-24 md:mb-0"
          >
            <h2 className="font-serif text-4xl md:text-6xl lg:text-7xl font-bold text-[#F5EDE0] mb-4 drop-shadow-lg">
              Designer
            </h2>
            <p className="text-[#C9A84C] uppercase tracking-[0.2em] text-sm md:text-base font-semibold mb-8">
              Modern Editorial Elegance
            </p>
            <span className="inline-flex items-center gap-2 text-[#F5EDE0] border-b border-[#C9A84C] pb-1 uppercase tracking-wider text-sm font-semibold group-hover:text-[#C9A84C] transition-colors">
              Explore Now <span className="transform group-hover:translate-x-1 transition-transform">→</span>
            </span>
          </motion.div>
        </Link>
      </div>
    </div>
    </Layout>
  );
}
