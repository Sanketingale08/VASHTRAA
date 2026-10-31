import { pgTable, text, uuid, integer, real, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { vendorsTable } from "./vendors";

export const VENDOR_SETTLEMENT_TYPES = ["release", "payout", "order_settlement"] as const;
export const VENDOR_SETTLEMENT_STATUSES = ["pending", "approved", "rejected", "completed", "failed", "processing", "paid", "eligible", "on_hold"] as const;
export const SETTLEMENT_PAYMENT_METHODS = ["bank_transfer", "upi", "cheque", "other"] as const;

export const vendorSettlementsTable = pgTable("vendor_settlements", {
  id: uuid("id").defaultRandom().primaryKey(),
  vendorId: uuid("vendor_id").notNull().references(() => vendorsTable.id),
  amount: integer("amount").notNull().default(0),
  type: text("type").$type<typeof VENDOR_SETTLEMENT_TYPES[number]>().notNull(),
  status: text("status").$type<typeof VENDOR_SETTLEMENT_STATUSES[number]>().notNull().default("pending"),
  paymentMethod: text("payment_method").$type<typeof SETTLEMENT_PAYMENT_METHODS[number]>(),
  transactionId: text("transaction_id"),
  note: text("note"),
  reviewedAt: timestamp("reviewed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  orderId: text("order_id"),
  productAmount: integer("product_amount"),
  commission: integer("commission"),
  commissionRate: real("commission_rate"),
  shippingCharge: integer("shipping_charge"),
  settlementTax: integer("settlement_tax"),
  netPayout: integer("net_payout"),
  paidAt: timestamp("paid_at"),
  utrNumber: text("utr_number"),
  payoutReference: text("payout_reference"),
  cashfreeTransferId: text("cashfree_transfer_id"),
  failureReason: text("failure_reason"),
  settlementEligibilityDate: timestamp("settlement_eligibility_date"),
  idempotencyKey: text("idempotency_key"),
  approvedAt: timestamp("approved_at"),
  approvedBy: text("approved_by"),

  // Pricing Engine Snapshot Columns (Integer Paise)
  pricingVersion: text("pricing_version").notNull().default("v1"),
  sellerBasePrice: integer("seller_base_price"),
  platformCommission: integer("platform_commission"),
  shippingFee: integer("shipping_fee"),
  taxableAmount: integer("taxable_amount"),
  gstRateBps: integer("gst_rate_bps"),
  gstAmount: integer("gst_amount"),
  cgst: integer("cgst"),
  sgst: integer("sgst"),
  igst: integer("igst"),
  customerPays: integer("customer_pays"),
  gstOnCommission: integer("gst_on_commission"),
  tcsDeduction: integer("tcs_deduction"),
  sellerSettlement: integer("seller_settlement"),
  platformKeeps: integer("platform_keeps"),

  // Rate Snapshot Columns (Basis Points)
  commissionBps: integer("commission_bps"),
  commissionGstBps: integer("commission_gst_bps"),
  tcsBps: integer("tcs_bps"),
});

export type VendorSettlement = typeof vendorSettlementsTable.$inferSelect;

export const COMMISSION_SCOPES = ["global", "category", "vendor"] as const;

export const commissionRulesTable = pgTable("commission_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  scope: text("scope").$type<typeof COMMISSION_SCOPES[number]>().notNull(),
  category: text("category"),
  vendorId: uuid("vendor_id").references(() => vendorsTable.id),
  rate: real("rate").notNull(),
  active: boolean("active").notNull().default(true),
  effectiveFrom: timestamp("effective_from"),
  effectiveTo: timestamp("effective_to"),
  supersedesId: uuid("supersedes_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type CommissionRule = typeof commissionRulesTable.$inferSelect;

export const REPORT_TYPES = ["revenue", "payments", "refunds", "profit", "settlements"] as const;
export const REPORT_FREQUENCIES = ["daily", "weekly", "monthly"] as const;

export const reportSchedulesTable = pgTable("report_schedules", {
  id: uuid("id").defaultRandom().primaryKey(),
  reportType: text("report_type").$type<typeof REPORT_TYPES[number]>().notNull(),
  frequency: text("frequency").$type<typeof REPORT_FREQUENCIES[number]>().notNull(),
  recipientEmail: text("recipient_email"),
  active: boolean("active").notNull().default(true),
  lastRunAt: timestamp("last_run_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ReportSchedule = typeof reportSchedulesTable.$inferSelect;
