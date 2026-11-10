import { getAuth } from "@clerk/express";
import { db, vendorsTable, mongoVendors, mongoSellers, mongoUsers, eq, or, getCanonicalSellerId } from "@workspace/db";
import { verifyAccessToken } from "../lib/jwt";
import { findSessionInStore } from "../lib/sessions";
import { logger } from "../lib/logger";

const safeEq = (a: any, b: any) => (typeof eq === "function" ? eq(a, b) : { a, b });
const safeOr = (...args: any[]) => (typeof or === "function" ? or(...args) : { args });

export async function requireVendorAuth(req: any, res: any, next: any) {
  let userId: string | null = null;
  let role: string | null = null;
  let email: string | null = null;

  // 1. Check Bearer / Cookie JWT
  const authHeader = req.headers?.authorization || req.headers?.Authorization;
  let token = "";

  if (authHeader && typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7).trim();
  } else if (req.headers?.["x-seller-token"]) {
    token = String(req.headers["x-seller-token"]).trim();
  } else if (req.cookies?.vastraa_seller_token || req.cookies?.vastraa_auth_token || req.cookies?.seller_token || req.cookies?.token) {
    token = String(req.cookies.vastraa_seller_token || req.cookies.vastraa_auth_token || req.cookies.seller_token || req.cookies.token).trim();
  }

  if (token) {
    const jwtPayload = verifyAccessToken(token);
    if (jwtPayload) {
      if (jwtPayload.role === "customer") {
        return res.status(403).json({ error: "Forbidden: Customer tokens cannot access vendor portal", code: "ROLE_MISMATCH" });
      }

      if (jwtPayload.sid) {
        const sessionRecord = await findSessionInStore(jwtPayload.sid);
        if (sessionRecord && (sessionRecord.isRevoked || new Date(sessionRecord.expiresAt).getTime() < Date.now())) {
          return res.status(401).json({ error: "Session revoked or expired", code: "SESSION_REVOKED" });
        }
      }

      userId = jwtPayload.sub;
      role = jwtPayload.role || "seller";
      if (jwtPayload.email) {
        email = String(jwtPayload.email).trim().toLowerCase();
      }
    } else {
      return res.status(401).json({ error: "Access token expired or invalid", code: "TOKEN_EXPIRED" });
    }
  }

  // 2. Check Clerk Auth if JWT not present
  if (!userId) {
    try {
      const auth = getAuth(req);
      const clerkId = auth?.sessionClaims?.userId || auth?.userId;
      if (clerkId && typeof clerkId === "string" && clerkId.trim()) {
        userId = clerkId.trim();
        role = "seller";
        if (auth?.sessionClaims?.email) {
          email = String(auth.sessionClaims.email).trim().toLowerCase();
        }
      }
    } catch {}
  }

  // 3. Reject if unauthenticated
  if (!userId) {
    return res.status(401).json({
      error: "Authentication required. Please log in as a seller.",
      code: "UNAUTHORIZED",
    });
  }

  req.userId = userId;
  req.userRole = role || "seller";

  try {
    let vendor: any = null;
    let userRecord: any = null;

    // Strategy A: Direct MongoDB vendor lookup by userId (ownerId, id, sellerId, vendorId)
    try {
      if (mongoSellers) {
        vendor = (await mongoSellers.findByOwnerId?.(userId)) ||
                 (await mongoSellers.findById?.(userId)) ||
                 (await mongoSellers.findBySellerId?.(userId)) ||
                 (await mongoSellers.findByVendorId?.(userId));
      }
      if (!vendor && mongoVendors && mongoVendors !== mongoSellers) {
        vendor = (await mongoVendors.findByOwnerId?.(userId)) ||
                 (await mongoVendors.findById?.(userId)) ||
                 (await mongoVendors.findBySellerId?.(userId)) ||
                 (await mongoVendors.findByVendorId?.(userId));
      }
    } catch {}

    // Strategy B: Resolve user account via mongoUsers to bridge user ID -> seller identity
    if (!vendor && userId) {
      try {
        if (mongoUsers?.findById) {
          userRecord = await mongoUsers.findById(userId);
          if (userRecord) {
            if (!email && userRecord.email) {
              email = String(userRecord.email).trim().toLowerCase();
            }
            if (mongoSellers) {
              if (userRecord.vendorId) {
                vendor = (await mongoSellers.findById?.(userRecord.vendorId)) ||
                         (await mongoSellers.findByVendorId?.(userRecord.vendorId));
              }
              if (!vendor && userRecord.sellerId) {
                vendor = (await mongoSellers.findById?.(userRecord.sellerId)) ||
                         (await mongoSellers.findBySellerId?.(userRecord.sellerId));
              }
              if (!vendor && userRecord.id && userRecord.id !== userId) {
                vendor = await mongoSellers.findByOwnerId?.(userRecord.id);
              }
            }
          }
        }
      } catch {}
    }

    // Strategy C: Lookup vendor by verified account email in MongoDB
    if (!vendor && email) {
      try {
        if (mongoSellers?.findByEmail) {
          vendor = await mongoSellers.findByEmail(email);
        }
        if (!vendor && mongoVendors?.findByEmail && mongoVendors !== mongoSellers) {
          vendor = await mongoVendors.findByEmail(email);
        }

        // Safe profile association: if vendor found by verified email but ownerId is empty, link ownerId
        if (vendor && !vendor.ownerId && userId && userId !== email && mongoSellers?.update) {
          vendor.ownerId = userId;
          mongoSellers.update(vendor.id, { ownerId: userId }).catch(() => {});
        }
      } catch {}
    }

    // Strategy D: Lookup vendor in PostgreSQL vendorsTable (with UUID type safety)
    if (!vendor && db && vendorsTable) {
      try {
        const isUuid = Boolean(userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId));
        const conditions: any[] = [];
        if (userId) {
          conditions.push(safeEq(vendorsTable.ownerId, userId));
          if (isUuid) {
            conditions.push(safeEq(vendorsTable.id, userId));
          }
        }
        if (email && vendorsTable.contactEmail) {
          conditions.push(safeEq(vendorsTable.contactEmail, email));
        }

        if (conditions.length > 0) {
          const rows = await db
            .select()
            .from(vendorsTable)
            .where(safeOr(...conditions))
            .limit(1);

          if (rows && rows.length > 0) {
            vendor = rows[0];
            // Resilient sync to mongoSellers for subsequent queries
            if (mongoSellers?.insert) {
              mongoSellers.insert({
                id: vendor.id,
                name: vendor.name,
                sellerName: vendor.name,
                shopName: vendor.name,
                email: vendor.contactEmail || email || "",
                contactEmail: vendor.contactEmail || email || "",
                mobile: vendor.mobile || "",
                location: vendor.location || "India",
                status: vendor.status,
                ownerId: vendor.ownerId || userId,
                sellerId: vendor.vendorId || vendor.id,
                vendorId: vendor.vendorId || vendor.id,
              }).catch(() => {});
            }
          }
        }
      } catch (pgErr) {
        // Postgres query failure or offline
      }
    }

    // Strategy E: Safe auto-provision for legitimately registered seller user missing seller document
    if (!vendor && (userRecord?.role === "seller" || role === "seller") && (email || userRecord?.email)) {
      try {
        const effectiveEmail = email || userRecord?.email;
        if (!userRecord && mongoUsers?.findByEmail && effectiveEmail) {
          userRecord = await mongoUsers.findByEmail(effectiveEmail, "seller");
        }
        if (userRecord && userRecord.role === "seller" && mongoSellers?.insert) {
          vendor = await mongoSellers.insert({
            id: userRecord.id,
            name: `${userRecord.name || "Seller"}'s Shop`,
            sellerName: userRecord.name || "Seller Store",
            shopName: `${userRecord.name || "Seller"}'s Shop`,
            email: userRecord.email || effectiveEmail,
            contactEmail: userRecord.email || effectiveEmail,
            mobile: userRecord.phone || "",
            passwordHash: userRecord.passwordHash || "",
            location: "India",
            rating: 4.8,
            sareesCount: 0,
            status: "approved",
            ownerId: userRecord.id,
            sellerId: `VEND_${userRecord.id.substring(0, 8).toUpperCase()}`,
          });
        }
      } catch {}
    }

    // Strict check: No vendor profile found for this account
    if (!vendor) {
      logger.warn({ userId, userRole: role, hasEmail: Boolean(email) }, "requireVendorAuth: Vendor profile not found for account");
      return res.status(403).json({
        error: "Vendor profile not found for this account.",
        code: "VENDOR_NOT_FOUND",
      });
    }

    const currentStatus = vendor.status || vendor.approvalStatus || "approved";
    const currentStatusReason = vendor.statusReason || null;

    if (currentStatus === "pending") {
      return res.status(403).json({
        error: "Your vendor registration is currently pending Super Admin approval.",
        code: "VENDOR_PENDING",
        statusReason: currentStatusReason,
      });
    }

    if (currentStatus === "rejected" || currentStatus === "declined") {
      return res.status(403).json({
        error: currentStatusReason ? `Your vendor application was rejected: ${currentStatusReason}` : "Your vendor application has been rejected by Super Admin.",
        code: "VENDOR_REJECTED",
        statusReason: currentStatusReason,
      });
    }

    if (currentStatus === "suspended") {
      return res.status(403).json({
        error: "Your account has been suspended.",
        code: "VENDOR_SUSPENDED",
        statusReason: currentStatusReason,
      });
    }

    if (currentStatus === "deactivated") {
      return res.status(403).json({
        error: "Your account has been deactivated.",
        code: "VENDOR_DEACTIVATED",
        statusReason: currentStatusReason,
      });
    }

    if (currentStatus !== "approved" && currentStatus !== "active") {
      return res.status(403).json({
        error: "Your seller account is not active.",
        code: "VENDOR_SUSPENDED",
        statusReason: currentStatusReason,
      });
    }

    // Profile completeness verification for incomplete registrations
    if (vendor.profileIncomplete || (vendor as any).status === "incomplete") {
      return res.status(403).json({
        error: "Your seller profile is incomplete. Please complete your profile details before submitting products.",
        code: "VENDOR_PROFILE_INCOMPLETE",
        statusReason: vendor.statusReason || "Profile incomplete",
      });
    }

    req.vendor = vendor;
    const canonicalSellerId = getCanonicalSellerId(vendor);
    req.vendorId = canonicalSellerId || vendor.vendorId || vendor.id || vendor.sellerId;
    req.sellerId = canonicalSellerId || vendor.sellerId || vendor.vendorId || vendor.id;
    req.userId = userId;
    req.userEmail = email || vendor.email || vendor.contactEmail;
    req.userRole = role || "seller";
    next();
  } catch (err: any) {
    logger.error({ err }, "requireVendorAuth failed");
    return res.status(500).json({ error: "Internal server error" });
  }
}
