import React, { useState } from "react";
import { Link } from "wouter";
import {
  Instagram,
  Facebook,
  Youtube,
  Twitter,
  Linkedin,
  Mail,
  Phone,
  Clock,
  MapPin,
  ShieldCheck,
  Truck,
  RotateCcw,
  Lock,
  ChevronRight,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

function FooterNavSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-white/10 md:border-none py-3.5 md:py-0">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-left font-serif text-sm md:text-[15px] font-semibold text-[#F4F5F7] tracking-wider uppercase mb-0 md:mb-5 cursor-pointer md:cursor-default"
      >
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
          {title}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            "text-[#D4AF37] transition-transform duration-200 md:hidden",
            isOpen && "rotate-180"
          )}
        />
      </button>
      <div className={cn("mt-3 md:mt-0 space-y-3", isOpen ? "block" : "hidden md:block")}>
        {children}
      </div>
    </div>
  );
}

export function Footer() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className="relative bg-gradient-to-b from-[#0D1527] via-[#0A111E] to-[#060A12] text-[#F4F5F7] border-t-2 border-[#D4AF37]/40 overflow-hidden"
      aria-labelledby="footer-heading"
    >
      <h2 id="footer-heading" className="sr-only">
        VASTRAA Storefront Footer
      </h2>

      {/* Subtle decorative gold shimmer hairline */}
      <div className="w-full h-[1px] bg-gradient-to-r from-transparent via-[#D4AF37]/50 to-transparent" />

      {/* ── Value Proposition / Trust Features Strip ─────────────────────── */}
      <div className="border-b border-white/10 bg-white/[0.02]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 lg:gap-8">
            <div className="flex items-center gap-3 sm:gap-3.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 text-[#D4AF37]">
                <ShieldCheck size={18} className="sm:w-5 sm:h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-[#F4F5F7] tracking-wide">
                  100% Authentic Handloom
                </h4>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 hidden xs:block">
                  Certified Silk Mark & master weavers
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-3.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 text-[#D4AF37]">
                <Truck size={18} className="sm:w-5 sm:h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-[#F4F5F7] tracking-wide">
                  PAN India Delivery
                </h4>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 hidden xs:block">
                  Insured express delivery
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-3.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 text-[#D4AF37]">
                <RotateCcw size={18} className="sm:w-5 sm:h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-[#F4F5F7] tracking-wide">
                  Easy 7-Day Returns
                </h4>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 hidden xs:block">
                  Hassle-free doorstep returns
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 sm:gap-3.5">
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/30 flex items-center justify-center shrink-0 text-[#D4AF37]">
                <Lock size={18} className="sm:w-5 sm:h-5" />
              </div>
              <div>
                <h4 className="text-xs sm:text-sm font-semibold text-[#F4F5F7] tracking-wide">
                  100% Secure Checkout
                </h4>
                <p className="text-[11px] sm:text-xs text-gray-400 mt-0.5 hidden xs:block">
                  256-bit encryption • UPI, Cards & COD
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Footer Navigation & Brand ─────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 md:pt-16 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 md:gap-8 lg:gap-6 xl:gap-8">
          
          {/* ── Section A: Brand & Description ── */}
          <div className="md:col-span-2 lg:col-span-3 xl:col-span-3 flex flex-col items-start pr-0 lg:pr-2 mb-2 md:mb-0">
            <Link
              href="/"
              className="group inline-flex items-center mb-3 transition-opacity hover:opacity-95"
              aria-label="VASTRAA Home"
            >
              <div className="bg-white/95 px-3.5 py-2 rounded-xl border border-[#D4AF37]/30 shadow-xs inline-flex items-center">
                <img
                  src={`${basePath}/logo.svg`}
                  alt="VASTRAA — Paithani & Designer Sarees"
                  className="h-9 sm:h-10 md:h-11 w-auto max-w-[180px] sm:max-w-[200px] object-contain"
                />
              </div>
            </Link>

            <p className="font-serif text-[11px] font-bold uppercase tracking-[0.22em] text-[#D4AF37] mb-2 sm:mb-3 flex items-center gap-1.5">
              <Sparkles size={12} className="text-[#D4AF37] shrink-0" />
              THE ART OF INDIAN DRAPE
            </p>

            <p className="text-gray-300 text-xs md:text-sm leading-relaxed max-w-sm">
              A premier curated marketplace for authentic handwoven Paithani sarees
              and contemporary designer sarees, celebrating India’s timeless artisanal
              weaving legacy with modern elegance.
            </p>
          </div>

          {/* ── Section B: Shop ── */}
          <div className="lg:col-span-2">
            <FooterNavSection title="Shop">
              <ul className="space-y-2.5 sm:space-y-3 text-sm">
                <li>
                  <Link
                    href="/products"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    All Sarees
                  </Link>
                </li>
                <li>
                  <Link
                    href="/paithani"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Paithani Sarees
                  </Link>
                </li>
                <li>
                  <Link
                    href="/designer"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Designer Sarees
                  </Link>
                </li>
                <li>
                  <Link
                    href="/category/indian-wear"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Indian Wear
                  </Link>
                </li>
                <li>
                  <Link
                    href="/category/western-wear"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Western Wear
                  </Link>
                </li>
                <li>
                  <Link
                    href="/bridal"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Bridal Collection
                  </Link>
                </li>
                <li>
                  <Link
                    href="/party-wear"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Party Wear
                  </Link>
                </li>
                <li>
                  <Link
                    href="/new-arrivals"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    New Arrivals
                  </Link>
                </li>
              </ul>
            </FooterNavSection>
          </div>

          {/* ── Section C: Customer Service ── */}
          <div className="lg:col-span-2">
            <FooterNavSection title="Customer Service">
              <ul className="space-y-2.5 sm:space-y-3 text-sm">
                <li>
                  <Link
                    href="/contact"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Contact Us
                  </Link>
                </li>
                <li>
                  <Link
                    href="/faqs"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Frequently Asked Questions
                  </Link>
                </li>
                <li>
                  <Link
                    href="/shipping-info"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Shipping Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/returns"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Returns and Refunds
                  </Link>
                </li>
                <li>
                  <Link
                    href="/orders"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Order Tracking
                  </Link>
                </li>
                <li>
                  <Link
                    href="/size-guide"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Size & Blouse Guide
                  </Link>
                </li>
              </ul>
            </FooterNavSection>
          </div>

          {/* ── Section D: About VASTRAA ── */}
          <div className="lg:col-span-2">
            <FooterNavSection title="About VASTRAA">
              <ul className="space-y-2.5 sm:space-y-3 text-sm">
                <li>
                  <Link
                    href="/about"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    About Us
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy-policy"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/terms-of-service"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Terms and Conditions
                  </Link>
                </li>
                <li>
                  <Link
                    href="/seller/register"
                    className="text-gray-300 hover:text-[#F3D675] hover:translate-x-0.5 transition-all duration-200 inline-flex items-center gap-1 group py-0.5"
                  >
                    <ChevronRight size={13} className="text-[#D4AF37]/40 group-hover:text-[#D4AF37] transition-colors" />
                    Become a Seller
                  </Link>
                </li>
              </ul>
            </FooterNavSection>
          </div>

          {/* ── Section E: Contact and Social Media ── */}
          <div className="sm:col-span-2 md:col-span-3 lg:col-span-3 xl:col-span-3">
            <h3 className="font-serif text-sm md:text-[15px] font-semibold text-[#F4F5F7] tracking-wider uppercase mb-5 flex items-center gap-2 whitespace-nowrap" aria-label="Contact Information">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]" />
              Contact Information
            </h3>

            {/* Verified Support Contact details */}
            <div className="space-y-3.5 text-xs text-gray-300 mb-6" aria-label="Contact Information Details">
              <a
                href="mailto:support@vastraasaree.com"
                className="flex items-center gap-2.5 hover:text-[#F3D675] transition-colors group break-all"
                title="Customer Support Email"
              >
                <Mail size={15} className="text-[#D4AF37] shrink-0 group-hover:scale-110 transition-transform" />
                <span className="font-medium">support@vastraasaree.com</span>
              </a>

              <a
                href="tel:+919876543210"
                className="flex items-center gap-2.5 hover:text-[#F3D675] transition-colors group"
                title="Customer Support Hotline"
              >
                <Phone size={15} className="text-[#D4AF37] shrink-0 group-hover:scale-110 transition-transform" />
                <span>+91 98765 43210</span>
              </a>

              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-[#D4AF37] shrink-0" />
                <span>Mon – Sat: 9 AM – 7 PM IST</span>
              </div>

              <div className="flex items-center gap-2.5">
                <MapPin size={15} className="text-[#D4AF37] shrink-0" />
                <span>Yeola & Mumbai, India</span>
              </div>
            </div>

            {/* Social Media Links */}
            <div>
              <p className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold mb-3">
                Connect With Us
              </p>
              <div className="flex flex-wrap gap-2.5">
                <a
                  href="https://www.instagram.com/vastraa/"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="VASTRAA on Instagram"
                  title="Instagram"
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-[#D4AF37] hover:text-[#0A1F44] hover:border-[#D4AF37] transition-all duration-200"
                >
                  <Instagram size={16} />
                </a>
                <a
                  href="https://www.facebook.com/vastraa"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="VASTRAA on Facebook"
                  title="Facebook"
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-[#D4AF37] hover:text-[#0A1F44] hover:border-[#D4AF37] transition-all duration-200"
                >
                  <Facebook size={16} />
                </a>
                <a
                  href="https://www.youtube.com/@vastraa"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="VASTRAA on YouTube"
                  title="YouTube"
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-[#D4AF37] hover:text-[#0A1F44] hover:border-[#D4AF37] transition-all duration-200"
                >
                  <Youtube size={16} />
                </a>
                <a
                  href="https://twitter.com/vastraa"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="VASTRAA on X (Twitter)"
                  title="X (Twitter)"
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-[#D4AF37] hover:text-[#0A1F44] hover:border-[#D4AF37] transition-all duration-200"
                >
                  <Twitter size={16} />
                </a>
                <a
                  href="https://www.linkedin.com/company/vastraa"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="VASTRAA on LinkedIn"
                  title="LinkedIn"
                  className="w-9 h-9 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-gray-300 hover:bg-[#D4AF37] hover:text-[#0A1F44] hover:border-[#D4AF37] transition-all duration-200"
                >
                  <Linkedin size={16} />
                </a>
              </div>
            </div>

          </div>

        </div>

        {/* ── Section 3: Footer Bottom Bar ─────────────────────────────── */}
        <div className="border-t border-white/10 pt-8 pb-safe mt-12 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-400">
          <p className="text-center md:text-left leading-relaxed">
            &copy; {currentYear} <strong className="text-gray-200 font-semibold">VASTRAA</strong>. All rights reserved. —
            <span className="text-[#D4AF37] ml-1 font-serif tracking-wider">The Art of Indian Drape</span>
          </p>

          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
            <Link
              href="/privacy-policy"
              className="text-gray-400 hover:text-[#F3D675] transition-colors"
            >
              Privacy Policy
            </Link>
            <span className="text-white/20 select-none">•</span>
            <Link
              href="/terms-of-service"
              className="text-gray-400 hover:text-[#F3D675] transition-colors"
            >
              Terms and Conditions
            </Link>
            <span className="text-white/20 select-none">•</span>
            <Link
              href="/shipping-info"
              className="text-gray-400 hover:text-[#F3D675] transition-colors"
            >
              Shipping Policy
            </Link>
            <span className="text-white/20 select-none">•</span>
            <Link
              href="/returns"
              className="text-gray-400 hover:text-[#F3D675] transition-colors"
            >
              Returns and Refunds
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

