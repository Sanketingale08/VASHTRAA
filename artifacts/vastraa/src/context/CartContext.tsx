import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "./AuthContext";
import { apiFetch as globalApiFetch } from "@/lib/api";

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  price: number;
  basePrice?: number | null;
  shippingFee?: number | null;
  originalPrice?: number | null;
  images: string[];
  vendorName: string;
  stock: number;
  quantity: number;
  category: string;
}

export interface StockAdjustment {
  productId: string;
  name: string;
  previousQuantity: number;
  newQuantity: number;
  currentStock: number;
  nowOutOfStock: boolean;
}

interface CartContextType {
  items: CartItem[];
  addItem: (product: Omit<CartItem, "quantity">, qty?: number) => Promise<void>;
  removeItem: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshStock: () => Promise<StockAdjustment[]>;
  totalItems: number;
  isLoading: boolean;
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
  refreshStock: async () => [],
  totalItems: 0,
  isLoading: true,
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
  const res = await globalApiFetch(path, options);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const syncedRef = useRef(false);
  const itemsRef = useRef<CartItem[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    const currentUserId = user?.id || null;
    if (lastUserIdRef.current !== currentUserId) {
      syncedRef.current = false;
      lastUserIdRef.current = currentUserId;
    }

    if (!isSignedIn) {
      setItems(loadLocalCart());
      syncedRef.current = false;
      setIsLoading(false);
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
          basePrice: r.basePrice ?? (r.price ? Math.round(r.price / 1.155) : null),
          shippingFee: r.shippingFee ?? 100,
          originalPrice: r.originalPrice ?? null,
          images: r.images ?? [],
          vendorName: r.vendorName ?? "",
          stock: r.stock ?? 99,
          quantity: r.quantity,
          category: r.category ?? "",
        }));

        if (localItems.length > 0) {
          const itemsToSync = localItems.filter(
            (localItem) => !serverItems.some((s) => s.productId === localItem.productId)
          );
          if (itemsToSync.length > 0) {
            await Promise.allSettled(
              itemsToSync.map((item) =>
                apiFetch(`/api/cart/${item.productId}`, {
                  method: "POST",
                  body: JSON.stringify({ quantity: item.quantity }),
                }).catch(() => {})
              )
            );
          }
          const merged = await apiFetch("/api/cart");
          const mergedItems: CartItem[] = (merged.items ?? []).map((r: any) => ({
            id: r.productId,
            productId: r.productId,
            name: r.name,
            price: r.price,
            basePrice: r.basePrice ?? (r.price ? Math.round(r.price / 1.155) : null),
            shippingFee: r.shippingFee ?? 100,
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
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [isSignedIn, isLoaded, user?.id]);

  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (!detail) return;
      if (detail.name === "cart:updated" || detail.name === "cart:cleared" || detail.name === "order:created") {
        if (isSignedIn) {
          apiFetch("/api/cart")
            .then((data) => {
              const serverItems: CartItem[] = (data.items ?? []).map((r: any) => ({
                id: r.productId,
                productId: r.productId,
                name: r.name,
                price: r.price,
                basePrice: r.basePrice ?? (r.price ? Math.round(r.price / 1.155) : null),
                shippingFee: r.shippingFee ?? 100,
                originalPrice: r.originalPrice ?? null,
                images: r.images ?? [],
                vendorName: r.vendorName ?? "",
                stock: r.stock ?? 99,
                quantity: r.quantity,
                category: r.category ?? "",
              }));
              setItems(serverItems);
              saveLocalCart(serverItems);
            })
            .catch(() => {});
        }
      }
    };
    window.addEventListener("vastraa-realtime-event", handleRealtime);
    return () => window.removeEventListener("vastraa-realtime-event", handleRealtime);
  }, [isSignedIn]);

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

  const refreshStock = useCallback(async (): Promise<StockAdjustment[]> => {
    const current = itemsRef.current;
    if (current.length === 0) return [];
    const ids = current.map((i) => i.productId).join(",");
    try {
      const data = await apiFetch(`/api/products?ids=${encodeURIComponent(ids)}&limit=100`);
      const products: any[] = data.products ?? [];
      const liveProductMap = new Map(products.map((p) => [p.id, p]));
      const adjustments: StockAdjustment[] = [];
      let anyChange = false;

      const next = current.map((item) => {
        const liveProd = liveProductMap.get(item.productId);
        if (!liveProd) return item;

        const liveStock = liveProd.stock ?? 0;
        const livePrice = liveProd.price ?? item.price;
        const liveOrigPrice = liveProd.originalPrice ?? null;
        const liveName = liveProd.name || item.name;
        const liveImages = Array.isArray(liveProd.images) && liveProd.images.length > 0 ? liveProd.images : item.images;
        const liveVendorName = liveProd.vendorName || item.vendorName;

        const cappedQty = Math.min(item.quantity, liveStock);
        if (cappedQty !== item.quantity) {
          adjustments.push({
            productId: item.productId,
            name: liveName,
            previousQuantity: item.quantity,
            newQuantity: cappedQty,
            currentStock: liveStock,
            nowOutOfStock: liveStock === 0,
          });
        }

        const priceChanged = livePrice !== item.price || liveOrigPrice !== item.originalPrice;
        const nameChanged = liveName !== item.name;
        const stockChanged = liveStock !== item.stock || cappedQty !== item.quantity;

        if (!priceChanged && !nameChanged && !stockChanged) return item;

        anyChange = true;
        return {
          ...item,
          name: liveName,
          price: livePrice,
          originalPrice: liveOrigPrice,
          images: liveImages,
          vendorName: liveVendorName,
          stock: liveStock,
          quantity: cappedQty,
        };
      });

      if (anyChange) {
        setItems(next);
        saveLocalCart(next);
        if (isSignedIn) {
          for (const adj of adjustments) {
            if (!adj.nowOutOfStock && adj.newQuantity !== adj.previousQuantity) {
              try {
                await apiFetch(`/api/cart/${adj.productId}`, {
                  method: "PUT",
                  body: JSON.stringify({ quantity: adj.newQuantity }),
                });
              } catch {}
            }
          }
        }
      }

      return adjustments;
    } catch {
      return [];
    }
  }, [isSignedIn]);

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
      isLoading,
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
