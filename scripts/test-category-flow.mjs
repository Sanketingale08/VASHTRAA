import { mongoProductCategories } from "@workspace/db";

async function testCategoryFlow() {
  console.log("Starting category unit test...");
  
  // 1. Seed defaults
  await mongoProductCategories.seedDefaults();
  let categories = await mongoProductCategories.listActive();
  console.log("Initial categories count:", categories.length);
  console.log("Initial categories:", categories.map(c => c.name));

  // 2. Create custom category
  const testCatName = "Kanjeevaram Silk Test " + Date.now();
  const created = await mongoProductCategories.create({ name: testCatName });
  console.log("Created custom category:", created);

  // 3. Verify in active list
  categories = await mongoProductCategories.listActive();
  console.log("Updated categories count:", categories.length);
  const found = categories.find(c => c.slug === created.slug);
  
  if (found) {
    console.log("SUCCESS: Created category found in active categories list:", found);
  } else {
    console.error("FAIL: Created category not found in list");
    process.exit(1);
  }
}

testCategoryFlow().catch(err => {
  console.error("Test error:", err);
  process.exit(1);
});
