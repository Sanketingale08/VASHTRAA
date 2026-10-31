/**
 * Vastraa Notification System Utilities
 * Provides:
 * 1. Accurate order status notification message formatting
 * 2. Notification timestamp formatting ("Just now", "5 minutes ago", "Today, 10:30 AM", etc.)
 * 3. Strict separation of User vs Seller notifications
 * 4. User preference enforcement (Order Updates, Offers & Coupons, Stock Alerts)
 * 5. Notification deduplication and synchronization
 */

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
  metadata?: Record<string, any> | null;
  vendorId?: string | null;
}

export interface NotificationPreferences {
  orderUpdates: boolean;
  offerAlerts: boolean;
  emailOrderUpdates: boolean;
  emailMarketingUpdates: boolean;
  emailOfferUpdates: boolean;
  // Legacy optional properties for backward compatibility
  stockAlerts?: boolean;
  emailStockAlerts?: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  orderUpdates: true,
  offerAlerts: true,
  emailOrderUpdates: true,
  emailMarketingUpdates: true,
  emailOfferUpdates: true,
};

/**
 * Seller-specific notification types and keywords.
 * MUST NEVER appear on the User Dashboard.
 */
const SELLER_NOTIFICATION_TYPES = new Set([
  "low_stock",
  "out_of_stock",
  "new_order",
  "new_order_seller",
  "new_order_placed_seller",
  "order_placed_seller",
  "order_cancelled_seller",
  "return_requested_seller",
  "refund_requested_seller",
  "product_pending_approval",
  "product_approved",
  "product_rejected",
  "inventory_update",
  "inventory_updated",
  "seller_verification",
  "seller_verification_update",
  "seller_approved",
  "seller_rejected",
  "payout_successful",
  "payout_failed",
  "payout_notification",
  "settlement_released",
  "order_settlement",
  "store_performance",
  "store_performance_alert",
  "product_review_moderation",
  "vendor_query",
  "new_customer_query",
]);

/**
 * Validates whether a notification is meant for the Customer/User Dashboard.
 * Strictly filters out any seller, vendor, or store-management alerts.
 */
export function isUserDashboardNotification(n: Notification): boolean {
  if (!n) return false;

  // 1. Check if vendorId is populated
  if (n.vendorId) return false;
  if (n.metadata && (n.metadata.vendorId || n.metadata.sellerId)) return false;

  // 2. Check exact notification type
  const type = (n.type || "").toLowerCase().trim();
  if (SELLER_NOTIFICATION_TYPES.has(type)) return false;

  // 3. Keyword scan on title and body for seller-specific context
  const title = (n.title || "").toLowerCase();
  const body = (n.body || "").toLowerCase();

  const sellerKeywords = [
    "low stock alert",
    "out of stock alert",
    "new order alert for seller",
    "product approval",
    "product rejected",
    "seller verification",
    "payout notification",
    "settlement released",
    "store performance",
    "review moderation",
    "customer query for product",
    "seller dashboard",
    "seller panel",
    "vendor settlement",
    "commission settlement",
  ];

  for (const kw of sellerKeywords) {
    if (title.includes(kw) || body.includes(kw)) {
      return false;
    }
  }

  return true;
}

/**
 * Identifies the high-level preference category for a notification.
 */
export function getNotificationCategory(type: string): "orderUpdates" | "offerAlerts" | "other" {
  const t = (type || "").toLowerCase();

  // Promotional / Offers / Coupons
  if (
    t === "coupon_expiry" ||
    t === "coupon_available" ||
    t === "price_drop" ||
    t === "flash_sale" ||
    t === "promotion" ||
    t === "discount_alert" ||
    t === "special_offer"
  ) {
    return "offerAlerts";
  }

  // Order updates
  if (
    t.startsWith("order_") ||
    t.startsWith("return_") ||
    t.startsWith("refund_") ||
    t === "new_order_placed" ||
    t === "out_for_delivery" ||
    t === "payment_successful" ||
    t === "payment_failed" ||
    t === "processing" ||
    t === "shipped" ||
    t === "delivered" ||
    t === "cancelled" ||
    t === "packed"
  ) {
    return "orderUpdates";
  }

  return "other";
}

/**
 * Filters a notification list based on the user's active preferences.
 * If a category switch is turned OFF, notifications of that category are suppressed.
 */
