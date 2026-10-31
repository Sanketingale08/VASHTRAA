import { connectToMongoDB, getMongoDb, db, vendorsTable, productsTable, ordersTable, cartTable, wishlistsTable, reviewsTable, supportTicketsTable, ticketMessagesTable, notificationsTable, stockHistoryTable, vendorSettlementsTable, eq, inArray, or } from "@workspace/db";

async function cleanProductionDatabase() {
  console.log("=================================================");
  console.log("🧹 VASTRAA PRODUCTION DATABASE CLEANUP");
  console.log("=================================================\n");

  const { db: mongoDb } = await connectToMongoDB();
  console.log("Connected to MongoDB Atlas.");

  const demoVendorIds = ["VEND_DEMO_001", "VEND_TEST_A", "VEND_TEST_B"];
  const demoProductIds = ["TEST_DEMO_PRODUCT_001", "prod-uuid-a", "prod-uuid-b"];
  const demoOwnerIds = ["USR_DEMO_SELLER", "USR_TEST_A", "USR_TEST_B"];

  console.log("\n[1] Cleaning Demo Vendors & Sellers...");
  await mongoDb.collection("vendors").deleteMany({
    $or: [
      { id: { $in: demoVendorIds } },
      { vendorId: { $in: demoVendorIds } },
      { email: "seller@vastraa.com" },
      { ownerId: { $in: demoOwnerIds } },
    ],
  });
  await mongoDb.collection("sellers").deleteMany({
    $or: [
      { id: { $in: demoVendorIds } },
      { vendorId: { $in: demoVendorIds } },
      { email: "seller@vastraa.com" },
      { ownerId: { $in: demoOwnerIds } },
    ],
  });

  try {
    await db.delete(vendorsTable).where(
      or(
        inArray(vendorsTable.id, demoVendorIds as any),
        eq(vendorsTable.contactEmail, "seller@vastraa.com")
      )
    );
  } catch {}

  console.log("[2] Cleaning Demo Products...");
  await mongoDb.collection("products").deleteMany({
    $or: [
      { id: { $in: demoProductIds } },
      { vendorId: { $in: demoVendorIds } },
      { name: { $regex: /demo/i } },
    ],
  });

  try {
    await db.delete(productsTable).where(
      or(
        inArray(productsTable.id, demoProductIds),
        inArray(productsTable.vendorId, demoVendorIds as any)
      )
    );
  } catch {}

  console.log("[3] Cleaning Demo Orders & Items...");
  await mongoDb.collection("orders").deleteMany({
    $or: [
      { id: { $regex: /demo|test/i } },
      { userId: { $in: demoOwnerIds } },
    ],
  });

  try {
    await db.delete(ordersTable).where(
      or(
        inArray(ordersTable.userId, demoOwnerIds)
      )
    );
  } catch {}

  console.log("[4] Cleaning Demo Support Tickets & Messages...");
  await mongoDb.collection("support_tickets").deleteMany({
    $or: [
      { vendorId: { $in: demoVendorIds as any } },
      { userId: { $in: demoOwnerIds } },
    ],
  });

  try {
    await db.delete(supportTicketsTable).where(
      or(
        inArray(supportTicketsTable.vendorId, demoVendorIds as any),
        inArray(supportTicketsTable.userId, demoOwnerIds)
      )
    );
  } catch {}

  console.log("[5] Cleaning Demo Notifications...");
  await mongoDb.collection("notifications").deleteMany({
    $or: [
      { vendorId: { $in: demoVendorIds as any } },
      { userId: { $in: demoOwnerIds } },
    ],
  });

  try {
    await db.delete(notificationsTable).where(
      or(
        inArray(notificationsTable.vendorId, demoVendorIds as any),
        inArray(notificationsTable.userId, demoOwnerIds)
      )
    );
  } catch {}

  console.log("\n=================================================");
  console.log("✨ DATABASE CLEANUP COMPLETED SUCCESSFULLY");
  console.log("=================================================");
  process.exit(0);
}

cleanProductionDatabase().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
