import React from "react";
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

const GOLD = "#C9A84C";
const MAROON = "#1E6B5A";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.08, ease: "easeOut" },
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
        <h2 className="font-serif text-2xl md:text-3xl lg:text-4xl font-bold tracking-wide text-[#1E6B5A]">
          {children}
        </h2>
        <span className="flex-1 max-w-[80px] h-px" style={{ background: `linear-gradient(to left, transparent, ${GOLD})` }} />
      </div>
      {subtitle && <p className="text-sm md:text-base text-gray-500 max-w-xl mx-auto">{subtitle}</p>}
    </div>
  );
}

const MISSION_VALUES = [
  {
    icon: <Heart className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Heritage First",
    desc: "We champion India's handloom traditions, giving every weave the recognition and respect it deserves.",
  },
  {
    icon: <Users className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Direct From Artisans",
    desc: "We work directly with weaver collectives — no middlemen — so artisans earn fairly for their craft.",
  },
  {
    icon: <Sparkles className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Uncompromising Quality",
    desc: "Every saree is hand-inspected before it reaches you, so authenticity is never in question.",
  },
  {
    icon: <Leaf className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Sustainable Craft",
    desc: "We champion slow fashion — handwoven pieces made to last generations, not seasons.",
  },
];

const TRUST_BADGES = [
  { icon: <BadgeCheck className="w-8 h-8" style={{ color: GOLD }} />, title: "100% Authentic Products", desc: "Every saree is verified and sourced directly from trusted weavers and artisans." },
  { icon: <ShieldCheck className="w-8 h-8" style={{ color: GOLD }} />, title: "Verified Vendors & Quality Assured", desc: "All vendors go through a rigorous quality check before listing on TwirlDrape." },
  { icon: <CreditCard className="w-8 h-8" style={{ color: GOLD }} />, title: "Secure Payments & Data Protection", desc: "Bank-grade encryption keeps your payment and personal data completely safe." },
  { icon: <RefreshCcw className="w-8 h-8" style={{ color: GOLD }} />, title: "Easy Returns & Refunds", desc: "Hassle-free returns within 7 days — no questions asked, full refund guaranteed." },
  { icon: <Truck className="w-8 h-8" style={{ color: GOLD }} />, title: "Fast & Reliable Pan India Delivery", desc: "Swift shipping across all states with real-time tracking on every order." },
  { icon: <Headphones className="w-8 h-8" style={{ color: GOLD }} />, title: "Dedicated Support 24/7", desc: "Our saree experts are always available to help you find the perfect drape." },
];

const TEAM = [
  { name: "Anjali Deshmukh", role: "Founder & CEO", avatar: "/images/team-anjali.png", bio: "Third-generation textile enthusiast who founded TwirlDrape to bring authentic Paithani weaves to a global audience." },
  { name: "Rohan Kulkarni", role: "Head of Vendor Relations", avatar: "/images/team-rohan.png", bio: "Works hand-in-hand with weaver collectives across Maharashtra to onboard and support artisan partners." },
  { name: "Meera Iyer", role: "Head of Design & Curation", avatar: "/images/team-meera.png", bio: "Curates every collection, ensuring each saree reflects timeless craftsmanship and contemporary taste." },
];

const STATS = [
  { label: "Weaver Partners", value: "150+" },
  { label: "Sarees Delivered", value: "25,000+" },
  { label: "Cities Served", value: "500+" },
  { label: "Years of Trust", value: "8+" },
];

