import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation, useRouter } from "wouter";
import { Search, Heart, ShoppingBag, User, Menu, X, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";

export function Navbar() {
  const [location] = useLocation();
  const router = useRouter();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [searchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    if (searchOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  const searchParams = { search: debouncedQuery, limit: 5 };
  const { data: searchResults } = useListProducts(
    searchParams,
    { query: { enabled: debouncedQuery.trim().length >= 2, queryKey: getListProductsQueryKey(searchParams) } }
  );

  const isDesigner = location.startsWith("/designer");
  const isPaithani = location.startsWith("/paithani");
  const isHome = location === "/";

  const themeClasses = isDesigner
    ? "bg-[#1E2329]/95 text-[#F5EDE0] border-[#C9A84C]/20"
    : isHome
      ? "bg-[#FAF6EE]/98 text-[#3D1515] border-[#C9A84C]/30"
      : isPaithani
        ? "bg-[#7B1C2C]/95 text-[#FAF6EE] border-[#C9A84C]/20"
        : "bg-[#7B1C2C]/95 text-[#FAF6EE] border-[#C9A84C]/20";

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      const category = isDesigner ? "designer" : "paithani";
      const path = isDesigner ? "/designer/shop" : "/paithani/shop";
      setSearchOpen(false);
      setSearchQuery("");
      window.location.href = `${path}?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  }

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
          <Link href="/" className="flex items-center gap-2 group">
            <svg width="32" height="32" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-none group-hover:opacity-90 transition-opacity">
              <ellipse cx="24" cy="37" rx="5" ry="7" fill="#C9A84C" />
              <path d="M24 30 Q22 23 23 18" stroke="#C9A84C" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="23" cy="15.5" r="3.5" fill="#C9A84C" />
              <path d="M21 13 Q18 9 20 7" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M23 12 Q22 8 23 6" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M25 13 Q27 9 26 7" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" />
              <path d="M24 29 Q14 22 9 18" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
              <path d="M24 29 Q17 20 15 14" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
              <path d="M24 29 Q24 19 24 13" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
              <path d="M24 29 Q31 20 33 14" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
              <path d="M24 29 Q34 22 39 18" stroke="#C9A84C" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
              <circle cx="9" cy="17" r="2" fill="#C9A84C" opacity="0.6" />
              <circle cx="15" cy="13" r="2" fill="#C9A84C" opacity="0.6" />
              <circle cx="24" cy="12" r="2" fill="#C9A84C" opacity="0.6" />
              <circle cx="33" cy="13" r="2" fill="#C9A84C" opacity="0.6" />
              <circle cx="39" cy="17" r="2" fill="#C9A84C" opacity="0.6" />
            </svg>
            <div className="flex flex-col">
              <span className="font-serif text-2xl md:text-3xl font-bold tracking-wider text-[#C9A84C] group-hover:opacity-90 transition-opacity leading-none">
                TWIRLDRAPE
              </span>
              <span className="text-[0.6rem] md:text-xs tracking-[0.2em] uppercase opacity-80 mt-0.5">
                Authentic Paithani & Designer
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-5 text-xs uppercase tracking-wider font-medium">
            <Link href="/" className="hover:text-[#C9A84C] transition-colors">Home</Link>
            <div className="group relative">
              <Link href="/paithani" className="hover:text-[#C9A84C] transition-colors">Paithani Sarees</Link>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 hidden group-hover:block">
                <div className="bg-white text-gray-800 shadow-xl border border-gray-100 rounded-md py-2 w-44 text-xs">
                  <Link href="/paithani" className="block px-4 py-2 hover:bg-[#FAF6EE] hover:text-[#7B1C2C] transition-colors">
                    Paithani Landing
                  </Link>
                  <Link href="/paithani/shop" className="block px-4 py-2 hover:bg-[#FAF6EE] hover:text-[#7B1C2C] transition-colors">
                    Shop All Paithani
                  </Link>
                </div>
              </div>
            </div>
            <div className="group relative">
              <Link href="/designer" className="hover:text-[#C9A84C] transition-colors">Designer Sarees</Link>
              <div className="absolute top-full left-1/2 -translate-x-1/2 pt-3 hidden group-hover:block">
                <div className="bg-white text-gray-800 shadow-xl border border-gray-100 rounded-md py-2 w-44 text-xs">
                  <Link href="/designer" className="block px-4 py-2 hover:bg-[#1E2329] hover:text-[#C9A84C] transition-colors">
                    Designer Landing
                  </Link>
                  <Link href="/designer/shop" className="block px-4 py-2 hover:bg-[#1E2329] hover:text-[#C9A84C] transition-colors">
                    Shop All Designer
                  </Link>
                </div>
              </div>
            </div>
            <Link href="/paithani/shop" className="hover:text-[#C9A84C] transition-colors">Collections</Link>
            <Link href="/paithani/shop" className="hover:text-[#C9A84C] transition-colors">New Arrivals</Link>
            <Link href="#" className="hover:text-[#C9A84C] transition-colors">About Us</Link>
            <Link href="#" className="hover:text-[#C9A84C] transition-colors">Contact</Link>
          </div>

          {/* Icons */}
          <div className="flex items-center gap-4 md:gap-6">
            <div ref={searchContainerRef} className="relative">
              <button
                className="hover:text-[#C9A84C] transition-colors"
                onClick={() => setSearchOpen(!searchOpen)}
              >
                <Search size={20} />
              </button>

              {/* Search Dropdown */}
              {searchOpen && (
                <div className="absolute right-0 top-full mt-3 w-80 bg-white rounded-lg shadow-2xl border border-gray-100 overflow-hidden z-50">
                  <form onSubmit={handleSearchSubmit} className="p-3 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <Search size={16} className="text-gray-400 shrink-0" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search sarees, fabrics, occasions…"
                        className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          onClick={() => setSearchQuery("")}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </form>

                  {debouncedQuery.trim().length >= 2 && (
                    <div className="max-h-72 overflow-y-auto">
                      {searchResults?.products && searchResults.products.length > 0 ? (
                        <>
                          {searchResults.products.map((product) => (
                            <Link
                              key={product.id}
                              href={`/products/${product.id}`}
                              onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                              className="flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors"
                            >
                              <img
                                src={product.images[0] ?? "/images/product-1.png"}
                                alt={product.name}
                                className="w-10 h-10 rounded object-cover shrink-0 border border-gray-100"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-800 font-medium line-clamp-1">{product.name}</p>
                                <p className="text-xs text-gray-500">{product.vendorName} · ₹{product.price.toLocaleString("en-IN")}</p>
                              </div>
                            </Link>
                          ))}
                          <button
                            onClick={handleSearchSubmit as any}
                            className="w-full flex items-center justify-center gap-2 p-3 text-xs font-bold text-[#7B1C2C] bg-[#FAF6EE] hover:bg-[#F5EDE0] transition-colors border-t border-gray-100"
                          >
                            View all results for "{debouncedQuery}" <ArrowRight size={12} />
                          </button>
                        </>
                      ) : (
                        <div className="p-6 text-center text-sm text-gray-400">
                          No results found for "{debouncedQuery}"
                        </div>
                      )}
                    </div>
                  )}

                  {debouncedQuery.trim().length < 2 && (
                    <div className="p-4">
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Links</p>
                      <div className="space-y-2">
                        <Link href="/paithani/shop" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#7B1C2C] transition-colors">
                          <ArrowRight size={12} /> All Paithani Sarees
                        </Link>
                        <Link href="/designer/shop" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#7B1C2C] transition-colors">
                          <ArrowRight size={12} /> All Designer Sarees
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

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
          <div className="lg:hidden absolute top-full left-0 w-full bg-[#7B1C2C] border-b border-[#C9A84C]/20 shadow-xl py-4 px-4 flex flex-col gap-4 text-sm uppercase tracking-wider text-[#FAF6EE]">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link href="/paithani" onClick={() => setMobileMenuOpen(false)}>Paithani Sarees</Link>
            <Link href="/designer" onClick={() => setMobileMenuOpen(false)}>Designer Sarees</Link>
            <Link href="/paithani/shop" onClick={() => setMobileMenuOpen(false)}>Collections</Link>
            <Link href="/paithani/shop" onClick={() => setMobileMenuOpen(false)}>New Arrivals</Link>
            <Link href="#" onClick={() => setMobileMenuOpen(false)}>About Us</Link>
            <Link href="#" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
          </div>
        )}
      </div>
    </nav>
  );
}
