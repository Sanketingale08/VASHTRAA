import http from "http";

function fetchUrl(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          bodyLength: data.length,
          body: data,
          preview: data.slice(0, 300),
        });

      });
    });
    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });
  });
}

async function runTests() {
  console.log("=== Testing Live Server Endpoints ===");

  const testCases = [
    // Direct Vite dev server tests (port 3000)
    {
      name: "Vite Root (3000)",
      url: "http://127.0.0.1:3000/",
      expectedStatus: 200,
      mustContain: "/src/main.tsx",
    },
    {
      name: "Vite SignIn.tsx (3000)",
      url: "http://127.0.0.1:3000/src/pages/SignIn.tsx",
      expectedStatus: 200,
      contentType: "javascript",
      mustContain: "SignInPage",
    },
    {
      name: "Vite Designer.tsx (3000)",
      url: "http://127.0.0.1:3000/src/pages/Designer.tsx",
      expectedStatus: 200,
      contentType: "javascript",
      mustContain: "Designer",
    },
    {
      name: "Vite Paithani.tsx (3000)",
      url: "http://127.0.0.1:3000/src/pages/Paithani.tsx",
      expectedStatus: 200,
      contentType: "javascript",
      mustContain: "Paithani",
    },

    // Reverse-proxied through API server (port 5000)
    {
      name: "API Server Root (5000)",
      url: "http://127.0.0.1:5000/",
      expectedStatus: 200,
      mustContain: "/src/main.tsx",
    },
    {
      name: "API Server Proxied SignIn.tsx (5000)",
      url: "http://127.0.0.1:5000/src/pages/SignIn.tsx",
      expectedStatus: 200,
      contentType: "javascript",
      mustContain: "SignInPage",
    },
    {
      name: "API Server Proxied Designer.tsx (5000)",
      url: "http://127.0.0.1:5000/src/pages/Designer.tsx",
      expectedStatus: 200,
      contentType: "javascript",
      mustContain: "Designer",
    },
    {
      name: "API Server Proxied Paithani.tsx (5000)",
      url: "http://127.0.0.1:5000/src/pages/Paithani.tsx",
      expectedStatus: 200,
      contentType: "javascript",
      mustContain: "Paithani",
    },
    {
      name: "API Server Proxied SPA Route /paithani (5000)",
      url: "http://127.0.0.1:5000/paithani",
      expectedStatus: 200,
      mustContain: "<!DOCTYPE html>",
    },
    {
      name: "API Server Proxied SPA Route /designer (5000)",
      url: "http://127.0.0.1:5000/designer",
      expectedStatus: 200,
      mustContain: "<!DOCTYPE html>",
    },
    {
      name: "API Server Proxied SPA Route /sign-in (5000)",
      url: "http://127.0.0.1:5000/sign-in",
      expectedStatus: 200,
      mustContain: "<!DOCTYPE html>",
    },
    {
      name: "API Server Proxied SPA Route /seller/dashboard (5000)",
      url: "http://127.0.0.1:5000/seller/dashboard",
      expectedStatus: 200,
      mustContain: "<!DOCTYPE html>",
    },
    {
      name: "API Server Proxied SPA Route /admin/orders (5000)",
      url: "http://127.0.0.1:5000/admin/orders",
      expectedStatus: 200,
      mustContain: "<!DOCTYPE html>",
    },

    // Backend API route test
    {
      name: "API Server /api/categories (5000)",
      url: "http://127.0.0.1:5000/api/categories",
      expectedStatus: 200,
      contentType: "json",
      mustContain: "paithani",
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    try {
      const res = await fetchUrl(tc.url, { Accept: "*/*" });
      const statusOk = res.statusCode === tc.expectedStatus;
      const cTypeOk = !tc.contentType || (res.headers["content-type"] || "").toLowerCase().includes(tc.contentType);
      const contentOk = !tc.mustContain || res.body.toLowerCase().includes(tc.mustContain.toLowerCase());

      if (statusOk && cTypeOk && contentOk) {
        console.log(`✅ [PASS] ${tc.name} -> HTTP ${res.statusCode} (${res.headers["content-type"] || "no-ct"}) [${res.bodyLength} bytes]`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${tc.name} -> HTTP ${res.statusCode}, CT: ${res.headers["content-type"]}`);
        if (!statusOk) console.error(`   Expected status: ${tc.expectedStatus}, got: ${res.statusCode}`);
        if (!cTypeOk) console.error(`   Expected content-type to include: ${tc.contentType}, got: ${res.headers["content-type"]}`);
        if (!contentOk) console.error(`   Expected preview to include "${tc.mustContain}". Got preview: ${res.preview.slice(0, 150)}`);
        failed++;
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${tc.name} -> ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
  else {
    console.log("All live server tests PASSED!");
    process.exit(0);
  }
}

runTests();
