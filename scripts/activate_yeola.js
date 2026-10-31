const { MongoClient } = require("mongodb");
const dotenv = require("dotenv");
dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

async function main() {
  console.log("Connecting to MongoDB Atlas...");
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 15000,
  });

  try {
    await client.connect();
    const db = client.db(DB_NAME);

    console.log("\nSearching for Yeola Weavers / seller@vastraa.com in MongoDB...");

    // Check sellers collection
    const seller = await db.collection("sellers").findOne({
      $or: [
        { email: "seller@vastraa.com" },
        { contactEmail: "seller@vastraa.com" },
        { name: /Yeola Weavers/i },
        { shopName: /Yeola Weavers/i },
        { id: "VEND_DEMO_001" }
      ]
    });

    console.log("Current Seller document in 'sellers':", seller);

    // Check vendors collection
    const vendor = await db.collection("vendors").findOne({
      $or: [
        { email: "seller@vastraa.com" },
        { contactEmail: "seller@vastraa.com" },
        { name: /Yeola Weavers/i },
        { shopName: /Yeola Weavers/i },
        { id: "VEND_DEMO_001" }
      ]
    });

    console.log("Current Vendor document in 'vendors':", vendor);

    // Check users collection
    const user = await db.collection("users").findOne({
      $or: [
        { email: "seller@vastraa.com" },
        { id: "USR_DEMO_SELLER" }
      ]
    });

    console.log("Current User document in 'users':", user);

  } catch (err) {
    console.error("Error connecting or querying MongoDB:", err);
  } finally {
    await client.close();
  }
}

main();
