import { describe, it, expect } from "vitest";
import { calculateVastraaFinancials, calculateVastraaFinancialsV1 } from "../lib/pricingEngine.js";

describe("Settlement Ledger Reconciliation Test (v1 vs v2)", () => {
  const sampleRows = [
    // v1 stored order row
    {
      pricingVersion: "v1",
      sellerBasePrice: 100000,
      platformCommission: 18000,
      shippingFee: 10000,
      taxableAmount: 128000,
      gstRateBps: 500,
      gstAmount: 6400,
      customerPays: 134400,
      gstOnCommission: 900,
      tcsDeduction: 1000,
      sellerSettlement: 80100,
    },
    // v2 stored order row (Base ₹1,000)
    {
      pricingVersion: "v2",
      sellerBasePrice: 100000,
      platformCommission: 18000,
      shippingFee: 10000,
      taxableAmount: 110000,
      gstRateBps: 500,
      gstAmount: 5500,
      customerPays: 115500,
      gstOnCommission: 900,
      tcsDeduction: 1000,
      sellerSettlement: 80100,
      platformKeeps: 18900,
    },
    // v2 stored order row (Base ₹5,000)
    {
      pricingVersion: "v2",
      sellerBasePrice: 500000,
      platformCommission: 90000,
      shippingFee: 10000,
      taxableAmount: 510000,
      gstRateBps: 500,
      gstAmount: 25500,
      customerPays: 535500,
      gstOnCommission: 4500,
      tcsDeduction: 5000,
      sellerSettlement: 400500,
      platformKeeps: 94500,
    },
  ];

  it("reconciles all stored ledger rows branching on pricingVersion", () => {
    for (const row of sampleRows) {
      if (row.pricingVersion === "v1") {
        // v1 Identity Assertions:
        // taxable = base + commission + shipping
        // customerPays = taxable + gst
        // sellerSettlement = base - commission - gstOnCommission - tcs
        expect(row.taxableAmount).toBe(row.sellerBasePrice + row.platformCommission + row.shippingFee);
        expect(row.customerPays).toBe(row.taxableAmount + row.gstAmount);
        expect(row.sellerSettlement).toBe(row.sellerBasePrice - row.platformCommission - row.gstOnCommission - row.tcsDeduction);
      } else {
        // v2 Identity Assertions:
        // taxable = base + shipping
        // customerPays = base + shipping + gstAmount
        // sellerSettlement = base - commission - gstOnCommission - tcs
        expect(row.taxableAmount).toBe(row.sellerBasePrice + row.shippingFee);
        expect(row.customerPays).toBe(row.sellerBasePrice + row.shippingFee + row.gstAmount);
        expect(row.sellerSettlement).toBe(row.sellerBasePrice - row.platformCommission - row.gstOnCommission - row.tcsDeduction);
        expect(row.platformKeeps).toBe(row.platformCommission + row.gstOnCommission);
      }
    }
  });

  it("verifies v2 engine output satisfies reconciliation identities", () => {
    const v2Out = calculateVastraaFinancials({
      basePricePaise: 100000,
      shippingPaise: 10000,
      productGstBps: 500,
      intraState: true,
    });

    expect(v2Out.pricingVersion).toBe("v2");
    expect(v2Out.customerPays).toBe(v2Out.sellerBasePrice + v2Out.shippingFee + v2Out.gstAmount);
    expect(v2Out.sellerSettlement).toBe(
      v2Out.sellerBasePrice - v2Out.platformCommission - v2Out.gstOnCommission - v2Out.tcsDeduction
    );
    expect(v2Out.platformKeeps).toBe(v2Out.platformCommission + v2Out.gstOnCommission);
  });
});
