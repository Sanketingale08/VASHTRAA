import React from "react";
import { Link } from "wouter";
import { Truck, Clock, MapPin, Package, AlertCircle, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/Layout";

const GOLD = "#C9A84C";
const GREEN = "#1E6B5A";

const SHIPPING_OPTIONS = [
  {
    icon: <Truck className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Standard Delivery",
    time: "5–8 Business Days",
    cost: "Free on prepaid orders ₹999+. ₹79 otherwise.",
    desc: "Available across 3,000+ pin codes in India. Tracking link sent via email and SMS once dispatched.",
  },
  {
    icon: <Clock className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Express Delivery",
    time: "2–3 Business Days",
    cost: "₹149 flat (or free on orders above ₹2,999)",
    desc: "Available in most Tier 1 and Tier 2 cities. Select at checkout — delivery time shown before payment.",
  },
  {
    icon: <Package className="w-7 h-7" style={{ color: GOLD }} />,
    title: "Cash on Delivery",
    time: "5–8 Business Days",
    cost: "₹79 shipping + ₹49 COD handling fee",
    desc: "COD is available at select pin codes. The option will appear at checkout if it's available for your area.",
  },
];

const NOTES = [
  "Orders placed before 12:00 PM IST on business days are typically dispatched the same day.",
  "Delivery timelines are estimates and may extend by 1–2 days during peak sale periods and public holidays.",
  "Once dispatched, you'll receive an email and SMS with a tracking link. You can also track from My Account → Orders.",
  "For remote or difficult-to-access pin codes, delivery may take an additional 2–3 days beyond the standard window.",
  "TwirlDrape ships via reputable logistics partners. We do not currently offer international shipping.",
];

export default function ShippingInfo() {
  return (
    <Layout>
      <div className="bg-[#F3F8F5] min-h-screen">

        {/* Hero */}
        <section className="bg-[#1E6B5A] py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C9A84C] uppercase tracking-[0.3em] text-xs font-bold mb-4">Delivery</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F3F8F5] font-bold mb-4">
              Shipping Information
            </h1>
            <p className="text-[#E6F0EA] max-w-xl mx-auto text-base leading-relaxed">
              Everything you need to know about how and when your saree will reach you.
            </p>
          </div>
        </section>

        {/* Shipping Options */}
        <section className="container mx-auto px-4 py-14 md:py-20">
          <div className="text-center mb-12">
            <h2 className="font-serif text-2xl md:text-3xl text-[#1E6B5A] font-bold">Delivery Options</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {SHIPPING_OPTIONS.map((opt) => (
              <div
                key={opt.title}
                className="bg-white rounded-2xl p-6 border border-[#C9A84C]/20 shadow-sm flex flex-col gap-4"
              >
                <div className="w-14 h-14 rounded-full bg-[#1E6B5A]/8 flex items-center justify-center">
                  {opt.icon}
                </div>
                <div>
                  <h3 className="font-serif text-lg text-[#3D1515] font-bold mb-1">{opt.title}</h3>
                  <p className="text-xs font-bold uppercase tracking-wider text-[#C9A84C] mb-2">{opt.time}</p>
                  <p className="text-sm font-semibold text-[#1E6B5A] mb-3">{opt.cost}</p>
                  <p className="text-sm text-[#7a5f4e] leading-relaxed">{opt.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Delivery Coverage */}
        <section className="bg-[#E6F0EA] py-14">
          <div className="container mx-auto px-4 max-w-3xl">
            <div className="flex items-center gap-3 mb-8">
              <MapPin className="w-6 h-6 shrink-0" style={{ color: GREEN }} />
              <h2 className="font-serif text-xl md:text-2xl text-[#1E6B5A] font-bold">Delivery Coverage</h2>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#C9A84C]/20 mb-6">
              <p className="text-sm text-[#7a5f4e] leading-relaxed mb-4">
                We currently deliver to <strong className="text-[#1E6B5A]">3,000+ pin codes</strong> across all
                Indian states and union territories. Coverage is especially strong in Tier 1 and Tier 2 cities.
              </p>
              <p className="text-sm text-[#7a5f4e] leading-relaxed">
                To check if we deliver to your area, enter your pin code on any product page or proceed to
                checkout — you'll see delivery options available before placing your order.
              </p>
            </div>
            <div className="flex items-start gap-3 bg-[#C9A84C]/10 rounded-xl p-4 border border-[#C9A84C]/30">
              <AlertCircle size={18} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
              <p className="text-sm text-[#7a5f4e]">
                We do not currently ship internationally. Please contact us at{" "}
                <a href="mailto:support@twirldrape.com" className="text-[#1E6B5A] underline">
                  support@twirldrape.com
                </a>{" "}
                if you're placing an order from outside India and we'll see what we can arrange.
              </p>
            </div>
          </div>
        </section>

        {/* Important Notes */}
        <section className="container mx-auto px-4 py-14 max-w-3xl">
          <h2 className="font-serif text-xl md:text-2xl text-[#1E6B5A] font-bold mb-8">Important Notes</h2>
          <ul className="space-y-4">
            {NOTES.map((note, i) => (
              <li key={i} className="flex items-start gap-3">
                <CheckCircle2 size={18} className="shrink-0 mt-0.5" style={{ color: GREEN }} />
                <p className="text-sm text-[#7a5f4e] leading-relaxed">{note}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="bg-[#1E6B5A] py-12">
          <div className="container mx-auto px-4 text-center">
            <h2 className="font-serif text-xl md:text-2xl text-[#F3F8F5] font-bold mb-3">
              Still have delivery questions?
            </h2>
            <p className="text-[#E6F0EA] mb-6 text-sm max-w-lg mx-auto">
              Our support team can help with specific delivery queries, express options, or bulk orders.
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-[#C9A84C] text-[#1E6B5A] px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
