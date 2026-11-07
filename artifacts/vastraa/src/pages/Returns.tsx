import React from "react";
import { Link } from "wouter";
import {
  RotateCcw,
  CheckCircle2,
  XCircle,
  Truck,
  ShieldCheck,
  Clock,
  ArrowRight,
  MessageCircle,
  FileCheck2,
  Layers,
  Sparkles,
  HelpCircle,
  AlertTriangle,
} from "lucide-react";
import { Layout } from "@/components/Layout";

export default function Returns() {
  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">
        {/* Header Hero */}
        <section className="bg-[#0A1F44] py-16 md:py-24 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#C7CCD1_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="container mx-auto px-4 text-center relative z-10 max-w-4xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 border border-[#C7CCD1]/30 text-[#C7CCD1] text-xs font-bold uppercase tracking-widest mb-4">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Customer Care</span>
            </div>
            <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl text-[#F4F5F7] font-bold mb-4 tracking-tight">
              Customer Care – Returns &amp; Exchanges
            </h1>
            <p className="text-[#E5E8EC] max-w-2xl mx-auto text-base sm:text-lg leading-relaxed font-light">
              We want every purchase to feel right. If something isn't perfect, our returns process is designed to be simple, transparent, and hassle-free.
            </p>
          </div>
        </section>

        {/* Important Business Rule – Product Eligibility Banner */}
        <section className="container mx-auto px-4 -mt-8 relative z-20 max-w-4xl">
          <div className="bg-white rounded-2xl border-2 border-[#0A1F44]/15 p-6 sm:p-8 shadow-xl shadow-[#0A1F44]/5">
            <div className="flex items-start gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-[#0A1F44] text-[#C7CCD1] flex items-center justify-center shrink-0 shadow-md">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]/70">Important Policy Guideline</span>
                <h2 className="font-serif text-xl sm:text-2xl text-[#0A1F44] font-bold">
                  Important Business Rule – Product Eligibility
                </h2>
                <p className="text-sm font-semibold text-[#0A1F44] mt-1">
                  Only default, non-customized products are eligible for return or exchange.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5 pt-5 border-t border-[#C7CCD1]/30">
              <div className="p-4 rounded-xl bg-[#F0FDF4] border border-[#16A34A]/20">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#15803D] flex items-center gap-1.5 mb-2.5">
                  <CheckCircle2 className="w-4 h-4" />
                  Eligible Products
                </h3>
                <ul className="space-y-1.5 text-xs text-[#1E3A2F]">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0" />
                    Standard Paithani sarees.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0" />
                    Standard Designer sarees.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A] shrink-0" />
                    Regular products purchased through VASTRAA.
                  </li>
                </ul>
              </div>

              <div className="p-4 rounded-xl bg-[#FEF2F2] border border-[#DC2626]/20">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#B91C1C] flex items-center gap-1.5 mb-2.5">
                  <XCircle className="w-4 h-4" />
                  Not Eligible Products
                </h3>
                <ul className="space-y-1.5 text-xs text-[#451A1A]">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                    Custom-designed products.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                    Custom-stitched blouses.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                    Personalized products.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                    Altered or customized sarees.
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626] shrink-0" />
                    Products explicitly marked as non-returnable by Admin.
                  </li>
                </ul>
              </div>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 italic">
              Note: Eligibility is strictly enforced by the backend systems before accepting any return or exchange request.
            </p>
          </div>
        </section>

        {/* 7-Day Return & Exchange Policy */}
        <section className="container mx-auto px-4 py-12 max-w-4xl">
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#0A1F44]/5 flex items-center justify-center text-[#0A1F44]">
                <Clock className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-2xl text-[#0A1F44] font-bold">
                7-Day Return &amp; Exchange Policy
              </h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-5">
              Returns and exchanges are accepted within <strong>7 calendar days</strong> from the actual delivery date.
            </p>
            <div className="bg-[#F8F9FA] rounded-xl p-5 border border-[#C7CCD1]/20 mb-5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-3">
                Products must be:
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-700">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0A1F44] shrink-0" />
                  Unused and unwashed.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0A1F44] shrink-0" />
                  In their original condition.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0A1F44] shrink-0" />
                  With original tags and packaging intact.
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0A1F44] shrink-0" />
                  Eligible under VASTRAA's standard product return policy.
                </li>
              </ul>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#0A1F44] bg-[#0A1F44]/5 px-4 py-2.5 rounded-lg">
              <Truck className="w-4 h-4 text-[#0A1F44]" />
              <span>Free pickup is provided for approved return requests.</span>
            </div>
          </div>
        </section>

        {/* Detailed Breakdown: Eligible vs Not Eligible */}
        <section className="container mx-auto px-4 pb-12 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Eligible for Return or Exchange */}
            <div className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-6 sm:p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-gray-100">
                  <CheckCircle2 className="w-6 h-6 text-[#15803D]" />
                  <h3 className="font-serif text-xl font-bold text-[#0A1F44]">
                    Eligible for Return or Exchange
                  </h3>
                </div>
                <ul className="space-y-3.5 text-sm text-gray-700">
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#15803D] mt-1.5 shrink-0" />
                    <span>Item received in a damaged or defective condition.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#15803D] mt-1.5 shrink-0" />
                    <span>Wrong item delivered (different colour, style, or saree than ordered).</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#15803D] mt-1.5 shrink-0" />
                    <span>Item significantly different from the product description or images.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#15803D] mt-1.5 shrink-0" />
                    <span>Unused and standard products under the 7-day return window, including change-of-mind requests.</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-[#15803D] font-medium">
                ✓ Full refund or replacement eligible upon Quality Check pass.
              </div>
            </div>

            {/* Not Eligible for Return or Exchange */}
            <div className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-6 sm:p-8 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-5 pb-4 border-b border-gray-100">
                  <XCircle className="w-6 h-6 text-[#B91C1C]" />
                  <h3 className="font-serif text-xl font-bold text-[#0A1F44]">
                    Not Eligible for Return or Exchange
                  </h3>
                </div>
                <ul className="space-y-3 text-sm text-gray-700">
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Custom-designed or personalized products.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Custom-stitched blouses or altered products.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Products explicitly marked non-returnable.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Items that have been worn, washed, or dry-cleaned.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Sarees without original tags or packaging.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Requests submitted after the 7-day return window.</span>
                  </li>
                  <li className="flex items-start gap-2.5">
                    <span className="w-2 h-2 rounded-full bg-[#B91C1C] mt-1.5 shrink-0" />
                    <span>Products damaged due to misuse or improper storage after delivery.</span>
                  </li>
                </ul>
              </div>
              <div className="mt-6 pt-4 border-t border-gray-100 text-xs text-[#B91C1C] font-medium">
                ✕ Return or exchange claims for these items will be rejected automatically.
              </div>
            </div>
          </div>
        </section>

        {/* How the Return Process Works */}
        <section className="bg-white py-16 border-y border-[#C7CCD1]/20">
          <div className="container mx-auto px-4 max-w-4xl">
            <div className="text-center mb-12">
              <span className="text-xs font-bold uppercase tracking-wider text-[#0A1F44]/70">Step-by-Step Walkthrough</span>
              <h2 className="font-serif text-2xl sm:text-3xl text-[#0A1F44] font-bold mt-1">
                How the Return Process Works
              </h2>
            </div>

            <div className="space-y-6">
              {/* Step 01 */}
              <div className="flex items-start gap-5 bg-[#F8F9FA] rounded-2xl p-6 border border-[#C7CCD1]/20 hover:border-[#0A1F44]/30 transition-all">
                <div className="w-14 h-14 rounded-2xl bg-[#0A1F44] text-[#C7CCD1] text-lg font-serif font-bold flex items-center justify-center shrink-0 shadow-md">
                  01
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">
                    01 – Raise a Return Request
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Go to <strong>My Account → Orders</strong>. Select the delivered order and choose <strong>Request Return</strong>. Select the reason and upload supporting photographs where required.
                  </p>
                </div>
              </div>

              {/* Step 02 */}
              <div className="flex items-start gap-5 bg-[#F8F9FA] rounded-2xl p-6 border border-[#C7CCD1]/20 hover:border-[#0A1F44]/30 transition-all">
                <div className="w-14 h-14 rounded-2xl bg-[#0A1F44] text-[#C7CCD1] text-lg font-serif font-bold flex items-center justify-center shrink-0 shadow-md">
                  02
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">
                    02 – Approval &amp; Pickup
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    The VASTRAA team reviews the request. Once approved, a pickup is arranged and the user receives an email notification with pickup details.
                  </p>
                </div>
              </div>

              {/* Step 03 */}
              <div className="flex items-start gap-5 bg-[#F8F9FA] rounded-2xl p-6 border border-[#C7CCD1]/20 hover:border-[#0A1F44]/30 transition-all">
                <div className="w-14 h-14 rounded-2xl bg-[#0A1F44] text-[#C7CCD1] text-lg font-serif font-bold flex items-center justify-center shrink-0 shadow-md">
                  03
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">
                    03 – Quality Check
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    After receiving the returned product, the team verifies its condition, tags, packaging, and eligibility.
                  </p>
                </div>
              </div>

              {/* Step 04 */}
              <div className="flex items-start gap-5 bg-[#F8F9FA] rounded-2xl p-6 border border-[#C7CCD1]/20 hover:border-[#0A1F44]/30 transition-all">
                <div className="w-14 h-14 rounded-2xl bg-[#0A1F44] text-[#C7CCD1] text-lg font-serif font-bold flex items-center justify-center shrink-0 shadow-md">
                  04
                </div>
                <div>
                  <h3 className="font-serif text-lg font-bold text-[#0A1F44] mb-1">
                    04 – Refund Processed
                  </h3>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    Once the quality check is approved, the refund is initiated according to the original payment method and applicable refund processing timelines.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Exchanges Section */}
        <section className="container mx-auto px-4 py-16 max-w-4xl">
          <div className="bg-white rounded-2xl border border-[#C7CCD1]/30 p-8 shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-[#0A1F44] text-[#C7CCD1] flex items-center justify-center">
                <RotateCcw className="w-5 h-5" />
              </div>
              <h2 className="font-serif text-2xl text-[#0A1F44] font-bold">
                Exchanges
              </h2>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed mb-6">
              VASTRAA supports exchanges for eligible standard products, subject to stock availability.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#C7CCD1]/20">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1">Same-Price Replacement</p>
                <p className="text-xs text-gray-600">No additional payment required.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#C7CCD1]/20">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1">Higher-Price Replacement</p>
                <p className="text-xs text-gray-600">Customer pays the difference.</p>
              </div>
              <div className="p-4 rounded-xl bg-[#F8F9FA] border border-[#C7CCD1]/20">
                <p className="text-xs font-bold uppercase tracking-wider text-[#0A1F44] mb-1">Lower-Price Replacement</p>
                <p className="text-xs text-gray-600">Difference is refunded to customer.</p>
              </div>
            </div>

            <p className="text-xs text-gray-500 italic bg-[#0A1F44]/5 p-3 rounded-lg border border-[#0A1F44]/10">
              Exchange requests must follow the same 7-day eligibility period and product condition requirements.
            </p>
          </div>
        </section>

        {/* Real-Time Action CTA */}
        <section className="bg-[#0A1F44] py-14 text-white">
          <div className="container mx-auto px-4 text-center max-w-2xl">
            <MessageCircle className="w-10 h-10 mx-auto mb-4 text-[#C7CCD1]" />
            <h2 className="font-serif text-2xl sm:text-3xl text-[#F4F5F7] font-bold mb-3">
              Need to Return or Exchange an Item?
            </h2>
            <p className="text-[#E5E8EC] mb-8 text-sm leading-relaxed font-light">
              Submit your request directly from your delivered order list or monitor your active claim in real time.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/account/orders"
                className="inline-flex items-center justify-center gap-2 bg-[#C7CCD1] text-[#0A1F44] px-7 py-3.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white transition-all shadow-md"
              >
                Go to My Account → Orders
              </Link>
              <Link
                href="/account/returns"
                className="inline-flex items-center justify-center gap-2 border border-white/40 text-white px-7 py-3.5 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-white/10 transition-all"
              >
                Track Returns &amp; Exchanges
              </Link>
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
}
