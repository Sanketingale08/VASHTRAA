import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "@twirldrape_cart";

export interface CartItem {
  productId: string;
  name: string;
  price: number;
  originalPrice?: number | null;
  basePrice?: number | null;
  shippingFee?: number | null;
  quantity: number;
  images: string[];
  vendorName: string;
}

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  addToCart: (item: Omit<CartItem, "quantity">) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  clearCart: () => Promise<void>;
  isInCart: (productId: string) => boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CartItem[];
          setItems(parsed);
        } catch {}
      }
    });
  }, []);

  const persist = useCallback(async (next: CartItem[]) => {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const addToCart = useCallback(
    async (item: Omit<CartItem, "quantity">) => {
      setItems((prev) => {
        const existing = prev.find((i) => i.productId === item.productId);
        const next = existing
          ? prev.map((i) =>
              i.productId === item.productId
                ? { ...i, quantity: i.quantity + 1 }
                : i
            )
          : [...prev, { ...item, quantity: 1 }];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const removeFromCart = useCallback(
    async (productId: string) => {
      setItems((prev) => {
        const next = prev.filter((i) => i.productId !== productId);
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const updateQuantity = useCallback(
    async (productId: string, quantity: number) => {
      if (quantity < 1) {
        return removeFromCart(productId);
      }
      setItems((prev) => {
        const next = prev.map((i) =>
          i.productId === productId ? { ...i, quantity } : i
        );
        persist(next);
        return next;
      });
    },
    [persist, removeFromCart]
  );

  const clearCart = useCallback(async () => {
    setItems([]);
    await AsyncStorage.removeItem(STORAGE_KEY);
  }, []);

  const isInCart = useCallback(
    (productId: string) => items.some((i) => i.productId === productId),
    [items]
  );

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart,
        isInCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
