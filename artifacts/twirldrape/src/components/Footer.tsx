import React from "react";
import { Link } from "wouter";
import { Instagram, Facebook, Youtube, Twitter } from "lucide-react";

export function Footer() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <footer className="bg-[#1a1a1a] text-[#F4F5F7] pt-16 pb-8 border-t-[4px] border-[#C7CCD1]">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mb-12">
          
          {/* Brand Col */}
          <div className="lg:col-span-1">
            <Link href="/" className="flex flex-col items-start group mb-6">
              <img
                src={`${basePath}/logo.svg`}
                alt="VASTRAA — Paithani & Designer Sarees"
                className="block w-[210px] max-w-full h-auto object-contain object-left bg-white/90 p-2.5 rounded-lg shadow-sm"
              />
              <span className="text-xs tracking-[0.2em] uppercase opacity-80 mt-2">
                Authentic Paithani & Designer
              </span>
            </Link>
            <p className="text-gray-400 text-sm mb-6 max-w-sm leading-relaxed">
              Where Indian royalty meets modern commerce. A premium marketplace for authentic Paithani and designer sarees from trusted artisan vendors across India.
            </p>
            <div className="flex gap-4">
              <a href="https://www.instagram.com/vastraa/" target="_blank" rel="noopener noreferrer" aria-label="VASTRAA on Instagram" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C7CCD1] hover:text-[#0A1F44] transition-colors">
                <Instagram size={18} />
              </a>
              <a href="https://www.facebook.com/vastraa" target="_blank" rel="noopener noreferrer" aria-label="VASTRAA on Facebook" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C7CCD1] hover:text-[#0A1F44] transition-colors">
                <Facebook size={18} />
              </a>
              <a href="https://www.youtube.com/@vastraa" target="_blank" rel="noopener noreferrer" aria-label="VASTRAA on YouTube" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C7CCD1] hover:text-[#0A1F44] transition-colors">
                <Youtube size={18} />
              </a>
              <a href="https://twitter.com/vastraa" target="_blank" rel="noopener noreferrer" aria-label="VASTRAA on X (Twitter)" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C7CCD1] hover:text-[#0A1F44] transition-colors">
                <Twitter size={18} />
              </a>
            </div>
          </div>

          {/* Links 1 */}
          <div>
            <h4 className="font-serif text-lg text-[#C7CCD1] font-semibold mb-6">Shop</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="/paithani" className="hover:text-white transition-colors">Paithani Sarees</Link></li>
              <li><Link href="/designer" className="hover:text-white transition-colors">Designer Sarees</Link></li>
              <li><Link href="/bridal" className="hover:text-white transition-colors">Bridal Collection</Link></li>
              <li><Link href="/party-wear" className="hover:text-white transition-colors">Party Wear</Link></li>
              <li><Link href="/new-arrivals" className="hover:text-white transition-colors">New Arrivals</Link></li>
            </ul>
          </div>

          {/* Links 2 */}
          <div>
            <h4 className="font-serif text-lg text-[#C7CCD1] font-semibold mb-6">Customer Service</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="/account/orders" className="hover:text-white transition-colors">Track Order</Link></li>
              <li><Link href="/returns" className="hover:text-white transition-colors">Returns & Exchanges</Link></li>
              <li><Link href="/shipping-info" className="hover:text-white transition-colors">Shipping Info</Link></li>
              <li><Link href="/size-guide" className="hover:text-white transition-colors">Size Guide</Link></li>
              <li><Link href="/faqs" className="hover:text-white transition-colors">FAQs</Link></li>
            </ul>
          </div>

          {/* Links 3 - Company */}
          <div>
            <h4 className="font-serif text-lg text-[#C7CCD1] font-semibold mb-6">Company</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="/weavers" className="hover:text-white transition-colors">Artisans & Weavers</Link></li>
              <li><Link href="/about" className="hover:text-white transition-colors">About Us</Link></li>
              <li><Link href="/contact" className="hover:text-white transition-colors">Contact Us</Link></li>
            </ul>
          </div>

        </div>

        {/* Bottom */}
        <div className="border-t border-white/10 pt-8 mt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} VASTRAA. All rights reserved.
          </p>
          <div className="flex gap-4 text-xs text-gray-500">
            <Link href="/privacy-policy" className="hover:text-white">Privacy Policy</Link>
            <Link href="/terms-of-service" className="hover:text-white">Terms of Service</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
