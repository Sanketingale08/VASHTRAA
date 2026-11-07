import { connectToMongoDB } from "@workspace/db";
import { searchProducts, getProductFacets } from "../lib/searchEngine.ts";
import { getApprovedVendorData } from "../lib/vendorValidation.ts";

async function main() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    await connectToMongoDB();
    console.log("Connected!");

    console.log("\nChecking approved vendor data...");
    const approvedVendorData = await getApprovedVendorData();
    console.log("Approved IDs count:", approvedVendorData.ids.size);
    console.log("Approved IDs sample:", Array.from(approvedVendorData.ids).slice(0, 10));
    console.log("Suspended IDs count:", approvedVendorData.suspendedIds.size);
    console.log("Suspended IDs sample:", Array.from(approvedVendorData.suspendedIds).slice(0, 10));

    console.log("\n--- Testing searchProducts({ category: 'paithani' }) ---");
    const paithaniRes = await searchProducts({ category: "paithani" });
    console.log("Paithani Total:", paithaniRes.total);
    console.log("Paithani Products:", paithaniRes.products.map(p => ({ id: p.id, name: p.name, category: p.category, status: p.status, active: p.active, vendorId: p.vendorId })));

    console.log("\n--- Testing searchProducts({ category: 'designer' }) ---");
    const designerRes = await searchProducts({ category: "designer" });
    console.log("Designer Total:", designerRes.total);
    console.log("Designer Products:", designerRes.products.map(p => ({ id: p.id, name: p.name, category: p.category, status: p.status, active: p.active, vendorId: p.vendorId })));

    console.log("\n--- Testing searchProducts({}) (no category filter) ---");
    const allRes = await searchProducts({});
    console.log("All Total:", allRes.total);
    console.log("All Products:", allRes.products.map(p => ({ id: p.id, name: p.name, category: p.category, status: p.status, active: p.active, vendorId: p.vendorId })));

    console.log("\n--- Testing getProductFacets({ category: 'paithani' }) ---");
    const paithaniFacets = await getProductFacets({ category: "paithani" });
    console.log("Paithani Facets:", Object.keys(paithaniFacets));

    console.log("\n--- Testing getProductFacets({ category: 'designer' }) ---");
    const designerFacets = await getProductFacets({ category: "designer" });
    console.log("Designer Facets:", Object.keys(designerFacets));

    process.exit(0);
  } catch (err) {
    console.error("Error in test-products-live:", err);
    process.exit(1);
  }
}

main();
