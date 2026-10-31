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

  const shopObj = (body.shopAddress && typeof body.shopAddress === "object") ? body.shopAddress as Record<string, unknown> : {};
  const pickupObj = (body.pickupAddress && typeof body.pickupAddress === "object") ? body.pickupAddress as Record<string, unknown> : {};

  // Extract Shop Address fields
  const shopStreetVal = body.shopStreet !== undefined ? body.shopStreet : (shopObj.addressLine1 !== undefined ? shopObj.addressLine1 : (body.shopAddressLine1 !== undefined ? body.shopAddressLine1 : undefined));
  if (shopStreetVal !== undefined) updates.shopStreet = toNullableText(shopStreetVal);

  const shopLine2Val = body.shopAddressLine2 !== undefined ? body.shopAddressLine2 : (shopObj.addressLine2 !== undefined ? shopObj.addressLine2 : undefined);
  if (shopLine2Val !== undefined) updates.shopAddressLine2 = toNullableText(shopLine2Val);

  const shopLandmarkVal = body.shopLandmark !== undefined ? body.shopLandmark : (shopObj.landmark !== undefined ? shopObj.landmark : undefined);
  if (shopLandmarkVal !== undefined) updates.shopLandmark = toNullableText(shopLandmarkVal);

  const shopCityVal = body.shopCity !== undefined ? body.shopCity : (shopObj.city !== undefined ? shopObj.city : undefined);
  if (shopCityVal !== undefined) updates.shopCity = toNullableText(shopCityVal);

  const shopStateVal = body.shopState !== undefined ? body.shopState : (shopObj.state !== undefined ? shopObj.state : undefined);
  if (shopStateVal !== undefined) updates.shopState = toNullableText(shopStateVal);

  const shopCountryVal = body.shopCountry !== undefined ? body.shopCountry : (shopObj.country !== undefined ? shopObj.country : undefined);
  if (shopCountryVal !== undefined) updates.shopCountry = toNullableText(shopCountryVal);

  const shopPincodeVal = body.shopPincode !== undefined ? body.shopPincode : (shopObj.pincode !== undefined ? shopObj.pincode : undefined);
  if (shopPincodeVal !== undefined) {
    const val = toNullableText(shopPincodeVal);
    if (val && !/^\d{6}$/.test(val)) {
      return { updates: {}, error: "Shop PIN code must be exactly 6 digits." };
    }
    updates.shopPincode = val;
  }

  // Pickup Same As Shop toggle
  if (body.pickupSameAsShop !== undefined) {
    if (typeof body.pickupSameAsShop !== "boolean") {
      return { updates: {}, error: "pickupSameAsShop must be a boolean." };
    }
    updates.pickupSameAsShop = body.pickupSameAsShop;
  }

  const pickupSameAsShop = updates.pickupSameAsShop !== undefined
    ? (updates.pickupSameAsShop as boolean)
    : (current.pickupSameAsShop as boolean ?? false);

  const pickupLocationVal = body.pickupLocationName !== undefined
    ? body.pickupLocationName
    : (pickupObj.locationName !== undefined ? pickupObj.locationName : undefined);

  if (pickupLocationVal !== undefined) {
    updates.pickupLocationName = toNullableText(pickupLocationVal);
  }

  const patchedValue = (field: string) =>
    Object.prototype.hasOwnProperty.call(updates, field)
      ? updates[field]
      : (current[field] ?? null);

  if (pickupSameAsShop) {
    // Copy complete shop address into pickup address fields
    updates.pickupAddressLine1 = patchedValue("shopStreet") as string | null;
    updates.pickupAddressLine2 = patchedValue("shopAddressLine2") as string | null;
    updates.pickupLandmark = patchedValue("shopLandmark") as string | null;
    updates.pickupCity = patchedValue("shopCity") as string | null;
    updates.pickupState = patchedValue("shopState") as string | null;
    updates.pickupPincode = patchedValue("shopPincode") as string | null;
    updates.pickupCountry = patchedValue("shopCountry") as string | null;

    if (!updates.pickupLocationName) {
      updates.pickupLocationName =
        toNullableText(current.pickupLocationName) ||
        toNullableText(body.name) ||
        toNullableText(current.name) ||
        toNullableText(current.shopName) ||
        null;
    }
  } else {
    // Independent pickup address
    const p1 = body.pickupAddressLine1 !== undefined ? body.pickupAddressLine1 : (pickupObj.addressLine1 !== undefined ? pickupObj.addressLine1 : undefined);
    if (p1 !== undefined) updates.pickupAddressLine1 = toNullableText(p1);

    const p2 = body.pickupAddressLine2 !== undefined ? body.pickupAddressLine2 : (pickupObj.addressLine2 !== undefined ? pickupObj.addressLine2 : undefined);
    if (p2 !== undefined) updates.pickupAddressLine2 = toNullableText(p2);

    const pl = body.pickupLandmark !== undefined ? body.pickupLandmark : (pickupObj.landmark !== undefined ? pickupObj.landmark : undefined);
    if (pl !== undefined) updates.pickupLandmark = toNullableText(pl);

    const pc = body.pickupCity !== undefined ? body.pickupCity : (pickupObj.city !== undefined ? pickupObj.city : undefined);
    if (pc !== undefined) updates.pickupCity = toNullableText(pc);

    const ps = body.pickupState !== undefined ? body.pickupState : (pickupObj.state !== undefined ? pickupObj.state : undefined);
    if (ps !== undefined) updates.pickupState = toNullableText(ps);

    const pco = body.pickupCountry !== undefined ? body.pickupCountry : (pickupObj.country !== undefined ? pickupObj.country : undefined);
    if (pco !== undefined) updates.pickupCountry = toNullableText(pco);

    const pp = body.pickupPincode !== undefined ? body.pickupPincode : (pickupObj.pincode !== undefined ? pickupObj.pincode : undefined);
    if (pp !== undefined) {
      const val = toNullableText(pp);
      if (val && !/^\d{6}$/.test(val)) {
        return { updates: {}, error: "Pickup PIN code must be exactly 6 digits." };
      }
      updates.pickupPincode = val;
    }
  }

  return { updates };
}