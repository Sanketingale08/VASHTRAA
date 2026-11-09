export interface Seller {
  _id: string;
  id: string;
  sellerId: string;
  vendorId?: string;
  reactivationWelcomePending?: boolean;
  reactivationPending?: boolean;
  name: string;
  sellerName?: string;
  shopName?: string;
  email: string;
  contactEmail?: string;
  mobile: string;
  passwordHash: string;
  location: string;
  bio?: string | null;
  tagline?: string | null;
  avatar?: string;
  rating?: number;
  sareesCount?: number;
  productsCount?: number;
  status: "pending" | "approved" | "suspended" | "rejected" | "active" | "deactivated";
  statusReason?: string | null;

  // Business details
  gstin?: string | null;
  panNumber?: string | null;
  panCardUrl?: string | null;
  gstCertUrl?: string | null;
  bankHolder?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  bankIfsc?: string | null;
  bankVerified?: boolean;
  bankVerificationStatus?: "unverified" | "verification_pending" | "verified" | "verification_failed";
  bankVerificationDetails?: any;
  bankVerifiedAt?: Date | null;
  cashfreeBeneficiaryId?: string | null;
  beneficiaryStatus?: "unregistered" | "beneficiary_registration_pending" | "beneficiary_active" | "beneficiary_registration_failed";
  beneficiaryRegisteredAt?: Date | null;
  beneficiaryError?: string | null;

  // Seller address
  shopStreet?: string | null;
  shopCity?: string | null;
  shopState?: string | null;
  shopPincode?: string | null;
  shopCountry?: string | null;

  // Pickup address
  pickupLocationName?: string | null;
  pickupAddressLine1?: string | null;
  pickupAddressLine2?: string | null;
  pickupLandmark?: string | null;
  pickupCity?: string | null;
  pickupState?: string | null;
  pickupPincode?: string | null;
  pickupCountry?: string | null;
  pickupSameAsShop?: boolean;

  // Shiprocket automated pickup location mapping
  shiprocketPickupLocationName?: string | null;
  shiprocketPickupId?: number | null;
  shiprocketPickupStatus?: "unregistered" | "registered" | "failed" | "pending";
  shiprocketPickupError?: string | null;
  shiprocketAddressHash?: string | null;
  shippingActivated?: boolean;

  ownerId?: string | null;
  termsAcceptedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
