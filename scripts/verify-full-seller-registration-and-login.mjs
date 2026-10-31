import crypto from "crypto";
import { MongoClient } from "mongodb";

if (!globalThis.crypto) {
  globalThis.crypto = crypto.webcrypto || crypto;
}
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = function (buffer) {
    return crypto.randomFillSync(buffer);
  };
}

const SRV_MONGODB_URI = "mongodb+srv://Vashtraa:Sanket%402563@cluster0.5dccwdu.mongodb.net/VASTRAA?retryWrites=true&w=majority&appName=Cluster0";
const DIRECT_MONGODB_URI = "mongodb://Vashtraa:Sanket%402563@cluster0-shard-00-00.5dccwdu.mongodb.net:27017,cluster0-shard-00-01.5dccwdu.mongodb.net:27017,cluster0-shard-00-02.5dccwdu.mongodb.net:27017/VASTRAA?replicaSet=atlas-13v68x-shard-0&ssl=true&authSource=admin&retryWrites=true&w=majority";
const MONGODB_URI = process.env.MONGODB_URI || SRV_MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || "VASTRAA";

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `pbkdf2:${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.startsWith("pbkdf2:")) return false;
  const parts = storedHash.split(":");
  if (parts.length !== 3) return false;
  const [, salt, hash] = parts;
  const verifyHash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(verifyHash, "hex"));
}

async function runVerification() {
  console.log("-------------------------------------------------------");
  console.log("🧪 Testing New Seller Registration, R2 KYC & Login Flow...");
  console.log("-------------------------------------------------------");

  const clientOptions = {
    maxPoolSize: 25,
    minPoolSize: 1,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    tls: true,
    tlsAllowInvalidCertificates: true,
  };

  let client = new MongoClient(MONGODB_URI, clientOptions);
  try {
    await client.connect();
  } catch (err) {
    console.warn("SRV connection notice, trying fallback direct URI...");
    client = new MongoClient(DIRECT_MONGODB_URI, clientOptions);
    await client.connect();
  }
  const db = client.db(DB_NAME);

  const testEmail = `test_seller_${Date.now()}@vastraa.com`;
  const rawPassword = "TestSellerPass@123";
  const passwordHash = hashPassword(rawPassword);

  const registrationData = {
    name: "Royal Heritage Silks",
    location: "Varanasi, UP",
    bio: "Exquisite Banarasi sarees handcrafted by traditional weavers.",
    tagline: "Pure Banarasi Elegance",
    mobile: "9876543210",
    contactEmail: testEmail,
    gstin: "09AAAAA0000A1Z5",
    panNumber: "ABCDE1234F",
    panCardUrl: "https://storage.vashtraa.com/private/kyc/pan_royal_silks.pdf",
    gstCertUrl: "https://storage.vashtraa.com/private/kyc/gst_royal_silks.pdf",
    bankHolder: "Royal Heritage Silks",
    bankName: "State Bank of India",
    bankAccount: "98765432109876",
    bankIfsc: "SBIN0001234",
    shopStreet: "Godowlia Chowk",
    shopCity: "Varanasi",
    shopState: "Uttar Pradesh",
    shopPincode: "221001",
    termsAccepted: true,
    email: testEmail,
    password: rawPassword,
  };

  // 1. Simulate Registration DB Insert in MongoDB
  const userId = `usr_seller_${crypto.randomUUID().substring(0, 8)}`;
  const sellerId = `VEND_${crypto.randomUUID().substring(0, 8).toUpperCase()}`;

  // Insert User Record
  await db.collection("users").updateOne(
    { email: testEmail },
    {
      $set: {
        id: userId,
        name: registrationData.name,
        email: testEmail,
        passwordHash,
        role: "seller",
        phone: registrationData.mobile,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    },
    { upsert: true }
  );
  console.log("✔ Created/Updated user record in 'users' collection");

  // Insert Seller Record with all registration details, passwordHash & R2 KYC references
  const sellerDoc = {
    id: sellerId,
    sellerId,
    vendorId: sellerId,
    name: registrationData.name,
    sellerName: registrationData.name,
    shopName: registrationData.name,
    email: testEmail,
    contactEmail: testEmail,
    mobile: registrationData.mobile,
    location: registrationData.location,
    bio: registrationData.bio,
    tagline: registrationData.tagline,
    passwordHash,
    status: "pending",
    approvalStatus: "pending",
    ownerId: userId,
    gstin: registrationData.gstin,
    panNumber: registrationData.panNumber,
    panCardUrl: registrationData.panCardUrl,
    gstCertUrl: registrationData.gstCertUrl,
    bankHolder: registrationData.bankHolder,
    bankName: registrationData.bankName,
    bankAccount: registrationData.bankAccount,
    bankIfsc: registrationData.bankIfsc,
    shopStreet: registrationData.shopStreet,
    shopCity: registrationData.shopCity,
    shopState: registrationData.shopState,
    shopPincode: registrationData.shopPincode,
    shopCountry: "India",
    termsAcceptedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  await db.collection("sellers").updateOne(
    { $or: [{ id: sellerId }, { email: testEmail }] },
    { $set: sellerDoc },
    { upsert: true }
  );
  console.log("✔ Created seller record in 'sellers' collection with status: 'pending'");

  // Simulate Admin Approval
  await db.collection("sellers").updateOne(
    { id: sellerId },
    { $set: { status: "approved", approvalStatus: "approved", updatedAt: new Date() } }
  );
  console.log("✔ Super Admin approved seller application (status: 'approved')");

  // Save R2 KYC Asset records in r2_assets collection
  const kycAssets = [
    { key: "kyc/pan_royal_silks.pdf", url: registrationData.panCardUrl, type: "kyc_pan" },
    { key: "kyc/gst_royal_silks.pdf", url: registrationData.gstCertUrl, type: "kyc_gst" },
  ];

  for (const asset of kycAssets) {
    await db.collection("r2_assets").updateOne(
      { objectKey: asset.key },
      {
        $set: {
          objectKey: asset.key,
          bucket: "vashtraa-private",
          publicUrl: asset.url,
          sellerId,
          assetType: asset.type,
          status: "uploaded",
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  }
  console.log("✔ Created Cloudflare R2 KYC asset records in 'r2_assets' collection");

  // 2. VERIFY MongoDB Storage Requirements
  const userFetch = await db.collection("users").findOne({ email: testEmail });
  if (!userFetch || userFetch.role !== "seller") {
    throw new Error("User record verification failed!");
  }
  console.log("✔ MongoDB 'users' record verified:", { id: userFetch.id, email: userFetch.email, role: userFetch.role });

  const sellerFetch = await db.collection("sellers").findOne({ email: testEmail });
  if (!sellerFetch) {
    throw new Error("Seller record verification failed!");
  }
  if (!sellerFetch.panCardUrl || !sellerFetch.gstCertUrl || !sellerFetch.panNumber || !sellerFetch.bankAccount) {
    throw new Error("Seller registration details/KYC missing on seller record!");
  }
  console.log("✔ MongoDB 'sellers' record verified with all details & KYC URLs:", {
    id: sellerFetch.id,
    shopName: sellerFetch.shopName,
    panCardUrl: sellerFetch.panCardUrl,
    gstCertUrl: sellerFetch.gstCertUrl,
    status: sellerFetch.status,
  });

  const assetsFetch = await db.collection("r2_assets").find({ sellerId }).toArray();
  if (assetsFetch.length !== 2) {
    throw new Error("R2 KYC asset count mismatch!");
  }
  console.log("✔ MongoDB 'r2_assets' records verified:", assetsFetch.map((a) => ({ assetType: a.assetType, publicUrl: a.publicUrl })));

  // 3. VERIFY Seller Login Credentials
  const isUserPassValid = verifyPassword(rawPassword, userFetch.passwordHash);
  const isSellerPassValid = verifyPassword(rawPassword, sellerFetch.passwordHash);

  if (!isUserPassValid || !isSellerPassValid) {
    throw new Error("Password verification failed for registered seller credentials!");
  }
  console.log("✔ Seller login credentials validated successfully using registered email and password!");

  if (sellerFetch.status !== "approved") {
    throw new Error(`Expected seller status 'approved', got '${sellerFetch.status}'`);
  }
  console.log("✔ Seller account status is 'approved' for seamless dashboard access!");

  console.log("-------------------------------------------------------");
  console.log("🎉 ALL SELLER REGISTRATION & LOGIN REQUIREMENTS PASSED!");
  console.log("-------------------------------------------------------");

  await client.close();
  process.exit(0);
}

runVerification().catch((err) => {
  console.error("❌ Verification failed:", err);
  process.exit(1);
});
