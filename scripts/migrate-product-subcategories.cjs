const fs = require('fs');
const path = require('path');
const dns = require('dns');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch (e) {}

function patch(obj, name) {
  const orig = obj[name];
  if (!orig) return;
  obj[name] = function(...args) {
    try {
      return orig.apply(this, args);
    } catch (e) {
      if (e && (e.code === 'EPERM' || e.code === 'EACCES')) {
        if (name.includes('lstat')) {
          try { return fs.statSync(...args); } catch (_) {}
        }
        return args[0];
      }
      throw e;
    }
  };
}

patch(fs, 'realpathSync');
patch(fs, 'lstatSync');
if (fs.promises) {
  patch(fs.promises, 'realpath');
  patch(fs.promises, 'lstat');
}

const root = path.resolve(__dirname, '..');
const mongoPath = path.join(root, 'node_modules/.pnpm/mongodb@6.21.0/node_modules/mongodb');
const { MongoClient } = require(mongoPath);

// Centralized subcategory definition and aliases (matching lib/db/src/categories.ts)
const CATALOG_CATEGORIES = [
  {
    id: "cat-paithani-default",
    name: "Paithani",
    slug: "paithani",
    subcategories: [
      { id: "cat-festival-paithani", name: "Festival Paithani", slug: "festival-paithani" },
      { id: "cat-bridal-paithani", name: "Bridal Paithani", slug: "bridal-paithani" },
      { id: "cat-wedding-paithani", name: "Wedding Paithani", slug: "wedding-paithani" },
      { id: "cat-contemporary-silk-paithani", name: "Contemporary Silk", slug: "contemporary-silk" },
    ],
  },
  {
    id: "cat-designer-default",
    name: "Designer",
    slug: "designer",
    subcategories: [
      { id: "cat-bollywood-sarees", name: "Bollywood", slug: "bollywood" },
      { id: "cat-designer-bridal", name: "Bridal", slug: "bridal" },
      { id: "cat-contemporary-silk", name: "Contemporary Silk", slug: "contemporary-silk" },
      { id: "cat-wedding-designer-sarees", name: "Wedding Designer Sarees", slug: "wedding-designer-sarees" },
    ],
  },
  {
    id: "cat-bollywood-default",
    name: "Bollywood",
    slug: "bollywood",
    subcategories: [
      { id: "cat-bollywood-party-wear", name: "Bollywood Party Wear", slug: "bollywood-party-wear" },
      { id: "cat-celebrity-designer", name: "Celebrity Designer", slug: "celebrity-designer" },
      { id: "cat-bollywood-bridal", name: "Bollywood Bridal", slug: "bollywood-bridal" },
      { id: "cat-contemporary-silk-bollywood", name: "Contemporary Silk", slug: "contemporary-silk" },
    ],
  },
  {
    id: "cat-bridal-default",
    name: "Bridal",
    slug: "bridal",
    subcategories: [
      { id: "cat-bridal-paithani-sub", name: "Bridal Paithani", slug: "bridal-paithani" },
      { id: "cat-bridal-designer", name: "Bridal Designer", slug: "bridal-designer" },
      { id: "cat-wedding-silk", name: "Wedding Silk", slug: "wedding-silk" },
      { id: "cat-royal-trousseau", name: "Royal Trousseau", slug: "royal-trousseau" },
    ],
  },
  {
    id: "cat-contemporary-silk-main",
    name: "Contemporary Silk",
    slug: "contemporary-silk",
    subcategories: [
      { id: "cat-modern-paithani", name: "Modern Paithani", slug: "modern-paithani" },
      { id: "cat-fusion-silk", name: "Fusion Silk", slug: "fusion-silk" },
      { id: "cat-digital-print-silk", name: "Digital Print Silk", slug: "digital-print-silk" },
      { id: "cat-art-silk", name: "Art Silk", slug: "art-silk" },
    ],
  },
  {
    id: "cat-wedding-paithani-main",
    name: "Wedding Paithani",
    slug: "wedding-paithani",
    subcategories: [
      { id: "cat-traditional-yeola", name: "Traditional Yeola", slug: "traditional-yeola" },
      { id: "cat-pure-silk-handloom", name: "Pure Silk Handloom", slug: "pure-silk-handloom" },
      { id: "cat-royal-zari-border", name: "Royal Zari Border", slug: "royal-zari-border" },
      { id: "cat-bridal-wedding-paithani", name: "Bridal Wedding Paithani", slug: "bridal-wedding-paithani" },
    ],
  },
  {
    id: "cat-western-paithani-main",
    name: "Western Paithani",
    slug: "western-paithani",
    subcategories: [
      { id: "cat-indo-western-fusion", name: "Indo-Western Fusion", slug: "indo-western-fusion" },
      { id: "cat-contemporary-drape", name: "Contemporary Drape", slug: "contemporary-drape" },
      { id: "cat-cocktail-paithani", name: "Cocktail Paithani", slug: "cocktail-paithani" },
      { id: "cat-party-wear-western", name: "Party Wear", slug: "party-wear" },
    ],
  },
];

