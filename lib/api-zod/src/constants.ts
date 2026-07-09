export const PAYMENT_METHODS = [
  "upi",
  "card",
  "credit_card",
  "debit_card",
  "net_banking",
  "wallet",
  "cod",
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export function isValidPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}
