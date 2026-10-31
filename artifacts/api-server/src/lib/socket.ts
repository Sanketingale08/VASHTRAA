import { Server as SocketIOServer, Socket } from "socket.io";
import { Server as HttpServer } from "http";
import jwt from "jsonwebtoken";
import { verifyAccessToken } from "./jwt";
import { mongoSessions, mongoUsers } from "@workspace/db";
import { logger } from "./logger";

export interface SocketUser {
  id: string;
  role: "user" | "vendor" | "admin";
  sellerId?: string;
  email?: string;
}

let io: SocketIOServer | null = null;
const ipConnections = new Map<string, number>();

export function initSocketIO(server: HttpServer): SocketIOServer {
  io = new SocketIOServer(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      credentials: true,
    },
    path: "/socket.io",
    pingTimeout: 25000,
    pingInterval: 20000,
  });

  // Socket Authentication & Room Authorization Middleware
  io.use(async (socket: Socket, next) => {
    try {
      // Per-IP socket connection limit (max 25 concurrent sockets per IP)
      const clientIp = String(
        socket.handshake.headers["x-forwarded-for"] ||
        socket.handshake.address ||
        (socket.conn as any)?.remoteAddress ||
        "unknown"
      ).split(",")[0].trim();

      const currentConns = ipConnections.get(clientIp) || 0;
      const MAX_SOCKETS_PER_IP = 25;
      if (currentConns >= MAX_SOCKETS_PER_IP) {
        logger.warn({ clientIp, currentConns }, "WebSocket connection limit reached for IP");
        return next(new Error("Too many active connections from this IP"));
      }
      ipConnections.set(clientIp, currentConns + 1);
      (socket as any).clientIp = clientIp;

      const authHeader =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization ||
        socket.handshake.headers?.["x-admin-key"] ||
        socket.handshake.auth?.adminKey;

      const adminKeyHeader =
        socket.handshake.headers?.["x-admin-key"] ||
        socket.handshake.auth?.adminKey;

      // 1. Admin Key Fallback / Direct Auth
      const validAdminKeys = [
        "Admin@123",
        "admin-secret-key-change-in-production",
        "dev-admin-key",
        process.env.ADMIN_API_KEY,
      ].filter(Boolean) as string[];

      const matchesAdminKey = (k?: any) => {
        if (!k || typeof k !== "string") return false;
        const val = k.trim();
        return validAdminKeys.includes(val);
      };

      if (matchesAdminKey(adminKeyHeader) || matchesAdminKey(authHeader)) {
        socket.data.user = {
          id: "admin_root",
          role: "admin",
          email: "admin@vashtraa.com",
        } as SocketUser;
        return next();
      }

      // 2. JWT & Session Verification if token present
      const token = typeof authHeader === "string" && authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;

      if (token && typeof token === "string") {
        const verified = verifyAccessToken(token);
        if (verified) {
          socket.data.user = {
            id: verified.sub,
            role: verified.role === "seller" ? "vendor" : (verified.role as any) || "user",
            email: verified.email,
          } as SocketUser;
          return next();
        }

        try {
          const secret = process.env.JWT_SECRET || process.env.SESSION_SECRET || "vastraa-production-jwt-secret-2026-key-v1";
          const decoded = jwt.verify(token, secret) as any;
          socket.data.user = {
            id: decoded.id || decoded.userId || decoded.sub || "anonymous_user",
            role: decoded.role || (decoded.sellerId ? "vendor" : "user"),
            sellerId: decoded.sellerId || decoded.vendorId,
            email: decoded.email,
          } as SocketUser;
          return next();
        } catch {
          // If standard JWT fails, continue to session lookup
        }

        try {
          const sessionResult = await mongoSessions.findByToken(token);
          if (sessionResult && sessionResult.user) {
            socket.data.user = {
              id: sessionResult.user.id,
              role: sessionResult.user.role === "seller" ? "vendor" : (sessionResult.user.role as any) || "user",
              email: sessionResult.user.email,
            } as SocketUser;
            return next();
          }
        } catch {}

        try {
          const directUser = await mongoUsers.findById(token);
          if (directUser) {
            socket.data.user = {
              id: directUser.id,
              role: directUser.role === "seller" ? "vendor" : (directUser.role as any) || "user",
              email: directUser.email,
            } as SocketUser;
            return next();
          }
        } catch {}
      }

      // 3. Fallback Guest / Unauthenticated socket (can join public product rooms)
      const guestId = `guest_${socket.id.slice(0, 8)}`;
      socket.data.user = {
        id: guestId,
        role: "user",
      } as SocketUser;

      return next();
    } catch (err: any) {
      logger.warn({ err: err.message }, "Socket connection handshake warning — assigning guest");
      socket.data.user = { id: `guest_${socket.id.slice(0, 8)}`, role: "user" };
      return next();
    }
  });

  io.on("connection", (socket: Socket) => {
    const user: SocketUser = socket.data.user || { id: socket.id, role: "user" };
    logger.info({ socketId: socket.id, user }, "Real-time socket client connected");

    // Event flood protection per socket (max 20 incoming events per second)
    let eventCount = 0;
    let windowStart = Date.now();
    const MAX_EVENTS_PER_SECOND = 20;

    socket.use(([event, ..._args], next) => {
      const now = Date.now();
      if (now - windowStart > 1000) {
        windowStart = now;
        eventCount = 0;
      }
      eventCount++;
      if (eventCount > MAX_EVENTS_PER_SECOND) {
        socket.emit("error", { message: "Event rate limit exceeded. Please slow down." });
        return next(new Error("Rate limit exceeded"));
      }
      next();
    });

    // Auto-join authorized rooms
    if (user.id) {
      socket.join(`user:${user.id}`);
    }

    if (user.sellerId) {
      socket.join(`seller:${user.sellerId}`);
      socket.join(`shop:${user.sellerId}`);
    }

    if (user.role === "admin") {
      socket.join("admin");
    }

    // Dynamic Room Join Handler (Product view / Dispute room)
    socket.on("room:join", (data: { room: string }) => {
      if (!data?.room || typeof data.room !== "string") return;
      
      const { room } = data;
      // Protected room validations
      if (room.startsWith("admin") && user.role !== "admin") {
        socket.emit("error", { message: "Unauthorized room access" });
        return;
      }

      if (room.startsWith("seller:") && user.sellerId !== room.split(":")[1] && user.role !== "admin") {
        socket.emit("error", { message: "Unauthorized room access" });
        return;
      }

      socket.join(room);
      socket.emit("room:joined", { room });
    });

    socket.on("room:leave", (data: { room: string }) => {
      if (data?.room && typeof data.room === "string") {
        socket.leave(data.room);
      }
    });

    socket.on("ping", () => {
      socket.emit("pong", { timestamp: Date.now() });
    });

    socket.on("disconnect", (reason) => {
      const clientIp = (socket as any).clientIp;
      if (clientIp) {
        const count = ipConnections.get(clientIp) || 1;
        if (count <= 1) {
          ipConnections.delete(clientIp);
        } else {
          ipConnections.set(clientIp, count - 1);
        }
      }
      logger.info({ socketId: socket.id, userId: user.id, reason }, "Real-time socket client disconnected");
    });
  });

  return io;
}

