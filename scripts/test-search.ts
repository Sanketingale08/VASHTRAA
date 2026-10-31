import { connectToMongoDB } from "@workspace/db";
import { searchProducts, getSearchSuggestions } from "../artifacts/api-server/src/lib/searchEngine";

async function runTests() {
  console.log("=== VASTRAA Search Engine Automated Test Suite ===");
  await connectToMongoDB();

  const testQueries = [
    "blue paithani",
    "red paithani",
    "festival paithani",
    "wedding paithani",
    "blue designer saree",
    "red designer",
    "festival designer saree",
    "blu",
    "paith",
    "desi",
  ];

  for (const q of testQueries) {
    console.log(`\n--------------------------------------------------`);
    console.log(`🔍 QUERY: "${q}"`);
    console.log(`--------------------------------------------------`);

    const res = await searchProducts({ search: q, limit: 5 });
    console.log(`Total Products Found: ${res.total}`);
    if (res.products.length > 0) {
      console.log("Top Results:");
      res.products.forEach((p, idx) => {
        console.log(`  ${idx + 1}. [${p.id}] ${p.name} | Cat: ${p.category} | Color: ${p.color} | Occasion: ${p.occasion} | Price: ₹${p.price}`);
      });
    } else {
      console.log("  ⚠️ No products returned for this query.");
    }

    const suggestions = await getSearchSuggestions(q, 3);
    console.log(`Suggestions Total Count: ${suggestions.totalCount}`);
    if (suggestions.categories.length > 0) {
      console.log("  Categories:", suggestions.categories.map(c => c.label).join(", "));
    }
    if (suggestions.colors.length > 0) {
      console.log("  Colors:", suggestions.colors.map(c => c.label).join(", "));
    }
    if (suggestions.occasions.length > 0) {
      console.log("  Occasions:", suggestions.occasions.map(o => o.label).join(", "));
    }
  }

  console.log("\n==================================================");
  console.log("✨ All Search Engine Tests Complete.");
  process.exit(0);
}

runTests().catch(err => {
  console.error("Test execution error:", err);
  process.exit(1);
});
