import React from "react";
import { Layout } from "@/components/Layout";
import { useWishlist } from "@/context/WishlistContext";
import { useUser, useClerk } from "@clerk/react";
import { Heart, LogIn, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ProductCard } from "@/components/ProductCard";
import type { ProductSummary } from "@workspace/api-client-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const basePath = BASE;

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
  const { isSignedIn, isLoaded, user } = useUser();
  const { wishlistedIds } = useWishlist();
  const { data, isLoading, isError } = useWishlistItems(!!isSignedIn);

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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {items.map((item, i) => (
              <ProductCard key={item.id} product={item} index={i} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