export function filterNotificationsByPreferences(
  notifications: Notification[],
  prefs?: NotificationPreferences | null
): Notification[] {
  if (!prefs) return notifications;

  return notifications.filter((n) => {
    const category = getNotificationCategory(n.type);

    if (category === "orderUpdates" && prefs.orderUpdates === false) {
      return false;
    }
    if (category === "offerAlerts" && prefs.offerAlerts === false) {
      return false;
    }

    return true;
  });
}

export interface FormattedNotificationDetails {
  displayTitle: string;
  statusMessage: string;
  badgeLabel: string;
  badgeStyle: string;
  iconBg: string;
  iconColor: string;
  accentBorder: string;
  deepLink: string | null;
  orderId?: string | null;
}

/**
 * Maps order & user notifications to their required exact status messages:
 * - Order Placed → "Your order has been placed successfully."
 * - Order Confirmed → "Your order has been confirmed."
 * - Processing → "Your order is being processed."
 * - Packed → "Your order has been packed."
 * - Shipped → "Your order has been shipped."
 * - Out for Delivery → "Your order is out for delivery."
 * - Delivered → "Your order has been delivered."
 * - Cancelled → "Your order has been cancelled."
 * - Returned → "Your return request has been approved."
 * - Refund Initiated → "Your refund has been initiated."
 * - Refund Completed → "Your refund has been completed."
 */
