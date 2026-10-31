import React, { useEffect, useState } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BadgeCheck,
  ShieldCheck,
  CreditCard,
  RefreshCcw,
  Truck,
  Headphones,
  Heart,
  Users,
  Sparkles,
  Leaf,
  ArrowRight,
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
} from "lucide-react";
import { Layout } from "@/components/Layout";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const GOLD = "#C7CCD1";
const MAROON = "#0A1F44";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

function SectionTitle({
  children,
  subtitle,
}: {
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="text-center mb-10 md:mb-14">
      <div className="flex items-center justify-center gap-4 mb-3">
        <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
        <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#0A1F44]">
          {children}
        </h2>
        <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
      </div>
      {subtitle && <p className="text-sm md:text-base text-gray-500 max-w-xl mx-auto">{subtitle}</p>}
    </div>
  );
}

const MISSION_VALUE_ICONS = [
  <Heart className="w-7 h-7" style={{ color: GOLD }} />,
  <Users className="w-7 h-7" style={{ color: GOLD }} />,
  <Sparkles className="w-7 h-7" style={{ color: GOLD }} />,
  <Leaf className="w-7 h-7" style={{ color: GOLD }} />,
];

const TRUST_BADGE_ICONS = [
  <BadgeCheck className="w-8 h-8" style={{ color: GOLD }} />,
  <ShieldCheck className="w-8 h-8" style={{ color: GOLD }} />,
  <CreditCard className="w-8 h-8" style={{ color: GOLD }} />,
  <RefreshCcw className="w-8 h-8" style={{ color: GOLD }} />,
  <Truck className="w-8 h-8" style={{ color: GOLD }} />,
  <Headphones className="w-8 h-8" style={{ color: GOLD }} />,
];

const TEAM = [
  { name: "Anjali Deshmukh", role: "Founder & CEO", avatar: "/images/team-anjali.png", bio: "Third-generation textile enthusiast who founded VASTRAA to bring authentic Paithani weaves to a global audience." },
  { name: "Rohan Kulkarni", role: "Head of Vendor Relations", avatar: "/images/team-rohan.png", bio: "Works hand-in-hand with weaver collectives across Maharashtra to onboard and support artisan partners." },
  { name: "Meera Iyer", role: "Head of Design & Curation", avatar: "/images/team-meera.png", bio: "Curates every collection, ensuring each saree reflects timeless craftsmanship and contemporary taste." },
];

