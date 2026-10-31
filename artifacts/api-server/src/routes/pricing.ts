import { Router, type Request, type Response } from "express";
import { requireVendorAuth } from "../middlewares/requireVendorAuth";
import {
  calculateVastraaFinancials,
  toPaise,
  toRupees,
} from "../lib/pricingEngine";

const router: Router = Router();

/**
 * POST /api/pricing/quote
 * Generates itemized financial breakdown for a seller product price.
 */
router.post("/pricing/quote", requireVendorAuth, (req: Request, res: Response) => {
  try {
    const { basePrice, basePricePaise, shipping, shippingPaise, gstRate, productGstBps, intraState } = req.body;

    let basePaise: number;
    if (basePricePaise !== undefined) {
      basePaise = Number(basePricePaise);
    } else if (basePrice !== undefined) {
      basePaise = basePrice > 10000 ? Math.round(Number(basePrice)) : toPaise(Number(basePrice));
    } else {
      return res.status(400).json({ error: "basePrice or basePricePaise is required" });
    }

    let shipPaise: number | undefined;
    if (shippingPaise !== undefined) {
      shipPaise = Number(shippingPaise);
    } else if (shipping !== undefined) {
      shipPaise = shipping > 1000 ? Math.round(Number(shipping)) : toPaise(Number(shipping));
    }

    let rateBps: number | undefined;
    if (productGstBps !== undefined) {
      rateBps = Number(productGstBps);
    } else if (gstRate !== undefined) {
      rateBps = Math.round(Number(gstRate) * 100);
    }

    const breakdown = calculateVastraaFinancials({
      basePricePaise: basePaise,
      shippingPaise: shipPaise,
      productGstBps: rateBps,
      intraState: intraState !== undefined ? Boolean(intraState) : true,
    });

    return res.json({
      success: true,
      paise: breakdown,
      rupees: {
        pricingVersion: breakdown.pricingVersion,
        sellerBasePrice: toRupees(breakdown.sellerBasePrice),
        platformCommission: toRupees(breakdown.platformCommission),
        shippingFee: toRupees(breakdown.shippingFee),
        taxableAmount: toRupees(breakdown.taxableAmount),
        gstRate: `${breakdown.gstRateBps / 100}%`,
        gstAmount: toRupees(breakdown.gstAmount),
        cgst: toRupees(breakdown.cgst),
        sgst: toRupees(breakdown.sgst),
        igst: toRupees(breakdown.igst),
        customerPays: toRupees(breakdown.customerPays),
        gstOnCommission: toRupees(breakdown.gstOnCommission),
        tcsDeduction: toRupees(breakdown.tcsDeduction),
        sellerSettlement: toRupees(breakdown.sellerSettlement),
        platformKeeps: toRupees(breakdown.platformKeeps),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: "Failed to calculate pricing quote", details: err.message });
  }
});

export default router;
