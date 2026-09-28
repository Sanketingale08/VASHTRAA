import { describe, it, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { mongoUsers } from "@workspace/db";
import accountRouter from "../routes/account";

// Mock isAuthenticated middleware to set a test user ID
const testUserId = "test-user-profile-123";

const app = express();
app.use(express.json());
app.use((req: any, _res, next) => {
  req.userId = testUserId;
  req.user = { id: testUserId, email: "testuser@example.com" };
  next();
});
app.use("/api", accountRouter);

describe("User Profile Edit functionality & Persistence", () => {
  beforeEach(async () => {
    // Reset database record for test user before each test
    await mongoUsers.delete(testUserId);
    await mongoUsers.insert({
      id: testUserId,
      name: "Original Name",
      email: "original@example.com",
      phone: "9876543210",
      alternateMobile: "9123456789",
      dateOfBirth: "1990-01-01",
      gender: "Male",
      location: "Mumbai",
      language: "English",
      profilePicture: "https://example.com/avatar-old.jpg",
      address: "123 Old Street, Mumbai, 400001",
      role: "customer",
    });
  });

  it("updates and permanently persists all profile fields (Name, Mobile, Email, Profile Picture, Address) via PATCH /api/account/profile", async () => {
    const res = await request(app)
      .patch("/api/account/profile")
      .send({
        firstName: "Ananya",
        lastName: "Verma",
        phone: "9988776655",
        email: "ananya.verma@example.com",
        gender: "Female",
        dateOfBirth: "1995-05-15",
        location: "Delhi, India",
        alternateMobile: "9876543210",
        language: "Hindi",
        profilePicture: "https://example.com/avatar-new.jpg",
        address: "456 New Palace Road, Connaught Place, New Delhi - 110001",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user).toMatchObject({
      name: "Ananya Verma",
      firstName: "Ananya",
      lastName: "Verma",
      email: "ananya.verma@example.com",
      phone: "9988776655",
      gender: "Female",
      dateOfBirth: "1995-05-15",
      location: "Delhi, India",
      alternateMobile: "9876543210",
      profilePicture: "https://example.com/avatar-new.jpg",
      address: "456 New Palace Road, Connaught Place, New Delhi - 110001",
    });

    // Verify persistence in mongoUsers database
    const dbUser = await mongoUsers.findById(testUserId);
    expect(dbUser).not.toBeNull();
    expect(dbUser?.name).toBe("Ananya Verma");
    expect(dbUser?.email).toBe("ananya.verma@example.com");
    expect(dbUser?.phone).toBe("9988776655");
    expect(dbUser?.gender).toBe("Female");
    expect(dbUser?.dateOfBirth).toBe("1995-05-15");
    expect(dbUser?.location).toBe("Delhi, India");
    expect(dbUser?.alternateMobile).toBe("9876543210");
    expect((dbUser as any)?.profilePicture).toBe("https://example.com/avatar-new.jpg");
    expect((dbUser as any)?.address).toBe("456 New Palace Road, Connaught Place, New Delhi - 110001");
  });

  it("retrieves updated profile data from GET /api/account/profile after save", async () => {
    // Update profile
    await request(app)
      .patch("/api/account/profile")
      .send({
        firstName: "Rohan",
        lastName: "Sharma",
        location: "Bengaluru",
        profilePicture: "https://example.com/rohan.jpg",
        address: "789 MG Road, Bengaluru",
      });

    // Fetch profile
    const res = await request(app).get("/api/account/profile");
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.user.name).toBe("Rohan Sharma");
    expect(res.body.user.location).toBe("Bengaluru");
    expect(res.body.user.profilePicture).toBe("https://example.com/rohan.jpg");
    expect(res.body.user.address).toBe("789 MG Road, Bengaluru");
  });

  it("preserves unrelated profile fields when only Mobile Number or Email ID is updated", async () => {
    // Only update Mobile Number
    const phoneRes = await request(app)
      .patch("/api/account/profile")
      .send({ phone: "9000011111" });

    expect(phoneRes.status).toBe(200);
    expect(phoneRes.body.user.phone).toBe("9000011111");

    let dbUser = await mongoUsers.findById(testUserId);
    expect(dbUser?.name).toBe("Original Name");
    expect(dbUser?.email).toBe("original@example.com");
    expect(dbUser?.gender).toBe("Male");
    expect(dbUser?.location).toBe("Mumbai");
    expect((dbUser as any)?.address).toBe("123 Old Street, Mumbai, 400001");

    // Only update Email ID
    const emailRes = await request(app)
      .patch("/api/account/profile")
      .send({ email: "updated.email@example.com" });

    expect(emailRes.status).toBe(200);
    expect(emailRes.body.user.email).toBe("updated.email@example.com");

    dbUser = await mongoUsers.findById(testUserId);
    expect(dbUser?.phone).toBe("9000011111"); // preserved
    expect(dbUser?.name).toBe("Original Name"); // preserved
    expect(dbUser?.location).toBe("Mumbai"); // preserved
  });

  it("rejects invalid email or mobile number format with clear error message", async () => {
    const invalidEmailRes = await request(app)
      .patch("/api/account/profile")
      .send({ email: "not-an-email" });

    expect(invalidEmailRes.status).toBe(400);
    expect(invalidEmailRes.body.error).toContain("valid email address");

    const invalidPhoneRes = await request(app)
      .patch("/api/account/profile")
      .send({ phone: "123" });

    expect(invalidPhoneRes.status).toBe(400);
    expect(invalidPhoneRes.body.error).toContain("10-digit number");
  });
});
