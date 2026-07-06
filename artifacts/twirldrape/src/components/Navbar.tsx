import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, Heart, ShoppingBag, User, Menu, X, ArrowRight, LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { useUser, useClerk, Show } from "@clerk/react";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const { user, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const { wishlistedIds } = useWishlist();

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

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

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
      const path = isDesigner ? "/designer/shop" : "/paithani/shop";
      setSearchOpen(false);
      setSearchQuery("");
      window.location.href = `${basePath}${path}?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  }

  const { totalItems: cartCount, openDrawer: openCart } = useCart();
  const wishlistCount = wishlistedIds.size;

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
          <Link href="/" className="flex items-center group">
            <img
              src="/images/logo.png"
              alt="TwirlDrape"
              className="w-28 md:w-36 h-auto object-contain group-hover:opacity-90 transition-opacity"
            />
          </Link>

          {/* Desktop Links */}
          <div className="hidden lg:flex items-center gap-5 text-xs uppercase tracking-wider font-medium">
            <Link href="/" className="hover:text-[#C9A84C] transition-colors">Home</Link>
            <Link href="/collections" className="hover:text-[#C9A84C] transition-colors">Collections</Link>
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

            {/* User Menu */}
            <div ref={userMenuRef} className="relative hidden md:block">
              <Show when="signed-out">
                <Link
                  href="/sign-in"
                  className="hover:text-[#C9A84C] transition-colors"
                  title="Sign In"
                >
                  <User size={20} />
                </Link>
              </Show>
              <Show when="signed-in">
                <button
                  className="hover:text-[#C9A84C] transition-colors flex items-center gap-1"
                  onClick={() => setUserMenuOpen(!userMenuOpen)}
                  title={user?.firstName ?? "Account"}
                >
                  <User size={20} />
                </button>
                {userMenuOpen && (
                  <div className="absolute right-0 top-full mt-3 w-52 bg-white text-gray-800 shadow-xl border border-gray-100 rounded-md py-2 z-50">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-[#7B1C2C] truncate">
                        {user?.firstName} {user?.lastName}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {user?.primaryEmailAddress?.emailAddress}
                      </p>
                    </div>
                    <Link
                      href="/wishlist"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-2 text-sm hover:bg-[#FAF6EE] hover:text-[#7B1C2C] transition-colors"
                    >
                      <Heart size={14} /> My Wishlist
                      {wishlistCount > 0 && (
                        <span className="ml-auto text-xs bg-[#7B1C2C] text-white rounded-full w-5 h-5 flex items-center justify-center">
                          {wishlistCount}
                        </span>
                      )}
                    </Link>
                    <button
                      onClick={() => {
                        setUserMenuOpen(false);
                        signOut({ redirectUrl: basePath || "/" });
                      }}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-[#FAF6EE] hover:text-[#7B1C2C] transition-colors"
                    >
                      <LogOut size={14} /> Sign Out
                    </button>
                  </div>
                )}
              </Show>
            </div>

            {/* Wishlist Icon */}
            <Link href="/wishlist" className="hover:text-[#C9A84C] transition-colors relative">
              <Heart size={20} />
              {wishlistCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#C9A84C] text-[#7B1C2C] text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                  {wishlistCount > 9 ? "9+" : wishlistCount}
                </span>
              )}
            </Link>

            <button
              onClick={openCart}
              className="hover:text-[#C9A84C] transition-colors relative"
              title="Shopping Cart"
            >
              <ShoppingBag size={20} />
              {cartCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-[#C9A84C] text-[#7B1C2C] text-[10px] font-bold h-4 w-4 rounded-full flex items-center justify-center">
                  {cartCount > 9 ? "9+" : cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden absolute top-full left-0 w-full bg-[#7B1C2C] border-b border-[#C9A84C]/20 shadow-xl py-4 px-4 flex flex-col gap-4 text-sm uppercase tracking-wider text-[#FAF6EE] z-50">
            <Link href="/" onClick={() => setMobileMenuOpen(false)}>Home</Link>
            <Link href="/collections" onClick={() => setMobileMenuOpen(false)}>Collections</Link>
            <Link href="/paithani/shop" onClick={() => setMobileMenuOpen(false)}>New Arrivals</Link>
            <Link href="#" onClick={() => setMobileMenuOpen(false)}>About Us</Link>
            <Link href="#" onClick={() => setMobileMenuOpen(false)}>Contact</Link>
            <Link href="/wishlist" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2">
              <Heart size={14} /> My Wishlist
              {wishlistCount > 0 && <span className="ml-1 text-xs">({wishlistCount})</span>}
            </Link>
            <Show when="signed-out">
              <Link href="/sign-in" onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-2">
                <LogIn size={14} /> Sign In
              </Link>
            </Show>
            <Show when="signed-in">
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  signOut({ redirectUrl: basePath || "/" });
                }}
                className="flex items-center gap-2 text-left"
              >
                <LogOut size={14} /> Sign Out
              </button>
            </Show>
          </div>
        )}
      </div>
    </nav>
  );
}
