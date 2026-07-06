import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useUser } from "@clerk/react";

interface WishlistContextType {
  wishlistedIds: Set<string>;
  toggle: (productId: string) => Promise<void>;
  isLoading: boolean;
}

const WishlistContext = createContext<WishlistContextType>({
  wishlistedIds: new Set(),
  toggle: async () => {},
  isLoading: false,
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  const [wishlistedIds, setWishlistedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  const fetchWishlist = useCallback(() => {
    setIsLoading(true);
    apiFetch("/api/wishlists/ids")
      .then((data) => setWishlistedIds(new Set(data.productIds)))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setWishlistedIds(new Set());
      return;
    }
    fetchWishlist();
  }, [isSignedIn, isLoaded, fetchWishlist]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchWishlist();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [isLoaded, isSignedIn, fetchWishlist]);

  const toggle = useCallback(async (productId: string) => {
    if (!isSignedIn) return;
    const isWishlisted = wishlistedIds.has(productId);
    setWishlistedIds((prev) => {
      const next = new Set(prev);
      if (isWishlisted) next.delete(productId);
      else next.add(productId);
      return next;
    });
    try {
      if (isWishlisted) {
        await apiFetch(`/api/wishlists/${productId}`, { method: "DELETE" });
      } else {
        await apiFetch(`/api/wishlists/${productId}`, { method: "POST" });
      }
    } catch {
      setWishlistedIds((prev) => {
        const next = new Set(prev);
        if (isWishlisted) next.add(productId);
        else next.delete(productId);
        return next;
      });
    }
  }, [isSignedIn, wishlistedIds]);

  return (
    <WishlistContext.Provider value={{ wishlistedIds, toggle, isLoading }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
