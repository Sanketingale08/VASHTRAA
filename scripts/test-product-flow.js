const fs = require('fs');
const path = require('path');

const mongoPath = path.join(process.cwd(), 'node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');
const { MongoClient } = require(mongoPath);

const directUris = [
  "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority",
  "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017,cluster0-shard-00-01.5dccwdu.mongodb.net:27017,cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?ssl=true&authSource=admin",
  "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017/VASTRAA?ssl=true&authSource=admin",
  "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-01.5dccwdu.mongodb.net:27017/VASTRAA?ssl=true&authSource=admin",
  "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?ssl=true&authSource=admin"
];

async function run() {
  console.log("=== TESTING DIRECT MONGO URI CONNECTIONS ===");
  for (const uri of directUris) {
    try {
      console.log("Trying URI:", uri.split("@")[1]);
      const client = new MongoClient(uri, {
        tls: true,
        tlsAllowInvalidCertificates: true,
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000
      });
      await client.connect();
      console.log(">>> SUCCESS CONNECTED TO MONGO! <<<");
      const db = client.db("VASTRAA");
      const products = await db.collection("products").find({}).toArray();
      console.log(`Products count: ${products.length}`);
      products.forEach(p => console.log(JSON.stringify(p, null, 2)));
      await client.close();
      process.exit(0);
    } catch(e) {
      console.log("Failed:", e.message);
    }
  }
  process.exit(1);
}

run();
