import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useUser } from "@clerk/react";

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  images: string[];
  vendorName: string;
  stock: number;
  quantity: number;
  category: string;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Omit<CartItem, "quantity">, qty?: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshStock: () => Promise<void>;
  totalItems: number;
  isDrawerOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextType>({
  items: [],
  addItem: async () => {},
  removeItem: async () => {},
  updateQuantity: async () => {},
  clearCart: async () => {},
  refreshStock: async () => {},
  totalItems: 0,
  isDrawerOpen: false,
  openDrawer: () => {},
  closeDrawer: () => {},
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const LS_KEY = "twirl_cart";

function loadLocalCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCart(items: CartItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {}
}

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded } = useUser();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const syncedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setItems(loadLocalCart());
      syncedRef.current = false;
      return;
    }
    if (syncedRef.current) return;
    syncedRef.current = true;

    const localItems = loadLocalCart();

    apiFetch("/api/cart")
      .then(async (data) => {
        const serverItems: CartItem[] = (data.items ?? []).map((r: any) => ({
          id: r.productId,
          productId: r.productId,
          name: r.name,
          price: r.price,
          originalPrice: r.originalPrice ?? null,
          images: r.images ?? [],
          vendorName: r.vendorName ?? "",
          stock: r.stock ?? 99,
          quantity: r.quantity,
          category: r.category ?? "",
        }));

        if (localItems.length > 0) {
          for (const localItem of localItems) {
            const serverHas = serverItems.find((s) => s.productId === localItem.productId);
            if (!serverHas) {
              try {
                await apiFetch(`/api/cart/${localItem.productId}`, {
                  method: "POST",
                  body: JSON.stringify({ quantity: localItem.quantity }),
                });
              } catch {}
            }
          }
          const merged = await apiFetch("/api/cart");
          const mergedItems: CartItem[] = (merged.items ?? []).map((r: any) => ({
            id: r.productId,
            productId: r.productId,
            name: r.name,
            price: r.price,
            originalPrice: r.originalPrice ?? null,
            images: r.images ?? [],
            vendorName: r.vendorName ?? "",
            stock: r.stock ?? 99,
            quantity: r.quantity,
            category: r.category ?? "",
          }));
          setItems(mergedItems);
          saveLocalCart(mergedItems);
        } else {
          setItems(serverItems);
          saveLocalCart(serverItems);
        }
      })
      .catch(() => {
        setItems(localItems);
      });
  }, [isSignedIn, isLoaded]);

  const addItem = useCallback(async (product: Omit<CartItem, "quantity">, qty = 1) => {
    if (product.stock <= 0) return;
    setItems((prev) => {
      const existing = prev.find((i) => i.productId === product.productId);
      let next: CartItem[];
      if (existing) {
        const newQty = Math.min(existing.quantity + qty, product.stock);
        if (newQty === existing.quantity) return prev;
        next = prev.map((i) =>
          i.productId === product.productId ? { ...i, quantity: newQty } : i
        );
      } else {
        next = [...prev, { ...product, quantity: Math.max(1, Math.min(qty, product.stock)) }];
      }
      saveLocalCart(next);
      return next;
    });
    setIsDrawerOpen(true);

    if (isSignedIn) {
      try {
        await apiFetch(`/api/cart/${product.productId}`, {
          method: "POST",
          body: JSON.stringify({ quantity: qty }),
        });
      } catch {}
    }
  }, [isSignedIn]);

  const removeItem = useCallback(async (productId: string) => {
    setItems((prev) => {
      const next = prev.filter((i) => i.productId !== productId);
      saveLocalCart(next);
      return next;
    });
    if (isSignedIn) {
      try {
        await apiFetch(`/api/cart/${productId}`, { method: "DELETE" });
      } catch {}
    }
  }, [isSignedIn]);

  const updateQuantity = useCallback(async (productId: string, quantity: number) => {
    if (quantity <= 0) {
      return removeItem(productId);
    }
    setItems((prev) => {
      const next = prev.map((i) =>
        i.productId === productId ? { ...i, quantity: Math.min(quantity, i.stock) } : i
      );
      saveLocalCart(next);
      return next;
    });
    if (isSignedIn) {
      try {
        await apiFetch(`/api/cart/${productId}`, {
          method: "PUT",
          body: JSON.stringify({ quantity }),
        });
      } catch {}
    }
  }, [isSignedIn, removeItem]);

  const clearCart = useCallback(async () => {
    setItems([]);
    saveLocalCart([]);
    if (isSignedIn) {
      try {
        await apiFetch("/api/cart", { method: "DELETE" });
      } catch {}
    }
  }, [isSignedIn]);

  const refreshStock = useCallback(async () => {
    setItems((current) => {
      if (current.length === 0) return current;
      const ids = current.map((i) => i.productId).join(",");
      apiFetch(`/api/products?ids=${encodeURIComponent(ids)}&limit=100`)
        .then((data) => {
          const products: any[] = data.products ?? [];
          const stockById = new Map(products.map((p) => [p.id, p.stock ?? 0]));
          setItems((prev) => {
            let changed = false;
            const next = prev.map((item) => {
              const liveStock = stockById.get(item.productId);
              if (liveStock === undefined || liveStock === item.stock) return item;
              changed = true;
              return {
                ...item,
                stock: liveStock,
                quantity: liveStock === 0 ? item.quantity : Math.min(item.quantity, liveStock),
              };
            });
            if (!changed) return prev;
            saveLocalCart(next);
            return next;
          });
        })
        .catch(() => {});
      return current;
    });
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items,
      addItem,
      removeItem,
      updateQuantity,
      clearCart,
      refreshStock,
      totalItems,
      isDrawerOpen,
      openDrawer: () => setIsDrawerOpen(true),
      closeDrawer: () => setIsDrawerOpen(false),
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  return useContext(CartContext);
}
