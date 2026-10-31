import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import {
  getCashfreeConfig,
  verifyCashfreeWebhookSignature,
  getCashfreePgBaseUrl,
  getCashfreePayoutBaseUrl,
  getCashfreeVerificationBaseUrl,
} from "../lib/cashfree";
import {
  calculateVastraaFinancials,
  toPaise,
  toRupees,
  DEFAULT_COMMISSION_BPS,
  DEFAULT_COMMISSION_GST_BPS,
  DEFAULT_TCS_BPS,
} from "../lib/pricingEngine";
import { CashfreePayoutProvider } from "../lib/settlementAutomation";

describe("Cashfree Payment Gateway & Webhook Signature Verification", () => {
  const secretKey = "test_secret_key_12345";

  it("should correctly verify a valid Cashfree webhook signature", () => {
    const timestamp = "1672531199";
    const rawBody = JSON.stringify({
      data: {
        order: { order_id: "ORD_TEST_1001", order_amount: 1499.0 },
        payment: { payment_status: "SUCCESS", cf_payment_id: "CF_PAY_8899" },
      },
      event_time: "2026-10-18T10:00:00Z",
      type: "PAYMENT_SUCCESS_WEBHOOK",
    });

    const signaturePayload = `${timestamp}${rawBody}`;
    const validSignature = crypto
      .createHmac("sha256", secretKey)
      .update(signaturePayload)
      .digest("base64");

    const isValid = verifyCashfreeWebhookSignature({
      rawBody,
      signature: validSignature,
      timestamp,
      secretKey,
    });

    expect(isValid).toBe(true);
  });

  it("should reject an invalid or tampered Cashfree webhook signature", () => {
    const timestamp = "1672531199";
    const rawBody = JSON.stringify({ order_id: "ORD_TEST_1001", amount: 1499.0 });
    const invalidSignature = "invalid_signature_xyz==";

    const isValid = verifyCashfreeWebhookSignature({
      rawBody,
      signature: invalidSignature,
      timestamp,
      secretKey,
    });

    expect(isValid).toBe(false);
  });

  it("should reject webhook verification if signature or rawBody is missing", () => {
    expect(
      verifyCashfreeWebhookSignature({
        rawBody: "",
        signature: "sig",
        timestamp: "123",
        secretKey,
      })
    ).toBe(false);

    expect(
      verifyCashfreeWebhookSignature({
        rawBody: '{"test": 1}',
        signature: "",
        timestamp: "123",
        secretKey,
      })
    ).toBe(false);
  });

  it("should return the correct API endpoints based on environment", () => {
    expect(getCashfreePgBaseUrl("sandbox")).toBe("https://sandbox.cashfree.com/pg");
    expect(getCashfreePgBaseUrl("production")).toBe("https://api.cashfree.com/pg");
    expect(getCashfreePayoutBaseUrl("sandbox")).toBe("https://sandbox.cashfree.com/payout");
    expect(getCashfreePayoutBaseUrl("production")).toBe("https://payout-api.cashfree.com/payout");
    expect(getCashfreeVerificationBaseUrl("sandbox")).toBe("https://sandbox.cashfree.com/verification");
    expect(getCashfreeVerificationBaseUrl("production")).toBe("https://api.cashfree.com/verification");
  });
});

describe("Vastraa Financials & Settlement Calculation (v2 Paise)", () => {
  it("should accurately compute financial breakdown for a single-seller order", () => {
    const basePricePaise = toPaise(1000); // ₹1,000 (100000 paise)
    const shippingPaise = 0;
    const productGstBps = 500; // 5%

    const result = calculateVastraaFinancials({
      basePricePaise,
      shippingPaise,
      productGstBps,
      intraState: true,
    });

    // Customer pays Base Price + 5% GST = 1000 + 50 = ₹1,050
    expect(result.sellerBasePrice).toBe(100000);
    expect(result.customerPays).toBe(105000);
    expect(result.gstAmount).toBe(5000);
    expect(result.cgst).toBe(2500);
    expect(result.sgst).toBe(2500);
    expect(result.igst).toBe(0);

    // Platform commission: 18% of base price = ₹180 (18000 paise)
    expect(result.platformCommission).toBe(18000);
    // GST on commission: DEFAULT_COMMISSION_GST_BPS is 5% = 900 paise (₹9)
    expect(result.gstOnCommission).toBe(900);
    // TCS: 1% of base price = ₹10 (1000 paise)
    expect(result.tcsDeduction).toBe(1000);

    // Platform keeps: Commission + GST on Commission = 18000 + 900 = 18900 paise (₹189)
    expect(result.platformKeeps).toBe(18900);

    // Seller settlement = base - commission - gstOnComm - tcs = 100000 - 18000 - 900 - 1000 = 80100 paise
    expect(result.sellerSettlement).toBe(80100);
  });

  it("should handle interstate GST distribution correctly", () => {
    const basePricePaise = toPaise(2000); // ₹2,000
    const result = calculateVastraaFinancials({
      basePricePaise,
      shippingPaise: 0,
      productGstBps: 500, // 5% = ₹100 (10000 paise)
      intraState: false, // Interstate -> IGST only
    });

    expect(result.gstAmount).toBe(10000);
    expect(result.igst).toBe(10000);
    expect(result.cgst).toBe(0);
    expect(result.sgst).toBe(0);
  });

  it("should prevent double-counting across multi-item vendor orders", () => {
    const item1 = 1500;
    const item2 = 2500;
    const combinedTotal = item1 + item2; // ₹4,000

    const fin1 = calculateVastraaFinancials({ basePricePaise: toPaise(item1), shippingPaise: 0, productGstBps: 500 });
    const fin2 = calculateVastraaFinancials({ basePricePaise: toPaise(item2), shippingPaise: 0, productGstBps: 500 });
    const finCombined = calculateVastraaFinancials({ basePricePaise: toPaise(combinedTotal), shippingPaise: 0, productGstBps: 500 });

    expect(fin1.customerPays + fin2.customerPays).toBe(finCombined.customerPays);
    expect(fin1.platformCommission + fin2.platformCommission).toBe(finCombined.platformCommission);
    expect(fin1.sellerSettlement + fin2.sellerSettlement).toBe(finCombined.sellerSettlement);
  });
});

describe("Cashfree Payout Provider Safeguards", () => {
  it("should reject payout when seller bank details are missing", async () => {
    const provider = new CashfreePayoutProvider();
    const result = await provider.processPayout({
      id: "SETTLE_TEST_NO_BANK",
      amount: 50000,
      vendorId: "non_existent_vendor_id",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("not found");
  });

  it("should enforce minimum payout amount greater than zero", async () => {
    const provider = new CashfreePayoutProvider();
    const result = await provider.processPayout({
      id: "SETTLE_TEST_ZERO",
      amount: 0,
      vendorId: "vendor_1",
    });

    expect(result.success).toBe(false);
  });
});

describe("Cashfree Configuration Loading", () => {
  it("should load configuration with fallback test credentials", async () => {
    const config = await getCashfreeConfig();

    expect(config.appId).toBeDefined();
    expect(config.secretKey).toBeDefined();
    expect(config.env).toMatch(/sandbox|production/);
    expect(config.settlementHoldDays).toBeGreaterThanOrEqual(0);
    expect(config.minimumPayoutThresholdPaise).toBeGreaterThanOrEqual(100);
    expect(config.payoutMode).toMatch(/manual|scheduled/);
  });
});
