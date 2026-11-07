export type ReturnRequestType = "return" | "exchange";

export type ReturnIssueCategory =
  | "damaged_item"
  | "wrong_item"
  | "manufacturing_defect"
  | "materially_different"
  | "change_of_mind";

export const ALLOWED_RETURN_ISSUES: Record<ReturnIssueCategory, { label: string; description: string; requiresPhotos: boolean }> = {
  damaged_item: {
    label: "Item Received Damaged or Defective",
    description: "Item received in a damaged or defective condition, transit damage, or broken embellishments.",
    requiresPhotos: true,
  },
  wrong_item: {
    label: "Wrong Item Delivered",
    description: "Different colour, style, or saree than ordered.",
    requiresPhotos: true,
  },
  manufacturing_defect: {
    label: "Manufacturing or Weaving Defect",
    description: "Fabric defect, weaving flaw, missing pallu motif, or manufacturing irregularity.",
    requiresPhotos: true,
  },
  materially_different: {
    label: "Item Significantly Different from Description",
    description: "Item significantly different from product description or images.",
    requiresPhotos: true,
  },
  change_of_mind: {
    label: "Unused Standard Product (Change of Mind)",
    description: "Unused, unwashed standard product in original condition with tags intact within 7 calendar days.",
    requiresPhotos: false,
  },
};

/**
 * 14 Real-Time Request Lifecycle Statuses:
 * - Pending
 * - Under Review
 * - Approved
 * - Rejected
 * - Pickup Scheduled
 * - Picked Up
 * - Received at Warehouse
 * - Quality Check
 * - Refund Initiated
 * - Refund Completed
 * - Exchange Processing
 * - Exchange Shipped
 * - Exchange Delivered
 * - Cancelled
 */
export type ReturnLifecycleStatus =
  | "PENDING"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED"
  | "PICKUP_SCHEDULED"
  | "PICKED_UP"
  | "RECEIVED"
  | "QUALITY_CHECK"
  | "QC_FAILED"
  | "REFUND_INITIATED"
  | "REFUND_COMPLETED"
  | "EXCHANGE_PROCESSING"
  | "EXCHANGE_SHIPPED"
  | "EXCHANGE_DELIVERED"
  | "CANCELLED";

export const RETURN_STATUS_DISPLAY: Record<ReturnLifecycleStatus, { label: string; step: number; color: string }> = {
  PENDING: { label: "Pending", step: 1, color: "orange" },
  UNDER_REVIEW: { label: "Under Review", step: 2, color: "blue" },
  APPROVED: { label: "Approved", step: 3, color: "green" },
  REJECTED: { label: "Rejected", step: 0, color: "red" },
  PICKUP_SCHEDULED: { label: "Pickup Scheduled", step: 4, color: "purple" },
  PICKED_UP: { label: "Picked Up", step: 5, color: "indigo" },
  RECEIVED: { label: "Received at Warehouse", step: 6, color: "teal" },
  QUALITY_CHECK: { label: "Quality Check", step: 7, color: "amber" },
  QC_FAILED: { label: "QC Failed", step: 0, color: "red" },
  REFUND_INITIATED: { label: "Refund Initiated", step: 8, color: "cyan" },
  REFUND_COMPLETED: { label: "Refund Completed", step: 9, color: "emerald" },
  EXCHANGE_PROCESSING: { label: "Exchange Processing", step: 8, color: "cyan" },
  EXCHANGE_SHIPPED: { label: "Exchange Shipped", step: 9, color: "indigo" },
  EXCHANGE_DELIVERED: { label: "Exchange Delivered", step: 10, color: "emerald" },
  CANCELLED: { label: "Cancelled", step: 0, color: "gray" },
};

export interface ReturnItemRecord {
  productId: string;
  name: string;
  price: number; // in rupees
  quantity: number;
  image?: string;
  vendorId: string;
  vendorName?: string;
  isCustomized?: boolean;
  customBlouse?: boolean;
  isReturnable?: boolean;
  category?: string;
  exchangePreference?: {
    size?: string;
    note?: string;
    replacementProductId?: string;
  };
}

export interface ReturnStatusHistoryEntry {
  status: ReturnLifecycleStatus;
  timestamp: string; // ISO format
  actor: "customer" | "seller" | "admin" | "system";
  actorId?: string;
  note?: string;
}

export interface ReversePickupDetails {
  pickupScheduledDate?: string;
  courierCompanyId?: number;
  courierName?: string;
  awbNumber?: string;
  pickupToken?: string;
  pickupStatus?: "scheduled" | "completed" | "failed";
  pickupAddress?: any;
  destinationAddress?: any;
  lastTrackingEvent?: string;
  trackingEvents?: Array<{
    status: string;
    timestamp: string;
    location?: string;
    note?: string;
  }>;
}

export interface ReturnQualityCheckDetails {
  inspectedAt?: string;
  inspectedBy?: "admin" | "seller";
  inspectorName?: string;
  conditionPass: boolean;
  defectVerified: boolean;
  originalTagsPresent: boolean;
  packagingIntact: boolean;
  approvedForResale?: boolean;
  restocked?: boolean;
  restockedAt?: string;
  result: "pass" | "fail";
  qcNotes: string;
  qcPhotos?: string[];
}

export interface ReturnRefundDetails {
  refundAmount: number; // in rupees
  refundMethod: "original_payment" | "bank_transfer" | "store_credit";
  cfRefundId?: string;
  refundId?: string;
  refundStatus?: "PENDING" | "SUCCESS" | "FAILED";
  idempotencyKey?: string;
  processedAt?: string;
  gatewayMessage?: string;
  bankDetails?: {
    accountNumber?: string;
    ifsc?: string;
    accountHolderName?: string;
    bankName?: string;
  };
}

export interface ReturnExchangeDetails {
  replacementProductId?: string;
  replacementProductName?: string;
  replacementAwb?: string;
  replacementCourier?: string;
  replacementShippedAt?: string;
  stockAvailable?: boolean;
  fallbackToRefund?: boolean;
}

export interface ReturnDoc {
  id: string; // e.g. ret_1793435123456_abcdef
  returnNumber: string; // e.g. RET-2026-00101
  orderId: string;
  orderDisplayId?: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  userPhone?: string;
  vendorId: string;
  vendorName?: string;
  requestType: ReturnRequestType; // "return" | "exchange"
  items: ReturnItemRecord[];
  issueCategory: ReturnIssueCategory;
  customerNotes: string;
  evidenceUrls: string[]; // supporting photographs
  status: ReturnLifecycleStatus;
  reviewDecision?: {
    decision: "approved" | "rejected";
    reviewedBy: "admin" | "seller";
    reviewedAt: string;
    reviewNotes?: string;
    rejectionReason?: string;
  };
  pickupDetails?: ReversePickupDetails;
  qcDetails?: ReturnQualityCheckDetails;
  refundDetails?: ReturnRefundDetails;
  exchangeDetails?: ReturnExchangeDetails;
  statusHistory: ReturnStatusHistoryEntry[];
  createdAt: Date;
  updatedAt: Date;
}
