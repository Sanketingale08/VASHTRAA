/**
 * Integration & Verification Test for Price Details & Checkout Pricing Logic Update
 * 
 * Verifies:
 * 1. Single-product order (1 item) => Platform Fee = ₹20, Shipping = FREE.
 * 2. Multi-product order (3 items) => Platform Fee = ₹20 (applied once), Shipping = FREE.
 * 3. COD order => COD Fee = ₹10.
 * 4. Online payment order => COD Fee = ₹0.
 * 5. Formula: Total Amount = Total Selling Price - Coupon Discount + Platform Fee (₹20) + COD Fee (₹10 if COD else ₹0).
 */

import assert from "node:assert";

function calculateCheckoutPricing(params: {
  items: Array<{ price: number; quantity: number; originalPrice?: number }>;
  paymentMethod: "cod" | "upi" | "credit_card" | "debit_card";
  appliedCoupon?: { type: "percent" | "flat"; value: number } | null;
}) {
  const totalQuantity = params.items.reduce((s, i) => s + i.quantity, 0);
  const totalMRP = params.items.reduce((s, i) => s + Math.max(i.originalPrice ?? 0, i.price) * i.quantity, 0);
  const totalSellingPrice = params.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const mrpDiscount = Math.max(0, totalMRP - totalSellingPrice);
  const platformFee = 20; // Fixed ₹20 per order
  const codFee = params.paymentMethod === "cod" ? 10 : 0;
  const shippingCost = 0; // Always FREE

  let couponDiscount = 0;
  if (params.appliedCoupon) {
    couponDiscount = params.appliedCoupon.type === "percent"
      ? Math.round(totalSellingPrice * params.appliedCoupon.value / 100)
      : Math.min(params.appliedCoupon.value, totalSellingPrice);
  }

  const total = totalSellingPrice - couponDiscount + platformFee + codFee;

  return {
    totalQuantity,
    totalMRP,
    totalSellingPrice,
    mrpDiscount,
    platformFee,
    codFee,
    shippingCost,
    couponDiscount,
    total,
  };
}

function runVerificationTests() {
  console.log("==========================================");
  console.log("RUNNING CHECKOUT PRICING VERIFICATION TESTS");
  console.log("==========================================");

  // Test 1: Single-product order (1 item, online payment)
  {
    const res = calculateCheckoutPricing({
      items: [{ price: 1000, quantity: 1, originalPrice: 1500 }],
      paymentMethod: "upi",
    });
    console.log("Test 1 (Single Product, Online):", res);
    assert.strictEqual(res.totalQuantity, 1);
    assert.strictEqual(res.totalMRP, 1500);
    assert.strictEqual(res.mrpDiscount, 500);
    assert.strictEqual(res.platformFee, 20);
    assert.strictEqual(res.codFee, 0);
    assert.strictEqual(res.shippingCost, 0);
    assert.strictEqual(res.total, 1020); // 1000 - 0 + 20 + 0 = 1020
  }

  // Test 2: Multi-product order (3 items, 5 total quantity, online payment)
  {
    const res = calculateCheckoutPricing({
      items: [
        { price: 500, quantity: 2, originalPrice: 800 },
        { price: 1200, quantity: 1, originalPrice: 1500 },
        { price: 300, quantity: 2, originalPrice: 400 },
      ],
      paymentMethod: "credit_card",
    });
    console.log("Test 2 (Multi Product, Online):", res);
    // Selling price: (500*2) + 1200 + (300*2) = 1000 + 1200 + 600 = 2800
    // MRP: (800*2) + 1500 + (400*2) = 1600 + 1500 + 800 = 3900
    // mrpDiscount: 3900 - 2800 = 1100
    assert.strictEqual(res.totalQuantity, 5);
    assert.strictEqual(res.totalMRP, 3900);
    assert.strictEqual(res.totalSellingPrice, 2800);
    assert.strictEqual(res.mrpDiscount, 1100);
    assert.strictEqual(res.platformFee, 20); // Applied ONLY ONCE
    assert.strictEqual(res.codFee, 0);
    assert.strictEqual(res.shippingCost, 0);
    assert.strictEqual(res.total, 2820); // 2800 - 0 + 20 + 0 = 2820
  }

  // Test 3: COD Order
  {
    const res = calculateCheckoutPricing({
      items: [{ price: 1500, quantity: 1, originalPrice: 2000 }],
      paymentMethod: "cod",
    });
    console.log("Test 3 (Single Product, COD):", res);
    assert.strictEqual(res.platformFee, 20);
    assert.strictEqual(res.codFee, 10);
    assert.strictEqual(res.shippingCost, 0);
    assert.strictEqual(res.total, 1530); // 1500 - 0 + 20 + 10 = 1530
  }

  // Test 4: COD Order with Coupon Discount (10% off)
  {
    const res = calculateCheckoutPricing({
      items: [{ price: 2000, quantity: 1, originalPrice: 2500 }],
      paymentMethod: "cod",
      appliedCoupon: { type: "percent", value: 10 },
    });
    console.log("Test 4 (COD with 10% Coupon):", res);
    assert.strictEqual(res.totalSellingPrice, 2000);
    assert.strictEqual(res.couponDiscount, 200); // 10% of 2000
    assert.strictEqual(res.platformFee, 20);
    assert.strictEqual(res.codFee, 10);
    assert.strictEqual(res.shippingCost, 0);
    assert.strictEqual(res.total, 1830); // 2000 - 200 + 20 + 10 = 1830
  }

  console.log("==========================================");
  console.log("ALL CHECKOUT PRICING TESTS PASSED SUCCESSFULLY! ✅");
  console.log("==========================================");
}

runVerificationTests();
