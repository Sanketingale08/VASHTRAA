import React from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { BadgeCheck, ShieldCheck, Store, Truck, Users, CreditCard, RefreshCcw } from "lucide-react";

const WINE = "#4D0B35";
const PRIMARY = "#6A0D45";
const GOLD = "#D4AF37";
const IVORY = "#FFF9F4";
const IVORY_DIM = "rgba(255,249,244,0.72)";
const GOLD_DIM = "rgba(212,175,55,0.18)";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as number[] } },
};
const rightVariants = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.9, ease: [0.22, 1, 0.36, 1] as number[], delay: 0.2 } },
};

const trustItems = [
  { icon: <BadgeCheck size={14} />, label: "Authentic Products" },
  { icon: <Store size={14} />, label: "Trusted Vendors" },
  { icon: <CreditCard size={14} />, label: "Secure Payments" },
  { icon: <Truck size={14} />, label: "Pan India Delivery" },
];

const stats = [
  { icon: <Store size={18} />, number: "1000+", label: "Trusted Vendors" },
  { icon: <Users size={18} />, number: "50K+", label: "Happy Customers" },
  { icon: <ShieldCheck size={18} />, number: "10K+", label: "Authentic Products" },
  { icon: <CreditCard size={18} />, number: "Secure", label: "Payments" },
  { icon: <RefreshCcw size={18} />, number: "Easy", label: "Returns" },
  { icon: <Truck size={18} />, number: "Pan India", label: "Delivery" },
];

function MandalaTopLeft() {
  return (
    <svg
      className="absolute pointer-events-none select-none"
      style={{ top: -60, left: -60, width: 340, height: 340, opacity: 0.07 }}
      viewBox="0 0 340 340"
      aria-hidden="true"
    >
      {[170, 145, 120, 95, 70].map((r, i) => (
        <circle key={i} cx="0" cy="0" r={r} fill="none" stroke={GOLD} strokeWidth={i === 0 ? 1.5 : 1} />
      ))}
      {Array.from({ length: 12 }).map((_, i) => {
        const deg = (i * 30 * Math.PI) / 180;
        return (
          <line
            key={i}
            x1={0} y1={0}
            x2={Math.cos(deg) * 170} y2={Math.sin(deg) * 170}
            stroke={GOLD} strokeWidth="0.6" opacity="0.7"
          />
        );
      })}
      {Array.from({ length: 12 }).map((_, i) => {
        const deg = (i * 30 * Math.PI) / 180;
        return <circle key={i} cx={Math.cos(deg) * 170} cy={Math.sin(deg) * 170} r="4" fill={GOLD} />;
      })}
    </svg>
  );
}

function PaisleyBottomRight() {
  return (
    <svg
      className="absolute pointer-events-none select-none"
      style={{ bottom: -30, right: -20, width: 280, height: 280, opacity: 0.07 }}
      viewBox="0 0 280 280"
      aria-hidden="true"
    >
      <path d="M140,240 Q60,200 50,130 Q40,60 100,40 Q160,20 190,80 Q220,140 180,190 Q160,215 140,240Z"
        fill={GOLD} />
      <path d="M140,240 Q80,210 75,150 Q70,90 115,70 Q160,50 185,100 Q210,150 175,185 Q160,205 140,240Z"
        fill="none" stroke={GOLD} strokeWidth="1.5" />
      <circle cx="140" cy="82" r="8" fill={GOLD} />
      <path d="M200,100 Q130,140 90,200 Q120,160 160,130 Q190,115 200,100Z"
        fill={GOLD} opacity="0.5" />
      <path d="M60,50 Q90,80 110,70 Q95,60 80,40 Q70,30 60,50Z"
        fill={GOLD} opacity="0.4" transform="translate(30,10) scale(0.8)" />
    </svg>
  );
}