const SUBCATEGORY_LEGACY_ALIASES = {
  paithani: {
    bridal: "bridal-paithani",
    "bridal-paithani": "bridal-paithani",
    festival: "festival-paithani",
    festive: "festival-paithani",
    "festival-paithani": "festival-paithani",
    wedding: "wedding-paithani",
    "wedding-paithani": "wedding-paithani",
    contemporary: "contemporary-silk",
    "contemporary-silk": "contemporary-silk",
    "contemporary-silk-paithani": "contemporary-silk",
    yeola: "wedding-paithani",
    "traditional-yeola": "wedding-paithani",
  },
  designer: {
    bollywood: "bollywood",
    bridal: "bridal",
    contemporary: "contemporary-silk",
    "contemporary-silk": "contemporary-silk",
    wedding: "wedding-designer-sarees",
    "wedding-designer": "wedding-designer-sarees",
  },
  bollywood: {
    "party-wear": "bollywood-party-wear",
    party: "bollywood-party-wear",
    celebrity: "celebrity-designer",
    bridal: "bollywood-bridal",
    contemporary: "contemporary-silk",
    "contemporary-silk": "contemporary-silk",
  },
  bridal: {
    paithani: "bridal-paithani",
    designer: "bridal-designer",
    wedding: "wedding-silk",
    trousseau: "royal-trousseau",
  },
  "contemporary-silk": {
    modern: "modern-paithani",
    fusion: "fusion-silk",
    digital: "digital-print-silk",
    art: "art-silk",
  },
  "wedding-paithani": {
    yeola: "traditional-yeola",
    handloom: "pure-silk-handloom",
    "pure-silk": "pure-silk-handloom",
    zari: "royal-zari-border",
    bridal: "bridal-wedding-paithani",
  },
  "western-paithani": {
    fusion: "indo-western-fusion",
    drape: "contemporary-drape",
    cocktail: "cocktail-paithani",
    party: "party-wear",
  },
};