export function formatNotificationContent(
  n: Notification,
  basePath: string = ""
): FormattedNotificationDetails {
  const type = (n.type || "").toLowerCase().trim();
  const rawTitle = (n.title || "").toLowerCase();
  const rawBody = (n.body || "").toLowerCase();
  const orderId = n.metadata?.orderId || null;
  const productId = n.metadata?.productId || null;

  const deepLink = orderId
    ? `${basePath}/account/orders`
    : productId
    ? `${basePath}/products/${productId}`
    : null;

  // 1. Order Placed
  if (
    type === "order_placed" ||
    type === "new_order_placed" ||
    rawTitle.includes("order placed") ||
    rawBody.includes("placed successfully")
  ) {
    return {
      displayTitle: "Order Placed",
      statusMessage: "Your order has been placed successfully.",
      badgeLabel: "Order Placed",
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accentBorder: "border-l-emerald-500",
      deepLink,
      orderId,
    };
  }

  // 2. Order Confirmed
  if (
    type === "order_confirmed" ||
    rawTitle.includes("order confirmed") ||
    rawBody.includes("has been confirmed")
  ) {
    return {
      displayTitle: "Order Confirmed",
      statusMessage: "Your order has been confirmed.",
      badgeLabel: "Confirmed",
      badgeStyle: "bg-teal-50 text-teal-700 border-teal-200",
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      accentBorder: "border-l-teal-500",
      deepLink,
      orderId,
    };
  }

  // 3. Processing
  if (
    type === "order_processing" ||
    type === "processing" ||
    rawTitle.includes("order processing") ||
    rawBody.includes("being processed")
  ) {
    return {
      displayTitle: "Processing",
      statusMessage: "Your order is being processed.",
      badgeLabel: "Processing",
      badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      accentBorder: "border-l-amber-500",
      deepLink,
      orderId,
    };
  }

  // 4. Packed
  if (
    type === "order_packed" ||
    type === "packed" ||
    rawTitle.includes("order packed") ||
    rawBody.includes("has been packed")
  ) {
    return {
      displayTitle: "Packed",
      statusMessage: "Your order has been packed.",
      badgeLabel: "Packed",
      badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-500",
      accentBorder: "border-l-blue-500",
      deepLink,
      orderId,
    };
  }

  // 5. Shipped
  if (
    type === "order_shipped" ||
    type === "shipped" ||
    type === "dispatched" ||
    rawTitle.includes("order shipped") ||
    rawBody.includes("has been shipped")
  ) {
    return {
      displayTitle: "Shipped",
      statusMessage: "Your order has been shipped.",
      badgeLabel: "Shipped",
      badgeStyle: "bg-indigo-50 text-indigo-700 border-indigo-200",
      iconBg: "bg-indigo-50",
      iconColor: "text-indigo-600",
      accentBorder: "border-l-indigo-500",
      deepLink,
      orderId,
    };
  }

  // 6. Out for Delivery
  if (
    type === "out_for_delivery" ||
    rawTitle.includes("out for delivery") ||
    rawBody.includes("out for delivery")
  ) {
    return {
      displayTitle: "Out for Delivery",
      statusMessage: "Your order is out for delivery.",
      badgeLabel: "Out for Delivery",
      badgeStyle: "bg-sky-50 text-sky-700 border-sky-200",
      iconBg: "bg-sky-50",
      iconColor: "text-sky-600",
      accentBorder: "border-l-sky-500",
      deepLink,
      orderId,
    };
  }

  // 7. Delivered
  if (
    type === "order_delivered" ||
    type === "delivered" ||
    rawTitle.includes("order delivered") ||
    rawBody.includes("has been delivered")
  ) {
    return {
      displayTitle: "Delivered",
      statusMessage: "Your order has been delivered.",
      badgeLabel: "Delivered",
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accentBorder: "border-l-emerald-600",
      deepLink,
      orderId,
    };
  }

  // 8. Cancelled
  if (
    type === "order_cancelled" ||
    type === "cancelled" ||
    rawTitle.includes("order cancelled") ||
    rawBody.includes("has been cancelled")
  ) {
    return {
      displayTitle: "Cancelled",
      statusMessage: "Your order has been cancelled.",
      badgeLabel: "Cancelled",
      badgeStyle: "bg-rose-50 text-rose-700 border-rose-200",
      iconBg: "bg-rose-50",
      iconColor: "text-rose-500",
      accentBorder: "border-l-rose-500",
      deepLink,
      orderId,
    };
  }

  // 9. Returned / Return Approved
  if (
    type === "return_approved" ||
    type === "returned" ||
    rawTitle.includes("return request has been approved") ||
    rawBody.includes("return request has been approved")
  ) {
    return {
      displayTitle: "Returned",
      statusMessage: "Your return request has been approved.",
      badgeLabel: "Returned",
      badgeStyle: "bg-teal-50 text-teal-700 border-teal-200",
      iconBg: "bg-teal-50",
      iconColor: "text-teal-600",
      accentBorder: "border-l-teal-600",
      deepLink: `${basePath}/account/returns`,
      orderId,
    };
  }

  // 10. Refund Completed
  if (
    type === "refund_completed" ||
    type === "refunded" ||
    rawTitle.includes("refund completed") ||
    rawBody.includes("refund has been completed")
  ) {
    return {
      displayTitle: "Refund Completed",
      statusMessage: "Your refund has been completed.",
      badgeLabel: "Refund Completed",
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accentBorder: "border-l-emerald-600",
      deepLink: `${basePath}/account/returns`,
      orderId,
    };
  }

  // 11. Refund Initiated
  if (
    type === "refund_initiated" ||
    type === "refund_requested" ||
    type === "refund_approved" ||
    rawTitle.includes("refund initiated") ||
    rawBody.includes("refund has been initiated")
  ) {
    return {
      displayTitle: "Refund Initiated",
      statusMessage: "Your refund has been initiated.",
      badgeLabel: "Refund Initiated",
      badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-600",
      accentBorder: "border-l-amber-500",
      deepLink: `${basePath}/account/returns`,
      orderId,
    };
  }

  // 12. Return Requested
  if (type === "return_requested" || rawTitle.includes("return requested")) {
    return {
      displayTitle: "Return Requested",
      statusMessage: n.body || "Your return request has been submitted and is under review.",
      badgeLabel: "Under Review",
      badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      accentBorder: "border-l-amber-400",
      deepLink: `${basePath}/account/returns`,
      orderId,
    };
  }

  // 13. Return Rejected
  if (type === "return_rejected" || rawTitle.includes("return rejected")) {
    return {
      displayTitle: "Return Rejected",
      statusMessage: n.body || "Your return request could not be approved.",
      badgeLabel: "Declined",
      badgeStyle: "bg-rose-50 text-rose-700 border-rose-200",
      iconBg: "bg-rose-50",
      iconColor: "text-rose-500",
      accentBorder: "border-l-rose-500",
      deepLink: `${basePath}/account/returns`,
      orderId,
    };
  }

  // 14. Payment Successful
  if (type === "payment_successful" || rawTitle.includes("payment successful")) {
    return {
      displayTitle: "Payment Successful",
      statusMessage: n.body || "Your payment was processed successfully.",
      badgeLabel: "Payment",
      badgeStyle: "bg-emerald-50 text-emerald-700 border-emerald-200",
      iconBg: "bg-emerald-50",
      iconColor: "text-emerald-600",
      accentBorder: "border-l-emerald-500",
      deepLink,
      orderId,
    };
  }

  // 15. Coupon Expiry / Expiring
  if (type === "coupon_expiry" || rawTitle.includes("coupon")) {
    return {
      displayTitle: n.title || "Coupon Expiring Soon",
      statusMessage: n.body || "Don't miss out! Your discount coupon will expire soon.",
      badgeLabel: "Offers",
      badgeStyle: "bg-purple-50 text-purple-700 border-purple-200",
      iconBg: "bg-purple-50",
      iconColor: "text-purple-600",
      accentBorder: "border-l-purple-500",
      deepLink: `${basePath}/account/coupons`,
    };
  }

  // 16. Price Drop
  if (type === "price_drop" || rawTitle.includes("price drop")) {
    return {
      displayTitle: n.title || "Price Drop Alert",
      statusMessage: n.body || "An item you looked at is now available at a reduced price.",
      badgeLabel: "Price Drop",
      badgeStyle: "bg-rose-50 text-rose-700 border-rose-200",
      iconBg: "bg-rose-50",
      iconColor: "text-rose-500",
      accentBorder: "border-l-rose-500",
      deepLink,
    };
  }

  // 17. Flash Sale
  if (type === "flash_sale" || rawTitle.includes("flash sale")) {
    return {
      displayTitle: n.title || "Flash Sale Live",
      statusMessage: n.body || "Exclusive discounts are now active for a limited time.",
      badgeLabel: "Flash Sale",
      badgeStyle: "bg-amber-50 text-amber-700 border-amber-200",
      iconBg: "bg-amber-50",
      iconColor: "text-amber-500",
      accentBorder: "border-l-amber-500",
      deepLink: `${basePath}/paithani`,
    };
  }

  // 18. Wishlist Restock / Stock Alert
  if (type === "wishlist_restock" || type === "stock_alert" || rawTitle.includes("stock")) {
    return {
      displayTitle: n.title || "Back In Stock",
      statusMessage: n.body || "An item from your wishlist is now back in stock.",
      badgeLabel: "Restocked",
      badgeStyle: "bg-blue-50 text-blue-700 border-blue-200",
      iconBg: "bg-blue-50",
      iconColor: "text-blue-600",
      accentBorder: "border-l-blue-500",
      deepLink: `${basePath}/account/wishlist`,
    };
  }

  // Fallback for general updates
  return {
    displayTitle: n.title || "Notification",
    statusMessage: n.body || "You have a new account update.",
    badgeLabel: "Update",
    badgeStyle: "bg-slate-50 text-slate-700 border-slate-200",
    iconBg: "bg-slate-50",
    iconColor: "text-slate-600",
    accentBorder: "border-l-slate-400",
    deepLink,
    orderId,
  };
}

