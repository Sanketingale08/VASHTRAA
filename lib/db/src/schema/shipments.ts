import { pgTable, text, integer, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const SHIPMENT_STATUSES = [
  "created",
  "courier_selected",
  "awb_assigned",
  "pickup_scheduled",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "rto_initiated",
  "rto_delivered",
  "cancelled",
] as const;

export const shipmentsTable = pgTable("shipments", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull(),
  vendorId: text("vendor_id").notNull(),
  items: jsonb("items").notNull().default([]),
  
  // Pickup & Delivery
  pickupLocationName: text("pickup_location_name").notNull(),
  pickupPincode: text("pickup_pincode").notNull(),
  deliveryAddress: jsonb("delivery_address").notNull(),
  
  // Package specifications
  parcelWeightKg: text("parcel_weight_kg").notNull().default("0.5"),
  parcelDimensions: jsonb("parcel_dimensions").notNull().default({ length: 25, breadth: 20, height: 5 }),
  
  // Shiprocket IDs
  shiprocketOrderId: text("shiprocket_order_id"),
  shiprocketShipmentId: text("shiprocket_shipment_id"),
  
  // Courier & Service
  courierCompanyId: integer("courier_company_id"),
  courierName: text("courier_name"),
  freightCharges: integer("freight_charges").default(0),
  estimatedDeliveryDate: text("estimated_delivery_date"),
  
  // AWB & Documents
  awbNumber: text("awb_number"),
  shippingLabelUrl: text("shipping_label_url"),
  manifestUrl: text("manifest_url"),
  
  // Lifecycle Status
  status: text("status").$type<typeof SHIPMENT_STATUSES[number]>().notNull().default("created"),
  pickupScheduledDate: text("pickup_scheduled_date"),
  pickupToken: text("pickup_token"),
  trackingHistory: jsonb("tracking_history").notNull().default([]),
  cancellationReason: text("cancellation_reason"),
  
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertShipmentSchema = createInsertSchema(shipmentsTable);
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;

export interface MongoShipmentDoc extends Omit<Shipment, "items" | "deliveryAddress" | "parcelDimensions" | "trackingHistory"> {
  _id?: string;
  items: Array<{
    productId: string;
    name: string;
    price: number;
    quantity: number;
    weightKg?: number;
  }>;
  deliveryAddress: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
  };
  parcelDimensions: {
    length: number;
    breadth: number;
    height: number;
  };
  trackingHistory: Array<{
    status: string;
    timestamp: string;
    activity: string;
    location?: string;
  }>;
}
