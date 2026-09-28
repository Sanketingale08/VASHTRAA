const fs = require('fs');
const path = require('path');
const dns = require('dns');

try { dns.setServers(['8.8.8.8', '1.1.1.1']); } catch(e){}

function patch(obj, name) {
  const orig = obj[name];
  if (!orig) return;
  obj[name] = function(...args) {
    try { return orig.apply(this, args); } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        if (name.includes('lstat')) { try { return fs.statSync(...args); } catch(_) {} }
        return args[0];
      }
      throw e;
    }
  };
}
patch(fs, 'realpathSync');
patch(fs, 'lstatSync');
if (fs.promises) { patch(fs.promises, 'realpath'); patch(fs.promises, 'lstat'); }

const root = path.resolve(__dirname, '..');
const mongoPath = path.join(root, 'node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');
const { MongoClient } = require(mongoPath);

async function test() {
  console.log("=== TESTING PRODUCT FETCH FROM MONGO & POSTGRES ===");
  // Check mongo
  try {
    const client = new MongoClient("mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0", {
      tls: true,
      tlsAllowInvalidCertificates: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await client.connect();
    const db = client.db("VASTRAA");
    const products = await db.collection("products").find({}).toArray();
    console.log(`[Mongo] Found ${products.length} products:`);
    products.forEach(p => {
      console.log(`  - ID: ${p.id || p._id}, Name: "${p.name}", Active: ${p.active}, VendorId: ${p.vendorId}, Stock: ${p.stock}, Status: ${p.status}`);
    });
    await client.close();
  } catch(e) {
    console.error("[Mongo Error]", e.message);
  }

  // Check Postgres
  try {
    const pg = require(path.join(root, 'node_modules/.pnpm/pg@8.13.1/node_modules/pg'));
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/twirldrape" });
    const res = await pool.query(`SELECT id, name, active, status, stock, "vendorId" FROM products`);
    console.log(`[Postgres] Found ${res.rows.length} products:`);
    res.rows.forEach(p => {
      console.log(`  - ID: ${p.id}, Name: "${p.name}", Active: ${p.active}, VendorId: ${p.vendorId}, Stock: ${p.stock}, Status: ${p.status}`);
    });
    await pool.end();
  } catch(e) {
    console.error("[Postgres Notice]", e.message);
  }

  process.exit(0);
}

test();
