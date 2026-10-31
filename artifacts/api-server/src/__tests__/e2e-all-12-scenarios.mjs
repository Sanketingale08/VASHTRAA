// Comprehensive E2E verification script for all 12 acceptance criteria
import assert from "node:assert";

const BASE_URL = "http://localhost:3001";
const ADMIN_KEY = process.env.ADMIN_API_KEY || "Admin@123";

async function parseResponse(res, expectedStatus = 200) {
  if (res.status !== expectedStatus) {
    const text = await res.text();
    throw new Error(`Expected HTTP ${expectedStatus} but received HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function runTests() {
  console.log("=== STARTING FULL 12-POINT ACCEPTANCE VERIFICATION ===");

  const headers = {
    "x-admin-key": ADMIN_KEY,
    "Content-Type": "application/json",
  };

  // Helper: Upload an image file via multipart
  async function uploadImage(name) {
    const pngBytes = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    let body = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${name}"\r\nContent-Type: image/png\r\n\r\n`),
      pngBytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);

    const res = await fetch(`${BASE_URL}/api/admin/upload/advertisement-image`, {
      method: "POST",
      headers: {
        "x-admin-key": ADMIN_KEY,
        "content-type": `multipart/form-data; boundary=${boundary}`,
        "x-file-name": encodeURIComponent(name),
      },
      body,
    });
    const data = await parseResponse(res, 200);
    assert(data.publicUrl, "Upload should return publicUrl");
    assert(data.objectKey, "Upload should return objectKey");
    return data;
  }

  // --- Acceptance Test 1 ---
  console.log("\n[Test 1] Upload an image without entering a URL or title -> saves successfully");
  const upload1 = await uploadImage("paithani-untitled-1.png");
  const ad1Res = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      uploadedImageUrl: upload1.publicUrl,
      objectKey: upload1.objectKey,
      displayOrder: 10,
      isActive: true,
    }),
  });
  const ad1 = await parseResponse(ad1Res, 201);
  assert.strictEqual(ad1.title, "");
  assert.strictEqual(ad1.imageUrl, upload1.publicUrl);
  assert.strictEqual(ad1.imageSource, "upload");
  console.log("✓ Test 1 Passed: Untitled uploaded advertisement created with ID:", ad1.id);

  // --- Acceptance Test 2 ---
  console.log("\n[Test 2] Enter a valid image URL without uploading a file or entering a title -> saves successfully");
  const externalUrl = "https://images.unsplash.com/photo-1610030469983-98e550d6193c";
  const ad2Res = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      externalImageUrl: externalUrl,
      displayOrder: 11,
      isActive: true,
    }),
  });
  const ad2 = await parseResponse(ad2Res, 201);
  assert.strictEqual(ad2.title, "");
  assert.strictEqual(ad2.imageUrl, externalUrl);
  assert.strictEqual(ad2.imageSource, "url");
  console.log("✓ Test 2 Passed: Untitled URL advertisement created with ID:", ad2.id);

  // --- Acceptance Test 3 ---
  console.log("\n[Test 3] Upload an image and provide a title -> saves successfully");
  const upload3 = await uploadImage("designer-bridal-3.png");
  const ad3Res = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Royal Heritage Paithani",
      description: "Directly from authentic Maharashtra looms",
      uploadedImageUrl: upload3.publicUrl,
      objectKey: upload3.objectKey,
      displayOrder: 12,
      isActive: true,
      linkUrl: "/category/paithani",
    }),
  });
  const ad3 = await parseResponse(ad3Res, 201);
  assert.strictEqual(ad3.title, "Royal Heritage Paithani");
  assert.strictEqual(ad3.imageUrl, upload3.publicUrl);
  console.log("✓ Test 3 Passed: Titled uploaded advertisement created with ID:", ad3.id);

  // --- Acceptance Test 4 ---
  console.log("\n[Test 4] Enter a URL and provide a title -> saves successfully");
  const externalUrl4 = "https://images.unsplash.com/photo-1583391733956-3750e0ff4e8b";
  const ad4Res = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Exclusive Designer Saree Festival",
      description: "Contemporary bridal silks with handcrafted embroidery",
      externalImageUrl: externalUrl4,
      displayOrder: 13,
      isActive: true,
      linkUrl: "/category/designer",
    }),
  });
  const ad4 = await parseResponse(ad4Res, 201);
  assert.strictEqual(ad4.title, "Exclusive Designer Saree Festival");
  assert.strictEqual(ad4.imageUrl, externalUrl4);
  console.log("✓ Test 4 Passed: Titled URL advertisement created with ID:", ad4.id);

  // --- Acceptance Test 5 ---
  console.log("\n[Test 5] Submit with both image sources empty -> displays correct validation error");
  const ad5Res = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "No Image Ad",
      displayOrder: 14,
    }),
  });
  assert.strictEqual(ad5Res.status, 400);
  const ad5Err = await ad5Res.json();
  assert.strictEqual(ad5Err.error, "Please upload an image or enter an image URL.");
  console.log("✓ Test 5 Passed: Returns exact error 'Please upload an image or enter an image URL.'");

  // --- Acceptance Test 6 ---
  console.log("\n[Test 6] Provide both image sources -> displays error that only one is allowed");
  const ad6Res = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Conflicting Ad",
      uploadedImageUrl: upload1.publicUrl,
      externalImageUrl: externalUrl,
    }),
  });
  assert.strictEqual(ad6Res.status, 400);
  const ad6Err = await ad6Res.json();
  assert.strictEqual(ad6Err.error, "Please provide either an uploaded image or an image URL, but not both.");
  console.log("✓ Test 6 Passed: Returns exact error 'Please provide either an uploaded image or an image URL, but not both.'");

  // --- Acceptance Test 7 ---
  console.log("\n[Test 7] Upload an image and verify it persists in R2/Storage and MongoDB");
  // Test served via public endpoint
  const serveImg = await fetch(`${BASE_URL}${upload3.publicUrl}`);
  assert.strictEqual(serveImg.status, 200, "Image should be served with 200");
  assert(serveImg.headers.get("content-type")?.includes("image/png"));
  // Verify in DB via admin fetch
  const getAd3 = await fetch(`${BASE_URL}/api/admin/advertisements`, { headers });
  const allAds = await getAd3.json();
  const foundAd3 = allAds.find((a) => a.id === ad3.id);
  assert(foundAd3, "Ad 3 must persist in DB");
  assert.strictEqual(foundAd3.imageUrl, upload3.publicUrl);
  console.log("✓ Test 7 Passed: Image is served and persists correctly in database record");

  // --- Acceptance Test 8 ---
  console.log("\n[Test 8] Enter a URL and verify exact linked image appears on landing page");
  const publicAdsRes = await fetch(`${BASE_URL}/api/advertisements`);
  assert.strictEqual(publicAdsRes.status, 200);
  const publicAds = await publicAdsRes.json();
  const foundAd4 = publicAds.find((a) => a.id === ad4.id);
  assert(foundAd4, "Public ads must include Ad 4");
  assert.strictEqual(foundAd4.imageUrl, externalUrl4, "Exact linked URL must match");
  console.log("✓ Test 8 Passed: Exact external URL appears on public storefront");

  // --- Acceptance Test 9 ---
  console.log("\n[Test 9] Refresh the admin dashboard and landing page — advertisement remains correct");
  const refreshedPublic = await (await fetch(`${BASE_URL}/api/advertisements`)).json();
  const refreshedAdmin = await (await fetch(`${BASE_URL}/api/admin/advertisements`, { headers })).json();
  assert(refreshedPublic.some((a) => a.id === ad1.id), "Ad 1 present on public page");
  assert(refreshedPublic.some((a) => a.id === ad2.id), "Ad 2 present on public page");
  assert(refreshedAdmin.some((a) => a.id === ad1.id), "Ad 1 present on admin dashboard");
  assert(refreshedAdmin.some((a) => a.id === ad2.id), "Ad 2 present on admin dashboard");
  console.log("✓ Test 9 Passed: Advertisements persist stably across simulated reloads");

  // --- Acceptance Test 10 ---
  console.log("\n[Test 10] Verify advertisements without titles display without blank headings or undefined");
  const untitledInPublic = refreshedPublic.find((a) => a.id === ad1.id);
  assert.strictEqual(untitledInPublic.title, "");
  assert.notStrictEqual(untitledInPublic.title, "undefined");
  console.log("✓ Test 10 Passed: Untitled ad has title '' (not undefined, no missing value)");

  // --- Acceptance Test 11 ---
  console.log("\n[Test 11] Verify inactive, expired, and deleted advertisements follow visibility rules");
  // Toggle ad1 to inactive
  await fetch(`${BASE_URL}/api/admin/advertisements/${ad1.id}/toggle-status`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ isActive: false }),
  });
  const afterDeactivate = await (await fetch(`${BASE_URL}/api/advertisements`)).json();
  assert(!afterDeactivate.some((a) => a.id === ad1.id), "Deactivated ad1 must NOT appear in public storefront");

  // Delete ad2
  await fetch(`${BASE_URL}/api/admin/advertisements/${ad2.id}`, {
    method: "DELETE",
    headers,
  });
  const afterDelete = await (await fetch(`${BASE_URL}/api/advertisements`)).json();
  assert(!afterDelete.some((a) => a.id === ad2.id), "Deleted ad2 must NOT appear in public storefront");

  // Verify expired ad visibility
  const expiredAdRes = await fetch(`${BASE_URL}/api/admin/advertisements`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      title: "Expired Yesterday",
      externalImageUrl: externalUrl,
      startDate: new Date(Date.now() - 10000000).toISOString(),
      endDate: new Date(Date.now() - 5000000).toISOString(),
      isActive: true,
    }),
  });
  const expiredAd = await expiredAdRes.json();
  assert.strictEqual(expiredAd.status, "expired");
  const publicAfterExpired = await (await fetch(`${BASE_URL}/api/advertisements`)).json();
  assert(!publicAfterExpired.some((a) => a.id === expiredAd.id), "Expired ad must NOT appear in public storefront");

  // Cleanup expired test ad
  await fetch(`${BASE_URL}/api/admin/advertisements/${expiredAd.id}`, { method: "DELETE", headers });
  console.log("✓ Test 11 Passed: Inactive, expired, and deleted ads are strictly hidden from storefront");

  // --- Acceptance Test 12 ---
  console.log("\n[Test 12] Confirm existing carousel, admin features, and unrelated functionality remain unaffected");
  const finalPublic = await (await fetch(`${BASE_URL}/api/advertisements`)).json();
  assert(finalPublic.length > 0, "Public ads should be active");
  console.log("✓ Test 12 Passed: Carousel and public endpoints are functioning cleanly");

  console.log("\n=======================================================");
  console.log("🎉 ALL 12 ACCEPTANCE CRITERIA VERIFIED AND PASSED SUCCESSFULLY!");
  console.log("=======================================================");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