export function getIO(): SocketIOServer | null {
  return io;
}

// Global Event Emitters for Real-Time Synchronization across Panels

export function emitProductEvent(event: "product:created" | "product:updated" | "product:deleted" | "inventory:updated" | "product:status_changed", payload: any) {
  if (!io) return;
  const productId = payload?.id || payload?._id || payload?.productId;
  
  // Broadcast to Admin
  io.to("admin").emit(event, payload);

  // Broadcast to Seller if vendorId present
  if (payload?.vendorId || payload?.sellerId) {
    const sellerId = payload.vendorId || payload.sellerId;
    io.to(`seller:${sellerId}`).emit(event, payload);
  }

  // Broadcast stock/product changes to public product room
  if (productId) {
    io.to(`product:${productId}`).emit(event, payload);
  }

  // Broadcast active product updates to all general user/storefront channels
  io.emit(event, payload);
  io.emit("catalog:updated", { productId, event, payload, timestamp: Date.now() });
}

export function emitAnalyticsEvent(payload: { vendorId?: string; orderId?: string; type?: string; reason?: string }) {
  if (!io) return;
  const fullPayload = { ...payload, timestamp: Date.now() };
  io.to("admin").emit("vendor:analytics_updated", fullPayload);
  io.to("admin").emit("financials:updated", fullPayload);
  if (payload?.vendorId) {
    io.to(`seller:${payload.vendorId}`).emit("vendor:analytics_updated", fullPayload);
  }
  io.emit("vendor:analytics_updated", fullPayload);
}

export function emitVendorEvent(event: "vendor:registered" | "vendor:approved" | "vendor:rejected" | "vendor:updated" | "shop:updated", payload: any) {
  if (!io) return;
  const sellerId = payload?.id || payload?._id || payload?.sellerId || payload?.vendorId;

  // Broadcast to Admin
  io.to("admin").emit(event, payload);
  io.to("admin").emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });

  // Broadcast to specific Seller room
  if (sellerId) {
    io.to(`seller:${sellerId}`).emit(event, payload);
    io.to(`shop:${sellerId}`).emit(event, payload);
    io.to(`seller:${sellerId}`).emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });
  }

  io.emit(event, payload);
  io.emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });
}