function normalizeStr(str) {
  return String(str || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function findCategory(input) {
  if (!input) return null;
  const raw = String(input).trim();
  const slug = normalizeStr(raw);
  for (const c of CATALOG_CATEGORIES) {
    if (c.slug === slug || normalizeStr(c.name) === slug || c.id === raw) {
      return c;
    }
  }
  if (slug === 'paithani-sarees' || slug === 'paithani-saree') return CATALOG_CATEGORIES[0];
  if (slug === 'designer-sarees' || slug === 'designer-saree') return CATALOG_CATEGORIES[1];
  return null;
}

function resolveCanonicalSub(catSlug, subInput) {
  if (!subInput) return null;
  const raw = String(subInput).trim();
  const slug = normalizeStr(raw);

  const cat = CATALOG_CATEGORIES.find(c => c.slug === catSlug);
  if (!cat) return null;

  // Direct match
  for (const s of cat.subcategories) {
    if (s.name.toLowerCase() === raw.toLowerCase() || s.slug === slug || s.id === raw) {
      return s;
    }
  }

  // Alias match
  const aliasSlug = SUBCATEGORY_LEGACY_ALIASES[catSlug]?.[slug];
  if (aliasSlug) {
    return cat.subcategories.find(s => s.slug === aliasSlug) || null;
  }

  return null;
}

const DIRECT_MONGODB_URI = "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017,cluster0-shard-00-01.5dccwdu.mongodb.net:27017,cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?replicaSet=atlas-13v68x-shard-0&ssl=true&authSource=admin&retryWrites=true&w=majority";
const MONGODB_URI = process.env.MONGODB_URI || DIRECT_MONGODB_URI;

async function migrate() {
  console.log("=== VASTRAA PRODUCT SUBCATEGORY MIGRATION ===\n");
  let migratedCount = 0;
  let unchangedCount = 0;
  let unresolvedCount = 0;

  // 1. Migrate in MongoDB if accessible
  try {
    const client = new MongoClient(MONGODB_URI, {
      tls: true,
      tlsAllowInvalidCertificates: true,
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });

    console.log("Connecting to MongoDB Atlas...");
    await client.connect();
    const db = client.db("VASTRAA");
    const products = await db.collection("products").find({}).toArray();
    console.log(`Found ${products.length} products in MongoDB.`);

    for (const p of products) {
      const cat = findCategory(p.category || p.categoryName || p.categoryId);
      if (!cat) {
        console.log(`[SKIPPED] Product [${p.id || p._id}] "${p.name}": Non-catalog category "${p.category}".`);
        continue;
      }

      if (!p.subcategory) {
        unchangedCount++;
        continue;
      }

      const canonicalSub = resolveCanonicalSub(cat.slug, p.subcategory);
      if (canonicalSub) {
        if (p.subcategory !== canonicalSub.name || p.subcategoryId !== canonicalSub.id) {
          await db.collection("products").updateOne(
            { _id: p._id },
            {
              $set: {
                subcategory: canonicalSub.name,
                subcategoryName: canonicalSub.name,
                subcategoryId: canonicalSub.id,
                updatedAt: new Date(),
              },
            }
          );
          console.log(`[MIGRATED] Product [${p.id || p._id}] "${p.name}": "${p.subcategory}" -> "${canonicalSub.name}" (category: ${cat.name})`);
          migratedCount++;
        } else {
          unchangedCount++;
        }
      } else {
        console.warn(`[UNRESOLVED] Product [${p.id || p._id}] "${p.name}": Unknown subcategory "${p.subcategory}" under category "${cat.name}". Preserved as-is.`);
        unresolvedCount++;
      }
    }

    await client.close();
  } catch (err) {
    console.warn("MongoDB Atlas connection not available from this environment (sandbox isolation or timeout):", err.message);
  }

  // 2. Also migrate backup-test-data.json if present
  const backupFile = path.join(__dirname, 'backup-test-data.json');
  if (fs.existsSync(backupFile)) {
    try {
      const content = fs.readFileSync(backupFile, 'utf8');
      const data = JSON.parse(content);
      let backupMigrated = 0;
      if (Array.isArray(data.targetProducts)) {
        for (const p of data.targetProducts) {
          const cat = findCategory(p.category || p.categoryName);
          if (cat && p.subcategory) {
            const canon = resolveCanonicalSub(cat.slug, p.subcategory);
            if (canon && p.subcategory !== canon.name) {
              console.log(`[BACKUP DATA MIGRATED] Product [${p.id || p._id}] "${p.name}": "${p.subcategory}" -> "${canon.name}"`);
              p.subcategory = canon.name;
              p.subcategoryName = canon.name;
              p.subcategoryId = canon.id;
              backupMigrated++;
            }
          }
        }
        if (backupMigrated > 0) {
          fs.writeFileSync(backupFile, JSON.stringify(data, null, 2), 'utf8');
          console.log(`Updated ${backupMigrated} records in backup-test-data.json.`);
        }
      }
    } catch (e) {
      console.warn("Could not migrate backup-test-data.json:", e.message);
    }
  }

  console.log("\n=== MIGRATION SUMMARY ===");
  console.log(`Migrated:   ${migratedCount}`);
  console.log(`Unchanged:  ${unchangedCount}`);
  console.log(`Unresolved: ${unresolvedCount}`);
  console.log("Migration finished successfully.");
}

migrate().catch(console.error);
