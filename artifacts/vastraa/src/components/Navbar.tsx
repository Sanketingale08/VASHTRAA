import React, { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Search, Heart, ShoppingBag, User, Menu, X, ArrowRight, LogIn, LogOut, ClipboardList, LayoutDashboard, Store, Loader2, Sparkles, Star, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUser, useClerk } from "@clerk/react";
import { useAuth } from "@/context/AuthContext";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";
import { SearchSuggestionsSkeleton } from "@/components/skeletons";
import { useQuery } from "@tanstack/react-query";
import { CATALOG_CATEGORIES, isMainCatalogCategory } from "@/constants/categories";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

interface SearchSuggestionItem {
  id: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  image?: string;
  images: string[];
  category: string;
  color: string;
  vendorName: string;
  rating: number;
}

interface SearchSuggestionsData {
  products: SearchSuggestionItem[];
  categories: Array<{ label: string; category: string }>;
  colors: Array<{ label: string; color: string }>;
  occasions: Array<{ label: string; occasion: string }>;
  totalCount: number;
}

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestionsData | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [categoriesMenuOpen, setCategoriesMenuOpen] = useState(false);
  const [mobileCategoriesOpen, setMobileCategoriesOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const categoriesContainerRef = useRef<HTMLDivElement>(null);

  const { user: customUser, isSignedIn: isCustomSignedIn, signOut: customSignOut } = useAuth();
  const { user: clerkUser, isSignedIn: isClerkSignedIn } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const isSignedIn = isCustomSignedIn || isClerkSignedIn;
  const user = customUser ? {
    firstName: customUser.firstName || customUser.name.split(" ")[0],
    lastName: customUser.lastName || customUser.name.split(" ").slice(1).join(" "),
    email: customUser.email,
    imageUrl: customUser.imageUrl,
  } : clerkUser ? {
    firstName: clerkUser.firstName || "Customer",
    lastName: clerkUser.lastName || "",
    email: clerkUser.primaryEmailAddress?.emailAddress || "",
    imageUrl: clerkUser.imageUrl,
  } : null;

  const { wishlistedIds } = useWishlist();
  const { totalItems: cartCount, openDrawer: openCart } = useCart();
  const wishlistCount = wishlistedIds.size;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 15);
    handleScroll();
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
    if (debouncedQuery.trim().length < 2) {
      setSuggestions(null);
      setIsSearching(false);
      return;
    }

    let active = true;
    setIsSearching(true);
    setSearchError(false);

    fetch(`${basePath}/api/products/search-suggestions?q=${encodeURIComponent(debouncedQuery.trim())}&limit=5`)
      .then((res) => {
        if (!res.ok) throw new Error("Search failed");
        return res.json();
      })
      .then((data) => {
        if (active) {
          setSuggestions(data);
          setIsSearching(false);
        }
      })
      .catch((err) => {
        if (active) {
          console.error("Search error:", err);
          setSearchError(true);
          setIsSearching(false);
        }
      });

    return () => { active = false; };
  }, [debouncedQuery]);

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
      if (categoriesContainerRef.current && !categoriesContainerRef.current.contains(e.target as Node)) {
        setCategoriesMenuOpen(false);
      }
    };
    if (categoriesMenuOpen) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [categoriesMenuOpen]);

  // Database-driven categories for navbar
  const { data: dbCategoriesData } = useQuery<{ categories: any[] }>({
    queryKey: ["/api/categories"],
    queryFn: async () => {
      try {
        const res = await fetch(`${basePath}/api/categories`);
        if (!res.ok) return { categories: [] };
        return res.json();
      } catch {
        return { categories: [] };
      }
    },
    staleTime: 60_000,
  });

  const activeDbCategories = (dbCategoriesData?.categories || []).filter(
    (c: any) => c.active !== false && isMainCatalogCategory(c)
  );

  const seenSlugs = new Set<string>();
  const displayCategories = (activeDbCategories.length > 0 ? activeDbCategories : CATALOG_CATEGORIES)
    .filter((c: any) => {
      if (!c || c.active === false || !isMainCatalogCategory(c)) return false;
      const key = (c.slug || c.id || c.name || "").toLowerCase().trim();
      if (!key || seenSlugs.has(key)) return false;
      seenSlugs.add(key);
      return true;
    })
    .map((c: any) => {
      const fallback = CATALOG_CATEGORIES.find((cat) => cat.slug === c.slug || cat.id === c.id);
      return {
        id: c.id || fallback?.id || c.slug,
        name: c.name || fallback?.name,
        slug: c.slug || fallback?.slug,
        image: c.image || c.coverImage || fallback?.coverImage || "/images/product-1.png",
        description: c.description || fallback?.description,
        productCount: typeof c.productCount === "number" ? c.productCount : undefined,
      };
    });

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  const isDark = false;
  const isDesignerDark = false;
  const isDesigner = location.startsWith("/designer");

  const navBg = isScrolled
    ? "bg-[#F4F5F7]/95 text-[#0A1F44] border-[#C7CCD1]/40 shadow-sm sm:shadow-md"
    : "bg-[#F4F5F7]/98 text-[#0A1F44] border-[#C7CCD1]/20";

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/new-arrivals", label: "New Arrivals" },
    { href: "/contact", label: "Contact" },
  ];

  function handleSearchSubmit(e?: React.FormEvent, directQuery?: string) {
    if (e) e.preventDefault();
    const queryToUse = directQuery || searchQuery;
    if (queryToUse.trim()) {
      setSearchOpen(false);
      setSearchQuery("");

      const isDesignerPage = location.includes("designer");
      const isPaithaniPage = location.includes("paithani");

      let basePathTarget = "/products";
      if (isDesignerPage) {
        basePathTarget = location.startsWith("/category/") ? "/category/designer" : "/designer";
      } else if (isPaithaniPage) {
        basePathTarget = location.startsWith("/category/") ? "/category/paithani" : "/paithani";
      }

      const currentSearch = new URLSearchParams(window.location.search);
      currentSearch.set("search", queryToUse.trim());
      currentSearch.set("page", "1");

      const targetPath = location.startsWith("/category/") || location.startsWith("/paithani") || location.startsWith("/designer") || location.startsWith("/products")
        ? location.split("?")[0]
        : `${basePath}${basePathTarget}`;

      window.location.href = `${targetPath}?${currentSearch.toString()}`;
    }
  }

  return (
    <>
      {/* ── Main navbar (Fixed at top of screen) ───────────────────────── */}
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 w-full z-50 transition-all duration-300 ease-in-out backdrop-blur-md border-b",
          navBg
        )}
      >
        <div className="container mx-auto px-3 sm:px-4 lg:px-8">
          <div className={cn(
            "flex items-center gap-2 xs:gap-3 sm:gap-4 transition-all duration-300 ease-in-out",
            isScrolled
              ? "h-[54px] xs:h-[58px] sm:h-[66px] md:h-[72px]"
              : "h-[64px] sm:h-[76px] md:h-[96px]"
          )}>

            {/* ── Mobile hamburger ── */}
            <button
              className="lg:hidden flex items-center justify-center w-10 h-10 -ml-1 rounded-md hover:bg-white/10 transition-colors shrink-0"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} />
            </button>

            {/* ── Logo (left-anchored, fluid scaling for mobile) ── */}
            <Link href="/" className="shrink-0 flex items-center group mr-auto lg:mr-0">
              <img
                src={`${basePath}/logo.svg`}
                alt="VASTRAA — Paithani & Designer Sarees"
                className={cn(
                  "w-auto object-contain group-hover:opacity-90 transition-all duration-300 ease-in-out",
                  isScrolled
                    ? "h-[32px] xs:h-[38px] sm:h-[44px] md:h-[50px] max-w-[120px] xs:max-w-[145px] sm:max-w-[175px] md:max-w-[210px]"
                    : "h-[38px] xs:h-[46px] sm:h-[54px] md:h-[64px] max-w-[135px] xs:max-w-[165px] sm:max-w-[200px] md:max-w-[240px]"
                )}
              />
            </Link>

            {/* ── Desktop nav (centred) ── */}
            <div className="hidden lg:flex flex-1 items-center justify-center gap-1">
              <Link
                href="/"
                className={cn(
                  "relative px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors rounded-sm",
                  location === "/"
                    ? "text-[#C7CCD1]"
                    : "text-[#0A1F44]/75 hover:text-[#0A1F44]",
                  "after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[#C7CCD1] after:rounded-full after:transition-opacity",
                  location === "/" ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-40"
                )}
              >
                Home
              </Link>

              {/* Categories Dropdown / Mega-Menu */}
              <div
                ref={categoriesContainerRef}
                className="relative"
                onMouseEnter={() => setCategoriesMenuOpen(true)}
                onMouseLeave={() => setCategoriesMenuOpen(false)}
              >
                <button
                  type="button"
                  onClick={() => setCategoriesMenuOpen(!categoriesMenuOpen)}
                  className={cn(
                    "relative px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors rounded-sm flex items-center gap-1 cursor-pointer",
                    categoriesMenuOpen || displayCategories.some((c) => location.startsWith(`/${c.slug}`) || location === `/category/${c.slug}`)
                      ? "text-[#0A1F44] font-bold"
                      : "text-[#0A1F44]/75 hover:text-[#0A1F44]",
                    "after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[#C7CCD1] after:rounded-full after:transition-opacity",
                    categoriesMenuOpen || displayCategories.some((c) => location.startsWith(`/${c.slug}`) || location === `/category/${c.slug}`)
                      ? "after:opacity-100"
                      : "after:opacity-0 hover:after:opacity-40"
                  )}
                >
                  <span>Categories</span>
                  <ChevronDown size={13} className={cn("transition-transform duration-200", categoriesMenuOpen && "rotate-180")} />
                </button>

                {/* Mega Menu Dropdown */}
                {categoriesMenuOpen && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-[720px] bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-[60] animate-in fade-in zoom-in-95 duration-150">
                    <div className="flex items-center justify-between pb-3 mb-4 border-b border-gray-100">
                      <div>
                        <h3 className="font-serif text-base font-bold text-[#0A1F44]">Women's Fashion Categories</h3>
                        <p className="text-[11px] text-gray-500">Explore handcrafted sarees, kurtis, kurta sets, and designer dresses</p>
                      </div>
                      <Link
                        href="/products"
                        onClick={() => setCategoriesMenuOpen(false)}
                        className="text-xs font-bold text-[#0A1F44] hover:underline flex items-center gap-1"
                      >
                        All Products <ArrowRight size={12} />
                      </Link>
                    </div>

                    <div className="grid grid-cols-3 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                      {displayCategories.map((cat) => {
                        const targetUrl = `/${cat.slug}`;
                        const isCurrent = location === targetUrl || location === `/category/${cat.slug}`;
                        return (
                          <Link
                            key={cat.id || cat.slug}
                            href={targetUrl}
                            onClick={() => setCategoriesMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-3 p-2.5 rounded-xl transition-all border text-left group",
                              isCurrent
                                ? "bg-[#0A1F44]/5 border-[#0A1F44]/30"
                                : "hover:bg-[#F4F5F7] border-transparent hover:border-gray-200"
                            )}
                          >
                            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-gray-100 border border-gray-200 shadow-2xs">
                              {cat.image ? (
                                <img
                                  src={getProductImageSrc(cat.image)}
                                  alt={cat.name}
                                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                                  onError={replaceProductImageWithFallback}
                                />
                              ) : (
                                <div className="w-full h-full bg-[#0A1F44]/10 flex items-center justify-center text-xs font-bold text-[#0A1F44]">
                                  {cat.name.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-gray-800 group-hover:text-[#0A1F44] truncate transition-colors">
                                  {cat.name}
                                </span>
                                {typeof cat.productCount === "number" && cat.productCount > 0 && (
                                  <span className="text-[10px] text-gray-400 font-mono ml-1 shrink-0">
                                    {cat.productCount}
                                  </span>
                                )}
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {navLinks.slice(1).map(({ href, label }) => {
                const active = location.startsWith(href) && href !== "#";
                return (
                  <Link
                    key={label}
                    href={href}
                    className={cn(
                      "relative px-3 py-1.5 text-[11px] font-semibold uppercase tracking-widest transition-colors rounded-sm",
                      active
                        ? "text-[#C7CCD1]"
                        : "text-[#0A1F44]/75 hover:text-[#0A1F44]",
                      "after:absolute after:left-3 after:right-3 after:bottom-0 after:h-[2px] after:bg-[#C7CCD1] after:rounded-full after:transition-opacity",
                      active ? "after:opacity-100" : "after:opacity-0 hover:after:opacity-40"
                    )}
                  >
                    {label}
                  </Link>
                );
              })}
            </div>

            {/* ── Action icons (right-anchored) ── */}
            {/* Order: Search | User/Login | Wishlist | Cart */}
            <div className="flex items-center gap-1 xs:gap-2 sm:gap-4 ml-auto lg:ml-0 justify-end shrink-0">

              {/* Search */}
              <div ref={searchContainerRef} className="relative">
                <button
                  className={cn(
                    "flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-md transition-colors",
                    isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#0A1F44]/10"
                  )}
                  onClick={() => setSearchOpen(!searchOpen)}
                  aria-label="Search"
                >
                  <Search size={19} />
                </button>

                {searchOpen && (
                  <>
                    {/* Backdrop for mobile */}
                    <div
                      className="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 sm:hidden"
                      onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                    />
                    <div className="fixed inset-x-2 top-[max(0.75rem,env(safe-area-inset-top,0px))] sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] sm:max-w-[420px] bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[60]">
                      <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 px-3 sm:px-4 py-3 border-b border-gray-100">
                        <Search size={16} className="text-gray-400 shrink-0" />
                        <input
                          ref={searchInputRef}
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Search sarees, silk, bridal…"
                          className="flex-1 text-sm text-gray-800 outline-none placeholder-gray-400 bg-transparent min-w-0"
                        />
                        {isSearching && (
                          <Loader2 size={16} className="animate-spin text-[#0A1F44] shrink-0" />
                        )}
                        {searchQuery && !isSearching && (
                          <button type="button" onClick={() => { setSearchQuery(""); setSuggestions(null); }} className="text-gray-400 hover:text-gray-600 p-1">
                            <X size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                          className="sm:hidden text-xs text-gray-500 font-semibold px-2 py-1 hover:text-[#0A1F44]"
                        >
                          Cancel
                        </button>
                      </form>

                    {debouncedQuery.trim().length >= 2 ? (
                      <div className="max-h-80 overflow-y-auto">
                        {/* Suggestions Header / Quick Category Chips */}
                        {suggestions && (suggestions.categories.length > 0 || suggestions.colors.length > 0 || suggestions.occasions.length > 0) && (
                          <div className="p-3 bg-[#F4F5F7] border-b border-gray-100 flex flex-wrap gap-1.5 items-center">
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mr-1 flex items-center gap-1">
                              <Sparkles size={10} className="text-[#C7CCD1]" /> Quick Matches:
                            </span>
                            {suggestions.categories.map((cat) => (
                              <button
                                key={cat.category}
                                onClick={() => handleSearchSubmit(undefined, cat.label)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-white text-[#0A1F44] hover:bg-[#0A1F44] hover:text-white rounded-full border border-gray-200 transition-colors shadow-xs"
                              >
                                {cat.label}
                              </button>
                            ))}
                            {suggestions.colors.map((c) => (
                              <button
                                key={c.color}
                                onClick={() => handleSearchSubmit(undefined, `${c.color} saree`)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-white text-[#0A1F44] hover:bg-[#0A1F44] hover:text-white rounded-full border border-gray-200 transition-colors shadow-xs capitalize"
                              >
                                🎨 {c.label}
                              </button>
                            ))}
                            {suggestions.occasions.map((o) => (
                              <button
                                key={o.occasion}
                                onClick={() => handleSearchSubmit(undefined, `${o.occasion} saree`)}
                                className="px-2.5 py-1 text-[11px] font-semibold bg-white text-[#0A1F44] hover:bg-[#0A1F44] hover:text-white rounded-full border border-gray-200 transition-colors shadow-xs capitalize"
                              >
                                ✨ {o.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* Product Results List */}
                        {isSearching && !suggestions ? (
                          <SearchSuggestionsSkeleton count={4} />
                        ) : suggestions && suggestions.products.length > 0 ? (
                          <>
                            {suggestions.products.map((product) => (
                              <Link
                                key={product.id}
                                href={`/products/${product.id}`}
                                onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                                className="flex items-center gap-3 px-4 py-3 hover:bg-[#F4F5F7] transition-colors border-b border-gray-50 last:border-b-0 group"
                              >
                                <img
                                  src={getProductImageSrc(product.image || product.images?.[0])}
                                  alt={product.name}
                                  className="w-11 h-11 rounded-md object-cover shrink-0 border border-gray-100 group-hover:scale-105 transition-transform"
                                  onError={replaceProductImageWithFallback}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-gray-800 line-clamp-1 group-hover:text-[#0A1F44] transition-colors">
                                    {product.name}
                                  </p>
                                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                                    <span className="font-bold text-[#0A1F44]">₹{product.price.toLocaleString("en-IN")}</span>
                                    {product.originalPrice && product.originalPrice > product.price && (
                                      <span className="line-through text-gray-400 text-[11px]">₹{product.originalPrice.toLocaleString("en-IN")}</span>
                                    )}
                                    <span>·</span>
                                    <span className="truncate">{product.vendorName}</span>
                                    {product.rating > 0 && (
                                      <span className="flex items-center text-amber-500 ml-auto font-medium text-[11px]">
                                        <Star size={10} className="fill-amber-400 text-amber-400 mr-0.5" />
                                        {product.rating.toFixed(1)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </Link>
                            ))}
                            <button
                              onClick={() => handleSearchSubmit()}
                              className="w-full flex items-center justify-center gap-2 px-4 py-3 text-xs font-bold text-[#0A1F44] bg-[#E5E8EC] hover:bg-[#C7CCD1] transition-colors border-t border-gray-100"
                            >
                              View all {suggestions.totalCount} result{suggestions.totalCount !== 1 ? "s" : ""} for "{debouncedQuery}" <ArrowRight size={12} />
                            </button>
                          </>
                        ) : searchError ? (
                          <div className="px-4 py-8 text-center text-sm text-red-500">
                            Failed to load search results. Please try again.
                          </div>
                        ) : (
                          <div className="p-6 text-center">
                            <p className="text-2xl mb-2">🪡</p>
                            <p className="text-sm font-semibold text-gray-700 mb-1">No products found for "{debouncedQuery}"</p>
                            <p className="text-xs text-gray-400 mb-4">Try searching for popular styles below:</p>
                            <div className="flex flex-wrap justify-center gap-2">
                              {["blue paithani", "red designer", "festival paithani", "wedding saree"].map((term) => (
                                <button
                                  key={term}
                                  onClick={() => { setSearchQuery(term); handleSearchSubmit(undefined, term); }}
                                  className="px-2.5 py-1 text-xs bg-gray-100 hover:bg-[#0A1F44] hover:text-white rounded-full text-gray-600 transition-colors"
                                >
                                  {term}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4">
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Popular Natural Searches</p>
                        <div className="flex flex-wrap gap-2 mb-4">
                          {[
                            "blue paithani",
                            "red paithani",
                            "festival paithani",
                            "wedding paithani",
                            "blue designer saree",
                            "red designer",
                            "festival designer saree",
                          ].map((s) => (
                            <button
                              key={s}
                              onClick={() => { setSearchQuery(s); handleSearchSubmit(undefined, s); }}
                              className="px-2.5 py-1 text-xs bg-[#F4F5F7] hover:bg-[#0A1F44] hover:text-white rounded-md text-gray-700 font-medium transition-colors border border-gray-200/60"
                            >
                              🔍 {s}
                            </button>
                          ))}
                        </div>
                        <div className="border-t border-gray-100 pt-3">
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Quick Navigation</p>
                          <div className="space-y-1.5">
                            <Link href="/paithani/shop" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#0A1F44] transition-colors py-1">
                              <ArrowRight size={12} className="text-[#C7CCD1]" /> All Paithani Sarees
                            </Link>
                            <Link href="/designer/shop" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#0A1F44] transition-colors py-1">
                              <ArrowRight size={12} className="text-[#C7CCD1]" /> All Designer Sarees
                            </Link>
                            <Link href="/new-arrivals" onClick={() => setSearchOpen(false)} className="flex items-center gap-2 text-xs text-gray-600 hover:text-[#0A1F44] transition-colors py-1">
                              <ArrowRight size={12} className="text-[#C7CCD1]" /> New Arrivals
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

              {/* User/Login icon — Positioned before Wishlist & Cart icons, responsive across desktop, tablet, and mobile */}
              <div ref={userMenuRef} className="relative flex items-center">
                {isSignedIn ? (
                  <>
                    <button
                      className={cn(
                        "flex items-center justify-center w-9 h-9 rounded-full transition-all border-2",
                        userMenuOpen
                          ? "border-[#C7CCD1]"
                          : isDark || isDesignerDark
                          ? "border-white/20 hover:border-white/50"
                          : "border-[#C7CCD1]/30 hover:border-[#C7CCD1]",
                      )}
                      onClick={() => setUserMenuOpen(!userMenuOpen)}
                      title={user?.firstName ?? "Account"}
                      aria-label="User Account"
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
                          isDark || isDesignerDark ? "text-[#F4F5F7]" : "text-[#0A1F44]",
                        )}>
                          {[user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || <User size={15} />}
                        </span>
                      )}
                    </button>
                    {userMenuOpen && (
                      <div className="absolute right-0 top-full mt-2 w-56 bg-white text-gray-800 shadow-2xl border border-gray-100 rounded-xl py-2 z-50">
                        <div className="px-4 py-3 border-b border-gray-100">
                          <p className="text-sm font-semibold text-[#0A1F44] truncate">
                            {user?.firstName} {user?.lastName}
                          </p>
                          <p className="text-xs text-gray-400 truncate mt-0.5">
                            {user?.email}
                          </p>
                        </div>
                        <Link
                          href="/account"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F4F5F7] hover:text-[#0A1F44] transition-colors font-medium"
                        >
                          <LayoutDashboard size={14} className="text-[#C7CCD1]" /> My Account
                        </Link>
                        <Link
                          href="/orders"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F4F5F7] hover:text-[#0A1F44] transition-colors"
                        >
                          <ClipboardList size={14} className="text-[#C7CCD1]" /> My Orders
                        </Link>
                        <Link
                          href="/wishlist"
                          onClick={() => setUserMenuOpen(false)}
                          className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F4F5F7] hover:text-[#0A1F44] transition-colors"
                        >
                          <Heart size={14} className="text-[#C7CCD1]" /> My Wishlist
                          {wishlistCount > 0 && (
                            <span className="ml-auto text-[10px] bg-[#0A1F44] text-white rounded-full w-5 h-5 flex items-center justify-center font-bold">
                              {wishlistCount}
                            </span>
                          )}
                        </Link>
                        <div className="border-t border-gray-100 mt-1 pt-1">
                          <button
                            onClick={async () => {
                              setUserMenuOpen(false);
                              if (isCustomSignedIn) {
                                await customSignOut();
                              }
                              if (isClerkSignedIn) {
                                await clerkSignOut({ redirectUrl: basePath || "/" });
                              }
                            }}
                            className="w-full flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-[#F4F5F7] hover:text-[#0A1F44] transition-colors"
                          >
                            <LogOut size={14} className="text-[#C7CCD1]" /> Sign Out
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <Link
                    href="/sign-in"
                    className={cn(
                      "flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                      isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#0A1F44]/10"
                    )}
                    title="Sign In / User Login"
                    aria-label="User Login"
                  >
                    <User size={19} />
                  </Link>
                )}
              </div>

              {/* Wishlist */}
              <Link
                href="/wishlist"
                className={cn(
                  "relative flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                  isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#0A1F44]/10"
                )}
                aria-label="Wishlist"
              >
                <Heart size={19} />
                {wishlistCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-[#C7CCD1] text-[#0A1F44] text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none">
                    {wishlistCount > 9 ? "9+" : wishlistCount}
                  </span>
                )}
              </Link>

              {/* Cart */}
              <button
                onClick={openCart}
                className={cn(
                  "relative flex items-center justify-center w-9 h-9 rounded-md transition-colors",
                  isDark || isDesignerDark ? "hover:bg-white/10" : "hover:bg-[#0A1F44]/10"
                )}
                aria-label="Cart"
              >
                <ShoppingBag size={19} />
                {cartCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 bg-[#C7CCD1] text-[#0A1F44] text-[9px] font-extrabold h-4 w-4 rounded-full flex items-center justify-center leading-none">
                    {cartCount > 9 ? "9+" : cartCount}
                  </span>
                )}
              </button>

            </div>
          </div>
        </div>
      </nav>

      {/* ── Navbar spacer: reserves exact height in document flow to prevent content overlap ── */}
      <div
        aria-hidden="true"
        data-testid="navbar-spacer"
        className={cn(
          "w-full transition-all duration-300 ease-in-out pointer-events-none invisible",
          isScrolled
            ? "h-[54px] xs:h-[58px] sm:h-[66px] md:h-[72px]"
            : "h-[64px] sm:h-[76px] md:h-[96px]"
        )}
      />

      {/* ── Mobile drawer overlay ─────────────────────────────────────── */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-[60] lg:hidden flex">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Drawer panel */}
          <div className="relative w-72 max-w-[85vw] h-full min-h-screen-dynamic bg-[#0A1F44] text-[#F4F5F7] flex flex-col shadow-2xl pt-safe scroll-touch">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#C7CCD1]/20">
              <img src={`${basePath}/logo.svg`} alt="VASTRAA" className="h-9 sm:h-10 w-auto object-contain bg-white/95 p-1 rounded-md shadow-sm" />
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center w-10 h-10 -mr-2 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close menu"
              >
                <X size={20} />
              </button>
            </div>

            {/* Nav links */}
            <nav className="flex-1 overflow-y-auto px-4 py-4 space-y-1 scroll-touch scrollbar-thin">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "flex items-center px-3 py-3 rounded-lg text-sm font-semibold uppercase tracking-widest transition-colors",
                  location === "/"
                    ? "bg-[#C7CCD1]/20 text-[#C7CCD1]"
                    : "hover:bg-white/10 text-[#F4F5F7]/80 hover:text-[#F4F5F7]"
                )}
              >
                Home
              </Link>

              {/* Expandable Categories in Mobile Drawer */}
              <div className="py-1">
                <button
                  type="button"
                  onClick={() => setMobileCategoriesOpen(!mobileCategoriesOpen)}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-lg text-sm font-semibold uppercase tracking-widest text-[#F4F5F7]/80 hover:text-[#F4F5F7] hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    Categories ({displayCategories.length})
                  </span>
                  <ChevronDown size={16} className={cn("transition-transform duration-200 text-[#C7CCD1]", mobileCategoriesOpen && "rotate-180")} />
                </button>

                {mobileCategoriesOpen && (
                  <div className="pl-2 pr-1 py-1 space-y-1 max-h-72 overflow-y-auto scrollbar-thin">
                    {displayCategories.map((cat) => {
                      const targetUrl = `/${cat.slug}`;
                      const isCurrent = location === targetUrl || location === `/category/${cat.slug}`;
                      return (
                        <div key={cat.id || cat.slug} className="space-y-0.5">
                          <Link
                            href={targetUrl}
                            onClick={() => setMobileMenuOpen(false)}
                            className={cn(
                              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors",
                              isCurrent
                                ? "bg-[#C7CCD1]/20 text-[#C7CCD1] font-bold"
                                : "text-[#F4F5F7]/85 hover:text-white hover:bg-white/5"
                            )}
                          >
                            <div className="w-7 h-7 rounded-md overflow-hidden shrink-0 bg-white/10 border border-white/15">
                              {cat.image ? (
                                <img
                                  src={getProductImageSrc(cat.image)}
                                  alt={cat.name}
                                  className="w-full h-full object-cover"
                                  onError={replaceProductImageWithFallback}
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-[10px] font-bold text-[#C7CCD1]">
                                  {cat.name.slice(0, 2)}
                                </div>
                              )}
                            </div>
                            <span className="truncate flex-1">{cat.name}</span>
                            {typeof cat.productCount === "number" && cat.productCount > 0 && (
                              <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded-full font-mono text-[#C7CCD1] shrink-0">
                                {cat.productCount}
                              </span>
                            )}
                          </Link>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {navLinks.slice(1).map(({ href, label }) => {
                const active = location.startsWith(href) && href !== "#";
                return (
                  <Link
                    key={label}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center px-3 py-3 rounded-lg text-sm font-semibold uppercase tracking-widest transition-colors",
                      active
                        ? "bg-[#C7CCD1]/20 text-[#C7CCD1]"
                        : "hover:bg-white/10 text-[#F4F5F7]/80 hover:text-[#F4F5F7]"
                    )}
                  >
                    {label}
                  </Link>
                );
              })}

              <div className="border-t border-[#C7CCD1]/20 mt-3 pt-3 space-y-1">
                {isSignedIn && (
                  <>
                    <Link
                      href="/account"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F4F5F7]/80 hover:text-[#F4F5F7] font-semibold"
                    >
                      <LayoutDashboard size={16} className="text-[#C7CCD1]" /> My Account
                    </Link>
                    <Link
                      href="/orders"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F4F5F7]/80 hover:text-[#F4F5F7]"
                    >
                      <ClipboardList size={16} className="text-[#C7CCD1]" /> My Orders
                    </Link>
                  </>
                )}
                <Link
                  href="/wishlist"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F4F5F7]/80 hover:text-[#F4F5F7]"
                >
                  <Heart size={16} className="text-[#C7CCD1]" /> My Wishlist
                  {wishlistCount > 0 && (
                    <span className="ml-auto text-[10px] bg-[#C7CCD1] text-[#0A1F44] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
                {!isSignedIn ? (
                  <Link
                    href="/sign-in"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F4F5F7]/80 hover:text-[#F4F5F7]"
                  >
                    <LogIn size={16} className="text-[#C7CCD1]" /> Sign In
                  </Link>
                ) : (
                  <button
                    onClick={async () => {
                      setMobileMenuOpen(false);
                      if (isCustomSignedIn) {
                        await customSignOut();
                      }
                      if (isClerkSignedIn) {
                        await clerkSignOut({ redirectUrl: basePath || "/" });
                      }
                    }}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm hover:bg-white/10 transition-colors text-[#F4F5F7]/80 hover:text-[#F4F5F7]"
                  >
                    <LogOut size={16} className="text-[#C7CCD1]" /> Sign Out
                  </button>

                )}
              </div>
            </nav>

            {/* Footer strip */}
            <div className="px-5 py-4 pb-safe border-t border-[#C7CCD1]/20 text-[10px] uppercase tracking-wider text-[#C7CCD1]/60 flex gap-4">
              <Link href="/track-order" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#C7CCD1] transition-colors py-1">Track Order</Link>
              <Link href="#" onClick={() => setMobileMenuOpen(false)} className="hover:text-[#C7CCD1] transition-colors py-1">Support</Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