export function HeroSection() {
  return (
    <>
      {/* ──────────────────── HERO ──────────────────── */}
      <section className="relative w-full overflow-hidden" style={{ minHeight: "680px" }}>
        {/*
          Layout grid:
            Mobile  (<768px):   column — full-width wine left panel, then portrait strip below
            Tablet  (768–1024): row — left 55% / right 45%
            Desktop (≥1024px):  row — left 48% / right 52%
        */}
        <div className="flex flex-col md:flex-row" style={{ minHeight: "680px" }}>

          {/* ── LEFT PANEL ──
              Full-width on mobile; 55% tablet; 48% desktop
          */}
          <div
            className="relative flex flex-col justify-center overflow-hidden w-full md:w-[55%] lg:w-[48%]"
            style={{
              background: `linear-gradient(145deg, ${PRIMARY} 0%, ${WINE} 55%, #3A0828 100%)`,
              padding: "64px 44px 64px 48px",
              flexShrink: 0,
            }}
          >
            <MandalaTopLeft />
            <PaisleyBottomRight />

            <motion.div
              className="relative z-10"
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              {/* Badge */}
              <motion.div variants={itemVariants} className="flex items-center gap-3 mb-6">
                <span className="h-px flex-none" style={{ width: 32, background: GOLD }} />
                <span
                  className="font-semibold uppercase tracking-[0.2em]"
                  style={{ fontSize: "11px", color: GOLD }}
                >
                  Celebrate Tradition. Embrace Elegance.
                </span>
                <span className="h-px flex-none" style={{ width: 32, background: GOLD }} />
              </motion.div>

              {/* H1 — two lines with editorial size difference */}
              <motion.h1
                variants={itemVariants}
                className="font-serif font-bold leading-[1.08]"
                style={{
                  fontSize: "clamp(36px, 4.2vw, 68px)",
                  color: IVORY,
                  letterSpacing: "-0.01em",
                  marginBottom: "8px",
                }}
              >
                Authentic Paithani
              </motion.h1>
              <motion.h1
                variants={itemVariants}
                className="font-serif font-bold leading-[1.08]"
                style={{
                  fontSize: "clamp(40px, 4.8vw, 74px)",
                  color: GOLD,
                  letterSpacing: "-0.01em",
                  marginBottom: "24px",
                }}
              >
                &amp; Designer Sarees
              </motion.h1>

              {/* Description */}
              <motion.p
                variants={itemVariants}
                style={{ color: IVORY_DIM, fontSize: "15px", lineHeight: 1.75, maxWidth: "420px", marginBottom: "28px" }}
              >
                Discover handcrafted Paithani sarees and premium designer collections from master weavers and trusted vendors across India.
              </motion.p>

              {/* Trust badges — inline pill row */}
              <motion.div variants={itemVariants} className="flex flex-wrap gap-3 mb-6">
                {trustItems.map((t) => (
                  <div
                    key={t.label}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
                    style={{
                      background: GOLD_DIM,
                      border: `1px solid ${GOLD}44`,
                      color: GOLD,
                      fontSize: "11.5px",
                      fontWeight: 600,
                      letterSpacing: "0.03em",
                    }}
                  >
                    {t.icon}
                    {t.label}
                  </div>
                ))}
              </motion.div>

              {/* Gold ornament divider — between trust badges and CTAs */}
              <motion.div variants={itemVariants} className="flex items-center gap-4 mb-8">
                <span className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD}88)` }} />
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M8 0L9.6 6.4L16 8L9.6 9.6L8 16L6.4 9.6L0 8L6.4 6.4Z" fill={GOLD} />
                </svg>
                <span className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD}88)` }} />
              </motion.div>

              {/* CTA Buttons */}
              <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-3">
                <Link
                  href="/paithani"
                  className="inline-flex items-center justify-center font-bold rounded-full transition-all hover:opacity-90 hover:shadow-xl"
                  style={{
                    background: `linear-gradient(135deg, ${GOLD} 0%, #B8962A 100%)`,
                    color: WINE,
                    padding: "14px 28px",
                    fontSize: "13.5px",
                    letterSpacing: "0.04em",
                    boxShadow: `0 4px 20px ${GOLD}44`,
                  }}
                >
                  Explore Paithani Sarees →
                </Link>
                <Link
                  href="/designer"
                  className="inline-flex items-center justify-center font-bold rounded-full transition-all hover:bg-white/10"
                  style={{
                    border: `2px solid ${IVORY}55`,
                    color: IVORY,
                    padding: "12px 26px",
                    fontSize: "13.5px",
                    letterSpacing: "0.04em",
                  }}
                >
                  Explore Designer Sarees →
                </Link>
              </motion.div>
            </motion.div>
          </div>

          {/*
            RIGHT PANEL — tablet (md) and desktop (lg) only.
            hidden on mobile so there is only one image (the strip below).
            Tablet: 45% width. Desktop: 52% (flex-1 fills remaining space).
          */}
          <motion.div
            className="hidden md:relative md:block md:w-[45%] lg:flex-1 overflow-hidden"
            style={{ minHeight: "680px" }}
            variants={rightVariants}
            initial="hidden"
            animate="visible"
          >
            {/* Model image — full cover */}
            <img
              src="/images/home-paithani.png"
              alt="Authentic Paithani Saree"
              className="absolute inset-0 w-full h-full"
              style={{ objectFit: "cover", objectPosition: "top center" }}
            />

            {/* Left-edge wine blend so panels merge */}
            <div
              className="absolute inset-y-0 left-0 pointer-events-none"
              style={{
                width: "140px",
                background: `linear-gradient(to right, ${WINE} 0%, transparent 100%)`,
              }}
            />

            {/* Top vignette */}
            <div
              className="absolute inset-x-0 top-0 pointer-events-none"
              style={{
                height: "80px",
                background: `linear-gradient(to bottom, ${PRIMARY}88 0%, transparent 100%)`,
              }}
            />

            {/* Bottom vignette */}
            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none"
              style={{
                height: "120px",
                background: `linear-gradient(to top, ${WINE}66 0%, transparent 100%)`,
              }}
            />

            {/* Floating frosted-glass badge — bottom-right */}
            <motion.div
              className="absolute flex items-center gap-2.5 rounded-2xl"
              style={{
                bottom: 36,
                right: 28,
                background: `${WINE}CC`,
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                border: `1px solid ${GOLD}44`,
                padding: "10px 18px",
                boxShadow: "0 8px 32px rgba(0,0,0,0.25)",
              }}
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            >
              <span style={{ color: GOLD, fontSize: "18px", lineHeight: 1 }}>★</span>
              <div>
                <p className="font-bold text-white leading-none" style={{ fontSize: "14px" }}>50K+</p>
                <p style={{ fontSize: "10.5px", color: "rgba(255,255,255,0.72)", marginTop: "2px" }}>Happy Customers</p>
              </div>
            </motion.div>

            {/* Top-right trust signal */}
            <div
              className="absolute flex items-center gap-2 rounded-xl"
              style={{
                top: 24,
                right: 24,
                background: `${WINE}BB`,
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: `1px solid ${GOLD}33`,
                padding: "8px 14px",
              }}
            >
              <BadgeCheck size={14} style={{ color: GOLD }} />
              <span style={{ fontSize: "11px", fontWeight: 600, color: IVORY, letterSpacing: "0.04em" }}>
                100% Authentic
              </span>
            </div>
          </motion.div>

        </div>

        {/* Mobile-only portrait strip — appears below left panel on < md */}
        <div
          className="block md:hidden relative overflow-hidden"
          style={{ height: "320px", background: WINE }}
        >
          <img
            src="/images/home-paithani.png"
            alt="Authentic Paithani Saree"
            className="absolute inset-0 w-full h-full"
            style={{ objectFit: "cover", objectPosition: "top center", opacity: 0.9 }}
          />
          <div
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{ height: "80px", background: `linear-gradient(to top, ${WINE} 0%, transparent 100%)` }}
          />
        </div>
      </section>

      {/* ──────────────────── STATS BAND ──────────────────── */}
      <div
        className="relative"
        style={{
          background: `linear-gradient(90deg, ${WINE} 0%, ${PRIMARY} 100%)`,
          borderTop: `1px solid ${GOLD}44`,
        }}
      >
        <div className="mx-auto px-4 md:px-8" style={{ maxWidth: "1400px" }}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                className="flex flex-col items-center justify-center text-center py-6 px-4 cursor-default"
                style={{
                  borderRight: i < 5 ? `1px solid ${GOLD}22` : "none",
                }}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.07 }}
              >
                <span
                  className="mb-2 flex items-center justify-center w-9 h-9 rounded-full"
                  style={{ background: GOLD_DIM }}
                >
                  <span style={{ color: GOLD }}>{stat.icon}</span>
                </span>
                <p
                  className="font-serif font-bold leading-none mb-1"
                  style={{ fontSize: "17px", color: IVORY }}
                >
                  {stat.number}
                </p>
                <p
                  style={{ fontSize: "11px", color: "rgba(255,249,244,0.6)", fontWeight: 500, letterSpacing: "0.04em" }}
                >
                  {stat.label}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
