import { pgTable, text, integer, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const cartItemsTable = pgTable(
  "cart_items",
  {
    userId: text("user_id").notNull(),
    productId: text("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export type CartItem = typeof cartItemsTable.$inferSelect;
