import { mongoProducts, db, productsTable } from "@workspace/db";

async function main() {
  try {
    const mongoProds = await mongoProducts.findMany({});
    console.log("Mongo products count:", mongoProds.length);
    if (mongoProds.length > 0) {
      console.log("Sample Mongo product:", { id: mongoProds[0].id, name: mongoProds[0].name });
    }

    const pgProds = await db.select().from(productsTable).limit(5);
    console.log("Postgres products count:", pgProds.length);
    if (pgProds.length > 0) {
      console.log("Sample PG product:", { id: pgProds[0].id, name: pgProds[0].name });
    }
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
