import { MongoClient } from "mongodb";

const uri = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(uri);

async function test() {
  try {
    await client.connect();
    console.log("Connected successfully to MongoDB Atlas!");
    const db = client.db("VASTRAA");
    const count = await db.collection("products").countDocuments();
    console.log("Products count in MongoDB:", count);
  } finally {
    await client.close();
  }
}
test();
