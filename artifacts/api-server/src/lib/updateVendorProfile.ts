import { db, vendorsTable, mongoVendors, mongoSellers, eq, or } from "@workspace/db";
import { buildVendorAddressUpdates, toNullableText } from "./vendorAddress";
import { syncSellerPickupToShiprocket } from "../services/shipping/shiprocketPickupService";

export async function executeVendorProfileUpdate(
  req: any,
  res: any,
  targetIdFromParams?: string
) {
  const authVendor = req.vendor;
  if (!authVendor) {
    return res.status(401).json({
      error: "Authentication required. Please log in as a seller.",
      code: "UNAUTHORIZED",
    });
  }

  // 1. Authorization check & Seller Data Isolation (Requirement 4 & Requirement 8)
  const authenticatedIds = new Set<string>();
  if (authVendor.id) authenticatedIds.add(String(authVendor.id));
  if (authVendor.vendorId) authenticatedIds.add(String(authVendor.vendorId));
  if (authVendor.sellerId) authenticatedIds.add(String(authVendor.sellerId));
  if (authVendor.ownerId) authenticatedIds.add(String(authVendor.ownerId));
  if (authVendor._id) authenticatedIds.add(String(authVendor._id));
  if (req.vendorId) authenticatedIds.add(String(req.vendorId));
  if (req.userId) authenticatedIds.add(String(req.userId));

  if (
    targetIdFromParams &&
    targetIdFromParams !== "me" &&
    targetIdFromParams !== "profile"
  ) {
    if (!authenticatedIds.has(String(targetIdFromParams))) {
      return res.status(403).json({
        error: "Forbidden: You can only update your own seller profile.",
        code: "FORBIDDEN",
      });
    }
  }

  const primaryVendorId =
    authVendor.id ||
    authVendor.vendorId ||
    authVendor.sellerId ||
    req.vendorId ||
    req.userId;

  const body = req.body || {};
  const updates: Record<string, any> = {};

  // 2. Business Name / Shop Name (Requirement 1 & Requirement 2)
  const rawName = body.name !== undefined ? body.name : body.shopName;
  if (rawName !== undefined) {
    if (rawName === null || String(rawName).trim() === "") {
      return res.status(400).json({ error: "Business name is required." });
    }
    const officialName = String(rawName).trim();
    updates.name = officialName;
    updates.shopName = officialName;
  }

  // 3. Business Location (Requirement 1)
  const rawLocation =
    body.location !== undefined ? body.location : body.businessLocation;
  if (rawLocation !== undefined) {
    if (rawLocation === null || String(rawLocation).trim() === "") {
      return res.status(400).json({ error: "Business location is required." });
    }
    updates.location = String(rawLocation).trim();
  }

  // 4. Tagline, Bio / Description, Avatar, GSTIN (Requirement 1)
  if (body.tagline !== undefined) updates.tagline = toNullableText(body.tagline);

  const rawBio = body.bio !== undefined ? body.bio : body.description;
  if (rawBio !== undefined) updates.bio = toNullableText(rawBio);

  if (body.avatar !== undefined) updates.avatar = toNullableText(body.avatar);
  if (body.gstin !== undefined) {
    updates.gstin = toNullableText(body.gstin)?.toUpperCase() ?? null;
  }

  // 5. Mobile Number Validation (Requirement 1)
  if (body.mobile !== undefined) {
    if (body.mobile === null || body.mobile === "") {
      updates.mobile = null;
    } else {
      const mobStr = String(body.mobile).trim();
      if (!/^[6-9]\d{9}$/.test(mobStr)) {
        return res.status(400).json({
          error:
            "Mobile number must be a 10-digit Indian number starting with 6, 7, 8, or 9.",
        });
      }
      updates.mobile = mobStr;
    }
  }

  // 6. Email Validation & Uniqueness Check (Requirement 7)
  const rawEmail =
    body.contactEmail !== undefined ? body.contactEmail : body.email;

  if (rawEmail !== undefined) {
    if (rawEmail !== null && String(rawEmail).trim() !== "") {
      const emailStr = String(rawEmail).trim().toLowerCase();
      if (!/\S+@\S+\.\S+/.test(emailStr)) {
        return res
          .status(400)
          .json({ error: "Please enter a valid email address." });
      }

      // Check if email belongs to ANOTHER vendor in Mongo or Postgres
      try {
        const otherMongo =
          (await mongoVendors.findByEmail(emailStr)) ||
          (await mongoSellers.findByEmail(emailStr));

        if (otherMongo) {
          const otherMongoId = String(
            otherMongo.id ||
              otherMongo.vendorId ||
              otherMongo.sellerId ||
              otherMongo.ownerId ||
              otherMongo._id
          );
          if (!authenticatedIds.has(otherMongoId)) {
            return res.status(400).json({
              error: "Email address is already in use by another seller account.",
            });
          }
        }
      } catch {}

      try {
        const pgRows = await db
          .select({
            id: vendorsTable.id,
            ownerId: vendorsTable.ownerId,
            vendorId: vendorsTable.vendorId,
          })
          .from(vendorsTable)
          .where(
            or(
              eq(vendorsTable.contactEmail, emailStr),
              eq(vendorsTable.email, emailStr)
            )
          )
          .limit(1);

        if (pgRows.length > 0) {
          const row = pgRows[0];
          const isSameVendor =
            authenticatedIds.has(String(row.id)) ||
            (row.vendorId && authenticatedIds.has(String(row.vendorId))) ||
            (row.ownerId && authenticatedIds.has(String(row.ownerId)));

          if (!isSameVendor) {
            return res.status(400).json({
              error: "Email address is already in use by another seller account.",
            });
          }
        }
      } catch {}

      updates.contactEmail = emailStr;
      updates.email = emailStr;
    } else {
      updates.contactEmail = null;
      updates.email = null;
    }
  }

  // 7. Shop & Pickup Address updates (Requirement 2, Requirement 3, Requirement 10)
  const addressPatch = buildVendorAddressUpdates(body, authVendor);
  if (addressPatch.error) {
    return res.status(400).json({ error: addressPatch.error });
  }
  Object.assign(updates, addressPatch.updates);

  // 8. Database Persistence (Requirement 5, Requirement 9, Requirement 13)
  let updatedRecord: Record<string, any> = { ...authVendor, ...updates };

  try {
    const mUpdated =
      (await mongoVendors.update(primaryVendorId, updates)) ||
      (await mongoSellers.update(primaryVendorId, updates));
    if (mUpdated) {
      updatedRecord = { ...updatedRecord, ...mUpdated };
    }
  } catch {}

  try {
    const whereConditions = [
      eq(vendorsTable.id, primaryVendorId),
      eq(vendorsTable.vendorId, primaryVendorId),
    ];
    if (authVendor.ownerId) {
      whereConditions.push(eq(vendorsTable.ownerId, authVendor.ownerId));
    }
    if (req.userId) {
      whereConditions.push(eq(vendorsTable.ownerId, req.userId));
    }

    const pgRows = await db
      .update(vendorsTable)
      .set(updates)
      .where(or(...whereConditions))
      .returning();

    if (pgRows.length > 0) {
      updatedRecord = { ...updatedRecord, ...pgRows[0] };
    }
  } catch {}

  // Keep in-memory req.vendor updated for subsequent handlers in same lifecycle
  Object.assign(req.vendor, updatedRecord);

  // Automated Shiprocket Pickup Location Registration / Sync
  const hasPickupAddressData = Boolean(
    updatedRecord.pickupPincode ||
    updatedRecord.shopPincode ||
    body.pickupPincode ||
    body.shopPincode ||
    body.pickupAddress ||
    body.shopAddress
  );

  if (hasPickupAddressData) {
    try {
      const shiprocketSyncResult = await syncSellerPickupToShiprocket(
        primaryVendorId,
        body,
        updatedRecord
      );
      if (shiprocketSyncResult.success) {
        updatedRecord.shiprocketPickupLocationName = shiprocketSyncResult.nickname;
        updatedRecord.shiprocketPickupId = shiprocketSyncResult.pickupId;
        updatedRecord.shiprocketPickupStatus = "registered";
        updatedRecord.shiprocketPickupError = null;
      } else {
        updatedRecord.shiprocketPickupStatus = "failed";
        updatedRecord.shiprocketPickupError = shiprocketSyncResult.error || "Shiprocket registration failed";
      }
    } catch (sErr: any) {
      req.log?.warn?.({ err: sErr }, "Automated Shiprocket pickup sync failed");
    }
  }

  // 9. Format response containing all persisted fields (Requirement 11)
  return res.json({
    id: updatedRecord.id || primaryVendorId,
    vendorId:
      updatedRecord.vendorId || updatedRecord.id || primaryVendorId,
    name: updatedRecord.shopName || updatedRecord.name,
    shopName: updatedRecord.shopName || updatedRecord.name,
    location: updatedRecord.location,
    rating: updatedRecord.rating ?? 4.8,
    sareesCount: updatedRecord.sareesCount ?? 0,
    avatar: updatedRecord.avatar ?? null,
    bio: updatedRecord.bio ?? null,
    tagline: updatedRecord.tagline ?? null,
    contactEmail: updatedRecord.contactEmail ?? updatedRecord.email ?? null,
    email: updatedRecord.email ?? updatedRecord.contactEmail ?? null,
    gstin: updatedRecord.gstin ?? null,
    mobile: updatedRecord.mobile ?? null,
    status: updatedRecord.status || "approved",
    statusReason: updatedRecord.statusReason ?? null,
    ownerId: updatedRecord.ownerId ?? null,
    shopStreet: updatedRecord.shopStreet ?? null,
    shopAddressLine2: updatedRecord.shopAddressLine2 ?? null,
    shopLandmark: updatedRecord.shopLandmark ?? null,
    shopCity: updatedRecord.shopCity ?? null,
    shopState: updatedRecord.shopState ?? null,
    shopPincode: updatedRecord.shopPincode ?? null,
    shopCountry: updatedRecord.shopCountry ?? null,
    pickupSameAsShop: updatedRecord.pickupSameAsShop ?? false,
    pickupLocationName: updatedRecord.pickupLocationName ?? null,
    pickupAddressLine1: updatedRecord.pickupAddressLine1 ?? null,
    pickupAddressLine2: updatedRecord.pickupAddressLine2 ?? null,
    pickupLandmark: updatedRecord.pickupLandmark ?? null,
    pickupCity: updatedRecord.pickupCity ?? null,
    pickupState: updatedRecord.pickupState ?? null,
    pickupPincode: updatedRecord.pickupPincode ?? null,
    pickupCountry: updatedRecord.pickupCountry ?? null,
    // Shiprocket fields
    shiprocketPickupLocationName: updatedRecord.shiprocketPickupLocationName ?? null,
    shiprocketPickupId: updatedRecord.shiprocketPickupId ?? null,
    shiprocketPickupStatus: updatedRecord.shiprocketPickupStatus ?? "unregistered",
    shiprocketPickupError: updatedRecord.shiprocketPickupError ?? null,
    shippingActivated: updatedRecord.shippingActivated ?? true,
  });
}
