import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch as globalApiFetch } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

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

async function apiFetch(path: string, options?: RequestInit) {
  const res = await globalApiFetch(path, options);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
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
    if (authLoading) return;
    if (!isSignedIn) {
      setWishlistedIds(new Set());
      return;
    }
    fetchWishlist();
  }, [isSignedIn, authLoading, fetchWishlist]);

  useEffect(() => {
    if (authLoading || !isSignedIn) return;
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchWishlist();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [authLoading, isSignedIn, fetchWishlist]);

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (detail.name === "wishlist:updated") {
        if (isSignedIn) {
          fetchWishlist();
          qc.invalidateQueries({ queryKey: ["wishlist-items"] });
          qc.invalidateQueries({ queryKey: ["dashboard-wishlist-ids"] });
        }
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [isSignedIn, fetchWishlist, qc]);

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
      qc.invalidateQueries({ queryKey: ["wishlist-items"] });
      qc.invalidateQueries({ queryKey: ["dashboard-wishlist-ids"] });
      window.dispatchEvent(new CustomEvent("vastraa-realtime-event", {
        detail: { name: "wishlist:updated", data: { productId } }
      }));
    } catch {
      setWishlistedIds((prev) => {
        const next = new Set(prev);
        if (isWishlisted) next.add(productId);
        else next.delete(productId);
        return next;
      });
      toast({
        variant: "destructive",
        title: isWishlisted ? "Could not remove from wishlist" : "Could not add to wishlist",
        description: "Something went wrong. Please try again.",
      });
    }
  }, [isSignedIn, wishlistedIds, toast, qc]);

  return (
    <WishlistContext.Provider value={{ wishlistedIds, toggle, isLoading }}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  return useContext(WishlistContext);
}
