import React, { useState } from "react";
import { Link } from "wouter";
import { Ruler, Info, MessageCircle } from "lucide-react";
import { Layout } from "@/components/Layout";

const GOLD = "#C7CCD1";
const GREEN = "#0A1F44";

const SAREE_LENGTHS = [
  { type: "Standard Saree", length: "5.5 metres", note: "Suits most heights; blouse piece not included." },
  { type: "Saree with Blouse Piece", length: "5.5 + 0.8 m", note: "0.8 m blouse piece included in the drape length quoted." },
  { type: "Grand/Wedding Saree", length: "6.0–6.5 metres", note: "Extra length for heavier draping styles." },
  { type: "Half Saree / Langa Voni", length: "3.0 metres", note: "Typically worn by younger girls; paired with skirt and blouse." },
];

const BLOUSE_SIZES = [
  { size: "XS", bust: "30–32 in / 76–81 cm", back: "28–30 in / 71–76 cm" },
  { size: "S", bust: "32–34 in / 81–86 cm", back: "30–32 in / 76–81 cm" },
  { size: "M", bust: "34–36 in / 86–91 cm", back: "32–34 in / 81–86 cm" },
  { size: "L", bust: "36–38 in / 91–97 cm", back: "34–36 in / 86–91 cm" },
  { size: "XL", bust: "38–40 in / 97–102 cm", back: "36–38 in / 91–97 cm" },
  { size: "XXL", bust: "40–42 in / 102–107 cm", back: "38–40 in / 97–102 cm" },
];

const DRAPING_STYLES = [
  { style: "Nivi Drape", region: "Andhra Pradesh / Pan India", extra: "Standard 5.5 m saree works well." },
  { style: "Maharashtrian / Nauvari", region: "Maharashtra", extra: "Requires 9-yard saree; listed separately on product pages." },
  { style: "Bengali Drape", region: "West Bengal", extra: "Standard 5.5–6 m saree; no pin required, pure pleating." },
  { style: "Kodagu Drape", region: "Karnataka (Coorg)", extra: "6 m recommended; pleats fall at back." },
  { style: "Gujarati Drape", region: "Gujarat", extra: "Pallu pinned at front; standard 5.5 m saree." },
];

const TIPS = [
  "Always measure over the clothes you'll typically wear the blouse with.",
  "Use a soft measuring tape and keep it parallel to the floor.",
  "If you're between two sizes in blouse measurements, size up — silk and cotton have minimal stretch.",
  "For custom blouses, share your measurements with your tailor; a standard blouse piece of 0.8 m is included with most sarees.",
  "Heights above 5'7\" may prefer a 6-metre saree for a fuller pallu drape.",
];

