import React from "react";
import { Mail } from "lucide-react";

export function NewsletterSection() {
  return (
    <section className="bg-gradient-to-r from-[#7B1C2C] to-[#5a1420] py-16 md:py-24 relative overflow-hidden texture-overlay">
      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-2xl mx-auto text-center">
          <div className="flex justify-center mb-6">
            <Mail className="w-12 h-12 text-[#C9A84C]" />
          </div>
          <h2 className="font-serif text-3xl md:text-4xl lg:text-5xl text-[#FAF6EE] font-bold mb-4">
            Stay Updated With TwirlDrape
          </h2>
          <p className="text-[#E8D5B7] mb-8 text-sm md:text-base">
            Subscribe to our newsletter and be the first to know about exclusive collections, artisan stories, and special offers.
          </p>
          
          <form className="flex flex-col sm:flex-row gap-3 max-w-lg mx-auto" onSubmit={(e) => e.preventDefault()}>
            <input 
              type="email" 
              placeholder="Enter your email address" 
              className="flex-1 bg-white/10 border border-[#C9A84C]/50 text-white placeholder:text-white/60 px-4 py-3 focus:outline-none focus:border-[#C9A84C] rounded-sm"
              required
            />
            <button type="submit" className="bg-[#C9A84C] hover:bg-[#b59539] text-[#7B1C2C] font-bold px-8 py-3 uppercase tracking-wider text-sm transition-colors rounded-sm">
              Subscribe
            </button>
          </form>
        </div>
      </div>
      
      {/* Decorative background elements */}
      <div className="absolute -top-24 -left-24 w-64 h-64 border border-[#C9A84C]/10 rounded-full"></div>
      <div className="absolute -bottom-24 -right-24 w-80 h-80 border border-[#C9A84C]/10 rounded-full"></div>
      {/* Peacock decorative illustration */}
      <div className="absolute right-8 top-1/2 -translate-y-1/2 opacity-15 pointer-events-none hidden lg:block">
        <svg width="180" height="180" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <ellipse cx="24" cy="37" rx="5" ry="7" fill="#C9A84C" />
          <path d="M24 30 Q22 23 23 18" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" />
          <circle cx="23" cy="15.5" r="3.5" fill="#C9A84C" />
          <path d="M21 13 Q18 9 20 7" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M23 12 Q22 8 23 6" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M25 13 Q27 9 26 7" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
          <path d="M24 29 Q14 22 9 18" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 29 Q17 20 15 14" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 29 Q24 19 24 13" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 29 Q31 20 33 14" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
          <path d="M24 29 Q34 22 39 18" stroke="#C9A84C" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="9" cy="17" r="2.5" fill="#C9A84C" />
          <circle cx="15" cy="13" r="2.5" fill="#C9A84C" />
          <circle cx="24" cy="12" r="2.5" fill="#C9A84C" />
          <circle cx="33" cy="13" r="2.5" fill="#C9A84C" />
          <circle cx="39" cy="17" r="2.5" fill="#C9A84C" />
        </svg>
      </div>
    </section>
  );
}
