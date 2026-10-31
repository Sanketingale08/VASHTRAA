import { db, mongoCoupons, couponsTable, couponRedemptionsTable, ordersTable, mongoOrders, isMongoDbConnected } from "@workspace/db";
import { eq, and, count, sql } from "drizzle-orm";

export interface CouponItemInput {
  productId?: string;
  name?: string;
  price: number;
  quantity: number;
  category?: string | null;
  [key: string]: any;
}

export interface CouponValidationOptions {
  code: string;
  userId?: string | null;
  items?: CouponItemInput[];
  cartSubtotal?: number;
  tx?: any;
}

export interface ValidatedCouponData {
  id: string;
  code: string;
  type: "percent" | "flat";
  value: number;
  description: string;
  offerDisplayText: string | null;
  minimumOrderValue: number;
  maxDiscountAmount: number | null;
  eligibleCategories: string[] | null;
  firstOrderOnly: boolean;
  perCustomerLimit: number | null;
  startDate: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  active: boolean;
  createdAt?: Date;
}

export interface CouponValidationResult {
  valid: boolean;
  error?: string;
  coupon?: ValidatedCouponData;
  totalMerchandiseSubtotal: number;
  eligibleSubtotal: number;
  discount: number;
  minimumOrderValue: number;
  shortfall: number;
}

/**
 * Universal Centralized Coupon Validation and Discount Calculation Service
 *
 * Enforces:
 * 1. Existence and active status
 * 2. Start date & expiry date
 * 3. Global usage limits (maxUses)
 * 4. Per-user redemption limits
 * 5. First-order-only customer restrictions
 * 6. Product / category eligibility filters
 * 7. Inclusive minimum eligible merchandise order value threshold (MOV)
 * 8. Authoritative flat or percentage discount calculation with optional cap
 */
