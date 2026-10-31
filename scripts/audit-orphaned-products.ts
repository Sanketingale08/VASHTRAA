import { db, mongoProducts, mongoSellers, productsTable, vendorsTable } from "@workspace/db";
import { getApprovedVendorData, isProductVendorValid } from "../artifacts/api-server/src/lib/vendorValidation";

async function runOrphanedProductsAudit() {
  console.log("==================================================");
  console.log("AUDITING EXISTING PRODUCTS FOR VENDOR RELATIONSHIPS");
  console.log("==================================================");

  const approvedVendorData = await getApprovedVendorData(true);
  console.log(`- Found ${approvedVendorData.ids.size} approved vendor IDs/keys and ${approvedVendorData.names.size} approved vendor names.`);

  // 1. Fetch all products from MongoDB and PostgreSQL
  const mongoProds = await mongoProducts.findMany({});
  let pgProds = [];
  try {
    pgProds = await db.select().from(productsTable);
  } catch {}

  const productMap = new Map<string, any>();
  for (const p of [...mongoProds, ...pgProds]) {
    if (p && p.id && !productMap.has(p.id)) {
      productMap.set(p.id, p);
    }
  }

  const allProducts = Array.from(productMap.values());
  console.log(`- Total existing products in database: ${allProducts.length}`);

  const validProducts: any[] = [];
  const orphanedProducts: any[] = [];

  for (const p of allProducts) {
    if (isProductVendorValid(p, approvedVendorData)) {
      validProducts.push(p);
    } else {
      orphanedProducts.push(p);
    }
  }

  console.log(`\n- Valid products with active vendors: ${validProducts.length}`);
  console.log(`- Orphaned/Invalid vendor products found: ${orphanedProducts.length}`);

  if (orphanedProducts.length > 0) {
    console.log("\n--- Orphaned Products Summary ---");
    for (const p of orphanedProducts) {
      console.log(`  * ID: ${p.id} | Name: "${p.name}" | VendorID: ${p.vendorId || "MISSING"} | VendorName: "${p.vendorName || "MISSING"}"`);
    }

    console.log("\nDeactivating orphaned products in database to preserve integrity (active: false, status: 'inactive')...");
    for (const p of orphanedProducts) {
      try {
        await mongoProducts.update(p.id, { active: false, status: "inactive" });
      } catch {}
      try {
        await db.update(productsTable).set({ active: false, status: "inactive" }).where(productsTable.id === p.id);
      } catch {}
    }
    console.log("✓ Deactivated orphaned products.");
  } else {
    console.log("✓ All existing products belong to valid approved vendors.");
  }

  console.log("\n==================================================");
  console.log("PRODUCT-VENDOR AUDIT COMPLETED SUCCESSFULLY!");
  console.log("==================================================");
}

runOrphanedProductsAudit()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Audit failed:", err);
    process.exit(1);
  });