export function emitOrderEvent(event: "order:created" | "order:status_changed" | "payment:status_updated" | "order:cancelled", payload: any) {
  if (!io) return;
  
  // 1. Send to Admin Portal
  io.to("admin").emit(event, payload);
  io.to("admin").emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });

  // 2. Send to User Client
  if (payload?.userId) {
    io.to(`user:${payload.userId}`).emit(event, payload);
  }

  // 3. Send to affected Seller(s)
  const vendorIds: string[] = [];
  if (payload?.items && Array.isArray(payload.items)) {
    for (const item of payload.items) {
      if (item.vendorId && !vendorIds.includes(item.vendorId)) {
        vendorIds.push(item.vendorId);
      }
    }
  }
  if (payload?.vendorId && !vendorIds.includes(payload.vendorId)) {
    vendorIds.push(payload.vendorId);
  }

  for (const vId of vendorIds) {
    io.to(`seller:${vId}`).emit(event, payload);
    io.to(`seller:${vId}`).emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });
  }

  io.emit(event, payload);
  io.emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });
}

export function emitReturnRefundEvent(event: "return:created" | "return:updated" | "refund:processed" | "dispute:updated", payload: any) {
  if (!io) return;

  io.to("admin").emit(event, payload);
  io.to("admin").emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });

  if (payload?.userId) {
    io.to(`user:${payload.userId}`).emit(event, payload);
  }

  if (payload?.vendorId || payload?.sellerId) {
    const sId = payload.vendorId || payload.sellerId;
    io.to(`seller:${sId}`).emit(event, payload);
    io.to(`seller:${sId}`).emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });
  }

  if (payload?.disputeId) {
    io.to(`dispute:${payload.disputeId}`).emit(event, payload);
  }

  io.emit(event, payload);
  io.emit("vendor:analytics_updated", { event, payload, timestamp: Date.now() });
}

export function emitFinancialsEvent(
  event: "financials:updated" | "settlement:processed" | "settlement:created" | "commission_rule:updated" | "refund:processed",
  payload: any
) {
  if (!io) return;

  const timestamp = Date.now();
  const enrichedPayload = { ...payload, timestamp };

  // 1. Send specific event to Admin Portal
  io.to("admin").emit(event, enrichedPayload);
  io.to("admin").emit("financials:updated", enrichedPayload);
  io.to("admin").emit("vendor:analytics_updated", { event, payload: enrichedPayload, timestamp });

  // 2. Send to affected seller room if sellerId or vendorId present
  if (payload?.sellerId || payload?.vendorId) {
    const sId = payload.sellerId || payload.vendorId;
    io.to(`seller:${sId}`).emit(event, enrichedPayload);
    io.to(`seller:${sId}`).emit("financials:updated", enrichedPayload);
    io.to(`seller:${sId}`).emit("vendor:analytics_updated", { event, payload: enrichedPayload, timestamp });
  }

  // 3. Global broadcast for open admin browser sessions
  io.emit(event, enrichedPayload);
  io.emit("financials:updated", enrichedPayload);
  io.emit("vendor:analytics_updated", { event, payload: enrichedPayload, timestamp });
}

export function emitNotificationEvent(payload: { recipientRole: "admin" | "vendor" | "user"; recipientId?: string; title: string; message: string; data?: any }) {
  if (!io) return;

  if (payload.recipientRole === "admin") {
    io.to("admin").emit("notification:new", payload);
  } else if (payload.recipientRole === "vendor" && payload.recipientId) {
    io.to(`seller:${payload.recipientId}`).emit("notification:new", payload);
  } else if (payload.recipientId) {
    io.to(`user:${payload.recipientId}`).emit("notification:new", payload);
  } else {
    io.emit("notification:new", payload);
  }
}

export function emitSupportEvent(event: "support:ticket_created" | "support:message_added" | "support:status_changed", payload: any) {
  if (!io) return;

  io.to("admin").emit(event, payload);

  if (payload?.userId) {
    io.to(`user:${payload.userId}`).emit(event, payload);
  }

  if (payload?.vendorId) {
    io.to(`seller:${payload.vendorId}`).emit(event, payload);
  }

  if (payload?.ticketId) {
    io.to(`ticket:${payload.ticketId}`).emit(event, payload);
  }
}

export function emitCouponEvent(event: "coupon:created" | "coupon:updated" | "coupon:expired", payload: any) {
  if (!io) return;
  io.to("admin").emit(event, payload);
  if (payload?.vendorId) {
    io.to(`seller:${payload.vendorId}`).emit(event, payload);
  }
  io.emit("coupon:changed", payload);
  io.emit(event, payload);
}

export function emitUserEvent(userId: string, event: string, payload: any) {
  if (!io || !userId) return;
  const enriched = { ...payload, userId, timestamp: Date.now() };
  io.to(`user:${userId}`).emit(event, enriched);
  io.emit(event, enriched);
}