export async function validateAndCalculateCoupon(
  options: CouponValidationOptions
): Promise<CouponValidationResult> {
  const { code: rawCode, userId, items, cartSubtotal = 0, tx } = options;

  if (!rawCode || typeof rawCode !== "string" || !rawCode.trim()) {
    return {
      valid: false,
      error: "Missing coupon code",
      totalMerchandiseSubtotal: 0,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: 0,
      shortfall: 0,
    };
  }

  const cleanCode = rawCode.trim().toUpperCase();

  // 1. Fetch coupon from Mongo or Drizzle fallback
  let coupon: any = null;
  try {
    coupon = await mongoCoupons.findByCode(cleanCode);
  } catch {}

  if (!coupon) {
    try {
      const dbClient = tx || db;
      const rows = await dbClient
        .select()
        .from(couponsTable)
        .where(eq(couponsTable.code, cleanCode))
        .limit(1)
        .catch(() => []);
      if (rows.length > 0) {
        coupon = rows[0];
      }
    } catch {}
  }

  if (!coupon) {
    return {
      valid: false,
      error: "Invalid coupon code",
      totalMerchandiseSubtotal: 0,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: 0,
      shortfall: 0,
    };
  }

  const normalizedCoupon: ValidatedCouponData = {
    id: coupon.id || coupon._id,
    code: coupon.code,
    type: coupon.type,
    value: Number(coupon.value),
    description: coupon.description ?? "",
    offerDisplayText: coupon.offerDisplayText ?? null,
    minimumOrderValue: coupon.minimumOrderValue ? Math.max(0, Number(coupon.minimumOrderValue)) : 0,
    maxDiscountAmount: coupon.maxDiscountAmount != null ? Math.max(0, Number(coupon.maxDiscountAmount)) : null,
    eligibleCategories: Array.isArray(coupon.eligibleCategories)
      ? coupon.eligibleCategories.map((c: any) => String(c).trim().toLowerCase()).filter(Boolean)
      : typeof coupon.eligibleCategories === "string" && coupon.eligibleCategories.trim()
      ? coupon.eligibleCategories.split(",").map((c: string) => c.trim().toLowerCase()).filter(Boolean)
      : null,
    firstOrderOnly: Boolean(coupon.firstOrderOnly),
    perCustomerLimit: coupon.perCustomerLimit != null ? Math.max(1, parseInt(coupon.perCustomerLimit, 10)) : null,
    startDate: coupon.startDate ? new Date(coupon.startDate) : null,
    expiresAt: coupon.expiresAt ? new Date(coupon.expiresAt) : null,
    maxUses: coupon.maxUses != null ? Math.max(1, parseInt(coupon.maxUses, 10)) : null,
    usedCount: Number(coupon.usedCount || 0),
    active: coupon.active !== false,
    createdAt: coupon.createdAt ? new Date(coupon.createdAt) : undefined,
  };

  const mov = normalizedCoupon.minimumOrderValue;

  // 2. Active status check
  if (!normalizedCoupon.active) {
    return {
      valid: false,
      error: "This coupon is no longer active",
      coupon: normalizedCoupon,
      totalMerchandiseSubtotal: 0,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: mov,
      shortfall: mov,
    };
  }

  // 3. Start date check
  const now = new Date();
  if (normalizedCoupon.startDate && normalizedCoupon.startDate > now) {
    return {
      valid: false,
      error: "This coupon is not yet available",
      coupon: normalizedCoupon,
      totalMerchandiseSubtotal: 0,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: mov,
      shortfall: mov,
    };
  }

  // 4. Expiry date check
  if (normalizedCoupon.expiresAt && normalizedCoupon.expiresAt < now) {
    return {
      valid: false,
      error: "This coupon has expired",
      coupon: normalizedCoupon,
      totalMerchandiseSubtotal: 0,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: mov,
      shortfall: mov,
    };
  }

  // 5. Global usage limit check (maxUses)
  if (normalizedCoupon.maxUses !== null && normalizedCoupon.usedCount >= normalizedCoupon.maxUses) {
    return {
      valid: false,
      error: "This coupon has reached its usage limit",
      coupon: normalizedCoupon,
      totalMerchandiseSubtotal: 0,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: mov,
      shortfall: mov,
    };
  }

  // 6. Per-customer usage limit check
  if (userId) {
    try {
      const dbClient = tx || db;
      const redemptions = await dbClient
        .select()
        .from(couponRedemptionsTable)
        .where(
          and(
            eq(couponRedemptionsTable.couponId, normalizedCoupon.id),
            eq(couponRedemptionsTable.userId, userId)
          )
        )
        .limit(100)
        .catch(() => []);

      const userUsedCount = redemptions.length;
      const perUserMax = normalizedCoupon.perCustomerLimit != null ? normalizedCoupon.perCustomerLimit : 1;

      if (userUsedCount >= perUserMax) {
        return {
          valid: false,
          error: perUserMax > 1
            ? "You have already used this coupon the maximum number of times"
            : "You have already used this coupon",
          coupon: normalizedCoupon,
          totalMerchandiseSubtotal: 0,
          eligibleSubtotal: 0,
          discount: 0,
          minimumOrderValue: mov,
          shortfall: mov,
        };
      }
    } catch {}
  }

  // 7. First order only requirement
  if (normalizedCoupon.firstOrderOnly && userId) {
    let hasPriorOrders = false;
    try {
      if (isMongoDbConnected()) {
        const pastOrder = await mongoOrders.findOne({
          userId,
          status: { $in: ["confirmed", "processing", "shipped", "delivered"] },
        });
        if (pastOrder) hasPriorOrders = true;
      }
    } catch {}

    if (!hasPriorOrders) {
      try {
        const dbClient = tx || db;
        const pastOrders = await dbClient
          .select({ id: ordersTable.id })
          .from(ordersTable)
          .where(eq(ordersTable.userId, userId))
          .limit(1)
          .catch(() => []);
        if (pastOrders.length > 0) hasPriorOrders = true;
      } catch {}
    }

    if (hasPriorOrders) {
      return {
        valid: false,
        error: "This coupon is valid only on your first order",
        coupon: normalizedCoupon,
        totalMerchandiseSubtotal: 0,
        eligibleSubtotal: 0,
        discount: 0,
        minimumOrderValue: mov,
        shortfall: mov,
      };
    }
  }

  // 8. Calculate total and eligible subtotals
  let totalMerchandiseSubtotal = 0;
  let eligibleSubtotal = 0;

  if (Array.isArray(items) && items.length > 0) {
    for (const item of items) {
      const linePrice = Math.max(0, Number(item.price || 0)) * Math.max(1, parseInt(String(item.quantity || 1), 10));
      totalMerchandiseSubtotal += linePrice;

      if (normalizedCoupon.eligibleCategories && normalizedCoupon.eligibleCategories.length > 0) {
        const itemCategory = (item.category || "").toLowerCase().trim();
        const itemName = (item.name || "").toLowerCase().trim();
        const isEligible = normalizedCoupon.eligibleCategories.some(
          cat => cat === itemCategory || itemCategory.includes(cat) || itemName.includes(cat)
        );
        if (isEligible) {
          eligibleSubtotal += linePrice;
        }
      } else {
        eligibleSubtotal += linePrice;
      }
    }
  } else {
    totalMerchandiseSubtotal = Math.max(0, Number(cartSubtotal || 0));
    eligibleSubtotal = totalMerchandiseSubtotal;
  }

  // 9. If category-restricted coupon and no items match
  if (
    normalizedCoupon.eligibleCategories &&
    normalizedCoupon.eligibleCategories.length > 0 &&
    Array.isArray(items) &&
    items.length > 0 &&
    eligibleSubtotal === 0
  ) {
    return {
      valid: false,
      error: "This coupon is not applicable to the selected products",
      coupon: normalizedCoupon,
      totalMerchandiseSubtotal,
      eligibleSubtotal: 0,
      discount: 0,
      minimumOrderValue: mov,
      shortfall: mov,
    };
  }

  // 10. Minimum Order Value (MOV) Validation (inclusive check: eligibleSubtotal >= mov)
  if (eligibleSubtotal < mov) {
    const shortfall = Math.max(0, mov - eligibleSubtotal);
    const formattedMov = mov.toLocaleString("en-IN");
    const formattedShortfall = shortfall.toLocaleString("en-IN");
    return {
      valid: false,
      error: `${normalizedCoupon.code} requires a minimum eligible purchase of ₹${formattedMov}. Add ₹${formattedShortfall} more to apply this coupon.`,
      coupon: normalizedCoupon,
      totalMerchandiseSubtotal,
      eligibleSubtotal,
      discount: 0,
      minimumOrderValue: mov,
      shortfall,
    };
  }

  // 11. Authoritative Discount Calculation
  let calculatedDiscount = 0;
  if (normalizedCoupon.type === "percent") {
    calculatedDiscount = Math.round((eligibleSubtotal * normalizedCoupon.value) / 100);
    if (normalizedCoupon.maxDiscountAmount && normalizedCoupon.maxDiscountAmount > 0) {
      calculatedDiscount = Math.min(calculatedDiscount, normalizedCoupon.maxDiscountAmount);
    }
  } else {
    // Flat discount
    calculatedDiscount = Math.min(normalizedCoupon.value, eligibleSubtotal);
  }

  // Never allow discount to exceed the eligible subtotal
  calculatedDiscount = Math.max(0, Math.min(calculatedDiscount, eligibleSubtotal));

  return {
    valid: true,
    coupon: normalizedCoupon,
    totalMerchandiseSubtotal,
    eligibleSubtotal,
    discount: calculatedDiscount,
    minimumOrderValue: mov,
    shortfall: 0,
  };
}
