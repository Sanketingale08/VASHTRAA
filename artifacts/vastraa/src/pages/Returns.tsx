import React from "react";
import { Link } from "wouter";
import { RefreshCcw, CheckCircle2, XCircle, Clock, ArrowRight, MessageCircle } from "lucide-react";
import { Layout } from "@/components/Layout";

const GOLD = "#C7CCD1";
const GREEN = "#0A1F44";

const ELIGIBLE = [
  "Item received in a damaged or defective condition",
  "Wrong item delivered (different colour, style, or saree than ordered)",
  "Item significantly different from the product description or images",
  "Unused, unwashed, and with original tags intact (change of mind — within 7 days)",
];

const NOT_ELIGIBLE = [
  "Items that have been worn, washed, or dry-cleaned after delivery",
  "Sarees without original tags or packaging",
  "Custom-stitched blouses or altered items",
  "Items returned after the 7-day return window",
  "Sarees damaged by misuse or improper storage after delivery",
];

const STEPS = [
  {
    num: "01",
    title: "Raise a Return Request",
    desc: "Go to My Account → Orders, select the relevant order, and click 'Request Return'. Choose the reason and upload photos if the item is damaged.",
  },
  {
    num: "02",
    title: "Approval & Pickup",
    desc: "Our team reviews requests within 24 hours. Once approved, we arrange a free pickup from your address. You'll receive an SMS with the pickup date.",
  },
  {
    num: "03",
    title: "Quality Check",
    desc: "After the item reaches our fulfilment centre, it goes through a quality check (typically 2–3 business days) to confirm it matches the return conditions.",
  },
  {
    num: "04",
    title: "Refund Processed",
    desc: "Once the check is complete, your refund is issued within 3–5 business days to your original payment method. COD refunds are via bank transfer or store credit.",
  },
];

export default function Returns() {
  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* Hero */}
        <section className="bg-[#0A1F44] py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-4">Customer Care</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F4F5F7] font-bold mb-4">
              Returns &amp; Exchanges
            </h1>
            <p className="text-[#E5E8EC] max-w-xl mx-auto text-base leading-relaxed">
              We want every purchase to feel right. If something isn't perfect, our returns process is designed
              to be simple, fast, and hassle-free.
            </p>
          </div>
        </section>

        {/* Policy summary */}
        <section className="container mx-auto px-4 py-14 max-w-3xl">
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-8 flex flex-col sm:flex-row gap-6 items-start sm:items-center shadow-sm">
            <RefreshCcw className="w-12 h-12 shrink-0" style={{ color: GOLD }} />
            <div>
              <h2 className="font-serif text-xl text-[#0A1F44] font-bold mb-2">7-Day Return Policy</h2>
              <p className="text-sm text-[#7a5f4e] leading-relaxed">
                Returns are accepted within <strong>7 calendar days</strong> of delivery. Items must be unused,
                unwashed, and in their original packaging with tags intact. Pickup is free of charge.
              </p>
            </div>
          </div>
        </section>

        {/* Eligible / Not Eligible */}
        <section className="container mx-auto px-4 pb-14 max-w-3xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <CheckCircle2 className="w-5 h-5" style={{ color: GREEN }} />
                <h3 className="font-semibold text-[#0A1F44]">Eligible for Return</h3>
              </div>
              <ul className="space-y-3">
                {ELIGIBLE.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[#7a5f4e]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#0A1F44] mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-5">
                <XCircle className="w-5 h-5 text-[#c0392b]" />
                <h3 className="font-semibold text-[#c0392b]">Not Eligible for Return</h3>
              </div>
              <ul className="space-y-3">
                {NOT_ELIGIBLE.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-[#7a5f4e]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c0392b] mt-1.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Process Steps */}
        <section className="bg-[#E5E8EC] py-14">
          <div className="container mx-auto px-4 max-w-3xl">
            <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold text-center mb-10">
              How the Return Process Works
            </h2>
            <div className="space-y-6">
              {STEPS.map((step) => (
                <div key={step.num} className="flex items-start gap-5 bg-white rounded-2xl p-5 border border-[#C7CCD1]/20 shadow-sm">
                  <div className="w-12 h-12 rounded-full bg-[#0A1F44] text-white text-sm font-bold flex items-center justify-center shrink-0">
                    {step.num}
                  </div>
                  <div>
                    <h3 className="font-semibold text-[#0A1F44] mb-1">{step.title}</h3>
                    <p className="text-sm text-[#7a5f4e] leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Exchanges */}
        <section className="container mx-auto px-4 py-14 max-w-3xl">
          <div className="flex items-center gap-3 mb-5">
            <Clock className="w-6 h-6 shrink-0" style={{ color: GREEN }} />
            <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold">Exchanges</h2>
          </div>
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/20 p-6 shadow-sm">
            <p className="text-sm text-[#7a5f4e] leading-relaxed mb-4">
              We currently support exchanges subject to stock availability. To request an exchange, raise a return
              request (My Account → Orders) and mention your preferred replacement in the reason field.
            </p>
            <ul className="space-y-2 text-sm text-[#7a5f4e]">
              <li className="flex items-start gap-2">
                <ArrowRight size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} />
                If the replacement is the same price, no extra payment is needed.
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} />
                If the replacement is more expensive, you pay the difference.
              </li>
              <li className="flex items-start gap-2">
                <ArrowRight size={14} className="mt-0.5 shrink-0" style={{ color: GOLD }} />
                If the replacement is cheaper, the difference is refunded.
              </li>
            </ul>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-[#0A1F44] py-12">
          <div className="container mx-auto px-4 text-center">
            <MessageCircle className="w-8 h-8 mx-auto mb-4 text-[#C7CCD1]" />
            <h2 className="font-serif text-xl text-[#F4F5F7] font-bold mb-3">Need help with a return?</h2>
            <p className="text-[#E5E8EC] mb-6 text-sm max-w-lg mx-auto">
              Our team is available to walk you through the process or answer any questions you have.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/account/orders"
                className="inline-flex items-center gap-2 bg-[#C7CCD1] text-[#0A1F44] px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white transition-colors"
              >
                Go to My Orders
              </Link>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 border border-white text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-white/10 transition-colors"
              >
                Contact Support
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
