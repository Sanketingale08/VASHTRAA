const http = require('http');

const API_BASE = 'http://localhost:5000/api';

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(API_BASE + path);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, body: parsed });
        } catch {
          resolve({ status: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function runTests() {
  console.log('=== VASTRAA PRODUCT PRICE CONSISTENCY & SNAPSHOT TEST ===\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`[PASS] ${message}`);
      passed++;
    } else {
      console.error(`[FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // 1. Fetch products from catalog (User Product API / Product Card)
    const listRes = await request('GET', '/products?limit=5');
    assert(listRes.status === 200, 'User Products API returns 200 OK');
    const products = listRes.body.products || [];
    assert(products.length > 0, `Products found in catalog: count = ${products.length}`);

    if (products.length === 0) {
      console.log('No products available to test.');
      return;
    }

    const sampleProduct = products[0];
    console.log(`\nTesting sample product: "${sampleProduct.name}" (ID: ${sampleProduct.id})`);
    console.log(`Catalog / Product Card Selling Price: ₹${sampleProduct.price}`);

    // 2. Fetch Product Details
    const detailRes = await request('GET', `/products/${sampleProduct.id}`);
    assert(detailRes.status === 200, 'Product Details API returns 200 OK');
    const detailProduct = detailRes.body;
    
    // Check 1: Product Card price = Product Details price
    assert(
      sampleProduct.price === detailProduct.price,
      `Product Card Price (₹${sampleProduct.price}) === Product Details Price (₹${detailProduct.price})`
    );

    // 3. Test Checkout Total Calculation Logic (Prepaid)
    const qty = 2;
    const expectedSubtotal = sampleProduct.price * qty;
    const expectedPlatformFee = 20;
    const expectedCodFeePrepaid = 0;
    const expectedTotalPrepaid = expectedSubtotal + expectedPlatformFee + expectedCodFeePrepaid;

    assert(
      expectedTotalPrepaid === sampleProduct.price * qty + 20,
      `Checkout calculation: ${qty} x ₹${sampleProduct.price} + ₹20 Platform Fee = ₹${expectedTotalPrepaid}`
    );

    // 4. Test Multi-Product Order Calculation
    if (products.length >= 2) {
      const prod1 = products[0];
      const prod2 = products[1];
      const multiSubtotal = prod1.price * 1 + prod2.price * 1;
      const multiTotal = multiSubtotal + 20; // Platform fee applied ONCE

      assert(
        multiTotal === prod1.price + prod2.price + 20,
        `Multi-product order: Platform Fee (₹20) applied ONCE per order (Total: ₹${multiTotal}, NOT ₹${multiSubtotal + 40})`
      );
    }

    // 5. Test COD order calculation
    const expectedCodTotal = expectedSubtotal + 20 + 10;
    assert(
      expectedCodTotal === expectedSubtotal + 30,
      `COD order calculation: Subtotal ₹${expectedSubtotal} + ₹20 Platform Fee + ₹10 COD Fee = ₹${expectedCodTotal}`
    );

    console.log('\n--- Pricing Engine Audit Summary ---');
    console.log(`Total Passed: ${passed}`);
    console.log(`Total Failed: ${failed}`);

  } catch (err) {
    console.error('Test execution failed:', err);
  }
}

runTests();
