import http from "http";

const testEmail = `seller_login_test_${Date.now()}@vastraa.com`;
const testPassword = "MySecurePassword@123";

function makeRequest(options, payload) {
  return new Promise((resolve, reject) => {
    const payloadStr = payload ? JSON.stringify(payload) : "";
    const reqHeaders = {
      ...options.headers,
      ...(payloadStr ? { "Content-Length": Buffer.byteLength(payloadStr) } : {}),
    };
    const req = http.request({ ...options, headers: reqHeaders }, (res) => {
      let data = "";
      res.on("data", (chunk) => { data += chunk; });
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve({ status: res.statusCode, body: json });
        } catch {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });
    req.on("error", (err) => reject(err));
    if (payloadStr) {
      req.write(payloadStr);
    }
    req.end();
  });
}

async function testSellerRegistrationAndLogin() {
  console.log("==================================================");
  console.log("🧪 Testing Seller Registration & Login Flow via API");
  console.log(`Test Email: ${testEmail}`);
  console.log("==================================================");

  // Step 1: Register New Seller
  console.log("\n1. Registering new seller via POST /api/seller/register...");
  const regPayload = {
    email: testEmail,
    password: testPassword,
    name: "Golden Weaves Silk",
    location: "Yeola, Maharashtra",
    bio: "Authentic handcrafted Yeola Paithani sarees.",
    tagline: "Royal Weaves of Yeola",
    mobile: "9876501234",
    panNumber: "ABCDE1234F",
    panCardUrl: "https://storage.vashtraa.com/private/kyc/pan_golden.pdf",
    gstCertUrl: "https://storage.vashtraa.com/private/kyc/gst_golden.pdf",
    bankHolder: "Golden Weaves Silk",
    bankName: "HDFC Bank",
    bankAccount: "50100987654321",
    bankIfsc: "HDFC0001234",
    shopStreet: "Main Road, Paithani Market",
    shopCity: "Yeola",
    shopState: "Maharashtra",
    shopPincode: "423401",
    termsAccepted: true,
  };

  const regOptions = {
    hostname: "localhost",
    port: 3001,
    path: "/api/seller/register",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };

  const regResult = await makeRequest(regOptions, regPayload);
  console.log(`Registration Status: ${regResult.status}`);
  console.log("Registration Response:", regResult.body);

  if (regResult.status !== 201 && regResult.status !== 200) {
    console.error("❌ Registration failed!");
    process.exit(1);
  }

  // Step 2: Test Login with exact same credentials
  console.log("\n2. Logging in via POST /api/seller/login with SAME credentials...");
  const loginPayload = {
    email: testEmail,
    password: testPassword,
  };

  const loginOptions = {
    hostname: "localhost",
    port: 3001,
    path: "/api/seller/login",
    method: "POST",
    headers: { "Content-Type": "application/json" },
  };

  const loginResult = await makeRequest(loginOptions, loginPayload);
  console.log(`Login Status: ${loginResult.status}`);
  console.log("Login Response:", loginResult.body);

  if (loginResult.status === 200 && loginResult.body.success && loginResult.body.token) {
    console.log("\n✅ SUCCESS: Seller logged in seamlessly using exact registered credentials!");
    console.log(`Token received: ${loginResult.body.token.substring(0, 25)}...`);
    console.log(`Vendor ID: ${loginResult.body.vendor?.id}`);
    process.exit(0);
  } else {
    console.error("❌ Login failed!");
    process.exit(1);
  }
}

testSellerRegistrationAndLogin().catch((err) => {
  console.error("❌ Script Error:", err);
  process.exit(1);
});
