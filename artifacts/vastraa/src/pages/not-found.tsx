import React from "react";
import { Link } from "wouter";
import { Layout } from "@/components/Layout";
import { AlertCircle, ArrowLeft, Home } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex-1 flex items-center justify-center py-16 md:py-24 px-4">
        <div className="max-w-md w-full bg-white rounded-2xl border border-[#C7CCD1]/30 shadow-sm p-8 md:p-10 text-center">
          <div className="w-16 h-16 rounded-full bg-[#0A1F44]/5 border border-[#0A1F44]/10 flex items-center justify-center mx-auto mb-5 text-[#0A1F44]">
            <AlertCircle className="w-8 h-8 text-[#0A1F44]" />
          </div>

          <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-[#D4AF37] mb-2 font-serif">
            Page Not Found • 404
          </p>

          <h1 className="font-serif text-2xl md:text-3xl font-bold text-[#0A1F44] mb-3">
            Lost Your Way?
          </h1>

          <p className="text-gray-500 text-sm leading-relaxed mb-8">
            The page you are looking for might have been moved, removed, or does not exist.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0A1F44] text-white rounded-lg text-xs md:text-sm font-bold uppercase tracking-wider hover:bg-[#2C3E6B] transition-colors shadow-xs"
            >
              <Home size={16} /> Return Home
            </Link>
            <Link
              href="/products"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 border border-[#C7CCD1] text-[#0A1F44] rounded-lg text-xs md:text-sm font-bold uppercase tracking-wider hover:bg-gray-50 transition-colors"
            >
              Explore Sarees
            </Link>
          </div>
        </div>
      </div>
    </Layout>
  );
}

