import { Router } from "express";
import { isCustomer } from "../middlewares/isCustomer";
import { db, savedPaymentMethodsTable } from "@workspace/db";
import { eq, and, asc, sql } from "drizzle-orm";

const router = Router();

// ─── Validation helpers ───────────────────────────────────────────────────────

/** Luhn algorithm — validates card number structure */
function luhn(num: string): boolean {
  const digits = num.replace(/\D/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = parseInt(digits[i], 10);
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Detect card brand from first digits */
function detectBrand(num: string): string {
  const n = num.replace(/\D/g, "");
  if (/^4/.test(n)) return "Visa";
  if (/^5[1-5]/.test(n) || /^2(2[2-9][1-9]|[3-6]\d{2}|7[01]\d|720)\d/.test(n))
    return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (
    /^(508[5-9]|6069[0-9]{2}|607[0-9]{3}|608[0-9]{3}|60698[5-9])/.test(n) ||
    /^(6521|6522)/.test(n)
  )
    return "RuPay";
  if (/^6011|^65|^64[4-9]/.test(n)) return "Discover";
  return "Card";
}

/** Check expiry: month 1-12, not already past */
function isExpiryValid(month: number, year: number): boolean {
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear) return false;
  if (year === currentYear && month < currentMonth) return false;
  return true;
}

/** CVV: 3 digits for most brands, 4 for Amex */
function isCvvValid(cvv: string, brand: string): boolean {
  const len = brand === "Amex" ? 4 : 3;
  return new RegExp(`^\\d{${len}}$`).test(cvv);
}

/** UPI format: localPart@handle */
const UPI_RE = /^[\w.\-]+@[\w.\-]+$/;

// ─── GET /api/payment-methods ─────────────────────────────────────────────────

router.get(
  "/payment-methods",
  isCustomer,
  async (req: any, res: any): Promise<void> => {
    try {
      const rows = await db
        .select()
        .from(savedPaymentMethodsTable)
        .where(eq(savedPaymentMethodsTable.userId, req.userId))
        .orderBy(
          // default first, then oldest first within the rest
          sql`${savedPaymentMethodsTable.isDefault} DESC`,
          asc(savedPaymentMethodsTable.createdAt)
        );

      res.json({ paymentMethods: rows });
    } catch (err) {
      req.log?.error({ err }, "Failed to fetch payment methods");
      res.status(500).json({ error: "Failed to fetch payment methods" });
    }
  }
);

// ─── POST /api/payment-methods ────────────────────────────────────────────────

router.post(
  "/payment-methods",
  isCustomer,
  async (req: any, res: any): Promise<void> => {
    try {
      const { type } = req.body;

      if (type === "card") {
        const { cardNumber, cardholderName, expiryMonth, expiryYear, cvv, isDefault } =
          req.body;

        if (!cardNumber || !cardholderName || !expiryMonth || !expiryYear || !cvv) {
          res.status(400).json({ error: "Missing required card fields" });
          return;
        }

        const nameStr = String(cardholderName).trim();
        if (!nameStr) {
          res.status(400).json({ error: "Cardholder name is required" });
          return;
        }

        const rawNum = String(cardNumber).replace(/\D/g, "");
        if (!luhn(rawNum)) {
          res.status(400).json({ error: "Invalid card number" });
          return;
        }

        const month = parseInt(String(expiryMonth), 10);
        const year = parseInt(String(expiryYear), 10);
        if (!isExpiryValid(month, year)) {
          res.status(400).json({ error: "Card is expired or expiry date is invalid" });
          return;
        }

        const brand = detectBrand(rawNum);
        const cvvStr = String(cvv).trim();
        if (!isCvvValid(cvvStr, brand)) {
          res
            .status(400)
            .json({ error: `CVV must be ${brand === "Amex" ? 4 : 3} digits` });
          return;
        }

        const last4 = rawNum.slice(-4);

        // All duplicate-check + clear-defaults + insert in one transaction
        const created = await db.transaction(async (tx) => {
          // Duplicate check inside the transaction
          const dupe = await tx
            .select({ id: savedPaymentMethodsTable.id })
            .from(savedPaymentMethodsTable)
            .where(
              and(
                eq(savedPaymentMethodsTable.userId, req.userId),
                eq(savedPaymentMethodsTable.type, "card"),
                eq(savedPaymentMethodsTable.last4, last4),
                eq(savedPaymentMethodsTable.cardBrand, brand),
                eq(savedPaymentMethodsTable.expiryMonth, month),
                eq(savedPaymentMethodsTable.expiryYear, year)
              )
            )
            .limit(1);

          if (dupe.length > 0) {
            // Signal duplicate via a thrown error caught below
            throw Object.assign(new Error("DUPLICATE_CARD"), { code: "DUPLICATE_CARD" });
          }

          // First method auto-becomes default
          const existing = await tx
            .select({ id: savedPaymentMethodsTable.id })
            .from(savedPaymentMethodsTable)
            .where(eq(savedPaymentMethodsTable.userId, req.userId))
            .limit(1);

          const makeDefault = !!isDefault || existing.length === 0;

          if (makeDefault) {
            await tx
              .update(savedPaymentMethodsTable)
              .set({ isDefault: false })
              .where(eq(savedPaymentMethodsTable.userId, req.userId));
          }

          const [row] = await tx
            .insert(savedPaymentMethodsTable)
            .values({
              userId: req.userId,
              type: "card",
              cardBrand: brand,
              last4,
              cardholderName: nameStr,
              expiryMonth: month,
              expiryYear: year,
              // CVV intentionally NOT stored
              isDefault: makeDefault,
            })
            .returning();

          return row;
        });

        res.status(201).json({ paymentMethod: created });
      } else if (type === "upi") {
        const { upiId, isDefault } = req.body;

        if (!upiId) {
          res.status(400).json({ error: "UPI ID is required" });
          return;
        }

        const upiStr = String(upiId).trim().toLowerCase();
        if (!UPI_RE.test(upiStr)) {
          res
            .status(400)
            .json({ error: "Invalid UPI ID. Expected format: username@handle" });
          return;
        }

        const upiHandle = upiStr.split("@")[1];

        const created = await db.transaction(async (tx) => {
          // Duplicate check inside the transaction
          const dupe = await tx
            .select({ id: savedPaymentMethodsTable.id })
            .from(savedPaymentMethodsTable)
            .where(
              and(
                eq(savedPaymentMethodsTable.userId, req.userId),
                eq(savedPaymentMethodsTable.type, "upi"),
                eq(savedPaymentMethodsTable.upiId, upiStr)
              )
            )
            .limit(1);

          if (dupe.length > 0) {
            throw Object.assign(new Error("DUPLICATE_UPI"), { code: "DUPLICATE_UPI" });
          }

          const existing = await tx
            .select({ id: savedPaymentMethodsTable.id })
            .from(savedPaymentMethodsTable)
            .where(eq(savedPaymentMethodsTable.userId, req.userId))
            .limit(1);

          const makeDefault = !!isDefault || existing.length === 0;

          if (makeDefault) {
            await tx
              .update(savedPaymentMethodsTable)
              .set({ isDefault: false })
              .where(eq(savedPaymentMethodsTable.userId, req.userId));
          }

          const [row] = await tx
            .insert(savedPaymentMethodsTable)
            .values({
              userId: req.userId,
              type: "upi",
              upiId: upiStr,
              upiHandle,
              isDefault: makeDefault,
            })
            .returning();

          return row;
        });

        res.status(201).json({ paymentMethod: created });
      } else {
        res.status(400).json({ error: "type must be 'card' or 'upi'" });
      }
    } catch (err: any) {
      if (err?.code === "DUPLICATE_CARD") {
        res.status(409).json({ error: "This card is already saved" });
        return;
      }
      if (err?.code === "DUPLICATE_UPI") {
        res.status(409).json({ error: "This UPI ID is already saved" });
        return;
      }
      // Catch DB-level unique constraint violations as duplicates too
      if (err?.code === "23505") {
        res.status(409).json({ error: "This payment method is already saved" });
        return;
      }
      req.log?.error({ err }, "Failed to save payment method");
      res.status(500).json({ error: "Failed to save payment method" });
    }
  }
);

// ─── DELETE /api/payment-methods/:id ─────────────────────────────────────────

router.delete(
  "/payment-methods/:id",
  isCustomer,
  async (req: any, res: any): Promise<void> => {
    try {
      const { id } = req.params;

      await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(savedPaymentMethodsTable)
          .where(eq(savedPaymentMethodsTable.id, id))
          .limit(1);

        if (!existing.length) {
          throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
        }

        // Prevent another shopper from deleting this payment method.
        if (existing[0].userId !== req.userId) {
          throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
        }

        const wasDefault = existing[0].isDefault;

        await tx
          .delete(savedPaymentMethodsTable)
          .where(eq(savedPaymentMethodsTable.id, id));

        // If deleted method was the default, promote the oldest remaining one
        if (wasDefault) {
          const remaining = await tx
            .select()
            .from(savedPaymentMethodsTable)
            .where(eq(savedPaymentMethodsTable.userId, req.userId))
            .orderBy(asc(savedPaymentMethodsTable.createdAt))
            .limit(1);

          if (remaining.length > 0) {
            await tx
              .update(savedPaymentMethodsTable)
              .set({ isDefault: true, updatedAt: new Date() })
              .where(eq(savedPaymentMethodsTable.id, remaining[0].id));
          }
        }
      });

      res.json({ success: true });
    } catch (err: any) {
      if (err?.code === "NOT_FOUND") {
        res.status(404).json({ error: "Payment method not found" });
        return;
      }
      if (err?.code === "FORBIDDEN") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.log?.error({ err }, "Failed to delete payment method");
      res.status(500).json({ error: "Failed to delete payment method" });
    }
  }
);

