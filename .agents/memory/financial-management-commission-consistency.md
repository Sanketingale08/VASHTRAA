---
name: Financial module commission consistency
description: Commission rate must be computed the same way everywhere (BI, financial reports, profit analysis, vendor analytics)
---

TwirlDrape's commission rate has precedence vendor-specific > category > global > default (10%). Any module that reports revenue, profit, or vendor payouts (BI dashboard, revenue/profit reports, vendor analytics) must resolve the effective rate via the shared `artifacts/api-server/src/lib/commission.ts` helpers instead of hardcoding a flat rate — otherwise commission figures silently diverge between dashboards once an admin creates a custom commission rule.

**Why:** code review caught multiple modules independently hardcoding 0.10 instead of reading `commissionRulesTable`, which would make reports inconsistent as soon as vendor/category-specific rules existed.

**How to apply:** when adding a new report or analytics endpoint that touches order revenue/commission, import `effectiveRateFromRules`/`getEffectiveCommissionRate` from `commission.ts` rather than reimplementing rate lookup.
