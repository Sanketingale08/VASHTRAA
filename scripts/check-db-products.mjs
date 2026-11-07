import { MongoClient } from 'mongodb';

async function check() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set!");
    return;
  }
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db('VASTRAA');
  const count = await db.collection('products').countDocuments();
  console.log('Total products in MongoDB products collection:', count);

  const sample = await db.collection('products').find({}).limit(10).toArray();
  console.log('Sample products:', JSON.stringify(sample.map(p => ({
    id: p.id,
    name: p.name,
    category: p.category,
    status: p.status,
    active: p.active,
    vendorId: p.vendorId,
    vendorName: p.vendorName,
    price: p.price
  })), null, 2));

  const vendorCounts = await db.collection('vendors').countDocuments();
  console.log('Total vendors in MongoDB vendors collection:', vendorCounts);
  const sampleVendors = await db.collection('vendors').find({}).limit(10).toArray();
  console.log('Sample vendors:', JSON.stringify(sampleVendors.map(v => ({
    id: v.id,
    name: v.name,
    status: v.status,
    approvalStatus: v.approvalStatus
  })), null, 2));

  await client.close();
}
check().catch(console.error);
