const path = require('path');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

const root = path.resolve(__dirname, '..');
const mongoPath = path.join(root, 'node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');
const { MongoClient } = require(mongoPath);

const MONGODB_URI = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DB_NAME = "VASTRAA";

async function main() {
  console.log("=== FIXING EXISTING USER ACCOUNTS IN MONGODB ATLAS ===");
  const client = new MongoClient(MONGODB_URI, {
    tls: true,
    tlsAllowInvalidCertificates: true,
    serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  const db = client.db(DB_NAME);

  const users = await db.collection("users").find({}).toArray();
  console.log(`Found ${users.length} user records.`);

  for (const user of users) {
    const userId = user.id || String(user._id || "");
    const currentEmail = user.email || "";

    if ((!currentEmail || currentEmail.trim() === "") && userId.includes("@")) {
      const fixedEmail = userId.trim().toLowerCase();
      console.log(`Fixing empty email for user ${userId} -> setting email to "${fixedEmail}"`);
      await db.collection("users").updateOne(
        { _id: user._id },
        { $set: { email: fixedEmail } }
      );
    }
  }

  const updatedUsers = await db.collection("users").find({}).toArray();
  console.log("\nUpdated Users list:");
  updatedUsers.forEach(u => {
    console.log(`ID: ${u.id || u._id} | Email: ${u.email} | Role: ${u.role}`);
  });

  await client.close();
  console.log("\nDatabase repair complete!");
  process.exit(0);
}

main().catch(err => {
  console.error("Error repairing DB:", err);
  process.exit(1);
});
