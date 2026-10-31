import crypto from "crypto";
import { db, vendorsTable, mongoVendors, mongoSellers, eq, or } from "@workspace/db";
import { isShiprocketConfigured, shiprocketApiRequest } from "./shiprocketClient";
import { shiprocketMock } from "./shiprocketMock";

export interface NormalizedSellerAddress {
  locationName: string;
  name: string;
  email: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  country: string;
  pincode: string;
}

export interface PickupSyncResult {
  success: boolean;
  nickname?: string;
  pickupId?: number;
  status: "registered" | "failed" | "unregistered";
  error?: string;
  reused?: boolean;
}

/**
 * Computes a deterministic SHA-256 hash of address fields to detect modifications.
 */
export function computeAddressHash(addr: NormalizedSellerAddress): string {
  const normalized = [
    addr.addressLine1.trim().toLowerCase(),
    (addr.addressLine2 || "").trim().toLowerCase(),
    addr.city.trim().toLowerCase(),
    addr.state.trim().toLowerCase(),
    addr.pincode.trim(),
    addr.phone.replace(/\D/g, "").slice(-10),
  ].join("|");

  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/**
 * Validates and normalizes raw seller address inputs for Shiprocket compatibility.
 */
export function validateAndNormalizeSellerAddress(
  vendorId: string,
  rawAddress: any,
  vendorProfile: any = {}
): { valid: boolean; normalized?: NormalizedSellerAddress; error?: string } {
  const pickupSameAsShop = Boolean(rawAddress.pickupSameAsShop ?? vendorProfile.pickupSameAsShop);

  const line1 = (
    pickupSameAsShop
      ? rawAddress.shopStreet || rawAddress.shopAddress?.addressLine1 || rawAddress.addressLine1 || rawAddress.address || vendorProfile.shopStreet || vendorProfile.pickupAddressLine1
      : rawAddress.pickupAddressLine1 || rawAddress.pickupAddress?.addressLine1 || rawAddress.addressLine1 || rawAddress.address || vendorProfile.pickupAddressLine1 || rawAddress.shopStreet || rawAddress.shopAddress?.addressLine1 || vendorProfile.shopStreet
  )?.trim();

  const line2 = (
    pickupSameAsShop
      ? rawAddress.shopAddressLine2 || rawAddress.shopAddress?.addressLine2 || rawAddress.addressLine2 || rawAddress.address_2 || vendorProfile.shopAddressLine2 || vendorProfile.pickupAddressLine2
      : rawAddress.pickupAddressLine2 || rawAddress.pickupAddress?.addressLine2 || rawAddress.addressLine2 || rawAddress.address_2 || vendorProfile.pickupAddressLine2 || rawAddress.shopAddressLine2 || vendorProfile.shopAddressLine2
  )?.trim();

  const city = (
    pickupSameAsShop
      ? rawAddress.shopCity || rawAddress.shopAddress?.city || rawAddress.city || vendorProfile.shopCity || vendorProfile.pickupCity
      : rawAddress.pickupCity || rawAddress.pickupAddress?.city || rawAddress.city || vendorProfile.pickupCity || rawAddress.shopCity || vendorProfile.shopCity
  )?.trim();

  const state = (
    pickupSameAsShop
      ? rawAddress.shopState || rawAddress.shopAddress?.state || rawAddress.state || vendorProfile.shopState || vendorProfile.pickupState
      : rawAddress.pickupState || rawAddress.pickupAddress?.state || rawAddress.state || vendorProfile.pickupState || rawAddress.shopState || vendorProfile.shopState
  )?.trim();

  const pincode = (
    pickupSameAsShop
      ? rawAddress.shopPincode || rawAddress.shopAddress?.pincode || rawAddress.pincode || rawAddress.pin_code || vendorProfile.shopPincode || vendorProfile.pickupPincode
      : rawAddress.pickupPincode || rawAddress.pickupAddress?.pincode || rawAddress.pincode || rawAddress.pin_code || vendorProfile.pickupPincode || rawAddress.shopPincode || vendorProfile.shopPincode
  )?.trim();

  const name = (
    vendorProfile.shopName ||
    vendorProfile.name ||
    rawAddress.name ||
    rawAddress.shopName ||
    "Vastraa Artisan"
  ).trim();

  const email = (
    rawAddress.contactEmail ||
    rawAddress.email ||
    vendorProfile.contactEmail ||
    vendorProfile.email ||
    "seller@vastraa.com"
  ).trim();

  const rawPhone = String(
    rawAddress.mobile ||
    rawAddress.phone ||
    vendorProfile.mobile ||
    vendorProfile.phone ||
    ""
  ).replace(/\D/g, "");

  const phone = rawPhone.length >= 10 ? rawPhone.slice(-10) : "";

  // Validations
  if (!pincode || !/^\d{6}$/.test(pincode)) {
    return { valid: false, error: `Invalid pickup PIN code: "${pincode || ""}". Must be exactly 6 digits.` };
  }
  if (!line1 || line1.length < 5) {
    return { valid: false, error: "Pickup street address must be at least 5 characters long." };
  }
  if (!city) {
    return { valid: false, error: "Pickup city is required." };
  }
  if (!state) {
    return { valid: false, error: "Pickup state is required." };
  }
  if (!phone || phone.length !== 10 || !/^[6-9]\d{9}$/.test(phone)) {
    return { valid: false, error: "Valid 10-digit seller mobile number (starting with 6, 7, 8, or 9) is required for courier pickup." };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { valid: false, error: "Valid seller contact email is required for courier pickup." };
  }

  // Create a clean, alphanumeric nickname for Shiprocket (max 36 chars)
  const cleanId = String(vendorId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const cleanPin = pincode.slice(0, 6);
  const locationName = `VASTRAA_${cleanId}_${cleanPin}`.slice(0, 36).toUpperCase();

  return {
    valid: true,
    normalized: {
      locationName,
      name,
      email,
      phone,
      addressLine1: line1,
      addressLine2: line2 || undefined,
      city,
      state,
      country: "India",
      pincode,
    },
  };
}

/**
 * Automatically registers or verifies the seller's pickup location in Shiprocket.
 * - Detects if the address actually changed via hash.
 * - Reuses existing registered location if unchanged.
 * - If modified, calls Shiprocket addpickup API and updates MongoDB.
 */
export async function syncSellerPickupToShiprocket(
  vendorId: string,
  rawAddress: any,
  currentVendorRecord: any = {}
): Promise<PickupSyncResult> {
  const normResult = validateAndNormalizeSellerAddress(vendorId, rawAddress, currentVendorRecord);

  if (!normResult.valid || !normResult.normalized) {
    const errorMsg = normResult.error || "Invalid pickup address";
    // Mark as failed in DB
    await updateVendorShippingFields(vendorId, {
      shiprocketPickupStatus: "failed",
      shiprocketPickupError: errorMsg,
    });
    return { success: false, status: "failed", error: errorMsg };
  }

  let addr = normResult.normalized;
  const newHash = computeAddressHash(addr);

  // Check if address is identical to existing registered pickup location
  if (
    currentVendorRecord.shiprocketPickupLocationName &&
    currentVendorRecord.shiprocketPickupStatus === "registered" &&
    currentVendorRecord.shiprocketAddressHash === newHash
  ) {
    return {
      success: true,
      status: "registered",
      nickname: currentVendorRecord.shiprocketPickupLocationName,
      pickupId: currentVendorRecord.shiprocketPickupId,
      reused: true,
    };
  }

  // If seller changed street address within the same PIN code, Shiprocket requires a distinct nickname
  // to avoid colliding with or ignoring the old address nickname
  if (
    currentVendorRecord.shiprocketPickupLocationName &&
    currentVendorRecord.shiprocketPickupLocationName === addr.locationName &&
    currentVendorRecord.shiprocketAddressHash &&
    currentVendorRecord.shiprocketAddressHash !== newHash
  ) {
    const revisedNickname = `${addr.locationName}_${newHash.slice(0, 4)}`.slice(0, 36).toUpperCase();
    addr = {
      ...addr,
      locationName: revisedNickname,
    };
  }

  // Build Shiprocket payload
  const payload = {
    pickup_location: addr.locationName,
    name: addr.name,
    email: addr.email,
    phone: addr.phone,
    address: addr.addressLine1,
    address_2: addr.addressLine2 || "",
    city: addr.city,
    state: addr.state,
    country: "India",
    pin_code: addr.pincode,
  };

  let registeredPickupId: number | undefined;

  if (isShiprocketConfigured()) {
    // Call live Shiprocket API
    const apiRes = await shiprocketApiRequest("/settings/company/addpickup", {
      method: "POST",
      body: payload,
    });

    if (!apiRes.success) {
      const err = apiRes.error || "Failed to register pickup location in Shiprocket";
      await updateVendorShippingFields(vendorId, {
        shiprocketPickupStatus: "failed",
        shiprocketPickupError: err,
        pickupLocationName: addr.locationName,
        pickupAddressLine1: addr.addressLine1,
        pickupAddressLine2: addr.addressLine2 || null,
        pickupCity: addr.city,
        pickupState: addr.state,
        pickupPincode: addr.pincode,
        pickupCountry: addr.country,
      });
      return { success: false, status: "failed", error: err };
    }

    registeredPickupId = apiRes.data?.pickup_id || apiRes.data?.address?.pickup_id || 10001;
  } else {
    // High-fidelity sandbox / mock mode
    const mockRes = shiprocketMock.addPickupLocation(payload);
    if (!mockRes.success) {
      const err = mockRes.message || "Failed to register pickup in mock sandbox";
      await updateVendorShippingFields(vendorId, {
        shiprocketPickupStatus: "failed",
        shiprocketPickupError: err,
        pickupLocationName: addr.locationName,
        pickupAddressLine1: addr.addressLine1,
        pickupAddressLine2: addr.addressLine2 || null,
        pickupCity: addr.city,
        pickupState: addr.state,
        pickupPincode: addr.pincode,
        pickupCountry: addr.country,
      });
      return { success: false, status: "failed", error: err };
    }
    registeredPickupId = mockRes.pickup_id;
  }

  // Persist successful registration and normalized pickup address in MongoDB & Drizzle
  const updates = {
    shiprocketPickupLocationName: addr.locationName,
    shiprocketPickupId: registeredPickupId,
    shiprocketPickupStatus: "registered" as const,
    shiprocketPickupError: null,
    shiprocketAddressHash: newHash,
    pickupLocationName: addr.locationName,
    pickupAddressLine1: addr.addressLine1,
    pickupAddressLine2: addr.addressLine2 || null,
    pickupCity: addr.city,
    pickupState: addr.state,
    pickupPincode: addr.pincode,
    pickupCountry: addr.country,
    pickupSameAsShop: Boolean(rawAddress.pickupSameAsShop ?? currentVendorRecord.pickupSameAsShop ?? true),
  };

  await updateVendorShippingFields(vendorId, updates);

  return {
    success: true,
    status: "registered",
    nickname: addr.locationName,
    pickupId: registeredPickupId,
    reused: false,
  };
}

/**
 * Helper to update shipping fields across MongoDB and PostgreSQL.
 */
async function updateVendorShippingFields(
  vendorId: string,
  fields: Record<string, any>
): Promise<void> {
  try {
    await mongoVendors.update(vendorId, fields);
  } catch {}
  try {
    await mongoSellers.update(vendorId, fields);
  } catch {}
  try {
    await db
      .update(vendorsTable)
      .set(fields as any)
      .where(or(eq(vendorsTable.id, vendorId), eq(vendorsTable.vendorId, vendorId)));
  } catch {}
}
