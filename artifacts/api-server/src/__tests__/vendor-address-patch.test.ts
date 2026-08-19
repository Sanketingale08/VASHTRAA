import { describe, expect, it } from "vitest";
import {
  buildVendorAddressUpdates,
  toNullableText,
} from "../lib/vendorAddress";

describe("vendor address patch normalization", () => {
  it("keeps blank nullable fields as null instead of the text 'null'", () => {
    expect(toNullableText(null)).toBeNull();
    expect(toNullableText("   ")).toBeNull();

    const result = buildVendorAddressUpdates(
      {
        shopAddressLine2: null,
        pickupCity: "",
      },
      {},
    );

    expect(result.error).toBeUndefined();
    expect(result.updates.shopAddressLine2).toBeNull();
    expect(result.updates.pickupCity).toBeNull();
  });

  it("rejects malformed PIN codes while accepting blank optional values", () => {
    expect(
      buildVendorAddressUpdates({ shopPincode: "12345" }, {}).error,
    ).toBe("Shop PIN code must be exactly 6 digits.");

    const blank = buildVendorAddressUpdates(
      { shopPincode: null, pickupPincode: "" },
      {},
    );
    expect(blank.error).toBeUndefined();
    expect(blank.updates.shopPincode).toBeNull();
    expect(blank.updates.pickupPincode).toBeNull();
  });

  it("copies the effective shop address when pickup is the same as shop", () => {
    const result = buildVendorAddressUpdates(
      {
        shopStreet: "  12 Market Road  ",
        shopCity: "Pune",
        shopState: "Maharashtra",
        shopPincode: "411001",
        shopCountry: "India",
        pickupSameAsShop: true,
        pickupAddressLine1: "Ignored pickup value",
      },
      {
        shopAddressLine2: "First Floor",
        shopLandmark: "Clock Tower",
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.updates).toMatchObject({
      shopStreet: "12 Market Road",
      pickupSameAsShop: true,
      pickupAddressLine1: "12 Market Road",
      pickupAddressLine2: "First Floor",
      pickupLandmark: "Clock Tower",
      pickupCity: "Pune",
      pickupState: "Maharashtra",
      pickupPincode: "411001",
      pickupCountry: "India",
    });
  });

  it("requires pickupSameAsShop to be a JSON boolean", () => {
    expect(
      buildVendorAddressUpdates({ pickupSameAsShop: "false" }, {}).error,
    ).toBe("pickupSameAsShop must be a boolean.");
  });
});