/**
 * Deduplicates notifications to prevent duplicate status messages or repeated entries.
 * Never display an incorrect or duplicate status message.
 */
export function deduplicateNotifications(notifications: Notification[]): Notification[] {
  const seenIds = new Set<string>();
  const seenOrderStates = new Map<string, Notification>();
  const result: Notification[] = [];

  for (const n of notifications) {
    if (!n.id || seenIds.has(n.id)) continue;
    seenIds.add(n.id);

    const orderId = n.metadata?.orderId;
    if (orderId) {
      // Determine standardized message for this notification
      const { displayTitle, statusMessage } = formatNotificationContent(n);
      const dedupeKey = `${orderId}:::${displayTitle}:::${statusMessage}`;

      if (seenOrderStates.has(dedupeKey)) {
        // Skip duplicate identical status message for this order
        continue;
      }
      seenOrderStates.set(dedupeKey, n);
    }

    result.push(n);
  }

  return result;
}

/**
 * Displays notification timestamp in compliant format:
 * - "Just now" (< 1 min)
 * - "5 minutes ago" (< 1 hour)
 * - "1 hour ago" (< 4 hours)
 * - "Today, 10:30 AM" (same day)
 * - "Yesterday, 6:45 PM" (previous day)
 * - "28 Jul 2026, 3:15 PM" (earlier dates)
 */
export function formatNotificationTimestamp(dateStr: string): string {
  if (!dateStr) return "Just now";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "Just now";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);

  // If timestamp is slightly in the future (due to server/client skew) or < 60s
  if (diffMs < 0 || diffSecs < 60) {
    return "Just now";
  }

  // Under 60 minutes
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  }

  // Under 4 hours
  if (diffHours < 4) {
    return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  }

  const timeStr = date.toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    return `Today, ${timeStr}`;
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return `Yesterday, ${timeStr}`;
  }

  const day = date.getDate();
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${day} ${month} ${year}, ${timeStr}`;
}
