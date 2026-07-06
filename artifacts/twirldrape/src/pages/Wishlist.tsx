import React, { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useUser } from "@clerk/react";
import { Heart, LogIn, Loader2, ShoppingBag, Clock } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { useListProducts } from "@workspace/api-client-react";
import type { ProductSummary } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const basePath = BASE;

const RECENTLY_VIEWED_KEY = "twirl_recently_viewed";

function getRecentlyViewed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENTLY_VIEWED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

interface WishlistItem extends ProductSummary {
  addedAt: string;
}

function useWishlistItems(isSignedIn: boolean) {
  return useQuery<{ items: WishlistItem[] }>({
    queryKey: ["wishlist-items"],
    queryFn: async () => {
      const res = await fetch(`${BASE}/api/wishlists`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch wishlist");
      return res.json();
    },
    enabled: isSignedIn,
  });
}

export default function Wishlist() {
  const { isSignedIn, isLoaded } = useUser();
  const { wishlistedIds, toggle: toggleWishlist } = useWishlist();
  const { addItem, openDrawer } = useCart();
  const { data, isLoading, isError } = useWishlistItems(!!isSignedIn);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [movingToCart, setMovingToCart] = useState<string | null>(null);

  useEffect(() => {
    const ids = getRecentlyViewed().slice(0, 8);
    setRecentIds(ids);
  }, []);

  const { data: recentData } = useListProducts(
    { ids: recentIds.join(","), limit: 8 } as any,
    { query: { enabled: recentIds.length > 0 } }
  );

  if (!isLoaded) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <Loader2 className="animate-spin text-[#C9A84C]" size={32} />
        </div>
      </Layout>
    );
  }

  if (!isSignedIn) {
    return (
      <Layout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center px-4">
          <Heart size={48} className="text-[#7B1C2C] opacity-30" />
          <h1 className="font-serif text-3xl text-[#7B1C2C]">Your Wishlist</h1>
          <p className="text-[#7a5f4e] max-w-sm">
            Sign in to save your favorite sarees and access them from any device.
          </p>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 bg-[#7B1C2C] text-[#FAF6EE] px-6 py-3 rounded font-semibold hover:bg-[#5e1421] transition-colors"
          >
            <LogIn size={18} /> Sign In
          </Link>
        </div>
      </Layout>
    );
  }

  const items = data?.items ?? [];

  async function handleMoveToCart(item: WishlistItem) {
    setMovingToCart(item.id);
    await addItem({
      id: item.id,
      productId: item.id,
      name: item.name,
      price: item.price,
      originalPrice: item.originalPrice ?? null,
      images: item.images ?? [],
      vendorName: item.vendorName ?? "",
      stock: (item as any).stock ?? 99,
      category: item.category ?? "",
    });
    toggleWishlist(item.id);
    setMovingToCart(null);
    openDrawer();
  }

  const wishlistRecentIds = recentIds.filter(
    (id) => !items.some((item) => item.id === id)
  );
  const recentProducts = (recentData?.products ?? []).filter(
    (p) => !items.some((item) => item.id === p.id)
  );

  return (
    <Layout>
      <div className="container mx-auto px-4 lg:px-8 py-10">
        <div className="flex items-center gap-3 mb-8">
          <Heart size={28} className="fill-[#7B1C2C] text-[#7B1C2C]" />
          <h1 className="font-serif text-3xl md:text-4xl text-[#7B1C2C]">My Wishlist</h1>
          {items.length > 0 && (
            <span className="ml-auto text-sm text-[#7a5f4e]">
              {items.length} {items.length === 1 ? "item" : "items"} saved
            </span>
          )}
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="animate-spin text-[#C9A84C]" size={32} />
          </div>
        )}

        {isError && (
          <div className="text-center py-20 text-red-600">
            Failed to load your wishlist. Please try refreshing.
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
            <Heart size={48} className="text-[#7B1C2C] opacity-20" />
            <p className="text-[#7a5f4e] text-lg">Your wishlist is empty.</p>
            <p className="text-[#7a5f4e] text-sm max-w-sm">
              Browse our collection and tap the heart icon on any saree to save it here.
            </p>
            <div className="flex gap-4">
              <Link
                href="/paithani/shop"
                className="bg-[#7B1C2C] text-[#FAF6EE] px-5 py-2.5 rounded font-semibold hover:bg-[#5e1421] transition-colors text-sm"
              >
                Shop Paithani
              </Link>
              <Link
                href="/designer/shop"
                className="bg-[#1E2329] text-[#FAF6EE] px-5 py-2.5 rounded font-semibold hover:bg-[#2d3540] transition-colors text-sm"
              >
                Shop Designer
              </Link>
            </div>
          </div>
        )}

        {!isLoading && !isError && items.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {items.map((item, i) => (
              <div key={item.id} className="flex flex-col gap-2">
                <ProductCard product={item} index={i} />
                <button
                  onClick={() => handleMoveToCart(item)}
                  disabled={movingToCart === item.id}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border border-[#7B1C2C] text-[#7B1C2C] text-sm font-semibold rounded hover:bg-[#7B1C2C] hover:text-[#FAF6EE] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {movingToCart === item.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ShoppingBag size={14} />
                  )}
                  Move to Cart
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Recently Viewed */}
        {wishlistRecentIds.length > 0 && recentProducts.length > 0 && (
          <section className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <Clock size={18} className="text-[#C9A84C]" />
              <h2 className="font-serif text-2xl font-bold text-[#7B1C2C]">
                Recently Viewed
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {recentProducts.slice(0, 8).map((product) => (
                <Link key={product.id} href={`/products/${product.id}`}>
                  <div className="bg-white rounded-lg border border-[#C9A84C]/10 overflow-hidden hover:border-[#C9A84C] hover:shadow-md transition-all cursor-pointer group">
                    <div className="aspect-square overflow-hidden">
                      <img
                        src={product.images?.[0] ?? "/images/product-1.png"}
                        alt={product.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                    <div className="p-3">
                      <p className="text-xs text-gray-500 mb-0.5">{product.vendorName}</p>
                      <p className="text-sm font-serif font-semibold text-[#7B1C2C] line-clamp-2">
                        {product.name}
                      </p>
                      <p className="text-sm font-bold text-[#7B1C2C] mt-1">
                        ₹{product.price?.toLocaleString("en-IN")}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </Layout>
  );
}