const DEFAULT_CONTENT = {
  stats: [
    { label: "Weaver Partners", value: "40+" },
    { label: "Sarees Delivered", value: "2,800+" },
    { label: "Cities Served", value: "180+" },
    { label: "Years of Trust", value: "3+" },
  ],
  heroHeadline: "Handwoven in India.\nDelivered to Your Door.",
  heroSubtext:
    "VASTRAA started with a single question: why is it so hard to find a genuinely handwoven saree without travelling to the source? We set out to fix that — building a marketplace where India's weavers sell directly, and every saree arrives with its full story intact.",
  storyHeadline: "Born in Paithan. Built for Every Indian Wardrobe.",
  storyParagraph1:
    "In 2022, our founder Anjali Deshmukh visited a Paithani weaver co-operative in Paithan, Maharashtra, and found master weavers selling centuries-old work through local middlemen for a fraction of what buyers paid. She came back with twelve sarees and a resolve: give these artisans a direct channel to the people who would truly value their craft.",
  storyParagraph2:
    "VASTRAA launched with those twelve pieces and has grown steadily — never chasing volume, always vetting every seller personally. Today, every listing carries the weaver's name, their region, and the technique behind the cloth. That transparency is the product.",
  weaversHeadline: "Forty Families. Dozens of Traditions.",
  weaversParagraph1:
    "Every seller on VASTRAA is admitted by hand — Anjali or Rohan visits the workshop, speaks with the weavers, and photographs the process before a single listing goes live. Our current partners span Paithani silk from Paithan and Yeola, Kanjivaram from Kanchipuram, Chanderi from Madhya Pradesh, and Tant from West Bengal.",
  weaversParagraph2:
    "We pay within 48 hours of delivery confirmation — no net-30 terms, no opaque fee structures. If a weaver raises a concern, it goes directly to Rohan's phone. That accountability is what lets us promise you a saree made with genuine care.",
  ctaHeadline: "Discover the Craft. Wear the Story.",
  ctaSubtext: "Explore our curated collections of handwoven sarees from India's finest artisans.",
  missionValues: [
    { title: "Heritage First", desc: "We champion India's handloom traditions, giving every weave the recognition and respect it deserves." },
    { title: "Direct From Artisans", desc: "We work directly with weaver collectives — no middlemen — so artisans earn fairly for their craft." },
    { title: "Uncompromising Quality", desc: "Every saree is hand-inspected before it reaches you, so authenticity is never in question." },
    { title: "Sustainable Craft", desc: "We champion slow fashion — handwoven pieces made to last generations, not seasons." },
  ],
  trustBadges: [
    { title: "100% Authentic Products", desc: "Every saree is verified and sourced directly from trusted weavers and artisans." },
    { title: "Verified Vendors & Quality Assured", desc: "All vendors go through a rigorous quality check before listing on VASTRAA." },
    { title: "Secure Payments & Data Protection", desc: "Bank-grade encryption keeps your payment and personal data completely safe." },
    { title: "Easy Returns & Refunds", desc: "Hassle-free returns within 7 days — no questions asked, full refund guaranteed." },
    { title: "Fast & Reliable Pan India Delivery", desc: "Swift shipping across all states with real-time tracking on every order." },
    { title: "Dedicated Support 24/7", desc: "Our saree experts are always available to help you find the perfect drape." },
  ],
};

type AboutContent = typeof DEFAULT_CONTENT;

