import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuth } from "./AuthContext";

interface RealtimeEvent {
  name: string;
  data: any;
  timestamp: number;
}

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
  lastEvent: RealtimeEvent | null;
  joinRoom: (room: string) => void;
  leaveRoom: (room: string) => void;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  isConnected: false,
  lastEvent: null,
  joinRoom: () => {},
  leaveRoom: () => {},
});

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null);

  useEffect(() => {
    const token = localStorage.getItem("vastraa_auth_token") || localStorage.getItem("clerk_user_id");
    const adminKey =
      sessionStorage.getItem("td_admin_key") ||
      localStorage.getItem("td_admin_key") ||
      localStorage.getItem("admin_key") ||
      "Admin@123";
    const adminSessionToken =
      sessionStorage.getItem("td_admin_session_token") ||
      localStorage.getItem("td_admin_session_token") ||
      undefined;

    // Initialize Socket.IO connection
    const socketInstance = io(window.location.origin, {
      path: "/socket.io",
      auth: {
        token: token || undefined,
        adminKey: adminKey || undefined,
        adminSessionToken,
      },
      extraHeaders: {
        "x-admin-key": adminKey,
        ...(adminSessionToken ? { "x-admin-session-token": adminSessionToken } : {}),
      },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 15,
      reconnectionDelay: 1500,
      reconnectionDelayMax: 5000,
    });

    socketInstance.on("connect", () => {
      setIsConnected(true);
      console.log("[SocketIO] Connected to backend real-time server");
    });

    socketInstance.on("disconnect", (reason: unknown) => {
      setIsConnected(false);
      console.log("[SocketIO] Disconnected from real-time server:", reason);
    });

    socketInstance.on("connect_error", (err: { message?: string }) => {
      setIsConnected(false);
      console.warn("[SocketIO] Connection notice:", err?.message || err);
    });

    // Real-Time Event Listeners & UI State Dispatchers
    const eventNames = [
      "product:created",
      "product:updated",
      "product:deleted",
      "inventory:updated",
      "product:status_changed",
      "vendor:registered",
      "vendor:approved",
      "vendor:rejected",
      "vendor:updated",
      "shop:updated",
      "order:created",
      "order:status_changed",
      "order:cancelled",
      "payment:status_updated",
      "return:created",
      "return:updated",
      "return:approved",
      "refund:processed",
      "refund:approved",
      "dispute:updated",
      "financials:updated",
      "settlement:processed",
      "settlement:created",
      "commission_rule:updated",
      "payment:updated",
      "order:financials_updated",
      "vendor:analytics_updated",
      "analytics:updated",
      "notification:new",
      "support:ticket_created",
      "support:message_added",
      "support:status_changed",
      "coupon:created",
      "coupon:updated",
      "coupon:changed",
      "coupon:redeemed",
      "coupon:expired",
      "catalog:updated",
      "address:created",
      "address:updated",
      "address:deleted",
      "payment_method:created",
      "payment_method:updated",
      "payment_method:deleted",
      "cart:updated",
      "cart:cleared",
      "wishlist:updated",
      "reward:updated",
      "profile:updated",
    ];

    eventNames.forEach((eventName) => {
      socketInstance.on(eventName, (data: any) => {
        const eventObj: RealtimeEvent = { name: eventName, data, timestamp: Date.now() };
        setLastEvent(eventObj);

        // Dispatch a window event so any UI component can hook into real-time changes
        window.dispatchEvent(new CustomEvent("vastraa-realtime-event", { detail: eventObj }));
      });
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [user]);

  const joinRoom = useCallback(
    (room: string) => {
      if (socket && isConnected) {
        socket.emit("room:join", { room });
      }
    },
    [socket, isConnected]
  );

  const leaveRoom = useCallback(
    (room: string) => {
      if (socket && isConnected) {
        socket.emit("room:leave", { room });
      }
    },
    [socket, isConnected]
  );

  return (
    <SocketContext.Provider value={{ socket, isConnected, lastEvent, joinRoom, leaveRoom }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket(): SocketContextType {
  return useContext(SocketContext);
}
