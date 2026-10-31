/**
 * Vastraa Pricing & Seller Settlement Engine (v2)
 * 
 * Rules:
 * - All monetary values are handled and returned in INTEGER PAISE.
 * - Rounding half-up is applied once per line item calculation.
 * 
 * NEW Model:
 * - Customer pays: base + shipping + product GST (5% on taxable = base + shipping).
 *   Customer NEVER pays or sees platform commission.
 * - Seller payout: base - commission (18%) - GST on commission (5% configurable) - TCS (1%).
 * - Platform keeps: commission + GST on commission.
 */

export interface CalculateFinancialsInput {
  basePricePaise: number;
  shippingPaise?: number;
  productGstBps?: number;
  commissionBps?: number;
  commissionGstBps?: number;
  tcsBps?: number;
  intraState?: boolean;
}

export interface VastraaFinancialsResult {
  pricingVersion: "v1" | "v2";
  sellerBasePrice: number;
  platformCommission: number;
  shippingFee: number;
  taxableAmount: number;
  gstRateBps: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  customerPays: number;
  gstOnCommission: number;
  tcsDeduction: number;
  sellerSettlement: number;
  platformKeeps: number;
}

export const DEFAULT_COMMISSION_BPS = 1800;     // 18%
export const DEFAULT_PRODUCT_GST_BPS = 500;      // 5%
export const DEFAULT_COMMISSION_GST_BPS = 500; // 5% (configurable: can be 1800 for 18%)
export const DEFAULT_TCS_BPS = 100;             // 1%
export const DEFAULT_SHIPPING_PAISE = 10000;     // ₹100 (10000 paise)

/**
 * Helper to convert Rupees to integer Paise.
 */
export function toPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/**
 * Helper to convert Paise to Rupees.
 */
export function toRupees(paise: number): number {
  return paise / 100;
}

/**
 * Helper for half-up rounding on non-negative numbers.
 */
function roundHalfUp(val: number): number {
  return Math.floor(val + 0.5);
}

/**
 * Calculates itemized financial breakdown for Vastraa orders and seller settlements under v2 model.
 */
export function calculateVastraaFinancials(input: CalculateFinancialsInput): VastraaFinancialsResult {
  const sellerBasePrice = Math.max(0, roundHalfUp(input.basePricePaise));
  const shippingFee = Math.max(0, roundHalfUp(input.shippingPaise ?? DEFAULT_SHIPPING_PAISE));
  const gstRateBps = input.productGstBps ?? DEFAULT_PRODUCT_GST_BPS;
  const commissionBps = input.commissionBps ?? DEFAULT_COMMISSION_BPS;
  const commissionGstBps = input.commissionGstBps ?? DEFAULT_COMMISSION_GST_BPS;
  const tcsBps = input.tcsBps ?? DEFAULT_TCS_BPS;
  const isIntraState = input.intraState ?? true;

  // CUSTOMER SIDE
  // taxable = base + shipping (Commission is NOT added to customer taxable amount)
  const taxableAmount = sellerBasePrice + shippingFee;
  const gstAmount = roundHalfUp((taxableAmount * gstRateBps) / 10000);
  const customerPays = taxableAmount + gstAmount;

  // SELLER SIDE
  const platformCommission = roundHalfUp((sellerBasePrice * commissionBps) / 10000);
  const gstOnCommission = roundHalfUp((platformCommission * commissionGstBps) / 10000);
  const tcsDeduction = roundHalfUp((sellerBasePrice * tcsBps) / 10000);
  const sellerSettlement = sellerBasePrice - platformCommission - gstOnCommission - tcsDeduction;
  const platformKeeps = platformCommission + gstOnCommission;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (isIntraState) {
    cgst = Math.floor(gstAmount / 2);
    sgst = gstAmount - cgst;
    igst = 0;
  } else {
    cgst = 0;
    sgst = 0;
    igst = gstAmount;
  }

  return {
    pricingVersion: "v2",
    sellerBasePrice,
    platformCommission,
    shippingFee,
    taxableAmount,
    gstRateBps,
    gstAmount,
    cgst,
    sgst,
    igst,
    customerPays,
    gstOnCommission,
    tcsDeduction,
    sellerSettlement,
    platformKeeps,
  };
}
