import React, { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { useWishlist } from "@/context/WishlistContext";
import { useCart } from "@/context/CartContext";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import { Heart, LogIn, Loader2, ShoppingBag, Clock } from "lucide-react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import { ProductGridSkeleton } from "@/components/skeletons";
import { useListProducts } from "@workspace/api-client-react";
import type { ProductSummary } from "@workspace/api-client-react";
import { getProductImageSrc, replaceProductImageWithFallback } from "@/lib/productImages";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      const res = await apiFetch(`/api/wishlists`);
      if (!res.ok) throw new Error("Failed to fetch wishlist");
      return res.json();
    },
    enabled: isSignedIn,
  });
}

export function WishlistContent({ dashboardMode = false }: { dashboardMode?: boolean }) {
  const qc = useQueryClient();
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const { toggle: toggleWishlist } = useWishlist();
  const { addItem, openDrawer } = useCart();
  const { data, isLoading, isError } = useWishlistItems(!!isSignedIn);
  const [recentIds, setRecentIds] = useState<string[]>([]);
  const [movingToCart, setMovingToCart] = useState<string | null>(null);

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (detail.name === "wishlist:updated" || detail.name === "catalog:updated") {
        qc.invalidateQueries({ queryKey: ["wishlist-items"] });
        qc.invalidateQueries({ queryKey: ["wishlist-ids"] });
        qc.invalidateQueries({ queryKey: ["dashboard-wishlist-ids"] });
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [qc]);

  useEffect(() => {
    const ids = getRecentlyViewed().slice(0, 8);
    setRecentIds(ids);
  }, []);

  const { data: recentData } = useListProducts(
    { ids: recentIds.join(","), limit: 8 } as any,
    { query: { enabled: recentIds.length > 0 } as any }
  );

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="animate-spin text-[#C7CCD1]" size={32} />
      </div>
    );
  }

  if (!isSignedIn) {
    if (dashboardMode) return null;
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 text-center px-4">
        <Heart size={48} className="text-[#0A1F44] opacity-30" />
        <h1 className="font-serif text-3xl text-[#0A1F44]">Your Wishlist</h1>
        <p className="text-[#7a5f4e] max-w-sm">
          Sign in to save your favorite sarees and access them from any device.
        </p>
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-2 bg-[#0A1F44] text-[#F4F5F7] px-6 py-3 rounded font-semibold hover:bg-[#2C3E6B] transition-colors"
        >
          <LogIn size={18} /> Sign In
        </Link>
      </div>
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
      stock: item.stock ?? 10,
      category: item.category ?? "",
    });
    toggleWishlist(item.id);
    setMovingToCart(null);
    openDrawer();
  }

  const wishlistRecentIds = recentIds.filter(
    (id: string) => !items.some((item: any) => item.id === id)
  );
  const recentProducts = (recentData?.products ?? []).filter(
    (p: any) => !items.some((item: any) => item.id === p.id)
  );

  return (
    <div className="container mx-auto px-4 lg:px-8 py-10">
      {!dashboardMode && (
        <div className="flex items-center gap-3 mb-8">
          <Heart size={28} className="fill-[#0A1F44] text-[#0A1F44]" />
          <h1 className="font-serif text-3xl md:text-4xl text-[#0A1F44]">My Wishlist</h1>
          {items.length > 0 && (
            <span className="ml-auto text-sm text-[#7a5f4e]">
              {items.length} {items.length === 1 ? "item" : "items"} saved
            </span>
          )}
        </div>
      )}

      {isLoading && (
        <div className="py-6">
          <ProductGridSkeleton count={4} />
        </div>
      )}

      {isError && (
        <div className="text-center py-20 text-red-600">
          Failed to load your wishlist. Please try refreshing.
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-6 py-20 text-center">
          <Heart size={48} className="text-[#0A1F44] opacity-20" />
          <p className="text-[#7a5f4e] text-lg">Your wishlist is empty.</p>
          <p className="text-[#7a5f4e] text-sm max-w-sm">
            Browse our collection and tap the heart icon on any saree to save it here.
          </p>
          <div className="flex gap-4">
            <Link
              href="/paithani/shop"
              className="bg-[#0A1F44] text-[#F4F5F7] px-5 py-2.5 rounded font-semibold hover:bg-[#2C3E6B] transition-colors text-sm"
            >
              Shop Paithani
            </Link>
            <Link
              href="/designer/shop"
              className="bg-[#1E2329] text-[#F4F5F7] px-5 py-2.5 rounded font-semibold hover:bg-[#2d3540] transition-colors text-sm"
            >
              Shop Designer
            </Link>
          </div>
        </div>
      )}

      {!isLoading && !isError && items.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
          {items.map((item: any, i: number) => (
            <div key={item.id} className="flex flex-col gap-2 h-full">
              <div className="flex-1 flex flex-col">
                <ProductCard product={item} index={i} />
              </div>
              <button
                onClick={() => handleMoveToCart(item)}
                disabled={movingToCart === item.id}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#0A1F44] text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-[#2C3E6B] transition-all disabled:opacity-60 disabled:cursor-not-allowed shadow-xs cursor-pointer"
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

      {wishlistRecentIds.length > 0 && recentProducts.length > 0 && (
        <section className="mt-16">
          <div className="flex items-center gap-3 mb-6">
            <Clock size={18} className="text-[#C7CCD1]" />
            <h2 className="font-serif text-2xl font-bold text-[#0A1F44]">
              Recently Viewed
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 items-stretch">
            {recentProducts.slice(0, 8).map((product: any, i: number) => (
              <div key={product.id} className="h-full flex flex-col">
                <ProductCard product={product} index={i} />
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export default function Wishlist() {
  return <Layout><WishlistContent /></Layout>;
}
