import { db, mongoGeneric } from "@workspace/db";
import { commissionRulesTable } from "@workspace/db";
import { eq } from "@workspace/db";

export const DEFAULT_COMMISSION_RATE = 0.10;

export async function loadActiveCommissionRules() {
  try {
    const rules = await mongoGeneric.getCollection("commission_rules").find({ active: true }).toArray();
    return rules;
  } catch {
    return db.select().from(commissionRulesTable).where(eq(commissionRulesTable.active, true));
  }
}

export interface CommissionRuleLike {
  scope: string;
  category: string | null;
  vendorId: string | null;
  rate: number;
  effectiveFrom?: Date | string | null;
  effectiveTo?: Date | string | null;
}

function isRuleEffective(rule: CommissionRuleLike, at: Date): boolean {
  if (rule.effectiveFrom && at < new Date(rule.effectiveFrom)) return false;
  if (rule.effectiveTo && at > new Date(rule.effectiveTo)) return false;
  return true;
}

export function effectiveRateFromRules(
  rules: CommissionRuleLike[],
  vendorId: string | null | undefined,
  category: string | null | undefined,
  at: Date = new Date(),
): number {
  const eligible = rules.filter((r) => isRuleEffective(r, at));
  const vendorRule = vendorId ? eligible.find((r) => r.scope === "vendor" && r.vendorId === vendorId) : undefined;
  if (vendorRule) return vendorRule.rate;
  const categoryRule = category ? eligible.find((r) => r.scope === "category" && r.category === category) : undefined;
  if (categoryRule) return categoryRule.rate;
  const globalRule = eligible.find((r) => r.scope === "global");
  if (globalRule) return globalRule.rate;
  return DEFAULT_COMMISSION_RATE;
}

export async function getEffectiveCommissionRate(vendorId: string, category: string): Promise<number> {
  const rules = await loadActiveCommissionRules();
  return effectiveRateFromRules(rules, vendorId, category);
}
