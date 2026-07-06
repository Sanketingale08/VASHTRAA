import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type { ProductSummary } from "@workspace/api-client-react";

const STORAGE_KEY = "@twirldrape_wishlist";

interface WishlistContextValue {
  wishlistIds: Set<string>;
  wishlistItems: ProductSummary[];
  isInWishlist: (id: string) => boolean;
  addToWishlist: (product: ProductSummary) => Promise<void>;
  removeFromWishlist: (id: string) => Promise<void>;
  toggleWishlist: (product: ProductSummary) => Promise<void>;
}

const WishlistContext = createContext<WishlistContextValue | null>(null);

export function WishlistProvider({ children }: { children: React.ReactNode }) {
  const [wishlistItems, setWishlistItems] = useState<ProductSummary[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as ProductSummary[];
          setWishlistItems(parsed);
        } catch {}
      }
    });
  }, []);

  const persist = useCallback(async (items: ProductSummary[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, []);

  const wishlistIds = new Set(wishlistItems.map((p) => p.id));

  const isInWishlist = useCallback(
    (id: string) => wishlistIds.has(id),
    [wishlistIds],
  );

  const addToWishlist = useCallback(
    async (product: ProductSummary) => {
      if (wishlistIds.has(product.id)) return;
      const next = [...wishlistItems, product];
      setWishlistItems(next);
      await persist(next);
    },
    [wishlistItems, wishlistIds, persist],
  );

  const removeFromWishlist = useCallback(
    async (id: string) => {
      const next = wishlistItems.filter((p) => p.id !== id);
      setWishlistItems(next);
      await persist(next);
    },
    [wishlistItems, persist],
  );

  const toggleWishlist = useCallback(
    async (product: ProductSummary) => {
      if (wishlistIds.has(product.id)) {
        await removeFromWishlist(product.id);
      } else {
        await addToWishlist(product);
      }
    },
    [wishlistIds, addToWishlist, removeFromWishlist],
  );

  return (
    <WishlistContext.Provider
      value={{
        wishlistIds,
        wishlistItems,
        isInWishlist,
        addToWishlist,
        removeFromWishlist,
        toggleWishlist,
      }}
    >
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be used inside WishlistProvider");
  return ctx;
}
