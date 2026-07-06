import { pgTable, text, uuid, timestamp, primaryKey } from "drizzle-orm/pg-core";
import { productsTable } from "./products";

export const wishlistsTable = pgTable(
  "wishlists",
  {
    userId: text("user_id").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);

export type Wishlist = typeof wishlistsTable.$inferSelect;
