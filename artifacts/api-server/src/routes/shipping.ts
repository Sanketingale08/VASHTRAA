import { Router } from "express";

const router = Router();

type Zone = { minDays: number; maxDays: number; label: string };

const ZONES: Record<string, Zone> = {
  metro: { minDays: 3, maxDays: 5, label: "Metro" },
  tier1: { minDays: 4, maxDays: 6, label: "Tier-1 City" },
  tier2: { minDays: 5, maxDays: 7, label: "Tier-2 City" },
  tier3: { minDays: 6, maxDays: 9, label: "Tier-3 / Rural" },
};

type PincodeRange = { start: number; end: number; zone: keyof typeof ZONES };

const SERVICEABLE_RANGES: PincodeRange[] = [
  { start: 110001, end: 110096, zone: "metro" },
  { start: 110097, end: 110110, zone: "metro" },
  { start: 120001, end: 135003, zone: "tier2" },
  { start: 140001, end: 160071, zone: "tier1" },
  { start: 160072, end: 176402, zone: "tier2" },
  { start: 176403, end: 193504, zone: "tier3" },
  { start: 194101, end: 194404, zone: "tier3" },
  { start: 201001, end: 204216, zone: "tier1" },
  { start: 204217, end: 244924, zone: "tier2" },
  { start: 244925, end: 285205, zone: "tier2" },
  { start: 301001, end: 342606, zone: "tier2" },
  { start: 360001, end: 396560, zone: "tier2" },
  { start: 380001, end: 395023, zone: "metro" },
  { start: 400001, end: 421605, zone: "metro" },
  { start: 411001, end: 416550, zone: "metro" },
  { start: 421606, end: 444906, zone: "tier1" },
  { start: 444907, end: 445388, zone: "tier2" },
  { start: 450001, end: 486888, zone: "tier2" },
  { start: 490001, end: 497778, zone: "tier2" },
  { start: 500001, end: 509412, zone: "metro" },
  { start: 515001, end: 535591, zone: "tier2" },
  { start: 560001, end: 563160, zone: "metro" },
  { start: 570001, end: 591346, zone: "tier1" },
  { start: 600001, end: 603308, zone: "metro" },
  { start: 606001, end: 643243, zone: "tier1" },
  { start: 670001, end: 695615, zone: "tier1" },
  { start: 700001, end: 743423, zone: "metro" },
  { start: 110201, end: 110303, zone: "metro" },
  { start: 226001, end: 227817, zone: "tier1" },
  { start: 208001, end: 212655, zone: "tier1" },
  { start: 302001, end: 306401, zone: "tier1" },
  { start: 248001, end: 249302, zone: "tier2" },
  { start: 180001, end: 185153, zone: "tier2" },
  { start: 534001, end: 534350, zone: "tier2" },
  { start: 800001, end: 855117, zone: "tier2" },
  { start: 600100, end: 603115, zone: "metro" },
  { start: 462001, end: 466651, zone: "tier1" },
  { start: 751001, end: 756165, zone: "tier1" },
  { start: 781001, end: 788931, zone: "tier2" },
  { start: 793001, end: 798628, zone: "tier3" },
  { start: 560100, end: 562162, zone: "metro" },
  { start: 641001, end: 643213, zone: "tier1" },
  { start: 682001, end: 683587, zone: "metro" },
];

const UNSERVICEABLE_RANGES: { start: number; end: number }[] = [
  { start: 744101, end: 744304 },
  { start: 791001, end: 792131 },
  { start: 792132, end: 792132 },
];

function isUnserviceable(pin: number): boolean {
  return UNSERVICEABLE_RANGES.some(r => pin >= r.start && pin <= r.end);
}

function getZoneForPincode(pin: number): (keyof typeof ZONES) | null {
  if (isUnserviceable(pin)) return null;
  for (const range of SERVICEABLE_RANGES) {
    if (pin >= range.start && pin <= range.end) {
      return range.zone;
    }
  }
  return null;
}

router.get("/shipping/check", (req: any, res: any) => {
  const { pincode } = req.query;
  if (!pincode || !/^\d{6}$/.test(String(pincode))) {
    return res.status(400).json({ error: "Invalid pincode format" });
  }

  const pin = parseInt(String(pincode), 10);
  const zone = getZoneForPincode(pin);

  if (!zone) {
    return res.json({
      available: false,
      estimatedDays: null,
      zone: null,
      message: "Delivery not available to this pincode",
    });
  }

  const zoneInfo = ZONES[zone];
  return res.json({
    available: true,
    estimatedDays: zoneInfo.maxDays,
    minDays: zoneInfo.minDays,
    maxDays: zoneInfo.maxDays,
    zone: zoneInfo.label,
    message: `Delivery available — ${zoneInfo.minDays}–${zoneInfo.maxDays} business days`,
  });
});

export default router;