export default function SizeGuide() {
  return (
    <Layout>
      <div className="bg-[#F4F5F7] min-h-screen">

        {/* Hero */}
        <section className="bg-[#0A1F44] py-16 md:py-24">
          <div className="container mx-auto px-4 text-center">
            <p className="text-[#C7CCD1] uppercase tracking-[0.3em] text-xs font-bold mb-4">Fit Guide</p>
            <h1 className="font-serif text-4xl md:text-5xl text-[#F4F5F7] font-bold mb-4">
              Size Guide
            </h1>
            <p className="text-[#E5E8EC] max-w-xl mx-auto text-base leading-relaxed">
              Everything you need to choose the right saree length, blouse size, and draping style for your measurements and occasion.
            </p>
          </div>
        </section>

        <div className="container mx-auto px-4 py-14 md:py-20 max-w-4xl space-y-16">

          {/* Saree Lengths */}
          <section>
            <div className="flex items-center gap-3 mb-6">
              <Ruler className="w-6 h-6 shrink-0" style={{ color: GREEN }} />
              <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold">Saree Lengths</h2>
            </div>
            <div className="overflow-x-auto rounded-2xl border border-[#C7CCD1]/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0A1F44] text-[#F4F5F7]">
                    <th className="text-left px-5 py-3 font-semibold">Saree Type</th>
                    <th className="text-left px-5 py-3 font-semibold">Length</th>
                    <th className="text-left px-5 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {SAREE_LENGTHS.map((row, i) => (
                    <tr key={row.type} className={i % 2 === 0 ? "bg-white" : "bg-[#F4F5F7]"}>
                      <td className="px-5 py-3 font-medium text-[#0A1F44]">{row.type}</td>
                      <td className="px-5 py-3 text-[#0A1F44] font-semibold">{row.length}</td>
                      <td className="px-5 py-3 text-[#7a5f4e]">{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Blouse Sizes */}
          <section>
            <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold mb-6">Blouse Size Chart</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#C7CCD1]/20 mb-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0A1F44] text-[#F4F5F7]">
                    <th className="text-left px-5 py-3 font-semibold">Size</th>
                    <th className="text-left px-5 py-3 font-semibold">Bust (chest)</th>
                    <th className="text-left px-5 py-3 font-semibold">Back Width</th>
                  </tr>
                </thead>
                <tbody>
                  {BLOUSE_SIZES.map((row, i) => (
                    <tr key={row.size} className={i % 2 === 0 ? "bg-white" : "bg-[#F4F5F7]"}>
                      <td className="px-5 py-3 font-bold text-[#0A1F44]">{row.size}</td>
                      <td className="px-5 py-3 text-[#0A1F44]">{row.bust}</td>
                      <td className="px-5 py-3 text-[#0A1F44]">{row.back}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-start gap-3 bg-[#C7CCD1]/10 rounded-xl p-4 border border-[#C7CCD1]/30">
              <Info size={16} className="shrink-0 mt-0.5" style={{ color: GOLD }} />
              <p className="text-xs text-[#7a5f4e]">
                Blouse piece is unstitched — measurements above are for stitching guidance only. We recommend
                getting your blouse stitched by a local tailor using your exact measurements.
              </p>
            </div>
          </section>

          {/* Draping Styles */}
          <section>
            <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold mb-6">Draping Styles by Region</h2>
            <div className="overflow-x-auto rounded-2xl border border-[#C7CCD1]/20">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0A1F44] text-[#F4F5F7]">
                    <th className="text-left px-5 py-3 font-semibold">Style</th>
                    <th className="text-left px-5 py-3 font-semibold">Region</th>
                    <th className="text-left px-5 py-3 font-semibold">Length Needed</th>
                  </tr>
                </thead>
                <tbody>
                  {DRAPING_STYLES.map((row, i) => (
                    <tr key={row.style} className={i % 2 === 0 ? "bg-white" : "bg-[#F4F5F7]"}>
                      <td className="px-5 py-3 font-medium text-[#0A1F44]">{row.style}</td>
                      <td className="px-5 py-3 text-[#7a5f4e]">{row.region}</td>
                      <td className="px-5 py-3 text-[#0A1F44]">{row.extra}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Tips */}
          <section>
            <h2 className="font-serif text-xl md:text-2xl text-[#0A1F44] font-bold mb-6">Measurement Tips</h2>
            <ul className="space-y-3">
              {TIPS.map((tip, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="w-6 h-6 rounded-full bg-[#0A1F44] text-white text-xs flex items-center justify-center shrink-0 mt-0.5 font-bold">
                    {i + 1}
                  </span>
                  <p className="text-sm text-[#7a5f4e] leading-relaxed">{tip}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* CTA */}
        <section className="bg-[#E5E8EC] py-12">
          <div className="container mx-auto px-4 text-center">
            <MessageCircle className="w-8 h-8 mx-auto mb-4" style={{ color: GOLD }} />
            <h2 className="font-serif text-xl text-[#0A1F44] font-bold mb-3">Need help with sizing?</h2>
            <p className="text-[#7a5f4e] mb-6 text-sm">Our team can advise on the best saree length and style for your height and occasion.</p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-8 py-4 rounded-sm text-sm font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors"
            >
              Ask Us
            </Link>
          </div>
        </section>
      </div>
    </Layout>
  );
}
