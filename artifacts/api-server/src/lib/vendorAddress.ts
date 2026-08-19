type VendorAddressRecord = Record<string, unknown>;

type AddressPatchResult = {
  updates: Record<string, string | boolean | null>;
  error?: string;
};

export function toNullableText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text || null;
}

export function buildVendorAddressUpdates(
  body: VendorAddressRecord,
  current: VendorAddressRecord,
): AddressPatchResult {
  const updates: Record<string, string | boolean | null> = {};
  const textFields = [
    "shopStreet",
    "shopAddressLine2",
    "shopLandmark",
    "shopCity",
    "shopState",
    "shopCountry",
    "pickupLocationName",
    "pickupAddressLine1",
    "pickupAddressLine2",
    "pickupLandmark",
    "pickupCity",
    "pickupState",
    "pickupCountry",
  ] as const;

  for (const field of textFields) {
    if (body[field] !== undefined) {
      updates[field] = toNullableText(body[field]);
    }
  }

  for (const [field, label] of [
    ["shopPincode", "Shop"],
    ["pickupPincode", "Pickup"],
  ] as const) {
    if (body[field] === undefined) continue;
    const value = toNullableText(body[field]);
    if (value && !/^\d{6}$/.test(value)) {
      return {
        updates: {},
        error: `${label} PIN code must be exactly 6 digits.`,
      };
    }
    updates[field] = value;
  }

  if (body.pickupSameAsShop !== undefined) {
    if (typeof body.pickupSameAsShop !== "boolean") {
      return {
        updates: {},
        error: "pickupSameAsShop must be a boolean.",
      };
    }
    updates.pickupSameAsShop = body.pickupSameAsShop;
  }

  const patchedValue = (field: string) =>
    Object.prototype.hasOwnProperty.call(updates, field)
      ? updates[field]
      : current[field] ?? null;

  const pickupSameAsShop =
    updates.pickupSameAsShop ?? current.pickupSameAsShop ?? false;

  if (pickupSameAsShop) {
    updates.pickupAddressLine1 = patchedValue("shopStreet") as string | null;
    updates.pickupAddressLine2 = patchedValue("shopAddressLine2") as string | null;
    updates.pickupLandmark = patchedValue("shopLandmark") as string | null;
    updates.pickupCity = patchedValue("shopCity") as string | null;
    updates.pickupState = patchedValue("shopState") as string | null;
    updates.pickupPincode = patchedValue("shopPincode") as string | null;
    updates.pickupCountry = patchedValue("shopCountry") as string | null;
  }

  return { updates };
}