import React from "react";
import { SignIn, useUser } from "@clerk/react";
import {
  Store, TrendingUp, ShieldCheck, Zap, BarChart3, Truck,
  CheckCircle2, ArrowRight, Sparkles,
} from "lucide-react";
import { motion } from "framer-motion";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const MAROON = "#1E6B5A";
const MAROON_DARK = "#144A3E";
const GOLD = "#C9A84C";
const IVORY = "#F3F8F5";

const FEATURES = [
  {
    icon: TrendingUp,
    title: "Grow your reach",
    desc: "Put your sarees in front of thousands of shoppers browsing every day.",
  },
  {
    icon: BarChart3,
    title: "Real-time analytics",
    desc: "Track sales, inventory, and customer trends from one dashboard.",
  },
  {
    icon: Truck,
    title: "Simple order management",
    desc: "Manage orders, returns, and dispatch without the back-and-forth.",
  },
  {
    icon: ShieldCheck,
    title: "Secure & reliable",
    desc: "Bank-grade authentication and payout tracking, built in.",
  },
];

const STATS = [
  { value: "500+", label: "Active sellers" },
  { value: "50K+", label: "Orders fulfilled" },
  { value: "4.8★", label: "Avg. seller rating" },
];

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: "easeOut" as const },
  }),
};

export default function SellerLogin() {
  const { isSignedIn } = useUser();

  return (
    <div className="min-h-screen flex flex-col lg:flex-row" style={{ background: IVORY }}>
      {/* Left: Brand / marketing panel */}
      <div
        className="relative overflow-hidden lg:w-[52%] xl:w-[55%] px-6 sm:px-10 lg:px-16 py-12 lg:py-16 flex flex-col justify-between"
        style={{
          background: `radial-gradient(1100px circle at 15% 0%, ${MAROON} 0%, ${MAROON_DARK} 55%, #0E362D 100%)`,
        }}
      >
        {/* decorative glow accents */}
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-80 h-80 rounded-full opacity-20 blur-3xl"
          style={{ background: GOLD }}
        />
        <div
          className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full opacity-10 blur-3xl"
          style={{ background: "#ffffff" }}
        />

        <div className="relative z-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="flex items-center gap-3 mb-14"
          >
            <img
              src={`${basePath}/images/logo.png`}
              alt="TwirlDrape"
              className="h-10 w-auto object-contain brightness-0 invert"
            />
            <span
              className="text-[10px] font-bold uppercase tracking-[0.28em] px-2.5 py-1 rounded-full"
              style={{ background: "rgba(201,168,76,0.18)", color: GOLD, border: `1px solid ${GOLD}55` }}
            >
              Seller Portal
            </span>
          </motion.div>

          <motion.div custom={1} initial="hidden" animate="visible" variants={fadeUp}>
            <div
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full mb-6"
              style={{ background: "rgba(255,255,255,0.08)", color: IVORY, border: "1px solid rgba(255,255,255,0.12)" }}
            >
              <Sparkles size={12} style={{ color: GOLD }} />
              Trusted by India's finest saree houses
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl xl:text-[2.75rem] font-bold text-white leading-[1.15] max-w-lg">
              Grow your saree business with TwirlDrape
            </h1>
            <p className="mt-5 text-sm sm:text-base leading-relaxed max-w-md" style={{ color: "rgba(243,248,245,0.75)" }}>
              One dashboard for orders, inventory, payouts, and customer support —
              built for weavers and boutiques who want to sell without the friction.
            </p>
          </motion.div>

          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={fadeUp}
            className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg"
          >
            {FEATURES.map((f, i) => (
              <div
                key={f.title}
                className="flex items-start gap-3 rounded-xl px-4 py-3.5"
                style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(201,168,76,0.15)" }}
                >
                  <f.icon size={15} style={{ color: GOLD }} />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white leading-tight">{f.title}</p>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "rgba(243,248,245,0.6)" }}>
                    {f.desc}
                  </p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <motion.div
          custom={3}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          className="relative z-10 mt-12 flex flex-wrap items-center gap-8 pt-8"
          style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}
        >
          {STATS.map((s) => (
            <div key={s.label}>
              <p className="text-xl sm:text-2xl font-bold" style={{ color: GOLD }}>{s.value}</p>
              <p className="text-[11px] uppercase tracking-wider mt-0.5" style={{ color: "rgba(243,248,245,0.55)" }}>
                {s.label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Right: Sign-in panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-12 lg:py-16">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          <div className="mb-8 text-center lg:text-left">
            <h2 className="font-serif text-2xl font-bold" style={{ color: MAROON }}>
              {isSignedIn ? "Welcome back" : "Sign in to your seller account"}
            </h2>
            <p className="text-sm text-gray-500 mt-1.5">
              {isSignedIn
                ? "Pick up right where you left off."
                : "Manage your storefront, orders, and payouts in one place."}
            </p>
          </div>

          {isSignedIn ? (
            <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-8 text-center shadow-[0_8px_30px_rgba(30,107,90,0.08)]">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: MAROON + "18" }}
              >
                <Store size={24} style={{ color: MAROON }} />
              </div>
              <h3 className="font-serif text-xl font-bold mb-2" style={{ color: MAROON }}>
                Already Signed In
              </h3>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">
                You're signed in to TwirlDrape. Access your seller panel or register as a vendor.
              </p>
              <div className="flex flex-col gap-3">
                <a
                  href={`${basePath}/seller/dashboard`}
                  className="inline-flex items-center justify-center gap-2 py-3 px-6 font-bold text-sm uppercase tracking-widest rounded-sm transition-colors hover:opacity-90"
                  style={{ background: MAROON, color: IVORY }}
                >
                  Go to Seller Dashboard
                  <ArrowRight size={15} />
                </a>
                <a
                  href={`${basePath}/seller/register`}
                  className="inline-flex items-center justify-center gap-2 py-3 px-6 font-bold text-sm uppercase tracking-widest rounded-sm border-2 transition-colors hover:bg-[#C9A84C]/10"
                  style={{ borderColor: GOLD, color: MAROON }}
                >
                  Register as Vendor
                </a>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-[#C9A84C]/20 p-2 sm:p-4 shadow-[0_8px_30px_rgba(30,107,90,0.08)]">
              <SignIn
                routing="path"
                path={`${basePath}/seller/login`}
                signUpUrl={`${basePath}/sign-up`}
                forceRedirectUrl={`${basePath}/seller/dashboard`}
                appearance={{
                  elements: {
                    rootBox: "w-full",
                    card: "shadow-none border-none w-full p-2 sm:p-4",
                    headerTitle: "font-serif",
                    formButtonPrimary: "normal-case font-bold tracking-wide",
                  },
                  variables: {
                    colorPrimary: MAROON,
                  },
                }}
              />
            </div>
          )}

          {!isSignedIn && (
            <p className="mt-6 text-center lg:text-left text-sm text-gray-500">
              New seller?{" "}
              <a
                href={`${basePath}/seller/register`}
                className="font-semibold hover:underline"
                style={{ color: MAROON }}
              >
                Register your store →
              </a>
            </p>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 justify-center lg:justify-start text-xs text-gray-400">
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} style={{ color: MAROON }} /> Free to join
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={13} style={{ color: MAROON }} /> No setup fees
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Zap size={13} style={{ color: MAROON }} /> Go live in minutes
            </span>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