export default function About() {
  return (
    <Layout>
      <div className="bg-[#F3F8F5] min-h-screen">

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative bg-[#1E6B5A] py-24 md:py-32 overflow-hidden">
          <div
            className="absolute inset-0 opacity-8"
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
              className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-4"
            >
              Our Story
            </motion.p>
            <motion.h1
              initial="hidden"
              animate="visible"
              custom={1}
              variants={fadeUp}
              className="font-serif text-4xl md:text-6xl text-[#F3F8F5] font-bold mb-6 leading-tight"
            >
              Weaving Tradition Into<br className="hidden md:block" /> Every Drape
            </motion.h1>
            <motion.p
              initial="hidden"
              animate="visible"
              custom={2}
              variants={fadeUp}
              className="text-[#E6F0EA] max-w-2xl mx-auto text-base md:text-lg leading-relaxed"
            >
              TwirlDrape was born from a simple belief — that India's handloom heritage deserves a home
              where craftsmanship, authenticity, and beauty come together. We connect skilled artisans
              directly with shoppers who value the story behind every thread.
            </motion.p>
          </div>
        </section>

        {/* ── Stats bar ────────────────────────────────────────── */}
        <section className="bg-white border-b border-[#C9A84C]/20 py-10">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
              {STATS.map((s, i) => (
                <motion.div
                  key={s.label}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                >
                  <p className="font-serif text-3xl md:text-4xl font-bold text-[#1E6B5A]">{s.value}</p>
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
              <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Founding Mission</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#1E6B5A] font-bold mb-5">
                From a Single Loom to a Nationwide Community
              </h2>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed mb-4">
                TwirlDrape started in a small workshop in Maharashtra, where our founder watched
                generations-old Paithani weaving techniques struggle to find the audience they deserved.
                What began as a promise to a handful of weaver families has grown into a marketplace
                connecting artisans across the country with shoppers who cherish handwoven craft.
              </p>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed">
                Today, every saree on TwirlDrape carries a story — of the hands that wove it, the region
                it comes from, and the tradition it keeps alive. We built this platform so that story
                never gets lost between the loom and your wardrobe.
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
              <div className="relative rounded-2xl overflow-hidden shadow-xl border border-[#C9A84C]/20 aspect-[4/3]">
                <img
                  src="/images/hero-paithani-2.png"
                  alt="TwirlDrape artisan weaving"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* ── Mission & Values ─────────────────────────────────── */}
        <section className="bg-[#E6F0EA] py-16 md:py-24">
          <div className="container mx-auto px-4">
            <SectionTitle subtitle="The principles that guide every decision we make">
              Mission & Values
            </SectionTitle>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {MISSION_VALUES.map((v, i) => (
                <motion.div
                  key={v.title}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="bg-white rounded-2xl p-6 border border-[#C9A84C]/20 shadow-sm hover:shadow-md transition-shadow duration-300 text-center"
                >
                  <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-[#1E6B5A]/8 flex items-center justify-center">
                    {v.icon}
                  </div>
                  <h3 className="font-semibold text-[#3D1515] text-base mb-2">{v.title}</h3>
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
              <div className="relative rounded-2xl overflow-hidden shadow-xl border border-[#C9A84C]/20 aspect-[4/3]">
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
              <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Our Weavers</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#1E6B5A] font-bold mb-5">
                A Network of 150+ Master Artisans
              </h2>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed mb-4">
                Behind every TwirlDrape saree is a weaver who has spent years — sometimes decades —
                perfecting their craft. We partner directly with artisan collectives in Paithan, Yeola,
                Kanchipuram, and beyond, ensuring fair wages and long-term relationships instead of
                one-off transactions.
              </p>
              <p className="text-[#7a5f4e] text-sm md:text-base leading-relaxed mb-6">
                Our vendor vetting process looks beyond price — we assess technique, material quality,
                and the story each weaver brings to their work, so you can shop with complete confidence.
              </p>
              <Link
                href="/seller/register"
                className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-[#1E6B5A] hover:text-[#C9A84C] transition-colors border-b border-[#1E6B5A]/30 hover:border-[#C9A84C] pb-0.5"
              >
                Join as a Weaver Partner <ArrowRight size={13} />
              </Link>
            </motion.div>
          </div>
        </section>

        {/* ── Why TwirlDrape (trust badges) ───────────────────── */}
        <section className="bg-[#1E6B5A] py-16 md:py-24">
          <div className="container mx-auto px-4">
            <motion.div
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
              className="text-center mb-12"
            >
              <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-3">Why TwirlDrape</p>
              <h2 className="font-serif text-3xl md:text-4xl text-[#F3F8F5] font-bold">A Promise You Can Trust</h2>
            </motion.div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {TRUST_BADGES.map((f, i) => (
                <motion.div
                  key={f.title}
                  custom={i}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  variants={fadeUp}
                  className="bg-white/5 border border-[#C9A84C]/20 rounded-2xl p-6 backdrop-blur-sm"
                >
                  <div className="mb-4">{f.icon}</div>
                  <h3 className="font-semibold text-[#F3F8F5] text-base mb-2">{f.title}</h3>
                  <p className="text-sm text-[#E6F0EA]/80 leading-relaxed">{f.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Team ─────────────────────────────────────────────── */}
        <section className="container mx-auto px-4 py-16 md:py-24">
          <SectionTitle subtitle="The people behind TwirlDrape's mission">
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
                className="bg-white rounded-2xl border border-[#C9A84C]/20 shadow-sm hover:shadow-md transition-shadow duration-300 p-6 text-center"
              >
                <img
                  src={member.avatar}
                  alt={member.name}
                  className="w-24 h-24 rounded-full object-cover mx-auto mb-4 border-2 border-[#C9A84C]/30"
                />
                <h3 className="font-semibold text-[#3D1515] text-base">{member.name}</h3>
                <p className="text-xs font-bold uppercase tracking-wider text-[#C9A84C] mb-3">{member.role}</p>
                <p className="text-sm text-[#7a5f4e] leading-relaxed">{member.bio}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────── */}
        <section className="bg-[#E6F0EA] py-16 md:py-20">
          <div className="container mx-auto px-4 text-center">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={fadeUp}
            >
              <h2 className="font-serif text-2xl md:text-3xl text-[#1E6B5A] font-bold mb-4">
                Discover the Craft. Wear the Story.
              </h2>
              <p className="text-[#7a5f4e] mb-8 max-w-lg mx-auto text-sm md:text-base">
                Explore our curated collections of handwoven sarees from India's finest artisans.
              </p>
              <Link
                href="/collections"
                className="inline-flex items-center gap-2 bg-[#1E6B5A] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#5e1421] transition-colors"
              >
                Explore Collections <ArrowRight size={16} />
              </Link>

              <div className="mt-12 pt-8 border-t border-[#C9A84C]/30">
                <p className="text-xs uppercase tracking-[0.25em] font-bold text-[#C9A84C] mb-5">Follow Our Journey</p>
                <div className="flex items-center justify-center gap-5">
                  {[
                    { icon: <Instagram size={20} />, label: "Instagram", href: "https://www.instagram.com/twirldrape/", hover: "hover:text-[#E1306C]" },
                    { icon: <Facebook size={20} />, label: "Facebook", href: "https://www.facebook.com/twirldrape", hover: "hover:text-[#1877F2]" },
                    { icon: <Youtube size={20} />, label: "YouTube", href: "https://www.youtube.com/@twirldrape", hover: "hover:text-[#FF0000]" },
                    { icon: <Twitter size={20} />, label: "X (Twitter)", href: "https://twitter.com/twirldrape", hover: "hover:text-[#1DA1F2]" },
                    { icon: <Linkedin size={20} />, label: "LinkedIn", href: "https://www.linkedin.com/company/twirldrape", hover: "hover:text-[#0A66C2]" },
                  ].map((s) => (
                    <a
                      key={s.label}
                      href={s.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`TwirlDrape on ${s.label}`}
                      title={s.label}
                      className={`w-11 h-11 rounded-full border border-[#C9A84C]/30 bg-white flex items-center justify-center text-[#7a5f4e] ${s.hover} hover:border-[#C9A84C] hover:shadow-md transition-all duration-300`}
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
