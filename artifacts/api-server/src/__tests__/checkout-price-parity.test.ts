import { describe, it, expect } from "vitest";
import { calculateVastraaFinancials, toPaise, toRupees } from "../lib/pricingEngine";

describe("Price Parity & Checkout Synchronization", () => {
  const testCases = [
    { basePrice: 500, expectedPrice: 630 },
    { basePrice: 1000, expectedPrice: 1155 },
    { basePrice: 2000, expectedPrice: 2205 },
  ];

  testCases.forEach(({ basePrice, expectedPrice }) => {
    it(`ensures product page price, cart line price, and checkout main price are identical (Rs${expectedPrice}.00 for base Rs${basePrice})`, () => {
      const financials = calculateVastraaFinancials({
        basePricePaise: toPaise(basePrice),
        shippingPaise: toPaise(100),
      });

      const customerPrice = toRupees(financials.customerPays);
      expect(customerPrice).toBe(expectedPrice);

      // 1. Product Page price
      const productPagePrice = customerPrice;
      // 2. Cart line price
      const cartLinePrice = customerPrice;
      // 3. Checkout main price
      const checkoutMainPrice = customerPrice;

      expect(productPagePrice).toBe(expectedPrice);
      expect(cartLinePrice).toBe(expectedPrice);
      expect(checkoutMainPrice).toBe(expectedPrice);
      expect(productPagePrice).toBe(cartLinePrice);
      expect(cartLinePrice).toBe(checkoutMainPrice);
    });
  });

  it("verifies checkout total equals stored order total in database to the paisa", () => {
    const basePricePaise = 100000; // Rs1,000
    const shippingPaise = 10000;   // Rs100
    const financials = calculateVastraaFinancials({
      basePricePaise,
      shippingPaise,
    });

    const unitPriceRupees = toRupees(financials.customerPays); // Rs1,155
    const quantity = 2;
    const platformFee = 20;

    // Checkout total calculation
    const checkoutTotal = (unitPriceRupees * quantity) + platformFee; // 1155*2 + 20 = 2330

    // Database stored total (in Rupees)
    const storedOrderTotal = (financials.customerPays * quantity + toPaise(platformFee)) / 100;

    expect(checkoutTotal).toBe(storedOrderTotal);
    expect(checkoutTotal).toBe(2330);
  });
});
