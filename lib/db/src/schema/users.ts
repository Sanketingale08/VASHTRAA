export interface User {
  _id: string;
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: "customer" | "seller" | "super_admin";
  isEmailVerified?: boolean;
  emailVerified?: boolean;
  emailVerificationTokenHash?: string | null;
  emailVerificationExpires?: Date | null;
  phone?: string;
  alternateMobile?: string;
  dateOfBirth?: string;
  gender?: string;
  location?: string;
  language?: string;
  profilePicture?: string;
  avatar?: string;
  address?: string;
  googleId?: string;
  authProvider?: "email" | "google";
  createdAt: Date;
  updatedAt: Date;
}

export interface UserSession {
  _id: string;
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