// ─── PATCH /api/payment-methods/:id ──────────────────────────────────────────
// Updates editable fields on an existing payment method.
// Card: cardholderName, expiryMonth, expiryYear  (card number is immutable)
// UPI:  upiId

router.patch(
  "/payment-methods/:id",
  isCustomer,
  async (req: any, res: any): Promise<void> => {
    try {
      const { id } = req.params;

      const existing = await db
        .select()
        .from(savedPaymentMethodsTable)
        .where(eq(savedPaymentMethodsTable.id, id))
        .limit(1);

      if (!existing.length) {
        res.status(404).json({ error: "Payment method not found" });
        return;
      }

      if (existing[0].userId !== req.userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const method = existing[0];

      if (method.type === "card") {
        const { cardholderName, expiryMonth, expiryYear } = req.body;

        const nameStr = cardholderName !== undefined ? String(cardholderName).trim() : undefined;
        if (nameStr !== undefined && !nameStr) {
          res.status(400).json({ error: "Cardholder name cannot be empty" });
          return;
        }

        let monthNum: number | undefined;
        let yearNum: number | undefined;
        if (expiryMonth !== undefined || expiryYear !== undefined) {
          monthNum = parseInt(String(expiryMonth ?? method.expiryMonth), 10);
          yearNum  = parseInt(String(expiryYear  ?? method.expiryYear),  10);
          if (!isExpiryValid(monthNum, yearNum)) {
            res.status(400).json({ error: "Card is expired or expiry date is invalid" });
            return;
          }
        }

        const updates: Record<string, any> = { updatedAt: new Date() };
        if (nameStr  !== undefined) updates.cardholderName = nameStr;
        if (monthNum !== undefined) updates.expiryMonth    = monthNum;
        if (yearNum  !== undefined) updates.expiryYear     = yearNum;

        const [updated] = await db
          .update(savedPaymentMethodsTable)
          .set(updates)
          .where(eq(savedPaymentMethodsTable.id, id))
          .returning();

        res.json({ paymentMethod: updated });
      } else if (method.type === "upi") {
        const { upiId } = req.body;

        if (!upiId) {
          res.status(400).json({ error: "UPI ID is required" });
          return;
        }

        const upiStr = String(upiId).trim().toLowerCase();
        if (!UPI_RE.test(upiStr)) {
          res.status(400).json({ error: "Invalid UPI ID. Expected format: username@handle" });
          return;
        }

        // Duplicate check (exclude self)
        const dupe = await db
          .select({ id: savedPaymentMethodsTable.id })
          .from(savedPaymentMethodsTable)
          .where(
            and(
              eq(savedPaymentMethodsTable.userId, req.userId),
              eq(savedPaymentMethodsTable.type, "upi"),
              eq(savedPaymentMethodsTable.upiId, upiStr)
            )
          )
          .limit(1);

        if (dupe.length > 0 && dupe[0].id !== id) {
          res.status(409).json({ error: "This UPI ID is already saved" });
          return;
        }

        const upiHandle = upiStr.split("@")[1];

        const [updated] = await db
          .update(savedPaymentMethodsTable)
          .set({ upiId: upiStr, upiHandle, updatedAt: new Date() })
          .where(eq(savedPaymentMethodsTable.id, id))
          .returning();

        res.json({ paymentMethod: updated });
      } else {
        res.status(400).json({ error: "Unknown payment method type" });
      }
    } catch (err) {
      req.log?.error({ err }, "Failed to update payment method");
      res.status(500).json({ error: "Failed to update payment method" });
    }
  }
);

// ─── PATCH /api/payment-methods/:id/set-default ───────────────────────────────

router.patch(
  "/payment-methods/:id/set-default",
  isCustomer,
  async (req: any, res: any): Promise<void> => {
    try {
      const { id } = req.params;

      const updated = await db.transaction(async (tx) => {
        const existing = await tx
          .select()
          .from(savedPaymentMethodsTable)
          .where(eq(savedPaymentMethodsTable.id, id))
          .limit(1);

        if (!existing.length) {
          throw Object.assign(new Error("NOT_FOUND"), { code: "NOT_FOUND" });
        }

        if (existing[0].userId !== req.userId) {
          throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
        }

        // Serialize default changes for this shopper. Without locking all of
        // the shopper's methods first, two transactions can both clear the
        // current default before either one promotes its target.
        await tx
          .select({ id: savedPaymentMethodsTable.id })
          .from(savedPaymentMethodsTable)
          .where(eq(savedPaymentMethodsTable.userId, req.userId))
          .for("update");

        // Clear all defaults for this user, then set the target
        await tx
          .update(savedPaymentMethodsTable)
          .set({ isDefault: false })
          .where(eq(savedPaymentMethodsTable.userId, req.userId));

        const [row] = await tx
          .update(savedPaymentMethodsTable)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(savedPaymentMethodsTable.id, id))
          .returning();

        return row;
      });

      res.json({ paymentMethod: updated });
    } catch (err: any) {
      if (err?.code === "NOT_FOUND") {
        res.status(404).json({ error: "Payment method not found" });
        return;
      }
      if (err?.code === "FORBIDDEN") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      req.log?.error({ err }, "Failed to set default payment method");
      res.status(500).json({ error: "Failed to set default payment method" });
    }
  }
);

export default router;
