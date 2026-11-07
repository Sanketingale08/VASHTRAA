import { MongoClient } from "mongodb";
import bcrypt from "bcryptjs";

const uri = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";

async function run() {
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log("Connected to MongoDB Atlas");
    const db = client.db("VASTRAA");
    const col = db.collection("site_settings");

    // 1. Delete plaintext keys
    const delRes = await col.deleteMany({ key: { $in: ["admin_access_key", "admin_key"] } });
    console.log("Deleted plaintext key records:", delRes.deletedCount);

    // 2. Ensure admin_key_hash is hashed with bcrypt
    const existing = await col.findOne({ key: "admin_key_hash" });
    if (!existing || !existing.value.startsWith("$2")) {
      const bcryptHash = await bcrypt.hash("Admin@123", 10);
      await col.updateOne(
        { key: "admin_key_hash" },
        { $set: { key: "admin_key_hash", value: bcryptHash, updatedAt: new Date() } },
        { upsert: true }
      );
      console.log("Upgraded admin_key_hash to bcrypt hash:", bcryptHash.slice(0, 15) + "...");
    } else {
      console.log("admin_key_hash is already bcrypt:", existing.value.slice(0, 15) + "...");
    }

    // 3. Inspect final state of security keys
    const remaining = await col.find({ key: { $in: ["admin_key_hash", "admin_access_key", "admin_key"] } }).toArray();
    console.log("Final check of security keys in site_settings:");
    for (const r of remaining) {
      console.log(`- ${r.key}: ${r.value.startsWith("$2") ? "SECURE BCRYPT HASH" : "PLAINTEXT: " + r.value}`);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

run();
