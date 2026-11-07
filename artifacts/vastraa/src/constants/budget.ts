/**
 * Authoritative Budget Ranges Configuration for VASTRAA
 *
 * Implements non-overlapping, inclusive/exclusive budget pricing boundaries:
 * 1. Under ₹500:       price < 500               (min: 0,    max: 499)
 * 2. ₹500–₹1,000:      price >= 500 & price < 1,000 (min: 500,  max: 999)
 * 3. ₹1,000–₹2,000:    price >= 1,000 & price < 2,000 (min: 1000, max: 1999)
 * 4. ₹2,000–₹5,000:    price >= 2,000 & price < 5,000 (min: 2000, max: 4999)
 * 5. ₹5,000+:          price >= 5,000            (min: 5000, max: undefined)
 */

export interface BudgetRange {
  id: string;
  label: string;
  badge: string;
  subtext: string;
  min?: number;
  max?: number;
}

export const BUDGET_RANGES: BudgetRange[] = [
  {
    id: "under-500",
    label: "Under ₹500",
    badge: "BUDGET",
    subtext: "Budget Finds",
    min: 0,
    max: 499,
  },
  {
    id: "500-1000",
    label: "₹500–₹1,000",
    badge: "POPULAR",
    subtext: "Everyday Favorites",
    min: 500,
    max: 999,
  },
  {
    id: "1000-2000",
    label: "₹1,000–₹2,000",
    badge: "BEST VALUE",
    subtext: "Festive Collection",
    min: 1000,
    max: 1999,
  },
  {
    id: "2000-5000",
    label: "₹2,000–₹5,000",
    badge: "HANDLOOM",
    subtext: "Premium Weaves",
    min: 2000,
    max: 4999,
  },
  {
    id: "5000-above",
    label: "₹5,000+",
    badge: "LUXURY",
    subtext: "Royal & Bridal",
    min: 5000,
    max: undefined,
  },
];

/**
 * Resolves a budget range by its ID or common legacy aliases.
 */
export function getBudgetById(id?: string | null): BudgetRange | null {
  if (!id) return null;
  const norm = id.toLowerCase().trim();

  // Direct match
  const direct = BUDGET_RANGES.find((b) => b.id === norm);
  if (direct) return direct;

  // Legacy & descriptive aliases
  if (norm === "under-1000" || norm === "500-1000") {
    return BUDGET_RANGES[1];
  }
  if (norm === "under-2000" || norm === "1000-2000") {
    return BUDGET_RANGES[2];
  }
  if (norm === "premium" || norm === "above-5000" || norm === "5000-plus" || norm === "5000+") {
    return BUDGET_RANGES[4];
  }

  return null;
}

/**
 * Resolves a budget range from given min/max price boundaries.
 * Accurately handles both strict integer non-overlapping boundaries (499, 999, 1999, 4999)
 * and legacy boundary representations (500, 1000, 2000, 5000).
 */
export function getBudgetByPrice(min?: number | null, max?: number | null): BudgetRange | null {
  if (min === undefined && max === undefined) return null;
  if (min === null && max === null) return null;

  const numMin = min !== undefined && min !== null ? Number(min) : undefined;
  const numMax = max !== undefined && max !== null ? Number(max) : undefined;

  // Under ₹500
  if ((numMin === undefined || numMin === 0) && (numMax === 499 || numMax === 500)) {
    return BUDGET_RANGES[0];
  }

  // ₹500–₹1,000
  if (
    (numMin === 500 || (numMin === 0 && (numMax === 999 || numMax === 1000))) &&
    (numMax === 999 || numMax === 1000)
  ) {
    return BUDGET_RANGES[1];
  }

  // ₹1,000–₹2,000
  if (
    (numMin === 1000 || (numMin === 0 && (numMax === 1999 || numMax === 2000))) &&
    (numMax === 1999 || numMax === 2000)
  ) {
    return BUDGET_RANGES[2];
  }

  // ₹2,000–₹5,000
  if (numMin === 2000 && (numMax === 4999 || numMax === 5000)) {
    return BUDGET_RANGES[3];
  }

  // ₹5,000+
  if (numMin === 5000 && (numMax === undefined || numMax === null)) {
    return BUDGET_RANGES[4];
  }

  return null;
}

/**
 * Formats a budget price display string for chips and UI indicators.
 */
export function formatBudgetDisplay(budget: BudgetRange | null, fallbackMin?: number, fallbackMax?: number): string {
  if (budget) return budget.label;
  if (fallbackMin !== undefined && fallbackMax !== undefined) {
    return `₹${fallbackMin.toLocaleString("en-IN")} – ₹${fallbackMax.toLocaleString("en-IN")}`;
  }
  if (fallbackMin !== undefined) {
    return `₹${fallbackMin.toLocaleString("en-IN")}+`;
  }
  if (fallbackMax !== undefined) {
    return `Under ₹${fallbackMax.toLocaleString("en-IN")}`;
  }
  return "All Prices";
}