export default function About() {
  const [content, setContent] = useState<AboutContent>(DEFAULT_CONTENT);

  useEffect(() => {
    fetch(`/api/about-content?_t=${Date.now()}`, { cache: "no-store", credentials: "include" })
      .then((r) => r.json())
      .then((data: AboutContent) => {
        if (data && typeof data === "object") {
          setContent((prev) => ({ ...prev, ...data }));
        }
      })
      .catch(() => {});
  }, []);

  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* ── Hero Section ──────────────────────────────────────── */}
        <section className="bg-[#0A1F44] text-white py-16 md:py-20 border-b border-[#C7CCD1]/20">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
            >
              <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-4">
                About VASTRAA
              </p>
              <h1 className="font-serif text-3xl md:text-5xl font-bold tracking-tight leading-tight mb-6 whitespace-pre-line text-white">
                {content.heroHeadline}
              </h1>
              <p className="text-[#C7CCD1]/90 text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
                {content.heroSubtext}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Stats bar ────────────────────────────────────────── */}
        <section className="bg-white border-b border-[#C7CCD1]/20 py-10">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {content.stats.map((s, i) => (
                <motion.div
                  key={s.label}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <p className="font-serif text-3xl md:text-4xl font-bold text-[#0A1F44]">{s.value}</p>
                  <p className="text-xs md:text-sm uppercase tracking-wider text-[#7a5f4e] mt-1">{s.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Brand story ──────────────────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="order-2 md:order-1"
            >
              <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-3">Founding Mission</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#0A1F44] font-bold mb-5">
                {content.storyHeadline}
              </h2>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed mb-4">
                {content.storyParagraph1}
              </p>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed">
                {content.storyParagraph2}
              </p>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
              className="order-1 md:order-2"
            >
              <div className="relative rounded-2xl overflow-hidden shadow-xl border border-[#C7CCD1]/20 aspect-[4/3]">
                <img
                  src="/images/hero-paithani-2.png"
                  alt="VASTRAA artisan weaving"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Featured Collection – The Heritage Edit ──────────── */}
        <section className="py-16 md:py-20 bg-white border-y border-[#C7CCD1]/20">
          <div className="container mx-auto px-4">
            <div className="max-w-7xl mx-auto">
              <div className="text-center mb-10 md:mb-12">
                <span className="text-xs font-bold uppercase tracking-[0.25em] text-[#2C3E6B] block mb-2">
                  Featured Collection
                </span>
                <div className="flex items-center justify-center gap-4 mb-3">
                  <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to right, transparent, ${GOLD})` }} />
                  <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl font-bold tracking-wide text-[#0A1F44]">
                    The Heritage Edit
                  </h2>
                  <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
                </div>
                <p className="text-xs font-semibold uppercase tracking-widest text-[#0A1F44]/70 mb-3">
                  PAITHANI COLLECTION
                </p>
                <p className="text-sm md:text-base text-gray-600 max-w-2xl mx-auto leading-relaxed">
                  A curated collection of traditional Paithani sarees featuring distinctive peacock, muniya, asawali and floral motifs, vibrant colours, and intricate zari work.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-[#F4F5F7] rounded-2xl p-6 md:p-10 border" style={{ borderColor: GOLD + "55" }}>
                <div className="lg:col-span-6 relative overflow-hidden rounded-xl group shadow-md bg-white">
                  <img
                    src="/images/hero-paithani-1.png"
                    alt="The Heritage Edit - Paithani Collection"
                    className="w-full h-[380px] md:h-[440px] object-cover transition-transform duration-700 group-hover:scale-105"
                    onError={(e) => { (e.target as HTMLImageElement).src = "https://images.unsplash.com/photo-1610030469983-98e550d6193c?q=80&w=1000&auto=format&fit=crop"; }}
                  />
                  <div className="absolute top-4 left-4 text-white text-[10px] font-bold px-3 py-1 rounded-sm border uppercase tracking-wider" style={{ background: MAROON, borderColor: GOLD }}>
                    PAITHANI COLLECTION
                  </div>
                </div>

                <div className="lg:col-span-6 flex flex-col justify-between h-full space-y-6">
                  <div>
                    <h3 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44] mb-3">
                      The Heritage Edit
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed mb-6">
                      A curated collection of traditional Paithani sarees featuring distinctive peacock, muniya, asawali and floral motifs, vibrant colours, and intricate zari work.
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-y border-[#E5E8EC] py-6 mb-6">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Fabric</span>
                        <span className="text-sm font-semibold text-[#0A1F44]">Silk / Mulberry Silk</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Craft</span>
                        <span className="text-sm font-semibold text-[#0A1F44]">Handloom Weave</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Origin</span>
                        <span className="text-sm font-semibold text-[#0A1F44]">Yeola, Maharashtra</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-400">Collection</span>
                        <span className="text-sm font-semibold text-[#0A1F44]">Traditional & Contemporary Paithani</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Link
                      href="/paithani"
                      className="inline-flex items-center gap-2 px-8 py-3.5 text-xs md:text-sm font-bold uppercase tracking-widest text-white rounded-md transition-all shadow-md hover:shadow-lg"
                      style={{ background: MAROON }}
                    >
                      Explore Paithani Collection →
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Why Shop With TwirlDrape ─────────────────────────── */}
        <section className="bg-white py-16 md:py-24">
          <div className="container mx-auto px-4">
            <SectionTitle subtitle="Your trust is our highest priority at every step">
              Why Shop With VASTRAA?
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {content.trustBadges.map((f, i) => (
                <motion.div
                  key={i}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="flex flex-col items-start gap-4 p-6 rounded-2xl border border-[#C7CCD1]/20 hover:shadow-md transition-shadow duration-300 bg-[#F4F5F7]"
                >
                  <div className="p-3 rounded-xl" style={{ background: MAROON + "15" }}>{TRUST_BADGE_ICONS[i]}</div>
                  <div>
                    <h4 className="font-serif text-lg font-semibold mb-1" style={{ color: MAROON }}>{f.title}</h4>
                    <p className="text-sm text-[#7a5f4e] leading-relaxed">{f.desc}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Mission & Values ─────────────────────────────────── */}
        <section className="bg-[#E5E8EC] py-16 md:py-24">
          <div className="container mx-auto px-4">
            <SectionTitle subtitle="The principles that guide every decision we make">
              Mission & Values
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {content.missionValues.map((v, i) => (
                <motion.div
                  key={i}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="bg-white rounded-2xl p-6 border border-[#C7CCD1]/20 shadow-sm hover:shadow-md transition-shadow duration-300 text-center"
                >
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#0A1F44]/8 flex items-center justify-center">
                    {MISSION_VALUE_ICONS[i]}
                  </div>
                  <h3 className="font-semibold text-[#0A1F44] text-base mb-2">{v.title}</h3>
                  <p className="text-sm text-[#7a5f4e] leading-relaxed">{v.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Artisan / weaver feature ─────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid md:grid-cols-2 gap-10 md:gap-16 items-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <div className="relative rounded-2xl overflow-hidden shadow-xl border border-[#C7CCD1]/20 aspect-[4/3]">
                <img
                  src="/images/artisan-1.png"
                  alt="Weaver artisan at work"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              custom={1}
            >
              <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-3">Our Weavers</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#0A1F44] font-bold mb-5">
                {content.weaversHeadline}
              </h2>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed mb-4">
                {content.weaversParagraph1}
              </p>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed">
                {content.weaversParagraph2}
              </p>
            </motion.div>
          </div>
        </section>

        {/* ── Team ─────────────────────────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <SectionTitle subtitle="The people behind VASTRAA's mission">
            Meet the Team
          </SectionTitle>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {TEAM.map((member, i) => (
              <motion.div
                key={member.name}
                custom={i}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                variants={fadeUp}
                className="bg-white rounded-2xl border border-[#C7CCD1]/20 shadow-sm hover:shadow-md transition-shadow duration-300 p-6 text-center"
              >
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-24 h-24 rounded-full object-cover mx-auto mb-4 border-2 border-[#C7CCD1]/30"
                />
                <h3 className="font-semibold text-[#0A1F44] text-base">{member.name}</h3>
                <p className="text-xs font-bold uppercase tracking-wider text-[#C7CCD1] mb-3">{member.role}</p>
                <p className="text-sm text-[#7a5f4e] leading-relaxed">{member.bio}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <section className="bg-[#E5E8EC] py-16 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <h2 className="font-serif text-2xl md:text-3xl text-[#0A1F44] font-bold mb-4">
                {content.ctaHeadline}
              </h2>
              <p className="text-[#7a5f4e] mb-8 max-w-lg mx-auto text-sm md:text-base">
                {content.ctaSubtext}
              </p>
              <Link
                href="/paithani/shop"
                className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors"
              >
                Explore Sarees <ArrowRight size={16} />
              </Link>

              <div className="mt-12 pt-8 border-t border-[#C7CCD1]/30">
                <p className="text-xs uppercase tracking-[0.25em] font-bold text-[#C7CCD1] mb-5">Follow Our Journey</p>
                <div className="flex items-center justify-center gap-5">
                  {[
                    { icon: <Instagram size={20} />, label: "Instagram", href: "https://www.instagram.com/vastraa/", hover: "hover:text-[#E1306C]" },
                    { icon: <Facebook size={20} />, label: "Facebook", href: "https://www.facebook.com/vastraa", hover: "hover:text-[#1877F2]" },
                    { icon: <Youtube size={20} />, label: "YouTube", href: "https://www.youtube.com/@vastraa", hover: "hover:text-[#FF0000]" },
                    { icon: <Twitter size={20} />, label: "X (Twitter)", href: "https://twitter.com/vastraa", hover: "hover:text-[#1DA1F2]" },
                    { icon: <Linkedin size={20} />, label: "LinkedIn", href: "https://www.linkedin.com/company/vastraa", hover: "hover:text-[#0A66C2]" },
                  ].map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`VASTRAA on ${s.label}`}
                      title={s.label}
                      className={`w-11 h-11 rounded-full border border-[#C7CCD1]/30 bg-white flex items-center justify-center text-[#7a5f4e] ${s.hover} hover:border-[#C7CCD1] hover:shadow-md transition-all duration-300`}
                    >
                      {s.icon}
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          </div>
        </section>

      </div>
    </Layout>
  );
}
