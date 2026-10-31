import { describe, it, expect } from 'vitest';
import {
  calculateVastraaFinancials,
  toPaise,
  toRupees,
} from '../lib/pricingEngine';

describe('Pricing Engine - Vastraa Financials (v2 Model)', () => {
  describe('toPaise & toRupees', () => {
    it('converts rupees to paise accurately', () => {
      expect(toPaise(500)).toBe(50000);
      expect(toPaise(333.33)).toBe(33333);
      expect(toPaise(0)).toBe(0);
    });

    it('converts paise to rupees accurately', () => {
      expect(toRupees(50000)).toBe(500);
      expect(toRupees(63000)).toBe(630);
      expect(toRupees(80100)).toBe(801);
    });
  });

  describe('Golden Test Vectors (Shipping ₹100 / 10000 paise, GST 5%, Commission 18%, Comm GST 5%, TCS 1%)', () => {
    const assertIdentities = (res: any) => {
      expect(res.customerPays).toBe(res.sellerBasePrice + res.shippingFee + res.gstAmount);
      expect(res.sellerSettlement).toBe(res.sellerBasePrice - res.platformCommission - res.gstOnCommission - res.tcsDeduction);
      expect(res.platformKeeps).toBe(res.platformCommission + res.gstOnCommission);
    };

    it('Base ₹500 → taxable ₹600, GST ₹30, customer ₹630, comm ₹90, GST on comm ₹4.50, TCS ₹5, seller ₹400.50', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(500),
        shippingPaise: toPaise(100),
      });

      expect(toRupees(res.taxableAmount)).toBe(600);
      expect(toRupees(res.gstAmount)).toBe(30);
      expect(toRupees(res.customerPays)).toBe(630);
      expect(toRupees(res.platformCommission)).toBe(90);
      expect(toRupees(res.gstOnCommission)).toBe(4.50);
      expect(toRupees(res.tcsDeduction)).toBe(5);
      expect(toRupees(res.sellerSettlement)).toBe(400.50);
      expect(toRupees(res.platformKeeps)).toBe(94.50);
      assertIdentities(res);
    });

    it('Base ₹1000 → taxable ₹1100, GST ₹55, customer ₹1155, comm ₹180, GST on comm ₹9, TCS ₹10, seller ₹801', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(1000),
        shippingPaise: toPaise(100),
      });

      expect(toRupees(res.taxableAmount)).toBe(1100);
      expect(toRupees(res.gstAmount)).toBe(55);
      expect(toRupees(res.customerPays)).toBe(1155);
      expect(toRupees(res.platformCommission)).toBe(180);
      expect(toRupees(res.gstOnCommission)).toBe(9);
      expect(toRupees(res.tcsDeduction)).toBe(10);
      expect(toRupees(res.sellerSettlement)).toBe(801);
      expect(toRupees(res.platformKeeps)).toBe(189);
      assertIdentities(res);
    });

    it('Base ₹2000 → taxable ₹2100, GST ₹105, customer ₹2205, comm ₹360, GST on comm ₹18, TCS ₹20, seller ₹1602', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(2000),
        shippingPaise: toPaise(100),
      });

      expect(toRupees(res.taxableAmount)).toBe(2100);
      expect(toRupees(res.gstAmount)).toBe(105);
      expect(toRupees(res.customerPays)).toBe(2205);
      expect(toRupees(res.platformCommission)).toBe(360);
      expect(toRupees(res.gstOnCommission)).toBe(18);
      expect(toRupees(res.tcsDeduction)).toBe(20);
      expect(toRupees(res.sellerSettlement)).toBe(1602);
      expect(toRupees(res.platformKeeps)).toBe(378);
      assertIdentities(res);
    });

    it('Base ₹5000 → taxable ₹5100, GST ₹255, customer ₹5355, comm ₹900, GST on comm ₹45, TCS ₹50, seller ₹4005', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(5000),
        shippingPaise: toPaise(100),
      });

      expect(toRupees(res.taxableAmount)).toBe(5100);
      expect(toRupees(res.gstAmount)).toBe(255);
      expect(toRupees(res.customerPays)).toBe(5355);
      expect(toRupees(res.platformCommission)).toBe(900);
      expect(toRupees(res.gstOnCommission)).toBe(45);
      expect(toRupees(res.tcsDeduction)).toBe(50);
      expect(toRupees(res.sellerSettlement)).toBe(4005);
      expect(toRupees(res.platformKeeps)).toBe(945);
      assertIdentities(res);
    });

    it('Base ₹10000 → taxable ₹10100, GST ₹505, customer ₹10605, comm ₹1800, GST on comm ₹90, TCS ₹100, seller ₹8010', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(10000),
        shippingPaise: toPaise(100),
      });

      expect(toRupees(res.taxableAmount)).toBe(10100);
      expect(toRupees(res.gstAmount)).toBe(505);
      expect(toRupees(res.customerPays)).toBe(10605);
      expect(toRupees(res.platformCommission)).toBe(1800);
      expect(toRupees(res.gstOnCommission)).toBe(90);
      expect(toRupees(res.tcsDeduction)).toBe(100);
      expect(toRupees(res.sellerSettlement)).toBe(8010);
      expect(toRupees(res.platformKeeps)).toBe(1890);
      assertIdentities(res);
    });

    it('Configurable Commission GST Rate (18% / 1800 bps) with Base ₹1000 → GST on comm ₹32.40, seller ₹777.60, customer pays still ₹1155', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(1000),
        shippingPaise: toPaise(100),
        commissionGstBps: 1800, // 18% GST on services/commission
      });

      expect(toRupees(res.taxableAmount)).toBe(1100);
      expect(toRupees(res.gstAmount)).toBe(55);
      expect(toRupees(res.customerPays)).toBe(1155);
      expect(toRupees(res.platformCommission)).toBe(180);
      expect(toRupees(res.gstOnCommission)).toBe(32.40);
      expect(toRupees(res.tcsDeduction)).toBe(10);
      expect(toRupees(res.sellerSettlement)).toBe(777.60);
      expect(toRupees(res.platformKeeps)).toBe(212.40);
      assertIdentities(res);
    });
  });

  describe('Edge Cases & GST Split Equality', () => {
    const assertIdentities = (res: any) => {
      expect(res.customerPays).toBe(res.sellerBasePrice + res.shippingFee + res.gstAmount);
      expect(res.sellerSettlement).toBe(res.sellerBasePrice - res.platformCommission - res.gstOnCommission - res.tcsDeduction);
      expect(res.platformKeeps).toBe(res.platformCommission + res.gstOnCommission);
    };

    it('handles base 0 correctly', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: 0,
        shippingPaise: toPaise(100),
      });

      expect(res.sellerBasePrice).toBe(0);
      expect(res.platformCommission).toBe(0);
      expect(res.gstAmount).toBe(500); // 5% on 10000 shipping
      expect(toRupees(res.customerPays)).toBe(105);
      expect(res.sellerSettlement).toBe(0);
      assertIdentities(res);
    });

    it('clamps negative base price to 0', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: -5000,
        shippingPaise: toPaise(100),
      });

      expect(res.sellerBasePrice).toBe(0);
      expect(res.sellerSettlement).toBe(0);
      expect(toRupees(res.customerPays)).toBe(105);
      assertIdentities(res);
    });

    it('handles shipping 0', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(1000),
        shippingPaise: 0,
      });

      expect(res.shippingFee).toBe(0);
      expect(toRupees(res.taxableAmount)).toBe(1000); // 1000 + 0
      expect(toRupees(res.gstAmount)).toBe(50); // 5% on 1000
      expect(toRupees(res.customerPays)).toBe(1050);
      expect(toRupees(res.sellerSettlement)).toBe(801);
      assertIdentities(res);
    });

    it('handles base ₹333.33 (33333 paise)', () => {
      const res = calculateVastraaFinancials({
        basePricePaise: toPaise(333.33),
        shippingPaise: toPaise(100),
      });

      expect(res.sellerBasePrice).toBe(33333);
      expect(res.platformCommission).toBe(6000); // round(33333 * 0.18) = 6000
      expect(res.taxableAmount).toBe(43333); // 33333 + 10000
      expect(res.gstAmount).toBe(2167); // round(43333 * 0.05) = 2167
      expect(res.customerPays).toBe(45500); // 43333 + 2167
      expect(toRupees(res.customerPays)).toBe(455);
      expect(res.sellerSettlement).toBe(26700); // 33333 - 6000 - 300 - 333
      expect(toRupees(res.sellerSettlement)).toBe(267);
      assertIdentities(res);
    });

    it('ensures cgst + sgst + igst equals gstAmount always for intra-state and inter-state', () => {
      const cases = [
        { basePricePaise: 50000, shippingPaise: 10000 },
        { basePricePaise: 100000, shippingPaise: 10000 },
        { basePricePaise: 33333, shippingPaise: 10000 },
        { basePricePaise: 0, shippingPaise: 10000 },
        { basePricePaise: 1234567, shippingPaise: 5000 },
      ];

      for (const c of cases) {
        const intraRes = calculateVastraaFinancials({ ...c, intraState: true });
        expect(intraRes.cgst + intraRes.sgst + intraRes.igst).toBe(intraRes.gstAmount);
        expect(intraRes.igst).toBe(0);
        assertIdentities(intraRes);

        const interRes = calculateVastraaFinancials({ ...c, intraState: false });
        expect(interRes.cgst + interRes.sgst + interRes.igst).toBe(interRes.gstAmount);
        expect(interRes.cgst).toBe(0);
        expect(interRes.sgst).toBe(0);
        expect(interRes.igst).toBe(interRes.gstAmount);
        assertIdentities(interRes);
      }
    });
  });
});
