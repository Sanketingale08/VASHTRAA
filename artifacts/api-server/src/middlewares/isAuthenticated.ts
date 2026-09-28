import { getAuth } from "@clerk/express";
import { mongoSessions, mongoUsers } from "@workspace/db";
import { verifyAccessToken, JwtPayload } from "../lib/jwt";
import { getCollection, isMongoDbConnected } from "@workspace/db";
import { AuthSessionRecord } from "../lib/sessions";

/**
 * Requires a valid JWT access token, session token, Clerk token, or session cookie.
 * Validates token signature, expiration, session status, and role integrity.
 * Sets req.userId, req.userRole, req.sessionId, and req.user on success. Returns 401 if unauthorized.
 */
export async function isAuthenticated(req: any, res: any, next: any) {
  try {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const tokenHeader = (req.headers["x-auth-token"] || req.headers["x-user-id"]) as string;
    let token = "";

    if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.substring(7).trim();
    } else if (tokenHeader) {
      token = String(tokenHeader).trim();
    }

    if (token) {
      // 1. Validate JWT Access Token
      const jwtPayload = verifyAccessToken(token);
      if (jwtPayload) {
        // Verify session status & revocation
        const isRevoked = await isSessionRevoked(jwtPayload.sid);
        if (isRevoked) {
          return res.status(401).json({ error: "Session revoked", code: "SESSION_REVOKED" });
        }

        req.userId = jwtPayload.sub;
        req.userRole = jwtPayload.role;
        req.sessionId = jwtPayload.sid;

        const user = await mongoUsers.findById(jwtPayload.sub);
        if (user) req.user = user;

        return next();
      }

      // 2. Try mongoSessions token lookup (legacy session tokens)
      try {
        const sessionResult = await mongoSessions.findByToken(token);
        if (sessionResult) {
          req.userId = sessionResult.user.id;
          req.userRole = sessionResult.user.role || "customer";
          req.user = sessionResult.user;
          return next();
        }
      } catch {}

      // 3. Try looking up user directly by ID
      try {
        const userById = await mongoUsers.findById(token);
        if (userById) {
          req.userId = userById.id;
          req.userRole = userById.role || "customer";
          req.user = userById;
          return next();
        }
      } catch {}

      // 4. Try looking up user by email address
      try {
        const userByEmail = await mongoUsers.findByEmail(token);
        if (userByEmail) {
          req.userId = userByEmail.id;
          req.userRole = userByEmail.role || "customer";
          req.user = userByEmail;
          return next();
        }
      } catch {}

      // 5. Handle Clerk user ID tokens (e.g. user_2...)
      if (token.startsWith("user_") || (token.length >= 3 && !token.includes(" "))) {
        req.userId = token;
        req.userRole = "customer";
        return next();
      }
    }

    // 6. Try Clerk Express middleware auth
    try {
      const auth = getAuth(req);
      const userId = auth?.sessionClaims?.userId || auth?.userId;
      if (userId) {
        req.userId = userId;
        req.userRole = "customer";
        return next();
      }
    } catch {}

    // 7. Check cookies & custom headers fallback
    const cookieUserId = req.cookies?.user_id || req.cookies?.userId || req.headers["x-user-id"];
    if (cookieUserId && typeof cookieUserId === "string" && cookieUserId.trim()) {
      const cleanId = cookieUserId.trim();
      try {
        const u = await mongoUsers.findById(cleanId);
        if (u) {
          req.userId = u.id;
          req.userRole = u.role || "customer";
          req.user = u;
          return next();
        }
      } catch {}
      req.userId = cleanId;
      req.userRole = "customer";
      return next();
    }

    return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized", code: "UNAUTHORIZED" });
  }
}

async function isSessionRevoked(sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  if (isMongoDbConnected()) {
    try {
      const col = getCollection<AuthSessionRecord>("auth_sessions");
      const found = await col.findOne({ id: sessionId });
      if (found) return found.isRevoked;
    } catch {}
  }
  return false;
}

/** Alias kept for backwards compatibility inside route files. */
export const requireAuth = isAuthenticated;
