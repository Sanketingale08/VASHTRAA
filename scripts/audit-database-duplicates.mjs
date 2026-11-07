import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI || "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";

async function auditDuplicates() {
  const client = new MongoClient(uri, { tls: true, tlsAllowInvalidCertificates: true, serverSelectionTimeoutMS: 5000 });
  try {
    await client.connect();
    const db = client.db("VASTRAA");
    console.log("Connected to MongoDB Atlas for Duplicate Audit.");

    const collections = [
      { name: "users", fields: ["email", "id"] },
      { name: "sellers", fields: ["email", "vendorId", "id"] },
      { name: "product_categories", fields: ["slug", "id"] },
      { name: "products", fields: ["productId", "id"] },
      { name: "orders", fields: ["orderId", "id", "displayId", "cashfreeOrderId"] },
      { name: "vendor_settlements", fields: ["orderId", "id"] },
      { name: "coupons", fields: ["code", "id"] },
      { name: "shipments", fields: ["orderId", "id"] },
      { name: "r2_assets", fields: ["objectKey"] },
    ];

    const results = {};

    for (const colDef of collections) {
      results[colDef.name] = {};
      const col = db.collection(colDef.name);
      const totalDocs = await col.countDocuments();
      results[colDef.name].total = totalDocs;

      for (const field of colDef.fields) {
        const pipeline = [
          { $match: { [field]: { $exists: true, $ne: null, $ne: "" } } },
          {
            $group: {
              _id: typeof field === "string" ? { $toLower: `$${field}` } : `$${field}`,
              count: { $sum: 1 },
              docs: { $push: { _id: "$_id", id: "$id" } }
            }
          },
          { $match: { count: { $gt: 1 } } },
          { $sort: { count: -1 } }
        ];

        try {
          const duplicates = await col.aggregate(pipeline).toArray();
          results[colDef.name][field] = {
            duplicateGroupsCount: duplicates.length,
            groups: duplicates.slice(0, 5) // Sample
          };
        } catch (aggErr) {
          // If $toLower failed because field is not string or other reason
          const fallbackPipeline = [
            { $match: { [field]: { $exists: true, $ne: null, $ne: "" } } },
            {
              $group: {
                _id: `$${field}`,
                count: { $sum: 1 },
                docs: { $push: { _id: "$_id", id: "$id" } }
              }
            },
            { $match: { count: { $gt: 1 } } },
            { $sort: { count: -1 } }
          ];
          const duplicates = await col.aggregate(fallbackPipeline).toArray();
          results[colDef.name][field] = {
            duplicateGroupsCount: duplicates.length,
            groups: duplicates.slice(0, 5)
          };
        }
      }
    }

    console.log("=== DUPLICATE AUDIT RESULTS ===");
    console.log(JSON.stringify(results, null, 2));

  } catch (err) {
    console.error("Audit error:", err);
  } finally {
    await client.close();
  }
}

auditDuplicates();
