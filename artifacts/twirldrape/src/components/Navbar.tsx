import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Search, Heart, ShoppingBag, User, Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isDesigner = location.startsWith("/designer");
  const isPaithani = location.startsWith("/paithani");
  const isHome = location === "/";

  // Determine theme based on route
  const themeClasses = isDesigner 
    ? "bg-[#1E2329]/95 text-[#F5EDE0] border-[#C9A84C]/20" 
    : (isPaithani || isHome) 
      ? "bg-[#7B1C2C]/95 text-[#FAF6EE] border-[#C9A84C]/20"
      : "bg-white text-black";

  return (
    <nav className={cn(
      "sticky top-0 w-full z-40 transition-all duration-300 backdrop-blur-md border-b",
      themeClasses,
      isScrolled ? "py-2 shadow-md" : "py-4"
    )}>
      <div className="container mx-auto px-4 lg:px-8">
        <div className="flex items-center justify-between">
          
          {/* Mobile Menu Toggle */}
          <button 
            className="lg:hidden p-2 -ml-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>

          {/* Logo */}
          <Link href="/" className="flex flex-col items-center group">
            <span className="font-serif text-2xl md:text-3xl font-bold tracking-wider text-[#C9A84C] group-hover:opacity-90 transition-opacity">
              TWIRLDRAPE
            </span>
            <span className="text-[0.6rem] md:text-xs tracking-[0.2em] uppercase opacity-80 mt-0.5">
              Authentic Paithani & Designer
            </span>
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-8 text-sm uppercase tracking-wider font-medium">
            <Link href="/" className="hover:text-[#C9A84C] transition-colors">Home</Link>
            <Link href="/paithani" className="hover:text-[#C9A84C] transition-colors">Paithani</Link>
            <Link href="/designer" className="hover:text-[#C9A84C] transition-colors">Designer</Link>
            <Link href="#" className="hover:text-[#C9A84C] transition-colors">Collections</Link>
            <Link href="#" className="hover:text-[#C9A84C] transition-colors">About Us</Link>
          </div>

          {/* Icons */}
          <div className="flex items-center gap-4 md:gap-6">
            <button className="hover:text-[#C9A84C] transition-colors">
              <Search size={20} />
            </button>
            <button className="hover:text-[#C9A84C] transition-colors hidden md:block">
              <User size={20} />
            </button>
            <button className="hover:text-[#C9A84C] transition-colors">
              <Heart size={20} />
            </button>
            <button className="hover:text-[#C9A84C] transition-colors relative">
              <ShoppingBag size={20} />
              <span className="absolute -top-1.5 -right-1.5 bg-[#C9A84C] text-[#7B1C2C] text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                3
              </span>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 w-full bg-[#7B1C2C] border-b border-[#C9A84C]/20 shadow-xl py-4 px-4 flex flex-col gap-4 text-sm uppercase tracking-wider">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link href="/paithani" onClick={() => setMobileMenuOpen(false)}>Paithani Sarees</Link>
            <Link href="/designer" onClick={() => setMobileMenuOpen(false)}>Designer Sarees</Link>
            <Link href="#" onClick={() => setMobileMenuOpen(false)}>Collections</Link>
            <Link href="#" onClick={() => setMobileMenuOpen(false)}>Login / Register</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
