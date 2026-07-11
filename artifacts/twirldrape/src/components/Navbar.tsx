import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, Heart, ShoppingBag, User, Menu, X, ArrowRight, LogIn, LogOut, ClipboardList, LayoutDashboard, Store, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useListProducts, getListProductsQueryKey } from "@workspace/api-client-react";
import { useUser, useClerk, Show } from "@clerk/react";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { NotificationBell } from "@/components/NotificationBell";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [collectionsDropdownOpen, setCollectionsDropdownOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const collectionsDropdownRef = useRef<HTMLDivElement>(null);

  const { user } = useUser();
  const { signOut } = useClerk();
  const { wishlistedIds } = useWishlist();
  const { totalItems: cartCount, openDrawer: openCart } = useCart();
  const wishlistCount = wishlistedIds.size;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    if (searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
  }, [searchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    if (searchOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [searchOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (collectionsDropdownRef.current && !collectionsDropdownRef.current.contains(e.target as Node)) {
        setCollectionsDropdownOpen(false);
      }
    };
    if (collectionsDropdownOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [collectionsDropdownOpen]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const searchParams = { search: debouncedQuery, limit: 6 };
  const { data: searchResults } = useListProducts(
    searchParams,
    { query: { enabled: debouncedQuery.trim().length >= 2, queryKey: getListProductsQueryKey(searchParams) } }
  );

  const isDesigner = location.startsWith("/designer");
  const isPaithani = location.startsWith("/paithani");
  const isHome = location === "/";
  // Pages that share the Landing Page's light ivory header:
  // Home, Collections, New Arrivals (/paithani), About Us, Contact
  const isLightHeader = isHome || location.startsWith("/collections") || isPaithani || location.startsWith("/contact") || location.startsWith("/new-arrivals") || location.startsWith("/about");
  const isDark = !isLightHeader && !isDesigner;
  const isDesignerDark = isDesigner;

  const navBg = isDesignerDark
    ? "bg-[#1E2329]/97 text-[#E6F0EA] border-[#C9A84C]/20"
    : isDark
      ? "bg-[#1E6B5A]/97 text-[#F3F8F5] border-[#C9A84C]/20"
      : "bg-[#F3F8F5]/98 text-[#3D1515] border-[#C9A84C]/30";

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/collections", label: "Collections" },
    { href: "/new-arrivals", label: "New Arrivals" },
    { href: "/about", label: "About Us" },
    { href: "/contact", label: "Contact" },
  ];

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      const path = isDesigner ? "/designer/shop" : "/paithani/shop";
      setSearchOpen(false);
      setSearchQuery("");
      window.location.href = `${basePath}${path}?search=${encodeURIComponent(searchQuery.trim())}`;
    }
  }

  return (
    <>
      {/* ── Main navbar ──────────────────────────────────────────────── */}
      <nav className={cn(
        "sticky top-0 w-full z-40 transition-all duration-300 backdrop-blur-md border-b",
        navBg,
        isScrolled ? "shadow-lg" : ""
      )}>
        <div className="container mx-auto px-4 lg:px-8">
          <div className="flex items-center h-[76px] md:h-[96px] gap-4">

            {/* ── Mobile hamburger ── */}
            <button
              className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md hover:bg-white/10 transition-colors shrink-0"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            {/* ── Logo (left-anchored, fixed width so nav stays centred) ── */}
            <Link href="/" className="shrink-0 flex items-center group mr-auto lg:mr-0">
              <img
                src="/images/logo.png"
                alt="TwirlDrape"
                className="w-[160px] md:w-[200px] lg:w-[220px] h-auto object-contain group-hover:opacity-90 transition-opacity"
              />
            </Link>

            {/* ── Desktop nav (centred) ── */}
            <div className="hidden lg:flex flex-1 items-center justify-center gap-1">
              {navLinks.map(({ href, label }) => {
                if (label === "Collections") {
                  const active = location.startsWith("/collections") || location.startsWith("/bridal") || location.startsWith("/party-wear");
                  return (
                    <div key={label} ref={collectionsDropdownRef} className="relative">
                      <button
                        onClick={() => setCollectionsDropdownOpen(!collectionsDropdownOpen)}
                        className={cn(
                          "relative flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors rounded-sm",
                          active
                            ? "text-[#C9A84C]"
                            : isDark || isDesignerDark
                              ? "text-[#F3F8F5]/80 hover:text-[#C9A84C]"
                              : "text-[#3D1515]/75 hover:text-[#1E6B5A]",
                          "after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[#C9A84C] after:rounded-full after:transition-opacity",
                          active ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-40"
                        )}
                      >
                        {label}
                        <ChevronDown size={11} className={cn("transition-transform", collectionsDropdownOpen ? "rotate-180" : "")} />
                      </button>
                      {collectionsDropdownOpen && (
                        <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 w-52 bg-white text-gray-800 shadow-2xl border border-gray-100 rounded-xl py-1.5 z-50">
                          <Link
                            href="/collections"
                            onClick={() => setCollectionsDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                          >
                            All Collections
                          </Link>
                          <div className="border-t border-gray-100 my-1" />
                          <Link
                            href="/bridal"
                            onClick={() => setCollectionsDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                          >
                            Bridal Collection
                          </Link>
                          <Link
                            href="/party-wear"
                            onClick={() => setCollectionsDropdownOpen(false)}
                            className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                          >
                            Party Wear
                          </Link>
                        </div>
                      )}
                    </div>
                  );
                }
                const active =
                  href === "/" ? location === "/" : location.startsWith(href) && href !== "#";
                return (
                  <Link
                    key={label}
                    href={href}
                    className={cn(
                      "relative px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors rounded-sm",
                      active
                        ? "text-[#C9A84C]"
                        : isDark || isDesignerDark
                          ? "text-[#F3F8F5]/80 hover:text-[#C9A84C]"
                          : "text-[#3D1515]/75 hover:text-[#1E6B5A]",
                      "after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[#C9A84C] after:rounded-full after:transition-opacity",
                      active ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-40"
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* ── Action icons (right-anchored) ── */}
            {/* Order: Search | Notifications | Wishlist | Cart | My Account */}
            <div className="flex items-center gap-1 sm:gap-2 ml-auto lg:ml-0 lg:w-52 xl:w-60 justify-end">

              {/* Search */}
              <div ref={searchContainerRef} className="relative">
                <button
                  className={cn(
                    "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                    isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#1E6B5A]/10"
                  )}
                  onClick={() => setSearchOpen(!searchOpen)}
                  aria-label="Search"
                >
                  <Search size={19} />
                </button>

                {searchOpen && (
                  <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50">
                    <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 px-4 py-3 border-b border-gray-100">
                      <Search size={15} className="text-gray-400 shrink-0" />
                      <input
                        ref={searchInputRef}
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search sarees, fabrics, occasions…"
                        className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent"
                      />
                      {searchQuery && (
                        <button type="button" onClick={() => setSearchQuery("")} className="text-gray-400 hover:text-gray-600">
                          <X size={14} />
                        </button>
                      )}
                    </form>

                    {debouncedQuery.trim().length >= 2 ? (
                      <div className="max-h-72 overflow-y-auto">
                        {searchResults?.products && searchResults.products.length > 0 ? (
                          <>
                            {searchResults.products.map((product) => (
                              <Link
                                key={product.id}
                                href={`/products/${product.id}`}
                                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                              >
                                <img
                                  src={product.images[0] ?? "/images/product-1.png"}
                                  alt={product.name}
                                  className="w-10 h-10 rounded-md object-cover shrink-0 border border-gray-100"
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-gray-800 font-medium line-clamp-1">{product.name}</p>
                                  <p className="text-xs text-gray-500">{product.vendorName} · ₹{product.price.toLocaleString("en-IN")}</p>
                                </div>
                              </Link>
                            ))}
                            <button
                              onClick={handleSearchSubmit as any}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-[#1E6B5A] bg-[#F3F8F5] hover:bg-[#E6F0EA] transition-colors border-t border-gray-100"
                            >
                              View all results for "{debouncedQuery}" <ArrowRight size={12} />
                            </button>
                          </>
                        ) : (
                          <div className="px-4 py-8 text-center text-sm text-gray-400">
                            No results found for "{debouncedQuery}"
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Quick Links</p>
                        <div className="space-y-2">
                          <Link href="/paithani/shop" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#1E6B5A] transition-colors py-1">
                            <ArrowRight size={12} className="text-[#C9A84C]" /> All Paithani Sarees
                          </Link>
                          <Link href="/designer/shop" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#1E6B5A] transition-colors py-1">
                            <ArrowRight size={12} className="text-[#C9A84C]" /> All Designer Sarees
                          </Link>
                          <Link href="/collections" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-sm text-gray-600 hover:text-[#1E6B5A] transition-colors py-1">
                            <ArrowRight size={12} className="text-[#C9A84C]" /> Collections
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Notifications (signed-in only) */}
              <NotificationBell isDark={isDark || isDesignerDark} />

              {/* Wishlist */}
              <Link
                href="/wishlist"
                className={cn(
                  "relative flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                  isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#1E6B5A]/10"
                )}
                aria-label="Wishlist"
              >
                <Heart size={19} />
                {wishlistCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-[#C9A84C] text-[#1E6B5A] text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none">
                    {wishlistCount > 9 ? "9+" : wishlistCount}
                  </span>
                )}
              </Link>

              {/* Cart */}
              <button
                onClick={openCart}
                className={cn(
                  "relative flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                  isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#1E6B5A]/10"
                )}
                aria-label="Cart"
              >
                <ShoppingBag size={19} />
                {cartCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-[#C9A84C] text-[#1E6B5A] text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>

              {/* My Account — extreme right corner (hidden on xs) */}
              <div ref={userMenuRef} className="relative hidden sm:block">
                <Show when="signed-out">
                  <div className="flex items-center gap-1">
                    <Link
                      href="/seller/register"
                      className={cn(
                        "hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors border",
                        isDark || isDesignerDark
                          ? "border-[#C9A84C]/40 text-[#C9A84C] hover:bg-white/10"
                          : "border-[#C9A84C]/50 text-[#1E6B5A] hover:bg-[#C9A84C]/10"
                      )}
                    >
                      <Store size={11} /> Sell
                    </Link>
                    <Link
                      href="/sign-in"
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                        isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#1E6B5A]/10"
                      )}
                      title="Sign In"
                    >
                      <User size={19} />
                    </Link>
                  </div>
                </Show>
                <Show when="signed-in">
                  <button
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-full transition-all border-2",
                      userMenuOpen
                        ? "border-[#C9A84C]"
                        : isDark || isDesignerDark
                        ? "border-white/20 hover:border-white/50"
                        : "border-[#C9A84C]/30 hover:border-[#C9A84C]",
                    )}
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    title={user?.firstName ?? "Account"}
                  >
                    {user?.imageUrl ? (
                      <img
                        src={user.imageUrl}
                        alt=""
                        className="w-full h-full rounded-full object-cover"
                      />
                    ) : (
                      <span className={cn(
                        "text-[11px] font-bold",
                        isDark || isDesignerDark ? "text-[#F3F8F5]" : "text-[#1E6B5A]",
                      )}>
                        {[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || <User size={15} />}
                      </span>
                    )}
                  </button>
                  {userMenuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white text-gray-800 shadow-2xl border border-gray-100 rounded-xl py-2 z-50">
                      <div className="px-4 py-3 border-b border-gray-100">
                        <p className="text-sm font-semibold text-[#1E6B5A] truncate">
                          {user?.firstName} {user?.lastName}
                        </p>
                        <p className="text-xs text-gray-400 truncate mt-0.5">
                          {user?.primaryEmailAddress?.emailAddress}
                        </p>
                      </div>
                      <Link
                        href="/account"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors font-medium"
                      >
                        <LayoutDashboard size={14} className="text-[#C9A84C]" /> My Account
                      </Link>
                      <Link
                        href="/orders"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                      >
                        <ClipboardList size={14} className="text-[#C9A84C]" /> My Orders
                      </Link>
                      <Link
                        href="/seller/dashboard"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                      >
                        <Store size={14} className="text-[#C9A84C]" /> Seller Panel
                      </Link>
                      <Link
                        href="/wishlist"
                        onClick={() => setUserMenuOpen(false)}
                        className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                      >
                        <Heart size={14} className="text-[#C9A84C]" /> My Wishlist
                        {wishlistCount > 0 && (
                          <span className="ml-auto text-[10px] bg-[#1E6B5A] text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
                            {wishlistCount}
                          </span>
                        )}
                      </Link>
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={() => { setUserMenuOpen(false); signOut({ redirectUrl: basePath || "/" }); }}
                          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F3F8F5] hover:text-[#1E6B5A] transition-colors"
                        >
                          <LogOut size={14} className="text-[#C9A84C]" /> Sign Out
                        </button>
                      </div>
                    </div>
                  )}
                </Show>
              </div>

            </div>
          </div>
        </div>
      </nav>

      {/* ── Mobile drawer overlay ─────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer panel */}
          <div className="relative w-72 max-w-[85vw] h-full bg-[#1E6B5A] text-[#F3F8F5] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#C9A84C]/20">
              <img src="/images/logo.png" alt="TwirlDrape" className="h-10 w-auto object-contain brightness-0 invert" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-white/10 transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1">
              {navLinks.map(({ href, label }) => {
                const active = href === "/" ? location === "/" : location.startsWith(href) && href !== "#";
                return (
                  <React.Fragment key={label}>
                    <Link
                      href={href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={cn(
                        "flex items-center px-3 py-3 rounded-lg text-sm font-semibold uppercase tracking-widest transition-colors",
                        active
                          ? "bg-[#C9A84C]/20 text-[#C9A84C]"
                          : "hover:bg-white/10 text-[#F3F8F5]/80 hover:text-[#F3F8F5]"
                      )}
                    >
                      {label}
                    </Link>
                    {label === "Collections" && (
                      <>
                        <Link
                          href="/bridal"
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center pl-7 pr-3 py-2.5 rounded-lg text-sm transition-colors",
                            location.startsWith("/bridal")
                              ? "bg-[#C9A84C]/20 text-[#C9A84C] font-semibold"
                              : "hover:bg-white/10 text-[#F3F8F5]/70 hover:text-[#F3F8F5]"
                          )}
                        >
                          ↳ Bridal Collection
                        </Link>
                        <Link
                          href="/party-wear"
                          onClick={() => setMobileMenuOpen(false)}
                          className={cn(
                            "flex items-center pl-7 pr-3 py-2.5 rounded-lg text-sm transition-colors",
                            location.startsWith("/party-wear")
                              ? "bg-[#C9A84C]/20 text-[#C9A84C] font-semibold"
                              : "hover:bg-white/10 text-[#F3F8F5]/70 hover:text-[#F3F8F5]"
                          )}
                        >
                          ↳ Party Wear
                        </Link>
                      </>
                    )}
                  </React.Fragment>
                );
              })}

              <div className="border-t border-[#C9A84C]/20 mt-3 pt-3 space-y-1">
                <Show when="signed-in">
                  <Link
                    href="/account"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F3F8F5]/80 hover:text-[#F3F8F5] font-semibold"
                  >
                    <LayoutDashboard size={16} className="text-[#C9A84C]" /> My Account
                  </Link>
                  <Link
                    href="/orders"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F3F8F5]/80 hover:text-[#F3F8F5]"
                  >
                    <ClipboardList size={16} className="text-[#C9A84C]" /> My Orders
                  </Link>
                  <Link
                    href="/seller/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F3F8F5]/80 hover:text-[#F3F8F5]"
                  >
                    <Store size={16} className="text-[#C9A84C]" /> Seller Panel
                  </Link>
                </Show>
                <Link
                  href="/wishlist"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F3F8F5]/80 hover:text-[#F3F8F5]"
                >
                  <Heart size={16} className="text-[#C9A84C]" /> My Wishlist
                  {wishlistCount > 0 && (
                    <span className="ml-auto text-[10px] bg-[#C9A84C] text-[#1E6B5A] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
                <Show when="signed-out">
                  <Link
                    href="/seller/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors font-semibold"
                    style={{ color: "#C9A84C" }}
                  >
                    <Store size={16} className="text-[#C9A84C]" /> Become a Vendor
                  </Link>
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F3F8F5]/80 hover:text-[#F3F8F5]"
                  >
                    <LogIn size={16} className="text-[#C9A84C]" /> Sign In
                  </Link>
                </Show>
                <Show when="signed-in">
                  <button
                    onClick={() => { setMobileMenuOpen(false); signOut({ redirectUrl: basePath || "/" }); }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F3F8F5]/80 hover:text-[#F3F8F5]"
                  >
                    <LogOut size={16} className="text-[#C9A84C]" /> Sign Out
                  </button>
                </Show>
              </div>
            </nav>

            {/* Footer strip */}
            <div className="px-5 py-4 border-t border-[#C9A84C]/20 text-[10px] uppercase tracking-wider text-[#C9A84C]/60 flex gap-4">
              <Link href="/track-order" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#C9A84C] transition-colors">Track Order</Link>
              <Link href="#" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#C9A84C] transition-colors">Support</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
