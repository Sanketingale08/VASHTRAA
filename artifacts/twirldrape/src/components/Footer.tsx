import React from "react";
import { Link } from "wouter";
import { Instagram, Facebook, Youtube, Twitter, MapPin, Phone, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#1a1a1a] text-[#F3F8F5] pt-16 pb-8 border-t-[4px] border-[#C9A84C]">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 mb-12">
          
          {/* Brand Col */}
          <div className="lg:col-span-2">
            <Link href="/" className="flex flex-col items-start group mb-6">
              <span className="font-serif text-3xl font-bold tracking-wider text-[#C9A84C]">
                TWIRLDRAPE
              </span>
              <span className="text-xs tracking-[0.2em] uppercase opacity-80 mt-1">
                Authentic Paithani & Designer
              </span>
            </Link>
            <p className="text-gray-400 text-sm mb-6 max-w-sm leading-relaxed">
              Where Indian royalty meets modern commerce. A premium marketplace for authentic Paithani and designer sarees from trusted artisan vendors across India.
            </p>
            <div className="flex gap-4">
              <a href="https://www.instagram.com/twirldrape/" target="_blank" rel="noopener noreferrer" aria-label="TwirlDrape on Instagram" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C9A84C] hover:text-[#1E6B5A] transition-colors">
                <Instagram size={18} />
              </a>
              <a href="https://www.facebook.com/twirldrape" target="_blank" rel="noopener noreferrer" aria-label="TwirlDrape on Facebook" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C9A84C] hover:text-[#1E6B5A] transition-colors">
                <Facebook size={18} />
              </a>
              <a href="https://www.youtube.com/@twirldrape" target="_blank" rel="noopener noreferrer" aria-label="TwirlDrape on YouTube" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C9A84C] hover:text-[#1E6B5A] transition-colors">
                <Youtube size={18} />
              </a>
              <a href="https://twitter.com/twirldrape" target="_blank" rel="noopener noreferrer" aria-label="TwirlDrape on X (Twitter)" className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center hover:bg-[#C9A84C] hover:text-[#1E6B5A] transition-colors">
                <Twitter size={18} />
              </a>
            </div>
          </div>

          {/* Links 1 */}
          <div>
            <h4 className="font-serif text-lg text-[#C9A84C] font-semibold mb-6">Shop</h4>
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
            <h4 className="font-serif text-lg text-[#C9A84C] font-semibold mb-6">Customer Service</h4>
            <ul className="space-y-3 text-sm text-gray-400">
              <li><Link href="/account/orders" className="hover:text-white transition-colors">Track Order</Link></li>
              <li><Link href="/returns" className="hover:text-white transition-colors">Returns & Exchanges</Link></li>
              <li><Link href="/shipping-info" className="hover:text-white transition-colors">Shipping Info</Link></li>
              <li><Link href="/size-guide" className="hover:text-white transition-colors">Size Guide</Link></li>
              <li><Link href="/faqs" className="hover:text-white transition-colors">FAQs</Link></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-serif text-lg text-[#C9A84C] font-semibold mb-6">Contact Us</h4>
            <ul className="space-y-4 text-sm text-gray-400">
              <li className="flex items-start gap-3">
                <MapPin size={18} className="text-[#C9A84C] shrink-0 mt-0.5" />
                <span>123 Silk Route, Colaba, Mumbai 400005, India</span>
              </li>
              <li className="flex items-center gap-3">
                <Phone size={18} className="text-[#C9A84C] shrink-0" />
                <span>+91 98765 43210</span>
              </li>
              <li className="flex items-center gap-3">
                <Mail size={18} className="text-[#C9A84C] shrink-0" />
                <span>support@twirldrape.com</span>
              </li>
            </ul>
          </div>

        </div>

        {/* Bottom */}
        <div className="border-t border-white/10 pt-8 mt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-gray-500">
            &copy; {new Date().getFullYear()} TwirlDrape. All rights reserved.
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
