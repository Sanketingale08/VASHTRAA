import React, { createContext, useContext, useState, useCallback, useRef } from "react";

type OrderStatusPatch = {
  status?: string;
  cancelReason?: string;
  returnReason?: string;
  refundStatus?: string;
  refundMethod?: string;
};

type OrdersContextValue = {
  patches: Record<string, OrderStatusPatch>;
  patchOrder: (orderId: string, patch: OrderStatusPatch) => void;
  invalidateAt: number;
  invalidate: () => void;
};

const OrdersContext = createContext<OrdersContextValue>({
  patches: {},
  patchOrder: () => {},
  invalidateAt: 0,
  invalidate: () => {},
});

export function OrdersProvider({ children }: { children: React.ReactNode }) {
  const [patches, setPatches] = useState<Record<string, OrderStatusPatch>>({});
  const [invalidateAt, setInvalidateAt] = useState(0);

  const patchOrder = useCallback((orderId: string, patch: OrderStatusPatch) => {
    setPatches(prev => ({ ...prev, [orderId]: { ...(prev[orderId] ?? {}), ...patch } }));
    setInvalidateAt(Date.now());
  }, []);

  const invalidate = useCallback(() => {
    setInvalidateAt(Date.now());
  }, []);

  return (
    <OrdersContext.Provider value={{ patches, patchOrder, invalidateAt, invalidate }}>
      {children}
    </OrdersContext.Provider>
  );
}

export function useOrdersContext() {
  return useContext(OrdersContext);
}
